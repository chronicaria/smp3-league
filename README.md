# SMP League site

Static, dark league site for the SMP League (SMP III) (10 teams, Basketball GM). `site/` is the GitHub Pages root: `index.html`, `style.css`, `app.js`, `logos/`, and one data file, `site/data/league.json`. Hash routes: `#home`, `#scores[-day]`, `#game-<gid>`, `#standings`, `#leaders`, `#players`, `#teams`, `#team-<ABBR>`, `#player-<pid>`.

## Data flow (all on the commissioner's Mac)

1. `engine/sim_half.mjs` boots a private zengm build headless (`engine/boot.mjs`), builds the league (real 2026-27 players with the **secret** ratings from rome-kits, 10 teams from `engine/teams.json`, 12-man rosters, league settings from `engine/settings.json`, which are calibrated so league averages match the real league; `tools/league_avgs.py` checks them), runs a 10-round fantasy draft and sims **one game at a time with play-by-play on**, saving each game's score timeline to `data/export-pbp.json` and every lineup's minutes and points to `data/export-lineups.json` (the engine only records play-by-play for a single game per call). Prototype run:
   `SEED=7 ~/.local/node24/bin/node engine/sim_half.mjs ~/Code/zengm-smp3 "<rome-kits>/SMP III/pool/secret/smp3_ratings.json" data/export.json 18`
2. `python3 tools/make_site_data.py data/export.json` writes `site/data/league.json` and `site/data/lineups.json`, and fits the win-probability model on the league's own play-by-play (plus `data/cal/wp.json` when present). Ships names, bios, box scores (with DNP reasons), score timelines (win probability, lead stats), news and the schedule. It strips ratings, team ovr, skill tags and contracts, and asserts none slipped through.
3. Commit and push `site/`; `.github/workflows/pages.yml` publishes it to GitHub Pages.

`data/` (raw engine exports, which contain the secret ratings) is gitignored and must never be committed. The zengm engine itself never enters this repo (licence: private local copy only).

Preview: `python3 -m http.server 8795 --directory site`.

## Daily recap

`python3 tools/recap_prompt.py [game_no]` prints the writing prompt plus that game day's facts. Give it to an AI, then save the JSON reply in `site/data/recaps.json` under the game number. The home page shows the recap for the latest game day if one exists.

## Studies

`PBP=0 SEED=n node engine/sim_half.mjs ... data/study/secret-n.json 36` runs a fast full season (`RATINGS=public` for a control). `python3 tools/study.py` reports injury luck and scoring/minutes distributions across the runs.

## Auction

The Auction tab (`#auction`, `#auction-<ABBR>`) runs entirely in the browser: it reads a list of bids and applies the rules in `site/auction.js` (salary in whole $M, 1-5 years, score = salary x (1 + 0.25 x (years - 1)), $100M budget with $1M kept per open roster spot, 12 players, one deadline 48 hours after the start). `node tools/test_auction.mjs` checks the rules. `python3 tools/make_auction_data.py` rebuilds `site/data/auction.json` (the top 300 players; every player opens at $1M) and the demo bids.

Until it is connected, the page shows made-up demo bids. To go live:

1. **Google Form** with five questions: Team (dropdown of the ten abbreviations), Team code (short answer), Player (dropdown: paste the 300 names from `site/data/auction.json`), Salary in $M (number, whole), Years (dropdown 1-5).
2. In the linked **Sheet**, add a tab `Teams` with each abbreviation and its secret code, and a tab `Public bids` whose cell A1 holds
   `=QUERY({'Form Responses 1'!A:F, ARRAYFORMULA(IFERROR(VLOOKUP('Form Responses 1'!B:B, Teams!A:B, 2, FALSE)='Form Responses 1'!C:C))}, "select Col1, Col2, Col4, Col5, Col6 where Col7 = TRUE label Col1 'Timestamp', Col2 'Team', Col4 'Player', Col5 'Salary', Col6 'Years'", 1)`
   (adjust the column letters if your question order differs). This keeps the team codes out of the public tab and drops bids with a wrong code.
3. File > Share > **Publish to web**: choose the `Public bids` tab, format CSV. Put that URL in `csv` in `site/data/auction.json`.
4. Set `start` in the same file (ISO time with offset, e.g. `2026-12-21T12:00:00-05:00`).
5. Optional prefilled bid links: in the Form, Get pre-filled link, and copy the form URL and each question's `entry.<number>` into `form`.
6. Commit and push `site/data/auction.json`. The page re-reads the sheet every minute; Google refreshes a published sheet within about five minutes.

Simpler variant with no team code (anyone with the link can bid as any team): four questions (Team, Player, Salary, Years) and publish the `Form Responses 1` tab itself as CSV; skip step 2. Set `tz` to the sheet's time zone as a UTC offset (File > Settings in the sheet) so viewers in other time zones read bid times correctly. The settings (`start`, `csv`, `form`, `tz`) live in `tools/make_auction_data.py`; rerun it after changing them.

Bids are public. A bid stamped at or after the deadline is ignored, as are bids that break a rule; each team's page lists its refused bids with the reason. After the deadline, teams short of 12 players are filled from the best unsold players (see `fill` in `site/auction.js`).

`~/Desktop/Code/smp-auction` (the earlier Apps Script version with secret proxy bids) is superseded by this.
