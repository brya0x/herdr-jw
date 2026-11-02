#!/usr/bin/env python3
"""When a claude started in each folder and how often the person spoke to it.

flow.py DIR...  ->  JSON on stdout: {DIR: {"first": ISO time or null, "humans": N}}
A folder's transcripts are the ones in ~/.claude/projects/<folder with every non-alphanumeric as "-">.
A human turn is a user message that is plain text: not a tool result, not a sub-agent's, not a command,
not an `<hc ...>` message from another agent.
"""
import json, os, re, sys

HOME = os.path.expanduser("~")
PROJECTS = os.path.join(os.environ.get("CLAUDE_CONFIG_DIR") or os.path.join(HOME, ".claude"), "projects")
NOT_HUMAN = ("<", "Caveat:")


def human(v):
    if v.get("type") != "user" or v.get("isMeta") or v.get("isSidechain"):
        return False
    c = (v.get("message") or {}).get("content")
    if isinstance(c, list):
        c = next((b.get("text", "") for b in c if isinstance(b, dict) and b.get("type") == "text"), None)
    return isinstance(c, str) and bool(c.strip()) and not c.lstrip().startswith(NOT_HUMAN)


def of_dir(folder):
    first, humans = None, 0
    for name in os.listdir(folder) if os.path.isdir(folder) else []:
        if not name.endswith(".jsonl"):
            continue
        with open(os.path.join(folder, name), encoding="utf-8", errors="replace") as f:
            for line in f:
                if '"timestamp"' not in line:
                    continue
                try:
                    v = json.loads(line)
                except ValueError:
                    continue
                ts = v.get("timestamp")
                if isinstance(ts, str) and (first is None or ts < first):
                    first = ts
                humans += human(v)
    return {"first": first, "humans": humans}


def main(paths):
    return {p: of_dir(os.path.join(PROJECTS, re.sub(r"[^A-Za-z0-9]", "-", p))) for p in paths}


if __name__ == "__main__":
    json.dump(main(sys.argv[1:]), sys.stdout)
