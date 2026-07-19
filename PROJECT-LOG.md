# Project Log

> Append-only log of major decisions, milestones, research findings, and data sources.
> New entries go at the TOP. Don't edit old entries — add new ones to correct/supersede them.
> Used to preserve the *why* behind decisions across many sessions over many months.
>
> **Format:** `## YYYY-MM-DD — Short title` (one ## heading per entry)
> **Rules:**
> - Never delete entries. Mark things as superseded instead: `> SUPERSEDED YYYY-MM-DD: see entry below`
> - Keep entries scoped to decisions/research/milestones — not day-to-day task progress (that goes in SESSION-HANDOFF.md)
> - Include file paths, data locations, and reasoning so future sessions can verify
> - Date format is always absolute (YYYY-MM-DD), never relative ("yesterday", "last week")

---

## 2026-07-19 — Ingest PIVOT: dual vision-model consensus. Hymn 237 fully verified.

The custom CV detector is parked and off-the-shelf OMR is abandoned. **Ingest is now
vision-LLM reading**, and this is proven end to end on hymn 237, not hypothesized.

**How we got here in one session:**
- Built a from-scratch OpenCV notehead detector. Staff detection was perfect and lyric
  rejection worked, but pitch accuracy plateaued at ~27% (vs the unverified `237.json`)
  after 6 iterations — the notehead-center + voice-separation problem on shape notes is a
  real ceiling. Parked, but its **staff detection is retained** for per-system cropping.
- Confirmed the blocker was bad ground truth: `237.json`'s pitches were the unverified
  first pass, and by eye they were wrong. Data-sourcing research (2026-07-19) found no
  external note data to source, but found zionsharp.info's per-hymn 4-part MP3s.
- The MP3-as-ground-truth idea failed (pYIN on a 4-part mix tracks the *bass*, not the
  soprano — the polyphonic problem).
- **The breakthrough:** vision models read the page directly. Fable read the soprano
  (32 notes). GPT-5.6, given the same prompt independently, agreed on **31 of 32**. The
  one disagreement (system 1 note 7: A4 vs F4) was resolved to **A4** by pixel geometry
  — the detector measures it at the identical height (to 0.1px) as the adjacent note both
  models call A4, and relative position is immune to the detector's absolute bias.
- Galen's ear confirmed the read (rendered to audio, "almost exactly right").
- A second Fable pass read the **durations**; every interior bar sums to the 3/2 meter
  (1-beat pickup + 2-beat final = anacrusis).

**Why vision-LLM succeeds where OMR failed — worth internalizing:** shape noteheads
encode pitch *redundantly* (shape = solfège syllable, position = pitch). That redundancy
is noise to classical OMR but a cross-check to a vision model. The feature that killed
Audiveris is the feature that makes the vision read reliable. Full recipe in
`docs/research/DIRECTION.md` Phase 3.

**Hymn 237 is now our first fully-verified hymn.** `237.json` rebuilt: 32 soprano notes,
consensus pitches, vision-read durations, bars validated. It grades a perfect performance
to 100 (and a bass singing it an octave down to the same, per the Phase 1 grader).

**Model decision, answering "would Fable do better":** yes, for *reading* the notes —
not because the model is magic, but because the vision-LLM approach exploits shape/position
redundancy that CV throws away. Fable and GPT-5.6 both did well; using two independent
models as a consensus check is the method, not either one alone.

**Data-model change (a slice of Phase 2, forced by 237's pickup):** added an explicit
`onset` field (absolute beats from start) as the timing source of truth. `measure*beats +
beat` cannot represent an anacrusis (bar 0 is shorter than the meter); `onset` can, and it
is what the grader now uses first. `melody-data` validation grew to allow a pickup/final
anacrusis and to check `onset` equals cumulative duration. 23 tests pass (was 19).

**Verification assets in ~/Downloads (not committed):** `unity_237_FINAL.wav`/`.mid` (the
verified transcription), the A/B files that proved the old data wrong, and
`hymn237_unity.pdf` + prompt used for the GPT-5.6 cross-check.

## 2026-07-17 — Phase 1 shipped: the grader tells the truth now, and it's gated

Commit `070e215`. Measured on real hymn 237 data, a **perfect** performance:

| | before | after |
|---|---|---|
| at written pitch | 98 (33/33) | 100 (33/33) |
| **one octave down** (any bass) | **0 (0/33)** | **100 (33/33)** |
| one octave up | 0 (0/33) | 100 (33/33) |

Every change was proven by a test that failed first, then passed.

**Decision: fully octave-agnostic, not octave-tolerant.** The stranded M001 branch folds
distance into pitch class ± an octave-shift term. Phase 1 goes further and drops octave
entirely — simpler, and strictly better for hymnody where singing in your own register
is the norm. It also makes the pitch detector's worst failure mode (octave-doubling
errors) vanish as a class rather than needing to be handled, which is precisely why
UltraStar does the same (`docs/research/grading-methodology.md`). **This supersedes the
M001 grading work.** What's still stranded on that branch is auto-clef selection and the
extracted `melody-generator.js` — logged in TECH-DEBT, Taylor's call.

**Decision: delete the Count-off score rather than fake it.** It was
`stabilityScore * 0.9 + 10`. Nothing measures a count-off. Removed the value and the bar;
it comes back when something real is behind it.

**Decision: `237.json`'s bars were corrected, not rewritten.** Measures 0/3/11/12 summed
to 5/2/4/1 in 3/2. The authored `beat` onsets were already self-consistent (verified: no
note's `beat + dur` disagreed with the next note's `beat`), so the beats are right and
the durations drifted. Corrected only the final note's duration in each bad bar. The
corrections **net to zero** — total stays 39 beats = 13 bars × 3 — so this redistributes
rather than invents. Corroborating: the last note lands on "strive." held for a full bar,
which is what a hymn ending does. **The pitches remain unverified against the printed
page.**

**Decision: tests are wired, not suggested.** `prebuild` now runs `lint && test`. 19
tests: 11 on the grader, 8 validating melody data (bars sum to the meter, onsets agree
with durations, no note overruns its bar). That data-validation suite is the ingest gate
any future transcription — hand-entered or OMR-derived — has to pass. This is the gate
that would have caught M001's loss in April.

**Dependency added: vitest** (dev-only). `AGENTS.md` says ask before adding deps; Phase 1
required tests and vitest is the natural pair for Vite. Flagged for Taylor.

**Found while testing, not fixed:** match windows overlap. The ±150ms early tolerance
reaches into the previous note's frames, so on an ascending line a note can match its
predecessor's audio — a singer drifting sharp gets credit they didn't earn. Logged in
TECH-DEBT. The honest note: this was discovered because a test failed for a reason I
hadn't predicted, and the test was rewritten to isolate its actual subject rather than
widened to pass.

## 2026-07-17 — Phase 0 run: off-the-shelf OMR fails. Phase 3 is a custom detector.

Ran the 15-minute test. **Audiveris 5.11.0 is out.** Full results and repro command in
[`docs/research/omr-and-ingest.md`](./docs/research/omr-and-ingest.md).

**It ran clean and produced garbage** — which is the worst failure mode, and worth
naming: no crash, well-formed MusicXML, correct part/clef structure, ~10s/page. Then:
- **Voice separation failed.** S+A merged into *chords*, not voices — `voice 2` carried
  1–10 notes out of 67–122 per page.
- **Time signature wrong on all 5 pages.** page-427 read `3/4`; the printed page says
  **3/2** (verified by eye, so this is wrong against the paper, not against our
  possibly-suspect `237.json`). One page produced no time signature at all.
- **Soprano pitch accuracy 10%** (2/21), and pitch-class matching doesn't rescue it.
- ~1/3 of notes missing.
- The salvage heuristic — take the top note of each treble chord group, since soprano
  is always on top in a hymnal — was tested and also returns noise.

**The diagnostic that shapes Phase 3:** the *layout* analysis works. Audiveris found
staves, clefs, and 14 correct vertical S+A pairings; what it got wrong was **notehead
position** — precisely what shape noteheads predict (a triangle/diamond centroid sits
differently than a round dot, so the staff-line assignment is off). So:
- **Don't** rebuild staff detection, clef detection, or measure segmentation. Audiveris
  does those correctly on this corpus and could serve as the layout pass.
- **Do** build notehead detection tuned for shape notes: centroid → staff position,
  fill state → duration, stem direction → voice. 458 identically-engraved pages is the
  favorable case for template matching.

**Resolved: Audiveris is AGPL v3** (confirmed by the DMG's click-through licence —
previously listed as unverified). Implication if it's used for the layout pass: run it
as a **separate offline batch process producing data files**, not linked into a hosted
server, or the source-disclosure obligation attaches.

oemer was not run. Audiveris's failure is a property of the input (shape noteheads),
not of the tool, and oemer is trained on round noteheads too. Worth 10 minutes if
Phase 3 stalls; don't expect a different answer.

**Cost of knowing this: 15 minutes.** Which was the entire point of sequencing it first.

## 2026-07-16 — Research landed; backend approved; soprano-first; direction set

Research done across five tracks (OMR/ingest, competitive landscape, grading
methodology, multiplayer architecture, full code audit) and committed to
[`docs/research/`](./docs/research/). The proposal that came out of it is
[`docs/research/DIRECTION.md`](./docs/research/DIRECTION.md). Highlights that
changed how we think about this:

**1. Zion's Hymns is a shape-note hymnal.** Verified by opening
`public/sheet_music/page-427.png` — the noteheads are triangles, diamonds, squares
and ovals (Aiken 7-shape), with four verses of lyrics stacked beneath. Shape notes
are the known-worst case for off-the-shelf OMR, and in ~20 years of shape-note
digitization **no corpus has ever been produced by OMR** — Sacred Harp, Christian
Harmony, Southern Harmony are all hand-entry. The one OMR artifact in the space is a
2003 research prototype that shipped nothing.

*But* the shape is **redundant for our purpose**: solfège is derivable from staff
position + key, so we need notehead position (pitch), fill state (duration), and stem
direction (voice) — never the shape itself. And 458 pages from one engraver with rigid
layout is an unusually favorable CV problem. Ingest is a test, not research.

**2. Nobody has shipped this.** OMR products refuse to listen; grading products refuse
to let you import; the entire choral category (Cyberbass, ChoraLine, LearnMyPart,
Choir Player) is playback-only that never evaluates the singer. The join is unserved.

**3. Grading has a known-good design to copy.** UltraStar ignores octave *on purpose* —
it makes octave-doubling detector errors vanish as a class. That supersedes the
pitch-class fold on the stranded M001 branch: simpler, and strictly better for hymnody
where men singing an octave down is the norm.

**4. The audit found a second silent-wrong-output bug and a fabricated measurement.**
`237.json`'s bars don't sum to the meter (m0=5.0, m3=2.0, m11=4.0, m12=1.0 in 3/2),
the authored `beat` field is discarded, and timing is rebuilt by cumulative summing —
so notes drift up to 2 beats against a ±150ms window. Separately, the "Count-off"
score on the results screen is `stability * 0.9 + 10` — nothing measures a count-off.

### Decisions made (Galen, 2026-07-16)

- **A backend is approved. The "client-side only, no backend, no auth, no env vars —
  by design" guardrail is RETIRED.** It was the single largest blocker to the vision,
  and it was governance, not engineering: every agent reading `AGENTS.md` or
  `CLAUDE.md` would have refused or routed around the goal. Updated in both files.
- **Soprano is the priority part** — it's what gets sung and what a song leader leads
  with. **But we parse all four voices.** Soprano-first is sequencing, not scope: the
  data model, ingest pipeline, and part-picker are built for SATB from day one;
  soprano is what we wire up and validate first.
- **Private app among friends. Copyright is handled by the owners** and is not an
  engineering constraint.
- **Research lives in the repo**, not in a scratch folder — this is a collaboration and
  Taylor should see the findings.

### Sequencing (the non-obvious call)

Phase 0 (15-min OMR test) → Phase 1 (fix grader + first tests) → Phase 2 (SATB data
model) → Phase 3 (ingest) → Phase 4 (layout) → Phase 5 (rooms).

**Layout redesign is deliberately AFTER the data model.** The current IA is built
around one soprano line; the vision is multi-part. Part selection is a top-level
navigation concept that cannot exist until the data can express parts. Redesign now
and we redesign twice.

## 2026-07-16 — The goal, stated

Recorded from Galen, 2026-07-16. Until now nothing in the repo said where this was
going; this entry is the north star everything else should be measured against.

**Ownership:** Taylor's project. Galen and Taylor collaborate on it. It is a
sideline / fun project — that sets the bar for scope and urgency. Not commercial,
no customers, no deadline. `huz` is Taylor's OpenClaw agent.

**The vision:**

1. **Upload a piece of music** — possibly just a photo of a page.
2. **OCR the music** — recognize the notes, separated by voice part (soprano, alto,
   tenor, bass).
3. **Sing it.** A cappella, or with the option to play the melody back on a
   keyboard-type voice first as a reference.
4. **Grade the singer** on how well they held **pitch** and **timing** through the
   song.

**What this reframes:** the "only 1 of 250 hymns has melody data" gap in
`TECH-DEBT.md` is not a data-entry chore to grind out — it's a *symptom* of the
missing OCR step. `public/sheet_music/` already holds 458 scanned page PNGs of
Zion's Hymns (2021). If music OCR works against those pages, it closes the
249-hymn gap and delivers the core product feature with the same work. They are the
same problem, and the scanned pages are a ready-made test set.

**Where the current code sits against that vision:**

| Vision step | State |
|---|---|
| Upload / photo of music | not started |
| OCR notes, per voice part (SATB) | not started — **the hard part, and the whole product** |
| Reference playback (keyboard voice) | done — soundfont church organ, lead-in playback |
| Sing a cappella + detect pitch | done — YIN via AudioWorklet |
| Grade pitch | done, **but octave-strict and wrong** (see below) |
| Grade timing | done — rhythm scoring in `grader.js` |

So the back half of the pipeline (detect → grade) is built and the front half
(ingest → OCR → notes) does not exist. Hymn 237's hand-made `237.json` is the only
thing currently feeding the built half.

**My honest read on step 2, recorded so it isn't a surprise later:** Optical Music
Recognition is the genuinely hard part of this project, and it is much harder than
text OCR. Multi-voice SATB on a shared grand staff — which is exactly what a hymnal
looks like — is a known weak spot for OMR engines; voice separation is where they
degrade. Open-source options exist (Audiveris → MusicXML; oemer) and commercial
ones do too. None are turnkey for this, and photo-of-a-page input is harder than
clean scans.

**Recommendation, not yet decided:** spike OMR against ~5 real pages from
`public/sheet_music/` before designing anything around it. That's a few hours and it
answers whether the vision is a weekend of plumbing or a research project. Do not
build the upload UI first.

## 2026-07-16 — Project memory structure added; M001 found stranded on an unmerged branch

**Decided:** this repo gets a written memory layer (this file, SESSION-HANDOFF.md,
TECH-DEBT.md, CHANGELOG.md, AGENTS.md). Rationale: two people and at least one
coding agent commit here, and until now the only durable context was a
scan-generated `CLAUDE.md` plus a `.gsd/PROJECT.md` snapshot that described the
present tense and nothing else. Nothing in the repo stated where the project was
going, so both humans were reconstructing intent from git log.

**Found while auditing (the important part):** milestone **M001 — Octave Selection
& Notation/Pitch Fixes** was planned and implemented by an agent (`huz-agent`) on
branch `origin/huz/1319110013384ed4a3be779f7ced8246`, dated 2026-04-07. **That
branch was never merged.** Its full planning set — `M001-ROADMAP.md`,
`M001-CONTEXT.md`, `M001-VALIDATION.md`, per-slice PLAN/SUMMARY/UAT docs (22 files,
878 lines) under `.gsd/milestones/M001/` — exists only there.

What landed on `main` instead was a **different, partial** huz branch
(`huz/df21108a0f314336ba6b1b14b3dbc861`), squashed to commit `b16dbb1` and merged
by Taylor in `244cf7f` on 2026-04-11. Verified difference between `main` and the
unmerged branch:

| M001 goal | On `main`? | Evidence |
|---|---|---|
| Octave anchor for generated melodies | partial | `App.jsx:57` `scaleDegToMidi(root, deg, octave=4)` takes the param |
| Melody generator extracted to own module | **no** | `src/audio/melody-generator.js` (222 lines) exists only on the branch |
| Auto clef selection from note range | **no** | `NotationDisplay.jsx:135` still hard-codes `clef = 'treble'` |
| **Octave-tolerant grading** | **no** | `grader.js:134-142` still uses `Math.abs(candidate.midi - expected.midi)` with `matched = bestDistance < 1` |

**Why this matters:** M001-CONTEXT.md documents the original user report — pitch
detection "feels out of whack." The diagnosis recorded there is that the *engine*
is fine and the *grader* is octave-strict: a singer performing the melody one
octave from the reference hits `distance = 12` and is scored as missing every
note. The fix (pitch-class folding, `grader.js` lines ~119-126 on the branch) was
written, task-tracked, and UAT'd — and then not merged. So the bug the milestone
existed to kill is still live in `main` today.

**Not decided yet:** whether to merge that branch, cherry-pick the grader fix, or
rewrite it. Deferred to Taylor — it's his repo and his agent's work. Logged in
TECH-DEBT.md as the top active item.

**Also established:** GitHub remote is `taylorzeltwanger91/Song-Leader-Training`.
This is a collaboration, not a solo Precision Farms project. Nothing gets pushed
here without Taylor's sign-off.

## 2026-04-07 — M001 milestone planned and built by agent (recorded retroactively)

> Recorded 2026-07-16 from branch artifacts, not written at the time.

`huz-agent` planned and executed M001 across two slices: S01 (octave selection +
clef-aware notation) and S02 (octave-tolerant grading + pitch-engine range hint).
Both marked ✅ in `M001-ROADMAP.md`. Stated vision: "Singers can pick an octave
(2–5) for generated exercises, see the melody on the right clef with no ledger-line
wall, and have their performance graded correctly even when they sing the melody an
octave away from the reference."

Explicit out-of-scope for M001, per `M001-CONTEXT.md` — useful as a record of what
was deliberately punted, not forgotten:
- Bass-clef rendering for the hymn-practice flow (hymns load from MIDI; clef
  inference there is a separate concern)
- Multi-voice / SATB practice — single-line only
- Per-note octave selection in the editor — single octave anchor per exercise

Constraints the milestone worked under: no new dependencies without approval,
client-side only, and no new code in `App.jsx` (already ~1,380 lines).
