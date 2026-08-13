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

### 2. Detect the key  — `lib.py: count_key_accidentals()`, deterministic BUT UNRELIABLE
Count the accidentals in the signature. **Always verify the key; never assert it.**

⚠️ **The counter is a weak hint, not ground truth** (found batching hymns 1-4, 2026-07-27):
it over-counted every hymn (1♭→4, 3♭→5, 2♭→4, 3♯→7) and cannot tell flats from sharps —
it likely double-counts each glyph (stem + bulb) and catches stray ink. The reliable
step is a **visual key-signature check** — but ⚠️ **crop and zoom each hymn's signature
INDIVIDUALLY, one image per hymn.** A batch montage is tempting and it is how I misread
hymn 29 as two sharps when it has one (see "Counting accidentals" below): a sharp glyph's
two crossbars merge into a phantom second sharp at small scale. Feed the verified key to
the vision reads *as a claim for them to check*, never as a fact.
`count_key_accidentals()` needs a rewrite (glyph-shape classification for flat vs sharp,
dedup of split components) before it can be trusted.

The batch cropper `batch_crop.py` runs steps 1+2 over a list of hymn ids and writes a
manifest + all per-system treble/bass crops — the automatable half, seconds for a batch.

### 3. Two independent vision reads  — the expensive step

Generate both staves' prompts from the verified key (step 2), then run them through two
readers:

```bash
python make_prompts.py 11 --key G --time 2/2 --out ~/Downloads/ZionsHymns-Archive/hymn-011-<slug>/
```

That writes `GPT-PROMPT-treble.txt` / `-bass.txt` to paste into ChatGPT with the page
images attached, and prints which pages to attach. The same text drives the Fable agent,
pointed at the per-system crops instead. **The prompt shape, and the failure each rule
prevents, is documented in [`prompts/vision-read.md`](prompts/vision-read.md)** — it is
committed because the previous prompt set lived in a scratchpad folder and was lost
with it. Don't trim the rules for brevity; each one is a scar.

Read pitch **and** duration **and rests**. Voice map:

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

### 5. Resolve disagreements  — harmony first, then shape-note pixel geometry
Two tiebreaks, cheapest first:

**5a. Harmony adjudication (crop-free, do this first).** Once three of the four voices
agree, test each candidate for the fourth against them: does `{S,A,T,B}` fit a
major/minor triad (optionally +7th)? Sample every 0.5 beat and count clean chords for
each read. This needs no images and resolved most of the batch 1-4 disputes in seconds
(see `harmony_h2.py` / `adjudicate.py` in the session scripts). It is decisive when a
wrong note creates a dissonance the right note doesn't — e.g. hymn 2's GPT bass sat on
the leading tone D, clashing a minor-2nd against the Eb tonic on 85/93 disputed beats
while Fable's Eb sat clean. Caveat: the melody (soprano) legitimately carries passing
tones/appoggiaturas, so a flagged soprano note is a *candidate*, not a verdict — fall
through to 5b or the ear.

