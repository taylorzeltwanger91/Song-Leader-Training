# Tech Debt

Last reviewed: 2026-08-07

> Known debt to revisit. Things that work but aren't ideal.
> Updated when new debt is identified, items are resolved, or priorities shift.
> Resolved items move to a Resolved section at the bottom (don't delete — paper trail matters).

## Active

### Rests in the shipped hymn data carry `beat: 0` regardless of position
- **Where:** `public/hymn_satb/{4,7,9}.json` — 50 rest entries across the three.
- **What:** the original `asm.py` stamped every rest `beat: 0` whatever its real offset
  in the bar (hymn 9 has a rest at onset 6.0, genuinely beat 2 of a 4/4 bar, written as
  0). Found by the assembler round-trip, 2026-08-10. `assemble.py` writes the true beat,
  so any hymn built from here on is correct; only these three predate the fix.
- **Why it's low priority:** inert today. Nothing reads `beat` on a rest — `grader.js`
  checks it only for sounding notes, and `App.jsx` passes it through untouched. It would
  start to matter if anything measure-relative (rest placement in notation, a bar-level
  scrub in the player) ever consumed it.
- **Cost to fix:** trivial and mechanical — `python tools/omr/assemble.py
  tools/omr/hymns/<id>.txt -o public/hymn_satb/<id>.json` for 4, 7 and 9, then re-run
  the JS test suite. Deliberately not done as a side effect of building the assembler:
  it rewrites shipped data on Taylor's production app for no behavioural gain.
- **Trigger:** next time those three hymns are touched for another reason, or if `beat`
  gains a consumer.

### Hymn 2 soprano F5-vs-Eb5 (m5/m11) unresolved — needs an ear-check
- **Where:** `public/hymn_satb/2.json`, soprano, measures 5 and 11 (the repeat).
- **What:** both reads left one melodic note ambiguous — `F5` (appoggiatura) vs `Eb5`
  (chord tone). Harmony leans `Eb5`; it's audibly obvious when sung. Everything else in
  hymn 2 is dual-verified.
- **Cost to fix:** trivial — one-line edit + re-validate once the ear settles it.
- **Trigger:** next time the WAVs are played. Recorded in the hymns commit message too.

### Match windows overlap — a note can match its predecessor's audio
- **Where:** `src/audio/grader.js`, `matchPitchesToNotes` — `windowStart = expectedStart - 150`
- **What:** the ±150ms tolerance reaches back into the *previous* note's frames. On an ascending line, a singer who is consistently a semitone sharp makes note N sound the pitch of note N+1, and note N+1 then "matches" note N's trailing audio. Found 2026-07-17 while writing the first grader tests (the test had to be rewritten to use a monotone melody to isolate what it meant to assert).
- **Why it's debt:** it inflates scores in a specific, plausible failure case — a singer drifting sharp gets credit they didn't earn. It's a matching-precision bug, not a silent-zero like the octave bug, so it's lower severity, but it's still the grader lying.
- **Cost to fix:** small-to-medium. Options: clamp each window to the midpoint between adjacent onsets, or assign each detected frame to exactly one note (a real alignment pass — DTW-style — rather than independent per-note searches).
- **Risk of not fixing:** medium.
- **Trigger:** any attempt to make scoring stricter or more trustworthy. Worth doing when the data model lands (Phase 2), since real alignment wants absolute onsets anyway.

### Unmerged M001 branch — now superseded, decide whether to abandon it
- **Where:** branch `origin/huz/1319110013384ed4a3be779f7ced8246`
- **What:** the octave-tolerant grading fix on that branch **has been superseded** — Phase 1 (2026-07-17, commit `070e215`) went fully octave-*agnostic*, which is simpler and strictly better than the branch's pitch-class-fold-plus-octave-shift. But the branch also carries **auto-clef selection** in `NotationDisplay` and an **extracted `melody-generator.js` (222 lines)** that `main` still lacks. `NotationDisplay.jsx:135` still hardcodes `clef = 'treble'`, so bass singers still get a ledger-line wall.
- **Why it's debt:** two useful pieces are still stranded, and the branch will drift further from `main` with every Phase 1–2 change.
- **Cost to fix:** medium. Not a clean cherry-pick — it overlaps the ~160 lines of `App.jsx` that landed separately in `b16dbb1`, and now also overlaps the Phase 1 grader rewrite.
- **Risk of not fixing:** low-medium. The severe part (octave grading) is fixed; what's left is UX quality for low voices.
- **Trigger:** Phase 4 (layout) or any work on notation. **Taylor's call** — it's his agent's code.

### ~~Octave-strict grading~~ ✅ FIXED 2026-07-17
See Resolved.

### Only 1 of 250 hymns has melody data — because the OCR step doesn't exist
- **Where:** `public/hymn_melodies/` (contains `237.json` and nothing else); `public/hymn_index.json` (250 entries); `public/sheet_music/` (458 page PNGs)
- **What:** every hymn is browsable as a scanned image, but only hymn 237 has the note data required to grade a performance. For the other 249, the app is a page viewer.
- **Why it's debt:** **reclassified 2026-07-16 — this is not debt, it's the missing half of the product.** Per the goal recorded in `PROJECT-LOG.md`, the intended pipeline is: upload/photo a piece → OCR the notes per voice part (SATB) → sing → grade. Hymn 237's hand-authored JSON is a stub standing in for an OCR step that was never built. The 458 scanned pages aren't just content — they're the test set for that step. Filling in 249 JSON files by hand would be grinding out the symptom and building nothing.
- **Cost to fix:** unknown until an OMR spike runs. Optical Music Recognition on multi-voice SATB over a shared grand staff — i.e. exactly what a hymnal page looks like — is the known-hard case; voice separation is where OMR engines degrade. Options to evaluate: Audiveris (open source, Java, outputs MusicXML), oemer (Python, end-to-end ML), commercial engines. Photo input is harder than clean scans.
- **Risk of not fixing:** it *is* the product. The app grades pitch and timing correctly (once the octave bug is fixed) against exactly one song.
- **Trigger:** already triggered. Next real work on this project starts here.
- **Next step:** spike OMR against ~5 pages from `public/sheet_music/` before designing an upload flow. Answers "weekend of plumbing or research project" cheaply. Don't build the UI first.

### App.jsx is ~1,380 lines
- **Where:** `src/App.jsx`
- **What:** monolithic component holding UI, melody generation, and flow state.
- **Why it's debt:** already codified as a guardrail in `CLAUDE.md` ("Do not add code to App.jsx"), which means every feature since has had to route around it. Note the unmerged M001 branch *does* decompose it (−160 lines, generator extracted to `src/audio/melody-generator.js`) — so merging that branch pays this down rather than adding to it.
- **Cost to fix:** medium.
- **Risk of not fixing:** low. It works.
- **Trigger:** next feature that genuinely belongs in the main component.

### Legacy root files are dead code
- **Where:** `zions-hymns-trainer.jsx` (43K), `zions-hymns-trainer_3.jsx` (62K)
- **What:** two pre-Vite drafts sitting in the repo root, duplicating much of `App.jsx`'s logic. Not imported by anything.
- **Why it's debt:** ~1,400 lines of code that reads as real but isn't. An agent grepping this repo for `generateMelody` finds three implementations and no signal about which is live. Already flagged in `CLAUDE.md`.
- **Cost to fix:** trivial — delete them; git has the history.
- **Risk of not fixing:** low, but rising with each agent that reads this repo.
- **Trigger:** any agent-driven change that touches melody generation.

### 29 unused-variable lint warnings
- **Where:** repo-wide; `npm run lint`
- **What:** 35 warnings total — 29 `no-unused-vars`, 4 `react-hooks/static-components`, 1 `react-hooks/set-state-in-effect`, 1 `react-hooks/immutability`. 0 errors.
- **Why it's debt:** `no-undef` is wired as an error and the build gates on it (`prebuild` runs lint), which is the important half. But 35 standing warnings are noise a new warning hides in.
- **Cost to fix:** small.
- **Risk of not fixing:** low.
- **Trigger:** warning count grows enough that nobody reads the output.

### Three npm advisories, one high
- **Where:** `package-lock.json`
- **What:** `npm audit` reports high (`vite`), moderate (`js-yaml`), low (`@babel/core`).
- **Why it's debt:** all three are dev/build-chain, not shipped to the client, on a client-only app with no backend or secrets — so real-world exposure is low. Still, the `vite` one is a `npm audit fix` away and Watch Tower will keep flagging it.
- **Cost to fix:** small; verify the build after.
- **Risk of not fixing:** low.
- **Trigger:** next scan cycle, or a Vite major upgrade.

### Bundle is 1.4 MB (776 kB gzipped) in one chunk
- **Where:** `dist/assets/index-*.js`; Vite emits a chunk-size warning on every build
- **What:** VexFlow and soundfont-player dominate; no code splitting.
- **Why it's debt:** it's a PWA people load on phones, possibly on church wifi. VexFlow is only needed once notation renders and is a natural dynamic import.
- **Cost to fix:** small — `manualChunks` or a dynamic import for the notation path.
- **Risk of not fixing:** low; slow first load on mobile.
- **Trigger:** anyone complaining the app is slow to open.

### Unpinned third-party CDN fetches at runtime
- **Where:** `App.jsx` (Google Fonts `@import`), soundfont-player (church_organ from MusyngKite CDN)
- **What:** two runtime fetches from third-party CDNs, neither pinned nor SRI-verified. `CLAUDE.md` also notes CSP is the last missing security header.
- **Why it's debt:** if MusyngKite goes away, playback breaks with no fallback. Carried over from the scan; listed here so it lives in one place.
- **Cost to fix:** small (self-host the soundfont + fonts) to medium (CSP that permits what's left).
- **Risk of not fixing:** low-moderate.
- **Trigger:** CDN outage, or adding CSP.

### soundfont-player is unmaintained (since 2018)
- **Where:** `package.json`, `soundfont-player@^0.12.0`
- **What:** no releases in ~8 years. `CLAUDE.md` notes no maintained alternative was found.
- **Why it's debt:** it works; it just won't get fixed if it breaks.
- **Cost to fix:** large (replace the playback layer).
- **Risk of not fixing:** low today.
- **Trigger:** a Web Audio API change that breaks it.

## Resolved

### SATB assembler lived only in the session scratchpad — 2026-08-10
`asm.py` and its per-hymn drive scripts were never in the repo, so the shipped
`hymn_satb/*.json` couldn't be regenerated from a clean checkout. Rebuilt as
`tools/omr/assemble.py`, reading committed per-hymn source files (`tools/omr/hymns/*.txt`)
instead of throwaway drive scripts — the failure mode that lost it. `extract_source.py`
recovered the reads for all 12 verified hymns out of the committed JSON, and
`roundtrip_test.py` proves the rebuild: every pitch, duration, onset and measure matches
what shipped (6 byte-identical; the others differ only in the legacy rest-`beat` quirk
above and first-batch field ordering). Two findings along the way: no hymn actually has
irregular interior bars — the only non-meter measures are a pickup and its complementing
final bar, so the explicit-barline support the old assembler was believed to need is
optional (kept as a `measures:` override, unused) — and the rest-`beat` bug now tracked
above.

### Octave-strict grading — 2026-07-17 (`070e215`)
`grader.js` computed `Math.abs(detected - expected)` and matched on `< 1`, so a singer
one octave from the reference scored distance 12 on every note → 0. Measured on real
hymn 237 data, a *perfect* performance sung an octave down scored **0 (0/33)**; it now
scores **100 (33/33)**, identical to at-pitch. Fixed by folding distance into the pitch
class and ignoring octave entirely (UltraStar's design — it also makes the detector's
octave-doubling errors vanish as a class). Regression-locked by 6 tests in
`src/audio/grader.test.js`.

### Timing rebuilt from cumulative duration sums — 2026-07-17 (`070e215`)
`buildExpectedTiming` ignored the authored `beat` field and summed durations, so one
malformed bar shifted every later note past the ±150ms window. Now uses absolute onsets
(`measure` + `beat`) when present, cumulative as fallback. The loader in `App.jsx` was
also dropping `beat` before the grader ever saw it.

### 237.json bars didn't sum to the meter — 2026-07-17 (`070e215`)
Measures 0/3/11/12 summed to 5/2/4/1 beats in 3/2. Corrected the final note's duration
in each; authored beats were already self-consistent and untouched, and corrections net
to zero (total stays 39 = 13 bars × 3). Regression-locked by 8 tests in
`src/audio/melody-data.test.js`, which any future transcription must pass.

### Fabricated Count-off score — 2026-07-17 (`070e215`)
The results screen showed a "Count-off" bar computed as `stabilityScore * 0.9 + 10`.
Nothing measures a count-off. Removed the value and the bar.

### Detector confidence leaked into the pitch grade — 2026-07-17 (`070e215`)
`calculatePitchScore` weighted confidence at 20%, so a cheap mic cost "pitch" points for
a reason that isn't pitch (a perfect performance at 0.4 confidence scored 88 vs 99).
Weights now hitRate 50 / intonation 50.

### 249 hymns walked users to a zero — 2026-07-17 (`070e215`)
Begin stayed enabled with no melody data: full ceremony, count-in, recording, then three
red zeros. Now disabled with an explanation.

### No tests on the value path — 2026-07-17 (`070e215`)
19 tests added and **wired**: `prebuild` runs `lint && test`, so the build fails if they
do. This is the gate that would have caught M001's loss in April.

_Items resolved before 2026-07-16 are in `CLAUDE.md`'s SCAN:AUTO "Resolved Issues"
block, maintained by the Watch Tower scan._
