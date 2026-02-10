/**
 * Performance Grader Module
 * Compares detected pitches against reference melody and generates scores
 */

/**
 * Grade a singing performance against a reference melody
 * @param {Array} detectedPitches - Array of { timestamp, midi, frequency, ... } from recorder
 * @param {Array} referenceMelody - Array of { midi, dur, freq, measure, ... } expected notes
 * @param {number} bpm - Tempo in beats per minute
 * @param {string} timeSignature - Time signature like "4/4" or "3/2"
 * @returns {Object} Grading results
 */
export function gradePerformance(detectedPitches, referenceMelody, bpm, timeSignature = "4/4") {
  if (!detectedPitches.length || !referenceMelody.length) {
    return getEmptyResult();
  }

  // Parse time signature
  const [beatsPerMeasure, beatUnit] = timeSignature.split('/').map(Number);

  // Calculate timing from BPM
  // For compound meters (6/8, 9/8, 12/8), BPM refers to dotted quarter
  const isCompound = beatUnit >= 8 && beatsPerMeasure > 3 && beatsPerMeasure % 3 === 0;
  let msPerBeatUnit;
  if (isCompound) {
    // BPM is dotted quarter = 3 eighth notes
    msPerBeatUnit = (60000 / bpm) / 3; // ms per eighth note
  } else if (beatUnit === 2) {
    // Half note gets the beat
    msPerBeatUnit = 60000 / bpm; // ms per half note
  } else {
    // Quarter note gets the beat
    msPerBeatUnit = 60000 / bpm; // ms per quarter note
  }

  // Build expected note timing
  const expectedNotes = buildExpectedTiming(referenceMelody, msPerBeatUnit);

  // Match detected pitches to expected notes
  const matchResults = matchPitchesToNotes(detectedPitches, expectedNotes);

  // Calculate scores
  const pitchScore = calculatePitchScore(matchResults);
  const rhythmScore = calculateRhythmScore(matchResults);
  const stabilityScore = calculateStabilityScore(detectedPitches, matchResults);

  // Generate diagnostics
  const diagnostics = generateDiagnostics(matchResults, detectedPitches, expectedNotes);

  // Build tempo tracking data for visualization
  const tempoData = buildTempoData(matchResults, bpm);

  // Build pitch tracking data for visualization
  const pitchData = buildPitchData(matchResults);

  return {
    pitchScore: Math.round(pitchScore),
    rhythmScore: Math.round(rhythmScore),
    stabilityScore: Math.round(stabilityScore),
    leadershipScore: Math.round(pitchScore * 0.3 + rhythmScore * 0.4 + stabilityScore * 0.3),
    noteByNote: matchResults,
    diagnostics,
    tempoData,
    pitchData,
    summary: {
      totalNotes: referenceMelody.length,
      matchedNotes: matchResults.filter(r => r.matched).length,
      avgCentsOff: Math.round(matchResults.filter(r => r.matched).reduce((sum, r) => sum + Math.abs(r.centsOff), 0) / Math.max(1, matchResults.filter(r => r.matched).length)),
      avgTimingOff: Math.round(matchResults.filter(r => r.matched).reduce((sum, r) => sum + Math.abs(r.timingOffMs), 0) / Math.max(1, matchResults.filter(r => r.matched).length))
    }
  };
}

/**
 * Build expected timing for each note based on duration and BPM
 */
function buildExpectedTiming(melody, msPerBeatUnit) {
  const notes = [];
  let currentTime = 0;

  for (let i = 0; i < melody.length; i++) {
    const note = melody[i];
    const durationMs = note.dur * msPerBeatUnit;

    notes.push({
      index: i,
      midi: note.midi,
      freq: note.freq || midiToFreq(note.midi),
      expectedStart: currentTime,
      expectedDuration: durationMs,
      measure: note.measure,
      lyric: note.lyric || ''
    });

    currentTime += durationMs;
  }

  return notes;
}

/**
 * Match detected pitches to expected notes
 */
