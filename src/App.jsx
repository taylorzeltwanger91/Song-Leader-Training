import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { AudioRecorder, gradePerformance } from "./audio";

// ═══════════════════════════════════════════════════════════════
// TIME SIGNATURE ENGINE (all required meters)
// ═══════════════════════════════════════════════════════════════

const METERS = ["2/4","3/4","4/4","4/2","6/8","9/8","12/8"];

function parseTS(ts) { const [n,d]=(ts||"4/4").split("/").map(Number); return {n,d}; }

function isCompound(ts) { const {n,d}=parseTS(ts); return d>=8 && n>3 && n%3===0; }

function getBeatPattern(ts) {
  const {n,d}=parseTS(ts);
  if (isCompound(ts)) {
    const g=n/3, beats=[];
    for (let i=0;i<g;i++) { beats.push({s:"strong",g:i}); beats.push({s:"weak",g:i}); beats.push({s:"weak",g:i}); }
    return {beats,groups:g,compound:true,total:n,d,feltBeats:g};
  }
  const beats=[];
  for (let i=0;i<n;i++) { let s="weak"; if(i===0)s="strong"; else if(n===4&&i===2)s="medium"; beats.push({s,g:Math.floor(i/Math.max(1,Math.ceil(n/2)))}); }
  return {beats,groups:n<=3?1:2,compound:false,total:n,d,feltBeats:n};
}

// BPM interpretation per PRD
function getBpmUnit(ts) {
  const {d}=parseTS(ts);
  if (isCompound(ts)) return "dotted quarter";
  if (d===2) return "half note";
  return "quarter note";
}

function tsDesc(ts) {
  const {n,d}=parseTS(ts); const p=getBeatPattern(ts);
  if(p.compound) return `Compound: ${p.groups} groups of 3 eighths. BPM = dotted quarter.`;
  if(n===4&&d===4) return "Common time. BPM = quarter note.";
  if(n===3&&d===4) return "Waltz time. BPM = quarter note.";
  if(n===2&&d===4) return "March time. BPM = quarter note.";
  if(n===4&&d===2) return "Alla breve: 4 half-note beats. BPM = half note.";
  return `${n}/${d} time.`;
}

// ═══════════════════════════════════════════════════════════════
// MELODY GENERATOR (Hymn-Style Rules from PRD §4)
// ═══════════════════════════════════════════════════════════════

const KEYS = ["C","Db","D","Eb","E","F","F#","G","Ab","A","Bb","B"];
const MAJOR_SCALE = [0,2,4,5,7,9,11]; // intervals from root
const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

function midiToFreq(m) { return 440 * Math.pow(2, (m-69)/12); }
function scaleDegToMidi(root, deg, octave=4) {
  const rootMidi = 60 + KEYS.indexOf(root); // C4 = 60 base
  const interval = MAJOR_SCALE[((deg-1)%7+7)%7];
  const octShift = Math.floor((deg-1)/7);
  return rootMidi + interval + (octave-4)*12 + octShift*12;
}

// Rhythm templates per meter (note durations in beats)
function getRhythmTemplates(ts) {
  const {n,d}=parseTS(ts);
  if (isCompound(ts)) {
    // Compound: beats are in eighth notes, group by 3
    const g = n/3;
    // Each group = 3 eighth notes. Templates for one group:
    const groupTemplates = [
      [3],        // dotted quarter (one note per group)
      [2,1],      // quarter + eighth
      [1,2],      // eighth + quarter
      [1,1,1],    // three eighths
    ];
    // Build full-measure templates by combining groups
    const templates = [];
    for (let i=0; i<6; i++) {
      const t = [];
      for (let gi=0; gi<g; gi++) t.push(...groupTemplates[Math.floor(Math.random()*groupTemplates.length)]);
      templates.push(t);
    }
    return templates;
  }
  // Simple meters: durations in quarter-note beats (or half-note beats for 4/2)
  const templates = {
    "2/4": [[2],[1,1],[1,0.5,0.5],[0.5,0.5,1]],
    "3/4": [[3],[2,1],[1,2],[1,1,1],[2,0.5,0.5],[0.5,0.5,1,1]],
    "4/4": [[4],[2,2],[2,1,1],[1,1,2],[1,1,1,1],[3,1],[1,3],[2,1,0.5,0.5]],
    "4/2": [[4],[2,2],[2,1,1],[1,1,2],[1,1,1,1],[3,1]],
  };
  return templates[ts] || templates["4/4"];
}

function generateMelody(ts, bpm, measures, key) {
  const {n,d}=parseTS(ts);
  const comp = isCompound(ts);
  const beatsPerMeasure = comp ? n : n; // in subdivision units
  const rhythmTemplates = getRhythmTemplates(ts);

  // Build rhythm for all measures
  const rhythm = [];
  for (let m=0; m<measures; m++) {
    const tmpl = rhythmTemplates[Math.floor(Math.random()*rhythmTemplates.length)];
    // Ensure template sums to beatsPerMeasure (for compound) or n (for simple)
    const targetSum = comp ? n : n * (d===2?1:1);
    let sum = tmpl.reduce((a,b)=>a+b,0);
    if (Math.abs(sum-targetSum)<0.01) {
      tmpl.forEach(dur => rhythm.push({dur, measure:m}));
    } else {
      // Fallback: fill with equal notes
      for (let i=0;i<n;i++) rhythm.push({dur:1, measure:m});
    }
  }

  // Generate scale degrees (hymn-style: §4.1)
  const notes = [];
  let prevDeg = 1; // start on tonic
  const chordTones = [1,3,5];

  for (let i=0; i<rhythm.length; i++) {
    const r = rhythm[i];
    const isFirst = i===0;
    const isLast = i===rhythm.length-1;
    const isSecondLast = i===rhythm.length-2;
    const isMeasureStart = i===0 || rhythm[i-1]?.measure !== r.measure;

    let deg;
    if (isFirst) { deg = 1; }
    else if (isLast) { deg = 1; } // end on tonic
    else if (isSecondLast) {
      // Cadence: approach tonic from 2 or 7
      deg = Math.random()<0.6 ? 2 : 7;
    }
    else {
      // Hymn-style motion: 60-80% stepwise
      const stepwise = Math.random() < 0.7;
      if (stepwise) {
        const dir = Math.random()<0.5 ? 1 : -1;
        deg = prevDeg + dir;
      } else {
        // Leap: mostly 3rds, occasional 4th/5th
        const leapSize = Math.random()<0.6 ? 2 : (Math.random()<0.7 ? 3 : 4);
        const dir = Math.random()<0.5 ? 1 : -1;
        deg = prevDeg + dir * leapSize;
      }
      // Keep in range (1-8 for one octave)
      deg = Math.max(1, Math.min(8, deg));
      // Strong beats favor chord tones
      if (isMeasureStart && !chordTones.includes(((deg-1)%7)+1)) {
        const nearest = chordTones.reduce((a,b) => Math.abs(b-deg)<Math.abs(a-deg)?b:a);
        if (Math.random()<0.5) deg = nearest;
      }
    }
    const midi = scaleDegToMidi(key, deg);
    notes.push({ deg, midi, dur: r.dur, measure: r.measure, freq: midiToFreq(midi) });
    prevDeg = deg;
  }
  return notes;
}

// ═══════════════════════════════════════════════════════════════
// LYRICS SYSTEM (with syllable complexity + melisma control)
// ═══════════════════════════════════════════════════════════════

// Words organized by syllable count
const WORDS_1 = ["praise","Lord","God","love","grace","light","peace","joy","sing","hope","faith","trust","rest","life","soul","heart","come","rise","shine","stand","walk","know","hear","call","seek","save","bless","hold","keep","give","grow","heal","reign","dwell","fill","lead","guide","watch","lift","cry","pray","cling","bow","kneel","stay"];
const WORDS_2 = ["Je-sus","Fa-ther","glo-ry","mer-cy","bless-ing","king-dom","hea-ven","wor-ship","prais-es","ho-ly","gra-cious","faith-ful","gen-tle","hum-ble","stead-fast","ev-er","free-dom","glad-ness","good-ness","par-don","ref-uge","sav-ior","shep-herd","spir-it","tem-ple","tri-umph","vic-try","wis-dom","won-der","com-fort"];
const WORDS_3 = ["beau-ti-ful","glo-ri-ous","heaven-ly","right-eous-ness","ev-er-more","hal-le-lu","sanc-tu-a","for-ev-er","gra-cious-ly","faith-ful-ness","won-der-ful","pil-grim-age","sac-ri-fice","cov-en-ant","re-deem-er","de-liv-er","cel-e-brate","mag-ni-fy","tes-ti-fy","glo-ri-fy"];

function tokenize(word) { return word.includes("-") ? word.split("-") : [word]; }

function buildTokenList(syllableLevel) {
  // syllableLevel: 1 = only 1-syllable, 2 = mix of 1+2, 3 = mix of 1+2+3
  let pool = [];
  if (syllableLevel >= 1) pool.push(...WORDS_1.map(w => ({word:w, tokens:tokenize(w)})));
  if (syllableLevel >= 2) pool.push(...WORDS_2.map(w => ({word:w, tokens:tokenize(w)})));
  if (syllableLevel >= 3) pool.push(...WORDS_3.map(w => ({word:w, tokens:tokenize(w)})));
  return pool;
}

