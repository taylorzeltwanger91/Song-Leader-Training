"""
Generate a CALIBRATED verification prompt: the claim carries hidden seeded errors
("canaries") so each run measures its own sensitivity before its approvals are trusted.

    python make_canary_prompt.py 30 --out /tmp/gpt30.txt --key /tmp/gpt30.key.json

Why: a verification pass that is shown the proposed transcription is NOT independent —
it is anchored toward agreement, and "all systems OK" is then unfalsifiable. Seeding a
few deliberate errors per run turns every run into its own instrument check. A run that
misses a canary is REJECTED, however clean the rest of its report looks.

The answer key is written to a SEPARATE file. It must never be pasted with the prompt.

Canary design rules (deliberately hard, not gimmes):
  * plausible substitutions only — a step or a third, the kind of confusion a real reader
    makes, never an absurd leap that theory alone would reject
  * placed on SOPRANO first (the part the app teaches), then on stacked columns, which is
    where both real errors found on 2026-08-18 actually lived
  * neighbouring untouched events are recorded as CONTROLS: an exception reported on one
    of those is a false positive, which measures precision as well as recall
"""
import argparse, json, os, re, subprocess, sys, glob, random

HERE = os.path.dirname(os.path.abspath(__file__))
ARCHIVE = os.path.expanduser('~/Downloads/ZionsHymns-Archive')
STEP = ['C','D','E','F','G','A','B']


