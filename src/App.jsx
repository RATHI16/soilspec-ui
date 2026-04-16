import { useState, useRef, useCallback } from "react";
import { Line, Bar } from "react-chartjs-2";
import {
  Chart, LineElement, BarElement, CategoryScale,
  LinearScale, PointElement, Filler, Tooltip,
} from "chart.js";
Chart.register(LineElement, BarElement, CategoryScale, LinearScale, PointElement, Filler, Tooltip);

const CH = [
  { nm:410, r:"VIS",    c:"#a78bfa" },{ nm:435, r:"VIS",    c:"#818cf8" },
  { nm:460, r:"VIS",    c:"#60a5fa" },{ nm:485, r:"VIS",    c:"#22d3ee" },
  { nm:510, r:"VIS",    c:"#34d399" },{ nm:535, r:"VIS",    c:"#4ade80" },
  { nm:560, r:"VIS",    c:"#a3e635" },{ nm:585, r:"VIS",    c:"#facc15" },
  { nm:610, r:"VIS",    c:"#fb923c" },{ nm:645, r:"VIS",    c:"#f87171" },
  { nm:680, r:"VIS",    c:"#ef4444" },{ nm:705, r:"R-Edge", c:"#f43f5e" },
  { nm:730, r:"NIR",    c:"#e879f9" },{ nm:760, r:"NIR",    c:"#c084fc" },
  { nm:810, r:"NIR",    c:"#a855f7" },{ nm:860, r:"NIR",    c:"#818cf8" },
  { nm:900, r:"NIR",    c:"#6366f1" },{ nm:940, r:"NIR",    c:"#38bdf8" },
];
const HLEN = 80;
const h2r = (h,a) => { const r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16); return `rgba(${r},${g},${b},${a})`; };

function soil(v){
  if(!v||v.every(x=>x===0)) return null;
  const nir=(v[12]+v[13]+v[14]+v[15]+v[16]+v[17])/6;
  const vis=(v[0]+v[1]+v[2]+v[3]+v[4]+v[5]+v[6]+v[7]+v[8]+v[9]+v[10]+v[11])/12;
  const moisture=Math.max(0,Math.min(100,Math.round((1-nir/4095)*90)));
  const om=Math.max(0.5,Math.min(15,((4095-vis)/4095*10)+1.2)).toFixed(1);
  const ec=Math.max(0.1,Math.min(6,((v[15]-v[17])/(v[15]+v[17]+1))*3+1.8)).toFixed(2);
  const ndmi=((nir-vis)/(nir+vis+1)).toFixed(3);
  const N=Math.round(Math.max(20,Math.min(350,200-(moisture*0.7)+(parseFloat(om)*14))));
  const P=Math.round(Math.max(10,Math.min(160,(v[8]/4095)*100+30)));
  const K=Math.round(Math.max(30,Math.min(280,(v[10]/4095)*110+80)));
  const score=Math.round(Math.min(98,Math.max(8,(parseFloat(om)/10)*35+(1-Math.abs(moisture-42)/42)*30+(N/350)*20+(K/280)*15)));
  const avg=Math.round(v.reduce((a,b)=>a+b,0)/18);
  return{moisture,om,ec,ndmi,N,P,K,score,avg};
}

function Spark({history,color,height=48}){
  const data={labels:history.map((_,i)=>i),datasets:[{data:history,borderColor:color,backgroundColor:h2r(color,.10),borderWidth:1.5,pointRadius:0,tension:.4,fill:true}]};
  const opts={responsive:true,maintainAspectRatio:false,animation:{duration:0},plugins:{legend:{display:false},tooltip:{enabled:false}},scales:{x:{display:false},y:{display:false,min:0,max:4095}}};
  return <div style={{height}}><Line data={data} options={opts}/></div>;
}

