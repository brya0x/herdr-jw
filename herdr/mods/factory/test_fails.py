# python3 test_fails.py
import json, os, tempfile, time
from datetime import datetime, timezone
import fails

now = datetime.fromtimestamp(time.time(), timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
old = "2020-01-01T00:00:00.000Z"
n = [0]
def pair(cmd, err, ts=now, name="Bash", sidechain=False):
    n[0] += 1
    i = f"u{n[0]}"
    return [
        {"type": "assistant", "timestamp": ts, "isSidechain": sidechain, "message": {"content": [{"type": "tool_use", "id": i, "name": name, "input": {"command": cmd}}]}},
        {"type": "user", "timestamp": ts, "isSidechain": sidechain, "message": {"content": [{"type": "tool_result", "tool_use_id": i, "is_error": err is not None, "content": err or "ok"}]}},
    ]

def run(sessions):
    with tempfile.TemporaryDirectory() as d:
        fails.PROJECTS = d
        os.makedirs(os.path.join(d, "-tmp-x"))
        for k, lines in enumerate(sessions):
            with open(os.path.join(d, "-tmp-x", f"s{k}.jsonl"), "w") as f:
                f.write("\n".join(json.dumps(v) for v in lines) + "\nnot json\n")
        return fails.main(["/tmp/x", "/nowhere"])

# a session that ends on a failure: pending
out = run([pair("ls", None) + pair("composer install", "Exit code 1\nClass Redis not found")])
assert [(r["cmd"], r["kind"], r["count"]) for r in out["/tmp/x"]] == [("composer install", "pending", 1)], out
assert out["/nowhere"] == []
# failed then something else ran after: fixed, not shown
assert run([pair("npm test", "Exit code 1\nboom") + pair("ls", None)])["/tmp/x"] == []
# the same command failing 3 times is repeated even if the session moved on
rep = run([pair("make", "Exit code 2\nerror") * 3 + pair("ls", None)])["/tmp/x"]
assert [(r["kind"], r["count"]) for r in rep] == [("repeated", 3)], rep
# noise: bare exit code, old failures, other tools, sub-agents
assert run([pair("grep x y", "Exit code 1")])["/tmp/x"] == []
assert run([pair("sleep 9; ls", "<tool_use_error>Blocked: sleep</tool_use_error>")])["/tmp/x"] == [], "harness refusals are not failures"
assert run([pair("npm test", "Exit code 1\nboom", ts=old)])["/tmp/x"] == []
assert run([pair("Read", "no such file", name="Read")])["/tmp/x"] == []
assert run([pair("npm test", "Exit code 1\nboom", sidechain=True)])["/tmp/x"] == []
print("ok")
