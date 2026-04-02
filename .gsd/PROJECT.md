# Zion's Hymns Song Leader Trainer

A React/Vite web app that trains people to sight-read and lead a cappella hymn singing from Zion's Hymns (2021 Edition, 250 hymns).

## Current State (v3.0.0)

- **Hymn browser** with scanned page images (PNG) for all 250 hymns
- **Generated exercises** with configurable time signature, tempo, key, syllables, melisma
- **Pitch detection** via YIN algorithm (AudioWorklet + main-thread smoothing pipeline)
- **Performance grading** comparing detected pitch to reference melody (pitch, rhythm, stability scores)
- **Audio playback** via Soundfont (church organ) for lead-in and full melody preview
- **PWA** with manifest and app icons

## Tech Stack

- React 18, Vite 6, no TypeScript
- Single ~1400-line monolithic `App.jsx`
- VexFlow (planned) for real music notation
- @tonejs/midi (planned) for MIDI file parsing
- Deployed via Vercel

## Key Directories

- `src/` — App source (App.jsx, audio/, components/)
- `public/sheet_music/` — Scanned hymn page PNGs
- `public/hymn_melodies/` — JSON melody data (only hymn 237 exists)
- `public/hymn_index.json` — Index of all 250 hymns

## Repository

GitHub: `taylorzeltwanger91/Song-Leader-Training`
