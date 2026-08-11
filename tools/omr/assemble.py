"""
Assemble verified per-voice reads into the SATB hymn JSON the app serves.

Step 6 of the pipeline (README): the vision reads give you four pitch lists and four
duration lists; this turns them into `public/hymn_satb/<id>.json` — onsets accumulated,
barlines tiled, structure validated.

    python assemble.py hymns/6.txt                    # -> prints, validates
    python assemble.py hymns/6.txt -o ../../public/hymn_satb/6.json

The source `.txt` lives in `tools/omr/hymns/` and is committed alongside the JSON, so
the reads survive the session that produced them. (The original `asm.py` kept its inputs
in throwaway per-hymn drive scripts; when the scratchpad was cleaned up the JSONs
survived but the source lists did not. Hence a plain-text input under version control.)

Source format — a small header, then two lines per voice:

    id: 6
    title: Appeal to the Saviour
    key: A
    time: 3/2
    bpm: 120
    anacrusis: 0          # beats in the pickup bar; 0 = none
    # measures: 4,4,4,2   # optional, only for hymns with irregular interior bars

    soprano.pitches: A4, Ab4, A4, B4, REST
    soprano.durs:    1.5, 0.5, 1, 1, 1
    alto.pitches:    ...
    alto.durs:       ...

Pitches are note names (`A4`, `Bb4`, `C#3`, middle C = `C4` = 60) or `REST`/`R`. Any
enharmonic spelling is accepted — it resolves to the same MIDI number either way.
"""
import sys
import os
import re
import json
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from validate_satb import validate  # noqa: E402  (same-dir tool import)

VOICES = ['soprano', 'alto', 'tenor', 'bass']
STEP = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def midi(name):
    """'Bb4' -> 70. Middle C is C4 = 60. Returns None for a rest."""
    s = name.strip()
    if s.upper() in ('REST', 'R', '-'):
        return None
    letter = s[0].upper()
    if letter not in STEP:
        raise ValueError(f"bad pitch {name!r}")
    i = 1
    accidental = 0
    while i < len(s) and s[i] in '#b♯♭':
        accidental += 1 if s[i] == '#' or s[i] == '♯' else -1
        i += 1
    if not s[i:].lstrip('-').isdigit():
        raise ValueError(f"bad octave in pitch {name!r}")
    octave = int(s[i:])
    return (octave + 1) * 12 + STEP[letter] + accidental


def build_voice(pitches, durs):
    """Zip pitch/duration lists into entries carrying an accumulated onset."""
    ps = [p for p in (x.strip() for x in pitches.split(',')) if p]
    ds = [d for d in (x.strip() for x in durs.split(',')) if d]
    if len(ps) != len(ds):
        raise ValueError(f"{len(ps)} pitches but {len(ds)} durations")

    out, onset = [], 0.0
    for p, d in zip(ps, ds):
        dur = float(d)
        if dur <= 0:
            raise ValueError(f"non-positive duration {d!r}")
        m = midi(p)
        out.append({'dur': dur, 'onset': onset, 'midi': m} if m is not None
                   else {'dur': dur, 'onset': onset, 'rest': True})
        onset += dur
    return out


def assign_bars(notes, beats_per_measure, anacrusis=0, measures=None):
    """
    Tile the voice into bars, stamping `measure` and `beat` on every entry.

    Greedy: fill the current bar until it is exactly full, then open the next one. A
    pickup shortens the first bar; the closing bar simply runs out of notes, which is
    why an anacrusis and its complementing final bar are the only non-meter measures in
    this repertoire. `measures` overrides with explicit bar lengths if a hymn ever needs
    it (none of hymns 1-10 do).

    `beat` is the offset into the notated bar — `beats_per_measure - remaining` — so a
    pickup note reports its true position late in the bar (beat 3 of 4), not 0.
    """
    lengths = list(measures) if measures else None
    bar = 0
    # Held as int when whole so `beat` serialises as `0` rather than `0.0`, matching the
    # committed data byte for byte.
    remaining = (lengths[0] if lengths else (anacrusis or beats_per_measure))

    for n in notes:
        n['beat'] = beats_per_measure - remaining
        n['measure'] = bar
        remaining -= n['dur']
        if abs(remaining) < 1e-9:            # bar exactly full -> open the next
            bar += 1
            if lengths:
                remaining = lengths[bar] if bar < len(lengths) else beats_per_measure
            else:
                remaining = beats_per_measure
        elif remaining < 0:
            raise ValueError(
                f"note of {n['dur']} beats crosses the barline in measure {bar} "
                f"(only {n['dur'] + remaining} beats left) — check the durations")
    return notes


