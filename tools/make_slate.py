"""Schedule several game days to play live, each at its own start time.
usage: python3 tools/make_slate.py 5 "2026-11-27T20:30:00-05:00" 6 "2026-11-28T18:00:00-05:00" 7 "2026-11-29T18:00:00-05:00"
needs  data/day{first-1}.json ... data/day{last}.json (each with -pbp, -lineups; the staged days also -raw) and every
       staged day's recap in site/data/recaps.json

Runs tools/make_live.py for each day, last to first, so that league.json ends as the league before the first day and
live.json holds the first day (for pages still running the one-day code). Writes site/data/live-N.json per day (the same
content plus every staged recap up to that day) and site/data/slate.json listing the days with their start and end.
The page works out where it is: it jumps past days already over, plays the current one, and waits for the next."""
import base64, datetime, json, os, subprocess, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEY = b'smp3'
veil = lambda obj: base64.b64encode(bytes(c ^ KEY[i % 4] for i, c in enumerate(json.dumps(obj, separators=(',', ':'), ensure_ascii=False).encode()))).decode()
unveil = lambda txt: json.loads(bytes(c ^ KEY[i % 4] for i, c in enumerate(base64.b64decode(txt))))
pairs = [(int(sys.argv[i]), sys.argv[i + 1]) for i in range(1, len(sys.argv), 2)]
assert pairs == sorted(pairs) and len(pairs) >= 1
first, store = pairs[0][0], {}
for N, start in reversed(pairs):
    subprocess.run([sys.executable, os.path.join(ROOT, 'tools/make_live.py'), str(N), start], check=True, env={**os.environ, 'PBP_BEFORE': str(first)})
    store[N] = unveil(open(os.path.join(ROOT, 'site/data/live.json')).read())
    assert store[N]['recap'], f'no recap for day {N}'
recaps, days = {}, []
for N, start in pairs:
    x = store[N]; recaps[str(N)] = x['recap']; x['recaps'] = dict(recaps)
    ot = max(g['ot'] for g in x['after']['games'] if g['day'] == N)
    end = datetime.datetime.fromisoformat(start) + datetime.timedelta(seconds=7200 + 510 * ot)
    days.append(dict(day=N, start=start, end=end.isoformat()))
    open(os.path.join(ROOT, f'site/data/live-{N}.json'), 'w').write(veil(x))
open(os.path.join(ROOT, 'site/data/slate.json'), 'w').write(veil(dict(days=days)))
for d in days: print(f"day {d['day']}: {d['start']} to {d['end']}")
