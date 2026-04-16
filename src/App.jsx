import { useState, useRef, useEffect, useCallback } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Filler,
  Tooltip,
} from "chart.js";

Chart.register(LineElement, CategoryScale, LinearScale, PointElement, Filler, Tooltip);

// ── Channel config ─────────────────────────────────────────────────────────
const CHANNELS = [
  { nm: 410,  region: "VIS",    color: "#a78bfa", bg: "rgba(167,139,250,0.12)" },
  { nm: 435,  region: "VIS",    color: "#818cf8", bg: "rgba(129,140,248,0.12)" },
  { nm: 460,  region: "VIS",    color: "#60a5fa", bg: "rgba(96,165,250,0.12)"  },
  { nm: 485,  region: "VIS",    color: "#38bdf8", bg: "rgba(56,189,248,0.12)"  },
  { nm: 510,  region: "VIS",    color: "#34d399", bg: "rgba(52,211,153,0.12)"  },
  { nm: 535,  region: "VIS",    color: "#4ade80", bg: "rgba(74,222,128,0.12)"  },
  { nm: 560,  region: "VIS",    color: "#a3e635", bg: "rgba(163,230,53,0.12)"  },
  { nm: 585,  region: "VIS",    color: "#facc15", bg: "rgba(250,204,21,0.12)"  },
  { nm: 610,  region: "VIS",    color: "#fb923c", bg: "rgba(251,146,60,0.12)"  },
  { nm: 645,  region: "VIS",    color: "#f87171", bg: "rgba(248,113,113,0.12)" },
  { nm: 680,  region: "VIS",    color: "#ef4444", bg: "rgba(239,68,68,0.12)"   },
  { nm: 705,  region: "R-Edge", color: "#e11d48", bg: "rgba(225,29,72,0.12)"   },
  { nm: 730,  region: "NIR",    color: "#c026d3", bg: "rgba(192,38,211,0.12)"  },
  { nm: 760,  region: "NIR",    color: "#9333ea", bg: "rgba(147,51,234,0.12)"  },
  { nm: 810,  region: "NIR",    color: "#7c3aed", bg: "rgba(124,58,237,0.12)"  },
  { nm: 860,  region: "NIR",    color: "#4f46e5", bg: "rgba(79,70,229,0.12)"   },
  { nm: 900,  region: "NIR",    color: "#2563eb", bg: "rgba(37,99,235,0.12)"   },
  { nm: 940,  region: "NIR",    color: "#0ea5e9", bg: "rgba(14,165,233,0.12)"  },
];

const HISTORY_LEN = 60; // points per channel sparkline

// ── Derive soil params from ADC values ────────────────────────────────────
function deriveParams(vals) {
  const nirAvg = (vals[12]+vals[13]+vals[14]+vals[15]+vals[16]+vals[17]) / 6;
  const visAvg = (vals[0]+vals[1]+vals[2]+vals[3]+vals[4]+vals[5]+vals[6]+vals[7]+vals[8]+vals[9]+vals[10]+vals[11]) / 12;
  const avg    = vals.reduce((a,b)=>a+b,0) / 18;
  const moisture = Math.max(0, Math.min(100, Math.round((1 - nirAvg/4095) * 90)));
  const om       = Math.max(0.5, Math.min(15, ((4095-visAvg)/4095*10)+1.2)).toFixed(1);
  const ec       = Math.max(0.1, Math.min(6,  ((vals[15]-vals[17])/(vals[15]+vals[17]+1))*3+1.8)).toFixed(2);
  const ndmi     = ((nirAvg-visAvg)/(nirAvg+visAvg+1)).toFixed(3);
  const N = Math.round(Math.max(20, Math.min(350, 200-(moisture*0.7)+(parseFloat(om)*14))));
  const P = Math.round(Math.max(10, Math.min(160, (vals[8]/4095)*100+30)));
  const K = Math.round(Math.max(30, Math.min(280, (vals[10]/4095)*110+80)));
  const score = Math.round(Math.min(98, Math.max(8,
    (parseFloat(om)/10)*35 + (1-Math.abs(moisture-42)/42)*30 + (N/350)*20 + (K/280)*15
  )));
  return { moisture, om, ec, ndmi, N, P, K, score, avg: Math.round(avg), nirAvg: Math.round(nirAvg) };
}

