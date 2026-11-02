// bun jwtoml.test.js
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, realpathSync } from "node:fs";
import { parse, rootOf, folderOf, validFolder, setupScript, paneArgv, factoryRoot, factoriesOf, ancestorsOf, personalKey, personalFile } from "./jwtoml.js";
import { spawnSync } from "node:child_process";
const real = (p) => readFileSync(`${process.env.HOME}/ws/sales-assist/${p}/.jw.toml`, "utf8");

// the two real files: setup only, kanvas also copies its .env, open is shell
let c = parse(real("kanvas-ecosystem-api"));
assert.deepEqual(c.setup, ["composer install"]); assert.deepEqual(c.copy, [".env"]); assert.equal(c.open, "shell");
c = parse(real("design-studio"));
assert.deepEqual(c.setup, ["bun install --frozen-lockfile"]); assert.deepEqual(c.copy, []);

// keys, comments inside strings, multi-line arrays, ports
c = parse('root = "~/wt"  # c\nopen = "claude"\ncopy = [".env", # x\n  "a/b#c"]\nsetup = ["echo {name} {branch}"]\n[ports]\nweb = 1\n[agent]\ndefault = "claude"');
assert.deepEqual([c.root, c.open, c.copy, c.ports], ["~/wt", "claude", [".env", "a/b#c"], { web: 1 }]);
assert.equal(setupScript(c, "x", "it's"), "echo 'x' 'it'\\''s'");

// jw's refusals, with the line
assert.throws(() => parse('open = "agent"'), /open/);
assert.throws(() => parse('setup = ["{x}"]'), /\{x\}/);
assert.throws(() => parse('copy = ["../x"]'), /inside the repo/);
assert.throws(() => parse("a = 1\nnonsense"), /line 2/);
assert.throws(() => parse('setup = ["a"'), /unterminated array/);

