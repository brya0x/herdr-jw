#!/usr/bin/env python3
"""use.py mode light|dark|system  |  set <slug>  |  apply : the jw theme in Herdr and Claude Code.
State is data/jw-theme.json {mode, light, dark}; the palettes are the *.json beside this file."""
import glob, json, os, re, subprocess, sys
import build

STATE = f"{build.H}/data/jw-theme.json"
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
    for slug in (c["light"], c["dark"]):
        subprocess.run(["herdr-app", "do", "app.theme", json.dumps({"name": slug})], capture_output=True)
    def appearance(s):
        d = json.loads(s)
        if c["mode"] == "system": d.pop("appearance", None)
        else: d["appearance"] = c["mode"]
        return json.dumps(d, indent=2, ensure_ascii=False) + "\n"
    edit(os.path.join(build.H, "settings.json"), appearance)
    def claude(s):
        t, n = re.subn(r'^(  "theme": )".*?"', lambda m: f'{m[1]}"custom:{c[eff]}"', s, flags=re.M)
        assert n == 1, "settings.json: expected one top-level theme line"
        return t
    edit(os.path.expanduser("~/.claude/settings.json"), claude)
    print(f"{c['mode']} ({eff}): light {c['light']}, dark {c['dark']}")

if __name__ == "__main__":
    a, ps, c = sys.argv[1:], palettes(), load()
    if a[:1] == ["mode"] and len(a) == 2 and a[1] in ("light", "dark", "system"): c["mode"] = a[1]
    elif a[:1] == ["set"] and len(a) == 2 and a[1] in ps:
        c[ps[a[1]]] = a[1]
        if c["mode"] != "system": c["mode"] = ps[a[1]]  # show what was picked
    elif a != ["apply"]: sys.exit(__doc__)
    os.makedirs(os.path.dirname(STATE), exist_ok=True); open(STATE, "w").write(json.dumps(c, indent=2) + "\n")
    apply(c)
