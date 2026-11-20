"""Full-season sanity checks on the top of the league: shooting leaders, BPM leaders, scoring outliers, injury load.
usage: python3 tools/extremes.py data/study/secret-*.json [secret_ratings.json]"""
import json, sys, collections, statistics as st
files = [f for f in sys.argv[1:] if 'smp3_ratings' not in f]
secret = next((json.load(open(f))['players'] for f in sys.argv[1:] if 'smp3_ratings' in f), [])
pub = {p['name']: (p['public_ovr'], p['secret_ovr']) for p in secret}
tp5, bpm5, pts_out, inj, short = [], [], collections.Counter(), [], []
for f in files:
    e = json.load(open(f)); P = collections.defaultdict(collections.Counter); name = {}
    lost = collections.Counter(); tg = 0
    for g in e['games']:
        for t in g['teams']:
            tg += 1
            for p in t['players']:
                name[p['pid']] = p['name']
                if p['min'] > 0:
                    c = P[p['pid']]; c['gp'] += 1
                    for k in ('pts', 'tp', 'tpa', 'min'): c[k] += p[k]
                elif (p.get('injury') or {}).get('gamesRemaining'): lost[t['tid']] += 1
    inj.append(sum(lost.values()) / (tg * 12))
    q = [(100 * c['tp'] / c['tpa'], pid) for pid, c in P.items() if c['tpa'] >= 3 * 36 * 0.7 and c['gp'] >= 25]
    tp5.append([x for x, _ in sorted(q, reverse=True)[:5]])
    adv = []
    for p in e['players']:
        s = [x for x in p.get('stats', []) if x['season'] == 2027 and not x['playoffs']]
        if s and s[-1]['gp'] >= 25 and s[-1]['min'] * s[-1]['gp'] >= 600: adv.append((s[-1]['obpm'] + s[-1]['dbpm'], f"{p['firstName']} {p['lastName']}"))
    bpm5.append(sorted(adv, reverse=True)[:5])
    for pid, c in P.items():
        if c['gp'] >= 25 and c['pts'] / c['gp'] >= 26: pts_out[name[pid]] += 1
print('3P% leaders (3+ attempts a game), mean of ranks 1-5 across seasons:', [round(st.mean(x[i] for x in tp5), 1) for i in range(5)], ' real league: about 46, 45, 44, 43.5, 43')
print('BPM leaders, mean of ranks 1-5:', [round(st.mean(x[i][0] for x in bpm5), 1) for i in range(5)], ' real league: about 12, 9, 8, 7, 6.5')
print('BPM #1 by season:', [(round(x[0][0], 1), x[0][1]) for x in bpm5])
print(f'share of roster player-games lost to injury: {100 * st.mean(inj):.1f}%  (real league: roughly 10-15% for rotation players)')
print('26+ ppg scorers (seasons out of %d) [public ovr, secret ovr]:' % len(files), [(n, c, pub.get(n)) for n, c in pts_out.most_common(14)])
