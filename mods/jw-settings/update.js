// Section "Actualizar": runs the published install.sh (without touching keys.json) and shows what it printed. The update replaces
// this mod's own files, so the run is a lock file in data/ plus a log: if the mod reloads in the middle it shows the same run.
import { div } from "gpui-kit";
import { v_flex } from "gpui-base";
import { exec, theme, notify, appHome, readTextFile } from "herdr";

const URL = "https://raw.githubusercontent.com/brya0x/herdr-jw/main/install.sh";
const LOCK_SECS = 180;

export class UpdateSection {
  start(cx) {
    this.dir = `${appHome()}/data`;
    this.lock = `${this.dir}/update-jw.lock`; this.log = `${this.dir}/update-jw.log`;
    this.text = ""; this.phase = "idle";
    cx.spawn(async (cx) => { if (await this.locked()) this.watch(cx); }); // a run that was on when this mod reloaded
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

  run(cx) {
    if (this.phase === "run") return;
    const script = `mkdir -p '${this.dir}'; date +%s > '${this.lock}'; curl -fsSL ${URL} | sh -s -- --no-keys > '${this.log}' 2>&1; rc=$?; rm -f '${this.lock}'; exit $rc`;
    exec("sh", ["-c", script]);
    this.text = ""; this.watch(cx);
  }

  watch(cx) {
    this.phase = "run"; cx.notify();
    cx.spawn(async (cx) => {
      while (await this.locked() || !this.finished()) { await this.refresh(cx); await new Promise((ok) => cx.timer.after(600, ok)); }
      await this.refresh(cx);
      this.phase = this.text.includes("could not install the Claude Code plugin") ? "warn" : this.failed() ? "fail" : "ok";
      notify({ title: this.phase === "fail" ? "herdr-jw: la actualización falló" : "herdr-jw actualizado", body: this.last(2) });
      cx.notify();
    });
  }

  key(e, cx) {
    if (e.key !== "enter") return false;
    this.run(cx); return true;
  }

  render() {
    const t = theme();
    const head = { idle: "Actualizar herdr-jw", run: "Actualizando…", ok: "Actualizado", warn: "Actualizado, pero falló el plugin de Claude Code", fail: "La actualización falló" }[this.phase];
    const color = { idle: t.foreground, run: t.working, ok: t.done, warn: t.working, fail: t.blocked }[this.phase];
    const lines = this.text.trim().split("\n").filter(Boolean).slice(-10);
    const go = div().id("update-go").flex_none().px(12).py(6).rounded(6).cursor_pointer().text_color(t.accent_foreground)
      .bg(this.phase === "run" ? t.dim : t.accent).on_click((_e, cx) => this.run(cx))
      .child(this.phase === "idle" ? "Actualizar ahora" : this.phase === "run" ? "Actualizando…" : "Actualizar otra vez");
    return v_flex().id("jw-update").size_full().p(18).gap(10)
      .child(div().text_size(15).font_semibold().text_color(color).child(head))
      .child(div().text_color(t.muted).child("Corre el install.sh publicado (mods, layout, temas, el skill herdr-tasks y el plugin jw de Claude Code). No toca keys.json."))
      .child(div().flex().child(go))
      .child(lines.length ? v_flex().gap(3).p(10).rounded(8).bg(t.surface).text_size(12).text_color(t.muted).children(lines.map((l) => div().child(l.slice(0, 110)))) : div())
      .child(div().text_size(11).text_color(t.dim).child(this.phase === "idle" ? "Enter también la lanza." : "Reinicia Herdr para cargar los mods nuevos."));
  }
}
