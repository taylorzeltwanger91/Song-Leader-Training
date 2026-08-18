"""
Render an assembled hymn as one line per measure per voice — the format a verification
pass can actually check against the page.

    python show_measures.py hymns/pending/25.txt            # all voices
    python show_measures.py hymns/pending/25.txt --staff treble

Written for step 5b of the pipeline. Handing a reader a flat list of 180 comma-separated
events and asking "is this right?" is unanswerable; handing it "m7: C#5=1, B4=1, A4=1"
and asking "does the page show that?" is a question with an answer. The same reframing
fixed the serialization failures on hymns 14 and 20 (see README).
"""
import sys, json, argparse, subprocess, os, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
VOICES = {'treble': ['soprano', 'alto'], 'bass': ['tenor', 'bass'],
          'all': ['soprano', 'alto', 'tenor', 'bass']}
NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
FLATS = {'F': 1, 'Bb': 1, 'Eb': 1, 'Ab': 1, 'Db': 1, 'Gb': 1, 'C': 0}
FLATNAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']


def name(midi, use_flats):
    t = FLATNAMES if use_flats else NAMES
    return f"{t[midi % 12]}{midi // 12 - 1}"


def num(x):
    return str(int(x)) if float(x) == int(float(x)) else str(float(x))


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('source', help='an assemble.py source .txt')
    ap.add_argument('--staff', choices=['treble', 'bass', 'all'], default='all')
    ap.add_argument('--claim', action='store_true',
                    help='emit just the measure lines, ready to pipe into a prompt. '
                         'ALWAYS pipe this — never retype it by hand.')
    args = ap.parse_args()

    with tempfile.NamedTemporaryFile(suffix='.json', delete=False) as tf:
        out = tf.name
    r = subprocess.run([sys.executable, os.path.join(HERE, 'assemble.py'),
                        args.source, '-o', out], capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stderr, file=sys.stderr); return 1
    h = json.load(open(out))
    os.unlink(out)
    use_flats = h['key'] in FLATS
    beats = int(h['timeSignature'].split('/')[0])

    if args.claim:
        for v in VOICES[args.staff]:
            print(v.upper())
            bars={}
            for n in h['voices'][v]: bars.setdefault(n['measure'],[]).append(n)
            for m in sorted(bars):
                ev=", ".join(('REST' if n.get('rest') else name(n['midi'],use_flats))
                             +"="+num(n['dur']) for n in bars[m])
                lbl='pickup' if (m==0 and h.get('anacrusis')) else f"m{m+(0 if h.get('anacrusis') else 1)}"
                print(f"{lbl}: {ev}")
            print()
        return 0
    print(f"hymn {h['hymnId']} — {h['title']}")
    print(f"key {h['key']}, {h['timeSignature']}, "
          f"{'pickup' if h.get('anacrusis') else 'no pickup'}, "
          f"{sum(n['dur'] for n in h['voices']['soprano'])} beats/voice\n")
    for v in VOICES[args.staff]:
        print(v.upper())
        bars = {}
        for n in h['voices'][v]:
            bars.setdefault(n['measure'], []).append(n)
        for m in sorted(bars):
            ev = ", ".join(('REST' if n.get('rest') else name(n['midi'], use_flats))
                           + "=" + num(n['dur']) for n in bars[m])
            tot = sum(n['dur'] for n in bars[m])
            # 1-BASED labels. These listings get pasted into verification prompts, and a
            # 0-based listing hand-converted to 1-based is exactly how I corrupted a claim
            # on 2026-08-18 — the verifier then "found" four errors that were mine.
            if m == 0 and h.get('anacrusis'):
                lbl = 'pickup'
            else:
                lbl = f"m{m + (0 if h.get('anacrusis') else 1)}"
            print(f"  {lbl}: {ev} | sum={num(tot)}")
        print()
    return 0


if __name__ == '__main__':
    sys.exit(main())
