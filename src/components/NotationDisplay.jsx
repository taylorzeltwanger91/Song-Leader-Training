import { useRef, useEffect, useCallback, useMemo } from 'react';
import Vex from 'vexflow';

const { Renderer, Stave, StaveNote, Voice, Formatter, Beam, Dot, Accidental, KeySignature } = Vex;

// ─── MIDI / Duration helpers ────────────────────────────────

const NOTE_NAMES_SHARP = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
const NOTE_NAMES_FLAT  = ['c', 'db', 'd', 'eb', 'e', 'f', 'gb', 'g', 'ab', 'a', 'bb', 'b'];

// Keys that conventionally use flats
const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb']);

/**
 * Convert a MIDI number to a VexFlow key string like "c/4", "f#/5", "bb/3"
 */
function midiToVexKey(midi, keySignature = 'C') {
  const octave = Math.floor(midi / 12) - 1;
  const noteIdx = ((midi % 12) + 12) % 12;
  const useFlats = FLAT_KEYS.has(keySignature);
  const names = useFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
  const noteName = names[noteIdx];

  // VexFlow key format: "note/octave" — accidentals are separate modifiers
  // Base note without accidental
  const baseName = noteName.replace(/[#b]/g, '');
  return `${baseName}/${octave}`;
}

/**
 * Get the accidental string for a MIDI note, if any
 */
function midiToAccidental(midi, keySignature = 'C') {
  const noteIdx = ((midi % 12) + 12) % 12;
  const useFlats = FLAT_KEYS.has(keySignature);
  const names = useFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
  const noteName = names[noteIdx];
  if (noteName.includes('#')) return '#';
  if (noteName.includes('b')) return 'b';
  return null;
}

/**
 * Convert a beat-duration value to a VexFlow duration string.
 *
 * For simple meters (beat unit = quarter note):
 *   4 → "w" (whole), 3 → "hd" (dotted half), 2 → "h" (half),
 *   1.5 → "qd" (dotted quarter), 1 → "q" (quarter),
 *   0.75 → "8d" (dotted eighth), 0.5 → "8" (eighth), 0.25 → "16"
 *
 * For compound meters (beat unit = eighth note):
 *   3 → "qd" (dotted quarter), 2 → "q" (quarter),
 *   1.5 → "8d" (dotted eighth), 1 → "8" (eighth), 0.5 → "16"
 *
 * For 4/2 (beat unit = half note):
 *   4 → "w" (whole = 4 half beats → actually 2 whole beats... )
 *   We treat the dur values as multiples of the beat unit.
 */
function durToVexDuration(dur, timeSignature = '4/4') {
  const [, d] = timeSignature.split('/').map(Number);
  const n = parseInt(timeSignature.split('/')[0]);
  const isCompound = d >= 8 && n > 3 && n % 3 === 0;

  // Normalize: convert dur to quarter-note equivalents
  let quarterEquiv;
  if (isCompound) {
    // dur is in eighth-note units
    quarterEquiv = dur * 0.5;
  } else if (d === 2) {
    // dur is in half-note units
    quarterEquiv = dur * 2;
  } else {
    // dur is in quarter-note units
    quarterEquiv = dur;
  }

  // Map quarter-note equivalents to VexFlow duration strings
  // Check dotted values first (more specific)
  if (Math.abs(quarterEquiv - 6) < 0.01) return { duration: 'wd', dotted: true };     // dotted whole
  if (Math.abs(quarterEquiv - 4) < 0.01) return { duration: 'w', dotted: false };      // whole
  if (Math.abs(quarterEquiv - 3) < 0.01) return { duration: 'h', dotted: true };       // dotted half
  if (Math.abs(quarterEquiv - 2) < 0.01) return { duration: 'h', dotted: false };      // half
  if (Math.abs(quarterEquiv - 1.5) < 0.01) return { duration: 'q', dotted: true };     // dotted quarter
  if (Math.abs(quarterEquiv - 1) < 0.01) return { duration: 'q', dotted: false };      // quarter
  if (Math.abs(quarterEquiv - 0.75) < 0.01) return { duration: '8', dotted: true };    // dotted eighth
  if (Math.abs(quarterEquiv - 0.5) < 0.01) return { duration: '8', dotted: false };    // eighth
  if (Math.abs(quarterEquiv - 0.375) < 0.01) return { duration: '16', dotted: true };  // dotted sixteenth
  if (Math.abs(quarterEquiv - 0.25) < 0.01) return { duration: '16', dotted: false };  // sixteenth

  // Fallback: closest standard duration
  console.warn(`NotationDisplay: unmapped duration ${dur} (${quarterEquiv} quarters) in ${timeSignature}`);
  if (quarterEquiv >= 3) return { duration: 'h', dotted: true };
  if (quarterEquiv >= 1.5) return { duration: 'h', dotted: false };
  if (quarterEquiv >= 0.75) return { duration: 'q', dotted: false };
  return { duration: '8', dotted: false };
}

/**
 * Get the number of beats that fill one measure, expressed in the beat unit.
 */
function getBeatsPerMeasure(timeSignature) {
  const [n] = timeSignature.split('/').map(Number);
  return n;
}

// ─── Key signature mapping ──────────────────────────────────

// Map our internal key names to VexFlow key signature strings
const KEY_TO_VEX = {
  'C': 'C', 'G': 'G', 'D': 'D', 'A': 'A', 'E': 'E', 'B': 'B',
  'F#': 'F#', 'Gb': 'Gb', 'Db': 'Db', 'Ab': 'Ab', 'Eb': 'Eb',
  'Bb': 'Bb', 'F': 'F',
  // Handle enharmonic
  'C#': 'C#', 'Cb': 'Cb',
};

// ─── Component ──────────────────────────────────────────────

/**
 * NotationDisplay - renders an array of notes as standard music notation
 *
 * Props:
 *   notes       - Array of { midi, dur, measure, deg?, freq? }
 *   timeSignature - String like "4/4", "3/4", "6/8"
 *   keySignature  - String like "C", "G", "Bb", "F#"
 *   currentNote   - Index of the currently active note (for highlighting), -1 for none
 *   clef          - "treble" or "bass" (default "treble")
 *   measuresPerLine - How many measures per staff line (default: auto based on container width)
 */
export function NotationDisplay({
  notes = [],
  timeSignature = '4/4',
  keySignature = 'C',
  currentNote = -1,
  clef = 'treble',
  measuresPerLine: measuresPerLineProp,
}) {
  const containerRef = useRef(null);
  const rendererRef = useRef(null);

  // Group notes by measure
  const measureGroups = useMemo(() => {
    if (!notes.length) return [];
    const groups = {};
    notes.forEach((note, idx) => {
      const m = note.measure ?? 0;
      if (!groups[m]) groups[m] = [];
      groups[m].push({ ...note, _idx: idx });
    });
    // Return sorted array of measure arrays
    return Object.keys(groups)
      .sort((a, b) => Number(a) - Number(b))
      .map(k => groups[k]);
  }, [notes]);

  const render = useCallback(() => {
    const container = containerRef.current;
    if (!container || !measureGroups.length) return;

    try {
    // Clear previous render
    container.innerHTML = '';

    const containerWidth = container.clientWidth || 500;

    // Determine measures per line
    const numMeasures = measureGroups.length;
    const avgNotesPerMeasure = notes.length / numMeasures;
    const autoMeasuresPerLine = avgNotesPerMeasure <= 3 ? 4
      : avgNotesPerMeasure <= 5 ? 3
      : 2;
    const measuresPerLine = measuresPerLineProp || autoMeasuresPerLine;

    // Split measures into lines
    const lines = [];
    for (let i = 0; i < numMeasures; i += measuresPerLine) {
      lines.push(measureGroups.slice(i, i + measuresPerLine));
    }

    // Calculate dimensions
    const staveHeight = 120;
    const topPadding = 10;
    const lineSpacing = 20;
    const totalHeight = topPadding + lines.length * (staveHeight + lineSpacing);

    // Create renderer
    const renderer = new Renderer(container, Renderer.Backends.SVG);
    renderer.resize(containerWidth, totalHeight);
    const context = renderer.getContext();
    context.setFont('Arial', 10);
    rendererRef.current = renderer;

    const vexKeySig = KEY_TO_VEX[keySignature] || 'C';
    const beatsPerMeasure = getBeatsPerMeasure(timeSignature);
    const [tsNum, tsDenom] = timeSignature.split('/').map(Number);

    lines.forEach((lineMeasures, lineIdx) => {
      const isFirstLine = lineIdx === 0;
      const y = topPadding + lineIdx * (staveHeight + lineSpacing);

      // First stave in the line gets clef + key sig + time sig (more width)
      const firstStaveExtra = isFirstLine ? 80 : 30;
      const availableWidth = containerWidth - 20; // 10px padding each side
      const firstStaveWidth = availableWidth / lineMeasures.length + (isFirstLine ? firstStaveExtra / lineMeasures.length : 0);

      let x = 10;

      lineMeasures.forEach((measureNotes, measIdx) => {
        const isFirstMeasure = lineIdx === 0 && measIdx === 0;
        const staveWidth = measIdx === 0
          ? (availableWidth / lineMeasures.length) + firstStaveExtra * (isFirstLine ? 1 : 0.5)
          : availableWidth / lineMeasures.length - (firstStaveExtra * (isFirstLine ? 1 : 0.5)) / (lineMeasures.length - 1 || 1);

        // Ensure minimum stave width
        const finalWidth = Math.max(staveWidth, 120);

        const stave = new Stave(x, y, finalWidth);

        if (isFirstMeasure) {
          stave.addClef(clef);
          stave.addKeySignature(vexKeySig);
          stave.addTimeSignature(timeSignature);
        } else if (measIdx === 0 && !isFirstLine) {
          // Start of new line — add clef for readability
          stave.addClef(clef);
        }

        stave.setContext(context).draw();

        // Create VexFlow notes for this measure
        const vexNotes = [];
        measureNotes.forEach((note) => {
          if (note.midi == null || isNaN(note.midi)) {
            console.warn('NotationDisplay: skipping note with invalid midi:', note);
            return;
          }
          const { duration, dotted } = durToVexDuration(note.dur, timeSignature);
          const vexKey = midiToVexKey(note.midi, keySignature);
          const accidental = midiToAccidental(note.midi, keySignature);

          if (!vexKey || !vexKey.includes('/')) {
            console.warn('NotationDisplay: invalid vexKey:', vexKey, 'from midi:', note.midi);
            return;
          }

          try {
            const staveNote = new StaveNote({
              keys: [vexKey],
              duration: duration,
              clef: clef,
            });

            // Add accidental if needed
            if (accidental) {
              staveNote.addModifier(new Accidental(accidental));
            }

            // Add dot for dotted notes
            if (dotted) {
              Dot.buildAndAttach([staveNote]);
            }

            // Highlight current note
            if (note._idx === currentNote && currentNote >= 0) {
              staveNote.setStyle({ fillStyle: '#5c7a5e', strokeStyle: '#5c7a5e' });
            }

            vexNotes.push(staveNote);
          } catch (e) {
            console.warn('NotationDisplay: error creating note:', e.message, { midi: note.midi, dur: note.dur, vexKey, duration });
          }
        });

        if (vexNotes.length === 0) return;

        // Create voice — use SOFT mode to avoid strict beat counting issues
        const voice = new Voice({
          num_beats: tsNum,
          beat_value: tsDenom,
        }).setStrict(false);

        voice.addTickables(vexNotes);

        // Format
        const formatterWidth = finalWidth - (isFirstMeasure ? 100 : measIdx === 0 && !isFirstLine ? 50 : 30);
        new Formatter().joinVoices([voice]).format([voice], Math.max(formatterWidth, 80));

        // Draw voice
        voice.draw(context, stave);

        // Auto-beam eighth notes and shorter
        try {
          const beams = Beam.generateBeams(vexNotes, {
            groups: getBeamGroups(timeSignature),
          });
          beams.forEach(b => b.setContext(context).draw());
        } catch (e) {
          // Beaming can fail with unusual note combinations — not critical
        }

        x += finalWidth;
      });
    });
    } catch (e) {
      console.error('NotationDisplay render error:', e);
      container.innerHTML = '<div style="padding:12px;color:#a33b3b;font-size:12px;">⚠ Notation rendering failed: ' + e.message + '</div>';
    }
  }, [measureGroups, notes, timeSignature, keySignature, currentNote, clef, measuresPerLineProp]);

  // Render on mount and when dependencies change
  useEffect(() => {
    render();

    // Re-render on container resize
    const observer = new ResizeObserver(() => render());
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [render]);

  if (!notes.length) return null;

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        background: '#fff',
        border: '1px solid #e8e0d4',
        borderRadius: 10,
        padding: '8px 4px',
        overflowX: 'auto',
      }}
    />
  );
}

/**
 * Get beam grouping for a time signature.
 * Returns VexFlow Fraction groups for Beam.generateBeams().
 */
function getBeamGroups(timeSignature) {
  const [n, d] = timeSignature.split('/').map(Number);
  const isCompound = d >= 8 && n > 3 && n % 3 === 0;
  const Fraction = Vex.Fraction;

  if (isCompound) {
    // Compound: group by dotted quarter (3 eighths)
    const groups = n / 3;
    return Array(groups).fill(new Fraction(3, 8));
  }

  // Simple meters: group by beat
  switch (timeSignature) {
    case '2/4': return [new Fraction(1, 4), new Fraction(1, 4)];
    case '3/4': return [new Fraction(1, 4), new Fraction(1, 4), new Fraction(1, 4)];
    case '4/4': return [new Fraction(1, 4), new Fraction(1, 4), new Fraction(1, 4), new Fraction(1, 4)];
    case '4/2': return [new Fraction(1, 2), new Fraction(1, 2), new Fraction(1, 2), new Fraction(1, 2)];
    default:
      return Array(n).fill(new Fraction(1, d));
  }
}

export default NotationDisplay;
