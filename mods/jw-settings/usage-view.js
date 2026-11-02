// Section "Costos": what the person's claude has cost, per project and per week, read from its transcripts by usage.py.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, theme, appHome, home } from "herdr";

const fmt = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}G` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));
const money = (n) => `$${n >= 100 ? n.toFixed(0) : n.toFixed(2)}`;
const PERIODS = [["week", "semana"], ["4w", "4 semanas"], ["all", "todo"]];
const sum = (rows) => rows.reduce((a, r) => ({ input: a.input + r.input, cache_read: a.cache_read + r.cache_read, output: a.output + r.output, cost: a.cost + (r.cost ?? 0), unrated: a.unrated || r.cost === undefined }), { input: 0, cache_read: 0, output: 0, cost: 0, unrated: false });

export class UsageSection {
  start(cx) {
    this.data = undefined;
    this.error = "";
    this.period = "4w";
    this.metric = "tokens";
    this.project = null; // null: all
    this.load(cx);
  }

  load(cx) {
    this.error = "";
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const r = await exec("python3", ["-I", `${appHome()}/mods/jw-settings/usage.py`]);
        if (r.code !== 0) throw new Error(r.stderr.split("\n").filter(Boolean).pop() || "usage.py falló");
        this.data = JSON.parse(r.stdout);
      } catch (e) { this.error = String(e?.message ?? e); }
      cx.notify();
    });
  }

  btn(id, label, on, onClick) {
    const t = theme();
    return div().id(id).flex_none().px(8).py(2).rounded(5).cursor_pointer().text_size(12).text_color(on ? t.foreground : t.dim)
      .when(on, (el) => el.bg(t.selected)).when(!on, (el) => el.hover((s) => s.bg(t.hover))).on_click((_e, cx) => onClick(cx)).child(label);
  }

  key() { return false; }

  render() {
    const t = theme();
    const d = this.data;
    const cost = this.metric === "cost";
    const head = h_flex().gap(4).items_center()
      .child(div().flex_1().font_semibold().text_color(t.foreground).child("Uso de claude"))
      .children(PERIODS.map(([k, l]) => this.btn(`p-${k}`, l, this.period === k, (cx) => { this.period = k; cx.notify(); })))
      .child(div().w(8))
      .child(this.btn("m-tokens", "tokens", !cost, (cx) => { this.metric = "tokens"; cx.notify(); }))
      .child(this.btn("m-cost", "costo", cost, (cx) => { this.metric = "cost"; cx.notify(); }))
      .child(this.btn("reload", "↻", false, (cx) => this.load(cx)));
    const root = v_flex().id("jw-usage").size_full().p(16).gap(10).child(head);
    if (this.error) return root.child(div().text_color(t.blocked).child(this.error));
    if (!d) return root.child(div().text_color(t.muted).child("leyendo los transcripts… (la primera vez tarda unos segundos)"));

    const inPeriod = (r) => this.period === "all" || (this.period === "week" ? r.week === d.current : d.last4.includes(r.week));
    const rows = d.rows.filter(inPeriod);
    const byProject = new Map();
    for (const r of rows) byProject.set(r.project, [...(byProject.get(r.project) ?? []), r]);
    const projects = [...byProject].map(([p, rs]) => ({ p, ...sum(rs) })).sort((a, b) => (b.input + b.output + b.cache_read) - (a.input + a.output + a.cache_read));
    const all = sum(rows);
    const shown = (s) => (cost ? (s.cost || s.unrated ? `${s.cost ? "~" + money(s.cost) : ""}${s.unrated ? " sin tarifa" : ""}`.trim() : money(0)) : fmt(s.input + s.cache_read + s.output));
    const tilde = (p) => (p.startsWith(home()) ? `~${p.slice(home().length)}` : p);
    const num = (v, w = 70) => div().flex_none().w(w).text_right().text_color(t.muted).child(v);

    const line = (id, label, s, sel, onClick) => h_flex().id(id).flex_none().h(26).px(8).gap(8).items_center().rounded(5)
      .when(sel, (el) => el.bg(t.selected)).when(Boolean(onClick) && !sel, (el) => el.hover((x) => x.bg(t.hover)).cursor_pointer())
      .on_click((_e, cx) => onClick?.(cx))
      .child(div().flex_1().min_w(0).truncate().text_color(sel ? t.foreground : t.muted).child(label))
      .child(num(fmt(s.input))).child(num(fmt(s.cache_read))).child(num(fmt(s.output))).child(num(s.unrated && !s.cost ? "sin tarifa" : s.cost ? `${s.unrated ? "+" : "~"}${money(s.cost)}` : "—", 96));
    const table = v_flex().id("usage-projects").flex_1().min_h(0).overflow_y_scroll()
      .child(h_flex().h(22).px(8).gap(8).text_size(11).text_color(t.dim).child(div().flex_1().child("proyecto (carpeta de trabajo)")).child(num("entrada")).child(num("caché")).child(num("salida")).child(num("costo", 96)))
      .child(line("pr-all", `todos (${projects.length})`, all, this.project === null, (cx) => { this.project = null; cx.notify(); }))
      .children(projects.map((s, i) => line(`pr-${i}`, tilde(s.p), s, this.project === s.p, (cx) => { this.project = s.p; cx.notify(); })));

    const weeks = d.weeks.slice(-12);
    const wk = weeks.map((w) => ({ w, ...sum(d.rows.filter((r) => r.week === w && (this.project === null || r.project === this.project))) }));
    const val = (s) => (cost ? s.cost : s.input + s.cache_read + s.output);
    const max = Math.max(1, ...wk.map(val));
    const chart = v_flex().gap(3).child(div().text_size(11).text_color(t.dim).child(`${cost ? "costo estimado" : "tokens (entrada + caché + salida)"} por semana · ${this.project === null ? "todos" : tilde(this.project)}`))
      .children(wk.map((s) => h_flex().gap(8).items_center().h(16)
        .child(div().flex_none().w(64).text_size(11).text_color(s.w === d.current ? t.accent : t.dim).child(s.w))
        .child(div().h(10).rounded(2).bg(t.accent).w(Math.max(val(s) > 0 ? 2 : 0, Math.round((val(s) / max) * 520))))
        .child(div().text_size(11).text_color(t.muted).child(cost ? (s.cost ? "~" + money(s.cost) : s.unrated ? "sin tarifa" : "—") : fmt(val(s))))));
    const note = d.unrated.length
      ? `Sin tarifa para: ${d.unrated.join(", ")}. Escríbelas (USD por millón de tokens) en ~/.config/herdr-app/data/factory-rates.json, por ejemplo {"opus": {"input": …, "cache_read": …, "output": …}}. El costo es una estimación, no la factura.`
      : "El costo es una estimación con tus tarifas, no la factura.";
    return root.child(table).child(chart).child(div().text_size(11).text_color(t.dim).child(note));
  }
}
