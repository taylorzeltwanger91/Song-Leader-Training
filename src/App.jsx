import { useState, useEffect, useRef, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════
// TIME SIGNATURE ENGINE
// ═══════════════════════════════════════════════════════════════

function parseTS(ts) {
  const [n, d] = (ts || "4/4").split("/").map(Number);
  return { n, d };
}

function getBeatPattern(ts) {
  const { n, d } = parseTS(ts);
  const compound = d >= 8 && n > 3 && n % 3 === 0;
  if (compound) {
    const g = n / 3, beats = [];
    for (let i = 0; i < g; i++) {
      beats.push({ s: "strong", g: i });
      beats.push({ s: "weak", g: i });
      beats.push({ s: "weak", g: i });
    }
    return { beats, groups: g, compound: true, total: n, d };
  }
  const beats = [];
  for (let i = 0; i < n; i++) {
    let s = "weak";
    if (i === 0) s = "strong";
    else if (n === 4 && i === 2) s = "medium";
    beats.push({ s, g: Math.floor(i / Math.max(1, Math.ceil(n / 2))) });
  }
  return { beats, groups: n <= 3 ? 1 : 2, compound: false, total: n, d };
}

function tsDesc(ts) {
  const { n, d } = parseTS(ts);
  const p = getBeatPattern(ts);
  if (p.compound) return `Compound: ${p.groups} groups of 3. Feel ${p.groups} big beats.`;
  if (n === 4 && d === 4) return "Common time: Strong–weak–medium–weak.";
  if (n === 3 && d === 4) return "Waltz: Strong–weak–weak.";
  if (n === 3 && d === 2) return "3/2: Three half-note beats.";
  if (n === 2 && d === 4) return "March: Strong–weak.";
  if (n === 4 && d === 2) return "Alla breve: 4 half-note beats.";
  return `${n} beats of 1/${d} notes per measure.`;
}

// ═══════════════════════════════════════════════════════════════
// TRAINING EXERCISES
// ═══════════════════════════════════════════════════════════════

const EXERCISES = (() => {
  const ex = [];
  let id = 1;
  // Scales
  ex.push({ id: `e${id++}`, title: "Major Scale Ascending", cat: "Scales", desc: "Sing Do-Re-Mi-Fa-Sol-La-Ti-Do in steady tempo" });
  ex.push({ id: `e${id++}`, title: "Major Scale Descending", cat: "Scales", desc: "Sing Do-Ti-La-Sol-Fa-Mi-Re-Do evenly" });
  ex.push({ id: `e${id++}`, title: "Natural Minor Scale", cat: "Scales", desc: "Ascending and descending natural minor" });
  // Intervals
  ex.push({ id: `e${id++}`, title: "Third Intervals", cat: "Intervals", desc: "Ascending thirds: Do-Mi, Re-Fa, Mi-Sol..." });
  ex.push({ id: `e${id++}`, title: "Fifth Intervals", cat: "Intervals", desc: "Ascending fifths: Do-Sol, Re-La, Mi-Ti..." });
  ex.push({ id: `e${id++}`, title: "Octave Jumps", cat: "Intervals", desc: "Sing octave leaps steadily" });
  // Tempo
  ex.push({ id: `e${id++}`, title: "Tempo Hold — 60s", cat: "Tempo", desc: "Maintain 80 BPM for 60 seconds without drift" });
  ex.push({ id: `e${id++}`, title: "Tempo Hold — 90s", cat: "Tempo", desc: "Maintain 88 BPM for 90 seconds without drift" });
  // Phrases
  ex.push({ id: `e${id++}`, title: "Short Soprano Phrase", cat: "Phrases", desc: "Sing a 4-measure soprano phrase with accuracy" });
  ex.push({ id: `e${id++}`, title: "Cadence Practice", cat: "Phrases", desc: "Focus on landing phrase endings cleanly" });
  // Rhythm — generated per common time signatures
  for (const [ts, tempo, label] of [["4/4",84,"Common Time"],["3/4",72,"Waltz"],["3/2",76,"3/2 Half-Note"],["6/8",88,"Compound Duple"],["9/8",100,"Compound Triple"]]) {
    const p = getBeatPattern(ts);
    ex.push({ id:`e${id++}`, title:`${ts} — Beat Counting`, cat:"Rhythm", ts, tempo, desc:`Count ${p.compound?`${p.groups} groups of 3`:`${parseTS(ts).n} beats`} at steady tempo` });
    ex.push({ id:`e${id++}`, title:`${ts} — Accent Patterns`, cat:"Rhythm", ts, tempo, desc:`Emphasize strong beats in ${label}: ${p.beats.map(b=>b.s==="strong"?"STRONG":b.s==="medium"?"med":"·").join(" ")}` });
  }
  return ex;
})();

function simResults() {
  const b = 70, v = () => Math.floor(Math.random() * 22);
  const ps = Math.min(100, b + v()), rs = Math.min(100, b + v());
  const co = Math.min(100, b + 5 + v()), ts2 = Math.min(100, b + v()), pst = Math.min(100, b + v());
  const ls = Math.round(co * 0.3 + ts2 * 0.4 + pst * 0.3), mc = 16;
  const pt = Array.from({ length: mc }, (_, i) => { const d = (Math.random() - 0.4) * (i / mc) * 30; return { m: i + 1, c: Math.round(d), sh: d > 10, fl: d < -10 }; });
  const tt = Array.from({ length: mc }, (_, i) => ({ m: i + 1, bpm: Math.round(84 + (Math.random() - 0.45) * 8 + (i > mc * 0.6 ? -3 : 0)) }));
  const diag = [];
  if (tt.slice(-4).every(t => t.bpm < 82)) diag.push("Tempo slows after verse 2");
  if (pt.slice(-3).some(p => p.fl)) diag.push("Pitch drifts flat approaching cadences");
  if (pt[0]?.c > 8) diag.push("Entrance is slightly sharp");
  if (rs < 75) diag.push("Beat alignment inconsistent in middle measures");
  if (!diag.length) diag.push("Steady performance throughout — well done.");
  return { ps, rs, ls, co, ts: ts2, pst, pt, tt, diag, pm: pt.filter(p => p.sh || p.fl).map(p => p.m) };
}

// ═══════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════

const T = { bg:"#faf6f0", card:"#fff", cb:"#e8e0d4", ac:"#5c7a5e", ad:"#3d5640", wm:"#b08d3a", wl:"#f5eedc", dg:"#a33b3b", tx:"#3b3127", tm:"#8a7e70", tl:"#b5a998" };
const mkB = p => ({ display:"inline-flex", alignItems:"center", justifyContent:"center", gap:8, padding:"10px 24px", borderRadius:10, border:p?"none":"1.5px solid #e8e0d4", background:p?"#5c7a5e":"#fff", color:p?"#fff":"#3b3127", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"var(--sans)" });
const mkTag = c => ({ display:"inline-block", padding:"2px 8px", borderRadius:20, fontSize:9, fontWeight:700, letterSpacing:"0.06em", textTransform:"uppercase", background:{green:"#e8f0e8",amber:"#f5eedc",blue:"#e4ecf5",red:"#f0e8e8"}[c]||"#f0ece4", color:{green:"#3d5640",amber:"#8a6d1f",blue:"#3a5a8a",red:"#7a2e2e"}[c]||"#6b5e50" });
const mkC = { background:T.card, border:`1px solid ${T.cb}`, borderRadius:12, padding:16, marginBottom:10, cursor:"pointer", transition:"box-shadow .2s,border-color .2s" };
const hov = e => { e.currentTarget.style.boxShadow="0 4px 16px rgba(92,122,94,0.1)"; e.currentTarget.style.borderColor=T.ac; };
const uhov = e => { e.currentTarget.style.boxShadow="none"; e.currentTarget.style.borderColor=T.cb; };
const tb = { width:28, height:28, borderRadius:6, border:"1px solid #d4cfc5", background:"#fff", color:"#5c5047", fontSize:16, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:600 };
const css = `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=DM+Serif+Display&display=swap');:root{--serif:'DM Serif Display',serif;--sans:'DM Sans',sans-serif}*{box-sizing:border-box;margin:0}@keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.6);opacity:.6}}@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}body{margin:0}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#c4bdb0;border-radius:3px}`;

function BeatVis({ ts, act = -1, on = false, tempo = 80 }) {
  const p = getBeatPattern(ts);
  const grps = []; let cur = [], lg = 0;
  p.beats.forEach((b, i) => { if (i > 0 && b.g !== lg) { grps.push(cur); cur = []; } cur.push({ ...b, i }); lg = b.g; });
  if (cur.length) grps.push(cur);
  return (
    <div style={{ background:"#faf6f0", border:"1px solid #e8e0d4", borderRadius:10, padding:14 }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:10 }}>
        <div style={{ fontFamily:"var(--serif)", fontSize:26, lineHeight:1, color:"#3b3127", display:"flex", flexDirection:"column", alignItems:"center", width:36 }}>
          <span>{parseTS(ts).n}</span><div style={{ width:22, height:2, background:"#3b3127", margin:"2px 0" }}/><span>{parseTS(ts).d}</span>
        </div>
        <div style={{ fontSize:12, color:"#6b5e50", lineHeight:1.5, flex:1 }}>{tsDesc(ts)}</div>
      </div>
      <div style={{ display:"flex", gap:10, justifyContent:"center", flexWrap:"wrap" }}>
        {grps.map((g, gi) => (
          <div key={gi} style={{ display:"flex", gap:5, padding:"7px 10px", background:"#fff", borderRadius:8, border:"1px solid #e8e0d4" }}>
            {g.map(b => {
              const a = on && act === b.i;
              const sz = b.s==="strong"?34:b.s==="medium"?26:20;
              const cl = b.s==="strong"?"#5c7a5e":b.s==="medium"?"#b08d3a":"#c4bdb0";
              const al = b.s==="strong"?"#2d6a4f":b.s==="medium"?"#8a6d1f":"#8a7e70";
              return <div key={b.i} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
                <div style={{ width:sz, height:sz, borderRadius:"50%", background:a?al:cl, opacity:a?1:b.s==="weak"?.4:.7, transform:a?"scale(1.2)":"scale(1)", transition:"all .1s", boxShadow:a?`0 0 0 4px ${al}33`:"none", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <span style={{ color:"#fff", fontSize:sz*.35, fontWeight:700 }}>{b.i+1}</span>
                </div>
                <span style={{ fontSize:7, fontWeight:700, textTransform:"uppercase", color:b.s==="strong"?"#5c7a5e":b.s==="medium"?"#b08d3a":"#b5a998" }}>{b.s==="strong"?"S":b.s==="medium"?"M":"w"}</span>
              </div>;
            })}
          </div>
        ))}
      </div>
      <div style={{ display:"flex", gap:14, justifyContent:"center", marginTop:8, fontSize:10, color:"#8a7e70" }}>
        <span><span style={{ display:"inline-block", width:7, height:7, borderRadius:"50%", background:"#5c7a5e", marginRight:3, verticalAlign:"middle" }}/>Strong</span>
        {p.beats.some(b=>b.s==="medium")&&<span><span style={{ display:"inline-block", width:7, height:7, borderRadius:"50%", background:"#b08d3a", marginRight:3, verticalAlign:"middle" }}/>Medium</span>}
        <span><span style={{ display:"inline-block", width:7, height:7, borderRadius:"50%", background:"#c4bdb0", marginRight:3, verticalAlign:"middle" }}/>Weak</span>
      </div>
      <div style={{ textAlign:"center", marginTop:5, fontSize:11, color:"#b5a998" }}>♩ = {tempo} BPM{p.compound?` (♩. = ${Math.round(tempo/3)})`:""}</div>
    </div>
  );
}

function AnimBeat({ ts, tempo = 80 }) {
  const [act, setAct] = useState(-1);
  const [on, setOn] = useState(false);
  const [mc, setMc] = useState(0);
  const iv = useRef(null), ax = useRef(null);
  const p = getBeatPattern(ts);
  const click = useCallback(s => {
    try { if (!ax.current) ax.current = new (window.AudioContext||window.webkitAudioContext)(); const c=ax.current,o=c.createOscillator(),g=c.createGain(); o.type="triangle"; o.frequency.value=s==="strong"?880:s==="medium"?660:440; g.gain.setValueAtTime(s==="strong"?.3:.12,c.currentTime); g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.08); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime+.08); } catch(e){}
  }, []);
  const start = useCallback(() => { setOn(true); setMc(0); let idx=0; const tick=()=>{ const b=idx%p.total; setAct(b); if(b===0) setMc(c=>c+1); click(p.beats[b].s); idx++; }; tick(); iv.current=setInterval(tick,(60/tempo)*1000); }, [tempo,p,click]);
  const stop = useCallback(() => { setOn(false); setAct(-1); clearInterval(iv.current); }, []);
  useEffect(() => () => clearInterval(iv.current), []);
  return <div>
    <BeatVis ts={ts} act={act} on={on} tempo={tempo} />
    <div style={{ display:"flex", gap:10, justifyContent:"center", marginTop:10 }}>
      {!on ? <button onClick={start} style={mkB(true)}>▶ Start Beat Pattern</button>
        : <button onClick={stop} style={{...mkB(false),borderColor:"#a33b3b",color:"#a33b3b"}}>■ Stop</button>}
    </div>
    {on && <div style={{ textAlign:"center", marginTop:5, fontSize:12, color:"#8a7e70" }}>Measure {mc}</div>}
  </div>;
}

