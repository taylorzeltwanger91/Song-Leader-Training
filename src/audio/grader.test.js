/**
 * Grader tests — the value path.
 *
 * The grading math IS the product. These tests exist because it shipped two
 * independent silent-wrong-output bugs that survived in main for months
 * (see PROJECT-LOG.md 2026-07-16). A green build never caught either one.
 *
 * Rule for this file: assert on computed output, never on "it returned something".
 */
import { describe, it, expect } from 'vitest';
import { gradePerformance } from './grader.js';

/** Build a detected-pitch trace that sings `melody` perfectly, optionally shifted. */
function singPerfectly(expectedNotes, { octaveShift = 0, msPerBeat = 1000, framesPerNote = 8 } = {}) {
  const frames = [];
  let t = 0;
  for (const n of expectedNotes) {
    const durMs = n.dur * msPerBeat;
    const midi = n.midi + octaveShift * 12;
    for (let i = 0; i < framesPerNote; i++) {
      frames.push({
        timestamp: t + (durMs * i) / framesPerNote,
        midi,
        midiRounded: Math.round(midi),
        frequency: 440 * Math.pow(2, (midi - 69) / 12),
        confidence: 0.95
      });
    }
    t += durMs;
  }
  return frames;
}

// A simple 4/4 melody: four whole-ish notes, one per measure.
const SIMPLE = [
  { midi: 60, dur: 1, beat: 0, measure: 0 },
  { midi: 62, dur: 1, beat: 1, measure: 0 },
  { midi: 64, dur: 1, beat: 2, measure: 0 },
  { midi: 65, dur: 1, beat: 3, measure: 0 }
];

describe('gradePerformance — baseline sanity', () => {
  it('scores a perfect performance at the written octave near 100', () => {
    const sung = singPerfectly(SIMPLE);
    const r = gradePerformance(sung, SIMPLE, 60, '4/4');
    expect(r.summary.matchedNotes).toBe(4);
    expect(r.pitchScore).toBeGreaterThan(90);
  });

  it('returns an empty result for no input', () => {
    expect(gradePerformance([], SIMPLE, 60, '4/4').pitchScore).toBe(0);
    expect(gradePerformance(singPerfectly(SIMPLE), [], 60, '4/4').pitchScore).toBe(0);
  });
});

describe('octave-agnostic matching', () => {
  // THE bug M001 existed to fix. A bass singing the soprano line an octave down
  // is the NORM in congregational singing, not an error.
  it('scores a perfect performance sung an octave DOWN the same as at pitch', () => {
    const atPitch = gradePerformance(singPerfectly(SIMPLE), SIMPLE, 60, '4/4');
    const octaveDown = gradePerformance(singPerfectly(SIMPLE, { octaveShift: -1 }), SIMPLE, 60, '4/4');

    expect(octaveDown.summary.matchedNotes).toBe(4);
    expect(octaveDown.pitchScore).toBe(atPitch.pitchScore);
  });

  it('scores a perfect performance sung an octave UP the same as at pitch', () => {
    const atPitch = gradePerformance(singPerfectly(SIMPLE), SIMPLE, 60, '4/4');
    const octaveUp = gradePerformance(singPerfectly(SIMPLE, { octaveShift: 1 }), SIMPLE, 60, '4/4');

    expect(octaveUp.summary.matchedNotes).toBe(4);
    expect(octaveUp.pitchScore).toBe(atPitch.pitchScore);
  });

  it('scores two octaves down the same as at pitch', () => {
    const r = gradePerformance(singPerfectly(SIMPLE, { octaveShift: -2 }), SIMPLE, 60, '4/4');
    expect(r.summary.matchedNotes).toBe(4);
  });

  it('still fails a genuinely wrong pitch (a semitone off is not an octave)', () => {
    // Deliberately a MONOTONE melody, not a scale. On an ascending melody a
    // +1-semitone performance makes note N sound the pitch of note N+1, and the
    // ±150ms match window reaches into the neighbouring note's frames — so a note
    // can match its predecessor's audio. That's a real defect (logged in
    // TECH-DEBT.md, "match windows overlap"), but it is not what this test is for.
    const monotone = [
      { midi: 60, dur: 1, beat: 0, measure: 0 },
      { midi: 60, dur: 1, beat: 1, measure: 0 },
      { midi: 60, dur: 1, beat: 2, measure: 0 },
      { midi: 60, dur: 1, beat: 3, measure: 0 }
    ];
    const wrong = singPerfectly(monotone).map(f => ({ ...f, midi: f.midi + 1, midiRounded: f.midiRounded + 1 }));
    const r = gradePerformance(wrong, monotone, 60, '4/4');
    expect(r.summary.matchedNotes).toBe(0);
  });

  it('a tritone away is the maximum possible pitch-class error, and still fails', () => {
    // Guards the fold: 6 semitones must not wrap around to read as a near-match.
    const monotone = [{ midi: 60, dur: 1, beat: 0, measure: 0 }];
    const wrong = singPerfectly(monotone).map(f => ({ ...f, midi: 66, midiRounded: 66 }));
    expect(gradePerformance(wrong, monotone, 60, '4/4').summary.matchedNotes).toBe(0);
  });

  it('does not report a bogus cents error for an octave-displaced note', () => {
    // Singing an octave down perfectly is 0 cents off the pitch class, not -1200.
    const r = gradePerformance(singPerfectly(SIMPLE, { octaveShift: -1 }), SIMPLE, 60, '4/4');
    for (const n of r.noteByNote.filter(x => x.matched)) {
      expect(Math.abs(n.centsOff)).toBeLessThan(50);
    }
  });
});

