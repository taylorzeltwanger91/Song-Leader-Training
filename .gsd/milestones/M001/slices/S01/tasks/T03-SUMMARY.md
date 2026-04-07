---
id: T03
parent: S01
milestone: M001
key_files:
  - src/components/NotationDisplay.jsx
key_decisions:
  - Median over mean for clef selection — keeps a single octave-leap outlier from flipping the staff on an otherwise-treble melody
  - Threshold at MIDI 60 exactly — a melody whose median lands on middle C stays treble, which matches conventional choral notation practice
  - No changes to midiToVexKey or key-string format — VexFlow positions 'c/3' correctly on bass clef via the StaveNote clef attribute
duration: 
verification_result: passed
completed_at: 2026-04-07T21:42:01.000Z
blocker_discovered: false
---

# T03: NotationDisplay auto-picks bass clef for median-MIDI-below-C4 melodies; treble otherwise.

**NotationDisplay auto-picks bass clef for median-MIDI-below-C4 melodies; treble otherwise.**

## What Happened

Added pickClefFromNotes() helper and a useMemo that resolves the effective clef from either an explicit prop or the note range. Before this, clef was hard-coded to 'treble' in the props default, which meant octave-2 and octave-3 melodies rendered as a wall of ledger lines below the staff. Using median MIDI (not mean) so an octave-jump outlier in an otherwise-treble melody doesn't flip the staff. Threshold is MIDI 60 (C4) exactly — matches the plan and is the natural break between the treble and bass staves. The existing render path already threads the resolved clef into stave.addClef() and StaveNote({clef}), so the change was localized to resolving the value correctly. No VexFlow key-string changes needed — 'c/3' renders correctly on both clefs, the clef attribute tells VexFlow how to position it on the staff and which direction to draw stems. Could not visually verify in browser from this container (browser tools unavailable); noted in commit message for the human to eyeball.

## Verification

Node smoke test of pickClefFromNotes covers octaves 2-5 (all correct), a borderline straddle case (median==60 returns treble as designed), and empty/null inputs (safe treble default). vite build clean, 182 modules, 2.44s.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `node -e '<pickClefFromNotes smoke test>'` | 0 | ✅ pass | 60ms |
| 2 | `npm run build` | 0 | ✅ pass | 2440ms |

## Deviations

None.

## Known Issues

Visual verification in the browser was not performed because browser tools are unavailable in this sandboxed environment. The render path change is self-contained and type-safe, so risk is low, but a staging eyeball is worth doing before shipping.

## Files Created/Modified

- `src/components/NotationDisplay.jsx`