function matchPitchesToNotes(detectedPitches, expectedNotes) {
  const results = [];

  // For each expected note, find the best matching detected pitch
  for (const expected of expectedNotes) {
    const windowStart = expected.expectedStart - 200; // 200ms early tolerance
    const windowEnd = expected.expectedStart + expected.expectedDuration + 200; // 200ms late tolerance

    // Find all detected pitches in the time window
    const candidates = detectedPitches.filter(
      p => p.timestamp >= windowStart && p.timestamp <= windowEnd
    );

    if (candidates.length === 0) {
      results.push({
        expected,
        matched: false,
        centsOff: 0,
        timingOffMs: 0,
        detectedMidi: null
      });
      continue;
    }

    // Find the pitch closest to the expected note
    let bestMatch = null;
    let bestDistance = Infinity;

    for (const candidate of candidates) {
      const midiDistance = Math.abs(candidate.midi - expected.midi);
      if (midiDistance < bestDistance) {
        bestDistance = midiDistance;
        bestMatch = candidate;
      }
    }

    // Consider it a match if within 2 semitones
    const matched = bestDistance < 2;
    const centsOff = matched ? Math.round((bestMatch.midi - expected.midi) * 100) : 0;
    const timingOffMs = matched ? Math.round(bestMatch.timestamp - expected.expectedStart) : 0;

    results.push({
      expected,
      matched,
      centsOff,
      timingOffMs,
      detectedMidi: bestMatch ? bestMatch.midiRounded : null,
      detectedFreq: bestMatch ? bestMatch.frequency : null,
      isSharp: centsOff > 20,
      isFlat: centsOff < -20,
      isEarly: timingOffMs < -100,
      isLate: timingOffMs > 100
    });
  }

  return results;
}

/**
 * Calculate pitch accuracy score (0-100)
 */
function calculatePitchScore(matchResults) {
  if (matchResults.length === 0) return 0;

  const matched = matchResults.filter(r => r.matched);
  if (matched.length === 0) return 0;

  // Score based on:
  // 1. Percentage of notes hit (50% weight)
  // 2. Average cents deviation for hit notes (50% weight)

  const hitRate = matched.length / matchResults.length;

  const avgCentsOff = matched.reduce((sum, r) => sum + Math.abs(r.centsOff), 0) / matched.length;
  // 0 cents = 100%, 50 cents (half semitone) = 50%, 100 cents (full semitone) = 0%
  const intonationScore = Math.max(0, 100 - avgCentsOff);

  return hitRate * 50 + (intonationScore / 100) * 50;
}

/**
 * Calculate rhythm accuracy score (0-100)
 */
function calculateRhythmScore(matchResults) {
  if (matchResults.length === 0) return 0;

  const matched = matchResults.filter(r => r.matched);
  if (matched.length === 0) return 0;

  // Score based on:
  // 1. Percentage of notes hit (40% weight)
  // 2. Average timing deviation for hit notes (60% weight)

  const hitRate = matched.length / matchResults.length;

  const avgTimingOff = matched.reduce((sum, r) => sum + Math.abs(r.timingOffMs), 0) / matched.length;
  // 0ms = 100%, 100ms = 70%, 200ms = 40%, 300ms+ = 0%
  const timingScore = Math.max(0, 100 - avgTimingOff / 3);

  return hitRate * 40 + (timingScore / 100) * 60;
}

/**
 * Calculate stability score (0-100) - measures consistency
 */
function calculateStabilityScore(detectedPitches, matchResults) {
  if (detectedPitches.length < 10) return 70; // Not enough data

  const matched = matchResults.filter(r => r.matched);
  if (matched.length < 3) return 50;

  // Measure pitch stability (variance in cents deviation)
  const centsValues = matched.map(r => r.centsOff);
  const centsVariance = calculateVariance(centsValues);
  // Low variance = stable, high variance = unstable
  const pitchStability = Math.max(0, 100 - centsVariance / 2);

  // Measure tempo stability (variance in timing deviation)
  const timingValues = matched.map(r => r.timingOffMs);
  const timingVariance = calculateVariance(timingValues);
  const tempoStability = Math.max(0, 100 - timingVariance / 50);

  return (pitchStability + tempoStability) / 2;
}

/**
 * Generate diagnostic feedback messages
 */
