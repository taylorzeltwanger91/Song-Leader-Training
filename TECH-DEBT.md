# Tech Debt

Last reviewed: 2026-07-16

> Known debt to revisit. Things that work but aren't ideal.
> Updated when new debt is identified, items are resolved, or priorities shift.
> Resolved items move to a Resolved section at the bottom (don't delete — paper trail matters).

## Active

### M001's octave-tolerant grading fix is written but unmerged
- **Where:** branch `origin/huz/1319110013384ed4a3be779f7ced8246`; affects `src/audio/grader.js`, `src/components/NotationDisplay.jsx`, `src/audio/melody-generator.js` (new), `src/audio/pitch-engine.js`
- **What:** `main` still grades octave-strict. `grader.js:134-142` computes `Math.abs(candidate.midi - expected.midi)` and accepts `bestDistance < 1`, so a singer performing the melody one octave off the reference scores `distance = 12` on every note and is marked as missing all of them. The fix — folding the difference into pitch class ± octave shift — exists on the branch and never landed. Auto-clef selection and the extracted `melody-generator.js` are stranded with it.
- **Why it's debt:** this is the app's value path. Pitch grading is the product; a bass singing an octave-4 exercise in their natural register gets a score of zero and concludes the app is broken. `M001-CONTEXT.md` documents this as the *original user complaint* ("pitch is kinda out of whack") and correctly diagnoses it as a grader bug, not an engine bug. The work was done and then lost to a merge that took a different branch.
- **Cost to fix:** small-to-medium. The code exists and was UAT'd. Cost is reviewing agent-written code neither of us has read, then reconciling with the ~160 lines of `App.jsx` change that landed separately in `b16dbb1` — the two branches touch overlapping lines, so this is not a clean cherry-pick.
- **Risk of not fixing:** **high.** Silent wrong output. The app confidently reports a bad grade for a correct performance.
- **Trigger:** any user with a non-soprano range. Already triggered — it's the bug report that started M001.

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

_None recorded yet. This file starts 2026-07-16; items resolved before that date are in `CLAUDE.md`'s SCAN:AUTO "Resolved Issues" block, maintained by the Watch Tower scan._
