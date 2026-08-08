# Changelog

> User-visible changes. Newest at top.
> Format follows [Keep a Changelog](https://keepachangelog.com).
>
> **Note on versions:** this project has no release tags. `package.json` says `1.0.0`
> and `.gsd/PROJECT.md` says `v3.0.0` — neither is maintained, so neither is trusted
> here. Entries below are grouped by date and reconstructed from git history on
> 2026-07-16; they were not written at release time. Start tagging releases and this
> file becomes authoritative going forward.

## [Unreleased]

### Added
- **Hymns 1–10 are now available as full four-part (SATB) practice material** — pick any voice (soprano, alto, tenor, bass) and hear or sing your part. Transcribed from the hymnal and cross-checked by two independent readers plus harmony and structural validation. (2026-08-07)

### Fixed
- **Grading no longer fails singers who sing in their own octave.** A bass singing a hymn perfectly used to score **0 — every note marked missed**; it now scores the same as a soprano at pitch. Matching is octave-agnostic. (2026-07-17)
- **Timing is read from where notes are printed**, not from adding up durations. A malformed bar used to shift every later note out of the match window, so a correct performance graded as wrong. (2026-07-17)
- **A quiet room or cheap microphone no longer costs you pitch points.** Detector confidence was 20% of the pitch score; it isn't pitch, so it's gone. (2026-07-17)
- **Hymn 237's music data corrected** — four bars didn't add up to the 3/2 meter. (2026-07-17)
- **Hymns with no melody data no longer let you record a performance and then hand back a zero.** Practice is disabled with an explanation instead. (2026-07-17)

### Removed
- **The "Count-off" score.** Nothing measured a count-off — the number was derived from the stability score. It will come back when something real is behind it. (2026-07-17)

### Added
- Project memory layer: `PROJECT-LOG.md`, `SESSION-HANDOFF.md`, `TECH-DEBT.md`, this file, and `AGENTS.md` for non-Claude agents. (2026-07-16)
- Research findings and project direction in `docs/research/`. (2026-07-16)
- Tests on the grading math, wired into the build (`prebuild` runs lint + test). (2026-07-17)

### Known issues
- Only hymn 237 has melody data; the other 249 hymns are sheet-music browsing only. Off-the-shelf OMR was tested and fails on this hymnal's shape notes — see `docs/research/omr-and-ingest.md`.
- Match windows overlap: a singer drifting sharp can get credit for a note they didn't hit. See `TECH-DEBT.md`.
- Bass parts render with a wall of ledger lines — clef is hardcoded to treble.

---

## 2026-04-11 — Octave selection

### Added
- Octave/register selection for melody generation (`b16dbb1`, merged in `244cf7f` by taylorzeltwanger91).

> Partial delivery. A parallel agent branch implemented octave-tolerant grading,
> auto-clef selection, and a extracted melody-generator module against the same
> milestone; that branch was never merged. See `PROJECT-LOG.md` 2026-07-16.

## 2026-04-01 — Notation and MIDI

### Added
- VexFlow notation display for generated exercises — real music notation instead of the pitch grid alone (`0ec6ae4`, `src/components/NotationDisplay.jsx`).
- MIDI file parsing, wired into hymn practice mode (`9bdb4e0`, `src/audio/midi-parser.js`, `@tonejs/midi`).

### Changed
- Pitch engine accuracy improved; grader tolerances tightened (`e3eb252`).

## 2026-03-14 — Hardening

### Added
- Security headers in `vercel.json`: HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy (`a2793af`).
- Node version pinned to 20 via `.nvmrc` (`a2793af`).

## 2026-02-17 — Playback

### Added
- Realistic instrument playback via soundfont-player (church organ) (`b90a2af`).
- Configurable lead-in playback for hymn practice (`db5e32f`).

## 2026-02 — Initial build

### Added
- Real-time pitch detection using the YIN algorithm via AudioWorklet, with parabolic interpolation.
- Canvas-based pitch visualizer at 60fps (bypasses React for performance).
- Practice modes: real hymns and auto-generated exercises with configurable time signature, tempo, key, syllables, and melisma.
- Grading system scoring pitch accuracy, rhythm, and stability.
- Hymn browser over 250 scanned hymns from Zion's Hymns (2021 Edition).
- PWA support — installable on mobile, with manifest and app icons.
