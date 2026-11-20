"""Auction config for the league site: the top 200 players on the draft board with opening prices, plus demo bids.
usage: python3 tools/make_auction_data.py
Writes site/data/auction.json and site/data/auction-demo.csv. No ratings ship: only board rank, name, position, age,
height and the ESPN id (for the face and the link to his ESPN page).

Opening price: half of an expected-price curve a * rank^-0.6 (capped at $35M) scaled so the top 120 total $1B,
i.e. ten $100M budgets over 120 roster spots. Whole $M, floor $1M. Half-price floors stop anyone stealing a star for
$1M if few teams show up, and still leave room to bid."""
import csv, json, os, random
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOARD = '/Users/andrewpark/Code/rome-kits/Knowledge/Sports/Basketball/SMP III/board/players.json'
TEAMS = [t['abbrev'] for t in json.load(open(os.path.join(ROOT, 'engine/teams.json')))]
N, BUDGET, ROSTER, MAX = 200, 100, 12, 35
board = json.load(open(BOARD))[:N]

def curve(a): return [min(MAX, a * r ** -0.6) for r in range(1, 121)]
lo, hi = 1.0, 500.0
for _ in range(60):
    mid = (lo + hi) / 2
    lo, hi = (mid, hi) if sum(curve(mid)) < 1000 else (lo, mid)
market = lambda r: min(MAX, hi * r ** -0.6)
lots = [{k: v for k, v in dict(id=p['id'], rk=p['rk'], n=p['n'], pos=p['pos'], age=p['age'], ht=p.get('ht'), espn=p.get('espn'),
                               open=max(1, round(market(p['rk']) / 2))).items() if v is not None} for p in board]

# ---- settings Andrew fills in when the real auction opens (see README "Auction") ----
cfg = dict(
    start=None,          # e.g. "2026-12-21T12:00:00-05:00"; null = demo mode (the clock starts 20 hours before you load the page)
    hours=48, budget=BUDGET, roster=ROSTER, max=MAX,
    csv='',              # the published "Public bids" sheet tab, as CSV; empty = use auction-demo.csv
    form=dict(url='', team='', player='', salary='', years=''),   # Google Form prefill: the form URL and each question's entry id
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
    tm = rng.choice(TEAMS)
    cands = [l for l in lots if lead.get(l['id'], {}).get('team') != tm]
    rng.shuffle(cands); cands.sort(key=lambda l: l['rk'] * rng.uniform(0.15, 4))   # mostly stars, but everyone shops down the board too
    for l in cands[:25]:
        cur = lead.get(l['id']); yrs = rng.choice([1, 1, 2, 2, 3, 4]) if l['age'] <= 29 else rng.choice([1, 1, 2])
        need = (cur['score'] if cur else l['open'] - 0.01) / mult(yrs)
        sal = int(need) + 1
        n = count(tm) + 1
        if sal > val[tm][l['id']] or sal > MAX or n > ROSTER or spent(tm) + sal + (ROSTER - n) > BUDGET: continue
        if rng.random() < 0.04: sal = max(1, sal - 2)   # a few bids that will be refused, so the log shows how that looks
        else: lead[l['id']] = dict(team=tm, sal=sal, score=sal * mult(yrs))
        rows.append([f'h:{t:.3f}', tm, l['n'], sal, yrs]); break
with open(os.path.join(ROOT, 'site/data/auction-demo.csv'), 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['Timestamp', 'Team', 'Player', 'Salary', 'Years']); w.writerows(rows)
print(f"{len(lots)} lots; opening prices #1 ${lots[0]['open']}M, #10 ${lots[9]['open']}M, #50 ${lots[49]['open']}M, #100 ${lots[99]['open']}M, #200 ${lots[199]['open']}M; top-120 opening total ${sum(l['open'] for l in lots[:120])}M")
print(f"{len(rows)} demo bids; leaders: " + ', '.join(f"{tm} {count(tm)}/${spent(tm)}M" for tm in TEAMS))
