// The "+" of the spaces sidebar: a popup with a new space or a new workspace (the cmd-shift-n dialog).
// props: { machine? } the machine the "+" belongs to.
import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, run, props, closeOverlay } from "herdr";

export default class SpacesAddMenu extends View {
  row(id, label, hint, action) {
    const t = theme();
    return h_flex().id(id).h(31).px(9).gap(10).rounded(7).items_center().flex_none().text_color(t.foreground)
      .hover(s => s.bg(t.selected))
      .on_click(() => { closeOverlay(props().overlay); action(); })
      .child(div().flex_1().child(label)).child(div().text_size(11).text_color(t.dim).child(hint));
  }
  render() {
    const t = theme();
    const machine = props()?.machine;
    return v_flex().w_full().p(5).bg(t.popover).text_size(12.8)
      .child(this.row("space", "Nuevo space", "carpeta existente", () => run("space.new", machine ? { machine } : {})))
      .child(this.row("workspace", "Nuevo workspace", "⌘⇧N", () => run("mod.open", { name: "factory" })));
  }
}
