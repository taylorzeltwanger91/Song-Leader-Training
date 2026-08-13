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

Arithmetic-verified on both staves, awaiting a second reader — files present here:
**12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24, 25, 26**

Still outstanding:

- **23** — tenor verified (52 events, 60 beats, 15 bars). Bass staff needs one
  measure-grouped read; its flat-list attempt came back 54 pitches against 53 durations.
  Note this hymn shares a tune with 20 and 24 (see below), so its verified tenor matches
  theirs exactly — that is correct, not duplication.
- **27** — treble verified (45/47 events, 48 beats, 12 bars). Bass staff running.
- **28, 29, 30** — reads in progress or not yet started.

### How 14 and 20 were fixed — the format lesson

Both resisted three attempts between them. Every failure was the same shape: the flat
comma-separated duration list came back a different length from its pitch list, or with
the beats in the wrong measures, while the reader asserted it had verified otherwise (one
listed fifteen fabricated per-measure sums).

**Asking for one line per measure, each with its own stated sum, and flattening it here
fixed both on the next attempt** — and is 8-for-8 with zero arithmetic failures since,
against roughly one voice in twelve failing under flat lists. The reading was never the
problem; the serialization was. Both earlier hymn 14 attempts produced a *correct*
per-measure breakdown alongside a broken flat list, and the corrected tenor is 60 events,
exactly the 60 pitches those attempts had.

Use measure-grouped output for the rest of the corpus.

Hymn 14's six disputed bass glyphs (the *fa*-wedge vs half-rest trap) are settled as
**C3 notes**: centroid 134.4 against a C3 space at 131.5 and a half-rest position at ~116,
reproduced independently by two separate measurements.

## Known shared tunes in this range

`check_duplicates.py` will flag these every run. They are **correct** — hymnals reuse one
tune across hymns of matching meter.

- **20 "Labor on" · 23 "Buried With Christ" · 24 "Communion Hymn"** — all D major, 4/2,
  meter 3. 3. 7. 8. 7. 8. 9. 3. 3. Note-for-note identical in all four voices, confirmed by
  independent measure-grouped reads of both staves for 20 and 24. Hymn 24's bass was read
  with no knowledge of hymn 20's and came back byte-identical — an accidental but genuine
  cross-validation of both.

Before treating any future hit as a bug, open both pages and compare the printed meter
line, key, time signature and music. See the shared-tune section in ../../README.md.
