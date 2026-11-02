// cmd-alt-u: updates herdr-jw (mods, layout, themes, skill, and the jw plugin for Claude Code) by running the published install.sh
// without touching keys.json, and shows what it printed. The update replaces this mod's own files, so the run is a lock file in
// data/ plus a log: if the mod reloads in the middle it shows the same run instead of starting another.
import { View, div } from "gpui-kit";
import { v_flex } from "gpui-base";
import { exec, theme, props, closeOverlay, notify, appHome, readTextFile } from "herdr";

const URL = "https://raw.githubusercontent.com/brya0x/herdr-jw/main/install.sh";
const LOCK_SECS = 180;

export default class Update extends View {
  init(_props, cx) {
    this.dir = `${appHome()}/data`;
    this.lock = `${this.dir}/update-jw.lock`; this.log = `${this.dir}/update-jw.log`;
    this.text = ""; this.phase = "run"; this.code = 0;
    this.handle = cx.focus_handle();
    cx.spawn(async (cx) => {
      this.handle.focus();
      const busy = await this.locked();
      if (!busy) {
        const script = `mkdir -p '${this.dir}'; date +%s > '${this.lock}'; curl -fsSL ${URL} | sh -s -- --no-keys > '${this.log}' 2>&1; rc=$?; rm -f '${this.lock}'; exit $rc`;
        exec("sh", ["-c", script]).then((r) => { this.code = r.code; });
      }
      while (await this.locked() || !this.finished()) { await this.refresh(cx); await new Promise((ok) => cx.timer.after(600, ok)); }
      await this.refresh(cx);
      this.phase = this.text.includes("could not install the Claude Code plugin") ? "warn" : this.failed() ? "fail" : "ok";
      notify({ title: this.phase === "fail" ? "herdr-jw: la actualización falló" : "herdr-jw actualizado", body: this.last(2) });
      cx.notify();
    });
  }

  async locked() {
    try { const t = Number((await readTextFile(this.lock)).trim()); return t > 0 && Date.now() / 1000 - t < LOCK_SECS; } catch { return false; }
  }
  finished() { return this.text.includes("restart Herdr") || this.failed(); }
  failed() { return /^herdr-jw: (?!could not install)|curl: |No such file|Error/m.test(this.text) && !this.text.includes("restart Herdr"); }
  last(n) { return this.text.trim().split("\n").slice(-n).join(" ").slice(0, 200); }
  async refresh(cx) {
    try { this.text = await readTextFile(this.log); } catch { this.text = ""; }
    cx.notify();
  }

  render() {
    const t = theme();
    const head = { run: "Actualizando…", ok: "Actualizado", warn: "Actualizado, pero falló el plugin de Claude Code", fail: "La actualización falló" }[this.phase];
    const color = { run: t.working, ok: t.done, warn: t.working, fail: t.blocked }[this.phase];
    const lines = this.text.trim().split("\n").filter(Boolean).slice(-9);
    return v_flex().id("update-jw").track_focus(this.handle).w_full().p(18).gap(10).bg(t.popover).text_size(13)
      .on_key_down((e, cx) => { if (e.key === "escape" || e.key === "enter") { closeOverlay(props().overlay); cx.stop_propagation(); } })
      .child(div().text_size(15).font_semibold().text_color(color).child(head))
      .child(v_flex().gap(3).p(10).rounded(8).bg(t.surface).text_size(12).text_color(t.muted)
        .children(lines.length ? lines.map((l) => div().child(l.slice(0, 110))) : [div().child("Bajando install.sh…")]))
      .child(div().text_size(11).text_color(t.dim).child(this.phase === "run" ? "Esc cierra; sigue en segundo plano" : "Reinicia Herdr para cargar los mods nuevos. Esc cierra"));
  }
}
