// One runnable check of the auction rules: node tools/test_auction.mjs
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { run, fill } = createRequire(import.meta.url)('../site/auction.js');
const H = 3600e3, cfg = { start: 0, close: 48 * H, budget: 100, roster: 12, max: 35, teams: ['A', 'B', 'C'],
  lots: Array.from({ length: 40 }, (_, i) => ({ id: 'p' + i, rk: i + 1, open: Math.max(1, 12 - i) })) };
const bid = (t, team, pid, sal, yrs = 1) => ({ t: t * H, team, pid, sal, yrs });
const why = (s, i) => s.log[i].why || 'ok';

let s = run(cfg, [bid(1, 'A', 'p0', 11), bid(2, 'A', 'p0', 12), bid(3, 'B', 'p0', 12), bid(4, 'B', 'p0', 10, 3), bid(5, 'A', 'p0', 15, 1), bid(6, 'A', 'p0', 16, 1)]);
assert.equal(why(s, 0), 'Below the $12M opening price');
assert.equal(why(s, 1), 'ok');
assert.match(why(s, 2), /Does not beat/, 'an equal score does not take the lead');
assert.equal(why(s, 3), 'ok', '$10M x 3 (score 15) beats $12M x 1');
assert.match(why(s, 4), /Does not beat/, '$15M x 1 only ties score 15');
assert.equal(s.lots.get('p0').lead.team, 'A'); assert.equal(s.teams.B.n, 0, 'the outbid team is released');

s = run(cfg, [bid(47.99, 'A', 'p5', 20), bid(48, 'B', 'p5', 25), bid(-1, 'B', 'p5', 25)]);
assert.equal(s.lots.get('p5').lead.team, 'A', 'a snipe before the deadline stands; one at the deadline does not');
assert.equal(why(s, 0), 'Before the auction opened'); assert.equal(why(s, 2), 'After the deadline');

s = run(cfg, [bid(1, 'A', 'p0', 35), bid(2, 'A', 'p1', 35), bid(3, 'A', 'p2', 22), bid(4, 'A', 'p2', 21), bid(5, 'A', 'p3', 2.5), bid(6, 'A', 'p3', 9, 6), bid(7, 'Z', 'p3', 9)]);
assert.match(why(s, 2), /Over budget: at most \$21M/, '$100M minus $70M minus $1M for each of the 9 spots still open');
assert.equal(why(s, 3), 'ok'); assert.match(why(s, 4), /whole number/); assert.match(why(s, 5), /1 to 5 years/); assert.equal(why(s, 6), 'Unknown team');
assert.equal(s.teams.A.left, 9); assert.equal(s.teams.A.maxBid, 1, '$9M left with nine spots still open: $1M on the next player');

const many = Array.from({ length: 13 }, (_, i) => bid(1 + i, 'C', 'p' + (20 + i), 1));
s = run(cfg, many); assert.equal(s.teams.C.n, 12); assert.match(why(s, 12), /Already leading 12/);

s = run(cfg, [bid(1, 'A', 'p0', 30)]);
const f = fill(cfg, s), per = (t) => f.filter((x) => x.team === t);
assert.equal(per('A').length, 11); assert.equal(per('B').length, 12);
for (const t of cfg.teams) assert.ok(per(t).reduce((a, x) => a + x.sal, 0) + s.teams[t].spent <= 100, 'fills stay inside the budget');
assert.equal(new Set(f.map((x) => x.pid)).size, f.length, 'nobody is filled twice');
console.log('auction rules: all checks passed');
