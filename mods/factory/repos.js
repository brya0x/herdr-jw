import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, theme, openOverlay, notify, exec, spaces, run, appHome } from "herdr";
import { readManifest, probe, removeRepo, retryClone, base } from "./lib.js";
import { btn } from "./ui.js";
import { PERIODS, loadUsage, usageOf, show, fmt, detections } from "./usage.js";
import { SPIN, productivity, spending, detecciones } from "./dash.js";

const TABS = [["prod", "Productividad"], ["gasto", "Gasto"], ["det", "Detecciones"], ["repos", "Repos"]];

// The factory panel: productivity and spending of the workspace's agents, and its repos (where each is, its branch, its changes).
export class Repos {
  init(cx) {
    this.folder = props().folder;
    this.rows = undefined;
    this.pr = {}; // worktree path -> { number, kind: merged | failed | open }
    this.polled = false;
    this.usage = undefined; // usage.py's rows; read every minute, it is cached by file
    this.period = "4w";
    this.tab = "prod"; // prod | gasto | det | repos
    this.kind = "all"; // the worktree filter of the productivity tab
    this.flow = {}; // worktree path -> { first, humans }, from flow.py
    this.memo = new Map(); // usage sums by paths and period: render runs often, the rows are thousands
    this.refresh(cx);
    this.readUsage(cx);
    cx.timer.every(60000, (cx) => this.readUsage(cx));
    cx.timer.every(4000, (cx) => this.refresh(cx));
    cx.timer.every(60000, (cx) => this.poll(cx));
  }

  refresh(cx) {
    cx.spawn(async (cx) => {
      try {
        const m = await readManifest(this.folder);
        this.bad = Boolean(m.bad);
        this.rows = await Promise.all(m.repos.map((r) => probe(this.folder, r)));
        if (!this.polled && !this.polling) this.poll(cx);
      } catch (e) { this.rows = []; this.error = String(e?.message ?? e); }
      cx.notify();
    });
  }

  readUsage(cx) {
    if (this.reading) return;
    this.reading = true;
    cx.spawn(async (cx) => {
      try {
        this.usage = await loadUsage(); this.usageError = "";
        const paths = (this.rows ?? []).flatMap((r) => (r.wts ?? []).map((w) => w.path));
        if (paths.length) { const f = await exec("python3", ["-I", `${appHome()}/mods/factory/flow.py`, ...paths]); if (f.code === 0) this.flow = JSON.parse(f.stdout); }
      } catch (e) { this.usageError = String(e?.message ?? e); }
      this.reading = false;
      this.memo = new Map();
      cx.notify();
    });
  }

  // The usage of some paths in the chosen period, or "" until usage.py answered.
  cost(paths) { return this.usage ? this.once(`c|${this.period}|${paths.join("|")}`, () => show(usageOf(this.usage, this.period, paths))) : ""; }

  once(key, build) {
    if (!this.memo.has(key)) this.memo.set(key, build());
    return this.memo.get(key);
  }

  // The pull request of each worktree's branch, read as jw's github.rs does: merged, or open with a failing check.
  poll(cx) {
    if (this.polling) return;
    this.polling = true;
    const wts = (this.rows ?? []).flatMap((r) => r.wts ?? []);
    cx.spawn(async (cx) => {
      const now = {};
      await Promise.all(wts.map(async (w) => {
        try {
          const r = await exec("gh", ["pr", "list", "--head", w.branch, "--state", "all", "--limit", "1", "--json", "number,state,statusCheckRollup,mergedAt,createdAt"], { cwd: w.path });
          const pr = r.code === 0 ? JSON.parse(r.stdout)[0] : null;
          if (!pr) return;
          const failing = (pr.statusCheckRollup ?? []).some((c) => ["FAILURE", "TIMED_OUT", "STARTUP_FAILURE"].includes(c.conclusion) || ["FAILURE", "ERROR"].includes(c.state));
          now[w.path] = { number: pr.number, created: pr.createdAt, merged: pr.mergedAt, kind: pr.state === "MERGED" ? "merged" : pr.state === "OPEN" && failing ? "failed" : pr.state === "OPEN" ? "open" : "closed" };
        } catch { /* no gh, no remote, no network: the worktree just has no badge */ }
      }));
      if (this.polled) for (const w of wts) {
        const was = this.pr[w.path]?.kind, is = now[w.path]?.kind;
        if (is !== was && (is === "merged" || is === "failed")) {
          const space = spaces().find((s) => s.folder === w.path);
          notify({ title: is === "merged" ? "PR mergeado" : "CI falló", body: `${w.branch} · #${now[w.path].number}`, level: is === "merged" ? "info" : "error", ...(space ? { action: { name: "space.select", args: { id: space.id } } } : {}) });
        }
      }
      this.pr = now;
      this.memo = new Map();
      this.polled = true;
      this.polling = false;
      cx.notify();
    });
  }

