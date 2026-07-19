# Data Sourcing — can we skip OCR by finding the tunes elsewhere?

Research date: **2026-07-19**. Question: does machine-readable note data already exist
for these hymns, so we can reduce or skip the OCR/detector work?

## Verdict: no, sourcing does not replace the detector — but it found two things that matter.

No machine-readable note-data set exists for this hymnal. Name-matching against public
corpora is unreliable (the target tune itself proves it). The detector (or hand-entry)
remains the path to note data. **But** the research surfaced a per-hymn community
resource for this exact book, and a melody-stability insight that makes *opportunistic*
sourcing worthwhile for part of the collection.

---

## ⚠️ Premise correction: what this hymnal actually is

Everything written before 2026-07-19 assumed "Zion's Hymns" was a **Mennonite** hymnal.
That's wrong. It is:

- The **shape-note (Aiken 7-shape) edition of the Apostolic Christian _Zion's Harp_**,
  published **2021 by Give Thanks Unto the Father Publishing**, **256 hymns**.
- Tradition is **Apostolic Christian** (Samuel Fröhlich lineage; _Neue Zionsharfe_,
  Switzerland 1855 → English ~1920s), **not Mennonite**. Anabaptist-descended, but a
  different branch.
- Confirmed three ways: the publisher/retailer describe it as "adapted from the Zion's
  Harp," and **Zion's Harp #237 is UNITY, "Thus united and in concord, Let us walk the
  path of life"** — an exact match to our hymn 237.
- **Keep the names straight:** distinct from Nettleton's "Zion's Harp" (1844) and from
  the various American "Hymns of Zion" titles, and distinct from "Zion's *Harp*" vs the
  App-Store "Songs and Hymns of Zion" (Apostolic Lutheran, unrelated).

Consequence for sourcing: the tune stock is predominantly **German/Continental**
(_Neue Zionsharfe_), which is exactly what the big English-language corpora lack.

Note: our `hymn_index.json` has **250** entries; the book has **256**. Minor
discrepancy, unexplained — our index may be partial, or count section dividers
differently. Worth reconciling later.

