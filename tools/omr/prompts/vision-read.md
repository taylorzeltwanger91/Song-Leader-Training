# Vision-read prompt template (step 3)

The prompt shape that produced the verified reads for hymns 1–10. It is written once
here and filled per hymn by `make_prompts.py`, because the previous set of prompts lived
in a scratchpad folder (`batch6-10/GPT-PROMPTS.md`) and was lost with it.

Used for both readers:

- **Fable** — via the Agent tool with `model: fable`, pointed at the per-system crops
  from `batch_crop.py`. Automatable.
- **GPT-5.6** — pasted by hand into ChatGPT on the web with the full page images
  attached. Not reachable from Codex on a ChatGPT account.

## Why the prompt says what it says

Each rule below is a scar. Do not trim them for brevity.

| Rule in the prompt | The failure it prevents |
|---|---|
| "VERIFY the key, do not assume I am right" | The CV key-counter over-counts every hymn (said 4 accidentals for hymn 11's single sharp). Asserting a wrong key makes the model transpose an entire read. |
| Shape→degree table, tonic-relative | Shape notes encode the letter redundantly. Given the table, the model reads pitch twice and self-checks; without it, it guesses from staff position alone. |
| Voice/staff/stem map stated explicitly | Which voice is which is the single most common structural error. |
| Durations in the meter's denominator unit | The JSON stores beats where the beat unit is the denominator (half note in x/2). Models default to quarter-note counting and silently double every duration. |
| "INCLUDE RESTS as the literal word REST" | A dropped rest corrupts every onset after it, and validation catches it only as a length mismatch — expensive to localize. |
| "Both voices MUST total the same beats, check before answering" | Cheapest possible self-check; catches dropped and doubled measures at the source. |
| "Say so explicitly rather than silently normalizing" short bars | Phrase-cadence short bars and split measures at system breaks are real here. A model that "fixes" them produces data that validates and is wrong. |
| "If shape and staff position disagree, report both" | This is the tiebreak signal. Silently picking one throws away the reason dual encoding is useful. |
| "Do NOT infer the line from what would sound sensible" (lower staff) | GPT fabricated hymn 2's entire bass — harmonically plausible, completely wrong. A treble-only consensus would have shipped it. |

## The template

Placeholders: `{ID}`, `{TITLE}`, `{KEY}`, `{DEGREES}`, `{TIME}`, `{DURATIONS}`,
`{STAFF}`, `{TOP_VOICE}`, `{BOTTOM_VOICE}`, `{RANGE}`, `{IMAGES}`, `{EXTRA_RULES}`.

---

You are transcribing the {STAFF} staff of a shape-note hymn into note data. Accuracy
matters more than speed — this data gets sung against.

{IMAGES}

This is hymn {ID}, "{TITLE}", from Zion's Hymns (2021), the Aiken 7-shape edition.

KEY AND METER — I read these as {KEY} and {TIME}. VERIFY them yourself against the
images and tell me if you disagree. Do not assume I am right.

AIKEN SHAPE -> SCALE DEGREE (this notation encodes pitch TWICE — the shape gives the
letter, the staff position gives the octave; use both and say so when they conflict):
  triangle = do,  cup = re,  diamond = mi,  wedge = fa,
  oval = sol,     square = la,  cone = ti
In {KEY}: {DEGREES}

VOICES ON THIS STAFF:
  {TOP_VOICE} = the TOP voice, stems UP
  {BOTTOM_VOICE} = the BOTTOM voice, stems DOWN
Both voices sound throughout; where a single note head is shared, both voices sing it.

DURATIONS — express every duration in BEATS where one beat = the meter's denominator
unit. In {TIME} that means: {DURATIONS}. A dot adds half the value.

WHAT I NEED BACK — exactly this, nothing else:

    key: <what you actually see>
    time: <what you actually see>
    anacrusis: <beats in the pickup bar before the first full measure, or 0>

    {TOP_VOICE_LOWER}.pitches: <comma-separated, e.g. {RANGE}, REST>
    {TOP_VOICE_LOWER}.durs: <comma-separated, same count as pitches>
    {BOTTOM_VOICE_LOWER}.pitches: ...
    {BOTTOM_VOICE_LOWER}.durs: ...

    notes: <anything uncertain — measure number and what you were torn between>

RULES THAT MATTER:
- Pitch names are letter + accidental + octave, middle C = C4. Spell per the key.
- INCLUDE RESTS as the literal word REST in the pitch list, with their duration. A
  missing rest corrupts every onset after it.
- The two voices MUST total the same number of beats. Check before you answer.
- Count measures per system and report the total. If a system seems to have a short or
  irregular bar, say so explicitly rather than silently normalizing it.
- If the shape and the staff position disagree on a note, report both and flag it.
{EXTRA_RULES}
- Work system by system and re-examine anything ambiguous by looking again.

Your final message is the data — return the block above and nothing else around it.
