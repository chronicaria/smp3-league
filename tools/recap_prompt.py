"""Print the prompt + facts an AI needs to write one game day's recap for the home page.
usage: python3 tools/recap_prompt.py [game_no]  ->  paste the output into Claude/ChatGPT, save its JSON reply into
site/data/recaps.json under the game number: {"18": {"headline": ..., "dek": ..., "games": [{"gid": 85, "text": ...}, ...]}}"""
import json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = json.load(open(os.path.join(ROOT, 'site/data/league.json')))
C = {c: i + 1 for i, c in enumerate(D['cols'])}; P = {p['pid']: p for p in D['players']}; T = D['teams']
day = int(sys.argv[1]) if len(sys.argv) > 1 else max(g['day'] for g in D['games'])
rec = {t['tid']: [0, 0] for t in T}; streak = {t['tid']: [] for t in T}
for g in D['games']:
    if g['day'] > day: continue
    for me, op in ((g['home'], g['away']), (g['away'], g['home'])):
        w = me['pts'] > op['pts']; rec[me['tid']][0 if w else 1] += 1; streak[me['tid']].append('W' if w else 'L')
def strk(tid):
    s = streak[tid]; n = 0
    for x in reversed(s):
        if x != s[-1]: break
        n += 1
    return f"{s[-1]}{n}"
name = lambda tid: f"{T[tid]['region']} {T[tid]['name']}"
pd = {t['tid']: 0 for t in T}; pd_prev = dict(pd); rec_prev = {t['tid']: [0, 0] for t in T}
for g in D['games']:
    if g['day'] > day: continue
    for me, op in ((g['home'], g['away']), (g['away'], g['home'])):
        pd[me['tid']] += me['pts'] - op['pts']
        if g['day'] < day: pd_prev[me['tid']] += me['pts'] - op['pts']; rec_prev[me['tid']][0 if me['pts'] > op['pts'] else 1] += 1
order = sorted(rec, key=lambda t: (-rec[t][0] / max(1, sum(rec[t])), -pd[t]))
before = sorted(rec, key=lambda t: (-rec_prev[t][0] / max(1, sum(rec_prev[t])), -pd_prev[t]))
seed = lambda t: order.index(t) + 1
print(f"""You are the beat writer for the SMP League, a ten-team fantasy basketball league. Write the recap for Game {day} of 36.

Rules:
- You are a newspaper columnist who finds this league slightly ridiculous and loves it. Be funny: dry jabs at teams
  that are losing, players who shot 5-for-19, a star with zero assists, a 10 seed that needs a miracle. Team names are
  fair game (Platypuses, Gooners, Pigeons). Aim for one real joke per paragraph, built from the facts below, in the
  deadpan of a reporter who has seen too much. Vary how paragraphs open; never the same shape twice in a row.
- Stay accurate: every number must come from the facts. No exclamation marks, no invented quotes, no cliches
  ("statement win", "sends a message"), nothing mean about a player as a person, only about how he played.
- Talk in seeds. Say who moved into the 3 seed, who dropped to the 8 seed, who is a game out of the 4 seed. The top four
  seeds make the playoffs, so the 4 seed line is the one that matters. Each team line below shows its seed before and after.
- One headline (max 10 words) about the day's biggest story and one sentence under it (the dek).
- Then one paragraph per game, 60-95 words: who won, the score, who decided it with his line, and what it did to the seeds.
  Put the most important game first. Use only the facts below.
- Never mention ratings, real-life leagues or real-life teams. These are SMP League teams.
- Reply with JSON only: {{"headline": "...", "dek": "...", "games": [{{"gid": <id>, "text": "..."}}, ...]}}.

Standings after Game {day} (top four make the playoffs):""")
for i, t in enumerate(order): print(f"  {i + 1} seed: {name(t)} {rec[t][0]}-{rec[t][1]} ({strk(t)}), was the {before.index(t) + 1} seed before today")
print("\nGames:")
for g in [g for g in D['games'] if g['day'] == day]:
    a, h = g['away'], g['home']; tl = g['tl']
    big_h = max([0] + [x[2] - x[1] for x in tl]); big_a = max([0] + [x[1] - x[2] for x in tl])
    ch = 0; prev = 0
    for x in tl:
        lead = x[2] - x[1]
        if lead and prev and (lead > 0) != (prev > 0): ch += 1
        if lead: prev = lead
    q3 = next((x for x in reversed(tl) if x[0] <= 2160), [0, 0, 0])
    print(f"\ngid {g['gid']}: {name(a['tid'])} {a['pts']} at {name(h['tid'])} {h['pts']}{' (OT)' if g['ot'] else ''}")
    print(f"  by quarter: {T[a['tid']]['abbrev']} {a['q']}, {T[h['tid']]['abbrev']} {h['q']}; after three quarters {T[a['tid']]['abbrev']} {q3[1]}, {T[h['tid']]['abbrev']} {q3[2]}")
    print(f"  largest leads: {T[a['tid']]['abbrev']} {big_a}, {T[h['tid']]['abbrev']} {big_h}; lead changes {ch}")
    for s in (a, h):
        top = sorted(s['box'], key=lambda r: -r[C['pts']])[:3]
        print(f"  {T[s['tid']]['abbrev']} ({rec[s['tid']][0]}-{rec[s['tid']][1]}, {strk(s['tid'])}): " + '; '.join(
            f"{P[r[0]]['name']} {r[C['pts']]} pts, {r[C['orb']] + r[C['drb']]} reb, {r[C['ast']]} ast, {r[C['fg']]}-{r[C['fga']]} FG, {r[C['tp']]}-{r[C['tpa']]} 3PT" for r in top)
              + (f" | out: {', '.join(P[x[0]]['name'] + ' (' + x[1] + ')' for x in s['dnp'] if x[1] != chr(67) + 'oach' + chr(39) + 's Decision')}" if any(x[1] != "Coach's Decision" for x in s['dnp']) else ''))
