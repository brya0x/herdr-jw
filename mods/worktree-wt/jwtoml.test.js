// bun jwtoml.test.js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse, rootOf, folderOf, validFolder, setupScript } from "./jwtoml.js";
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
console.log("ok");
