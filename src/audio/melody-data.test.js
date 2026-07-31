/**
 * SATB hymn data validation — the build-time gate.
 *
 * Every 4-part hymn shipped in public/hymn_satb/ must be internally coherent.
 * The original 237 melody shipped with four malformed bars (sums of 5, 2, 4 and
 * 1 in 3/2 time) and nothing caught it — the app rendered them happily because
 * NotationDisplay calls setStrict(false), and the grader silently drifted every
 * later note. This test is the JS mirror of tools/omr/validate_satb.py: any new
 * transcription (hand-entered or OMR-derived) must pass it before it ships.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'public', 'hymn_satb');
const files = readdirSync(DIR).filter(f => f.endsWith('.json'));
const VOICES = ['soprano', 'alto', 'tenor', 'bass'];

describe('SATB hymn data', () => {
  it('ships at least one hymn to validate', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    describe(file, () => {
      const data = JSON.parse(readFileSync(join(DIR, file), 'utf8'));
      const beatsPerMeasure = Number(data.timeSignature.split('/')[0]);

      it('declares a time signature, bpm and four voices', () => {
        expect(data.timeSignature).toMatch(/^\d+\/\d+$/);
        expect(data.bpm).toBeGreaterThan(0);
        for (const v of VOICES) {
          expect(Array.isArray(data.voices?.[v]), `${v} must be an array`).toBe(true);
          expect(data.voices[v].length, `${v} must be non-empty`).toBeGreaterThan(0);
        }
      });

      it('gives every entry a positive dur and finite onset (notes midi+finite, rests no midi)', () => {
        for (const v of VOICES) {
          for (const [i, n] of data.voices[v].entries()) {
            expect(n.dur, `${v}[${i}] dur must be positive`).toBeGreaterThan(0);
            expect(Number.isFinite(n.onset), `${v}[${i}] onset`).toBe(true);
            if (n.rest) {
              expect(n.midi, `${v}[${i}] rest must not carry a midi`).toBeUndefined();
            } else {
              expect(Number.isFinite(n.midi), `${v}[${i}] note midi`).toBe(true);
            }
          }
        }
      });

      it('onset equals the cumulative duration of preceding entries (rests included)', () => {
        for (const v of VOICES) {
          let cum = 0;
          const bad = [];
          for (const [i, n] of data.voices[v].entries()) {
            if (Math.abs(n.onset - cum) > 1e-9) bad.push(`${v}[${i}] onset ${n.onset}, expected ${cum}`);
            cum += n.dur;
          }
          expect(bad).toEqual([]);
        }
      });

      it('all four voices span the same total number of beats', () => {
        const totals = VOICES.map(v => data.voices[v].reduce((s, n) => s + n.dur, 0));
        const distinct = new Set(totals.map(t => Math.round(t * 1e6) / 1e6));
        expect(distinct.size, `voice totals differ: ${totals.join(', ')}`).toBe(1);
      });

      it('all four voices agree on the bar structure (shared barlines)', () => {
        // The real cross-check: irregular/short measures are allowed (phrase cadences,
        // split measures at system breaks), but every voice must break bars identically.
        const profile = v => {
          const sums = new Map();
          for (const n of data.voices[v]) sums.set(n.measure, (sums.get(n.measure) ?? 0) + n.dur);
          return [...sums.keys()].sort((a, b) => a - b).map(m => Math.round(sums.get(m) * 1e6) / 1e6);
        };
        const profiles = VOICES.map(profile);
        const ref = JSON.stringify(profiles[0]);
        for (const [i, p] of profiles.entries()) {
          expect(JSON.stringify(p), `${VOICES[i]} bar structure differs from soprano`).toBe(ref);
        }
        // Non-meter bars must complement to whole measures (anacrusis / paired short bars).
        const odd = profiles[0].filter(x => Math.abs(x - beatsPerMeasure) > 1e-9);
        const oddSum = odd.reduce((s, x) => s + x, 0);
        const complements = Math.abs(oddSum - beatsPerMeasure * Math.round(oddSum / beatsPerMeasure)) < 1e-9;
        expect(complements, `non-meter bars ${odd.join(', ')} do not complement to whole ${beatsPerMeasure}-beat measures`).toBe(true);
      });

      it('uses measures numbered contiguously from 0 in every voice', () => {
        for (const v of VOICES) {
          const measures = [...new Set(data.voices[v].map(n => n.measure))].sort((a, b) => a - b);
          expect(measures, `${v} measures not contiguous from 0`).toEqual(measures.map((_, i) => i));
        }
      });

      it('stays in a plausible vocal range', () => {
        for (const v of VOICES) {
          for (const n of data.voices[v]) {
            if (n.rest) continue;
            expect(n.midi, `${v} midi ${n.midi} out of range`).toBeGreaterThanOrEqual(36);
            expect(n.midi, `${v} midi ${n.midi} out of range`).toBeLessThanOrEqual(96);
          }
        }
      });
    });
  }
});
