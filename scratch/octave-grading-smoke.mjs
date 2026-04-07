/**
 * Octave-tolerant grading integration smoke test.
 *
 * Generates a melody at octave 3, fabricates a detected pitch stream
 * at several octave displacements (same / one up / one down), runs
 * gradePerformance, and asserts that each case produces a sensible
 * grade with the expected octaveShift on every matched note.
 *
 * This is the slice-level proof for M001/S02: the user can pick an
 * octave, sing the exercise in their natural register, and still get
 * a meaningful grade.
 *
 * Run with:  node scratch/octave-grading-smoke.mjs
 */

import { generateMelody, octaveToFrequencyRange } from '../src/audio/melody-generator.js';
import { gradePerformance } from '../src/audio/grader.js';

// Fabricate a detected pitch stream that walks through the reference melody,
// shifted by `shiftSemitones` from the reference. 5 samples per note, centered
// across each note's duration.
function buildStream(reference, bpm, ts, shiftSemitones) {
  const [n, d] = ts.split('/').map(Number);
  const isCompound = d >= 8 && n > 3 && n % 3 === 0;
  let msPerBeatUnit;
  if (isCompound) msPerBeatUnit = (60000 / bpm) / 3;
  else if (d === 2) msPerBeatUnit = 60000 / bpm;
  else msPerBeatUnit = 60000 / bpm;

  const stream = [];
  let t = 0;
  for (const note of reference) {
    const durMs = note.dur * msPerBeatUnit;
    const shiftedMidi = note.midi + shiftSemitones;
    const freq = 440 * Math.pow(2, (shiftedMidi - 69) / 12);
    for (let i = 0; i < 5; i++) {
      stream.push({
        timestamp: t + (i + 1) * (durMs / 6),
        midi: shiftedMidi,
        midiRounded: shiftedMidi,
        frequency: freq,
        confidence: 0.9,
      });
    }
    t += durMs;
  }
  return stream;
}

function fmt(r, label) {
  const shifts = r.noteByNote.map(n => n.octaveShift).join(',');
  return `${label.padEnd(16)} pitch=${String(r.pitchScore).padStart(3)} ` +
         `matched=${r.summary.matchedNotes}/${r.summary.totalNotes} ` +
         `avgCents=${String(r.summary.avgCentsOff).padStart(3)} ` +
         `shifts=[${shifts}]`;
}

let failures = 0;
function check(label, cond, detail) {
  if (!cond) {
    console.error(`  ✗ ${label}: ${detail}`);
    failures++;
  } else {
    console.log(`  ✓ ${label}`);
  }
}

console.log('— octave-tolerant grading smoke —\n');

// Generate an octave-3 melody
const reference = generateMelody('4/4', 120, 4, 'C', 3);
console.log('reference melody:');
console.log('  length:', reference.length, 'notes');
console.log('  midi range:', Math.min(...reference.map(n => n.midi)), '–', Math.max(...reference.map(n => n.midi)));
console.log('  first 4:', reference.slice(0, 4).map(n => n.midi));
console.log('');

console.log('pitch engine band for octave 3:', octaveToFrequencyRange(3));
console.log('');

// === Case 1: singer in the reference octave ===
console.log('case 1: same octave');
const r0 = gradePerformance(buildStream(reference, 120, '4/4', 0), reference, 120, '4/4');
console.log('  ', fmt(r0, 'same-octave'));
check('all notes matched', r0.summary.matchedNotes === reference.length,
  `expected ${reference.length}, got ${r0.summary.matchedNotes}`);
check('pitch score > 90', r0.pitchScore > 90, `got ${r0.pitchScore}`);
check('no octave shift', r0.noteByNote.every(n => n.octaveShift === 0),
  `shifts: ${r0.noteByNote.map(n => n.octaveShift).join(',')}`);
console.log('');

// === Case 2: singer one octave down ===
console.log('case 2: one octave down');
const rDown = gradePerformance(buildStream(reference, 120, '4/4', -12), reference, 120, '4/4');
console.log('  ', fmt(rDown, 'octave-down'));
check('all notes matched', rDown.summary.matchedNotes === reference.length,
  `expected ${reference.length}, got ${rDown.summary.matchedNotes}`);
check('pitch score > 50', rDown.pitchScore > 50, `got ${rDown.pitchScore}`);
check('octaveShift = -1 on every matched note',
  rDown.noteByNote.every(n => n.octaveShift === -1),
  `shifts: ${rDown.noteByNote.map(n => n.octaveShift).join(',')}`);
check('diagnostic mentions octave down',
  rDown.diagnostics.some(d => d.toLowerCase().includes('octave') && d.toLowerCase().includes('down')),
  `diagnostics: ${JSON.stringify(rDown.diagnostics)}`);
console.log('');

// === Case 3: singer one octave up ===
console.log('case 3: one octave up');
const rUp = gradePerformance(buildStream(reference, 120, '4/4', 12), reference, 120, '4/4');
console.log('  ', fmt(rUp, 'octave-up'));
check('all notes matched', rUp.summary.matchedNotes === reference.length,
  `expected ${reference.length}, got ${rUp.summary.matchedNotes}`);
check('pitch score > 50', rUp.pitchScore > 50, `got ${rUp.pitchScore}`);
check('octaveShift = +1 on every matched note',
  rUp.noteByNote.every(n => n.octaveShift === 1),
  `shifts: ${rUp.noteByNote.map(n => n.octaveShift).join(',')}`);
console.log('');

// === Case 4: tritone off (truly wrong) should NOT match ===
console.log('case 4: tritone off (should miss)');
const rTritone = gradePerformance(buildStream(reference, 120, '4/4', -6), reference, 120, '4/4');
console.log('  ', fmt(rTritone, 'tritone'));
check('no notes matched', rTritone.summary.matchedNotes === 0,
  `expected 0, got ${rTritone.summary.matchedNotes}`);
check('pitch score is 0', rTritone.pitchScore === 0, `got ${rTritone.pitchScore}`);
console.log('');

// === Case 5: 25 cents sharp (same octave, fine intonation error) ===
console.log('case 5: 25 cents sharp (fine intonation)');
const rSharp = gradePerformance(buildStream(reference, 120, '4/4', 0.25), reference, 120, '4/4');
console.log('  ', fmt(rSharp, '25c-sharp'));
check('all notes matched', rSharp.summary.matchedNotes === reference.length,
  `expected ${reference.length}, got ${rSharp.summary.matchedNotes}`);
check('avgCents is ~25', rSharp.summary.avgCentsOff >= 23 && rSharp.summary.avgCentsOff <= 27,
  `got ${rSharp.summary.avgCentsOff}`);
console.log('');

// === Summary ===
if (failures > 0) {
  console.error(`\n✗ ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('✓ all assertions passed');
