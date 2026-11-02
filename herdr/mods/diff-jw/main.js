// The Diff pane (the Diff button of the tab bar splits a pane beside the focused one with this mod, so it has a pane's border, focus, zoom
// and swap): what the folder it was opened from has changed, in three views like jw's diff viewer: Sin commit (the working tree against
// HEAD), Rama (the branch against its base) and Commits (one commit's files). Each file can be marked as seen (kept in data/diff-seen.json
// until its change differs). Drawn with Herdr's own look and the terminal font Herdr is set to. Read-only: it never writes under .git.
import { View, div } from "gpui-kit";
import { v_flex, h_flex, Scrollbar, v_virtual_list } from "gpui-base";
import { spaces, panes, focused, exec, readTextFile, writeTextFile, watchFolder, theme, settings, appHome, props, shared, setShared } from "herdr";
import { parseNumstat, parseStatus, parseNameStatus, parseLog, chooseBase, diffRows, signature, seenKey, isSeen, ago } from "./lib.js";

const SCOPES = [["work", "Sin commit"], ["branch", "Rama"], ["commits", "Commits"]];
const MAX_LINES = 1500;

function location() {
  const opened = props()?.cwd; // the folder the pane was opened from: it keeps showing that one, whatever is focused later
  if (opened) return { cwd: opened, on: props()?.on ?? null };
  const space = spaces().find((s) => s.active), f = focused();
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder, on };
}
const key = () => JSON.stringify(location());
// Reads write nothing under .git (no index refresh or lock, no fsmonitor cookie): the folder watch would see it, and every refresh would start the next one.
const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false"];
const SHOW = ["--no-ext-diff", "--no-textconv", "--no-color"];
// The diff is drawn at the size of Herdr's terminals (settings().font_size, in px like a terminal's), so its text matches the panes beside it.
// JetBrains Mono (and most terminal fonts) advance 0.6 em; the row is 1.4 em tall.
const metrics = () => { const size = Number(settings().font_size) || 15; return { size, row: Math.ceil(size * 1.4), cw: size * 0.6, gutter: Math.ceil(size * 0.6 * 4) + 8 }; };
const countLines = (text) => text ? text.split("\n").length - Number(text.endsWith("\n")) : 0;

export default class Diff extends View {
  init(_props, cx) {
    this.scope = "work"; this.commit = null; this.commits = []; this.files = []; this.rows = []; this.diffWidth = 0;
    this.base = null; this.marks = {}; this.handle = cx.focus_handle();
    this.marksFile = `${appHome()}/data/diff-seen.json`;
    cx.spawn(async (cx) => {
      try { this.marks = JSON.parse((await readTextFile(this.marksFile)) ?? "{}"); } catch { this.marks = {}; }
      cx.notify();
    });
    this.refresh(cx);
    cx.timer.every(10000, (cx) => this.refresh(cx));
  }

  watch(root, cx) {
    if (this.on || this.watched === root) return;
    this.watched = root;
    cx.spawn(async (cx) => {
      try { while (this.watched === root) { await watchFolder(root); if (this.watched === root) this.refresh(cx); } }
      catch { this.watched = null; }
    });
  }

  reset() { this.commit = null; this.commits = []; this.files = []; this.open = null; this.closed = false; this.setLines([]); this.note = null; this.error = null; }

