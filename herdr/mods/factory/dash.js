// The factory panel's tabs, drawn from the numbers in stats.js. `v` is the Repos view that owns the data.
// Look: one raised hero (the factory line), everything else open space; lists are the only other boxes.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, spaces, run } from "herdr";
import { btn } from "./ui.js";
import { PERIODS, usageOf, byModel, weekly, prWeeks, lastWeeks, shipped, kindCounts, SOURCES, inPeriod, inside, fmt, dur, show, KINDS } from "./stats.js";

export const SPIN = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const famColor = (t, f) => ({ opus: t.ansi5, sonnet: t.ansi4, haiku: t.ansi2 })[f] ?? t.dim;

// The stages a worktree can be in, left to right along the factory line.
const STAGES = ["none", "open", "failed", "merged", "closed"];
const NAMES = Object.fromEntries(KINDS); // all, open, merged, failed, closed, none -> label
const barColor = (t, k) => ({ merged: t.ansi5, open: t.ansi4, failed: t.blocked, closed: t.dim })[k] ?? t.border;
const textColor = (t, k) => ({ merged: t.ansi5, open: t.ansi4, failed: t.blocked, closed: t.dim })[k] ?? t.muted;
const srcColor = (t, k) => ({ agent: t.blocked, setup: t.working, factory: t.ansi1 ?? t.blocked })[k] ?? t.dim;

const head = (t, title, hint) => h_flex().gap(8).items_center().px(2)
  .child(div().text_size(14).font_semibold().text_color(t.foreground).child(title))
  .when(Boolean(hint), (el) => el.child(div().text_size(11.5).text_color(t.dim).child(hint)));
const stat = (t, value, label, hint, color) => v_flex().flex_grow(1).flex_basis(150).min_w(130).gap(1)
  .child(div().text_size(26).font_semibold().text_color(color ?? t.foreground).child(value))
  .child(div().text_size(12.5).text_color(t.foreground).child(label))
  .when(Boolean(hint), (el) => el.child(div().text_size(11.5).text_color(t.dim).child(hint)));
const box = (t, ...kids) => v_flex().rounded(10).bg(t.raised).border(1).border_color(t.border).overflow_hidden().children(kids);
const note = (t, text) => div().p(12).text_size(12.5).text_color(t.dim).child(text);
const legend = (t, items) => h_flex().flex_wrap().gap_x(12).gap_y(2)
  .children(items.map(([color, label]) => h_flex().gap(5).items_center().child(div().w(8).h(8).rounded(2).bg(color)).child(div().text_size(11.5).text_color(t.muted).child(label))));

// A list row: icon, title over a quieter line, and the state over the tokens on the right. `first` drops the divider above it.
function item(t, id, { icon, title, sub, status, color, tokens, onClick }, first = false) {
  return h_flex().id(id).px(12).py(8).gap(10).items_center().cursor_pointer().hover((x) => x.bg(t.selected)).on_click(onClick)
    .when(!first, (el) => el.border_t(1).border_color(t.border))
    .child(div().flex_none().w(14).child(icon))
    .child(v_flex().flex_1().min_w(0).gap(1)
      .child(div().truncate().text_size(13).text_color(t.foreground).child(title))
      .child(div().truncate().text_size(11.5).text_color(t.dim).child(sub)))
    .child(v_flex().flex_none().items_end().gap(1)
      .child(div().text_size(12).text_color(color).child(status))
      .when(Boolean(tokens), (el) => el.child(div().text_size(11.5).text_color(t.dim).child(tokens))));
}

// Columns of bars: each { label, stack: [{ v, color }] } stacked, or { label, pair: [{ v, color }, { v, color }] } side by side.
function bars(t, cols, h = 48) {
  const max = Math.max(1, ...cols.map((c) => (c.stack ? c.stack.reduce((a, s) => a + s.v, 0) : Math.max(...c.pair.map((p) => p.v)))));
  const px = (v) => (v > 0 ? Math.max(2, Math.round((v / max) * h)) : 0);
  return h_flex().gap(6).items_end().children(cols.map((c) => v_flex().flex_1().min_w(0).items_center().gap(3)
    .child(c.stack
      ? v_flex().w_full().h(h).justify_end().rounded(2).children(c.stack.map((s) => div().w_full().h(px(s.v)).bg(s.color)))
      : h_flex().h(h).items_end().gap(2).children(c.pair.map((p) => div().w(10).h(px(p.v)).rounded(2).bg(p.color))))
    .child(div().text_size(11).text_color(t.dim).child(c.label))));
}

