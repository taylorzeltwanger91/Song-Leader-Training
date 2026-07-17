# Current App Audit

Audit date: **2026-07-16**. Based on a full read of `src/App.jsx` (1,431 lines), the
four audio modules, both components, the data files, plus lint and data arithmetic.
Findings cite `file:line`.

---

## The app as it exists

**No router.** Seven screens switched by one integer, `V = {HOME:0, HYMNS:1, GEN:2,
PRAC:3, RES:4, GEN_PRAC:5, GEN_RES:6}` (`App.jsx:410`), held in `vw` state (`:414`).
**No URLs, no deep links, no browser back; refresh resets to HOME.**

| Screen | Line | What's there |
|---|---|---|
| HOME | 1231 | Two cards → hymns / generator; mic test with `PitchVisualizer` |
| HYMNS | 1305 | Search by title/number; list of 250 hymn cards |
| PRAC | 886 | 50/50 split: sticky sheet viewer (page nav, zoom 50–200%) + mode toggle, lead-in settings, notation, Begin |
| RES | 1015 | 3 rings (Pitch/Rhythm/Leadership), breakdown bars, tempo line, feedback |
| GEN | 1324 | 7 meters, tempo, measures, key, octave, syllable complexity, melisma |
| GEN_PRAC | 1046 | Notation, count-in, live "Detected:" readout, metronome, starting pitch, play melody, mic test |
| GEN_RES | 1164 | 2 rings, notation, **Debug Panel with note-by-note results** |

All ~30 `useState` + 10 refs live in `App` (`:413–462`). **No persistence anywhere** —
no localStorage, no URL params. Nothing remembers a score, a setting, or a hymn.

---

## The critical defects

### 1. Octave-strict grading — silent wrong output
`grader.js:134` computes `Math.abs(candidate.midi - expected.midi)`; `:142` accepts
`matched = bestDistance < 1`. **A singer one octave from the reference scores distance
12 on every note → marked as missing all of them → score 0.**

This is the bug milestone M001 existed to fix. The fix was written and UAT'd on
`origin/huz/1319110013384ed4a3be779f7ced8246` and **never merged** (see
`PROJECT-LOG.md`, 2026-07-16). Live in `main` since April.

### 2. A fabricated measurement
The "Leadership Test" mode changes a button label (`:980`) and a sentence (`:896`).
**Grading is byte-identical.** Worse: the results screen shows a **"Count-off" score
bar** (`:1020`) — but nothing measures a count-off. It is:

```js
Math.round(stabilityScore * 0.9 + 10)   // grader.js:851
```

An invented number presented as a measurement, on the screen whose entire purpose is
measurement.

### 3. Hymn 237's data is malformed, and the grader can't see it
`237.json` is 3/2 time — every measure should sum to 3 beats. Computed per-measure
duration sums:

```
m0: 5.0    m3: 2.0    m11: 4.0    m12: 1.0    (all others 3.0)    total: 39.0
```

The total happens to come out right, so nothing catches it. But `grader.js:78–100`
(`buildExpectedTiming`) builds timing by **cumulatively summing `dur`** — so
individual notes drift up to **2 beats (2 full seconds at bpm 60)** from their
notated position, against a **±150 ms** match window (`grader.js:110–111`).
**A perfect performance of the printed page grades as missed on the affected notes.**

Two compounding facts:
- **The `beat` field is authored in the JSON and thrown away.** The loader
  (`App.jsx:519–525`) takes `midi, dur, measure, lyric` and drops `beat` — which is
  exactly the data that fixes this.
- `NotationDisplay` calls `setStrict(false)` (`:280`), so VexFlow renders the
  malformed 5-beat bar without complaint, **hiding the defect**.

### 4. 249 of 250 hymns are a trap
Code path (`App.jsx:488–534`):
1. `loadMidiFromUrl('/hymn_midi/${id}.mid')` (`:496`) → **`public/hymn_midi/` does not
   exist.** This 404 fires for all 250 hymns, including 237.
