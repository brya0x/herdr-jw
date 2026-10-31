#!/bin/sh
# probe.sh <path>: what the repos panel shows of one repo, as `key value` lines.
d=$1
if [ -e "$d.part" ]; then echo "state cloning"; exit; fi
if [ ! -e "$d" ]; then
  if [ -s "$d.log" ]; then echo "state failed"; head -n 2 "$d.log" | cut -c1-200 | sed 's/^/msg /'; else echo "state missing"; fi
  exit
fi
echo "real $(cd "$d" && pwd -P)"
if [ -e "$d/.git" ]; then
  echo "state git"
  echo "branch $(git -C "$d" symbolic-ref --short -q HEAD || git -C "$d" rev-parse --short HEAD)"
  echo "dirty $(git -C "$d" --no-optional-locks status --porcelain | wc -l | tr -d ' ')"
  # the linked worktrees (the first one listed is the main checkout): wt <branch><TAB><path>
  git -C "$d" worktree list --porcelain | awk '/^worktree /{p=substr($0,10); n++} /^branch /{b=substr($0,8); sub("refs/heads/","",b); if (n>1) print "wt " b "\t" p}'
else
  echo "state dir"
fi
