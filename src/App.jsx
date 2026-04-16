import { useState, useRef, useCallback } from "react";
import {
  Chart, LineElement, BarElement, CategoryScale,
  LinearScale, PointElement, Filler, Tooltip,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";

Chart.register(LineElement, BarElement, CategoryScale, LinearScale, PointElement, Filler, Tooltip);

// ── channel config ──────────────────────────────────────────────────────────
const CH = [
  { nm: 410,  r: "VIS",    col: "#c084fc" },
  { nm: 435,  r: "VIS",    col: "#a78bfa" },
  { nm: 460,  r: "VIS",    col: "#60a5fa" },
  { nm: 485,  r: "VIS",    col: "#22d3ee" },
  { nm: 510,  r: "VIS",    col: "#34d399" },
  { nm: 535,  r: "VIS",    col: "#4ade80" },
  { nm: 560,  r: "VIS",    col: "#a3e635" },
  { nm: 585,  r: "VIS",    col: "#facc15" },
  { nm: 610,  r: "VIS",    col: "#fb923c" },
  { nm: 645,  r: "VIS",    col: "#f87171" },
  { nm: 680,  r: "VIS",    col: "#ef4444" },
  { nm: 705,  r: "R-Edge", col: "#f43f5e" },
  { nm: 730,  r: "NIR",    col: "#e879f9" },
  { nm: 760,  r: "NIR",    col: "#c084fc" },
  { nm: 810,  r: "NIR",    col: "#818cf8" },
  { nm: 860,  r: "NIR",    col: "#6366f1" },
  { nm: 900,  r: "NIR",    col: "#3b82f6" },
  { nm: 940,  r: "NIR",    col: "#0ea5e9" },
];

const HLEN = 60;
const rgba = (hex, a) => {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
};

// ── soil maths ──────────────────────────────────────────────────────────────
function calcSoil(v) {
  if (!v || v.every(x => x === 0)) return null;
  const nir = (v[12]+v[13]+v[14]+v[15]+v[16]+v[17]) / 6;
  const vis = (v[0]+v[1]+v[2]+v[3]+v[4]+v[5]+v[6]+v[7]+v[8]+v[9]+v[10]+v[11]) / 12;
  const moisture = Math.max(0, Math.min(100, Math.round((1 - nir/4095) * 90)));
  const om  = Math.max(0.5, Math.min(15, ((4095-vis)/4095*10)+1.2)).toFixed(1);
  const ec  = Math.max(0.1, Math.min(6,  ((v[15]-v[17])/(v[15]+v[17]+1))*3+1.8)).toFixed(2);
  const ndmi= ((nir-vis)/(nir+vis+1)).toFixed(3);
  const N   = Math.round(Math.max(20, Math.min(350, 200-(moisture*0.7)+(parseFloat(om)*14))));
  const P   = Math.round(Math.max(10, Math.min(160, (v[8]/4095)*100+30)));
  const K   = Math.round(Math.max(30, Math.min(280, (v[10]/4095)*110+80)));
  const score = Math.round(Math.min(98, Math.max(8,
    (parseFloat(om)/10)*35 + (1-Math.abs(moisture-42)/42)*30 + (N/350)*20 + (K/280)*15
  )));
  return { moisture, om, ec, ndmi, N, P, K, score };
}

// ── tiny sparkline ──────────────────────────────────────────────────────────
function Spark({ data, color }) {
  const cfg = {
    labels: data.map((_,i) => i),
    datasets: [{
      data,
      borderColor: color,
      backgroundColor: rgba(color, 0.12),
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0.4,
      fill: true,
    }],
  };
  const opts = {
    responsive: true, maintainAspectRatio: false,
    animation: { duration: 0 },
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: { x: { display: false }, y: { display: false, min: 0, max: 4095 } },
  };
  return (
    <div style={{ height: 48, width: "100%" }}>
      <Line data={cfg} options={opts} />
    </div>
  );
}

// ── score arc ───────────────────────────────────────────────────────────────
function ScoreArc({ score }) {
  const r = 42, cx = 52, cy = 52, circ = 2 * Math.PI * r;
  const pct = score != null ? Math.min(1, score / 100) : 0;
  const offset = circ * (1 - pct);
  const col = score == null ? "#334155"
    : score >= 70 ? "#22c55e"
    : score >= 45 ? "#f59e0b"
    : "#ef4444";
  const grade = score == null ? "—"
    : score >= 70 ? "Good"
    : score >= 45 ? "Fair"
    : "Poor";
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
      <svg width={104} height={104} viewBox="0 0 104 104">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e293b" strokeWidth={10}/>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={col} strokeWidth={10}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
        <text x={cx} y={cy-6} textAnchor="middle" fontSize={22} fontWeight={700}
          fill={col} fontFamily="monospace">
          {score ?? "—"}
        </text>
        <text x={cx} y={cy+14} textAnchor="middle" fontSize={11}
          fill="#64748b" fontFamily="monospace">
          /100
        </text>
      </svg>
      <span style={{ fontSize:12, fontWeight:600, color: col }}>{grade}</span>
    </div>
  );
}

