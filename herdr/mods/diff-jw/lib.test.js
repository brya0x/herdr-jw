// bun lib.test.js
import assert from "node:assert/strict";
import { parseNumstat, parseStatus, parseNameStatus, parseLog, chooseBase, diffRows, signature, seenKey, isSeen, ago } from "./lib.js";

assert.deepEqual(parseNumstat("3\t1\ta.js\0-\t-\timg.png\0"), { "a.js": { add: 3, del: 1, binary: false }, "img.png": { add: 0, del: 0, binary: true } });
assert.deepEqual(parseNumstat("1\t0\ta\tb.js\0")["a\tb.js"].add, 1); // a tab inside a path
assert.deepEqual(parseStatus(" M a.js\0?? new.js\0D  gone.js\0UU c.js\0A  added.js\0"), [
  { path: "a.js", fresh: false, status: "M" }, { path: "new.js", fresh: true, status: "A" }, { path: "gone.js", fresh: false, status: "D" },
  { path: "c.js", fresh: false, status: "U" }, { path: "added.js", fresh: false, status: "A" }]);
assert.deepEqual(parseNameStatus("M\0a.js\0A\0b.js\0D\0c.js\0"), [{ status: "M", path: "a.js", fresh: false }, { status: "A", path: "b.js", fresh: false }, { status: "D", path: "c.js", fresh: false }]);
assert.deepEqual(parseLog("abc\x1fab\x1ffix: a\x1f100\ndef\x1fde\x1fa subject\x1f50\n"), [{ sha: "abc", short: "ab", subject: "fix: a", time: 100 }, { sha: "def", short: "de", subject: "a subject", time: 50 }]);
assert.equal(chooseBase(["main", "origin/main"], null), "origin/main");
assert.equal(chooseBase(["main", "origin/dev", "origin/main"], "origin/dev"), "origin/dev");
assert.equal(chooseBase(["master"], "origin/gone"), "master");
assert.equal(chooseBase(["feature"], null), null);

// line numbers: a hunk resets them, a removed line moves the old side only
assert.deepEqual(diffRows(["@@ -10,3 +20,3 @@ f", " same", "-old", "+new", "+more"]), [
  { kind: "@", text: "@@ -10,3 +20,3 @@ f" }, { kind: " ", number: 20, text: "same" }, { kind: "-", number: 11, text: "old" }, { kind: "+", number: 21, text: "new" }, { kind: "+", number: 22, text: "more" }]);
assert.equal(diffRows(["+"])[0].text, " "); // an empty line still draws

// seen: the mark follows the file's change; scope and root keep marks apart
const f = { path: "a.js", status: "M", add: 2, del: 1 };
const marks = { [seenKey("/r", "work", "a.js")]: signature(f) };
assert.ok(isSeen(marks, "/r", "work", f));
assert.ok(!isSeen(marks, "/r", "work", { ...f, add: 3 }), "a changed file is not seen any more");
assert.ok(!isSeen(marks, "/r", "branch", f) && !isSeen(marks, "/other", "work", f));

assert.equal(ago(1000, 1000 + 120), "2 min"); assert.equal(ago(0, 7200), "2 h"); assert.equal(ago(0, 86400 * 3), "3 d");
console.log("ok");
