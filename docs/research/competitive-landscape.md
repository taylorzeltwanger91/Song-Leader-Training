# Competitive Landscape — has anyone built this?

Research date: **2026-07-16**. Question: has anyone shipped "scan your own sheet
music → sing it → get graded"?

## The answer: no. Nobody has shipped the full chain.

Every product does one half or the other. **The OMR products refuse to listen. The
grading products refuse to let you import.**

| Product | Shipped it? | What it actually does |
|---|---|---|
| **Soundslice** | No | OCR/import + playback + per-part mute/solo + choir practice-track export. No mic input, no grading. ([features](https://www.soundslice.com/features/), [practice-choir](https://www.soundslice.com/practice-choir/)) |
| **PlayScore 2** | No | Best-in-class OMR from a photo; plays your part, or everything-but-your-part so you sing along. Playback only — never listens. ([playscore.co](https://www.playscore.co/)) |
| **Newzik** | No | Scan/import, AI playback, score-following cursor, **records you via mic** — but records only. No evaluation. ([newzik.com/en/app](https://newzik.com/en/app)) |
| **Yousician** | No | Real-time pitch grading, SingStar-style bars. Fixed licensed catalog — no import. ([yousician.com/singing](https://yousician.com/singing)) |
| **Simply Sing** | No | Grading + vocal range detection, closed catalog, no import. |
| **Sing Sharp** | No | "See Your Pitch" real-time accuracy feedback + range analysis. Lessons, not your music. ([singsharp.com](https://www.singsharp.com/en)) |
| **Erol Singer's Studio** | No | Target note vs. your live pitch, inside coach-authored lessons. No import. |
| **Vocaberry** | Unverified | Could not confirm — assume gamified vocal exercises, but **treat as unchecked**. |

### The closest near-miss
**[Singscope](https://apps.apple.com/us/app/singscope/id944309175)** (iOS, v2.7.9,
last updated 2025-10-03). A $7.99 "Sheet Music Support Pack" imports a *subset of
MusicXML lead sheets* and plots your live pitch against the notes. But: **no OCR/photo
scan, and no grading** — it's a visualization tool. No score, no timing evaluation.

**It is the existing product nearest this vision, and it stops exactly where the idea
starts.**

---

## The choral niche: served for listening, completely unserved for grading

This is the niche we're targeting, and the pattern is unmistakable.

- **[Cyberbass](https://cyberbass.org/)** — free MIDI-derived per-part practice
  tracks. 20+ years old. Playback only.
- **[ChoraLine](https://www.choraline.com/)** — 250+ choral works, each SATB part
  voiced by a different orchestral instrument (S=flute, A=oboe, T=horn, B=bassoon),
  with count-ins/entry cues, loop, speed control. **~25,000 singers/year.** Playback only.
- **[Learn My Part](https://apps.apple.com/us/app/learn-my-part/id517515605)** —
  notable: **you supply your own MIDI** via file sharing. Part solo / highlighted /
  muted mixes, speed, transposition, PDF viewing alongside. Still playback only.
- **[Choir Player](https://www.choirplayer.com/)** — 500+ arrangements, per-voicing
  mixer, loop/slow-down. Explicitly no pitch analysis, no grading, no scanning.

**The entire choral-tech category assumes the singer is the judge of their own
accuracy.** Feedback comes from a director at rehearsal, never from the app.
25,000 ChoraLine singers a year and not one of them gets told they're flat.

**Our SATB grading loop has no incumbent.**

---

## What this de-risks

Two things worth noting, because they mean we're not first into unexplored territory:

1. **PlayScore already proved photo→MusicXML works well for choral scores** — so the
   OCR step is not fantasy. (Caveat: on *round-notehead* choral scores. Our hymnal is
   shape-note — see [omr-and-ingest.md](./omr-and-ingest.md).)
2. **Learn My Part proved choir singers will happily sideload their own files** — so
   "will users bring their own music" is answered.

The unserved gap is precisely **the join**. And karaoke solved the grading half two
decades ago in a form (pitch-class, semitone-band — see
[grading-methodology.md](./grading-methodology.md)) that happens to fit hymnody
better than it fits pop music.

## Could not verify
- Vocaberry — no substantive results surfaced.
