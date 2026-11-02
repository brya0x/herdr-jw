// The numbers of the factory panel, from usage.py's rows and the PRs gh reported. Pure: no herdr import, so node tests it.
export const PERIODS = [["week", "week"], ["4w", "4 wk"], ["all", "all"]];
export const fmt = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}G` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(Math.round(n)));
export const money = (n) => `$${n >= 100 ? n.toFixed(0) : n.toFixed(2)}`;
export const dur = (ms) => (ms < 36e5 ? `${Math.round(ms / 6e4)} min` : ms < 48 * 36e5 ? `${(ms / 36e5).toFixed(1)} h` : `${(ms / 864e5).toFixed(1)} d`);

export const inside = (cwd, p) => Boolean(p) && (cwd === p || cwd.startsWith(`${p}/`));

// ISO week as usage.py names it: "2026-W44".
export function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y = d.getUTCFullYear();
  return `${y}-W${String(Math.ceil(((d - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7)).padStart(2, "0")}`;
}

const weekOk = (d, period, week) => period === "all" || (period === "week" ? week === d.current : d.last4.includes(week));
export const inPeriod = (d, period, iso) => Boolean(iso) && weekOk(d, period, isoWeek(new Date(iso)));

// The rows of `period` whose cwd is inside one of `paths`, summed: { tokens, cost, unrated }.
export function usageOf(d, period, paths) {
  let tokens = 0, cost = 0, unrated = false;
  for (const r of d.rows) if (weekOk(d, period, r.week) && paths.some((p) => inside(r.project, p))) {
    tokens += r.input + r.cache_read + r.output;
    if (r.cost === undefined) unrated = true; else cost += r.cost;
  }
  return { tokens, cost, unrated };
}

// "12.3M · ~$4.20", or "12.3M · no rate" when no rate is set for a model it used.
export const show = (u) => (u.tokens ? `${fmt(u.tokens)} · ${u.unrated && !u.cost ? "no rate" : `${u.unrated ? "+" : "~"}${money(u.cost)}`}` : "—");

// Tokens and cost per model family: [{ family, tokens, cost, unrated }], biggest first.
export function byModel(d, period, paths) {
  return [...new Set(d.rows.map((r) => r.family))]
    .map((family) => ({ family, ...usageOf({ ...d, rows: d.rows.filter((r) => r.family === family) }, period, paths) }))
    .filter((m) => m.tokens).sort((a, b) => b.tokens - a.tokens);
}

// The ISO weeks of the last `n` weeks, oldest first, ending with the one that has `now`.
export const lastWeeks = (n, now = new Date()) => Array.from({ length: n }, (_, k) => isoWeek(new Date(now.getTime() - (n - 1 - k) * 7 * 864e5)));

// Usage inside `paths` for each of `weeks`: [{ week, tokens, by: { family: tokens } }] (zeros where nothing ran).
export function weekly(d, paths, weeks) {
  const m = new Map(weeks.map((week) => [week, { week, tokens: 0, by: {} }]));
  for (const r of d.rows) if (m.has(r.week) && paths.some((p) => inside(r.project, p))) {
    const w = m.get(r.week), t = r.input + r.cache_read + r.output;
    w.tokens += t; w.by[r.family] = (w.by[r.family] ?? 0) + t;
  }
  return weeks.map((week) => m.get(week));
}

// PRs opened and merged per ISO week, for the weeks in `weeks`: [{ week, opened, merged }].
export function prWeeks(prs, weeks) {
  const at = (iso) => (iso ? isoWeek(new Date(iso)) : null);
  return weeks.map((week) => ({ week, opened: prs.filter((p) => at(p.created) === week).length, merged: prs.filter((p) => at(p.merged) === week).length }));
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const gap = (a, b) => (a && b ? Date.parse(b) - Date.parse(a) : NaN);

// What the merged PRs took: cost per PR, how long from the claude's first message to the PR and to the merge,
// and how often the person spoke. `wts`: [{ path, created, merged }]. A PR whose claude left no transcript
// is unknown, not free: it stays out of every average.
export function shipped(d, flow, wts) {
  const per = wts.map((w) => ({ ...usageOf(d, "all", [w.path]), humans: flow?.[w.path]?.humans, first: flow?.[w.path]?.first, created: w.created, merged: w.merged })).filter((p) => p.tokens);
  const pos = (xs) => xs.filter((x) => x > 0);
  const rated = per.filter((p) => !p.unrated);
  return {
    n: per.length,
    tokens: mean(per.map((p) => p.tokens)),
    cost: rated.length ? mean(rated.map((p) => p.cost)) : null,
    ship: median(pos(per.map((p) => gap(p.first, p.merged)))),
    toPr: median(pos(per.map((p) => gap(p.first, p.created)))),
    review: median(pos(per.map((p) => gap(p.created, p.merged)))),
    humans: mean(per.filter((p) => p.humans !== undefined).map((p) => p.humans)),
  };
}

export const perPr = (s) => (s.n ? `${fmt(s.tokens)}${s.cost === null ? " · no rate" : ` · ~${money(s.cost)}`}` : "—");

export const KINDS = [["all", "All"], ["open", "Open"], ["merged", "Merged"], ["failed", "CI failed"], ["closed", "Closed"], ["none", "No PR"]];
// How many worktrees each filter chip would show: { all, open, merged, ... }.
export function kindCounts(runs) {
  const c = { all: runs.length };
  for (const [k] of KINDS.slice(1)) c[k] = runs.filter((r) => (r.pr?.kind ?? "none") === k).length;
  return c;
}

// What went wrong and needs a person. Three sources, each a different kind of failure:
//   "agent"   commands claude failed on and never fixed (fails.py: { path: [{ ts, cmd, err, kind, count }] })
//   "setup"   a worktree's .jw.toml setup that exited non-zero (parseSetupLog of the log worktree-wt writes)
//   "factory" a repo that did not clone or is gone, `gh` failing, the usage scripts failing
// Each finding: { id, source, title, sub, detail, ts, age, path, task } where `task` is what an agent is told to fix it.
export const SOURCES = [["agent", "Agents"], ["setup", "Setup"], ["factory", "Factory"]];
export const parseSetupLog = (text) => (text ?? "").split("\n").filter(Boolean).map((l) => { const [ts, folder, code, ...cmd] = l.split("\t"); return { ts, folder, code, cmd: cmd.join("\t") }; }).filter((x) => x.ts && x.folder);

const first = (text) => String(text).split("\n").find((l) => l.trim())?.trim() ?? "";
const brief = (text, n) => (first(text).length > n ? `${first(text).slice(0, n - 1)}…` : first(text));
const ask = (where, what, detail) => `${what}\n\nWhere: ${where}\n\n${detail}\n\nFind the cause and fix it. Before touching anything outside that folder, tell me what you found.`;

export function findings({ fails = {}, setup = [], repos = [], gh = [], usageError = "", labels = {}, paths = null, dismissed = [], now = Date.now() }) {
  const out = [];
  const add = (f) => { f.id = `${f.source}|${f.path}|${f.title}|${f.ts ?? ""}`; if (!dismissed.includes(f.id)) out.push({ ...f, age: f.ts ? now - Date.parse(f.ts) : null }); };
  for (const [path, list] of Object.entries(fails)) for (const f of list) {
    const where = labels[path] ?? path.split("/").pop();
    add({ source: "agent", title: brief(f.cmd, 80), sub: `${where} · ${f.kind === "pending" ? "ended failing" : `failed ${f.count} times`}`, detail: `$ ${f.cmd}\n\n${f.err}`, ts: f.ts, path,
      task: ask(path, `An agent failed on this command and nobody fixed it (${f.kind === "pending" ? "it was the last thing it did" : `it tried ${f.count} times`}).`, `Command:\n${f.cmd}\n\nError:\n${f.err}`) });
  }
  for (const x of setup) {
    if ((paths && !paths.some((p) => inside(x.folder, p))) || now - Date.parse(x.ts) > 14 * 864e5) continue;
    add({ source: "setup", title: `the setup of ${labels[x.folder] ?? x.folder.split("/").pop()} failed`, sub: `exited with code ${x.code}`, detail: `$ ${x.cmd}\n\nexited with code ${x.code}`, ts: x.ts, path: x.folder,
      task: ask(x.folder, `This worktree's setup (.jw.toml) failed with code ${x.code}, so the agent never started.`, `Setup:\n${x.cmd}\n\nReproduce it here and look at the error.`) });
  }
  for (const r of repos) if (r.state === "failed" || r.state === "missing") {
    const detail = r.state === "failed" ? (r.msg || "the clone failed") : "the repo is no longer on disk";
    add({ source: "factory", title: `${r.name}: ${r.state === "failed" ? "the clone failed" : "not on disk"}`, sub: "workspace repo", detail, ts: null, path: r.path ?? r.real ?? "",
      task: ask(r.path ?? r.real ?? r.name, `The workspace repo ${r.name} is broken.`, detail) });
  }
  if (gh.length) add({ source: "factory", title: `gh failed in ${gh.length} worktree${gh.length > 1 ? "s" : ""}`, sub: "PR status", detail: gh.slice(0, 8).join("\n"), ts: null, path: "",
    task: `gh could not read the PRs of some worktrees:\n${gh.slice(0, 8).join("\n")}\n\nCheck for a missing login (gh auth status), network or remote, and tell me what to fix.` });
  if (usageError) add({ source: "factory", title: "could not read claude's usage", sub: "Productivity and Spend tabs", detail: usageError, ts: null, path: "",
    task: `The factory panel could not read claude's transcripts: ${usageError}\n\nThe scripts are in ~/.config/herdr-app/mods/factory (flow.py, fails.py) and mods/jw-settings/usage.py. Find the cause.` });
  return out.sort((a, b) => (b.ts ?? "").localeCompare(a.ts ?? ""));
}