describe('timing from absolute onsets', () => {
  // 237.json authors a `beat` field and the loader threw it away; the grader
  // rebuilt timing by cumulatively summing durations. When bars don't sum to the
  // meter (237.json's don't), every downstream note drifts.
  it('uses authored beat/measure onsets rather than cumulative duration sums', () => {
    // A malformed melody: measure 0 sums to 5 beats in 4/4 (like real 237.json).
    // Note 2 is authored at measure 1, beat 0 => absolute beat 4.
    const malformed = [
      { midi: 60, dur: 3, beat: 0, measure: 0 },
      { midi: 62, dur: 2, beat: 3, measure: 0 }, // overruns the bar (3+2 = 5 in 4/4)
      { midi: 64, dur: 1, beat: 0, measure: 1 }  // authored onset: absolute beat 4
    ];

    // Sing note 3 exactly where it is PRINTED: measure 1 beat 0 = 4000ms at bpm 60.
    const sung = [
      { timestamp: 0, midi: 60, midiRounded: 60, frequency: 261, confidence: 0.95 },
      { timestamp: 3000, midi: 62, midiRounded: 62, frequency: 293, confidence: 0.95 },
      { timestamp: 4000, midi: 64, midiRounded: 64, frequency: 329, confidence: 0.95 }
    ];

    const r = gradePerformance(sung, malformed, 60, '4/4');
    const third = r.noteByNote[2];

    // Cumulative summing puts note 3 at 5000ms, so a singer hitting the printed
    // beat at 4000ms lands 1000ms early — outside the 150ms window — and is
    // graded as missed. Honoring `beat`+`measure` puts it at 4000ms: a match.
    expect(third.matched).toBe(true);
    expect(Math.abs(third.timingOffMs)).toBeLessThan(150);
  });

  it('falls back to cumulative durations when no beat field is authored', () => {
    const noBeat = [
      { midi: 60, dur: 1, measure: 0 },
      { midi: 62, dur: 1, measure: 0 }
    ];
    const sung = [
      { timestamp: 0, midi: 60, midiRounded: 60, frequency: 261, confidence: 0.95 },
      { timestamp: 1000, midi: 62, midiRounded: 62, frequency: 293, confidence: 0.95 }
    ];
    const r = gradePerformance(sung, noBeat, 60, '4/4');
    expect(r.summary.matchedNotes).toBe(2);
  });
});

describe('pitch score measures pitch', () => {
  // Detector confidence was folded in at 20% weight: a cheap microphone cost you
  // "pitch" points for a reason that is not pitch.
  it('does not penalize a perfectly-sung performance for low detector confidence', () => {
    const confident = singPerfectly(SIMPLE);
    const unconfident = confident.map(f => ({ ...f, confidence: 0.4 }));

    const a = gradePerformance(confident, SIMPLE, 60, '4/4');
    const b = gradePerformance(unconfident, SIMPLE, 60, '4/4');

    expect(b.pitchScore).toBe(a.pitchScore);
  });
});