// where a worktree goes
const cfg = (root) => ({ root });
assert.equal(rootOf(cfg(""), "/r/app", "/h"), "/r/app-wt");
assert.equal(rootOf(cfg("~/wt"), "/r/app", "/h"), "/h/wt");
assert.equal(rootOf(cfg("../w"), "/r/app", "/h"), "/r/w");
assert.equal(folderOf("feat/login"), "login");
assert.ok(validFolder("login") && !validFolder("..") && !validFolder("a\\b") && !validFolder("x".repeat(81)));
// what the first pane runs: nothing special without setup; with it, setup first, claude only if it worked, a failure logged
assert.equal(paneArgv({ setup: "", claude: false, task: "", log: "/l" }), undefined);
assert.deepEqual(paneArgv({ setup: "", claude: true, task: "t", log: "/l" }), ["claude"]);
const sh = (a, dir) => spawnSync(a[0], [...a.slice(1)], { cwd: dir, encoding: "utf8", env: { ...process.env, SHELL: "/bin/echo" } });
const dir = `${process.env.TMPDIR ?? "/tmp"}/paneargv-${process.pid}`;
spawnSync("mkdir", ["-p", dir]);
const bin = `${dir}/claude`; spawnSync("sh", ["-c", `printf '#!/bin/sh\\necho claude "$@"\\n' > ${bin} && chmod +x ${bin}`]);
const withBin = { ...process.env, PATH: `${dir}:${process.env.PATH}` };
const runIt = (o) => spawnSync(...[paneArgv({ log: `${dir}/fail.log`, ...o })].map((a) => [a[0], a.slice(1)])[0], { cwd: dir, encoding: "utf8", env: withBin });
assert.equal(runIt({ setup: "true", claude: true, task: "do it" }).stdout.trim(), "claude do it");
const bad = runIt({ setup: "sh -c 'exit 3'", claude: true, task: "x" });
assert.equal(bad.status, 3); assert.ok(!bad.stdout.includes("claude"));
assert.match(readFileSync(`${dir}/fail.log`, "utf8"), /\t3\tsh -c 'exit 3'\n$/);
spawnSync("rm", ["-rf", dir]);
// inline tables (the old jw wrote them in [[env]] and [layout]) are skipped, the keys around them still read
const inline = parse('setup = ["a"]\n[[env]]\nfile = "x/.env"\nset = { A = "http://localhost:{port.x}" }\n[layout]\nsplit = "right"\na = { run = "editor" }\nratio = 0.5\n');
assert.deepEqual(inline.copy, ["x/.env"]); assert.deepEqual(inline.setup, ["a"]);
// jw's personal file of a repository: named by its origin (REQ-483)
assert.equal(personalKey("https://github.com/dealerappcenter/jitsubai.git", "/x"), "github.com_dealerappcenter_jitsubai");
assert.equal(personalKey("git@github.com:Brya0x/JW.git", "/x"), "github.com_brya0x_jw");
assert.equal(personalKey("ssh://git@github.com/o/r", "/x"), "github.com_o_r");
assert.equal(personalKey("", "/Users/a/b"), "local__Users_a_b");
assert.equal(personalFile("/h", "https://github.com/o/r.git", "/x"), "/h/.config/jw/projects/github.com_o_r.toml");
// a repo of a factory workspace gets its worktrees in <workspace>/worktrees/<name>, even when the repo is a link to a folder outside it
// and wt.js runs from another folder (it used to fall back to <repo>-wt)
assert.deepEqual(ancestorsOf("/a/b"), ["/a/b", "/a", "/"]);
assert.equal(factoryRoot("/code/app", [{ ws: "/ws/x", repos: [{ name: "api", real: "/code/api" }] }, { ws: "/ws/y", repos: [{ name: "app", real: "/code/app" }] }]), "/ws/y/worktrees/app");
assert.equal(factoryRoot("/code/other", [{ ws: "/ws/y", repos: [{ name: "app", real: "/code/app" }] }]), null);
{
  const T = realpathSync(mkdtempSync(`${process.env.TMPDIR ?? "/tmp"}/wt-fac-`));
  const sh2 = (c) => spawnSync("sh", ["-c", c], { encoding: "utf8" });
  sh2(`mkdir -p ${T}/code/app ${T}/ws/wsA/worktrees ${T}/ws/wsA/repos && git -C ${T}/code/app init -q && git -C ${T}/code/app -c user.email=a@b -c user.name=t commit -q --allow-empty -m i && ln -s ${T}/code/app ${T}/ws/wsA/repos/app`);
  writeFileSync(`${T}/ws/wsA/.factory.json`, JSON.stringify({ repos: [{ kind: "dir", name: "app", path: `${T}/code/app` }] }));
  const wt = spawnSync("bun", [new URL("./wt.js", import.meta.url).pathname, "feat/x", "--in", `${T}/code/app`, "--print"], { cwd: T, encoding: "utf8", env: { ...process.env, HOME: T } });
  assert.equal(JSON.parse(wt.stdout).folder, `${T}/ws/wsA/worktrees/app/x`);
  // the dialog's way: the same lookup through its own read and real, with the repo reached through the workspace's link
  const readF = async (p) => readFileSync(p, "utf8");
  const realF = async (p) => { try { return realpathSync(p); } catch { return ""; } };
  const fs2 = await factoriesOf([`${T}/ws/nothing`, `${T}/ws/wsA`], readF, realF);
  assert.equal(factoryRoot(realpathSync(`${T}/ws/wsA/repos/app`), fs2), `${T}/ws/wsA/worktrees/app`);
  // a repo with no .jw.toml but jw's personal file for its origin: its copy and setup apply (the personal layer used to be ignored)
  sh2(`git -C ${T}/code/app remote add origin https://github.com/o/r.git && printf SECRET > ${T}/code/app/.env.local && mkdir -p ${T}/.config/jw/projects`);
  writeFileSync(`${T}/.config/jw/projects/github.com_o_r.toml`, 'match = "x"\nsetup = ["echo built"]\ncopy = [".env.local"]\n');
  const wt2 = spawnSync("bun", [new URL("./wt.js", import.meta.url).pathname, "feat/y", "--in", `${T}/code/app`, "--print"], { cwd: T, encoding: "utf8", env: { ...process.env, HOME: T } });
  const made = JSON.parse(wt2.stdout);
  assert.equal(readFileSync(`${made.folder}/.env.local`, "utf8"), "SECRET");
  assert.ok(JSON.stringify(made.argv ?? []).includes("echo built"), "the personal setup runs");
  spawnSync("rm", ["-rf", T]);
}
console.log("ok");
