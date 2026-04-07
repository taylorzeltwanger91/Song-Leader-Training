# S01: Octave selection + clef-aware notation — UAT

**Milestone:** M001
**Written:** 2026-04-07T21:44:27.745Z

## UAT for S01 — Octave selection + clef-aware notation

**Flow:** Home → Generated Exercise settings.

**Steps:**
1. Open the generator settings. Confirm a new **Octave** section appears between **Key** and **Syllable Complexity**.
2. Confirm four buttons labeled 2/3/4/5 with voice-type hints below them: Bass / Baritone / Alto–Tenor / Soprano. The default selection is **4**.
3. Pick octave **2**. Pick key **C**. Press Generate.
4. Expected: the notation renders on a **bass clef**, and every note sits on or around the bass staff (G2–A3) with at most 2–3 ledger lines.
5. Go back to settings. Pick octave **3**. Press Generate. Expected: bass clef for most samples, occasionally treble if the generator pushes into octave 4 (this is intentional — the ledger-minimizer picks whichever clef needs fewer ledger lines).
6. Pick octave **4**. Press Generate. Expected: treble clef, notes around the treble staff (E4–F5).
7. Pick octave **5**. Press Generate. Expected: treble clef, notes in the upper half of the treble staff.
8. Press Regenerate a few times at each octave to verify the clef picker is stable.

**Pass if:** Octave 2–3 melodies render readably on bass clef (≤3 ledger lines for most notes). Octave 4–5 melodies render readably on treble clef. No "wall of ledger lines" below the staff at any octave.

**Not covered:** This slice does not yet make grading octave-tolerant or wire the pitch-engine vocal range to the selected octave. Those land in S02.
