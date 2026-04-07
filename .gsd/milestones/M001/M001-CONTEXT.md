# M001 — Octave Selection & Notation/Pitch Fixes

## Why this milestone

User feedback: generated training exercises don't display notes "quite properly", pitch detection feels "out of whack", and there is no way to pick which octave the practice lives in (e.g. octaves 2 and 3 for bass voices, not just 4–5).

## Symptoms observed in code

1. **Octave is hard-coded.** `scaleDegToMidi(root, deg, octave=4)` in `src/App.jsx:57` always anchors generated melodies to MIDI 60 (C4) plus the key offset, so every exercise lives in roughly C4–B5 regardless of voice type. There is no UI control for octave.

2. **Notation can't render low notes cleanly.** `NotationDisplay` in `src/components/NotationDisplay.jsx` is hard-coded to `clef='treble'` (line ~129). Notes in octaves 2–3 render as a wall of ledger lines below the staff. Bass parts need bass clef, low-tenor parts may need treble-8va or grand staff.

3. **Grading is octave-strict.** `grader.js:matchPitchesToNotes` uses `bestDistance = Math.abs(candidate.midi - expected.midi)` and accepts only `bestDistance < 1`. A singer doing the melody one octave down hits `distance = 12` and is marked as missed on every note. This matches the user's "pitch is kinda out of whack" report — the engine works, but grading does not tolerate octave displacement.

4. **Pitch engine auto range is wide.** `PitchEngine._getFrequencyRange()` returns 65–1100 Hz in `auto` mode. Combined with octave-strict grading, low/high singers get a poor experience. Vocal-range presets exist but are not surfaced in the UI for the generator flow.

## Goals

- Add an octave selector to the generator settings page (octaves 2, 3, 4, 5; default 4).
- Generate melodies anchored to the selected octave.
- Choose clef automatically based on the selected octave (bass for ≤3, treble for ≥4).
- Make grading octave-tolerant so the same exercise can be sung at the user's natural register.
- Wire the octave choice into the pitch-engine vocal-range hint so detection bounds match expectations.

## Out of scope

- Bass-clef hymn rendering for the hymn-practice flow (hymns load from MIDI; clef inference there is a separate concern). If it falls out for free, take it; otherwise punt.
- Multi-voice / SATB practice. Single-line only for this milestone.
- Octave selection per-note in the editor. Single octave anchor per exercise.

## Key constraints

- `App.jsx` is already 1,381 lines — per the project guardrails, do not add more code there. New logic goes into modules under `src/audio/` or new components.
- No new dependencies without approval. Existing libs (vexflow, soundfont-player) are sufficient.
- Client-side only. No env vars, no backend.
