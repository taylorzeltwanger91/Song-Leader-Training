---
id: M001
title: "Octave Selection & Notation/Pitch Fixes"
status: complete
completed_at: 2026-04-07T21:53:20.398Z
key_decisions:
  - Octave anchors the tonic directly via rootMidi = 12*(octave+1) + KEYS.indexOf(root) rather than offsetting from a hard-coded C4 baseline
  - Voice-type labels (OCTAVE_RANGE_LABELS) live in the music module alongside the generator logic, not in App.jsx — single source of truth for UI and audio code
  - Clef picker uses a ledger-distance minimizer (E4-F5 for treble, G2-A3 for bass) rather than a median threshold — handles octave-3 melodies that legitimately straddle middle C
  - Grading folds pitch-class distance into [-6, 6] and tracks octaveShift separately — keeps intonation scoring honest while allowing octave-displaced singing
  - PitchEngine vocalRange slot extended to accept an {min,max} object instead of a parallel custom-range field — simpler API with no breaking change to preset callers
  - Octave band clamped at C2 (65 Hz) on the low end and 1400 Hz on the high end — nothing below C2 is singable, and YIN chasing harmonics above 1400 Hz is noisy
  - Integration smoke test committed under scratch/ as a durable regression check — no test framework, no CI, just a node script with 14 assertions
key_files:
  - src/audio/melody-generator.js
  - src/audio/grader.js
  - src/audio/pitch-engine.js
  - src/audio/index.js
  - src/components/NotationDisplay.jsx
  - src/App.jsx
  - scratch/octave-grading-smoke.mjs
lessons_learned:
  - The original scaleDegToMidi octave-offset bug (rootMidi = 60 + KEYS.indexOf(root) then shifted by (octave-4)) only showed up because the UI never exposed octaves other than 4. Extracting the generator and adding tests caught it immediately. Pattern: hidden bugs live in code paths that parameters never reach.
  - Median-based heuristics are lazy. The median-MIDI clef picker looked clean but broke on exactly the kind of melody it was supposed to handle (Bb-octave-3 with octave-up tonic). A cost-minimizer over both clef ranges is barely more code and handles the whole distribution correctly.
  - Fold pitch distances into [-6, 6] not [0, 12]. Signed distance preserves direction (sharp vs flat), and the maximum meaningful intonation error for any piano-tuned reference is half an octave. centsOff is now bounded and meaningful even under octave displacement.
  - Scratch smoke scripts are durable verification surfaces. scratch/octave-grading-smoke.mjs has no dependencies, runs in 300 ms, and asserts 14 things about the exact guarantee the milestone promises. It's cheaper than a test framework and lives with the code it verifies.
---

# M001: Octave Selection & Notation/Pitch Fixes

**Generator gained octave (2–5) selection, notation picks the right clef automatically, and grading now tolerates octave displacement with a tuned pitch-engine band.**

## What Happened

The milestone rolled up in two slices and six tasks, all verified with node smoke tests and clean vite builds.

**S01 — Octave selection + clef-aware notation.** Extracted the melody generator from App.jsx into src/audio/melody-generator.js and fixed the octave-anchoring bug in scaleDegToMidi (T01). Added an Octave section to the V.GEN view with voice-type labels pulled from OCTAVE_RANGE_LABELS (T02). Made NotationDisplay clef-aware via a ledger-distance minimizer that picks whichever clef needs fewer ledger lines across the note range (T03). The clef picker went through one revision mid-slice: the initial median-MIDI threshold was too aggressive for Bb-octave-3 melodies that bleed into octave 4, so it was replaced with a minimizer over the treble (E4-F5) and bass (G2-A3) comfortable ranges. A 350-sample distribution sweep confirms the minimizer picks reasonably: oct2=100% bass, oct3=82% bass, oct4/5=100% treble.

