"""Auction config for the league site: every player on the draft board, plus demo bids.
usage: python3 tools/make_auction_data.py
Writes site/data/auction.json and site/data/auction-demo.csv. No ratings ship: only board rank, name, position, age,
height, the ESPN id (for the face and the link to his ESPN page) and last season's real per-game line.

Every player opens at $1M (Andrew, 11-20: enough teams will bid that stars cannot go cheap). The expected-price curve
a * rank^-0.6 (capped at $35M, top 120 totalling $1B) is only used to make the demo bids look plausible."""
import csv, json, os, random
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOARD = '/Users/andrewpark/Code/rome-kits/Knowledge/Sports/Basketball/SMP III/board/players.json'
TEAMS = [t['abbrev'] for t in json.load(open(os.path.join(ROOT, 'engine/teams.json')))]
N, BUDGET, ROSTER, MAX = None, 100, 12, 35
board = json.load(open(BOARD))[:N]

def curve(a): return [min(MAX, a * r ** -0.6) for r in range(1, 121)]
lo, hi = 1.0, 500.0
for _ in range(60):
    mid = (lo + hi) / 2
    lo, hi = (mid, hi) if sum(curve(mid)) < 1000 else (lo, mid)
market = lambda r: min(MAX, hi * r ** -0.6)
lots = [{k: v for k, v in dict(id=p['id'], rk=p['rk'], n=p['n'], pos=p['pos'], age=p['age'], ht=p.get('ht'), espn=p.get('espn'),
                               open=1, s=[p['s'].get(k) for k in ('g', 'mp', 'pts', 'reb', 'ast', 'stl', 'blk', 'fg', 'tp', 'ft')] if p.get('s') else None).items() if v is not None} for p in board]

# ---- settings Andrew fills in when the real auction opens (see README "Auction") ----
cfg = dict(
    start='2026-11-20T12:00:00-05:00',   # bids stamped before this are refused; None = demo mode
    close='2026-11-22T23:59:59-05:00',   # Sunday night, Eastern; overrides start + hours
    hours=48, budget=BUDGET, roster=ROSTER, max=MAX,
    tz='-05:00',         # the bid sheet's time zone as a UTC offset (File > Settings in the sheet); -05:00 is US Eastern in winter
    csv='https://docs.google.com/spreadsheets/d/e/2PACX-1vRZzKvD55n_uNnddZ3MKZA39rNNBoQzMfbbNmZY509nTCzCFwDLVdS3z19N9bF2UkJ7iFDUwpYLS3VT/pub?output=csv',   # the form's response sheet, published as CSV
    form=dict(url='https://docs.google.com/forms/d/e/1FAIpQLSfgclHk1wATdaob-Ri4iCqYOt5YPrmRwX-EN8Iwd067kUVSBw/viewform', team='1058264156', player='1685387383', salary='357442458', years='441189916'),   # Google Form and each question's entry id (for prefilled bid links)
    teams=TEAMS, lots=lots)
json.dump(cfg, open(os.path.join(ROOT, 'site/data/auction.json'), 'w'), separators=(',', ':'), ensure_ascii=False)

# ---- demo bids: ten teams with their own noisy valuations bid for about 20 hours ----
rng = random.Random(27)
val = {t: {l['id']: market(l['rk']) * rng.uniform(0.7, 1.35) for l in lots} for t in TEAMS}
lead = {}; mult = lambda y: 1 + 0.25 * (y - 1); rows = []; t = 0.0
def spent(tm, ex=None): return sum(b['sal'] for pid, b in lead.items() if b['team'] == tm and pid != ex)
def count(tm): return sum(1 for b in lead.values() if b['team'] == tm)
while t < 20:
    t += rng.expovariate(30)                       # about 30 bids an hour
    tm = rng.choices(TEAMS, weights=[ROSTER + 2 - count(x) for x in TEAMS])[0]   # teams with emptier rosters bid more often
    cands = [l for l in lots if lead.get(l['id'], {}).get('team') != tm]
    rng.shuffle(cands); cands.sort(key=lambda l: l['rk'] * rng.uniform(0.15, 4))   # mostly stars, but everyone shops down the board too
    for l in cands[:25]:
        cur = lead.get(l['id']); yrs = rng.choice([1, 1, 2, 2, 3, 4]) if l['age'] <= 29 else rng.choice([1, 1, 2])
        need = (cur['score'] if cur else l['open'] - 0.01) / mult(yrs)
        sal = max(int(need) + 1, round(val[tm][l['id']] * rng.uniform(0.35, 0.75) / mult(yrs)))   # open with a real offer, not $1M
        n = count(tm) + 1
        if sal > val[tm][l['id']] or sal > MAX or n > ROSTER or spent(tm) + sal + (ROSTER - n) > BUDGET: continue
        if rng.random() < 0.04: sal = max(1, sal - 2)   # a few bids that will be refused, so the log shows how that looks
        else: lead[l['id']] = dict(team=tm, sal=sal, score=sal * mult(yrs))
        rows.append([f'h:{t:.3f}', tm, l['n'], sal, yrs]); break
with open(os.path.join(ROOT, 'site/data/auction-demo.csv'), 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['Timestamp', 'Team', 'Player', 'Salary', 'Years']); w.writerows(rows)
print(f"{len(lots)} lots; opening prices #1 ${lots[0]['open']}M, #10 ${lots[9]['open']}M, #50 ${lots[49]['open']}M, #100 ${lots[99]['open']}M, last ${lots[-1]['open']}M; top-120 opening total ${sum(l['open'] for l in lots[:120])}M")
print(f"{len(rows)} demo bids; leaders: " + ', '.join(f"{tm} {count(tm)}/${spent(tm)}M" for tm in TEAMS))
