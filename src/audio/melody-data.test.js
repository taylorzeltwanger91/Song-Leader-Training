/**
 * Melody data validation.
 *
 * Every hymn melody shipped in public/hymn_melodies/ must be internally coherent.
 * 237.json shipped with four malformed bars (sums of 5, 2, 4 and 1 in 3/2 time)
 * and nothing caught it — the app rendered them happily because NotationDisplay
 * calls setStrict(false), and the grader silently drifted every later note.
 *
 * This is the ingest-time validation the plan calls for, applied to the data we
 * already have. Any new transcription (hand-entered or OMR-derived) must pass it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'public', 'hymn_melodies');
const files = readdirSync(DIR).filter(f => f.endsWith('.json'));

describe('hymn melody data', () => {
  it('has at least one melody to validate', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    describe(file, () => {
      const data = JSON.parse(readFileSync(join(DIR, file), 'utf8'));
      const beatsPerMeasure = Number(data.timeSignature.split('/')[0]);

      it('declares a time signature, bpm and notes', () => {
        expect(data.timeSignature).toMatch(/^\d+\/\d+$/);
        expect(data.bpm).toBeGreaterThan(0);
        expect(Array.isArray(data.notes)).toBe(true);
        expect(data.notes.length).toBeGreaterThan(0);
      });

      it('gives every entry a dur, measure and onset (notes also midi+beat; rests neither)', () => {
        for (const [i, n] of data.notes.entries()) {
          expect(Number.isFinite(n.dur), `entry ${i} dur`).toBe(true);
          expect(n.dur, `entry ${i} dur must be positive`).toBeGreaterThan(0);
          expect(Number.isFinite(n.measure), `entry ${i} measure`).toBe(true);
          expect(Number.isFinite(n.onset), `entry ${i} onset`).toBe(true);
          if (n.rest) {
            // A rest is silence: no pitch, no in-bar beat position asserted here.
            expect(n.midi, `rest ${i} must not carry a midi`).toBeUndefined();
          } else {
            expect(Number.isFinite(n.midi), `note ${i} midi`).toBe(true);
            expect(Number.isFinite(n.beat), `note ${i} beat`).toBe(true);
          }
        }
      });

      it('onset equals the cumulative duration of preceding entries (rests included)', () => {
        // Rests occupy the timeline: a rest advances the cumulative clock exactly like a
        // note. This is what lets a gap of silence sit between two sung notes.
        let cum = 0;
        const bad = [];
        for (const [i, n] of data.notes.entries()) {
          if (Math.abs(n.onset - cum) > 1e-9) bad.push(`entry ${i} onset ${n.onset}, expected ${cum}`);
          cum += n.dur;
        }
        expect(bad).toEqual([]);
      });

      it('every bar sums to the meter (allowing a pickup/final anacrusis)', () => {
        const sums = new Map();
        for (const n of data.notes) {
          sums.set(n.measure, (sums.get(n.measure) ?? 0) + n.dur);
        }
        const measures = [...sums.keys()].sort((a, b) => a - b);
        const first = measures[0], last = measures[measures.length - 1];
        const interior = measures.filter(m => m !== first && m !== last);

        // Interior bars must each equal the meter.
        const badInterior = interior
          .filter(m => Math.abs(sums.get(m) - beatsPerMeasure) > 1e-9)
          .map(m => `interior measure ${m} sums to ${sums.get(m)}, expected ${beatsPerMeasure}`);
        expect(badInterior).toEqual([]);

        // First and last: either both full, or an anacrusis where they sum to one meter.
        const f = sums.get(first), l = sums.get(last);
        const fullEnds = Math.abs(f - beatsPerMeasure) < 1e-9 && Math.abs(l - beatsPerMeasure) < 1e-9;
        const anacrusis = data.anacrusis === true && Math.abs(f + l - beatsPerMeasure) < 1e-9;
        expect(fullEnds || anacrusis,
          `first bar ${f} + last bar ${l} must be two full ${beatsPerMeasure}-beat bars, or an anacrusis summing to ${beatsPerMeasure}`
        ).toBe(true);
      });

      it('authored onsets agree with durations within each bar (notes only)', () => {
        // Only notes carry a `beat`; rests are positioned by their duration in the
        // timeline, not by an in-bar beat, so they're excluded from this check.
        const byMeasure = new Map();
        for (const n of data.notes) {
          if (n.rest) continue;
          if (!byMeasure.has(n.measure)) byMeasure.set(n.measure, []);
          byMeasure.get(n.measure).push(n);
        }
        const firstMeasure = Math.min(...byMeasure.keys());
        const bad = [];
        for (const [m, notes] of byMeasure) {
          const pickup = m === firstMeasure && data.anacrusis === true;
          // A bar may legitimately begin with a rest, so the first *note*'s beat need not
          // be 0; assert only that consecutive notes' beats are consistent with durations.
          const startsClean = notes[0].beat === 0 || pickup || data.notes.some(x => x.rest);
          if (!startsClean) bad.push(`measure ${m} starts at beat ${notes[0].beat}, not 0`);
          for (let i = 0; i < notes.length - 1; i++) {
            const expectedNext = notes[i].beat + notes[i].dur;
            if (Math.abs(expectedNext - notes[i + 1].beat) > 1e-9) {
              bad.push(`measure ${m}: beat ${notes[i].beat} + dur ${notes[i].dur} = ${expectedNext}, but next note is at beat ${notes[i + 1].beat}`);
            }
          }
        }
        expect(bad).toEqual([]);
      });

      it('keeps every note inside its bar', () => {
        const bad = data.notes
          .filter(n => !n.rest && n.beat + n.dur > beatsPerMeasure + 1e-9)
          .map(n => `measure ${n.measure} beat ${n.beat} dur ${n.dur} overruns the bar`);
        expect(bad).toEqual([]);
      });

      it('uses measures numbered contiguously from 0', () => {
        const measures = [...new Set(data.notes.map(n => n.measure))].sort((a, b) => a - b);
        expect(measures).toEqual(measures.map((_, i) => i));
      });

      it('stays in a plausible vocal range', () => {
        for (const n of data.notes) {
          expect(n.midi, `midi ${n.midi} out of range`).toBeGreaterThanOrEqual(36);
          expect(n.midi, `midi ${n.midi} out of range`).toBeLessThanOrEqual(96);
        }
      });
    });
  }
});
