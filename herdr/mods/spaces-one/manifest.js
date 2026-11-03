// The manifest of a factory workspace, <folder>/.factory.toml: a table per repo, its ports in a table of their own.
//   [repos.jitsubai]            # kind = "dir" with a path, or "gh" with an id (owner/name)
//   kind = "dir"
//   path = "/code/jitsubai"
//
//   [repos.jitsubai.ports]      # offsets in the repo's worktree's block of 100 ports (see worktree-wt)
//   web = 0
// The old <folder>/.factory.json = { repos: [...] } is still read (reposOf); the first change the Repos panel makes converts it.
// Pure, and every mod that reads it has its own copy (sync.sh copies this file: a mod cannot import another). Edit only factory/manifest.js.
export const HEADER = "# The repos of this workspace. The Repos panel adds and removes them; ports are offsets in a worktree's block of 100 ports.\n";

const HEAD = /^\[repos\.("(?:[^"\\]|\\.)*"|[A-Za-z0-9_-]+)(\.ports)?\]$/;
const bare = (n) => (/^[A-Za-z0-9_-]+$/.test(n) ? n : JSON.stringify(n));
const scalar = (v) => (typeof v === "number" ? String(v) : JSON.stringify(String(v)));
const uncomment = (l) => l.replace(/^((?:[^"#]|"(?:[^"\\]|\\.)*")*)#.*$/, "$1").trim(); // a # outside a string starts a comment
const nameOf = (h) => (h[0] === '"' ? JSON.parse(h) : h);

// The repos of a manifest text: [{ name, kind, id?, path?, ports? }], in file order.
export function parseManifest(text) {
  const repos = []; let cur = null, into = null;
  text.split("\n").forEach((raw, i) => {
    const fail = (why) => { throw new Error(`.factory.toml, line ${i + 1}: ${why}`); };
    const line = uncomment(raw);
    if (!line) return;
    const h = line.match(HEAD);
    if (h) {
      const name = nameOf(h[1]);
      if (h[2]) { cur = repos.find((r) => r.name === name) ?? fail(`[repos.${name}.ports] comes before [repos.${name}]`); into = cur.ports = {}; }
      else { if (repos.some((r) => r.name === name)) fail(`repo ${name} twice`); repos.push(cur = { name }); into = cur; }
      return;
    }
    const kv = line.match(/^([A-Za-z0-9_-]+)\s*=\s*("(?:[^"\\]|\\.)*"|'[^']*'|-?\d+)$/);
    if (!kv || !into) return fail("expected [repos.<name>] or key = value");
    into[kv[1]] = kv[2][0] === '"' ? JSON.parse(kv[2]) : kv[2][0] === "'" ? kv[2].slice(1, -1) : Number(kv[2]);
  });
  return repos;
}

// The repos from the two files a folder may have (their texts, null when missing), or null when it has neither.
export const reposOf = (toml, json) => (toml != null ? parseManifest(toml) : json != null ? JSON.parse(json).repos ?? [] : null);

// One repo as text, to append to a manifest.
export function repoBlock(repo) {
  const { name, ports, ...rest } = repo;
  const body = (o) => Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => `${k} = ${scalar(v)}\n`).join("");
  return `[repos.${bare(name)}]\n${body(rest)}${ports ? `\n[repos.${bare(name)}.ports]\n${body(ports)}` : ""}`;
}
export const toToml = (repos) => HEADER + repos.map((r) => `\n${repoBlock(r)}`).join("");
export const addToToml = (text, repo) => `${text.replace(/\s*$/, "\n")}\n${repoBlock(repo)}`;

// The text without the repo's tables (and the keys, blanks and comments in them); the rest, comments included, stays as it was.
// shortcut: a comment right above the next repo's header goes with the removed one, when it follows it; write it above a blank line.
export function dropFromToml(text, name) {
  let skip = false;
  const kept = text.split("\n").filter((l) => {
    const t = uncomment(l);
    if (t.startsWith("[")) { const h = t.match(HEAD); skip = Boolean(h) && nameOf(h[1]) === name; }
    return !skip;
  });
  return `${kept.join("\n").replace(/\s*$/, "")}\n`;
}
