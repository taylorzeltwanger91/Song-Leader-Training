"""
Score a calibrated verification run against its answer key.

    python score_canaries.py <key.json> <reply.txt>

A run is REJECTED if it misses any canary, however clean the rest of its report looks.
Missing a planted error means the pass cannot be trusted to have found a real one, so its
approvals carry no information.

Reports all four, and every one of these is actually computed — an earlier version of this
file documented precision and residual classification while implementing only recall and
control false alarms, which is precisely the sin these tools exist to catch:

  RECALL     canaries found / planted        — did it read the page at all?
  CONTROLS   flags raised on untouched events in the same measures as canaries
  PRECISION  (canaries + plausible residuals) / total exceptions reported
  RESIDUAL   exceptions that are neither canary nor control. These are the payload:
             candidate REAL errors in the transcription, to be adjudicated by pixel.
"""
import json, re, sys

VOICES = ('soprano', 'alto', 'tenor', 'bass')


def parse_exceptions(reply):
    """Pull (voice, measure, event, text) out of a free-form exception report."""
    out = []
    for line in reply.splitlines():
        l = line.strip()
        if not l or l.lower().startswith('events examined'):
            continue
        v = next((x for x in VOICES if re.search(rf'\b{x}\b', l, re.I)), None)
        m = re.search(r'\bm(\d+)\b', l)
        e = re.search(r'event\s*(\d+)', l, re.I)
        if v and m:
            out.append(dict(voice=v.upper(), measure=f"m{m.group(1)}",
                            event=int(e.group(1)) if e else None, text=l))
    return out


def same(a, b):
    return (a['voice'] == b['voice'] and a['measure'] == b['measure']
            and (a['event'] is None or b['event'] is None or a['event'] == b['event']))


def main():
    key = json.load(open(sys.argv[1]))
    reply = open(sys.argv[2]).read()
    exc = parse_exceptions(reply)

    found, missed = [], []
    for c in key['canaries']:
        hit = next((e for e in exc if same(e, c)
                    and re.search(re.escape(c['truth']).replace(r'\#', '#'), e['text'], re.I)), None)
        (found if hit else missed).append(c)

    ctrl = [e for e in exc if any(same(e, c) for c in key['controls'])
            and not any(same(e, c) for c in key['canaries'])]
    canary_exc = [e for e in exc if any(same(e, c) for c in key['canaries'])]
    residual = [e for e in exc if e not in ctrl and e not in canary_exc]

    claimed = re.search(r'events examined:\s*(\d+)', reply, re.I)

    print(f"hymn {key['hymn']}")
    print(f"  RECALL     {len(found)}/{len(key['canaries'])} canaries found")
    for c in missed:
        print(f"     MISSED  {c['voice']} {c['measure']} ev{c['event']}: "
              f"claim said {c['seeded']}, page shows {c['truth']}")
    print(f"  CONTROLS   {len(ctrl)} false alarms on untouched events in canary measures")
    for e in ctrl[:5]:
        print(f"     {e['text'][:100]}")
    tot = len(exc)
    prec = (len(canary_exc) + len(residual)) / tot * 100 if tot else 0.0
    print(f"  PRECISION  {len(canary_exc)} canary + {len(residual)} residual of {tot} "
          f"exceptions = {prec:.0f}% not-known-false")
    print(f"  RESIDUAL   {len(residual)} candidate real errors — adjudicate these by pixel")
    for e in residual:
        print(f"     {e['text'][:110]}")
    if claimed:
        print(f"  CLAIMED    {claimed.group(1)} events examined "
              f"({'unverifiable in exceptions-only format' if tot < 5 else ''})")

    if missed:
        print(f"\n  VERDICT: REJECT — {len(missed)}/{len(key['canaries'])} planted errors "
              f"missed. Its approvals carry no information, and its residuals are only as "
              f"trustworthy as a reader that missed {len(missed)} deliberate errors.")
        return 1
    print("\n  VERDICT: ACCEPT — every planted error was found. Adjudicate the residuals.")
    return 0


if __name__ == '__main__':
    sys.exit(main())