function Ring({ s, label, size=76 }) {
  const r=(size-11)/2, c=2*Math.PI*r, p=(s/100)*c;
  const cl = s>=85?"#2d6a4f":s>=65?"#b08d3a":"#a33b3b";
  return <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e8e0d4" strokeWidth="4"/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={cl} strokeWidth="4" strokeDasharray={c} strokeDashoffset={c-p} strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`} style={{transition:"stroke-dashoffset 1.2s ease-out"}}/>
      <text x={size/2} y={size/2+1} textAnchor="middle" dominantBaseline="middle" style={{fontSize:size*.28,fontWeight:700,fill:cl,fontFamily:"var(--serif)"}}>{s}</text>
    </svg>
    <span style={{fontSize:10,fontWeight:600,color:"#6b5e50",letterSpacing:"0.05em",textTransform:"uppercase"}}>{label}</span>
  </div>;
}

function TempLine({ data, h=90 }) {
  const mx=Math.max(...data.map(d=>d.bpm))+3, mn=Math.min(...data.map(d=>d.bpm))-3, rng=mx-mn, w=100;
  const pts=data.map((d,i)=>`${(i/(data.length-1))*w},${((mx-d.bpm)/rng)*(h-22)+8}`).join(" ");
  const tY=((mx-84)/rng)*(h-22)+8;
  return <div>
    <div style={{fontSize:9,color:"#8a7e70",marginBottom:4,fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase"}}>Tempo (BPM) by Measure</div>
    <svg viewBox={`0 0 ${w} ${h}`} style={{width:"100%",height:h}}>
      <line x1="0" y1={tY} x2={w} y2={tY} stroke="#b08d3a" strokeWidth="0.5" strokeDasharray="2,2"/>
      <polyline points={pts} fill="none" stroke="#5c7a5e" strokeWidth="1.5" strokeLinejoin="round"/>
      {data.map((d,i)=><circle key={i} cx={(i/(data.length-1))*w} cy={((mx-d.bpm)/rng)*(h-22)+8} r="1.6" fill="#5c7a5e"/>)}
    </svg>
  </div>;
}

// Sheet music viewer — loads real PNG images from /sheet_music/
function SheetViewer({ hymn }) {
  const [pg, setPg] = useState(0);
  const [zm, setZm] = useState(1);
  const [imgErr, setImgErr] = useState({});
  const imgs = hymn?.images || [];
  const tot = imgs.length;
  if (!tot) return null;

  return <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",borderBottom:"1px solid #e8e0d4",background:"#faf6f0",flexShrink:0}}>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <button onClick={()=>setPg(Math.max(0,pg-1))} disabled={pg===0} style={{...tb,opacity:pg===0?.3:1}}>‹</button>
        <span style={{fontSize:12,color:"#6b5e50",fontWeight:600,minWidth:50,textAlign:"center"}}>{pg+1}/{tot}</span>
        <button onClick={()=>setPg(Math.min(tot-1,pg+1))} disabled={pg>=tot-1} style={{...tb,opacity:pg>=tot-1?.3:1}}>›</button>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:4}}>
        <button onClick={()=>setZm(Math.max(.5,zm-.15))} style={tb}>−</button>
        <span style={{fontSize:11,color:"#8a7e70",minWidth:34,textAlign:"center"}}>{Math.round(zm*100)}%</span>
        <button onClick={()=>setZm(Math.min(2,zm+.15))} style={tb}>+</button>
      </div>
    </div>
    <div style={{flex:1,overflow:"auto",padding:12,background:"#f0ece4"}}>
      {imgErr[pg] ? (
        // Fallback placeholder if image not found
        <div style={{width:"100%",aspectRatio:"396/571.5",background:"#fffef9",border:"1px solid #d4cfc5",borderRadius:4,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"8%",textAlign:"center",boxShadow:"0 2px 12px rgba(0,0,0,0.06)"}}>
          <div style={{fontSize:10,color:"#b08d3a",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:8}}>Zion's Hymns</div>
          <div style={{fontFamily:"var(--serif)",fontSize:20,color:"#3b3127",marginBottom:8}}>#{hymn.number} — {hymn.title}</div>
          <div style={{fontSize:12,color:"#8a7e70",marginBottom:16}}>Page {hymn.pages[pg]}</div>
          <div style={{fontSize:11,color:"#c4bdb0",fontStyle:"italic"}}>Image not found. Place sheet music PNGs in /sheet_music/ folder.</div>
        </div>
      ) : (
        <img
          src={`/sheet_music/${imgs[pg]}`}
          alt={`${hymn.title} — page ${pg+1}`}
          onError={() => setImgErr(prev => ({...prev, [pg]: true}))}
          style={{
            width:"100%", borderRadius:4, boxShadow:"0 2px 12px rgba(0,0,0,0.08)",
            transform:`scale(${zm})`, transformOrigin:"top center", transition:"transform .2s",
          }}
        />
      )}
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════

const V = { HOME:0, HYMNS:1, EX:2, PRAC:3, RES:4 };

export default function App() {
  const [hymnIndex, setHymnIndex] = useState([]);
  const [vw, setVw] = useState(V.HOME);
  const [hymn, setHymn] = useState(null);
  const [ex, setEx] = useState(null);
  const [mode, setMode] = useState("practice");
  const [rec, setRec] = useState(false);
  const [cd, setCd] = useState(null);
  const [el, setEl] = useState(0);
  const [res, setRes] = useState(null);
  const [pitchOn, setPO] = useState(false);
  const [filt, setFilt] = useState("All");
  const [sheet, setSheet] = useState(true);
  const [search, setSearch] = useState("");
  const tmr = useRef(null), actx = useRef(null);

  // Load the full hymn index from public/hymn_index.json
  useEffect(() => {
    fetch("/hymn_index.json")
      .then(r => r.json())
      .then(data => setHymnIndex(data))
      .catch(() => setHymnIndex([]));
  }, []);

  const item = hymn || ex;
  const isRhy = ex?.cat === "Rhythm";
  const ts = ex?.ts || "4/4";
  const tempo = ex?.tempo || 80;

  const playPitch = useCallback((key) => {
    const freq = {C:261.63,D:293.66,Eb:311.13,E:329.63,F:349.23,G:392,A:440,Bb:466.16}[key]||261.63;
    try { if(!actx.current) actx.current=new(window.AudioContext||window.webkitAudioContext)(); const c=actx.current,o=c.createOscillator(),g=c.createGain(); o.type="sine"; o.frequency.value=freq; g.gain.setValueAtTime(.3,c.currentTime); g.gain.exponentialRampToValueAtTime(.001,c.currentTime+2); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime+2); setPO(true); setTimeout(()=>setPO(false),2000); } catch(e){}
  }, []);

  const startRec = useCallback(() => {
    const ct = parseTS(ts).n; setCd(ct); let c = ct;
    const iv = setInterval(() => { c--; if(c<=0){ clearInterval(iv); setCd(null); setRec(true); setEl(0); const st=Date.now(); tmr.current=setInterval(()=>setEl(Math.floor((Date.now()-st)/1000)),200); } else setCd(c); }, (60/tempo)*1000);
  }, [ts, tempo]);

  const stopRec = useCallback(() => { setRec(false); clearInterval(tmr.current); setRes(simResults()); setVw(V.RES); }, []);
  useEffect(() => () => clearInterval(tmr.current), []);
  const goHome = () => { setVw(V.HOME); setHymn(null); setEx(null); setRes(null); setRec(false); setCd(null); clearInterval(tmr.current); setSearch(""); };
  const goBack = v => { setVw(v); setRec(false); setCd(null); setRes(null); clearInterval(tmr.current); };

  // ─── Recording Controls (shared) ──────────────────────────
  const Controls = () => {
    if (cd !== null) return <div style={{textAlign:"center",padding:"50px 20px",animation:"fadeUp .3s ease-out"}}>
      <div style={{fontSize:11,color:T.tm,marginBottom:12,fontWeight:600,letterSpacing:"0.1em",textTransform:"uppercase"}}>Count-in ({ts})</div>
      <div style={{fontFamily:"var(--serif)",fontSize:80,color:T.ac,lineHeight:1,animation:"pulse .5s ease-out"}}>{cd}</div>
      <div style={{fontSize:13,color:T.tm,marginTop:12}}>{tempo} BPM</div>
    </div>;
    if (rec) return <div style={{textAlign:"center",padding:"24px 20px",animation:"fadeUp .3s ease-out"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:20}}>
        <span style={{display:"inline-block",width:10,height:10,borderRadius:"50%",background:"#c0494f",boxShadow:"0 0 0 4px rgba(192,73,79,.25)",animation:"pulse 1.2s ease-in-out infinite"}}/>
        <span style={{fontSize:13,fontWeight:600,color:T.dg}}>Recording</span>
      </div>
      <div style={{fontFamily:"var(--serif)",fontSize:48,color:T.tx,marginBottom:6}}>{Math.floor(el/60)}:{String(el%60).padStart(2,"0")}</div>
      <div style={{fontSize:12,color:T.tm,marginBottom:20}}>{isRhy?"Count or clap the rhythm":"Sing the soprano line clearly"}</div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:2,height:44,marginBottom:20}}>
        {Array.from({length:28},(_,i)=><div key={i} style={{width:3,height:8+Math.random()*28,borderRadius:2,background:T.ac,opacity:.5+Math.random()*.5,animation:`pulse ${.4+Math.random()*.5}s ease-in-out infinite alternate`}}/>)}
      </div>
      <button onClick={stopRec} style={{...mkB(false),borderColor:T.dg,color:T.dg}}>■ Stop Recording</button>
    </div>;
    return <div style={{padding:20,animation:"fadeUp .4s ease-out"}}>
      {isRhy && <div style={{marginBottom:16}}><AnimBeat ts={ts} tempo={tempo}/></div>}
      {hymn && <div style={{marginBottom:16}}>
        <div style={{fontSize:11,fontWeight:600,color:T.tm,marginBottom:6,letterSpacing:"0.06em",textTransform:"uppercase"}}>Mode</div>
        <div style={{display:"flex",gap:6}}>
          {["practice","test"].map(m=><button key={m} onClick={()=>setMode(m)} style={{padding:"8px 18px",borderRadius:8,border:`1.5px solid ${mode===m?T.ac:T.cb}`,background:mode===m?"#e8f0e8":T.card,color:mode===m?T.ad:T.tm,fontSize:12,fontWeight:600,cursor:"pointer"}}>{m==="test"?"Leadership Test":"Practice"}</button>)}
        </div>
      </div>}
      <div style={{...mkC,cursor:"default",background:T.wl,borderColor:"#e8dcc4",padding:14}}>
        <div style={{fontSize:12,color:"#7a6c3d",lineHeight:1.5}}>
          {isRhy?`Count-in → count or clap the ${ts} rhythm → receive timing feedback.`
            :hymn?(mode==="practice"?"Count-in → sing a cappella → receive feedback.":"Leadership Test: evaluates count-off, tempo, and pitch stability.")
            :"Practice this exercise and receive feedback."}
        </div>
      </div>
      <div style={{textAlign:"center",marginTop:16}}>
        <button onClick={startRec} style={{...mkB(true),padding:"14px 40px",fontSize:15,borderRadius:12}}>
          {isRhy?"Begin Rhythm Drill":hymn?`Begin ${mode==="test"?"Test":"Practice"}`:"Begin Exercise"}
        </button>
      </div>
    </div>;
  };

  // ─── Results ──────────────────────────────────────────────
  const Results = () => {
    if (!res) return null;
    return <div style={{padding:20,animation:"fadeUp .5s ease-out"}}>
      <div style={{...mkC,cursor:"default",display:"flex",justifyContent:"space-around",padding:20}}>
        {!isRhy && <Ring s={res.ps} label="Pitch"/>}
        <Ring s={res.rs} label="Rhythm"/>
        {!isRhy && <Ring s={res.ls} label="Leadership"/>}
      </div>
      {isRhy && <div style={{...mkC,cursor:"default",padding:14}}><BeatVis ts={ts} tempo={tempo}/></div>}
      {!isRhy && <div style={{...mkC,cursor:"default",padding:14}}>
        <div style={{fontFamily:"var(--serif)",fontSize:15,marginBottom:10}}>Leadership Breakdown</div>
        {[{l:"Count-off",s:res.co,w:"30%"},{l:"Tempo Stability",s:res.ts,w:"40%"},{l:"Pitch Stability",s:res.pst,w:"30%"}].map((x,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
            <div style={{flex:1,fontSize:12,color:T.tm}}>{x.l} <span style={{fontSize:9,opacity:.6}}>({x.w})</span></div>
            <div style={{width:100,height:5,borderRadius:3,background:"#e8e0d4",overflow:"hidden"}}><div style={{height:"100%",borderRadius:3,width:`${x.s}%`,background:x.s>=85?"#5c7a5e":x.s>=65?"#b08d3a":"#a33b3b",transition:"width 1s ease-out"}}/></div>
            <span style={{fontSize:12,fontWeight:700,width:28,textAlign:"right"}}>{x.s}</span>
          </div>
        ))}
      </div>}
      <div style={{...mkC,cursor:"default",padding:14}}><TempLine data={res.tt}/></div>
      <div style={{...mkC,cursor:"default",padding:14}}>
        <div style={{fontFamily:"var(--serif)",fontSize:15,marginBottom:10}}>Feedback</div>
        {res.diag.map((d,i)=><div key={i} style={{display:"flex",gap:8,alignItems:"start",marginBottom:6,padding:"6px 10px",background:T.wl,borderRadius:6}}><span style={{fontSize:12}}>💡</span><span style={{fontSize:12,color:"#6b5c36",lineHeight:1.5}}>{d}</span></div>)}
      </div>
      <div style={{display:"flex",gap:10,marginTop:16,justifyContent:"center"}}>
        <button onClick={()=>{setRes(null);setVw(V.PRAC);}} style={mkB(true)}>Retry</button>
        <button onClick={goHome} style={mkB(false)}>Home</button>
      </div>
    </div>;
  };

  // ═══════════════════ HYMN PRACTICE (split layout) ═════════
  if ((vw===V.PRAC||vw===V.RES) && hymn) {
    return <><style>{css}</style><div style={{display:"flex",minHeight:"100vh",background:T.bg,fontFamily:"var(--sans)",color:T.tx}}>
      {sheet && <div style={{width:"50%",minWidth:280,maxWidth:540,borderRight:"1px solid #d4cfc5",display:"flex",flexDirection:"column",background:"#f5f1ea",height:"100vh",position:"sticky",top:0}}>
        <div style={{padding:"10px 12px",borderBottom:"1px solid #d4cfc5",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={{fontFamily:"var(--serif)",fontSize:14}}>p.{hymn.pages[0]}</span>
          <button onClick={()=>setSheet(false)} style={{...tb,fontSize:12}}>✕</button>
        </div>
        <SheetViewer hymn={hymn}/>
      </div>}
      <div style={{flex:1,minWidth:300,overflowY:"auto",maxHeight:"100vh"}}>
        <div style={{padding:"16px 20px 12px",borderBottom:`1px solid ${T.cb}`,display:"flex",alignItems:"center",gap:10}}>
          <button style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:T.tm,padding:"4px 8px"}} onClick={()=>goBack(V.HYMNS)}>←</button>
          <div style={{flex:1}}><div style={{fontFamily:"var(--serif)",fontSize:18}}>#{hymn.number} — {hymn.title}</div><div style={{fontSize:10,color:T.tm,letterSpacing:"0.06em",textTransform:"uppercase",fontWeight:500}}>{hymn.images.length} page{hymn.images.length!==1?"s":""}</div></div>
          {!sheet && <button onClick={()=>setSheet(true)} style={{...mkB(false),padding:"6px 12px",fontSize:11}}>🎵 Music</button>}
        </div>
        {vw===V.PRAC ? <Controls/> : <Results/>}
      </div>
    </div></>;
  }

  // ═══════════════════ EXERCISE PRACTICE ═════════════════════
  if ((vw===V.PRAC||vw===V.RES) && ex) {
    return <><style>{css}</style><div style={{minHeight:"100vh",background:T.bg,fontFamily:"var(--sans)",color:T.tx}}><div style={{maxWidth:540,margin:"0 auto",padding:"0 20px 40px"}}>
      <div style={{padding:"20px 0 12px",borderBottom:`1px solid ${T.cb}`,display:"flex",alignItems:"center",gap:10}}>
        <button style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:T.tm,padding:"4px 8px"}} onClick={()=>goBack(V.EX)}>←</button>
        <div><div style={{fontFamily:"var(--serif)",fontSize:18}}>{ex.title}</div><div style={{fontSize:10,color:T.tm,letterSpacing:"0.06em",textTransform:"uppercase",fontWeight:500}}>{ex.cat}{ex.ts?` · ${ex.ts}`:""}</div></div>
      </div>
      {vw===V.PRAC ? <Controls/> : <Results/>}
    </div></div></>;
  }

  // ═══════════════════ HOME ══════════════════════════════════
  if (vw===V.HOME) {
    return <><style>{css}</style><div style={{minHeight:"100vh",background:T.bg,fontFamily:"var(--sans)",color:T.tx}}><div style={{maxWidth:540,margin:"0 auto",padding:"0 20px 40px"}}>
      <div style={{textAlign:"center",padding:"40px 0 28px"}}>
        <div style={{width:64,height:64,borderRadius:"50%",background:`linear-gradient(135deg,${T.ac},${T.ad})`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",boxShadow:"0 6px 24px rgba(92,122,94,.25)"}}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        </div>
        <h1 style={{fontFamily:"var(--serif)",fontSize:26,fontWeight:400,marginBottom:4}}>Zion's Hymns</h1>
        <h2 style={{fontFamily:"var(--serif)",fontSize:16,fontWeight:400,color:T.tm,marginBottom:8}}>Song Leader Trainer</h2>
        <p style={{color:T.tm,fontSize:13,lineHeight:1.5,maxWidth:340,margin:"0 auto"}}>Practice leading a cappella from Zion's Hymns with evaluation on pitch, rhythm, and leadership stability.</p>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10,animation:"fadeUp .5s ease-out"}}>
        <div style={mkC} onClick={()=>setVw(V.HYMNS)} onMouseEnter={hov} onMouseLeave={uhov}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <span style={{fontSize:26}}>📖</span>
            <div><div style={{fontWeight:600,fontSize:14,marginBottom:2}}>Hymn Practice</div><div style={{fontSize:12,color:T.tm}}>Select from {hymnIndex.length} Zion's Hymns with real sheet music</div></div>
            <span style={{marginLeft:"auto",color:T.tl,fontSize:16}}>›</span>
          </div>
        </div>
        <div style={mkC} onClick={()=>setVw(V.EX)} onMouseEnter={hov} onMouseLeave={uhov}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <span style={{fontSize:26}}>🎯</span>
            <div><div style={{fontWeight:600,fontSize:14,marginBottom:2}}>Training Exercises</div><div style={{fontSize:12,color:T.tm}}>Scales, intervals, rhythm, tempo, and phrases</div></div>
            <span style={{marginLeft:"auto",color:T.tl,fontSize:16}}>›</span>
          </div>
        </div>
      </div>
      <div style={{marginTop:20,padding:16,background:T.wl,borderRadius:12,border:`1px solid ${T.cb}`}}>
        <div style={{fontWeight:600,fontSize:12,marginBottom:4,color:T.wm}}>📘 Zion's Hymns (2021 Edition)</div>
        <div style={{fontSize:12,color:T.tm,lineHeight:1.6}}>250 hymns adapted from Zion's Harp, formatted with shaped notes. Sheet music extracted from zions-hymns-pages.pdf.</div>
      </div>
    </div></div></>;
  }

  // ═══════════════════ HYMN SELECT ══════════════════════════
  if (vw===V.HYMNS) {
    const q = search.toLowerCase();
    const filtered = q ? hymnIndex.filter(h => h.title.toLowerCase().includes(q) || h.number.includes(q)) : hymnIndex;
    return <><style>{css}</style><div style={{minHeight:"100vh",background:T.bg,fontFamily:"var(--sans)",color:T.tx}}><div style={{maxWidth:540,margin:"0 auto",padding:"0 20px 40px"}}>
      <div style={{padding:"20px 0 12px",borderBottom:`1px solid ${T.cb}`,display:"flex",alignItems:"center",gap:10}}>
        <button style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:T.tm,padding:"4px 8px"}} onClick={goHome}>←</button>
        <div><div style={{fontFamily:"var(--serif)",fontSize:18}}>Zion's Hymns</div><div style={{fontSize:10,color:T.tm,letterSpacing:"0.06em",textTransform:"uppercase",fontWeight:500}}>{hymnIndex.length} hymns available</div></div>
      </div>
      {/* Search */}
      <div style={{marginTop:14,marginBottom:14}}>
        <input
          type="text" placeholder="Search by number or title..." value={search}
          onChange={e => setSearch(e.target.value)}
          style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${T.cb}`,background:T.card,fontSize:13,fontFamily:"var(--sans)",color:T.tx,outline:"none"}}
          onFocus={e => e.target.style.borderColor=T.ac}
          onBlur={e => e.target.style.borderColor=T.cb}
        />
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8,animation:"fadeUp .4s ease-out"}}>
        {filtered.length===0 && <div style={{textAlign:"center",padding:32,color:T.tm,fontSize:13}}>No hymns match "{search}"</div>}
        {filtered.map(h => (
          <div key={h.id} style={mkC} onClick={()=>{setHymn(h);setEx(null);setSheet(true);setVw(V.PRAC);}} onMouseEnter={hov} onMouseLeave={uhov}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontWeight:600,fontSize:14,marginBottom:2}}>#{h.number} — {h.title}</div>
                <div style={{fontSize:11,color:T.tm}}>{h.images.length} page{h.images.length!==1?"s":""} · p.{h.pages[0]}</div>
              </div>
              <span style={{color:T.tl,fontSize:14}}>›</span>
            </div>
          </div>
        ))}
      </div>
    </div></div></>;
  }

  // ═══════════════════ EXERCISES ═════════════════════════════
  if (vw===V.EX) {
    const cats = ["All", ...new Set(EXERCISES.map(e => e.cat))];
    const fl = filt==="All" ? EXERCISES : EXERCISES.filter(e => e.cat===filt);
    return <><style>{css}</style><div style={{minHeight:"100vh",background:T.bg,fontFamily:"var(--sans)",color:T.tx}}><div style={{maxWidth:540,margin:"0 auto",padding:"0 20px 40px"}}>
      <div style={{padding:"20px 0 12px",borderBottom:`1px solid ${T.cb}`,display:"flex",alignItems:"center",gap:10}}>
        <button style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:T.tm,padding:"4px 8px"}} onClick={goHome}>←</button>
        <div><div style={{fontFamily:"var(--serif)",fontSize:18}}>Training Exercises</div><div style={{fontSize:10,color:T.tm,letterSpacing:"0.06em",textTransform:"uppercase",fontWeight:500}}>{EXERCISES.length} exercises</div></div>
      </div>
      <div style={{display:"flex",gap:6,marginTop:14,marginBottom:14,flexWrap:"wrap"}}>
        {cats.map(c=><button key={c} onClick={()=>setFilt(c)} style={{padding:"5px 14px",borderRadius:20,border:`1.5px solid ${filt===c?T.ac:T.cb}`,background:filt===c?T.ac:T.card,color:filt===c?"#fff":T.tm,fontSize:11,fontWeight:600,cursor:"pointer"}}>{c}</button>)}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8,animation:"fadeUp .4s ease-out"}}>
        {fl.map(e=>(
          <div key={e.id} style={mkC} onClick={()=>{setEx(e);setHymn(null);setVw(V.PRAC);}} onMouseEnter={hov} onMouseLeave={uhov}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"start"}}>
              <div><div style={{fontWeight:600,fontSize:14,marginBottom:2}}>{e.title}</div><div style={{fontSize:11,color:T.tm}}>{e.desc}</div></div>
              <div style={{display:"flex",gap:4,flexShrink:0}}>
                {e.ts && <span style={mkTag("blue")}>{e.ts}</span>}
                <span style={mkTag(e.cat==="Rhythm"?"amber":"green")}>{e.cat}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div></div></>;
  }

  return null;
}
