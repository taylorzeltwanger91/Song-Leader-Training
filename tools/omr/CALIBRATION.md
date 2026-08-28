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

GPT's 16 rows were identical to Fable's — same verdicts, same three corrections, same
pitches, 16/16.

> **RETRACTED 2026-08-21.** This was written up as "two independent readers, complete
> agreement... dual-verification." It is not. A claim-conditioned audit is **anchored by
> construction**: the reader is shown the other reader's answer and asked to agree or
> differ. Agreement under anchoring is far weaker evidence than agreement arrived at
> cold. What the canaries license is narrower — *on that run, at a 3-in-16 error rate,
> the anchoring did not suppress detection.*

> **SUPERSEDED 2026-08-27.** The implication drawn here — that the forced-response audit
> is "the cheap unit of independent verification" — was generalized from ONE run. See the
> 19-audit measurement below; the true recall is 5.3%.

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

## The 19-audit measurement — 2026-08-27, and the verdict on this whole approach

The audit was run across an entire batch: hymns 31–45 and 47–50, **19 audits, 304 rows,
57 planted canaries**, all by GPT-5.5 via Codex reading the per-system crops from disk.

| metric | result |
|---|---|
| coverage | **304/304** rows returned |
| evidence rows | **304/304** carried a shape and a staff position |
| canaries flagged AND corrected | **3/57 — 5.3%** |
| canaries flagged, wrong correction | 20 |
| false positives | 23 / 247 correct claims (9.3%) |
| verdict | **19 of 19 REJECT** |

It discriminates weakly — it flags a planted error 40% of the time against 9% on a correct
claim, 4.3x — but when it flags, it names the right note 3 times in 23. A verifier that
says "this is wrong, it should be X" and gets X wrong 87% of the time produces disputes to
adjudicate, not answers.

Its 23 disagreements with dual-verified data were checked. **Zero were real errors.** Three
proposed the very value they were disputing. **Sixteen were internally incoherent** — they
named a shape and a pitch that cannot both hold in that key ("page shows C5; shape filled
triangle" in Eb, where a triangle is *do* = Eb). It was not reading the shape system; it
was producing evidence-shaped text.

**The lesson, and it is the important one in this file:** the 3/3 on hymn 25 was a sample
of three canaries, not a measurement of sensitivity. This document already said an audit
"measures the reader, not the corpus" — and the reader was still promoted on the strength
of one short run. **Never generalize a reader's fitness from a single audit.** Measure over
many runs or do not claim it.

The FORMAT is still sound: forced one-row-per-claim with planted canaries is the right
shape for measuring any reader, and it is what produced this verdict. Only the reader
failed.

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
