// A repository's .jw.toml, the subset jw reads (project.rs): root, setup, copy, open, ports (each worktree's block of ports).
// Everything else (tables, unknown keys) is ignored, as jw does. [[env]] file = "x" is read as copy = ["x"]:
// the file jw wrote for these repos says "copied from the main checkout", and jw's current parser drops it.

import { reposOf } from "./manifest.js";

function unquote(raw, fail) {
  const q = raw[0];
  if (raw.length < 2 || raw[raw.length - 1] !== q) fail("unterminated string");
  const body = raw.slice(1, -1);
  if (q === "'") return body;
  return body.replace(/\\(["\\ntr])/g, (_m, c) => ({ n: "\n", t: "\t", r: "\r" })[c] ?? c);
}

// Splits "a", 'b', 3 at top-level commas, ignoring commas inside quotes.
function items(text, fail) {
  const out = [];
  let cur = "", q = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { cur += c; if (c === "\\" && q === '"') cur += text[++i] ?? ""; else if (c === q) q = null; }
    else if (c === '"' || c === "'") { q = c; cur += c; }
    else if (c === ",") { out.push(cur.trim()); cur = ""; }
    else cur += c;
  }
  if (q) fail("unterminated string");
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean).map((v) => value(v, fail));
}

function value(raw, fail) {
  raw = raw.trim();
  if (raw[0] === '"' || raw[0] === "'") return unquote(raw, fail);
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  if (raw === "true" || raw === "false") return raw === "true";
  if (raw[0] === "{" && raw.endsWith("}")) return undefined; // an inline table ([[env]] set, [layout] leaves): jw does not use it either
  fail(`unsupported value: ${raw}`);
}

// Drops a # comment that is not inside a string.
function uncomment(line) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === "\\" && q === '"') i++; else if (c === q) q = null; }
    else if (c === '"' || c === "'") q = c;
    else if (c === "#") return line.slice(0, i);
  }
  return line;
}

export function parse(text) {
  const top = {}, env = [], ports = {};
  let table = null, last = null;
  const lines = text.split("\n");
  for (let n = 0; n < lines.length; n++) {
    const fail = (why) => { throw new Error(`.jw.toml, line ${n + 1}: ${why}`); };
    const line = uncomment(lines[n]).trim();
    if (!line) continue;
    const head = line.match(/^\[\[?\s*([^\]]+?)\s*\]\]?$/);
    if (head) { table = head[1]; last = line.startsWith("[[") && table === "env" ? (env.push({}), env[env.length - 1]) : null; continue; }
    const eq = line.indexOf("=");
    if (eq < 1) fail("expected key = value");
    const key = line.slice(0, eq).trim();
    let raw = line.slice(eq + 1).trim();
    if (raw.startsWith('"""') || raw.startsWith("'''")) fail("multi-line strings are not supported");
    if (table === null && key === "ports" && raw[0] === "{") { // the inline form jw writes: ports = { web = 0, api = 1 }
      for (const m of raw.matchAll(/([\w-]+|"[^"]*")\s*=\s*(-?\d+(?:\.\d+)?)/g)) ports[m[1].replace(/^"|"$/g, "")] = Number(m[2]);
      continue;
    }
    if (raw.startsWith("[")) { // an array may run over several lines
      let at = n;
      while (!/\]\s*$/.test(raw)) { if (++at >= lines.length) fail("unterminated array"); raw += " " + uncomment(lines[at]).trim(); }
      n = at;
      const v = items(raw.slice(1, raw.lastIndexOf("]")), fail);
      if (table === null) top[key] = v;
      continue;
    }
    const v = value(raw, fail);
    if (table === null) top[key] = v;
    else if (table === "ports") ports[key] = v;
    else if (last) last[key] = v;
  }
  return config(top, env, ports);
}

const strings = (v, key) => {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) throw new Error(`.jw.toml: ${key} must be a list of strings`);
  return v;
};

