"""
Render a verified 4-part (SATB) hymn JSON to WAV + multi-track MIDI.

Usage:  python render_satb.py <hymn.json> <output_dir>

WAV: a simple additive-synth tone (fundamental + 2nd/3rd harmonics), which
reads as vaguely organ-like — fine for ear-verification, NOT the app's real
sampled-organ playback. Rests render as silence. MIDI: one track per voice,
church-organ patch (GM 19), so a DAW/notation app supplies the instrument.

Dependencies: numpy, midiutil, plus a WAV writer (stdlib wave).
"""
import sys
import os
import json
import wave
import numpy as np
from midiutil import MIDIFile

SR = 22050
CHURCH_ORGAN = 19
VOICE_ORDER = ['soprano', 'alto', 'tenor', 'bass']


def _tone(midi, dur_beats, ms_per_beat, vol):
    n = int(SR * dur_beats * ms_per_beat / 1000)
    if n <= 0:
        return np.zeros(0)
    f = 440 * 2 ** ((midi - 69) / 12)
    t = np.arange(n) / SR
    w = (np.sin(2 * np.pi * f * t)
         + 0.5 * np.sin(2 * np.pi * 2 * f * t)
         + 0.25 * np.sin(2 * np.pi * 3 * f * t))
    env = np.ones(n)
    a, r = int(0.02 * SR), int(0.06 * SR)
    env[:a] = np.linspace(0, 1, a)
    env[-r:] = np.linspace(1, 0, r)
    return w * env * vol


def _render_voice(notes, ms_per_beat, vol=0.22):
    out = []
    for note in notes:
        n = int(SR * note['dur'] * ms_per_beat / 1000)
        if note.get('rest'):
            out.append(np.zeros(n))            # silence occupies time
        else:
            out.append(_tone(note['midi'], note['dur'], ms_per_beat, vol))
    return np.concatenate(out) if out else np.zeros(0)


def _write_wav(path, signal):
    s = np.int16(signal / max(1e-9, np.max(np.abs(signal))) * 30000)
    with wave.open(path, 'w') as wv:
        wv.setnchannels(1); wv.setsampwidth(2); wv.setframerate(SR)
        wv.writeframes(s.tobytes())


def render(hymn, out_dir):
    bpm = hymn['bpm']
    ms_per_beat = 60000 / bpm  # 'beat' = the meter's denominator unit (half note in 3/2, 2/2)
    voices = hymn['voices']
    base = f"hymn{hymn['hymnId']}"

    tracks = [_render_voice(voices[v], ms_per_beat) for v in VOICE_ORDER if v in voices]
    length = max(len(t) for t in tracks)
    mix = sum(np.pad(t, (0, length - len(t))) for t in tracks)
    _write_wav(os.path.join(out_dir, f"{base}_4part.wav"), mix)
    if 'soprano' in voices:
        _write_wav(os.path.join(out_dir, f"{base}_soprano.wav"),
                   _render_voice(voices['soprano'], ms_per_beat))

    present = [v for v in VOICE_ORDER if v in voices]
    mf = MIDIFile(len(present), deinterleave=False)
    beats_per_measure = int(hymn['timeSignature'].split('/')[0])
    for ti, v in enumerate(present):
        mf.addTrackName(ti, 0, v.capitalize())
        mf.addTempo(ti, 0, bpm * 2)                         # MIDI tempo is in quarter notes
        mf.addTimeSignature(ti, 0, beats_per_measure, 1, 24)
        mf.addProgramChange(ti, ti, 0, CHURCH_ORGAN)
        on = 0.0
        for note in voices[v]:
            if not note.get('rest'):
                mf.addNote(ti, ti, int(note['midi']), on * 2, note['dur'] * 2, 96)
            on += note['dur']
    with open(os.path.join(out_dir, f"{base}_4part.mid"), 'wb') as f:
        mf.writeFile(f)

    print(f"rendered {base}: {base}_4part.wav, {base}_4part.mid, {base}_soprano.wav")


if __name__ == '__main__':
    hymn = json.load(open(sys.argv[1]))
    out_dir = sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    render(hymn, out_dir)
