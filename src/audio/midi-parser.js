/**
 * MIDI File Parser
 *
 * Parses MIDI files into the internal melody format used by the grader and NotationDisplay.
 * Uses @tonejs/midi for parsing.
 *
 * Output format: {
 *   notes: [{ midi, dur, freq, measure, lyric? }],
 *   timeSignature: "4/4",
 *   tempo: 120,
 *   keySignature: "C",
 *   title: "...",
 *   tracks: [{ name, noteCount, avgMidi }],
 *   selectedTrack: 0
 * }
 */

import { Midi } from '@tonejs/midi';

/**
 * Convert MIDI note number to frequency
 */
function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Parse a MIDI ArrayBuffer into the internal melody format.
 *
 * @param {ArrayBuffer} arrayBuffer - Raw MIDI file data
 * @param {Object} options
 * @param {number} options.trackIndex - Which track to use (default: auto-detect soprano)
 * @returns {Object} Parsed melody data
 */
export function parseMidiFile(arrayBuffer, options = {}) {
  const midi = new Midi(arrayBuffer);

  // Extract metadata
  const tempo = midi.header.tempos.length > 0 ? Math.round(midi.header.tempos[0].bpm) : 120;

  // Time signature from header
  let timeSignature = '4/4';
  if (midi.header.timeSignatures.length > 0) {
    const ts = midi.header.timeSignatures[0];
    timeSignature = `${ts.timeSignature[0]}/${ts.timeSignature[1]}`;
  }

  // Key signature from header
  let keySignature = 'C';
  if (midi.header.keySignatures.length > 0) {
    const ks = midi.header.keySignatures[0];
    keySignature = ks.key || 'C';
    // Normalize: "@tonejs/midi" may return lowercase or with 'major'/'minor'
    keySignature = keySignature.replace(' major', '').replace(' minor', 'm');
    // Capitalize first letter
    keySignature = keySignature.charAt(0).toUpperCase() + keySignature.slice(1);
  }

  const title = midi.header.name || '';

  // Build track info for UI selection
  const tracks = midi.tracks.map((track, idx) => {
    const notes = track.notes;
    const avgMidi = notes.length > 0
      ? Math.round(notes.reduce((sum, n) => sum + n.midi, 0) / notes.length)
      : 0;
    return {
      name: track.name || `Track ${idx + 1}`,
      noteCount: notes.length,
      avgMidi,
      instrument: track.instrument?.name || 'unknown',
    };
  });

  // Filter to tracks that actually have notes
  const tracksWithNotes = tracks
    .map((t, i) => ({ ...t, originalIndex: i }))
    .filter(t => t.noteCount > 0);

  if (tracksWithNotes.length === 0) {
    console.warn('MIDI parser: no tracks with notes found');
    return {
      notes: [],
      timeSignature,
      tempo,
      keySignature,
      title,
      tracks,
      selectedTrack: -1,
    };
  }

  // Auto-detect soprano: highest average pitch among tracks with notes
  let selectedTrackIdx;
  if (options.trackIndex != null && options.trackIndex >= 0) {
    selectedTrackIdx = options.trackIndex;
  } else {
    // Pick the track with the highest average MIDI (soprano is highest voice)
    const sorted = [...tracksWithNotes].sort((a, b) => b.avgMidi - a.avgMidi);
    selectedTrackIdx = sorted[0].originalIndex;
  }

  const selectedTrack = midi.tracks[selectedTrackIdx];
  if (!selectedTrack || selectedTrack.notes.length === 0) {
    console.warn('MIDI parser: selected track has no notes, index:', selectedTrackIdx);
    return {
      notes: [],
      timeSignature,
      tempo,
      keySignature,
      title,
      tracks,
      selectedTrack: selectedTrackIdx,
    };
  }

  // Parse time signature parts for measure calculation
  const [tsNum, tsDenom] = timeSignature.split('/').map(Number);
  const isCompound = tsDenom >= 8 && tsNum > 3 && tsNum % 3 === 0;

  // Calculate seconds per beat (quarter note by default)
  const secPerQuarter = 60 / tempo;

  // Calculate measure duration in seconds
  // For simple meters: beatsPerMeasure * secPerBeat
  // beat = quarter note unless denom != 4
  let secPerMeasure;
  if (isCompound) {
    // Compound: beat unit is dotted quarter (= 3 eighth notes)
    // secPerBeat = 60/BPM where BPM is dotted quarters
    // But MIDI tempo is always in quarter notes per minute...
    // Actually, MIDI tempo is microseconds per quarter note
    // So secPerMeasure = (tsNum / (tsDenom/4)) * secPerQuarter
    secPerMeasure = (tsNum / (tsDenom / 4)) * secPerQuarter;
  } else if (tsDenom === 2) {
    // Half note beats
    secPerMeasure = tsNum * secPerQuarter * 2;
  } else if (tsDenom === 8) {
    secPerMeasure = tsNum * secPerQuarter / 2;
  } else {
    // Quarter note beats (4/4, 3/4, 2/4)
    secPerMeasure = tsNum * secPerQuarter;
  }

  // Convert duration in seconds to beat units for our internal format
  function secToBeatUnits(durationSec) {
    if (isCompound) {
      // In compound meters, dur is in eighth-note units
      return durationSec / (secPerQuarter / 2);
    } else if (tsDenom === 2) {
      // In 4/2, dur is in half-note units
      return durationSec / (secPerQuarter * 2);
    } else {
      // In simple meters, dur is in quarter-note units
      return durationSec / secPerQuarter;
    }
  }

  // Convert track notes to our internal format
  const notes = selectedTrack.notes
    .slice() // Don't mutate original
    .sort((a, b) => a.time - b.time) // Sort by time
    .map(note => {
      const measure = Math.floor(note.time / secPerMeasure);
      const dur = secToBeatUnits(note.duration);

      return {
        midi: note.midi,
        dur: Math.round(dur * 100) / 100, // Round to 2 decimal places
        freq: midiToFreq(note.midi),
        measure,
      };
    });

  console.log(`MIDI parsed: "${title}" — ${tracks.length} tracks, track ${selectedTrackIdx} selected (${notes.length} notes), ${timeSignature} @ ${tempo} BPM, key: ${keySignature}`);

  return {
    notes,
    timeSignature,
    tempo,
    keySignature,
    title,
    tracks,
    selectedTrack: selectedTrackIdx,
  };
}

/**
 * Fetch a MIDI file from a URL and parse it.
 *
 * @param {string} url - URL to the .mid file
 * @param {Object} options - Options passed to parseMidiFile
 * @returns {Promise<Object>} Parsed melody data
 */
export async function loadMidiFromUrl(url, options = {}) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch MIDI file: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return parseMidiFile(arrayBuffer, options);
}

export default { parseMidiFile, loadMidiFromUrl };
