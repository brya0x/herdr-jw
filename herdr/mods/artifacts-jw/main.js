// cmd-shift-a: what the agents published with artifact.js (see there). A row opens: Open (the file, in the system's app),
// Approve, Request changes (with a note). The agent's `artifact wait` returns when you decide. Pending ones come first.
import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Scrollbar } from "gpui-base";
import { exec, theme, props, closeOverlay, appHome, readTextFile, writeTextFile, watchFolder } from "herdr";
import { latest, statusOf, verdictFile, versionFile } from "./lib.js";

const ROOT = () => `${appHome()}/data/artifacts`;

export default class Artifacts extends View {
  init(_props, cx) {
    this.list = undefined; this.open = null; this.asking = false;
    this.note = ""; this.input = InputState.new({ value: "", placeholder: "what would you change" });
    this.input.on("change", (_e, cx) => { this.note = this.input.value(); cx.notify(); });
    this.input.on("submit", (_e, cx) => this.decide("changes", cx));
    this.handle = cx.focus_handle();
    cx.spawn(async (cx) => {
      await exec("mkdir", ["-p", ROOT()]);
      for (;;) { await this.load(); cx.notify(); this.handle.focus(); await watchFolder(ROOT()); }
    });
  }

  async load() {
    const ls = await exec("sh", ["-c", 'for f in "$1"/*/*/meta.json; do [ -f "$f" ] && echo "$f"; done', "sh", ROOT()]);
    const out = [];
    for (const f of ls.stdout.split("\n").filter(Boolean)) {
      try {
        const dir = f.slice(0, -"/meta.json".length), meta = JSON.parse(await readTextFile(f));
        out.push({ dir, meta, v: latest(meta), verdict: JSON.parse((await readTextFile(verdictFile(dir, latest(meta).n))) ?? "null") });
      } catch { /* half-written: the next change reloads it */ }
    }
    const rank = (a) => (a.verdict ? 1 : 0);
    this.list = out.sort((a, b) => rank(a) - rank(b) || b.v.ts.localeCompare(a.v.ts));
  }

  current() { return (this.list ?? []).find((a) => a.dir === this.open); }

  decide(verdict, cx) {
    const a = this.current();
    if (!a || a.verdict) return;
    if (verdict === "changes" && !this.note.trim()) return;
    // expected null: it only writes if nobody decided that version meanwhile
    writeTextFile(verdictFile(a.dir, a.v.n), JSON.stringify({ verdict, note: verdict === "changes" ? this.note.trim() : "", ts: new Date().toISOString() }), null)
      .then(() => { this.asking = false; this.input.set_value?.(""); this.note = ""; });
  }

  render() {
    const t = theme();
    const tone = { pending: t.blocked, approved: t.done, changes: t.working };
    const btn = (id, label, fn, accent) => div().id(id).flex_none().px(10).py(4).rounded(5).border(1).border_color(accent ? t.accent : t.border).cursor_pointer()
      .text_size(12).text_color(accent ? t.accent : t.muted).hover((s) => s.bg(t.hover)).on_click((_e, cx) => { cx.stop_propagation(); fn(cx); }).child(label);
    const row = (a) => {
      const st = statusOf(a.verdict), on = a.dir === this.open;
      return v_flex().id(`ar-${a.meta.space.id ?? "x"}-${a.meta.id}`).mx(4).px(10).py(8).gap(8).rounded(7).cursor_pointer()
        .when(on, (el) => el.bg(t.raised)).hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => { this.open = on ? null : a.dir; this.asking = false; cx.notify(); })
        .child(h_flex().gap(10).items_center()
          .child(v_flex().flex_1().min_w(0).child(div().truncate().text_color(t.foreground).child(a.meta.title))
            .child(div().truncate().text_size(11.5).text_color(t.dim).child(`${a.meta.kind} · ${a.meta.space.name} · v${a.v.n}`)))
          .child(div().flex_none().text_size(12).text_color(tone[st]).child(st)))
        .when(on, (el) => el
          .when(Boolean(a.verdict?.note), (e) => e.child(div().text_size(12).text_color(t.muted).child(`“${a.verdict.note}”`)))
          .child(h_flex().gap(6)
            .child(btn("ar-open", "Open", () => exec("open", [versionFile(a.dir, a.v)])))
            .when(!a.verdict, (e) => e
              .child(btn("ar-ok", "Approve", (cx) => this.decide("approved", cx), true))
              .child(btn("ar-ch", "Request changes", (cx) => { this.asking = !this.asking; cx.notify(); }))))
          .when(!a.verdict && this.asking, (e) => e.child(h_flex().gap(6).items_center()
            .child(Input.new(this.input).flex_1().h(30).px(10).items_center().rounded(6).border(1).border_color(t.input).bg(t.background).text_color(t.foreground))
            .child(btn("ar-send", "Send", (cx) => this.decide("changes", cx), true)))));
    };
    const list = this.list ?? [];
    return v_flex().id("artifacts").track_focus(this.handle).size_full().p(16).gap(10).bg(t.popover).text_size(13)
      .on_key_down((e, cx) => { if (e.key === "escape") { closeOverlay(props().overlay); cx.stop_propagation(); } })
      .child(h_flex().child(div().flex_1().font_semibold().text_color(t.foreground).child("Artifacts"))
        .child(div().text_size(11).text_color(t.dim).child(this.list ? `${list.filter((a) => !a.verdict).length} pending` : "")))
      .child(div().relative().flex_1().min_h(0)
        .child(v_flex().id("ar-list").size_full().overflow_y_scroll().gap(2).children(list.map(row))
          .when(this.list && !list.length, (el) => el.child(div().p(10).text_color(t.dim).child("Nothing published yet. An agent publishes with: bun ~/.config/herdr-app/mods/artifacts-jw/artifact.js publish <file>"))))
        .child(Scrollbar.vertical("ar-list").absolute().inset_0()))
      .child(h_flex().justify_end().text_size(11).text_color(t.dim).child("esc cierra"));
  }
}
