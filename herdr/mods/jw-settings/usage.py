#!/usr/bin/env python3
"""What the person's claude has used, read from its transcripts (the rules of jw's N192 usage.rs).

usage.py [--projects DIR] [--rates FILE] [--cache FILE]  ->  JSON on stdout:
  {current, last4, weeks, rows: [{week, project, family, input, cache_read, output, messages, cost?}], unrated}
A message is counted once, keyed by (message id, requestId); a streamed message is written several
times and the copy with the most output is the message. Rates (USD per million tokens) come from the
rates file: {"opus": {"input": 15, "cache_read": 1.5, "output": 75}}; a family with none is unrated.
"""
import argparse, datetime, json, os, sys

HOME = os.path.expanduser("~")
APP = os.environ.get("HERDR_APP_HOME") or os.path.join(HOME, ".config", "herdr-app")
FAMILIES = ("opus", "sonnet", "haiku")


def week_of(day):
    y, w, _ = day.isocalendar()
    return f"{y}-W{w:02d}"


def entries_of(text, project_dir):
    out = []
    for line in text.splitlines():
        if '"usage"' not in line or '"assistant"' not in line:
            continue
        try:
            v = json.loads(line)
            m = v["message"]
            mid, ts, model, u = m["id"], v["timestamp"], m.get("model") or "", m["usage"]
            if v["type"] != "assistant" or not u or model.startswith("<"):
                continue
            week = week_of(datetime.date.fromisoformat(ts[:10]))
        except (KeyError, ValueError, TypeError):
            continue
        n = lambda k: u.get(k) or 0
        out.append([mid, v.get("requestId") or "", week, v.get("cwd") or project_dir,
                    next((f for f in FAMILIES if f in model), "other"),
                    n("input_tokens") + n("cache_creation_input_tokens"), n("cache_read_input_tokens"), n("output_tokens")])
    return out


def scan(projects, cache):
    files = []
    for root, _, names in os.walk(projects):
        files += [os.path.join(root, f) for f in names if f.endswith(".jsonl")]
    cache = {p: c for p, c in cache.items() if p in set(files)}
    once = {}
    for path in sorted(files):
        try:
            st = os.stat(path)
        except OSError:
            continue
        seen = cache.get(path)
        if not seen or seen["len"] != st.st_size or seen["mtime"] != st.st_mtime:
            project_dir = os.path.relpath(path, projects).split(os.sep)[0]
            with open(path, encoding="utf-8", errors="replace") as f:
                seen = cache[path] = {"len": st.st_size, "mtime": st.st_mtime, "entries": entries_of(f.read(), project_dir)}
        for e in seen["entries"]:
            key = (e[0], e[1])
            if key not in once or once[key][7] <= e[7]:
                once[key] = e
    return list(once.values()), cache


def report(entries, rates, today):
    agg = {}
    for _, _, week, project, family, i, c, o in entries:
        r = agg.setdefault((week, project, family), {"week": week, "project": project, "family": family, "input": 0, "cache_read": 0, "output": 0, "messages": 0})
        r["input"] += i; r["cache_read"] += c; r["output"] += o; r["messages"] += 1
    rows = sorted(agg.values(), key=lambda r: (r["week"], r["project"], r["family"]))
    for r in rows:
        rate = rates.get(r["family"])
        if rate:
            r["cost"] = (r["input"] * rate.get("input", 0) + r["cache_read"] * rate.get("cache_read", 0) + r["output"] * rate.get("output", 0)) / 1e6
    return {"current": week_of(today), "last4": [week_of(today - datetime.timedelta(days=7 * k)) for k in range(4)],
            "weeks": sorted({r["week"] for r in rows}), "rows": rows,
            "unrated": sorted({r["family"] for r in rows if r["family"] not in rates})}


def load(path, default):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--projects", default=os.path.join(os.environ.get("CLAUDE_CONFIG_DIR") or os.path.join(HOME, ".claude"), "projects"))
    ap.add_argument("--rates", default=os.path.join(APP, "data", "factory-rates.json"))
    ap.add_argument("--cache", default=os.path.join(APP, "data", "factory-usage-cache.json"))
    a = ap.parse_args()
    entries, cache = scan(a.projects, load(a.cache, {}))
    os.makedirs(os.path.dirname(a.cache), exist_ok=True)
    tmp = f"{a.cache}.{os.getpid()}.tmp"  # one per process: two views may refresh at once
    with open(tmp, "w") as f:
        json.dump(cache, f)
    os.replace(tmp, a.cache)
    json.dump(report(entries, load(a.rates, {}), datetime.datetime.now(datetime.timezone.utc).date()), sys.stdout)


if __name__ == "__main__":
    main()
