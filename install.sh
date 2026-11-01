#!/bin/sh
# Install herdr-jw into Herdr (and update it: run it again):
#   curl -fsSL https://raw.githubusercontent.com/brya0x/herdr-jw/main/install.sh | sh
#   curl -fsSL .../install.sh | sh -s -- --no-keys     leave keys.json alone
# HERDR_JW_REF=<branch|tag> picks the version; HERDR_JW_URL replaces the tarball URL (tests).
set -eu
H=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
URL=${HERDR_JW_URL:-https://github.com/brya0x/herdr-jw/archive/${HERDR_JW_REF:-main}.tar.gz}
KEYS=1; [ "${1:-}" = --no-keys ] && KEYS=0
die() { echo "herdr-jw: $*" >&2; exit 1; }

for c in curl tar rsync python3; do command -v "$c" >/dev/null || die "needs $c"; done
command -v herdr-app >/dev/null || die "Herdr is not installed (no herdr-app in PATH)"
[ -d "$H" ] || die "$H does not exist: open Herdr once, then run this again"

T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
curl -fsSL "$URL" | tar -xz -C "$T" --strip-components=1
[ -f "$T/sync.sh" ] || die "that archive is not herdr-jw ($URL)"
sh "$T/sync.sh" push </dev/null
echo "herdr-jw: mods, layout, themes and the herdr-tasks skill are in $H"

# Add our shortcuts to keys.json; drop the tab.* ones (there are no tabs). Keep a backup if it changes.
if [ "$KEYS" = 1 ] && [ -f "$H/keys.json" ]; then
  python3 - "$H/keys.json" "$T/config/keys.json" <<'PY'
import json, shutil, sys, time
path, ours = sys.argv[1:]
cur = json.load(open(path)); new = json.load(open(ours))
out = json.loads(json.dumps(cur))
for sec, binds in new.items():
    out.setdefault(sec, {}).update(binds)
for k in [k for k, v in out.get("global", {}).items() if str(v).startswith("tab.")]:
    del out["global"][k]
if out == cur:
    print("herdr-jw: keys.json already up to date")
else:
    bak = f"{path}.bak-{time.strftime('%Y%m%d%H%M%S')}"
    shutil.copy(path, bak)
    json.dump(out, open(path, "w"), indent=2, ensure_ascii=False)
    print(f"herdr-jw: keys.json updated (backup: {bak})")
PY
fi

echo "herdr-jw: restart Herdr, then turn the layout on with:"
echo "  herdr-app do layout.switch '{\"name\":\"jw\"}'"
