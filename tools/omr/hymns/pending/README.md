# Pending reads — SINGLE READER, NOT VERIFIED

Reads in this directory came from **one reader (Fable)** and have passed only the
mechanical checks: pitch/duration list lengths match, all four voices total the same
beats, the durations tile into whole measures, and the read is not a duplicate of another
hymn (`check_duplicates.py`).

**They have NOT had a second independent read.** Do not assemble them into
`public/hymn_satb/`. The rule that exists because GPT once transcribed hymn 2's entire
bass wrong — plausible, harmonically impossible, and nearly shipped — is two independent
readers on both staves. Arithmetic cannot catch a wrong note that carries a right
duration; only a second reader or a pixel measurement can.

To finish one: get a second read (GPT-5.6 via the prompts in each hymn's archive folder),
score it with `ser.py`, adjudicate any disagreement by harmony (`harmony_scan.py`) and by
measuring the notehead against the staff lines, then move the reconciled source up to
`tools/omr/hymns/` and assemble.

## Status of the 12–30 batch (2026-08-13)

Arithmetic-verified on both staves, awaiting a second reader:
**12, 13, 15, 16, 17, 18, 19, 21, 22, 25**

Open problems:

- **14** — the two Fable reads of the bass staff agree on 46 of 52 events and disagree on
  six, all the *fa*-wedge vs half-rest ambiguity (see the README's trap section). Pixel
  measurement resolved them as **C3 notes, not rests** (glyph at y=133.5; C3 space 131.5,
  half-rest position ~116). Both runs also botched the flattened tenor duration list the
  same way while producing a correct per-measure breakdown. Needs one clean read.
- **20** — bass voice failed twice. First attempt: right total, wrong distribution across
  barlines. Second: 54 pitches against 53 durations, while claiming programmatic
  verification and listing fifteen fabricated per-measure sums. A third attempt using
  measure-grouped output (one line per bar, each summing to the meter) was launched and
  died on a session limit. The tenor voice verified correctly all three times.
- **23** — both staves returned **hymn 20's music**, from crop files verified to be
  different images of different pages. Discard entirely and re-read. This is what
  `check_duplicates.py` now exists to catch.

Never read: **24, 26, 27, 28, 29, 30**.
