// node test_stats.mjs
import assert from "node:assert/strict";
import { isoWeek, lastWeeks, usageOf, byModel, weekly, prWeeks, shipped, perPr, kindCounts, findings, parseSetupLog, inPeriod, show, dur } from "./stats.js";

assert.equal(isoWeek(new Date("2026-10-31T10:00:00Z")), "2026-W44");
assert.equal(isoWeek(new Date("2026-01-01T00:00:00Z")), "2026-W01");
assert.equal(isoWeek(new Date("2025-12-29T00:00:00Z")), "2026-W01"); // ISO: that Monday starts week 1 of 2026

const row = (week, project, family, n, cost) => ({ week, project, family, input: n, cache_read: 0, output: 0, ...(cost === undefined ? {} : { cost }) });
const d = { current: "2026-W44", last4: ["2026-W44", "2026-W43", "2026-W42", "2026-W41"], rows: [
  row("2026-W44", "/w/a", "opus", 100), row("2026-W43", "/w/a/wt/x", "sonnet", 300), row("2026-W30", "/w/a", "opus", 50), row("2026-W44", "/w/b", "opus", 999),
] };
assert.equal(usageOf(d, "week", ["/w/a"]).tokens, 100);
assert.equal(usageOf(d, "4w", ["/w/a"]).tokens, 400);
assert.equal(usageOf(d, "all", ["/w/a"]).tokens, 450);
assert.equal(usageOf(d, "all", ["/w/ab"]).tokens, 0, "a prefix of the name is not inside the folder");
assert.equal(usageOf(d, "all", [undefined, null]).tokens, 0);
assert.deepEqual(byModel(d, "4w", ["/w/a"]).map((m) => [m.family, m.tokens]), [["sonnet", 300], ["opus", 100]]);
assert.equal(show(usageOf(d, "all", ["/w/a"])), "450 · no rate");
assert.deepEqual(weekly(d, ["/w/a"], ["2026-W42", "2026-W43", "2026-W44"]).map((w) => [w.week, w.tokens]), [["2026-W42", 0], ["2026-W43", 300], ["2026-W44", 100]]);
assert.deepEqual(lastWeeks(3, new Date("2026-10-31T10:00:00Z")), ["2026-W42", "2026-W43", "2026-W44"]);
assert.deepEqual(lastWeeks(2, new Date("2026-01-05T10:00:00Z")), ["2026-W01", "2026-W02"]);
assert.ok(inPeriod(d, "week", "2026-10-31T10:00:00Z") && !inPeriod(d, "week", "2026-07-01T00:00:00Z") && !inPeriod(d, "all", null));

const prs = [{ created: "2026-10-27T00:00:00Z", merged: "2026-10-31T00:00:00Z" }, { created: "2026-10-20T00:00:00Z", merged: null }];
assert.deepEqual(prWeeks(prs, ["2026-W43", "2026-W44"]), [{ week: "2026-W43", opened: 1, merged: 0 }, { week: "2026-W44", opened: 1, merged: 1 }]);

// two merged PRs; one has no transcript here, so it must not drag the averages down
const flow = { "/w/a": { first: "2026-10-26T00:00:00Z", humans: 10 } };
const s = shipped(d, flow, [{ path: "/w/a", created: "2026-10-27T00:00:00Z", merged: "2026-10-31T00:00:00Z" }, { path: "/nowhere", created: "2026-10-27T00:00:00Z", merged: "2026-10-31T00:00:00Z" }]);
assert.equal(s.n, 1); assert.equal(s.tokens, 450); assert.equal(s.cost, null); assert.equal(s.humans, 10);
assert.equal(dur(s.ship), "5.0 d"); assert.equal(dur(s.toPr), "24.0 h"); assert.equal(dur(s.review), "4.0 d");
assert.equal(perPr(s), "450 · no rate");
const rated = { ...d, rows: [row("2026-W44", "/w/a", "opus", 1e6, 4)] };
assert.equal(shipped(rated, flow, [{ path: "/w/a", created: "2026-10-27T00:00:00Z", merged: "2026-10-31T00:00:00Z" }]).cost, 4);
assert.equal(perPr(shipped(d, {}, [])), "—");

assert.deepEqual(kindCounts([{ pr: { kind: "open" } }, { pr: { kind: "merged" } }, { pr: null }, {}]), { all: 4, open: 1, merged: 1, failed: 0, closed: 0, none: 2 });
const now = Date.parse("2026-10-31T00:00:00Z");
assert.deepEqual(parseSetupLog("2026-10-30T10:00:00Z\t/w/a/x\t127\tcomposer install\n\nbad\n"), [{ ts: "2026-10-30T10:00:00Z", folder: "/w/a/x", code: "127", cmd: "composer install" }]);
const f = findings({
  now, paths: ["/w/a"], labels: { "/w/a/x": "feat/x" },
  fails: { "/w/a/x": [{ ts: "2026-10-30T12:00:00Z", cmd: "pnpm test\nmore", err: "Exit code 1\nboom", kind: "pending", count: 1 }, { ts: "2026-10-29T12:00:00Z", cmd: "make", err: "Exit code 2\nbad", kind: "repeated", count: 4 }] },
  setup: [{ ts: "2026-10-30T10:00:00Z", folder: "/w/a/x", code: "1", cmd: "composer install" }, { ts: "2026-10-30T10:00:00Z", folder: "/elsewhere", code: "1", cmd: "no" }, { ts: "2026-09-01T10:00:00Z", folder: "/w/a/y", code: "1", cmd: "old" }],
  repos: [{ name: "r", state: "failed", msg: "no auth" }, { name: "ok", state: "git" }, { name: "gone", state: "missing", path: "/w/gone" }],
  gh: ["b1: not logged in", "b2: not logged in"], usageError: "python is missing",
});
assert.deepEqual(f.map((x) => x.source), ["agent", "setup", "agent", "factory", "factory", "factory", "factory"], "newest first; no-time ones last; outside paths and old setup dropped");
assert.equal(f[0].title, "pnpm test"); assert.equal(f[0].sub, "feat/x · ended failing"); assert.equal(f[2].sub, "feat/x · failed 4 times");
assert.ok(f[0].task.includes("Exit code 1") && f[0].task.includes("/w/a/x"));
assert.equal(dur(f[0].age), "12.0 h");
assert.deepEqual(findings({ now, gh: ["b: x"] }).map((x) => x.title), ["gh failed in 1 worktree"]);
assert.equal(findings({ now, fails: { "/w": [{ ts: "2026-10-30T00:00:00Z", cmd: "c", err: "e", kind: "pending", count: 1 }] }, dismissed: ["agent|/w|c|2026-10-30T00:00:00Z"] }).length, 0, "a dismissed finding stays hidden");
assert.deepEqual(findings({ now }), []);
console.log("ok");
