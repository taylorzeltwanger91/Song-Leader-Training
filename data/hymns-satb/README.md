# Verified SATB hymn data

Machine-readable 4-part (soprano/alto/tenor/bass) transcriptions of Zion's Hymns,
produced by the OMR pipeline in [`tools/omr/`](../../tools/omr/) and verified per the
process in [`docs/research/ingest-pipeline.md`](../../docs/research/ingest-pipeline.md).

**These are the durable product of the transcription work.** The rendered WAV/MIDI
for each hymn live in `~/Downloads/ZionsHymns-Archive/` (media, not committed); this
JSON is the source of truth.

## Status

| File | Hymn | Verification |
|---|---|---|
| `hymn-237.json` | 237 Unity | Soprano: 2-model consensus (Fable+GPT-5.6) + ear. SATB verified. **First verified hymn.** |
| `hymn-005.json` | 5 The Praise of God | Soprano+alto GPT-5.6, tenor+bass codex-5.5, cross-checked; ear-confirmed. |
| `hymn-079.json` | 79 The Union of Hearts | Soprano 100% 2-model; inner voices Fable, every dispute resolved by shape-note geometry. Rests. |

Every file passes `tools/omr/validate_satb.py` (bars sum to meter, onsets contiguous,
all four voices equal length).

## Schema

```jsonc
{
  "hymnId": 237,
  "title": "Unity",
  "key": "C",               // tonic — DETECTED from the key signature, never assumed
  "timeSignature": "3/2",
  "bpm": 60,                // beats are the meter's denominator unit (half note in 3/2 & 2/2)
  "anacrusis": true,        // true if there's a pickup bar (first+last bar sum to one meter)
  "voices": {
    "soprano": [ /* notes */ ],
    "alto":    [ ... ],
    "tenor":   [ ... ],
    "bass":    [ ... ]
  }
}
```

Each voice is an ordered list of **notes and rests** sharing one timeline:

```jsonc
{ "midi": 64, "dur": 1, "onset": 0 }          // a note: MIDI pitch, duration, absolute onset
{ "rest": true, "dur": 1, "onset": 5 }        // a rest: silence, no midi
```

- `dur` and `onset` are in **beats** (the meter's denominator unit). `onset` is the
  absolute position from the start — the timing source of truth, and the only
  representation that survives a pickup bar or a mid-phrase rest.
- `onset` of entry _i_ always equals the cumulative `dur` of entries 0..i-1 (rests
  included). The validator enforces this.
- Some files also carry `measure`/`beat` per note for notation; `onset` is canonical.

## Not yet wired into the app

The app (`src/App.jsx`) still reads the older single-voice `{ notes: [...] }` format
from `public/hymn_melodies/`. Migrating the app to consume this SATB schema (a voice
picker, default soprano) is the Phase 2/4 work in
[`docs/research/DIRECTION.md`](../../docs/research/DIRECTION.md). Until then, these are
verified data artifacts, not live app content.
