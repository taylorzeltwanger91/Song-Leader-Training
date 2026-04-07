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
 * Compute the pitch-class distance between a detected MIDI and expected MIDI,
 * tolerating octave displacement.
 *
 * Returns:
 *   - pitchClassDistance: signed semitone distance in [-6, 6] after pitch-class
 *     folding. This is how far the detected pitch is from the expected pitch
 *     class modulo the octave.
 *   - octaveShift: number of octaves the detected pitch is shifted from the
 *     expected (positive = sung higher, negative = sung lower). Zero when the
 *     singer is in the reference octave.
 *
 * The goal: a singer who sings the melody one octave down still gets matched
 * note-for-note, with `pitchClassDistance` reflecting actual intonation error
 * (not 1200 cents of octave displacement).
 */
function computePitchClassDistance(detectedMidi, expectedMidi) {
  const raw = detectedMidi - expectedMidi;
  // Fold into [-6, 6] so C-to-B distance is -1 not +11
  let pc = ((raw % 12) + 12) % 12;
  if (pc > 6) pc -= 12;
  // Octave shift: how many whole octaves separate the raw diff from the folded diff
  const octaveShift = Math.round((raw - pc) / 12);
  return { pitchClassDistance: pc, octaveShift };
}

/**
 * Match detected pitches to expected notes
 *
 * Matching is octave-tolerant: the best candidate is the one whose pitch
 * class is closest to the expected pitch class, regardless of which octave
 * the singer is actually in. This lets a low singer transpose an exercise
 * down one octave without every note being marked as missed.
 *
 * Centrally, `centsOff` reports the intonation error relative to the nearest
 * pitch-class-equivalent reference, so it stays in [-600, 600] cents and
 * reflects actual tuning rather than octave displacement.
 *
 * `octaveShift` is surfaced on each result so the UI and diagnostics can
 * report "sung an octave down" without having to reverse-engineer it from
 * raw MIDI values.
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
        octaveShift: 0,
        detectedMidi: null
      });
      continue;
    }

    // Find the pitch whose pitch class is closest to the expected pitch class
    let bestMatch = null;
    let bestDistance = Infinity;
    let bestOctaveShift = 0;

    for (const candidate of candidates) {
      const { pitchClassDistance, octaveShift } = computePitchClassDistance(
        candidate.midi,
        expected.midi
      );
      const absDistance = Math.abs(pitchClassDistance);
      if (absDistance < bestDistance) {
        bestDistance = absDistance;
        bestMatch = candidate;
        bestOctaveShift = octaveShift;
      }
    }

    // Consider it a match if within 1 semitone of the expected pitch class.
    // Octave displacement alone does NOT count as a miss.
    const matched = bestDistance < 1;
    // Re-compute the pitch-class-aware centsOff so intonation reflects tuning,
    // not octave displacement
    const { pitchClassDistance: finalPcDist } = matched
      ? computePitchClassDistance(bestMatch.midi, expected.midi)
      : { pitchClassDistance: 0 };
    const centsOff = matched ? Math.round(finalPcDist * 100) : 0;
    const timingOffMs = matched ? Math.round(bestMatch.timestamp - expected.expectedStart) : 0;

    results.push({
      expected,
      matched,
      centsOff,
      timingOffMs,
      octaveShift: matched ? bestOctaveShift : 0,
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
  // 1. Percentage of notes hit (40% weight)
  // 2. Average cents deviation for hit notes (40% weight)
  // 3. Confidence-weighted accuracy (20% weight)

  const hitRate = matched.length / matchResults.length;

  const avgCentsOff = matched.reduce((sum, r) => sum + Math.abs(r.centsOff), 0) / matched.length;
  // 0 cents = 100%, 25 cents = 75%, 50 cents = 50%, 100 cents = 0%
  const intonationScore = Math.max(0, 100 - avgCentsOff * 1.2);

  // Confidence-weighted: reward high-confidence matches
  const avgConfidence = matched.reduce((sum, r) => sum + (r.confidence || 0.5), 0) / matched.length;
  const confidenceScore = avgConfidence * 100;

  return hitRate * 40 + (intonationScore / 100) * 40 + (confidenceScore / 100) * 20;
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

  // Octave displacement — is the singer consistently an octave off from the reference?
  const shiftCounts = matched.reduce((acc, r) => {
    const s = r.octaveShift || 0;
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});
  const dominantShift = Object.entries(shiftCounts)
    .sort((a, b) => b[1] - a[1])[0];
  if (dominantShift && Number(dominantShift[0]) !== 0 && dominantShift[1] > matched.length * 0.6) {
    const shift = Number(dominantShift[0]);
    const word = shift > 0 ? "up" : "down";
    const n = Math.abs(shift);
    const octaves = n === 1 ? "one octave" : `${n} octaves`;
    diagnostics.push(`Singing ${octaves} ${word} from the reference. Intonation is scored against the correct pitch class, but try picking an octave that matches your voice for easier reading.`);
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
