"""How minutes, points and shots split across a rotation, next to rough real-league shapes.
usage: python3 tools/rotation.py data/study/secret-*.json"""
import json, sys, collections, statistics as st
# Rough real-league shape for a team's players ranked by minutes per game (per game played).
REAL_MIN = [35, 33, 31, 29, 27, 24, 21, 18, 15, 12, 8, 5]
REAL_PTS = [24, 19, 16, 13, 11, 9.5, 8, 6.5, 5, 4, 2.5, 1.5]
slots = collections.defaultdict(list); bench = collections.defaultdict(list); top = []
for f in sys.argv[1:]:
    e = json.load(open(f)); games = [g for g in e['games'] if g['season'] == 2027]
    P = collections.defaultdict(lambda: collections.Counter())
    for g in games:
        for t in g['teams']:
            tot = collections.Counter(); b = collections.Counter()
            for p in t['players']:
                if p['min'] <= 0: continue
                c = P[(t['tid'], p['pid'])]; c['gp'] += 1
                for k in ('min', 'pts', 'fga'): c[k] += p[k]; tot[k] += p[k]; b[k] += p[k] if not p['gs'] else 0
            for k in ('min', 'pts', 'fga'): bench[k].append(b[k] / tot[k])
            bench['n'].append(sum(1 for p in t['players'] if p['min'] > 0))
    by = collections.defaultdict(list)
    for (tid, pid), c in P.items():
        if c['gp'] >= 12: by[tid].append((c['min'] / c['gp'], c['pts'] / c['gp'], c['fga'] / c['gp'], c['gp']))
    lg = sorted((x[1] for v in by.values() for x in v), reverse=True)
    top.append([lg[0], lg[4], lg[9], lg[19], sum(x >= 25 for x in lg), sum(x >= 20 for x in lg)])
    for v in by.values():
        v.sort(reverse=True)
        for i, x in enumerate(v[:12]): slots[i].append(x)
print('slot   min   real |  pts   real |  fga | games')
for i in sorted(slots):
    m = [st.mean(x[k] for x in slots[i]) for k in range(4)]
    print(f'{i + 1:>4} {m[0]:5.1f} {REAL_MIN[i]:6} | {m[1]:4.1f} {REAL_PTS[i]:6} | {m[2]:4.1f} | {m[3]:4.0f}')
print(f"bench share: minutes {100 * st.mean(bench['min']):.1f}%  points {100 * st.mean(bench['pts']):.1f}%  shots {100 * st.mean(bench['fga']):.1f}%   (real league: about 35% of minutes, 32% of points)")
print(f"players used per team per game: {st.mean(bench['n']):.1f}  (real league: about 9.5-10)")
t = [st.mean(c) for c in zip(*top)]
print(f"scoring: leader {t[0]:.1f}, 5th {t[1]:.1f}, 10th {t[2]:.1f}, 20th {t[3]:.1f}; at 25+: {t[4]:.1f}, at 20+: {t[5]:.1f}   (real league scaled to 10 teams: leader ~32, 5th ~24.5, 10th ~21.5, 20th ~17; ~4 at 25+, ~13 at 20+)")
