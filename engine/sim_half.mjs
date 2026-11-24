// Prototype league: 10 SMP III teams, SECRET ratings applied, fantasy draft (BBGM AI picks), sim to the halfway mark.
// Runs only on Andrew's Mac against a private zengm build (licence). Output: a BBGM export; tools/make_site_data.py turns it into site data.
// usage: SEED=7 node engine/sim_half.mjs <zengmDir> <secret_ratings.json> <out.json> [gamesPerTeam=18]
// env: GA='{"pace":101}' overrides league settings (calibration); PBP=0 sims whole days (fast, no timelines); RATINGS=public skips the secret-ratings swap (control runs).
import fs from "node:fs";
import path from "node:path";
import { boot } from "./boot.mjs";
import { exportLeague } from "./export.mjs";
import { fairSchedule, report } from "./schedule.mjs";
const [zengmDir, secretFile, outFile, half = "18"] = process.argv.slice(2);
const { _note, ...CAL } = JSON.parse(fs.readFileSync(new URL("./settings.json", import.meta.url)));
const GA = { ...CAL, ...JSON.parse(process.env.GA || "{}") };   // calibrated league settings, overridable for experiments
// A 36-game season is 36/82 of a real one, so an injury should cost the same share of a season: each injury lasts
// 36/82 as many games and injuries happen 82/36 as often per game. Injuries carried in from the real-player file shrink the same way.
const SEASON = 36 / 82;
const INJURIES = JSON.parse(fs.readFileSync(new URL("./injuries_stock.json", import.meta.url))).map((x) => ({ ...x, games: Math.max(0.5, +(x.games * SEASON).toFixed(2)) }));
const INJ_RATE = 0.000125 / SEASON * 1.4;   // x1.4 over stock so about a tenth of roster player-games are lost, as in the real league
const CAP = 100000;   // $100M salary cap (BBGM stores thousands); every contract scales with it and rounds to $1M
const TEAMS = JSON.parse(fs.readFileSync(new URL("./teams.json", import.meta.url)));
const secret = new Map(JSON.parse(fs.readFileSync(secretFile)).players.map((p) => [p.id, p.ratings]));
const tmp = path.resolve(`data/.league-init-${process.pid}.json`);   // per process, so several sims can run at once
const { bbgm } = await boot({ zengmDir, extraFiles: { "/init.json": tmp } });
const { api, g, idb, PHASE } = bbgm; const cond = { hostID: 0 };

// 1. league file from real 2026-27 data, everyone a free agent, secret ratings swapped in
const L = await bbgm.realRosters.getLeague({ type: "real", season: 2027, phase: 0, randomDebuts: false, randomDebutsKeepCurrent: false, realDraftRatings: "rookie", realStats: "none", includePlayers: true });
const teams = L.teams.slice(0, 10).map((t, tid) => ({ ...t, tid, cid: 0, did: 0, ...TEAMS[tid], imgURL: `/logos/${TEAMS[tid].abbrev}.png`, imgURLSmall: undefined, srID: undefined, retiredJerseyNumbers: [] }));
let swapped = 0;
// ROSTERS=<file> ({ABBREV: [{id, sal, yrs}]}, e.g. the auction's current leaders) puts those players on those teams with
// those contracts and skips the fantasy draft; AI trades are switched off so the rosters stay as given.
const GIVEN = process.env.ROSTERS ? new Map(Object.entries(JSON.parse(fs.readFileSync(process.env.ROSTERS))).flatMap(([ab, ps]) => ps.map((x) => [x.id, { ...x, tid: TEAMS.findIndex((t) => t.abbrev === ab) }]))) : null;
let placed = 0;
const players = L.players.map((p) => {
	const q = { ...p, tid: p.tid >= 0 ? -1 : p.tid };
	const g = GIVEN?.get(p.srID);
	if (g && p.tid >= -1) { q.tid = g.tid; q.contract = { amount: g.sal * 1000, exp: 2026 + g.yrs }; placed++; }
	if (q.injury?.gamesRemaining) q.injury = { ...q.injury, gamesRemaining: Math.max(1, Math.round(q.injury.gamesRemaining * SEASON)) };
	if (q.contract && !g) q.contract = { ...q.contract, amount: Math.max(1000, Math.round(q.contract.amount * CAP / L.gameAttributes.salaryCap / 1000) * 1000) };
	const r = secret.get(p.srID);
	if (r && q.ratings?.length && process.env.RATINGS !== "public") { q.ratings = q.ratings.map((x, i, a) => (i === a.length - 1 ? { ...x, ...r, ovr: undefined, pot: undefined, skills: undefined } : x)); swapped++; }
	return q;
});
const ga = { ...L.gameAttributes }; delete ga.numGamesConf; delete ga.numGamesDiv;
Object.assign(ga, { confs: [{ cid: 0, name: "SMP" }], divs: [{ did: 0, cid: 0, name: "SMP" }], numGames: 36, numGamesPlayoffSeries: [5, 5], numPlayoffByes: 0, playIn: false, draftType: "noLottery", numDraftRounds: 1, ...GA });
const money = { salaryCap: CAP, minPayroll: 60000, luxuryPayroll: 115000, minContract: 1000, maxContract: 33000, salaryCapType: "soft" };
Object.assign(ga, money, { injuries: INJURIES, injuryRate: INJ_RATE });
if (GIVEN) ga.aiTradesFactor = 0;
const file = { version: L.version, startingSeason: L.startingSeason, gameAttributes: ga, teams, players, draftPicks: [] };
fs.mkdirSync(path.dirname(tmp), { recursive: true }); fs.writeFileSync(tmp, JSON.stringify(file));
console.log(`league file: ${players.length} players, secret ratings on ${swapped}`);

