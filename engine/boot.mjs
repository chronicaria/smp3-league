// Headless boot of a *built* zengm worker bundle in Node 24.
// Usage: const bbgm = await boot({ zengmDir, extraFiles })
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

export async function boot({ zengmDir: zd, extraFiles = {} }) {
	const zengmDir = path.resolve(zd);
	const req = createRequire(path.join(zengmDir, "package.json"));
	// 1. IndexedDB: fake-indexeddb (in-memory) installs indexedDB, IDBKeyRange, ... on globalThis
	await import(pathToFileURL(req.resolve("fake-indexeddb/auto")).href);

	// 2. Worker global scope
	const listeners = {};
	globalThis.self = globalThis;
	globalThis.addEventListener = (type, fn) => { (listeners[type] ??= []).push(fn); };
	globalThis.removeEventListener = () => {};
	globalThis.location = { origin: "http://localhost", href: "http://localhost/" };

	// 3. promise-worker-bi transport: worker -> "UI". Answer every query so awaited toUI() calls resolve.
	const uiLog = [];
	globalThis.postMessage = (msg) => {
		if (!Array.isArray(msg)) return;
		const [type, id, query] = msg;
		if (type === 0) {
			// query from worker to UI: [0, id, [name, args], hostID]
			const name = Array.isArray(query) ? query[0] : undefined;
			uiLog.push(name);
			let result;
			if (name === "confirm") result = true; // auto-accept dialogs (e.g. proceed to FA)
			setImmediate(() => {
				for (const fn of listeners.message ?? []) fn({ data: [1, id, null, result] });
			});
		}
	};

	// 4. fetch: /gen/<file> -> build/gen/<file>; extraFiles maps URL -> local path (league files)
	const genDir = path.join(zengmDir, "build", "gen");
	globalThis.fetch = async (url) => {
		const u = typeof url === "string" ? url : url.url;
		const local = extraFiles[u] ?? (u.startsWith("/gen/") ? path.join(genDir, u.slice(5)) : null);
		if (!local || !fs.existsSync(local)) return new Response("not found", { status: 404 });
		const buf = fs.readFileSync(local);
		return new Response(buf, { headers: { "content-length": String(buf.length) } });
	};

	// 4b. optional determinism: every zengm random draw goes through Math.random (no crypto RNG in src/worker or src/common)
	if (process.env.SEED) {
		let a = Number(process.env.SEED) >>> 0;
		Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
	}

	// 5. load the exact bundle the browser runs
	const worker = fs.readdirSync(genDir).find((f) => /^worker-.*\.js$/.test(f) || f === "worker.js");
	await import(pathToFileURL(path.join(genDir, worker)).href);
	return { bbgm: globalThis.self.bbgm, uiLog, workerFile: worker };
}
