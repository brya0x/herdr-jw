#!/usr/bin/env bun
// bun wt.js <name> [--in <repo>] [--branch <branch>] [--from <ref>] [--open shell|claude] [--task <text>] [--print]
// jw's `jw worktree` for Herdr: the creation the Worktree mod does (main.js create()), from a terminal: same git, same .jw.toml,
// then `herdr-app do space.new` (with the same setup wrapper, paneArgv). --in is a path or the name of a repo of the factory
// workspace you are in; without it, the repo of the current folder. --print shows the space.new it would run instead of running it.
import { readFileSync, existsSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { parse, rootOf, folderOf, validFolder, setupScript, paneArgv } from "./jwtoml.js";

const die = (m) => { console.error(`wt: ${m}`); process.exit(1); };
const run = (cmd, args, cwd) => { const r = spawnSync(cmd, args, { cwd, encoding: "utf8" }); return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() }; };
const git = (cwd, ...args) => run("git", args, cwd);

// the factory workspace around a folder (the nearest .factory.json upward) and where its repos are
function factory(from) {
  for (let d = resolve(from); ; d = dirname(d)) {
    if (existsSync(`${d}/.factory.json`)) { try { return { ws: d, repos: JSON.parse(readFileSync(`${d}/.factory.json`, "utf8")).repos ?? [] }; } catch { die(`${d}/.factory.json no es JSON válido`); } }
    if (dirname(d) === d) return null;
  }
}
const repoPath = (f, r) => r.kind === "dir" && r.path ? r.path : [`${f.ws}/repos/${r.name}`, `${f.ws}/${r.name}`].find(existsSync);

export function plan(argv, cwd = process.cwd()) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--print") o.print = true;
    else if (["--in", "--branch", "--from", "--open", "--task"].includes(a)) o[a.slice(2)] = argv[++i] ?? die(`${a} necesita un valor`);
    else if (a.startsWith("--")) die(`opción desconocida: ${a}`);
    else o._.push(a);
  }
  if (o._.length !== 1) die("uso: wt.js <name> [--in <repo>] [--branch <branch>] [--from <ref>] [--open shell|claude] [--task <text>] [--print]");
  if (o.open && !["shell", "claude"].includes(o.open)) die("--open: shell o claude");
  const branch = o.branch ?? o._[0], folder = o.branch ? o._[0] : folderOf(branch);
  if (branch.startsWith("-") || !git(cwd, "check-ref-format", "--branch", branch).ok) die(`«${branch}» no es un nombre de rama válido`);
  if (!validFolder(folder)) die(`«${folder}» no sirve de nombre de carpeta (una sola pieza, hasta 80 letras, sin / ni \\)`);

  const fac = factory(cwd);
  let start = cwd, name = null;
  if (o.in) {
    const r = !o.in.includes("/") && fac?.repos.find((x) => x.name === o.in);
    if (r) { start = repoPath(fac, r) ?? die(`el repo ${o.in} no está en disco`); name = r.name; }
    else if (existsSync(o.in)) start = resolve(cwd, o.in);
    else die(`no encuentro el repo «${o.in}»`);
  }
  const top = git(start, "rev-parse", "--show-toplevel");
  if (!top.ok) die(`${start} no es un repositorio git`);
  const main = git(top.out, "worktree", "list", "--porcelain").out.split("\n")[0].replace(/^worktree /, "");
  if (!name && fac) name = fac.repos.find((r) => { const p = repoPath(fac, r); return p && realpathSync(p) === realpathSync(main); })?.name ?? null;
  const cfg = parse(existsSync(`${main}/.jw.toml`) ? readFileSync(`${main}/.jw.toml`, "utf8") : "");
  const dest = `${name && fac ? `${fac.ws}/worktrees/${name}` : rootOf(cfg, main, homedir())}/${folder}`;
  if (existsSync(dest)) die(`ya existe ${dest}`);
  return { o, branch, folder, top: top.out, main, cfg, dest, exists: git(main, "show-ref", "--verify", "--quiet", `refs/heads/${branch}`).ok };
}

export function create(p) {
  const { o, branch, folder, top, main, cfg, dest } = p;
  // an existing branch is checked out as it is; a new one starts from --from, else HEAD, as in jw
  const r = git(top, ...(p.exists ? ["worktree", "add", dest, branch] : ["worktree", "add", "-b", branch, dest, o.from ?? "HEAD"]));
  if (!r.ok) die(r.err || "git worktree add falló");
  for (const rel of cfg.copy) {
    if (!existsSync(`${main}/${rel}`)) { console.error(`wt: no se copió ${rel}`); continue; }
    run("sh", ["-c", 'mkdir -p "$(dirname "$2/$3")" && cp -R "$1/$3" "$2/$3"', "sh", main, dest, rel]);
  }
  const task = (o.task ?? "").trim();
  const home = process.env.HERDR_APP_HOME ?? `${homedir()}/.config/herdr-app`;
  const setup = setupScript(cfg, folder, branch);
  const argv = paneArgv({ setup, claude: (o.open ?? cfg.open) === "claude" || Boolean(task), task, log: `${home}/data/factory/setup-failures.log` });
  return { folder: dest, ...(argv ? { argv } : {}), ...(task && !setup ? { task } : {}) };
}

if (import.meta.main) {
  const p = plan(process.argv.slice(2));
  const space = create(p);
  if (p.o.print) console.log(JSON.stringify(space));
  else {
    const r = run("herdr-app", ["do", "space.new", JSON.stringify(space)]);
    if (!r.ok) die(`el worktree está en ${p.dest}, pero Herdr no abrió el space: ${r.err || r.out}`);
    console.log(`${p.dest}\n${r.out}`);
  }
}