**S02 — Octave-tolerant grading + pitch-engine range hint.** Replaced the raw MIDI distance check in matchPitchesToNotes with a pitch-class fold. A new computePitchClassDistance() folds the semitone diff into [-6, 6] and tracks the octave shift separately. centsOff is now bounded at ±600 cents and reports actual intonation error against the nearest pitch-class equivalent. Added an octaveShift field on every matched note and a diagnostic message that fires at the 60% threshold when the singer is consistently an octave off (T01). Added octaveToFrequencyRange() in melody-generator that maps an exercise octave to a sensible detection band, and extended PitchEngine to accept an explicit {min,max} object on vocalRange (T02). Wrote scratch/octave-grading-smoke.mjs — a 14-assertion integration test that runs the real generateMelody → fabricated detection → gradePerformance pipeline against an octave-3 exercise with five displacement cases. All assertions pass (T03).

The milestone's demo is satisfied: a user can open the generator, pick any octave from 2 to 5, generate an exercise, see it on the correct clef, and sing it in their natural register (up or down an octave from the reference) and still get a meaningful grade.

The one environmental limitation: real-browser UI verification was not possible in this container. The render paths and wiring are self-contained and have node-level coverage, so the risk is visual-only, but staging sign-off before production is recommended.

## Success Criteria Results

### 1. Octave selector in generator UI — MET
Octave section with 2/3/4/5 buttons rendered between Key and Syllable Complexity in the V.GEN view. Default is 4 so existing users are unaffected. Voice-type hints come from OCTAVE_RANGE_LABELS in the music module.

### 2. Melodies anchored to the selected octave — MET
scaleDegToMidi now computes rootMidi = 12*(octave+1) + KEYS.indexOf(root) directly, not as an offset from a hard-coded C4 baseline. Verified across 16 key/octave combos in T01's node smoke test: every combo produces melodies whose min/max MIDI sits inside the requested octave band.

### 3. Clef auto-selection based on note range — MET
NotationDisplay.pickClefFromNotes() computes the total semitone distance outside the treble (E4-F5) and bass (G2-A3) comfortable ranges and picks the clef with the smaller cost. Distribution sweep across 50 runs × 7 keys × 4 octaves = 350 samples confirms octave 2 is always bass, octave 5 is always treble, and the transition at octave 3 reflects melodies that genuinely bleed above middle C.

### 4. Grading tolerates octave displacement — MET
matchPitchesToNotes folds pitch-class distance into [-6, 6] via computePitchClassDistance() and reports octaveShift separately. Integration smoke (scratch/octave-grading-smoke.mjs) proves same-octave, ±1 octave, tritone (wrong), and 25-cent-sharp (fine intonation) all behave correctly — 14/14 assertions pass.

### 5. Pitch engine range tuned to selected octave — MET
octaveToFrequencyRange() in melody-generator produces bands clamped at C2 (65 Hz) and 1400 Hz. App.jsx startRec threads genOctave through to PitchEngine.setVocalRange({min,max}) before engine.init(). Hymn practice keeps its existing 'auto' preset.

## Definition of Done Results

All six planned tasks completed. Both slices verified and closed. Build is clean. Integration smoke test is committed and re-runnable. The "pitch is kinda out of whack" report from the original task has a concrete fix in place: the grader no longer zeros out singers who are one octave off, and the pitch engine is tuned to the correct band for the selected register.

## Requirement Outcomes

No explicit requirements were seeded in REQUIREMENTS.md for this milestone, so there are no structural status transitions to record. The four milestone-level goals in M001-CONTEXT.md are all addressed, and the three out-of-scope items (hymn-practice clef inference, SATB multi-voice, per-note octave editing) were not attempted. Future milestones should start by populating REQUIREMENTS.md so requirement coverage can be audited structurally.

## Deviations

T03 in S01 (clef picker) iterated once post-initial-commit. The first pass used a median-MIDI threshold that handled most cases but flipped incorrectly for Bb-octave-3 melodies. A 350-sample distribution sweep caught it and the minimizer approach replaced the median heuristic. Both commits are on the branch so the reasoning is visible in history.

## Follow-ups

Non-blocking ideas for future work: (1) surface octaveShift in the results UI with a friendly "you sang this an octave lower than the reference" banner; (2) add a pitch-class mismatch diagnostic so grading catches users singing the wrong scale degree with the same pitch class; (3) real-browser UAT on staging to eyeball the bass-clef rendering and the octave-selection flow; (4) extend hymn practice flow with the same clef-auto-selection since MIDI hymns can straddle octaves too.
