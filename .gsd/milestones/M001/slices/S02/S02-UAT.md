# S02: Octave-tolerant grading + pitch-engine range hint — UAT

**Milestone:** M001
**Written:** 2026-04-07T21:51:42.083Z

## UAT for S02 — Octave-tolerant grading + pitch-engine range hint

**Flow:** Home → Generated Exercise settings → Generate → Begin Exercise → Sing → View results.

**Setup:**
1. Open the generator, pick octave **3**, key **C**, measures **4**, time signature **4/4**, tempo **80**.
2. Press Generate, then press Begin Exercise. Grant microphone permission if prompted.

**Happy-path test (same octave):**
3. Sing along with the melody in its reference octave. Press Stop.
4. Expected: pitch score is high (>80%) if you sang reasonably in tune. The noteByNote results show octaveShift = 0 for every matched note.

**Octave-displacement test (the main bug):**
5. Go back to settings and generate another octave-3 exercise.
6. This time, sing the melody one octave *higher* or *lower* than the reference (whatever is comfortable for your voice).
7. Press Stop. Expected: the grade is still meaningful (>50%), notes are matched as hits, and the diagnostics include a line about "Singing one octave up/down from the reference."

**Regression test:**
8. Pick octave **4** (the old default). Sing along with the reference. Expected: behavior is unchanged from before — existing users who were happy with octave 4 get the same experience.

**Pitch-engine range sanity:**
9. Pick octave **2** (bass). Generate and begin recording (no need to sing — just let it run for a second or two).
10. Expected: no console warnings about frequency range errors. The detector is now accepting frequencies in the 65-247 Hz band.

**Pass if:** the octave-displacement test produces a non-zero grade with sensible matches and an explanatory diagnostic. The same-octave grade is comparable to pre-M001 behavior.

**Not covered:** multi-voice / SATB practice, per-note octave editing, and hymn-practice clef auto-selection (hymns still load from MIDI and use their own clef/range logic).
