---
id: T01
parent: S01
milestone: M001
key_files:
  - src/audio/melody-generator.js (new)
  - src/audio/index.js (re-exports)
  - src/App.jsx (imports + ~110 line reduction)
key_decisions:
  - Made the octave parameter the actual anchor instead of an offset from C4 — old code only worked because callers passed octave=4
  - Added OCTAVE_RANGE_LABELS to the music module so the UI in T02 can pull both the value and the human-friendly hint from one place
  - Kept a console.warn inside the generator as a self-check rather than adding tests — single-file project with no test runner
duration: 
verification_result: passed
completed_at: 2026-04-07T21:18:52.317Z
blocker_discovered: false
---

# T01: Extracted melody generator into src/audio/melody-generator.js with octave parameter support and verified anchor across 16 key/octave combos.

**Extracted melody generator into src/audio/melody-generator.js with octave parameter support and verified anchor across 16 key/octave combos.**

## What Happened

Created src/audio/melody-generator.js by lifting generateMelody, scaleDegToMidi, KEYS, MAJOR_SCALE, NOTE_NAMES, and midiToFreq out of App.jsx. Reworked scaleDegToMidi so its octave argument is the actual anchor: rootMidi = 12*(octave+1) + KEYS.indexOf(root), which makes (C, 1, 4) = MIDI 60, (C, 1, 3) = 48, (A, 1, 3) = 57. The original scaleDegToMidi only worked for octave 4 because rootMidi was hard-coded to 60 + offset. Re-exported the new module from src/audio/index.js so existing import sites pull the same names. Replaced the inline definitions in App.jsx with imports and removed ~100 lines from the monolith. Added a console.warn safety net inside the generator that fires if any generated note slips outside the requested octave band — costs nothing in the happy path and gives a quick handle for future debugging. Also added an OCTAVE_RANGE_LABELS map for the upcoming UI so the labels live alongside the music logic, not in App.jsx.

## Verification

node smoke test runs generateMelody for octaves 2/3/4/5 across keys C, F, A, B (16 combos) and asserts the lowest MIDI is in [12*(oct+1), 12*(oct+2)] and the highest is below 12*(oct+3). All 16 combos passed. vite build also passed with no new warnings.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `node -e "...generator smoke test..."` | 0 | ✅ pass | 1900ms |
| 2 | `npm run build` | 0 | ✅ pass | 8400ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `src/audio/melody-generator.js (new)`
- `src/audio/index.js (re-exports)`
- `src/App.jsx (imports + ~110 line reduction)`
