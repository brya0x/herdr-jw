// The numbers of the factory panel, from usage.py's rows and the PRs gh reported. Pure: no herdr import, so node tests it.
export const PERIODS = [["week", "semana"], ["4w", "4 sem"], ["all", "todo"]];
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

// "12.3M · ~$4.20", or "12.3M · sin tarifa" when no rate is set for a model it used.
export const show = (u) => (u.tokens ? `${fmt(u.tokens)} · ${u.unrated && !u.cost ? "sin tarifa" : `${u.unrated ? "+" : "~"}${money(u.cost)}`}` : "—");

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

export const perPr = (s) => (s.n ? `${fmt(s.tokens)}${s.cost === null ? " · sin tarifa" : ` · ~${money(s.cost)}`}` : "—");

export const KINDS = [["all", "Todos"], ["open", "Abierto"], ["merged", "Mergeado"], ["failed", "CI falló"], ["closed", "Cerrado"], ["none", "Sin PR"]];
// How many worktrees each filter chip would show: { all, open, merged, ... }.
export function kindCounts(runs) {
  const c = { all: runs.length };
  for (const [k] of KINDS.slice(1)) c[k] = runs.filter((r) => (r.pr?.kind ?? "none") === k).length;
  return c;
}

// What needs a person, from the PRs alone: a failing CI, an open PR nobody merged in 3 days, a PR closed without merging.
// `runs`: [{ pr: { kind, created } | null, ... }]. Most urgent first.
export const DETECTS = [["failed", "CI falló"], ["stale", "Estancado"], ["closed", "Cerrado sin merge"]];
export function detections(runs, now = Date.now()) {
  const age = (r) => (r.pr.created ? now - Date.parse(r.pr.created) : NaN);
  const kindOf = (r) => (r.pr?.kind === "failed" ? "failed" : r.pr?.kind === "closed" ? "closed" : r.pr?.kind === "open" && age(r) > 3 * 864e5 ? "stale" : null);
  return runs.map((run) => ({ run, kind: kindOf(run) })).filter((x) => x.kind)
    .sort((a, b) => DETECTS.findIndex(([k]) => k === a.kind) - DETECTS.findIndex(([k]) => k === b.kind))
    .map((x) => ({ ...x, age: x.run.pr.created ? now - Date.parse(x.run.pr.created) : null }));
}
