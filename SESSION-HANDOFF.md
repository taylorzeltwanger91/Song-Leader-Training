# Session Handoff — 2026-08-27

> **Ephemeral.** Rewritten at the end of each session. Don't append — overwrite.
> Permanent decisions live in PROJECT-LOG.md; known debt in TECH-DEBT.md.

## What was done

**Hymns 31–50 transcribed and dual-verified on both staves.** 19 hymns (46 is absent
from the index), 38 staves, ~4,600 events, every staff read twice by independent blind
agents. All 19 assemble, validate, harmony-scan and render.

The verification method itself was **measured** for the first time, and one leg of the
plan was measured and abandoned. Full findings in PROJECT-LOG 2026-08-27. Headlines:

- 13/19 trebles and 15/19 basses identical between the two blind passes.
- **Four real errors found**, none catchable by any automated gate, all harmonically
  silent: hymn 49 sop m11, hymn 32 bass m13, hymn 42/44 sop m5, hymn 40 bass m10.
- **Three of my key readings were wrong** (34=Ab, 37=Bb, 43=Db), all caught by readers.
  Cause: the key-signature verification crop was too narrow and truncated wide
  signatures. Now read at ≥26% of staff width.
- **GPT-5.5 via Codex rejected twice** — 38–42% SER as a transcriber, 5.3% canary recall
  over 19 audits as a verifier. The earlier 3/3 result was one run, not a measurement.

**The pipeline is now a skill:** `~/.claude/skills/hymn/SKILL.md` (invoke `/hymn`).
Steps, gates, adjudication ladder, reader measurements, failure catalogue.

**New tooling committed:** `tools/omr/parse_grouped.py` (measure-grouped flattener with
the cross-staff gate), `make_prompts.py` switched to measure-grouped output.

## Running state

- **Background processes:** none. All read agents completed.
- **Dev servers:** none. **Worktrees:** none.
- **Untracked and left alone:** `.bg-shell/` (pre-existing, not from this work).

## Verification commands

```bash
CI=true npm run build                                    # 204 tests, then vite build
python3 tools/omr/validate_satb.py <assembled>.json      # -> VALID: ... N beats each
python3 tools/omr/harmony_scan.py  <assembled>.json      # 0–8% dissonance is normal
```
To re-check any hymn end-to-end:
`python3 tools/omr/assemble.py tools/omr/hymns/pending/40.txt -o /tmp/h.json && python3 tools/omr/validate_satb.py /tmp/h.json`

## Next steps

1. **EAR-CHECK hymns 31–50** — the one thing blocking promotion out of `pending/`.
   Audio is rendered in each `~/Downloads/ZionsHymns-Archive/hymn-NNN-*/` folder
   (`_4part.wav`, `_4part.mid`, `_soprano.wav`). Listen first to the four corrected
   notes above; a wrong note both passes read the same way still sounds wrong.
2. **Promote `pending/` → `hymns/` → `public/hymn_satb/`** once the ear clears them,
   and extend `src/audio/melody-data.test.js` to cover the new ids.
3. **Decide on hymn 46** (missing from `hymn_index.json` — see TECH-DEBT).
4. Older open items unchanged: mobile audio ear-check, hymn 2 soprano F5/Eb5.

## Open questions

- Two blind reads come from the **same model**. That is not proof, and no substitute
  for a different reader has been found — Codex failed twice. The ear is currently the
  only independent verifier in the stack. If a genuinely different vision model becomes
  available for shape notes, that gap is the place to spend it.

## How to resume

Say "jump into the hymn project" and read this file plus `~/.claude/skills/hymn/SKILL.md`.
The skill carries the procedure and every hard-won failure mode; the repo carries the tools.
