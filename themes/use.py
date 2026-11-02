#!/usr/bin/env python3
"""use.py mode light|dark|system  |  set <slug>  |  apply : the jw theme in Herdr and Claude Code.
State is data/jw-theme.json {mode, light, dark}; the palettes are the *.json beside this file."""
import glob, json, os, re, subprocess, sys, time
import build

STATE = f"{build.H}/data/jw-theme.json"
CLAUDE_LAG = 0.1  # seconds to hold Herdr back so it repaints with Claude Code (screenshots: Claude ~0.1-0.3 s behind; 0.2 left Herdr 1 ms ahead)
DEFAULT = {"mode": "dark", "light": "tokyo-night-day", "dark": "tokyo-night"}

def palettes():
    return {s["slug"]: s["mode"] for s in (json.load(open(f)) for f in glob.glob(f"{build.HERE}/*.json"))}

def load():
    try: return {**DEFAULT, **json.load(open(STATE))}
    except (OSError, ValueError): return dict(DEFAULT)

def system():
    return "dark" if subprocess.run(["defaults", "read", "-g", "AppleInterfaceStyle"], capture_output=True).returncode == 0 else "light"

def edit(path, fn):
    s = open(path).read(); t = fn(s)
    json.loads(t)
    if t != s: open(path, "w").write(t)

def apply(c):
    build.main()
    eff = system() if c["mode"] == "system" else c["mode"]
    if build.active(c[eff]): time.sleep(CLAUDE_LAG)  # Herdr changes at once, Claude Code a moment after the file: let them meet
    for slug in (c["light"], c["dark"]):
        subprocess.run(["herdr-app", "do", "app.theme", json.dumps({"name": slug})], capture_output=True)
    def appearance(s):
        d = json.loads(s)
        if c["mode"] == "system": d.pop("appearance", None)
        else: d["appearance"] = c["mode"]
        return json.dumps(d, indent=2, ensure_ascii=False) + "\n"
    edit(os.path.join(build.H, "settings.json"), appearance)
    def claude(s):
        t, n = re.subn(r'^(  "theme": )".*?"', lambda m: f'{m[1]}"custom:jw"', s, flags=re.M)
        assert n == 1, "settings.json: expected one top-level theme line"
        return t
    edit(os.path.expanduser("~/.claude/settings.json"), claude)
    live()
    print(f"{c['mode']} ({eff}): light {c['light']}, dark {c['dark']}")

def hc(*a):
    return subprocess.run(["hc", *a], capture_output=True, text=True, timeout=10).stdout

def screen(t, until):
    for _ in range(12):
        s = hc("read", t)
        if until in s: return s
        time.sleep(0.25)
    return s

def status(t):
    for x in json.loads(hc("ls"))["terminals"]:
        if x["address"] == t: return x.get("agent"), x.get("status")
    return None, None

def pick(t, name):
    """Open /theme in claude t and choose `name`. Returns ok | busy (text typed) | missing (the picker does not list it)."""
    prompt = [l for l in hc("read", t).splitlines() if l.startswith("❯")]
    if not prompt or prompt[-1].strip() != "❯": return "busy"
    hc("keys", t, "/", "t", "h", "e", "m", "e", "enter")
    rows = screen(t, "Enter to select").splitlines()
    rows = rows[max(i for i, l in enumerate(rows) if "Auto (match terminal)" in l):]
    rows = [l for l in rows if l.startswith("   ")]
    norm = lambda l: re.sub(r"^\s*[❯✔\s]*|\s+custom\s*$", "", l)
    at = [i for i, l in enumerate(rows) if l.lstrip().startswith("❯")]
    to = [i for i, l in enumerate(rows) if norm(l) == name]
    if len(at) != 1 or len(to) != 1: hc("keys", t, "esc"); return "missing"
    d = to[0] - at[0]
    if d: hc("keys", t, *(["down" if d > 0 else "up"] * abs(d)))
    hc("keys", t, "enter" if "✔" not in rows[to[0]] or d else "esc")
    return "ok"

LIVE = f"{build.H}/data/jw-theme-live.json"  # {"done": terminals whose claude uses the JW theme (they repaint by themselves), "skip": ones that cannot be moved}

def live():
    """Claude Code repaints a running session when ~/.claude/themes/jw.json changes, but only if the session uses the JW
    theme. Once per session, switch it with /theme (busy ones too: it opens mid-turn and the turn goes on). A session whose
    picker does not list JW (it started before ~/.claude/themes existed) cannot be moved: it is remembered, not retried,
    and needs a restart by hand (claude --resume). Left alone: text typed and waiting on a permission."""
    try:
        st = json.load(open(LIVE)); done, skip = set(st["done"]), set(st["skip"])
    except (OSError, ValueError, KeyError, TypeError): done, skip = set(), set()
    try: terms = json.loads(hc("ls"))["terminals"]
    except (ValueError, subprocess.SubprocessError): return
    now = {x["address"] for x in terms}
    done &= now; skip &= now
    for x in terms:
        t = x["address"]
        if x.get("agent") != "claude-code" or x.get("state") != "live" or t in done | skip or x.get("status") not in ("idle", "done", "working"): continue
        try:
            r = pick(t, "JW")
            if r == "missing": skip.add(t)
            if r == "ok": done.add(t)
        except (subprocess.SubprocessError, ValueError, KeyError, StopIteration):
            hc("keys", t, "esc")
    open(LIVE, "w").write(json.dumps({"done": sorted(done), "skip": sorted(skip)}) + "\n")

if __name__ == "__main__":
    a, ps, c = sys.argv[1:], palettes(), load()
    if a[:1] == ["mode"] and len(a) == 2 and a[1] in ("light", "dark", "system"): c["mode"] = a[1]
    elif a[:1] == ["set"] and len(a) == 2 and a[1] in ps:
        c[ps[a[1]]] = a[1]
        if c["mode"] != "system": c["mode"] = ps[a[1]]  # show what was picked
    elif a != ["apply"]: sys.exit(__doc__)
    os.makedirs(os.path.dirname(STATE), exist_ok=True); open(STATE, "w").write(json.dumps(c, indent=2) + "\n")
    apply(c)
