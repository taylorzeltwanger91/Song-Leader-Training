// Meter helpers shared by the melody generator, the practice engine and the hymn player.
// Kept in one place so compound-meter timing can't drift between the thing that schedules
// audio and the thing that grades against it.

export function parseTS(ts) { const [n,d]=(ts||"4/4").split("/").map(Number); return {n,d}; }

export function isCompound(ts) { const {n,d}=parseTS(ts); return d>=8 && n>3 && n%3===0; }

// Seconds per notated beat-unit. `dur`/`onset` in the SATB data are in beats where the
// beat unit is the meter's denominator (half-note in x/2, quarter in x/4) — both map to
// 60/bpm. Compound meters count dotted beats, so the unit is a third of the pulse.
export function secondsPerUnit(ts, bpm) {
  return isCompound(ts) ? 60 / (bpm * 3) : 60 / bpm;
}
