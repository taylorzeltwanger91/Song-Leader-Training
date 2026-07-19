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
  const expectedNotes = buildExpectedTiming(referenceMelody, msPerBeatUnit, beatsPerMeasure);

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
 * Signed distance from an expected note to a detected one, ignoring octave.
 *
 * Folded into [-6, +6] so C-to-B reads as -1, not +11. Octave displacement is
 * not an error here: a bass singing the soprano line an octave down is the norm
 * in congregational singing. Ignoring the octave also makes the pitch detector's
 * worst failure mode — octave-doubling errors — disappear as a class, which is
 * why UltraStar does the same thing (see docs/research/grading-methodology.md).
 *
 * @returns {number} semitones off the expected pitch class, in [-6, 6]
 */
function pitchClassDistance(detectedMidi, expectedMidi) {
  const raw = detectedMidi - expectedMidi;
  let pc = ((raw % 12) + 12) % 12;
  if (pc > 6) pc -= 12;
  return pc;
}

/**
 * Build expected timing for each note.
 *
 * Prefers the authored absolute onset (`measure` + `beat`) when the melody
 * carries one. Falls back to cumulatively summing durations otherwise.
 *
 * The fallback is only correct when every bar sums exactly to the meter — and
 * real transcriptions don't (237.json has bars of 5, 2, 4 and 1 beats in 3/2).
 * Under cumulative summing a single malformed bar shifts every later note, so a
 * singer hitting the printed beat is graded as missing it. The `beat` field is
 * the fix and it was already in the data, unused.
 */
function buildExpectedTiming(melody, msPerBeatUnit, beatsPerMeasure) {
  const notes = [];

  // Timing source of truth, in priority order:
  //  1. an explicit `onset` (absolute beats from the start) — the only representation
  //     that survives an anacrusis (pickup bar), since measure*beats+beat assumes every
  //     bar is full and a pickup makes bar 0 shorter than the meter.
  //  2. measure*beats+beat, when every note carries beat+measure and there's no pickup.
  //  3. cumulative duration sum, as a last resort.
  const hasOnsets = melody.every(n => Number.isFinite(n.onset));
  const hasMeasureBeat = !hasOnsets && melody.every(
    n => Number.isFinite(n.beat) && Number.isFinite(n.measure)
  );

  let cumulativeTime = 0;

  for (let i = 0; i < melody.length; i++) {
    const note = melody[i];
    const durationMs = note.dur * msPerBeatUnit;

    const expectedStart = hasOnsets
      ? note.onset * msPerBeatUnit
      : hasMeasureBeat
      ? (note.measure * beatsPerMeasure + note.beat) * msPerBeatUnit
      : cumulativeTime;

    notes.push({
      index: i,
      midi: note.midi,
      freq: note.freq || midiToFreq(note.midi),
      expectedStart,
      expectedDuration: durationMs,
      measure: note.measure,
      lyric: note.lyric || ''
    });

    cumulativeTime += durationMs;
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
    const windowStart = expected.expectedStart - 150; // 150ms early tolerance (tightened)
    const windowEnd = expected.expectedStart + expected.expectedDuration + 150; // 150ms late tolerance

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

    // Find the pitch closest to the expected note, ignoring octave
    let bestMatch = null;
    let bestDistance = Infinity;
    let bestSignedDistance = 0;

    for (const candidate of candidates) {
      const signed = pitchClassDistance(candidate.midi, expected.midi);
      const midiDistance = Math.abs(signed);
      if (midiDistance < bestDistance) {
        bestDistance = midiDistance;
        bestSignedDistance = signed;
        bestMatch = candidate;
      }
    }

    // Consider it a match if within 1 semitone of the expected pitch class
    const matched = bestDistance < 1;
    const centsOff = matched ? Math.round(bestSignedDistance * 100) : 0;
    const timingOffMs = matched ? Math.round(bestMatch.timestamp - expected.expectedStart) : 0;

    results.push({
      expected,
      matched,
      centsOff,
      timingOffMs,
      detectedMidi: bestMatch ? bestMatch.midiRounded : null,
      detectedFreq: bestMatch ? bestMatch.frequency : null,
      confidence: bestMatch ? bestMatch.confidence : 0,
      isSharp: centsOff > 15,    // tightened from 20
      isFlat: centsOff < -15,    // tightened from 20
      isEarly: timingOffMs < -80, // tightened from -100
      isLate: timingOffMs > 80    // tightened from 100
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
  //
  // Detector confidence is deliberately NOT a term here. It used to carry 20% of
  // this score, which meant a quiet room or a cheap microphone cost the singer
  // "pitch" points for a reason that isn't pitch. Confidence is a property of the
  // signal chain, not of the performance.

  const hitRate = matched.length / matchResults.length;

  const avgCentsOff = matched.reduce((sum, r) => sum + Math.abs(r.centsOff), 0) / matched.length;
  // 0 cents = 100%, 25 cents = 75%, 50 cents = 50%, 100 cents = 0%
  const intonationScore = Math.max(0, 100 - avgCentsOff * 1.2);

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
  // 1. Percentage of notes hit (35% weight)
  // 2. Average timing deviation (45% weight) — proportional, not absolute
  // 3. Timing consistency / low variance (20% weight)

  const hitRate = matched.length / matchResults.length;

  const avgTimingOff = matched.reduce((sum, r) => sum + Math.abs(r.timingOffMs), 0) / matched.length;
  // 0ms = 100%, 80ms = 60%, 150ms = 25%, 250ms+ = 0%
  const timingScore = Math.max(0, 100 - avgTimingOff * 0.5);

  // Timing consistency: penalize high variance (inconsistent rhythm)
  const timingValues = matched.map(r => r.timingOffMs);
  const timingVariance = calculateVariance(timingValues);
  const consistencyScore = Math.max(0, 100 - timingVariance / 30);

  return hitRate * 35 + (timingScore / 100) * 45 + (consistencyScore / 100) * 20;
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
