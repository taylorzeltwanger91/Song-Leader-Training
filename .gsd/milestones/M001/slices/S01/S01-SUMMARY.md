---
id: S01
parent: M001
milestone: M001
provides:
  - Octave 2–5 selection in the generator UI
  - Correct MIDI note anchoring for any octave+key combination
  - Auto-picked treble/bass clef in NotationDisplay via pickClefFromNotes()
  - OCTAVE_RANGE_LABELS export for voice-type hinting
requires:
  []
affects:
  - S02 — the selected octave is now available as genOctave state and can be threaded into the pitch engine and grader
key_files:
  - src/audio/melody-generator.js
  - src/audio/index.js
  - src/App.jsx
  - src/components/NotationDisplay.jsx
key_decisions:
  - Octave parameter anchors the tonic directly via rootMidi = 12*(octave+1) + KEYS.indexOf(root) — not an offset from a hard-coded C4 baseline
  - Voice-type labels (OCTAVE_RANGE_LABELS) live in the music module, not in App.jsx, so the UI and the generator share a single source of truth
  - Clef picker uses a ledger-distance minimizer instead of a median threshold — handles octave-3 melodies that bleed into octave 4 without flipping aggressively
  - Explicit clef prop overrides the auto-picker so callers (like a future hymn-practice flow) can force a clef
patterns_established:
  - Extract logic from App.jsx into src/audio/<module>.js modules and re-export from src/audio/index.js
  - Auto-resolved visual parameters (like clef) via useMemo keyed on the source data
observability_surfaces:
  - console.warn from melody-generator when a note escapes the requested octave band
  - console.warn from NotationDisplay when a note has invalid midi or vexKey
drill_down_paths:
  []
duration: ""
verification_result: passed
completed_at: 2026-04-07T21:44:27.745Z
blocker_discovered: false
---

# S01: Octave selection + clef-aware notation

**Users can pick an octave (2–5) in the generator, and NotationDisplay auto-selects treble or bass clef based on the actual note range.**

## What Happened

Three tasks landed across this slice.

**T01** extracted the melody generator from App.jsx into src/audio/melody-generator.js and fixed the octave-anchoring bug in scaleDegToMidi. The old formula computed the root relative to C4 and then shifted by (octave-4), which only produced correct MIDI for octave 4 — in key B octave 3, for example, it returned B2 instead of B3. The new formula computes rootMidi = 12*(octave+1) + KEYS.indexOf(root) directly. Verified across 16 key/octave combos with a node smoke test. Also exported OCTAVE_RANGE_LABELS so the UI can surface voice-type hints.

**T02** added an Octave section to the V.GEN view in App.jsx. Four buttons (2/3/4/5) styled like the existing Measures buttons, with voice-type hints pulled from OCTAVE_RANGE_LABELS. Wired the existing genOctave state through doGenerate and added it to the useCallback dep array.

**T03** made NotationDisplay clef-aware. First pass used a median-MIDI < 60 rule, but a distribution sweep found that Bb-octave-3 melodies (which can reach Bb4 via scale degree 8) were flipping to treble aggressively. Replaced with a ledger-distance minimizer that sums the total semitone distance outside the treble (E4–F5) and bass (G2–A3) comfortable ranges and picks the clef with the smaller cost. Verified across 350 samples (50 runs × 7 keys per octave) — octave 2 is 100% bass, octave 3 is 82% bass / 18% treble (the 18% being melodies that legitimately sit above middle C), octave 4–5 are 100% treble. Explicit clef prop still overrides.

Not visually verified in a browser because browser tools are unavailable in this container. The VexFlow render path is unchanged — we just thread a different clef string through the existing stave.addClef() and StaveNote({clef}) calls — so risk is low, but it wants an eyeball on staging before final sign-off.

## Verification

- node smoke test: 16/16 key+octave combos produce melodies whose min/max MIDI sit inside the requested octave band.
- node distribution sweep: 350 samples (50 runs × 7 keys × 4 octaves) show expected clef distribution (oct2=100% bass, oct3=82% bass, oct4/5=100% treble).
- vite build: 182 modules, clean, ~2.4s, on every task.
- grep audit: genOctave state, setter, and dep array wired consistently.

## Requirements Advanced

None.

## Requirements Validated

None.

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Deviations

T03 iterated once post-initial-commit to replace the median-MIDI threshold with a ledger-distance minimizer after the distribution sweep flagged a borderline case. Both commits are on the branch so the history shows the reasoning.

## Known Limitations

Browser-based visual verification was not performed in this container (browser tools unavailable). The render pipeline change is self-contained but wants an eyeball before production.

## Follow-ups

None blocking. S02 will build on this by using genOctave to narrow the pitch-engine frequency range and make grading octave-tolerant.

## Files Created/Modified

- `src/audio/melody-generator.js` — New module — extracted melody generation from App.jsx with corrected octave anchoring
- `src/audio/index.js` — Re-exports for the new module
- `src/App.jsx` — -113 lines of inline generator code, +18 lines of Octave UI, wired genOctave through doGenerate
- `src/components/NotationDisplay.jsx` — Added pickClefFromNotes() ledger-distance minimizer and useMemo-resolved clef
