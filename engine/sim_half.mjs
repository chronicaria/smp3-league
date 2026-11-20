// Prototype league: 10 SMP III teams, SECRET ratings applied, fantasy draft (BBGM AI picks), sim to the halfway mark.
// Runs only on Andrew's Mac against a private zengm build (licence). Output: a BBGM export; tools/make_site_data.py turns it into site data.
// usage: SEED=7 node engine/sim_half.mjs <zengmDir> <secret_ratings.json> <out.json> [gamesPerTeam=18]
// env: PBP=0 sims whole days (fast, no timelines); RATINGS=public skips the secret-ratings swap (control runs).
import fs from "node:fs";
import path from "node:path";
import { boot } from "./boot.mjs";
import { exportLeague } from "./export.mjs";
const [zengmDir, secretFile, outFile, half = "18"] = process.argv.slice(2);
const TEAMS = JSON.parse(fs.readFileSync(new URL("./teams.json", import.meta.url)));
const secret = new Map(JSON.parse(fs.readFileSync(secretFile)).players.map((p) => [p.id, p.ratings]));
const tmp = path.resolve("data/.league-init.json");
const { bbgm } = await boot({ zengmDir, extraFiles: { "/init.json": tmp } });
const { api, g, idb, PHASE } = bbgm; const cond = { hostID: 0 };

// 1. league file from real 2026-27 data, everyone a free agent, secret ratings swapped in
const L = await bbgm.realRosters.getLeague({ type: "real", season: 2027, phase: 0, randomDebuts: false, randomDebutsKeepCurrent: false, realDraftRatings: "rookie", realStats: "none", includePlayers: true });
const teams = L.teams.slice(0, 10).map((t, tid) => ({ ...t, tid, cid: 0, did: 0, ...TEAMS[tid], imgURL: `/logos/${TEAMS[tid].abbrev}.png`, imgURLSmall: undefined, srID: undefined, retiredJerseyNumbers: [] }));
let swapped = 0;
const players = L.players.map((p) => {
	const q = { ...p, tid: p.tid >= 0 ? -1 : p.tid };
	const r = secret.get(p.srID);
	if (r && q.ratings?.length && process.env.RATINGS !== "public") { q.ratings = q.ratings.map((x, i, a) => (i === a.length - 1 ? { ...x, ...r, ovr: undefined, pot: undefined, skills: undefined } : x)); swapped++; }
	return q;
});
const ga = { ...L.gameAttributes }; delete ga.numGamesConf; delete ga.numGamesDiv;
Object.assign(ga, { confs: [{ cid: 0, name: "SMP" }], divs: [{ did: 0, cid: 0, name: "SMP" }], numGames: 36, numGamesPlayoffSeries: [5, 5], numPlayoffByes: 0, playIn: false, draftType: "noLottery" });
const file = { version: L.version, startingSeason: L.startingSeason, gameAttributes: ga, teams, players, draftPicks: [] };
fs.mkdirSync(path.dirname(tmp), { recursive: true }); fs.writeFileSync(tmp, JSON.stringify(file));
console.log(`league file: ${players.length} players, secret ratings on ${swapped}`);

// 2. create, draft (10 rounds), sim
const nl = await api.main.runBefore({ viewId: "newLeague", params: {}, ctxBBGM: {}, updateEvents: ["firstRun"], prevData: {} }, cond);
const settings = { ...nl.defaultSettings, numGames: 36, numGamesDiv: null, numGamesConf: null, numGamesPlayoffSeries: [5, 5], numPlayoffByes: 0, playIn: false, minRosterSize: 10, maxRosterSize: 10 };
await api.main.createLeague({ name: "SMP III prototype", tid: 0, url: "/init.json", shuffleRosters: false, keptKeys: Object.keys(file).filter((k) => k !== "version"), confs: ga.confs, divs: ga.divs, teamsFromInput: teams, settings, fromFile: { gameAttributes: ga, hasRookieContracts: true, startingSeason: file.startingSeason, teams, version: file.version }, leagueCreationID: "smp3" }, cond);
await api.main.setLocal(["autoSave", false], cond); idb.cache.stopAutoFlush();
await api.main.startFantasyDraft([...Array(10).keys()], cond);
await api.playMenu.untilEnd(undefined, cond);
await api.playMenu.untilRegularSeason(undefined, cond);
// Schedule: 4x circle-method round robin = 36 game days, all ten teams play every day, each pair meets 4 times (2 home, 2 away).
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const circle = (tids) => {
	const n = tids.length, t = shuffle([...tids]), rounds = [];
	for (let r = 0; r < n - 1; r++) { const games = []; for (let i = 0; i < n / 2; i++) { const a = t[i], b = t[n - 1 - i]; games.push((r + i) % 2 === 0 ? [a, b] : [b, a]); } rounds.push(games); t.splice(1, 0, t.pop()); }
	const out = []; for (let c = 0; c < 4; c++) for (const r of shuffle([...rounds.keys()])) out.push(...rounds[r].map(([h, a]) => (c % 2 === 0 ? [h, a] : [a, h])));
	return out;
};
await bbgm.season.setSchedule(circle([...Array(10).keys()]));
const target = 5 * Number(half);   // five games per game day
// Play-by-play: the engine only records it for one game at a time (game.play(..., gidOneGame, playByPlay)) and hands it to the UI,
// so sim each game on its own and catch the realtimeUpdate message.
const PTS = (type) => (type === "ft" ? 1 : type.startsWith("tp") ? 3 : 2);
const pbp = {}; let caught = null;
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
	}
	days++;
}
console.log(`simmed ${days} days, ${n} games with play-by-play`);
if (process.env.PBP !== "0") fs.writeFileSync(outFile.replace(/\.json$/, "-pbp.json"), JSON.stringify(pbp));
await api.main.setLocal(["autoSave", true], cond);
fs.writeFileSync(outFile, JSON.stringify(await exportLeague(bbgm, "SMP III prototype")));
console.log(`wrote ${outFile} ${(fs.statSync(outFile).size / 1e6).toFixed(1)} MB`);
process.exit(0);
