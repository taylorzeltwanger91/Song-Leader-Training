"""
Score a forced-response audit.

    python score_audit.py <key.json> <reply.txt>

Checks, in order of what actually invalidates a run:
  COVERAGE  every requested row present? A missing row means the reader chose what to
            answer, which is the failure the forced format exists to prevent.
  RECALL    canaries caught / planted. Any miss REJECTS the run.
  FALSE POS a DIFFERS on a row whose claim was correct.
  EVIDENCE  rows carrying an observed shape AND staff position, as required. A bare
            "AGREE" is the unfalsifiable answer and is counted separately.
"""
import json, re, sys

SHAPES = ('triangle', 'cup', 'diamond', 'wedge', 'oval', 'square', 'cone',
          'do', 're', 'mi', 'fa', 'sol', 'la', 'ti', 'semicircle', 'half-moon')


def main():
    key = json.load(open(sys.argv[1]))
    reply = open(sys.argv[2]).read()
    rows = {}
    for line in reply.splitlines():
        m = re.match(r'\s*(\d+)\s*[.)]\s*(AGREE|DIFFERS|UNCLEAR)\b(.*)', line.strip(), re.I)
        if m:
            rows[int(m.group(1))] = (m.group(2).upper(), m.group(3))

    want = {r['n']: r for r in key['rows']}
    missing = sorted(set(want) - set(rows))
    canaries = [r for r in key['rows'] if r['canary']]
    caught, missed_c = [], []
    for c in canaries:
        got = rows.get(c['n'])
        ok = got and got[0] == 'DIFFERS' and re.search(
            re.escape(c['truth']).replace(r'\#', '#'), got[1], re.I)
        (caught if ok else missed_c).append(c)
    fp = [n for n, (v, t) in rows.items()
          if v == 'DIFFERS' and n in want and not want[n]['canary']]
    eviden = sum(1 for n, (v, t) in rows.items()
                 if any(s in t.lower() for s in SHAPES) and re.search(r'[A-G][#b]?\d|line|space', t))

    print(f"hymn {key['hymn']}  —  {len(rows)}/{len(want)} rows returned")
    if missing:
        print(f"  COVERAGE   MISSING rows {missing}")
    else:
        print(f"  COVERAGE   complete")
    print(f"  RECALL     {len(caught)}/{len(canaries)} canaries caught")
    for c in missed_c:
        got = rows.get(c['n'])
        print(f"     MISSED #{c['n']} {c['voice']} {c['measure']} ev{c['event']}: "
              f"asked {c['asked']}, truth {c['truth']}, answered "
              f"{got[0] if got else 'NOTHING'}")
    print(f"  FALSE POS  {len(fp)} DIFFERS on correct claims" + (f" — rows {fp}" if fp else ""))
    print(f"  EVIDENCE   {eviden}/{len(rows)} rows carry an observed shape and position")

    if missing or missed_c:
        print("\n  VERDICT: REJECT")
        return 1
    print("\n  VERDICT: ACCEPT — sensitivity demonstrated on this run.")
    if fp:
        print("  Adjudicate the false positives by pixel before dismissing them: a DIFFERS on a")
        print("  claim I believe correct is either a reader error or a REAL error I have wrong.")
    return 0


if __name__ == '__main__':
    sys.exit(main())
