# CLAUDE.md — Song Leader Training

## Project Overview
Song leader training and coaching app for hymn singing. Client-side only React application with no backend, no auth, and no database.

## Tech Stack
- **Frontend:** React 18.3.1, Vite 6, Canvas API, Web Audio API
- **Fonts:** DM Sans, DM Serif Display (Google Fonts via CSS @import in App.jsx)
- **Data:** Static JSON files (hymn index, hymn melodies) — no database, no localStorage
- **Integrations:** Web Audio API, getUserMedia (microphone access), soundfont-player (fetches church_organ from MusyngKite CDN at runtime)
- **Auth:** None (local practice tool)
- **Hosting:** Vercel (vercel.json present)

## Project Stats
<!-- SCAN:AUTO:METRICS:START -->
- **Total lines:** ~8,100 (src only, excluding legacy root files)
- **JSX:** ~3,200 lines (App.jsx 1,381 + PitchVisualizer.jsx + main.jsx) | **JS:** ~1,738 lines (audio modules)
- **Components:** 2 (App.jsx, PitchVisualizer.jsx) | **Pages:** 0 | **API routes:** 0
- **Files over 500 lines:** 3 (App.jsx ~1,381 lines; zions-hymns-trainer.jsx legacy root; zions-hymns-trainer_3.jsx legacy root)
- **Duplication areas:** Legacy root files duplicate much of App.jsx logic
<!-- SCAN:AUTO:METRICS:END -->

---

## Guardrails

### Universal Guardrails
1. **Do not delete or overwrite existing files** without explicit user confirmation.
2. **Do not install new dependencies** without explicit user approval.
3. **Do not modify package.json scripts** without explicit user approval.
4. **Do not change the build or bundler configuration** without explicit user approval.
5. **Do not alter directory structure** without explicit user approval.
6. **Do not remove console statements** in audio modules (accepted pattern).
7. **Do not push to remote repositories** without explicit user approval.
8. **Do not create documentation files** unless explicitly requested.

### Project-Specific Guardrails
<!-- SCAN:AUTO:GUARDRAILS:START -->
- **Do not add code to App.jsx.** It is already 1,381 lines. Any new features should be extracted into separate components or modules.
- **Clean up legacy files in root** (zions-hymns-trainer.jsx, zions-hymns-trainer_3.jsx — dead code). When touching related functionality, prefer removing dead code over working around it.
- **No auth system needed.** This is a local practice tool. Do not add authentication or user management.
- **No env vars.** Do not introduce environment variable dependencies.
- **Add CSP header before deploying new features.** Content-Security-Policy is the last missing security header — add it to vercel.json.
<!-- SCAN:AUTO:GUARDRAILS:END -->

---

## Accepted Patterns
<!-- SCAN:AUTO:ACCEPTED:START -->
- No authentication (practice tool, public repo is fine)
- Console statements in audio modules (recorder.js, pitch-engine.js — console.warn/error only, no sensitive data)
<!-- SCAN:AUTO:ACCEPTED:END -->

## Resolved Issues
<!-- SCAN:AUTO:RESOLVED:START -->
- .gitignore expanded
- 24 debug console.log statements removed
- X-Frame-Options header added to vercel.json (DENY)
- X-Content-Type-Options header added to vercel.json (nosniff)
- Referrer-Policy header added to vercel.json (strict-origin-when-cross-origin)
- HSTS header added to vercel.json (max-age=31536000; includeSubDomains)
- Source maps: Vite production builds do not include source maps by default (non-issue)
<!-- SCAN:AUTO:RESOLVED:END -->

## Active Flags
<!-- SCAN:AUTO:FLAGS:START -->
- App.jsx is 1,381 lines (needs decomposition) — maintenance
- Legacy root files: zions-hymns-trainer.jsx + zions-hymns-trainer_3.jsx (~1,433 lines dead code) — maintenance
- No Content-Security-Policy header configured — moderate
- Google Fonts CDN loaded via CSS @import without SRI (App.jsx line 257) — moderate
- soundfont-player fetches church_organ from unpinned MusyngKite CDN at runtime — moderate
- Node version unpinned (no .nvmrc or engines field in package.json) — maintenance
- soundfont-player v0.12.0 unmaintained since 2018 (no maintained alternative available) — maintenance
<!-- SCAN:AUTO:FLAGS:END -->

## Security Scan
<!-- SCAN:AUTO:START -->
Last scan: 2026-03-20 (V5)
Total flags: 7 (0 critical, 0 high, 3 moderate, 4 maintenance)
No hardcoded secrets, no env exposure, no XSS vectors, no SQL injection, no CSRF, no auth gaps.
Client-side only app with no backend, no cookies, no localStorage, no database.
Security headers added since last scan: X-Frame-Options, X-Content-Type-Options, Referrer-Policy, HSTS (all now in vercel.json).
Remaining: CSP not yet configured. Google Fonts and soundfont-player CDN dependencies are unverified third-party fetches.
<!-- SCAN:AUTO:END -->

---

## Manual Notes
<!-- MANUAL:START -->

<!-- MANUAL:END -->

## Architecture Notes
<!-- MANUAL:ARCHITECTURE:START -->

<!-- MANUAL:ARCHITECTURE:END -->

## Known Issues
<!-- MANUAL:ISSUES:START -->

<!-- MANUAL:ISSUES:END -->

## Development Commands
<!-- MANUAL:COMMANDS:START -->

<!-- MANUAL:COMMANDS:END -->
