# SMP III league site

Static, dark league site for SMP III (10 teams, Basketball GM). `site/` is the GitHub Pages root: `index.html`, `style.css`, `app.js`, `logos/`, and one data file, `site/data/league.json`. Hash routes: `#scores[-day]`, `#game-<gid>`, `#standings`, `#teams`, `#team-<ABBR>`, `#player-<pid>`, `#leaders`.

## Data flow (all on the commissioner's Mac)

1. `engine/sim_half.mjs` boots a private zengm build headless (`engine/boot.mjs`), builds the league (real 2026-27 players with the **secret** ratings from rome-kits, 10 teams from `engine/teams.json`), runs a 10-round fantasy draft and sims. Prototype run:
   `SEED=7 ~/.local/node24/bin/node engine/sim_half.mjs ~/Code/zengm-smp3 "<rome-kits>/SMP III/pool/secret/smp3_ratings.json" data/export.json 18`
2. `python3 tools/make_site_data.py data/export.json` writes `site/data/league.json`. Ships names, bios, box scores and the schedule. It strips ratings, team ovr, skill tags and contracts, and asserts none slipped through.
3. Commit and push `site/`; `.github/workflows/pages.yml` publishes it to GitHub Pages.

`data/` (raw engine exports, which contain the secret ratings) is gitignored and must never be committed. The zengm engine itself never enters this repo (licence: private local copy only).

Preview: `python3 -m http.server 8795 --directory site`.
