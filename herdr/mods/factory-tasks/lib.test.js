// bun lib.test.js
import assert from "node:assert/strict";
import { parse, pick, count, withFinal, pathFor, prompt, FINAL } from "./lib.js";

const md = "- [x] t1 uno\n- [ ] t2 dos (after: t1)\n- [ ] t3 tres (after: t1)\n- [ ] fin x\n";
let t = parse(md);
assert.deepEqual(t.map((x) => [x.id, x.status, x.after]), [["t1", "done", null], ["t2", "todo", ["t1"]], ["t3", "todo", ["t1"]], ["fin", "todo", null]]);
assert.equal(t[1].title, "dos");
assert.deepEqual(count(t), { done: 1, total: 4 });
assert.equal(pick(t).task.id, "t2");

// fin waits for all the others; an order without after: is the order of the file
t = parse("- [x] a x\n- [ ] b x\n- [ ] c x\n- [ ] fin x\n");
assert.equal(pick(t).task.id, "b");
t[1].status = "done"; assert.equal(pick(t).task.id, "c");
t[2].status = "done"; assert.equal(pick(t).task.id, "fin");
t[3].status = "done"; assert.equal(pick(t).stop, "todo listo");

// a blocked task stops the loop and keeps its reason
t = parse("- [!] a x\n  why: falta la clave\n- [ ] b x\n");
assert.equal(pick(t).stop, "tarea bloqueada"); assert.equal(t[0].why, "falta la clave");

// a dependency that never comes stops it instead of spinning
assert.match(pick(parse("- [ ] a x (after: zz)\n")).stop, /ninguna/);
assert.equal(pick(parse("")).stop, "no hay lista");

// withFinal adds fin once
const w = withFinal("- [ ] a x"); assert.equal(withFinal(w), w); assert.ok(w.endsWith(`- [ ] fin ${FINAL}\n`));
assert.equal(pathFor("/d", "/Users/b/ws/x y"), "/d/tasks/_Users_b_ws_x_y.md");
assert.ok(!prompt({ id: "a", title: "hola" }, "/p").includes("\n"));
console.log("ok");