function Ring({value,max=100,color,size=76}){
  const r=28,cx=36,cy=36,circ=2*Math.PI*r;
  const off=circ*(1-(value!=null?Math.min(1,Math.max(0,value/max)):0));
  return(
    <svg width={size} height={size} viewBox="0 0 72 72">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e293b" strokeWidth="8"/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={value!=null?color:"#334155"} strokeWidth="8"
        strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} style={{transition:"stroke-dashoffset .5s"}}/>
      <text x={cx} y={cy+6} textAnchor="middle" fontSize="14" fontWeight="700"
        fill={value!=null?color:"#475569"} fontFamily="monospace">{value!=null?value:"—"}</text>
    </svg>
  );
}

function NPKBar({el,val,max,color}){
  const pct=val!=null?Math.min(100,val/max*100):0;
  const lvl=val==null?"—":val<max*.25?"LOW":val<max*.6?"MED":"HIGH";
  const lc=lvl==="LOW"?"#f87171":lvl==="HIGH"?"#4ade80":"#facc15";
  return(
    <div className="flex items-center gap-3">
      <span className="w-5 text-sm font-bold" style={{color}}>{el}</span>
      <div className="flex-1">
        <div className="flex justify-between mb-1">
          <span className="text-xs text-slate-400 font-mono">{val!=null?val+" ppm":"—"}</span>
          <span className="text-xs font-bold" style={{color:lc}}>{lvl}</span>
        </div>
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500"
            style={{width:pct+"%",background:`linear-gradient(90deg,${color}66,${color})`}}/>
        </div>
      </div>
    </div>
  );
}

function ChCard({ch,idx,val,hist,selected,onClick}){
  const pct=Math.round(val/4095*100);
  return(
    <button onClick={onClick}
      className="rounded-xl p-3 text-left transition-all border-2 bg-slate-900 hover:bg-slate-800 w-full"
      style={{borderColor:selected?ch.c:"transparent",boxShadow:selected?`0 0 14px ${ch.c}30`:"none"}}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{background:ch.c,boxShadow:`0 0 5px ${ch.c}99`}}/>
          <span className="font-bold text-sm" style={{color:ch.c}}>{ch.nm}<span className="text-[10px] font-normal text-slate-500"> nm</span></span>
        </div>
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
          style={{background:h2r(ch.c,.12),color:ch.c}}>{ch.r}</span>
      </div>
      <Spark history={hist} color={ch.c} height={46}/>
      <div className="flex items-center gap-2 mt-1.5">
        <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-300" style={{width:pct+"%",background:ch.c}}/>
        </div>
        <span className="font-mono text-xs font-bold min-w-[34px] text-right" style={{color:ch.c}}>{val}</span>
      </div>
    </button>
  );
}

