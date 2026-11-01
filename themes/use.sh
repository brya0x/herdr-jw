#!/bin/sh
# themes/use.sh <slug>: Herdr and Claude Code switch to the same theme (the slug of a themes/*.json palette)
set -eu
D=$(cd "$(dirname "$0")" && pwd); slug=${1:?usage: use.sh <slug>}
[ -f "$D/$slug.json" ] || { echo "no palette $D/$slug.json" >&2; exit 2; }
python3 "$D/build.py" >/dev/null
herdr-app do app.theme "{\"name\":\"$slug\"}" >/dev/null
python3 - "$slug" <<'PY'
import json, os, re, sys
p = os.path.expanduser("~/.claude/settings.json"); s = open(p).read()
s, n = re.subn(r'^(  "theme": )".*?"', lambda m: f'{m[1]}"custom:{sys.argv[1]}"', s, flags=re.M)
assert n == 1, "settings.json: expected one top-level theme line"
json.loads(s); open(p, "w").write(s)
PY
echo "$slug: Herdr and Claude Code"
