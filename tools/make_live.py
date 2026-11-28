"""Stage game day N to be revealed live on the site instead of all at once.
usage: python3 tools/make_live.py N "2026-11-24T21:00:00-05:00"
needs  data/day{N-1}.json and data/day{N}.json (engine exports, each with -pbp and -lineups; day N also -raw, from RAW=1)

Writes site/data/league.json as the league stood BEFORE day N, takes day N's recap out of recaps.json, and writes
site/data/live.json: the finished league after day N, the recap, and for every game of the day a stream of stat events
[game seconds, player id, stat index, amount] rebuilt from the engine's play-by-play. The page plays that stream on a
real clock from the start time. live.json is lightly scrambled (XOR + base64) so results are not readable at a glance;
it is not secret from anyone who reads the page's code."""
import base64, json, os, subprocess, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
N, START = int(sys.argv[1]), sys.argv[2]
def build(day):
    subprocess.run([sys.executable, os.path.join(ROOT, 'tools/make_site_data.py'), os.path.join(ROOT, f'data/day{day}.json')], check=True, stdout=subprocess.DEVNULL)
    return json.load(open(os.path.join(ROOT, 'site/data/league.json'))), json.load(open(os.path.join(ROOT, 'site/data/lineups.json')))
after, lineups = build(N)
before, _ = build(N - 1)   # leaves league.json and lineups.json as they stood before the day
assert not any(g['day'] == N for g in before['games']) and any(g['day'] == N for g in after['games'])
raw = json.load(open(os.path.join(ROOT, f'data/day{N}-raw.json')))
COLS = after['cols']; IDX = {k: i for i, k in enumerate(COLS)}
ev, pbp = {}, {}
NAME = {p['pid']: p['name'] for p in after['players']}
SHOT = dict(AtRim='at the rim', LowPost='in the post', MidRange='from mid-range', Tp='a three', PutBack='a putback')
def play(e):
    """One line of play-by-play for an engine event, or None for events the feed skips."""
    t, n = e['type'], (lambda k: NAME.get(e.get(k), 'A player'))
    for made, word in (('fgAtRim', 'scores at the rim'), ('fgLowPost', 'scores in the post'), ('fgMidRange', 'hits from mid-range'), ('tp', 'makes a three'), ('fgPutBack', 'scores on the putback')):
        if t in (made, made + 'AndOne'):
            return n('pid') + ' ' + word + (f" (assist {n('pidAst')})" if e.get('pidAst') is not None else '') + (', and is fouled' if t.endswith('AndOne') else '')
    if t.startswith('miss') and t != 'missFt': return f"{n('pid')} misses {SHOT.get(t[4:], 'a shot')}"
    if t.startswith('blk'): return f"{n('pid')} blocks a shot {'from deep' if t == 'blkTp' else SHOT.get(t[3:], '')}".rstrip()
    if t == 'ft': return f"{n('pid')} makes a free throw"
    if t == 'missFt': return f"{n('pid')} misses a free throw"
    if t == 'orb': return f"{n('pid')} grabs the offensive rebound"
    if t == 'drb': return f"{n('pid')} rebounds"
    if t == 'stl': return f"{n('pid')} steals it from {n('pidTov')}"
    if t == 'tov': return f"{n('pid')} turns it over" + (' out of bounds' if e.get('outOfBounds') else '')
    if t in ('pfFG', 'pfTP', 'pfBonus', 'pfAndOne'): return f"Foul on {n('pid')}; {n('pidShooting')} to the line" if t != 'pfAndOne' else None
    if t == 'pfNonShooting': return f"Foul on {n('pid')}"
    if t == 'foulOut': return f"{n('pid')} fouls out"
    if t == 'sub': return ', '.join(NAME.get(x, 'A player') for x in e['pids']) + ' in for ' + ', '.join(NAME.get(x, 'A player') for x in e['pidsOff'])
    if t == 'injury': return f"{n('pid')} is hurt and leaves the game"
    if t == 'timeout': return 'Timeout'
    if t == 'jumpBall': return f"{n('pid')} wins the opening tip"
    return None