Sources: [zionsharp.info/zions-hymns.html](https://www.zionsharp.info/zions-hymns.html),
[melttheheart.com/zions-hymns-hymnal](https://melttheheart.com/zions-hymns-hymnal/),
[zionsharp.info/237-unity.html](https://www.zionsharp.info/237-unity.html) (all 2026-07-19).

---

## The find: zionsharp.info covers this exact book

The Apostolic Christian community has published, **per hymn, for all 256 hymns**:
- **Scanned sheet-music PDFs**
- **4-part a cappella MP3s** (hymn 237 = `zh_237_unity.mp3`, ~4 MB)

Plus the Apostolic Christian Singers sell ~16 CD/MP3 sets covering the whole book
(via Melt the Heart / Sermon on the Mount).

**Why this matters for our ground-truth blocker:** the detector work is stuck because
`237.json`'s pitches are unverified and look wrong. These MP3s are a **real audio
ground truth for the melody**. YIN (which the app already runs) is monophonic, but on
4-part a cappella the top voice (soprano) is usually the most prominent — so pitch-
tracking the MP3 gives a rough soprano contour to **cross-check** the OMR detector and
`237.json` against each other. Where two of the three agree, that's very likely truth,
and nobody has to hand-transcribe.

**Not yet checked:** whether the MP3s are human-sung (Apostolic Christian Singers) or
synth-generated. If synth (e.g. Myriad Virtual Singer, as the Sacred Harp Bremen files
were), a notation *source* file may exist somewhere on the site — which would be actual
note data. Worth a direct look at zionsharp.info.

---

## UNITY specifically: not found as note data, and a cautionary tale

- **zionsharp.info/237-unity.html** — the right tune. Text "Thus united and in concord,"
  attributed to **Lowell Mason**, four stanzas. Offers **MP3 + scanned PDF only**. No
  MIDI/XML. The page doesn't print the meter, so "8.7.8.7 / 3/2" comes from the physical
  book, not the web.
- **hymnary.org "UNITY (Mason)"** — a **different tune**: meter 6.5.6.5 D, key E♭, set to
  "When Shall We Meet Again?". **Same name, same composer, wrong tune.** This is the
  cautionary tale: **name+composer matching is not reliable** even when it looks like a
  hit. Any sourced tune must be verified by melody, not by metadata.
- **shapenote.net "UNITY" (Cooper #488)** — Sacred Harp (4-shape fasola), a different
  tradition entirely. shapenote.net is 100% Sacred Harp and will contain **none** of the
  Zion's Harp repertoire. The "~2,173 MusicXML files" figure is real but **not
  applicable** to this project.

---

## The big public corpora (verified 2026-07-19)

| Corpus | Size | Formats | Bulk? | Notes |
|---|---|---|---|---|
| **Cyber Hymnal** (hymntime.com/tch) | 16,800+ | NoteWorthy (.nwc) + MIDI + PDF | **Yes** — compressed MIDI/NWC archives | Best breadth + bulk. Broad denominational/multilingual. |
| **Hymnary.org FlexScores** | ~3,066 (2,000+ free PD) | **MusicXML** + MIDI + PDF (Verovio) | Per-hymn | Cleanest MusicXML when the tune is covered; some behind Hymnary Pro. |
| **Open Hymnal** (openhymnal.org) | Hundreds | ABC + MIDI + mp3 + PDF | **Yes** — zip of all ABC/MIDI | Mostly public domain, all four parts. Cleanest licensing. |
| **shapenote.net** | ~1,170+ | MusicXML + MIDI + PDF + Myriad | Per-tune | **Sacred Harp only — wrong tradition. N/A here.** |

Best general source: **Cyber Hymnal** for breadth/bulk, **hymnary FlexScores** for clean
MusicXML per tune.

---

## Matching feasibility for our 250 tunes

**Estimated 20–45% findable in public corpora — wide uncertainty, UNVERIFIED.** The
Germanic core (_Neue Zionsharfe_) will mostly be absent from English-language corpora;
the Anglo-American minority (like UNITY, a Lowell Mason attribution) is the findable
part — but UNITY shows even those don't match reliably by name. Getting a real number
requires running the actual 250-tune-name + meter list against each corpus's index.
Nobody has done that.

**The one genuinely helpful insight — melody is stable, harmony isn't:** a tune's
soprano line is its identity; alto/tenor/bass are where hymnals diverge. So for a tool
that grades the **soprano melody**, a correctly-matched tune from *any* corpus gives a
safe soprano, even if that hymnal's 4-part harmony differs from Zion's Harp's. That
makes cross-hymnal sourcing viable **for melody grading specifically** in a way it never
would be for reproducing the full 4-part score — provided each match is verified by
melody, not metadata.

---

## Recommended strategy

1. **Don't wait on a pre-made note-data set — it doesn't exist.** OCR/detector (or
   hand-entry) is unavoidable for the Germanic core.
2. **Use zionsharp.info's per-hymn MP3s as audio ground truth** to validate the
   detector — pitch-track the top voice and three-way-compare against the OMR output and
   `237.json`. This is the concrete unblock for the current detector work.
3. **Check whether zionsharp.info's MP3s are synth-derived** — if so, hunt for the
   notation source, which would be actual note data.
4. **Opportunistically source the Anglo-American subset** by name-matching the 250-tune
   list against Cyber Hymnal + hymnary, **verifying every hit by melody** (UNITY proves
   metadata lies). Skip OCR on confirmed matches.

## Could not verify
- Exact meter/time signature of UNITY from the web (relies on the physical book).
- The real fraction of our 250 tunes present in public corpora (needs list-vs-index matching).
- Whether zionsharp.info's MP3s are human-sung or synth-generated (decides whether a notation source might exist).
- Whether hymnary indexes the Apostolic Christian Zion's Harp at all (its "Zion's Harp" entry is Nettleton's unrelated 1844 book).
