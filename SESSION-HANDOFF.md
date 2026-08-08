# Session Handoff — 2026-08-07

> **Ephemeral.** Rewritten at the end of each session via `/log` or trigger phrase. Don't append — overwrite.

## What was done

Transcribed and verified **SATB hymns 1–10**, built the analysis tooling that gates
them, and pushed the entire project (16 commits, previously all unpushed) to `main`.

### 1. Ingest — hymns 1–10 to verified 4-part data
- **Method: dual vision-model consensus.** Every hymn read by **Fable** (Agent tool,
  `model: fable`) and **GPT-5.6** (manual paste into ChatGPT), both staves. Disagreements
  resolved by a harmony adjudicator (does the note fit a triad with the other 3 voices?)
  and, when needed, a third tiebreak read.
- **The dual-pass caught errors in BOTH directions** — this is the case for keeping it:
  - Hymn **2**: GPT misread the *entire* lower staff (~100% SER); replaced with Fable's.
  - Hymn **6**: Fable *dropped a measure* (60 beats), GPT *over-counted* three cadences
    (66); a tiebreak read got the truth — **63 beats, all bars 3/2**.
  - Hymns **7–10**: **0% SER** — Fable and GPT agreed note-for-note. Gold standard.
- All 10 served at `public/hymn_satb/{1..10}.json`, all pass `validate_satb.py`.
  Full hymnal now live: **1–10 + 5, 79, 237**.

### 2. Tooling (all in `tools/omr/`)
- `ser.py` — Symbol Error Rate (Levenshtein on `pitch:dur` tokens). The scorekeeper.
- `harmony_scan.py` — independent per-hymn triad/7th consistency check.
- `validate_satb.py` — **generalized**: was "every bar == meter"; now "all 4 voices agree
  on bar structure" + odd bars must complement. This unblocked irregular hymns (hymn 6's
  1.5-beat phrase cadences, split measures at system breaks).
- `batch_crop.py` — batch steps 1+2 over a hymn-id list.

### 3. Build gate hardened
- `src/audio/melody-data.test.js` **rewritten** to validate the shipped SATB data (all 12
  hymns) — the JS mirror of `validate_satb.py`. Was validating the removed legacy format.
- `src/audio/grader.test.js` 237 fixture repointed to `hymn_satb/237.json` soprano.
- Removed superseded `public/hymn_melodies/237.json`. **101 tests pass; vite build clean.**

### 4. MuSViT evaluated, bookmarked as Phase 2 (see PROJECT-LOG)
Foundation OMR vision model. Encoder-only (no note head), OOD on shape notes,
CC-BY-NC-SA. Not our pipeline today; the play is to fine-tune a head on our verified
hymns later. Bookmarked in `tools/omr/README.md`.

### 5. Firebase ownership scoped, then tabled
Decision: **Galen owns/operates the Firebase project**, wired into Taylor's Vercel via 6
public `VITE_FIREBASE_*` env vars; rules/functions deploy from Galen's machine; **must add
Firebase hosts to the `vercel.json` CSP `connect-src`** or calls silently fail. Only for
future rooms — app is fully client-side today. Scaffolding not built yet.

## Running state
- **Background processes:** none (all Fable read-agents completed).
- **Dev servers:** none running.
- **Worktrees:** none.
- **Scratchpad (NOT in repo):** the assembler `asm.py` + per-hymn `drive_h*.py` +
  `compare_*.py` live in the session scratchpad only. See TECH-DEBT — they should be
  migrated into `tools/omr/` for the data to be reproducible from the repo.

## Verification commands
- `CI=true npm run build` → 101 tests pass, then `vite build` succeeds.
- `python3 tools/omr/validate_satb.py public/hymn_satb/6.json` → `VALID: ... 63.0 beats`.
- `python3 tools/omr/harmony_scan.py public/hymn_satb/9.json` → flags are legit passing tones only.

## Open questions / next steps
- **Hymn 2 soprano `F5` vs `Eb5` at m5/m11** — the one unresolved note; needs an ear-check
  (`~/Downloads/ZionsHymns-Archive/hymn-002.../hymn2_soprano.wav`). One-line fix if wrong.
- **Migrate `asm.py` + drive scripts into `tools/omr/`** (reproducibility gap).
- **Continue the batch** — hymns 11+ using the same crop → dual-read → adjudicate → validate flow.
- **Firebase rooms** — build the scaffold against placeholders when ready.

## How to resume
Everything is on `main` (pushed). Re-read this file + `tools/omr/README.md` (the empirical
pipeline). To transcribe more hymns, the scratchpad drive scripts are the current
(un-migrated) tooling; `batch_crop.py` + the Fable-read prompt pattern in `GPT-PROMPTS.md`
are the entry points.
