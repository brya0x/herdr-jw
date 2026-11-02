// Section "Tema": full light, full dark, or follow the system; below, the dark and the light theme (the one in use shows "en uso").
// Up/down + Enter or a click choose, left/right change the mode. use.py does the work for Herdr and Claude Code; open claudes
// repaint by themselves (jw.json); use.py live moves the rest to it once.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, theme, notify, appHome, readTextFile } from "herdr";

const MODES = [["light", "Claro"], ["dark", "Oscuro"], ["system", "Sistema"]];

export class ThemeSection {
  start(cx) {
    this.dir = `${appHome()}/data/jw-themes`;
    this.list = []; this.at = 0; this.state = { mode: "dark" };
    cx.spawn(async (cx) => {
      const ls = await exec("ls", [this.dir]);
      for (const f of ls.stdout.split("\n").filter((f) => f.endsWith(".json"))) {
        try { this.list.push(JSON.parse(await readTextFile(`${this.dir}/${f}`))); } catch { /* not a palette */ }
      }
      this.list.sort((a, b) => (a.mode === "dark" ? 0 : 1) - (b.mode === "dark" ? 0 : 1) || a.name.localeCompare(b.name));
      await this.load();
      this.at = Math.max(0, this.list.findIndex((s) => s.slug === this.state[this.state.mode === "light" ? "light" : "dark"]));
      cx.notify();
    });
  }

  async load() {
    try { this.state = JSON.parse(await readTextFile(`${appHome()}/data/jw-theme.json`)) ?? this.state; } catch { /* first time: use.py writes it */ }
  }

  use(args, cx) {
    cx.spawn(async (cx) => {
      const r = await exec("python3", [`${this.dir}/use.py`, ...args]);
      if (r.code !== 0) notify({ title: "Tema: no cambió", body: (r.stderr || r.stdout).trim().slice(0, 200) });
      await this.load(); cx.notify();
    });
  }

  mode(step, cx) {
    const i = MODES.findIndex(([m]) => m === this.state.mode);
    this.use(["mode", MODES[(i + step + MODES.length) % MODES.length][0]], cx);
  }

  // true when the key was this section's
  key(e, cx) {
    const n = this.list.length;
    if (e.key === "enter") { if (n) this.use(["set", this.list[this.at].slug], cx); return true; }
    if (e.key === "left" || e.key === "right") this.mode(e.key === "left" ? -1 : 1, cx);
    else if (e.key === "down" && n) this.at = (this.at + 1) % n; else if (e.key === "up" && n) this.at = (this.at + n - 1) % n; else return false;
    cx.notify(); return true;
  }

  render() {
    const t = theme(), s = this.state, hex = (t.background ?? "#000000").slice(1);
    const light = [0, 2, 4].reduce((n, i) => n + parseInt(hex.slice(i, i + 2), 16), 0) / 3 > 127; // what Herdr shows now, for mode "system"
    const seg = ([m, label]) => div().id(`mode-${m}`).flex_1().h(28).flex().items_center().justify_center().rounded(6).cursor_pointer()
      .when(s.mode === m, (el) => el.bg(t.accent).text_color(t.accent_foreground).font_semibold()).when(s.mode !== m, (el) => el.text_color(t.muted).hover((e) => e.bg(t.hover)))
      .on_click((_e, cx) => this.use(["mode", m], cx)).child(label);
    const row = (th, i) => {
      const chosen = s[th.mode] === th.slug, live = chosen && (s.mode === "system" ? (th.mode === "light") === light : s.mode === th.mode);
      return h_flex().id(`th-${th.slug}`).mx(4).px(10).h(36).gap(10).items_center().rounded(7).cursor_pointer()
        .when(i === this.at, (el) => el.bg(t.hover)).hover((e) => e.bg(t.hover))
        .on_click((_e, cx) => { this.at = i; this.use(["set", th.slug], cx); })
        .child(h_flex().gap(2).flex_none().children(["bg", "red", "yellow", "green", "blue", "magenta"].map((k) => div().w(14).h(14).rounded(3).bg(th.p[k]))))
        .child(div().flex_1().text_color(t.foreground).when(chosen, (d) => d.font_semibold()).child(th.name))
        .when(chosen, (el) => el.child(div().text_size(11).text_color(live ? t.accent : t.dim).child(live ? "en uso" : "elegido")));
    };
    const group = (mode, title) => {
      const rows = this.list.map((th, i) => [th, i]).filter(([th]) => th.mode === mode);
      return rows.length ? [div().px(10).pt(6).text_size(11).text_color(t.dim).child(title), ...rows.map(([th, i]) => row(th, i))] : [];
    };
    return v_flex().id("jw-theme").size_full().overflow_y_scroll().p(18).gap(8)
      .child(div().text_size(15).font_semibold().text_color(t.foreground).child("Tema"))
      .child(h_flex().gap(4).p(3).rounded(8).bg(t.surface).children(MODES.map(seg)))
      .children([...group("dark", "Oscuros"), ...group("light", "Claros")])
      .when(!this.list.length, (el) => el.child(div().text_color(t.dim).child("Sin temas: corre ./sync.sh push")));
  }
}
