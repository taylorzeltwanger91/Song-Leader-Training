# Reader calibration — measured, not assumed

Every verification method here states its own sensitivity before its approvals count.
This file records what has actually been measured, and by what instrument.

## The instrument

`make_audit.py` builds a forced-response audit: 12–20 individually indexed events, one
required evidence row per event (observed Aiken shape, staff position, stem direction,
duration), with 2–3 deliberately wrong claims seeded among them. `score_audit.py` scores
coverage, canary recall, false positives, and how many rows carry real observation.

**A run that misses a canary is REJECTED**, however clean the rest of its report looks.
Missing a planted error means the run cannot be trusted to have found a real one.

## Results — 2026-08-19

| Reader | Format | Hymns | Canaries | Coverage | False pos | Evidence rows |
|---|---|---|---|---|---|---|
| Fable | forced-response | 22, 25, 29, 30 | **12/12** | 64/64 | 0 | 64/64 |
| GPT-5.6 | exceptions-only | 30 | **0/3** | n/a | 0 | 4 |

Hymn 30 is a direct head-to-head: same page, same three planted soprano/tenor errors.

### The confound, stated plainly

The two readers ran **different formats**, so this does not establish that Fable reads
better than GPT-5.6. It is equally consistent with the exceptions-only format being the
problem — which is what it was predicted to be: that format lets a reader silently choose
what to examine, and GPT's failing run reported "events examined: 244" while finding none
of the three.

One data point argues for a reader difference too: Fable caught a single injected error in
*exceptions-only* format (hymn 12 control, 2026-08-18). One sample.

**To separate reader from format, run one forced-response audit through GPT-5.6.** It is a
16-event paste, not a full read. If GPT scores 3/3, format explains the gap and the fix is
the format, applied to whichever reader. If it scores 0/3 again, it is the reader.

## What this does and does not license

**Does:** a forced-response audit that returns 3/3 with evidence on every row has
demonstrated, on that run, that the reader was looking at the page.

**Does not:** retroactively validate the 28 exceptions-only verification passes of
2026-08-18. Those returned "all systems OK" 26 times, against a single control run. They
produced two real errors (hymn 22 bass m9, hymn 30 soprano m14), both independently
confirmed by pixel — so they were not inert. But their per-run sensitivity was never
measured, and their clean results were reported with more confidence than earned.

An audit samples ~16 of ~200 events. It measures the reader, not the corpus. Full
coverage at this rigour would need ~12 audits per hymn.
