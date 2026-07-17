# AGENTS.md

See [CLAUDE.md](./CLAUDE.md) for project instructions — guardrails, accepted patterns,
and the current security-scan state. This file is a pointer for non-Claude agents
(Codex, Cursor, Aider, OpenCode, huz, etc.).

**Why CLAUDE.md is canonical here and not AGENTS.md** (inverted from the wider
ecosystem convention): a scheduled portfolio security scan auto-rewrites a
`SCAN:AUTO` block inside `CLAUDE.md`. Keeping CLAUDE.md as the source of truth means
the scan's writable surface and the agent-instructions surface stay co-located.
AGENTS.md exists so agents looking for the standard file find a pointer instead of
nothing.

## Read these before changing anything

| File | What it's for |
|---|---|
| `CLAUDE.md` | Guardrails, accepted patterns, live security flags. **Read the guardrails.** |
| `TECH-DEBT.md` | Known debt. Check before "fixing" something that's a known tradeoff. |
| `PROJECT-LOG.md` | Why things are the way they are. Decisions, with dates and file paths. |
| `SESSION-HANDOFF.md` | What the last session did and what's mid-flight. Ephemeral — trust the date on it. |
| `CHANGELOG.md` | User-visible history. |
| `.gsd/` | GSD milestone artifacts, where they exist. See caveat below. |

## This repo has more than one agent working in it

Commits come from at least three identities: two humans (`taylorzeltwanger91`,
`Galen`) and an agent (`huz-agent <huz@local>`) that commits under its own name and
merges via generated branch names (`huz/<hash>`). If you are an agent working here,
**assume another agent has touched the file you are about to change**, and assume
your branch is not the only one in flight.

The April 2026 merge is the cautionary tale, and the reason this section exists: two
agent branches implemented the same milestone in parallel, one got merged, the other
— containing the octave-tolerant grading fix — did not, and the loss went unnoticed
for three months. Details in `PROJECT-LOG.md` (2026-07-16). Before starting work,
run `git branch -a` and look for unmerged `huz/*` branches that already do what
you're about to do.

## Conventions

- **Milestone artifacts live in `.gsd/milestones/M###/`** — `M###-ROADMAP.md`,
  `M###-CONTEXT.md`, `M###-VALIDATION.md`, plus per-slice `S##-PLAN/SUMMARY/UAT.md`
  and per-task `T##-PLAN/SUMMARY.md`. If you plan work this way, **commit the
  artifacts to the same branch as the code they describe**, and merge them together.
  M001's planning docs are currently stranded on an unmerged branch while a partial
  version of its code shipped on `main` — that split is exactly what to avoid.
- **Commit format:** `M###/S##/T##: <what changed>` for milestone work; conventional
  prefixes (`feat:`, `chore:`, `fix:`) otherwise. Both are in use.

## Where this is going

Read [`docs/research/DIRECTION.md`](./docs/research/DIRECTION.md) before proposing
architecture. Short version: photo/upload of music → OCR notes per voice part (SATB)
→ sing a cappella → graded on pitch and timing. Later, multiplayer sing-off rooms.
**Soprano is the priority part, but all four voices get parsed** — soprano-first is
sequencing, not scope.

## Hard rules

- **Do not push.** This is `taylorzeltwanger91/Song-Leader-Training`, a shared repo.
  Commit locally; a human pushes.
- **Do not add code to `App.jsx`.** It is ~1,380 lines. New logic goes in
  `src/audio/` modules or new components under `src/components/`.
- **Do not add dependencies** without explicit approval.
- **Do not remove `console.warn`/`console.error` in `src/audio/`** — accepted pattern.
- **Do not delete or overwrite existing files** without explicit confirmation.

### Retired 2026-07-16: "client-side only, no backend"

This file and `CLAUDE.md` used to carry **"No backend, no auth, no env vars, no
database. Client-side only, by design."** **That rule is retired** — the owners
approved a backend on 2026-07-16 (`PROJECT-LOG.md`). It is called out here rather
than silently deleted because it was the single largest blocker to the project's
actual goal, and an agent finding it in a stale cache should know it's dead. OCR
ingest and multiplayer rooms both require server-side work. Build accordingly, but
still **ask before adding a service or a dependency** — hobby budget, and it's
Taylor's project.

## Verify before you claim done

```bash
npm install
npm run lint     # must stay at 0 errors; no-undef is an error and gates the build
npm run build    # prebuild runs lint; must exit 0
npm run dev      # http://localhost:5173 — mic permission needed for pitch detection
```

Anything touching pitch detection or grading needs a real microphone check — the
scoring math is the product, and it has already shipped a silent wrong-output bug
once (see `TECH-DEBT.md`). A green build is not evidence that grading is correct.
