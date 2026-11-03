// bun wt.test.js
// --in inside a factory workspace: a loose checkout is refused (unless --loose), the repo's name or its clone under repos/ is fine
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync } from "node:fs";
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
console.log("ok");