// ── main app ────────────────────────────────────────────────────────────────
export default function App() {
  const [adc,      setAdc]     = useState(new Array(18).fill(0));
  const [hist,     setHist]    = useState(() => Array.from({length:18}, () => Array(HLEN).fill(0)));
  const [conn,     setConn]    = useState(false);
  const [paused,   setPaused]  = useState(false);
  const [reads,    setReads]   = useState(0);
  const [errors,   setErrors]  = useState(0);
  const [rawLine,  setRawLine] = useState("— waiting for device");
  const [darkRef,  setDarkRef] = useState(null);
  const [whiteRef, setWhite]   = useState(null);
  const [selCh,    setSelCh]   = useState(15);
  const [tab,      setTab]     = useState("overview");
  const [logs,     setLogs]    = useState([]);
  const [csvBuf,   setCsvBuf]  = useState([]);

  const histRef  = useRef(Array.from({length:18}, () => Array(HLEN).fill(0)));
  const adcRef   = useRef(new Array(18).fill(0));
  const portRef  = useRef(null);
  const rdrRef   = useRef(null);
  const pauseRef = useRef(false);

  const log = useCallback((msg, t="info") => {
    const ts = new Date().toLocaleTimeString("en-GB");
    setLogs(p => { const n=[...p,{ts,msg,t}]; return n.length>200?n.slice(-200):n; });
  }, []);

  async function connect() {
    if (conn) { await disconnect(); return; }
    try {
      portRef.current = await navigator.serial.requestPort({ filters:[{usbVendorId:0x03EB}] });
      await portRef.current.open({ baudRate:115200, dataBits:8, stopBits:1, parity:"none" });
      setConn(true);
      log("Port opened — 115200 8N1", "ok");
      log("Waiting for data: RAW:v1,v2,...,v18", "info");

      const dec = new TextDecoderStream();
      portRef.current.readable.pipeTo(dec.writable);
      rdrRef.current = dec.readable.getReader();

      let buf = "", n = 0;
      while (true) {
        const { value, done } = await rdrRef.current.read();
        if (done) break;
        buf += value;
        const lines = buf.split(/\r?\n/); buf = lines.pop();
        for (const raw of lines) {
          const line = raw.trim(); if (!line) continue;
          setRawLine(line.slice(0, 80));
          let s = line;
          if (s.toUpperCase().startsWith("RAW:")) s = s.slice(4);
          const vals = s.split(",").map(v => parseInt(v.trim(), 10));
          if (vals.length === 18 && vals.every(v => !isNaN(v) && v >= 0 && v <= 65535)) {
            if (!pauseRef.current) {
              const dark  = darkRef  || new Array(18).fill(0);
              const white = whiteRef || new Array(18).fill(4095);
              const corr  = vals.map((v,i) =>
                Math.max(0, Math.min(4095, Math.round((v - dark[i]) / (white[i] - dark[i] + 1) * 4095)))
              );
              histRef.current = histRef.current.map((a,i) => {
                const nx = [...a, corr[i]];
                return nx.length > HLEN ? nx.slice(-HLEN) : nx;
              });
              setHist(histRef.current.map(a => [...a]));
              adcRef.current = corr;
              setAdc([...corr]);
              n++;
              setReads(n);
              setCsvBuf(p => {
                const row = [new Date().toISOString(), ...corr];
                const nx = [...p, row];
                return nx.length > 10000 ? nx.slice(-10000) : nx;
              });
            }
          } else if (line.includes(",")) {
            setErrors(e => e+1);
          }
        }
      }
    } catch(e) {
      if (e.name !== "NotFoundError") log("Error: " + e.message, "err");
      else log("Cancelled", "warn");
      setConn(false);
    }
  }

  async function disconnect() {
    setConn(false); log("Disconnected", "warn");
    try {
      if (rdrRef.current)  { await rdrRef.current.cancel();  rdrRef.current = null; }
      if (portRef.current) { await portRef.current.close();  portRef.current = null; }
    } catch {}
  }

  function togglePause() {
    pauseRef.current = !pauseRef.current;
    setPaused(pauseRef.current);
    log(pauseRef.current ? "Paused" : "Resumed", "warn");
  }

  function captureDark() {
    if (!conn || reads === 0) { log("No data", "err"); return; }
    setDarkRef([...adcRef.current]);
    log("Dark ref set — avg " + Math.round(adcRef.current.reduce((a,b)=>a+b)/18), "ok");
  }

  function captureWhite() {
    if (!conn || reads === 0) { log("No data", "err"); return; }
    setWhite([...adcRef.current]);
    log("White ref set — avg " + Math.round(adcRef.current.reduce((a,b)=>a+b)/18), "ok");
  }

  function exportCSV() {
    if (!csvBuf.length) { log("No data to export", "warn"); return; }
    const hdr = ["timestamp", ...CH.map(c => c.nm+"nm")].join(",");
    const blob = new Blob([hdr+"\n"+csvBuf.map(r=>r.join(",")).join("\n")], {type:"text/csv"});
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob),
      download: "soilspec_"+new Date().toISOString().slice(0,19).replace(/:/g,"-")+".csv"
    });
    a.click();
    log("Exported " + csvBuf.length + " rows", "ok");
  }

  const soil = calcSoil(adc);
  const scoreCol = !soil ? "#64748b" : soil.score>=70 ? "#22c55e" : soil.score>=45 ? "#f59e0b" : "#ef4444";

  // spectrum bar chart
  const specBar = {
    labels: CH.map(c => c.nm + ""),
    datasets: [{
      data: adc,
      backgroundColor: CH.map(c => rgba(c.col, 0.8)),
      borderColor:     CH.map(c => c.col),
      borderWidth: 1.5,
      borderRadius: 3,
    }],
  };
  const specOpts = {
    responsive: true, maintainAspectRatio: false,
    animation: { duration: 0 },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: ctx => CH[ctx[0].dataIndex].nm + " nm — " + CH[ctx[0].dataIndex].r,
          label: ctx => "  ADC: " + ctx.parsed.y,
        }
      }
    },
    scales: {
      x: {
        ticks: { color:"#4a6080", font:{ size:10, family:"monospace" } },
        grid: { color:"#0f172a" },
        border: { display:false },
      },
      y: {
        min:0, max:4095,
        ticks: { color:"#4a6080", font:{ size:10 }, maxTicksLimit:6 },
        grid: { color:"#1a2744" },
        border: { display:false },
      },
    },
  };

  // selected channel trend
  const trendLine = {
    labels: hist[selCh].map((_,i) => i),
    datasets: [{
      data: hist[selCh],
      borderColor: CH[selCh].col,
      backgroundColor: rgba(CH[selCh].col, 0.1),
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.4,
      fill: true,
    }],
  };
  const trendOpts = {
    responsive: true, maintainAspectRatio: false,
    animation: { duration: 0 },
    plugins: { legend:{ display:false }, tooltip:{ enabled:false } },
    scales: {
      x: { display:false },
      y: {
        min:0, max:4095,
        ticks: { color:"#4a6080", font:{ size:10 }, maxTicksLimit:4 },
        grid: { color:"#1a2744" },
        border: { display:false },
      },
    },
  };

  const S = {
    page: {
      display:"flex", flexDirection:"column", height:"100vh",
      background:"#0a0f1a", color:"#d4e2f4",
      fontFamily:"'Inter','Segoe UI',sans-serif", fontSize:13,
    },

    // ── topbar
    topbar: {
      display:"flex", alignItems:"center", gap:10,
      padding:"0 16px", height:50,
      background:"#101827", borderBottom:"1px solid #1a2a40",
      flexShrink:0,
    },
    logo: { fontSize:16, fontWeight:700, letterSpacing:1, marginRight:8, color:"#d4e2f4" },
    logoGreen: { color:"#22c55e" },

    tabBar: { display:"flex", gap:4, marginLeft:8 },
    tab: (on) => ({
      padding:"5px 14px", borderRadius:6, border:"none",
      cursor:"pointer", fontSize:12, fontWeight:600,
      background: on ? "#1c2d45" : "transparent",
      color: on ? "#d4e2f4" : "#4a6080",
    }),

    liveChip: (on) => ({
      display:"flex", alignItems:"center", gap:6,
      padding:"4px 10px", borderRadius:20,
      background: on ? "#052e16" : "#0f1929",
      border: `1px solid ${on ? "#16a34a" : "#1a2a40"}`,
      color: on ? "#22c55e" : "#4a6080",
      fontSize:11, fontWeight:700,
    }),
    dot: (on) => ({
      width:7, height:7, borderRadius:"50%",
      background: on ? "#22c55e" : "#334155",
      animation: on ? "blink 1.4s infinite" : "none",
    }),

    connBtn: (on) => ({
      padding:"5px 14px", borderRadius:8,
      border:`1px solid ${on ? "#dc2626" : "#16a34a"}`,
      background: on ? "#1a0505" : "#052e16",
      color: on ? "#ef4444" : "#22c55e",
      cursor:"pointer", fontSize:12, fontWeight:700,
    }),
    pauseBtn: (on) => ({
      padding:"5px 14px", borderRadius:8,
      border:`1px solid ${on ? "#d97706" : "#1a2a40"}`,
      background: on ? "#1c0f00" : "transparent",
      color: on ? "#f59e0b" : "#4a6080",
      cursor:"pointer", fontSize:12, fontWeight:600,
    }),
    expBtn: {
      padding:"5px 14px", borderRadius:8,
      border:"1px solid #1a3a5a", background:"transparent",
      color:"#3b82f6", cursor:"pointer", fontSize:12, fontWeight:600,
    },
    topRight: { marginLeft:"auto", display:"flex", gap:8, alignItems:"center" },
    statTxt: { fontSize:11, color:"#2d4060" },
    statVal: { color:"#4a6080" },

    // ── raw strip
    rawStrip: {
      height:20, background:"#070b14", borderBottom:"1px solid #101827",
      display:"flex", alignItems:"center", padding:"0 16px", gap:8,
      fontSize:10, fontFamily:"monospace", flexShrink:0,
    },

    // ── body
    body: { display:"flex", flex:1, overflow:"hidden" },

    // ── left sidebar
    sidebar: {
      width:280, flexShrink:0,
      background:"#101827", borderRight:"1px solid #1a2a40",
      display:"flex", flexDirection:"column", overflow:"hidden",
    },
    sideSection: { padding:"12px 14px", borderBottom:"1px solid #1a2a40", flexShrink:0 },
    sideSectionTitle: { fontSize:10, fontWeight:700, letterSpacing:1.2, textTransform:"uppercase", color:"#2d4060", marginBottom:10 },

    // metric card
    metricGrid: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 },
    metricCard: (col) => ({
      background:"#0d1625", border:`1px solid #1a2a40`, borderRadius:10,
      padding:"10px 12px", borderTop:`2px solid ${col}`,
    }),
    metricLabel: { fontSize:10, color:"#4a6080", marginBottom:4, fontWeight:500 },
    metricValue: (col) => ({ fontSize:24, fontWeight:700, color:col, lineHeight:1, fontFamily:"monospace" }),
    metricUnit:  { fontSize:10, color:"#2d4060", marginTop:2 },
    metricBar:   { height:3, background:"#1a2a40", borderRadius:2, marginTop:8, overflow:"hidden" },
    metricFill:  (col,pct) => ({ height:"100%", borderRadius:2, background:col, width:pct+"%", transition:"width .5s" }),
    metricStatus: (col) => ({ fontSize:10, fontWeight:700, color:col, marginTop:4 }),

    // score
    scoreRow: { display:"flex", alignItems:"center", gap:14, padding:"10px 14px", borderBottom:"1px solid #1a2a40", flexShrink:0 },

    // npk
    npkRow: { display:"flex", alignItems:"center", gap:8, marginBottom:8 },
    npkEl: (col) => ({ fontSize:13, fontWeight:700, color:col, width:16, textAlign:"center", flexShrink:0 }),
    npkTrack: { flex:1, height:8, background:"#1a2a40", borderRadius:4, overflow:"hidden" },
    npkFill: (col,pct) => ({ height:"100%", borderRadius:4, background:col, width:pct+"%", transition:"width .5s" }),
    npkPpm: (col) => ({ fontSize:11, fontWeight:700, color:col, fontFamily:"monospace", width:52, textAlign:"right" }),
    npkStatus: (col) => ({ fontSize:9, fontWeight:700, color:col, width:24, textAlign:"right" }),

    // cal
    calRow: { display:"flex", gap:6 },
    calBtn: (set) => ({
      flex:1, padding:"6px", borderRadius:8, cursor:"pointer", fontSize:11, fontWeight:600,
      border:`1px solid ${set?"#16a34a":"#1a2a40"}`,
      background: set ? "#052e16" : "transparent",
      color: set ? "#22c55e" : "#4a6080",
    }),

    // log
    logArea: { flex:1, overflowY:"auto", padding:"6px 12px" },
    logLine: { display:"flex", gap:8, fontSize:10, fontFamily:"monospace", padding:"1px 0" },
    logTs: { color:"#1a2a40", flexShrink:0 },

    // ── main
    main: { flex:1, overflow:"auto", padding:14, display:"flex", flexDirection:"column", gap:14, background:"#0a0f1a" },

    card: {
      background:"#0d1625", border:"1px solid #1a2a40", borderRadius:12, padding:16,
    },
    cardHead: { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 },
    cardTitle: { fontSize:13, fontWeight:600, color:"#d4e2f4" },
    cardSub:   { fontSize:11, color:"#2d4060" },

    // 18 channel grid
    chGrid: { display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:8 },
    chCard: (sel, col) => ({
      background:"#0a1020", borderRadius:10, padding:"10px",
      border: sel ? `2px solid ${col}` : "1px solid #1a2a40",
      cursor:"pointer", transition:"border-color .12s",
    }),
    chHead: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 },
    chNm: (col) => ({ fontSize:13, fontWeight:700, color:col }),
    chNmSub: { fontSize:10, fontWeight:400, color:"#2d4060" },
    chBadge: (col) => ({
      fontSize:9, fontWeight:700, padding:"2px 5px", borderRadius:4,
      background: col+"22", color:col,
    }),
    chAdc: (col) => ({ fontSize:11, fontWeight:700, color:col, fontFamily:"monospace", textAlign:"right", marginTop:4 }),
    chBarWrap: { height:3, background:"#1a2a40", borderRadius:2, marginTop:4, overflow:"hidden" },
    chBarFill: (col, pct) => ({ height:"100%", borderRadius:2, background:col, width:pct+"%", transition:"width .3s" }),

    // channel picker strip
    chPicker: { display:"flex", flexWrap:"wrap", gap:4, marginTop:12 },
    chPick: (sel, col) => ({
      padding:"3px 8px", borderRadius:4, cursor:"pointer", fontSize:10, fontWeight:700,
      background: sel ? col+"28" : "transparent",
      color: sel ? col : "#2d4060",
      border: sel ? `1px solid ${col}66` : "1px solid transparent",
    }),

    // section bands
    bandHead: { display:"flex", alignItems:"center", gap:10, marginBottom:8 },
    bandTitle: { fontSize:12, fontWeight:700, color:"#4a6080" },
    bandSub:   { fontSize:11, color:"#1a2a40" },
    bandLine:  { flex:1, height:1, background:"#1a2a40" },
  };

  const METRICS = [
    {
      label:"Moisture",    val:soil?.moisture,  unit:"% VWC",  col:"#38bdf8", max:100,
      status: soil ? (soil.moisture<25?"Dry":soil.moisture<65?"Optimal":"Wet") : "—",
      statCol: soil ? (soil.moisture<25?"#ef4444":soil.moisture<65?"#22c55e":"#f59e0b") : "#2d4060",
    },
    {
      label:"Org. Matter", val:soil?.om,         unit:"% SOM",  col:"#4ade80", max:15,
      status: soil ? (parseFloat(soil.om)<2?"Low":parseFloat(soil.om)<5?"Moderate":"High") : "—",
      statCol: soil ? (parseFloat(soil.om)<2?"#ef4444":parseFloat(soil.om)<5?"#f59e0b":"#22c55e") : "#2d4060",
    },
    {
      label:"Conductivity",val:soil?.ec,         unit:"mS/cm",  col:"#22d3ee", max:6,
      status: soil ? (parseFloat(soil.ec)<0.8?"Low":parseFloat(soil.ec)<3?"Normal":"High") : "—",
      statCol: soil ? (parseFloat(soil.ec)<0.8?"#f59e0b":parseFloat(soil.ec)<3?"#22c55e":"#ef4444") : "#2d4060",
    },
    {
      label:"NIR Index",   val:soil?.ndmi,       unit:"NDMI",   col:"#a78bfa", max:1,
      status: soil ? (parseFloat(soil.ndmi)>0.1?"High":parseFloat(soil.ndmi)<-0.2?"Low":"Neutral") : "—",
      statCol: soil ? (parseFloat(soil.ndmi)>0.1?"#22c55e":parseFloat(soil.ndmi)<-0.2?"#ef4444":"#f59e0b") : "#2d4060",
    },
  ];

  const NPK = [
    { el:"N", val:soil?.N, max:350, col:"#4ade80" },
    { el:"P", val:soil?.P, max:160, col:"#fb923c" },
    { el:"K", val:soil?.K, max:280, col:"#c084fc" },
  ];

  const logColors = { ok:"#22c55e", warn:"#f59e0b", err:"#ef4444", info:"#3b82f6" };

  return (
    <div style={S.page}>
      <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}`}</style>

      {/* ── TOPBAR ── */}
      <div style={S.topbar}>
        <span style={S.logo}>Soil<span style={S.logoGreen}>Spec</span></span>

        <div style={S.tabBar}>
          {[["overview","Overview"],["channels","All 18 Channels"]].map(([k,l])=>(
            <button key={k} style={S.tab(tab===k)} onClick={()=>setTab(k)}>{l}</button>
          ))}
        </div>

        <div style={S.liveChip(conn)}>
          <span style={S.dot(conn)}/>
          {conn ? "LIVE" : "OFFLINE"}
        </div>

        <div style={S.topRight}>
          <span style={S.statTxt}>reads <b style={S.statVal}>{reads}</b></span>
          <span style={S.statTxt}>err <b style={{color:"#d97706"}}>{errors}</b></span>
          <button style={S.connBtn(conn)} onClick={connect}>
            {conn ? "Disconnect" : "Connect"}
          </button>
          {conn && <button style={S.pauseBtn(paused)} onClick={togglePause}>{paused?"Resume":"Pause"}</button>}
          <button style={S.expBtn} onClick={exportCSV}>Export CSV</button>
        </div>
      </div>

      {/* ── RAW STRIP ── */}
      <div style={S.rawStrip}>
        <span style={{color:"#1a2a40"}}>LAST RAW ›</span>
        <span style={{color:"#14b8a6",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{rawLine}</span>
      </div>

      {/* ── BODY ── */}
      <div style={S.body}>

        {/* ── SIDEBAR ── */}
        <div style={S.sidebar}>

          {/* soil metrics */}
          <div style={S.sideSection}>
            <div style={S.sideSectionTitle}>Soil Metrics</div>
            <div style={S.metricGrid}>
              {METRICS.map(({label,val,unit,col,max,status,statCol}) => (
                <div key={label} style={S.metricCard(col)}>
                  <div style={S.metricLabel}>{label}</div>
                  <div style={S.metricValue(col)}>{val ?? <span style={{color:"#1a2a40"}}>—</span>}</div>
                  <div style={S.metricUnit}>{unit}</div>
                  <div style={S.metricBar}>
                    <div style={S.metricFill(col, val!=null ? Math.min(100, Math.abs(parseFloat(val))/max*100) : 0)}/>
                  </div>
                  <div style={S.metricStatus(statCol)}>{status}</div>
                </div>
              ))}
            </div>
          </div>

          {/* health score */}
          <div style={S.scoreRow}>
            <ScoreArc score={soil?.score}/>
            <div>
              <div style={{fontSize:11,color:"#2d4060",marginBottom:4}}>Health Score</div>
              <div style={{fontSize:26,fontWeight:700,color:scoreCol,fontFamily:"monospace",lineHeight:1}}>
                {soil?.score ?? "—"}
              </div>
              <div style={{fontSize:11,color:scoreCol,fontWeight:600,marginTop:4}}>
                {!soil?"Awaiting data":soil.score>=70?"Good condition":soil.score>=45?"Moderate":"Needs attention"}
              </div>
            </div>
          </div>

          {/* NPK */}
          <div style={S.sideSection}>
            <div style={S.sideSectionTitle}>NPK Estimate</div>
            {NPK.map(({el,val,max,col}) => {
              const pct = val!=null ? Math.min(100, val/max*100) : 0;
              const lvl = val==null?"—":val<max*.25?"LOW":val<max*.6?"MED":"HIGH";
              const lc  = lvl==="LOW"?"#ef4444":lvl==="HIGH"?"#22c55e":"#f59e0b";
              return (
                <div key={el} style={S.npkRow}>
                  <span style={S.npkEl(col)}>{el}</span>
                  <div style={S.npkTrack}><div style={S.npkFill(col,pct)}/></div>
                  <span style={S.npkPpm(col)}>{val!=null?val+" ppm":"—"}</span>
                  <span style={S.npkStatus(lc)}>{lvl}</span>
                </div>
              );
            })}
            <div style={{fontSize:10,color:"#1a2a40",marginTop:4,lineHeight:1.6}}>
              * Spectral proxy — verify with lab
            </div>
          </div>

          {/* calibration */}
          <div style={S.sideSection}>
            <div style={S.sideSectionTitle}>Calibration</div>
            <div style={S.calRow}>
              <button style={S.calBtn(!!darkRef)} onClick={captureDark}>{darkRef?"✓ Dark":"Dark Ref"}</button>
              <button style={S.calBtn(!!whiteRef)} onClick={captureWhite}>{whiteRef?"✓ White":"White Ref"}</button>
            </div>
          </div>

          {/* log */}
          <div style={S.logArea}>
            {logs.length===0 && <div style={{color:"#1a2a40",padding:"8px 0",fontSize:11}}>Connect to start logging…</div>}
            {logs.map((e,i)=>(
              <div key={i} style={S.logLine}>
                <span style={S.logTs}>{e.ts}</span>
                <span style={{color:logColors[e.t]}}>{e.msg}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── MAIN CONTENT ── */}
        <div style={S.main}>

          {/* ── OVERVIEW TAB ── */}
          {tab==="overview" && <>

            {/* full spectrum bar */}
            <div style={S.card}>
              <div style={S.cardHead}>
                <span style={S.cardTitle}>Full Spectrum — 18 channels · 410–940 nm</span>
                <span style={S.cardSub}>avg ADC <b style={{color:"#4a6080",fontFamily:"monospace"}}>{reads>0?Math.round(adc.reduce((a,b)=>a+b)/18):0}</b></span>
              </div>
              <div style={{position:"relative",height:180}}>
                <Bar
                  data={specBar}
                  options={specOpts}
                  aria-label="Bar chart of 18 spectral channel ADC values from 410 to 940 nm"
                  role="img"
                />
              </div>
              {/* legend */}
              <div style={{display:"flex",gap:20,marginTop:12,justifyContent:"center"}}>
                {[["Visible (410–680nm)","#fb923c"],["Red-Edge (705nm)","#f43f5e"],["NIR (730–940nm)","#a78bfa"]].map(([l,c])=>(
                  <span key={l} style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:"#4a6080"}}>
                    <span style={{width:12,height:8,borderRadius:2,background:c}}/>
                    {l}
                  </span>
                ))}
              </div>
            </div>

            {/* trend + NIR highlights */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>

              {/* selected channel trend */}
              <div style={S.card}>
                <div style={S.cardHead}>
                  <span style={S.cardTitle}>Channel Trend</span>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{
                      fontSize:12,padding:"2px 10px",borderRadius:6,fontWeight:700,
                      background:CH[selCh].col+"22",color:CH[selCh].col,
                    }}>
                      {CH[selCh].nm} nm · {CH[selCh].r}
                    </span>
                    <span style={{fontSize:22,fontWeight:700,color:CH[selCh].col,fontFamily:"monospace"}}>{adc[selCh]}</span>
                  </div>
                </div>
                <div style={{position:"relative",height:110}}>
                  <Line data={trendLine} options={trendOpts} aria-label="Line chart of selected channel ADC values over time" role="img"/>
                </div>
                <div style={S.chPicker}>
                  {CH.map((ch,i)=>(
                    <button key={i} style={S.chPick(selCh===i,ch.col)} onClick={()=>setSelCh(i)}>{ch.nm}</button>
                  ))}
                </div>
              </div>

              {/* 6 NIR channel cards */}
              <div style={S.card}>
                <div style={S.cardHead}>
                  <span style={S.cardTitle}>NIR Channels — moisture sensitive</span>
                  <span style={S.cardSub}>730–940 nm</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                  {[12,13,14,15,16,17].map(i=>{
                    const ch=CH[i], v=adc[i], pct=Math.round(v/4095*100);
                    return(
                      <div key={i} style={S.chCard(selCh===i,ch.col)} onClick={()=>setSelCh(i)}>
                        <div style={S.chHead}>
                          <span style={S.chNm(ch.col)}>{ch.nm}<span style={S.chNmSub}> nm</span></span>
                          <span style={S.chBadge(ch.col)}>NIR</span>
                        </div>
                        <Spark data={hist[i]} color={ch.col}/>
                        <div style={S.chBarWrap}><div style={S.chBarFill(ch.col,pct)}/></div>
                        <div style={S.chAdc(ch.col)}>{v}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>}

          {/* ── 18 CHANNELS TAB ── */}
          {tab==="channels" && <>

            {[
              { label:"Visible Band", sub:"410–680 nm · 11 channels", indices:[0,1,2,3,4,5,6,7,8,9,10], cols:"repeat(6,1fr)" },
              { label:"Red-Edge",     sub:"705 nm",                   indices:[11],                      cols:"repeat(6,1fr)" },
              { label:"NIR Band",     sub:"730–940 nm · 6 channels",  indices:[12,13,14,15,16,17],        cols:"repeat(6,1fr)" },
            ].map(({label,sub,indices,cols})=>(
              <div key={label}>
                <div style={S.bandHead}>
                  <span style={S.bandTitle}>{label}</span>
                  <span style={S.bandSub}>{sub}</span>
                  <div style={S.bandLine}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:cols,gap:8,marginBottom:4}}>
                  {indices.map(i=>{
                    const ch=CH[i], v=adc[i], pct=Math.round(v/4095*100);
                    return(
                      <div key={i} style={S.chCard(selCh===i,ch.col)} onClick={()=>{setSelCh(i);setTab("overview");}}>
                        <div style={S.chHead}>
                          <span style={S.chNm(ch.col)}>{ch.nm}<span style={S.chNmSub}> nm</span></span>
                          <span style={S.chBadge(ch.col)}>{ch.r}</span>
                        </div>
                        <Spark data={hist[i]} color={ch.col}/>
                        <div style={S.chBarWrap}><div style={S.chBarFill(ch.col,pct)}/></div>
                        <div style={S.chAdc(ch.col)}>{v}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* summary table */}
            <div style={S.card}>
              <div style={S.cardHead}>
                <span style={S.cardTitle}>All channels — summary table</span>
                <span style={S.cardSub}>click row to view trend</span>
              </div>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead>
                  <tr style={{borderBottom:"1px solid #1a2a40"}}>
                    {["Wavelength","Region","ADC Value","Level","% Full Scale"].map(h=>(
                      <th key={h} style={{textAlign:h==="ADC Value"||h==="% Full Scale"?"right":"left",padding:"6px 8px",fontSize:10,color:"#2d4060",fontWeight:600}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CH.map((ch,i)=>{
                    const v=adc[i], pct=Math.round(v/4095*100);
                    return(
                      <tr key={i}
                        style={{borderBottom:"1px solid #0f1a2d",cursor:"pointer",background:selCh===i?"#0d1828":"transparent"}}
                        onClick={()=>{setSelCh(i);setTab("overview");}}>
                        <td style={{padding:"7px 8px"}}>
                          <span style={{fontWeight:700,color:ch.col,fontFamily:"monospace"}}>{ch.nm} nm</span>
                        </td>
                        <td style={{padding:"7px 8px",fontSize:11,color:"#4a6080"}}>{ch.r}</td>
                        <td style={{padding:"7px 8px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:"#d4e2f4"}}>{v}</td>
                        <td style={{padding:"7px 8px",width:160}}>
                          <div style={{height:6,background:"#1a2a40",borderRadius:3,overflow:"hidden"}}>
                            <div style={{height:"100%",borderRadius:3,background:ch.col,width:pct+"%",transition:"width .3s"}}/>
                          </div>
                        </td>
                        <td style={{padding:"7px 8px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:ch.col,fontSize:11}}>{pct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>}

        </div>
      </div>
    </div>
  );
}
