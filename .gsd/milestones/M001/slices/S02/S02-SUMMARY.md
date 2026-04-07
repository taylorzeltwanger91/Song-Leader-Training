---
id: S02
parent: M001
milestone: M001
provides:
  - Octave-tolerant gradePerformance with octaveShift field on every match
  - octaveToFrequencyRange helper for mapping an exercise octave to a pitch-detection band
  - PitchEngine.setFrequencyRange(min, max) method
  - Durable regression test at scratch/octave-grading-smoke.mjs
requires:
  - slice: S01
    provides: genOctave UI state and the octave-aware melody generator
affects:
  []
key_files:
  - src/audio/grader.js
  - src/audio/pitch-engine.js
  - src/audio/melody-generator.js
  - src/audio/index.js
  - src/App.jsx
  - scratch/octave-grading-smoke.mjs
key_decisions:
  - Pitch-class fold into [-6, 6] for distance, with separate octaveShift tracking — keeps intonation scoring honest while allowing octave-displaced singing
  - Bounded centsOff at ±600 by design — downstream diagnostics and score calculators now see meaningful intonation numbers even when the singer is an octave off
  - Extended vocalRange slot to accept an {min,max} object — simpler than introducing a parallel custom-range field
  - Clamped octave band at C2-1400 Hz regardless of selection — nothing below C2 is singable, and YIN chasing harmonics above 1400 Hz is noisy
  - Committed the smoke test under scratch/ rather than discarding it — durable regression check for the exact guarantee this slice promises
patterns_established:
  - Small, real, node-runnable smoke tests under scratch/ as durable regression checks — no test framework, no CI, just node + assertions
observability_surfaces:
  - octaveShift field on every noteByNote result
  - diagnostic message when singer is consistently an octave off
  - pitch engine frequency band logged via the existing postMessage to the worklet
drill_down_paths:
  []
duration: ""
verification_result: passed
completed_at: 2026-04-07T21:51:42.083Z
blocker_discovered: false
---

# S02: Octave-tolerant grading + pitch-engine range hint

**Grading matches by pitch class regardless of octave displacement, and the pitch engine band now follows the selected exercise octave.**

## What Happened

S02 closes out the milestone by fixing the two remaining "pitch is kinda out of whack" symptoms.

**T01** replaced the raw MIDI distance check in matchPitchesToNotes with a pitch-class fold. computePitchClassDistance() folds the semitone diff into [-6, 6] via modulo 12 and reports the octave shift separately. Grading accepts matches by pitch class so a singer one octave off doesn't get zeroed out. centsOff is now bounded at ±600 cents and reflects actual intonation error against the nearest pitch-class-equivalent reference, not literal MIDI distance. Added an octaveShift field to every noteByNote result and a diagnostic message that fires when >60% of matched notes share the same non-zero shift.

**T02** wired the selected octave into the pitch engine. _getFrequencyRange() now accepts an explicit {min,max} object on vocalRange, and a new setFrequencyRange() convenience method exists for readability. octaveToFrequencyRange(octave) in melody-generator maps the exercise octave to a sensible detection band — one octave above the tonic band, clamped at C2 (65 Hz) below and 1400 Hz above. startRec in App.jsx gains an exerciseOctave parameter; when present, setVocalRange(band) is called before engine.init(). The generator Begin Exercise button threads genOctave through. Hymn practice doesn't pass an octave and keeps the full-range 'auto' preset.

**T03** wrote scratch/octave-grading-smoke.mjs — a real integration smoke that generates an octave-3 melody via the actual generateMelody function, fabricates detected pitch streams at five displacements, runs gradePerformance, and asserts 14 conditions covering same-octave / ±1 octave / tritone / 25-cent-sharp behavior. All assertions pass.

The slice-level demo is satisfied: a user can pick octave 3, generate an exercise, and sing it in their natural register (up or down an octave) and still get a meaningful grade with sensible note matches.

## Verification

- T01 unit smoke (inline node): 5 cases covering same-octave, ±1 octave, tritone, 25-cent-sharp all behave as expected.
- T02 helper sanity: octaveToFrequencyRange produces bands at 65-247, 65-494, 131-988, 262-1400 Hz for octaves 2-5.
- T03 integration smoke (scratch/octave-grading-smoke.mjs): 14/14 assertions pass against a real generated octave-3 melody.
- vite build clean across every task commit.

## Requirements Advanced

None.

## Requirements Validated

None.

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Deviations

None.

## Known Limitations

Real-browser microphone verification was not performed in this container (no browser tools available). The grading logic and the pitch engine wiring both have node-level verification, and the render paths haven't changed, so risk is low.

## Follow-ups

None blocking. Possible future work: surface the octaveShift field in the results UI ("you sang this an octave lower than the reference"); add a pitch-class match fingerprint so grading can catch users singing a different scale degree in the same pitch class.

## Files Created/Modified

- `src/audio/grader.js` — Added computePitchClassDistance and pitch-class-aware matching, octaveShift field on results, octave-displacement diagnostic
- `src/audio/pitch-engine.js` — Accept {min,max} object on vocalRange, new setFrequencyRange wrapper
- `src/audio/melody-generator.js` — New octaveToFrequencyRange helper mapping exercise octave to detection band
- `src/audio/index.js` — Re-export octaveToFrequencyRange
- `src/App.jsx` — startRec gained optional exerciseOctave parameter; Begin Exercise button threads genOctave; imports octaveToFrequencyRange
- `scratch/octave-grading-smoke.mjs` — New integration smoke test with 14 assertions across 5 cases
