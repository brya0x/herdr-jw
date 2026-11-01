// cmd-shift-k: the jw themes (the palettes sync.sh push installs in data/jw-themes). Up/down and Enter, or a click, set the
// theme in Herdr and Claude Code at once (use.sh); Esc leaves. Claude sessions already open keep theirs until /theme.
import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, run, theme, props, closeOverlay, notify, appHome, readTextFile } from "herdr";

export default class Themes extends View {
  init(_props, cx) {
    this.dir = `${appHome()}/data/jw-themes`;
    this.list = []; this.at = 0;
    this.handle = cx.focus_handle();
    cx.spawn(async (cx) => {
      const ls = await exec("ls", [this.dir]);
      for (const f of ls.stdout.split("\n").filter((f) => f.endsWith(".json"))) {
        try { this.list.push(JSON.parse(await readTextFile(`${this.dir}/${f}`))); } catch { /* not a palette */ }
      }
      const now = theme().background?.toLowerCase();
      this.at = Math.max(0, this.list.findIndex((s) => s.p.bg === now));
      this.handle.focus(); cx.notify();
    });
    cx.timer.after(300, () => this.handle.focus());
  }

  pick(s, cx) {
    closeOverlay(props().overlay);
    cx.spawn(async () => {
      const r = await exec("sh", [`${this.dir}/use.sh`, s.slug]);
      if (r.code !== 0) notify({ title: `Tema ${s.name}: no cambió`, body: (r.stderr || r.stdout).trim().slice(0, 200) });
    });
  }

  render() {
    const t = theme(), now = t.background?.toLowerCase();
    const row = (s, i) => h_flex().id(`th-${s.slug}`).mx(4).px(10).h(36).gap(10).items_center().rounded(7).cursor_pointer()
      .when(i === this.at, (el) => el.bg(t.hover)).hover((e) => e.bg(t.hover))
      .on_click((_e, cx) => this.pick(s, cx))
      .child(h_flex().gap(2).flex_none().children(["bg", "red", "yellow", "green", "blue", "magenta"].map((k) => div().w(14).h(14).rounded(3).bg(s.p[k]))))
      .child(div().flex_1().text_color(t.foreground).when(s.p.bg === now, (d) => d.font_semibold()).child(s.name))
      .when(s.p.bg === now, (el) => el.child(div().text_size(11).text_color(t.dim).child("en uso")));
    return v_flex().id("themes").track_focus(this.handle).w_full().p(18).gap(10).bg(t.popover).text_size(13)
      .on_key_down((e, cx) => {
        const n = this.list.length;
        if (e.key === "escape") return closeOverlay(props().overlay);
        if (e.key === "enter") return n && this.pick(this.list[this.at], cx);
        if (e.key === "down") this.at = (this.at + 1) % n; else if (e.key === "up") this.at = (this.at + n - 1) % n; else return;
        cx.stop_propagation(); cx.notify();
      })
      .child(h_flex().items_center().child(div().flex_1().text_size(15).font_semibold().text_color(t.foreground).child("Tema")).child(div().text_size(11).text_color(t.dim).child("Esc")))
      .children(this.list.map(row))
      .when(!this.list.length, (el) => el.child(div().text_color(t.dim).child("Sin temas: corre ./sync.sh push")));
  }
}