// jw's rules for the names and offsets of a block of ports (project.rs); `where` is the file the error names.
export function checkPorts(ports, where) {
  for (const [n, o] of Object.entries(ports)) {
    if (!/^[a-z0-9_]+$/.test(n)) throw new Error(`${where}: ports names ${JSON.stringify(n)}: use lowercase letters, digits and _`);
    if (n === "base") throw new Error(`${where}: ports cannot name a port \`base\`: that is the first port of the block`);
    if (!Number.isInteger(o) || o < 0 || o > 99) throw new Error(`${where}: ports.${n} must be a whole number from 0 to 99`);
  }
  return ports;
}

function config(top, env, ports) {
  const setup = strings(top.setup, "setup").map((l) => l.trim()).filter(Boolean);
  for (const l of setup) for (const m of l.match(/\{[^}]*\}/g) ?? []) if (m !== "{name}" && m !== "{branch}") throw new Error(`.jw.toml: setup only accepts {name} and {branch}, not ${m}`);
  const copy = [...new Set([...strings(top.copy, "copy"), ...env.map((e) => e.file).filter((f) => typeof f === "string")])];
  for (const p of copy) if (p.startsWith("/") || p.split("/").includes("..")) throw new Error(`.jw.toml: copy must stay inside the repo: ${p}`);
  if (top.open !== undefined && top.open !== "shell" && top.open !== "claude") throw new Error('.jw.toml: open must be "shell" or "claude"');
  if (top.root !== undefined && typeof top.root !== "string") throw new Error(".jw.toml: root must be a string");
  checkPorts(ports, ".jw.toml");
  return { root: (top.root ?? "").trim(), setup, copy, open: top.open ?? "shell", ports };
}

// Where the worktrees of `main` go: root (~ is home, relative is from the repo), else <main>-wt beside it.
// Cleaned lexically, as jw does: "a/./b/../c" is "a/c".
const clean = (p) => {
  const out = [];
  for (const seg of p.split("/")) if (seg === "..") out.pop(); else if (seg && seg !== ".") out.push(seg);
  return `/${out.join("/")}`;
};
export function rootOf(cfg, main, home) {
  const r = cfg.root;
  if (!r) return `${main}-wt`;
  if (r === "~") return home;
  if (r.startsWith("~/")) return clean(`${home}/${r.slice(2)}`);
  return clean(r.startsWith("/") ? r : `${main}/${r}`);
}

