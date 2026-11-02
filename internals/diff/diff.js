#!/usr/bin/env bun
// bun diff.js [--cwd <folder>]: jw's diff viewer as a program for a terminal pane (the Diff button of the tab bar opens it beside the
// agent). Three views: 1 Sin commit (the working tree against HEAD), 2 Rama (the branch against its base), 3 Commits (pick one for its
// files). Each file can be marked as seen (data/diff-seen.json, until its change differs). It only reads git (no locks, nothing under
// .git) and draws with the terminal's own colours and font, so it follows Herdr's theme and font.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname } from "node:path";
import { parseNumstat, parseStatus, parseNameStatus, parseLog, chooseBase, diffRows, wrapRows, signature, seenKey, isSeen, ago } from "./lib.js";

const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const START = arg("--cwd") || process.cwd();
const APP = process.env.HERDR_APP_HOME ?? `${homedir()}/.config/herdr-app`;
const MARKS = `${APP}/data/diff-seen.json`;
const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false"];
const SHOW = ["--no-ext-diff", "--no-textconv", "--no-color"];
const MAX_LINES = 3000;
export const TITLE = "jw diff"; // what the tab bar looks for to know the viewer is open

const S = {
  scope: "work", commit: null, commits: [], files: [], sel: 0, ltop: 0, dtop: 0, focus: "list", wrap: true,
  root: null, base: null, hasHead: false, marks: {}, error: null, hint: null, lines: [], rows: [], print: "",
};

const git = (...args) => spawnSync("git", [...READ, ...args], { cwd: S.root ?? START, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
const countLines = (text) => (text ? text.split("\n").length - Number(text.endsWith("\n")) : 0);

function loadMarks() { try { S.marks = JSON.parse(readFileSync(MARKS, "utf8")); } catch { S.marks = {}; } }
function saveMarks() { try { mkdirSync(dirname(MARKS), { recursive: true }); writeFileSync(MARKS, JSON.stringify(S.marks)); } catch { S.hint = "No se pudo guardar la marca de visto"; } }
const scopeKey = () => (S.scope === "commits" && S.commit ? `commit:${S.commit.sha}` : S.scope);
const seen = (f) => isSeen(S.marks, S.root, scopeKey(), f);

// Reads what the current view shows: the list (files or commits) and, for the selected file, its diff.
function load() {
  const keep = S.files[S.sel]?.path;
  const top = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: START, encoding: "utf8" });
  if (top.status !== 0) { S.root = null; S.files = []; S.commits = []; S.lines = []; S.rows = []; S.error = "No es un repositorio git"; return; }
  S.root = top.stdout.trim(); S.error = null; S.hint = null;
  const refs = git("for-each-ref", "--format=%(refname:short)", "refs/heads", "refs/remotes").stdout.split("\n").filter(Boolean);
  S.base = chooseBase(refs, git("symbolic-ref", "--short", "refs/remotes/origin/HEAD").stdout.trim() || null);
  S.hasHead = git("rev-parse", "--verify", "HEAD").status === 0;
  const withStats = (numstat, names) => {
    if (numstat.status !== 0) throw new Error(numstat.stderr);
    const stats = parseNumstat(numstat.stdout);
    return parseNameStatus(names.stdout).map((f) => ({ ...f, add: 0, del: 0, ...stats[f.path] }));
  };
  try {
    if (S.scope === "work") {
      const status = git("status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all");
      if (status.status !== 0) throw new Error(status.stderr);
      const stats = {};
      const runs = S.hasHead ? [git("diff", "HEAD", "--numstat", "-z", "--no-renames")] : [git("diff", "--cached", "--numstat", "-z", "--no-renames"), git("diff", "--numstat", "-z", "--no-renames")];
      for (const r of runs) for (const [p, v] of Object.entries(parseNumstat(r.stdout))) { const o = stats[p] ?? { add: 0, del: 0 }; stats[p] = { add: o.add + v.add, del: o.del + v.del, binary: v.binary }; }
      S.files = parseStatus(status.stdout).slice(0, 1000).map((f) => ({ ...f, add: 0, del: 0, ...stats[f.path] }));
    } else if (S.scope === "branch") {
      if (!S.base) { S.files = []; S.hint = "No encuentro la rama base (origin/main, main…)"; }
      else {
        const mb = git("merge-base", S.base, "HEAD").stdout.trim() || S.base;
        S.files = withStats(git("diff", mb, "--numstat", "-z", "--no-renames"), git("diff", mb, "--name-status", "-z", "--no-renames"));
      }
    } else if (S.commit) {
      S.files = withStats(git("show", "--numstat", "--format=", "-z", "--no-renames", S.commit.sha), git("show", "--name-status", "--format=", "-z", "--no-renames", S.commit.sha));
    } else {
      const r = git("log", "--format=%H%x1f%h%x1f%s%x1f%ct", "-n", "60", ...(S.base ? [`${S.base}..HEAD`] : ["HEAD"]));
      S.commits = r.status === 0 ? parseLog(r.stdout) : [];
      S.files = [];
      if (!S.commits.length) S.hint = S.base ? `Sin commits nuevos sobre ${S.base}` : "Sin commits";
    }
  } catch (e) { S.files = []; S.error = String(e.message ?? e).trim(); }
  const listLen = inCommitList() ? S.commits.length : S.files.length;
  const at = keep ? S.files.findIndex((f) => f.path === keep) : -1;
  S.sel = Math.min(Math.max(at >= 0 ? at : S.sel, 0), Math.max(0, listLen - 1));
  loadDiff();
}

