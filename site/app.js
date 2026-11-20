/* SMP III league site. One data file (data/league.json), hash routes, no framework. */
(() => {
  const $app = document.getElementById('app');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—');
  const pct = (m, a) => (a ? (100 * m / a).toFixed(1) : '—');
  const START = new Date(2026, 11, 28);                       // ponytail: real calendar for the prototype; 3 game days per real day
  const dayDate = (d) => { const t = new Date(START); t.setDate(t.getDate() + Math.floor((d - 1) / 3)); return t.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); };

  let D, T, P, C, byGid, lastDay, rec, stats;

  /* ---------- derived data ---------- */
  function derive() {
    T = D.teams; P = new Map(D.players.map((p) => [p.pid, p]));
    C = Object.fromEntries(D.cols.map((c, i) => [c, i + 1]));
    byGid = new Map(D.games.map((g) => [g.gid, g]));
    lastDay = Math.max(...D.games.map((g) => g.day));
    rec = T.map(() => ({ w: 0, l: 0, hw: 0, hl: 0, aw: 0, al: 0, pf: 0, pa: 0, res: [] }));
    stats = new Map();
    for (const g of [...D.games].sort((a, b) => a.gid - b.gid)) {
      for (const [me, op, home] of [[g.home, g.away, true], [g.away, g.home, false]]) {
        const r = rec[me.tid], won = me.pts > op.pts;
        r[won ? 'w' : 'l']++; r[(home ? 'h' : 'a') + (won ? 'w' : 'l')]++; r.pf += me.pts; r.pa += op.pts; r.res.push(won ? 'W' : 'L');
        for (const row of me.box) {
          const s = stats.get(row[0]) ?? stats.set(row[0], { gp: 0, tid: me.tid, min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fg: 0, fga: 0, tp: 0, tpa: 0, ft: 0, fta: 0, pm: 0 }).get(row[0]);
          s.gp++; s.tid = me.tid;
          for (const k of ['min', 'pts', 'ast', 'stl', 'blk', 'tov', 'fg', 'fga', 'tp', 'tpa', 'ft', 'fta', 'pm']) s[k] += row[C[k]];
          s.reb += row[C.orb] + row[C.drb];
        }
      }
    }
  }
  const team = (tid) => T[tid];
  const recStr = (tid) => `${rec[tid].w}-${rec[tid].l}`;
  const streak = (tid) => { const r = rec[tid].res; if (!r.length) return '—'; let n = 0; for (let i = r.length - 1; i >= 0 && r[i] === r.at(-1); i--) n++; return r.at(-1) + n; };
  const last10 = (tid) => { const r = rec[tid].res.slice(-10); return `${r.filter((x) => x === 'W').length}-${r.filter((x) => x === 'L').length}`; };
  const order = () => T.map((t) => t.tid).sort((a, b) => (rec[b].w / Math.max(1, rec[b].w + rec[b].l)) - (rec[a].w / Math.max(1, rec[a].w + rec[a].l)) || (rec[b].pf - rec[b].pa) - (rec[a].pf - rec[a].pa));
  const gb = (tid, lead) => { const v = ((rec[lead].w - rec[tid].w) + (rec[tid].l - rec[lead].l)) / 2; return v ? v.toFixed(1).replace('.0', '') : '—'; };
  const short = (n) => { const parts = n.split(' '); return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : n; };
  const per = (s, k) => s[k] / s.gp;

  /* ---------- atoms ---------- */
  const logo = (tid, size = 28) => `<img class="logo" src="${team(tid).logo}" width="${size}" height="${size}" alt="${esc(team(tid).region)} ${esc(team(tid).name)}" loading="lazy">`;
  function face(pid, size = 40) {
    const p = P.get(pid), ini = esc((p?.name || '?').split(' ').map((x) => x[0]).join('').slice(0, 2));
    const img = p?.espn ? `<img src="https://a.espncdn.com/i/headshots/nba/players/full/${p.espn}.png" alt="" loading="lazy" onerror="this.outerHTML='<span class=&quot;ini&quot;>${ini}</span>'">` : `<span class="ini">${ini}</span>`;
    return `<span class="face" style="width:${size}px;height:${size}px">${img}</span>`;
  }
  const plink = (pid, text) => `<a href="#player-${pid}">${esc(text ?? P.get(pid)?.name)}</a>`;
  const tlink = (tid, inner) => `<a href="#team-${team(tid).abbrev}">${inner}</a>`;
  const tot = (side, k) => side.box.reduce((a, r) => a + r[C[k]], 0);

  /* ---------- scores ---------- */
  function topLine(g) {
    const all = [...g.home.box.map((r) => [r, g.home.tid]), ...g.away.box.map((r) => [r, g.away.tid])];
    const [r] = all.sort((a, b) => b[0][C.pts] - a[0][C.pts])[0];
    return `${face(r[0], 26)}<span><b>${esc(short(P.get(r[0]).name))}</b> ${r[C.pts]} pts, ${r[C.orb] + r[C.drb]} reb, ${r[C.ast]} ast</span>`;
  }
  function gameCard(g) {
    const row = (s, o) => `<div class="gc-row${s.pts < o.pts ? ' lost' : ''}">${logo(s.tid, 30)}<span class="tn">${esc(team(s.tid).name)}<small>${recStr(s.tid)}</small></span><span class="sc">${s.pts}</span></div>`;
    return `<a class="gc" href="#game-${g.gid}"><div class="gc-st"><span>Final${g.ot ? `/${g.ot > 1 ? g.ot : ''}OT` : ''}</span><span>Box score</span></div>${row(g.away, g.home)}${row(g.home, g.away)}<div class="gc-top">${topLine(g)}</div></a>`;
  }
  function upcomingCard(s) {
    const row = (tid) => `<div class="gc-row">${logo(tid, 30)}<span class="tn">${esc(team(tid).name)}<small>${recStr(tid)}</small></span><span class="sc"></span></div>`;
    return `<div class="gc"><div class="gc-st"><span>Day ${s.day}</span><span>Upcoming</span></div>${row(s.away)}${row(s.home)}</div>`;
  }
  function standingsMini() {
    const o = order();
    return `<div class="card"><h2>Standings</h2><table class="mini"><thead><tr><th class="t">Team</th><th>W</th><th>L</th><th>GB</th><th>Strk</th></tr></thead><tbody>${o.map((tid, i) =>
      `<tr${i === 3 ? ' class="cut"' : ''}><td class="t">${tlink(tid, `${logo(tid, 22)}${esc(team(tid).name)}`)}</td><td>${rec[tid].w}</td><td>${rec[tid].l}</td><td>${gb(tid, o[0])}</td><td>${streak(tid)}</td></tr>`).join('')}</tbody></table><p class="note">Top four make the playoffs (best of five).</p></div>`;
  }
  function leadersMini() {
    const q = [...stats.entries()].filter(([, s]) => s.gp >= 5).sort((a, b) => per(b[1], 'pts') - per(a[1], 'pts')).slice(0, 5);
    return `<div class="card"><h2>Scoring leaders</h2>${q.map(([pid, s], i) => `<a class="lrow${i ? '' : ' first'}" href="#player-${pid}"><span class="n">${i + 1}</span>${face(pid, 36)}<span class="who"><b>${esc(P.get(pid).name)}</b><span>${team(s.tid).abbrev} · ${P.get(pid).pos}</span></span><span class="v">${f1(per(s, 'pts'))}</span></a>`).join('')}</div>`;
  }
  function scores(day) {
    day = Math.min(Math.max(1, day || lastDay), Math.max(lastDay, ...D.schedule.map((s) => s.day)));
    const games = D.games.filter((g) => g.day === day), up = D.schedule.filter((s) => s.day === day);
    const days = [...new Set([...D.games.map((g) => g.day), ...D.schedule.map((s) => s.day)])].sort((a, b) => a - b);
    const rail = days.map((d) => `<a href="#scores-${d}" aria-current="${d === day}"><b>Day ${d}</b><span>${dayDate(d).replace(/^\w+, /, '')}</span></a>`).join('');
    $app.innerHTML = `<div class="page-h"><h1>Scores</h1><span class="muted mono">Day ${day} · ${dayDate(day)}</span></div>
      <div class="days"><a class="btn" href="#scores-${Math.max(1, day - 1)}" aria-label="Previous day">‹</a><div class="dayrail" id="rail">${rail}</div><a class="btn" href="#scores-${day + 1}" aria-label="Next day">›</a></div>
      <div class="home"><section class="board">${games.map(gameCard).join('') + up.map(upcomingCard).join('') || '<p class="muted">No games this day.</p>'}</section><aside class="side">${standingsMini()}${leadersMini()}</aside></div>`;
    document.querySelector('#rail [aria-current="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  /* ---------- game ---------- */
  function boxTable(side) {
    const tm = team(side.tid), cols = ['MIN', 'PTS', 'FG', '3PT', 'FT', 'REB', 'AST', 'TO', 'STL', 'BLK', 'OREB', 'DREB', 'PF', '+/-'];
    const row = (r) => { const p = P.get(r[0]), pm = r[C.pm];
      return `<tr><td class="t nm">${plink(r[0], short(p.name))}<small>${p.pos}</small></td><td>${Math.round(r[C.min])}</td><td><b>${r[C.pts]}</b></td><td>${r[C.fg]}-${r[C.fga]}</td><td>${r[C.tp]}-${r[C.tpa]}</td><td>${r[C.ft]}-${r[C.fta]}</td><td>${r[C.orb] + r[C.drb]}</td><td>${r[C.ast]}</td><td>${r[C.tov]}</td><td>${r[C.stl]}</td><td>${r[C.blk]}</td><td>${r[C.orb]}</td><td>${r[C.drb]}</td><td>${r[C.pf]}</td><td class="${pm > 0 ? 'pm-pos' : pm < 0 ? 'pm-neg' : ''}">${pm > 0 ? '+' : ''}${pm}</td></tr>`; };
    const st = side.box.filter((r) => r[C.gs]), bn = side.box.filter((r) => !r[C.gs]);
    const head = (lab) => `<tr class="sub"><th class="t">${lab}</th>${cols.map((c) => `<th>${c}</th>`).join('')}</tr>`;
    const t = (k) => tot(side, k);
    return `<section class="card box"><div class="box-h">${logo(side.tid, 26)}${esc(tm.region)} ${esc(tm.name)}</div><div class="scroll"><table>
      <thead>${head('Starters')}</thead><tbody>${st.map(row).join('')}</tbody><thead>${head('Bench')}</thead><tbody>${bn.map(row).join('')}
      <tr class="tot"><td class="t">Team</td><td></td><td>${t('pts')}</td><td>${t('fg')}-${t('fga')}</td><td>${t('tp')}-${t('tpa')}</td><td>${t('ft')}-${t('fta')}</td><td>${t('orb') + t('drb')}</td><td>${t('ast')}</td><td>${t('tov')}</td><td>${t('stl')}</td><td>${t('blk')}</td><td>${t('orb')}</td><td>${t('drb')}</td><td>${t('pf')}</td><td></td></tr>
      <tr class="pct"><td></td><td></td><td></td><td>${pct(t('fg'), t('fga'))}%</td><td>${pct(t('tp'), t('tpa'))}%</td><td>${pct(t('ft'), t('fta'))}%</td><td colspan="9"></td></tr></tbody></table></div></section>`;
  }
  function leaders(g) {
    const best = (side, f) => side.box.reduce((a, r) => (f(r) > f(a) ? r : a), side.box[0]);
    const cats = [
      ['Points', (r) => r[C.pts], (r) => `${r[C.fg]}/${r[C.fga]} FG, ${r[C.ft]}/${r[C.fta]} FT`],
      ['Rebounds', (r) => r[C.orb] + r[C.drb], (r) => `${r[C.drb]} DREB, ${r[C.orb]} OREB`],
      ['Assists', (r) => r[C.ast], (r) => `${r[C.tov]} TO, ${Math.round(r[C.min])} MIN`],
    ];
    const side = (s, f, line, h) => { const r = best(s, f), p = P.get(r[0]);
      return `<a class="p${h ? ' h' : ''}" href="#player-${r[0]}">${face(r[0], 44)}<b>${f(r)}</b><span class="nmline">${esc(short(p.name))}</span><span>${line(r)}</span></a>`; };
    return `<div class="card"><h2>Game leaders</h2><div class="keys"><span>${logo(g.away.tid, 26)}${team(g.away.tid).abbrev}</span><span>${team(g.home.tid).abbrev}${logo(g.home.tid, 26)}</span></div>${cats.map(([lab, f, line]) =>
      `<div class="lead">${side(g.away, f, line, false)}<span class="lab">${lab}</span>${side(g.home, f, line, true)}</div>`).join('')}</div>`;
  }
  function teamStats(g) {
    const a = g.away, h = g.home, A = (k) => tot(a, k), H = (k) => tot(h, k);
    const pctRow = (lab, m, at) => { const pa = A(at) ? 100 * A(m) / A(at) : 0, ph = H(at) ? 100 * H(m) / H(at) : 0;
      return `<div class="ts"><div class="ts-top"><span class="v">${Math.round(pa)}%<small>(${A(m)}-${A(at)})</small></span><span class="lab">${lab}</span><span class="v h"><small>(${H(m)}-${H(at)})</small>${Math.round(ph)}%</span></div>
        <div class="bars"><div class="track a"><div class="fa" style="width:${pa}%"></div></div><div class="track h"><div class="fh" style="width:${ph}%"></div></div></div></div>`; };
    const cntRow = (lab, va, vh) => { const s = va + vh || 1;
      return `<div class="ts"><div class="ts-top"><span class="v">${va}</span><span class="lab">${lab}</span><span class="v h">${vh}</span></div><div class="split"><div class="fa" style="flex:${va / s}"></div><div class="fh" style="flex:${vh / s}"></div></div></div>`; };
    return `<div class="card"><h2>Team stats</h2><div class="keys"><span>${logo(a.tid, 26)}<i class="sw" style="background:repeating-linear-gradient(-55deg,var(--away) 0 3px,transparent 3px 5px)"></i>${team(a.tid).abbrev}</span><span>${team(h.tid).abbrev}<i class="sw" style="background:var(--home)"></i>${logo(h.tid, 26)}</span></div>
      ${pctRow('Field Goal %', 'fg', 'fga')}${pctRow('Three Point %', 'tp', 'tpa')}${pctRow('Free Throw %', 'ft', 'fta')}
      ${cntRow('Rebounds', A('orb') + A('drb'), H('orb') + H('drb'))}${cntRow('Assists', A('ast'), H('ast'))}${cntRow('Turnovers', A('tov'), H('tov'))}${cntRow('Steals', A('stl'), H('stl'))}${cntRow('Blocks', A('blk'), H('blk'))}</div>`;
  }
  function game(gid) {
    const g = byGid.get(gid); if (!g) return notFound();
    const a = g.away, h = g.home, ta = team(a.tid), th = team(h.tid), aw = a.pts > h.pts;
    const n = a.q.length, qh = Array.from({ length: n }, (_, i) => (i < 4 ? i + 1 : `OT${i > 4 ? i - 3 : ''}`));
    const ls = `<table><thead><tr><th></th>${qh.map((q) => `<th>${q}</th>`).join('')}<th>T</th></tr></thead><tbody>
      <tr><td class="t">${ta.abbrev}</td>${a.q.map((x) => `<td>${x}</td>`).join('')}<td>${a.pts}</td></tr>
      <tr><td class="t">${th.abbrev}</td>${h.q.map((x) => `<td>${x}</td>`).join('')}<td>${h.pts}</td></tr></tbody></table>`;
    const blk = (s, t, home, won) => `<div class="gt${home ? ' h' : ''}">${tlink(s.tid, logo(s.tid, 84))}<div class="who"><b>${tlink(s.tid, `${esc(t.region)} ${esc(t.name)}`)}</b><span>${recStr(s.tid)} · ${home ? 'Home' : 'Away'}</span></div><span class="big ${won ? 'won' : 'lost'}">${s.pts}</span></div>`;
    $app.innerHTML = `<div class="gh" style="--away:${ta.accent};--home:${th.accent}"><div class="gh-in">${blk(a, ta, false, aw)}<div class="ls"><div class="fin">Final${g.ot ? ` / ${g.ot > 1 ? g.ot : ''}OT` : ''}</div>${ls}<div class="muted mono" style="font-size:12px;margin-top:6px">Day ${g.day} · ${dayDate(g.day)}</div></div>${blk(h, th, true, !aw)}</div></div>
      <div class="gbody" style="--away:${ta.accent};--home:${th.accent}"><div>${boxTable(a)}${boxTable(h)}</div><aside class="side">${leaders(g)}${teamStats(g)}</aside></div>`;
  }

  /* ---------- standings / teams / team ---------- */
  function standings() {
    const o = order();
    $app.innerHTML = `<div class="page-h"><h1>Standings</h1><span class="muted mono">${D.season} · ${D.games.length} of ${D.total} games played</span></div>
      <div class="card" style="padding:0"><div class="scroll"><table class="stand"><thead><tr><th class="t" style="padding-left:18px">#</th><th class="t">Team</th><th>W</th><th>L</th><th>Pct</th><th>GB</th><th>Home</th><th>Away</th><th>PPG</th><th>Opp PPG</th><th>Diff</th><th>Strk</th><th style="padding-right:18px">L10</th></tr></thead><tbody>${o.map((tid, i) => {
        const r = rec[tid], gp = r.w + r.l, d = (r.pf - r.pa) / Math.max(1, gp);
        return `<tr${i === 3 ? ' class="cut"' : ''}><td class="t rk" style="padding-left:18px">${i + 1}</td><td class="t">${tlink(tid, `${logo(tid, 28)}${esc(team(tid).region)} ${esc(team(tid).name)}`)}</td><td>${r.w}</td><td>${r.l}</td><td>${(r.w / Math.max(1, gp)).toFixed(3).replace(/^0/, '')}</td><td>${gb(tid, o[0])}</td><td>${r.hw}-${r.hl}</td><td>${r.aw}-${r.al}</td><td>${f1(r.pf / gp)}</td><td>${f1(r.pa / gp)}</td><td class="${d > 0 ? 'pm-pos' : d < 0 ? 'pm-neg' : ''}">${d > 0 ? '+' : ''}${f1(d)}</td><td>${streak(tid)}</td><td style="padding-right:18px">${last10(tid)}</td></tr>`; }).join('')}</tbody></table></div></div>
      <p class="note">The dashed line marks the playoff cut: the top four meet in best-of-five series. Ties break on point differential.</p>`;
  }
  function teams() {
    const o = order();
    $app.innerHTML = `<div class="page-h"><h1>Teams</h1></div><div class="teams-grid">${T.map((t) => `<a class="tcard" style="--c:${t.accent}" href="#team-${t.abbrev}">${logo(t.tid, 96)}<b>${esc(t.region)} ${esc(t.name)}</b><span>${recStr(t.tid)} · ${['1st', '2nd', '3rd'][o.indexOf(t.tid)] || `${o.indexOf(t.tid) + 1}th`}</span></a>`).join('')}</div>`;
  }
  function teamPage(abbrev) {
    const t = T.find((x) => x.abbrev === abbrev); if (!t) return notFound();
    const o = order(), r = rec[t.tid], gp = r.w + r.l;
    const roster = D.players.filter((p) => p.tid === t.tid).map((p) => [p, stats.get(p.pid)]).sort((a, b) => (b[1] ? per(b[1], 'min') : 0) - (a[1] ? per(a[1], 'min') : 0));
    const rows = roster.map(([p, s]) => `<tr><td class="t nm"><a href="#player-${p.pid}">${face(p.pid, 34)}<span>${esc(p.name)}${p.inj ? ` <span class="inj">· ${esc(p.inj[0])}, ${p.inj[1]} g</span>` : ''}</span></a></td><td class="t"><span class="chip">${p.pos}</span></td><td>${p.age}</td><td>${p.ht ? `${Math.floor(p.ht / 12)}′${p.ht % 12}″` : '—'}</td>${
      s ? `<td>${s.gp}</td><td>${f1(per(s, 'min'))}</td><td><b>${f1(per(s, 'pts'))}</b></td><td>${f1(per(s, 'reb'))}</td><td>${f1(per(s, 'ast'))}</td><td>${f1(per(s, 'stl'))}</td><td>${f1(per(s, 'blk'))}</td><td>${pct(s.fg, s.fga)}</td><td>${pct(s.tp, s.tpa)}</td><td>${pct(s.ft, s.fta)}</td>` : '<td colspan="10" class="muted">No games yet</td>'}</tr>`).join('');
    const games = D.games.filter((g) => g.home.tid === t.tid || g.away.tid === t.tid).map((g) => { const home = g.home.tid === t.tid, me = home ? g.home : g.away, op = home ? g.away : g.home, w = me.pts > op.pts;
      return `<a href="#game-${g.gid}"><span class="d">Day ${g.day}</span>${logo(op.tid, 22)}<span>${home ? 'vs' : '@'} ${esc(team(op.tid).name)}</span><span class="r ${w ? 'wn' : 'ls'}">${w ? 'W' : 'L'} ${me.pts}-${op.pts}</span></a>`; });
    const next = D.schedule.filter((s) => s.home === t.tid || s.away === t.tid).slice(0, 6).map((s) => { const home = s.home === t.tid, op = home ? s.away : s.home;
      return `<a href="#scores-${s.day}"><span class="d">Day ${s.day}</span>${logo(op, 22)}<span>${home ? 'vs' : '@'} ${esc(team(op).name)}</span><span class="r up">${dayDate(s.day).replace(/^\w+, /, '')}</span></a>`; });
    $app.innerHTML = `<div class="th" style="--c:${t.accent}">${logo(t.tid, 104)}<div><h1>${esc(t.region)} ${esc(t.name)}</h1><div class="sub">${recStr(t.tid)} · ${o.indexOf(t.tid) + 1} of 10 · ${streak(t.tid)}</div></div>
      <div class="nums"><div><b>${f1(r.pf / gp)}</b><span>PPG</span></div><div><b>${f1(r.pa / gp)}</b><span>Opp PPG</span></div><div><b>${r.hw}-${r.hl}</b><span>Home</span></div><div><b>${r.aw}-${r.al}</b><span>Away</span></div></div></div>
      <div class="two"><section class="card" style="padding:0"><div class="box-h">Roster</div><div class="scroll"><table class="roster"><thead><tr><th class="t" style="padding-left:18px">Player</th><th class="t">Pos</th><th>Age</th><th>Ht</th><th>GP</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>FG%</th><th>3P%</th><th style="padding-right:18px">FT%</th></tr></thead><tbody>${rows}</tbody></table></div></section>
      <aside class="side"><div class="card sched"><h2>Next up</h2>${next.join('') || '<p class="muted">Regular season complete.</p>'}</div><div class="card sched"><h2>Results</h2>${games.reverse().join('')}</div></aside></div>`;
  }

  /* ---------- player ---------- */
  function player(pid) {
    const p = P.get(pid); if (!p) return notFound();
    const s = stats.get(pid), t = p.tid >= 0 ? team(p.tid) : null;
    const log = D.games.filter((g) => [g.home, g.away].some((x) => x.box.some((r) => r[0] === pid))).map((g) => {
      const home = g.home.box.some((r) => r[0] === pid), me = home ? g.home : g.away, op = home ? g.away : g.home, r = me.box.find((x) => x[0] === pid), w = me.pts > op.pts;
      return `<tr><td class="t"><a href="#game-${g.gid}">Day ${g.day}</a></td><td class="t">${home ? 'vs' : '@'} ${team(op.tid).abbrev}</td><td class="t ${w ? 'pm-pos' : 'pm-neg'}">${w ? 'W' : 'L'} ${me.pts}-${op.pts}</td><td>${Math.round(r[C.min])}</td><td><b>${r[C.pts]}</b></td><td>${r[C.orb] + r[C.drb]}</td><td>${r[C.ast]}</td><td>${r[C.stl]}</td><td>${r[C.blk]}</td><td>${r[C.tov]}</td><td>${r[C.fg]}-${r[C.fga]}</td><td>${r[C.tp]}-${r[C.tpa]}</td><td>${r[C.ft]}-${r[C.fta]}</td><td>${r[C.pm] > 0 ? '+' : ''}${r[C.pm]}</td></tr>`; }).reverse();
    $app.innerHTML = `<div class="ph" style="--c:${t ? t.accent : '#555'}">${face(pid, 112)}<div><h1>${esc(p.name)}</h1><div class="sub">${t ? `${tlink(t.tid, `${logo(t.tid, 22)}`)}${tlink(t.tid, `${esc(t.region)} ${esc(t.name)}`)} ·` : 'Free agent ·'} ${p.pos} · ${p.age} yrs · ${p.ht ? `${Math.floor(p.ht / 12)}′${p.ht % 12}″` : ''}${p.inj ? ` · <span class="inj">${esc(p.inj[0])}, out ${p.inj[1]} g</span>` : ''}</div></div>
      ${s ? `<div class="avgs"><div><b>${f1(per(s, 'pts'))}</b><span>PTS</span></div><div><b>${f1(per(s, 'reb'))}</b><span>REB</span></div><div><b>${f1(per(s, 'ast'))}</b><span>AST</span></div><div><b>${pct(s.fg, s.fga)}</b><span>FG%</span></div><div><b>${pct(s.tp, s.tpa)}</b><span>3P%</span></div></div>` : ''}</div>
      <section class="card" style="padding:0"><div class="box-h">Game log</div><div class="scroll"><table><thead><tr><th class="t" style="padding-left:18px">Day</th><th class="t">Opp</th><th class="t">Result</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th><th>FG</th><th>3PT</th><th>FT</th><th style="padding-right:18px">+/-</th></tr></thead><tbody>${log.join('') || '<tr><td class="t muted" colspan="14">No games yet.</td></tr>'}</tbody></table></div></section>`;
  }

  /* ---------- leaders ---------- */
  function leadersPage() {
    const q = [...stats.entries()].filter(([, s]) => s.gp >= 8);
    const cats = [['Points', (s) => per(s, 'pts'), f1], ['Rebounds', (s) => per(s, 'reb'), f1], ['Assists', (s) => per(s, 'ast'), f1], ['Steals', (s) => per(s, 'stl'), f1], ['Blocks', (s) => per(s, 'blk'), f1],
      ['3-pointers made', (s) => per(s, 'tp'), f1], ['Field goal %', (s) => (s.fga >= 5 * s.gp ? 100 * s.fg / s.fga : -1), (v) => v.toFixed(1)], ['Plus-minus', (s) => per(s, 'pm'), (v) => (v > 0 ? '+' : '') + v.toFixed(1)]];
    $app.innerHTML = `<div class="page-h"><h1>Leaders</h1><span class="muted mono">Per game · at least 8 games</span></div><div class="lgrid">${cats.map(([lab, f, fmt]) => {
      const top = q.map(([pid, s]) => [pid, s, f(s)]).filter((x) => x[2] >= 0).sort((a, b) => b[2] - a[2]).slice(0, 5);
      return `<div class="card"><h2>${lab}</h2>${top.map(([pid, s, v], i) => `<a class="lrow${i ? '' : ' first'}" href="#player-${pid}"><span class="n">${i + 1}</span>${face(pid, 36)}<span class="who"><b>${esc(P.get(pid).name)}</b><span>${team(s.tid).abbrev} · ${P.get(pid).pos}</span></span><span class="v">${fmt(v)}</span></a>`).join('')}</div>`; }).join('')}</div>`;
  }

  const notFound = () => { $app.innerHTML = '<p class="muted">That page does not exist. <a href="#scores">Back to scores</a>.</p>'; };

  /* ---------- router ---------- */
  function route() {
    const h = location.hash.slice(1) || 'scores', [kind, arg] = [h.split('-')[0], h.slice(h.indexOf('-') + 1)];
    const nav = { scores: 'scores', game: 'scores', standings: 'standings', teams: 'teams', team: 'teams', leaders: 'leaders', player: 'leaders' }[kind];
    document.querySelectorAll('[data-nav]').forEach((a) => (a.dataset.nav === nav ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    if (kind === 'scores') scores(h.includes('-') ? +arg : 0);
    else if (kind === 'game') game(+arg);
    else if (kind === 'standings') standings();
    else if (kind === 'teams') teams();
    else if (kind === 'team') teamPage(arg);
    else if (kind === 'player') player(+arg);
    else if (kind === 'leaders') leadersPage();
    else notFound();
    window.scrollTo(0, 0);
  }

  fetch('data/league.json').then((r) => r.json()).then((d) => {
    D = d; derive();
    document.getElementById('when').textContent = `${D.season} · Day ${lastDay} · ${D.games.length}/${D.total} games`;
    document.getElementById('logos').innerHTML = T.map((t) => `<a href="#team-${t.abbrev}" title="${esc(t.region)} ${esc(t.name)}">${logo(t.tid, 28)}</a>`).join('');
    addEventListener('hashchange', route); route();
  }).catch(() => { $app.innerHTML = '<p class="muted">The league data did not load. Reload the page.</p>'; });
})();
