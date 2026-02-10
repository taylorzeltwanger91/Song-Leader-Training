/**
 * Audio Recorder Module
 * Handles microphone access and real-time audio capture for pitch detection
 */

export class AudioRecorder {
  constructor(options = {}) {
    this.sampleRate = options.sampleRate || 44100;
    this.bufferSize = options.bufferSize || 2048;
    this.onPitchDetected = options.onPitchDetected || (() => {});
    this.onError = options.onError || console.error;
    this.smoothingFactor = options.smoothingFactor || 0.85; // Higher = smoother (0-1)

    this.audioContext = null;
    this.analyser = null;
    this.mediaStream = null;
    this.sourceNode = null;
    this.processorNode = null;
    this.isRecording = false;
    this.pitchHistory = [];
    this.startTime = null;

    // Smoothing state
    this._smoothedMidi = null;
    this._smoothedFreq = null;
    this._stableNoteCount = 0;
    this._lastNoteName = null;
  }

  /**
   * Request microphone permission and initialize audio context
   */
  async init() {
    try {
      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: this.sampleRate
        }
      });

      // Create audio context
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: this.sampleRate
      });

      // Create source from microphone
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Create analyser for frequency data
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = this.bufferSize * 2;
      this.analyser.smoothingTimeConstant = 0;

      // Connect source to analyser
      this.sourceNode.connect(this.analyser);

      return true;
    } catch (error) {
      this.onError(error);
      return false;
    }
  }

  /**
   * Start recording and pitch detection
   */
  start() {
    if (!this.audioContext || !this.analyser) {
      this.onError(new Error('AudioRecorder not initialized. Call init() first.'));
      return;
    }

    this.isRecording = true;
    this.pitchHistory = [];
    this.startTime = performance.now();

    // Reset smoothing state
    this._smoothedMidi = null;
    this._smoothedFreq = null;
    this._stableNoteCount = 0;
    this._lastNoteName = null;

    // Resume audio context if suspended
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    // Start pitch detection loop
    this._detectPitch();
  }

  /**
   * Stop recording
   */
  stop() {
    this.isRecording = false;
    return this.pitchHistory;
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.isRecording = false;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
  }

  /**
   * Get current audio level (0-1)
   */
  getLevel() {
    if (!this.analyser) return 0;

    const buffer = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buffer);

    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i] * buffer[i];
    }
    return Math.sqrt(sum / buffer.length);
  }

  /**
   * Internal pitch detection loop
   */
  _detectPitch() {
    if (!this.isRecording) return;

    const buffer = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buffer);

    // Calculate RMS level for silence detection
    let rms = 0;
    for (let i = 0; i < buffer.length; i++) {
      rms += buffer[i] * buffer[i];
    }
    rms = Math.sqrt(rms / buffer.length);

    const timestamp = performance.now() - this.startTime;

    // Only detect pitch if signal is above noise threshold
    if (rms > 0.01) {
      const frequency = this._autocorrelate(buffer, this.audioContext.sampleRate);

      if (frequency > 0) {
        const midi = this._freqToMidi(frequency);

        // Apply exponential smoothing
        if (this._smoothedMidi === null) {
          this._smoothedMidi = midi;
          this._smoothedFreq = frequency;
        } else {
          // Only smooth if the new pitch is within 2 semitones of current
          // Otherwise, jump to the new pitch (user changed notes)
          const midiDiff = Math.abs(midi - this._smoothedMidi);
          if (midiDiff < 2) {
            this._smoothedMidi = this.smoothingFactor * this._smoothedMidi + (1 - this.smoothingFactor) * midi;
            this._smoothedFreq = this.smoothingFactor * this._smoothedFreq + (1 - this.smoothingFactor) * frequency;
          } else {
            // Big jump - reset smoothing
            this._smoothedMidi = midi;
            this._smoothedFreq = frequency;
          }
        }

        const smoothedNoteName = this._midiToNoteName(this._smoothedMidi);
        const smoothedCents = Math.round((this._smoothedMidi - Math.round(this._smoothedMidi)) * 100);

        // Track note stability (how long on same note)
        if (smoothedNoteName === this._lastNoteName) {
          this._stableNoteCount++;
        } else {
          this._stableNoteCount = 1;
          this._lastNoteName = smoothedNoteName;
        }

        const pitchData = {
          timestamp,
          frequency: this._smoothedFreq,
          midi: this._smoothedMidi,
          midiRounded: Math.round(this._smoothedMidi),
          noteName: smoothedNoteName,
          cents: smoothedCents,
          level: rms,
          stable: this._stableNoteCount > 5, // Considered stable after ~150ms
          // Also include raw values for recording
          rawFrequency: frequency,
          rawMidi: midi
        };

        this.pitchHistory.push(pitchData);
        this.onPitchDetected(pitchData);
      }
    } else {
      // Signal too quiet - gradually fade smoothing
      if (this._smoothedMidi !== null) {
        this._stableNoteCount = 0;
      }
    }

    // Continue detection loop (~30 Hz)
    requestAnimationFrame(() => this._detectPitch());
  }

  /**
   * Autocorrelation pitch detection (YIN-inspired)
   * Returns detected frequency in Hz, or -1 if no pitch found
   */
  _autocorrelate(buffer, sampleRate) {
    const SIZE = buffer.length;
    const MAX_SAMPLES = Math.floor(SIZE / 2);
    const correlations = new Float32Array(MAX_SAMPLES);

    // Calculate difference function
    let foundGoodCorrelation = false;
    let bestOffset = -1;
    let bestCorrelation = 0;

    for (let offset = 0; offset < MAX_SAMPLES; offset++) {
      let correlation = 0;
      let totalSamples = 0;

      for (let i = 0; i < MAX_SAMPLES; i++) {
        correlation += Math.abs(buffer[i] - buffer[i + offset]);
        totalSamples++;
      }

      correlation = 1 - (correlation / totalSamples);
      correlations[offset] = correlation;

      // Look for the first peak after initial dip
      if (correlation > 0.9 && offset > 10) {
        foundGoodCorrelation = true;
        if (correlation > bestCorrelation) {
          bestCorrelation = correlation;
          bestOffset = offset;
        }
      } else if (foundGoodCorrelation && correlation < bestCorrelation - 0.1) {
        // We've passed the peak
        break;
      }
    }

    if (bestOffset === -1 || bestCorrelation < 0.8) {
      return -1;
    }

    // Parabolic interpolation for sub-sample accuracy
    let shift = 0;
    if (bestOffset > 0 && bestOffset < MAX_SAMPLES - 1) {
      const y0 = correlations[bestOffset - 1];
      const y1 = correlations[bestOffset];
      const y2 = correlations[bestOffset + 1];
      shift = (y2 - y0) / (2 * (2 * y1 - y0 - y2));
      if (isNaN(shift)) shift = 0;
    }

    const period = bestOffset + shift;
    const frequency = sampleRate / period;

    // Sanity check: human voice range is ~80-1000 Hz
    if (frequency < 60 || frequency > 1200) {
      return -1;
    }

    return frequency;
  }

  /**
   * Convert frequency to MIDI note number (with fractional part for cents)
   */
  _freqToMidi(freq) {
    return 12 * Math.log2(freq / 440) + 69;
  }

  /**
   * Convert MIDI note number to note name
   */
  _midiToNoteName(midi) {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const rounded = Math.round(midi);
    const noteName = noteNames[rounded % 12];
    const octave = Math.floor(rounded / 12) - 1;
    return `${noteName}${octave}`;
  }
}

export default AudioRecorder;