2. `.catch` → `fetch('/hymn_melodies/${id}.json')` (`:513`). 237: 200. Other 249: 404.
3. `.catch` → `setHymnMelody(null)` (`:529`).

Then: an amber chip says *"No melody data - pitch tracking only"* (`:969`) — **false,
there is no pitch display in hymn practice**. The lead-in panel silently vanishes. And
**the Begin button stays enabled** (`:972`) → count-in → records with zero feedback →
Stop → `res = {ps:0, rs:0, ls:0}` (`:860–869`) → **three red rings at 0**.

It never blocks, never warns, never disables. It walks the user through the full
ceremony — sheet music, mode toggle, count-in, recording timer — and hands back a
zero. For 99.6% of the content, "Begin Practice" is a decoy.

### 5. Two generator settings do nothing
Syllable Complexity (`:1384–1394`) and Melisma (`:1396–1410`) feed `assignLyrics`
(`:652`) → `setGenLyrics` (`:653`) → **never rendered.** `NotationDisplay` takes no
lyrics prop. The component that drew them, `NoteDisplay` (`:322–377`), is dead code.
The user tunes melisma percentage, reads a paragraph explaining melismas "shown as —",
and no — ever appears.

### 6. Confidence leaks into the pitch grade
`calculatePitchScore` (`grader.js:188`) = `hitRate*40 + intonation*40 +
confidence*20`. **A singer with a cheap mic scores lower on "pitch" for a reason that
isn't pitch.**

---

## UX problems

1. **The two flows are wildly asymmetric, and the wrong one is impoverished.** Hymn
   practice has **no live pitch display, no mic test, no metronome, no starting-pitch
   button, no note-by-note results, no notation in results.** Generated exercises have
   all six. *The flow built around real sheet music — the one the vision is about — is
   the poor cousin.*
2. **Mobile is broken on the flagship screen.** **Zero media queries** in the entire
   codebase. Hymn practice (`:1028–1032`) is a hard 50% split: sheet `minWidth:280` +
   right pane `minWidth:300` = a **580px floor on a 375px phone**. And `index.html`
   sets `maximum-scale=1.0, user-scalable=no` — so users **can't pinch-zoom scanned
   sheet music** to compensate. For an installable PWA whose content is page images,
   this is the central failure.
3. **Results are unreadable as feedback.** Three 0–100 rings with no reference for what
   good is. The only place a user learns **which note they missed** is the "Debug
   Info / v2.0" panel (`:1174–1211`) — monospace, dashed border, exercise-flow only.
   *The actionable feedback is dressed as a developer artifact; the pretty rings say
   nothing.*
4. **Mic permission is requested at the worst moment.** `engine.init()` fires inside
   `startRec` (`:760`) — after picking a hymn, configuring lead-in, hitting Begin.
   Deny → error string → dead end. `micPermission` state (`:443`) is set and **never
   read**; there's no indicator anywhere.
5. **Inline component definitions remount the whole subtree on every state change.**
   `Ctrl`/`Res` are defined *inside* render (`:893`, `:1015`, `:1046`, `:1164`) —
   ESLint flags all four (`react-hooks/static-components`). Expected consequences
   (predicted from code + lint, **not browser-observed**): pressing the starting-pitch
   button silently kills the running metronome; `NotationDisplay`'s VexFlow SVG is torn
   down and rebuilt on every pitch frame during recording. The `genNotesRef` at `:438`
   — commented *"Ref to avoid closure issues with stop button"* — is someone patching
   this symptom rather than the cause.
6. **No onboarding.** Nothing explains lead-in, drop points, what a good score is, or
   that most hymns can't be graded.
7. Smaller: `dropPoint` isn't clamped when switching drop modes (`:910` vs `:930`);
   `currentNote={-1}` is hardcoded (`:966`, `:1063`, `:1170`) so `NotationDisplay`'s
   note highlighting (`:264–266`) is **built and never driven** — no playback cursor.

---

