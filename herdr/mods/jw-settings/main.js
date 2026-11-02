// cmd-shift-,: one screen for jw, like Herdr's Settings: a list on the left and the section on the right.
// Theme (light/dark/system and which theme), Costs (what claude has cost), Panels (the Files and Changes buttons), Update (herdr-jw itself).
// Tab / shift+tab or 1-4 move between sections; each section takes the other keys; Esc leaves.
import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, props, closeOverlay } from "herdr";
import { ThemeSection } from "./theme.js";
import { UsageSection } from "./usage-view.js";
import { UpdateSection } from "./update.js";
import { PanelsSection } from "./panels.js";

const SECTIONS = [["theme", "Theme", ThemeSection], ["usage", "Costs", UsageSection], ["panels", "Panels", PanelsSection], ["update", "Update", UpdateSection]];

export default class JwSettings extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.at = 0;
    this.sections = SECTIONS.map(([, , Section]) => new Section());
    this.started = new Set();
    this.go(0, cx);
    cx.timer.after(300, () => this.handle.focus());
  }

  go(i, cx) {
    this.at = (i + SECTIONS.length) % SECTIONS.length;
    if (!this.started.has(this.at)) { this.started.add(this.at); this.sections[this.at].start(cx); } // Costs reads the transcripts only when shown
    this.handle.focus(); cx.notify();
  }

  render() {
    const t = theme();
    const item = ([id, label], i) => div().id(`nav-${id}`).h(30).px(10).flex().items_center().rounded(6).cursor_pointer()
      .when(i === this.at, (el) => el.bg(t.selected).text_color(t.foreground).font_semibold()).when(i !== this.at, (el) => el.text_color(t.muted).hover((e) => e.bg(t.hover)))
      .on_click((_e, cx) => this.go(i, cx)).child(label);
    return h_flex().id("jw-settings").track_focus(this.handle).size_full().bg(t.popover).text_size(13)
      .on_key_down((e, cx) => {
        if (e.key === "escape") return closeOverlay(props().overlay);
        const n = /^[1-9]$/.test(e.key) ? Number(e.key) - 1 : -1;
        if (n >= 0 && n < SECTIONS.length) this.go(n, cx);
        else if (e.key === "tab") this.go(this.at + (e.modifiers.shift ? -1 : 1), cx);
        else if (!this.sections[this.at].key(e, cx)) return;
        cx.stop_propagation();
      })
      .child(v_flex().flex_none().w(170).h_full().p(10).gap(2).bg(t.surface)
        .child(div().px(10).pb(8).pt(4).text_size(15).font_semibold().text_color(t.foreground).child("jw"))
        .children(SECTIONS.map(item)))
      .child(div().flex_1().min_w(0).h_full().child(this.sections[this.at].render()));
  }
}
