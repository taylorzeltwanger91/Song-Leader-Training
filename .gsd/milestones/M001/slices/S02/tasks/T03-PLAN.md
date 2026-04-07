---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T03: Integration smoke: octave-3 exercise, sung an octave up or down, grades above zero

Write a short node smoke test (inline or in a scratch file, no new deps) that: 1) generates a melody with generateMelody('4/4', 80, 4, 'C', 3), 2) fabricates a detected pitch stream one octave down (midi - 12) that matches the reference timing, 3) calls gradePerformance and asserts pitchScore > 50 and all notes matched with octaveShift = -1. Also fabricate a one-octave-up stream and assert the same. Also fabricate a same-octave stream and assert pitchScore > 90. This is the slice-level integration proof.

## Inputs

- `src/audio/grader.js (updated)`
- `src/audio/melody-generator.js`

## Expected Output

- `smoke test passes for same-octave, octave-down, octave-up`

## Verification

node scratch/octave-grading-smoke.mjs && npm run build 2>&1 | tail -5

## Observability Impact

none directly; the smoke script can be re-run for regressions
