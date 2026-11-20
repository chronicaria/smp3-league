#!/bin/sh
# Publish site/ as the whole of chronicaria.github.io (the league's public home since 2026-11-20).
# usage: tools/publish_main.sh ["commit message"]   (the smp3-league project page still deploys from this repo's own main)
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; W="$(mktemp -d)"
git clone -q --depth 1 git@github.com:chronicaria/chronicaria.github.io.git "$W"
cd "$W"
git rm -r -q --ignore-unmatch .
cp -R "$ROOT/site/." .
touch .nojekyll
git add index.html app.js auction.js style.css data logos .nojekyll
if git diff --cached --quiet; then echo "main site: nothing to publish"; exit 0; fi
git commit -q -m "${1:-Update the SMP League site}"
git push -q origin main
echo "main site: pushed $(git rev-parse --short HEAD)"
