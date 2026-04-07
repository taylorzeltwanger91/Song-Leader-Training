---
estimated_steps: 1
estimated_files: 3
skills_used: []
---

# T01: Extract melody generator into src/audio/melody-generator.js with octave support

Pull `generateMelody`, `scaleDegToMidi`, `KEYS`, `MAJOR_SCALE`, `NOTE_NAMES`, `midiToFreq` out of `src/App.jsx` into a new module `src/audio/melody-generator.js`. Re-export from `src/audio/index.js`. Add an `octave` parameter (default 4) to `generateMelody` so the rootMidi calculation becomes `12*(octave+1) + KEYS.indexOf(root)`. Verify with a quick standalone node script that octave 2/3/4/5 produce melodies in the right MIDI bands. Update App.jsx to import from the new module and pass the chosen octave through.

## Inputs

- `src/App.jsx (lines 50-160)`
- `src/audio/index.js`

## Expected Output

- `src/audio/melody-generator.js with generateMelody, scaleDegToMidi, KEYS exports`
- `src/audio/index.js re-exports`
- `App.jsx imports updated, no behavior change yet`

## Verification

node -e "import('./src/audio/melody-generator.js').then(m => { for (const oct of [2,3,4,5]) { const notes = m.generateMelody('4/4', 80, 4, 'C', oct); const lo = Math.min(...notes.map(n=>n.midi)); const hi = Math.max(...notes.map(n=>n.midi)); console.log('octave', oct, 'lo', lo, 'hi', hi); if (lo < 12*(oct+1) || lo >= 12*(oct+2)) { console.error('FAIL: octave', oct, 'lo', lo); process.exit(1); } } console.log('PASS'); })" && npm run build 2>&1 | tail -5
