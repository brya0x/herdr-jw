import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, theme, openOverlay, notify, exec, spaces, run } from "herdr";
import { readManifest, probe, removeRepo, retryClone, base } from "./lib.js";
import { btn } from "./ui.js";

const SPIN = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// The repos of a workspace folder, beside its agent: where each one is, its branch, its changes.
export class Repos {
  init(cx) {
    this.folder = props().folder;
    this.rows = undefined;
    this.pr = {}; // worktree path -> { number, kind: merged | failed | open }
    this.polled = false;
    this.refresh(cx);
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

  // The pull request of each worktree's branch, read as jw's github.rs does: merged, or open with a failing check.
  poll(cx) {
    if (this.polling) return;
    this.polling = true;
    const wts = (this.rows ?? []).flatMap((r) => r.wts ?? []);
    cx.spawn(async (cx) => {
      const now = {};
      await Promise.all(wts.map(async (w) => {
        try {
          const r = await exec("gh", ["pr", "list", "--head", w.branch, "--state", "all", "--limit", "1", "--json", "number,state,statusCheckRollup"], { cwd: w.path });
          const pr = r.code === 0 ? JSON.parse(r.stdout)[0] : null;
          if (!pr) return;
          const failing = (pr.statusCheckRollup ?? []).some((c) => ["FAILURE", "TIMED_OUT", "STARTUP_FAILURE"].includes(c.conclusion) || ["FAILURE", "ERROR"].includes(c.state));
          now[w.path] = { number: pr.number, kind: pr.state === "MERGED" ? "merged" : pr.state === "OPEN" && failing ? "failed" : pr.state === "OPEN" ? "open" : "closed" };
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
    return h_flex().id(`repo-${i}`).flex_none().px(10).py(8).gap(8).items_start().rounded(7).hover((s) => s.bg(t.hover))
      .child(div().flex_none().w(14).child(mark))
      .child(v_flex().flex_1().min_w(0).gap(1)
        .child(h_flex().gap(6).items_center()
          .child(div().truncate().font_semibold().text_color(t.foreground).child(r.name))
          .child(div().flex_none().text_size(11).text_color(t.dim).child(r.kind === "gh" ? "github" : "carpeta")))
        .child(div().truncate().text_size(11.5).text_color(r.state === "failed" || r.state === "missing" ? t.blocked : t.muted)
          .child(r.state === "git" && r.dirty ? `${info} · ${r.dirty} cambios` : info))
        .child(div().truncate().text_size(11).text_color(t.dim).child(r.state === "failed" && r.msg ? r.msg.split("\n")[0] : r.real ?? r.path ?? r.id))
        .children((r.wts ?? []).map((w, k) => {
          const pr = this.pr[w.path];
          const badge = { merged: ["⚑ mergeado", t.done], failed: ["✗ CI", t.blocked], open: ["PR", t.dim], closed: ["PR cerrado", t.dim] }[pr?.kind];
          return h_flex().id(`wt-${i}-${k}`).gap(6).h(20).items_center().cursor_pointer().rounded(4).hover((s) => s.bg(t.selected))
            .on_click(() => this.openWt(w))
            .child(div().flex_none().text_size(11).text_color(t.dim).child("⎇"))
            .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.muted).child(w.branch))
            .when(Boolean(badge), (el) => el.child(div().flex_none().text_size(11).text_color(badge[1]).child(`${badge[0]} #${pr.number}`)));
        }))
        .child(h_flex().gap(6).pt(4)
          .when(r.state === "git", (el) => el.child(btn(`wt-${i}`, "＋ worktree", () => this.worktree(r, "new"))).child(btn(`wts-${i}`, "worktrees", () => this.worktree(r, "open"))))
          .when(r.state === "failed", (el) => el.child(btn(`retry-${i}`, "reintentar", (_e, cx) => this.act(() => retryClone(this.folder, r), cx), { accent: true })))
          .child(btn(`rm-${i}`, "quitar", (_e, cx) => this.act(() => removeRepo(this.folder, r.name), cx)))));
  }

  render() {
    const t = theme();
    return v_flex().id("factory-repos").size_full().bg(t.surface).p(10).gap(6).text_size(13)
      .child(h_flex().items_center().px(4)
        .child(div().flex_1().truncate().font_semibold().text_color(t.foreground).child(`repos · ${base(this.folder)}`))
        .child(btn("add", "＋ añadir", () => openOverlay({ mod: "factory", kind: "dialog", width: 520, height: 520, props: { view: "add", folder: this.folder } }), { accent: true })))
      .when(this.bad, (el) => el.child(div().px(4).text_size(12).text_color(t.blocked).child(".factory.json no es JSON válido: arréglalo a mano.")))
      .child(v_flex().id("repos-list").flex_1().min_h(0).overflow_y_scroll().gap(2)
        .when(this.rows === undefined, (el) => el.child(div().p(10).text_color(t.muted).child("…")))
        .when(this.rows && !this.rows.length && !this.bad, (el) => el.child(div().p(10).text_color(t.dim).child("sin repos todavía: pulsa «añadir»")))
        .children((this.rows ?? []).map((r, i) => this.row(r, i, t))));
  }
}
