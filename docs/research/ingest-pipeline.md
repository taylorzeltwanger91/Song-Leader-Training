# Ingest Pipeline — building the full SATB archive

Written **2026-07-19**, after the method was proven on hymn 237. This is the flow for
turning 458 scanned pages into verified 4-part (SATB) note data for all ~256 hymns.

**Scope decision (Galen, 2026-07-19):** capture **all four voices** for every hymn,
even though the app may only ever grade soprano. If we're doing the work, we build the
complete archive once.

---

## The core insight this pipeline is built on

Shape noteheads encode pitch **twice** — the shape is the solfège syllable, the position
is the pitch. That redundancy defeats classical OMR but is a gift to a vision model,
which cross-checks shape against position. So the pipeline is **vision-LLM reading with
automated validation gates and a human ear as the final authority** — not OCR, not the
custom CV detector (parked at ~27%).

Proven on hymn 237: two independent vision models agreed on 31/32 soprano notes; geometry
settled the 32nd; a human ear confirmed; every bar validated to the meter.

---

## The flow

```
                                                        ┌─ automated gate
  [0] map hymns→pages                                   ▼
  [1] staff-detect + crop ──► [2] dual vision read ──► [3] reconcile ──► [4] validate
       (CV, cheap)              (Fable + GPT,            (agree/geometry)  (bars, onsets,
                                 per staff, S/A/T/B)                        range)
                                                                             │
   [7] wire into app ◄── [6] verify ◄── [5] assemble ◄──────────────────────┘
       (voice picker)     (ear-check,     (4-part JSON)
                          prioritized)
```

### [0] Map hymns → pages
`hymn_index.json` already maps each hymn to its page image(s). Most hymns are one page
(237 = page 427). Some span two. Produce a work-list of (hymnId → [page images]).

### [1] Staff detection + crop  — *automated, cheap, already built*
The CV staff detection from the parked detector is genuinely good and is **retained for
this step**. Per page: find the 6 staff lines × N systems, then crop each system's
**treble** staff (carries Soprano + Alto) and **bass** staff (carries Tenor + Bass) into
separate images. This isolation is what made the vision reads accurate on 237.
Output: per hymn, a set of treble-crops and bass-crops, one per system.

### [2] Dual vision read  — *the engine*
For each crop, read with **two independent vision models** (Fable + GPT-5.6), using the
shape-note-aware prompt (clef, key, meter, voice = top/bottom by stem direction, shape as
cross-check). Read **both pitch and duration**.
- Treble crop → **Soprano** (top, stems up) + **Alto** (bottom, stems down).
- Bass crop → **Tenor** (top, stems up) + **Bass** (bottom, stems down).

Voice→staff→stem map (memorize this — it's the whole reading key):
| Voice | Staff | Position | Stems |
|---|---|---|---|
| Soprano | Treble | top | up |
| Alto | Treble | bottom | down |
| Tenor | Bass | top | up |
| Bass | Bass | bottom | down |

Cost reality: one Fable read ≈ 85–120k tokens, ~7–12 min. GPT is on Galen's ChatGPT
subscription (no per-call cost) but currently requires a human to paste (no API wired).
Budget ~2 crops × 2 models = 4 reads/page. Offline batch; parallelizable.

*Optimization to test, not assume:* hymns are largely **homophonic** (voices share
rhythm). Read the soprano rhythm once and offer it as the rhythmic grid for the other
voices, having them read only pitch per position and **flag deviations**. 237 proved
voices DO split (eighth runs, held notes), so this is a prior to verify, never a
shortcut that skips reading.

### [3] Reconcile  — *automated where possible*
Per note, per voice: where the two models **agree**, accept. Where they **differ**,
resolve by **pixel geometry** (a note's position relative to a confirmed neighbor is
immune to absolute measurement bias — this settled 237's note 7) and/or defer to human.
Record a per-note confidence.

### [4] Validate  — *automated hard gate*
The `melody-data` test suite is this gate. Every voice must pass:
- Every interior bar sums to the meter; a pickup + final bar may form an anacrusis.
- `onset` (absolute beats from start) equals cumulative duration.
- Pitches in a plausible vocal range for the voice.
A voice that fails validation does **not** advance — it goes to human review. Silent bad
data is the one thing this whole project exists to prevent (see the octave bug and the
malformed 237 bars we already fixed).

### [5] Assemble  — 4-part JSON
```
{ hymnId, title, key, timeSignature, bpm, anacrusis,
  voices: { soprano:[…], alto:[…], tenor:[…], bass:[…] } }
```
Each note: `{ midi, dur, onset, measure?, beat?, lyric? }`. `onset` is the timing source
of truth. (This is the SATB data model — the app migrates from single `notes` to
`voices`; see Phase 2 in DIRECTION.)

### [6] Verify  — *human ear, prioritized*
We cannot fully ear-check 256 hymns. So triage by confidence:
- **Green** (models agree + bars valid): auto-accept, **sample** ~1 in 5 by ear.
- **Yellow** (minor disagreement or a bar that needed geometry): **spot-check** the
  flagged notes by ear.
- **Red** (major disagreement, failed validation, or unreadable scan): **human
  transcribes** — read it against the book, or enter it in MuseScore.
The ear-reference for any hymn is **zionsharp.info's per-hymn 4-part MP3** (all 256
exist). Render our 4-part synth, A/B against the MP3. If they match, verified.

### [7] Wire into app
App gets a **voice picker** (default soprano). It grades the selected voice with the
Phase-1 grader (octave-agnostic, onset-based timing — already handles all of this).

---

## Human checkpoints (where Galen/Taylor are the authority)
1. **Confirm the recipe generalizes** — verify hymn 237's 4 parts by ear (in progress),
   then run ONE more hymn end-to-end before batching.
2. **Red-tier transcription** — hymns the models can't agree on.
3. **Final sample audit** — ear-check the green-tier sample.
Everything else is automated. The design goal: humans touch only what the machine can't
verify itself.

## What's built vs. what's next
| Stage | State |
|---|---|
| [1] staff detect + crop | ✅ built (in the parked detector; needs packaging into `tools/omr/`) |
| [2] vision read | ✅ proven manually (Fable via Agent tool; GPT via paste). Needs batching. |
| [3] reconcile / geometry | ⚠️ done by hand for 237; needs to be scripted |
| [4] validate | ✅ built (`melody-data.test.js`) — generalize to all voices |
| [5] assemble 4-part | ⚠️ 237 assembled by hand; needs the JSON schema locked + a builder |
| [6] verify | process defined; MP3 reference confirmed available |
| [7] app voice picker | ❌ not started (Phase 2 + Phase 4) |

## Cost / time honesty
The expensive part is [2]. ~4 reads/page × ~256 hymns, ~10 min/read, is on the order of
**150+ hours of model wall-clock** — but it's offline, parallelizable, and unattended.
The human time is only the checkpoints. This is a "kick off a batch and review the
flagged cases" project, not a "sit and transcribe 250 hymns" project. That's the whole
point of getting the pipeline right.

## Decisions still open
- **Batch orchestration:** build `tools/omr/` as a real pipeline (staff-crop → read →
  reconcile → validate → assemble), or run it semi-manually hymn-by-hymn at first?
- **GPT automation:** wire the OpenAI API for the second model, or keep GPT as a
  human-paste cross-check used only on disagreements?
- **Homophony optimization:** measure how often voices actually share rhythm across a
  sample before deciding whether to read durations per-voice or once-per-hymn.
