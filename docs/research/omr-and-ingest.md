# OMR & Ingest — can we OCR the music?

Research date: **2026-07-16**. Test run: **2026-07-17**. This is the load-bearing
question for the whole project.

---

## ✅ RESULT — Phase 0 test was run 2026-07-17. Audiveris is out.

**Verdict: off-the-shelf OMR fails on this hymnal. Phase 3 is a custom notehead
detector.** The prediction below (that shape notes would defeat it) held — but the
failure mode is more useful than "it crashes."

### What was run
Audiveris **5.11.0** (macOS arm64 DMG, bundles its own JRE — no Java install needed),
batch export on 5 pages including `page-427.png` (hymn 237, diffable against
`237.json`). ~10 seconds per page.

```bash
Audiveris.app/Contents/MacOS/Audiveris -batch -export -output ./out \
  page-427.png page-004.png page-100.png page-200.png page-300.png
```

Note: the DMG carries an AGPL click-through that blocks `hdiutil attach`. Workaround:
`hdiutil convert audiveris.dmg -format UDTO -o out.cdr` then attach the `.cdr`.

### It ran clean and produced garbage

| Check | Result |
|---|---|
| Ran without crashing | **Yes** — well-formed MusicXML, ~10s/page |
| Part structure | **Correct** — 2 parts per page |
| Clef detection | **Correct** — G/line2 (treble), F/line4 (bass) |
| **Voice separation** (the question) | **FAILED.** S+A merged into **chords**, not voices. `voice 2` holds only 1–10 notes out of 67–122 per page. |
| **Time signature** | **WRONG ON EVERY PAGE.** page-427 → `3/4`; the printed page says **3/2**. Others: 2/4, 2/4, 3/4, and page-100 produced **no time signature at all**. |
| **Soprano pitch accuracy** | **10%** — 2/21 exact, 2/21 by pitch class |
| Note count | 21 chord-groups vs 33 true soprano notes — **~1/3 of notes missing** |

Per-page:
```
page-004.mxl  notes= 69  chord-members=24  voice2= 4  timesig=2/4
page-100.mxl  notes=122  chord-members=44  voice2=10  timesig=NONE
page-200.mxl  notes= 69  chord-members=24  voice2= 2  timesig=2/4
page-300.mxl  notes= 79  chord-members=35  voice2= 1  timesig=3/4
page-427.mxl  notes= 67  chord-members=27  voice2= 4  timesig=3/4  (truth: 3/2)
```