function assignLyrics(notes, melismaPercent=0, syllableLevel=1) {
  const pool = buildTokenList(syllableLevel);
  // Build a token stream by picking random words
  let allTokens = [];
  while (allTokens.length < notes.length * 2) {
    const w = pool[Math.floor(Math.random()*pool.length)];
    allTokens.push(...w.tokens);
  }

  // Determine melisma positions
  const melismaStarts = new Set();
  if (melismaPercent > 0 && notes.length > 6) {
    const count = Math.max(1, Math.round(notes.length * (melismaPercent/100)));
    for (let attempt=0; attempt<count*20 && melismaStarts.size<count; attempt++) {
      const pos = 2 + Math.floor(Math.random()*(notes.length-4));
      if (pos < notes.length-1 && Math.abs(notes[pos].deg - notes[pos+1].deg) <= 2 && !melismaStarts.has(pos-1) && !melismaStarts.has(pos+1)) {
        melismaStarts.add(pos);
      }
    }
  }

  const lyrics = [];
  let ti = 0;
  let inMelisma = 0; // counts remaining extension notes

  for (let i=0; i<notes.length; i++) {
    if (inMelisma > 0) {
      lyrics.push({ text: "—", melisma: true });
      inMelisma--;
    } else if (melismaStarts.has(i)) {
      // Start a melisma: 2-3 notes on one syllable
      const len = Math.random() < 0.5 ? 2 : 3;
      const actualLen = Math.min(len, notes.length - i - 1);
      lyrics.push({ text: allTokens[ti % allTokens.length] || "la", melisma: false, melismaStart: true });
      ti++;
      inMelisma = actualLen;
    } else {
      lyrics.push({ text: allTokens[ti % allTokens.length] || "la", melisma: false });
      ti++;
    }
  }
  return lyrics;
}

// ═══════════════════════════════════════════════════════════════
// SIMULATION & SCORING
// ═══════════════════════════════════════════════════════════════

function simResults(noteCount) {
  const mc = noteCount || 16;
  const b=70, v=()=>Math.floor(Math.random()*22);
  const ps=Math.min(100,b+v()), rs=Math.min(100,b+v());
  const co=Math.min(100,b+5+v()), ts2=Math.min(100,b+v()), pst=Math.min(100,b+v());
  const ls=Math.round(co*.3+ts2*.4+pst*.3);
  const pt=Array.from({length:Math.min(mc,20)},(_,i)=>{const d=(Math.random()-.4)*(i/mc)*30;return{m:i+1,c:Math.round(d),sh:d>10,fl:d<-10};});
  const tt=Array.from({length:Math.min(mc,20)},(_,i)=>({m:i+1,bpm:Math.round(84+(Math.random()-.45)*8+(i>mc*.6?-3:0))}));
  const diag=[];
  if(tt.slice(-4).every(t=>t.bpm<82))diag.push("Tempo slows after verse 2");
  if(pt.slice(-3).some(p=>p.fl))diag.push("Pitch drifts flat approaching cadences");
  if(pt[0]?.c>8)diag.push("Entrance is slightly sharp");
  if(rs<75)diag.push("Beat alignment inconsistent in middle measures");
  if(!diag.length)diag.push("Steady performance — well done.");
  return {ps,rs,ls,co,ts:ts2,pst,pt,tt,diag,pm:pt.filter(p=>p.sh||p.fl).map(p=>p.m)};
}

// ═══════════════════════════════════════════════════════════════
// SHARED UI COMPONENTS
// ═══════════════════════════════════════════════════════════════

