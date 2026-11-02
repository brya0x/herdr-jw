#!/usr/bin/env python3
"""themes/build.py: themes/<slug>.json (one palette) -> a Herdr theme and a Claude Code theme."""
import json, os, sys, glob
HERE = os.path.dirname(os.path.abspath(__file__))
H = os.environ.get("HERDR_APP_HOME", os.path.expanduser("~/.config/herdr-app"))
C = os.path.expanduser("~/.claude/themes")

def herdr(s, p):
    return {
        "background": p["bg"], "foreground": p["fg"], "selection": p["sel"], "cursor": p["fg"],
        # black..white, then the bright row (bright black = dim, bright white = fg)
        "ansi": [p["black"], p["red"], p["green"], p["yellow"], p["blue"], p["magenta"], p["cyan"], p["fg_dark"],
                 p["dim"], p["red"], p["green"], p["yellow"], p["blue"], p["magenta"], p["cyan"], p["fg"]],
        "colors": {
            "background": p["bg"], "foreground": p["fg"], "surface": p["bg_dark"], "chrome": p["bg_dark"], "canvas": p["bg_dark"],
            "popover": p["bg_float"], "raised": p["bg_hl"], "hover": p["bg_hl"], "selected": p["sel"], "border": p["border"],
            "input": p["bg_dark"], "muted": p["fg_dark"], "dim": p["comment"], "accent": p["blue"], "accent_foreground": p["bg"],
            "working": p["yellow"], "blocked": p["red"], "done": p["green"], "idle": p["comment"], "unknown": p["comment"],
        },
    }

def claude(s, p):
    return {"name": s["name"], "base": s["mode"], "overrides": {
        "claude": p["blue"], "text": p["fg"], "inverseText": p["bg"], "inactive": p["comment"], "subtle": p["dim"],
        "suggestion": p["cyan"], "permission": p["blue"], "remember": p["magenta"],
        "success": p["green"], "error": p["red"], "warning": p["yellow"], "merged": p["magenta"],
        "promptBorder": p["border"], "planMode": p["teal"], "autoAccept": p["magenta"], "bashBorder": p["orange"], "ide": p["cyan"],
        "diffAdded": p["add"], "diffRemoved": p["del"], "diffAddedDimmed": p["add_dim"], "diffRemovedDimmed": p["del_dim"],
        "diffAddedWord": p["add_word"], "diffRemovedWord": p["del_word"],
        "userMessageBackground": p["bg_float"], "bashMessageBackgroundColor": p["bg_float"], "memoryBackgroundColor": p["bg_float"],
        "selectionBg": p["sel"], "composerSidebarBackground": p["bg_dark"],
    }}

def put(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w").write(json.dumps(data, indent=2) + "\n")

def active(slug):
    """The one Claude theme every session uses (settings.json: custom:jw). Claude Code watches ~/.claude/themes and repaints
    a running session when this file changes, so a theme change needs no keystrokes in the sessions that already use it."""
    s = json.load(open(os.path.join(HERE, f"{slug}.json")))
    path = f"{C}/jw.json"; was = open(path).read() if os.path.exists(path) else None
    put(path, claude({**s, "name": "JW"}, s["p"]))
    return open(path).read() != was  # did the file change

def main():
    for f in sorted(glob.glob(os.path.join(HERE, "*.json"))):
        s = json.load(open(f)); p = s["p"]; slug = s["slug"]
        put(f"{H}/themes/{slug}.json", herdr(s, p)); put(f"{C}/{slug}.json", claude(s, p))
        print(f"{slug}: {H}/themes/{slug}.json, {C}/{slug}.json")

if __name__ == "__main__":
    main()
