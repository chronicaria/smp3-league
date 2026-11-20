"""BBGM export (+ play-by-play timelines) -> site/data/league.json. Ships names, bios, box scores, score timelines,
schedule, news. Strips everything rating-derived (ratings, team ovr, skill tags, value, contracts).
usage: python3 tools/make_site_data.py data/export.json"""
import json, sys, os, re
BOARD = '/Users/andrewpark/Code/rome-kits/Knowledge/Sports/Basketball/SMP III/board/players.json'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
E = json.load(open(sys.argv[1])); season = E['gameAttributes']['season']
PBP = json.load(open(sys.argv[1].replace('.json', '-pbp.json')))
board = {p['id']: p for p in json.load(open(BOARD))}
TEAMS = json.load(open(os.path.join(ROOT, 'engine/teams.json')))
STAT = ['gs', 'min', 'pts', 'fg', 'fga', 'tp', 'tpa', 'ft', 'fta', 'orb', 'drb', 'ast', 'tov', 'stl', 'blk', 'pf', 'pm',
        'fgAtRim', 'fgaAtRim', 'fgLowPost', 'fgaLowPost', 'fgMidRange', 'fgaMidRange']
teams = [dict(tid=i, abbrev=t['abbrev'], region=t['region'], name=t['name'], color=t['colors'][0], accent=t['accent'], logo=f"logos/{t['abbrev']}.png") for i, t in enumerate(TEAMS)]
used = set(); games = []; day_of = {}
for g in sorted((x for x in E['games'] if x['season'] == season), key=lambda x: x['gid']):
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
players = []
for p in E['players']:
    if p['tid'] < 0 and p['pid'] not in used: continue
    b = board.get(p.get('srID'), {}); inj = p.get('injury') or {}; d = p.get('draft') or {}
    players.append({k: v for k, v in dict(pid=p['pid'], name=f"{p['firstName']} {p['lastName']}".strip(), tid=p['tid'], pos=b.get('pos') or p['ratings'][-1]['pos'],
        age=season - p['born']['year'], ht=p.get('hgt'), wt=p.get('weight'), espn=b.get('espn'), num=p.get('jerseyNumber'),
        born=p['born'].get('loc'), col=p.get('college') or None, nba=[d['year'], d['round'], d['pick']] if d.get('round') else ([d['year'], 0, 0] if d.get('year') else None),
        smp=pick.get(p['pid']), inj=[('Injury' if inj['type'] == 'Injured' else inj['type']), inj['gamesRemaining']] if inj.get('gamesRemaining') else None).items() if v is not None})
news = []
for f in E.get('playerFeats', []):
    if f['season'] == season: news.append(dict(k='feat', pid=f['pid'], gid=f['gid'], day=day_of.get(f['gid'])))
order = 0
for ev in E['events']:
    if ev['type'] == 'injured':
        m = re.search(r'\((.+), out for (.+)\)', ev['text'])
        news.append(dict(k='inj', pid=ev['pids'][0], what=m[1] if m else 'Injury', out=m[2] if m else '', eid=ev['eid']))
sched = [dict(gid=s['gid'], day=s['day'], home=s['homeTid'], away=s['awayTid']) for s in E['schedule'] if s['homeTid'] >= 0]
out = dict(season=f"{season - 1}–{str(season)[2:]}", total=180, cols=STAT, teams=teams, players=players, games=games, schedule=sched, news=news)
s = json.dumps(out, separators=(',', ':'), ensure_ascii=False)
for bad in ('"ovr"', '"skills"', '"ratings"', '"contract"', '"value"', '"pot"'): assert bad not in s, bad
os.makedirs(os.path.join(ROOT, 'site/data'), exist_ok=True)
open(os.path.join(ROOT, 'site/data/league.json'), 'w').write(s)
print(f"{len(games)} games, {len(players)} players, {len(sched)} scheduled, {len(news)} news, {len(s)//1024} KB")