const wk = (w) => w.slice(5); // "2026-W44" -> "W44"
const share = (t, models, total) => h_flex().h(8).w_full().rounded(4).overflow_hidden().bg(t.border)
  .children(models.map((m) => div().h(8).w(`${(m.tokens / total) * 100}%`).bg(famColor(t, m.family))));

// Everything the tabs need, once per data change: usage.py's rows, the PRs of every worktree, the flow of each.
function metrics(v) {
  const d = v.usage;
  if (!d) return null;
  const paths = v.paths();
  const runs = v.runs();
  const merged = runs.filter((r) => r.pr?.kind === "merged" && r.pr.merged && inPeriod(d, v.period, r.pr.merged)).map((r) => ({ path: r.path, created: r.pr.created, merged: r.pr.merged }));
  return v.once(`M|${v.period}|${merged.map((m) => m.path).join("|")}|${paths.join("|")}`, () => {
    const weeks = lastWeeks(8);
    return {
      s: shipped(d, v.flow, merged),
      total: usageOf(d, v.period, paths),
      models: byModel(d, v.period, paths),
      weeks: weekly(d, paths, weeks),
      pw: prWeeks(runs.map((r) => r.pr).filter(Boolean), weeks.slice(-6)),
    };
  });
}

// The factory line: every worktree as a slice of one bar by stage. The labels under it are the filter of the list below.
function line(v, t, runs) {
  const counts = kindCounts(runs);
  const pick = (k) => (_e, cx) => { v.kind = v.kind === k ? "all" : k; cx.notify(); };
  const label = (k, color, dim) => h_flex().id(`stage-${k}`).gap(5).px(8).py(3).rounded(5).items_center().cursor_pointer().on_click(pick(k))
    .when(v.kind === k, (el) => el.bg(t.selected)).when(v.kind !== k, (el) => el.hover((x) => x.bg(t.hover)))
    .when(k !== "all", (el) => el.child(div().w(8).h(8).rounded(4).bg(color)))
    .child(div().text_size(12.5).text_color(v.kind === k ? t.foreground : t.muted).when(v.kind === k, (el) => el.font_semibold()).child(NAMES[k]))
    .child(div().text_size(12.5).text_color(dim ? t.dim : t.muted).child(String(counts[k])));
  return v_flex().p(14).gap(10).rounded(10).bg(t.raised).border(1).border_color(t.border)
    .child(h_flex().items_center().gap(8)
      .child(div().flex_1().text_size(14).font_semibold().text_color(t.foreground).child("The factory"))
      .child(div().text_size(11.5).text_color(t.dim).child(`${runs.length} worktrees`)))
    .child(runs.length
      ? h_flex().h(10).w_full().gap(2).rounded(5).overflow_hidden().children(STAGES.filter((k) => counts[k]).map((k) => div().id(`seg-${k}`).h(10).flex_grow(counts[k]).flex_basis(10).bg(barColor(t, k)).cursor_pointer().on_click(pick(k))))
      : div().h(10).rounded(5).bg(t.border))
    .child(h_flex().flex_wrap().gap_x(4).gap_y(2)
      .child(label("all", t.foreground, false))
      .children(STAGES.map((k) => label(k, barColor(t, k), !counts[k]))));
}

function agentsList(v, t) {
  const paths = v.paths();
  const mine = agents().filter((a) => { const sp = spaces().find((x) => x.id === a.space); return sp && paths.some((p) => inside(sp.folder, p)); });
  const dot = { working: t.working, blocked: t.blocked, done: t.done, idle: t.dim };
  return v_flex().gap(8)
    .child(head(t, "Agents now", String(mine.length)))
    .child(box(t, ...(mine.length ? mine.map((a, i) => {
      const folder = spaces().find((x) => x.id === a.space)?.folder;
      return item(t, `ag-${i}`, { icon: div().text_color(dot[a.status] ?? t.dim).child("●"), title: a.space_name, sub: (folder ?? "").split("/").slice(-2).join("/"), status: a.status, color: dot[a.status] ?? t.dim, tokens: v.cost([folder]), onClick: () => run("space.select", { id: a.space }) }, i === 0);
    }) : [note(t, "no agent open in this workspace")])));
}

