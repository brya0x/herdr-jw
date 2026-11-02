#!/usr/bin/env bun
// jw's `jw artifact` for Herdr, local: an agent publishes an HTML or Markdown file for the person to look at and decide on
// (the panel, cmd-shift-a: Open, Approve, Request changes); `wait` returns when they do. Exit: 0 approved, 4 changes (the note on
// stdout), 3 timeout, 1 error.
//   bun artifact.js publish <file> [--name N] [--title T] [--kind prototype|document|report|spec] [--wait [--timeout S]]
//   bun artifact.js ls [--all] [--json]      bun artifact.js wait <id> [--timeout S]      bun artifact.js rm <id>
// The workspace is the space of the terminal you run it in (HC_TERMINAL_ID); outside Herdr, the current folder's name.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";
import { KINDS, MAX_VERSIONS, slug, formatOf, latest, statusOf, verdictFile, versionFile } from "./lib.js";

const die = (m, code = 1) => { console.error(`artifact: ${m}`); process.exit(code); };
const ROOT = `${process.env.HERDR_APP_HOME ?? `${homedir()}/.config/herdr-app`}/data/artifacts`;
const readJson = (f) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; } };

function here() {
  const t = process.env.HC_TERMINAL_ID;
  if (t) {
    const r = spawnSync("herdr-app", ["ls"], { encoding: "utf8" });
    try { const s = JSON.parse(r.stdout).spaces.find((s) => s.tabs.some((tab) => tab.terminals.some((x) => x.terminal === t))); if (s) return { key: `${slug(s.name)}-${s.id.slice(2, 8)}`, space: { id: s.id, name: s.name, folder: s.folder }, terminal: t }; } catch { /* not in Herdr after all */ }
  }
  return { key: slug(basename(process.cwd())), space: { id: null, name: basename(process.cwd()), folder: process.cwd() }, terminal: t ?? null };
}

function all(key) {
  const out = [];
  for (const k of key ? [key] : existsSync(ROOT) ? readdirSync(ROOT) : []) {
    for (const id of existsSync(`${ROOT}/${k}`) ? readdirSync(`${ROOT}/${k}`) : []) {
      const dir = `${ROOT}/${k}/${id}`, meta = readJson(`${dir}/meta.json`);
      if (meta) out.push({ dir, meta, verdict: readJson(verdictFile(dir, latest(meta).n)) });
    }
  }
  return out.sort((a, b) => latest(b.meta).ts.localeCompare(latest(a.meta).ts));
}

async function wait(dir, n, seconds) {
  const end = seconds ? Date.now() + seconds * 1000 : Infinity;
  for (;;) {
    const v = readJson(verdictFile(dir, n));
    if (v) { if (v.note) console.log(v.note); process.exit(v.verdict === "approved" ? 0 : 4); }
    if (Date.now() >= end) die("timed out without an answer", 3);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

export function opts(argv, flags, values) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (flags.includes(a)) o[a.slice(2)] = true;
    else if (values.includes(a)) o[a.slice(2)] = argv[++i] ?? die(`${a} necesita un valor`);
    else if (a.startsWith("--")) die(`unknown option: ${a}`);
    else o._.push(a);
  }
  return o;
}

async function main([cmd, ...rest]) {
  const w = here();
  if (cmd === "publish") {
    const o = opts(rest, ["--wait"], ["--name", "--title", "--kind", "--timeout"]);
    const file = o._[0] && resolve(o._[0]);
    if (o._.length !== 1) die("uso: publish <file> [--name N] [--title T] [--kind K] [--wait [--timeout S]]");
    if (!existsSync(file)) die(`no existe ${file}`);
    const format = formatOf(file) ?? die("solo .html y .md");
    if (o.kind && !KINDS.includes(o.kind)) die(`--kind: ${KINDS.join(", ")}`);
    const id = slug(o.name ?? basename(file).replace(/\.[^.]+$/, "")), dir = `${ROOT}/${w.key}/${id}`;
    mkdirSync(dir, { recursive: true });
    const meta = readJson(`${dir}/meta.json`) ?? { id, title: o.title ?? o.name ?? id, kind: o.kind ?? (format === "html" ? "prototype" : "document"), space: w.space, versions: [] };
    if (o.title) meta.title = o.title; if (o.kind) meta.kind = o.kind;
    meta.terminal = w.terminal;
    const v = { n: meta.versions.length ? latest(meta).n + 1 : 1, format, ts: new Date().toISOString() };
    copyFileSync(file, versionFile(dir, v));
    meta.versions.push(v);
    while (meta.versions.length > MAX_VERSIONS) {
      const old = meta.versions.shift();
      rmSync(versionFile(dir, old), { force: true }); rmSync(verdictFile(dir, old.n), { force: true });
    }
    writeFileSync(`${dir}/meta.json`, JSON.stringify(meta, null, 2) + "\n");
    console.log(`${id} v${v.n}`);
    if (o.wait) await wait(dir, v.n, Number(o.timeout) || 0);
  } else if (cmd === "ls") {
    const o = opts(rest, ["--all", "--json"], []);
    const list = all(o.all ? null : w.key);
    if (o.json) console.log(JSON.stringify(list.map((a) => ({ ...a.meta, status: statusOf(a.verdict), note: a.verdict?.note ?? null, file: versionFile(a.dir, latest(a.meta)) }))));
    else for (const a of list) console.log([a.meta.id, a.meta.kind, statusOf(a.verdict), `v${latest(a.meta).n}`, a.meta.title, ...(o.all ? [a.meta.space.name] : [])].join("\t"));
  } else if (cmd === "wait") {
    const o = opts(rest, [], ["--timeout"]);
    if (o._.length !== 1) die("uso: wait <id> [--timeout S]");
    const a = all(w.key).find((a) => a.meta.id === o._[0]) ?? die(`no artifact "${o._[0]}" in this workspace`);
    await wait(a.dir, latest(a.meta).n, Number(o.timeout) || 0);
  } else if (cmd === "rm") {
    if (rest.length !== 1) die("uso: rm <id>");
    const a = all(w.key).find((a) => a.meta.id === rest[0]) ?? die(`no artifact "${rest[0]}" in this workspace`);
    rmSync(a.dir, { recursive: true });
  } else die("uso: publish <file> | ls [--all] [--json] | wait <id> [--timeout S] | rm <id>");
}

if (import.meta.main) await main(process.argv.slice(2));