  refresh(cx) {
    if (this.loading) return;
    const { cwd, on } = location(), context = key();
    if (context !== this.context) { this.context = context; this.root = null; this.watched = null; this.reset(); }
    if (!cwd) return;
    const scope = this.scope, commit = this.commit;
    this.loading = true;
    cx.spawn(async (cx) => {
      try {
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on });
        if (key() !== context) return;
        if (top.code !== 0) { this.root = null; this.reset(); this.error = "No es un repositorio git"; return; }
        const root = top.stdout.trim(), git = (args) => exec("git", [...READ, ...args], { cwd: root, on });
        const refs = (await git(["for-each-ref", "--format=%(refname:short)", "refs/heads", "refs/remotes"])).stdout.split("\n").filter(Boolean);
        const originHead = (await git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"])).stdout.trim();
        const base = chooseBase(refs, originHead || null);
        const head = await git(["rev-parse", "--verify", "HEAD"]);
        const stat = async (numstat, names) => {
          const [n, s] = [await numstat, await names];
          if (n.code !== 0) throw new Error(n.stderr);
          const stats = parseNumstat(n.stdout);
          return (names ? parseNameStatus(s.stdout) : []).map((f) => ({ ...f, add: 0, del: 0, ...stats[f.path] }));
        };
        let files = [], commits = this.commits, limited = false, hint = null;
        if (scope === "work") {
          const status = await git(["status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"]);
          if (status.code !== 0) throw new Error(status.stderr);
          const stats = {};
          const runs = head.code === 0 ? [await git(["diff", "HEAD", "--numstat", "-z", "--no-renames"])] : [await git(["diff", "--cached", "--numstat", "-z", "--no-renames"]), await git(["diff", "--numstat", "-z", "--no-renames"])];
          for (const r of runs) { if (r.code !== 0) throw new Error(r.stderr); for (const [p, v] of Object.entries(parseNumstat(r.stdout))) { const o = stats[p] ?? { add: 0, del: 0 }; stats[p] = { add: o.add + v.add, del: o.del + v.del, binary: v.binary }; } }
          const all = parseStatus(status.stdout); limited = all.length > 1000;
          files = all.slice(0, 1000).map((f) => ({ ...f, add: 0, del: 0, ...stats[f.path] }));
        } else if (scope === "branch") {
          if (!base) hint = "No encuentro la rama base (origin/main, main…)";
          else {
            const mb = (await git(["merge-base", base, "HEAD"])).stdout.trim() || base;
            files = await stat(git(["diff", mb, "--numstat", "-z", "--no-renames"]), git(["diff", mb, "--name-status", "-z", "--no-renames"]));
          }
        } else if (commit) {
          files = await stat(git(["show", "--numstat", "--format=", "-z", "--no-renames", commit.sha]), git(["show", "--name-status", "--format=", "-z", "--no-renames", commit.sha]));
        } else {
          const r = await git(["log", "--format=%H%x1f%h%x1f%s%x1f%ct", "-n", "60", ...(base ? [`${base}..HEAD`] : ["HEAD"])]);
          commits = r.code === 0 ? parseLog(r.stdout) : [];
          if (!commits.length) hint = base ? `Sin commits nuevos sobre ${base}` : "Sin commits";
        }
        if (key() !== context || scope !== this.scope || commit !== this.commit) return;
        this.root = root; this.on = on; this.hasHead = head.code === 0; this.base = base; this.files = files; this.commits = commits; this.limited = limited; this.hint = hint; this.error = null;
        this.watch(root, cx);
        if (this.open && !files.some((f) => f.path === this.open)) { this.open = null; this.setLines([]); }
        if (!this.open && !this.closed && files.length) this.open = files[0].path; // the first file's diff shows until you pick another
        if (this.open) { try { await this.load(this.open, context); } catch { if (key() === context) this.setLines(["No se puede mostrar este diff (muy grande o ilegible)"]); } }
      } catch (e) { if (key() === context) this.error = String(e); }
      finally { this.loading = false; cx.notify(); }
    });
  }

  async load(path, context) {
    const file = this.files.find((f) => f.path === path), { root, on, scope, commit } = this;
    if (!file) return;
    let lines;
    if (scope === "work" && (file.fresh || (!this.hasHead && file.status === "A"))) {
      const text = await readTextFile(`${root}/${path}`, { on }).catch(() => null);
      if (text === null) lines = ["No se puede mostrar este archivo (binario, muy grande o ilegible)"];
      else if (text.includes("\0")) lines = ["Archivo binario · sin diff de texto"];
      else {
        file.add = countLines(text);
        lines = [`@@ -0,0 +1,${file.add} @@`, ...text.slice(0, 400000).replace(/\n$/, "").split("\n").slice(0, MAX_LINES).map((l) => `+${l}`)];
      }
    } else {
      const args = scope === "commits" ? ["show", ...SHOW, "--format=", commit.sha, "--", path]
        : scope === "branch" ? ["diff", (await exec("git", [...READ, "merge-base", this.base, "HEAD"], { cwd: root, on })).stdout.trim() || this.base, ...SHOW, "--", path]
        : ["diff", ...(this.hasHead ? ["HEAD"] : []), ...SHOW, "--", path];
      const r = await exec("git", [...READ, ...args], { cwd: root, on });
      if (r.code !== 0) throw new Error(r.stderr);
      const all = r.stdout.replace(/\n$/, "").split("\n"), first = all.findIndex((l) => l.startsWith("@@"));
      lines = first < 0 ? [file.binary ? "Archivo binario cambiado" : "Sin diff de texto"] : all.slice(first);
    }
    if (key() === context && this.open === path) this.setLines(lines.slice(0, MAX_LINES).map((l) => (l.length > 4000 ? l.slice(0, 4000) + "… (línea cortada)" : l)));
  }

  setLines(lines) {
    this.rows = diffRows(lines);
    const { cw, gutter } = metrics();
    this.diffWidth = Math.max(300, ...lines.map((l) => l.length * cw + gutter + 40));
  }

  pick(path, cx) {
    this.open = this.open === path ? null : path; this.setLines([]); this.note = null; this.closed = !this.open;
    const context = this.context;
    if (this.open) cx.spawn(async (cx) => {
      try { await this.load(path, context); } catch (e) { if (key() === context && this.open === path) this.note = `No se puede mostrar este diff: ${e}`; }
      cx.notify();
    });
    cx.notify();
  }

  go(scope, commit, cx) {
    this.scope = scope; this.commit = commit; this.files = []; this.open = null; this.closed = false; this.setLines([]); this.note = null; this.hint = null;
    this.loading = false; this.refresh(cx); cx.notify();
  }

  scopeKey() { return this.scope === "commits" && this.commit ? `commit:${this.commit.sha}` : this.scope; }

  toggleSeen(f, cx) {
    const k = seenKey(this.root, this.scopeKey(), f.path);
    if (isSeen(this.marks, this.root, this.scopeKey(), f)) delete this.marks[k]; else this.marks[k] = signature(f);
    cx.notify();
    cx.spawn(async () => {
      try { await writeTextFile(this.marksFile, JSON.stringify(this.marks), await readTextFile(this.marksFile)); }
      catch { this.note = "No se pudo guardar la marca de visto"; }
    });
  }

  diffRow({ kind, number, text }, t) {
    const { row, gutter } = metrics();
    if (kind === "@") return div().w_full().px(12).h(row).flex_none().truncate().bg(t.raised).text_color(t.dim).child(text);
    return h_flex().w_full().h(row).flex_none().gap(10).when(kind === "+", (e) => e.bg(t.ansi2 + "18")).when(kind === "-", (e) => e.bg(t.ansi1 + "18"))
      .child(div().w(gutter).flex_none().text_right().text_color(t.dim).child(number === undefined ? "" : String(number)))
      .child(div().flex_1().min_w(0).truncate().child(text));
  }

  btn(id, label, on, onClick) {
    const t = theme();
    return div().id(id).flex_none().px(8).py(3).rounded(6).cursor_pointer().text_size(12).text_color(on ? t.foreground : t.dim)
      .when(on, (e) => e.bg(t.selected)).when(!on, (e) => e.hover((s) => s.bg(t.hover))).on_click((_e, cx) => onClick(cx)).child(label);
  }

  side() { return shared("jw.diff.side") !== false; } // the file list beside the diff (default) or above it

  fileRow(f, t, side) {
    const parts = f.path.split("/"), name = parts.pop(), seen = isSeen(this.marks, this.root, this.scopeKey(), f);
    const color = f.status === "A" ? t.ansi2 : f.status === "D" || f.status === "U" ? t.ansi1 : t.blocked;
    return h_flex().id(`file-${f.path}`).h(28).flex_none().px(6).gap(6).items_center().rounded(7).when(this.open === f.path, (e) => e.bg(t.selected)).hover((s) => s.bg(t.hover))
      .child(div().id(`seen-${f.path}`).flex_none().w(16).h(16).rounded(4).flex().items_center().justify_center().cursor_pointer().border_1().border_color(seen ? t.accent : t.border)
        .when(seen, (e) => e.bg(t.accent).text_color(t.accent_foreground).text_size(11).child("✓")).on_click((_e, cx) => this.toggleSeen(f, cx)))
      .child(h_flex().id(`open-${f.path}`).flex_1().min_w(0).h_full().gap(8).items_center().cursor_pointer().on_click((_e, cx) => this.pick(f.path, cx))
        .child(div().w(14).flex_none().text_size(11).text_color(color).child(f.status))
        .child(side
          ? h_flex().flex_1().min_w(0).gap(6).text_color(seen ? t.dim : t.foreground).child(div().min_w(0).truncate().child(name)).child(div().flex_1().min_w(0).text_color(t.dim).truncate().text_size(11).child(parts.join("/")))
          : h_flex().flex_1().min_w(0).text_color(seen ? t.dim : t.foreground).child(div().text_color(t.dim).truncate().child(parts.length ? parts.join("/") + "/" : "")).child(div().min_w(0).truncate().child(name)))
        .when(f.add > 0, (e) => e.child(div().text_size(11).text_color(t.ansi2).child(`+${f.add}`)))
        .when(f.del > 0, (e) => e.child(div().text_size(11).text_color(t.ansi1).child(`−${f.del}`))));
  }

  render(cx) {
    if (key() !== this.context) this.refresh(cx);
    const t = theme(), add = this.files.reduce((n, f) => n + f.add, 0), del = this.files.reduce((n, f) => n + f.del, 0);
    const seenCount = this.files.filter((f) => isSeen(this.marks, this.root, this.scopeKey(), f)).length;
    const inCommitList = this.scope === "commits" && !this.commit;
    const head = v_flex().flex_none().border_b(1).border_color(t.border)
      .child(h_flex().h(42).px(14).gap(8).items_center()
        .child(div().font_semibold().child("Diff"))
        .when(this.base && this.scope !== "work", (e) => e.child(div().px(5).py(1).rounded(4).border_1().border_color(t.border).text_size(10).text_color(t.muted).child(`contra ${this.base}`)))
        .child(div().flex_1())
        .when(!inCommitList && this.files.length > 0, (e) => e.child(div().text_size(11).text_color(t.dim).child(`${seenCount}/${this.files.length} vistos`)))
        .child(div().text_size(11).text_color(t.ansi2).child(`+${add}`)).child(div().text_size(11).text_color(t.ansi1).child(`−${del}`))
        .when(!inCommitList, (e) => e.child(this.btn("layout", this.side() ? "▥" : "▤", false, (cx) => { setShared("jw.diff.side", !this.side()); cx.notify(); })))
        .child(this.btn("refresh", "↻", false, (cx) => { this.loading = false; this.refresh(cx); })))
      .child(h_flex().px(10).pb(8).gap(2).children(SCOPES.map(([k, l]) => this.btn(`scope-${k}`, l, this.scope === k, (cx) => this.go(k, null, cx)))));
    const empty = this.error || this.hint || (this.loading ? "Leyendo cambios…" : this.root ? "Sin cambios" : "Sin carpeta");
    const body = inCommitList
      ? v_flex().id("diff-commits").flex_1().min_h(0).overflow_y_scrollbar().p(6).children(this.commits.map((c) =>
          h_flex().id(`commit-${c.sha}`).h(30).flex_none().px(8).gap(10).items_center().rounded(7).cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.go("commits", c, cx))
            .child(div().w(54).flex_none().text_size(11).text_color(t.accent).child(c.short))
            .child(div().flex_1().min_w(0).truncate().child(c.subject))
            .child(div().flex_none().text_size(11).text_color(t.dim).child(ago(c.time)))))
        .when(!this.commits.length, (e) => e.child(div().p(8).text_color(t.dim).child(empty)))
      : (() => {
        const side = this.side();
        const commitHead = this.scope === "commits" && this.commit
          ? h_flex().flex_none().h(32).px(10).gap(8).items_center().border_b(1).border_color(t.border)
            .child(this.btn("back", "‹ commits", false, (cx) => this.go("commits", null, cx)))
            .child(div().text_size(11).text_color(t.accent).child(this.commit.short)).child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.muted).child(side ? "" : this.commit.subject))
          : null;
        const list = v_flex().id("diff-files").overflow_y_scrollbar().p(6)
          .when(side, (e) => e.flex_1().min_h(0)).when(!side, (e) => e.flex_none().h(Math.min(200, Math.max(44, this.files.length * 28 + 12))).border_b(1).border_color(t.border))
          .children(this.files.map((f) => this.fileRow(f, t, side))).when(!this.files.length, (e) => e.child(div().p(8).text_color(t.dim).child(empty)));
        const limited = this.limited ? div().px(12).py(4).text_size(11).text_color(t.dim).child("Mostrando los primeros 1.000 archivos") : null;
        const diff = div().flex_1().min_h(0).min_w(0).h_full().relative().font_family(settings().font_family ?? "JetBrains Mono").text_size(metrics().size)
          .child(div().id("diff-x").size_full().overflow_x_scrollbar()
            .child(div().w_full().min_w(this.diffWidth).h_full().child(v_virtual_list("diff-rows", this.rows.length, metrics().row, (i) => String(i),
              (range) => this.rows.slice(range.start, range.end).map((row) => this.diffRow(row, t))).size_full())))
          .child(Scrollbar.vertical("diff-rows").viewport_from_layout().absolute().inset_0())
          .when(!this.open && this.files.length > 0, (e) => e.child(div().absolute().top(6).px(12).text_color(t.dim).child("Elige un archivo para ver sus cambios")));
        if (!side) return v_flex().flex_1().min_h(0).when(Boolean(commitHead), (e) => e.child(commitHead)).child(list).when(Boolean(limited), (e) => e.child(limited)).child(diff);
        return h_flex().flex_1().min_h(0)
          .child(v_flex().flex_none().w(Math.max(240, Math.round(metrics().size * 22))).h_full().min_h(0).border_r(1).border_color(t.border)
            .when(Boolean(commitHead), (e) => e.child(commitHead)).child(list).when(Boolean(limited), (e) => e.child(limited)))
          .child(diff);
      })();
    return v_flex().id("diff-jw").size_full().min_h(0).overflow_hidden().bg(t.background).text_color(t.foreground).text_size(13).track_focus(this.handle)
      .child(head).child(body)
      .when(Boolean(this.note), (e) => e.child(div().px(10).pb(8).text_size(11).text_color(t.ansi1).child(this.note)));
  }
}
