// The pure part of the diff viewer: what git prints in, rows and marks out. diff.js does the reading and the drawing.

// `git diff --numstat -z --no-renames`: "add\tdel\tpath\0" per file (binary files print "-" for both numbers).
export function parseNumstat(text) {
  const stats = {};
  for (const entry of text.split("\0")) {
    const [a, d, ...parts] = entry.split("\t");
    if (!parts.length) continue;
    const path = parts.join("\t"), old = stats[path] ?? { add: 0, del: 0 };
    stats[path] = { add: old.add + (Number(a) || 0), del: old.del + (Number(d) || 0), binary: a === "-" };
  }
  return stats;
}

// `git status --porcelain=v1 -z --no-renames --untracked-files=all`: the files of the working tree; A is also an untracked file.
export function parseStatus(text) {
  return text.split("\0").filter(Boolean).map((entry) => {
    const xy = entry.slice(0, 2), path = entry.slice(3), fresh = xy === "??";
    const conflict = xy.includes("U") || xy === "AA" || xy === "DD";
    return { path, fresh, status: conflict ? "U" : xy.includes("D") ? "D" : fresh || xy.includes("A") ? "A" : "M" };
  });
}

// `git diff --name-status -z --no-renames` (or `git show` with it): "S\0path\0" per file.
export function parseNameStatus(text) {
  const parts = text.split("\0").filter(Boolean), out = [];
  for (let i = 0; i + 1 < parts.length; i += 2) out.push({ status: parts[i][0] === "U" ? "U" : parts[i][0], path: parts[i + 1], fresh: false });
  return out;
}

// `git log --format=%H%x1f%h%x1f%s%x1f%ct`: one commit per line.
export function parseLog(text) {
  return text.split("\n").filter(Boolean).map((line) => {
    const [sha, short, subject, time] = line.split("\x1f");
    return { sha, short, subject, time: Number(time) || 0 };
  });
}

// The branch the changes are counted from: what origin/HEAD says, else the first of the usual names that exists.
export function chooseBase(refs, originHead) {
  const have = new Set(refs);
  if (originHead && have.has(originHead)) return originHead;
  return ["origin/main", "origin/master", "main", "master"].find((r) => have.has(r)) ?? null;
}

// Numbers each diff line once, so a frame only draws the rows on screen.
export function diffRows(lines) {
  let old = 0, next = 0;
  return lines.map((line) => {
    const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
    if (match) { old = +match[1]; next = +match[2]; return { kind: "@", text: line }; }
    const kind = line[0];
    if (kind === "-") return { kind, number: old++, text: line.slice(1) || " " };
    if (kind === "+") return { kind, number: next++, text: line.slice(1) || " " };
    if (kind === " ") { old++; return { kind, number: next++, text: line.slice(1) || " " }; }
    return { kind: "", text: line };
  });
}

// A file marked as seen stays seen until its change differs.
// shortcut: the mark compares status and counts, not the text, so an edit that keeps both numbers the same keeps the mark; hash the diff if that bites.
export const signature = (f) => `${f.status}:${f.add}:${f.del}`;
export const seenKey = (root, scope, path) => `${root}\t${scope}\t${path}`;
export const isSeen = (marks, root, scope, f) => marks[seenKey(root, scope, f.path)] === signature(f);

// "3 h", "2 d": how long ago a commit is
export function ago(seconds, now = Date.now() / 1000) {
  const s = Math.max(0, now - seconds);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86400)} d`;
}

// The rows as they are drawn: a long line goes on in the rows that follow (marked `cont`), or is cut when wrapping is off.
export function wrapRows(rows, width, wrap) {
  const w = Math.max(10, width), out = [];
  for (const r of rows) {
    if (r.kind === "@" || !wrap || r.text.length <= w) { out.push(r); continue; }
    for (let i = 0; i < r.text.length; i += w) out.push(i === 0 ? { ...r, text: r.text.slice(0, w) } : { kind: r.kind, cont: true, text: r.text.slice(i, i + w) });
  }
  return out;
}

// The diff as GitHub's side by side view: each row has an old side (left) and a new side (right). A run of removed lines and the added
// lines that follow it are paired in order (the longer one leaves the other side empty); a context line is on both sides.
export function splitRows(lines) {
  const out = []; let old = 0, next = 0, dels = [], adds = [];
  const flush = () => { const n = Math.max(dels.length, adds.length); for (let i = 0; i < n; i++) out.push({ kind: "pair", left: dels[i] ?? null, right: adds[i] ?? null }); dels = []; adds = []; };
  for (const line of lines) {
    const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
    if (m) { flush(); old = +m[1]; next = +m[2]; out.push({ kind: "@", text: line }); continue; }
    const k = line[0], text = line.slice(1) || " ";
    if (k === "-") dels.push({ number: old++, text });
    else if (k === "+") adds.push({ number: next++, text });
    else if (k === " ") { flush(); out.push({ kind: "pair", context: true, left: { number: old++, text }, right: { number: next++, text } }); }
    else { flush(); out.push({ kind: "", text: line }); }
  }
  flush();
  return out;
}
