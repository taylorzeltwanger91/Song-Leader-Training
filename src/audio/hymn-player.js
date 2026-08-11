// Turns SATB hymn data into a flat list of scheduled note events.
//
// Pure: no AudioContext, no soundfont, no React. The caller owns the instrument and just
// walks the schedule, which makes the timing math unit-testable against the shipped hymns.

import { secondsPerUnit } from './meter.js';

export const VOICE_ORDER = ["soprano", "alto", "tenor", "bass"];
export const VOICE_LABEL = { soprano: "Soprano", alto: "Alto", tenor: "Tenor", bass: "Bass" };

// All four voices sound together, so each sits lower in the mix than a part heard alone.
// The master limiter catches the peaks either way; this just keeps the balance sane.
const GAIN_ENSEMBLE = 0.55;
const GAIN_SOLO = 0.7;

/**
 * Build the playback schedule for a hymn.
 *
 * @param {object} voices  the SATB `voices` map from the hymn JSON
 * @param {object} opts
 * @param {string} opts.which  "all" for the full hymn, or a single voice name
 * @param {string} opts.timeSignature
 * @param {number} opts.bpm
 * @returns {{events: Array<{midi:number, at:number, dur:number}>, duration:number, gain:number}}
 *          `at`/`dur` are seconds; `at` is relative to the start of playback.
 */
export function buildSchedule(voices, { which = 'all', timeSignature, bpm }) {
  const perUnit = secondsPerUnit(timeSignature, bpm);
  const parts = which === 'all' ? VOICE_ORDER : [which];
  const events = [];
  let duration = 0;

  for (const part of parts) {
    for (const note of voices?.[part] || []) {
      const at = note.onset * perUnit;
      const dur = note.dur * perUnit;
      // Rests still advance the end of the piece — a hymn can close on one.
      if (!note.rest) events.push({ midi: note.midi, at, dur });
      duration = Math.max(duration, at + dur);
    }
  }

  events.sort((a, b) => a.at - b.at);
  return { events, duration, gain: which === 'all' ? GAIN_ENSEMBLE : GAIN_SOLO };
}
