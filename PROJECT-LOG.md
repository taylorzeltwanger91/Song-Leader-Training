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
