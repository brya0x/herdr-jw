#!/usr/bin/env bun
// jw's `jw group` for Herdr: named groups of repos in the sidebar (spaces-one draws them). A repo is in one group; its worktrees follow.
//   bun group.js ls [--json] | new <name> | rename <group> <name> | rm <group> | move <space> [<group>] | order <group> up|down
// <group> is its id or its name; <space> its id or its name; `move` without a group takes the repo out of its group. The state is
// data/groups/groups.json: { groups: [{ id, name }], grouped: { <the repo's .git folder, or the folder if it is no repo>: <group id> } }.
import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname } from "node:path";

const die = (m) => { console.error(`group: ${m}`); process.exit(1); };
const FILE = `${process.env.HERDR_APP_HOME ?? `${homedir()}/.config/herdr-app`}/data/groups/groups.json`;

export function load() {
  try { const g = JSON.parse(readFileSync(FILE, "utf8")); return { groups: g.groups ?? [], grouped: g.grouped ?? {} }; } catch { return { groups: [], grouped: {} }; }
}
function save(s) {
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(`${FILE}.tmp`, JSON.stringify(s, null, 2) + "\n"); renameSync(`${FILE}.tmp`, FILE);
}

function valid(s, name, except) {
  name = name.trim();
  if (!name || name.length > 40) die("el nombre va de 1 a 40 letras");
  if (s.groups.some((g) => g !== except && g.name.toLowerCase() === name.toLowerCase())) die(`ya hay un grupo «${name}»`);
  return name;
}
export function create(s, name) {
  const id = `g${Math.max(0, ...s.groups.map((g) => Number(g.id.slice(1)))) + 1}`;
  s.groups.push({ id, name: valid(s, name) });
  return id;
}
export function rename(s, g, name) { g.name = valid(s, name, g); }
export const find = (s, ref) => s.groups.find((g) => g.id === ref || g.name.toLowerCase() === ref.toLowerCase()) ?? die(`no hay un grupo «${ref}»`);
export function remove(s, g) {
  s.groups = s.groups.filter((x) => x !== g);
  for (const [k, id] of Object.entries(s.grouped)) if (id === g.id) delete s.grouped[k];
}
export function moveTo(s, key, g) { if (g) s.grouped[key] = g.id; else delete s.grouped[key]; }
export function shift(s, g, dir) {
  const i = s.groups.indexOf(g), j = i + (dir === "up" ? -1 : 1);
  if (j >= 0 && j < s.groups.length) [s.groups[i], s.groups[j]] = [s.groups[j], s.groups[i]];
}

// the key spaces-one uses: the repo's own .git folder (one for a repo and its worktrees), else the folder
export function keyOf(folder) {
  const r = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: folder, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : folder;
}
// a linked worktree: its own top is not where the repo's .git folder is
function isWorktree(folder) {
  const top = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: folder, encoding: "utf8" });
  return top.status === 0 && keyOf(folder) !== `${top.stdout.trim()}/.git`;
}
// the .git folders of the repos a factory workspace lists, as spaces-one reads them
function manifestKeys(folder) {
  try { return new Set(JSON.parse(readFileSync(`${folder}/.factory.json`, "utf8")).repos.map((r) => `${r.kind === "dir" ? r.path : `${folder}/repos/${r.name}`}/.git`)); } catch { return new Set(); }
}
function spaces() {
  const r = spawnSync("herdr-app", ["ls"], { encoding: "utf8" });
  try { return JSON.parse(r.stdout).spaces.filter((s) => s.folder && !s.machine); } catch { return die("no pude leer los spaces de Herdr (herdr-app ls)"); }
}

function main([cmd, ...a]) {
  const s = load(), need = (n, usage) => a.length === n || die(`uso: ${usage}`);
  if (cmd === "new") { need(1, "new <name>"); console.log(create(s, a[0])); save(s); }
  else if (cmd === "rename") { need(2, "rename <group> <name>"); rename(s, find(s, a[0]), a[1]); save(s); }
  else if (cmd === "rm") { need(1, "rm <group>"); remove(s, find(s, a[0])); save(s); }
  else if (cmd === "order") { need(2, "order <group> up|down"); if (!["up", "down"].includes(a[1])) die("up o down"); shift(s, find(s, a[0]), a[1]); save(s); }
  else if (cmd === "move") {
    if (a.length < 1 || a.length > 2) die("uso: move <space> [<group>]");
    const hit = spaces().filter((x) => x.id === a[0] || x.name === a[0]);
    if (hit.length !== 1) die(hit.length ? `«${a[0]}» es el nombre de varios spaces: usa su id` : `no hay un space «${a[0]}»`);
    moveTo(s, keyOf(hit[0].folder), a[1] ? find(s, a[1]) : null); save(s);
  } else if (cmd === "ls") {
    // a space that is a repo of a factory workspace sits in that workspace's group, as the sidebar draws it
    const all = spaces().map((x) => ({ ...x, key: keyOf(x.folder), repos: manifestKeys(x.folder), linked: isWorktree(x.folder) }));
    const sp = all.map((x) => ({ name: x.name, id: x.id, group: s.grouped[(x.linked && all.find((o) => o !== x && o.repos.has(x.key)))?.key ?? x.key] ?? null }));
    const rows = [...s.groups.map((g) => ({ ...g, spaces: sp.filter((x) => x.group === g.id).map((x) => x.name) })), { id: null, name: "sin grupo", spaces: sp.filter((x) => !s.groups.some((g) => g.id === x.group)).map((x) => x.name) }];
    if (a.includes("--json")) console.log(JSON.stringify(rows));
    else for (const g of rows) console.log(`${g.id ?? "-"}\t${g.name}\t${g.spaces.join(", ") || "vacío"}`);
  } else die("uso: ls [--json] | new <name> | rename <group> <name> | rm <group> | move <space> [<group>] | order <group> up|down");
}

if (import.meta.main) main(process.argv.slice(2));
