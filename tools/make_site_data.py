"""BBGM export (+ play-by-play timelines) -> site/data/league.json. Ships names, bios, box scores, score timelines,
schedule, news. Strips everything rating-derived (ratings, team ovr, skill tags, value, contracts).
usage: python3 tools/make_site_data.py data/export.json"""
import json, sys, os, re
BOARD = '/Users/andrewpark/Code/rome-kits/Knowledge/Sports/Basketball/SMP III/board/players.json'
sys.path.insert(0, os.path.dirname(BOARD))
from positions import fallback
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
E = json.load(open(sys.argv[1])); season = E['gameAttributes']['season']
PBP = json.load(open(sys.argv[1].replace('.json', '-pbp.json')))
LINE = json.load(open(sys.argv[1].replace('.json', '-lineups.json')))
board = {p['id']: p for p in json.load(open(BOARD))}
TEAMS = json.load(open(os.path.join(ROOT, 'engine/teams.json')))
STAT = ['gs', 'min', 'pts', 'fg', 'fga', 'tp', 'tpa', 'ft', 'fta', 'orb', 'drb', 'ast', 'tov', 'stl', 'blk', 'pf', 'pm',
        'fgAtRim', 'fgaAtRim', 'fgLowPost', 'fgaLowPost', 'fgMidRange', 'fgaMidRange']
teams = [dict(tid=i, abbrev=t['abbrev'], region=t['region'], name=t['name'], color=t['colors'][0], accent=t['accent'], logo=f"logos/{t['abbrev']}.png", arena=t['arena'], banners=t.get('banners', [])) for i, t in enumerate(TEAMS)]
used = set(); games = []; day_of = {}
for g in sorted((x for x in E.get('games', []) if x['season'] == season), key=lambda x: x['gid']):
    h, a = g['teams']   # BBGM: teams[0] is home
    day_of[g['gid']] = g['day']
    def side(t):
        box, dnp = [], []
        for p in t['players']:
            used.add(p['pid'])
            if p.get('min'): box.append([p['pid']] + [round(p[k], 1) if k == 'min' else p[k] for k in STAT])
            else:
                inj = p.get('injury') or {}
                dnp.append([p['pid'], ('Injury' if inj.get('type') in (None, 'Injured') else inj['type']) if inj.get('gamesRemaining') else "Coach's Decision"])
        return dict(tid=t['tid'], pts=t['pts'], q=t['ptsQtrs'], box=box, dnp=dnp)
    games.append(dict(gid=g['gid'], day=g['day'], ot=g.get('overtimes', 0), att=g.get('att'), home=side(h), away=side(a),
                      tl=[x[:3] for x in PBP[str(g['gid'])]]))
pick = {}
for ev in E['events']:
    if ev['type'] == 'draft':
        m = re.search(r'with the (\d+)\w+ pick', ev['text'])
        if m: pick[ev['pids'][0]] = int(m[1])
def adv(p):
    st = [x for x in p.get('stats', []) if x['season'] == season and not x['playoffs']]
    if not st or not st[-1].get('gp'): return None
    x = st[-1]; return [round(x['per'], 1), round(x['ows'] + x['dws'], 2), round(x['dws'], 2), round(x['usgp'], 1), round(x['ewa'], 2), round(x['vorp'], 2), round(x['obpm'], 1), round(x['dbpm'], 1)]
PAY = 1   # since the auction (Nov 2026) every rostered player has a real SMP contract; no rescaling
players = []
for p in E['players']:
    if p['tid'] < 0 and p['pid'] not in used: continue
    b = board.get(p.get('srID'), {}); inj = p.get('injury') or {}; d = p.get('draft') or {}
    players.append({k: v for k, v in dict(pid=p['pid'], name=f"{p['firstName']} {p['lastName']}".strip(), tid=p['tid'], pos=b.get('pos') or p['ratings'][-1]['pos'],
        age=season - p['born']['year'], ht=p.get('hgt'), wt=p.get('weight'), espn=b.get('espn'), num=p.get('jerseyNumber'),
        rk=True if d.get('year') == season - 1 else None, so=True if d.get('year') == season - 2 and d.get('round') == 1 else None,
        sal=max(1, round(p['contract']['amount'] * PAY / 1000)) if p['tid'] >= 0 else None, exp=p['contract']['exp'] if p['tid'] >= 0 else None,
        ls=[b['s'][k] for k in ('pts', 'reb', 'ast', 'g')] if b.get('s') else None, adv=adv(p),
        smp=pick.get(p['pid']), inj=[('Injury' if inj['type'] == 'Injured' else inj['type']), inj['gamesRemaining']] if inj.get('gamesRemaining') else None).items() if v is not None})
# free agents: the 150 best by draft-board order, with last season's line (no ratings, no asking price yet)
fa = []
for p in E['players']:
    b = board.get(p.get('srID'))
    if p['tid'] == -1 and b: fa.append(dict(name=b['n'], pos=b['pos'], age=b['age'], ht=b.get('ht'), espn=b.get('espn'), bd=b['rk']))
