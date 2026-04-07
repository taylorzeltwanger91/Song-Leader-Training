---
id: T02
parent: S02
milestone: M001
key_files:
  - src/audio/pitch-engine.js
  - src/audio/melody-generator.js
  - src/audio/index.js
  - src/App.jsx
key_decisions:
  - Extended the existing vocalRange slot to accept an {min,max} object instead of introducing a parallel 'custom range' field — keeps the preset code path simple
  - Clamped the low end of the octave band to C2 (65 Hz) — nothing below is realistically singable and removing sub-C2 noise helps YIN
  - Clamped the high end at 1400 Hz regardless of octave — singing rarely exceeds that and harmonic-chasing above 1400 Hz is noisy
  - Made exerciseOctave an optional trailing parameter on startRec so hymn practice can keep its existing signature and stay on the full-range 'auto' preset
duration: 
verification_result: passed
completed_at: 2026-04-07T21:49:34.940Z
blocker_discovered: false
---

# T02: Pitch engine detection band now follows the selected exercise octave; hymn practice stays on auto.

**Pitch engine detection band now follows the selected exercise octave; hymn practice stays on auto.**

## What Happened

Extended PitchEngine._getFrequencyRange() to accept an explicit {min,max} object on this.vocalRange, so the existing 'auto' and preset-string code paths are unchanged but callers can now set an arbitrary band. Added a PitchEngine.setFrequencyRange(min,max) thin wrapper for readability at the call site. Added octaveToFrequencyRange(octave) in melody-generator.js that maps the exercise octave to a sensible detection band — one octave above the tonic band, clamped to C2 on the low end (nothing below is singable) and 1400 Hz on the high end (YIN chasing higher harmonics is noisy). In App.jsx startRec, added an optional exerciseOctave parameter; when set, setVocalRange is called with the computed band before engine.init(). Hymn practice calls don't pass the octave so they stay on 'auto' since hymns can legitimately span multiple octaves. Generator Begin Exercise button now threads genOctave through. Build is clean.

## Verification

node smoke test of octaveToFrequencyRange produces sensible bands (oct 2: 65-247, oct 3: 65-494, oct 4: 131-988, oct 5: 262-1400). grep confirms all wiring symbols present. vite build clean.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `node -e '<octaveToFrequencyRange smoke test>'` | 0 | ✅ pass | 60ms |
| 2 | `npm run build` | 0 | ✅ pass | 2440ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `src/audio/pitch-engine.js`
- `src/audio/melody-generator.js`
- `src/audio/index.js`
- `src/App.jsx`
