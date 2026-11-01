// node test_stats.mjs
import assert from "node:assert/strict";
import { isoWeek, lastWeeks, usageOf, byModel, weekly, prWeeks, shipped, perPr, kindCounts, detections, inPeriod, show, dur } from "./stats.js";

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
assert.equal(show(usageOf(d, "all", ["/w/a"])), "450 · sin tarifa");
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
assert.equal(perPr(s), "450 · sin tarifa");
const rated = { ...d, rows: [row("2026-W44", "/w/a", "opus", 1e6, 4)] };
assert.equal(shipped(rated, flow, [{ path: "/w/a", created: "2026-10-27T00:00:00Z", merged: "2026-10-31T00:00:00Z" }]).cost, 4);
assert.equal(perPr(shipped(d, {}, [])), "—");

assert.deepEqual(kindCounts([{ pr: { kind: "open" } }, { pr: { kind: "merged" } }, { pr: null }, {}]), { all: 4, open: 1, merged: 1, failed: 0, closed: 0, none: 2 });
const now = Date.parse("2026-10-31T00:00:00Z");
const pr = (kind, created) => ({ pr: { kind, created } });
const det = detections([pr("closed", "2026-10-01T00:00:00Z"), pr("open", "2026-10-30T00:00:00Z"), pr("open", "2026-10-20T00:00:00Z"), pr("merged", "2026-09-01T00:00:00Z"), { pr: null }, pr("failed", "2026-10-30T00:00:00Z")], now);
assert.deepEqual(det.map((x) => x.kind), ["failed", "stale", "closed"], "a fresh open PR, a merged one and no PR need nobody; urgent first");
assert.equal(dur(det[1].age), "11.0 d");
assert.deepEqual(detections([], now), []);
console.log("ok");
