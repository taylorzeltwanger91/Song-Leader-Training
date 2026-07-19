# Direction

Written **2026-07-16**, from the research in this folder. This is *where we think we
should go and why* — a proposal shaped by evidence, not a committed roadmap. Committed
decisions live in [`PROJECT-LOG.md`](../../PROJECT-LOG.md); milestones follow the
`.gsd/milestones/` convention.

---

## The goal

**Upload or photograph a piece of music → OCR the notes per voice part (SATB) → sing
it a cappella (with optional keyboard reference playback) → get graded on pitch and
timing.** Long term: multiplayer sing-off rooms.

**Soprano is the priority part** — it's what gets sung, and it's the melody a song
leader leads with. But **if we're parsing the music apart, we parse all four voices.**
Soprano-first is a sequencing decision, not a scope limit: the data model, the ingest
pipeline, and the part-picker are all built for SATB from day one, and soprano is
simply what we wire up and validate first.

## Ownership and constraints (settled 2026-07-16)

- **Taylor's project**, joint collaboration with Galen. Sideline/fun. No customers, no
  deadline. `huz` is Taylor's OpenClaw agent.
- **Private app among friends.** Zion's Harp copyright is handled by the owners and is
  not an engineering constraint.
- **A backend is approved.** The old "client-side only, no backend, no auth, no env
  vars — by design" guardrail is **retired**. It was the single biggest blocker to the
  vision and it was governance, not engineering.

---

## What the research established

1. **Nobody has shipped this.** OMR products (PlayScore, Soundslice, Newzik) scan music
   and refuse to listen. Grading products (Yousician, Simply Sing, Sing Sharp) grade
   your voice and refuse to let you import. The entire choral category — Cyberbass,
   ChoraLine, LearnMyPart, Choir Player — is **playback-only that never evaluates the
   singer**. ~25,000 ChoraLine singers a year, not one gets told they're flat. **The
   join is unserved.**
2. **Zion's Hymns is a shape-note hymnal**, and shape notes are the worst case for
   off-the-shelf OMR. In ~20 years of shape-note digitization, **no corpus has ever
   been produced by OMR** — it's all hand-entry. *But the shape is redundant for our
   purpose* (position + fill + stem is all we need), and 458 pages of identical
   engraving is an unusually favorable CV problem.
3. **Karaoke solved grading 20 years ago** and the answer is **octave-agnostic,
   semitone-band matching**. UltraStar ignores octave *on purpose*, which makes
   octave-doubling detector errors vanish as a class — and it's exactly right for
   hymnody.
4. **The app's grading is confidently wrong in two independent ways**, and one screen
   displays a **fabricated measurement**.
5. **Live audio jamming is physically off the table** (~25–30 ms one-way needed; Wi-Fi
   tails alone blow it). But **one-directional audio has no latency constraint** —
   which makes pass-the-mic spectating both feasible and the fun option.

---

## The plan

### ~~Phase 0 — The 15-minute test~~ ✅ DONE 2026-07-17 — Audiveris is out

Ran Audiveris 5.11.0 batch export on 5 pages. **The prediction held: it fails.** Full
results in [omr-and-ingest.md](./omr-and-ingest.md).

It ran clean and produced garbage: voices merged into chords (not separated), **time
signature wrong on every page** (3/4 where the paper says 3/2; one page got none at
all), soprano pitch accuracy **10%**, a third of notes missing.

**The useful part — the layout analysis works; the notehead reading doesn't.**
Audiveris found the staves, clefs, and vertical S+A pairings correctly, and misread
notehead *positions* — exactly what shape noteheads predict (different centroid than a
round dot → wrong staff line). So Phase 3 doesn't start from zero: **don't rebuild
staff/clef/measure segmentation; do build shape-note notehead detection.**

Also resolved: **Audiveris is AGPL v3** (confirmed via the DMG's click-through). Run it
as an offline batch process producing data files, never linked into an app server.

~~Still open: check whether Zion's Hymns tunes already exist in any machine-readable
corpus.~~ ✅ DONE 2026-07-19 — see [data-sourcing.md](./data-sourcing.md). Verdict:
**no note-data set exists for this book, and sourcing won't replace the detector** (the
tune stock is German/Continental and absent from English corpora; name-matching is
unreliable — the target tune UNITY has a same-name/same-composer decoy in hymnary that
is a different tune). Two things did come out of it: the hymnal is actually the
**Apostolic Christian Zion's Harp shape-note edition (256 hymns), not Mennonite**; and
**zionsharp.info has per-hymn 4-part MP3s for all 256 hymns** — a real audio ground
truth we can pitch-track to break the detector-validation deadlock.

### Phase 1 — Fix the grader, gate it with tests ⟵ independent of everything
This is the difference between an app that works and one that lies. Do it regardless
of Phase 0's outcome.

