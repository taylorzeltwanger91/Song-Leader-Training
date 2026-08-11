"""
Recover an `assemble.py` source file from an already-committed hymn JSON.

Two jobs:

1. **Round-trip proof.** Extract a verified hymn, re-assemble it, and diff against the
   committed JSON. Byte-identical means the assembler reproduces the data that shipped.
2. **Recovering the lost reads.** Hymns 1-10 were assembled by the original `asm.py`
   from per-hymn drive scripts that no longer exist. The JSONs survived, so the pitch
   and duration lists can be read back out of them and committed as source.

    python extract_source.py ../../public/hymn_satb/6.json -o hymns/6.txt

Enharmonic spelling follows the key signature (flat keys print flats), which is
cosmetic — every spelling resolves to the same MIDI number on the way back in.
"""
import sys
import os
import json
import argparse

VOICES = ['soprano', 'alto', 'tenor', 'bass']
SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
FLAT_KEYS = {'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb', 'C',
             'd', 'g', 'c', 'f', 'bb', 'eb'}


def note_name(m, use_flats):
    names = FLAT if use_flats else SHARP
    return f"{names[m % 12]}{m // 12 - 1}"


def num(x):
    """Trim trailing zeros so durations read like a transcriber wrote them."""
    return str(int(x)) if float(x) == int(float(x)) else str(float(x))


def extract(hymn):
    key = hymn.get('key', 'C')
    use_flats = key in FLAT_KEYS
    beats_per_measure = int(hymn['timeSignature'].split('/')[0])

    # The pickup is the opening bar when it is shorter than the meter.
    first = hymn['voices']['soprano']
    bar0 = sum(n['dur'] for n in first if n['measure'] == 0)
    anacrusis = bar0 if hymn.get('anacrusis') and bar0 < beats_per_measure else 0

    lines = [
        f"# hymn {hymn['hymnId']} — {hymn['title']}",
        f"# recovered from public/hymn_satb/{hymn['hymnId']}.json",
        "",
        f"id: {hymn['hymnId']}",
        f"title: {hymn['title']}",
        f"key: {key}",
        f"time: {hymn['timeSignature']}",
        f"bpm: {hymn['bpm']}",
        f"anacrusis: {num(anacrusis)}",
        "",
    ]
    for v in VOICES:
        notes = hymn['voices'][v]
        pitches = ', '.join('REST' if n.get('rest') else note_name(n['midi'], use_flats)
                            for n in notes)
        durs = ', '.join(num(n['dur']) for n in notes)
        lines += [f"{v}.pitches: {pitches}", f"{v}.durs: {durs}", ""]
    return '\n'.join(lines)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('hymn_json')
    ap.add_argument('-o', '--out', help='write here (default: stdout)')
    args = ap.parse_args()

    text = extract(json.load(open(args.hymn_json)))
    if args.out:
        os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
        with open(args.out, 'w') as f:
            f.write(text)
        print(f"wrote {args.out}")
    else:
        print(text)


if __name__ == '__main__':
    sys.exit(main())
