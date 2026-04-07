---
estimated_steps: 1
estimated_files: 3
skills_used: []
---

# T02: Thread selected octave into PitchEngine vocal range

Add a helper (in src/audio/melody-generator.js or a new helper file) `octaveToFrequencyRange(octave)` that maps the selected octave to a pitch-engine frequency band with ±1 octave of headroom so singers can sing up or down. Rough mapping: octave 2 → {min: 55, max: 260} (A1 to C4), octave 3 → {min: 82, max: 520} (E2 to C5), octave 4 → {min: 130, max: 880} (C3 to A5), octave 5 → {min: 220, max: 1200} (A3 to D6). In App.jsx startRec flow (around line 649), after the PitchEngine is created and before init(), call `engine.setVocalRange('custom', octaveBand)` — but PitchEngine.setVocalRange currently only accepts preset strings. Either extend setVocalRange to accept a {min,max} object, or add a new setFrequencyRange method that takes the band directly and use it. Pick whichever is cleaner. Also: when the recording is for a generated exercise, pass genOctave through; when it's for a hymn, leave the range on 'auto'.

## Inputs

- `src/audio/pitch-engine.js`
- `src/App.jsx startRec`

## Expected Output

- `octaveToFrequencyRange helper`
- `PitchEngine accepts a custom frequency band`
- `startRec threads genOctave through when recording a generated exercise`

## Verification

npm run build 2>&1 | tail -5 && grep -n 'setFrequencyRange\|octaveToFrequencyRange' src/audio/pitch-engine.js src/audio/melody-generator.js src/App.jsx

## Observability Impact

pitch engine logs the active frequency band on init if the band changes from the default
