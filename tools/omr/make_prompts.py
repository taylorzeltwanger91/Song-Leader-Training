"""
Generate the per-hymn vision-read prompts for step 3 (both staves, both readers).

    python make_prompts.py 11 --key G --time 2/2 --out ~/Downloads/ZionsHymns-Archive/hymn-011-the-union-in-jesus

Writes `GPT-PROMPT-treble.txt` and `GPT-PROMPT-bass.txt` (paste into ChatGPT with the
page images attached) and prints the page files to attach. The same text is what the
Fable agent gets, with per-system crop paths substituted for the page images.

`--key` is the key YOU read off the first treble staff by eye. The CV key-counter in
`lib.py` over-counts every time and must not be trusted here — feeding a wrong key to a
reader transposes the entire transcription. The prompt still asks the model to verify it.

The prompt shape and the reason for each rule live in `prompts/vision-read.md`.
"""
import os
import sys
import json
import argparse

MAJOR_STEPS = ['do', 're', 'mi', 'fa', 'sol', 'la', 'ti']
LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
# semitones above C for each natural letter, used to spell the scale
NATURAL = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11]


def scale_degrees(key):
    """'G' -> 'do=G, re=A, mi=B, fa=C, sol=D, la=E, ti=F#' — one letter per degree."""
    tonic = key[0].upper()
    accidental = key[1:].replace('m', '')
    base = NATURAL[tonic] + (1 if accidental == '#' else -1 if accidental == 'b' else 0)
    start = LETTERS.index(tonic)
    out = []
    for i, step in enumerate(MAJOR_STEPS):
        letter = LETTERS[(start + i) % 7]
        want = (base + MAJOR_INTERVALS[i]) % 12
        delta = (want - NATURAL[letter]) % 12
        delta = delta - 12 if delta > 6 else delta
        out.append(f"{step}={letter}{'#' * delta if delta > 0 else 'b' * -delta}")
    return ', '.join(out)


def duration_line(time_sig):
    """Spell out the beat unit for the meter, since this is where readers go wrong."""
    d = int(time_sig.split('/')[1])
    if d == 2:
        return ("half note = 1 beat, whole note = 2, quarter = 0.5, "
                "dotted half = 1.5, eighth = 0.25")
    if d == 4:
        return ("quarter note = 1 beat, half = 2, whole = 4, dotted quarter = 1.5, "
                "eighth = 0.5, dotted half = 3")
    if d == 8:
        return ("eighth note = 1 beat, quarter = 2, dotted quarter = 3, "
                "sixteenth = 0.5")
    return f"the {d}th note = 1 beat"


STAVES = {
    'treble': dict(top='Soprano', bottom='Alto', rng='G4, A4, B4',
                   extra=''),
    'bass': dict(top='Tenor', bottom='Bass', rng='G3, A3, B3',
                 extra='- Do NOT infer the line from what would sound harmonically\n'
                       '  sensible. Read the actual note heads. If a passage is genuinely\n'
                       '  illegible, say so rather than filling it in plausibly.\n'),
}


def build(hymn, key, time_sig, staff, images_block):
    s = STAVES[staff]
    return f"""You are transcribing the {staff.upper()} staff of a shape-note hymn into note data. Accuracy matters more than speed — this data gets sung against.

{images_block}

This is hymn {hymn['id']}, "{hymn['title']}", from Zion's Hymns (2021), the Aiken 7-shape edition.

KEY AND METER — I read these as {key} major and {time_sig} by eye. VERIFY them yourself against the images and tell me if you disagree. Do not assume I am right.

AIKEN SHAPE -> SCALE DEGREE (this notation encodes pitch TWICE — the shape gives the letter, the staff position gives the octave; use both and say so when they conflict):
  triangle = do,  cup = re,  diamond = mi,  wedge = fa,
  oval = sol,     square = la,  cone = ti
In {key} major: {scale_degrees(key)}

VOICES ON THIS STAFF:
  {s['top']} = the TOP voice, stems UP
  {s['bottom']} = the BOTTOM voice, stems DOWN
Both voices sound throughout; where a single note head is shared, both voices sing it.

DURATIONS — express every duration in BEATS where one beat = the meter's denominator unit. In {time_sig} that means: {duration_line(time_sig)}. A dot adds half the value.

WHAT I NEED BACK — exactly this, nothing else:

key: <what you actually see>
time: <what you actually see>
anacrusis: <beats in the pickup bar before the first full measure, or 0 if the hymn starts on a downbeat>

{s['top'].lower()}:
  m1: <pitch>/<dur>, <pitch>/<dur>, ... = <sum of the durations on this line>
  m2: ...
  <one line per measure, in order, through the last measure of the hymn>
{s['bottom'].lower()}:
  m1: ...

notes: <anything uncertain — measure number and what you were torn between>

FORMAT — ONE LINE PER MEASURE, and every line states its own sum. This is not
cosmetic. Flat comma-separated lists spanning the whole voice fail at roughly one
voice in twelve here: the pitch list comes back a different length from the duration
list, or the beats land in the wrong bars, and the error is invisible until it is
assembled. Per-measure lines with stated sums have not failed once in this corpus.
Write each measure's notes, add its durations, and put that total after the `=`.
If a bar is genuinely short (a phrase cadence), state its real sum — do NOT pad it.
If there is a pickup, call it `m0` and give it its own line.

RULES THAT MATTER:
- Pitch names are letter + accidental + octave, middle C = C4. Spell per the key.
- INCLUDE RESTS as the literal word REST in the pitch list, with their duration. A missing rest corrupts every onset after it.
- The two voices MUST total the same number of beats, and must have the same
  number of measures. Check both before you answer and fix them if they don't.
- Count measures per system and report the total. If a system seems to have a short or irregular bar, say so explicitly rather than silently normalizing it — phrase-cadence short bars are real in this hymnal.
- If the shape and the staff position disagree on a note, report both and flag it in `notes`. Do not silently pick one.
{s['extra']}- Work system by system and re-examine anything ambiguous by looking again at that image.

Your final message is the data — return the block above and nothing else around it.
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('hymn_id', type=int)
    ap.add_argument('--key', required=True, help='key YOU read by eye, e.g. G, Eb, A')
    ap.add_argument('--time', required=True, help='time signature, e.g. 2/2')
    ap.add_argument('--out', required=True, help='directory to write the prompts into')
    ap.add_argument('--index', default=os.path.join(
        os.path.dirname(os.path.abspath(__file__)), '..', '..',
        'public', 'hymn_index.json'))
    ap.add_argument('--sheet-dir', default=os.path.join(
        os.path.dirname(os.path.abspath(__file__)), '..', '..',
        'public', 'sheet_music'))
    args = ap.parse_args()

    index = json.load(open(args.index))
    hymn = next((h for h in index if int(h['id']) == args.hymn_id), None)
    if not hymn:
        print(f"hymn {args.hymn_id} not in the index", file=sys.stderr)
        return 1

    os.makedirs(args.out, exist_ok=True)
    images = [os.path.abspath(os.path.join(args.sheet_dir, i)) for i in hymn['images']]
    block = ("PAGES — attach these images to the message:\n"
             + '\n'.join(f"  {p}" for p in images))

    for staff in ('treble', 'bass'):
        path = os.path.join(args.out, f'GPT-PROMPT-{staff}.txt')
        with open(path, 'w') as f:
            f.write(build(hymn, args.key, args.time, staff, block))
        print(f"wrote {path}")

    print(f"\nattach these {len(images)} page image(s) to each paste:")
    for p in images:
        print(f"  {p}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
