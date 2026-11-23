"""After the auction: fill short human rosters, then build AI rosters of equal strength by simulation.
usage: python3 tools/balance_ai.py state.json FILL_TEAM,... AI_TEAM,...   (state.json: {teams: {T: {leads: [{id, sal, yrs}]}}})
Writes tools/assigned.json ([{team, pid, sal, yrs}], no ratings) and prints each round. Runs only on Andrew's Mac:
it reads the private ratings and drives engine/sim_half.mjs (ROSTERS mode).

1. Short human teams take the best unsigned players by board rank at $1M for one year, neediest team first (the auction rule).
2. The AI teams share the next 12-per-team best unsigned players, two or three at each position, starting from a snake.
3. Simulate SEEDS seasons, then swap same-position players from the strongest AI teams to the weakest and repeat until
   the AI teams' average scoring margins sit within TOL points of each other. A player's worth for choosing swaps is his
   overall scaled by the share of games he actually played in the simulations (so an injured star counts for little)."""
import json, math, os, statistics, subprocess, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SECRET = os.path.expanduser('~/Code/rome-kits/Knowledge/Sports/Basketball/SMP III/pool/secret/smp3_ratings.json')
NODE, ZENGM = os.path.expanduser('~/.local/node24/bin/node'), os.path.expanduser('~/Code/zengm-smp3')
SEEDS, PAR, TOL, ROUNDS, POS = 12, 6, 2.0, 9, ['PG', 'SG', 'SF', 'PF', 'C']
A = json.load(open(os.path.join(ROOT, 'site/data/auction.json'))); LOT = {l['id']: l for l in A['lots']}
OVR = {p['id']: p['secret_ovr'] for p in json.load(open(SECRET))['players']}
state = json.load(open(sys.argv[1])); FILL = sys.argv[2].split(','); AI = sys.argv[3].split(',')
R = {t: [dict(x) for x in T['leads']] for t, T in state['teams'].items()}
taken = {x['id'] for v in R.values() for x in v}
free = [l for l in sorted(A['lots'], key=lambda l: l['rk']) if l['id'] not in taken]
assigned = []
while True:   # 1. human teams first
    need = [t for t in FILL if len(R[t]) < A['roster']]
    if not need: break
    t = min(need, key=lambda t: (len(R[t]), sum(x['sal'] for x in R[t]))); l = free.pop(0)
    R[t].append(dict(id=l['id'], sal=1, yrs=1)); assigned.append(dict(team=t, pid=l['id'], sal=1, yrs=1))
    print(f"fill {t}: #{l['rk']} {l['n']} ({l['pos']})")
# 2. AI pool and snake
picks = {t: [] for t in AI}
for rnd in range(A['roster']):
    for t in (AI if rnd % 2 == 0 else AI[::-1]):
        have = {p: sum(1 for x in picks[t] if LOT[x]['pos'] == p) for p in POS}; need = [p for p in POS if have[p] < 2]; left = A['roster'] - len(picks[t])
        l = next(x for x in free if have[x['pos']] < 3 and (x['pos'] in need or left > sum(2 - have[p] for p in need)))
        free.remove(l); picks[t].append(l['id'])