## Architecture readiness

### What supports the vision
- **The audio layer is genuinely decoupled.** `pitch-engine.js`, `grader.js`,
  `midi-parser.js` are plain classes/functions with callback interfaces and **zero
  React coupling**. `grader.js` is pure. They survive any UI rewrite untouched.
- **Data already crosses a fetch boundary** (`:513`, `:538`), not an import. Swapping
  static JSON for an API is a one-function change.
- **`midi-parser.js` already models multi-voice.** It enumerates tracks with note
  counts and average pitch (`:62–73`) and accepts `options.trackIndex` (`:95`). App
  even stores `tracks`/`selectedTrack` in state (`:505–506`) — **and never renders a
  selector.** *The SATB part-picker is ~80% built and unwired.*

### What blocks it
- **The guardrail, not the code.** `CLAUDE.md:133` and `AGENTS.md` both say no
  backend, no auth, no env vars, client-side only *by design*. The vision needs all
  four. **This is governance, not engineering** — every agent that reads those files
  will refuse or route around the vision. (Resolved 2026-07-16: backend approved. See
  `PROJECT-LOG.md`.)
- **No router.** Rooms need URLs. "Hymn 237 / bass part / room ABC" is unrepresentable.
- **No persistence.** Competitive anything needs identity and history; there's not
  even localStorage.
- **CSP** in `vercel.json` is `default-src 'self'` with a narrow `connect-src` — a new
  API host **fails silently** until added.
- **Zero tests on the value path.** The grading math *is* the product, and it has
  already shipped a silent wrong-output bug that lived in `main` for three months.

### Is App.jsx the real blocker?
**Mostly a red herring — with one real exception.** Every hard part of the vision
(OMR, backend, rooms) lives *outside* App.jsx. The audio layer is already extracted.
The line count isn't the problem. Two things are:
1. **The inline-component pattern** is causing real bugs *today*.
2. **The guardrail "do not add code to App.jsx" (`CLAUDE.md:131`) froze the file
   without fixing it.** Every feature since has routed around it. That's worse than
   either splitting it or allowing edits — it made a temporary monolith permanent.

### The seams worth cutting on
1. **The fetch boundary** (`:513`, `:538`) → one `getMelody(id, part)` function.
   Backend swaps in here; nothing else moves.
2. **The melody array contract** — `[{midi, dur, measure, lyric}]` is the lingua
   franca between `midi-parser` (`:163–173`), the JSON loader (`:519–525`), the
   generator (`:157`), `NotationDisplay` (`:130`), and `grader` (`:14`). **Change this
   one shape and everything downstream follows.** Highest-leverage change in the repo.
3. **`midi-parser`'s track model** (`:62–101`) — part selection is a UI away.
4. **`PitchEngine`'s callback interface** (`:13–16`) — untouched by any of this.

---

## The data model

Current shape (`public/hymn_melodies/237.json`):
```
{ hymnId: 237, number: "237", title: "Unity", key: "C", timeSignature: "3/2",
  bpm: 60, meter: "8.7.8.7",
  notes: [ {midi, dur, beat, measure, lyric} × 33 ],
  _note: "...first-pass transcription and may need refinement." }
```

**Single voice only. Flat array. No voice/part field. No way to represent a rest.**

Needs to become:
- A **voice/part tag** per note (or `parts: {S,A,T,B}`)
- **Absolute onsets** (`measure` + `beat`) as source of truth, not implied by
  cumulative duration
- **Rests, first-class** — their absence is *why* the bars don't sum
- **Validation at ingest** that each bar sums to the meter. Nothing checks this today.

**How much of `grader.js` assumes a single line: less than you'd fear — ~80% is
voice-agnostic.** The assumption is concentrated in `buildExpectedTiming` (`:78–100`)
and `matchPitchesToNotes` (`:105–162`), plus the `gradePerformance` signature (`:14`).
Everything downstream — `calculatePitchScore` (`:167`), `calculateRhythmScore`
(`:194`), `calculateStabilityScore` (`:222`), `generateDiagnostics` (`:245`), the viz
builders (`:320`, `:357`) — consumes `matchResults` and doesn't care where notes came
from.