// ── Sparkline component (one per channel) ────────────────────────────────
function ChannelCard({ ch, index, history, currentVal }) {
  const chartData = {
    labels: history.map((_,i) => i),
    datasets: [{
      data: history,
      borderColor: ch.color,
      backgroundColor: ch.bg,
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0.35,
      fill: true,
    }],
  };
  const opts = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: {
      x: { display: false },
      y: {
        display: true,
        min: 0,
        max: 4095,
        grid: { color: "rgba(255,255,255,0.04)", lineWidth: 0.5 },
        ticks: { display: false },
        border: { display: false },
      },
    },
  };

  const pct = Math.round((currentVal / 4095) * 100);

  return (
    <div
      style={{ borderColor: ch.color + "40" }}
      className="rounded-lg border bg-[#0d1424] flex flex-col gap-1 p-2 hover:bg-[#111d30] transition-colors"
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: ch.color }}
          />
          <span className="font-mono font-bold text-xs" style={{ color: ch.color }}>
            {ch.nm} nm
          </span>
        </div>
        <span
          className="text-[9px] font-mono px-1.5 py-0.5 rounded"
          style={{ background: ch.color + "22", color: ch.color }}
        >
          {ch.region}
        </span>
      </div>

      {/* Sparkline */}
      <div style={{ height: 52 }}>
        <Line data={chartData} options={opts} />
      </div>

      {/* Footer row — ADC value + bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1 rounded bg-[#1e2d45] overflow-hidden">
          <div
            className="h-full rounded transition-all duration-300"
            style={{ width: pct + "%", background: ch.color }}
          />
        </div>
        <span className="font-mono text-[10px] font-semibold w-10 text-right"
          style={{ color: ch.color }}>
          {currentVal}
        </span>
      </div>
    </div>
  );
}

// ── Score arc SVG ─────────────────────────────────────────────────────────
function ScoreArc({ score }) {
  const r = 38, cx = 44, cy = 44;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - (score || 0) / 100);
  const col = score >= 70 ? "#00e676" : score >= 45 ? "#ffab00" : "#ff1744";
  return (
    <svg width="88" height="88" viewBox="0 0 88 88">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1a2235" strokeWidth="9" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={col} strokeWidth="9"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "stroke-dashoffset 0.5s ease" }}
      />
      <text x={cx} y={cy+7} textAnchor="middle" fontSize="20" fontWeight="700"
        fill={col} fontFamily="monospace">{score ?? "—"}</text>
    </svg>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────
export default function App() {
  const [data,      setData]      = useState(new Array(18).fill(0));
  const [connected, setConnected] = useState(false);
  const [paused,    setPaused]    = useState(false);
  const [readings,  setReadings]  = useState(0);
  const [parseErrs, setParseErrs] = useState(0);
  const [lastRaw,   setLastRaw]   = useState("—");
  const [darkRef,   setDarkRef]   = useState(null);
  const [whiteRef,  setWhiteRef]  = useState(null);
  const [log,       setLog]       = useState([]);
  const [selCh,     setSelCh]     = useState(15); // 860 nm default
  const [exportBuf, setExportBuf] = useState([]);

  // Per-channel history: array of 18 arrays of up to HISTORY_LEN values
  const historyRef = useRef(Array.from({length:18}, ()=>new Array(HISTORY_LEN).fill(0)));
  const [history,  setHistory]   = useState(Array.from({length:18}, ()=>new Array(HISTORY_LEN).fill(0)));

  const portRef   = useRef(null);
  const readerRef = useRef(null);
  const pausedRef = useRef(false);
  const dataRef   = useRef(new Array(18).fill(0));

  const addLog = useCallback((msg, type="info") => {
    const ts = new Date().toLocaleTimeString("en-GB");
    setLog(prev => {
      const next = [...prev, { ts, msg, type }];
      return next.length > 150 ? next.slice(-150) : next;
    });
  }, []);

  // ── Connect ──────────────────────────────────────────────────────────
  async function connect() {
    if (connected) { await disconnect(); return; }
    try {
      portRef.current = await navigator.serial.requestPort({
        filters: [{ usbVendorId: 0x03EB }] // Microchip/Atmel
      });
      await portRef.current.open({ baudRate: 115200, dataBits: 8, stopBits: 1, parity: "none" });
      setConnected(true);
      addLog("Port opened — 115200 8N1", "ok");
      addLog("Waiting for AS7265x data (format: RAW:v1,…,v18)", "info");

      const decoder = new TextDecoderStream();
      portRef.current.readable.pipeTo(decoder.writable);
      readerRef.current = decoder.readable.getReader();

      let buffer = "";
      let localReadings = 0;

      while (true) {
        const { value, done } = await readerRef.current.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          setLastRaw(trimmed.slice(0, 80));

          let rawStr = trimmed;
          if (rawStr.toUpperCase().startsWith("RAW:")) rawStr = rawStr.slice(4);

          const vals = rawStr.split(",").map(v => parseInt(v.trim(), 10));
          if (vals.length === 18 && vals.every(v => !isNaN(v) && v >= 0 && v <= 65535)) {
            if (!pausedRef.current) {
              // Apply calibration if set
              const dark  = darkRef  || new Array(18).fill(0);
              const white = whiteRef || new Array(18).fill(4095);
              const corrected = vals.map((v,i) =>
                Math.max(0, Math.min(4095, Math.round((v - dark[i]) / (white[i] - dark[i] + 1) * 4095)))
              );

              // Update per-channel history
              historyRef.current = historyRef.current.map((arr, i) => {
                const next = [...arr, corrected[i]];
                return next.length > HISTORY_LEN ? next.slice(-HISTORY_LEN) : next;
              });
              setHistory(historyRef.current.map(a => [...a]));
              dataRef.current = corrected;
              setData([...corrected]);
              localReadings++;
              setReadings(localReadings);

              // Export buffer
              setExportBuf(prev => {
                const row = [new Date().toISOString(), ...corrected];
                const next = [...prev, row];
                return next.length > 10000 ? next.slice(-10000) : next;
              });
            }
          } else if (trimmed.includes(",")) {
            setParseErrs(e => e + 1);
          }
        }
      }
    } catch (err) {
      if (err.name !== "NotFoundError") addLog("Error: " + err.message, "err");
      else addLog("Port selection cancelled", "warn");
      setConnected(false);
    }
  }

  async function disconnect() {
    setConnected(false);
    addLog("Disconnected", "warn");
    try {
      if (readerRef.current) { await readerRef.current.cancel(); readerRef.current = null; }
      if (portRef.current)   { await portRef.current.close();    portRef.current   = null; }
    } catch {}
  }

  function togglePause() {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
    addLog(pausedRef.current ? "Display paused" : "Display resumed", "warn");
  }

  // ── Calibration ───────────────────────────────────────────────────────
  function captureDark() {
    if (!connected || readings === 0) { addLog("No live data — connect first", "err"); return; }
    setDarkRef([...dataRef.current]);
    addLog("Dark ref captured — avg " + Math.round(dataRef.current.reduce((a,b)=>a+b)/18) + " ADC", "ok");
  }
  function captureWhite() {
    if (!connected || readings === 0) { addLog("No live data — connect first", "err"); return; }
    setWhiteRef([...dataRef.current]);
    addLog("White ref captured — avg " + Math.round(dataRef.current.reduce((a,b)=>a+b)/18) + " ADC", "ok");
  }

  // ── Export CSV ────────────────────────────────────────────────────────
  function exportCSV() {
    if (!exportBuf.length) { addLog("No data to export", "warn"); return; }
    const header = ["timestamp", ...CHANNELS.map(c => c.nm + "nm")].join(",");
    const rows   = exportBuf.map(r => r.join(",")).join("\n");
    const blob   = new Blob([header + "\n" + rows], { type: "text/csv" });
    const a      = document.createElement("a");
    a.href       = URL.createObjectURL(blob);
    a.download   = "soilspec_" + new Date().toISOString().slice(0,19).replace(/:/g,"-") + ".csv";
    a.click();
    addLog("Exported " + exportBuf.length + " rows", "ok");
  }

  const params = deriveParams(data);

  // Full-spectrum overview chart
  const overviewChart = {
    labels: CHANNELS.map(c => c.nm),
    datasets: [{
      label: "Spectrum",
      data: data,
      borderColor: "#00e676",
      backgroundColor: "rgba(0,230,118,0.07)",
      borderWidth: 2,
      pointRadius: 3,
      pointBackgroundColor: CHANNELS.map(c => c.color),
      tension: 0.3,
      fill: true,
    }],
  };
  const overviewOpts = {
    responsive: true, maintainAspectRatio: false,
    animation: { duration: 0 },
    plugins: { legend: { display: false },
      tooltip: { callbacks: {
        label: ctx => ` ${ctx.parsed.y} ADC  (${CHANNELS[ctx.dataIndex].nm} nm)`
      }}
    },
    scales: {
      x: { ticks: { color: "#4a6080", font: { size: 10, family: "monospace" } },
           grid:  { color: "rgba(30,45,69,0.5)", lineWidth: 0.5 }, border: { display: false } },
      y: { min: 0, max: 4095,
           ticks: { color: "#4a6080", font: { size: 10, family: "monospace" }, maxTicksLimit: 6 },
           grid:  { color: "rgba(30,45,69,0.5)", lineWidth: 0.5 }, border: { display: false } },
    },
  };

  // Selected channel trend
  const trendChart = {
    labels: history[selCh].map((_,i) => i),
    datasets: [{
      data: history[selCh],
      borderColor: CHANNELS[selCh].color,
      backgroundColor: CHANNELS[selCh].bg,
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0.3,
      fill: true,
    }],
  };
  const trendOpts = {
    responsive: true, maintainAspectRatio: false,
    animation: { duration: 0 },
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: {
      x: { display: false },
      y: { min: 0, max: 4095,
           ticks: { color: "#4a6080", font: { size: 9 }, maxTicksLimit: 4 },
           grid:  { color: "rgba(30,45,69,0.4)", lineWidth: 0.5 },
           border: { display: false } },
    },
  };

  const logColors = { ok:"text-green-400", warn:"text-amber-400", err:"text-red-400", info:"text-blue-400" };

  return (
    <div className="min-h-screen bg-[#07090f] text-[#d4e2f4] font-mono text-xs flex flex-col">

      {/* ── TOPBAR ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 h-11 bg-[#0c1018] border-b border-[#1e2d45] flex-shrink-0">
        <span className="font-bold text-sm tracking-widest">
          SOIL<span className="text-green-400">SPEC</span>
        </span>
        <span className="text-[#3d5278]">|</span>
        <span className="text-[#3d5278]">AS7265x · ATSAMD21G17D · 18-channel · 410–940 nm</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[#3d5278]">Readings</span>
          <span className="text-green-400 font-bold">{readings}</span>
          <span className="text-[#3d5278] ml-2">Errors</span>
          <span className="text-amber-400">{parseErrs}</span>
        </div>
      </div>

      {/* ── RAW LINE PREVIEW ────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 h-5 bg-[#07090f] border-b border-[#1e2d45] flex-shrink-0 text-[9px]">
        <span className="text-[#253348]">LAST RAW:</span>
        <span className="text-cyan-500 flex-1 truncate">{lastRaw}</span>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT SIDEBAR ──────────────────────────────────────── */}
        <div className="w-56 flex-shrink-0 bg-[#0c1018] border-r border-[#1e2d45] flex flex-col overflow-y-auto">

          {/* Connect controls */}
          <div className="p-3 border-b border-[#1e2d45] flex flex-col gap-2">
            <button onClick={connect}
              className={`w-full py-2 rounded text-xs font-bold tracking-wider transition-all border ${
                connected
                  ? "bg-[#00401a] border-green-500 text-green-400 hover:bg-[#005c24]"
                  : "bg-[#0c1018] border-[#2e4060] text-[#7b96b8] hover:border-green-500 hover:text-green-400"
              }`}>
              {connected ? "⬤ DISCONNECT" : "○ CONNECT"}
            </button>
            <div className="flex gap-2">
              <button onClick={togglePause} disabled={!connected}
                className={`flex-1 py-1.5 rounded text-[10px] border transition-all ${
                  paused ? "border-amber-500 text-amber-400 bg-[#3d2200]"
                         : "border-[#2e4060] text-[#7b96b8] hover:border-amber-500"
                } disabled:opacity-30`}>
                {paused ? "RESUME" : "PAUSE"}
              </button>
              <button onClick={exportCSV}
                className="flex-1 py-1.5 rounded text-[10px] border border-[#2e4060] text-[#7b96b8] hover:border-cyan-400 hover:text-cyan-400 transition-all">
                EXPORT
              </button>
            </div>
          </div>

          {/* Calibration */}
          <div className="p-3 border-b border-[#1e2d45]">
            <div className="text-[9px] text-[#3d5278] tracking-widest uppercase mb-2">Calibration</div>
            <div className="flex gap-2 mb-1.5">
              <button onClick={captureDark}
                className={`flex-1 py-1.5 rounded text-[10px] border transition-all ${
                  darkRef ? "border-green-500 text-green-400 bg-[#00401a]"
                          : "border-[#2e4060] text-[#7b96b8] hover:border-cyan-400"}`}>
                Dark ref
              </button>
              <button onClick={captureWhite}
                className={`flex-1 py-1.5 rounded text-[10px] border transition-all ${
                  whiteRef ? "border-green-500 text-green-400 bg-[#00401a]"
                           : "border-[#2e4060] text-[#7b96b8] hover:border-cyan-400"}`}>
                White ref
              </button>
            </div>
            <div className="flex gap-3 text-[9px]">
              <span className="text-[#3d5278]">Dark: <span className={darkRef?"text-green-400":"text-[#253348]"}>{darkRef?"set":"unset"}</span></span>
              <span className="text-[#3d5278]">White: <span className={whiteRef?"text-green-400":"text-[#253348]"}>{whiteRef?"set":"unset"}</span></span>
            </div>
          </div>

          {/* Soil parameters */}
          <div className="p-3 border-b border-[#1e2d45]">
            <div className="text-[9px] text-[#3d5278] tracking-widest uppercase mb-2">Soil Parameters</div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label:"Moisture", val:params.moisture+"%", color:"#60a5fa", bar:params.moisture },
                { label:"Org Matter", val:params.om+"%",    color:"#4ade80", bar:parseFloat(params.om)/12*100 },
                { label:"EC",        val:params.ec+" mS",   color:"#22d3ee", bar:parseFloat(params.ec)/5*100 },
                { label:"NIR Idx",   val:params.ndmi,        color:"#fb923c", bar:Math.max(0,(parseFloat(params.ndmi)+1)/2*100) },
              ].map(({label,val,color,bar})=>(
                <div key={label} className="bg-[#111827] rounded p-2 border border-[#1e2d45]">
                  <div className="text-[8px] text-[#3d5278] uppercase tracking-wide">{label}</div>
                  <div className="font-bold text-sm mt-0.5" style={{color}}>{val}</div>
                  <div className="h-1 bg-[#1a2235] rounded mt-1.5 overflow-hidden">
                    <div className="h-full rounded transition-all" style={{width:Math.min(100,bar||0)+"%",background:color}}/>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Health score */}
          <div className="p-3 border-b border-[#1e2d45] flex flex-col items-center gap-1">
            <div className="text-[9px] text-[#3d5278] tracking-widest uppercase mb-1">Health Score</div>
            <ScoreArc score={readings > 0 ? params.score : null} />
            <div className="text-[9px] text-[#7b96b8] tracking-wide">
              {readings > 0
                ? params.score >= 70 ? "Good condition"
                  : params.score >= 45 ? "Moderate" : "Needs attention"
                : "Awaiting data"}
            </div>
          </div>

          {/* NPK */}
          <div className="p-3 border-b border-[#1e2d45]">
            <div className="text-[9px] text-[#3d5278] tracking-widest uppercase mb-2">NPK Estimate</div>
            {[
              {el:"N", val:params.N, max:350, col:"#4ade80", bg:"#166534"},
              {el:"P", val:params.P, max:160, col:"#fb923c", bg:"#7c2d12"},
              {el:"K", val:params.K, max:280, col:"#c084fc", bg:"#3b0764"},
            ].map(({el,val,max,col,bg})=>(
              <div key={el} className="flex items-center gap-2 mb-1.5">
                <span className="font-bold text-sm w-3" style={{color:col}}>{el}</span>
                <div className="flex-1 h-4 bg-[#1a2235] rounded overflow-hidden border border-[#1e2d45]">
                  <div className="h-full flex items-center px-1.5 text-[8px] font-bold transition-all"
                    style={{width:Math.min(100,(val||0)/max*100)+"%",background:bg,color:col}}>
                    {val}
                  </div>
                </div>
                <span className="text-[9px] w-14 text-right" style={{color:col}}>{val} ppm</span>
              </div>
            ))}
            <div className="text-[8px] text-[#253348] mt-1">*Spectral proxy — verify with lab</div>
          </div>

          {/* Log */}
          <div className="flex-1 overflow-y-auto p-2">
            <div className="text-[9px] text-[#3d5278] tracking-widest uppercase mb-1 px-1">Event Log</div>
            {log.map((e,i)=>(
              <div key={i} className="flex gap-2 leading-6">
                <span className="text-[#253348] flex-shrink-0">{e.ts}</span>
                <span className={logColors[e.type]||"text-[#7b96b8]"}>{e.msg}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── MAIN CONTENT ────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto bg-[#07090f]">

          {/* Overview spectrum chart */}
          <div className="m-3 bg-[#0c1018] rounded-lg border border-[#1e2d45] p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] text-[#3d5278] tracking-widest uppercase">Full Spectrum Overview — all 18 channels</span>
              <span className="text-[#7b96b8]">avg ADC <span className="text-green-400 font-bold">{params.avg}</span></span>
            </div>
            <div style={{height:160}}>
              <Line data={overviewChart} options={overviewOpts} />
            </div>
          </div>

          {/* Selected channel trend */}
          <div className="mx-3 mb-3 bg-[#0c1018] rounded-lg border border-[#1e2d45] p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] text-[#3d5278] tracking-widest uppercase">
                Selected channel trend — {CHANNELS[selCh].nm} nm {CHANNELS[selCh].region}
              </span>
              <span className="font-bold text-sm" style={{color:CHANNELS[selCh].color}}>
                {data[selCh]} ADC
              </span>
            </div>
            <div style={{height:90}}>
              <Line data={trendChart} options={trendOpts} />
            </div>
            {/* Channel selector tabs */}
            <div className="flex flex-wrap gap-1 mt-2">
              {CHANNELS.map((ch,i)=>(
                <button key={i} onClick={()=>setSelCh(i)}
                  className={`px-2 py-0.5 rounded text-[9px] border transition-all ${
                    selCh===i
                      ? "border-current font-bold"
                      : "border-[#1e2d45] text-[#3d5278] hover:border-[#3d5278]"
                  }`}
                  style={selCh===i?{color:ch.color,borderColor:ch.color,background:ch.bg}:{}}>
                  {ch.nm}
                </button>
              ))}
            </div>
          </div>

          {/* ── 18 INDIVIDUAL CHANNEL GRAPHS ── */}
          <div className="mx-3 mb-2">
            <div className="text-[9px] text-[#3d5278] tracking-widest uppercase mb-2 px-0.5">
              Individual Channel Sparklines — 18 channels · last {HISTORY_LEN} readings
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {CHANNELS.map((ch, i) => (
                <ChannelCard
                  key={i}
                  ch={ch}
                  index={i}
                  history={history[i]}
                  currentVal={data[i]}
                />
              ))}
            </div>
          </div>

          <div className="h-4" />
        </div>
      </div>

      {/* ── STATUS BAR ──────────────────────────────────────────── */}
      <div className="h-5 bg-[#0c1018] border-t border-[#1e2d45] flex items-center px-4 gap-5 text-[9px] text-[#3d5278] flex-shrink-0">
        <span>Port <b className="text-[#7b96b8]">{connected?"open":"—"}</b></span>
        <span>Baud <b className="text-[#7b96b8]">115200</b></span>
        <span>Readings <b className="text-green-400">{readings}</b></span>
        <span>Dark <b className={darkRef?"text-green-400":"text-[#253348]"}>{darkRef?"set":"unset"}</b></span>
        <span>White <b className={whiteRef?"text-green-400":"text-[#253348]"}>{whiteRef?"set":"unset"}</b></span>
        <span className="ml-auto">SoilSpec v1.2 · AS7265x · ATSAMD21G17D</span>
      </div>
    </div>
  );
}