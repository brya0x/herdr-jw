// bun artifact.test.js : the CLI end to end in a scratch HERDR_APP_HOME (outside Herdr, so the workspace is the folder's name)
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync, spawn } from "node:child_process";
import { slug, formatOf, statusOf } from "./lib.js";

assert.equal(slug("Mi Prototipo v2!"), "mi-prototipo-v2"); assert.equal(slug("***"), "artifact");
assert.equal(formatOf("a.HTML"), "html"); assert.equal(formatOf("a.md"), "md"); assert.equal(formatOf("a.txt"), null);
assert.deepEqual([statusOf(null), statusOf({ verdict: "approved" }), statusOf({ verdict: "changes" })], ["pendiente", "aprobado", "cambios"]);

const home = mkdtempSync(`${tmpdir()}/artifacts-`), work = `${home}/proj`; mkdirSync(work);
const env = { ...process.env, HERDR_APP_HOME: home, HC_TERMINAL_ID: "" };
const cli = (...a) => spawnSync("bun", [`${import.meta.dir}/artifact.js`, ...a], { cwd: work, env, encoding: "utf8" });
// spawnSync would block the timer that writes the verdict, so waits run asynchronously
const waitFor = (...a) => new Promise((r) => { const c = spawn("bun", [`${import.meta.dir}/artifact.js`, ...a], { cwd: work, env }); c.on("close", r); });
writeFileSync(`${work}/p.html`, "<h1>hi</h1>"); writeFileSync(`${work}/n.md`, "# n"); writeFileSync(`${work}/x.txt`, "x");

assert.equal(cli("publish", "p.html", "--title", "Landing").stdout.trim(), "p v1");
assert.equal(cli("publish", "p.html").stdout.trim(), "p v2", "same name: a new version");
assert.equal(cli("publish", "n.md", "--kind", "spec").stdout.trim(), "n v1");
assert.match(cli("publish", "x.txt").stderr, /solo \.html y \.md/);
assert.match(cli("publish", "p.html", "--kind", "nope").stderr, /--kind/);
const ls = cli("ls").stdout.trim().split("\n").map((l) => l.split("\t"));
assert.deepEqual(ls.map((r) => [r[0], r[1], r[2], r[3], r[4]]).sort(), [["n", "spec", "pendiente", "v1", "n"], ["p", "prototype", "pendiente", "v2", "Landing"]]);
const dir = `${home}/data/artifacts/proj/p`;
assert.equal(readFileSync(`${dir}/v2.html`, "utf8"), "<h1>hi</h1>");

// wait: nobody answers -> exit 3; a person approves -> 0; asks for changes -> 4 with the note
assert.equal(await waitFor("wait", "p", "--timeout", "1"), 3);
const decide = (n, v) => setTimeout(() => writeFileSync(`${dir}/v${n}.verdict.json`, JSON.stringify(v)), 400);
decide(2, { verdict: "approved", note: "", ts: "t" });
assert.equal(await waitFor("wait", "p", "--timeout", "10"), 0);
assert.equal(JSON.parse(cli("ls", "--json").stdout).find((a) => a.id === "p").status, "aprobado");
// publishing again is a new version, pending again; --wait returns the verdict of that version
const pub = spawn("bun", [`${import.meta.dir}/artifact.js`, "publish", "p.html", "--wait", "--timeout", "10"], { cwd: work, env });
let out = ""; pub.stdout.on("data", (d) => (out += d));
await new Promise((r) => setTimeout(r, 1200)); decide(3, { verdict: "changes", note: "más grande el título", ts: "t" });
const code = await new Promise((r) => pub.on("close", r));
assert.equal(code, 4); assert.ok(out.includes("p v3") && out.includes("más grande el título"));

// at most 20 versions kept
for (let i = 0; i < 20; i++) cli("publish", "n.md");
assert.equal(readdirSync(`${home}/data/artifacts/proj/n`).filter((f) => /^v\d+\.md$/.test(f)).length, 20);
assert.ok(!existsSync(`${home}/data/artifacts/proj/n/v1.md`));

assert.equal(cli("rm", "p").status, 0); assert.ok(!existsSync(dir));
assert.match(cli("rm", "p").stderr, /no hay un artifact/);
console.log("ok");
