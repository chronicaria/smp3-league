"""Injury luck and ratings sanity from full-season test runs (data/study/*.json). usage: python3 tools/study.py"""
import json, glob, statistics as st, collections
def load(pat): return [json.load(open(f)) for f in sorted(glob.glob(pat))]
def season(e):
    g = [x for x in e['games'] if x['season'] == 2027]
    out = dict(teams=collections.defaultdict(lambda: dict(w=0, inj=0, injmin=0.0, pts=0, gp=0)), players=collections.defaultdict(lambda: collections.Counter()), short=0, tg=0)
    for x in g:
        for t in x['teams']:
            T = out['teams'][t['tid']]; T['gp'] += 1; T['pts'] += t['pts']; T['w'] += t['won'] > 0 if False else 0
            avail = 0
            for p in t['players']:
                inj = (p.get('injury') or {}).get('gamesRemaining', 0)
                if p['min'] > 0: avail += 1
                if not p['min'] and inj: T['inj'] += 1
                P = out['players'][p['pid']]; P['gp'] += p['min'] > 0; P['min'] += p['min']; P['pts'] += p['pts']; P['fga'] += p['fga']; P['name'] = p['name']; P['tid'] = t['tid']
            out['tg'] += 1; out['short'] += sum(1 for p in t['players'] if p['min'] > 0) <= 8
        w = x['won']['tid']; out['teams'][w]['w'] += 1
    return out
def report(label, runs):
    if not runs: return
    S = [season(e) for e in runs]
    print(f"\n== {label}: {len(S)} seasons ==")
    ppg = [T['pts'] / T['gp'] for s in S for T in s['teams'].values()]
    print(f"team points per game: mean {st.mean(ppg):.1f}, range {min(ppg):.1f}-{max(ppg):.1f}")
    wins = [T['w'] for s in S for T in s['teams'].values()]; print(f"wins per team (of 36): sd {st.pstdev(wins):.1f}, best {max(wins)}, worst {min(wins)}")
    inj = [T['inj'] for s in S for T in s['teams'].values()]
    print(f"man-games lost to injury per team-season: mean {st.mean(inj):.1f}, median {st.median(inj)}, min {min(inj)}, max {max(inj)}, sd {st.pstdev(inj):.1f}  ")
    print(f"team-games played with 8 or fewer available: {100 * sum(s['short'] for s in S) / sum(s['tg'] for s in S):.1f}%")
    xs = [(T['inj'], T['w']) for s in S for T in s['teams'].values()]
    mx, my = st.mean(x for x, _ in xs), st.mean(y for _, y in xs)
    r = sum((x - mx) * (y - my) for x, y in xs) / (len(xs) * st.pstdev([x for x, _ in xs]) * st.pstdev([y for _, y in xs]))
    print(f"correlation, injury games lost vs wins: {r:+.2f}")
    # player distributions
    top, mins = [], collections.defaultdict(list)
    for s in S:
        by = collections.defaultdict(list)
        for pid, P in s['players'].items():
            if P['gp'] >= 18: by[P['tid']].append((P['min'] / P['gp'], P['pts'] / P['gp']))
        lg = sorted((p for v in by.values() for p in v), key=lambda x: -x[1])
        top.append([lg[i][1] for i in (0, 4, 9, 19, 49)] + [sum(1 for x in lg if x[1] >= 25), sum(1 for x in lg if x[1] >= 20)])
        for v in by.values():
            v.sort(reverse=True)
            for i, (m, p) in enumerate(v[:10]): mins[i].append((m, p))
    t = [st.mean(c) for c in zip(*top)]
    print(f"scoring: leader {t[0]:.1f} ppg, 5th {t[1]:.1f}, 10th {t[2]:.1f}, 20th {t[3]:.1f}, 50th {t[4]:.1f}; players at 25+ ppg: {t[5]:.1f}, at 20+: {t[6]:.1f}")
    print("minutes / points by rotation slot (1 = most minutes): " + ', '.join(f"{i + 1}: {st.mean(m for m, _ in mins[i]):.0f}m/{st.mean(p for _, p in mins[i]):.1f}" for i in sorted(mins)))
report('SECRET ratings (k=2.5 + noise)', load('data/study/secret-*.json'))
report('PUBLIC ratings (control)', load('data/study/public-*.json'))