def shift(note, steps):
    """Move a note by diatonic steps, DROPPING any accidental.

    Carrying the accidental produces spellings like E#5 in G major, which a reader can
    reject from theory alone without ever looking at the page — a canary that tests the
    wrong thing. A plain diatonic neighbour is the substitution a real misread makes.
    """
    m = re.match(r'^([A-G])([#b]?)(\d)$', note)
    if not m: return None
    i = STEP.index(m.group(1)) + steps
    octv = int(m.group(3)) + i // 7
    return f"{STEP[i % 7]}{octv}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('hymn', type=int)
    ap.add_argument('--out', required=True); ap.add_argument('--key', required=True)
    ap.add_argument('--canaries', type=int, default=3)
    ap.add_argument('--seed', type=int, default=None)
    a = ap.parse_args()
    rng = random.Random(a.seed if a.seed is not None else a.hymn * 7919)

    src = os.path.join(HERE, 'hymns', 'pending', f'{a.hymn}.txt')
    meta = dict(re.findall(r'^(\w+):\s*(.*)$', open(src).read(), re.M))
    claim = subprocess.run([sys.executable, os.path.join(HERE, 'show_measures.py'),
                            src, '--staff', 'all', '--claim'],
                           capture_output=True, text=True, check=True).stdout.strip()

    # parse claim into (voice, measure-label, event-index, pitch, dur)
    events, voice = [], None
    lines = claim.splitlines()
    for li, l in enumerate(lines):
        if l.strip() in ('SOPRANO', 'ALTO', 'TENOR', 'BASS'):
            voice = l.strip(); continue
        m = re.match(r'^(pickup|m\d+): (.*)$', l)
        if not m: continue
        for ei, ev in enumerate([x.strip() for x in m.group(2).split(',')]):
            p, _, d = ev.partition('=')
            if p == 'REST': continue
            events.append(dict(line=li, voice=voice, measure=m.group(1),
                               event=ei + 1, pitch=p, dur=d))

    # prefer soprano; then whichever voice, avoiding first/last bars
    sop = [e for e in events if e['voice'] == 'SOPRANO' and e['measure'] != 'pickup']
    other = [e for e in events if e['voice'] != 'SOPRANO' and e['measure'] != 'pickup']
    pool = (rng.sample(sop, min(len(sop), a.canaries)) +
            rng.sample(other, max(0, a.canaries - min(len(sop), a.canaries) + 1)))
    picked, used_lines = [], set()
    for e in pool:
        if e['line'] in used_lines: continue
        alt = shift(e['pitch'], rng.choice([-2, -1, 1, 2]))
        if not alt or alt == e['pitch']: continue
        picked.append((e, alt)); used_lines.add(e['line'])
        if len(picked) == a.canaries: break

    out_lines = list(lines)
    key = {'hymn': a.hymn, 'canaries': [], 'controls': []}
    for e, alt in picked:
        l = out_lines[e['line']]
        head, _, body = l.partition(': ')
        evs = [x.strip() for x in body.split(',')]
        evs[e['event'] - 1] = f"{alt}={e['dur']}"
        out_lines[e['line']] = head + ': ' + ', '.join(evs)
        key['canaries'].append(dict(voice=e['voice'], measure=e['measure'],
                                    event=e['event'], truth=e['pitch'], seeded=alt))
        # controls: the untouched events in the SAME measure
        for ei, ev in enumerate([x.strip() for x in body.split(',')], 1):
            if ei == e['event']: continue
            key['controls'].append(dict(voice=e['voice'], measure=e['measure'],
                                        event=ei, truth=ev.split('=')[0]))

    idx = json.load(open(os.path.join(HERE, '..', '..', 'public', 'hymn_index.json')))
    pages = next(h for h in idx if int(h['id']) == a.hymn)['images']
    sheet = os.path.join(HERE, '..', '..', 'public', 'sheet_music')

    beats = int(meta['time'].split('/')[0])
    unit = {'2': 'HALF NOTE', '4': 'QUARTER NOTE', '8': 'EIGHTH NOTE'}[meta['time'].split('/')[1]]
    open(a.out, 'w').write(f"""You are checking a proposed transcription against the printed page of a shape-note hymn. Report ONLY what the page contradicts.

IMPORTANT — read this first. The transcription below is NOT trustworthy. It is a draft, and I have deliberately planted a small number of errors in it to check that you are reading the page rather than agreeing with me. If you return "everything matches" I will assume you did not look, and the run is discarded. Equally, do not invent disagreements to seem thorough: I know which events are correct, and false alarms count against you just as heavily as misses.

HYMN {a.hymn}, "{meta['title']}" — Zion's Hymns (2021), Aiken 7-shape.
Key {meta['key']}. Meter {meta['time']} — one beat = ONE {unit}; a full bar is {beats} beats.
ATTACH THESE PAGES: {', '.join(pages)}

Voices: soprano = treble staff, stems up. Alto = treble staff, stems down. Tenor = bass staff, stems up. Bass = bass staff, stems down.

WHAT TO CHECK, in this priority order:
1. EVERY soprano note. This is the part the app teaches; it matters most.
2. EVERY column where two noteheads are stacked, share a stem, or touch — on both staves. Both errors found in this corpus so far were here: in each case a voice was given the OTHER voice's notehead.
3. Octave placement anywhere a note sits on or near a ledger line.

FOR EVERY CONTRADICTION YOU REPORT, you must state all five:
   page and system · measure and event number · what the claim says ·
   what you observe (Aiken SHAPE, staff POSITION, STEM direction, and DURATION) ·
   why the shape and position agree with your reading
A contradiction reported without that evidence will be treated as a guess and discarded.

REPORT FORMAT — exceptions only, one per line. If a voice or a system has no contradictions, do not mention it at all. End with a single line: "events examined: <number>".

THE CLAIM TO CHECK (measure numbers are 1-based and continuous):

""" + "\n".join(out_lines) + """

Remember: some of the above is deliberately wrong. Find it by looking at the page.
""")
    json.dump(key, open(a.key, 'w'), indent=1)
    print(f"wrote {a.out}")
    print(f"wrote {a.key}  ({len(key['canaries'])} canaries, {len(key['controls'])} controls)")
    for c in key['canaries']:
        print(f"   canary: {c['voice']} {c['measure']} ev{c['event']}  {c['truth']} -> {c['seeded']}")


if __name__ == '__main__':
    sys.exit(main())
