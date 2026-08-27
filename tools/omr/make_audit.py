"""
Build a FORCED-RESPONSE audit: a short list of individually indexed events, each of which
must come back with its own evidence row. No exceptions-only reporting.

    python make_audit.py 30 --n 16 --out /tmp/a30.txt --key /tmp/a30.key.json

Why this shape, and why the previous one failed:

An exceptions-only verification lets a reader silently skip whatever it likes while
reporting a large "events examined" count. On 2026-08-19 a calibrated exceptions-only run
on hymn 30 claimed 244 events examined, reported four evidence-backed exceptions about
accidentals, and missed all three planted soprano errors — 0/3 recall. The four exceptions
were real work; the 244 was not a measurement of anything.

Forcing one row per named event removes the hiding place. A skipped row is visible. A
wrong row is scorable. And with canaries mixed in, every run states its own sensitivity
before any of its approvals are believed.

Keep n small (12-20). The point is a measured sample, not coverage.
"""
import argparse, json, os, re, subprocess, sys, random

HERE = os.path.dirname(os.path.abspath(__file__))
STEP = ['C', 'D', 'E', 'F', 'G', 'A', 'B']


def shift(note, steps):
    """Diatonic neighbour, accidental dropped — a carried accidental can produce a
    spelling the key forbids, which a reader rejects from theory without looking."""
    m = re.match(r'^([A-G])([#b]?)(\d)$', note)
    if not m:
        return None
    i = STEP.index(m.group(1)) + steps
    return f"{STEP[i % 7]}{int(m.group(3)) + i // 7}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('hymn', type=int)
    ap.add_argument('--n', type=int, default=16)
    ap.add_argument('--canaries', type=int, default=3)
    ap.add_argument('--out', required=True)
    ap.add_argument('--key', required=True)
    ap.add_argument('--seed', type=int, default=None)
    ap.add_argument('--crops', action='store_true',
                    help='point at the per-system crops on disk rather than telling the '
                         'reader to attach full pages. Use this when the reader can open '
                         'files itself: the crops are single isolated staves upscaled '
                         '1.7x, which is a much easier read than a whole page at once, '
                         'and it is the input Fable gets — so the two readers are then '
                         'actually comparable.')
    a = ap.parse_args()
    rng = random.Random(a.seed if a.seed is not None else a.hymn * 104729)

    src = os.path.join(HERE, 'hymns', 'pending', f'{a.hymn}.txt')
    meta = dict(re.findall(r'^(\w+):\s*(.*)$', open(src).read(), re.M))
    claim = subprocess.run([sys.executable, os.path.join(HERE, 'show_measures.py'),
                            src, '--staff', 'all', '--claim'],
                           capture_output=True, text=True, check=True).stdout

    events, voice = [], None
    for l in claim.splitlines():
        if l.strip() in ('SOPRANO', 'ALTO', 'TENOR', 'BASS'):
            voice = l.strip(); continue
        m = re.match(r'^(pickup|m\d+): (.*)$', l)
        if not m:
            continue
        for ei, ev in enumerate([x.strip() for x in m.group(2).split(',')], 1):
            p, _, d = ev.partition('=')
            if p == 'REST':
                continue
            events.append(dict(voice=voice, measure=m.group(1), event=ei, pitch=p, dur=d))

    sop = [e for e in events if e['voice'] == 'SOPRANO']
    rest = [e for e in events if e['voice'] != 'SOPRANO']
    n_sop = min(len(sop), int(a.n * 0.6))
    sample = rng.sample(sop, n_sop) + rng.sample(rest, min(len(rest), a.n - n_sop))
    rng.shuffle(sample)

    can_idx = set(rng.sample(range(len(sample)), min(a.canaries, len(sample))))
    rows, key = [], {'hymn': a.hymn, 'rows': []}
    for i, e in enumerate(sample, 1):
        asked, truth, is_can = e['pitch'], e['pitch'], (i - 1) in can_idx
        if is_can:
            alt = shift(e['pitch'], rng.choice([-2, -1, 1, 2]))
            if alt and alt != e['pitch']:
                asked = alt
            else:
                is_can = False
        rows.append(f"{i:>3}. {e['voice'][:4]:<4} {e['measure']:>4} event {e['event']}"
                    f"   claim: {asked}={e['dur']}")
        key['rows'].append(dict(n=i, voice=e['voice'], measure=e['measure'], event=e['event'],
                                asked=asked, truth=truth, canary=is_can))

    idx = json.load(open(os.path.join(HERE, '..', '..', 'public', 'hymn_index.json')))
    pages = next(h for h in idx if int(h['id']) == a.hymn)['images']
    if a.crops:
        import glob as _g
        arch = os.path.expanduser('~/Downloads/ZionsHymns-Archive')
        d = _g.glob(f'{arch}/hymn-{a.hymn:03d}-*')[0]
        k = lambda p: int(re.search(r'sys(\d+)', p).group(1))
        tre = sorted(_g.glob(f'{d}/crops/hymn{a.hymn}-treble-sys*.png'), key=k)
        bas = sorted(_g.glob(f'{d}/crops/hymn{a.hymn}-bass-sys*.png'), key=k)
        srcline = ("READ THESE IMAGE FILES FROM DISK — per-system crops, in order. Each is a\n"
                   "single staff, upscaled, which is far easier to read than a whole page.\n\n"
                   "TREBLE staff (soprano = stems up, alto = stems down):\n  "
                   + "\n  ".join(tre) +
                   "\n\nBASS staff (tenor = stems up, bass = stems down):\n  "
                   + "\n  ".join(bas) +
                   f"\n\n(Full pages, if you want them for context: "
                   + ", ".join(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                            '..', '..', 'public', 'sheet_music', p) for p in pages) + ")")
    else:
        srcline = "ATTACH: " + ", ".join(pages)
    beats = int(meta['time'].split('/')[0])
    unit = {'2': 'HALF', '4': 'QUARTER', '8': 'EIGHTH'}[meta['time'].split('/')[1]]

    open(a.out, 'w').write(f"""Check {len(rows)} specific notes against the printed page. You must return ONE ROW FOR EVERY numbered item below — all {len(rows)}, in order, including the ones that turn out to be correct. A missing row invalidates the whole run.

Some of these claims are deliberately wrong. I know which. Do not assume the list is right, and do not invent disagreements — both errors count against you.

HYMN {a.hymn}, "{meta['title']}" — Zion's Hymns (2021), Aiken 7-shape.
Key {meta['key']}, meter {meta['time']} (one beat = one {unit} note; a full bar is {beats} beats).
{srcline}
Voices: soprano = treble staff stems up · alto = treble stems down · tenor = bass staff stems up · bass = bass stems down.
Measure numbers are 1-based and continuous across systems. Event numbers count noteheads left to right within that measure for that voice.

THE EVENTS TO CHECK:

""" + "\n".join(rows) + f"""

RETURN EXACTLY THIS, one line per item, all {len(rows)}:

<n>. AGREE   — shape <Aiken shape>, <staff position>, stem <up/down>, <duration>
<n>. DIFFERS — page shows <pitch>=<duration>; shape <Aiken shape>, <staff position>, stem <up/down>
<n>. UNCLEAR — <what is ambiguous and why>

Every row needs the observed shape and staff position, whether it agrees or not. "AGREE" with no observation is not usable — it is the thing I am trying to rule out.
""")
    json.dump(key, open(a.key, 'w'), indent=1)
    n_can = sum(1 for r in key['rows'] if r['canary'])
    print(f"wrote {a.out}  ({len(rows)} events, {n_can} canaries)")
    print(f"wrote {a.key}")
    for r in key['rows']:
        if r['canary']:
            print(f"   canary #{r['n']}: {r['voice']} {r['measure']} ev{r['event']} "
                  f"asked {r['asked']}, truth {r['truth']}")


if __name__ == '__main__':
    sys.exit(main())
