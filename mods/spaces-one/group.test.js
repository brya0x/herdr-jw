// bun group.test.js : the group state, and the CLI end to end with a fake herdr-app and a scratch repo
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, chmodSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { create, find, remove, moveTo, shift, keyOf } from "./group.js";

const s = { groups: [], grouped: {} };
assert.equal(create(s, " Clientes "), "g1"); assert.equal(create(s, "Interno"), "g2");
assert.deepEqual(s.groups.map((g) => g.name), ["Clientes", "Interno"]);
assert.equal(find(s, "interno").id, "g2"); assert.equal(find(s, "g1").name, "Clientes");
moveTo(s, "/a/.git", find(s, "g1")); moveTo(s, "/b/.git", find(s, "g2")); moveTo(s, "/b/.git", null);
assert.deepEqual(s.grouped, { "/a/.git": "g1" });
shift(s, find(s, "g2"), "up"); assert.deepEqual(s.groups.map((g) => g.id), ["g2", "g1"]);
shift(s, find(s, "g2"), "up"); assert.deepEqual(s.groups.map((g) => g.id), ["g2", "g1"], "the first stays first");
remove(s, find(s, "g1")); assert.deepEqual(s.grouped, {}); assert.equal(create(s, "Otro"), "g3", "ids are not reused while a bigger one exists");

// end to end
const home = mkdtempSync(`${tmpdir()}/groups-`), bin = `${home}/bin`; mkdirSync(bin);
const repo = `${home}/repo`; mkdirSync(repo); mkdirSync(`${home}/ws`);
spawnSync("sh", ["-c", `cd ${repo} && git init -q -b main && git config user.email t@t && git config user.name t && git commit -q --allow-empty -m x && git worktree add -q ${home}/repo-wt -b b`]);
writeFileSync(`${bin}/herdr-app`, `#!/bin/sh\ncat <<'EOF'\n${JSON.stringify({ spaces: [{ id: "sp1", name: "repo", folder: repo, machine: null, tabs: [] }, { id: "sp2", name: "wt", folder: `${home}/repo-wt`, machine: null, tabs: [] }, { id: "sp3", name: "plain", folder: home, machine: null, tabs: [] }, { id: "sp4", name: "ws", folder: `${home}/ws`, machine: null, tabs: [] }] })}\nEOF\n`); chmodSync(`${bin}/herdr-app`, 0o755);
const cli = (...a) => spawnSync("bun", [`${import.meta.dir}/group.js`, ...a], { env: { ...process.env, HERDR_APP_HOME: home, PATH: `${bin}:${process.env.PATH}` }, encoding: "utf8" });
assert.equal(cli("new", "Clientes").stdout.trim(), "g1");
assert.match(cli("new", "clientes").stderr, /ya hay un grupo/);
assert.equal(cli("move", "repo", "Clientes").status, 0);
const ls = (n) => JSON.parse(cli("ls", "--json").stdout).find((g) => g.id === n).spaces;
assert.deepEqual(ls("g1"), ["repo", "wt"], "a worktree is in its repo's group");
assert.deepEqual(ls(null), ["plain", "ws"]);
assert.match(cli("move", "nope", "g1").stderr, /no hay un space/); assert.match(cli("move", "repo", "zzz").stderr, /no hay un grupo/);
assert.equal(cli("rename", "g1", "Cuentas").status, 0); assert.equal(find(JSON.parse(readFileSync(`${home}/data/groups/groups.json`, "utf8")), "cuentas").id, "g1");
assert.equal(cli("move", "wt").status, 0); assert.deepEqual(ls(null), ["repo", "wt", "plain", "ws"], "taking a worktree out takes its repo out");
assert.equal(cli("rm", "Cuentas").status, 0); assert.deepEqual(ls(null), ["repo", "wt", "plain", "ws"]);
// a factory workspace's repos follow the workspace's group
writeFileSync(`${home}/ws/.factory.json`, JSON.stringify({ repos: [{ name: "repo", kind: "dir", path: realpathSync(repo) }] }));
cli("new", "Fabrica"); cli("move", "ws", "Fabrica");
assert.deepEqual(ls("g1"), ["wt", "ws"], "a worktree of a repo the workspace lists follows the workspace, not its repo");
assert.equal(keyOf(`${home}/repo-wt`), `${realpathSync(repo)}/.git`);
console.log("ok");
