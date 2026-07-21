"""
Validate a 4-part (SATB) hymn JSON — the automated gate that catches structural
errors before a hymn is accepted. This is the same set of checks the JS
melody-data test enforces, applied to the SATB schema.

It caught Fable undercounting hymn 5 by a measure, and confirmed all four
hymn-79 voices at 66 beats. A hymn that fails here does NOT advance to render.

Usage:  python validate_satb.py <hymn.json>
Exit 0 = valid, 1 = invalid (prints every problem found).
"""
import sys
import json

VOICES = ['soprano', 'alto', 'tenor', 'bass']


def validate(hymn):
    problems = []
    beats_per_measure = int(hymn['timeSignature'].split('/')[0])
    anacrusis = hymn.get('anacrusis', False)

    totals = {}
    for v in VOICES:
        notes = hymn['voices'].get(v)
        if not notes:
            problems.append(f"{v}: missing or empty")
            continue

        # onset == cumulative duration (rests included) — the timeline is contiguous
        cum = 0.0
        for i, n in enumerate(notes):
            if 'dur' not in n or n['dur'] <= 0:
                problems.append(f"{v}[{i}]: missing/nonpositive dur")
            if 'onset' in n and abs(n['onset'] - cum) > 1e-9:
                problems.append(f"{v}[{i}]: onset {n['onset']} != cumulative {cum}")
            if not n.get('rest') and 'midi' not in n:
                problems.append(f"{v}[{i}]: note without midi")
            if n.get('rest') and 'midi' in n:
                problems.append(f"{v}[{i}]: rest must not carry midi")
            cum += n.get('dur', 0)
        totals[v] = cum

    # All voices must have the SAME total length — they share the same bars.
    if len(set(round(t, 6) for t in totals.values())) > 1:
        problems.append(f"voice totals differ (must be equal): {totals}")

    # Each voice's bars must sum to the meter (allowing a pickup/final anacrusis).
    for v in VOICES:
        notes = hymn['voices'].get(v)
        if not notes or not all('measure' in n for n in notes):
            continue  # measure numbers optional if onset-only
        sums = {}
        for n in notes:
            sums[n['measure']] = sums.get(n['measure'], 0) + n['dur']
        ms = sorted(sums)
        first, last = ms[0], ms[-1]
        for m in ms:
            if m in (first, last):
                continue
            if abs(sums[m] - beats_per_measure) > 1e-9:
                problems.append(f"{v}: interior measure {m} sums to {sums[m]}, expected {beats_per_measure}")
        f, l = sums[first], sums[last]
        full = abs(f - beats_per_measure) < 1e-9 and abs(l - beats_per_measure) < 1e-9
        anac = anacrusis and abs(f + l - beats_per_measure) < 1e-9
        if not (full or anac):
            problems.append(f"{v}: first bar {f} + last bar {l} not full and not a valid anacrusis")

    return problems


if __name__ == '__main__':
    hymn = json.load(open(sys.argv[1]))
    problems = validate(hymn)
    if problems:
        print(f"INVALID: hymn {hymn.get('hymnId')} — {len(problems)} problem(s):")
        for p in problems:
            print(f"  - {p}")
        sys.exit(1)
    total = sum(n['dur'] for n in hymn['voices']['soprano'])
    print(f"VALID: hymn {hymn.get('hymnId')} '{hymn.get('title')}' — "
          f"4 voices, {total} beats each, key {hymn.get('key')}, {hymn['timeSignature']}")
