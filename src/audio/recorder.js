/**
 * Audio Recorder Module
 * Handles microphone access and real-time audio capture for pitch detection
 * Uses YIN algorithm with low-pass filtering and moving average smoothing
 */

export class AudioRecorder {
  constructor(options = {}) {
    this.sampleRate = options.sampleRate || 44100;
    this.bufferSize = options.bufferSize || 4096;
    this.onPitchDetected = options.onPitchDetected || (() => {});
    this.onError = options.onError || console.error;

    // Smoothing settings
    this.movingAverageSize = options.movingAverageSize || 5; // Number of frames to average
    this.noiseThreshold = options.noiseThreshold || 0.005;
    this.yinThreshold = options.yinThreshold || 0.15; // YIN confidence threshold (lower = stricter)

    this.audioContext = null;
    this.analyser = null;
    this.mediaStream = null;
    this.sourceNode = null;
    this.isRecording = false;
    this.pitchHistory = [];
    this.startTime = null;

    // Moving average buffer for pitch smoothing
    this._pitchBuffer = [];
    this._lastReportedNote = null;
    this._noteHoldCount = 0;

    // Low-pass filter coefficients (simple IIR filter)
    this._lpfPrevInput = 0;
    this._lpfPrevOutput = 0;
  }

  /**
   * Request microphone permission and initialize audio context
   */
  async init() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone access not supported in this browser');
      }

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error('Web Audio API not supported in this browser');
      }
      this.audioContext = new AudioContextClass();

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.sampleRate = this.audioContext.sampleRate;
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = this.bufferSize * 2;
      this.analyser.smoothingTimeConstant = 0;

      this.sourceNode.connect(this.analyser);

      return true;
    } catch (error) {
      let message = error.message || 'Microphone error';
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        message = 'Microphone permission denied. Please allow microphone access in your browser settings.';
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        message = 'No microphone found. Please connect a microphone and try again.';
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        message = 'Microphone is in use by another app. Please close other apps using the mic.';
      } else if (error.name === 'SecurityError') {
        message = 'Microphone access requires HTTPS. Please use a secure connection.';
      }
      this.onError(new Error(message));
      return false;
    }
  }

  /**
   * Start recording and pitch detection
   */
  async start() {
    if (!this.audioContext || !this.analyser) {
      this.onError(new Error('AudioRecorder not initialized. Call init() first.'));
      return;
    }

    this.isRecording = true;
    this.pitchHistory = [];
    this.startTime = performance.now();

    // Reset smoothing state
    this._pitchBuffer = [];
    this._lastReportedNote = null;
    this._noteHoldCount = 0;
    this._lpfPrevInput = 0;
    this._lpfPrevOutput = 0;

    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch (e) {
        console.warn('Could not resume audio context:', e);
      }
    }

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
   * Apply simple low-pass filter to reduce high-frequency noise
   */
  _applyLowPassFilter(buffer) {
    const filtered = new Float32Array(buffer.length);
    // Cutoff around 1000Hz for voice fundamentals
    const RC = 1.0 / (2.0 * Math.PI * 1000);
    const dt = 1.0 / this.sampleRate;
    const alpha = dt / (RC + dt);

    let prevOutput = this._lpfPrevOutput;

    for (let i = 0; i < buffer.length; i++) {
      prevOutput = prevOutput + alpha * (buffer[i] - prevOutput);
      filtered[i] = prevOutput;
    }

    this._lpfPrevOutput = prevOutput;
    return filtered;
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

    if (rms > this.noiseThreshold) {
      // Apply low-pass filter to reduce noise
      const filteredBuffer = this._applyLowPassFilter(buffer);

      // Use YIN algorithm for pitch detection
      const result = this._yinPitchDetection(filteredBuffer, this.sampleRate);

      if (result.frequency > 0 && result.probability > 0.7) {
        const midi = this._freqToMidi(result.frequency);

        // Add to moving average buffer
        this._pitchBuffer.push({ midi, freq: result.frequency, prob: result.probability });
        if (this._pitchBuffer.length > this.movingAverageSize) {
          this._pitchBuffer.shift();
        }

        // Only report if we have enough samples
        if (this._pitchBuffer.length >= 3) {
          // Calculate weighted moving average (weight by probability)
          let totalWeight = 0;
          let weightedMidi = 0;
          let weightedFreq = 0;

          for (const p of this._pitchBuffer) {
            const weight = p.prob;
            weightedMidi += p.midi * weight;
            weightedFreq += p.freq * weight;
            totalWeight += weight;
          }

          const avgMidi = weightedMidi / totalWeight;
          const avgFreq = weightedFreq / totalWeight;

          // Apply median filter to remove outliers - get median of recent values
          const sortedMidi = [...this._pitchBuffer].map(p => p.midi).sort((a, b) => a - b);
          const medianMidi = sortedMidi[Math.floor(sortedMidi.length / 2)];

          // Use median if average deviates too much (outlier protection)
          const finalMidi = Math.abs(avgMidi - medianMidi) > 1 ? medianMidi : avgMidi;
          const finalFreq = 440 * Math.pow(2, (finalMidi - 69) / 12);

          const noteName = this._midiToNoteName(finalMidi);
          const cents = Math.round((finalMidi - Math.round(finalMidi)) * 100);

          // Track note stability
          if (noteName === this._lastReportedNote) {
            this._noteHoldCount++;
          } else {
            this._noteHoldCount = 1;
            this._lastReportedNote = noteName;
          }

          const pitchData = {
            timestamp,
            frequency: finalFreq,
            midi: finalMidi,
            midiRounded: Math.round(finalMidi),
            noteName,
            cents,
            level: rms,
            confidence: result.probability,
            stable: this._noteHoldCount > 6,
            rawFrequency: result.frequency,
            rawMidi: midi
          };

          this.pitchHistory.push(pitchData);
          this.onPitchDetected(pitchData);
        }
      }
    } else {
      // Signal too quiet - clear buffer gradually
      if (this._pitchBuffer.length > 0) {
        this._pitchBuffer.shift();
      }
      this._noteHoldCount = 0;
    }

    // Continue detection loop (~30 Hz)
    requestAnimationFrame(() => this._detectPitch());
  }

  /**
   * YIN pitch detection algorithm
   * Based on "YIN, a fundamental frequency estimator for speech and music"
   * de Cheveigné & Kawahara, 2002
   */
  _yinPitchDetection(buffer, sampleRate) {
    const bufferSize = buffer.length;
    const halfBuffer = Math.floor(bufferSize / 2);

    // Step 1 & 2: Compute the difference function
    const yinBuffer = new Float32Array(halfBuffer);

    for (let tau = 0; tau < halfBuffer; tau++) {
      yinBuffer[tau] = 0;
      for (let i = 0; i < halfBuffer; i++) {
        const delta = buffer[i] - buffer[i + tau];
        yinBuffer[tau] += delta * delta;
      }
    }

    // Step 3: Cumulative mean normalized difference function
    yinBuffer[0] = 1;
    let runningSum = 0;

    for (let tau = 1; tau < halfBuffer; tau++) {
      runningSum += yinBuffer[tau];
      yinBuffer[tau] *= tau / runningSum;
    }

    // Step 4: Absolute threshold
    // Find the first tau where the CMNDF is below threshold
    let tau = 2;
    const minTau = Math.floor(sampleRate / 1000); // ~1000 Hz max
    const maxTau = Math.floor(sampleRate / 60);   // ~60 Hz min

    // Start from minimum tau (highest frequency we care about)
    tau = Math.max(tau, minTau);

    while (tau < Math.min(halfBuffer, maxTau)) {
      if (yinBuffer[tau] < this.yinThreshold) {
        // Found a candidate - now find the local minimum
        while (tau + 1 < halfBuffer && yinBuffer[tau + 1] < yinBuffer[tau]) {
          tau++;
        }
        break;
      }
      tau++;
    }

    // No pitch found
    if (tau >= Math.min(halfBuffer, maxTau) || yinBuffer[tau] >= this.yinThreshold) {
      return { frequency: -1, probability: 0 };
    }

    // Step 5: Parabolic interpolation for better accuracy
    let betterTau = tau;
    if (tau > 0 && tau < halfBuffer - 1) {
      const s0 = yinBuffer[tau - 1];
      const s1 = yinBuffer[tau];
      const s2 = yinBuffer[tau + 1];

      const adjustment = (s2 - s0) / (2 * (2 * s1 - s0 - s2));
      if (Math.abs(adjustment) < 1) {
        betterTau = tau + adjustment;
      }
    }

    const frequency = sampleRate / betterTau;

    // Probability is inverse of the YIN value (lower YIN = higher confidence)
    const probability = 1 - yinBuffer[tau];

    // Sanity check frequency range
    if (frequency < 60 || frequency > 1000) {
      return { frequency: -1, probability: 0 };
    }

    return { frequency, probability };
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
    const noteName = noteNames[((rounded % 12) + 12) % 12];
    const octave = Math.floor(rounded / 12) - 1;
    return `${noteName}${octave}`;
  }
}

export default AudioRecorder;
