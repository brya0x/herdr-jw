// Section "Paneles": the Files and Changes buttons of the tab bar (tabs-one). Off by default; the choice is the shared value "jw.panels".
// Up/down + Enter or Space, or a click, turn one on or off.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, shared, setShared } from "herdr";

const PANELS = [["files", "Files", "El explorador de archivos del space, a la derecha."], ["changes", "Changes", "Los cambios de git del space, a la derecha."]];

export class PanelsSection {
  start() { this.at = 0; }

  on() { return shared("jw.panels") ?? []; }

  toggle(id, cx) {
    const cur = this.on();
    setShared("jw.panels", cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
    cx.notify();
  }

  key(e, cx) {
    if (e.key === "down" || e.key === "up") { this.at = (this.at + (e.key === "down" ? 1 : PANELS.length - 1)) % PANELS.length; cx.notify(); return true; }
    if (e.key === "enter" || e.key === "space") { this.toggle(PANELS[this.at][0], cx); return true; }
    return false;
  }

  render() {
    const t = theme(), on = this.on();
    const row = ([id, label, about], i) => h_flex().id(`panel-${id}`).mx(4).px(10).h(48).gap(12).items_center().rounded(7).cursor_pointer()
      .when(i === this.at, (el) => el.bg(t.hover)).hover((e) => e.bg(t.hover))
      .on_click((_e, cx) => { this.at = i; this.toggle(id, cx); })
      .child(div().flex_none().w(18).h(18).rounded(4).flex().items_center().justify_center().border_1().border_color(on.includes(id) ? t.accent : t.border)
        .when(on.includes(id), (el) => el.bg(t.accent).text_color(t.accent_foreground).child("✓")))
      .child(v_flex().flex_1().gap(1).child(div().text_color(t.foreground).child(label)).child(div().text_size(11).text_color(t.dim).child(about)));
    return v_flex().id("jw-panels").size_full().p(18).gap(8)
      .child(div().text_size(15).font_semibold().text_color(t.foreground).child("Paneles"))
      .child(div().text_color(t.muted).child("Botones de la barra de arriba que abren un panel a la derecha. Apagados por defecto."))
      .children(PANELS.map(row));
  }
}
