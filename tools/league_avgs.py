"""Per-team-game league averages from engine exports, next to rough real-league targets. usage: python3 tools/league_avgs.py file..."""
import json, sys
T = dict(pts=113.8, fga=89.2, fgp=46.6, tpa=37.6, tpp=36.0, fta=21.7, ftp=78.0, reb=44.1, ast=26.5, tov=14.3, stl=8.2, blk=4.9)
tot = dict.fromkeys(('pts', 'fg', 'fga', 'tp', 'tpa', 'ft', 'fta', 'orb', 'drb', 'ast', 'tov', 'stl', 'blk'), 0); n = 0
for f in sys.argv[1:]:
    for g in json.load(open(f))['games']:
        for t in g['teams']:
            n += 1
            for k in tot: tot[k] += t[k]
a = {k: v / n for k, v in tot.items()}
out = dict(pts=a['pts'], fga=a['fga'], fgp=100 * a['fg'] / a['fga'], tpa=a['tpa'], tpp=100 * a['tp'] / a['tpa'], fta=a['fta'], ftp=100 * a['ft'] / a['fta'], reb=a['orb'] + a['drb'], ast=a['ast'], tov=a['tov'], stl=a['stl'], blk=a['blk'])
print('        ' + ' '.join(f'{k:>6}' for k in T)); print('league  ' + ' '.join(f'{out[k]:6.1f}' for k in T)); print('target  ' + ' '.join(f'{T[k]:6.1f}' for k in T))
