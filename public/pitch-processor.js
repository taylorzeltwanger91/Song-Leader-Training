/**
 * AudioWorklet Pitch Processor
 * Runs on dedicated audio thread for low-latency pitch detection
 *
 * Implements:
 * - DC offset removal
 * - High-pass filter (70 Hz) for rumble/HVAC rejection
 * - Gain normalization
 * - YIN pitch detection with parabolic interpolation
 * - RMS energy calculation
 * - Adaptive noise floor measurement
 */

class PitchProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Will be set based on actual sample rate
    this.sampleRate = 44100;
    this.frameSize = 2048;
    this.hopSize = 512;

    // Circular buffer for audio samples
    this.buffer = new Float32Array(this.frameSize);
    this.bufferIndex = 0;
    this.samplesCollected = 0;

    // YIN buffer (half frame size)
    this.yinBuffer = new Float32Array(this.frameSize / 2);

    // YIN threshold - lower = stricter
    this.yinThreshold = 0.12;

    // Frequency range (C2 to C#6)
    this.minFreq = 65;
    this.maxFreq = 1100;

    // High-pass filter state (Butterworth 2nd order at 70 Hz)
    this.hpf = {
      x1: 0, x2: 0,  // Input history
      y1: 0, y2: 0   // Output history
    };

    // DC offset removal (running mean)
    this.dcOffset = 0;
    this.dcAlpha = 0.995;  // Slow adaptation

    // Gain normalization
    this.gainFactor = 1.0;
    this.peakTracker = 0;
    this.peakDecay = 0.9995;
    this.calibrationFrames = 0;
    this.isCalibrated = false;

    // Noise floor measurement (first second of audio)
    this.noiseFloorSamples = [];
    this.noiseFloor = -60;  // dB, will be measured
    this.noiseMeasurementComplete = false;

    // RMS gate state for hysteresis
    this.gateOpen = false;
    this.framesAboveThreshold = 0;
    this.framesBelowThreshold = 0;

    // Thresholds (will be set after noise measurement)
    this.silenceThreshold = -50;  // dB
    this.voiceThreshold = -40;    // dB

    // Handle messages from main thread
    this.port.onmessage = (event) => {
      if (event.data.type === 'setSampleRate') {
        this.sampleRate = event.data.sampleRate;
        this.updateFilterCoefficients();
      } else if (event.data.type === 'setThreshold') {
        this.yinThreshold = event.data.threshold;
      } else if (event.data.type === 'setFrequencyRange') {
        this.minFreq = event.data.min;
        this.maxFreq = event.data.max;
      }
    };
  }

  /**
   * Update high-pass filter coefficients based on sample rate
   * Butterworth 2nd order at 70 Hz
   */
  updateFilterCoefficients() {
    const fc = 70;  // Cutoff frequency
    const w0 = 2 * Math.PI * fc / this.sampleRate;
    const cosW0 = Math.cos(w0);
    const sinW0 = Math.sin(w0);
    const alpha = sinW0 / (2 * Math.sqrt(2));  // Q = sqrt(2)/2 for Butterworth

    const b0 = (1 + cosW0) / 2;
    const b1 = -(1 + cosW0);
    const b2 = (1 + cosW0) / 2;
    const a0 = 1 + alpha;
    const a1 = -2 * cosW0;
    const a2 = 1 - alpha;

    // Normalize coefficients
    this.hpfCoeffs = {
      b0: b0 / a0,
      b1: b1 / a0,
      b2: b2 / a0,
      a1: a1 / a0,
      a2: a2 / a0
    };
  }

  /**
   * Apply 2nd order high-pass filter
   */
  applyHighPass(sample) {
    if (!this.hpfCoeffs) {
      this.updateFilterCoefficients();
    }

    const { b0, b1, b2, a1, a2 } = this.hpfCoeffs;

    const output = b0 * sample + b1 * this.hpf.x1 + b2 * this.hpf.x2
                   - a1 * this.hpf.y1 - a2 * this.hpf.y2;

    // Update state
    this.hpf.x2 = this.hpf.x1;
    this.hpf.x1 = sample;
    this.hpf.y2 = this.hpf.y1;
    this.hpf.y1 = output;

    return output;
  }

  /**
   * Process audio data
   */
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const samples = input[0];

    for (let i = 0; i < samples.length; i++) {
      let sample = samples[i];

      // DC offset removal
      this.dcOffset = this.dcAlpha * this.dcOffset + (1 - this.dcAlpha) * sample;
      sample -= this.dcOffset;

      // High-pass filter (70 Hz)
      sample = this.applyHighPass(sample);

      // Track peak for gain normalization
      const absSample = Math.abs(sample);
      if (absSample > this.peakTracker) {
        this.peakTracker = absSample;
      } else {
        this.peakTracker *= this.peakDecay;
      }

      // Calibrate gain during first ~500ms
      if (!this.isCalibrated) {
        this.calibrationFrames++;
        if (this.calibrationFrames > this.sampleRate * 0.5) {
          if (this.peakTracker > 0.001) {
            this.gainFactor = 0.8 / this.peakTracker;
            this.gainFactor = Math.min(100, Math.max(1, this.gainFactor));
          }
          this.isCalibrated = true;
        }
      }

      // Apply gain normalization
      sample *= this.gainFactor;

      // Clamp to prevent overflow
      sample = Math.max(-1, Math.min(1, sample));

      // Store in circular buffer
      this.buffer[this.bufferIndex] = sample;
      this.bufferIndex = (this.bufferIndex + 1) % this.frameSize;
      this.samplesCollected++;
    }

    // Process every hopSize samples
    if (this.samplesCollected >= this.hopSize) {
      this.samplesCollected = 0;
      this.analyzeFrame();
    }

    return true;
  }

  /**
   * Analyze current audio frame
   */
  analyzeFrame() {
    // Reconstruct linear buffer from circular buffer
    const frame = new Float32Array(this.frameSize);
    for (let i = 0; i < this.frameSize; i++) {
      frame[i] = this.buffer[(this.bufferIndex + i) % this.frameSize];
    }

    // Calculate RMS energy
    let sumSquares = 0;
    for (let i = 0; i < this.frameSize; i++) {
      sumSquares += frame[i] * frame[i];
    }
    const rms = Math.sqrt(sumSquares / this.frameSize);
    const rmsDb = 20 * Math.log10(Math.max(rms, 1e-10));

    // Measure noise floor during first second
    if (!this.noiseMeasurementComplete) {
      this.noiseFloorSamples.push(rmsDb);
      if (this.noiseFloorSamples.length >= 86) {  // ~1 second at 86 fps
        // Use the 20th percentile as noise floor (ignore complete silence)
        const sorted = [...this.noiseFloorSamples].sort((a, b) => a - b);
        const idx = Math.floor(sorted.length * 0.2);
        this.noiseFloor = sorted[idx];

        // Set thresholds relative to noise floor
        this.silenceThreshold = this.noiseFloor + 6;
        this.voiceThreshold = this.noiseFloor + 12;

        this.noiseMeasurementComplete = true;

        // Notify main thread of calibration
        this.port.postMessage({
          type: 'calibration',
          noiseFloor: this.noiseFloor,
          silenceThreshold: this.silenceThreshold,
          voiceThreshold: this.voiceThreshold
        });
      }
    }

    // Gate hysteresis
    if (rmsDb > this.voiceThreshold) {
      this.framesAboveThreshold++;
      this.framesBelowThreshold = 0;
      if (this.framesAboveThreshold >= 3) {
        this.gateOpen = true;
      }
    } else if (rmsDb < this.silenceThreshold) {
      this.framesBelowThreshold++;
      this.framesAboveThreshold = 0;
      if (this.framesBelowThreshold >= 5) {
        this.gateOpen = false;
      }
    }

    // Only run pitch detection if gate is open
    let f0 = -1;
    let confidence = 0;

    if (this.gateOpen) {
      const result = this.yinDetect(frame);
      f0 = result.frequency;
      confidence = result.confidence;
    }

    // Send results to main thread
    this.port.postMessage({
      type: 'pitch',
      frequency: f0,
      confidence: confidence,
      rms: rms,
      rmsDb: rmsDb,
      gateOpen: this.gateOpen,
      timestamp: currentTime
    });
  }

  /**
   * YIN pitch detection algorithm
   */
  yinDetect(buffer) {
    const halfSize = Math.floor(buffer.length / 2);

    // Step 1 & 2: Difference function
    for (let tau = 0; tau < halfSize; tau++) {
      this.yinBuffer[tau] = 0;
      for (let i = 0; i < halfSize; i++) {
        const delta = buffer[i] - buffer[i + tau];
        this.yinBuffer[tau] += delta * delta;
      }
    }

    // Step 3: Cumulative mean normalized difference
    this.yinBuffer[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau < halfSize; tau++) {
      runningSum += this.yinBuffer[tau];
      this.yinBuffer[tau] *= tau / runningSum;
    }

    // Step 4: Absolute threshold
    // Calculate tau limits from frequency range
    const minTau = Math.floor(this.sampleRate / this.maxFreq);
    const maxTau = Math.floor(this.sampleRate / this.minFreq);

    let tau = Math.max(2, minTau);
    let foundTau = -1;

    while (tau < Math.min(halfSize, maxTau)) {
      if (this.yinBuffer[tau] < this.yinThreshold) {
        // Find local minimum
        while (tau + 1 < halfSize && this.yinBuffer[tau + 1] < this.yinBuffer[tau]) {
          tau++;
        }
        foundTau = tau;
        break;
      }
      tau++;
    }

    if (foundTau === -1) {
      return { frequency: -1, confidence: 0 };
    }

    // Step 5: Parabolic interpolation for sub-sample accuracy
    let betterTau = foundTau;
    if (foundTau > 0 && foundTau < halfSize - 1) {
      const s0 = this.yinBuffer[foundTau - 1];
      const s1 = this.yinBuffer[foundTau];
      const s2 = this.yinBuffer[foundTau + 1];

      const denominator = 2 * s1 - s0 - s2;
      if (denominator !== 0) {
        const adjustment = (s2 - s0) / (2 * denominator);
        if (Math.abs(adjustment) < 1) {
          betterTau = foundTau + adjustment;
        }
      }
    }

    const frequency = this.sampleRate / betterTau;

    // Confidence is inverse of YIN value
    const confidence = 1 - this.yinBuffer[foundTau];

    // Final frequency range check
    if (frequency < this.minFreq || frequency > this.maxFreq) {
      return { frequency: -1, confidence: 0 };
    }

    return { frequency, confidence };
  }
}

registerProcessor('pitch-processor', PitchProcessor);
