---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T03: Make NotationDisplay clef-aware

Modify `src/components/NotationDisplay.jsx` to auto-pick clef from the median MIDI of the supplied notes when no explicit clef prop is passed. Median < 60 → 'bass', otherwise 'treble'. Keep the explicit `clef` prop as override. Adjust `midiToVexKey` if needed for bass clef — VexFlow uses the same key strings, but the StaveNote constructor needs `clef: 'bass'` for stem direction. Verify with a manual render in the browser dev server.

## Inputs

- `src/components/NotationDisplay.jsx`

## Expected Output

- `NotationDisplay picks clef automatically`
- `Bass-clef rendering verified`

## Verification

npm run build 2>&1 | tail -5
