"""Preseason strength for the standings projections: each team's average scoring margin over simulated seasons with
the current rosters. usage: python3 tools/preseason_prior.py [seasons=32]  ->  engine/preseason.json {ABBREV: margin}
Runs only on Andrew's Mac (private engine + ratings). The site blends this with real results: it counts for eight games."""
import json, os, statistics, subprocess, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SECRET = os.path.expanduser('~/Code/rome-kits/Knowledge/Sports/Basketball/SMP III/pool/secret/smp3_ratings.json')
NODE, ZENGM = os.path.expanduser('~/.local/node24/bin/node'), os.path.expanduser('~/Code/zengm-smp3')
N, PAR = int(sys.argv[1]) if len(sys.argv) > 1 else 32, 8
outs, procs = [], []
for k in range(N):
    o = os.path.join(ROOT, f'data/cal/pre-{k}.json'); outs.append(o)
    procs.append(subprocess.Popen([NODE, 'engine/sim_half.mjs', ZENGM, SECRET, o, '36'], cwd=ROOT, env={**os.environ, 'SEED': str(5000 + k), 'PBP': '0', 'ROSTERS': 'engine/rosters.json'}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
    if len(procs) == PAR or k == N - 1:
        for p in procs:
            if p.wait() != 0: raise SystemExit('a simulation failed')
        procs = []
marg, wins = {}, {}
for o in outs:
    d = json.load(open(o)); T = {t['tid']: t['abbrev'] for t in d['teams']}; m = dict.fromkeys(T.values(), 0); w = dict.fromkeys(T.values(), 0)
    for g in d['games']:
        a, b = g['teams']
        for me, op in ((a, b), (b, a)): m[T[me['tid']]] += me['pts'] - op['pts']; w[T[me['tid']]] += me['pts'] > op['pts']
    for t in m: marg.setdefault(t, []).append(m[t] / 36); wins.setdefault(t, []).append(w[t])
out = {t: round(statistics.mean(v), 2) for t, v in marg.items()}
json.dump(out, open(os.path.join(ROOT, 'engine/preseason.json'), 'w'), indent=1)
for t in sorted(out, key=lambda t: -out[t]): print(f"{t} {statistics.mean(wins[t]):5.1f} wins  {out[t]:+.1f}")