- **Go octave-agnostic** (UltraStar's design). Supersedes the pitch-class fold on the
  stranded M001 branch — simpler and strictly better for us.
- **Delete the fabricated Count-off score.** Measure it or remove the bar.
- **Use absolute onsets; stop discarding the authored `beat` field.** Fix `237.json`'s
  bar sums (m0=5.0, m3=2.0, m11=4.0, m12=1.0 in 3/2 time).
- **Remove detector confidence from the pitch grade.** A cheap mic shouldn't cost
  pitch points.
- **Disable Begin when there's no melody data**, instead of walking users through a
  ceremony that returns three red zeros.
- **First tests on the value path.** The grading math is the product and has zero
  tests. This is what would have caught M001's loss in April.

### Phase 2 — The data model ⟵ the change that propagates everywhere
`[{midi, dur, measure, lyric}]` is the lingua franca between parser, generator,
notation, and grader. Change it once and every consumer follows:
- **voice/part tag** per note (SATB)
- **absolute onsets** (measure + beat)
- **rests, first-class** — their absence is *why* the bars don't sum
- **ingest-time validation** that each bar sums to the meter

Then wire the part-picker that's already ~80% built: `midi-parser.js` models tracks,
App already stores `selectedTrack` and never renders a selector. **Soprano is the
default; all four parts are selectable.**

### Phase 3 — Ingest ⟵ PIVOTED 2026-07-19: dual vision-model consensus, NOT CV

**The custom CV detector is parked. Off-the-shelf OMR is dead. Ingest is vision-LLM
reading.** This was proven, not guessed — see PROJECT-LOG 2026-07-19:

- Audiveris (off-the-shelf OMR): failed on shape notes (Phase 0).
- Custom OpenCV notehead detector: reached ~27% pitch accuracy after 6 iterations,
  with a clear ceiling. Parked.
- **Two independent vision models (Fable + GPT-5.6) reading the same page agreed on
  31 of 32 soprano notes.** The 32nd was resolved by pixel geometry and confirmed by
  ear. A second Fable pass read the durations; every interior bar summed to the meter.
  Result: **hymn 237 is fully transcribed and verified**, and grades a perfect
  performance to 100.

**Why vision-LLM wins where OMR failed — the key inversion:** shape noteheads encode
the pitch *twice* (the shape = solfège syllable, the position = pitch). That redundancy
*breaks* classical OMR (unexpected glyphs) but *helps* a vision model, which cross-checks
shape against position. The exact feature that killed Audiveris is the feature that makes
the vision read reliable.

**The proven ingest recipe:**
1. Detect staves and crop per-system treble/bass images (the CV staff-detection from the
   parked detector is genuinely good and is retained *for this cropping step only*).
2. Read each voice with two independent vision models, shape-note-aware prompt.
3. Where the models agree, accept. Where they differ, resolve by pixel geometry
   (relative position to a confirmed note is bias-immune) and/or ear.
4. Read durations the same way; validate every interior bar sums to the meter (the
   `melody-data` test suite is this gate) before accepting.
5. A human (Taylor/Galen) spot-checks by ear — the final authority.

**Do not build an upload UI first.** Prove the recipe over the 458 pages we have.
Cost note: ~85–130k tokens and ~7–16 min per page per model — fine as an offline batch,
not real-time.

### Phase 4 — Layout redesign ⟵ deliberately *after* Phase 2
The layout genuinely isn't ideal (see the audit: the hymn flow is the poor cousin of
the generator flow, results are unreadable rings while the actionable feedback hides in
a "Debug Info" panel, zero media queries with a 580px floor on a 375px phone). **But
part selection is a top-level navigation concept that can't exist until the data can
express parts. Design now and you design twice.**

### Phase 5 — Rooms
**Pass-the-mic spectating**, not score-only sync. One sings, everyone watches the score
climb, mic passes. One-directional audio has no latency budget, so friends actually
hear each other — which is the entire point of hymn singing. Supabase Realtime
broadcast, 4-char room codes, no auth, ~200–300 lines.

**Honest MVP before that:** async leaderboard. One table, no realtime at all.

---

## Sequencing rationale

The order is **not** "most exciting first." It's:

1. **Phase 0 is 15 minutes and determines the size of Phase 3.** Never design around
   an unknown you can test today.
2. **Phase 1 is independent and fixes live wrong output.** The app currently tells
   correct singers they're wrong. That gets fixed before anything is built on top of
   it — and the tests written here are what stop the next M001 from vanishing.
3. **Phase 2 before Phase 4** because the data model determines the navigation. This
   is the non-obvious one and it's the most important sequencing call in the plan.
4. **Phase 5 last** because it's the least load-bearing and the most fun to get wrong.

## Known risks

| Risk | Mitigation |
|---|---|
| Shape notes defeat all off-the-shelf OMR | Phase 0 tests it in 15 min; fallback is a custom detector on a fixed, regular corpus |
| Hand-entry becomes the only path (as it was for every Sacred Harp project) | Soprano-only hand-entry for a useful subset is finite; check for an existing corpus first |
| The unmerged M001 branch conflicts with Phase 1 | Phase 1 supersedes it (octave-agnostic > octave-tolerant). Read it for ideas; don't fight the merge. |
| Agent-written code nobody reviewed | ~8 `huz-agent` commits touch audio/notation. Review before building on them. |
| Supabase free project pauses after 1 week idle | Unverified whether Realtime traffic counts as activity. Test before Phase 5. |

## Open questions

1. Does any machine-readable corpus already contain Zion's Hymns tunes? (1 hour to check)
2. What to do with the unmerged M001 branch — merge, cherry-pick, or abandon in favor
   of Phase 1? Taylor's call; it's his agent's work.
3. Audiveris's license (believed AGPL v3, unverified) — matters if we ship it server-side.
