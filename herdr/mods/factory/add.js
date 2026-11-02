import { div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Scrollbar } from "gpui-base";
import { props, theme, exec, shared, setShared, pickFolder } from "herdr";
import { addRepo, base } from "./lib.js";
import { btn } from "./ui.js";

// The picker of repos: GitHub (gh repo list <owner>) or a folder of this computer. A click adds it and keeps the dialog open.
export class Add {
  init(cx) {
    this.folder = props().folder;
    this.tab = "gh";
    this.list = undefined; // undefined: reading
    this.error = "";
    this.added = new Set();
    this.owner = InputState.new({ value: shared("factory.owner") ?? "", placeholder: "organization or user (empty: your repos)" });
    this.owner.on("submit", (_e, cx) => this.load(cx));
    this.filter = InputState.new({ value: "", placeholder: "filtrar" });
    this.filter.on("change", (_e, cx) => cx.notify());
    this.filter.focus();
    cx.timer.after(600, () => this.filter.focus());
    this.load(cx);
  }

  load(cx) {
    this.list = undefined;
    this.error = "";
    cx.notify();
    cx.spawn(async (cx) => {
      const owner = this.owner.value().trim();
      try {
        const r = await exec("gh", ["repo", "list", ...(owner ? [owner] : []), "--json", "nameWithOwner,isPrivate", "--limit", "200"]);
        if (r.code !== 0) throw new Error((r.stderr || r.stdout).split("\n").slice(0, 2).join(" "));
        this.list = JSON.parse(r.stdout);
        setShared("factory.owner", owner);
      } catch (e) {
        this.list = [];
        this.error = `gh: ${String(e?.message ?? e)}. You can still add a folder.`;
      }
      cx.notify();
    });
  }

  add(repo, key, cx) {
    this.error = "";
    cx.spawn(async (cx) => {
      try { await addRepo(this.folder, repo); this.added.add(key); }
      catch (e) { this.error = String(e?.message ?? e); }
      cx.notify();
    });
  }

  pickDir(cx) {
    cx.spawn(async (cx) => {
      const path = await pickFolder({ prompt: "Add" });
      if (path) this.add({ kind: "dir", name: base(path), path: path.replace(/\/+$/, "") }, path, cx);
      cx.notify();
    });
  }

  render() {
    const t = theme();
    const tab = (id, label) => div().id(`tab-${id}`).px(8).py(2).rounded(5).cursor_pointer().text_size(12)
      .text_color(this.tab === id ? t.foreground : t.dim).when(this.tab === id, (el) => el.bg(t.selected))
      .on_click((_e, cx) => { this.tab = id; cx.notify(); }).child(label);
    const f = this.filter.value().toLowerCase();
    const rows = (this.list ?? []).filter((r) => !f || r.nameWithOwner.toLowerCase().includes(f));
    const row = (r, i) => {
      const done = this.added.has(r.nameWithOwner);
      return h_flex().id(`gh-${i}`).flex_none().h(30).px(10).gap(8).items_center().rounded(6).cursor_pointer().hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => !done && this.add({ kind: "gh", id: r.nameWithOwner, name: r.nameWithOwner.split("/")[1] }, r.nameWithOwner, cx))
        .child(div().flex_1().min_w(0).truncate().text_color(done ? t.dim : t.foreground).child(r.nameWithOwner))
        .child(div().flex_none().text_size(11).text_color(done ? t.done : t.dim).child(done ? "✓ added" : r.isPrivate ? "private" : "public"));
    };
    return v_flex().id("factory-add").size_full().p(16).gap(10).bg(t.popover).text_size(13)
      .child(h_flex().gap(6).items_center().child(div().flex_1().font_semibold().text_color(t.foreground).child("Add repos")).child(tab("gh", "GitHub")).child(tab("dir", "My computer")))
      .when(this.tab === "gh", (el) => el
        .child(Input.new(this.owner).h(30).px(10).items_center().rounded(6).border(1).border_color(t.input).bg(t.background).text_color(t.foreground))
        .child(Input.new(this.filter).h(30).px(10).items_center().rounded(6).border(1).border_color(t.accent).bg(t.background).text_color(t.foreground))
        .child(div().relative().flex_1().min_h(0)
          .child(v_flex().id("gh-list").size_full().overflow_y_scroll()
            .when(this.list === undefined, (e) => e.child(div().p(10).text_color(t.muted).child("…")))
            .children(rows.map(row))
            .when(this.list && !rows.length && !this.error, (e) => e.child(div().p(10).text_color(t.dim).child("No repo matches that text."))))
          .child(Scrollbar.vertical("gh-list").absolute().inset_0())))
      .when(this.tab === "dir", (el) => el
        .child(div().text_color(t.muted).child("A folder is used where it is: it is linked into the workspace, not copied or moved."))
        .child(h_flex().child(btn("pick-dir", "Pick a folder…", (_e, cx) => this.pickDir(cx), { accent: true }))))
      .when(Boolean(this.error), (el) => el.child(div().text_size(12).text_color(t.blocked).child(this.error)))
      .when(this.tab === "dir" && this.added.size > 0, (el) => el.child(div().text_size(12).text_color(t.done).child(`✓ ${[...this.added].filter((k) => k.startsWith("/")).map(base).join(", ")}`)))
      .child(div().text_size(11).text_color(t.dim).child("click adds · esc closes"));
  }
}