const T={bg:"#faf6f0",card:"#fff",cb:"#e8e0d4",ac:"#5c7a5e",ad:"#3d5640",wm:"#b08d3a",wl:"#f5eedc",dg:"#a33b3b",tx:"#3b3127",tm:"#8a7e70",tl:"#b5a998"};
const mkB=p=>({display:"inline-flex",alignItems:"center",justifyContent:"center",gap:8,padding:"10px 24px",borderRadius:10,border:p?"none":"1.5px solid #e8e0d4",background:p?"#5c7a5e":"#fff",color:p?"#fff":"#3b3127",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"var(--sans)"});
const mkTag=c=>({display:"inline-block",padding:"2px 8px",borderRadius:20,fontSize:9,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",background:{green:"#e8f0e8",amber:"#f5eedc",blue:"#e4ecf5",red:"#f0e8e8",rose:"#f5e4ea"}[c]||"#f0ece4",color:{green:"#3d5640",amber:"#8a6d1f",blue:"#3a5a8a",red:"#7a2e2e",rose:"#8a3a5a"}[c]||"#6b5e50"});
const mkC={background:T.card,border:`1px solid ${T.cb}`,borderRadius:12,padding:16,marginBottom:10,cursor:"pointer",transition:"box-shadow .2s,border-color .2s"};
const hov=e=>{e.currentTarget.style.boxShadow="0 4px 16px rgba(92,122,94,0.1)";e.currentTarget.style.borderColor=T.ac;};
const uhov=e=>{e.currentTarget.style.boxShadow="none";e.currentTarget.style.borderColor=T.cb;};
const tbS={width:28,height:28,borderRadius:6,border:"1px solid #d4cfc5",background:"#fff",color:"#5c5047",fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:600};
const css=`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=DM+Serif+Display&display=swap');:root{--serif:'DM Serif Display',serif;--sans:'DM Sans',sans-serif}*{box-sizing:border-box;margin:0}@keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.6);opacity:.6}}@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}body{margin:0}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#c4bdb0;border-radius:3px}`;

function BeatVis({ts,act=-1,on=false,tempo=80}) {
  const p=getBeatPattern(ts);
  const grps=[];let cur=[],lg=0;
  p.beats.forEach((b,i)=>{if(i>0&&b.g!==lg){grps.push(cur);cur=[];}cur.push({...b,i});lg=b.g;});
  if(cur.length)grps.push(cur);
  return <div style={{background:"#faf6f0",border:"1px solid #e8e0d4",borderRadius:10,padding:14}}>
    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
      <div style={{fontFamily:"var(--serif)",fontSize:26,lineHeight:1,color:"#3b3127",display:"flex",flexDirection:"column",alignItems:"center",width:36}}>
        <span>{parseTS(ts).n}</span><div style={{width:22,height:2,background:"#3b3127",margin:"2px 0"}}/><span>{parseTS(ts).d}</span>
      </div>
      <div style={{fontSize:12,color:"#6b5e50",lineHeight:1.5,flex:1}}>{tsDesc(ts)}</div>
    </div>
    <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
      {grps.map((g,gi)=><div key={gi} style={{display:"flex",gap:5,padding:"7px 10px",background:"#fff",borderRadius:8,border:"1px solid #e8e0d4"}}>
        {g.map(b=>{const a=on&&act===b.i;const sz=b.s==="strong"?34:b.s==="medium"?26:20;const cl=b.s==="strong"?"#5c7a5e":b.s==="medium"?"#b08d3a":"#c4bdb0";const al=b.s==="strong"?"#2d6a4f":b.s==="medium"?"#8a6d1f":"#8a7e70";
          return <div key={b.i} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
            <div style={{width:sz,height:sz,borderRadius:"50%",background:a?al:cl,opacity:a?1:b.s==="weak"?.4:.7,transform:a?"scale(1.2)":"scale(1)",transition:"all .1s",boxShadow:a?`0 0 0 4px ${al}33`:"none",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <span style={{color:"#fff",fontSize:sz*.35,fontWeight:700}}>{b.i+1}</span>
            </div>
            <span style={{fontSize:7,fontWeight:700,color:b.s==="strong"?"#5c7a5e":b.s==="medium"?"#b08d3a":"#b5a998"}}>{b.s==="strong"?"S":b.s==="medium"?"M":"w"}</span>
          </div>;})}
      </div>)}
    </div>
  </div>;
}

function AnimBeat({ts,tempo=80}) {
  const [act,setAct]=useState(-1);const [on,setOn]=useState(false);const [mc,setMc]=useState(0);
  const iv=useRef(null),ax=useRef(null);const p=getBeatPattern(ts);
  const click=useCallback(s=>{try{if(!ax.current)ax.current=new(window.AudioContext||window.webkitAudioContext)();const c=ax.current,o=c.createOscillator(),g=c.createGain();o.type="triangle";o.frequency.value=s==="strong"?880:s==="medium"?660:440;g.gain.setValueAtTime(s==="strong"?.3:.12,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.08);o.connect(g).connect(c.destination);o.start();o.stop(c.currentTime+.08);}catch(e){}},[]);
  const start=useCallback(()=>{setOn(true);setMc(0);let idx=0;const tick=()=>{const b=idx%p.total;setAct(b);if(b===0)setMc(c=>c+1);click(p.beats[b].s);idx++;};tick();iv.current=setInterval(tick,(60/tempo)*1000);},[tempo,p,click]);
  const stop=useCallback(()=>{setOn(false);setAct(-1);clearInterval(iv.current);},[]);
  useEffect(()=>()=>clearInterval(iv.current),[]);
  return <div><BeatVis ts={ts} act={act} on={on} tempo={tempo}/>
    <div style={{display:"flex",gap:10,justifyContent:"center",marginTop:10}}>
      {!on?<button onClick={start} style={mkB(true)}>▶ Start Beat Pattern</button>
        :<button onClick={stop} style={{...mkB(false),borderColor:"#a33b3b",color:"#a33b3b"}}>■ Stop</button>}
    </div>
    {on&&<div style={{textAlign:"center",marginTop:5,fontSize:12,color:"#8a7e70"}}>Measure {mc}</div>}
  </div>;
}

function Ring({s,label,size=76}) {
  const r=(size-11)/2,c=2*Math.PI*r,p=(s/100)*c;const cl=s>=85?"#2d6a4f":s>=65?"#b08d3a":"#a33b3b";
  return <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}><circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e8e0d4" strokeWidth="4"/><circle cx={size/2} cy={size/2} r={r} fill="none" stroke={cl} strokeWidth="4" strokeDasharray={c} strokeDashoffset={c-p} strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`} style={{transition:"stroke-dashoffset 1.2s ease-out"}}/><text x={size/2} y={size/2+1} textAnchor="middle" dominantBaseline="middle" style={{fontSize:size*.28,fontWeight:700,fill:cl,fontFamily:"var(--serif)"}}>{s}</text></svg>
    <span style={{fontSize:10,fontWeight:600,color:"#6b5e50",letterSpacing:"0.05em",textTransform:"uppercase"}}>{label}</span>
  </div>;
}

function TempLine({data,h=90}) {
  if(!data?.length)return null;
  const mx=Math.max(...data.map(d=>d.bpm))+3,mn=Math.min(...data.map(d=>d.bpm))-3,rng=mx-mn||1,w=100;
  const pts=data.map((d,i)=>`${(i/(data.length-1))*w},${((mx-d.bpm)/rng)*(h-22)+8}`).join(" ");
  const tY=((mx-84)/rng)*(h-22)+8;
  return <div><div style={{fontSize:9,color:"#8a7e70",marginBottom:4,fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase"}}>Tempo by Measure</div>
    <svg viewBox={`0 0 ${w} ${h}`} style={{width:"100%",height:h}}><line x1="0" y1={tY} x2={w} y2={tY} stroke="#b08d3a" strokeWidth="0.5" strokeDasharray="2,2"/><polyline points={pts} fill="none" stroke="#5c7a5e" strokeWidth="1.5" strokeLinejoin="round"/>{data.map((d,i)=><circle key={i} cx={(i/(data.length-1))*w} cy={((mx-d.bpm)/rng)*(h-22)+8} r="1.6" fill="#5c7a5e"/>)}</svg>
  </div>;
}

// Note display for generated exercises
function NoteDisplay({notes,lyrics,currentNote=-1}) {
  if(!notes?.length)return null;
  const measures={};
  notes.forEach((n,i)=>{if(!measures[n.measure])measures[n.measure]=[];measures[n.measure].push({...n,idx:i,lyric:lyrics?.[i]});});
  const degNames=["","Do","Re","Mi","Fa","Sol","La","Ti","Do'"];
  const midiName=(midi)=>{const names=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];return names[midi%12]+(Math.floor(midi/12)-1);};
  const firstNote = notes[0];
  const measureList = Object.entries(measures);
  // Determine measures per row based on notes per measure (fewer notes = more measures per row)
  const avgNotes = notes.length / measureList.length;
  const measPerRow = avgNotes <= 3 ? 4 : avgNotes <= 5 ? 3 : 2;
  // Split into rows
  const rows = [];
  for (let i=0; i<measureList.length; i+=measPerRow) rows.push(measureList.slice(i, i+measPerRow));

  return <div style={{background:"#fff",border:"1px solid #e8e0d4",borderRadius:10,padding:14}}>
    {/* Starting note callout */}
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,padding:"8px 12px",background:"#e8f0e8",borderRadius:8,border:"1px solid #c4d9c4"}}>
      <div style={{width:32,height:32,borderRadius:"50%",background:"#5c7a5e",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
        <span style={{color:"#fff",fontSize:14,fontWeight:700}}>1</span>
      </div>
      <div>
        <div style={{fontSize:12,fontWeight:600,color:"#3d5640"}}>Start on: {midiName(firstNote.midi)} ({degNames[firstNote.deg]})</div>
        <div style={{fontSize:10,color:"#6b8a6d"}}>Play the starting pitch button to hear this note</div>
      </div>
    </div>
    {/* Note grid — wrapping rows */}
    {rows.map((row,ri)=>(
      <div key={ri} style={{display:"flex",gap:0,marginBottom:ri<rows.length-1?12:0,borderBottom:ri<rows.length-1?"1px solid #f0ece4":"none",paddingBottom:ri<rows.length-1?12:0}}>
        {row.map(([m,noteList],mi)=>(
          <div key={m} style={{flex:1,display:"flex",flexDirection:"column",borderRight:mi<row.length-1?"1px solid #e8e0d4":"none",paddingRight:mi<row.length-1?6:0,marginRight:mi<row.length-1?6:0}}>
            <div style={{fontSize:8,color:T.tl,marginBottom:4}}>m.{parseInt(m)+1}</div>
            <div style={{display:"flex",gap:1,justifyContent:"space-around"}}>
              {noteList.map((n,ni)=>{
                const active=currentNote===n.idx;
                const isFirst=n.idx===0;
                // Scale bar height: map deg 1-8 to visual height
                const minH=10, maxH=52;
                const barH=minH+((n.deg-1)/7)*(maxH-minH);
                const barW=n.dur>1.5?"70%":n.dur>0.75?"55%":"40%";
                return <div key={ni} style={{display:"flex",flexDirection:"column",alignItems:"center",flex:1,minWidth:0,gap:1}}>
                  <div style={{height:56,display:"flex",alignItems:"end",justifyContent:"center",width:"100%"}}>
                    <div style={{width:barW,maxWidth:24,height:barH,borderRadius:2,background:isFirst?"#2d6a4f":active?T.ac:"#c4bdb0",opacity:active||isFirst?1:.55,transition:"all .15s",border:isFirst?"2px solid #1a4a2f":"none"}}/>
                  </div>
                  <span style={{fontSize:Math.min(10,9),fontWeight:700,color:isFirst?"#2d6a4f":active?T.ac:"#6b5e50",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"100%",textAlign:"center"}}>{midiName(n.midi)}</span>
                  <span style={{fontSize:7,color:T.tl,lineHeight:1}}>{degNames[n.deg]||""}</span>
                  <span style={{fontSize:Math.min(9,8),color:n.lyric?.melisma?"#b08d3a":T.tx,fontWeight:n.lyric?.melisma?400:500,fontStyle:n.lyric?.melisma?"italic":"normal",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"100%",textAlign:"center"}}>{n.lyric?.text||""}</span>
                </div>;
              })}
            </div>
          </div>
        ))}
      </div>
    ))}
  </div>;
}

// Sheet music viewer for real hymn pages
function SheetViewer({hymn}) {
  const [pg,setPg]=useState(0);const [zm,setZm]=useState(1);const [err,setErr]=useState({});
  const imgs=hymn?.images||[];const tot=imgs.length;if(!tot)return null;
  return <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",borderBottom:"1px solid #e8e0d4",background:"#faf6f0",flexShrink:0}}>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <button onClick={()=>setPg(Math.max(0,pg-1))} disabled={pg===0} style={{...tbS,opacity:pg===0?.3:1}}>‹</button>
        <span style={{fontSize:12,color:"#6b5e50",fontWeight:600,minWidth:50,textAlign:"center"}}>{pg+1}/{tot}</span>
        <button onClick={()=>setPg(Math.min(tot-1,pg+1))} disabled={pg>=tot-1} style={{...tbS,opacity:pg>=tot-1?.3:1}}>›</button>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:4}}>
        <button onClick={()=>setZm(Math.max(.5,zm-.15))} style={tbS}>−</button>
        <span style={{fontSize:11,color:"#8a7e70",minWidth:34,textAlign:"center"}}>{Math.round(zm*100)}%</span>
        <button onClick={()=>setZm(Math.min(2,zm+.15))} style={tbS}>+</button>
      </div>
    </div>
    <div style={{flex:1,overflow:"auto",padding:12,background:"#f0ece4"}}>
      {err[pg]?<div style={{width:"100%",aspectRatio:"396/571.5",background:"#fffef9",border:"1px solid #d4cfc5",borderRadius:4,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"8%",textAlign:"center"}}>
        <div style={{fontFamily:"var(--serif)",fontSize:20,color:"#3b3127",marginBottom:8}}>#{hymn.number} — {hymn.title}</div>
        <div style={{fontSize:11,color:"#c4bdb0",fontStyle:"italic"}}>Image not found. Place PNGs in /sheet_music/</div>
      </div>
      :<img src={`/sheet_music/${imgs[pg]}`} alt={`${hymn.title} p${pg+1}`} onError={()=>setErr(p=>({...p,[pg]:true}))} style={{width:"100%",borderRadius:4,boxShadow:"0 2px 12px rgba(0,0,0,0.08)",transform:`scale(${zm})`,transformOrigin:"top center",transition:"transform .2s"}}/>}
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════

const V={HOME:0,HYMNS:1,GEN:2,PRAC:3,RES:4,GEN_PRAC:5,GEN_RES:6};

export default function App() {
  const [hymnIndex,setHymnIndex]=useState([]);
  const [vw,setVw]=useState(V.HOME);
  const [hymn,setHymn]=useState(null);
  const [mode,setMode]=useState("practice");
  const [rec,setRec]=useState(false);
  const [cd,setCd]=useState(null);
  const [el,setEl]=useState(0);
  const [res,setRes]=useState(null);
  const [pitchOn,setPO]=useState(false);
  const [sheet,setSheet]=useState(true);
  const [search,setSearch]=useState("");
  // Generator settings
  const [genTS,setGenTS]=useState("4/4");
  const [genBPM,setGenBPM]=useState(80);
  const [genMeasures,setGenMeasures]=useState(8);
  const [genKey,setGenKey]=useState("auto");
  const [genSyllables,setGenSyllables]=useState(1); // 1, 2, or 3
  const [genMelisma,setGenMelisma]=useState(0); // 0-40 percent
  const [genNotes,setGenNotes]=useState(null);
  const [genLyrics,setGenLyrics]=useState(null);
  const [genActualKey,setGenActualKey]=useState("C");
  const [melodyPlaying,setMelodyPlaying]=useState(false);
  const melodyTimers=useRef([]);
  const melodyOscs=useRef([]);

  // Audio recording state
  const [currentPitch, setCurrentPitch] = useState(null);
  const [audioError, setAudioError] = useState(null);
  const [micPermission, setMicPermission] = useState('pending'); // 'pending', 'granted', 'denied'
  const recorderRef = useRef(null);

  // Mic test state
  const [micTesting, setMicTesting] = useState(false);
  const micTestRef = useRef(null);

  // Hymn melody data (when available)
  const [hymnMelody, setHymnMelody] = useState(null);
  const [hymnMelodyLoading, setHymnMelodyLoading] = useState(false);

  const tmr=useRef(null),actx=useRef(null);

  // Load hymn melody when a hymn is selected
  useEffect(() => {
    if (!hymn) {
      setHymnMelody(null);
      return;
    }
    setHymnMelodyLoading(true);
    fetch(`/hymn_melodies/${hymn.id}.json`)
      .then(r => {
        if (!r.ok) throw new Error('No melody');
        return r.json();
      })
      .then(data => {
        // Convert melody data to the format expected by grader
        const notes = data.notes.map(n => ({
          midi: n.midi,
          freq: 440 * Math.pow(2, (n.midi - 69) / 12),
          dur: n.dur,
          measure: n.measure,
          lyric: n.lyric
        }));
        setHymnMelody({ ...data, notes });
        setHymnMelodyLoading(false);
      })
      .catch(() => {
        setHymnMelody(null);
        setHymnMelodyLoading(false);
      });
  }, [hymn]);

  // Load the full hymn index from public/hymn_index.json
  useEffect(() => {
    fetch("/hymn_index.json")
      .then(r => r.json())
      .then(data => setHymnIndex(data))
      .catch(() => setHymnIndex([]));
  }, []);

  // Microphone test functions
  const startMicTest = useCallback(async () => {
    setAudioError(null);
    setCurrentPitch(null);

    if (!micTestRef.current) {
      micTestRef.current = new AudioRecorder({
        smoothingFactor: 0.9, // Extra smooth for testing
        onPitchDetected: (pitch) => setCurrentPitch(pitch),
        onError: (err) => {
          setAudioError(err.message || 'Microphone error');
          setMicTesting(false);
        }
      });
    }

    const success = await micTestRef.current.init();
    if (!success) {
      setAudioError('Microphone access denied. Please allow microphone access in your browser settings.');
      setMicTesting(false);
      return;
    }

    setMicTesting(true);
    micTestRef.current.start();
  }, []);

  const stopMicTest = useCallback(() => {
    setMicTesting(false);
    setCurrentPitch(null);
    if (micTestRef.current) {
      micTestRef.current.stop();
      micTestRef.current.destroy();
      micTestRef.current = null;
    }
  }, []);

  // Play the full generated melody as audio
  const playMelodyAudio = useCallback(() => {
    if (!genNotes?.length) return;
    try {
      if (!actx.current) actx.current = new (window.AudioContext||window.webkitAudioContext)();
      const ctx = actx.current;
      setMelodyPlaying(true);
      // Clear any previous playback
      melodyOscs.current.forEach(o => { try{o.stop();}catch(e){} });
      melodyTimers.current.forEach(t => clearTimeout(t));
      melodyOscs.current = [];
      melodyTimers.current = [];

      const comp = isCompound(genTS);
      // For compound meters: each dur unit = one eighth note, BPM = dotted quarter = 3 eighths
      // So eighth note duration = 60 / (BPM * 3) for compound
      // For simple meters: dur unit = quarter note (or half note for 4/2)
      const {d} = parseTS(genTS);
      let secPerUnit;
      if (comp) {
        // dur units are eighth notes, BPM is dotted quarter (3 eighths)
        secPerUnit = 60 / (genBPM * 3);
      } else if (d === 2) {
        // dur units are half notes, BPM is half note
        secPerUnit = 60 / genBPM;
      } else {
        // dur units are quarter notes, BPM is quarter note
        secPerUnit = 60 / genBPM;
      }

      let time = ctx.currentTime + 0.1; // small delay
      genNotes.forEach((note, i) => {
        const dur = note.dur * secPerUnit;
        const noteTime = time;
        // Schedule oscillator
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = note.freq;
        // Gentle envelope: attack 30ms, sustain, release 60ms
        gain.gain.setValueAtTime(0, noteTime);
        gain.gain.linearRampToValueAtTime(0.25, noteTime + 0.03);
        gain.gain.setValueAtTime(0.25, noteTime + dur - 0.06);
        gain.gain.linearRampToValueAtTime(0, noteTime + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(noteTime);
        osc.stop(noteTime + dur);
        melodyOscs.current.push(osc);
        time += dur;
      });
      // Set timeout to mark playback as done
      const totalDur = (time - ctx.currentTime) * 1000;
      const endTimer = setTimeout(() => setMelodyPlaying(false), totalDur);
      melodyTimers.current.push(endTimer);
    } catch(e) { setMelodyPlaying(false); }
  }, [genNotes, genTS, genBPM]);

  const stopMelody = useCallback(() => {
    melodyOscs.current.forEach(o => { try{o.stop();}catch(e){} });
    melodyTimers.current.forEach(t => clearTimeout(t));
    melodyOscs.current = [];
    melodyTimers.current = [];
    setMelodyPlaying(false);
  }, []);

  const doGenerate = useCallback(() => {
    const key = genKey==="auto" ? KEYS[Math.floor(Math.random()*KEYS.length)] : genKey;
    setGenActualKey(key);
    const notes = generateMelody(genTS, genBPM, genMeasures, key);
    const lyrics = assignLyrics(notes, genMelisma, genSyllables);
    setGenNotes(notes);
    setGenLyrics(lyrics);
  }, [genTS, genBPM, genMeasures, genKey, genSyllables, genMelisma]);

  const playPitch = useCallback((key) => {
    const freq={C:261.63,Db:277.18,D:293.66,Eb:311.13,E:329.63,F:349.23,"F#":369.99,G:392,Ab:415.3,A:440,Bb:466.16,B:493.88}[key]||261.63;
    try{if(!actx.current)actx.current=new(window.AudioContext||window.webkitAudioContext)();const c=actx.current,o=c.createOscillator(),g=c.createGain();o.type="sine";o.frequency.value=freq;g.gain.setValueAtTime(.3,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+2);o.connect(g).connect(c.destination);o.start();o.stop(c.currentTime+2);setPO(true);setTimeout(()=>setPO(false),2000);}catch(e){}
  }, []);

  const startRec = useCallback(async (ts, tempo, referenceMelody = null) => {
    // Stop mic test if running
    if (micTestRef.current) {
      micTestRef.current.stop();
      micTestRef.current.destroy();
      micTestRef.current = null;
      setMicTesting(false);
    }

    setAudioError(null);
    setCurrentPitch(null);

    // Initialize recorder if not already done
    if (!recorderRef.current) {
      recorderRef.current = new AudioRecorder({
        onPitchDetected: (pitch) => setCurrentPitch(pitch),
        onError: (err) => setAudioError(err.message || 'Microphone error')
      });
    }

    // Request microphone permission and initialize
    const recorder = recorderRef.current;
    const success = await recorder.init();

    if (!success) {
      setMicPermission('denied');
      setAudioError('Microphone access denied. Please allow microphone access and try again.');
      return;
    }
    setMicPermission('granted');

    // Store reference melody for grading
    recorderRef.current._referenceMelody = referenceMelody;
    recorderRef.current._ts = ts;
    recorderRef.current._tempo = tempo;

    // Count-in
    const ct = parseTS(ts).n;
    setCd(ct);
    let c = ct;
    const iv = setInterval(() => {
      c--;
      if (c <= 0) {
        clearInterval(iv);
        setCd(null);
        setRec(true);
        setEl(0);

        // Start actual recording
        recorder.start();

        const st = Date.now();
        tmr.current = setInterval(() => setEl(Math.floor((Date.now() - st) / 1000)), 200);
      } else {
        setCd(c);
      }
    }, (60 / tempo) * 1000);
  }, []);

  const stopRec = useCallback((destView, referenceMelody = null) => {
    setRec(false);
    clearInterval(tmr.current);
    setCurrentPitch(null);

    if (recorderRef.current) {
      const pitchHistory = recorderRef.current.stop();
      const melody = referenceMelody || recorderRef.current._referenceMelody;
      const ts = recorderRef.current._ts || "4/4";
      const tempo = recorderRef.current._tempo || 80;

      if (melody && pitchHistory.length > 0) {
        // Use real grading
        const gradeResult = gradePerformance(pitchHistory, melody, tempo, ts);

        // Map to the format expected by the UI
        setRes({
          ps: gradeResult.pitchScore,
          rs: gradeResult.rhythmScore,
          ls: gradeResult.leadershipScore,
          co: Math.round(gradeResult.stabilityScore * 0.9 + 10), // Count-off approximation
          ts: gradeResult.stabilityScore,
          pst: gradeResult.pitchScore,
          tt: gradeResult.tempoData,
          pt: gradeResult.pitchData,
          diag: gradeResult.diagnostics,
          pm: gradeResult.pitchData.filter(p => p.sh || p.fl).map(p => p.m),
          // Include raw data for debugging
          _raw: gradeResult
        });
      } else {
        // Fallback: no melody reference or no pitch data
        setRes({
          ps: 0, rs: 0, ls: 0, co: 0, ts: 0, pst: 0,
          tt: [], pt: [],
          diag: pitchHistory.length === 0
            ? ["No pitch detected. Make sure your microphone is working and sing clearly."]
            : ["No reference melody available for grading."],
          pm: []
        });
      }

      // Clean up recorder
      recorderRef.current.destroy();
      recorderRef.current = null;
    }

    setVw(destView);
  }, []);

  useEffect(()=>()=>{
    clearInterval(tmr.current);
    melodyOscs.current.forEach(o=>{try{o.stop();}catch(e){}});
    melodyTimers.current.forEach(t=>clearTimeout(t));
    if(recorderRef.current){recorderRef.current.destroy();recorderRef.current=null;}
    if(micTestRef.current){micTestRef.current.destroy();micTestRef.current=null;}
  },[]);
  const goHome=()=>{setVw(V.HOME);setHymn(null);setRes(null);setRec(false);setCd(null);setGenNotes(null);stopMelody();clearInterval(tmr.current);setSearch("");setAudioError(null);setCurrentPitch(null);setMicTesting(false);if(recorderRef.current){recorderRef.current.destroy();recorderRef.current=null;}if(micTestRef.current){micTestRef.current.destroy();micTestRef.current=null;}};
  const goBack=v=>{setVw(v);setRec(false);setCd(null);setRes(null);clearInterval(tmr.current);setAudioError(null);setCurrentPitch(null);setMicTesting(false);if(recorderRef.current){recorderRef.current.destroy();recorderRef.current=null;}if(micTestRef.current){micTestRef.current.destroy();micTestRef.current=null;}};

  // ─── HYMN PRACTICE (split layout) ─────────────────────────
  if ((vw===V.PRAC||vw===V.RES) && hymn) {
    const Ctrl = () => {
      return <div style={{padding:20,position:"relative"}}>
        <div style={{marginBottom:16}}><div style={{fontSize:11,fontWeight:600,color:T.tm,marginBottom:6,letterSpacing:"0.06em",textTransform:"uppercase"}}>Mode</div><div style={{display:"flex",gap:6}}>{["practice","test"].map(m=><button key={m} onClick={()=>setMode(m)} style={{padding:"8px 18px",borderRadius:8,border:`1.5px solid ${mode===m?T.ac:T.cb}`,background:mode===m?"#e8f0e8":T.card,color:mode===m?T.ad:T.tm,fontSize:12,fontWeight:600,cursor:"pointer"}}>{m==="test"?"Leadership Test":"Practice"}</button>)}</div></div>
        <div style={{...mkC,cursor:"default",background:T.wl,borderColor:"#e8dcc4",padding:14}}><div style={{fontSize:12,color:"#7a6c3d",lineHeight:1.5}}>{mode==="practice"?"Count-in → sing a cappella → receive feedback.":"Leadership Test: evaluates count-off, tempo, and pitch stability."}</div></div>
        {/* Action area */}
        {!rec && cd===null && <div style={{textAlign:"center",marginTop:16}}>
          {hymnMelody && <div style={{marginBottom:12,padding:"8px 16px",background:"#e8f0e8",borderRadius:8,display:"inline-block"}}>
            <span style={{fontSize:11,color:"#3d5640"}}>Melody data available - real grading enabled</span>
          </div>}
          {!hymnMelody && !hymnMelodyLoading && <div style={{marginBottom:12,padding:"8px 16px",background:"#fff8e8",borderRadius:8,display:"inline-block"}}>
            <span style={{fontSize:11,color:"#7a6c3d"}}>No melody data - pitch tracking only</span>
          </div>}
          <button onClick={()=>startRec(hymnMelody?.timeSignature||"4/4", hymnMelody?.bpm||80, hymnMelody?.notes)} style={{...mkB(true),padding:"14px 40px",fontSize:15,borderRadius:12}}>Begin {mode==="test"?"Test":"Practice"}</button>
        </div>}
        {rec && <div style={{marginTop:16,padding:16,background:"#fff",border:"1.5px solid #e8e0d4",borderRadius:10}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{display:"inline-block",width:10,height:10,borderRadius:"50%",background:"#c0494f",animation:"pulse 1.2s infinite"}}/>
              <span style={{fontSize:13,fontWeight:600,color:T.dg}}>Recording</span>
              <span style={{fontFamily:"var(--serif)",fontSize:20,color:T.tx,marginLeft:8}}>{Math.floor(el/60)}:{String(el%60).padStart(2,"0")}</span>
            </div>
            <button onClick={()=>stopRec(V.RES, hymnMelody?.notes)} style={{padding:"6px 16px",borderRadius:8,border:"1.5px solid #a33b3b",background:"#fff",color:"#a33b3b",fontSize:12,fontWeight:600,cursor:"pointer"}}>■ Stop</button>
          </div>
          <div style={{fontSize:12,color:T.tm,marginTop:8}}>Sing the soprano line clearly</div>
        </div>}
        {/* Count-in overlay */}
        {cd!==null && <div style={{position:"absolute",inset:0,background:"rgba(250,246,240,0.9)",borderRadius:10,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",backdropFilter:"blur(2px)",zIndex:10}}>
          <div style={{fontSize:11,color:T.tm,marginBottom:8,fontWeight:600,letterSpacing:"0.1em",textTransform:"uppercase"}}>Count-in</div>
          <div style={{fontFamily:"var(--serif)",fontSize:72,color:T.ac,lineHeight:1}}>{cd}</div>
        </div>}
      </div>;
    };
    const Res = () => {
      if(!res)return null;
      return <div style={{padding:20}}>
        <div style={{...mkC,cursor:"default",display:"flex",justifyContent:"space-around",padding:20}}><Ring s={res.ps} label="Pitch"/><Ring s={res.rs} label="Rhythm"/><Ring s={res.ls} label="Leadership"/></div>
        <div style={{...mkC,cursor:"default",padding:14}}><div style={{fontFamily:"var(--serif)",fontSize:15,marginBottom:10}}>Leadership Breakdown</div>
          {[{l:"Count-off",s:res.co,w:"30%"},{l:"Tempo Stability",s:res.ts,w:"40%"},{l:"Pitch Stability",s:res.pst,w:"30%"}].map((x,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}><div style={{flex:1,fontSize:12,color:T.tm}}>{x.l}</div><div style={{width:100,height:5,borderRadius:3,background:"#e8e0d4",overflow:"hidden"}}><div style={{height:"100%",borderRadius:3,width:`${x.s}%`,background:x.s>=85?"#5c7a5e":x.s>=65?"#b08d3a":"#a33b3b",transition:"width 1s"}}/></div><span style={{fontSize:12,fontWeight:700,width:28,textAlign:"right"}}>{x.s}</span></div>)}
        </div>
        <div style={{...mkC,cursor:"default",padding:14}}><TempLine data={res.tt}/></div>
        <div style={{...mkC,cursor:"default",padding:14}}><div style={{fontFamily:"var(--serif)",fontSize:15,marginBottom:10}}>Feedback</div>{res.diag.map((d,i)=><div key={i} style={{display:"flex",gap:8,marginBottom:6,padding:"6px 10px",background:T.wl,borderRadius:6}}><span>💡</span><span style={{fontSize:12,color:"#6b5c36",lineHeight:1.5}}>{d}</span></div>)}</div>
        <div style={{display:"flex",gap:10,marginTop:16,justifyContent:"center"}}><button onClick={()=>{setRes(null);setVw(V.PRAC);}} style={mkB(true)}>Retry</button><button onClick={goHome} style={mkB(false)}>Home</button></div>
      </div>;
    };
    return <><style>{css}</style><div style={{display:"flex",minHeight:"100vh",background:T.bg,fontFamily:"var(--sans)",color:T.tx}}>
      {sheet&&<div style={{width:"50%",minWidth:280,maxWidth:540,borderRight:"1px solid #d4cfc5",display:"flex",flexDirection:"column",background:"#f5f1ea",height:"100vh",position:"sticky",top:0}}>
        <div style={{padding:"10px 12px",borderBottom:"1px solid #d4cfc5",display:"flex",alignItems:"center",justifyContent:"space-between"}}><span style={{fontFamily:"var(--serif)",fontSize:14}}>p.{hymn.pages[0]}</span><button onClick={()=>setSheet(false)} style={{...tbS,fontSize:12}}>✕</button></div>
        <SheetViewer hymn={hymn}/>
      </div>}
      <div style={{flex:1,minWidth:300,overflowY:"auto",maxHeight:"100vh"}}>
        <div style={{padding:"16px 20px 12px",borderBottom:`1px solid ${T.cb}`,display:"flex",alignItems:"center",gap:10}}>
          <button style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:T.tm}} onClick={()=>goBack(V.HYMNS)}>←</button>
          <div style={{flex:1}}><div style={{fontFamily:"var(--serif)",fontSize:18}}>#{hymn.number} — {hymn.title}</div></div>
          {!sheet&&<button onClick={()=>setSheet(true)} style={{...mkB(false),padding:"6px 12px",fontSize:11}}>🎵</button>}
        </div>
        {vw===V.PRAC?<Ctrl/>:<Res/>}
      </div>
    </div></>;
  }

  // ─── GENERATED EXERCISE PRACTICE ──────────────────────────
  if (vw===V.GEN_PRAC||vw===V.GEN_RES) {
    const Ctrl = () => {
      // Always show the note display; overlay count-in or recording status on top
      return <div style={{padding:20}}>
        {/* Exercise info */}
        <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
          <span style={mkTag("blue")}>{genTS}</span>
          <span style={mkTag("amber")}>♩ = {genBPM}</span>
          <span style={mkTag("green")}>Key of {genActualKey}</span>
          <span style={mkTag("rose")}>{genMeasures} measures · {genNotes?.length||0} notes</span>
        </div>

        {/* Note display — always visible */}
        {genNotes && <div style={{position:"relative",marginBottom:16}}>
          <NoteDisplay notes={genNotes} lyrics={genLyrics}/>
          {/* Count-in overlay */}
          {cd!==null && <div style={{position:"absolute",inset:0,background:"rgba(250,246,240,0.88)",borderRadius:10,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",backdropFilter:"blur(2px)"}}>
            <div style={{fontSize:11,color:T.tm,marginBottom:8,fontWeight:600,letterSpacing:"0.1em",textTransform:"uppercase"}}>Count-in ({genTS})</div>
            <div style={{fontFamily:"var(--serif)",fontSize:72,color:T.ac,lineHeight:1}}>{cd}</div>
            <div style={{fontSize:13,color:T.tm,marginTop:8}}>{genBPM} BPM</div>
          </div>}
          {/* Recording overlay — lighter, notes still visible */}
          {rec && <div style={{position:"absolute",top:0,left:0,right:0,background:"rgba(250,246,240,0.85)",borderRadius:"10px 10px 0 0",padding:"10px 14px",backdropFilter:"blur(1px)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{display:"inline-block",width:10,height:10,borderRadius:"50%",background:"#c0494f",animation:"pulse 1.2s infinite"}}/>
                <span style={{fontSize:13,fontWeight:600,color:T.dg}}>Recording</span>
                <span style={{fontFamily:"var(--serif)",fontSize:18,color:T.tx,marginLeft:8}}>{Math.floor(el/60)}:{String(el%60).padStart(2,"0")}</span>
              </div>
              <button onClick={()=>stopRec(V.GEN_RES,genNotes)} style={{padding:"6px 16px",borderRadius:8,border:"1.5px solid #a33b3b",background:"#fff",color:"#a33b3b",fontSize:12,fontWeight:600,cursor:"pointer"}}>■ Stop</button>
            </div>
            {/* Real-time pitch display */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,marginTop:8,padding:"6px 12px",background:"#fff",borderRadius:6,border:"1px solid #e8e0d4"}}>
              <span style={{fontSize:11,color:T.tm,fontWeight:600}}>Detected:</span>
              {currentPitch ? (
                <>
                  <span style={{fontFamily:"var(--serif)",fontSize:20,fontWeight:700,color:T.ac,minWidth:40}}>{currentPitch.noteName}</span>
                  <span style={{fontSize:11,color:currentPitch.cents > 10 ? "#b08d3a" : currentPitch.cents < -10 ? "#a33b3b" : "#5c7a5e"}}>
                    {currentPitch.cents > 0 ? "+" : ""}{currentPitch.cents} cents
                  </span>
                  <span style={{fontSize:10,color:T.tm}}>{Math.round(currentPitch.frequency)} Hz</span>
                </>
              ) : (
                <span style={{fontSize:12,color:T.tm,fontStyle:"italic"}}>Listening...</span>
              )}
            </div>
          </div>}
        </div>}

        {/* Controls — hidden during recording */}
        {!rec && cd===null && <>
          {/* Microphone error display */}
          {audioError && <div style={{marginBottom:16,padding:"12px 16px",background:"#fff0f0",border:"1px solid #f0c0c0",borderRadius:8,display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:18}}>🎤</span>
            <div>
              <div style={{fontSize:12,fontWeight:600,color:"#a33b3b"}}>Microphone Error</div>
              <div style={{fontSize:11,color:"#8a5c5c"}}>{audioError}</div>
            </div>
            <button onClick={()=>setAudioError(null)} style={{marginLeft:"auto",background:"none",border:"none",fontSize:16,color:"#a33b3b",cursor:"pointer"}}>×</button>
          </div>}

          {/* Beat pattern */}
          <div style={{marginBottom:16}}><AnimBeat ts={genTS} tempo={genBPM}/></div>

          {/* Audio controls row */}
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            {/* Starting pitch */}
            <div style={{flex:1,...mkC,cursor:"default",display:"flex",justifyContent:"space-between",alignItems:"center",background:pitchOn?"#f0f5f0":T.card,transition:"background .3s",padding:12,marginBottom:0}}>
              <div><div style={{fontWeight:600,fontSize:12}}>Starting Pitch</div><div style={{fontSize:10,color:T.tm}}>{genNotes?NOTE_NAMES[genNotes[0].midi%12]+(Math.floor(genNotes[0].midi/12)-1):genActualKey}</div></div>
              <button onClick={()=>{if(genNotes){try{if(!actx.current)actx.current=new(window.AudioContext||window.webkitAudioContext)();const c=actx.current,o=c.createOscillator(),g=c.createGain();o.type="sine";o.frequency.value=genNotes[0].freq;g.gain.setValueAtTime(.3,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+2);o.connect(g).connect(c.destination);o.start();o.stop(c.currentTime+2);setPO(true);setTimeout(()=>setPO(false),2000);}catch(e){}}else playPitch(genActualKey);}} style={{width:34,height:34,borderRadius:"50%",border:"1px solid #d4cfc5",background:"#fff",fontSize:15,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>🔊</button>
            </div>
            {/* Play full melody */}
            <div style={{flex:1,...mkC,cursor:"default",display:"flex",justifyContent:"space-between",alignItems:"center",background:melodyPlaying?"#f0f5f0":T.card,transition:"background .3s",padding:12,marginBottom:0}}>
              <div><div style={{fontWeight:600,fontSize:12}}>Play Melody</div><div style={{fontSize:10,color:T.tm}}>{melodyPlaying?"Playing...":"Hear the full exercise"}</div></div>
              <button onClick={()=>{if(melodyPlaying){stopMelody();return;}playMelodyAudio();}} style={{width:34,height:34,borderRadius:"50%",border:`1px solid ${melodyPlaying?"#a33b3b":"#d4cfc5"}`,background:"#fff",fontSize:15,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:melodyPlaying?"#a33b3b":"inherit"}}>{melodyPlaying?"■":"▶"}</button>
            </div>
          </div>

          {/* Microphone Test Panel */}
          <div style={{marginBottom:16,...mkC,cursor:"default",padding:14,background:micTesting?"#f0f8f0":T.card,border:micTesting?"1.5px solid #5c7a5e":"1px solid #e8e0d4",transition:"all .3s"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:micTesting?12:0}}>
              <div>
                <div style={{fontWeight:600,fontSize:12,display:"flex",alignItems:"center",gap:6}}>
                  🎤 Test Microphone
                  {micTesting && <span style={{display:"inline-block",width:8,height:8,borderRadius:"50%",background:"#5c7a5e",animation:"pulse 1.2s infinite"}}/>}
                </div>
                <div style={{fontSize:10,color:T.tm}}>{micTesting?"Sing or hum a note...":"Verify your mic is working"}</div>
              </div>
              <button onClick={()=>{if(micTesting){stopMicTest();}else{startMicTest();}}} style={{padding:"8px 16px",borderRadius:8,border:`1.5px solid ${micTesting?"#a33b3b":"#5c7a5e"}`,background:"#fff",color:micTesting?"#a33b3b":"#5c7a5e",fontSize:12,fontWeight:600,cursor:"pointer"}}>{micTesting?"■ Stop":"▶ Start"}</button>
            </div>
            {/* Pitch display when testing */}
            {micTesting && (
              <div style={{background:"#fff",borderRadius:10,padding:16,border:"1px solid #e8e0d4"}}>
                {currentPitch ? (
                  <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:20}}>
                    {/* Large note display */}
                    <div style={{textAlign:"center"}}>
                      <div style={{fontFamily:"var(--serif)",fontSize:56,fontWeight:700,color:currentPitch.stable?"#2d6a4f":"#5c7a5e",lineHeight:1,transition:"color .2s"}}>{currentPitch.noteName}</div>
                      <div style={{fontSize:11,color:T.tm,marginTop:4}}>{Math.round(currentPitch.frequency)} Hz</div>
                    </div>
                    {/* Tuning indicator */}
                    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                      <div style={{fontSize:10,color:T.tm,fontWeight:600}}>TUNING</div>
                      <div style={{width:120,height:24,background:"#f0ece4",borderRadius:12,position:"relative",overflow:"hidden"}}>
                        {/* Center line */}
                        <div style={{position:"absolute",left:"50%",top:0,bottom:0,width:2,background:"#5c7a5e",transform:"translateX(-50%)"}}/>
                        {/* Indicator dot */}
                        <div style={{
                          position:"absolute",
                          top:"50%",
                          left:`${50 + Math.max(-45, Math.min(45, currentPitch.cents))}%`,
                          width:16,
                          height:16,
                          borderRadius:"50%",
                          background:Math.abs(currentPitch.cents) < 10 ? "#2d6a4f" : Math.abs(currentPitch.cents) < 25 ? "#b08d3a" : "#a33b3b",
                          transform:"translate(-50%, -50%)",
                          transition:"left .15s, background .15s"
                        }}/>
                      </div>
                      <div style={{fontSize:12,fontWeight:600,color:Math.abs(currentPitch.cents) < 10 ? "#2d6a4f" : Math.abs(currentPitch.cents) < 25 ? "#b08d3a" : "#a33b3b"}}>
                        {currentPitch.cents > 0 ? "+" : ""}{currentPitch.cents} cents
                        {Math.abs(currentPitch.cents) < 10 && " ✓"}
                      </div>
                    </div>
                    {/* Level meter */}
                    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                      <div style={{fontSize:10,color:T.tm,fontWeight:600}}>LEVEL</div>
                      <div style={{width:12,height:60,background:"#f0ece4",borderRadius:6,position:"relative",overflow:"hidden"}}>
                        <div style={{
                          position:"absolute",
                          bottom:0,
                          left:0,
                          right:0,
                          height:`${Math.min(100, currentPitch.level * 500)}%`,
                          background:currentPitch.level > 0.05 ? "#5c7a5e" : "#b08d3a",
                          borderRadius:6,
                          transition:"height .1s"
                        }}/>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{textAlign:"center",padding:20}}>
                    <div style={{fontSize:14,color:T.tm,marginBottom:8}}>Listening for pitch...</div>
                    <div style={{fontSize:11,color:"#b5a998"}}>Sing or hum a clear, steady note</div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{display:"flex",gap:8,marginTop:12,justifyContent:"center"}}>
            <button onClick={()=>startRec(genTS,genBPM,genNotes)} style={{...mkB(true),padding:"14px 40px",fontSize:15,borderRadius:12}}>Begin Exercise</button>
            <button onClick={()=>{stopMelody();doGenerate();}} style={{...mkB(false),padding:"14px 20px"}}>🔄 Regenerate</button>
          </div>
        </>}
      </div>;
    };
    const Res = () => {
      if(!res)return null;
      return <div style={{padding:20}}>
        <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}><span style={mkTag("blue")}>{genTS}</span><span style={mkTag("amber")}>♩ = {genBPM}</span><span style={mkTag("green")}>Key of {genActualKey}</span></div>
        <div style={{...mkC,cursor:"default",display:"flex",justifyContent:"space-around",padding:20}}><Ring s={res.ps} label="Pitch"/><Ring s={res.rs} label="Rhythm"/></div>
        {genNotes&&<div style={{...mkC,cursor:"default",padding:14}}><NoteDisplay notes={genNotes} lyrics={genLyrics}/></div>}
        <div style={{...mkC,cursor:"default",padding:14}}><TempLine data={res.tt}/></div>
        <div style={{...mkC,cursor:"default",padding:14}}><div style={{fontFamily:"var(--serif)",fontSize:15,marginBottom:10}}>Feedback</div>{res.diag.map((d,i)=><div key={i} style={{display:"flex",gap:8,marginBottom:6,padding:"6px 10px",background:T.wl,borderRadius:6}}><span>💡</span><span style={{fontSize:12,color:"#6b5c36",lineHeight:1.5}}>{d}</span></div>)}</div>
        <div style={{display:"flex",gap:10,marginTop:16,justifyContent:"center",flexWrap:"wrap"}}>
          <button onClick={()=>{setRes(null);setVw(V.GEN_PRAC);}} style={mkB(true)}>Retry</button>
          <button onClick={()=>{setRes(null);doGenerate();setVw(V.GEN_PRAC);}} style={mkB(false)}>Regenerate</button>
          <button onClick={()=>goBack(V.GEN)} style={mkB(false)}>Settings</button>
          <button onClick={goHome} style={mkB(false)}>Home</button>
        </div>
      </div>;
    };
    return <><style>{css}</style><div style={{minHeight:"100vh",background:T.bg,fontFamily:"var(--sans)",color:T.tx}}><div style={{maxWidth:600,margin:"0 auto",padding:"0 20px 40px"}}>
      <div style={{padding:"20px 0 12px",borderBottom:`1px solid ${T.cb}`,display:"flex",alignItems:"center",gap:10}}>
        <button style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:T.tm}} onClick={()=>goBack(V.GEN)}>←</button>
        <div><div style={{fontFamily:"var(--serif)",fontSize:18}}>Generated Exercise</div><div style={{fontSize:10,color:T.tm,letterSpacing:"0.06em",textTransform:"uppercase",fontWeight:500}}>{genTS} · {genBPM} BPM · {genActualKey} major</div></div>
      </div>
      {vw===V.GEN_PRAC?<Ctrl/>:<Res/>}
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
        <p style={{color:T.tm,fontSize:13,lineHeight:1.5,maxWidth:340,margin:"0 auto"}}>Practice leading a cappella with real Zion's Hymns and auto-generated hymn-style exercises.</p>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10,animation:"fadeUp .5s"}}>
        <div style={mkC} onClick={()=>setVw(V.HYMNS)} onMouseEnter={hov} onMouseLeave={uhov}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <span style={{fontSize:26}}>📖</span>
            <div><div style={{fontWeight:600,fontSize:14,marginBottom:2}}>Hymn Practice</div><div style={{fontSize:12,color:T.tm}}>Sing from {hymnIndex.length} Zion's Hymns with real sheet music</div></div>
            <span style={{marginLeft:"auto",color:T.tl,fontSize:16}}>›</span>
          </div>
        </div>
        <div style={mkC} onClick={()=>setVw(V.GEN)} onMouseEnter={hov} onMouseLeave={uhov}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <span style={{fontSize:26}}>🎵</span>
            <div><div style={{fontWeight:600,fontSize:14,marginBottom:2}}>Generated Exercises</div><div style={{fontSize:12,color:T.tm}}>Auto-generated hymn-style melodies with lyrics & grading</div></div>
            <span style={{marginLeft:"auto",color:T.tl,fontSize:16}}>›</span>
          </div>
        </div>
      </div>
      <div style={{marginTop:20,padding:16,background:T.wl,borderRadius:12,border:`1px solid ${T.cb}`}}>
        <div style={{fontWeight:600,fontSize:12,marginBottom:4,color:T.wm}}>📘 Zion's Hymns (2021 Edition)</div>
        <div style={{fontSize:12,color:T.tm,lineHeight:1.6}}>250 hymns from zions-hymns-pages.pdf. Generated exercises follow hymn-style rules with pitch and rhythm grading.</div>
      </div>
    </div></div></>;
  }

  // ═══════════════════ HYMN SELECT ══════════════════════════
  if (vw===V.HYMNS) {
    const q=search.toLowerCase();
    const fl=q?hymnIndex.filter(h=>h.title.toLowerCase().includes(q)||h.number.includes(q)):hymnIndex;
    return <><style>{css}</style><div style={{minHeight:"100vh",background:T.bg,fontFamily:"var(--sans)",color:T.tx}}><div style={{maxWidth:540,margin:"0 auto",padding:"0 20px 40px"}}>
      <div style={{padding:"20px 0 12px",borderBottom:`1px solid ${T.cb}`,display:"flex",alignItems:"center",gap:10}}>
        <button style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:T.tm}} onClick={goHome}>←</button>
        <div><div style={{fontFamily:"var(--serif)",fontSize:18}}>Zion's Hymns</div><div style={{fontSize:10,color:T.tm,letterSpacing:"0.06em",textTransform:"uppercase",fontWeight:500}}>{hymnIndex.length} hymns</div></div>
      </div>
      <div style={{marginTop:14,marginBottom:14}}><input type="text" placeholder="Search by number or title..." value={search} onChange={e=>setSearch(e.target.value)} style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${T.cb}`,background:T.card,fontSize:13,fontFamily:"var(--sans)",color:T.tx,outline:"none"}} onFocus={e=>e.target.style.borderColor=T.ac} onBlur={e=>e.target.style.borderColor=T.cb}/></div>
      <div style={{display:"flex",flexDirection:"column",gap:8,animation:"fadeUp .4s"}}>
        {fl.length===0&&<div style={{textAlign:"center",padding:32,color:T.tm}}>No hymns match "{search}"</div>}
        {fl.map(h=><div key={h.id} style={mkC} onClick={()=>{setHymn(h);setSheet(true);setVw(V.PRAC);}} onMouseEnter={hov} onMouseLeave={uhov}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontWeight:600,fontSize:14}}>#{h.number} — {h.title}</div><div style={{fontSize:11,color:T.tm}}>{h.images.length} pg · p.{h.pages[0]}</div></div><span style={{color:T.tl}}>›</span></div>
        </div>)}
      </div>
    </div></div></>;
  }

  // ═══════════════════ GENERATOR SETTINGS ════════════════════
  if (vw===V.GEN) {
    const sliderTrack = {width:"100%",appearance:"none",height:4,borderRadius:2,background:"#e8e0d4",outline:"none"};
    return <><style>{css}{`input[type=range]::-webkit-slider-thumb{appearance:none;width:20px;height:20px;border-radius:50%;background:#5c7a5e;cursor:pointer;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.2)}input[type=range]::-moz-range-thumb{width:20px;height:20px;border-radius:50%;background:#5c7a5e;cursor:pointer;border:2px solid #fff}`}</style>
    <div style={{minHeight:"100vh",background:T.bg,fontFamily:"var(--sans)",color:T.tx}}><div style={{maxWidth:540,margin:"0 auto",padding:"0 20px 40px"}}>
      <div style={{padding:"20px 0 12px",borderBottom:`1px solid ${T.cb}`,display:"flex",alignItems:"center",gap:10}}>
        <button style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:T.tm}} onClick={goHome}>←</button>
        <div><div style={{fontFamily:"var(--serif)",fontSize:18}}>Generated Exercise</div><div style={{fontSize:10,color:T.tm,letterSpacing:"0.06em",textTransform:"uppercase",fontWeight:500}}>Configure your exercise</div></div>
      </div>

      <div style={{marginTop:20,animation:"fadeUp .4s"}}>
        {/* Time Signature */}
        <div style={{marginBottom:20}}>
          <div style={{fontSize:12,fontWeight:600,color:T.tx,marginBottom:8}}>Time Signature</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {METERS.map(m=><button key={m} onClick={()=>setGenTS(m)} style={{padding:"8px 16px",borderRadius:8,border:`1.5px solid ${genTS===m?T.ac:T.cb}`,background:genTS===m?"#e8f0e8":T.card,color:genTS===m?T.ad:T.tm,fontSize:14,fontWeight:600,fontFamily:"var(--serif)",cursor:"pointer",minWidth:48}}>{m}</button>)}
          </div>
          <div style={{fontSize:11,color:T.tm,marginTop:6}}>{tsDesc(genTS)} BPM = {getBpmUnit(genTS)}.</div>
        </div>

        {/* BPM */}
        <div style={{marginBottom:20}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:8}}>
            <span style={{fontSize:12,fontWeight:600,color:T.tx}}>Tempo</span>
            <span style={{fontFamily:"var(--serif)",fontSize:22,color:T.ac}}>{genBPM} <span style={{fontSize:12,color:T.tm}}>BPM</span></span>
          </div>
          <input type="range" min="40" max="140" value={genBPM} onChange={e=>setGenBPM(+e.target.value)} style={sliderTrack}/>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:T.tl,marginTop:4}}><span>40</span><span>140</span></div>
        </div>

        {/* Measures */}
        <div style={{marginBottom:20}}>
          <div style={{fontSize:12,fontWeight:600,color:T.tx,marginBottom:8}}>Length (Measures)</div>
          <div style={{display:"flex",gap:8}}>
            {[4,8,12,16].map(m=><button key={m} onClick={()=>setGenMeasures(m)} style={{padding:"8px 20px",borderRadius:8,border:`1.5px solid ${genMeasures===m?T.ac:T.cb}`,background:genMeasures===m?"#e8f0e8":T.card,color:genMeasures===m?T.ad:T.tm,fontSize:14,fontWeight:600,cursor:"pointer"}}>{m}</button>)}
          </div>
        </div>

        {/* Key */}
        <div style={{marginBottom:20}}>
          <div style={{fontSize:12,fontWeight:600,color:T.tx,marginBottom:8}}>Key</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <button onClick={()=>setGenKey("auto")} style={{padding:"8px 16px",borderRadius:8,border:`1.5px solid ${genKey==="auto"?T.wm:T.cb}`,background:genKey==="auto"?T.wl:T.card,color:genKey==="auto"?"#8a6d1f":T.tm,fontSize:12,fontWeight:600,cursor:"pointer"}}>🎲 Auto</button>
            {KEYS.map(k=><button key={k} onClick={()=>setGenKey(k)} style={{padding:"6px 12px",borderRadius:8,border:`1.5px solid ${genKey===k?T.ac:T.cb}`,background:genKey===k?"#e8f0e8":T.card,color:genKey===k?T.ad:T.tm,fontSize:12,fontWeight:600,cursor:"pointer",minWidth:36}}>{k}</button>)}
          </div>
        </div>

        {/* Syllable Complexity */}
        <div style={{marginBottom:20}}>
          <div style={{fontSize:12,fontWeight:600,color:T.tx,marginBottom:8}}>Syllable Complexity</div>
          <div style={{display:"flex",gap:8}}>
            {[{v:1,label:"1-Syllable",desc:"praise, Lord, sing…"},{v:2,label:"Up to 2",desc:"+ Je-sus, glo-ry…"},{v:3,label:"Up to 3",desc:"+ beau-ti-ful, for-ev-er…"}].map(opt=>(
              <button key={opt.v} onClick={()=>setGenSyllables(opt.v)} style={{flex:1,padding:"10px 8px",borderRadius:8,border:`1.5px solid ${genSyllables===opt.v?T.ac:T.cb}`,background:genSyllables===opt.v?"#e8f0e8":T.card,color:genSyllables===opt.v?T.ad:T.tm,cursor:"pointer",textAlign:"center"}}>
                <div style={{fontSize:13,fontWeight:600}}>{opt.label}</div>
                <div style={{fontSize:9,color:genSyllables===opt.v?T.ad:T.tl,marginTop:2}}>{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Melisma Frequency */}
        <div style={{marginBottom:24}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:8}}>
            <span style={{fontSize:12,fontWeight:600,color:T.tx}}>Melismas</span>
            <span style={{fontSize:13,color:genMelisma===0?T.tl:T.wm,fontWeight:600}}>{genMelisma===0?"None":`${genMelisma}% of notes`}</span>
          </div>
          <input type="range" min="0" max="40" step="5" value={genMelisma} onChange={e=>setGenMelisma(+e.target.value)} style={sliderTrack}/>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:T.tl,marginTop:4}}><span>None</span><span>Light (10%)</span><span>Heavy (40%)</span></div>
          <div style={{fontSize:11,color:T.tm,marginTop:6}}>
            {genMelisma===0?"Each note gets its own syllable.":
             genMelisma<=10?"Occasional melismas — one syllable stretches across 2–3 notes (shown as —).":
             genMelisma<=25?"Moderate melismas — several extended syllables per exercise.":
             "Heavy melismas — frequent extended syllables, more challenging phrasing."}
          </div>
        </div>

        <div style={{textAlign:"center"}}>
          <button onClick={()=>{doGenerate();setVw(V.GEN_PRAC);}} style={{...mkB(true),padding:"16px 48px",fontSize:16,borderRadius:12}}>
            Generate Exercise
          </button>
        </div>

        {/* Info card */}
        <div style={{marginTop:20,padding:16,background:T.wl,borderRadius:12,border:`1px solid ${T.cb}`}}>
          <div style={{fontWeight:600,fontSize:12,marginBottom:6,color:T.wm}}>🎶 Hymn-Style Generation</div>
          <div style={{fontSize:12,color:T.tm,lineHeight:1.6}}>
            Melodies follow hymn rules: mostly stepwise motion, leaps resolve by step, strong beats favor chord tones, cadences on tonic. Lyrics with occasional melismas are auto-assigned.
          </div>
        </div>
      </div>
    </div></div></>;
  }

  return null;
}
