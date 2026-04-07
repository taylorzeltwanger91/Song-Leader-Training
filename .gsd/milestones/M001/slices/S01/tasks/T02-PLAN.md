---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T02: Add octave selector to generator settings UI

In the generator settings view (vw === V.GEN in App.jsx), add a new section between Key and Syllable Complexity called 'Octave'. Render four buttons (2, 3, 4, 5) styled like the existing Measures buttons. Wire to a new `genOctave` state, default 4. Pass it to `generateMelody` in `doGenerate`. Add a small helper text showing the rough range, e.g. 'Bass / low tenor', 'Tenor', 'Alto / high tenor', 'Soprano'.

## Inputs

- `src/App.jsx GEN view (lines ~1320-1410)`

## Expected Output

- `genOctave state + setter`
- `UI buttons rendered between Key and Syllable Complexity`
- `doGenerate passes octave through`

## Verification

npm run build 2>&1 | tail -5 && grep -n 'genOctave' src/App.jsx | head
