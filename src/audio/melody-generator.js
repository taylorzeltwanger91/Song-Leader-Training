/**
 * Melody Generator
 *
 * Hymn-style melody generation with configurable octave anchor.
 *
 * Pulled out of App.jsx so the generator can evolve without bloating
 * the monolithic root component (see project guardrail).
 */

// ─── Music constants ────────────────────────────────────────

export const KEYS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
export const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11]; // intervals from root
export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Voice-range hints surfaced in the UI
export const OCTAVE_RANGE_LABELS = {
  2: "Bass",
  3: "Baritone / low tenor",
  4: "Alto / tenor",
  5: "Soprano",
};

// ─── MIDI helpers ───────────────────────────────────────────

export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function midiToNoteName(midi) {
  const idx = ((midi % 12) + 12) % 12;
  return NOTE_NAMES[idx] + (Math.floor(midi / 12) - 1);
}

/**
 * Convert (key, scale degree, octave) to a MIDI note.
 *
 * `octave` is the octave the *tonic* lives in. So (C, 1, 4) → C4 = 60,
 * (C, 1, 3) → C3 = 48, (A, 1, 3) → A3 = 57.
 *
 * `deg` 1..7 are scale degrees within the octave. `deg` 8 = octave-up tonic.
 * Negative wrap-around still works thanks to the modulo.
 */
export function scaleDegToMidi(root, deg, octave = 4) {
  // MIDI(C{octave}) = 12 * (octave + 1)
  // MIDI(root{octave}) = MIDI(C{octave}) + KEYS.indexOf(root)
  const rootMidi = 12 * (octave + 1) + KEYS.indexOf(root);
  const interval = MAJOR_SCALE[((deg - 1) % 7 + 7) % 7];
  const octShift = Math.floor((deg - 1) / 7);
  return rootMidi + interval + octShift * 12;
}

// ─── Time-signature helpers (mirrored from App.jsx) ────────

function parseTS(ts) {
  const [n, d] = (ts || "4/4").split("/").map(Number);
  return { n, d };
}

function isCompound(ts) {
  const { n, d } = parseTS(ts);
  return d >= 8 && n > 3 && n % 3 === 0;
}

// ─── Rhythm templates ──────────────────────────────────────

function getRhythmTemplates(ts) {
  const { n } = parseTS(ts);
  if (isCompound(ts)) {
    const g = n / 3;
    const groupTemplates = [
      [3],     // dotted quarter (one note per group)
      [2, 1],  // quarter + eighth
      [1, 2],  // eighth + quarter
      [1, 1, 1], // three eighths
    ];
    const templates = [];
    for (let i = 0; i < 6; i++) {
      const t = [];
      for (let gi = 0; gi < g; gi++) {
        t.push(...groupTemplates[Math.floor(Math.random() * groupTemplates.length)]);
      }
      templates.push(t);
    }
    return templates;
  }
  const templates = {
    "2/4": [[2], [1, 1], [1, 0.5, 0.5], [0.5, 0.5, 1]],
    "3/4": [[3], [2, 1], [1, 2], [1, 1, 1], [2, 0.5, 0.5], [0.5, 0.5, 1, 1]],
    "4/4": [[4], [2, 2], [2, 1, 1], [1, 1, 2], [1, 1, 1, 1], [3, 1], [1, 3], [2, 1, 0.5, 0.5]],
    "4/2": [[4], [2, 2], [2, 1, 1], [1, 1, 2], [1, 1, 1, 1], [3, 1]],
  };
  return templates[ts] || templates["4/4"];
}

// ─── Melody generator ──────────────────────────────────────

/**
 * Generate a hymn-style melody.
 *
 * @param {string} ts        - Time signature like "4/4"
 * @param {number} bpm       - Tempo (currently unused inside the generator,
 *                             kept in the signature for caller compatibility)
 * @param {number} measures  - Number of measures
 * @param {string} key       - Tonic, e.g. "C", "Bb"
 * @param {number} octave    - Octave the tonic lives in (default 4)
 * @returns {Array<{deg, midi, dur, measure, freq}>}
 */
export function generateMelody(ts, bpm, measures, key, octave = 4) {
  const { n, d } = parseTS(ts);
  const comp = isCompound(ts);
  const rhythmTemplates = getRhythmTemplates(ts);

  // Build rhythm
  const rhythm = [];
  for (let m = 0; m < measures; m++) {
    const tmpl = rhythmTemplates[Math.floor(Math.random() * rhythmTemplates.length)];
    const targetSum = comp ? n : n * (d === 2 ? 1 : 1);
    const sum = tmpl.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - targetSum) < 0.01) {
      tmpl.forEach((dur) => rhythm.push({ dur, measure: m }));
    } else {
      for (let i = 0; i < n; i++) rhythm.push({ dur: 1, measure: m });
    }
  }

  // Generate scale degrees (hymn-style)
  const notes = [];
  let prevDeg = 1;
  const chordTones = [1, 3, 5];

  for (let i = 0; i < rhythm.length; i++) {
    const r = rhythm[i];
    const isFirst = i === 0;
    const isLast = i === rhythm.length - 1;
    const isSecondLast = i === rhythm.length - 2;
    const isMeasureStart = i === 0 || rhythm[i - 1]?.measure !== r.measure;

    let deg;
    if (isFirst) {
      deg = 1;
    } else if (isLast) {
      deg = 1;
    } else if (isSecondLast) {
      deg = Math.random() < 0.6 ? 2 : 7;
    } else {
      const stepwise = Math.random() < 0.7;
      if (stepwise) {
        const dir = Math.random() < 0.5 ? 1 : -1;
        deg = prevDeg + dir;
      } else {
        const leapSize = Math.random() < 0.6 ? 2 : (Math.random() < 0.7 ? 3 : 4);
        const dir = Math.random() < 0.5 ? 1 : -1;
        deg = prevDeg + dir * leapSize;
      }
      deg = Math.max(1, Math.min(8, deg));
      if (isMeasureStart && !chordTones.includes(((deg - 1) % 7) + 1)) {
        const nearest = chordTones.reduce((a, b) => (Math.abs(b - deg) < Math.abs(a - deg) ? b : a));
        if (Math.random() < 0.5) deg = nearest;
      }
    }

    const midi = scaleDegToMidi(key, deg, octave);
    notes.push({
      deg,
      midi,
      dur: r.dur,
      measure: r.measure,
      freq: midiToFreq(midi),
    });
    prevDeg = deg;
  }

  // Sanity check: every note should sit in the requested octave band
  // (lowest note >= MIDI(C{octave}), highest note < MIDI(C{octave+2})).
  const lowBound = 12 * (octave + 1);
  const highBound = 12 * (octave + 3);
  for (const n2 of notes) {
    if (n2.midi < lowBound || n2.midi >= highBound) {
      console.warn(
        `melody-generator: note ${midiToNoteName(n2.midi)} (midi ${n2.midi}) ` +
        `is outside requested octave ${octave} band [${lowBound}, ${highBound})`
      );
    }
  }

  return notes;
}

export default generateMelody;
