# S01: Octave selection + clef-aware notation

**Goal:** Add octave control to the generator, anchor generated melodies to the chosen octave, and switch NotationDisplay clef based on the actual note range — without bloating App.jsx.
**Demo:** After this: User opens the generator, picks an octave (2/3/4/5), hits Generate, and sees a melody on the correct clef whose notes sit in the chosen octave.

## Tasks
- [x] **T01: Extracted melody generator into src/audio/melody-generator.js with octave parameter support and verified anchor across 16 key/octave combos.** — Pull `generateMelody`, `scaleDegToMidi`, `KEYS`, `MAJOR_SCALE`, `NOTE_NAMES`, `midiToFreq` out of `src/App.jsx` into a new module `src/audio/melody-generator.js`. Re-export from `src/audio/index.js`. Add an `octave` parameter (default 4) to `generateMelody` so the rootMidi calculation becomes `12*(octave+1) + KEYS.indexOf(root)`. Verify with a quick standalone node script that octave 2/3/4/5 produce melodies in the right MIDI bands. Update App.jsx to import from the new module and pass the chosen octave through.
  - Estimate: 30m
  - Files: src/audio/melody-generator.js, src/audio/index.js, src/App.jsx
  - Verify: node -e "import('./src/audio/melody-generator.js').then(m => { for (const oct of [2,3,4,5]) { const notes = m.generateMelody('4/4', 80, 4, 'C', oct); const lo = Math.min(...notes.map(n=>n.midi)); const hi = Math.max(...notes.map(n=>n.midi)); console.log('octave', oct, 'lo', lo, 'hi', hi); if (lo < 12*(oct+1) || lo >= 12*(oct+2)) { console.error('FAIL: octave', oct, 'lo', lo); process.exit(1); } } console.log('PASS'); })" && npm run build 2>&1 | tail -5
- [x] **T02: Added octave (2/3/4/5) selector to generator settings UI and wired it through doGenerate.** — In the generator settings view (vw === V.GEN in App.jsx), add a new section between Key and Syllable Complexity called 'Octave'. Render four buttons (2, 3, 4, 5) styled like the existing Measures buttons. Wire to a new `genOctave` state, default 4. Pass it to `generateMelody` in `doGenerate`. Add a small helper text showing the rough range, e.g. 'Bass / low tenor', 'Tenor', 'Alto / high tenor', 'Soprano'.
  - Estimate: 20m
  - Files: src/App.jsx
  - Verify: npm run build 2>&1 | tail -5 && grep -n 'genOctave' src/App.jsx | head
- [x] **T03: NotationDisplay auto-picks bass clef for median-MIDI-below-C4 melodies; treble otherwise.** — Modify `src/components/NotationDisplay.jsx` to auto-pick clef from the median MIDI of the supplied notes when no explicit clef prop is passed. Median < 60 → 'bass', otherwise 'treble'. Keep the explicit `clef` prop as override. Adjust `midiToVexKey` if needed for bass clef — VexFlow uses the same key strings, but the StaveNote constructor needs `clef: 'bass'` for stem direction. Verify with a manual render in the browser dev server.
  - Estimate: 25m
  - Files: src/components/NotationDisplay.jsx
  - Verify: npm run build 2>&1 | tail -5