// jw reads a repository's settings from its own .jw.toml, else from the personal file <config dir>/projects/<key>.toml, and the first that
// exists is the only one read (jw spec REQ-482/483). <key>: the `origin` in lowercase without scheme, user or .git, "/" as "_"; with no
// origin, "local_" and the path with "/" as "_". The config dir of jw is ~/.config/jw.
export function personalKey(origin, path) {
  const o = (origin ?? "").trim().toLowerCase();
  if (!o) return `local_${path.replace(/\//g, "_")}`;
  const bare = o.replace(/^[a-z+]+:\/\//, "").replace(/^[^@/]*@/, "").replace(/^([^/:]+):(?!\d+\/)/, "$1/").replace(/\.git$/, "").replace(/\/+$/, "");
  return bare.replace(/\//g, "_");
}
export const personalFile = (home, origin, path) => `${home}/.config/jw/projects/${personalKey(origin, path)}.toml`;

// A repo that belongs to a factory workspace gets its worktrees in <workspace>/worktrees/<repo name>, wherever the person is when
// they make one. factories: [{ ws, repos: [{ name, real }] }], `real` each repo's resolved path; main is the repo's resolved path.
// A repo of the workspace may carry its own `ports` ({ web: 0, api: 3 }): in a factory workspace they replace the [ports] of its .jw.toml.
export const factoryRepo = (main, factories) => {
  for (const f of factories) { const r = f.repos.find((x) => x.real === main); if (r) return { ...r, ws: f.ws, root: `${f.ws}/worktrees/${r.name}` }; }
  return null;
};
export const factoryRoot = (main, factories) => factoryRepo(main, factories)?.root ?? null;
export const withFactoryPorts = (cfg, repo) => repo?.ports ? { ...cfg, ports: checkPorts(repo.ports, ".factory.toml") } : cfg;
// The factory workspaces found in `dirs`, with each repo's resolved path. `read(path)` gives a file's text (or null/throws), `real(path)`
// the resolved path of a folder (or "" when it is not there): the caller's own way to read files, so the dialog and a test share this.
export async function factoriesOf(dirs, read, real) {
  const out = [];
  for (const ws of dirs) {
    const rd = async (f) => { try { return (await read(`${ws}/${f}`)) ?? null; } catch { return null; } };
    let list; try { list = reposOf(await rd(".factory.toml"), await rd(".factory.json")); } catch { continue; }
    if (!list) continue;
    const repos = [];
    for (const r of list) {
      const rp = await real(r.kind === "dir" && r.path ? r.path : `${ws}/repos/${r.name}`);
      if (rp) repos.push({ name: r.name, real: rp, ports: r.ports });
    }
    out.push({ ws, repos });
  }
  return out;
}
// a folder and every folder above it: where a .factory.toml may be
export const ancestorsOf = (p) => { const out = []; for (let d = p; ; d = d.slice(0, d.lastIndexOf("/")) || "/") { out.push(d); if (d === "/") return out; } };

// jw's rule for the folder of a worktree: one piece, no . or .., no / \ or control characters, up to 80.
export const folderOf = (branch) => branch.split("/").pop();
export const validFolder = (f) => f.length > 0 && f.length <= 80 && f !== "." && f !== ".." && !/[\/\\\u0000-\u001f]/.test(f);

// A shell word that is safe to paste into a setup line.
export const shq = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
export const setupScript = (cfg, name, branch) => cfg.setup.map((l) => l.replaceAll("{name}", shq(name)).replaceAll("{branch}", shq(branch))).join(" && ");

// A worktree's ports as jw 0.0.58 gives them (model.rs PortBlock): its block starts at 20000 + 100 * slot, a name is an offset in it,
// the last block is the one that ends by port 65535 (slot 454). The slot is the lowest one no live worktree in the registry holds.
// shortcut: the registry is Herdr's own (slots.json) and does not see the slots of the jw daemon, so a machine that runs both can hand out
// the same block twice; upgrade by reading the daemon's workspaces.
export const slotsFile = (appHome) => `${appHome}/data/worktree-wt/slots.json`;
// reg is { worktree path: slot }; a path that is not `alive` any more (or is `dest` itself) gives its slot back. slot is null if none is free.
export function claimSlot(reg, dest, alive) {
  const kept = Object.fromEntries(Object.entries(reg).filter(([p]) => p !== dest && alive(p)));
  const used = Object.values(kept);
  let slot = 0; while (used.includes(slot)) slot++;
  return slot > 454 ? { reg: kept, slot: null } : { reg: { ...kept, [dest]: slot }, slot };
}
// What every pane of the worktree starts with (model.rs pane_env): its folder and name always; with a slot, JW_PORT_BASE and JW_PORT_<NAME>.
export function jwEnv(cfg, dest, slot) {
  const env = { JW_WORKSPACE_DIR: dest, JW_NAME: dest.split("/").pop() };
  if (slot == null) return env;
  const base = 20000 + 100 * slot;
  env.JW_PORT_BASE = String(base);
  for (const [n, o] of Object.entries(cfg.ports)) env[`JW_PORT_${n.toUpperCase()}`] = String(base + o);
  return env;
}

// What the new space's first pane runs, or undefined for a plain shell. env is exported first. setup runs next in the pane; claude starts only if it
// succeeded (a shell stays either way). A failed setup leaves a line (time, folder, exit code, setup) in `log`, where the factory
// panel's Detecciones shows it. Herdr hands `task` over only when argv is claude itself, so behind a setup the task is claude's first argument.
export function paneArgv({ setup, claude, task, log, env = {} }) {
  const x = Object.entries(env).map(([k, v]) => `export ${k}=${shq(String(v))}; `).join("");
  if (!setup && !x) return claude ? ["claude"] : undefined;
  const l = shq(log);
  const failed = `c=$?; mkdir -p "$(dirname ${l})" && printf '%s\\t%s\\t%s\\t%s\\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$PWD" "$c" ${shq(setup)} >> ${l}`;
  const script = `${x}${setup ? `{ ${setup}; } || { ${failed}${claude ? "; exit $c" : ""}; }; ` : ""}exec ${claude ? `claude${task ? ' "$1"' : ""}` : '"${SHELL:-/bin/sh}"'}`;
  return ["sh", "-c", script, "sh", ...(claude && task ? [task] : [])];
}