const inCommitList = () => S.scope === "commits" && !S.commit;

function loadDiff() {
  S.dtop = 0;
  const f = inCommitList() ? null : S.files[S.sel];
  if (!f) { S.lines = []; S.rows = []; return; }
  let lines;
  if (S.scope === "work" && (f.fresh || (!S.hasHead && f.status === "A"))) {
    let text = null;
    try { text = readFileSync(`${S.root}/${f.path}`, "utf8"); } catch { /* unreadable */ }
    if (text === null) lines = ["No se puede mostrar este archivo (binario, muy grande o ilegible)"];
    else if (text.includes("\0")) lines = ["Archivo binario · sin diff de texto"];
    else { f.add = countLines(text); lines = [`@@ -0,0 +1,${f.add} @@`, ...text.slice(0, 400000).replace(/\n$/, "").split("\n").slice(0, MAX_LINES).map((l) => `+${l}`)]; }
  } else {
    const args = S.scope === "commits" ? ["show", ...SHOW, "--format=", S.commit.sha, "--", f.path]
      : S.scope === "branch" ? ["diff", git("merge-base", S.base, "HEAD").stdout.trim() || S.base, ...SHOW, "--", f.path]
      : ["diff", ...(S.hasHead ? ["HEAD"] : []), ...SHOW, "--", f.path];
    const r = git(...args);
    if (r.status !== 0) lines = [`No se puede mostrar este diff: ${(r.stderr || "git falló").trim()}`];
    else {
      const all = r.stdout.replace(/\n$/, "").split("\n"), first = all.findIndex((l) => l.startsWith("@@"));
      lines = first < 0 ? [f.binary ? "Archivo binario cambiado" : "Sin diff de texto"] : all.slice(first, first + MAX_LINES);
    }
  }
  S.lines = lines.map((l) => l.replace(/\t/g, "  ").replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "·")); // no control characters on the terminal
  S.rows = diffRows(S.lines);
}

// ---- drawing: plain text first (so widths are exact), colour on top of each piece
const esc = (code, s) => (code ? `\x1b[${code}m${s}\x1b[0m` : s);
function line(pieces, width, bg = "") {
  let used = 0, out = "";
  for (const [text, code] of pieces) {
    const room = width - used;
    if (room <= 0) break;
    const part = text.length > room ? text.slice(0, room) : text;
    out += esc([code, bg].filter(Boolean).join(";"), part); used += part.length;
  }
  return out + (used < width ? esc(bg, " ".repeat(width - used)) : "");
}
const STATUS = { A: "32", D: "31", U: "31", M: "33" };

