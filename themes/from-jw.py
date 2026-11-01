#!/usr/bin/env python3
"""from-jw.py [path/to/jw/contract/themes.json]: adds a palette here for every jw theme not already here.
jw's 12 colors become ours (the rest are mixes of them); existing palettes are never overwritten."""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/ws/jw/contract/themes.json")
ALIAS = {"tokyo-day": "tokyo-night-day"}  # jw's id -> the slug we already have

def rgb(h): return [int(h[i:i + 2], 16) for i in (1, 3, 5)]
def mix(a, b, t): return "#%02x%02x%02x" % tuple(round(x + (y - x) * t) for x, y in zip(rgb(a), rgb(b)))

def palette(j):
    dark = j["kind"] == "dark"
    bg, fg = j["bg"], j["fg"]
    p = {"bg": bg, "bg_dark": j["panel"], "bg_float": j["sel"], "bg_hl": j["line"], "sel": mix(bg, j["blue"], .22), "border": mix(j["line"], fg, .15),
         "fg": fg, "fg_dark": mix(fg, bg, .15), "comment": j["dim"], "dim": mix(j["dim"], bg, .4),
         "red": j["red"], "orange": mix(j["red"], j["yellow"], .5), "yellow": j["yellow"], "green": j["green"], "teal": j["cyan"], "cyan": j["cyan"], "blue": j["blue"], "magenta": j["magenta"],
         "black": j["panel"] if dark else fg}
    for k, c in (("add", "green"), ("del", "red")):
        p[k] = mix(bg, j[c], .15 if dark else .2); p[k + "_dim"] = mix(bg, j[c], .08); p[k + "_word"] = mix(bg, j[c], .4)
    return p

if __name__ == "__main__":
    have = {json.load(open(f))["slug"] for f in (os.path.join(HERE, n) for n in os.listdir(HERE)) if f.endswith(".json")}
    for j in json.load(open(SRC))["themes"]:
        slug = ALIAS.get(j["id"], j["id"])
        if slug in have: continue
        open(os.path.join(HERE, f"{slug}.json"), "w").write(json.dumps({"name": j["name"], "slug": slug, "mode": j["kind"], "p": palette(j)}, indent=2) + "\n")
        print("added", slug)