def serialise(entry):
    """Reproduce the committed field order exactly: rests differ from notes."""
    if entry.get('rest'):
        return {'dur': entry['dur'], 'onset': entry['onset'], 'rest': True,
                'measure': entry['measure'], 'beat': entry['beat']}
    return {'dur': entry['dur'], 'onset': entry['onset'], 'midi': entry['midi'],
            'beat': entry['beat'], 'measure': entry['measure']}


def assemble(src):
    """Source dict (parsed header + voice lists) -> the hymn JSON structure."""
    beats_per_measure = int(src['time'].split('/')[0])
    anacrusis = src.get('anacrusis', 0)
    measures = src.get('measures')

    voices, totals = {}, {}
    for v in VOICES:
        if f'{v}.pitches' not in src:
            raise ValueError(f"missing {v}.pitches")
        notes = build_voice(src[f'{v}.pitches'], src[f'{v}.durs'])
        assign_bars(notes, beats_per_measure, anacrusis, measures)
        voices[v] = [serialise(n) for n in notes]
        totals[v] = sum(n['dur'] for n in notes)

    if len(set(round(t, 6) for t in totals.values())) > 1:
        raise ValueError(f"voices differ in total length: {totals}")

    return {
        'hymnId': int(src['id']),
        'title': src['title'],
        'key': src['key'],
        'timeSignature': src['time'],
        'bpm': int(src['bpm']),
        'anacrusis': bool(anacrusis),
        'voices': voices,
    }


def parse_source(text):
    """Read the `key: value` source format. Repeated keys are an error, not a merge."""
    src = {}
    for lineno, raw in enumerate(text.splitlines(), 1):
        # A comment `#` must be at the start of the line or follow whitespace — bare
        # `#` is part of a pitch name (`C#4`), and splitting on it truncates the read.
        line = re.split(r'(?:^|\s)#', raw, maxsplit=1)[0].strip()
        if not line:
            continue
        if ':' not in line:
            raise ValueError(f"line {lineno}: expected 'key: value', got {raw!r}")
        k, val = line.split(':', 1)
        k, val = k.strip(), val.strip()
        if k in src:
            raise ValueError(f"line {lineno}: duplicate key {k!r}")
        if k == 'time':                       # the one value that legitimately holds '/'
            src[k] = val
        elif k == 'anacrusis':
            src[k] = int(val) if float(val) == int(float(val)) else float(val)
        elif k == 'measures':
            src[k] = [float(x) for x in val.split(',') if x.strip()]
        else:
            src[k] = val
    return src


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('source', help='per-hymn .txt source (see module docstring)')
    ap.add_argument('-o', '--out', help='write JSON here (default: stdout)')
    args = ap.parse_args()

    hymn = assemble(parse_source(open(args.source).read()))

    problems = validate(hymn)
    if problems:
        print(f"INVALID: hymn {hymn['hymnId']} — {len(problems)} problem(s):",
              file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1

    text = json.dumps(hymn, indent=1)
    if args.out:
        with open(args.out, 'w') as f:
            f.write(text)
        total = sum(n['dur'] for n in hymn['voices']['soprano'])
        print(f"wrote {args.out} — hymn {hymn['hymnId']} '{hymn['title']}', "
              f"4 voices, {total} beats each, key {hymn['key']}, {hymn['timeSignature']}")
    else:
        print(text)
    return 0


if __name__ == '__main__':
    sys.exit(main())
