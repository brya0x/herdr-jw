#!/usr/bin/env bun
// bun wt.js remove <worktree path> [--force]: what the Worktree dialog does to remove one: refuses while it has uncommitted changes, commits on no remote or
// submodules (unless --force), closes the spaces whose folder it is, then `git worktree remove`. The branch stays.
// bun wt.js <name> [--in <repo>] [--branch <branch>] [--from <ref>] [--open shell|claude] [--task <text>] [--loose] [--print]
// jw's `jw worktree` for Herdr: the creation the Worktree mod does (main.js create()), from a terminal: same git, same .jw.toml,
// then `herdr-app do space.new` (with the same setup wrapper, paneArgv). --in is a path or the name of a repo of the factory
// workspace you are in; without it, the repo of the current folder. Inside a workspace, a path to a repo that belongs to no workspace
// (a loose checkout of a repo the workspace already has) is refused unless --loose. --print shows the space.new it would run instead of running it.
import { readFileSync, writeFileSync, mkdirSync, existsSync, realpathSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { reposOf } from "./manifest.js";
import { parse, rootOf, folderOf, validFolder, setupScript, paneArgv, factoryRepo, withFactoryPorts, ancestorsOf, personalFile, slotsFile, claimSlot, jwEnv } from "./jwtoml.js";

const die = (m) => { console.error(`wt: ${m}`); process.exit(1); };
const run = (cmd, args, cwd) => { const r = spawnSync(cmd, args, { cwd, encoding: "utf8" }); return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() }; };
const git = (cwd, ...args) => run("git", args, cwd);

// the repos of the workspace in a folder (its .factory.toml, else the old .factory.json), or null when it is not one; throws if it is invalid
const manifest = (d) => { const r = (f) => { try { return readFileSync(`${d}/${f}`, "utf8"); } catch { return null; } }; return reposOf(r(".factory.toml"), r(".factory.json")); };

// the factory workspace around a folder (the nearest manifest upward) and where its repos are
function factory(from) {
  for (let d = resolve(from); ; d = dirname(d)) {
    let repos; try { repos = manifest(d); } catch (e) { die(`${d}: ${e.message}`); }
    if (repos) return { ws: d, repos };
    if (dirname(d) === d) return null;
  }
}
const repoPath = (f, r) => r.kind === "dir" && r.path ? r.path : [`${f.ws}/repos/${r.name}`, `${f.ws}/${r.name}`].find(existsSync);

// the factory workspaces that may own a repo: around the places we are in, and every ~/ws/* (where "new workspace" makes them)
function factoriesFor(places) {
  const dirs = new Set(places.flatMap(ancestorsOf));
  const wsDir = `${homedir()}/ws`;
  if (existsSync(wsDir)) for (const e of readdirSync(wsDir)) dirs.add(`${wsDir}/${e}`);
  const out = [];
  for (const ws of dirs) {
    let list; try { list = manifest(ws); } catch { continue; }
    if (!list) continue;
    const repos = list.map((r) => { try { return { name: r.name, real: realpathSync(repoPath({ ws }, r)), ports: r.ports }; } catch { return null; } }).filter(Boolean);
    out.push({ ws, repos });
  }
  return out;
}

export function remove(argv) {
  const force = argv.includes("--force"), rest = argv.filter((a) => a !== "--force");
  if (rest.length !== 1 || rest[0].startsWith("--")) die("usage: wt.js remove <worktree path> [--force]");
  let path; try { path = realpathSync(resolve(rest[0])); } catch { die(`${rest[0]} does not exist`); }
  const top = git(path, "rev-parse", "--show-toplevel");
  if (!top.ok || realpathSync(top.out) !== path) die(`${path} is not the top of a git worktree`);
  const main = git(path, "worktree", "list", "--porcelain").out.split("\n")[0].replace(/^worktree /, "");
  if (realpathSync(main) === path) die(`${path} is the main checkout of its repo, not a linked worktree`);
  const status = git(path, "--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain");
  if (!status.ok) die(status.err || "git status failed");
  const ahead = Number(git(path, "rev-list", "--count", "HEAD", "--not", "--remotes").out) || 0;
  const risks = [status.out && "uncommitted changes", ahead && `${ahead} commit(s) on no remote`, existsSync(`${path}/.gitmodules`) && "submodules (their history goes with it)"].filter(Boolean);
  if (risks.length && !force) die(`${path} has ${risks.join(", ")}: removing it loses them. Pass --force to remove it anyway`);
  // the spaces first: a shell sitting in the folder keeps it busy
  let spaces = null; try { spaces = JSON.parse(run("herdr-app", ["ls"]).out).spaces; } catch {}
  if (!spaces) console.error("wt: herdr-app does not answer: no space was closed");
  const here = (f) => { try { return realpathSync(f) === path; } catch { return false; } };
  for (const sp of (spaces ?? []).filter((x) => !x.machine && here(x.folder))) run("herdr-app", ["do", "space.close", JSON.stringify({ id: sp.id, confirmed: true })]);
  const r = git(main, "worktree", "remove", ...(force ? ["--force"] : []), path);
  if (!r.ok) die(r.err || "git worktree remove failed");
  console.log(`removed ${path}`);
}

