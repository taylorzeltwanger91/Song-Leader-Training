/**
 * Playback scheduling — the timing the listener actually hears.
 *
 * buildSchedule turns beat-space hymn data into second-space note events. Getting this
 * wrong is silent: the app still plays, it just plays at the wrong speed or drops a voice,
 * and you only notice by ear. These assertions run against the real shipped hymns so a
 * bad meter conversion fails the build instead of the ear-check.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildSchedule, VOICE_ORDER } from './hymn-player.js';

const DIR = join(process.cwd(), 'public', 'hymn_satb');
const files = readdirSync(DIR).filter(f => f.endsWith('.json'));

describe('buildSchedule', () => {
  it('sorts events by start time regardless of voice order', () => {
    const voices = {
      soprano: [{ midi: 72, dur: 4, onset: 0 }],
      bass: [{ midi: 48, dur: 2, onset: 0 }, { midi: 50, dur: 2, onset: 2 }],
    };
    const { events } = buildSchedule(voices, { which: 'all', timeSignature: '4/4', bpm: 60 });
    const times = events.map(e => e.at);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('converts beats to seconds at 60bpm one-for-one', () => {
    const voices = { soprano: [{ midi: 72, dur: 2, onset: 1 }] };
    const { events, duration } = buildSchedule(voices, { which: 'soprano', timeSignature: '4/4', bpm: 60 });
    expect(events[0]).toMatchObject({ midi: 72, at: 1, dur: 2 });
    expect(duration).toBe(3);
  });

  it('halves note lengths when the tempo doubles', () => {
    const voices = { soprano: [{ midi: 72, dur: 2, onset: 1 }] };
    const { events } = buildSchedule(voices, { which: 'soprano', timeSignature: '4/4', bpm: 120 });
    expect(events[0].at).toBe(0.5);
    expect(events[0].dur).toBe(1);
  });

  it('counts compound meters in dotted beats', () => {
    const voices = { soprano: [{ midi: 72, dur: 3, onset: 0 }] };
    const { events } = buildSchedule(voices, { which: 'soprano', timeSignature: '6/8', bpm: 60 });
    expect(events[0].dur).toBeCloseTo(1, 10); // three eighths = one dotted beat = one second
  });

  it('omits rests from the events but still counts them in the duration', () => {
    const voices = { soprano: [{ midi: 72, dur: 1, onset: 0 }, { rest: true, dur: 3, onset: 1 }] };
    const { events, duration } = buildSchedule(voices, { which: 'soprano', timeSignature: '4/4', bpm: 60 });
    expect(events).toHaveLength(1);
    expect(duration).toBe(4);
  });

  it('plays a single part more loudly than the full ensemble', () => {
    const voices = { soprano: [{ midi: 72, dur: 1, onset: 0 }] };
    const all = buildSchedule(voices, { which: 'all', timeSignature: '4/4', bpm: 60 });
    const solo = buildSchedule(voices, { which: 'soprano', timeSignature: '4/4', bpm: 60 });
    expect(solo.gain).toBeGreaterThan(all.gain);
  });

  it('returns an empty schedule rather than throwing on missing data', () => {
    expect(buildSchedule(undefined, { which: 'all', timeSignature: '4/4', bpm: 60 }))
      .toMatchObject({ events: [], duration: 0 });
  });
});

describe('buildSchedule against the shipped hymns', () => {
  for (const file of files) {
    const data = JSON.parse(readFileSync(join(DIR, file), 'utf8'));
    const opts = { timeSignature: data.timeSignature, bpm: data.bpm };

    describe(`hymn ${data.hymnId} — ${data.title}`, () => {
      it('schedules every sounding note of all four parts', () => {
        const expected = VOICE_ORDER.reduce(
          (n, v) => n + data.voices[v].filter(x => !x.rest).length, 0);
        expect(buildSchedule(data.voices, { ...opts, which: 'all' }).events).toHaveLength(expected);
      });

      it('gives every voice the same duration as the whole hymn', () => {
        // validate_satb.py already guarantees the voices agree in beats; this checks the
        // beats->seconds conversion preserves that, so no part runs past the others.
        const full = buildSchedule(data.voices, { ...opts, which: 'all' }).duration;
        for (const v of VOICE_ORDER) {
          expect(buildSchedule(data.voices, { ...opts, which: v }).duration).toBeCloseTo(full, 10);
        }
      });

      it('opens on the first sounding note and never runs past the end', () => {
        // Hymns 1, 3 and 79 open with a half-rest in all four voices (a pickup notated
        // as rest-then-upbeat rather than a short bar), so the first event is not at 0.
        const { events, duration } = buildSchedule(data.voices, { ...opts, which: 'all' });
        const firstSounding = Math.min(...VOICE_ORDER.map(
          v => data.voices[v].find(n => !n.rest).onset));
        expect(events[0].at).toBeCloseTo(firstSounding * (60 / data.bpm), 10);
        for (const e of events) expect(e.at + e.dur).toBeLessThanOrEqual(duration + 1e-9);
      });
    });
  }
});
