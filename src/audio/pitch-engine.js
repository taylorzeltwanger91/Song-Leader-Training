/**
 * PitchEngine - Production-grade pitch detection system
 *
 * Architecture:
 * - AudioWorklet (audio thread): Raw pitch detection via YIN
 * - Main thread: Smoothing pipeline (outlier rejection, median filter, EMA, onset detection)
 *
 * Falls back to ScriptProcessorNode for browsers without AudioWorklet support.
 */

export class PitchEngine {
  constructor(options = {}) {
    // Configuration
    this.onPitch = options.onPitch || (() => {});
    this.onError = options.onError || console.error;
    this.onCalibration = options.onCalibration || (() => {});

    // Sensitivity mode affects smoothing
    this.sensitivityMode = options.sensitivityMode || 'standard'; // 'beginner', 'standard', 'advanced'

    // Vocal range affects frequency limits
    this.vocalRange = options.vocalRange || 'auto'; // 'bass', 'tenor', 'alto', 'soprano', 'auto'

    // Reference pitch (A4)
    this.referencePitch = options.referencePitch || 440;

    // Audio state
    this.audioContext = null;
    this.mediaStream = null;
    this.sourceNode = null;
    this.workletNode = null;
    this.processorNode = null; // Fallback
    this.isRunning = false;
    this.useWorklet = true;

    // Smoothing state
    this._smoothingAlpha = this._getAlphaForMode(this.sensitivityMode);

    // Outlier rejection buffer (7 frames)
    this._outlierBuffer = [];
    this._outlierBufferSize = 7;
    this._outlierCentThreshold = 200;
    this._suspectFrames = 0;
    this._suspectPitch = null;

    // Median filter buffer (5 frames)
    this._medianBuffer = [];
    this._medianBufferSize = 5;

    // EMA state
    this._smoothedFreq = null;
    this._smoothedMidi = null;

    // Onset detection
    this._lastRmsDb = -100;
    this._lastRawMidi = null;
    this._onsetCooldown = 0;

    // Output state
    this._lastOutput = null;
    this._noteHoldCount = 0;
    this._lastNoteName = null;

    // Pitch history for grading
    this.pitchHistory = [];
    this.startTime = null;

    // Calibration state
    this.isCalibrated = false;
    this.noiseFloor = -60;
  }

  /**
   * Get smoothing alpha based on sensitivity mode
   */
  _getAlphaForMode(mode) {
    switch (mode) {
      case 'beginner': return 0.15;  // Very smooth, forgiving
      case 'standard': return 0.25;  // Balanced
      case 'advanced': return 0.40;  // More responsive
      default: return 0.25;
    }
  }

  /**
   * Get frequency range based on vocal range setting
   */
  _getFrequencyRange() {
    switch (this.vocalRange) {
      case 'bass': return { min: 80, max: 350 };
      case 'tenor': return { min: 120, max: 520 };
      case 'alto': return { min: 160, max: 700 };
      case 'soprano': return { min: 220, max: 1100 };
      default: return { min: 65, max: 1100 }; // Auto - full range
    }
  }

