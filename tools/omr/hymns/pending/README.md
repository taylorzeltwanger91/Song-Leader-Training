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

## Verification pass — 2026-08-18

All 14 pending hymns (28 staves) were re-checked by handing a reader the existing
transcription measure by measure and asking only "which of these does the page
contradict?" — see `make_verify_prompt.py` and `show_measures.py --claim`.

**One real transcription error found**, and it is the whole argument for the method:

- **hymn 22, bass, m9 beat 3 — read E3, page shows C#3.** Corrected. It survived every
  other check we run: durations were unchanged so the arithmetic passed, harmony tied at
  exactly 10 dissonances with either note, and duplication checking is irrelevant to it.
  Confirmed by pixel — a filled ti-cone, flat top at D3, point toward B2, centred in the
  C3 space (ti = C# in D major), with nothing on the E3 line.

**Two flags were defects in the rendering, not the data** — both times the verifier was
right that the page contradicted the claim it was given:

- hymn 18 alto: F#4 rendered as Gb4 (`'C'` was in the FLATS set; fixed).
- hymn 28 alto: E#4 rendered as F4 (`show_measures.py` has no enharmonic spelling; same
  MIDI, cosmetic only).

**The method is calibrated in both directions**, which matters more than the single catch:

- *Positive control*: a single note was deliberately altered (soprano D5 -> B5) in a claim
  the pass had already cleared. It flagged exactly that note — with the shape, the staff
  position, a parallel-phrase cross-check, and a negative check that nothing sat where B5
  would be — and nothing else.
- *Negative control*: hymn 25, whose "four bad measures" were a hand-copied claim of mine,
  returns clean on both staves once the claim is piped.
- *Cost*: 50-133k tokens and 2-12 minutes per staff, roughly a third of a full read.

Previously-uncertain calls confirmed by the pass: hymn 27's alto G4 under C#5 (the seventh
of an A7), hymn 16's phantom eighth flag as unattached bleed-through, hymn 28's stitched
measure 8 across a two-agent split, hymn 29's key as G major, and hymn 30's three-notehead
divisi chord as real ink.

**This still is not a second independent reading.** It is one reader checking another
reader's work on the same images, and the residual risk is a wrong note that both passes
read the same way. What it does is make the remaining human/GPT budget worth far more,
because it is spent on data already scrubbed rather than on generating disputes.
