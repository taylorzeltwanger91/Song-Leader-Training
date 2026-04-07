---
id: T01
parent: S02
milestone: M001
key_files:
  - src/audio/grader.js
key_decisions:
  - Fold pitch-class distance into [-6, 6] rather than [0, 12] — signed distance preserves direction for centsOff (singer is sharp vs flat relative to the correct pitch class)
  - Report octaveShift as a separate field, not folded into centsOff — downstream code can score intonation without being confused by octave displacement, and diagnostics can surface the shift in plain English
  - Keep the 1-semitone match threshold (bestDistance < 1) since the tightened pitch-detection tolerances from the previous milestone are already dialed in
  - Diagnostic fires at 60% threshold so a one-off octave leap doesn't trigger the 'singing an octave off' message
duration: 
verification_result: passed
completed_at: 2026-04-07T21:46:58.505Z
blocker_discovered: false
---

# T01: Grader now matches detected pitches by pitch class (modulo octave) and reports octaveShift on each note.

**Grader now matches detected pitches by pitch class (modulo octave) and reports octaveShift on each note.**

## What Happened

Added computePitchClassDistance() that folds the semitone difference into [-6, 6] via modulo 12 and tracks the octave shift separately. matchPitchesToNotes now picks the candidate whose pitch class is closest, not the one with the smallest raw MIDI distance. centsOff is re-computed from the pitch-class-equivalent distance, so intonation error is bounded at ±600 cents and reflects actual tuning rather than octave displacement. Added an octaveShift field to each noteByNote result. Added a diagnostic message that fires when >60% of matched notes share the same non-zero octave shift — surfaces "singing one octave down" as plain English advice. Verified with a node smoke test covering same-octave, ±1 octave displacement (both matched with correct octaveShift), tritone (correctly rejected), and 25-cent sharp (correctly matched with centsOff=25). No downstream code change needed: the diagnostics, tempoData, pitchData, and score calculators all use centsOff numerically and just see a better-scaled value.

## Verification

node smoke test against grader.gradePerformance: same-octave/octave-down/octave-up/tritone/25-cent-sharp all behave as expected. vite build clean at 2.44s.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `node -e '<grader smoke test>'` | 0 | ✅ pass | 200ms |
| 2 | `npm run build` | 0 | ✅ pass | 2440ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `src/audio/grader.js`
