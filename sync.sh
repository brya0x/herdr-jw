#!/bin/sh
# sync.sh push  -> repo to ~/.config/herdr-app (install or update the mods and the layout)
# sync.sh pull  -> ~/.config/herdr-app to the repo (save what you changed there)
# keys.json is never written back: merge config/keys.json by hand (see README).
set -eu
H=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
R=$(cd "$(dirname "$0")" && pwd)
MODS="factory factory-usage worktree-wt tabs-one picker-one factory-tasks spaces-one themes-jw artifacts-jw"
# gpui-kit.d.ts and jsconfig.json are written by Herdr on every start
rs() { rsync -a "$@" --exclude=gpui-kit.d.ts --exclude=jsconfig.json --exclude='*.error' --exclude=.DS_Store; }
case ${1:-} in
  push)
    # tabs-one cannot import another mod: its copy of the task list code comes from factory-tasks
    cp "$R/mods/factory-tasks/lib.js" "$R/mods/tabs-one/tasks-lib.js"
    for m in $MODS; do mkdir -p "$H/mods/$m"; rs "$R/mods/$m/" "$H/mods/$m/"; done
    mkdir -p "$H/layouts"; cp "$R/layouts/jw.json" "$H/layouts/jw.json"
    mkdir -p "$H/data/jw-themes"; cp "$R"/themes/*.json "$R/themes/build.py" "$R/themes/use.py" "$H/data/jw-themes/"
    python3 "$R/themes/build.py" >/dev/null
    mkdir -p "$HOME/.claude/skills/herdr-tasks"; cp "$R/skill/herdr-tasks/SKILL.md" "$HOME/.claude/skills/herdr-tasks/SKILL.md" ;;
  pull)
    for m in $MODS; do mkdir -p "$R/mods/$m"; rs --delete "$H/mods/$m/" "$R/mods/$m/"; done
    cp "$H/layouts/jw.json" "$R/layouts/jw.json"
    cp "$H/keys.json" "$R/config/keys.json" ;;
  *) echo "usage: sync.sh push|pull" >&2; exit 2 ;;
esac
