// bun jwtoml.test.js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse, rootOf, folderOf, validFolder, setupScript, paneArgv } from "./jwtoml.js";
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
assert.throws(() => parse('copy = ["../x"]'), /dentro del repo/);
assert.throws(() => parse("a = 1\nnonsense"), /línea 2/);
assert.throws(() => parse('setup = ["a"'), /array sin cerrar/);

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
console.log("ok");
