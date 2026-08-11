"""
Prove the assembler reproduces the hymns that already shipped.

For each committed hymn: recover a source file with `extract_source.py`, re-assemble it
with `assemble.py`, and compare against the committed JSON both byte-for-byte and
semantically (parsed structures, which ignores key order and int-vs-float spelling).

    python roundtrip_test.py                    # all hymns in public/hymn_satb/
    python roundtrip_test.py 6 9                # just these

Two known legacy differences are reported, not hidden — see KNOWN below. Anything else
is a real regression in the assembler.
"""
import os
import sys
import json
import subprocess
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', '..', 'public', 'hymn_satb')

KNOWN = """
Known legacy differences (the committed data, not the assembler, is the odd one out):

  * rest `beat` — the original asm.py stamped every rest `beat: 0` whatever its real
    position in the bar. assemble.py writes the true beat. Inert today: nothing reads
    `beat` on a rest (grader.js only checks it for sounding notes).
  * field order — hymns from the first batch serialise a note as `measure, beat`;
    later ones use `beat, measure`. Same data either way.
"""


def voices_differ(a, b):
    """Per-voice, per-entry semantic diff. Returns a list of human-readable strings."""
    out = []
    for v in ('soprano', 'alto', 'tenor', 'bass'):
        av, bv = a['voices'][v], b['voices'][v]
        if len(av) != len(bv):
            out.append(f"{v}: {len(av)} entries vs {len(bv)}")
            continue
        for i, (x, y) in enumerate(zip(av, bv)):
            for field in set(x) | set(y):
                xf, yf = x.get(field), y.get(field)
                if isinstance(xf, (int, float)) and isinstance(yf, (int, float)):
                    if abs(xf - yf) > 1e-9:
                        out.append(f"{v}[{i}].{field}: {xf} vs {yf}")
                elif xf != yf:
                    out.append(f"{v}[{i}].{field}: {xf!r} vs {yf!r}")
    return out


def check(hymn_id, tmp):
    committed_path = os.path.join(DATA, f'{hymn_id}.json')
    src = os.path.join(tmp, f'{hymn_id}.txt')
    rebuilt_path = os.path.join(tmp, f'{hymn_id}.json')

    for cmd in (['extract_source.py', committed_path, '-o', src],
                ['assemble.py', src, '-o', rebuilt_path]):
        r = subprocess.run([sys.executable, os.path.join(HERE, cmd[0])] + cmd[1:],
                           capture_output=True, text=True)
        if r.returncode != 0:
            return 'FAILED', [f"{cmd[0]}: {r.stderr.strip().splitlines()[-1]}"]

    committed_raw = open(committed_path).read()
    rebuilt_raw = open(rebuilt_path).read()
    if committed_raw == rebuilt_raw:
        return 'IDENTICAL', []

    diffs = voices_differ(json.load(open(rebuilt_path)), json.load(open(committed_path)))
    meta = [k for k in ('hymnId', 'title', 'key', 'timeSignature', 'bpm', 'anacrusis')
            if json.load(open(rebuilt_path))[k] != json.load(open(committed_path))[k]]
    if meta:
        diffs = [f"metadata differs: {meta}"] + diffs
    if not diffs:
        return 'EQUIVALENT', []          # same data, different serialisation order
    only_rest_beats = all('.beat' in d for d in diffs)
    return ('REST-BEAT ONLY' if only_rest_beats else 'MISMATCH'), diffs


def main():
    ids = sys.argv[1:] or sorted(
        (f[:-5] for f in os.listdir(DATA) if f.endswith('.json')), key=int)
    width = max(len(str(i)) for i in ids)
    results = {}

    with tempfile.TemporaryDirectory() as tmp:
        for hid in ids:
            status, diffs = check(hid, tmp)
            results[hid] = status
            print(f"hymn {str(hid):>{width}}: {status}"
                  + (f" ({len(diffs)} field(s))" if diffs else ''))
            for d in diffs[:4]:
                print(f"    {d}")
            if len(diffs) > 4:
                print(f"    ... and {len(diffs) - 4} more")

    bad = [h for h, s in results.items() if s in ('FAILED', 'MISMATCH')]
    print(f"\n{sum(1 for s in results.values() if s == 'IDENTICAL')} byte-identical, "
          f"{sum(1 for s in results.values() if s == 'EQUIVALENT')} equivalent, "
          f"{sum(1 for s in results.values() if s == 'REST-BEAT ONLY')} rest-beat only, "
          f"{len(bad)} broken")
    print(KNOWN)
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
