/**
 * PitchVisualizer - Canvas-based real-time pitch display
 *
 * Uses Canvas for rendering to bypass React's reconciliation overhead.
 * Updates at 60fps via requestAnimationFrame.
 *
 * Features:
 * - Vertical pitch scale (configurable range, default C2-G4)
 * - Sliding pitch indicator
 * - Tuning meter (cents deviation)
 * - Level meter
 * - Note name display
 */

import { useRef, useEffect, useCallback } from 'react';

// Color palette
const COLORS = {
  bg: '#ffffff',
  bgAlt: '#f8f6f2',
  border: '#e0d8cc',
  text: '#5c4a3a',
  textMuted: '#8a7a6a',
  accent: '#5c7a5e',
  accentDark: '#2d6a4f',
  warning: '#b08d3a',
  error: '#a33b3b',
  scaleGradientTop: '#e8f5e9',
  scaleGradientMid: '#f5f5dc',
  scaleGradientBottom: '#fff3e0'
};

export function PitchVisualizer({
  pitchData,        // Current pitch data from PitchEngine
  width = 320,
  height = 280,
  midiMin = 36,     // C2
  midiMax = 67,     // G4
  showLabels = true,
  style = {}
}) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const currentPitchRef = useRef(null);
  const smoothedPositionRef = useRef(null);

  // Update pitch data ref (avoids re-renders)
  useEffect(() => {
    currentPitchRef.current = pitchData;
  }, [pitchData]);

  // Generate note labels for the scale
  const generateNoteLabels = useCallback(() => {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const labels = [];

    for (let midi = midiMax; midi >= midiMin; midi--) {
      const noteName = noteNames[midi % 12];
      const octave = Math.floor(midi / 12) - 1;
      const isNatural = !noteName.includes('#');

      if (isNatural) {
        labels.push({
          midi,
          name: `${noteName}${octave}`,
          isC: noteName === 'C'
        });
      }
    }

    return labels;
  }, [midiMin, midiMax]);

  // Main render loop
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    // Handle high-DPI displays
    const displayWidth = width;
    const displayHeight = height;
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, displayWidth, displayHeight);

    const pitch = currentPitchRef.current;
    const labels = generateNoteLabels();

    // Layout
    const padding = 16;
    const labelWidth = showLabels ? 32 : 0;
    const scaleWidth = 28;
    const noteDisplayWidth = 80;
    const tuningWidth = 100;
    const levelWidth = 16;
    const gap = 12;

    const scaleX = padding + labelWidth;
    const scaleHeight = displayHeight - padding * 2;
    const scaleY = padding;

    // === DRAW PITCH SCALE ===

    // Scale background gradient
    const gradient = ctx.createLinearGradient(scaleX, scaleY, scaleX, scaleY + scaleHeight);
    gradient.addColorStop(0, COLORS.scaleGradientTop);
    gradient.addColorStop(0.5, COLORS.scaleGradientMid);
    gradient.addColorStop(1, COLORS.scaleGradientBottom);

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(scaleX, scaleY, scaleWidth, scaleHeight, 12);
    ctx.fill();

    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw grid lines and labels
    const midiRange = midiMax - midiMin;

    for (const label of labels) {
      const position = (label.midi - midiMin) / midiRange;
      const y = scaleY + scaleHeight - (position * scaleHeight);

      // Grid line
      ctx.beginPath();
      ctx.moveTo(scaleX, y);
      ctx.lineTo(scaleX + scaleWidth, y);
      ctx.strokeStyle = label.isC ? COLORS.accent : COLORS.border;
      ctx.lineWidth = label.isC ? 1.5 : 0.5;
      ctx.globalAlpha = label.isC ? 0.8 : 0.5;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Label
      if (showLabels) {
        const isCurrentNote = pitch && pitch.noteName === label.name;
        ctx.fillStyle = isCurrentNote ? COLORS.accent : COLORS.textMuted;
        ctx.font = isCurrentNote ? 'bold 10px system-ui' : '9px system-ui';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = isCurrentNote ? 1 : 0.6;
        ctx.fillText(label.name, scaleX - 6, y);
        ctx.globalAlpha = 1;
      }
    }

    // === DRAW PITCH INDICATOR ===

    if (pitch && pitch.midi !== null && pitch.gateOpen) {
      // Smooth the position for visual stability
      const targetPosition = (pitch.midi - midiMin) / midiRange;
      if (smoothedPositionRef.current === null) {
        smoothedPositionRef.current = targetPosition;
      } else {
        // Smooth with 0.3 alpha for visual lag reduction
        smoothedPositionRef.current = 0.3 * targetPosition + 0.7 * smoothedPositionRef.current;
      }

      const position = Math.max(0, Math.min(1, smoothedPositionRef.current));
      const y = scaleY + scaleHeight - (position * scaleHeight);

      // Indicator color based on tuning
      let indicatorColor = COLORS.accent;
      if (Math.abs(pitch.cents) < 10) {
        indicatorColor = COLORS.accentDark;
      } else if (Math.abs(pitch.cents) < 25) {
        indicatorColor = COLORS.warning;
      }

      // Draw indicator
      ctx.fillStyle = indicatorColor;
      ctx.beginPath();
      ctx.roundRect(scaleX - 4, y - 5, scaleWidth + 8, 10, 5);
      ctx.fill();

      // Shadow
      ctx.shadowColor = 'rgba(0,0,0,0.2)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 2;
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
    } else {
      // Reset smoothed position when no pitch
      smoothedPositionRef.current = null;
    }

    // === NOTE DISPLAY ===

    const noteX = scaleX + scaleWidth + gap + noteDisplayWidth / 2;
    const noteY = displayHeight / 2;

    if (pitch && pitch.noteName && pitch.gateOpen) {
      // Note name
      ctx.fillStyle = pitch.stable ? COLORS.accentDark : COLORS.accent;
      ctx.font = 'bold 48px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pitch.noteName, noteX, noteY - 10);

      // Frequency
      ctx.fillStyle = COLORS.textMuted;
      ctx.font = '11px system-ui';
      ctx.fillText(`${Math.round(pitch.frequency)} Hz`, noteX, noteY + 30);
    } else {
      // No pitch state
      ctx.fillStyle = COLORS.textMuted;
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Listening...', noteX, noteY);
    }

    // === TUNING METER ===

    const tuningX = scaleX + scaleWidth + gap + noteDisplayWidth + gap;
    const tuningY = displayHeight / 2 - 40;
    const tuningHeight = 24;

    // Label
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = '600 10px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('TUNING', tuningX + tuningWidth / 2, tuningY - 10);

    // Background
    ctx.fillStyle = COLORS.bgAlt;
    ctx.beginPath();
    ctx.roundRect(tuningX, tuningY, tuningWidth, tuningHeight, 12);
    ctx.fill();

    // Center line
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tuningX + tuningWidth / 2, tuningY);
    ctx.lineTo(tuningX + tuningWidth / 2, tuningY + tuningHeight);
    ctx.stroke();

    if (pitch && pitch.cents !== undefined && pitch.gateOpen) {
      // Tuning indicator dot
      const tuningPosition = Math.max(-45, Math.min(45, pitch.cents));
      const dotX = tuningX + tuningWidth / 2 + (tuningPosition / 50) * (tuningWidth / 2 - 8);

      let dotColor = COLORS.accentDark;
      if (Math.abs(pitch.cents) >= 25) dotColor = COLORS.error;
      else if (Math.abs(pitch.cents) >= 10) dotColor = COLORS.warning;

      ctx.fillStyle = dotColor;
      ctx.beginPath();
      ctx.arc(dotX, tuningY + tuningHeight / 2, 8, 0, Math.PI * 2);
      ctx.fill();

      // Cents label
      ctx.fillStyle = dotColor;
      ctx.font = '600 12px system-ui';
      ctx.textAlign = 'center';
      const centsText = `${pitch.cents > 0 ? '+' : ''}${pitch.cents}¢${Math.abs(pitch.cents) < 10 ? ' ✓' : ''}`;
      ctx.fillText(centsText, tuningX + tuningWidth / 2, tuningY + tuningHeight + 18);
    }

    // === LEVEL METER ===

    const levelX = tuningX + tuningWidth + gap;
    const levelY = scaleY + 30;
    const levelHeight = scaleHeight - 60;

    // Label
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = '600 10px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('LEVEL', levelX + levelWidth / 2, levelY - 10);

    // Background
    ctx.fillStyle = COLORS.bgAlt;
    ctx.beginPath();
    ctx.roundRect(levelX, levelY, levelWidth, levelHeight, 6);
    ctx.fill();

    if (pitch && pitch.level !== undefined) {
      // Level bar
      const levelPercent = Math.min(1, pitch.level * 5); // Scale for visibility
      const barHeight = levelPercent * levelHeight;

      ctx.fillStyle = pitch.level > 0.1 ? COLORS.accent : COLORS.warning;
      ctx.beginPath();
      ctx.roundRect(levelX, levelY + levelHeight - barHeight, levelWidth, barHeight, 6);
      ctx.fill();
    }

    // Continue animation loop
    animationRef.current = requestAnimationFrame(render);
  }, [width, height, midiMin, midiMax, showLabels, generateNoteLabels]);

  // Start/stop animation loop
  useEffect(() => {
    animationRef.current = requestAnimationFrame(render);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [render]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        borderRadius: 12,
        border: `1px solid ${COLORS.border}`,
        ...style
      }}
    />
  );
}

/**
 * Compact version for smaller spaces
 */
export function PitchVisualizerCompact({
  pitchData,
  width = 200,
  height = 180,
  style = {}
}) {
  return (
    <PitchVisualizer
      pitchData={pitchData}
      width={width}
      height={height}
      showLabels={false}
      style={style}
    />
  );
}

export default PitchVisualizer;