function generateDiagnostics(matchResults, detectedPitches, expectedNotes) {
  const diagnostics = [];
  const matched = matchResults.filter(r => r.matched);

  if (matchResults.length === 0 || matched.length === 0) {
    diagnostics.push("No pitch data detected. Make sure your microphone is working and sing clearly.");
    return diagnostics;
  }

  const hitRate = matched.length / matchResults.length;

  // Overall accuracy
  if (hitRate < 0.5) {
    diagnostics.push("Many notes were missed or significantly off-pitch. Try singing more slowly and deliberately.");
  } else if (hitRate < 0.8) {
    diagnostics.push("Some notes need work. Focus on the highlighted problem areas.");
  }

  // Pitch tendency
  const sharpCount = matched.filter(r => r.isSharp).length;
  const flatCount = matched.filter(r => r.isFlat).length;
  if (sharpCount > matched.length * 0.4) {
    diagnostics.push("Tendency to sing sharp. Try relaxing and aiming slightly lower.");
  } else if (flatCount > matched.length * 0.4) {
    diagnostics.push("Tendency to sing flat. Support your breath and aim slightly higher.");
  }

  // Timing tendency
  const earlyCount = matched.filter(r => r.isEarly).length;
  const lateCount = matched.filter(r => r.isLate).length;
  if (earlyCount > matched.length * 0.4) {
    diagnostics.push("Rushing the tempo. Listen to the beat and hold back slightly.");
  } else if (lateCount > matched.length * 0.4) {
    diagnostics.push("Dragging behind the beat. Anticipate each note more.");
  }

  // Check for drift in later notes
  const firstHalf = matched.slice(0, Math.floor(matched.length / 2));
  const secondHalf = matched.slice(Math.floor(matched.length / 2));

  if (firstHalf.length > 0 && secondHalf.length > 0) {
    const firstHalfAvgCents = firstHalf.reduce((s, r) => s + r.centsOff, 0) / firstHalf.length;
    const secondHalfAvgCents = secondHalf.reduce((s, r) => s + r.centsOff, 0) / secondHalf.length;

    if (secondHalfAvgCents - firstHalfAvgCents > 15) {
      diagnostics.push("Pitch drifts sharp toward the end. Maintain breath support throughout.");
    } else if (firstHalfAvgCents - secondHalfAvgCents > 15) {
      diagnostics.push("Pitch drifts flat toward the end. Keep energy and support consistent.");
    }

    const firstHalfAvgTiming = firstHalf.reduce((s, r) => s + r.timingOffMs, 0) / firstHalf.length;
    const secondHalfAvgTiming = secondHalf.reduce((s, r) => s + r.timingOffMs, 0) / secondHalf.length;

    if (secondHalfAvgTiming - firstHalfAvgTiming > 50) {
      diagnostics.push("Tempo slows down toward the end. Maintain steady pulse throughout.");
    } else if (firstHalfAvgTiming - secondHalfAvgTiming > 50) {
      diagnostics.push("Tempo speeds up toward the end. Stay steady and controlled.");
    }
  }

  // Positive feedback if doing well
  if (diagnostics.length === 0) {
    if (hitRate > 0.9) {
      diagnostics.push("Excellent accuracy! Pitch and timing are very solid.");
    } else {
      diagnostics.push("Good performance. Keep practicing for even more consistency.");
    }
  }

  return diagnostics;
}

/**
 * Build tempo tracking data for visualization
 */
function buildTempoData(matchResults, targetBpm) {
  const data = [];
  const matched = matchResults.filter(r => r.matched);

  // Group by measure
  const byMeasure = {};
  for (const r of matched) {
    const m = r.expected.measure;
    if (!byMeasure[m]) byMeasure[m] = [];
    byMeasure[m].push(r);
  }

  // Calculate effective BPM per measure based on timing deviations
  for (const [measure, notes] of Object.entries(byMeasure)) {
    if (notes.length < 2) continue;

    // Average timing offset for this measure
    const avgOffset = notes.reduce((s, n) => s + n.timingOffMs, 0) / notes.length;
    // Convert offset to BPM adjustment (rough approximation)
    // If notes are early (negative offset), effective BPM is faster
    const bpmAdjustment = -avgOffset / 50; // ~1 BPM per 50ms offset

    data.push({
      m: parseInt(measure) + 1,
      bpm: Math.round(targetBpm + bpmAdjustment)
    });
  }

  // Sort by measure
  data.sort((a, b) => a.m - b.m);

  return data;
}

/**
 * Build pitch tracking data for visualization
 */
function buildPitchData(matchResults) {
  return matchResults.map((r, i) => ({
    m: i + 1,
    c: r.centsOff,
    sh: r.isSharp,
    fl: r.isFlat
  }));
}

/**
 * Calculate variance of an array
 */
function calculateVariance(arr) {
  if (arr.length === 0) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  return arr.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / arr.length;
}

/**
 * Convert MIDI note to frequency
 */
function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Return empty result structure
 */
function getEmptyResult() {
  return {
    pitchScore: 0,
    rhythmScore: 0,
    stabilityScore: 0,
    leadershipScore: 0,
    noteByNote: [],
    diagnostics: ["No performance data to analyze."],
    tempoData: [],
    pitchData: [],
    summary: {
      totalNotes: 0,
      matchedNotes: 0,
      avgCentsOff: 0,
      avgTimingOff: 0
    }
  };
}

export default gradePerformance;
