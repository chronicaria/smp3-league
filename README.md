# SMP League site

Static, dark league site for the SMP League (SMP III) (10 teams, Basketball GM). `site/` is the GitHub Pages root: `index.html`, `style.css`, `app.js`, `logos/`, and one data file, `site/data/league.json`. Hash routes: `#home`, `#scores[-day]`, `#game-<gid>`, `#standings`, `#leaders`, `#players`, `#teams`, `#team-<ABBR>`, `#player-<pid>`.

## Data flow (all on the commissioner's Mac)

1. `engine/sim_half.mjs` boots a private zengm build headless (`engine/boot.mjs`), builds the league (real 2026-27 players with the **secret** ratings from rome-kits, 10 teams from `engine/teams.json`), runs a 10-round fantasy draft and sims **one game at a time with play-by-play on**, saving each game's score timeline to `data/export-pbp.json` (the engine only records play-by-play for a single game per call). Prototype run:
   `SEED=7 ~/.local/node24/bin/node engine/sim_half.mjs ~/Code/zengm-smp3 "<rome-kits>/SMP III/pool/secret/smp3_ratings.json" data/export.json 18`
2. `python3 tools/make_site_data.py data/export.json` writes `site/data/league.json`. Ships names, bios, box scores (with DNP reasons), score timelines (win probability, lead stats), news and the schedule. It strips ratings, team ovr, skill tags and contracts, and asserts none slipped through.
3. Commit and push `site/`; `.github/workflows/pages.yml` publishes it to GitHub Pages.

`data/` (raw engine exports, which contain the secret ratings) is gitignored and must never be committed. The zengm engine itself never enters this repo (licence: private local copy only).

Preview: `python3 -m http.server 8795 --directory site`.

## Daily recap

`python3 tools/recap_prompt.py [game_no]` prints the writing prompt plus that game day's facts. Give it to an AI, then save the JSON reply in `site/data/recaps.json` under the game number. The home page shows the recap for the latest game day if one exists.

## Studies

`PBP=0 SEED=n node engine/sim_half.mjs ... data/study/secret-n.json 36` runs a fast full season (`RATINGS=public` for a control). `python3 tools/study.py` reports injury luck and scoring/minutes distributions across the runs.