**5b. Shape-note pixel geometry.** Where harmony ties (both candidates are valid chord
tones — common for inner voices doubling root vs. third): crop the disputed chord, read
the **shape** (gives the letter) + rough position (gives the octave). Because the
disputed pitches are almost always *different letters*, the shape is decisive. On hymn
79 this settled all 9 inner-voice disputes. `lib.py: staff_position_to_midi()` supports
this. ⚠️ **Reliable shape-reading needs the zoom passes a vision model does (3× upscale
on chord columns) — eyeballing a single system crop is error-prone.** If harmony ties
and the note matters (i.e. it's soprano), spend a targeted second vision read on that
one staff rather than guessing from a wide crop.

⚠️ **The second pass on the LOWER staff (tenor+bass) is not optional** (batch 1-4,
2026-07-28). GPT (manual paste) transcribed hymn 2's *entire* lower staff wrong — a
plausible-looking but harmonically-impossible bass. A treble-only consensus, which the
batch defaulted to, would have shipped it silently. Both staves get two reads.

## Checking a read — what the batch of 12-30 taught (2026-08-13)

Roughly 45 staff reads in one night produced five distinct failure modes. Each one is
cheap to check for and expensive to discover later, so check for all of them, every read.

**A reader's own verification claim is not evidence.** Three separate reads asserted they
had "verified programmatically" a tiling their own submitted data contradicts — one
listed fifteen fabricated per-measure sums. The prose quality of a read is uncorrelated
with its correctness; detailed, confident narration is generated alongside wrong data as
readily as right. Run every check yourself.

The five checks, in the order they catch things:

1. **`len(pitches) == len(durs)`, per voice.** Two reads submitted a voice with one extra
   duration. One of them *noticed*, called it a typo, and submitted anyway.
2. **All four voices sum to the same total.**
3. **The durations TILE.** Walk the list accumulating and confirm every bar closes exactly
   on the meter with nothing left over. Hymn 20's bass had the right length *and* the
   right total with the beats distributed into the wrong measures — a totals-only check
   passes it, and every note after the error lands in the wrong bar.
4. **Cross-hymn duplication — but read the caveat below before acting on a hit.** Compare
   each read's pitch sequence against every other hymn's. A read that is genuinely the
   *wrong hymn* is perfectly self-consistent and passes every arithmetic check, so nothing
   else catches it.
5. **Notes vs. rests** — see the trap below. Also invisible to arithmetic, since a rest
   and a note consume beats identically.

### The *fa*-wedge / half-rest trap  ⚠️ systematic in this hymnal

The Aiken **fa** shape is a filled wedge — a triangle — and an old-style **half rest** is
also a filled triangular block. At this scan resolution they genuinely resemble each
other. On hymn 14's bass staff two independent Fable reads split on six glyphs, one
calling them C3 notes and the other calling them rests: the difference between the bass
singing a phrase and sitting silent.

**Resolve it by vertical position, not by shape.** A notehead sits where its pitch
dictates; a half rest sits ON TOP OF the middle staff line. On hymn 14 the disputed glyph
measured y=133.5 against a C3 space at y=131.5 and a half-rest position at ~y=116 — two
pixels from a note, seventeen from a rest. They were notes. Measure; do not eyeball.

### Other engraving hazards confirmed this batch

- **Bleed-through from the adjacent system.** A mark shaped like an eighth flag near a
  bass stem turned out to be ink from the staff below, pixel-verified as unattached. It
  inflated hymn 16's bass by two beats. Verify a flag is physically connected to its stem.
- **Mid-measure system breaks are common.** Many systems end with no barline and the bar
  continues on the next line. Reads that "normalize" these lose or gain beats; the
  likeliest place for a distribution error is exactly there.
- **Pickup and final bar complement to one measure** in every pickup hymn seen so far
  (1+3, 1+2). Useful as a *check*, never as something to force — hymns without a pickup
  simply have a full final bar.
- **The CV key counter is useless, not merely unreliable.** It over-counted all 19 hymns
  in this batch (claimed 3 where there was 1, 6 where there were 2, 2 where there were
  none). Read the signature by eye and tell the reader to ignore the manifest field.

### ⚠️ Counting accidentals: a single sharp looks like two at low zoom

A sharp glyph has **two thick horizontal crossbars**. Shrink it and those bars read as two
separate sharps. On 2026-08-13 I built one montage of all 19 key signatures, counted by
eye, and called hymn 29 D major (2 sharps). It is **G major, one sharp** — both readers
overrode me independently and proved it twice: the single glyph centred on the F line, and
an explicit sharp before C4 in m12, which would be redundant if C# were in the signature.

**Zoom each key signature individually — a batch montage is not enough resolution.** And
keep telling the readers to VERIFY the key rather than accept it: that instruction is the
only reason this got caught, and it is why the prompt states the key as a claim to check
instead of a fact to apply.

### ⚠️ SHARED TUNES — read this before calling a duplicate a bug

**Hymnals reuse one tune across several hymns of the same meter. Two hymns having
identical notes is normal, not an error.**

Hymn 20 ("Labor on") and hymn 23 ("Buried With Christ") are both D major, 4/2, and both
print the meter **3. 3. 7. 8. 7. 8. 9. 3. 3.** — and they are the *same tune*, note for
note, with different words. Their reads are 100% identical because the music is identical.

I got this badly wrong on 2026-08-13: I read the identical output as cross-contamination
between parallel agents, accused three correct reads of fabricating data, discarded valid
transcriptions, and burned two full re-reads chasing a bug that did not exist. The tell
was printed at the top of both pages the whole time.

**So when `check_duplicates.py` flags a pair, that is a prompt to LOOK, not a verdict.**
Open both pages and compare:

- **Same printed meter line + same key + same time signature + same music** → a shared
  tune. Both reads are fine. Expect near-100% similarity and keep both.
- **Different meter/key/time, or different music** → one read is genuinely the wrong hymn.
  Re-read from the source crops.

The system count is *not* a reliable discriminator: hymn 20 sets its tune in 5 systems and
hymn 23 in 6, because longer words need more horizontal room. Same music, different
layout.

### Running readers in parallel

Give each agent its own working directory and unique output paths so concurrent runs can't
overwrite each other's intermediates — one early run did have its annotated images
clobbered by a neighbour using the same generic filenames, and re-derived from source to
recover. That is a real (if mild) hazard. It is NOT, however, an explanation for two hymns
having the same notes; see the shared-tune section above before reaching for it.

### 6. Assemble → render → ear-check  — `assemble.py` + `render_satb.py` + you

Put the verified reads in a source file under `hymns/<id>.txt` (header + two lines per
voice — the format is documented in `assemble.py`), then:

```bash
python assemble.py hymns/11.txt -o ../../public/hymn_satb/11.json   # validates as it writes
python render_satb.py ../../public/hymn_satb/11.json ~/Downloads/ZionsHymns-Archive/hymn-011-<slug>/
```

`assemble.py` accumulates onsets, tiles the barlines, and runs `validate_satb.py` before
it will write anything — a hymn that fails the gate produces no file. Then **listen
against the recording** (zionsharp.info has a 4-part MP3 per hymn). Your ear is the final
authority — soprano especially, since it's the part that gets sung.

**The source files are the point.** The reads live in `hymns/*.txt` under version
control, not in a scratch drive script. The original assembler kept its inputs in
throwaway per-hymn scripts; when the scratchpad was cleaned up the JSONs survived and the
reads did not. `extract_source.py` recovered them from the committed JSON, and
`roundtrip_test.py` proves the recovery: all 12 verified hymns re-assemble to the data
that shipped (6 byte-identical, the rest differing only in two documented legacy quirks —
see the script). Run it after any change to the assembler.

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
| 6 assemble | ✅ `assemble.py` (source in `hymns/*.txt`, validated on write) |
| 6 render | ✅ `render_satb.py` |

The missing piece for scale is a **batch driver** over a 250-hymn work-list that
chains 1→6 and stops for a human only on validation failures and ear-check samples.
That's the next build.

## Phase 2 — a local scaler, once we have enough verified data (bookmarked 2026-07-29)

**MuSViT** ([HF: PRAIG/musvit](https://huggingface.co/PRAIG/musvit),
[arXiv 2606.31811](https://arxiv.org/abs/2606.31811), Alicante/PRAIG) is a ViT
pretrained with masked autoencoders on 9.7M IMSLP pages — the first foundation vision
model for sheet music. It reports 16.4% SER frozen / 10.9% fine-tuned on full-page
recognition (vs 48.6% PaliGemma 2, 51% Qwen3-VL, 57% DINOv3) — strong evidence that
**music-specific pretraining crushes general VLMs at OMR**.

Why it is *not* our pipeline today: it ships **encoder-only** (outputs `(1,4097,768)`
embeddings, no note head), it is **out-of-distribution on Aiken shape notes** (IMSLP is
round-note), its ceiling (10.9% SER) is **below our verified-zero bar**, and the license
is **CC BY-NC-SA 4.0** (non-commercial — fine here, not for the paid app).

The real play: our hand-verified hymns are becoming *the* labeled shape-note dataset,
which doesn't exist anywhere. Once ~30–50 are verified, fine-tune a lightweight
recognition head on MuSViT embeddings to build a **fast, free, local** transcriber for
the remaining ~200, with the harmony adjudicator (step 5a) still as the quality gate.
That attacks the *actual* scaling bottleneck — Fable rate-limits + GPT manual paste —
not accuracy, which is already solved. **Phase 2 is downstream of continuing Phase 1,
not a replacement for it.**

### What we took from the MuSViT work for the *current* pipeline
- **Staff-level > full-page is confirmed.** Their staff-level recognition beats
  full-page; our per-staff treble/bass cropping (step 1) is the same insight — keep it.
- **SER as scorekeeping.** Adopt Symbol Error Rate (edit distance on the symbol
  sequence) against the verified hymns as the standard accuracy metric, so readers and
  prompts compare on one number and a future MuSViT head evaluates on the same ruler.
- **Guardrail: don't downgrade readers to small general VLMs to cut cost.** The paper
  shows general models collapse on OMR (48–57% SER). Fable/GPT read shapes well because
  they're frontier multimodal; a cheaper small vision model will not. Cost relief comes
  from a fine-tuned *music* model (Phase 2), not a weaker general one.

## Files

- `lib.py` — staff detection, key detection, cropping, pitch mapping (the CV core)
- `validate_satb.py` — the structural gate
- `make_prompts.py` — per-hymn vision-read prompts for both staves, from the verified key
- `prompts/vision-read.md` — the prompt template + why each rule is in it
- `assemble.py` — per-voice reads (`hymns/*.txt`) → the 4-part JSON, validated on write
- `extract_source.py` — the reverse: committed JSON → a `hymns/*.txt` source
- `roundtrip_test.py` — extract + re-assemble every hymn, diff against what shipped
- `render_satb.py` — 4-part JSON → WAV + MIDI
- `hymns/` — the verified reads, one file per hymn, in version control
- `requirements.txt` — Python deps

## Verified so far

`data/hymns-satb/`: **237 Unity, 5 The Praise of God, 79 The Union of Hearts.** These
exercised, between them: no key sig / 1 sharp / 5 flats, pickup bars, rests, fermatas,
one and two pages, and 3/2 and 2/2 meters. The method held on all of it.

**Batch 1-4** (2026-07-28) — served in `public/hymn_satb/{1..4}.json`, all four pass
`validate_satb.py` (F / Eb / Ab / A; 2/2, 4/2, 2/2, 4/4; pickups on 2 & 4). Both staves
got GPT + Fable. Resolved via harmony adjudication (step 5a): hymn 2's lower staff was a
GPT misread, replaced wholesale with Fable's (verified by 85/93 disputed beats). Hymn 4
tenor m16 fixed to C#4 (harmony + diamond shape agreed). **Open, deferred to ear-check:**
a repeated soprano `F5`-vs-`Eb5` at hymn 2 m5/m11 (harmony leans Eb5 but it may be a real
appoggiatura — audibly obvious when sung), plus a few inner-voice harmonic ties
(root-vs-third doublings) left at the GPT reading. Soprano on 1/3/4 is not in dispute.
