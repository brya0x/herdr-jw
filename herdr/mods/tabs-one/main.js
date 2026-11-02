import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, panes, setAgentOrder, nextCommand, run, hc, exec, notify, watchFolder, openOverlay, readTextFile, appHome, theme, window, shared, setShared, layout, settings, focused } from "herdr";
import { parse, pick, count, prompt, pathFor, MAX_LAPS } from "./tasks-lib.js";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export default class Tabs extends View {
  init(_props, cx) {
    this.prev = {}; this.counts = {};
    // keys.json: "cmd-shift-v": "tabs-one.repos" opens (or focuses) the repos panel of a factory workspace.
    cx.spawn(async () => {
      for (;;) {
        if ((await nextCommand()) !== "repos") continue;
        const sp = spaces().find((w) => w.active);
        if (!sp?.folder || (await readTextFile(`${sp.folder}/.factory.json`)) === null) continue;
        const open = panes().find((p) => p.mod === "factory" && sp.tabs.some((t) => t.id === p.tab));
        if (open) run("pane.focus", { pane: open.pane });
        else run("pane.split", { direction: "right", mod: "factory", props: { view: "repos", folder: sp.folder } });
      }
    });
    cx.timer.every(2000, (cx) => this.tick(cx));
    cx.timer.every(3000, (cx) => this.followSystem(cx));
    // An agent published an artifact (artifacts-jw): a toast that opens the panel. artifact.js writes meta.json last.
    cx.spawn(async () => {
      const dir = `${appHome()}/data/artifacts`;
      try {
        await exec("mkdir", ["-p", dir]);
        for (;;) {
          for (const f of await watchFolder(dir)) {
            if (!f.endsWith("/meta.json")) continue;
            const m = JSON.parse((await readTextFile(f)) ?? "null");
            if (m) notify({ title: `Artifact: ${m.title}`, body: `${m.kind} · ${m.space.name}`, action: { name: "mod.open", args: { name: "artifacts-jw" } } });
          }
        }
      } catch { /* no artifacts folder to watch */ }
    });
    this.panels = JSON.parse(localStorage.getItem("panels") ?? "{}");
  }

  // The side panel is remembered per space: switching shows that space's choice
  // (closed if it never had one), and opening or closing it records it.
  syncPanel(space, panel, body, enabled) {
    if (!space || !panel) return;
    const now = panel.hidden ? null : body?.active ?? null;
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id; this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        const stored = this.panels[space.id] ?? null, want = enabled.includes(stored) ? stored : null;
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) { run("layout.select", { stack: "panel-body", child: want }); run("layout.show", { id: "panel" }); }
          else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    // Until the restore lands (or something else won), the old state isn't a choice.
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (this.panels[space.id] === now) return;
    this.panels[space.id] = now;
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  // The task loop: when an agent ends a turn (working -> idle/done) in a space whose loop is on, give it the next task.
  // shortcut: a turn shorter than the 2 s poll is missed and stalls the loop, turn the loop off and on to kick it.
  // Theme mode "system" (jw-settings): Herdr flips light/dark by itself; Claude Code's theme follows when it does (and once at start).
  followSystem(cx) {
    const hex = (theme().background ?? "#000000").slice(1);
    const light = [0, 2, 4].reduce((n, i) => n + parseInt(hex.slice(i, i + 2), 16), 0) / 3 > 127;
    if (light === this.light) return;
    this.light = light;
    cx.spawn(async () => {
      try {
        const dir = `${appHome()}/data`;
        if (JSON.parse((await readTextFile(`${dir}/jw-theme.json`)) ?? "{}").mode === "system") await exec("python3", [`${dir}/jw-themes/use.py`, "apply"]);
      } catch { /* no jw themes installed, or no state yet */ }
    });
  }

  tick(cx) {
    if (this.busy) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        const data = `${appHome()}/data`;
        for (const sp of spaces()) {
          const ag = agents().find((a) => a.space === sp.id && a.program?.agent);
          const was = this.prev[sp.id]; this.prev[sp.id] = ag?.status;
          const st = (shared("factory.tasks") ?? {})[sp.folder];
          const mine = st?.on && st.space === sp.id; // spaces can share a folder: only the one that started the loop gets its tasks
          if (!sp.folder || !(sp.active || mine)) continue;
          const path = pathFor(data, sp.folder), tasks = parse(await readTextFile(path));
          this.counts[sp.folder] = count(tasks);
          if (!mine || !ag || !["idle", "done"].includes(ag.status) || !(st.kick || was === "working")) continue;
          const set = (v) => setShared("factory.tasks", { ...(shared("factory.tasks") ?? {}), [sp.folder]: { ...st, ...v } });
          const next = pick(tasks);
          if (next.stop) set({ on: false, kick: false, reason: next.stop });
          else if (st.laps >= MAX_LAPS) set({ on: false, kick: false, reason: "se acabaron las vueltas" });
          else {
            set({ laps: st.laps + 1, kick: false });
            const r = await hc(["send", ag.address, prompt(next.task, path)]);
            if (r.code !== 0) set({ laps: st.laps + 1, on: false, kick: false, reason: "hc send falló" });
          }
        }
      } finally { this.busy = false; }
    });
  }

  render() {
    const t = theme();
    const space = spaces().find(p => p.active);
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, label, action) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(label);
    const root = layout(), sidebar = find(root, "sidebar"), w = window();
    // Old saved rails and a dragged-narrow sidebar can be smaller than the window buttons.
    const lightsPadding = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? Math.max(10, (root.traffic_lights[0] + 64) / settings().zoom - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0))
      : 10;
    // cmd-] / cmd-[ follow the sidebar: spaces in list order, each one's agents in model order.
    setAgentOrder(spaces().flatMap((sp) => agents().filter((a) => a.space === sp.id).map((a) => a.address)));
    const loop = (shared("factory.tasks") ?? {})[space?.folder];
    const panel = find(root, "panel"), body = find(root, "panel-body");
    const enabled = shared("jw.buttons") ?? ["diff"]; // the Diff button is on; Files and Changes are off unless cmd-shift-, > Paneles turns them on
    this.syncPanel(space, panel, body, enabled);
    const barButton = (id, label, icon, on, click) => h_flex().id(`panel-${id}`).h(26).px(8).gap(5).flex_none().items_center().rounded(6)
      .text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
      .hover(s => s.bg(t.hover)).on_mouse_down("left", stop).on_click(click).child(svg(icon).size(14)).child(label);
    const panelButton = (id, label, icon) => {
      const on = panel && !panel.hidden && body?.active === id;
      return barButton(id, label, icon, on, () => {
        if (on) run("layout.hide", { id: "panel" });
        else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
      });
    };
    // Diff: a terminal pane beside the focused one that runs the diff viewer (data/jw-diff/diff.js, installed by sync.sh); again closes it.
    // The viewer names its terminal "jw diff", which is how it is found.
    const diffPane = () => panes().find((p) => p.tab === focused()?.tab && p.title === "jw diff");
    const diffButton = () => barButton("diff", "Diff", "mods/tabs-one/diff.svg", Boolean(diffPane()), () => {
      const open = diffPane();
      if (open) return run("pane.close", { pane: open.pane });
      const f = focused();
      run("pane.split", { direction: "right", ...(f?.pane ? { pane: f.pane } : {}),
        argv: ["/bin/zsh", "-lic", 'exec bun "$@"', "zsh", `${appHome()}/data/jw-diff/diff.js`, "--cwd", f?.cwd || space?.folder || ""] });
    });
    return h_flex().size_full().min_w(0).px(10).pl(lightsPadding).gap(3).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .child(div().id("space-name").flex_1().min_w(0).truncate().text_size(12.8).text_color(t.muted).child(space?.name ?? ""))
      .when(Boolean(this.counts[space?.folder]?.total || loop?.on), el => el.child(h_flex().id("tasks-chip").h(26).px(8).gap(4).flex_none().items_center().rounded(6).text_size(12).text_color(t.muted)
        .hover(s => s.bg(t.hover)).on_mouse_down("left", stop)
        .on_click(() => openOverlay({ mod: "factory-tasks", kind: "dialog", width: 640, height: 520 }))
        .child(`${loop?.on ? "⟳ " : ""}${this.counts[space?.folder]?.done ?? 0}/${this.counts[space?.folder]?.total ?? 0}`)))
      .when(enabled.includes("diff"), el => el.child(diffButton()))
      .when(enabled.includes("files"), el => el.child(panelButton("files", "Files", "mods/files/file.svg")))
      .when(enabled.includes("changes"), el => el.child(panelButton("changes", "Changes", "mods/changes/changes.svg")))
      .when(w?.buttons, el => el.child(button("minimize", w.platform === "windows" ? svg("mods/tabs-one/win-min.svg").size(16) : "−", () => run("window.minimize")))
        .child(button("maximize", w.platform === "windows" ? svg(`mods/tabs-one/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16) : "□", () => run("window.maximize")))
        .child(button("close-window", w.platform === "windows" ? svg("mods/tabs-one/win-close.svg").size(16) : svg("mods/pane/close.svg").size(13), () => run("window.close"))));
  }
}
