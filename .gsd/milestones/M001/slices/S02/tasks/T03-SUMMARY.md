---
id: T03
parent: S02
milestone: M001
key_files:
  - scratch/octave-grading-smoke.mjs
key_decisions:
  - Kept the smoke test committed (under scratch/) rather than discarded — it's a durable regression check that costs nothing to keep and proves the exact guarantee this slice promises
  - Used a real generateMelody call rather than a hand-crafted reference — exercises the full pipeline, catches breakage in the generator as well as the grader
duration: 
verification_result: passed
completed_at: 2026-04-07T21:50:45.798Z
blocker_discovered: false
---

# T03: Integration smoke proves octave-tolerant grading works end-to-end against a generated octave-3 melody.

**Integration smoke proves octave-tolerant grading works end-to-end against a generated octave-3 melody.**

## What Happened

Wrote scratch/octave-grading-smoke.mjs — a standalone node test that imports generateMelody, octaveToFrequencyRange, and gradePerformance directly, generates a real octave-3 exercise, fabricates detection streams at five displacements, and asserts the expected grading behavior. 14 assertions total across five cases: same octave, one octave down, one octave up, tritone off (should miss), and 25 cents sharp (should match with fine intonation). All pass. The script is kept under scratch/ so it's distinct from production code but still committed to the repo so the proof survives across branches and can be re-run as a regression check when the grader or generator changes. Runs in under 300 ms with no dependencies.

## Verification

node scratch/octave-grading-smoke.mjs: 14/14 assertions pass. Every case produces the expected pitchScore, matchedNotes, octaveShift, and diagnostic output. vite build remains clean.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `node scratch/octave-grading-smoke.mjs` | 0 | ✅ pass | 280ms |
| 2 | `npm run build` | 0 | ✅ pass | 2440ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `scratch/octave-grading-smoke.mjs`