export default function App(){
  const [adc,setAdc]=useState(new Array(18).fill(0));
  const [connected,setConn]=useState(false);
  const [paused,setPaused]=useState(false);
  const [readings,setReadings]=useState(0);
  const [errCount,setErrCount]=useState(0);
  const [lastRaw,setLastRaw]=useState("— waiting for data");
  const [darkRef,setDarkRef]=useState(null);
  const [whiteRef,setWhiteRef]=useState(null);
  const [selCh,setSelCh]=useState(15);
  const [tab,setTab]=useState("dashboard");
  const [log,setLog]=useState([]);
  const [expBuf,setExpBuf]=useState([]);

  const histRef=useRef(Array.from({length:18},()=>Array(HLEN).fill(0)));
  const [hist,setHist]=useState(Array.from({length:18},()=>Array(HLEN).fill(0)));
  const adcRef=useRef(new Array(18).fill(0));
  const portRef=useRef(null);
  const readerRef=useRef(null);
  const pausedRef=useRef(false);

  const addLog=useCallback((msg,type="info")=>{
    const ts=new Date().toLocaleTimeString("en-GB");
    setLog(p=>{const n=[...p,{ts,msg,type}];return n.length>150?n.slice(-150):n;});
  },[]);

  async function connect(){
    if(connected){await doDisc();return;}
    try{
      portRef.current=await navigator.serial.requestPort({filters:[{usbVendorId:0x03EB}]});
      await portRef.current.open({baudRate:115200,dataBits:8,stopBits:1,parity:"none"});
      setConn(true);
      addLog("Port opened — 115200 8N1","ok");
      addLog("Waiting for AS7265x stream  (RAW:v1,…,v18)","info");
      const dec=new TextDecoderStream();
      portRef.current.readable.pipeTo(dec.writable);
      readerRef.current=dec.readable.getReader();
      let buf="",localN=0;
      while(true){
        const{value,done}=await readerRef.current.read();
        if(done)break;
        buf+=value;
        const lines=buf.split(/\r?\n/);buf=lines.pop();
        for(const line of lines){
          const t=line.trim();if(!t)continue;
          setLastRaw(t.slice(0,90));
          let raw=t;
          if(raw.toUpperCase().startsWith("RAW:"))raw=raw.slice(4);
          const vals=raw.split(",").map(v=>parseInt(v.trim(),10));
          if(vals.length===18&&vals.every(v=>!isNaN(v)&&v>=0&&v<=65535)){
            if(!pausedRef.current){
              const dark=darkRef||new Array(18).fill(0);
              const white=whiteRef||new Array(18).fill(4095);
              const corr=vals.map((v,i)=>Math.max(0,Math.min(4095,Math.round((v-dark[i])/(white[i]-dark[i]+1)*4095))));
              histRef.current=histRef.current.map((a,i)=>{const n=[...a,corr[i]];return n.length>HLEN?n.slice(-HLEN):n;});
              setHist(histRef.current.map(a=>[...a]));
              adcRef.current=corr;setAdc([...corr]);
              localN++;setReadings(localN);
              setExpBuf(p=>{const r=[new Date().toISOString(),...corr];const n=[...p,r];return n.length>10000?n.slice(-10000):n;});
            }
          }else if(t.includes(","))setErrCount(e=>e+1);
        }
      }
    }catch(e){
      if(e.name!=="NotFoundError")addLog("Error: "+e.message,"err");
      else addLog("Port selection cancelled","warn");
      setConn(false);
    }
  }

  async function doDisc(){
    setConn(false);addLog("Disconnected","warn");
    try{if(readerRef.current){await readerRef.current.cancel();readerRef.current=null;}
        if(portRef.current){await portRef.current.close();portRef.current=null;}}catch{}
  }

  function togglePause(){pausedRef.current=!pausedRef.current;setPaused(pausedRef.current);addLog(pausedRef.current?"Paused":"Resumed","warn");}
  function capDark(){if(!connected||readings===0){addLog("No live data","err");return;}setDarkRef([...adcRef.current]);addLog("Dark ref captured","ok");}
  function capWhite(){if(!connected||readings===0){addLog("No live data","err");return;}setWhiteRef([...adcRef.current]);addLog("White ref captured","ok");}
  function doExport(){
    if(!expBuf.length){addLog("No data","warn");return;}
    const hdr=["timestamp",...CH.map(c=>c.nm+"nm")].join(",");
    const blob=new Blob([hdr+"\n"+expBuf.map(r=>r.join(",")).join("\n")],{type:"text/csv"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);
    a.download="soilspec_"+new Date().toISOString().slice(0,19).replace(/:/g,"-")+".csv";a.click();
    addLog("Exported "+expBuf.length+" rows","ok");
  }

  const p=soil(adc);
  const sc=!p?"#64748b":p.score>=70?"#4ade80":p.score>=45?"#facc15":"#f87171";

  const specChart={
    labels:CH.map(c=>c.nm+""),
    datasets:[{data:adc,backgroundColor:CH.map(c=>h2r(c.c,.75)),borderColor:CH.map(c=>c.c),borderWidth:1.5,borderRadius:4}]
  };
  const specOpts={responsive:true,maintainAspectRatio:false,animation:{duration:0},
    plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>` ${ctx.parsed.y} ADC — ${CH[ctx.dataIndex].r}`}}},
    scales:{x:{ticks:{color:"#64748b",font:{size:10}},grid:{color:"#0f172a"},border:{display:false}},
            y:{min:0,max:4095,ticks:{color:"#64748b",font:{size:10},maxTicksLimit:6},grid:{color:"#1e293b"},border:{display:false}}}};

  const trendChart={labels:hist[selCh].map((_,i)=>i),datasets:[{data:hist[selCh],borderColor:CH[selCh].c,backgroundColor:h2r(CH[selCh].c,.10),borderWidth:2,pointRadius:0,tension:.4,fill:true}]};
  const trendOpts={responsive:true,maintainAspectRatio:false,animation:{duration:0},
    plugins:{legend:{display:false},tooltip:{enabled:false}},
    scales:{x:{display:false},y:{min:0,max:4095,ticks:{color:"#64748b",font:{size:9},maxTicksLimit:5},grid:{color:"#1e293b"},border:{display:false}}}};

  const lc={ok:"text-emerald-400",warn:"text-amber-400",err:"text-red-400",info:"text-sky-400"};

  const METRICS=[
    {label:"Moisture",     val:p?.moisture, unit:"%",     color:"#38bdf8", max:100, icon:"💧",
     status:p?p.moisture<25?"Dry":p.moisture<65?"Optimal":"Wet":"—",
     sc:p?p.moisture<25?"#f87171":p.moisture<65?"#4ade80":"#facc15":"#64748b"},
    {label:"Org. Matter",  val:p?.om,       unit:"% SOM", color:"#4ade80", max:15,  icon:"🌿",
     status:p?parseFloat(p.om)<2?"Low":parseFloat(p.om)<5?"Moderate":"High":"—",
     sc:p?parseFloat(p.om)<2?"#f87171":parseFloat(p.om)<5?"#facc15":"#4ade80":"#64748b"},
    {label:"Conductivity", val:p?.ec,       unit:"mS/cm", color:"#22d3ee", max:6,   icon:"⚡",
     status:p?parseFloat(p.ec)<0.8?"Low":parseFloat(p.ec)<3?"Normal":"High":"—",
     sc:p?parseFloat(p.ec)<0.8?"#facc15":parseFloat(p.ec)<3?"#4ade80":"#f87171":"#64748b"},
    {label:"NIR Index",    val:p?.ndmi,     unit:"NDMI",  color:"#a78bfa", max:1,   icon:"🔬",
     status:p?parseFloat(p.ndmi)>0.1?"Positive":parseFloat(p.ndmi)<-0.2?"Negative":"Neutral":"—",
     sc:p?parseFloat(p.ndmi)>0.1?"#4ade80":parseFloat(p.ndmi)<-0.2?"#f87171":"#facc15":"#64748b"},
  ];

  return(
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col" style={{fontFamily:"'Inter',sans-serif"}}>

      {/* ── TOPBAR ── */}
      <header className="flex items-center gap-3 px-5 h-14 bg-slate-900 border-b border-slate-800 flex-shrink-0 z-10">
        <div className="flex items-center gap-2 mr-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-950 border border-emerald-500 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 fill-emerald-400" viewBox="0 0 24 24"><path d="M17 8C8 10 5.9 16.17 3.82 22H5.71l1-2.3A4.49 4.49 0 0 0 8 20c9 0 10-18 9-19S17 8 17 8z"/></svg>
          </div>
          <span className="text-base font-bold tracking-wide">Soil<span className="text-emerald-400">Spec</span></span>
          <span className="text-xs text-slate-600 hidden sm:inline">AS7265x · ATSAMD21G17D</span>
        </div>

        <nav className="flex gap-1">
          {[["dashboard","Dashboard"],["channels","18 Channels"],["log","Log"]].map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${tab===k?"bg-slate-800 text-white":"text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"}`}>
              {l}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2 ml-2">
          <span className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border font-semibold ${connected?"bg-emerald-950 border-emerald-700 text-emerald-400":"bg-slate-800 border-slate-700 text-slate-500"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected?"bg-emerald-400 animate-pulse":"bg-slate-600"}`}/>
            {connected?"LIVE":"OFFLINE"}
          </span>
          {paused&&<span className="text-xs px-2 py-1 rounded-full bg-amber-950 border border-amber-700 text-amber-400 font-semibold">PAUSED</span>}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-600 hidden md:inline">{readings} reads · {errCount} err</span>
          <button onClick={connect} className={`px-4 py-1.5 rounded-lg text-sm font-bold border transition-all ${connected?"bg-red-950 border-red-700 text-red-400 hover:bg-red-900":"bg-emerald-950 border-emerald-700 text-emerald-400 hover:bg-emerald-900"}`}>
            {connected?"Disconnect":"Connect"}
          </button>
          {connected&&<button onClick={togglePause} className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-all ${paused?"bg-amber-950 border-amber-600 text-amber-400":"bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"}`}>{paused?"Resume":"Pause"}</button>}
          <button onClick={doExport} className="px-3 py-1.5 rounded-lg text-sm font-bold border border-sky-800 bg-sky-950 text-sky-400 hover:bg-sky-900 transition-all">Export</button>
        </div>
      </header>

      {/* raw strip */}
      <div className="flex items-center gap-3 px-5 h-6 bg-[#070b12] border-b border-slate-900 text-xs flex-shrink-0">
        <span className="text-slate-700 font-mono flex-shrink-0">RAW ›</span>
        <span className="font-mono text-cyan-600 truncate flex-1">{lastRaw}</span>
        <span className="text-slate-700 flex-shrink-0">Errors <span className="text-amber-600">{errCount}</span></span>
      </div>

      {/* ── MAIN ── */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* DASHBOARD */}
        {tab==="dashboard"&&<>

          {/* Row 1 — 4 metric cards + health */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {METRICS.map(({label,val,unit,color,max,icon,status,sc:stc})=>(
              <div key={label} className="bg-slate-900 rounded-2xl p-4 border border-slate-800 hover:border-slate-700 transition-all">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-slate-400 text-sm font-medium leading-tight">{label}</span>
                  <span className="text-2xl">{icon}</span>
                </div>
                <div className="text-4xl font-bold leading-none mb-1" style={{color}}>
                  {val!=null?val:<span className="text-slate-700 text-3xl">—</span>}
                </div>
                <div className="text-slate-600 text-xs mb-3">{unit}</div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden mb-2">
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{width:val!=null?Math.min(100,Math.abs(parseFloat(val))/max*100)+"%":"0%",background:`linear-gradient(90deg,${color}55,${color})`}}/>
                </div>
                <span className="text-xs font-bold" style={{color:stc}}>{status}</span>
              </div>
            ))}

            {/* Health Score */}
            <div className="bg-slate-900 rounded-2xl p-4 border border-slate-800 flex flex-col items-center justify-center gap-2 md:col-span-1">
              <span className="text-slate-400 text-sm font-medium">Health Score</span>
              <Ring value={p?.score} max={100} color={sc} size={80}/>
              <span className="text-sm font-bold" style={{color:sc}}>
                {!p?"Waiting":p.score>=70?"Good":p.score>=45?"Moderate":"Poor"}
              </span>
            </div>
          </div>

          {/* Row 2 — spectrum + NPK */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2 bg-slate-900 rounded-2xl p-4 border border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-slate-200 font-semibold">Full Spectrum</span>
                  <span className="text-slate-500 text-sm ml-2">18 channels · 410–940 nm</span>
                </div>
                <span className="text-slate-500 text-sm">avg <span className="text-slate-300 font-mono font-bold">{p?.avg??0}</span> ADC</span>
              </div>
              <div style={{height:190}}><Bar data={specChart} options={specOpts}/></div>
              <div className="flex gap-5 mt-3 justify-center">
                {[{l:"Visible (VIS)",c:"#f87171"},{l:"Red-Edge",c:"#f43f5e"},{l:"Near-Infrared (NIR)",c:"#a78bfa"}].map(({l,c})=>(
                  <div key={l} className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span className="w-3 h-2 rounded" style={{background:c}}/>{l}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-900 rounded-2xl p-4 border border-slate-800 flex flex-col gap-4">
              <span className="text-slate-200 font-semibold">NPK Estimate</span>
              <NPKBar el="N" val={p?.N} max={350} color="#4ade80"/>
              <NPKBar el="P" val={p?.P} max={160} color="#fb923c"/>
              <NPKBar el="K" val={p?.K} max={280} color="#c084fc"/>
              <div className="mt-auto text-xs text-slate-600 leading-5 border-t border-slate-800 pt-3">
                Spectral proxy model — lab verification required before field application.
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={capDark} className={`py-2 rounded-lg text-xs font-bold border transition-all ${darkRef?"border-emerald-600 bg-emerald-950 text-emerald-400":"border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300"}`}>{darkRef?"✓ Dark set":"Dark ref"}</button>
                <button onClick={capWhite} className={`py-2 rounded-lg text-xs font-bold border transition-all ${whiteRef?"border-emerald-600 bg-emerald-950 text-emerald-400":"border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300"}`}>{whiteRef?"✓ White set":"White ref"}</button>
              </div>
            </div>
          </div>

          {/* Row 3 — trend + NIR highlight */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-slate-900 rounded-2xl p-4 border border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-slate-200 font-semibold">Channel Trend</span>
                  <span className="inline-block ml-2 text-xs px-2 py-0.5 rounded-full font-bold" style={{background:h2r(CH[selCh].c,.15),color:CH[selCh].c}}>{CH[selCh].nm} nm · {CH[selCh].r}</span>
                </div>
                <span className="text-2xl font-bold font-mono" style={{color:CH[selCh].c}}>{adc[selCh]}</span>
              </div>
              <div style={{height:100}}><Line data={trendChart} options={trendOpts}/></div>
              <div className="flex flex-wrap gap-1 mt-3">
                {CH.map((ch,i)=>(
                  <button key={i} onClick={()=>setSelCh(i)}
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded transition-all"
                    style={selCh===i?{background:h2r(ch.c,.25),color:ch.c}:{color:"#475569"}}>
                    {ch.nm}
                  </button>
                ))}
              </div>
            </div>

            <div className="md:col-span-2 bg-slate-900 rounded-2xl p-4 border border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <span className="text-slate-200 font-semibold">Key NIR Channels</span>
                <span className="text-xs text-slate-500">730–940 nm · moisture sensitive</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[12,13,14,15,16,17].map(i=>{
                  const ch=CH[i],v=adc[i],pct=Math.round(v/4095*100);
                  return(
                    <div key={i} className="bg-slate-950 rounded-xl p-3 border border-slate-800 hover:border-slate-700 transition-all cursor-pointer"
                      onClick={()=>setSelCh(i)}>
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-bold text-sm" style={{color:ch.c}}>{ch.nm}<span className="text-[10px] font-normal text-slate-600"> nm</span></span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{background:h2r(ch.c,.15),color:ch.c}}>NIR</span>
                      </div>
                      <Spark history={hist[i]} color={ch.c} height={40}/>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{width:pct+"%",background:ch.c}}/>
                        </div>
                        <span className="text-xs font-mono font-bold" style={{color:ch.c}}>{v}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>}

        {/* 18 CHANNELS TAB */}
        {tab==="channels"&&<>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-200">All 18 Spectral Channels</h2>
            <span className="text-sm text-slate-500">Each card shows last {HLEN} readings · click to focus</span>
          </div>

          {[
            {label:"Visible Band",sub:"410–680 nm · 11 channels",indices:[0,1,2,3,4,5,6,7,8,9,10],cols:"grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-11"},
            {label:"Red-Edge",sub:"705 nm · vegetation stress indicator",indices:[11],cols:"grid-cols-2 sm:grid-cols-3"},
            {label:"Near-Infrared Band",sub:"730–940 nm · 6 channels · moisture-sensitive",indices:[12,13,14,15,16,17],cols:"grid-cols-3 sm:grid-cols-4 lg:grid-cols-6"},
          ].map(({label,sub,indices,cols})=>(
            <div key={label}>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-sm font-bold text-slate-300">{label}</span>
                <span className="text-xs text-slate-600">{sub}</span>
                <div className="flex-1 h-px bg-slate-800"/>
              </div>
              <div className={`grid ${cols} gap-2`} style={indices.length===1?{maxWidth:200}:{}}>
                {indices.map(i=>(
                  <ChCard key={i} ch={CH[i]} idx={i} val={adc[i]} hist={hist[i]}
                    selected={selCh===i} onClick={()=>{setSelCh(i);setTab("dashboard");}}/>
                ))}
              </div>
            </div>
          ))}

          {/* Summary table */}
          <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
              <span className="font-semibold text-slate-300">Channel Summary Table</span>
              <span className="text-xs text-slate-600">click row to select channel</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-600 text-xs">
                    <th className="text-left px-5 py-2.5">Channel</th>
                    <th className="text-left px-3 py-2.5">Region</th>
                    <th className="text-right px-3 py-2.5">ADC</th>
                    <th className="px-4 py-2.5 w-44">Level</th>
                    <th className="text-right px-5 py-2.5">% Full Scale</th>
                  </tr>
                </thead>
                <tbody>
                  {CH.map((ch,i)=>{
                    const v=adc[i],pct=Math.round(v/4095*100);
                    return(
                      <tr key={i} className={`border-b border-slate-800/40 hover:bg-slate-800/50 cursor-pointer transition-all ${selCh===i?"bg-slate-800/70":""}`}
                        onClick={()=>{setSelCh(i);setTab("dashboard");}}>
                        <td className="px-5 py-2.5"><span className="font-bold" style={{color:ch.c}}>{ch.nm} nm</span></td>
                        <td className="px-3 py-2.5 text-slate-500 text-xs">{ch.r}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-200">{v}</td>
                        <td className="px-4 py-2.5">
                          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{width:pct+"%",background:ch.c}}/>
                          </div>
                        </td>
                        <td className="px-5 py-2.5 text-right text-xs font-mono font-bold" style={{color:ch.c}}>{pct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>}

        {/* LOG TAB */}
        {tab==="log"&&(
          <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
              <span className="font-semibold text-slate-300">Event Log</span>
              <button onClick={()=>setLog([])} className="text-xs text-slate-500 hover:text-red-400 transition-all">Clear</button>
            </div>
            <div className="font-mono text-xs p-4 space-y-0.5 max-h-[72vh] overflow-y-auto">
              {log.length===0&&<div className="text-slate-700 py-4 text-center">No events yet — connect to begin.</div>}
              {log.map((e,i)=>(
                <div key={i} className="flex gap-4 py-0.5 hover:bg-slate-800/40 px-2 rounded">
                  <span className="text-slate-700 flex-shrink-0 w-20">{e.ts}</span>
                  <span className={lc[e.type]}>{e.msg}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* STATUS BAR */}
      <footer className="h-7 bg-slate-900 border-t border-slate-800 flex items-center px-5 gap-5 text-xs text-slate-600 flex-shrink-0">
        <span>Port <b className={connected?"text-emerald-400":"text-slate-700"}>{connected?"open":"closed"}</b></span>
        <span>Baud <b className="text-slate-500">115200</b></span>
        <span>Reads <b className="text-slate-500">{readings}</b></span>
        <span>Dark <b className={darkRef?"text-emerald-400":"text-slate-700"}>{darkRef?"✓":"unset"}</b></span>
        <span>White <b className={whiteRef?"text-emerald-400":"text-slate-700"}>{whiteRef?"✓":"unset"}</b></span>
        <span className="ml-auto text-slate-700">SoilSpec v2.0 · AS7265x · ATSAMD21G17D · 18-ch · 410–940 nm</span>
      </footer>
    </div>
  );
}
