import { div } from "gpui-kit";
import { theme } from "herdr";

export const btn = (id, label, onClick, { accent = false } = {}) => {
  const t = theme();
  return div().id(id).flex_none().px(8).py(2).rounded(5).border(1).border_color(accent ? t.accent : t.border).cursor_pointer()
    .text_size(11.5).text_color(accent ? t.accent : t.muted).hover((s) => s.bg(t.hover)).on_click((e, cx) => { cx.stop_propagation(); onClick(e, cx); }).child(label);
};
