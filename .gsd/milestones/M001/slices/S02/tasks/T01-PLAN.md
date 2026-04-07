---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T01: Add octave-tolerant matching to grader.js

In matchPitchesToNotes, compute the nearest octave-equivalent MIDI distance when picking the best candidate. The cheapest way: for each candidate, compute `raw = candidate.midi - expected.midi`, then `mod = ((raw % 12) + 12) % 12`, then `octEquiv = mod > 6 ? mod - 12 : mod` (so distance is in [-6, 6] regardless of octave). Track the octave displacement separately. Use absolute octEquiv to pick the best match. Accept the match when |octEquiv| < 1 (same 1-semitone threshold as before). When reporting centsOff, use octEquiv * 100 so the intonation score reflects the singer's pitch relative to the correct pitch class, not the literal MIDI distance. Add an `octaveShift` field to the match result so the UI or diagnostics can show 'sung an octave down'.

## Inputs

- `src/audio/grader.js`

## Expected Output

- `matchPitchesToNotes compares pitch class modulo 12`
- `noteByNote items include octaveShift`
- `existing cents/timing metrics still work`

## Verification

node -e 'grader smoke test: reference [60,64,67,72], detected at [48,52,55,60] (one octave down) should produce matched=true for all four notes with octaveShift=-1 and centsOff near 0. Also test same-octave and half-octave off cases.' && npm run build 2>&1 | tail -5

## Observability Impact

octaveShift field added to each noteByNote match result