function runsList(v, t, runs) {
  const shown = runs.filter((r) => v.kind === "all" || (r.pr?.kind ?? "none") === v.kind);
  const groups = [...new Set(shown.map((r) => r.repo))];
  const icon = (k) => (k === "open" ? div().frames(SPIN, 90).text_color(t.ansi4) : div().text_color(barColor(t, k)).child({ merged: "✓", failed: "⚠", closed: "○" }[k] ?? "·"));
  const word = { merged: "merged", open: "open", failed: "CI failed", closed: "closed" };
  return v_flex().gap(8)
    .child(head(t, "Worktrees", v.kind === "all" ? String(runs.length) : `${NAMES[v.kind]} · ${shown.length} of ${runs.length}`))
    .child(box(t, ...(!shown.length ? [note(t, runs.length ? "no worktree in this state" : "no worktrees yet: create them from the Repos tab")] : groups.flatMap((g, gi) => [
      h_flex().px(12).py(5).bg(t.hover).when(gi > 0, (el) => el.border_t(1).border_color(t.border)).text_size(11.5).text_color(t.muted)
        .child(div().flex_1().font_semibold().child(g)).child(div().child(`${shown.filter((r) => r.repo === g).length}`)),
      ...shown.filter((r) => r.repo === g).map((r, i) => {
        const k = r.pr?.kind ?? "none", raw = v.runTokensRaw(r.path);
        return item(t, `run-${g}-${i}`, { icon: icon(k), title: r.branch, sub: r.pr ? `PR #${r.pr.number}` : "no PR yet", status: word[k] ?? "no PR", color: textColor(t, k), tokens: raw ? `${v.runTokens(r.path)} tokens` : "", onClick: () => v.openWt(r) }, i === 0);
      }),
    ]))));
}

export function productivity(v, t) {
  const m = metrics(v), s = m?.s, runs = v.runs();
  const period = PERIODS.find(([k]) => k === v.period)[1];
  const wait = (value) => (m ? value : "…");
  return v_flex().gap(18)
    .child(line(v, t, runs))
    .child(h_flex().flex_wrap().gap(20).px(2)
      .child(stat(t, wait(s?.humans != null ? s.humans.toFixed(0) : "—"), "times you spoke per PR", `average · ${period}`))
      .child(stat(t, wait(s?.ship ? dur(s.ship) : "—"), "from your first message to the merge", s?.toPr ? `to the PR ${dur(s.toPr)}${s.review ? ` · PR to merge ${dur(s.review)}` : ""}` : "median of the merged PRs"))
      .child(stat(t, wait(s?.n ? fmt(s.tokens) : "—"), "tokens per PR", s?.n ? (s.cost === null ? "no rate for dollars" : `~$${s.cost.toFixed(2)} per PR`) : "no merged PRs in the period")))
    .child(h_flex().flex_wrap().gap(20).px(2).items_start()
      .child(v_flex().flex_grow(1).flex_basis(260).gap(8)
        .child(head(t, "Pull requests", "per week"))
        .child(m ? bars(t, m.pw.map((w, i) => ({ label: wk(lastWeeks(6)[i]), pair: [{ v: w.opened, color: t.ansi4 }, { v: w.merged, color: t.ansi5 }] })), 44) : note(t, "…"))
        .child(legend(t, [[t.ansi4, "abiertos"], [t.ansi5, "mergeados"]])))
      .child(v_flex().flex_grow(1).flex_basis(260).gap(8)
        .child(head(t, "Modelos", "tokens"))
        .child(m && m.total.tokens ? share(t, m.models, m.total.tokens) : note(t, "…"))
        .child(m && m.total.tokens ? legend(t, m.models.map((x) => [famColor(t, x.family), `${x.family} ${Math.round((x.tokens / m.total.tokens) * 100)}% · ${fmt(x.tokens)}`])) : div())))
    .child(agentsList(v, t))
    .child(runsList(v, t, runs));
}

