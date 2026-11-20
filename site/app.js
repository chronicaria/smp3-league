/* SMP League site. One data file (data/league.json), hash routes, no framework. */
(() => {
  const $app = document.getElementById('app');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—');
  const pct = (m, a) => (a ? (100 * m / a).toFixed(1) : '—');
  const sgn = (x, d = 0) => (x > 0 ? '+' : '') + x.toFixed(d);
  const ord = (n) => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');
  const htS = (i) => (i ? `${Math.floor(i / 12)}′${i % 12}″` : '—');
  const ZONES = [['At rim', 'fgAtRim', 'fgaAtRim'], ['Low post', 'fgLowPost', 'fgaLowPost'], ['Mid-range', 'fgMidRange', 'fgaMidRange'], ['Three', 'tp', 'tpa']];
  const SUM = ['min', 'pts', 'ast', 'stl', 'blk', 'tov', 'fg', 'fga', 'tp', 'tpa', 'ft', 'fta', 'pm', 'orb', 'drb', 'pf', 'gs', 'fgAtRim', 'fgaAtRim', 'fgLowPost', 'fgaLowPost', 'fgMidRange', 'fgaMidRange'];

  let D, T, P, C, byGid, lastDay, rec, stats, tstat, odds, move, R = {};

  /* ---------- derived data ---------- */
  const blank = () => Object.assign({ gp: 0, reb: 0 }, Object.fromEntries(SUM.map((k) => [k, 0])));
  const add = (s, r) => { s.gp++; for (const k of SUM) s[k] += r[C[k]]; s.reb += r[C.orb] + r[C.drb]; return s; };
  const gmsc = (r) => r[C.pts] + 0.4 * r[C.fg] - 0.7 * r[C.fga] - 0.4 * (r[C.fta] - r[C.ft]) + 0.7 * r[C.orb] + 0.3 * r[C.drb] + r[C.stl] + 0.7 * r[C.ast] + 0.7 * r[C.blk] - 0.4 * r[C.pf] - r[C.tov];
  const tot = (side, k) => side.box.reduce((a, r) => a + r[C[k]], 0);
  const phi = (z) => { const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2), p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; };

  function derive() {
    T = D.teams; P = new Map(D.players.map((p) => [p.pid, p]));
    C = Object.fromEntries(D.cols.map((c, i) => [c, i + 1]));
    byGid = new Map(D.games.map((g) => [g.gid, g]));
    lastDay = Math.max(...D.games.map((g) => g.day));
    rec = T.map(() => ({ w: 0, l: 0, hw: 0, hl: 0, aw: 0, al: 0, pf: 0, pa: 0, res: [] }));
    tstat = T.map(() => ({ me: blank(), op: blank() }));
    stats = new Map();
    for (const g of D.games) {
      for (const [me, op, home] of [[g.home, g.away, true], [g.away, g.home, false]]) {
        const r = rec[me.tid], won = me.pts > op.pts;
        r[won ? 'w' : 'l']++; r[(home ? 'h' : 'a') + (won ? 'w' : 'l')]++; r.pf += me.pts; r.pa += op.pts; r.res.push(won ? 'W' : 'L');
        tstat[me.tid].me.gp++; tstat[me.tid].op.gp++;
        for (const row of me.box) {
          const s = stats.get(row[0]) ?? stats.set(row[0], Object.assign(blank(), { tid: me.tid })).get(row[0]);
          add(s, row); s.tid = me.tid;
          for (const k of SUM) tstat[me.tid].me[k] += row[C[k]];
          tstat[me.tid].me.reb += row[C.orb] + row[C.drb];
        }
        for (const row of op.box) { for (const k of SUM) tstat[me.tid].op[k] += row[C[k]]; tstat[me.tid].op.reb += row[C.orb] + row[C.drb]; }
      }
    }
    const prev = T.map(() => ({ w: 0, l: 0, d: 0 }));
    for (const g of D.games) if (g.day < lastDay) for (const [me, op] of [[g.home, g.away], [g.away, g.home]]) { prev[me.tid][me.pts > op.pts ? 'w' : 'l']++; prev[me.tid].d += me.pts - op.pts; }
    const po = T.map((t) => t.tid).sort((a, b) => prev[b].w / Math.max(1, prev[b].w + prev[b].l) - prev[a].w / Math.max(1, prev[a].w + prev[a].l) || prev[b].d - prev[a].d), now = order();
    move = T.map((t) => po.indexOf(t.tid) - now.indexOf(t.tid));   // positive = climbed since the last game day
    odds = playoffOdds();
  }
  let DIST = null;
  const HK = { min: (s) => per(s, 'min'), pts: (s) => per(s, 'pts'), reb: (s) => per(s, 'reb'), ast: (s) => per(s, 'ast'), stl: (s) => per(s, 'stl'), blk: (s) => per(s, 'blk'), tov: (s) => per(s, 'tov'),
    fgp: (s) => (s.fga >= 2 * s.gp ? s.fg / s.fga : null), tpp: (s) => (s.tpa >= s.gp ? s.tp / s.tpa : null), ftp: (s) => (s.fta >= s.gp ? s.ft / s.fta : null), pm: (s) => per(s, 'pm') };
  const rankIn = (arr, v) => { let lo = 0, hi = 0; for (const y of arr) { if (y < v) lo++; if (y <= v) hi++; } return arr.length ? (lo + hi) / 2 / arr.length : 0.5; };
  const tintOf = (p) => `background:color-mix(in srgb, var(${p >= 0.5 ? '--up' : '--bad'}) ${(Math.abs(p - 0.5) * 64).toFixed(0)}%, transparent)`;
  function heat(k, s, low) {   // style for a table cell: how a player's per-game number ranks among everyone who has played three games
    DIST ??= Object.fromEntries(Object.keys(HK).map((key) => [key, [...stats.values()].filter((x) => x.gp >= 3).map(HK[key]).filter((v) => v != null)]));
    const v = HK[k](s); if (v == null) return '';
    const p = rankIn(DIST[k], v); return ` style="${tintOf(low ? 1 - p : p)}"`;
  }
  const team = (tid) => T[tid];
  const gpT = (tid) => rec[tid].w + rec[tid].l;
  const recStr = (tid) => `${rec[tid].w}-${rec[tid].l}`;
  const streak = (tid) => { const r = rec[tid].res; if (!r.length) return '—'; let n = 0; for (let i = r.length - 1; i >= 0 && r[i] === r.at(-1); i--) n++; return r.at(-1) + n; };
  const last10 = (tid) => { const r = rec[tid].res.slice(-10); return `${r.filter((x) => x === 'W').length}-${r.filter((x) => x === 'L').length}`; };
  const diff = (tid) => (rec[tid].pf - rec[tid].pa) / Math.max(1, gpT(tid));
  const order = () => T.map((t) => t.tid).sort((a, b) => rec[b].w / Math.max(1, gpT(b)) - rec[a].w / Math.max(1, gpT(a)) || diff(b) - diff(a));
  const gb = (tid, lead) => { const v = ((rec[lead].w - rec[tid].w) + (rec[tid].l - rec[lead].l)) / 2; return v ? String(v) : '—'; };
  const short = (n) => { const p = n.split(' '); return p.length > 1 ? `${p[0][0]}. ${p.slice(1).join(' ')}` : n; };
  const per = (s, k) => s[k] / s.gp;
  const qualified = () => [...stats.entries()].filter(([, s]) => s.gp >= Math.max(3, lastDay * 0.4));
  function rankOf(pid, f) { const q = qualified().map(([id, s]) => [id, f(s)]).sort((a, b) => b[1] - a[1]); const i = q.findIndex((x) => x[0] === pid); return i < 0 ? null : i + 1; }
  function teamRank(tid, f, asc) { const v = T.map((t) => [t.tid, f(t.tid)]).sort((a, b) => (asc ? a[1] - b[1] : b[1] - a[1])); return v.findIndex((x) => x[0] === tid) + 1; }

  /* playoff odds: 3,000 seeded sims of the remaining schedule from each team's shrunk point differential */
  function playoffOdds() {
    let a = 20270; const rnd = () => { a = (a + 0x6d2b79f5) | 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const rt = T.map((t) => diff(t.tid) * gpT(t.tid) / (gpT(t.tid) + 8)), N = 3000, made = T.map(() => 0), wins = T.map(() => 0), champ = T.map(() => 0);
    const pr = D.schedule.map((s) => phi((rt[s.home] - rt[s.away] + 2.5) / 12));
    const series = (hi, lo) => { let a = 0, b = 0; for (const home of [1, 1, 0, 0, 1]) { if (rnd() < phi((rt[hi] - rt[lo] + (home ? 2.5 : -2.5)) / 12)) a++; else b++; if (a === 3 || b === 3) break; } return a === 3 ? hi : lo; };   // best of five, 2-2-1
    for (let i = 0; i < N; i++) {
      const w = T.map((t) => rec[t.tid].w + rnd() * 0.01);
      D.schedule.forEach((s, j) => { w[rnd() < pr[j] ? s.home : s.away]++; });
      const sd = T.map((t) => t.tid).sort((x, y) => w[y] - w[x]).slice(0, 4);
      sd.forEach((tid) => made[tid]++);
      const s1 = series(sd[0], sd[3]), s2 = series(sd[1], sd[2]);
      champ[sd.indexOf(s1) < sd.indexOf(s2) ? series(s1, s2) : series(s2, s1)]++;
      w.forEach((v, tid) => { wins[tid] += Math.floor(v); });
    }
    return T.map((t) => ({ p: made[t.tid] / N, w: wins[t.tid] / N, c: champ[t.tid] / N }));
  }
  const arrow = (tid) => (move[tid] > 0 ? `<span class="mv up">▲ ${move[tid]}</span>` : move[tid] < 0 ? `<span class="mv dn">▼ ${-move[tid]}</span>` : '<span class="mv"></span>');
  const recPl = (tid) => `${recStr(tid)} (${ord(order().indexOf(tid) + 1)})`;
  const pctStr = (p) => (p > 0.9995 ? '>99.9%' : p < 0.0005 ? '<0.1%' : (100 * p).toFixed(1) + '%');
  const oddsStr = (tid) => pctStr(odds[tid].p);

  /* game flow from the score timeline [sec, away, home] */
  function flow(g) {
    const total = 2880 + 300 * g.ot, tl = [[0, 0, 0], ...g.tl], f = { total, bigA: 0, bigH: 0, changes: 0, ties: 0, ledA: 0, ledH: 0, series: [] };
    let prev = 0;
    for (let i = 0; i < tl.length; i++) {
      const [t, a, h] = tl[i], lead = h - a, end = i + 1 < tl.length ? tl[i + 1][0] : total;
      f.bigA = Math.max(f.bigA, -lead); f.bigH = Math.max(f.bigH, lead);
      if (lead > 0) f.ledH += end - t; else if (lead < 0) f.ledA += end - t;
      if (lead === 0 && i) f.ties++;
      if (lead && prev && Math.sign(lead) !== Math.sign(prev)) f.changes++;
      if (lead) prev = lead;
    }
    const M = D.wp, wp = (t, lead) => { if (t >= total) return lead > 0 ? 1 : lead < 0 ? 0 : 0.5; const fr = (t < 2880 ? 2880 - t : total - t) / 2880; return phi((lead + M.hca * fr) / Math.sqrt(M.sd * M.sd * fr + M.kappa)); };
    f.series = tl.map(([t, a, h]) => [t, a, h, wp(t, h - a)]);
    for (let t = 240; t < total; t += 240) { const e = tl.findLast((x) => x[0] <= t); f.series.push([t, e[1], e[2], wp(t, e[2] - e[1])]); }   // a point every four minutes so quiet stretches still drift
    f.series.sort((x, y) => x[0] - y[0]); f.series.push([total, g.away.pts, g.home.pts, 0]);
    // display curve: the model sampled every 12 s, averaged over 24 s either side (less near the ends, so it still starts and finishes true)
    const at = (t) => { const e = tl.findLast((x) => x[0] <= t) || tl[0]; return wp(t, e[2] - e[1]); }, grid = [];
    for (let t = 0; t <= total; t += 12) grid.push([t, at(Math.min(t, total - 0.5))]);
    f.curve = grid.map(([t], k) => { const w = Math.round(Math.min(24, t, total - t) / 12); let s = 0; for (let m = k - w; m <= k + w; m++) s += grid[m][1]; return [t, s / (2 * w + 1)]; });
    f.curve.push([total, g.home.pts > g.away.pts ? 1 : 0]);
    f.series[f.series.length - 1][3] = g.home.pts > g.away.pts ? 1 : 0;
    return f;
  }
  const clock = (t, total) => { if (t >= total) return 'Final'; const q = t < 2880 ? Math.floor(t / 720) : 4 + Math.floor((t - 2880) / 300), len = q < 4 ? 720 : 300, into = q < 4 ? t - q * 720 : (t - 2880) % 300, rem = len - into; return `${q < 4 ? 'Q' + (q + 1) : 'OT' + (q > 4 ? q - 3 : '')} ${Math.floor(rem / 60)}:${String(Math.floor(rem % 60)).padStart(2, '0')}`; };

  /* ---------- atoms ---------- */
  const logo = (tid, size = 26) => `<img class="logo" src="${team(tid).logo}" width="${size}" height="${size}" alt="${esc(team(tid).region)} ${esc(team(tid).name)}">`;
  function face(pid, size = 32) {
    const p = P.get(pid), ini = esc((p?.name || '?').split(' ').map((x) => x[0]).join('').slice(0, 2));
    const img = p?.espn ? `<img src="https://a.espncdn.com/i/headshots/nba/players/full/${p.espn}.png" alt="" loading="lazy" onerror="this.outerHTML='<span class=&quot;ini&quot;>${ini}</span>'">` : `<span class="ini">${ini}</span>`;
    return `<span class="face" style="width:${size}px;height:${size}px">${img}</span>`;
  }
  const card = (title, body, meta = '', cls = '') => `<section class="card ${cls}"><div class="ch"><h2>${title}</h2>${meta}</div>${body}</section>`;
  const plink = (pid, text) => `<a href="#player-${pid}">${esc(text ?? P.get(pid)?.name)}</a>`;
  const tname = (tid) => `${esc(team(tid).region)} ${esc(team(tid).name)}`;
  const tlink = (tid, inner) => `<a href="#team-${team(tid).abbrev}">${inner}</a>`;
  const fin = (g) => `Final${g.ot ? `/${g.ot > 1 ? g.ot : ''}OT` : ''}`;
  const lrow = (pid, s, v, i, sub) => `<a class="row r-lead${i ? '' : ' first'}" href="#player-${pid}"><span class="n">${i + 1}</span>${face(pid)}<span class="who"><b>${esc(P.get(pid).name)}</b><span>${sub ?? `${team(s.tid).abbrev} · ${P.get(pid).pos}`}</span></span><span class="v">${v}</span></a>`;
  const line = (r) => `${r[C.pts]} pts, ${r[C.orb] + r[C.drb]} reb, ${r[C.ast]} ast`;
  const allRows = (g) => [...g.home.box.map((r) => [r, g.home.tid, g]), ...g.away.box.map((r) => [r, g.away.tid, g])];

  /* ---------- game cards ---------- */
  function gameCard(g) {
    const row = (s, o) => `<div class="gr${s.pts < o.pts ? ' lost' : ''}">${logo(s.tid)}<span class="tn">${esc(team(s.tid).name)}<small>${recPl(s.tid)}</small></span><span class="sc">${s.pts}</span></div>`;
    const [r] = allRows(g).sort((a, b) => gmsc(b[0]) - gmsc(a[0]))[0];
    return `<a class="card gc" href="#game-${g.gid}"><div class="ch"><h2>Game ${g.day}${g.ot ? ` · ${g.ot > 1 ? g.ot : ''}OT` : ''}</h2><span>Box score</span></div>${row(g.away, g.home)}${row(g.home, g.away)}<div class="gf">${face(r[0], 24)}<span><b>${esc(short(P.get(r[0]).name))}</b> ${line(r)}</span></div></a>`;
  }
  function upCard(s) {
    const row = (tid) => `<div class="gr">${logo(tid)}<span class="tn">${esc(team(tid).name)}<small>${recStr(tid)}</small></span><span class="sc"></span></div>`;
    return `<div class="card gc"><div class="ch"><h2>Upcoming</h2><span>Game ${s.day}</span></div>${row(s.away)}${row(s.home)}<div class="gf"><span>Line: <b>${spread(s)}</b></span></div></div>`;
  }
  const power = (tid) => diff(tid) * gpT(tid) / (gpT(tid) + 8);
  const spread = (s) => { const x = Math.round((power(s.home) - power(s.away) + 2.5) * 2) / 2; return x ? `${team(x > 0 ? s.home : s.away).abbrev} -${Math.abs(x).toFixed(1)}` : 'Pick ’em'; };
  const strip = (day) => `<div class="strip">${D.games.filter((g) => g.day === day).map((g) => { const ln = (s, o) => `<span class="ln${s.pts < o.pts ? ' lost' : ''}">${logo(s.tid, 18)}<span>${team(s.tid).abbrev}</span><b>${s.pts}</b></span>`;
    return `<a href="#game-${g.gid}"><span class="st">Game ${g.day}${g.ot ? ` · ${g.ot > 1 ? g.ot : ''}OT` : ''}</span>${ln(g.away, g.home)}${ln(g.home, g.away)}</a>`; }).join('')}</div>`;

  /* ---------- shared blocks ---------- */
  function standingsMini() {
    const o = order();
    return card('Standings', `<table class="mini"><thead><tr><th class="t">Team</th><th>W</th><th>L</th><th>GB</th><th>Playoffs</th><th>Title</th></tr></thead><tbody>${o.map((tid, i) =>
      `<tr${i === 3 ? ' class="cut"' : ''}><td class="t nm">${arrow(tid)}${tlink(tid, `${logo(tid, 20)}${esc(team(tid).name)}`)}</td><td>${rec[tid].w}</td><td>${rec[tid].l}</td><td>${gb(tid, o[0])}</td><td>${oddsStr(tid)}</td><td>${pctStr(odds[tid].c)}</td></tr>`).join('')}</tbody></table>`, '<a href="#standings">Full table</a>');
  }
  const CATS = [['Points', 'PTS', (s) => per(s, 'pts')], ['Rebounds', 'REB', (s) => per(s, 'reb')], ['Assists', 'AST', (s) => per(s, 'ast')], ['Steals', 'STL', (s) => per(s, 'stl')], ['Blocks', 'BLK', (s) => per(s, 'blk')],
    ['3-point %', '3P%', (s) => (s.tpa >= 3 * s.gp ? 100 * s.tp / s.tpa : -99)], ['Offensive BPM', 'oBPM', (s, p) => (p.adv ? p.adv[6] : -99)], ['Defensive BPM', 'dBPM', (s, p) => (p.adv ? p.adv[7] : -99)]];
  const topN = (f, n) => qualified().map(([pid, s]) => [pid, s, f(s, P.get(pid))]).filter((x) => x[2] > -90).sort((a, b) => b[2] - a[2]).slice(0, n);
  function injuryCard(tid, wide) {
    const out = D.players.filter((p) => p.inj && p.tid >= 0 && (tid == null || p.tid === tid)).sort((a, b) => b.inj[1] - a.inj[1]);
    const rows = out.map((p) => `<a class="row r-news" href="#player-${p.pid}">${face(p.pid)}<span class="who"><b>${esc(p.name)}</b><span>${team(p.tid).abbrev} · ${esc(p.inj[0])}</span></span><span class="v" style="font-size:13px;font-weight:500">${p.inj[1]} g</span></a>`).join('');
    return card('Injury report', rows ? (wide ? `<div class="injgrid">${rows}</div>` : rows) : '<p class="note">Nobody is hurt.</p>', `<span>${out.length} out · games remaining</span>`);
  }
  function teamStatsTable() {
    const ma = (m, a, g) => `${f1(m / g)}-${f1(a / g)}`;
    const V = { pf: (t) => tstat[t].me.pts / gpT(t), pa: (t) => tstat[t].op.pts / gpT(t), fgp: (t) => tstat[t].me.fg / tstat[t].me.fga, tpp: (t) => tstat[t].me.tp / tstat[t].me.tpa, ftp: (t) => tstat[t].me.ft / tstat[t].me.fta,
      reb: (t) => tstat[t].me.reb / gpT(t), ast: (t) => tstat[t].me.ast / gpT(t), tov: (t) => tstat[t].me.tov / gpT(t), stl: (t) => tstat[t].me.stl / gpT(t), blk: (t) => tstat[t].me.blk / gpT(t) };
    const all = Object.fromEntries(Object.keys(V).map((k) => [k, T.map((t) => V[k](t.tid))]));
    const h = (k, tid, low) => { const p = rankIn(all[k], V[k](tid)); return ` style="${tintOf(low ? 1 - p : p)}"`; };
    const rows = order().map((tid) => { const m = tstat[tid].me, o = tstat[tid].op, g = m.gp;
      return `<tr><td class="t nm">${tlink(tid, `${logo(tid, 20)}${esc(team(tid).name)}`)}</td><td class="grp"${h('pf', tid)}><b>${f1(m.pts / g)}</b></td><td${h('pa', tid, 1)}>${f1(o.pts / g)}</td><td class="grp">${ma(m.fg, m.fga, g)}</td><td${h('fgp', tid)}><b>${pct(m.fg, m.fga)}</b></td><td class="grp">${ma(m.tp, m.tpa, g)}</td><td${h('tpp', tid)}><b>${pct(m.tp, m.tpa)}</b></td><td class="grp">${ma(m.ft, m.fta, g)}</td><td${h('ftp', tid)}><b>${pct(m.ft, m.fta)}</b></td><td class="grp"${h('reb', tid)}>${f1(m.reb / g)}</td><td${h('ast', tid)}>${f1(m.ast / g)}</td><td${h('tov', tid, 1)}>${f1(m.tov / g)}</td><td${h('stl', tid)}>${f1(m.stl / g)}</td><td${h('blk', tid)}>${f1(m.blk / g)}</td></tr>`; }).join('');
    return card('Team stats', `<div class="scroll"><table><thead><tr><th class="t">Team</th><th class="grp">PF</th><th>PA</th><th class="grp">FG</th><th>FG%</th><th class="grp">3P</th><th>3P%</th><th class="grp">FT</th><th>FT%</th><th class="grp">REB</th><th>AST</th><th>TO</th><th>STL</th><th>BLK</th></tr></thead><tbody>${rows}</tbody></table></div>`, '<span>Per game</span>');
  }

  /* ---------- win probability chart ---------- */
  function wpChart(g, f, h = 190) {
    const W = 1000, x = (t) => t / f.total * W, y = (p) => p * h, c = f.curve.map(([t, p]) => [x(t), y(p)]);
    const pts = c.map(([px, py], k) => { if (!k) return `${px.toFixed(1)},${py.toFixed(1)}`; const p0 = c[Math.max(0, k - 2)], p1 = c[k - 1], p3 = c[Math.min(c.length - 1, k + 1)];
      return `C${(p1[0] + (px - p0[0]) / 6).toFixed(1)},${(p1[1] + (py - p0[1]) / 6).toFixed(1)} ${(px - (p3[0] - p1[0]) / 6).toFixed(1)},${(py - (p3[1] - p1[1]) / 6).toFixed(1)} ${px.toFixed(1)},${py.toFixed(1)}`; }).join(' ');
    const area = `M0,${h / 2} L${pts} L${W},${h / 2} Z`, id = 'c' + g.gid;
    const qs = [720, 1440, 2160, ...(g.ot ? [2880] : [])].map((t) => `<line x1="${x(t)}" x2="${x(t)}" y1="0" y2="${h}" stroke="var(--line)"/>`).join('');
    return `<svg viewBox="0 0 ${W} ${h}" preserveAspectRatio="none" data-wp="${g.gid}" role="img" aria-label="Win probability over the game">
      <defs><clipPath id="${id}a"><rect width="${W}" height="${h / 2}"/></clipPath><clipPath id="${id}h"><rect y="${h / 2}" width="${W}" height="${h / 2}"/></clipPath></defs>
      ${qs}<path d="${area}" fill="var(--away)" opacity=".35" clip-path="url(#${id}a)"/><path d="${area}" fill="var(--home)" opacity=".35" clip-path="url(#${id}h)"/>
      <line x1="0" x2="${W}" y1="${h / 2}" y2="${h / 2}" stroke="var(--faint)" stroke-dasharray="3 5"/><path d="M${pts}" fill="none" stroke="var(--ink)" stroke-width="2" vector-effect="non-scaling-stroke"/>
      <line class="cur" y1="0" y2="${h}" stroke="var(--gold)" vector-effect="non-scaling-stroke" visibility="hidden"/></svg>`;
  }
  function wpCard(g, f) {
    const a = team(g.away.tid), h = team(g.home.tid);
    return card('Win probability', `<div class="wp"><div class="read"><span>▲ ${a.abbrev}</span><span id="wpread">Hover the chart to follow the game</span><span>${h.abbrev} ▼</span></div>${wpChart(g, f)}
      <div class="qs">${['Q1', 'Q2', 'Q3', 'Q4'].map((q) => `<span style="grid-column:span 12">${q}</span>`).join('')}${Array.from({ length: g.ot }, (_, i) => `<span style="grid-column:span 5">OT${i ? i + 1 : ''}</span>`).join('')}</div></div>
      <div class="kv"><div><b>${Math.max(f.bigA, 0)}</b><span>${a.abbrev} largest lead</span></div><div><b>${Math.max(f.bigH, 0)}</b><span>${h.abbrev} largest lead</span></div><div><b>${f.changes}</b><span>Lead changes</span></div><div><b>${f.ties}</b><span>Ties</span></div></div>`);
  }
  function wireWp(g, f) {
    const svg = document.querySelector(`[data-wp="${g.gid}"]`), out = document.getElementById('wpread'); if (!svg || !out) return;
    const cur = svg.querySelector('.cur'), a = team(g.away.tid).abbrev, h = team(g.home.tid).abbrev;
    svg.addEventListener('pointermove', (e) => { const b = svg.getBoundingClientRect(), fr = Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), s = f.series.findLast((x) => x[0] <= fr * f.total) || f.series[0];
      cur.setAttribute('x1', fr * 1000); cur.setAttribute('x2', fr * 1000); cur.setAttribute('visibility', 'visible');
      out.innerHTML = `${clock(s[0], f.total)} · ${a} <b>${s[1]}</b> – <b>${s[2]}</b> ${h} · <b>${s[3] >= 0.5 ? h : a} ${(100 * Math.max(s[3], 1 - s[3])).toFixed(1)}%</b>`; });
    svg.addEventListener('pointerleave', () => { cur.setAttribute('visibility', 'hidden'); out.textContent = 'Hover the chart to follow the game'; });
  }

  /* ---------- home ---------- */
  const recapLead = (r) => { const lead = byGid.get(r.games[0]?.gid); return `--away:${lead ? team(lead.away.tid).accent : '#444'};--home:${lead ? team(lead.home.tid).accent : '#444'}`; };
  function recap() {
    const r = R[lastDay]; if (!r) return '';
    return `<a class="card lede" href="#recap-${lastDay}" style="display:block;${recapLead(r)}"><div class="gh lede-top" style="border-bottom:0"><span class="kick">Game ${lastDay} recap</span><h1>${esc(r.headline)}</h1><p class="dek">${esc(r.dek)}</p><span class="more">Read the full recap →</span></div></a>`;
  }
  function recapPage(n) {
    const r = R[n]; if (!r) return notFound();
    const sc = (g) => { const w = g.home.pts > g.away.pts ? g.home : g.away, l = w === g.home ? g.away : g.home; return `${logo(w.tid, 18)}${team(w.tid).abbrev} ${w.pts}, ${team(l.tid).abbrev} ${l.pts}${g.ot ? ` · ${g.ot > 1 ? g.ot : ''}OT` : ''} · Box score`; };
    const others = Object.keys(R).map(Number).filter((x) => x !== n).sort((a, b) => b - a);
    $app.innerHTML = `<article class="card lede story" style="${recapLead(r)}"><div class="gh lede-top"><span class="kick">Game ${n} recap</span><h1>${esc(r.headline)}</h1><p class="dek">${esc(r.dek)}</p></div>
      <div class="art">${r.games.map((x) => { const g = byGid.get(x.gid); return g ? `<p>${esc(x.text)}</p><a class="slug" href="#game-${g.gid}">${sc(g)}</a>` : ''; }).join('')}</div></article>
      ${others.length ? `<p class="note" style="max-width:760px;margin:0 auto">Earlier recaps: ${others.map((x) => `<a href="#recap-${x}">Game ${x}</a>`).join(' · ')}</p>` : ''}`;
  }
  function home() {
    const today = D.games.filter((g) => g.day === lastDay), feat = [...today].sort((a, b) => { const fa = flow(a), fb = flow(b); return (fb.changes + fb.ties * 0.5 - Math.abs(b.home.pts - b.away.pts)) - (fa.changes + fa.ties * 0.5 - Math.abs(a.home.pts - a.away.pts)); })[0];
    const f = flow(feat), a = feat.away, h = feat.home, aw = a.pts > h.pts;
    const blk = (s, home, won) => `<div class="gt${home ? ' h' : ''}">${logo(s.tid, 64)}<div class="who"><b>${tname(s.tid)}</b><span>${recStr(s.tid)}</span></div><span class="big ${won ? '' : 'lost'}">${s.pts}</span></div>`;
    const best = allRows(feat).sort((x, y) => gmsc(y[0]) - gmsc(x[0])).slice(0, 3);
    const featured = `<section class="card" style="--away:${team(a.tid).accent};--home:${team(h.tid).accent}"><div class="ch"><h2>Game of the day</h2><a href="#game-${feat.gid}">Full box score</a></div>
      <a class="gh" href="#game-${feat.gid}" style="display:block"><div class="gh-in">${blk(a, false, aw)}<div class="ls"><div class="sub">${f.changes} lead changes · ${f.ties} ties</div></div>${blk(h, true, !aw)}</div></a>
      <div class="wp" style="border-top:1px solid var(--line)">${wpChart(feat, f, 110)}</div>
      <div class="grid g-3" style="gap:0;border-top:1px solid var(--line)">${best.map(([r, tid]) => `<a class="row r-news" style="border-bottom:0" href="#player-${r[0]}">${face(r[0])}<span class="who"><b>${esc(short(P.get(r[0]).name))}</b><span>${team(tid).abbrev} · ${line(r)}</span></span><span></span></a>`).join('')}</div></section>`;
    const lead3 = CATS.slice(0, 5).map(([lab, ab, fn]) => `<div class="ch" style="height:30px;background:var(--raise)"><h2 style="font-size:10.5px;color:var(--muted)">${lab}</h2></div>${topN(fn, 3).map(([pid, s, v], i) => lrow(pid, s, f1(v), i)).join('')}`).join('');
    $app.innerHTML = `${strip(lastDay)}
      <div class="grid g-main"><div class="stack">${recap()}${featured}
        <div class="grid g-2">${today.filter((g) => g !== feat).map(gameCard).join('')}</div>
        ${teamStatsTable()}</div>
      <aside class="stack">${standingsMini()}${card('League leaders', lead3, '<a href="#leaders">All leaders</a>')}</aside></div>
      <div style="margin-top:var(--gap)">${injuryCard(null, true)}</div>`;
  }

  /* ---------- scores ---------- */
  function scoreRow(g) {
    const a = g.away, h = g.home, f = flow(g), qh = a.q.map((_, i) => (i < 4 ? i + 1 : 'OT'));
    const tr = (s, o) => `<tr class="${s.pts > o.pts ? 'won' : 'lost'}"><td class="t tm"><div class="tmw">${logo(s.tid, 30)}<span><b>${esc(team(s.tid).name)}</b><small>${recPl(s.tid)}</small></span></div></td>${s.q.map((x) => `<td>${x}</td>`).join('')}<td class="tt">${s.pts}</td></tr>`;
    const top = (s) => { const r = s.box.reduce((x, y) => (gmsc(y) > gmsc(x) ? y : x)); return `<a class="tp" href="#player-${r[0]}">${face(r[0], 38)}<span><b>${esc(short(P.get(r[0]).name))}</b> <small>${P.get(r[0]).pos} · ${team(s.tid).abbrev}</small><em>${r[C.pts]} PTS, ${r[C.orb] + r[C.drb]} REB, ${r[C.ast]} AST${r[C.stl] >= 3 ? `, ${r[C.stl]} STL` : ''}${r[C.blk] >= 3 ? `, ${r[C.blk]} BLK` : ''}</em></span></a>`; };
    const t = (s, k) => tot(s, k), st = (lab, fa, fh) => `<tr><td>${fa}</td><th>${lab}</th><td>${fh}</td></tr>`;
    return `<section class="card grow" style="--away:${team(a.tid).accent};--home:${team(h.tid).accent}">
      <a class="gcell ls2" href="#game-${g.gid}"><table><thead><tr><th class="t">${g.ot ? (g.ot > 1 ? g.ot : '') + 'OT' : ''}</th>${qh.map((q) => `<th>${q}</th>`).join('')}<th>T</th></tr></thead><tbody>${tr(a, h)}${tr(h, a)}</tbody></table></a>
      <a class="gcell" href="#game-${g.gid}"><span class="label">Win probability</span>${wpChart(g, f, 150)}<span class="cap">${f.changes} lead change${f.changes === 1 ? '' : 's'} · largest lead ${team(f.bigA > f.bigH ? a.tid : h.tid).abbrev} ${Math.max(f.bigA, f.bigH)}</span></a>
      <div class="gcell"><span class="label">Top performers</span>${top(a)}${top(h)}</div>
      <div class="gcell"><table class="ks"><thead><tr><td>${team(a.tid).abbrev}</td><th></th><td>${team(h.tid).abbrev}</td></tr></thead><tbody>${st('FG%', pct(t(a, 'fg'), t(a, 'fga')), pct(t(h, 'fg'), t(h, 'fga')))}${st('3PT', `${t(a, 'tp')}-${t(a, 'tpa')}`, `${t(h, 'tp')}-${t(h, 'tpa')}`)}${st('REB', t(a, 'orb') + t(a, 'drb'), t(h, 'orb') + t(h, 'drb'))}${st('AST', t(a, 'ast'), t(h, 'ast'))}${st('TO', t(a, 'tov'), t(h, 'tov'))}</tbody></table><a class="btn" href="#game-${g.gid}">Box score</a></div></section>`;
  }
  function upRow(s) {
    const tr = (tid) => `<tr><td class="t tm"><div class="tmw">${logo(tid, 30)}<span><b>${esc(team(tid).name)}</b><small>${recPl(tid)}</small></span></div></td></tr>`;
    const lead = (tid) => { const b = [...stats.entries()].filter(([, x]) => x.tid === tid && x.gp >= 3).sort((x, y) => per(y[1], 'pts') - per(x[1], 'pts'))[0]; return b ? `<a class="tp" href="#player-${b[0]}">${face(b[0], 38)}<span><b>${esc(short(P.get(b[0]).name))}</b> <small>${P.get(b[0]).pos} · ${team(tid).abbrev}</small><em>${f1(per(b[1], 'pts'))} PPG, ${f1(per(b[1], 'reb'))} RPG, ${f1(per(b[1], 'ast'))} APG</em></span></a>` : ''; };
    return `<section class="card grow up"><div class="gcell ls2"><table><thead><tr><th class="t">Upcoming</th></tr></thead><tbody>${tr(s.away)}${tr(s.home)}</tbody></table></div>
      <div class="gcell"><span class="label">Line</span><span class="line">${spread(s)}</span><span class="cap">${team(s.away).abbrev} at ${team(s.home).abbrev}</span></div>
      <div class="gcell"><span class="label">Leading scorers</span>${lead(s.away)}${lead(s.home)}</div><div class="gcell"></div></section>`;
  }
  function scores(day) {
    const days = [...new Set([...D.games.map((g) => g.day), ...D.schedule.map((s) => s.day)])].sort((a, b) => a - b);
    day = days.includes(day) ? day : lastDay;
    const games = D.games.filter((g) => g.day === day), up = D.schedule.filter((s) => s.day === day), i = days.indexOf(day);
    $app.innerHTML = `<div class="page-h"><h1>Scores</h1><span>Game ${day} of ${days.at(-1)}</span></div>
      <div class="days"><a class="btn" href="#scores-${days[Math.max(0, i - 1)]}" aria-label="Previous game">‹</a><div class="dayrail" id="rail">${days.map((d) => `<a href="#scores-${d}" class="${d > lastDay ? 'fut' : ''}" aria-current="${d === day}" aria-label="Game ${d}">${d}</a>`).join('')}</div><a class="btn" href="#scores-${days[Math.min(days.length - 1, i + 1)]}" aria-label="Next game">›</a></div>
      <div class="stack">${games.map(scoreRow).join('') + up.map(upRow).join('')}</div>`;
    document.querySelector('#rail [aria-current="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  /* ---------- game ---------- */
  function boxTable(side) {
    const cols = ['MIN', 'PTS', 'FG', '3PT', 'FT', 'REB', 'AST', 'TO', 'STL', 'BLK', 'OREB', 'DREB', 'PF', '+/-'];
    const row = (r) => { const p = P.get(r[0]), pm = r[C.pm];
      return `<tr><td class="t nm">${plink(r[0], short(p.name))} <small>${p.pos}</small></td><td>${Math.round(r[C.min])}</td><td><b>${r[C.pts]}</b></td><td>${r[C.fg]}-${r[C.fga]}</td><td>${r[C.tp]}-${r[C.tpa]}</td><td>${r[C.ft]}-${r[C.fta]}</td><td>${r[C.orb] + r[C.drb]}</td><td>${r[C.ast]}</td><td>${r[C.tov]}</td><td>${r[C.stl]}</td><td>${r[C.blk]}</td><td>${r[C.orb]}</td><td>${r[C.drb]}</td><td>${r[C.pf]}</td><td class="${pm > 0 ? 'up' : pm < 0 ? 'dn' : ''}">${sgn(pm)}</td></tr>`; };
    const dnp = ([pid, why]) => `<tr><td class="t nm">${plink(pid, short(P.get(pid).name))} <small>${P.get(pid).pos}</small></td><td class="dnp" colspan="14">DNP - ${esc(why.toUpperCase())}</td></tr>`;
    const head = (lab) => `<tr class="sub"><th class="t">${lab}</th>${cols.map((c) => `<th>${c}</th>`).join('')}</tr>`, t = (k) => tot(side, k);
    return card(`${logo(side.tid, 22)}${tname(side.tid)}`, `<div class="scroll"><table class="box">
      <thead>${head('Starters')}</thead><tbody>${side.box.filter((r) => r[C.gs]).map(row).join('')}</tbody><thead>${head('Bench')}</thead><tbody>${side.box.filter((r) => !r[C.gs]).map(row).join('')}${side.dnp.map(dnp).join('')}
      <tr class="tot"><td class="t">Team</td><td></td><td>${t('pts')}</td><td>${t('fg')}-${t('fga')}</td><td>${t('tp')}-${t('tpa')}</td><td>${t('ft')}-${t('fta')}</td><td>${t('orb') + t('drb')}</td><td>${t('ast')}</td><td>${t('tov')}</td><td>${t('stl')}</td><td>${t('blk')}</td><td>${t('orb')}</td><td>${t('drb')}</td><td>${t('pf')}</td><td></td></tr>
      <tr class="pct"><td></td><td></td><td></td><td>${pct(t('fg'), t('fga'))}%</td><td>${pct(t('tp'), t('tpa'))}%</td><td>${pct(t('ft'), t('fta'))}%</td><td colspan="9"></td></tr></tbody></table></div>`, `<span>${recStr(side.tid)}</span>`);
  }
  const keys = (g) => `<div class="keys"><span>${logo(g.away.tid, 22)}<i class="sw" style="background:repeating-linear-gradient(-55deg,var(--away) 0 3px,transparent 3px 5px)"></i>${team(g.away.tid).abbrev}</span><span>${team(g.home.tid).abbrev}<i class="sw" style="background:var(--home)"></i>${logo(g.home.tid, 22)}</span></div>`;
  function gameLeaders(g) {
    const best = (side, f) => side.box.reduce((a, r) => (f(r) > f(a) ? r : a), side.box[0]);
    const cats = [['Points', (r) => r[C.pts], (r) => `${r[C.fg]}/${r[C.fga]} FG, ${r[C.ft]}/${r[C.fta]} FT`], ['Rebounds', (r) => r[C.orb] + r[C.drb], (r) => `${r[C.drb]} DREB, ${r[C.orb]} OREB`], ['Assists', (r) => r[C.ast], (r) => `${r[C.tov]} TO, ${Math.round(r[C.min])} MIN`]];
    const side = (s, f, ln, h) => { const r = best(s, f); return `<a class="p${h ? ' h' : ''}" href="#player-${r[0]}">${face(r[0], 40)}<b>${f(r)}</b><span class="nm1">${esc(short(P.get(r[0]).name))}</span><span class="ln1">${ln(r)}</span></a>`; };
    return card('Game leaders', keys(g) + cats.map(([lab, f, ln]) => `<div class="lead">${side(g.away, f, ln, false)}<span class="lab">${lab}</span>${side(g.home, f, ln, true)}</div>`).join(''));
  }
  function gameTeamStats(g, f) {
    const a = g.away, h = g.home, A = (k) => tot(a, k), H = (k) => tot(h, k);
    const pr = (lab, m, at) => { const pa = A(at) ? 100 * A(m) / A(at) : 0, ph = H(at) ? 100 * H(m) / H(at) : 0;
      return `<div class="ts"><div class="ts-top"><span class="v">${Math.round(pa)}%<small>${A(m)}-${A(at)}</small></span><span class="lab">${lab}</span><span class="v h"><small>${H(m)}-${H(at)}</small>${Math.round(ph)}%</span></div><div class="bars"><div class="track"><div class="fa" style="width:${pa}%"></div></div><div class="track h"><div class="fh" style="width:${ph}%"></div></div></div></div>`; };
    const cr = (lab, va, vh, sfx = '') => `<div class="ts"><div class="ts-top"><span class="v">${va}${sfx}</span><span class="lab">${lab}</span><span class="v h">${vh}${sfx}</span></div><div class="split"><div class="fa" style="flex:${+va || 0.01}"></div><div class="fh" style="flex:${+vh || 0.01}"></div></div></div>`;
    return card('Team stats', keys(g) + pr('Field goal %', 'fg', 'fga') + pr('Three point %', 'tp', 'tpa') + pr('Free throw %', 'ft', 'fta') + cr('Rebounds', A('orb') + A('drb'), H('orb') + H('drb')) + cr('Assists', A('ast'), H('ast')) + cr('Turnovers', A('tov'), H('tov')) + cr('Steals', A('stl'), H('stl')) + cr('Blocks', A('blk'), H('blk'))
      + cr('Percent led', Math.round(100 * f.ledA / f.total), Math.round(100 * f.ledH / f.total), '%') + cr('Largest lead', f.bigA, f.bigH));
  }
  function game(gid) {
    const g = byGid.get(gid); if (!g) return notFound();
    const a = g.away, h = g.home, ta = team(a.tid), th = team(h.tid), aw = a.pts > h.pts, f = flow(g);
    const qh = a.q.map((_, i) => (i < 4 ? i + 1 : `OT${i > 4 ? i - 3 : ''}`));
    const ls = `<table><thead><tr><th></th>${qh.map((q) => `<th>${q}</th>`).join('')}<th>T</th></tr></thead><tbody><tr><td class="t">${ta.abbrev}</td>${a.q.map((x) => `<td>${x}</td>`).join('')}<td>${a.pts}</td></tr><tr><td class="t">${th.abbrev}</td>${h.q.map((x) => `<td>${x}</td>`).join('')}<td>${h.pts}</td></tr></tbody></table>`;
    const blk = (s, home, won) => `<div class="gt${home ? ' h' : ''}">${tlink(s.tid, logo(s.tid, 76))}<div class="who"><b>${tlink(s.tid, tname(s.tid))}</b><span>${recStr(s.tid)} · ${home ? 'Home' : 'Away'}</span></div><span class="big ${won ? '' : 'lost'}">${s.pts}</span></div>`;
    $app.innerHTML = `<div style="--away:${ta.accent};--home:${th.accent}"><section class="card gh" style="margin-bottom:var(--gap)"><div class="gh-in">${blk(a, false, aw)}<div class="ls">${ls}<div class="sub">Game ${g.day}</div></div>${blk(h, true, !aw)}</div></section>
      <div class="grid g-game"><aside class="stack">${gameLeaders(g)}${gameTeamStats(g, f)}</aside><div class="stack">${wpCard(g, f)}${boxTable(a)}${boxTable(h)}</div></div></div>`;
    wireWp(g, f);
  }

  /* ---------- standings ---------- */
  function standings() {
    const o = order();
    const rows = o.map((tid, i) => { const r = rec[tid], gp = gpT(tid), d = diff(tid);
      return `<tr${i === 3 ? ' class="cut"' : ''}><td class="t muted">${arrow(tid)}${i + 1}</td><td class="t nm">${tlink(tid, `${logo(tid, 24)}${tname(tid)}`)}</td><td>${r.w}</td><td>${r.l}</td><td>${(r.w / Math.max(1, gp)).toFixed(3).replace(/^0/, '')}</td><td>${gb(tid, o[0])}</td><td>${r.hw}-${r.hl}</td><td>${r.aw}-${r.al}</td><td>${f1(r.pf / gp)}</td><td>${f1(r.pa / gp)}</td><td class="${d > 0 ? 'up' : 'dn'}">${sgn(d, 1)}</td><td>${streak(tid)}</td><td>${last10(tid)}</td><td>${f1(odds[tid].w)}</td><td><b>${oddsStr(tid)}</b></td><td><b>${pctStr(odds[tid].c)}</b></td></tr>`; }).join('');
    const h2h = (a, b) => { const ms = D.games.filter((g) => (g.home.tid === a && g.away.tid === b) || (g.home.tid === b && g.away.tid === a)); const w = ms.filter((g) => (g.home.tid === a ? g.home.pts > g.away.pts : g.away.pts > g.home.pts)).length; return ms.length ? `${w}-${ms.length - w}` : '·'; };
    $app.innerHTML = `<div class="page-h"><h1>Standings</h1><span>${D.season} · through Game ${lastDay} of 36</span></div><div class="stack">
      ${card('League table', `<div class="scroll"><table><thead><tr><th class="t">#</th><th class="t">Team</th><th>W</th><th>L</th><th>Pct</th><th>GB</th><th>Home</th><th>Away</th><th>PF</th><th>PA</th><th>Diff</th><th>Strk</th><th>L10</th><th>Proj W</th><th>Playoffs</th><th>Title</th></tr></thead><tbody>${rows}</tbody></table></div><p class="note">Top four make the playoffs (best of five). Arrows show movement since the last game. Projected wins, playoff chances and title chances come from 3,000 simulations of the remaining schedule and a best-of-five bracket, based on each team's point differential.</p>`)}
      ${card('Head to head', `<div class="scroll"><table class="h2h"><thead><tr><th class="t">Row vs column</th>${o.map((t) => `<th>${team(t).abbrev}</th>`).join('')}</tr></thead><tbody>${o.map((a) => `<tr><td class="t nm">${tlink(a, `${logo(a, 20)}${esc(team(a).name)}`)}</td>${o.map((b) => (a === b ? '<td class="x">—</td>' : `<td>${h2h(a, b)}</td>`)).join('')}</tr>`).join('')}</tbody></table></div>`)}
      ${teamStatsTable()}</div>`;
  }

  /* ---------- teams ---------- */
  function teamPage(abbrev) {
    const t = T.find((x) => x.abbrev === abbrev); if (!t) return notFound();
    const tid = t.tid, o = order(), r = rec[tid], gp = gpT(tid), m = tstat[tid].me, op = tstat[tid].op;
    const roster = D.players.filter((p) => p.tid === tid).map((p) => [p, stats.get(p.pid)]).sort((a, b) => (b[1] ? per(b[1], 'min') : -1) - (a[1] ? per(a[1], 'min') : -1));
    const starters = new Set(roster.filter(([, s]) => s).sort((a, b) => b[1].gs - a[1].gs || b[1].min - a[1].min).slice(0, 5).map(([p]) => p.pid));
    roster.sort((a, b) => starters.has(b[0].pid) - starters.has(a[0].pid));
    const rows = roster.map(([p, s], i) => `<tr${i === 4 ? ' class="cut"' : ''}><td class="t nm"><a href="#player-${p.pid}">${face(p.pid, 28)}<span>${esc(p.name)}</span>${p.inj ? `<span class="inj">out ${p.inj[1]}</span>` : ''}</a></td><td class="t"><span class="chip">${p.pos}</span></td><td>${p.age}</td><td>${htS(p.ht)}</td>${
      s ? `<td class="grp">${s.gp}</td><td>${s.gs}</td><td${heat('min', s)}>${f1(per(s, 'min'))}</td><td class="grp"${heat('pts', s)}><b>${f1(per(s, 'pts'))}</b></td><td${heat('reb', s)}>${f1(per(s, 'reb'))}</td><td${heat('ast', s)}>${f1(per(s, 'ast'))}</td><td${heat('stl', s)}>${f1(per(s, 'stl'))}</td><td${heat('blk', s)}>${f1(per(s, 'blk'))}</td><td${heat('tov', s, 1)}>${f1(per(s, 'tov'))}</td><td class="grp"${heat('fgp', s)}>${pct(s.fg, s.fga)}</td><td${heat('tpp', s)}>${pct(s.tp, s.tpa)}</td><td${heat('ftp', s)}>${pct(s.ft, s.fta)}</td><td class="grp"${heat('pm', s)}>${sgn(per(s, 'pm'), 1)}</td>` : '<td colspan="13" class="grp muted" style="text-align:center">Has not played</td>'}<td class="grp">${p.sal ? '$' + p.sal + 'M' : '—'}</td><td>${p.exp || '—'}</td></tr>`).join('');
    const prof = [['Points', (x) => tstat[x].me.pts / gpT(x), 0, f1], ['Points allowed', (x) => tstat[x].op.pts / gpT(x), 1, f1], ['Field goal %', (x) => 100 * tstat[x].me.fg / tstat[x].me.fga, 0, f1], ['Three point %', (x) => 100 * tstat[x].me.tp / tstat[x].me.tpa, 0, f1], ['Threes made', (x) => tstat[x].me.tp / gpT(x), 0, f1],
      ['Rebounds', (x) => tstat[x].me.reb / gpT(x), 0, f1], ['Assists', (x) => tstat[x].me.ast / gpT(x), 0, f1], ['Turnovers', (x) => tstat[x].me.tov / gpT(x), 1, f1], ['Steals', (x) => tstat[x].me.stl / gpT(x), 0, f1], ['Blocks', (x) => tstat[x].me.blk / gpT(x), 0, f1], ['Opp field goal %', (x) => 100 * tstat[x].op.fg / tstat[x].op.fga, 1, f1]];
    const profile = `<table><thead><tr><th class="t">Per game</th><th>Value</th><th>Rank</th></tr></thead><tbody>${prof.map(([lab, f, asc, fmt]) => { const rk = teamRank(tid, f, asc); return `<tr><td class="t" style="font-family:var(--f)">${lab}</td><td><b>${fmt(f(tid))}</b></td><td class="${rk <= 3 ? 'up' : rk >= 8 ? 'dn' : ''}">${ord(rk)}</td></tr>`; }).join('')}</tbody></table>`;
    const share = roster.filter(([, s]) => s).sort((a, b) => b[1].pts - a[1].pts).slice(0, 8).map(([p, s]) => `<div class="hbar" style="--c:${t.accent}"><span class="t">${esc(short(p.name))}</span><span class="b"><i style="width:${100 * s.pts / m.pts * 2.2}%"></i></span><span class="v">${(100 * s.pts / m.pts).toFixed(1)}%</span></div>`).join('');
    const games = D.games.filter((g) => g.home.tid === tid || g.away.tid === tid).map((g) => { const hm = g.home.tid === tid, me = hm ? g.home : g.away, opp = hm ? g.away : g.home, w = me.pts > opp.pts, top = me.box.reduce((a, x) => (x[C.pts] > a[C.pts] ? x : a));
      return `<tr><td class="t"><a href="#game-${g.gid}">${g.day}</a></td><td class="t nm">${tlink(opp.tid, `${logo(opp.tid, 20)}<span>${hm ? 'vs' : '@'} ${esc(team(opp.tid).name)}</span>`)}</td><td class="t ${w ? 'up' : 'dn'}"><a href="#game-${g.gid}">${w ? 'W' : 'L'} ${me.pts}-${opp.pts}${g.ot ? ' OT' : ''}</a></td><td class="t" style="font-family:var(--f)">${plink(top[0], short(P.get(top[0]).name))} <span class="muted mono">${top[C.pts]}</span></td></tr>`; }).reverse();
    const next = D.schedule.filter((s) => s.home === tid || s.away === tid).slice(0, 5).map((s) => { const hm = s.home === tid, opp = hm ? s.away : s.home; return `<a class="row r-sched" href="#team-${team(opp).abbrev}"><span class="d">Game ${s.day}</span>${logo(opp, 20)}<span>${hm ? 'vs' : '@'} ${esc(team(opp).name)}</span><span class="res muted">${recStr(opp)}</span></a>`; }).join('');
    const tl = (lab, k, f = (s) => per(s, k)) => { const b = roster.filter(([, s]) => s && s.gp >= 3).sort((x, y) => f(y[1]) - f(x[1]))[0]; return b ? `<a class="row r-news" href="#player-${b[0].pid}">${face(b[0].pid)}<span class="who"><b>${esc(b[0].name)}</b><span>${lab}</span></span><span class="v">${f1(f(b[1]))}</span></a>` : ''; };
    const nm = (v, lab, rk) => `<div><b>${v}</b><span>${lab}</span>${rk ? `<small>${ord(rk)}</small>` : ''}</div>`;
    $app.innerHTML = `<section class="card hd" style="--c:${t.accent}">${logo(tid, 96)}<div><h1>${tname(tid)}</h1><div class="sub"><span>${recStr(tid)} · ${ord(o.indexOf(tid) + 1)} of 10 · ${gb(tid, o[0])} GB</span><span class="form">${r.res.slice(-10).map((x) => `<i class="${x}">${x}</i>`).join('')}</span></div></div>
      <div class="nums">${nm(f1(r.pf / gp), 'PF', teamRank(tid, (x) => rec[x].pf / gpT(x)))}${nm(f1(r.pa / gp), 'PA', teamRank(tid, (x) => rec[x].pa / gpT(x), 1))}${nm(sgn(diff(tid), 1), 'Diff', teamRank(tid, diff))}${nm(`${r.hw}-${r.hl}`, 'Home')}${nm(`${r.aw}-${r.al}`, 'Away')}${nm(oddsStr(tid), 'Playoffs')}${nm(pctStr(odds[tid].c), 'Title')}</div></section>
      ${card('Roster', `<div class="scroll"><table><thead><tr><th class="t">Player</th><th class="t">Pos</th><th>Age</th><th>Ht</th><th class="grp">GP</th><th>GS</th><th>MIN</th><th class="grp">PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th><th class="grp">FG%</th><th>3P%</th><th>FT%</th><th class="grp">+/-</th><th class="grp">Salary</th><th>Thru</th></tr></thead><tbody>${rows}</tbody></table></div>`, `<span>Starters above the line · payroll $${roster.reduce((a, [p]) => a + (p.sal || 0), 0)}M of $${D.cap}M cap</span>`)}
      <div class="grid g-main" style="margin-top:var(--gap)"><div class="stack">${card('Results', `<div class="scroll"><table><thead><tr><th class="t">Game</th><th class="t">Opponent</th><th class="t">Result</th><th class="t">Top scorer</th></tr></thead><tbody>${games.join('')}</tbody></table></div>`, `<span>${gp} games</span>`)}</div>
      <aside class="stack">${card('Team leaders', tl('Points', 'pts') + tl('Rebounds', 'reb') + tl('Assists', 'ast') + tl('Steals', 'stl') + tl('Blocks', 'blk'))}${card('Team profile', profile, '<span>Rank of 10</span>')}${card('Scoring share', `<div style="padding:8px 0">${share}</div>`, '<span>Share of team points</span>')}${card('Next up', next || '<p class="note">Regular season complete.</p>')}${injuryCard(tid)}</aside></div>`;
  }

  /* ---------- leaders / players ---------- */
  function leadersPage() {
    const best = D.games.flatMap(allRows).sort((x, y) => gmsc(y[0]) - gmsc(x[0])).slice(0, 10);
    $app.innerHTML = `<div class="page-h"><h1>Leaders</h1><span>Per game · at least ${Math.ceil(Math.max(3, lastDay * 0.4))} games played</span></div>
      <div class="stack"><div class="grid g-4">${CATS.map(([lab, ab, f]) => card(lab, topN(f, 5).map(([pid, s, v], i) => lrow(pid, s, ab.endsWith('BPM') ? sgn(v, 1) : f1(v), i)).join(''), `<span>${ab}</span>`)).join('')}</div>
      ${card('Best single games', `<div class="scroll"><table><thead><tr><th class="t">#</th><th class="t">Player</th><th class="t">Game</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>FG</th><th>3PT</th><th>FT</th><th>Game score</th></tr></thead><tbody>${best.map(([r, tid, g], i) => { const hm = g.home.tid === tid, opp = hm ? g.away.tid : g.home.tid;
        return `<tr><td class="t muted">${i + 1}</td><td class="t nm"><a href="#player-${r[0]}">${face(r[0], 26)}<span>${esc(P.get(r[0]).name)}</span></a></td><td class="t"><a href="#game-${g.gid}">${g.day}, ${team(tid).abbrev} ${hm ? 'vs' : '@'} ${team(opp).abbrev}</a></td><td>${Math.round(r[C.min])}</td><td><b>${r[C.pts]}</b></td><td>${r[C.orb] + r[C.drb]}</td><td>${r[C.ast]}</td><td>${r[C.stl]}</td><td>${r[C.blk]}</td><td>${r[C.fg]}-${r[C.fga]}</td><td>${r[C.tp]}-${r[C.tpa]}</td><td>${r[C.ft]}-${r[C.fta]}</td><td><b>${f1(gmsc(r))}</b></td></tr>`; }).join('')}</tbody></table></div><p class="note">Game score is one number for a whole box-score line: points, shooting efficiency, rebounds, assists, steals and blocks count for a player, missed shots, turnovers and fouls against him.</p>`)}</div>`;
  }
  const A = (i) => (s, p) => (p.adv ? p.adv[i] : -99);
  const PCOLS = [['gp', 'GP', (s) => s.gp, 0], ['min', 'MIN', (s) => per(s, 'min')], ['pts', 'PTS', (s) => per(s, 'pts')], ['reb', 'REB', (s) => per(s, 'reb')], ['ast', 'AST', (s) => per(s, 'ast')], ['stl', 'STL', (s) => per(s, 'stl')], ['blk', 'BLK', (s) => per(s, 'blk')], ['tov', 'TO', (s) => per(s, 'tov')],
    ['tpp', '3P%', (s) => (s.tpa ? 100 * s.tp / s.tpa : -1)], ['ftp', 'FT%', (s) => (s.fta ? 100 * s.ft / s.fta : -1)], ['obpm', 'OBPM', A(6), 2], ['dbpm', 'DBPM', A(7), 2], ['bpm', 'BPM', (s, p) => (p.adv ? p.adv[6] + p.adv[7] : -99), 2]];
  /* Award scores are the ones Basketball GM uses, which were regressed on real award voting:
     MVP = team win% + EWA/22 + VORP/32 + share of team wins/10; DPOY = team win% + DWS/3.1 + BLK/4.1 + STL/1.8;
     ROY = EWA/2.1 + VORP + PTS/2; MIP = change in (PTS + REB + AST). Season totals are scaled to an 82-game pace. */
  function awards() {
    const q = qualified().map(([pid, s]) => [pid, s, P.get(pid)]).filter((x) => x[2].adv), wp = (s) => rec[s.tid].w / gpT(s.tid), sc = (s) => 82 / gpT(s.tid);
    const lad = (title, note, xs, sub) => card(title, xs.slice(0, 5).map(([pid, s, p], i) => lrow(pid, s, '', i, `${team(s.tid).abbrev} ${recStr(s.tid)} · ${sub(s, p)}`)).join('') || '<p class="note">Nobody qualifies yet.</p>', `<span>${note}</span>`);
    const by = (f) => [...q].map((x) => [...x, f(x)]).sort((a, b) => b[3] - a[3]);
    const pra = (s) => `${f1(per(s, 'pts'))} pts, ${f1(per(s, 'reb'))} reb, ${f1(per(s, 'ast'))} ast`;
    const mvp = ([, s, p]) => wp(s) + p.adv[4] * sc(s) / 22 + p.adv[5] * sc(s) / 32 + (p.adv[1] / Math.max(1, rec[s.tid].w)) / 10;
    const dpoy = ([, s, p]) => wp(s) + p.adv[2] * sc(s) / 3.1 + per(s, 'blk') / 4.1 + per(s, 'stl') / 1.8;
    const roy = ([, s, p]) => p.adv[4] * sc(s) / 2.1 + p.adv[5] * sc(s) + per(s, 'pts') / 2;
    return `<div class="grid g-3" style="margin-bottom:8px">
      ${lad('MVP', 'Most valuable player', by(mvp), (s) => pra(s))}
      ${lad('DPOY', 'Defensive player of the year', by(dpoy), (s) => `${f1(per(s, 'stl'))} stl, ${f1(per(s, 'blk'))} blk, ${f1(per(s, 'reb'))} reb`)}
      ${lad('ROY', 'Rookie of the year', by(roy).filter((x) => x[2].rk), (s) => pra(s))}</div>
      <p class="note" style="padding:0 0 12px">Ladders follow formulas fitted to decades of real award voting. MVP: team record plus value added. DPOY: team record, defensive win shares, blocks and steals. ROY: value added plus scoring.</p>`;
  }
  const PS = { key: 'pts', dir: -1, q: '', pos: '' };
  function playersPage() {
    const col = PCOLS.find((c) => c[0] === PS.key), q = PS.q.toLowerCase();
    const rows = [...stats.entries()].filter(([pid]) => { const p = P.get(pid); return (!PS.pos || p.pos === PS.pos) && (!q || (p.name + ' ' + (p.tid >= 0 ? team(p.tid).abbrev + ' ' + team(p.tid).name : '')).toLowerCase().includes(q)); }).sort((a, b) => (col[2](a[1], P.get(a[0])) - col[2](b[1], P.get(b[0]))) * PS.dir);
    $app.innerHTML = `<div class="page-h"><h1>Players</h1><span>Per game</span></div>
      <div class="tools"><input class="q" id="pq" type="search" placeholder="Search players or teams" value="${esc(PS.q)}" aria-label="Search players"><div class="seg" role="group" aria-label="Position">${['', 'PG', 'SG', 'SF', 'PF', 'C'].map((x) => `<button type="button" data-pos="${x}" aria-pressed="${PS.pos === x}">${x || 'All'}</button>`).join('')}</div></div>
      ${awards()}${card('Player stats', `<div class="scroll"><table id="pt"><thead><tr><th class="t">#</th><th class="t">Player</th><th class="t">Team</th><th class="t">Pos</th>${PCOLS.map(([k, lab]) => `<th data-k="${k}" class="${k === PS.key ? 'on' : ''}${k === 'obpm' || k === 'tpp' ? ' grp' : ''}">${lab}${k === PS.key ? (PS.dir < 0 ? ' ↓' : ' ↑') : ''}</th>`).join('')}</tr></thead><tbody>${rows.map(([pid, s], i) => { const p = P.get(pid);
        return `<tr><td class="t muted">${i + 1}</td><td class="t nm"><a href="#player-${pid}">${face(pid, 26)}<span>${esc(p.name)}</span></a></td><td class="t">${p.tid >= 0 ? tlink(p.tid, team(p.tid).abbrev) : 'FA'}</td><td class="t"><span class="chip">${p.pos}</span></td>${PCOLS.map(([k, , f, d]) => { const v = f(s, p); return `<td class="${k === 'obpm' || k === 'tpp' ? 'grp' : ''}"${k === PS.key ? ' style="color:var(--ink);font-weight:600"' : ''}>${d === 2 ? (v <= -99 ? '—' : sgn(v, 1)) : v < 0 ? '—' : d === 0 ? v : f1(v)}</td>`; }).join('')}</tr>`; }).join('')}</tbody></table></div>`, '<span>Click a column to sort</span>')}`;
    const inp = document.getElementById('pq');
    inp.addEventListener('input', () => { PS.q = inp.value; playersPage(); const n = document.getElementById('pq'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); });
    document.querySelectorAll('[data-pos]').forEach((b) => b.addEventListener('click', () => { PS.pos = b.dataset.pos; playersPage(); }));
    document.getElementById('pt').addEventListener('click', (e) => { const th = e.target.closest('th[data-k]'); if (!th) return; PS.dir = PS.key === th.dataset.k ? -PS.dir : -1; PS.key = th.dataset.k; playersPage(); });
  }

  /* ---------- player ---------- */
  function player(pid) {
    const p = P.get(pid); if (!p) return notFound();
    const s = stats.get(pid), t = p.tid >= 0 ? team(p.tid) : null;
    const log = D.games.map((g) => { for (const [me, op, hm] of [[g.home, g.away, true], [g.away, g.home, false]]) { const r = me.box.find((x) => x[0] === pid); if (r) return { g, me, op, hm, r }; const d = me.dnp.find((x) => x[0] === pid); if (d) return { g, me, op, hm, dnp: d[1] }; } return null; }).filter(Boolean);
    const played = log.filter((x) => x.r);
    const agg = (xs) => xs.reduce((a, x) => add(a, x.r), blank());
    const statRow = (lab, a, tot) => (a.gp ? `<tr><td class="t" style="font-family:var(--f)">${lab}</td><td>${a.gp}</td><td>${tot ? Math.round(a.min) : f1(per(a, 'min'))}</td><td><b>${tot ? a.pts : f1(per(a, 'pts'))}</b></td><td>${tot ? a.reb : f1(per(a, 'reb'))}</td><td>${tot ? a.ast : f1(per(a, 'ast'))}</td><td>${tot ? a.stl : f1(per(a, 'stl'))}</td><td>${tot ? a.blk : f1(per(a, 'blk'))}</td><td>${tot ? a.tov : f1(per(a, 'tov'))}</td><td>${tot ? `${a.fg}-${a.fga}` : pct(a.fg, a.fga)}</td><td>${tot ? `${a.tp}-${a.tpa}` : pct(a.tp, a.tpa)}</td><td>${tot ? `${a.ft}-${a.fta}` : pct(a.ft, a.fta)}</td><td class="${a.pm > 0 ? 'up' : 'dn'}">${tot ? sgn(a.pm) : sgn(per(a, 'pm'), 1)}</td></tr>` : '');
    const sh = '<thead><tr><th class="t"></th><th>GP</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th><th>FG</th><th>3P</th><th>FT</th><th>+/-</th></tr></thead>';
    const LD = Object.fromEntries([['min', (r) => r[C.min]], ['pts', (r) => r[C.pts]], ['reb', (r) => r[C.orb] + r[C.drb]], ['ast', (r) => r[C.ast]], ['stl', (r) => r[C.stl]], ['blk', (r) => r[C.blk]], ['tov', (r) => r[C.tov]], ['gm', gmsc]].map(([k, f]) => [k, [f, played.map((x) => f(x.r))]]));
    const lh = (k, r, low) => { const [f, arr] = LD[k], p = rankIn(arr, f(r)); return ` style="${tintOf(low ? 1 - p : p)}"`; };
    const logRows = [...log].reverse().map((x) => { const w = x.me.pts > x.op.pts, pre = `<td class="t"><a href="#game-${x.g.gid}">${x.g.day}</a></td><td class="t">${x.hm ? 'vs' : '@'} ${tlink(x.op.tid, team(x.op.tid).abbrev)}</td><td class="t ${w ? 'up' : 'dn'}">${w ? 'W' : 'L'} ${x.me.pts}-${x.op.pts}</td>`, r = x.r;
      return r ? `<tr>${pre}<td class="grp"${lh('min', r)}>${Math.round(r[C.min])}</td><td${lh('pts', r)}><b>${r[C.pts]}</b></td><td${lh('reb', r)}>${r[C.orb] + r[C.drb]}</td><td${lh('ast', r)}>${r[C.ast]}</td><td${lh('stl', r)}>${r[C.stl]}</td><td${lh('blk', r)}>${r[C.blk]}</td><td${lh('tov', r, 1)}>${r[C.tov]}</td><td class="grp">${r[C.fg]}-${r[C.fga]}</td><td>${r[C.tp]}-${r[C.tpa]}</td><td>${r[C.ft]}-${r[C.fta]}</td><td>${r[C.pf]}</td><td class="grp ${r[C.pm] > 0 ? 'up' : r[C.pm] < 0 ? 'dn' : ''}">${sgn(r[C.pm])}</td><td${lh('gm', r)}>${f1(gmsc(r))}</td></tr>` : `<tr>${pre}<td colspan="13" class="grp muted" style="text-align:center;font-size:12px">DNP - ${esc(x.dnp.toUpperCase())}</td></tr>`; }).join('');
    const hi = [['Points', (r) => r[C.pts]], ['Rebounds', (r) => r[C.orb] + r[C.drb]], ['Assists', (r) => r[C.ast]], ['Steals', (r) => r[C.stl]], ['Blocks', (r) => r[C.blk]], ['Threes', (r) => r[C.tp]], ['Minutes', (r) => Math.round(r[C.min])], ['Game score', (r) => +gmsc(r).toFixed(1)]]
      .map(([lab, f]) => { const b = played.reduce((a, x) => (!a || f(x.r) > f(a.r) ? x : a), null); return b ? `<a class="row r-sched" style="grid-template-columns:minmax(0,1fr) auto auto" href="#game-${b.g.gid}"><span>${lab}</span><span class="d">Game ${b.g.day} ${b.hm ? 'vs' : '@'} ${team(b.op.tid).abbrev}</span><span class="v" style="font:700 14px var(--m);min-width:38px;text-align:right">${f(b.r)}</span></a>` : ''; }).join('');
    const zones = s ? ZONES.map(([lab, m, a]) => `<tr><td class="t" style="font-family:var(--f)">${lab}</td><td>${s[m]}-${s[a]}</td><td><b>${pct(s[m], s[a])}</b></td><td>${(100 * s[a] / Math.max(1, s.fga)).toFixed(1)}%</td><td style="width:38%"><div class="hbar" style="grid-template-columns:1fr;padding:0;--c:${t ? t.accent : 'var(--gold)'}"><span class="b"><i style="width:${100 * s[a] / Math.max(1, s.fga)}%"></i></span></div></td></tr>`).join('') : '';
    const vs = [...new Set(played.map((x) => x.op.tid))].map((o) => [o, agg(played.filter((x) => x.op.tid === o))]).sort((a, b) => per(b[1], 'pts') - per(a[1], 'pts'));
    const pv = played.map((x) => x.r[C.pts]), mx = Math.max(1, ...pv), avg = s ? per(s, 'pts') : 0;
    const spark = pv.length > 1 ? `<svg class="spark" viewBox="0 0 ${pv.length * 20} 44" preserveAspectRatio="none">${pv.map((v, i) => `<rect x="${i * 20 + 3}" y="${44 - 40 * v / mx}" width="14" height="${40 * v / mx}" fill="${v >= avg ? (t ? t.accent : 'var(--gold)') : '#39414b'}"/>`).join('')}<line x1="0" x2="${pv.length * 20}" y1="${44 - 40 * avg / mx}" y2="${44 - 40 * avg / mx}" stroke="var(--ink)" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/></svg>` : '';
    const rk = (f) => { const r = rankOf(pid, f); return r ? `<small>${ord(r)}</small>` : '<small>&nbsp;</small>'; };
    const bio = [['Age', p.age], ['Size', `${htS(p.ht)}${p.wt ? `, ${p.wt} lbs` : ''}`], ['Contract', p.sal ? `$${p.sal}M / ${p.exp}` : null], ['Draft', p.smp ? `Round ${Math.ceil(p.smp / 10)} Pick ${((p.smp - 1) % 10) + 1}` : null]].filter((x) => x[1]);
    $app.innerHTML = `<section class="card hd" style="--c:${t ? t.accent : '#555'}">${face(pid, 104)}<div><h1>${esc(p.name)}</h1><div class="sub">${t ? tlink(t.tid, `${logo(t.tid, 20)}${tname(t.tid)}`) : '<span>Free agent</span>'}<span>${p.pos}${p.num ? ` · #${esc(p.num)}` : ''}${p.rk ? ' · Rookie' : ''}</span>${p.inj ? `<span class="inj">${esc(p.inj[0])}, out ${p.inj[1]} games</span>` : ''}</div>
      <div class="bio">${bio.map(([k, v]) => `<span>${k}</span><b>${esc(v)}</b>`).join('')}</div></div>
      ${s ? `<div class="nums2"><div class="nums"><div><b>${f1(per(s, 'pts'))}</b><span>PTS</span>${rk((x) => per(x, 'pts'))}</div><div><b>${f1(per(s, 'reb'))}</b><span>REB</span>${rk((x) => per(x, 'reb'))}</div><div><b>${f1(per(s, 'ast'))}</b><span>AST</span>${rk((x) => per(x, 'ast'))}</div><div><b>${f1(per(s, 'stl'))}</b><span>STL</span>${rk((x) => per(x, 'stl'))}</div><div><b>${f1(per(s, 'blk'))}</b><span>BLK</span>${rk((x) => per(x, 'blk'))}</div></div>
        <div class="nums sm"><div><b>${pct(s.fg, s.fga)}</b><span>FG%</span></div><div><b>${pct(s.tp, s.tpa)}</b><span>3P%</span></div><div><b>${pct(s.ft, s.fta)}</b><span>FT%</span></div>${p.adv ? `<div><b>${sgn(p.adv[6], 1)}</b><span>oBPM</span></div><div><b>${sgn(p.adv[7], 1)}</b><span>dBPM</span></div>` : ''}</div></div>` : ''}</section>
      ${s ? `<div class="grid g-main"><div class="stack">
        ${card('Season stats', `<div class="scroll"><table>${sh}<tbody>${statRow('Per game', s)}${statRow('Totals', s, true)}</tbody></table></div>${p.adv ? `<div class="kv"><div><b>${sgn(p.adv[6], 1)}</b><span>OBPM</span></div><div><b>${sgn(p.adv[7], 1)}</b><span>DBPM</span></div><div><b>${sgn(p.adv[6] + p.adv[7], 1)}</b><span>BPM</span></div><div><b>${p.adv[0]}</b><span>PER</span></div><div><b>${p.adv[1].toFixed(1)}</b><span>Win shares</span></div><div><b>${p.adv[3]}%</b><span>Usage</span></div></div>` : ''}`, `<span>${D.season} · ${s.gs} starts</span>`)}
        ${card('Game log', `<div class="scroll"><table><thead><tr><th class="t">Game</th><th class="t">Opp</th><th class="t">Result</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th><th>FG</th><th>3PT</th><th>FT</th><th>PF</th><th>+/-</th><th>GmSc</th></tr></thead><tbody>${logRows}</tbody></table></div>`, `<span>${played.length} played · ${log.length - played.length} missed</span>`)}</div>
      <aside class="stack">${card('Season highs', hi)}${card('Shot diet', `<table><thead><tr><th class="t">Zone</th><th>Made</th><th>FG%</th><th>Share</th><th></th></tr></thead><tbody>${zones}</tbody></table>`, '<span>Share of his shots</span>')}</aside></div>` : '<p class="muted">He has not played a game yet.</p>'}`;
  }

  const FS = { fa: '', dr: '' };
  const posSeg = (cur, key) => `<div class="tools"><div class="seg" role="group" aria-label="Position">${['', 'PG', 'SG', 'SF', 'PF', 'C'].map((x) => `<button type="button" data-fpos="${x}" data-fkey="${key}" aria-pressed="${cur === x}">${x || 'All'}</button>`).join('')}</div></div>`;
  const wirePos = (again) => document.querySelectorAll('[data-fpos]').forEach((b) => b.addEventListener('click', () => { FS[b.dataset.fkey] = b.dataset.fpos; again(); }));
  function freeAgents() {
    const col = ([code, label]) => { const xs = D.fa.filter((p) => p.pos === code);
      return card(code, xs.map((p) => { const ini = esc(p.name.split(' ').map((x) => x[0]).join('').slice(0, 2));
        return `<div class="row r-fa"><span class="bd">${p.bd}</span><span class="face" style="width:32px;height:32px">${p.espn ? `<img src="https://a.espncdn.com/i/headshots/nba/players/full/${p.espn}.png" alt="" loading="lazy">` : `<span class="ini">${ini}</span>`}</span><span class="who"><b>${esc(p.name)}</b><span>${p.age} · ${htS(p.ht)}</span></span></div>`; }).join(''), `<span>${xs.length}</span>`); };
    $app.innerHTML = `<div class="page-h"><h1>Free agents</h1><span>The ${D.fa.length} best unsigned players, by position</span></div>
      <div class="grid g-5">${[['PG', 'Point guards'], ['SG', 'Shooting guards'], ['SF', 'Small forwards'], ['PF', 'Power forwards'], ['C', 'Centers']].map(col).join('')}</div>
      <p class="note" style="padding:10px 0 0">The number is the player's rank on the league draft board. Asking prices will appear once the auction sets the league's salary scale.</p>`;
  }
  function draftPage() {
    const o = order().reverse(), ht2 = (p) => `${p.age} · ${htS(p.ht)}${p.col ? ` · ${esc(p.col)}` : ''}`;
    const pick = (tid, i) => { const p = D.draft[i]; return `<div class="pk"><span class="no">${i + 1}</span>${tlink(tid, logo(tid, 40))}<span class="who"><b>${esc(p.name)}</b><span>${p.pos} · ${ht2(p)}</span></span><span class="tm">${tlink(tid, esc(team(tid).name))}<small>${recStr(tid)}</small></span></div>`; };
    const col = ([code, label]) => { const xs = D.draft.map((p, i) => [p, i + 1]).filter(([p, n]) => p.pos === code && n > 10);
      return card(code, xs.map(([p, n]) => `<div class="row r-fa" style="grid-template-columns:30px minmax(0,1fr)"><span class="bd">${n}</span><span class="who"><b>${esc(p.name)}</b><span>${ht2(p)}</span></span></div>`).join('') || '<p class="note">None left.</p>', `<span>${xs.length}</span>`); };
    $app.innerHTML = `<div class="page-h"><h1>${D.draftYear} draft</h1><span>One round, ten picks</span></div>
      ${card('If the draft were today', `<div class="pks">${o.map(pick).join('')}</div><p class="note">Teams pick in reverse order of the standings (the lottery rules are not set yet), each taking the best prospect left on the league's scouting board.</p>`, '<span>Projected first round</span>')}
      <div class="page-h" style="margin-top:22px"><h1 style="font-size:20px">Best of the rest</h1><span>${D.draft.length - 10} more prospects by position · number is scouting rank</span></div>
      <div class="grid g-5">${[['PG', 'Point guards'], ['SG', 'Shooting guards'], ['SF', 'Small forwards'], ['PF', 'Power forwards'], ['C', 'Centers']].map(col).join('')}</div>`;
  }
  /* ---------- lineups: on/off for one or two players, and the five-man units ---------- */
  let LU = null; const LS = { team: null, a: '', b: '' };
  async function lineupsPage() {
    if (!LU) { $app.innerHTML = '<p class="muted">Loading lineups…</p>'; LU = await fetch('data/lineups.json').then((r) => r.json()); }
    LS.team ??= order()[0];
    const rows = LU[LS.team] || [], ids = [...new Set(rows.flatMap((r) => r.slice(0, 5)))].sort((x, y) => (stats.get(y)?.min || 0) - (stats.get(x)?.min || 0));
    if (!ids.includes(+LS.a)) LS.a = ''; if (!ids.includes(+LS.b)) LS.b = '';
    const agg = (f) => rows.filter(f).reduce((t, r) => { t[0] += r[5]; t[1] += r[6]; t[2] += r[7]; return t; }, [0, 0, 0]);
    const net = ([sec, pf, pa]) => (pf - pa) / sec * 2880, ok = (x) => x[0] >= 30, has = (r, pid) => r.slice(0, 5).includes(+pid), nm = (pid) => esc(short(P.get(+pid).name)), last = (pid) => esc(P.get(pid).name.split(' ').slice(1).join(' ') || P.get(pid).name);
    const bar = (v, mx) => `<span class="dv"><i class="${v >= 0 ? 'p' : 'n'}" style="width:${50 * Math.abs(v) / mx}%"></i></span>`;
    const units = [...rows].filter((r) => r[5] >= 120).sort((x, y) => y[5] - x[5]).slice(0, 15), mxU = Math.max(1, ...units.map((r) => Math.abs(net(r.slice(5)))));
    $app.innerHTML = `<div class="page-h"><h1>Lineups</h1><span>Scoring margin per 48 minutes</span></div>
      <div class="tpick">${order().map((tid) => `<button type="button" data-lteam="${tid}" aria-pressed="${tid === LS.team}">${logo(tid, 30)}<span>${team(tid).abbrev}</span></button>`).join('')}</div>
      ${card('Most-used units', units.map((r) => { const x = r.slice(5), ps = r.slice(0, 5).sort((p, q) => (stats.get(q)?.min || 0) - (stats.get(p)?.min || 0));
        return `<div class="row r-unit"><span class="faces">${ps.map((pid) => face(pid, 30)).join('')}</span><span class="who"><b>${ps.map(last).join(' · ')}</b><span>${Math.round(x[0] / 60)} min · scores ${f1(x[1] / x[0] * 2880)} · allows ${f1(x[2] / x[0] * 2880)}</span></span>${bar(net(x), mxU)}<span class="v ${net(x) >= 0 ? 'up' : 'dn'}">${sgn(net(x), 1)}</span></div>`; }).join('') || '<p class="note">No five-man unit has played two minutes together yet.</p>', `<span>${team(LS.team).abbrev} · ${rows.length} units used</span>`)}`;
    document.querySelectorAll('[data-lteam]').forEach((b) => b.addEventListener('click', () => { LS.team = +b.dataset.lteam; LS.a = LS.b = ''; lineupsPage(); }));
  }
  const notFound = () => { $app.innerHTML = '<p class="muted">That page does not exist. <a href="#home">Back to the front page</a>.</p>'; };

  /* ---------- router ---------- */
  function route() {
    const h = location.hash.slice(1) || 'home', i = h.indexOf('-'), kind = i < 0 ? h : h.slice(0, i), arg = i < 0 ? '' : h.slice(i + 1);
    const nav = { home: 'home', scores: 'scores', game: 'scores', standings: 'standings', leaders: 'leaders', players: 'players', player: 'players', freeagents: 'freeagents', draft: 'draft', lineups: 'lineups', recap: 'home' }[kind];
    document.querySelectorAll('[data-nav]').forEach((a) => (a.dataset.nav === nav ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    ({ home, scores: () => scores(+arg), game: () => game(+arg), standings, team: () => teamPage(arg), player: () => player(+arg), leaders: leadersPage, players: playersPage, freeagents: freeAgents, draft: draftPage, lineups: lineupsPage, recap: () => recapPage(+arg) }[kind] || notFound)();
    window.scrollTo(0, 0);
  }

  Promise.all([fetch('data/league.json').then((r) => r.json()), fetch('data/recaps.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}))]).then(([d, rc]) => {
    D = d; R = rc; derive();
    document.getElementById('when').textContent = `${D.season} · through Game ${lastDay}`;
    document.getElementById('logos').innerHTML = [...T].sort((a, b) => a.region.localeCompare(b.region)).map((t) => `<a href="#team-${t.abbrev}" title="${tname(t.tid)}">${logo(t.tid, 22)}${t.abbrev}</a>`).join('');
    addEventListener('hashchange', route); route();
  }).catch((e) => { console.error(e); $app.innerHTML = '<p class="muted">The league data did not load. Reload the page.</p>'; });
})();