fa = [{k: v for k, v in x.items() if v is not None} for x in sorted(fa, key=lambda x: x['bd'])[:100]]
# next draft class, in the engine's scouting order (order only)
cls = sorted((p for p in E['players'] if p['tid'] == -2 and p['draft']['year'] == season), key=lambda p: -p['value'])
draft = [{k: v for k, v in dict(name=f"{p['firstName']} {p['lastName']}", pos=fallback(p['ratings'][-1]['pos'], p.get('hgt')), age=season - p['born']['year'], ht=p.get('hgt'),
          col=p.get('college') or None).items() if v is not None} for p in cls]
news = []
for f in E.get('playerFeats', []):
    if f['season'] == season: news.append(dict(k='feat', pid=f['pid'], gid=f['gid'], day=day_of.get(f['gid'])))
order = 0
for ev in E['events']:
    if ev['type'] == 'injured':
        m = re.search(r'\((.+), out for (.+)\)', ev['text'])
        news.append(dict(k='inj', pid=ev['pids'][0], what=m[1] if m else 'Injury', out=m[2] if m else '', eid=ev['eid']))
# Win-probability model, fitted on the league's own play-by-play (this run plus data/cal/wp-pbp.json when present):
# P(home wins) = Phi((lead + hca * frac) / sqrt(sd^2 * frac + kappa)), frac = share of regulation left. kappa keeps late leads honest.
import math, glob
def fit_wp():
    rows = []
    srcs = [(E, PBP)]
    extra = os.path.join(os.path.dirname(sys.argv[1]), 'cal', 'wp.json')
    if os.path.exists(extra): srcs.append((json.load(open(extra)), json.load(open(extra.replace('.json', '-pbp.json')))))
    for ex, pb in srcs:
        for g in ex.get('games', []):
            tl = [[0, 0, 0]] + pb[str(g['gid'])]; fin = g['teams'][0]['pts'] - g['teams'][1]['pts']; i = 0
            for t in list(range(0, 2880, 30)) + [2700, 2760, 2790, 2820, 2840, 2850, 2860, 2866, 2872, 2876]:
                while i + 1 < len(tl) and tl[i + 1][0] <= t: i += 1
                j = max(k for k in range(len(tl)) if tl[k][0] <= t)
                rows.append(((2880 - t) / 2880, tl[j][2] - tl[j][1], fin))
    hca = sum(f for fr, l, f in rows if fr == 1.0) / sum(1 for fr, l, f in rows if fr == 1.0)
    early = [(fr, l, f) for fr, l, f in rows if fr >= 0.25]
    sd = math.sqrt(sum((f - l - hca * fr) ** 2 / fr for fr, l, f in early) / len(early))
    phi = lambda z: 0.5 * (1 + math.erf(z / math.sqrt(2)))
    late = [(fr, l, f) for fr, l, f in rows if fr <= 180 / 2880 and f != 0]
    def ll(k): return sum(math.log(max(1e-9, phi((l + hca * fr) / math.sqrt(sd * sd * fr + k)) if f > 0 else 1 - phi((l + hca * fr) / math.sqrt(sd * sd * fr + k)))) for fr, l, f in late)
    kappa = max((x / 4 for x in range(0, 61)), key=ll)
    return dict(sd=round(sd, 2), hca=round(hca, 2), kappa=kappa, games=sum(len(ex.get('games', [])) for ex, _ in srcs))
wp = fit_wp()
lineups = {tid: [[*map(int, k.split(',')), round(v[0]), v[1], v[2]] for k, v in d.items() if v[0] >= 20] for tid, d in LINE.items()}
sched = [dict(gid=s['gid'], day=s['day'], home=s['homeTid'], away=s['awayTid']) for s in E['schedule'] if s['homeTid'] >= 0]
out = dict(season=f"{season - 1}–{str(season)[2:]}", total=180, cols=STAT, teams=teams, players=players, games=games, schedule=sched, news=news, fa=fa, draft=draft, draftYear=season, wp=wp, cap=100)
s = json.dumps(out, separators=(',', ':'), ensure_ascii=False)
for bad in ('"nba"', 'NBA', '"ovr"', '"skills"', '"ratings"', '"value"', '"pot"'): assert bad not in s, bad
os.makedirs(os.path.join(ROOT, 'site/data'), exist_ok=True)
open(os.path.join(ROOT, 'site/data/league.json'), 'w').write(s)
open(os.path.join(ROOT, 'site/data/lineups.json'), 'w').write(json.dumps(lineups, separators=(',', ':')))
print('win-prob fit', wp, '| lineups', sum(len(v) for v in lineups.values()), os.path.getsize(os.path.join(ROOT, 'site/data/lineups.json')) // 1024, 'KB')
print(f"{len(games)} games, {len(players)} players, {len(sched)} scheduled, {len(news)} news, {len(s)//1024} KB")