function frame() {
  const W = process.stdout.columns || 80, R = process.stdout.rows || 24, out = [];
  const add = S.files.reduce((n, f) => n + f.add, 0), del = S.files.reduce((n, f) => n + f.del, 0), nSeen = S.files.filter(seen).length;
  const tab = (k, n, label) => [[` ${n} ${label} `, S.scope === k ? "7" : "2"], [" ", ""]];
  out.push(line([[" Diff ", "1"], ["│ ", "2"], ...tab("work", 1, "Sin commit"), ...tab("branch", 2, "Rama"), ...tab("commits", 3, "Commits"),
    ["│ ", "2"], [`+${add}`, "32"], [" ", ""], [`−${del}`, "31"], ...(S.files.length && !inCommitList() ? [[`  ${nSeen}/${S.files.length} vistos`, "2"]] : []),
    ...(S.scope !== "work" && S.base ? [[`  contra ${S.base}`, "2"]] : [])], W));
  const listLen = inCommitList() ? S.commits.length : S.files.length;
  const sub = S.scope === "commits" && S.commit ? 1 : 0;
  const Lh = Math.min(Math.max(listLen, 1), Math.max(3, Math.floor((R - 4) * 0.35)));
  if (S.sel < S.ltop) S.ltop = S.sel;
  if (S.sel >= S.ltop + Lh - sub) S.ltop = S.sel - Lh + sub + 1;
  if (sub) out.push(line([[" ‹ b ", "2"], [S.commit.short, "36"], [`  ${S.commit.subject}`, ""]], W));
  const listRows = Lh - sub;
  if (!listLen) out.push(line([[` ${S.error || S.hint || "Sin cambios"}`, "2"]], W));
  for (let i = S.ltop; i < Math.min(listLen, S.ltop + listRows); i++) {
    const on = i === S.sel, bg = on ? (S.focus === "list" ? "7" : "2") : "";
    if (inCommitList()) { const c = S.commits[i]; out.push(line([[` ${c.short} `, on ? "" : "36"], [c.subject, ""], [`  ${ago(c.time)}`, on ? "" : "2"]], W, bg)); continue; }
    const f = S.files[i], parts = f.path.split("/"), name = parts.pop(), dir = parts.length ? parts.join("/") + "/" : "", s = seen(f);
    out.push(line([[s ? " [✓] " : " [ ] ", s ? "32" : "2"], [f.status + " ", on ? "" : STATUS[f.status] ?? ""], [dir, on || s ? "" : "2"], [name, s ? "2" : "1"],
      ...(f.add ? [[`  +${f.add}`, on ? "" : "32"]] : []), ...(f.del ? [[` −${f.del}`, on ? "" : "31"]] : [])], W, bg));
  }
  while (out.length < 1 + Lh) out.push(line([], W));
  const file = inCommitList() ? null : S.files[S.sel];
  out.push(line([[`─ ${file ? file.path : ""} `, "2"], ["─".repeat(W), "2"]], W));
  const Dh = Math.max(1, R - out.length - 1), gut = 6, rows = wrapRows(S.rows, W - gut - 1, S.wrap);
  S.dtop = Math.min(Math.max(0, S.dtop), Math.max(0, rows.length - Dh));
  S.pageRows = Dh; S.totalRows = rows.length;
  for (let i = S.dtop; i < Math.min(rows.length, S.dtop + Dh); i++) {
    const r = rows[i];
    if (r.kind === "@") { out.push(line([[r.text, "36;2"]], W)); continue; }
    const n = r.cont ? "  ↪  " : r.number === undefined ? "" : String(r.number).padStart(4) + " ";
    const code = r.kind === "+" ? "32" : r.kind === "-" ? "31" : "";
    out.push(line([[n.padEnd(gut), "2"], [(r.kind === "+" || r.kind === "-" ? r.kind : " ") + r.text, code]], W));
  }
  while (out.length < R - 1) out.push(line([], W));
  const keys = inCommitList() ? "↑↓ elegir · ↵ abrir · 1 2 3 vistas · r releer · q salir" : "↑↓ archivo · tab foco · space/b página · v visto · w ajuste · 1 2 3 vistas · r releer · q salir";
  out.push(line([[` ${keys}`, "2"], ...(S.hint && listLen ? [[`  ${S.hint}`, "33"]] : [])], W));
  return out.slice(0, R);
}

