# python3 test_flow.py
import json, os, tempfile
import flow

H = lambda text, **k: {"type": "user", "timestamp": "2026-01-02T00:00:00Z", "message": {"content": text}, **k}
lines = [
    H("hola"),                                                                    # human
    H([{"type": "text", "text": "otra"}]),                                        # human, block form
    H([{"type": "tool_result", "content": "x"}]),                                 # tool result
    H("<command-name>/clear</command-name>"),                                     # command
    H('<hc from="t1">hi</hc>'),                                                   # another agent
    H("sub", isSidechain=True),                                                   # sub-agent
    H("meta", isMeta=True),
    {"type": "assistant", "timestamp": "2026-01-01T00:00:00Z", "message": {}},    # earliest
]
with tempfile.TemporaryDirectory() as d:
    flow.PROJECTS = d
    os.makedirs(os.path.join(d, "-tmp-x-y"))
    with open(os.path.join(d, "-tmp-x-y", "s.jsonl"), "w") as f:
        f.write("\n".join(json.dumps(v) for v in lines) + "\nnot json\n")
    out = flow.main(["/tmp/x.y", "/nowhere"])
assert out["/tmp/x.y"] == {"first": "2026-01-01T00:00:00Z", "humans": 2}, out
assert out["/nowhere"] == {"first": None, "humans": 0}
print("ok")
