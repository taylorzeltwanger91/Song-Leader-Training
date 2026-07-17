# Research — 2026-07-16

Research done before restarting work on this project, when it became clear the repo
had no stated goal and no plan. Everything here was gathered on **2026-07-16** by
parallel research agents plus a full read of the codebase.

## Read in this order

| File | What it answers |
|---|---|
| **[DIRECTION.md](./DIRECTION.md)** | **Start here.** Where we think this should go and why. The plan. |
| [omr-and-ingest.md](./omr-and-ingest.md) | Can we OCR the music? **The finding that reshaped the plan lives here.** |
| [current-app-audit.md](./current-app-audit.md) | What the app actually is today, and what's broken in it |
| [grading-methodology.md](./grading-methodology.md) | How to score singing correctly (and how we're scoring it wrong) |
| [competitive-landscape.md](./competitive-landscape.md) | Has anyone already built this? |
| [multiplayer-rooms.md](./multiplayer-rooms.md) | Sing-off rooms — what's feasible, what's fun |

## How to treat this

**These are research findings, not decisions.** Decisions live in
[`PROJECT-LOG.md`](../../PROJECT-LOG.md) at the repo root. Where a finding is
unverified or secondhand it says so — respect those markers rather than laundering
them into confidence. Several claims here are explicitly flagged as
"could not verify"; those are honest gaps, not oversights to paper over.

Dates matter. This is a snapshot of 2026-07-16. Tool versions, free tiers, and
product capabilities move. Re-check before betting on a number.

## The one-paragraph version

Nobody has shipped "scan your own sheet music → sing it → get graded" — the OMR
products refuse to listen, the grading products refuse to let you import, and the
entire choral-practice category is playback-only that never evaluates the singer.
So the target niche is real. The hard part is ingest: **Zion's Hymns is a
shape-note hymnal**, and shape notes are the known-worst case for off-the-shelf
OMR — in ~20 years of shape-note digitization, no corpus has ever been produced by
OMR. But for our purpose the *shape* is redundant information, and 458 pages of
identical engraving is an unusually favorable CV problem. Meanwhile the app's
grading — the part that already exists — is confidently wrong in two independent
ways and needs fixing regardless of any of this.
