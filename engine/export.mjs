// Minimal league-file exporter for headless runs; mirrors src/ui/util/makeExportStream.ts (gameAttributes -> object, teamSeasons/teamStats nested in teams).
export async function exportLeague(bbgm, name = "SMP III") {
	const { idb } = bbgm;
	await idb.cache.flush();
	const db = idb.league;
	const out = { version: db.version, meta: { name } }; // site exports carry meta.name too
	for (const store of db.objectStoreNames) {
		if (store === "teamSeasons" || store === "teamStats") continue;
		const rows = await db.getAll(store);
		if (store === "gameAttributes") {
			out.gameAttributes = Object.fromEntries(rows.map((r) => [r.key, r.value]));
		} else if (store === "teams") {
			const ts = await db.getAll("teamSeasons"), st = await db.getAll("teamStats");
			out.teams = rows.map((t) => ({ ...t, seasons: ts.filter((x) => x.tid === t.tid), stats: st.filter((x) => x.tid === t.tid) }));
		} else if (rows.length) {
			out[store] = rows;
		}
	}
	return out;
}