def sim(tag):
    rost = dict(R); rost.update({t: [dict(id=i, sal=1, yrs=1) for i in picks[t]] for t in AI})
    f = os.path.join(ROOT, 'data/cal/bal-rosters.json'); json.dump(rost, open(f, 'w'))
    outs, procs = [], []
    for k in range(SEEDS):
        o = os.path.join(ROOT, f'data/cal/bal-{k}.json'); outs.append(o)
        procs.append(subprocess.Popen([NODE, 'engine/sim_half.mjs', ZENGM, SECRET, o, '36'], cwd=ROOT, env={**os.environ, 'SEED': str(1000 + 37 * tag + k), 'PBP': '0', 'ROSTERS': f}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
        if len(procs) == PAR or k == SEEDS - 1:
            for p in procs:
                if p.wait() != 0: raise SystemExit('a simulation failed')
            procs = []
    marg = {t: [] for t in R}; wins = {t: [] for t in R}; gp = {}
    for o in outs:
        d = json.load(open(o)); T = {t['tid']: t['abbrev'] for t in d['teams']}; sr = {p['pid']: p.get('srID') for p in d['players']}
        m = dict.fromkeys(T.values(), 0); w = dict.fromkeys(T.values(), 0)
        for g in d['games']:
            a, b = g['teams']
            for me, op in ((a, b), (b, a)):
                m[T[me['tid']]] += me['pts'] - op['pts']; w[T[me['tid']]] += me['pts'] > op['pts']
                for p in me['players']:
                    if p['min'] > 0: gp[sr[p['pid']]] = gp.get(sr[p['pid']], 0) + 1
        for t in m: marg[t].append(m[t] / 36); wins[t].append(w[t])
    return {t: statistics.mean(v) for t, v in marg.items()}, {t: statistics.mean(v) for t, v in wins.items()}, {k: v / (36 * SEEDS) for k, v in gp.items()}

avail = {}
def worth(pid): return 40 + (OVR.get(pid, 40) - 40) * min(1, avail.get(pid, 0.9) / 0.9)   # 40 = a replacement-level player
def tovr(ids): o = sorted((worth(i) for i in ids), reverse=True)[:10]; return 0.4417 * sum(math.exp(-0.1905 * i) * x for i, x in enumerate(o))
best = None
for rnd in range(ROUNDS):
    marg, wins, gp = sim(rnd); avail.update(gp)
    spread = max(marg[t] for t in AI) - min(marg[t] for t in AI)
    print(f"round {rnd}: " + '  '.join(f"{t} {wins[t]:.1f}w {marg[t]:+.1f}" for t in sorted(R, key=lambda t: -marg[t])) + f"   AI spread {spread:.1f}", flush=True)
    if best is None or spread < best[0]: best = (spread, {t: list(v) for t, v in picks.items()}, dict(wins), dict(marg))
    if spread <= TOL: break
    # predicted margin = observed + (change in roster strength); move the extremes toward the AI mean with same-position swaps
    pred = {t: marg[t] for t in AI}; base = {t: tovr(picks[t]) for t in AI}; target = statistics.mean(pred.values())
    for _ in range(4):
        s = max(AI, key=lambda t: pred[t]); w = min(AI, key=lambda t: pred[t])
        if pred[s] - pred[w] <= TOL / 2: break
        opts = []
        for a in picks[s]:
            for b in picks[w]:
                if LOT[a]['pos'] != LOT[b]['pos'] or worth(a) <= worth(b): continue
                ns = [b if x == a else x for x in picks[s]]; nw = [a if x == b else x for x in picks[w]]
                ps = pred[s] + tovr(ns) - tovr(picks[s]); pw = pred[w] + tovr(nw) - tovr(picks[w])
                opts.append((abs(ps - target) + abs(pw - target), a, b, ps, pw))
        if not opts: break
        cost, a, b, ps, pw = min(opts)
        if cost >= abs(pred[s] - target) + abs(pred[w] - target): break
        picks[s][picks[s].index(a)] = b; picks[w][picks[w].index(b)] = a; pred[s], pred[w] = ps, pw
        print(f"   swap {s} {LOT[a]['n']} <-> {w} {LOT[b]['n']}", flush=True)
spread, picks, wins, marg = best
print(f"\nkept the roster set with AI spread {spread:.1f}: " + '  '.join(f"{t} {wins[t]:.1f}w {marg[t]:+.1f}" for t in sorted(wins, key=lambda t: -marg[t])))
# contracts for AI players: salary by board rank within the team, $88M a team; length by age
for t in AI:
    ls = sorted((LOT[i] for i in picks[t]), key=lambda l: l['rk']); w = [l['rk'] ** -0.6 for l in ls]
    sal = [max(1, round(88 * x / sum(w))) for x in w]
    while sum(sal) > 88: sal[sal.index(max(sal))] -= 1
    for l, s in zip(ls, sal): assigned.append(dict(team=t, pid=l['id'], sal=s, yrs=5 if l['age'] <= 23 else 4 if l['age'] <= 26 else 3 if l['age'] <= 29 else 2 if l['age'] <= 33 else 1))
    print(t, ' '.join(f"{p}:{sum(1 for l in ls if l['pos'] == p)}" for p in POS), '|', ', '.join(f"{l['n']} ${s}M" for l, s in zip(ls, sal)))
json.dump(dict(assigned=assigned, wins=wins, margin=marg), open(os.path.join(ROOT, 'tools/assigned.json'), 'w'), ensure_ascii=False, indent=1)
