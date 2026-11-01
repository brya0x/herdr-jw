#!/usr/bin/env python3
"""The shell commands claude failed on in each folder, recently.

fails.py DIR...  ->  JSON on stdout: {DIR: [{"ts", "cmd", "err", "kind", "count"}]}, newest first, at most 8 each.
kind "pendiente": the session's last tool call failed, so nobody fixed it. kind "repetido": the same command failed 3+ times.
An exit code with no message ("Exit code 1" alone: grep with no match, a test that said nothing) and a call the harness refused are not failures here.
"""
import json, os, re, sys, time
from datetime import datetime, timezone

HOME = os.path.expanduser("~")
PROJECTS = os.path.join(os.environ.get("CLAUDE_CONFIG_DIR") or os.path.join(HOME, ".claude"), "projects")
DAYS = 7
REPEATS = 3


def text(c):
    if isinstance(c, list):
        c = "\n".join(b.get("text", "") for b in c if isinstance(b, dict))
    return c if isinstance(c, str) else ""


def meaningful(err):
    # a <tool_use_error> is the harness refusing the call (blocked, denied), not the command failing
    return not err.startswith("<tool_use_error>") and bool(re.sub(r"^Exit code \d+\s*", "", err).strip())


def session(path, since):
    """[(ts, cmd, err, is_last)] for the Bash failures of one transcript."""
    uses, calls, out = {}, 0, []
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            if '"tool_' not in line:
                continue
            try:
                v = json.loads(line)
            except ValueError:
                continue
            c = (v.get("message") or {}).get("content")
            if v.get("isSidechain") or not isinstance(c, list):
                continue
            for b in c:
                if not isinstance(b, dict):
                    continue
                if b.get("type") == "tool_use":
                    uses[b.get("id")] = b
                elif b.get("type") == "tool_result":
                    calls += 1
                    u = uses.get(b.get("tool_use_id"))
                    err = text(b.get("content")).strip()
                    ts = v.get("timestamp") or ""
                    if u and u.get("name") == "Bash" and b.get("is_error") and meaningful(err) and ts >= since:
                        out.append([ts, str((u.get("input") or {}).get("command", "")), err, calls])
    return [(ts, cmd, err, n == calls) for ts, cmd, err, n in out]


def of_dir(folder, since):
    found = []
    for name in os.listdir(folder) if os.path.isdir(folder) else []:
        if name.endswith(".jsonl") and os.path.getmtime(os.path.join(folder, name)) >= time.time() - DAYS * 86400:
            found += session(os.path.join(folder, name), since)
    runs = {}
    for ts, cmd, err, last in found:
        key = " ".join(cmd.split())[:80]
        runs.setdefault(key, []).append((ts, cmd, err, last))
    rows = []
    for items in runs.values():
        items.sort()
        ts, cmd, err, _ = items[-1]
        last = any(i[3] for i in items)
        if last or len(items) >= REPEATS:
            rows.append({"ts": ts, "cmd": cmd[:300], "err": err[:600], "kind": "pendiente" if last else "repetido", "count": len(items)})
    return sorted(rows, key=lambda r: r["ts"], reverse=True)[:8]


def main(paths):
    since = datetime.fromtimestamp(time.time() - DAYS * 86400, timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    return {p: of_dir(os.path.join(PROJECTS, re.sub(r"[^A-Za-z0-9]", "-", p)), since) for p in paths}


if __name__ == "__main__":
    json.dump(main(sys.argv[1:]), sys.stdout)
