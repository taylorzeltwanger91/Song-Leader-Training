"""
Flag hymns whose reads are suspiciously alike — then GO LOOK AT THE PAGES.

The failure this exists for: a reader returns another hymn's note data, perfectly
self-consistent, wrapped in a narrative about the hymn you asked for. No length, total or
tiling check can catch that, because the data is internally valid — it is just the wrong
music.

⚠️ BUT A HIT IS NOT A VERDICT. Hymnals reuse one tune across several hymns of the same
meter, so two hymns having identical notes is often completely correct. Hymn 20 ("Labor
on") and hymn 23 ("Buried With Christ") share a tune — same key, same time, both printing
the meter 3. 3. 7. 8. 7. 8. 9. 3. 3. — and score 100% here legitimately.

On 2026-08-13 that similarity was misread as agent contamination: three correct reads were
accused of fabricating data, valid transcriptions were discarded, and two full re-reads
were burned chasing a bug that did not exist. Do not repeat that. On a hit, open both
pages:

  same meter line + key + time + music      -> shared tune, both reads are fine
  different meter/key/time, or different music -> one read is the wrong hymn; re-read it

The system count does not discriminate — the same tune can be engraved across a different
number of systems when the words are longer.

    python check_duplicates.py                     # all hymns in public/hymn_satb/
    python check_duplicates.py hymns/*.txt         # or assemble.py source files
    python check_duplicates.py --threshold 0.75    # default 0.70

Compares every pair of hymns voice by voice and reports any pair too similar to be
coincidence. Genuinely distinct hymns in this corpus sit well under 60% even when they
share a key and meter; a contaminated pair scores ~100%.

Exit 1 if any pair trips the threshold.
"""
import os
import re
import sys
import json
import difflib
import argparse

VOICES = ['soprano', 'alto', 'tenor', 'bass']


def from_json(path):
    d = json.load(open(path))
    out = {}
    for v in VOICES:
        out[v] = ['REST' if n.get('rest') else str(n['midi']) for n in d['voices'].get(v, [])]
    return str(d.get('hymnId', os.path.basename(path))), out


def from_source(path):
    """Parse an assemble.py source .txt (pitch names, not MIDI — fine for comparison)."""
    text = open(path).read()
    hid = re.search(r'^id:\s*(\S+)', text, re.M)
    out = {}
    for v in VOICES:
        m = re.search(rf'^{v}\.pitches:\s*(.*)$', text, re.M)
        out[v] = [x.strip() for x in m.group(1).split(',') if x.strip()] if m else []
    return (hid.group(1) if hid else os.path.basename(path)), out


def load(path):
    return from_json(path) if path.endswith('.json') else from_source(path)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('files', nargs='*')
    ap.add_argument('--threshold', type=float, default=0.70)
    args = ap.parse_args()

    files = args.files
    if not files:
        d = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                         '..', '..', 'public', 'hymn_satb')
        files = sorted((os.path.join(d, f) for f in os.listdir(d) if f.endswith('.json')),
                       key=lambda p: int(os.path.basename(p)[:-5]))

    hymns = []
    for f in files:
        try:
            hymns.append((*load(f), f))
        except Exception as e:
            print(f"  skipped {f}: {e}", file=sys.stderr)

    print(f"comparing {len(hymns)} hymns, {len(hymns)*(len(hymns)-1)//2} pairs, "
          f"threshold {args.threshold:.0%}\n")

    worst, hits = (None, 0.0), []
    for i, (ida, va, fa) in enumerate(hymns):
        for idb, vb, fb in hymns[i + 1:]:
            # score each voice against the same voice, and also against the other staff's
            # voices — a contaminated read may land in a different voice slot.
            best = 0.0
            for x in VOICES:
                for y in VOICES:
                    if not va[x] or not vb[y]:
                        continue
                    r = difflib.SequenceMatcher(None, va[x], vb[y]).ratio()
                    best = max(best, r)
            if best > worst[1]:
                worst = ((ida, idb), best)
            if best >= args.threshold:
                hits.append((ida, idb, best))
                print(f"  *** hymn {ida} vs hymn {idb}: {best:.1%} — TOO SIMILAR ***")

    if hits:
        print(f"\n{len(hits)} pair(s) above threshold — INVESTIGATE, do not assume a bug.")
        print("Open both hymns' pages and compare the printed meter line, key, time")
        print("signature and music:")
        print("  same meter + key + time + music  -> a SHARED TUNE. Both reads are fine;")
        print("     hymnals reuse tunes across hymns of matching meter. Keep both.")
        print("  otherwise                        -> one read is the wrong hymn; re-read it.")
        return 1
    print(f"no duplication detected. Closest pair: hymn {worst[0][0]} vs {worst[0][1]} "
          f"at {worst[1]:.1%}.")
    return 0


if __name__ == '__main__':
    sys.exit(main())
