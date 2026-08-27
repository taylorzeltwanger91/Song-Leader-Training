"""
Turn measure-grouped vision-read replies into the flat source `assemble.py` consumes.

    python parse_grouped.py 31 --treble reply-treble.txt --bass reply-bass.txt \
        --title "Jesus, Our Priest and King" --key Eb --time 4/2 -o hymns/pending/31.txt

The readers are asked for one line per measure with its own stated sum (see
`make_prompts.py` and the format lesson in `hymns/pending/README.md`): flat whole-voice
lists fail at roughly one voice in twelve, per-measure lines have not failed. That format
is only worth asking for if something checks it, which is what this does:

  * every measure's stated sum must equal the sum of the durations on that line;
  * all four voices must have the same number of measures;
  * the four voices must agree, bar for bar, on how long each bar is.

A file that fails any of these is not written. The third check is the one that catches a
dropped or over-counted measure — the hymn 6 failure mode — while it is still cheap to
re-read one staff, rather than after assembly.

Because the reader states the barlines explicitly, the per-bar lengths are emitted as the
`# measures:` header, so irregular bars (phrase cadences, split measures at system breaks)
tile correctly instead of being greedily normalised to the meter.
"""
import argparse
import re
import sys

# `C#5/1` (what the read prompt asks for) and `C#5=1` (what show_measures.py emits)
# are both accepted, so a reply can be round-tripped against rendered known-good data.
PAIR = re.compile(r'^\s*([A-Ga-g][#b]?\d|REST|R)\s*[/=]\s*([0-9.]+)\s*$', re.I)


def parse_reply(text):
    """-> {voice: [(measure_label, [(pitch,dur)...], stated_sum)]}, plus scalars seen."""
    voices, cur, meta = {}, None, {}
    for raw in text.splitlines():
        line = raw.rstrip()
        if not line.strip():
            continue
        m = re.match(r'^\s*(key|time|anacrusis)\s*:\s*(\S+)', line, re.I)
        if m and not line.lstrip().startswith('m'):
            meta.setdefault(m.group(1).lower(), m.group(2))
            continue
        # `soprano:` (read prompt) or a bare `SOPRANO` heading (show_measures)
        m = re.match(r'^(soprano|alto|tenor|bass)\s*:?\s*$', line.strip(), re.I)
        if m:
            cur = m.group(1).lower()
            voices[cur] = []
            continue
        m = re.match(r'^\s*(?:m(\d+)|(pickup))\s*:\s*(.+)$', line, re.I)
        if m and cur:
            label = 0 if m.group(2) else int(m.group(1))
            body, stated = m.group(3), None
            # `... | sum=4` (show_measures) or `... = 4` (the read prompt)
            if '|' in body:
                body, tail = body.split('|', 1)
                tail = tail.split('=')[-1]
            elif '=' in body and not PAIR.match(body.rsplit('=', 1)[0].split(',')[-1] + '=x'):
                body, tail = body.rsplit('=', 1)
            else:
                tail = None
            if tail is not None:
                try:
                    stated = float(tail.strip())
                except ValueError:
                    stated = None
            events = []
            for tok in body.split(','):
                tok = tok.strip()
                if not tok:
                    continue
                pm = PAIR.match(tok)
                if not pm:
                    raise SystemExit(f"unparseable event {tok!r} in {cur} m{label}")
                p = pm.group(1)
                if p.upper() in ('REST', 'R'):
                    p = 'REST'
                else:
                    # letter uppercase, accidental lowercase: `eb4`/`EB4` -> `Eb4`.
                    # assemble.py parses `[A-G][#b]*\d` case-sensitively and rejects `EB4`.
                    p = p[0].upper() + p[1:].replace('B', 'b').replace('#', '#')
                events.append((p, float(pm.group(2))))
            voices[cur].append((label, events, stated))
    return voices, meta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('hymn_id', type=int)
    ap.add_argument('--treble', required=True)
    ap.add_argument('--bass', required=True)
    ap.add_argument('--title', required=True)
    ap.add_argument('--key', required=True)
    ap.add_argument('--time', required=True)
    ap.add_argument('--bpm', default='120')
    ap.add_argument('--anacrusis', default=None)
    ap.add_argument('-o', '--out', required=True)
    a = ap.parse_args()

    voices, meta = {}, {}
    for path in (a.treble, a.bass):
        v, m = parse_reply(open(path).read())
        voices.update(v)
        for k, val in m.items():
            meta.setdefault(k, val)

    problems = []
    for name in ('soprano', 'alto', 'tenor', 'bass'):
        if name not in voices:
            problems.append(f'{name}: MISSING from the replies')
    if problems:
        print('\n'.join(problems), file=sys.stderr)
        return 1

    # 1. stated sum vs real sum, per measure
    for name, bars in voices.items():
        for label, events, stated in bars:
            real = round(sum(d for _, d in events), 4)
            if stated is not None and abs(real - stated) > 1e-6:
                problems.append(f'{name} m{label}: states {stated} but the notes total {real}')

    # 2. same number of measures across voices
    counts = {n: len(b) for n, b in voices.items()}
    if len(set(counts.values())) != 1:
        problems.append(f'measure counts disagree: {counts}')

    # 3. voices agree bar for bar on bar length
    if len(set(counts.values())) == 1:
        n_bars = next(iter(counts.values()))
        lengths = []
        for i in range(n_bars):
            per = {n: round(sum(d for _, d in voices[n][i][1]), 4) for n in voices}
            if len(set(per.values())) != 1:
                lab = voices['soprano'][i][0]
                problems.append(f'bar {lab} (index {i}): voices disagree on length: {per}')
            lengths.append(next(iter(per.values())))
    if problems:
        print('NOT WRITTEN — fix these first:\n  ' + '\n  '.join(problems), file=sys.stderr)
        return 1

    anac = a.anacrusis if a.anacrusis is not None else meta.get('anacrusis', '0')
    beats = int(a.time.split('/')[0])
    irregular = [x for x in lengths if abs(x - beats) > 1e-6]
    # a leading pickup is described by `anacrusis:`, not by the measures list
    body = lengths[1:] if (float(anac) > 0 and lengths and abs(lengths[0] - float(anac)) < 1e-6) else lengths

    out = [f'# hymn {a.hymn_id} — {a.title}',
           '# STATUS: SINGLE READER (Fable) ONLY — arithmetic-verified, NOT dual-verified.',
           '# Do NOT assemble into public/hymn_satb/ until a second independent read agrees.',
           f'id: {a.hymn_id}', f'title: {a.title}', f'key: {a.key}', f'time: {a.time}',
           f'bpm: {a.bpm}', f'anacrusis: {anac}', '']
    if irregular:
        out.insert(-1, '# measures: ' + ','.join(
            str(int(x)) if float(x).is_integer() else str(x) for x in body))
    for name in ('soprano', 'alto', 'tenor', 'bass'):
        flat = [e for _, evs, _ in voices[name] for e in evs]
        out.append(f'{name}.pitches: ' + ', '.join(p for p, _ in flat))
        out.append(f'{name}.durs: ' + ', '.join(
            str(int(d)) if float(d).is_integer() else str(d) for _, d in flat))
    open(a.out, 'w').write('\n'.join(out) + '\n')
    total = round(sum(lengths), 4)
    print(f'wrote {a.out} — {counts["soprano"]} measures, {total} beats/voice'
          + (f', {len(irregular)} irregular bar(s)' if irregular else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main())