**So: one singer singing one selected part is nearly free.** Pick the part, pass that
array. It already works that way.

---

## What's reusable

| File | Verdict |
|---|---|
| **`pitch-engine.js`** (610) | **Keep as-is. Genuinely good.** Worklet + ScriptProcessor fallback, calibrated noise floor, real smoothing pipeline (outlier rejection → onset detection → median → confidence-adaptive EMA), clean lifecycle, no React coupling. One gap: `onCalibration` is passed as an empty function (`App.jsx:565`, `:755`) — **the worklet measures your room's noise floor and the UI throws it away.** Free feature sitting unused. |
| **`PitchVisualizer.jsx`** (360) | **Solid. Keep.** Proper Canvas work, refs to dodge re-renders, self-scheduling rAF, dB meter, tuning meter. **Its placement is the problem, not the component** — at `App.jsx:1146` it lives inside the inline `Ctrl`, so its canvas is destroyed and recreated on every parent render. |
| **`grader.js`** (404) | **Keep the structure, fix the guts.** Pure, testable, no React — good bones. But octave-strict, cumulative-sum timing, confidence leaking into pitch, tempo chart dropping measures. |
| **`midi-parser.js`** (204) | Keep. Already models multi-track — sits directly on the vision's path. |
| **`NotationDisplay.jsx`** (363) | **Weakest of the set; needs rework.** Manual stave-width math with a dead variable; `setStrict(false)` hides data bugs; `clef='treble'` hardcoded (`:135`) so bass singers get a ledger-line wall; **`innerHTML` with `e.message`** (`:306`) — a guardrail violation; note highlighting built but never used; no lyrics; built around one `Voice` per measure — SATB means real work here, though VexFlow supports it. |
| **`recorder.js`** (380) | **DEAD CODE — delete.** Only referenced by an unused import at `App.jsx:2` via the barrel. A complete earlier main-thread duplicate of PitchEngine with its own YIN, own smoothing, own rAF loop. **There are three YIN implementations in this repo.** `CLAUDE.md:61` and the README describe it as live — **the docs are wrong.** |
| **`public/pitch-processor.js`** (350) | Structure looks right (YIN on the audio thread, ~1s noise-floor calibration, adaptive thresholds). **Grepped, not read line by line. Not audited.** |

**Delete outright:** `recorder.js` (380), `zions-hymns-trainer.jsx` +
`zions-hymns-trainer_3.jsx` (1,433 lines of dead root drafts), `NoteDisplay`
(`:322–377`), `simResults` (`:231–246`).

Other dead code confirmed by lint: `genLyrics` (`:433`), `micPermission` (`:443`), the
`AudioRecorder` import (`:2`).

---

## The bottom line

**Keep:** the whole audio layer. Best code in the repo, already decoupled.

**Fix, don't rebuild:** `grader.js`.

**Rebuild:** App.jsx's UI shell — for its IA and the inline-component pattern, **not
for its line count**.

**The order matters, and it's not what it looks like.** The layout isn't ideal — but
**the layout can't be designed yet.** The current IA is built around one soprano line
and a settings-heavy generator. The vision is multi-part, multi-song, multi-user. Part
selection is a top-level navigation concept that doesn't exist *because the data can't
express parts*. **Redesign now and you redesign twice.**

---

## What the audit did not cover
`public/pitch-processor.js` in full (grepped only), the two legacy root `.jsx` files,
the unmerged `huz/1319…` branch contents, `.gsd/milestones/` artifacts, the 458 PNGs.
**The app was not run in a browser** — the remount symptoms above are predictions from
code + ESLint's four `react-hooks/static-components` hits, not observed behavior.

Verified by command output: the 237.json bar-sum math, the missing `/hymn_midi/`
directory, the dead `AudioRecorder` import, the zero media queries.
