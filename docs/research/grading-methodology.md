# Grading Methodology — how to score singing

Research date: **2026-07-16**. Covers what karaoke solved 20 years ago, what the
singing-acoustics literature says, and how our grader gets it wrong today.

---

## 1. The design to copy: UltraStar's octave-agnostic matching

**UltraStar Deluxe ignores octave entirely**, and the reason is stated outright in
their own source discussion ([USDX PR #461](https://github.com/UltraStar-Deluxe/USDX/pull/461)).
Their detector is AMDF, upgraded to Circular AMDF (chosen for real-time use because
*"AMDF is suitable for real-time pitch detection because it does not involve
multiplications"*). The money quote:

> "CAMDF suffers from double pitch errors, but since **USDX ignores the octave**,
> this poses no problem."

**This is the insight to steal.** Ignoring octave makes your pitch detector's worst
failure mode — octave-doubling errors — disappear as a class. And it happens to be
exactly right for hymnody: a bass and a soprano singing the same line should both
grade correctly, and men singing an octave down is the norm, not an error.

It also *supersedes* the fix on the stranded M001 branch. That branch folds the
difference into pitch class ± octave shift (i.e. tolerates octave displacement).
Going fully octave-agnostic is simpler and strictly better for our case.

**Tolerance: semitone bands, difficulty-gated.** Easy ±5 semitones, Medium ±3,
Hard ±1. ⚠️ These trace to UltraStar *user docs* and secondary wikis
([usdx.eu/format](https://usdx.eu/format/),
[Performous wiki](https://github.com/performous/performous/wiki/Ultrastar-format)),
**not to source code.** Verify before building on the exact numbers.

**Timing model.** Notes stored as `NoteType, StartBeat, Length, Pitch, Text` —
everything **quantized to beats**, with BPM stored as quarter-notes (4× the song's
BPM) for resolution. Pitch is semitones relative to C4. Note types: `:` regular,
`*` golden (2× points), `F` freestyle (carries no pitch; spec says implementations
**MUST NOT** award points for it — a useful escape hatch for melisma or spoken
passages).

⚠️ **Could not verify:** the per-beat point math or the 10,000-point normalization.
The UltraStar format spec is deliberately a *file format* document and says nothing
about scoring. "Evaluated per-beat, accumulated, normalized to 10000" is a strong
inference from the beat-quantized structure, **not established fact**. Read the USDX
`game/` scoring unit directly if the exact arithmetic matters.

**Note the structural agreement with our own data problem:** UltraStar stores
`StartBeat` — an *absolute onset*. Our `237.json` authors a `beat` field and the
loader throws it away, rebuilding timing by cumulatively summing durations. See
[current-app-audit.md](./current-app-audit.md).

---

## 2. What the acoustics literature says

This section is deeper than we need for an MVP, but it bounds what's achievable and
explains why intonation scoring is genuinely hard. All figures below were verified
from primary sources unless marked.

### Vibrato is much wider than the decision you're trying to make

| Quantity | Value | Source |
|---|---|---|
| Mean vibrato **extent**, 10 professional singers | **±71 cents** (=142 cents peak-to-peak) | Prame 1997, JASA 102(1):616–621, DOI [10.1121/1.419735](https://doi.org/10.1121/1.419735) |
| Per-tone extent range | ±34 … ±123 cents | same |
| Mean vibrato **rate** | **6.0 Hz**; +15% at end of each tone; ±8% intra-artist | Prame 1994, JASA 96(4):1979–1984, DOI [10.1121/1.410141](https://doi.org/10.1121/1.410141) |
| Seashore's 1930s artists, 29 singers | rate **6.6/sec**, extent **0.48 of a tone = ±48 cents** | Seashore, *Psychology of Music* (1938), Table I — verified from two archive.org scans |
| Acceptable rate window | **5–8 Hz** (slower sounds sluggish, faster sounds nervous) | Sundberg, STL-QPSR 35(2–3):45–68, 1994 ([PDF](https://www.speech.kth.se/qpsr/1994/1994_35_2-3_045-068.pdf)) |
| **Choir singers** specifically | *"rather irregular vibratos with very small extents averaging to no more than 0.1 semitone"* | Sundberg 1994 |

That last row matters most for us — **congregational/choir singing has far narrower
vibrato than the solo-opera literature.** Our users are not Pavarotti.

### The decision window is small by comparison

| Quantity | Value | Source |
|---|---|---|
| Pitch JND, **musicians** | 0.13% ≈ **2.2 cents** (@330 Hz, 200 ms) | Micheyl et al. 2006, Hearing Research 219(1–2):36–47, DOI [10.1016/j.heares.2006.05.004](https://doi.org/10.1016/j.heares.2006.05.004) |
| Pitch JND, **non-musicians** | 0.86% ≈ **14.8 cents** | same |
| Intervals still judged "correctly tuned" by experts | **20–25 cents out of tune** | Vurma & Ross 2006, Music Perception 23(4):331–344, DOI [10.1525/mp.2006.23.4.331](https://doi.org/10.1525/mp.2006.23.4.331) |
| Sundberg/Prame/Iwarsson tolerance zone | **±10 cents** (Sundberg's own summary) vs **±7 cents** (as quoted by NATS) — sources disagree | secondhand, both circulate |

⚠️ **The number that should temper any fixed threshold:** in the Sundberg/Prame/
Iwarsson study, **one tone 55 cents off was not judged out of tune by any rater**,
while other tones deviating far less were called out of tune by some. Sundberg also
reports **greater tolerance for sharp than for flat**. "In tune" is context-dependent
— a fixed ±N-cent gate *will* disagree with human judges on real material.

Corroborating, from the NATS paper (Michael & Gilman, *Journal of Singing* 77(5),
2021, [PDF](https://www.nats.org/_Library/JOS_On_Point/JOS_077_5_2021_591.pdf)):
expert singing teachers show poor inter-rater agreement on intonation. And
**Warren & Curtis found samples judged *less* out of tune when vibrato was present**
— *"Even perfectly in tune performances with vibrato were rated as being more in tune
than the same performances with suppressed vibrato."* Vibrato masks intonation error.

### Our own detector's floor

**YIN** — de Cheveigné & Kawahara 2002, JASA 111(4):1917–1930, DOI
[10.1121/1.1458024](https://doi.org/10.1121/1.1458024). This is the algorithm
`pitch-engine.js` runs. From the paper:

> "For YIN about **99% of estimates are accurate within 20%, 94% within 5%, and about
> 60% within 1%**."

Converted: 20% = 316 cents, 5% = 84 cents, **1% = 17 cents**. So **only ~60% of
YIN's frames land within ~17 cents** — and the intonation decision window is ±10–25
cents. *The tracker's fine-error floor is the same size as the musical decision.*

And that benchmark is **easier than singing**: it's speech with laryngograph ground
truth; frames that were *"unvoiced and also irregularly voiced (diplophony, creak)"*
were **removed from the statistics**; and "gross error" was defined as >20% (316
cents — musically meaningless).

### If we ever do fine intonation scoring, the method is fixed

- **Perceived pitch of a vibrato tone = the geometric mean of the extremes** =
  the arithmetic mean **in cents**, not in Hz. (Shonle & Horan 1980, JASA
  67(1):246–252, DOI [10.1121/1.383733](https://doi.org/10.1121/1.383733).)
  For ±71 cents the Hz-vs-cents difference is ~1 cent — negligible, but free to get right.
- **Average over whole vibrato cycles only.** Sundberg: *"care was taken to select for
  measurement a set of complete vibrato periods."* Averaging a partial cycle inherits
  a bias on the order of the vibrato extent.
- **Exclude the onset.** On world-class singers, the first ~2 vibrato cycles sit
  **20–35 cents below** the note's own mean (measured on six tenors singing *Aida*),
  and a single sustained note can drift **40 cents** across its length. Prame
  likewise discarded the first cycle and last three cycles.
- **Short notes break the mean.** Under ~1 vibrato cycle (<~170 ms at 6 Hz), pitch
  perception is recency-weighted: the rising half-cycle is heard **+15 cents** above
  the mean, the falling half **−11 cents** below. (d'Alessandro & Castellengo 1994,
  JASA 95(3):1617–1630, DOI [10.1121/1.408548](https://doi.org/10.1121/1.408548).)
  That bias is the same order as the entire tolerance budget.
- Reassuring: **vibrato does not blur perceived pitch.** Subjects match a vibrato
  tone's pitch as accurately as a steady one (Sundberg 1994). A ±71-cent swing still
  yields one crisp perceived pitch.

**The one-line takeaway:** vibrato extent (±71 cents) is ~5× the musician pitch JND
and ~3–7× the intonation tolerance, while YIN puts only 60% of frames within 17 cents
on *easier* material than singing. The signal you must average is an order of
magnitude wider than the decision you must make.

**Which is the argument for octave-agnostic, semitone-band scoring** rather than
cents-precise intonation grading. Do the UltraStar thing. The precision the
literature demands for real intonation assessment is beyond what our signal chain can
deliver, and beyond what our users need.

---

## 3. How our grader is wrong today

See [current-app-audit.md](./current-app-audit.md) for full detail. In summary:

1. **Octave-strict.** `grader.js:134` computes `Math.abs(candidate.midi -
   expected.midi)`; `:142` accepts `matched = bestDistance < 1`. A singer one octave
   from the reference scores distance 12 on every note → graded as missing all of
   them → score 0. **The fix is UltraStar's design: drop octave.**
2. **Timing built from cumulative duration sums**, ignoring the authored `beat`
   field — and `237.json`'s bars don't sum to the meter, so notes drift up to 2 beats
   (2 seconds at bpm 60) against a ±150ms match window.
3. **Detector confidence is folded into the pitch grade** (`calculatePitchScore`,
   `grader.js:188`: `hitRate*40 + intonation*40 + confidence*20`). **A singer with a
   cheap mic scores lower on "pitch" for a reason that isn't pitch.** Remove it.
4. **The Count-off score is fabricated** — `stability * 0.9 + 10`. Nothing measures a
   count-off. An invented number presented as a measurement.
5. `buildTempoData` (`grader.js:334`) skips measures with <2 matched notes, which with
   237's 2–3 notes/measure silently drops most of the tempo chart.

## 4. Hard constraint: YIN is monophonic

`pitch-engine.js` cannot grade four people singing SATB into one microphone. That's
polyphonic transcription — a different research problem.

- **"Each singer, own device, own part"** — works with today's engine.
- **"One phone on the table, four singers"** — does not work, and no refactoring
  changes that.

This forecloses a class of room designs before we get there. See
[multiplayer-rooms.md](./multiplayer-rooms.md).
