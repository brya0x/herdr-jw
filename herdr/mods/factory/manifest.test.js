// bun manifest.test.js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseManifest, reposOf, repoBlock, toToml, addToToml, dropFromToml } from "./manifest.js";

const repos = [
  { name: "jitsubai", kind: "dir", path: "/code/jitsubai", ports: { web: 0, metro: 81 } },
  { name: "app", kind: "gh", id: "o/app" },
  { name: "a.b", kind: "gh", id: "o/a.b" },
];
// what is written is read back, ports and a name that needs quotes included
assert.deepEqual(parseManifest(toToml(repos)), repos);
assert.equal(repoBlock(repos[0]), '[repos.jitsubai]\nkind = "dir"\npath = "/code/jitsubai"\n\n[repos.jitsubai.ports]\nweb = 0\nmetro = 81\n');
// comments, blank lines, single quotes, a # inside a string
const text = '# mine\n[repos.x]  # the first\nkind = "dir"\npath = \'/a/b\'\nnote = "a # b"\n\n[repos.x.ports]\nweb = 2 # here\n';
assert.deepEqual(parseManifest(text), [{ name: "x", kind: "dir", path: "/a/b", note: "a # b", ports: { web: 2 } }]);
// adding keeps the text, removing drops only that repo's tables
const added = addToToml(text, { name: "y", kind: "gh", id: "o/y" });
assert.ok(added.startsWith(text) && parseManifest(added).map((r) => r.name).join() === "x,y");
assert.equal(dropFromToml(added, "x"), '# mine\n[repos.y]\nkind = "gh"\nid = "o/y"\n');
assert.equal(dropFromToml(`# top\n${toToml(repos)}`, "app").includes("[repos.app]"), false);
assert.deepEqual(parseManifest(dropFromToml(toToml(repos), "app")), [repos[0], repos[2]]);
assert.deepEqual(parseManifest(dropFromToml(toToml(repos), "jitsubai")), [repos[1], repos[2]], "its ports go with it");
assert.deepEqual(parseManifest(dropFromToml(addToToml("", repos[1]), "app")), []);
// refusals, with the line
assert.throws(() => parseManifest("[repos.x]\nkind = 1.5"), /line 2/);
assert.throws(() => parseManifest("kind = 1"), /line 1/);
assert.throws(() => parseManifest("[repos.x.ports]\nweb = 1"), /comes before/);
assert.throws(() => parseManifest("[repos.x]\n[repos.x]"), /twice/);
// the old json is read as it is; the toml wins when both are there; neither is null
assert.deepEqual(reposOf(null, '{"repos":[{"name":"o","kind":"dir","path":"/p"}]}'), [{ name: "o", kind: "dir", path: "/p" }]);
assert.deepEqual(reposOf("[repos.n]\nkind = \"gh\"\n", '{"repos":[{"name":"o"}]}'), [{ name: "n", kind: "gh" }]);
assert.equal(reposOf(null, null), null);
// the copies the other mods read are this file
for (const m of ["spaces-one", "worktree-wt"]) assert.equal(readFileSync(new URL(`../${m}/manifest.js`, import.meta.url), "utf8"), readFileSync(new URL("./manifest.js", import.meta.url), "utf8"), `${m}/manifest.js is a copy: run sync.sh push`);
console.log("ok");
