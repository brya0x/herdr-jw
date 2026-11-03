// Shared by the factory views: the manifest of a workspace folder, what is on disk, and the actions.
import { exec, home, appHome, readTextFile, writeTextFile } from "herdr";
import { parseManifest, toToml, addToToml, dropFromToml, HEADER } from "./manifest.js";

export const WS = () => `${home()}/ws`;
export const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
export const base = (p) => p.replace(/\/+$/, "").split("/").pop();
const SCRIPTS = () => `${appHome()}/mods/factory`;
const sh = (script, ...args) => exec("sh", ["-c", script, "sh", ...args]);
export const exists = async (path) => (await sh('[ -e "$1" ] || [ -L "$1" ]', path)).code === 0;

// Where a workspace keeps a repo: <folder>/repos/<name> (worktrees go to <folder>/worktrees/<repo>/<branch folder>).
const repoDir = (folder, name) => `${folder}/repos/${name}`;

// The repos of a workspace: <folder>/.factory.toml (see manifest.js), else the old <folder>/.factory.json = { repos: [...] }, read as it is
// until the first change converts it (`legacy`). text: what the file says now, to write over (null when there is no .factory.toml yet).
export async function readManifest(folder) {
  const toml = await readTextFile(`${folder}/.factory.toml`);
  if (toml !== null) { try { return { text: toml, repos: parseManifest(toml) }; } catch { return { text: toml, repos: [], bad: true }; } }
  const json = await readTextFile(`${folder}/.factory.json`);
  if (json === null) return { text: null, repos: [] };
  try { return { text: null, repos: JSON.parse(json).repos ?? [], legacy: true }; } catch { return { text: null, repos: [], bad: true }; }
}
const baseText = (m) => (m.legacy ? toToml(m.repos) : m.text ?? HEADER);
async function writeManifest(folder, m, text) {
  await writeTextFile(`${folder}/.factory.toml`, text, m.text);
  if (m.legacy) await sh('rm -f "$1"', `${folder}/.factory.json`);
}

// One repo's state on disk: { state: cloning | failed | missing | git | dir, real, branch, dirty, msg }.
export async function probe(folder, repo) {
  const out = (await exec("sh", [`${SCRIPTS()}/probe.sh`, repoDir(folder, repo.name)])).stdout;
  const r = {};
  for (const line of out.split("\n")) {
    const at = line.indexOf(" ");
    if (at > 0) r[line.slice(0, at)] = r[line.slice(0, at)] ? `${r[line.slice(0, at)]}\n${line.slice(at + 1)}` : line.slice(at + 1);
  }
  return { ...repo, state: r.state ?? "missing", real: r.real, branch: r.branch, dirty: Number(r.dirty ?? 0), msg: r.msg,
    wts: (r.wt ?? "").split("\n").filter(Boolean).map((l) => { const [branch, path] = l.split("\t"); return { branch, path }; }) };
}

// Detached: it goes on when the dialog that started it closes.
export const startClone = (id, dst) => exec("sh", ["-c", 'nohup sh "$0" "$@" >/dev/null 2>&1 &', `${SCRIPTS()}/clone.sh`, id, dst]);

// shortcut: a clone that dies with the machine leaves a .part that reads as "cloning" forever; delete it by hand.
export async function addRepo(folder, repo) {
  const m = await readManifest(folder);
  if (m.bad) throw new Error(".factory.toml is not valid");
  if (!NAME.test(repo.name)) throw new Error(`invalid name: ${repo.name}`);
  if (m.repos.some((r) => r.name === repo.name)) throw new Error(`there is already a repo called "${repo.name}"`);
  const dst = repoDir(folder, repo.name);
  if ((await exists(dst)) || (await exists(`${dst}.part`))) throw new Error(`ya existe ${dst}`);
  if (repo.kind === "dir") {
    if ((await sh('[ -d "$1" ] && mkdir -p "$(dirname "$2")" && ln -s "$1" "$2"', repo.path, dst)).code !== 0) throw new Error(`not a folder: ${repo.path}`);
  } else if (!/^[\w.-]+\/[\w.-]+$/.test(repo.id)) throw new Error(`invalid repo: ${repo.id}`);
  try { await writeManifest(folder, m, addToToml(baseText(m), repo)); }
  catch (e) { if (repo.kind === "dir") await sh('[ -L "$1" ] && rm "$1"', dst); throw e; }
  if (repo.kind === "gh") await startClone(repo.id, dst);
}

// Drops the reference (and the link we made for a folder). A clone or a folder of yours stays on disk.
export async function removeRepo(folder, name) {
  const m = await readManifest(folder);
  if (m.bad) throw new Error(".factory.toml is not valid");
  await writeManifest(folder, m, dropFromToml(baseText(m), name));
  await sh('[ -L "$1" ] && rm "$1"', repoDir(folder, name));
}

export const retryClone = (folder, repo) => startClone(repo.id, repoDir(folder, repo.name));

// A workspace: its folder, an empty manifest, and a space with claude and the repos panel beside it.
export async function createWorkspace(name) {
  name = name.trim();
  if (!name || name.length > 40 || /[\/\\\u0000-\u001f]/.test(name) || name.startsWith(".")) throw new Error("invalid name (1 to 40 characters, no / or \\, no leading dot)");
  const folder = `${WS()}/${name}`;
  if ((await sh('mkdir "$1"', folder)).code !== 0) throw new Error(`could not create ${folder} (does it already exist?)`);
  await writeManifest(folder, { text: null }, HEADER);
  const made = await exec("herdr-app", ["do", "space.new", JSON.stringify({ name, folder, argv: ["claude"] })]);
  if (made.code !== 0) throw new Error(made.stdout || made.stderr || "space.new failed");
  await exec("herdr-app", ["do", "pane.split", JSON.stringify({ direction: "right", mod: "factory", props: { view: "repos", folder } })]);
  return folder;
}