PTS = lambda t: 1 if t == 'ft' else 3 if t.startswith('tp') else 2 if t.startswith('fg') and not t.startswith('fga') else 0
os.makedirs(os.path.join(ROOT, 'site/data/pbp'), exist_ok=True)
for g in after['games']:   # the day being staged goes into live.json; finished days get a play-by-play file each
    period, clock, on, out = 1, 720.0, [set(), set()], []
    feed, sc = [], [0, 0]   # play-by-play lines [game seconds, side (0 home, 1 away, -1 neither), text, away score, home score]
    acc = {}   # (pid, stat index) -> pending amount, for minutes and plus-minus, flushed every 20 game seconds
    last = 0.0
    def sec():
        end = period * 720 if period <= 4 else 2880 + (period - 4) * 300
        el = (period - 1) * 720 + (720 - clock) if period <= 4 else 2880 + (period - 5) * 300 + (300 - clock)
        return round(max(0.0, min(el, end - 0.1)), 1)
    def flush(s):
        for (pid, k), v in sorted(acc.items()):
            if abs(v) > 1e-9: out.append([s, pid, k, round(v, 4)])
        acc.clear()
    for e in raw[str(g['gid'])]:
        if e['type'] in ('period', 'overtime'): period = e.get('period', period + 1); clock = 720.0 if period <= 4 else 300.0
        if 'clock' in e: clock = e['clock']
        s = sec()
        if s - last >= 20: flush(last); last = s
        if e['type'] in ('period', 'overtime') and period > 1: feed.append([round((period - 1) * 720 - 0.1 if period <= 5 else 2880 + (period - 5) * 300 - 0.1, 1), -1, 'End of ' + (['the first quarter', 'the second quarter', 'the third quarter', 'regulation'][period - 2] if period <= 5 else 'overtime')])
        line = play(e)
        if line:
            got = PTS(e['type'])
            if got: sc[e['t']] += got
            feed.append([s, e.get('t', -1), line] + ([sc[1], sc[0]] if got else []))
        if e['type'] == 'sub':
            on[e['t']] -= set(e['pidsOff']); on[e['t']] |= set(e['pids'])
        elif e['type'] == 'stat' and e.get('pid') is not None:
            pid, k, amt = e['pid'], e['s'], e['amt']
            if k == 'gs': on[e['t']].add(pid); out.append([0.0, pid, IDX['gs'], 1])
            elif k == 'min': acc[(pid, IDX['min'])] = acc.get((pid, IDX['min']), 0) + amt
            elif k in IDX:
                out.append([s, pid, IDX[k], amt])
                if k == 'pts':
                    for p in on[e['t']]: acc[(p, IDX['pm'])] = acc.get((p, IDX['pm']), 0) + amt
                    for p in on[1 - e['t']]: acc[(p, IDX['pm'])] = acc.get((p, IDX['pm']), 0) - amt
    flush(sec())
    out.sort(key=lambda x: x[0])
    # check: the stream must rebuild the final box score exactly
    tot = {}
    for s, pid, k, amt in out: tot[(pid, k)] = tot.get((pid, k), 0) + amt
    for side in (g['home'], g['away']):
        for r in side['box']:
            for k, i in IDX.items():
                want, got = r[i + 1], tot.get((r[0], i), 0)
                assert abs(want - got) <= (0.06 if k == 'min' else 1e-6), (g['gid'], r[0], k, want, got)
    assert sum(amt for s, pid, k, amt in out if k == IDX['pts']) == g['home']['pts'] + g['away']['pts']
    assert sc == [g['home']['pts'], g['away']['pts']], (g['gid'], sc)
    feed.append([2880.0 + 300 * g['ot'], -1, 'Final'])
    if g['day'] == N: ev[g['gid']] = out; pbp[g['gid']] = feed
    elif g['day'] < int(os.environ.get('PBP_BEFORE', N)):   # PBP_BEFORE (set by make_slate.py): no readable file for a day that is staged but not yet played
        json.dump(feed, open(os.path.join(ROOT, f"site/data/pbp/{g['gid']}.json"), 'w'), ensure_ascii=False, separators=(',', ':'))
p = os.path.join(ROOT, 'site/data/recaps.json'); R = json.load(open(p)); recap = R.pop(str(N), None)
json.dump(R, open(p, 'w'), ensure_ascii=False, indent=1)
old = os.path.join(ROOT, 'site/data/live.json')
if recap is None and os.path.exists(old):   # re-staging the same day: keep the recap already staged
    try:
        b = base64.b64decode(open(old).read()); x = json.loads(bytes(c ^ b'smp3'[i % 4] for i, c in enumerate(b)))
        if x.get('day') == N: recap = x.get('recap')
    except Exception: pass
blob = json.dumps(dict(day=N, start=START, after=after, lineups=lineups, recap=recap, ev=ev, pbp=pbp), separators=(',', ':'), ensure_ascii=False).encode()
open(old, 'w').write(base64.b64encode(bytes(c ^ b'smp3'[i % 4] for i, c in enumerate(blob))).decode())
print(f"day {N} staged for {START}: {len(ev)} games, {sum(len(v) for v in ev.values())} events, {sum(len(v) for v in pbp.values())} plays, live.json {os.path.getsize(old) // 1024} KB, recap {'kept' if recap else 'MISSING'}; league.json is through Game {N - 1}")