function draw() { process.stdout.write(frame().map((row, i) => `\x1b[${i + 1};1H${row}`).join("")); }

// ---- keys
function setScope(scope) { S.scope = scope; S.commit = null; S.sel = 0; S.ltop = 0; S.focus = "list"; load(); }
function move(delta) {
  const n = inCommitList() ? S.commits.length : S.files.length;
  if (!n) return;
  S.sel = Math.min(n - 1, Math.max(0, S.sel + delta));
  if (!inCommitList()) loadDiff();
}
function key(k) {
  const page = Math.max(1, (S.pageRows ?? 10) - 1);
  if (k === "q" || k === "\x03") return quit();
  if (k === "1" || k === "2" || k === "3") return setScope(["work", "branch", "commits"][Number(k) - 1]);
  if (k === "r") return load();
  if (k === "w") { S.wrap = !S.wrap; return; }
  if (k === "n") return move(1);
  if (k === "p") return move(-1);
  if ((k === "b" || k === "\x1b" || k === "\x7f" || k === "h") && S.scope === "commits" && S.commit) { S.commit = null; S.sel = 0; S.ltop = 0; S.focus = "list"; return load(); }
  if (k === "\t") { S.focus = S.focus === "list" ? "diff" : "list"; return; }
  if (k === "v" || k === "x") {
    const f = S.files[S.sel];
    if (!f || inCommitList()) return;
    const mk = seenKey(S.root, scopeKey(), f.path);
    if (seen(f)) delete S.marks[mk]; else S.marks[mk] = signature(f);
    return saveMarks();
  }
  if (k === "\r") {
    if (inCommitList()) { S.commit = S.commits[S.sel] ?? null; if (S.commit) { S.sel = 0; S.ltop = 0; load(); } return; }
    S.focus = "diff"; return;
  }
  const up = k === "\x1b[A" || k === "k", down = k === "\x1b[B" || k === "j";
  const pgdn = k === " " || k === "\x1b[6~", pgup = k === "b" || k === "\x1b[5~";
  if (S.focus === "list" || inCommitList()) { if (up) return move(-1); if (down) return move(1); if (pgdn) return move(page); if (pgup) return move(-page); return; }
  if (up) S.dtop -= 1; else if (down) S.dtop += 1; else if (pgdn) S.dtop += page; else if (pgup) S.dtop -= page;
  else if (k === "g") S.dtop = 0; else if (k === "G") S.dtop = S.totalRows ?? 0;
}

function quit() {
  process.stdout.write("\x1b[?25h\x1b[?1049l");
  try { process.stdin.setRawMode(false); } catch { /* not a tty */ }
  process.exit(0);
}

// ---- start
if (import.meta.main) {
  loadMarks();
  process.stdout.write(`\x1b]0;${TITLE}\x07\x1b[?1049h\x1b[?25l`);
  load(); draw();
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.on("data", (d) => { try { key(String(d)); draw(); } catch (e) { S.hint = String(e.message ?? e); draw(); } });
  process.stdout.on("resize", draw);
  process.on("SIGTERM", quit); process.on("SIGHUP", quit);
  // the working tree or HEAD changed: read again
  let seenState = "";
  const state = () => `${git("status", "--porcelain", "-z").stdout}|${git("rev-parse", "HEAD").stdout}`;
  setInterval(() => { try { const s = state(); if (s !== seenState) { seenState = s; load(); draw(); } } catch { /* try next tick */ } }, 2000);
}