  openWt(w) {
    const space = spaces().find((s) => s.folder === w.path);
    run(space ? "space.select" : "space.new", space ? { id: space.id } : { folder: w.path });
  }

  act(job, cx) {
    cx.spawn(async (cx) => {
      try { await job(); } catch (e) { notify({ title: "Repos", body: String(e?.message ?? e), level: "error" }); }
      this.refresh(cx);
    });
  }

  worktree(r, action) {
    openOverlay({ mod: "worktree-wt", kind: "dialog", ...(action === "open" ? { width: 560, height: 480 } : { width: 460, height: 280 }), props: { folder: r.real, action, root: `${this.folder}/worktrees/${r.name}` } });
  }

  row(r, i, t) {
    const mark = r.state === "cloning" ? div().frames(SPIN, 90).text_color(t.accent)
      : r.state === "git" ? div().text_color(t.done).child("✓")
      : r.state === "dir" ? div().text_color(t.working).child("▤")
      : div().text_color(t.blocked).child("⇣");
    const info = { cloning: "clonando…", failed: "clon fallido", missing: "no está en disco", git: r.branch, dir: "carpeta · sin git" }[r.state];
    return h_flex().id(`repo-${i}`).flex_none().px(12).py(10).gap(10).items_start().rounded(10).bg(t.raised).border(1).border_color(t.border).hover((s) => s.bg(t.hover))
      .child(div().flex_none().w(14).child(mark))
      .child(v_flex().flex_1().min_w(0).gap(1)
        .child(h_flex().gap(6).items_center()
          .child(div().truncate().font_semibold().text_color(t.foreground).child(r.name))
          .child(div().flex_none().text_size(11.5).text_color(t.dim).child(r.kind === "gh" ? "github" : "carpeta")))
        .child(div().truncate().text_size(12).text_color(r.state === "failed" || r.state === "missing" ? t.blocked : t.muted)
          .child(r.state === "git" && r.dirty ? `${info} · ${r.dirty} cambios` : info))
        .child(h_flex().gap(6).child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.dim).child(r.state === "failed" && r.msg ? r.msg.split("\n")[0] : r.real ?? r.path ?? r.id))
          .child(div().flex_none().text_size(11.5).text_color(t.muted).child(this.cost([r.path, r.real, ...(r.wts ?? []).map((w) => w.path)]))))
        .children((r.wts ?? []).map((w, k) => {
          const pr = this.pr[w.path];
          const badge = { merged: ["⚑ mergeado", t.done], failed: ["✗ CI", t.blocked], open: ["PR", t.dim], closed: ["PR cerrado", t.dim] }[pr?.kind];
          return h_flex().id(`wt-${i}-${k}`).gap(6).h(26).items_center().cursor_pointer().rounded(5).hover((s) => s.bg(t.selected))
            .on_click(() => this.openWt(w))
            .child(div().flex_none().text_size(11.5).text_color(t.dim).child("⎇"))
            .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.muted).child(w.branch))
            .when(Boolean(badge), (el) => el.child(div().flex_none().text_size(11.5).text_color(badge[1]).child(`${badge[0]} #${pr.number}`)))
            .child(div().flex_none().text_size(11.5).text_color(t.muted).child(this.cost([w.path])));
        }))
        .child(h_flex().gap(6).pt(4)
          .when(r.state === "git", (el) => el.child(btn(`wt-${i}`, "＋ worktree", () => this.worktree(r, "new"))).child(btn(`wts-${i}`, "worktrees", () => this.worktree(r, "open"))))
          .when(r.state === "failed", (el) => el.child(btn(`retry-${i}`, "reintentar", (_e, cx) => this.act(() => retryClone(this.folder, r), cx), { accent: true })))
          .child(btn(`rm-${i}`, "quitar", (_e, cx) => this.act(() => removeRepo(this.folder, r.name), cx)))));
  }

  // Every path this workspace's claudes run in: the folder, the repos and their worktrees.
  paths() {
    return [this.folder, ...(this.rows ?? []).flatMap((r) => [r.path, r.real, ...(r.wts ?? []).map((w) => w.path)])];
  }

  // Every worktree of every repo, with its PR if it has one.
  runs() {
    return (this.rows ?? []).flatMap((r) => (r.wts ?? []).map((w) => ({ repo: r.name, branch: w.branch, path: w.path, pr: this.pr[w.path] ?? null })));
  }

  runTokensRaw(path) { return this.usage ? this.once(`rt|${path}`, () => usageOf(this.usage, "all", [path]).tokens) : 0; }
  runTokens(path) { const n = this.runTokensRaw(path); return n ? fmt(n) : "—"; }

  render() {
    const t = theme();
    const badge = { gasto: this.usage ? fmt(this.once(`bt|${this.period}|${this.paths().join("|")}`, () => usageOf(this.usage, this.period, this.paths()).tokens)) : "", det: this.polled ? String(detections(this.runs()).length || "") : "", repos: this.rows ? String(this.rows.length) : "" };
    const on = (k) => this.tab === k;
    return v_flex().id("factory-repos").size_full().bg(t.surface).p(14).gap(12).text_size(13)
      .child(h_flex().items_center().px(2).gap(10)
        .child(div().flex_1().min_w(0).truncate().text_size(15).font_semibold().text_color(t.foreground).child(base(this.folder)))
        .when(on("prod") || on("gasto"), (el) => el.child(h_flex().flex_none().rounded(6).border(1).border_color(t.border).overflow_hidden()
          .children(PERIODS.map(([k, label]) => div().id(`period-${k}`).px(10).py(3).text_size(12).cursor_pointer()
            .text_color(this.period === k ? t.foreground : t.muted).when(this.period === k, (x) => x.bg(t.selected).font_semibold()).when(this.period !== k, (x) => x.hover((y) => y.bg(t.hover)))
            .on_click((_e, cx) => { this.period = k; cx.notify(); }).child(label)))))
        .when(on("repos"), (el) => el.child(btn("add", "＋ añadir", () => openOverlay({ mod: "factory", kind: "dialog", width: 520, height: 520, props: { view: "add", folder: this.folder } }), { accent: true }))))
      .child(h_flex().gap(18).px(2).border_b(1).border_color(t.border)
        .children(TABS.map(([k, label]) => h_flex().id(`tab-${k}`).gap(6).py(7).items_center().cursor_pointer().text_size(13).border_b(2).border_color(on(k) ? t.accent : t.surface)
          .text_color(on(k) ? t.foreground : t.muted).when(on(k), (el) => el.font_semibold())
          .on_click((_e, cx) => { this.tab = k; cx.notify(); })
          .child(label).when(Boolean(badge[k]), (el) => el.child(div().px(6).rounded(8).bg(t.hover).text_size(11.5).text_color(t.dim).child(badge[k]))))))
      .when(this.usageError && (this.tab === "prod" || this.tab === "gasto"), (el) => el.child(div().px(2).text_size(12.5).text_color(t.blocked).child(this.usageError)))
      .child(v_flex().id("factory-body").flex_1().min_h(0).overflow_y_scroll().gap(8).pt(4)
        .when(this.tab === "prod", (el) => el.child(productivity(this, t)))
        .when(this.tab === "gasto", (el) => el.child(spending(this, t)))
        .when(this.tab === "det", (el) => el.child(detecciones(this, t)))
        .when(this.tab === "repos", (el) => el
          .when(this.bad, (e) => e.child(div().px(4).text_size(12).text_color(t.blocked).child(".factory.json no es JSON válido: arréglalo a mano.")))
          .when(this.rows === undefined, (e) => e.child(div().p(10).text_color(t.muted).child("…")))
          .when(this.rows && !this.rows.length && !this.bad, (e) => e.child(div().p(10).text_color(t.dim).child("sin repos todavía: pulsa «añadir»")))
          .children((this.rows ?? []).map((r, i) => this.row(r, i, t)))));
  }
}
