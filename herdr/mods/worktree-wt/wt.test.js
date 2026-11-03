// bun wt.test.js
// --in inside a factory workspace: a loose checkout is refused (unless --loose), the repo's name or its clone under repos/ is fine
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const root = realpathSync(mkdtempSync(`${tmpdir()}/wt-test-`)), ws = `${root}/ws`, loose = `${root}/loose`;
mkdirSync(`${ws}/repos/app`, { recursive: true }); mkdirSync(loose);
writeFileSync(`${ws}/.factory.json`, JSON.stringify({ repos: [{ kind: "gh", id: "o/app", name: "app" }] }));
for (const d of [`${ws}/repos/app`, loose]) for (const a of [["init", "-q"], ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "i"]]) spawnSync("git", a, { cwd: d });

const plan = (cwd, ...args) => spawnSync("bun", ["-e", 'const { plan } = await import(process.argv[1]); console.log(plan(JSON.parse(process.argv[2]), process.argv[3]).dest)', new URL("./wt.js", import.meta.url).pathname, JSON.stringify(["x", ...args]), cwd], { encoding: "utf8" });

let r = plan(ws, "--in", loose);
assert.notEqual(r.status, 0); assert.match(r.stderr, /--in app/); assert.match(r.stderr, /--loose/);
assert.equal(plan(ws, "--in", "app").stdout.trim(), `${ws}/worktrees/app/x`);
assert.equal(plan(ws, "--in", `${ws}/repos/app`).stdout.trim(), `${ws}/worktrees/app/x`);
assert.equal(plan(ws, "--in", loose, "--loose").status, 0);
assert.equal(plan(root, "--in", loose).status, 0); // outside any workspace: as before

// ports (jw 0.0.58): a worktree gets the lowest free slot, block = 20000 + 100*slot, JW_* in the first pane; without [ports] only JW_WORKSPACE_DIR/JW_NAME
const proj = `${root}/proj`, appHome = `${root}/app-home`;
mkdirSync(proj); writeFileSync(`${proj}/.env`, "A=1");
writeFileSync(`${proj}/.jw.toml`, 'root = "../proj-wt"\ncopy = [".env"]\n[ports]\nweb = 0\nconsole_api = 3\nmetro = 81\n[[env]]\nfile = ".env"\nset = { X = "http://localhost:{port.web}" }\n');
for (const a of [["init", "-q"], ["add", "."], ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "i"]]) spawnSync("git", a, { cwd: proj });
const make = (name, cwd = proj, ...extra) => { // create() = git worktree add + the space.new args; the first pane's environment is read by running its argv with $SHELL = env
  const r = spawnSync("bun", ["-e", 'const { plan, create } = await import(process.argv[1]); console.log(JSON.stringify(create(plan(JSON.parse(process.argv[3]), process.argv[2]))))', new URL("./wt.js", import.meta.url).pathname, cwd, JSON.stringify([name, ...extra])], { encoding: "utf8", env: { ...process.env, HERDR_APP_HOME: appHome } });
  assert.equal(r.status, 0, r.stderr);
  const space = JSON.parse(r.stdout), a = space.argv;
  const env = Object.fromEntries(spawnSync(a[0], a.slice(1), { cwd: space.folder, encoding: "utf8", env: { ...process.env, SHELL: "/usr/bin/env" } }).stdout.split("\n").filter((l) => l.startsWith("JW_")).map((l) => l.split(/=(.*)/s).slice(0, 2)));
  return { space, env };
};
let a = make("one");
assert.deepEqual(a.env, { JW_WORKSPACE_DIR: `${root}/proj-wt/one`, JW_NAME: "one", JW_PORT_BASE: "20000", JW_PORT_WEB: "20000", JW_PORT_CONSOLE_API: "20003", JW_PORT_METRO: "20081" });
assert.equal(readFileSync(`${root}/proj-wt/one/.env`, "utf8"), "A=1"); // [[env]] file is copied, as before
let b = make("two");
assert.equal(b.env.JW_PORT_BASE, "20100"); assert.equal(b.env.JW_PORT_METRO, "20181");
assert.deepEqual(JSON.parse(readFileSync(`${appHome}/data/worktree-wt/slots.json`, "utf8")), { [`${root}/proj-wt/one`]: 0, [`${root}/proj-wt/two`]: 1 });
spawnSync("git", ["worktree", "remove", "--force", `${root}/proj-wt/one`], { cwd: proj });
assert.equal(make("three").env.JW_PORT_BASE, "20000"); // the slot of a worktree that is gone is given back
// without [ports]: nothing but the folder and the name
writeFileSync(`${proj}/.jw.toml`, 'root = "../proj-wt"\n');
assert.deepEqual(make("four").env, { JW_WORKSPACE_DIR: `${root}/proj-wt/four`, JW_NAME: "four" });
for (const n of ["two", "three", "four"]) spawnSync("git", ["worktree", "remove", "--force", `${root}/proj-wt/${n}`], { cwd: proj });
// a repo of a factory workspace may carry its own ports in .factory.toml: they replace the .jw.toml's [ports] (no merge)
writeFileSync(`${ws}/repos/app/.jw.toml`, "[ports]\nweb = 0\nmetro = 81\n");
// (the first part of this test read the old .factory.json; the .factory.toml wins once there is one)
writeFileSync(`${ws}/.factory.toml`, '# my workspace\n[repos.app]\nkind = "gh"\nid = "o/app"\n\n[repos.app.ports]\nweb = 1\napi = 5\n');
const f = make("fac", ws, "--in", "app");
assert.deepEqual(f.env, { JW_WORKSPACE_DIR: `${ws}/worktrees/app/fac`, JW_NAME: "fac", JW_PORT_BASE: "20000", JW_PORT_WEB: "20001", JW_PORT_API: "20005" });
spawnSync("git", ["worktree", "remove", "--force", `${ws}/worktrees/app/fac`], { cwd: `${ws}/repos/app` });
// bad ports there are refused as in a .jw.toml
writeFileSync(`${ws}/.factory.toml`, '[repos.app]\nkind = "gh"\n[repos.app.ports]\nweb = 100\n');
r = spawnSync("bun", ["-e", 'const { plan } = await import(process.argv[1]); plan(["bad", "--in", "app"], process.argv[2])', new URL("./wt.js", import.meta.url).pathname, ws], { encoding: "utf8" });
assert.notEqual(r.status, 0); assert.match(r.stderr, /\.factory\.toml: ports\.web must be/);
console.log("ok");
