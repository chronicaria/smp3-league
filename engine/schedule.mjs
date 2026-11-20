// Fair schedule for an even number of teams: four round robins (every team plays every game day, each pair meets
// four times, two at each home). "Fair" means, for every team: home and away alternate as far as a round robin allows,
// and the opponents faced so far are about as strong as everyone else's after every game day, not just at the end.
// Cycles 2 and 4 repeat cycles 1 and 3 with home and away swapped, so home/away and opponents are exactly level after
// each 18 game days. Within that, a random search picks the team-to-slot assignment and round order that scores best.
// usage: fairSchedule(strength[, rand, tries]) -> [[homeTid, awayTid], ...] in play order (n/2 games per day)
//        node engine/schedule.mjs   runs the self-check

const shuffle = (a, rand) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// one round robin by the circle method: rounds[r] = [[home, away], ...]
function roundRobin(t) {
	const n = t.length, s = [...t], rounds = [];
	for (let r = 0; r < n - 1; r++) {
		const games = [];
		for (let i = 0; i < n / 2; i++) { const a = s[i], b = s[n - 1 - i]; games.push(i === 0 ? (r % 2 ? [b, a] : [a, b]) : i % 2 ? [a, b] : [b, a]); }
		rounds.push(games); s.splice(1, 0, s.pop());
	}
	return rounds;
}

export function report(days, strength) {
	const n = strength.length, mean = strength.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(strength.reduce((a, b) => a + (b - mean) ** 2, 0) / n) || 1;
	const fair = strength.map((s) => (mean * n - s) / (n - 1));   // average strength of a team's possible opponents
	const venue = Array.from({ length: n }, () => []), opp = new Array(n).fill(0);
	let dev2 = 0, worst = 0, worstBal = 0;
	days.forEach((games, d) => {
		for (const [h, a] of games) { venue[h].push("H"); venue[a].push("A"); opp[h] += strength[a]; opp[a] += strength[h]; }
		for (let t = 0; t < n; t++) {
			const dv = Math.abs(opp[t] / (d + 1) - fair[t]) / sd * Math.min(1, (d + 1) / 4);   // the first few days are noisy for any schedule; weigh them less
			dev2 += dv * dv; worst = Math.max(worst, dv);
			worstBal = Math.max(worstBal, Math.abs(venue[t].filter((x) => x === "H").length * 2 - (d + 1)));
		}
	});
	const runs = venue.map((v) => { let best = 1, cur = 1, breaks = 0; for (let i = 1; i < v.length; i++) { if (v[i] === v[i - 1]) { cur++; breaks++; } else cur = 1; best = Math.max(best, cur); } return [best, breaks]; });
	return { maxRun: Math.max(...runs.map((r) => r[0])), breaks: runs.reduce((a, r) => a + r[1], 0), worstBalance: worstBal, worstStrength: worst, strengthRms: Math.sqrt(dev2 / (n * days.length)) };
}
const cost = (r) => (r.maxRun > 2 ? 1000 * (r.maxRun - 2) : 0) + r.breaks + 400 * r.strengthRms + 60 * r.worstStrength;

export function fairSchedule(strength, rand = Math.random, tries = 4000) {
	const n = strength.length, tids = [...Array(n).keys()], flip = (rounds) => rounds.map((g) => g.map(([h, a]) => [a, h]));
	const order = (rounds) => { const k = Math.floor(rand() * rounds.length), o = [...rounds.slice(k), ...rounds.slice(0, k)]; return rand() < 0.5 ? o.reverse() : o; };   // rotations and reversal keep the alternation pattern
	let best = null;
	for (let i = 0; i < tries; i++) {
		const a = roundRobin(shuffle([...tids], rand)), b = roundRobin(shuffle([...tids], rand));
		const days = [...order(a), ...order(flip(a)), ...order(b), ...order(flip(b))], c = cost(report(days, strength));
		if (!best || c < best.c) best = { c, days };
	}
	return best.days.flat();
}

// self-check: structure is exact, and the search beats a plain shuffled round robin on both counts
if (import.meta.url === `file://${process.argv[1]}`) {
	let seed = 7; const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
	const strength = [62, 58, 55, 53, 52, 50, 49, 47, 44, 40], n = strength.length;
	const flat = fairSchedule(strength, rand), days = Array.from({ length: flat.length / (n / 2) }, (_, d) => flat.slice(d * n / 2, (d + 1) * n / 2));
	const ok = (c, m) => { if (!c) throw new Error(m); };
	ok(days.length === 36, "36 game days");
	for (const g of days) ok(new Set(g.flat()).size === n, "every team plays every day");
	const pair = {}, home = new Array(n).fill(0);
	for (const [h, a] of flat) { pair[`${h}-${a}`] = (pair[`${h}-${a}`] || 0) + 1; home[h]++; }
	for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) if (x !== y) ok(pair[`${x}-${y}`] === 2, `pair ${x}-${y} twice at each home`);
	ok(home.every((h) => h === 18), "18 home games each");
	const r = report(days, strength), half = report(days.slice(0, 18), strength);
	const naive = (() => { const rr = roundRobin(shuffle([...Array(n).keys()], rand)), out = []; for (let c = 0; c < 4; c++) for (const k of shuffle([...rr.keys()], rand)) out.push(c % 2 ? rr[k].map(([h, a]) => [a, h]) : rr[k]); return report(out, strength); })();
	ok(r.maxRun <= 2, "nobody plays three straight at home or away");
	ok(r.breaks < naive.breaks && r.strengthRms < naive.strengthRms, "beats a shuffled round robin");
	console.log("fair   ", JSON.stringify(r)); console.log("shuffled", JSON.stringify(naive)); console.log("first 18 days", JSON.stringify(half));
	console.log("schedule: all checks passed");
}
