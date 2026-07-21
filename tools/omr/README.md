# OMR Pipeline — scanned shape-note hymn → verified 4-part data

The working process for turning a scanned hymnal page into verified SATB note data.
This README is the **empirical** pipeline — what actually worked across hymns 237, 5
and 79 — and supersedes the earlier plan in
[`docs/research/ingest-pipeline.md`](../../docs/research/ingest-pipeline.md) (kept for
the reasoning; this is the how).

## The core idea

Zion's Hymns is **shape-note** (Aiken 7-shape). The shape encodes the note *letter*
(triangle=do, cup=re, diamond=mi, wedge=fa, oval=sol, square=la, cone=ti) and the
staff position encodes the *octave*. Pitch is therefore stored **twice**. That
redundancy breaks classical OMR (Audiveris scored ~10% here) but is a gift to a vision
model — and it's what makes disagreements cheaply resolvable (step 5).

So the pipeline is: **cheap deterministic CV** for structure + **vision-model reads**
for the notes + **automated validation** + **shape-geometry tiebreak** + **your ear**.

## The 6 steps

### 1. Detect staves & crop  — `lib.py`, deterministic
`detect_staves()` → 6 staves/page. Crop each system's **treble** (S+A) and **bass**
(T+B) staff separately (`crop_staff`). Isolation is what makes the reads accurate.

### 2. Detect the key  — `lib.py: count_key_accidentals()`, deterministic
Count the flats/sharps in the signature. **Always detect; never assert.** On hymn 79
the operator said "4 flats (Ab)"; the counter said 5 (Db major) and the page agreed.
Asserting the key is the single biggest error source we hit — this removes it.

### 3. Two independent vision reads  — the expensive step
Read each staff with **two** models, shape-note-aware prompt (see
`prompts/` conventions below). Read pitch **and** duration **and rests**. Voice map:

| Voice | Staff | Position | Stem |
|---|---|---|---|
| Soprano | treble | top | up |
| Alto | treble | bottom | down |
| Tenor | bass | top | up |
| Bass | bass | bottom | down |

**Readers, measured across 3 hymns:**

| Reader | Speed | Shape-note accuracy | Automatable | Cost |
|---|---|---|---|---|
| **Fable** (Agent tool) | slow (~15 min, 100–200k tok) | best | yes | API tokens |
| **GPT-5.6** (ChatGPT web, paste) | medium | strong | no (manual paste) | $20/mo ChatGPT plan |
| **Codex-5.5** (`codex exec -i`) | fast (~1 min) | weakest; distractible | yes | $20/mo ChatGPT plan |

Notes learned the hard way:
- **Codex must run with web/shell tools DISABLED.** On hymn 79 it ran 80 web searches
  "looking up" the hymn and produced nothing. It also made the most shape errors
  (F♯/A tenor confusion on hymn 5). It's the fast automated workhorse *only* if leashed.
- **GPT-5.6 is not reachable via Codex on a ChatGPT account** ("not supported"); it's
  web-paste only. Codex tops out at gpt-5.5.
- The $20 plan is a **fixed cost but rate-limited** — we hit the weekly limit mid-hymn.
  At 250-hymn scale, throughput (not dollars) is the real constraint.
- Prompt rule: **state the key as something to VERIFY, plus the shape→letter table**,
  and explicitly ask for rests. Don't over-assert; let the model read.

### 4. Validate structure  — `validate_satb.py`, deterministic hard gate
Bars sum to the meter (pickup/final anacrusis allowed), onsets contiguous (rests
included), all four voices equal length. **A hymn that fails does not advance.** This
caught Fable undercounting hymn 5 by a measure and confirmed hymn 79's four voices at
66 beats.

### 5. Resolve disagreements  — shape-note pixel geometry, ~30s each
Where the two reads differ: crop the disputed chord, read the **shape** (gives the
letter) + rough position (gives the octave). Because the disputed pitches are almost
always *different letters*, the shape is decisive. On hymn 79 this settled all 9
inner-voice disputes — every one in Fable's favor. `lib.py: staff_position_to_midi()`
and the guide-crop approach in the session scripts support this. **This is the unlock
that makes disagreements cheap instead of dead-ends.**

### 6. Assemble → render → ear-check  — `render_satb.py` + you
Write the 4-part JSON (`data/hymns-satb/`), render WAV + multi-track MIDI, and
**listen against the recording** (zionsharp.info has a 4-part MP3 per hymn). Your ear
is the final authority — soprano especially, since it's the part that gets sung.

## Tiering (soprano is the product)

- **Soprano** → full: 2 reads + consensus + geometry on any diff. Must be right.
- **Inner voices** → 1 solid read + validation; 2nd read to confirm; geometry only on
  flagged notes. Accept at high confidence.

## What's built vs. what's manual

| Step | State |
|---|---|
| 1 staff detect + crop | ✅ `lib.py` |
| 2 key detect | ✅ `lib.py` |
| 3 vision read | ⚠️ run by hand (Agent tool / codex CLI / paste). Not yet a batch driver. |
| 4 validate | ✅ `validate_satb.py` |
| 5 resolve | ⚠️ semi — guide crops scripted, shape call by eye |
| 6 render | ✅ `render_satb.py` |

The missing piece for scale is a **batch driver** over a 250-hymn work-list that
chains 1→6 and stops for a human only on validation failures and ear-check samples.
That's the next build.

## Files

- `lib.py` — staff detection, key detection, cropping, pitch mapping (the CV core)
- `validate_satb.py` — the structural gate
- `render_satb.py` — 4-part JSON → WAV + MIDI
- `requirements.txt` — Python deps

## Verified so far

`data/hymns-satb/`: **237 Unity, 5 The Praise of God, 79 The Union of Hearts.** These
exercised, between them: no key sig / 1 sharp / 5 flats, pickup bars, rests, fermatas,
one and two pages, and 3/2 and 2/2 meters. The method held on all of it.
