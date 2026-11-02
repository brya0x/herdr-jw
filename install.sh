#!/bin/sh
# Install herdr-jw into Herdr (and update it: run it again):
#   curl -fsSL https://raw.githubusercontent.com/brya0x/herdr-jw/main/install.sh | sh
#   curl -fsSL .../install.sh | sh -s -- --no-keys     leave keys.json alone
#   curl -fsSL .../install.sh | sh -s -- --no-plugin   do not install the jw plugin for Claude Code
# HERDR_JW_REF=<branch|tag> picks the version; HERDR_JW_URL replaces the tarball URL (tests).
set -eu
H=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
URL=${HERDR_JW_URL:-https://github.com/brya0x/herdr-jw/archive/${HERDR_JW_REF:-main}.tar.gz}
KEYS=1; PLUGIN=1
for a in "$@"; do
  case $a in --no-keys) KEYS=0 ;; --no-plugin) PLUGIN=0 ;; *) echo "herdr-jw: unknown option $a" >&2; exit 1 ;; esac
done
die() { echo "herdr-jw: $*" >&2; exit 1; }

for c in curl tar rsync python3; do command -v "$c" >/dev/null || die "needs $c"; done
command -v herdr-app >/dev/null || die "Herdr is not installed (no herdr-app in PATH)"
[ -d "$H" ] || die "$H does not exist: open Herdr once, then run this again"

T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
curl -fsSL "$URL" | tar -xz -C "$T" --strip-components=1
[ -f "$T/sync.sh" ] || die "that archive is not herdr-jw ($URL)"
sh "$T/sync.sh" push </dev/null
echo "herdr-jw: mods, layout, themes and the herdr-tasks skill are in $H"

# Add our shortcuts to keys.json; drop the tab.* ones (there are no tabs) and the ones of mods that jw-settings replaced and the Repos shortcut (now a button). Keep a backup if it changes.
if [ "$KEYS" = 1 ] && [ -f "$H/keys.json" ]; then
  python3 - "$H/keys.json" "$T/herdr/config/keys.json" <<'PY'
import json, shutil, sys, time
path, ours = sys.argv[1:]
cur = json.load(open(path)); new = json.load(open(ours))
out = json.loads(json.dumps(cur))
for sec, binds in new.items():
    out.setdefault(sec, {}).update(binds)
GONE = ("mod.open:themes-jw", "mod.open:factory-usage", "mod.open:update-jw", "tabs-one.repos")  # mods that jw-settings replaced
for k in [k for k, v in out.get("global", {}).items() if v == "mod.open:jw-settings" and k not in new.get("global", {})]:
    del out["global"][k]  # an older shortcut of the same screen (it was cmd-shift-j)
for k in [k for k, v in out.get("global", {}).items() if str(v).startswith("tab.") or v in GONE]:
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

# The jw plugin for Claude Code (jw:tasks): added from this repo's marketplace; running again updates it.
if [ "$PLUGIN" = 1 ]; then
  if command -v claude >/dev/null; then
    { claude plugin marketplace add brya0x/herdr-jw && claude plugin marketplace update herdr-jw \
      && { claude plugin install jw@herdr-jw && claude plugin update jw@herdr-jw; }; } >/dev/null 2>&1 \
      && echo "herdr-jw: Claude Code plugin jw@herdr-jw is installed (open sessions: /reload-plugins)" \
      || echo "herdr-jw: could not install the Claude Code plugin; run: claude plugin marketplace add brya0x/herdr-jw && claude plugin install jw@herdr-jw" >&2
  else
    echo "herdr-jw: Claude Code (claude) not found, plugin skipped"
  fi
fi

echo "herdr-jw: restart Herdr, then turn the layout on with:"
echo "  herdr-app do layout.switch '{\"name\":\"jw\"}'"
