# M001: Octave Selection & Notation/Pitch Fixes

## Vision
Singers can pick an octave (2–5) for generated exercises, see the melody on the right clef with no ledger-line wall, and have their performance graded correctly even when they sing the melody an octave away from the reference.

## Slice Overview
| ID | Slice | Risk | Depends | Done | After this |
|----|-------|------|---------|------|------------|
| S01 | Octave selection + clef-aware notation | med | — | ✅ | User opens the generator, picks an octave (2/3/4/5), hits Generate, and sees a melody on the correct clef whose notes sit in the chosen octave. |
| S02 | Octave-tolerant grading + pitch-engine range hint | med | — | ✅ | User generates an octave-3 exercise, sings it in their natural octave (2 or 4), and gets a grade > 0 with sensible note matches. |
