import { div } from "gpui-kit";
import { v_flex, InputState, Input } from "gpui-base";
import { props, closeOverlay, theme } from "herdr";
import { createWorkspace } from "./lib.js";

// The box of a new workspace: only its name; the repos are added afterwards from the repos panel.
export class NewWorkspace {
  init(cx) {
    this.error = "";
    this.busy = false;
    this.input = InputState.new({ value: "", placeholder: "nombre del workspace" });
    this.input.on("change", (_e, cx) => { this.error = ""; cx.notify(); });
    this.input.on("submit", (_e, cx) => this.go(cx));
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
  }

  go(cx) {
    if (this.busy) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      // The whole sequence runs before the dialog closes: a closed overlay's tasks are cancelled.
      try { await createWorkspace(this.input.value()); closeOverlay(props().overlay); }
      catch (e) { this.error = String(e?.message ?? e); }
      this.busy = false;
      cx.notify();
    });
  }

  render() {
    const t = theme();
    return v_flex().id("factory-new").size_full().p(16).gap(10).bg(t.popover).text_size(13)
      .child(div().font_semibold().text_color(t.foreground).child("Nuevo workspace"))
      .child(Input.new(this.input).h(32).px(10).items_center().rounded(6).border(1).border_color(t.accent).bg(t.background).text_color(t.foreground))
      .child(div().text_size(11).text_color(this.error ? t.blocked : t.dim).child(this.error || (this.busy ? "creando…" : "↵ crear (con claude y el panel de repos) · esc cancelar")));
  }
}
