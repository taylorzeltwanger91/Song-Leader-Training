import { VOICE_ORDER, VOICE_LABEL } from "../audio/hymn-player.js";

// Listening controls for a transcribed SATB hymn.
//
// Two jobs, deliberately kept apart: the big button plays the hymn as written (all four
// parts) and is the default thing to reach for; the part row picks the line you sing and
// are graded on, with a small play beside it to audition that line alone.
//
// Colour language follows the rest of the app: gold = listen, green = practice. The green
// "Begin Practice" button below this stays the page's primary action.

const GOLD = "#b08d3a";
const GOLD_TEXT = "#8a6d2a";
const GREEN = "#5c7a5e";
const BORDER = "#d4cfc5";
const TEXT = "#3b3127";
const MUTED = "#8a7e70";

export function HymnPlayer({ voices, selectedVoice, onSelectVoice, playing, onPlay, onStop }) {
  if (!voices) return null;

  const parts = VOICE_ORDER.filter(v => voices[v]?.length);
  if (!parts.length) return null;

  const playingAll = playing === "all";
  const playingPart = playing === selectedVoice;

  return (
    <div style={{ marginBottom: 14 }}>
      {/* Play the hymn — all four parts */}
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <button
          onClick={() => (playingAll ? onStop() : onPlay("all"))}
          aria-label={playingAll ? "Stop playing hymn" : "Play hymn, all four parts"}
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10,
            padding: "14px 40px", borderRadius: 12, fontSize: 15, fontWeight: 600,
            cursor: "pointer", fontFamily: "var(--sans)",
            border: `1.5px solid ${GOLD}`,
            background: playingAll ? GOLD : "#fff",
            color: playingAll ? "#fff" : GOLD_TEXT,
          }}
        >
          <span style={{ fontSize: 17 }}>{playingAll ? "■" : "▶"}</span>
          {playingAll ? "Stop" : "Play Hymn"}
        </button>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>
          {playingAll ? "playing all four parts" : "all four parts"}
        </div>
      </div>

      {/* Pick the line you sing — and hear it on its own */}
      <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 6, letterSpacing: 0.3 }}>
        YOUR PART
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {parts.map(v => (
          <button
            key={v}
            onClick={() => { onStop(); onSelectVoice(v); }}
            style={{
              padding: "7px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: "pointer", border: "1px solid",
              borderColor: selectedVoice === v ? GREEN : BORDER,
              background: selectedVoice === v ? GREEN : "#fff",
              color: selectedVoice === v ? "#fff" : TEXT,
            }}
          >
            {VOICE_LABEL[v]}
          </button>
        ))}
        <button
          onClick={() => (playingPart ? onStop() : onPlay(selectedVoice))}
          title={`Hear the ${VOICE_LABEL[selectedVoice]?.toLowerCase()} part on its own`}
          aria-label={playingPart
            ? `Stop playing ${VOICE_LABEL[selectedVoice]} part`
            : `Hear the ${VOICE_LABEL[selectedVoice]} part on its own`}
          style={{
            marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6,
            padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
            cursor: "pointer", border: `1px solid ${GOLD}`,
            background: playingPart ? GOLD : "#fff",
            color: playingPart ? "#fff" : GOLD_TEXT,
          }}
        >
          <span>{playingPart ? "■" : "▶"}</span>
          {playingPart ? "Stop" : "Hear this part"}
        </button>
      </div>
    </div>
  );
}
