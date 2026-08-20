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
| Fable | forced-response | 12, 22, 25, 29, 30 | **15/15** | 80/80 | 0 | 80/80 |
| GPT-5.6 | exceptions-only | 30 | **0/3** | n/a | 0 | 4 |
| GPT-5.6 | **forced-response** | 25 | **3/3** | 16/16 | 0 | 16/16 |

Hymn 30 is a direct head-to-head: same page, same three planted soprano/tenor errors.

Across all five runs Fable never once returned a bare "AGREE" — every row carried an
observed shape and staff position, which is the answer the format exists to force. On
three separate canaries it also named the *mechanism* of the planted error unprompted:
"G3 is the bass voice's do, not the tenor"; "the B4 half is the soprano note of that
stack"; "not on the D3 line, not a do triangle". That is the voice-assignment confusion
which produced both real errors found in this corpus.

### The confound, RESOLVED — 2026-08-20

GPT-5.6 was given the identical 16-event forced-response audit Fable had scored 3/3 on
(hymn 25, same events, same three planted errors) and scored **3/3, 16/16 coverage, zero
false positives, evidence on every row.**

So the hymn 30 failure was the FORMAT, not the reader. Exceptions-only reporting lets a
reader silently choose what to examine — that run claimed "events examined: 244" while
finding none of three planted errors. Given a list it must answer row by row, the same
model finds all of them.

Stronger still: GPT's 16 rows were **identical to Fable's** — same verdicts, same three
corrections, same pitches, 16/16. Two independent readers, same page, same task, complete
agreement. That is dual-verification on those events, which is the thing the whole
pipeline has been trying to buy.

**Implication:** the forced-response audit is the cheap unit of independent verification.
One paste per hymn, ~16 events, measured sensitivity, and it works on both readers.

### The original confound, for the record

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
