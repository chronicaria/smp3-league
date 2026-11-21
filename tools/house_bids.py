"""AI bids for teams whose owners are not bidding (Andrew, 2026-11-20): 12 each, only on players nobody has bid on.
usage: python3 tools/house_bids.py bids.csv TEAM [TEAM ...]  ->  house_bids.json (in play order) and a printed table

Equitable: the teams snake through the best unbid players by board rank (order drawn from a fixed seed), each roster
gets two or three players at every position, and each team spends the same total. Salaries follow rank^-0.6 within a
team, scaled to TOTAL, which is the most a team can lead with at any point under the budget rule ($100M minus $1M per
open spot). Length by age: 23 or younger 5 years, 24-26 4, 27-29 3, 30-33 2, older 1."""
import csv, json, os, random, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = json.load(open(os.path.join(ROOT, 'site/data/auction.json')))
ROSTER, TOTAL, POS = A['roster'], A['budget'] - A['roster'], ['PG', 'SG', 'SF', 'PF', 'C']
key = lambda s: re.sub(r'\s+', ' ', s.lower()).strip()
name = {}
for l in A['lots']:
    name[key(l['n'])] = l['id']
    if l.get('alt'): name[key(l['alt'])] = l['id']
rows = list(csv.reader(open(sys.argv[1])))[1:]
teams = sys.argv[2:]
FULL = {f"{x['region']} {x['name']}": x['abbrev'] for x in json.load(open(os.path.join(ROOT, 'engine/teams.json')))}
taken = {name.get(key(r[2])) for r in rows if FULL.get(r[1]) not in teams}   # AI teams' own earlier bids do not block a player
random.Random(20261120).shuffle(teams)
pool = [l for l in sorted(A['lots'], key=lambda l: l['rk']) if l['id'] not in taken]
picks = {t: [] for t in teams}
for rnd in range(ROSTER):
    for t in (teams if rnd % 2 == 0 else teams[::-1]):
        have = {p: sum(1 for x in picks[t] if x['pos'] == p) for p in POS}
        need = [p for p in POS if have[p] < 2]
        left = ROSTER - len(picks[t])
        ok = lambda l: have[l['pos']] < 3 and (l['pos'] in need or left > sum(2 - have[p] for p in need))
        l = next(x for x in pool if ok(x)); pool.remove(l); picks[t].append(l)
out = []
for t in teams:
    w = [l['rk'] ** -0.6 for l in picks[t]]
    sal = [max(1, round(TOTAL * x / sum(w))) for x in w]
    while sum(sal) > TOTAL: sal[sal.index(max(sal))] -= 1
    for l, s in zip(picks[t], sal):
        l['_bid'] = dict(team=t, player=l['n'], pid=l['id'], rk=l['rk'], pos=l['pos'], sal=s, yrs=5 if l['age'] <= 23 else 4 if l['age'] <= 26 else 3 if l['age'] <= 29 else 2 if l['age'] <= 33 else 1)
for rnd in range(ROSTER):   # submit in the order they were picked
    for t in (teams if rnd % 2 == 0 else teams[::-1]): out.append(picks[t][rnd]['_bid'])
json.dump(out, open('house_bids.json', 'w'), ensure_ascii=False, indent=1)
for t in teams:
    b = [x for x in out if x['team'] == t]
    print(f"\n{t}  ${sum(x['sal'] for x in b)}M  " + ' '.join(f"{p}:{sum(1 for x in b if x['pos'] == p)}" for p in POS))
    for x in b: print(f"  #{x['rk']:<4}{x['pos']:<3}{x['player']:<26}${x['sal']}M x {x['yrs']}")