export function plan(argv, cwd = process.cwd()) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--print") o.print = true;
    else if (a === "--loose") o.loose = true;
    else if (["--in", "--branch", "--from", "--open", "--task"].includes(a)) o[a.slice(2)] = argv[++i] ?? die(`${a} needs a value`);
    else if (a.startsWith("--")) die(`unknown option: ${a}`);
    else o._.push(a);
  }
  if (o._.length !== 1) die("usage: wt.js <name> [--in <repo>] [--branch <branch>] [--from <ref>] [--open shell|claude] [--task <text>] [--loose] [--print]");
  if (o.open && !["shell", "claude"].includes(o.open)) die("--open: shell or claude");
  const branch = o.branch ?? o._[0], folder = o.branch ? o._[0] : folderOf(branch);
  if (branch.startsWith("-") || !git(cwd, "check-ref-format", "--branch", branch).ok) die(`"${branch}" is not a valid branch name`);
  if (!validFolder(folder)) die(`"${folder}" is not usable as a folder name (one piece, up to 80 characters, no / or \\)`);

  const fac = factory(cwd);
  let start = cwd, name = null;
  if (o.in) {
    const r = !o.in.includes("/") && fac?.repos.find((x) => x.name === o.in);
    if (r) { start = repoPath(fac, r) ?? die(`repo ${o.in} is not on disk`); name = r.name; }
    else if (existsSync(o.in)) start = resolve(cwd, o.in);
    else die(`repo "${o.in}" not found`);
  }
  const top = git(start, "rev-parse", "--show-toplevel");
  if (!top.ok) die(`${start} is not a git repository`);
  const main = git(top.out, "worktree", "list", "--porcelain").out.split("\n")[0].replace(/^worktree /, "");
  if (!name && fac) name = fac.repos.find((r) => { const p = repoPath(fac, r); return p && realpathSync(p) === realpathSync(main); })?.name ?? null;
  // the repo's own .jw.toml, else jw's personal file for its origin (the first that exists is the only one read, as in jw)
  const origin = git(main, "remote", "get-url", "origin");
  const file = [`${main}/.jw.toml`, personalFile(homedir(), origin.ok ? origin.out : "", main)].find(existsSync);
  let cfg; try { cfg = parse(file ? readFileSync(file, "utf8") : ""); } catch (e) { die(`${file}: ${e.message}`); }
  const fr = factoryRepo(realpathSync(main), factoriesFor([cwd, start]));
  try { cfg = withFactoryPorts(cfg, fr); } catch (e) { die(e.message); }
  const owned = name && fac ? `${fac.ws}/worktrees/${name}` : fr?.root ?? null; // by where we are, else by the repo
  if (fac && o.in && !owned && !o.loose) die(`${o.in} is not a repo of the workspace ${fac.ws}: its worktree would not be grouped under it. Use --in ${fac.repos.map((r) => r.name).join("|") || "<repo name>"} (or ${fac.ws}/repos/<name>), or pass --loose to make a worktree of ${main} anyway`);
  const dest = `${owned ?? rootOf(cfg, main, homedir())}/${folder}`;
  if (existsSync(dest)) die(`${dest} already exists`);
  return { o, branch, folder, top: top.out, main, cfg, dest, exists: git(main, "show-ref", "--verify", "--quiet", `refs/heads/${branch}`).ok };
}

export function create(p) {
  const { o, branch, folder, top, main, cfg, dest } = p;
  const home = process.env.HERDR_APP_HOME ?? `${homedir()}/.config/herdr-app`;
  let slot = null;
  if (Object.keys(cfg.ports).length) { // the block of ports is taken before anything is made, as jw does
    const file = slotsFile(home);
    let reg = {}; try { reg = JSON.parse(readFileSync(file, "utf8")); } catch {}
    ({ reg, slot } = claimSlot(reg, dest, existsSync));
    if (slot === null) die("no block of ports is free");
    mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(reg));
  }
  // an existing branch is checked out as it is; a new one starts from --from, else HEAD, as in jw
  const r = git(top, ...(p.exists ? ["worktree", "add", dest, branch] : ["worktree", "add", "-b", branch, dest, o.from ?? "HEAD"]));
  if (!r.ok) die(r.err || "git worktree add failed");
  for (const rel of cfg.copy) {
    if (!existsSync(`${main}/${rel}`)) { console.error(`wt: not copied: ${rel}`); continue; }
    run("sh", ["-c", 'mkdir -p "$(dirname "$2/$3")" && cp -R "$1/$3" "$2/$3"', "sh", main, dest, rel]);
  }
  const task = (o.task ?? "").trim();
  const setup = setupScript(cfg, folder, branch);
  const argv = paneArgv({ setup, claude: (o.open ?? cfg.open) === "claude" || Boolean(task), task, log: `${home}/data/factory/setup-failures.log`, env: jwEnv(cfg, dest, slot) });
  return { folder: dest, argv };
}

if (import.meta.main && process.argv[2] === "remove") remove(process.argv.slice(3));
else if (import.meta.main) {
  const p = plan(process.argv.slice(2));
  const space = create(p);
  if (p.o.print) console.log(JSON.stringify(space));
  else {
    const r = run("herdr-app", ["do", "space.new", JSON.stringify(space)]);
    if (!r.ok) die(`the worktree is at ${p.dest}, but Herdr did not open the space: ${r.err || r.out}`);
    console.log(`${p.dest}\n${r.out}`);
  }
}