// 2. create, draft (10 rounds), sim
const nl = await api.main.runBefore({ viewId: "newLeague", params: {}, ctxBBGM: {}, updateEvents: ["firstRun"], prevData: {} }, cond);
const settings = { ...nl.defaultSettings, numGames: 36, numGamesDiv: null, numGamesConf: null, numGamesPlayoffSeries: [5, 5], numPlayoffByes: 0, playIn: false, minRosterSize: 12, maxRosterSize: 12, numDraftRounds: 1, ...money, injuries: INJURIES, injuryRate: INJ_RATE, ...GA, ...(GIVEN ? { aiTradesFactor: 0 } : {}) };   // 12-round fantasy draft (rounds = minRosterSize); no computer trades once owners hold rosters
await api.main.createLeague({ name: "SMP III prototype", tid: 0, url: "/init.json", shuffleRosters: false, keptKeys: Object.keys(file).filter((k) => k !== "version"), confs: ga.confs, divs: ga.divs, teamsFromInput: teams, settings, fromFile: { gameAttributes: ga, hasRookieContracts: true, startingSeason: file.startingSeason, teams, version: file.version }, leagueCreationID: "smp3" }, cond);
await api.main.setLocal(["autoSave", false], cond); idb.cache.stopAutoFlush();
// Owners hold these rosters, so the computer must not touch them: marking every team as user-run stops the engine signing
// free agents or trading for them (it still sets lineups, because each team keeps its roster auto-sorted).
if (GIVEN) { await bbgm.league.setGameAttributes({ userTids: [...Array(10).keys()] }); console.log(`rosters given: ${placed} of ${GIVEN.size} players placed; all teams user-run`); }
else { await api.main.startFantasyDraft([...Array(10).keys()], cond); await api.playMenu.untilEnd(undefined, cond); }
await api.playMenu.untilRegularSeason(undefined, cond);
// Schedule: four round robins = 36 game days, all ten teams play every day, each pair meets 4 times (2 home, 2 away).
// engine/schedule.mjs picks the fairest one it can find: home and away alternate, and every team's opponents so far
// are about equally strong after every game day. Strength here is the mean overall of a team's eight best players.
const roster = await idb.cache.players.indexGetAll("playersByTid", [0, Infinity]);
const strength = [...Array(10).keys()].map((tid) => { const o = roster.filter((p) => p.tid === tid).map((p) => p.ratings.at(-1).ovr).sort((x, y) => y - x).slice(0, 8); return o.reduce((x, y) => x + y, 0) / o.length; });
const sched = fairSchedule(strength);
{ const days = Array.from({ length: 36 }, (_, d) => sched.slice(d * 5, d * 5 + 5)), r = report(days, strength); console.log(`schedule: longest home/away run ${r.maxRun}, ${r.breaks} repeats in 350 turnarounds, opponent strength within ${r.worstStrength.toFixed(2)} sd of even on every day`); }
await bbgm.season.setSchedule(sched);
const target = 5 * Number(half);   // five games per game day
// Play-by-play: the engine only records it for one game at a time (game.play(..., gidOneGame, playByPlay)) and hands it to the UI,
// so sim each game on its own and catch the realtimeUpdate message.
const PTS = (type) => (type === "ft" ? 1 : type.startsWith("tp") ? 3 : 2);
const pbp = {}, raw = {}; let caught = null;
const lineups = {};   // tid -> "pid,pid,pid,pid,pid" -> [seconds, points for, points against]
const post = globalThis.postMessage;
globalThis.postMessage = (msg) => { const raw = Array.isArray(msg) && msg[0] === 0 && msg[2]?.[0] === "realtimeUpdate" ? msg[2][3] : null; if (raw?.playByPlay) caught = raw; post(msg); };
let days = 0, n = 0;
while (g.get("phase") === PHASE.REGULAR_SEASON && n < target) {
	const today = (await bbgm.season.getSchedule(true)).filter((x) => x.homeTid >= 0);
	if (!today.length) { await api.playMenu.day(undefined, cond); continue; }
	if (process.env.PBP === "0") { await api.playMenu.day(undefined, cond); n += today.length; days++; continue; }
	for (const gm of today) {
		caught = null;
		await bbgm.game.play(1, cond, true, gm.gid, true);
		if (!caught) throw new Error(`no play-by-play for game ${gm.gid}`);
		// timeline of score changes: [seconds elapsed, away, home, scorer pid]; teams[0] is home
		const tl = []; let h = 0, a = 0;
		for (const e of caught.playByPlay) {
			if (e.period === undefined || e.t === undefined || !/^(fg|tp|ft)/.test(e.type) || /^fga|Miss/.test(e.type)) continue;
			if (e.t === 0) h += PTS(e.type); else a += PTS(e.type);
			const el = e.period <= 4 ? (e.period - 1) * 720 + (720 - e.clock) : 2880 + (e.period - 5) * 300 + (300 - e.clock);
			tl.push([Math.round(el), a, h, e.pid]);
		}
		pbp[gm.gid] = tl; n++;
		if (process.env.RAW) raw[gm.gid] = caught.playByPlay;   // RAW=1: keep every event (for live box scores)
		// lineups: starters from the saved box score, then follow the substitution events
		const box = await idb.cache.games.get(gm.gid);
		const on = box.teams.map((t) => new Set(t.players.filter((p) => p.gs).map((p) => p.pid))), tids = box.teams.map((t) => t.tid);
		const bump = (dt, pts, scorer) => on.forEach((set, i) => { const k = [...set].sort((x, y) => x - y).join(","), L = ((lineups[tids[i]] ??= {})[k] ??= [0, 0, 0]); L[0] += dt; if (pts) L[i === scorer ? 1 : 2] += pts; });
		let last = 0, period = 1;
		for (const e of caught.playByPlay) {
			if (e.type === "period" || e.type === "overtime") period = e.period ?? period + 1;
			if (e.clock === undefined) continue;
			const el = period <= 4 ? (period - 1) * 720 + (720 - e.clock) : 2880 + (period - 5) * 300 + (300 - e.clock);
			if (el > last) { bump(el - last, 0); last = el; }
			if (e.type === "sub") { e.pidsOff.forEach((x) => on[e.t].delete(x)); e.pids.forEach((x) => on[e.t].add(x)); }
			else if (e.period !== undefined && e.t !== undefined && /^(fg|tp|ft)/.test(e.type) && !/^fga|Miss/.test(e.type)) bump(0, PTS(e.type), e.t);
		}
		if (on.some((x) => x.size !== 5)) throw new Error(`lineup tracking broke in game ${gm.gid}`);
	}
	days++;
}
console.log(`simmed ${days} days, ${n} games with play-by-play`);
if (process.env.PBP !== "0") { fs.writeFileSync(outFile.replace(/\.json$/, "-pbp.json"), JSON.stringify(pbp)); fs.writeFileSync(outFile.replace(/\.json$/, "-lineups.json"), JSON.stringify(lineups)); if (process.env.RAW) fs.writeFileSync(outFile.replace(/\.json$/, "-raw.json"), JSON.stringify(raw)); }
await api.main.setLocal(["autoSave", true], cond);
fs.writeFileSync(outFile, JSON.stringify(await exportLeague(bbgm, "SMP III prototype")));
console.log(`wrote ${outFile} ${(fs.statSync(outFile).size / 1e6).toFixed(1)} MB`);
fs.rmSync(tmp, { force: true });
process.exit(0);
