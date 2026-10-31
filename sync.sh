#!/bin/sh
# sync.sh push  -> repo to ~/.config/herdr-app (install or update the mods and the layout)
# sync.sh pull  -> ~/.config/herdr-app to the repo (save what you changed there)
# keys.json is never written back: merge config/keys.json by hand (see README).
set -eu
H=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
R=$(cd "$(dirname "$0")" && pwd)
MODS="factory factory-usage worktree-wt tabs-one picker-one"
# gpui-kit.d.ts and jsconfig.json are written by Herdr on every start
rs() { rsync -a "$@" --exclude=gpui-kit.d.ts --exclude=jsconfig.json --exclude='*.error' --exclude=.DS_Store; }
case ${1:-} in
  push)
    for m in $MODS; do mkdir -p "$H/mods/$m"; rs "$R/mods/$m/" "$H/mods/$m/"; done
    cp "$R/layouts/factory.json" "$H/layouts/factory.json" ;;
  pull)
    for m in $MODS; do mkdir -p "$R/mods/$m"; rs --delete "$H/mods/$m/" "$R/mods/$m/"; done
    cp "$H/layouts/factory.json" "$R/layouts/factory.json"
    cp "$H/keys.json" "$R/config/keys.json" ;;
  *) echo "usage: sync.sh push|pull" >&2; exit 2 ;;
esac
