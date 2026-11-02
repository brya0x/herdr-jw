// The task list of the shown space and its loop (the loop itself runs in tabs-one).
import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, readTextFile, writeTextFile, spaces, shared, setShared, theme, appHome } from "herdr";
import { parse, withFinal, pathFor, count } from "./lib.js";

const GLYPH = { todo: "○", done: "✓", blocked: "✗" };

export default class Tasks extends View {
  init(_props, cx) {
    this.md = null;
    this.msg = "";
    this.load(cx);
    cx.timer.every(1500, (cx) => this.load(cx));
  }

  space() { return spaces().find((s) => s.active); }
  path() { const s = this.space(); return s?.folder ? pathFor(`${appHome()}/data`, s.folder) : null; }

  load(cx) {
    const p = this.path();
    if (!p) return;
    cx.spawn(async (cx) => { const md = await readTextFile(p); if (md !== this.md) { this.md = md; cx.notify(); } });
  }

  start(cx) {
    const s = this.space(), p = this.path();
    if (parse(this.md).filter((t) => t.id !== "fin").length === 0) { this.msg = "No list: ask the agent to write it (herdr-tasks skill)."; return cx.notify(); }
    cx.spawn(async (cx) => {
      await exec("mkdir", ["-p", p.slice(0, p.lastIndexOf("/"))]);
      const now = await readTextFile(p), next = withFinal(now);
      if (next !== now) await writeTextFile(p, next, now);
      setShared("factory.tasks", { ...(shared("factory.tasks") ?? {}), [s.folder]: { on: true, space: s.id, laps: 0, kick: true, reason: "" } });
      this.msg = ""; this.load(cx); cx.notify();
    });
  }

  stop() {
    const s = this.space(), all = shared("factory.tasks") ?? {};
    setShared("factory.tasks", { ...all, [s.folder]: { ...all[s.folder], on: false, kick: false, reason: "detenido" } });
  }

  render() {
    const t = theme(), s = this.space();
    const tasks = parse(this.md), loop = (shared("factory.tasks") ?? {})[s?.folder] ?? {};
    const { done, total } = count(tasks);
    const btn = (id, label, onClick) => div().id(id).flex_none().px(10).py(4).rounded(6).cursor_pointer().text_size(12).bg(t.selected).text_color(t.foreground).hover((x) => x.bg(t.hover)).on_click((_e, cx) => onClick(cx)).child(label);
    return v_flex().size_full().p(18).gap(12).bg(t.popover).text_size(13).text_color(t.foreground)
      .child(h_flex().items_center().gap(10)
        .child(div().flex_1().text_size(15).font_semibold().child(`Tasks · ${s?.name ?? ""}`))
        .child(div().text_color(t.dim).child(total ? `${done}/${total}` : "no list"))
        .child(loop.on ? btn("stop", "Stop loop", () => this.stop()) : btn("start", "Start loop", (cx) => this.start(cx))))
      .child(div().text_size(12).text_color(t.dim).child(loop.on ? `loop on · lap ${loop.laps}` : loop.reason ? `loop stopped: ${loop.reason}` : "loop off"))
      .when(this.msg, (el) => el.child(div().text_size(12).text_color(t.blocked).child(this.msg)))
      .child(v_flex().id("tasks").flex_1().min_h(0).gap(4).overflow_y_scrollbar().children(tasks.map((k) =>
        v_flex().id(`task-${k.id}`).px(8).py(4).rounded(6).child(h_flex().gap(8)
          .child(div().w(14).flex_none().text_color(k.status === "blocked" ? t.blocked : k.status === "done" ? t.done : t.dim).child(GLYPH[k.status]))
          .child(div().w(36).flex_none().text_color(t.dim).child(k.id))
          .child(div().flex_1().min_w(0).truncate().child(k.title)))
          .when(k.why, (el) => el.child(div().pl(58).text_size(12).text_color(t.blocked).child(k.why))))))
      .child(div().text_size(11).text_color(t.dim).truncate().child(this.path() ?? ""));
  }
}