Audiveris logged its own distress throughout — `Measure{#4P2} Voice{#1 excess:1/4} too
long`, repeatedly. That's the exact signature of
[issue #839](https://github.com/Audiveris/audiveris/issues/839): bad voice allocation
corrupting measure durations.

### The salvage path was tested and also fails
Since S+A merge as chords, both pitches are still present — and in any hymnal soprano
is the **top note** of a treble chord. So top-of-chord-group *should* recover the
melody:

```
OMR top-of-chord: [60, 67, 67, 60, 67, 71, 60, 62, 67, 67, 76, 72, ...]
TRUTH soprano:    [64, 64, 67, 69, 64, 65, 67, 67, 69, 64, 67, 64, ...]
→ 2/21 match (10%). Not an offset, not a transposition. Noise.
```

### 🔑 The diagnostic that matters
**The layout analysis works. The notehead reading doesn't.** Audiveris correctly found
the staves, the clefs, and grouped 14 vertical S+A pairs. What it got wrong was
**notehead position** — which is exactly what shape notes predict: a triangle or
diamond has a different centroid than a round dot, so the engine misjudges which staff
line it sits on.

So the result isn't "OMR is impossible here." It's:
**the hard part is notehead detection, and the easy part is already solved.**

That shapes Phase 3 concretely:
- **Do NOT** write staff detection, clef detection, or system/measure segmentation from
  scratch. Audiveris does those correctly on this corpus and could plausibly be used
  **for the layout pass only** (AGPL implications apply — see below).
- **DO** build notehead detection tuned to shape noteheads: centroid → staff position
  (pitch), fill state (duration), stem direction (voice). 458 pages of identical
  engraving is the favorable case for template matching.

### Caveats, stated honestly
- **`237.json` is a suspect ground truth.** The audit found its bars don't sum to the
  meter, and the file self-describes as *"first-pass transcription and may need
  refinement."* So "10%" is OMR-wrong measured against possibly-also-wrong.
- **The time signature is not subject to that caveat.** The printed page plainly reads
  **3/2** (verified by eye); Audiveris said 3/4. That's wrong against the paper, not
  against our data. Every duration downstream inherits it.
- oemer was **not** run — Audiveris's failure mode (notehead position, not tooling) is
  a property of the input, and oemer is trained on round noteheads too. Worth 10
  minutes if Phase 3 stalls, but don't expect a different answer.

### ✅ Resolved: the license question
**Audiveris is AGPL v3** — confirmed by the DMG's own click-through licence. This was
listed as unverified below; it's now closed. **AGPL matters if we ship it
server-side**: linking/shipping it in a hosted service triggers source-disclosure
obligations. For a private app among friends this is low-stakes, but if Audiveris is
used for the layout pass in Phase 3, run it as a **separate offline batch process**
producing data files — not linked into the app server.

---

## THE FINDING: Zion's Hymns is a shape-note hymnal

Verified by opening `public/sheet_music/page-427.png` (hymn 237, "Unity") and looking
at it. The noteheads are **triangles, diamonds, squares, and ovals** — Aiken 7-shape
notation. Not round noteheads.

The page also has, all of which compound the problem:
- **Four verses of lyrics** stacked under the treble staff
- **SATB on two staves** — Soprano+Alto share the treble, Tenor+Bass share the bass
  clef, distinguished by stem direction
- 3/2 time (matches `237.json`'s `timeSignature: "3/2"`)

### Why this matters

**Shape notes are the known-worst case for off-the-shelf OMR.** An engine trained on
round noteheads reads a triangle as noise or misclassifies it. In shape notation the
*shape* encodes the solfège syllable while *fill state* (open vs filled) still
encodes duration — so an OMR keying on fill might partially work, but shape
classification will confuse it throughout.

### The precedent is grim, and it's unanimous

In roughly **20 years of shape-note digitization** — Sacred Harp, Christian Harmony,
Southern Harmony, Harmonia Sacra, thousands of tunes across multiple projects —
**not one corpus was produced by OMR.** Every effort that contains real music data
was hand-entered by a human reading the page.

- **shapenote.net** is the corpus of record: ~2,160 Myriad `.mus` + 2,173 MusicXML +
  2,173 PDF. Transcribed largely by **Berkley Moore**, by hand, from photocopies.
  The site's own credits: *"has also transcribed most of these tunes."*
  The only serious computational musicology on Sacred Harp harmony (Robert Kelley's
  corpus studies) runs entirely on that hand-transcription.
- **The sole OMR artifact in the entire space** is Bainbridge & Bell (2003),
  "A music notation construction engine for optical music recognition," *Software:
  Practice and Experience* 33(2):173–200, DOI 10.1002/spe.502. Their **CANTOR**
  system demonstrated a customizable grammar parsing common Western notation,
  **Sacred Harp notation**, and plainsong. It was a research prototype. It produced
  no corpus, nobody in the community used it, and 23 years later nothing descends
  from it.
- Common trap: several projects *sound* like they'd have note data and don't. MSU's
  "The Sacred Harp [Machine readable transcription]" is **lyrics only** — the music
  is 431 JPGs. The Sacred Harp Publishing Company's own repo is **texts and metadata
  only**. fasola.org has no note data and points offsite to shapenote.net.
- LilyPond has native shape-note support (`\aikenHeads`, since 2.13.20), and there
  are shape-note rendering tools — but **all of them render or input notation; none
  ingest a page image.**

## The counter-argument — why this is still tractable

**For our purpose, the shape is redundant information.** The shape encodes the
solfège syllable, but solfège is derivable from staff position + key signature. What
we actually need from a notehead is:

1. **Position** on the staff → pitch
2. **Fill state** (open vs filled) → duration
3. **Stem direction** → voice assignment (S vs A on treble; T vs B on bass)

We never need to classify which of the 7 shapes it is. That converts "read arbitrary
sheet music" into a much smaller closed problem.

**And the corpus is uniquely favorable:** 458 pages, one engraver, one layout, rigid
stem-direction convention, consistent staff spacing. Per-corpus tuning pays off here
in a way it never would on mixed repertoire. The regularity is the asset.

Two hazards that remain regardless of approach:
- **Shared noteheads** — when S and A sing the same pitch, engravers print one
  notehead with two stems (or one notehead meaning both voices). Classic OMR killer,
  common in hymnals.
- **Multi-verse lyrics** stacked under the staff confuse staff detection.

---

## Tool landscape (verified 2026-07-16)

### Audiveris — the best off-the-shelf candidate
- **5.11.0, released 2026-07-11** (five days before this research). Steady cadence:
  5.9.0 Dec 2025, 5.10.x Mar 2026. Actively maintained, no question.
  <https://github.com/Audiveris/audiveris/releases>
- **Exports MusicXML 4.0** (`.mxl`) — a subset of its internal OMR data.
- **Real batch CLI** — this is what makes 458 pages tractable:
  `audiveris -batch -export -output ./out input.pdf`
  <https://audiveris.github.io/audiveris/_pages/guides/advanced/cli/>
- Has an explicit voice model **and a manual "Preferred voice" correction UI** — the
  existence of that UI is itself the accuracy caveat.
- Issue [#839](https://github.com/Audiveris/audiveris/issues/839) (polyphonic): wrong
  voice allocation produces **wrong measure durations in the MusicXML**. Bad voice
  assignment corrupts note data, not just layout. That's also a cheap correctness
  signal — check measure durations.
- **License: believed AGPL v3, NOT VERIFIED.** Check before building on it.
- ⚠️ **Discard the "60–75% accuracy" figure** that dominates search results. It comes
  from `audiveris.com` / `audiveris.net`, which are **not the project** (official is
  the GitHub org + audiveris.github.io). SEO content farms with invented numbers.

### oemer
- MIT, 768 stars, not archived, but **last push 2025-04-18 — ~15 months stale.**
  <https://github.com/BreezeWhite/oemer>
- MusicXML out, `pip install oemer`, Western notation only, no handwriting.
- Claims multi-melody handling via **stem direction** on vertically-coincident note
  groups — exactly the SATB convention. Encouraging in principle, unbenchmarked.
- **The author's own README recommends [homr](https://github.com/liebharc/homr)** as
  more robust with better results. When a maintainer points at a competitor in his
  own README, believe him. homr's current state: not verified.

### Commercial — effectively ruled out
**The scanning products are GUI-only. There is no photo→MusicXML API.**
- **Soundslice** has a data API, but its [docs](https://www.soundslice.com/help/data-api/)
  show the upload endpoint takes MusicXML/Guitar Pro/PowerTab/TuxGuitar —
  **image/PDF scanning is not exposed via API.** GUI only, ~$5/mo.
- **PhotoScore** (Neuratron), **SmartScore** (Musitek): no API, no batch CLI found.
  SmartScore 64 Pro ~$399, ScanScore Pro ~$79/yr, PlayScore 2 / Newzik ~$49.99/yr.
  ([Scoring Notes, 2024-12-10](https://www.scoringnotes.com/reviews/scanning-the-current-omr-landscape/))
- **Enote**: could not verify anything. Unknown.

For 458 pages, GUI-only means 458 manual uploads. That alone disqualifies the tier.

### Accuracy on SATB specifically — the honest answer
**No benchmark of any OMR tool on SATB choral or hymnal scores exists publicly.**
That's the finding; it isn't a failed search. The directional evidence:
- Scoring Notes' 2024 landscape review found every product degraded on multi-voice
  layouts. On Moonlight Sonata, **merely adding a second voice to a measure** tripped
  up Newzik and PlayScore 2 — two voices on a piano staff, structurally the same
  problem as S+A sharing a treble staff and *simpler* than a hymnal.
- Audiveris #839 shows the failure mode is corrupted per-voice data.

Combined with the shape-note issue, expectations for off-the-shelf OMR here should
be **low**.

---

## The alternative nobody should skip: source the data instead

Hymn **tunes** are largely public domain even when a specific hymnal's engraving is
not. Before building any ingest pipeline, check whether the tunes we need already
exist as MusicXML/MIDI somewhere. shapenote.net's ~2,173 MusicXML files are the only
substantial pre-existing shape-note corpus and reusing beats re-keying — but note
licensing (the 1991/2025 Sacred Harp editions are in copyright; the publisher's own
repo is CC BY-NC 4.0, texts only), and note that Zion's Hymns is a *different*
hymnal, so overlap is unknown and unverified.

**Not researched yet:** whether Zion's Hymns (2021) tunes overlap with any existing
machine-readable corpus. Worth an hour before writing any CV code.

---

## Recommended first experiment

> **This was run on 2026-07-17 — see the RESULT section at the top of this file.
> Kept below for the reasoning; the answer is now known.**

**Cost: ~15 minutes. It decides Phase 3 entirely.**

Run Audiveris batch export on **5 pages** from `public/sheet_music/`, including
`page-427.png` (hymn 237) so output can be diffed against the known-good
`237.json`. Run oemer on the same 5 as a control.

```bash
audiveris -batch -export -output ./out page-427.png page-004.png ...
```

**The one question:** on the treble staff carrying Soprano and Alto, do you get
`<voice>1</voice>` and `<voice>2</voice>` correctly split, or one mashed voice?
Check measure durations too — per #839, bad voice assignment shows up as wrong
measure lengths.

**Prediction, stated so it can be falsified:** it fails or produces garbage, because
of the shape notes. Run it anyway — it's 15 minutes, and if the prediction is wrong
the entire ingest problem collapses into a batch loop.

## Verdict

| If Phase 0 shows… | Then ingest is… |
|---|---|
| Voices split cleanly | **A day.** Batch loop + MusicXML per-voice parse. Both trivial. |
| Voices merged/misassigned, notes otherwise OK | **Weeks.** Stem-direction heuristics to re-split post-hoc. |
| Shape notes break detection entirely (**predicted**) | **Custom detector.** Notehead centroid + staff position + fill + stem, tuned to one hymnal. Tractable because the engraving never varies — but it's real CV work. |

**Not a research project either way.** The tools are real, free, maintained and
scriptable today, and the fallback is a well-understood CV problem on an unusually
regular corpus. We don't need to invent anything — we need to find out what works on
this specific hymnal. That's a test, not research.

---

## Could not verify
- ~~Audiveris's license~~ → **RESOLVED 2026-07-17: AGPL v3**, confirmed via the DMG's
  click-through licence.
- Any SATB/hymnal-specific OMR accuracy benchmark — none appears to exist publicly
- Enote's existence or capabilities
- homr's maintenance status, and whether it beats oemer on voice separation
- Whether Zion's Hymns tunes exist in any machine-readable corpus already
- shapenote.net's transcription method is a **strong inference** from artifacts and
  credits, not an explicit statement. No project in this space documents how the
  notes got into the computer.
