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

      it('gives every note a midi, dur, beat and measure', () => {
        for (const [i, n] of data.notes.entries()) {
          expect(Number.isFinite(n.midi), `note ${i} midi`).toBe(true);
          expect(Number.isFinite(n.dur), `note ${i} dur`).toBe(true);
          expect(Number.isFinite(n.beat), `note ${i} beat`).toBe(true);
          expect(Number.isFinite(n.measure), `note ${i} measure`).toBe(true);
          expect(n.dur, `note ${i} dur must be positive`).toBeGreaterThan(0);
        }
      });

      it('every bar sums exactly to the meter', () => {
        const sums = new Map();
        for (const n of data.notes) {
          sums.set(n.measure, (sums.get(n.measure) ?? 0) + n.dur);
        }
        const bad = [...sums.entries()]
          .filter(([, s]) => Math.abs(s - beatsPerMeasure) > 1e-9)
          .map(([m, s]) => `measure ${m} sums to ${s}, expected ${beatsPerMeasure}`);
        expect(bad).toEqual([]);
      });

      it('authored onsets agree with durations within each bar', () => {
        const byMeasure = new Map();
        for (const n of data.notes) {
          if (!byMeasure.has(n.measure)) byMeasure.set(n.measure, []);
          byMeasure.get(n.measure).push(n);
        }
        const bad = [];
        for (const [m, notes] of byMeasure) {
          if (notes[0].beat !== 0) bad.push(`measure ${m} starts at beat ${notes[0].beat}, not 0`);
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
          .filter(n => n.beat + n.dur > beatsPerMeasure + 1e-9)
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
