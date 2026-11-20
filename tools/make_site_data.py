"""BBGM export -> site/data/league.json. Ships names, bios, box scores, schedule. Strips everything rating-derived
(player ratings, team ovr, skill tags, value, contracts). usage: python3 tools/make_site_data.py data/export.json"""
import json, sys, os
BOARD = '/Users/andrewpark/Code/rome-kits/Knowledge/Sports/Basketball/SMP III/board/players.json'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
E = json.load(open(sys.argv[1])); season = E['gameAttributes']['season']
board = {p['id']: p for p in json.load(open(BOARD))}
TEAMS = json.load(open(os.path.join(ROOT, 'engine/teams.json')))
STAT = ['gs', 'min', 'pts', 'fg', 'fga', 'tp', 'tpa', 'ft', 'fta', 'orb', 'drb', 'ast', 'tov', 'stl', 'blk', 'pf', 'pm']
teams = [dict(tid=i, abbrev=t['abbrev'], region=t['region'], name=t['name'], color=t['colors'][0], accent=t['accent'], logo=f"logos/{t['abbrev']}.png") for i, t in enumerate(TEAMS)]
used = set()
games = []
for g in sorted((x for x in E['games'] if x['season'] == season), key=lambda x: x['gid']):
    h, a = g['teams']   # BBGM: teams[0] is home
    def side(t):
        box = []
        for p in t['players']:
            if not p.get('min'): continue
            used.add(p['pid']); box.append([p['pid']] + [round(p[k], 1) if k == 'min' else p[k] for k in STAT])
        return dict(tid=t['tid'], pts=t['pts'], q=t['ptsQtrs'], box=box)
    games.append(dict(gid=g['gid'], day=g['day'], ot=g.get('overtimes', 0), home=side(h), away=side(a)))
players = []
for p in E['players']:
    if p['tid'] < 0 and p['pid'] not in used: continue
    b = board.get(p.get('srID'), {})
    inj = p.get('injury') or {}
    players.append(dict(pid=p['pid'], name=f"{p['firstName']} {p['lastName']}".strip(), tid=p['tid'], pos=b.get('pos') or p['ratings'][-1]['pos'],
                        age=season - p['born']['year'], ht=p.get('hgt'), espn=b.get('espn'), num=p.get('jerseyNumber'),
                        inj=[inj['type'], inj['gamesRemaining']] if inj.get('gamesRemaining') else None))
sched = [dict(gid=s['gid'], day=s['day'], home=s['homeTid'], away=s['awayTid']) for s in E['schedule'] if s['homeTid'] >= 0]
out = dict(season=f"{season - 1}–{str(season)[2:]}", total=180, cols=STAT, teams=teams, players=players, games=games, schedule=sched)
s = json.dumps(out, separators=(',', ':'), ensure_ascii=False)
for bad in ('"ovr"', '"skills"', '"ratings"', '"contract"', '"value"'): assert bad not in s, bad
os.makedirs(os.path.join(ROOT, 'site/data'), exist_ok=True)
open(os.path.join(ROOT, 'site/data/league.json'), 'w').write(s)
print(f"{len(games)} games, {len(players)} players, {len(sched)} scheduled, {len(s)//1024} KB")