  /**
   * Initialize the audio system
   */
  async init() {
    try {
      // Request microphone permission
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone access not supported in this browser');
      }

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1
        }
      });

      // Create audio context (must be after user gesture on iOS)
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error('Web Audio API not supported');
      }

      this.audioContext = new AudioContextClass();

      // iOS requires explicit resume
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Create source node
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Try to use AudioWorklet, fall back to ScriptProcessorNode
      try {
        await this._setupWorklet();
        this.useWorklet = true;
      } catch (e) {
        console.warn('AudioWorklet not available, falling back to ScriptProcessorNode:', e);
        this._setupScriptProcessor();
        this.useWorklet = false;
      }

      return true;
    } catch (error) {
      let message = error.message || 'Microphone error';

      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        message = 'Microphone permission denied. Please allow microphone access.';
      } else if (error.name === 'NotFoundError') {
        message = 'No microphone found. Please connect a microphone.';
      } else if (error.name === 'NotReadableError') {
        message = 'Microphone is in use by another app.';
      }

      this.onError(new Error(message));
      return false;
    }
  }

  /**
   * Set up AudioWorklet (preferred method)
   */
  async _setupWorklet() {
    await this.audioContext.audioWorklet.addModule('/pitch-processor.js');

    this.workletNode = new AudioWorkletNode(this.audioContext, 'pitch-processor');

    // Send sample rate to worklet
    this.workletNode.port.postMessage({
      type: 'setSampleRate',
      sampleRate: this.audioContext.sampleRate
    });

    // Send frequency range
    const range = this._getFrequencyRange();
    this.workletNode.port.postMessage({
      type: 'setFrequencyRange',
      min: range.min,
      max: range.max
    });

    // Handle messages from worklet
    this.workletNode.port.onmessage = (event) => {
      if (event.data.type === 'pitch') {
        this._processPitchData(event.data);
      } else if (event.data.type === 'calibration') {
        this.isCalibrated = true;
        this.noiseFloor = event.data.noiseFloor;
        this.onCalibration(event.data);
      }
    };

    // Connect: source → worklet (worklet doesn't output audio)
    this.sourceNode.connect(this.workletNode);
  }

  /**
   * Set up ScriptProcessorNode fallback
   */
  _setupScriptProcessor() {
    const bufferSize = 4096;
    this.processorNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

    // YIN state for fallback
    this._fallbackYinBuffer = new Float32Array(bufferSize / 2);
    this._fallbackBuffer = new Float32Array(bufferSize);
    this._fallbackHpf = { x1: 0, x2: 0, y1: 0, y2: 0 };
    this._fallbackDcOffset = 0;

    // Pre-calculate HPF coefficients
    const fc = 70;
    const w0 = 2 * Math.PI * fc / this.audioContext.sampleRate;
    const cosW0 = Math.cos(w0);
    const sinW0 = Math.sin(w0);
    const alpha = sinW0 / (2 * Math.sqrt(2));

    const a0 = 1 + alpha;
    this._fallbackHpfCoeffs = {
      b0: (1 + cosW0) / 2 / a0,
      b1: -(1 + cosW0) / a0,
      b2: (1 + cosW0) / 2 / a0,
      a1: -2 * cosW0 / a0,
      a2: (1 - alpha) / a0
    };

    this.processorNode.onaudioprocess = (event) => {
      if (!this.isRunning) return;

      const input = event.inputBuffer.getChannelData(0);

      // Pre-process: DC offset + high-pass
      for (let i = 0; i < input.length; i++) {
        let sample = input[i];

        // DC offset
        this._fallbackDcOffset = 0.995 * this._fallbackDcOffset + 0.005 * sample;
        sample -= this._fallbackDcOffset;

        // High-pass filter
        const { b0, b1, b2, a1, a2 } = this._fallbackHpfCoeffs;
        const hpf = this._fallbackHpf;
        const output = b0 * sample + b1 * hpf.x1 + b2 * hpf.x2 - a1 * hpf.y1 - a2 * hpf.y2;
        hpf.x2 = hpf.x1; hpf.x1 = sample;
        hpf.y2 = hpf.y1; hpf.y1 = output;

        this._fallbackBuffer[i] = Math.max(-1, Math.min(1, output));
      }

      // Calculate RMS
      let sum = 0;
      for (let i = 0; i < this._fallbackBuffer.length; i++) {
        sum += this._fallbackBuffer[i] * this._fallbackBuffer[i];
      }
      const rms = Math.sqrt(sum / this._fallbackBuffer.length);
      const rmsDb = 20 * Math.log10(Math.max(rms, 1e-10));

      // Simple gate (fixed threshold for fallback)
      const gateOpen = rmsDb > -40;

      let frequency = -1;
      let confidence = 0;

      if (gateOpen) {
        const result = this._fallbackYinDetect(this._fallbackBuffer);
        frequency = result.frequency;
        confidence = result.confidence;
      }

      this._processPitchData({
        frequency,
        confidence,
        rms,
        rmsDb,
        gateOpen,
        timestamp: this.audioContext.currentTime
      });
    };

    // Connect: source → processor → destination (required for ScriptProcessor)
    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.audioContext.destination);
  }

  /**
   * Fallback YIN implementation
   */
  _fallbackYinDetect(buffer) {
    const halfSize = Math.floor(buffer.length / 2);
    const yinBuffer = this._fallbackYinBuffer;
    const sampleRate = this.audioContext.sampleRate;
    const threshold = 0.12;
    const range = this._getFrequencyRange();

    // Difference function
    for (let tau = 0; tau < halfSize; tau++) {
      yinBuffer[tau] = 0;
      for (let i = 0; i < halfSize; i++) {
        const delta = buffer[i] - buffer[i + tau];
        yinBuffer[tau] += delta * delta;
      }
    }

    // CMND
    yinBuffer[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau < halfSize; tau++) {
      runningSum += yinBuffer[tau];
      yinBuffer[tau] *= tau / runningSum;
    }

    // Find minimum
    const minTau = Math.floor(sampleRate / range.max);
    const maxTau = Math.floor(sampleRate / range.min);
    let tau = Math.max(2, minTau);
    let foundTau = -1;

    while (tau < Math.min(halfSize, maxTau)) {
      if (yinBuffer[tau] < threshold) {
        while (tau + 1 < halfSize && yinBuffer[tau + 1] < yinBuffer[tau]) tau++;
        foundTau = tau;
        break;
      }
      tau++;
    }

    if (foundTau === -1) return { frequency: -1, confidence: 0 };

    // Parabolic interpolation
    let betterTau = foundTau;
    if (foundTau > 0 && foundTau < halfSize - 1) {
      const s0 = yinBuffer[foundTau - 1];
      const s1 = yinBuffer[foundTau];
      const s2 = yinBuffer[foundTau + 1];
      const denom = 2 * s1 - s0 - s2;
      if (denom !== 0) {
        const adj = (s2 - s0) / (2 * denom);
        if (Math.abs(adj) < 1) betterTau = foundTau + adj;
      }
    }

    const frequency = sampleRate / betterTau;
    const confidence = 1 - yinBuffer[foundTau];

    if (frequency < range.min || frequency > range.max) {
      return { frequency: -1, confidence: 0 };
    }

    return { frequency, confidence };
  }

  /**
   * Process raw pitch data through smoothing pipeline
   */
  _processPitchData(data) {
    if (!this.isRunning) return;

    const { frequency, confidence, rms, rmsDb, gateOpen } = data;
    const timestamp = this.startTime ? performance.now() - this.startTime : 0;

    // No pitch detected
    if (frequency <= 0 || !gateOpen) {
      // Clear buffers gradually during silence
      if (this._medianBuffer.length > 0) this._medianBuffer.shift();
      if (this._outlierBuffer.length > 0) this._outlierBuffer.shift();
      this._noteHoldCount = 0;
      this._suspectFrames = 0;
      this._suspectPitch = null;

      this.onPitch({
        timestamp,
        frequency: null,
        midi: null,
        noteName: null,
        cents: 0,
        level: rms,
        confidence: 0,
        stable: false,
        gateOpen: false
      });
      return;
    }

    // Convert to MIDI
    const rawMidi = 12 * Math.log2(frequency / this.referencePitch) + 69;

    // === OUTLIER REJECTION ===
    // Check if this frame is an outlier compared to recent history
    if (this._outlierBuffer.length >= 3) {
      const sorted = [...this._outlierBuffer].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const centsDiff = Math.abs(rawMidi - median) * 100;

      if (centsDiff > this._outlierCentThreshold) {
        // This looks like an outlier - track it
        if (this._suspectPitch === null || Math.abs(rawMidi - this._suspectPitch) > 1) {
          this._suspectPitch = rawMidi;
          this._suspectFrames = 1;
        } else {
          this._suspectFrames++;
        }

        // Only accept if confirmed for 2+ frames (legitimate note change)
        if (this._suspectFrames < 2) {
          // Reject this frame, use last good value
          return;
        }
        // Confirmed note change - reset smoother below
      }
    }

    // Add to outlier buffer
    this._outlierBuffer.push(rawMidi);
    if (this._outlierBuffer.length > this._outlierBufferSize) {
      this._outlierBuffer.shift();
    }

    // === ONSET DETECTION ===
    // Detect note transitions and reset smoother
    let isOnset = false;

    // Energy onset: significant RMS increase
    if (rmsDb - this._lastRmsDb > 6) {
      isOnset = true;
    }

    // Pitch discontinuity: large change sustained for 2+ frames
    if (this._suspectFrames >= 2) {
      isOnset = true;
      this._suspectFrames = 0;
      this._suspectPitch = null;
    }

    this._lastRmsDb = rmsDb;
    this._lastRawMidi = rawMidi;

    // On onset, reset smoother to respond immediately
    if (isOnset && this._onsetCooldown === 0) {
      this._smoothedMidi = rawMidi;
      this._smoothedFreq = frequency;
      this._medianBuffer = [rawMidi];
      this._onsetCooldown = 3; // Prevent repeated resets
    } else if (this._onsetCooldown > 0) {
      this._onsetCooldown--;
    }

    // === MEDIAN FILTER ===
    this._medianBuffer.push(rawMidi);
    if (this._medianBuffer.length > this._medianBufferSize) {
      this._medianBuffer.shift();
    }

    const sortedMedian = [...this._medianBuffer].sort((a, b) => a - b);
    const medianMidi = sortedMedian[Math.floor(sortedMedian.length / 2)];

    // === EMA SMOOTHING ===
    if (this._smoothedMidi === null) {
      this._smoothedMidi = medianMidi;
    } else {
      this._smoothedMidi = this._smoothingAlpha * medianMidi + (1 - this._smoothingAlpha) * this._smoothedMidi;
    }

    // Convert smoothed MIDI back to frequency
    this._smoothedFreq = this.referencePitch * Math.pow(2, (this._smoothedMidi - 69) / 12);

    // === MUSICAL MAPPING ===
    const noteNumber = Math.round(this._smoothedMidi);
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const noteName = noteNames[((noteNumber % 12) + 12) % 12] + (Math.floor(noteNumber / 12) - 1);
    const cents = Math.round((this._smoothedMidi - noteNumber) * 100);

    // Track note stability
    if (noteName === this._lastNoteName) {
      this._noteHoldCount++;
    } else {
      this._noteHoldCount = 1;
      this._lastNoteName = noteName;
    }

    const output = {
      timestamp,
      frequency: this._smoothedFreq,
      midi: this._smoothedMidi,
      midiRounded: noteNumber,
      noteName,
      cents,
      level: rms,
      confidence,
      stable: this._noteHoldCount > 6,
      gateOpen: true,
      rawFrequency: frequency,
      rawMidi
    };

    // Store in history for grading
    this.pitchHistory.push(output);

    // Notify listeners
    this.onPitch(output);
    this._lastOutput = output;
  }

  /**
   * Start pitch detection
   */
  async start() {
    if (!this.audioContext) {
      const success = await this.init();
      if (!success) return false;
    }

    // Resume context if suspended (iOS)
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    this.isRunning = true;
    this.pitchHistory = [];
    this.startTime = performance.now();

    // Reset smoothing state
    this._smoothedFreq = null;
    this._smoothedMidi = null;
    this._medianBuffer = [];
    this._outlierBuffer = [];
    this._noteHoldCount = 0;
    this._lastNoteName = null;
    this._suspectFrames = 0;
    this._suspectPitch = null;
    this._lastRmsDb = -100;
    this._onsetCooldown = 0;

    return true;
  }

  /**
   * Stop pitch detection
   */
  stop() {
    this.isRunning = false;
    return this.pitchHistory;
  }

  /**
   * Clean up all resources
   */
  destroy() {
    this.isRunning = false;

    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  /**
   * Update sensitivity mode
   */
  setSensitivityMode(mode) {
    this.sensitivityMode = mode;
    this._smoothingAlpha = this._getAlphaForMode(mode);
  }

  /**
   * Update vocal range
   */
  setVocalRange(range) {
    this.vocalRange = range;
    const freqRange = this._getFrequencyRange();

    if (this.workletNode) {
      this.workletNode.port.postMessage({
        type: 'setFrequencyRange',
        min: freqRange.min,
        max: freqRange.max
      });
    }
  }

  /**
   * Update reference pitch
   */
  setReferencePitch(freq) {
    this.referencePitch = freq;
  }
}

export default PitchEngine;
