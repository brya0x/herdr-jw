#!/usr/bin/env python3
# The same case as jw's tests/usage.rs: a streamed message written twice counts once.
import datetime, json, os, subprocess, sys, tempfile
here = os.path.dirname(os.path.abspath(__file__))
d = tempfile.mkdtemp()
proj = os.path.join(d, "projects", "-code-app"); os.makedirs(proj)
line = lambda i, model, out: json.dumps({"type": "assistant", "timestamp": "2026-10-29T10:00:00Z", "cwd": "/code/app", "requestId": f"r-{i}",
    "message": {"id": i, "model": model, "usage": {"input_tokens": 10, "cache_creation_input_tokens": 90, "cache_read_input_tokens": 1000, "output_tokens": out}}})
open(os.path.join(proj, "s.jsonl"), "w").write("\n".join([line("m1", "claude-opus-5-5", 1000), line("m1", "claude-opus-5-5", 4000), line("m2", "claude-sonnet-5-5", 500), "not json", '{"usage" "assistant"}']))
run = lambda: json.loads(subprocess.run([sys.executable, "-I", os.path.join(here, "usage.py"), "--projects", os.path.join(d, "projects"), "--rates", os.path.join(d, "rates.json"), "--cache", os.path.join(d, "cache.json")], check=True, capture_output=True, text=True).stdout)
r = run()
assert r["weeks"] == ["2026-W44"] and r["unrated"] == ["opus", "sonnet"], r
opus = next(x for x in r["rows"] if x["family"] == "opus")
assert (opus["project"], opus["input"], opus["cache_read"], opus["output"], opus["messages"]) == ("/code/app", 100, 1000, 4000, 1), opus
assert "cost" not in opus
json.dump({"opus": {"input": 10, "cache_read": 1, "output": 50}}, open(os.path.join(d, "rates.json"), "w"))
r = run()  # second run reads the cache and the rates afresh
opus = next(x for x in r["rows"] if x["family"] == "opus")
assert r["unrated"] == ["sonnet"] and abs(opus["cost"] - 0.202) < 1e-9, r
assert datetime.date.today().isocalendar()[1] and len(r["last4"]) == 4
print("ok")
