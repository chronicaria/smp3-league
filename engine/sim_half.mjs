// Prototype league: 10 SMP III teams, SECRET ratings applied, fantasy draft (BBGM AI picks), sim to the halfway mark.
// Runs only on Andrew's Mac against a private zengm build (licence). Output: a BBGM export; tools/make_site_data.py turns it into site data.
// usage: SEED=7 node engine/sim_half.mjs <zengmDir> <secret_ratings.json> <out.json> [gamesPerTeam=18]
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
	if (r && q.ratings?.length) { q.ratings = q.ratings.map((x, i, a) => (i === a.length - 1 ? { ...x, ...r, ovr: undefined, pot: undefined, skills: undefined } : x)); swapped++; }
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
const target = 10 * Number(half) / 2;   // games played league-wide at the halfway mark
let days = 0;
const played = async () => (await idb.cache.games.getAll()).filter((x) => x.season === g.get("season")).length;
while (g.get("phase") === PHASE.REGULAR_SEASON && (await played()) < target) { await api.playMenu.day(undefined, cond); days++; }
console.log(`simmed ${days} days, ${await played()} games`);
await api.main.setLocal(["autoSave", true], cond);
fs.writeFileSync(outFile, JSON.stringify(await exportLeague(bbgm, "SMP III prototype")));
console.log(`wrote ${outFile} ${(fs.statSync(outFile).size / 1e6).toFixed(1)} MB`);
process.exit(0);
