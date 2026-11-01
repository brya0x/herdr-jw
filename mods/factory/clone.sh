#!/bin/sh
# clone.sh <owner/repo> <dst>: clones into <dst>.part and renames it when done.
# A failure leaves gh's message in <dst>.log (the repos panel shows it) and no .part.
id=$1 dst=$2
mkdir -p "$(dirname "$dst")" && mkdir "$dst.part" || exit 1
rm -f "$dst.log"
if gh repo clone "$id" "$dst.part" >"$dst.log" 2>&1; then
  mv "$dst.part" "$dst" && rm -f "$dst.log"
else
  [ -L "$dst.part" ] || rm -rf "$dst.part"
  [ -s "$dst.log" ] || echo "gh repo clone failed" >"$dst.log"
fi