export function spending(v, t) {
  const m = metrics(v), d = v.usage;
  if (!m) return note(t, v.usageError || "reading the transcripts… (the first time takes a few seconds)");
  const top = m.models[0];
  const runs = v.runs().map((r) => ({ ...r, tokens: v.runTokensRaw(r.path) })).filter((r) => r.tokens).sort((a, b) => b.tokens - a.tokens).slice(0, 6);
  const wmax = Math.max(1, ...runs.map((r) => r.tokens));
  const period = PERIODS.find(([k]) => k === v.period)[1];
  const rate = d.unrated.length ? `No rate for: ${d.unrated.join(", ")}. Write them (USD per million tokens) in ~/.config/herdr-app/data/factory-rates.json, for example {"opus": {"input": …, "cache_read": …, "output": …}}. The cost is an estimate, not the invoice.` : "The cost is an estimate with your rates, not the invoice.";
  return v_flex().gap(18)
    .child(h_flex().flex_wrap().gap(20).px(2)
      .child(stat(t, fmt(m.total.tokens), "tokens consumidos", `${period} · ${show(m.total).split(" · ")[1] ?? "—"}`))
      .child(stat(t, m.s.n ? fmt(m.s.tokens) : "—", "tokens per PR", m.s.n ? (m.s.cost === null ? "no rate for dollars" : `~$${m.s.cost.toFixed(2)} per PR`) : "no merged PRs"))
      .child(stat(t, top ? top.family : "—", "top model", top ? `${Math.round((top.tokens / m.total.tokens) * 100)}% of the tokens` : "no usage")))
    .child(v_flex().gap(8).child(head(t, "By model", period))
      .child(box(t, ...m.models.map((x, i) => h_flex().px(12).py(8).gap(10).items_center().when(i > 0, (el) => el.border_t(1).border_color(t.border))
        .child(div().flex_none().w(8).h(8).rounded(2).bg(famColor(t, x.family)))
        .child(div().flex_none().w(64).text_color(t.foreground).child(x.family))
        .child(div().flex_1().min_w(0).child(share(t, [x], m.total.tokens)))
        .child(div().flex_none().w(40).text_right().text_size(12).text_color(t.muted).child(`${Math.round((x.tokens / m.total.tokens) * 100)}%`))
        .child(div().flex_none().w(56).text_right().text_color(t.foreground).child(fmt(x.tokens)))
        .child(div().flex_none().w(84).text_right().text_size(12).text_color(t.muted).child(show(x).split(" · ")[1] ?? "—"))))))
    .child(v_flex().gap(8).px(2).child(head(t, "Tokens per week", "last 8"))
      .child(bars(t, m.weeks.map((w) => ({ label: wk(w.week), stack: m.models.map((x) => ({ v: w.by[x.family] ?? 0, color: famColor(t, x.family) })) })), 70))
      .child(legend(t, m.models.map((x) => [famColor(t, x.family), x.family]))))
    .child(v_flex().gap(8).child(head(t, "Biggest consumers", "all time"))
      .child(box(t, ...(runs.length ? runs.map((r, i) => h_flex().id(`top-${i}`).px(12).py(8).gap(10).items_center().cursor_pointer().hover((x) => x.bg(t.selected)).on_click(() => v.openWt(r)).when(i > 0, (el) => el.border_t(1).border_color(t.border))
        .child(div().flex_none().w("40%").truncate().text_size(13).text_color(t.foreground).child(r.branch))
        .child(div().flex_1().min_w(0).child(div().h(8).rounded(4).bg(barColor(t, r.pr?.kind ?? "none")).w(`${(r.tokens / wmax) * 100}%`)))
        .child(div().flex_none().w(56).text_right().text_size(12).text_color(t.muted).child(fmt(r.tokens)))) : [note(t, "no worktree has spent anything yet")]))))
    .child(div().px(2).text_size(11.5).text_color(t.dim).child(rate));
}

// What went wrong: failures of the agents and of the factory itself (setup, clones, gh). Click a row to read the error;
// from there an agent can be sent to fix it. Findings come from stats.js `findings`, via v.found().
export function detecciones(v, t) {
  const found = v.found();
  const hint = { agent: "commands that failed and nobody fixed", setup: "a worktree's setup exited with an error", factory: "repos, gh and the usage reading" };
  return v_flex().gap(18)
    .child(h_flex().flex_wrap().gap(20).px(2).children(SOURCES.map(([k, label]) => { const n = found.filter((x) => x.source === k).length; return stat(t, String(n), label, hint[k], n ? srcColor(t, k) : t.dim); })))
    .child(v_flex().gap(8).child(head(t, "To review", found.length ? `${found.length} · last 7 days` : ""))
      .child(box(t, ...(found.length ? found.flatMap((x, i) => [
        item(t, `det-${i}`, { icon: div().text_color(srcColor(t, x.source)).child("⚠"), title: x.title, sub: `${x.sub}${x.age ? ` · ${dur(x.age)} ago` : ""}`, status: x.source, color: srcColor(t, x.source), onClick: (_e, cx) => { v.open = v.open === x.id ? null : x.id; cx.notify(); } }, i === 0),
        ...(v.open === x.id ? [v_flex().px(12).py(10).gap(8).bg(t.hover).border_t(1).border_color(t.border)
          .child(v_flex().gap(1).children(x.detail.split("\n").slice(0, 14).map((l) => div().text_size(11.5).text_color(t.muted).child(l || " "))))
          .child(h_flex().gap(6)
            .child(btn(`fix-${i}`, "Fix with an agent", () => v.fix(x), { accent: true }))
            .when(Boolean(x.path), (el) => el.child(btn(`see-${i}`, "Open worktree", () => v.openWt({ path: x.path }))))
            .child(btn(`drop-${i}`, "Dismiss", (_e, cx) => v.dismiss(x, cx))))] : []),
      ]) : [note(t, "nothing to review: no agent ended up failing and the factory is healthy")]))));
}
