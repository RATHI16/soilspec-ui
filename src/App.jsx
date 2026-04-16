import { useState, useRef, useCallback } from "react";
import {
  Chart, LineElement, BarElement, CategoryScale,
  LinearScale, PointElement, Filler, Tooltip,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";
Chart.register(LineElement, BarElement, CategoryScale, LinearScale, PointElement, Filler, Tooltip);

// ── 18 channels ─────────────────────────────────────────────────────────────
const CH = [
  { nm:410, r:"VIS",    col:"#c084fc", role:"Pigment / UV edge"          },
  { nm:435, r:"VIS",    col:"#a78bfa", role:"Plant pigments"              },
  { nm:460, r:"VIS",    col:"#60a5fa", role:"Chlorophyll baseline"        },
  { nm:485, r:"VIS",    col:"#22d3ee", role:"Water colour indicator"      },
  { nm:510, r:"VIS",    col:"#34d399", role:"Vegetation reflectance"      },
  { nm:535, r:"VIS",    col:"#4ade80", role:"Plant stress trends"         },
  { nm:560, r:"VIS",    col:"#a3e635", role:"Soil colour / OM proxy"      },
  { nm:585, r:"VIS",    col:"#facc15", role:"Mineral composition"         },
  { nm:610, r:"VIS",    col:"#fb923c", role:"Soil organic trends"         },
  { nm:645, r:"VIS",    col:"#f87171", role:"Chlorophyll absorption"      },
  { nm:680, r:"VIS",    col:"#ef4444", role:"Iron oxide / chlorophyll"    },
  { nm:705, r:"R-Edge", col:"#f43f5e", role:"Vegetation stress index"     },
  { nm:730, r:"NIR",    col:"#e879f9", role:"Biomass / dry matter"        },
  { nm:760, r:"NIR",    col:"#c084fc", role:"Moisture onset"              },
  { nm:810, r:"NIR",    col:"#818cf8", role:"Soil reflectance / moisture" },
  { nm:860, r:"NIR",    col:"#6366f1", role:"Water absorption — primary"  },
  { nm:900, r:"NIR",    col:"#3b82f6", role:"Moisture / organic bonds"    },
  { nm:940, r:"NIR",    col:"#0ea5e9", role:"Strong water absorption"     },
];
const HLEN = 60;
const rgba = (h,a) => {
  const r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
};

// ── soil engine ──────────────────────────────────────────────────────────────
function calcSoil(v) {
  if (!v || v.every(x=>x===0)) return null;
  const nir = (v[12]+v[13]+v[14]+v[15]+v[16]+v[17])/6;
  const vis = (v[0]+v[1]+v[2]+v[3]+v[4]+v[5]+v[6]+v[7]+v[8]+v[9]+v[10]+v[11])/12;
  const moisture  = Math.max(0,Math.min(100,Math.round((1-nir/4095)*90)));
  const om        = Math.max(0.5,Math.min(15,((4095-vis)/4095*10)+1.2));
  const ec        = Math.max(0.1,Math.min(6,((v[15]-v[17])/(v[15]+v[17]+1))*3+1.8));
  const ndmi      = (nir-vis)/(nir+vis+1);
  const redEdge   = v[11]/4095; // 705 nm — vegetation stress
  const nirRatio  = nir/vis;
  const N = Math.round(Math.max(20,Math.min(350,200-(moisture*0.7)+(om*14))));
  const P = Math.round(Math.max(10,Math.min(160,(v[8]/4095)*100+30)));
  const K = Math.round(Math.max(30,Math.min(280,(v[10]/4095)*110+80)));
  const score = Math.round(Math.min(98,Math.max(8,
    (om/10)*35+(1-Math.abs(moisture-42)/42)*30+(N/350)*20+(K/280)*15
  )));
  // soil type classification
  let soilType="Unknown", soilConf=0;
  if      (nirRatio>2.5&&om>4)   { soilType="Loamy / Rich";   soilConf=82; }
  else if (nirRatio>1.8&&om>2)   { soilType="Silty Loam";     soilConf=74; }
  else if (nirRatio<1.2&&om<2)   { soilType="Sandy / Light";  soilConf=78; }
  else if (ndmi<-0.2)            { soilType="Clay / Compact";  soilConf=70; }
  else                           { soilType="Mixed Mineral";   soilConf=60; }
  // ploughing readiness
  const ploughReady = moisture>=20&&moisture<=60&&om>=1.5&&ec<=3;
  // compaction index (low NIR + low moisture)
  const compaction = Math.round(Math.max(0,Math.min(100,(1-nirRatio/3)*60+(1-moisture/80)*40)));
  // salinity risk
  const salinityRisk = ec>3?"HIGH":ec>1.5?"MEDIUM":"LOW";
  const salinityCol  = ec>3?"#ef4444":ec>1.5?"#f59e0b":"#22c55e";
  // recommendations
  const recs = [];
  if (moisture<20)       recs.push({ type:"warn", icon:"💧", text:"Moisture critically low — irrigate before ploughing" });
  if (moisture>70)       recs.push({ type:"warn", icon:"💧", text:"Soil too wet — wait for drainage before tillage" });
  if (moisture>=20&&moisture<=60) recs.push({ type:"ok",   icon:"✓",  text:"Moisture optimal for tillage operations" });
  if (N<80)              recs.push({ type:"warn", icon:"🌿", text:"Nitrogen deficient — apply 40–60 kg/ha urea" });
  if (P<30)              recs.push({ type:"warn", icon:"🌿", text:"Phosphorus low — consider DAP application" });
  if (K<80)              recs.push({ type:"warn", icon:"🌿", text:"Potassium low — apply MOP or SOP" });
  if (om<1.5)            recs.push({ type:"warn", icon:"🪱", text:"Organic matter very low — add compost or manure" });
  if (ec>3)              recs.push({ type:"alert","icon":"⚠", text:"High salinity — leach field before sowing" });
  if (compaction>60)     recs.push({ type:"warn", icon:"⛏", text:"Soil compaction detected — deep tillage recommended" });
  if (score>=70)         recs.push({ type:"ok",   icon:"✓",  text:"Soil condition good — proceed with ploughing" });
  return {
    moisture, om:om.toFixed(1), ec:ec.toFixed(2), ndmi:ndmi.toFixed(3),
    N, P, K, score, soilType, soilConf, ploughReady,
    compaction, salinityRisk, salinityCol, recs,
    nirAvg:Math.round(nir), visAvg:Math.round(vis),
    redEdge:Math.round(redEdge*100),
  };
}

// ── sparkline ────────────────────────────────────────────────────────────────
function Spark({data,color}) {
  const cfg={
    labels:data.map((_,i)=>i),
    datasets:[{data,borderColor:color,backgroundColor:rgba(color,.10),borderWidth:1.5,pointRadius:0,tension:.4,fill:true}],
  };
  const opts={
    responsive:true,maintainAspectRatio:false,animation:{duration:0},
    plugins:{legend:{display:false},tooltip:{enabled:false}},
    scales:{x:{display:false},y:{display:false,min:0,max:4095}},
  };
  return <div style={{height:52,width:"100%"}}><Line data={cfg} options={opts}/></div>;
}

// ── score arc ─────────────────────────────────────────────────────────────────
function ScoreArc({score,size=96}) {
  const r=38,cx=48,cy=48,circ=2*Math.PI*r;
  const pct=score!=null?Math.min(1,score/100):0;
  const off=circ*(1-pct);
  const col=score==null?"#1e3a5f":score>=70?"#22c55e":score>=45?"#f59e0b":"#ef4444";
  return (
    <svg width={size} height={size} viewBox="0 0 96 96">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e2d45" strokeWidth={9}/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={col} strokeWidth={9}
        strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} style={{transition:"stroke-dashoffset .6s"}}/>
      <text x={cx} y={cy-5} textAnchor="middle" fontSize={20} fontWeight={700}
        fill={col} fontFamily="monospace">{score??<tspan fill="#1e3a5f">—</tspan>}</text>
      <text x={cx} y={cy+12} textAnchor="middle" fontSize={9} fill="#3d5c7a" fontFamily="monospace">/100</text>
    </svg>
  );
}

// ── gauge bar ─────────────────────────────────────────────────────────────────
function GaugeBar({value,max,color,label,unit,status,statusColor,markers}) {
  const pct=value!=null?Math.min(100,Math.abs(parseFloat(value))/max*100):0;
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
        <span style={{fontSize:11,color:"#4a6080"}}>{label}</span>
        <span style={{fontSize:11,fontWeight:700,color:statusColor||color}}>{status}</span>
      </div>
      <div style={{height:8,background:"#1a2a40",borderRadius:4,overflow:"hidden",position:"relative"}}>
        {markers&&markers.map((m,i)=>(
          <div key={i} style={{position:"absolute",top:0,bottom:0,left:m+"%",width:1,background:"#3d5c7a",zIndex:1}}/>
        ))}
        <div style={{height:"100%",borderRadius:4,background:color,width:pct+"%",transition:"width .5s"}}/>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:3}}>
        <span style={{fontSize:11,fontWeight:700,color,fontFamily:"monospace"}}>{value!=null?value:"—"} {unit}</span>
        <span style={{fontSize:10,color:"#2d4060"}}>{max} {unit} max</span>
      </div>
    </div>
  );
}

// ── main ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [adc,     setAdc]    = useState(new Array(18).fill(0));
  const [hist,    setHist]   = useState(()=>Array.from({length:18},()=>Array(HLEN).fill(0)));
  const [conn,    setConn]   = useState(false);
  const [paused,  setPaused] = useState(false);
  const [reads,   setReads]  = useState(0);
  const [errors,  setErrors] = useState(0);
  const [rawLine, setRaw]    = useState("— waiting for device");
  const [darkRef, setDark]   = useState(null);
  const [whiteRef,setWhite]  = useState(null);
  const [selCh,   setSelCh]  = useState(15);
  const [tab,     setTab]    = useState("dashboard");
  const [logs,    setLogs]   = useState([]);
  const [csvBuf,  setCsv]    = useState([]);
  const [history18,setH18]   = useState([]);  // ring buffer of soil snapshots

  const histRef  = useRef(Array.from({length:18},()=>Array(HLEN).fill(0)));
  const adcRef   = useRef(new Array(18).fill(0));
  const portRef  = useRef(null);
  const rdrRef   = useRef(null);
  const pauseRef = useRef(false);
  const snapRef  = useRef([]);

  const log = useCallback((msg,t="info")=>{
    const ts=new Date().toLocaleTimeString("en-GB");
    setLogs(p=>{const n=[...p,{ts,msg,t}];return n.length>200?n.slice(-200):n;});
  },[]);

  async function connect() {
    if(conn){await disconnect();return;}
    try{
      portRef.current=await navigator.serial.requestPort({filters:[{usbVendorId:0x03EB}]});
      await portRef.current.open({baudRate:115200,dataBits:8,stopBits:1,parity:"none"});
      setConn(true);
      log("Port opened — 115200 8N1","ok");
      log("Expecting: RAW:v1,v2,...,v18","info");
      const dec=new TextDecoderStream();
      portRef.current.readable.pipeTo(dec.writable);
      rdrRef.current=dec.readable.getReader();
      let buf="",n=0;
      while(true){
        const{value,done}=await rdrRef.current.read();
        if(done)break;
        buf+=value;
        const lines=buf.split(/\r?\n/);buf=lines.pop();
        for(const raw of lines){
          const line=raw.trim();if(!line)continue;
          setRaw(line.slice(0,90));
          let s=line;
          if(s.toUpperCase().startsWith("RAW:"))s=s.slice(4);
          const vals=s.split(",").map(v=>parseInt(v.trim(),10));
          if(vals.length===18&&vals.every(v=>!isNaN(v)&&v>=0&&v<=65535)){
            if(!pauseRef.current){
              const dark=darkRef||new Array(18).fill(0);
              const white=whiteRef||new Array(18).fill(4095);
              const corr=vals.map((v,i)=>Math.max(0,Math.min(4095,Math.round((v-dark[i])/(white[i]-dark[i]+1)*4095))));
              histRef.current=histRef.current.map((a,i)=>{const nx=[...a,corr[i]];return nx.length>HLEN?nx.slice(-HLEN):nx;});
              setHist(histRef.current.map(a=>[...a]));
              adcRef.current=corr;setAdc([...corr]);
              n++;setReads(n);
              // snapshot every 10 reads for trend
              if(n%10===0){
                const snap={t:new Date().toLocaleTimeString("en-GB"),s:calcSoil(corr)};
                snapRef.current=[...snapRef.current.slice(-29),snap];
                setH18([...snapRef.current]);
              }
              setCsv(p=>{const r=[new Date().toISOString(),...corr];const nx=[...p,r];return nx.length>10000?nx.slice(-10000):nx;});
            }
          }else if(line.includes(","))setErrors(e=>e+1);
        }
      }
    }catch(e){
      if(e.name!=="NotFoundError")log("Error: "+e.message,"err");
      else log("Cancelled","warn");
      setConn(false);
    }
  }
  async function disconnect(){
    setConn(false);log("Disconnected","warn");
    try{if(rdrRef.current){await rdrRef.current.cancel();rdrRef.current=null;}
        if(portRef.current){await portRef.current.close();portRef.current=null;}}catch{}
  }
  function togglePause(){pauseRef.current=!pauseRef.current;setPaused(pauseRef.current);log(pauseRef.current?"Paused":"Resumed","warn");}
  function capDark(){if(!conn||reads===0){log("No data","err");return;}setDark([...adcRef.current]);log("Dark ref captured","ok");}
  function capWhite(){if(!conn||reads===0){log("No data","err");return;}setWhite([...adcRef.current]);log("White ref captured","ok");}
  function doExport(){
    if(!csvBuf.length){log("No data","warn");return;}
    const hdr=["timestamp",...CH.map(c=>c.nm+"nm")].join(",");
    const blob=new Blob([hdr+"\n"+csvBuf.map(r=>r.join(",")).join("\n")],{type:"text/csv"});
    const a=Object.assign(document.createElement("a"),{href:URL.createObjectURL(blob),download:"soilspec_"+new Date().toISOString().slice(0,19).replace(/:/g,"-")+".csv"});
    a.click();log("Exported "+csvBuf.length+" rows","ok");
  }

  const soil=calcSoil(adc);
  const scoreCol=!soil?"#1e3a5f":soil.score>=70?"#22c55e":soil.score>=45?"#f59e0b":"#ef4444";

  // full spectrum bar
  const specBar={
    labels:CH.map(c=>c.nm+""),
    datasets:[{data:adc,backgroundColor:CH.map(c=>rgba(c.col,.78)),borderColor:CH.map(c=>c.col),borderWidth:1.5,borderRadius:3}],
  };
  const specOpts={
    responsive:true,maintainAspectRatio:false,animation:{duration:0},
    plugins:{legend:{display:false},tooltip:{callbacks:{title:ctx=>CH[ctx[0].dataIndex].nm+" nm — "+CH[ctx[0].dataIndex].r,label:ctx=>"  ADC: "+ctx.parsed.y}}},
    scales:{x:{ticks:{color:"#3d5c7a",font:{size:10,family:"monospace"}},grid:{color:"#0d1625"},border:{display:false}},y:{min:0,max:4095,ticks:{color:"#3d5c7a",font:{size:10},maxTicksLimit:5},grid:{color:"#111e33"},border:{display:false}}},
  };

  // selected channel trend
  const trendLine={
    labels:hist[selCh].map((_,i)=>i),
    datasets:[{data:hist[selCh],borderColor:CH[selCh].col,backgroundColor:rgba(CH[selCh].col,.10),borderWidth:2,pointRadius:0,tension:.4,fill:true}],
  };
  const trendOpts={
    responsive:true,maintainAspectRatio:false,animation:{duration:0},
    plugins:{legend:{display:false},tooltip:{enabled:false}},
    scales:{x:{display:false},y:{min:0,max:4095,ticks:{color:"#3d5c7a",font:{size:10},maxTicksLimit:4},grid:{color:"#111e33"},border:{display:false}}},
  };

  // moisture history trend
  const moistTrend={
    labels:history18.map(s=>s.t),
    datasets:[{data:history18.map(s=>s.s?.moisture??null),borderColor:"#38bdf8",backgroundColor:rgba("#38bdf8",.08),borderWidth:2,pointRadius:2,pointBackgroundColor:"#38bdf8",tension:.4,fill:true,spanGaps:true}],
  };
  const trendLineOpts={
    responsive:true,maintainAspectRatio:false,animation:{duration:0},
    plugins:{legend:{display:false}},
    scales:{x:{ticks:{color:"#3d5c7a",font:{size:9},maxTicksLimit:6},grid:{color:"#111e33"},border:{display:false}},y:{min:0,max:100,ticks:{color:"#3d5c7a",font:{size:10},maxTicksLimit:5},grid:{color:"#111e33"},border:{display:false}}},
  };

  const logColors={ok:"#22c55e",warn:"#f59e0b",err:"#ef4444",info:"#3b82f6",alert:"#ef4444"};

  const C = {
    page:{display:"flex",flexDirection:"column",height:"100vh",background:"#090e1a",color:"#d4e2f4",fontFamily:"'Inter','Segoe UI',system-ui,sans-serif",fontSize:13},
    top:{display:"flex",alignItems:"center",gap:10,padding:"0 16px",height:50,background:"#0d1526",borderBottom:"1px solid #172136",flexShrink:0},
    logo:{fontSize:16,fontWeight:800,letterSpacing:.5,color:"#d4e2f4"},
    logoG:{color:"#22c55e"},
    tabBar:{display:"flex",gap:2,marginLeft:10},
    tab:(on)=>({padding:"5px 14px",borderRadius:"6px 6px 0 0",border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:on?"#0f1e35":"transparent",color:on?"#d4e2f4":"#3d5c7a",borderBottom:on?"2px solid #22c55e":"2px solid transparent"}),
    chip:(on)=>({display:"flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:20,background:on?"#052e16":"#0d1526",border:`1px solid ${on?"#16a34a":"#172136"}`,color:on?"#22c55e":"#3d5c7a",fontSize:11,fontWeight:700}),
    dot:(on)=>({width:7,height:7,borderRadius:"50%",background:on?"#22c55e":"#1e3a5f",animation:on?"blink 1.4s infinite":"none"}),
    btnConn:(on)=>({padding:"4px 14px",borderRadius:8,border:`1px solid ${on?"#dc2626":"#16a34a"}`,background:on?"#1a0505":"#052e16",color:on?"#ef4444":"#22c55e",cursor:"pointer",fontSize:12,fontWeight:700}),
    btnPause:(on)=>({padding:"4px 12px",borderRadius:8,border:`1px solid ${on?"#d97706":"#172136"}`,background:on?"#1c0f00":"transparent",color:on?"#f59e0b":"#3d5c7a",cursor:"pointer",fontSize:12,fontWeight:600}),
    btnExp:{padding:"4px 12px",borderRadius:8,border:"1px solid #1a3a5a",background:"transparent",color:"#3b82f6",cursor:"pointer",fontSize:12,fontWeight:600},
    topR:{marginLeft:"auto",display:"flex",gap:8,alignItems:"center"},
    rawStrip:{height:20,background:"#070b14",borderBottom:"1px solid #0f1a2d",display:"flex",alignItems:"center",padding:"0 16px",gap:8,fontSize:10,fontFamily:"monospace",flexShrink:0},
    body:{display:"flex",flex:1,overflow:"hidden"},

    // sidebar
    side:{width:288,flexShrink:0,background:"#0d1526",borderRight:"1px solid #172136",display:"flex",flexDirection:"column",overflowY:"auto",overflowX:"hidden"},
    sideSection:{padding:"12px 14px",borderBottom:"1px solid #111e33",flexShrink:0},
    secTitle:{fontSize:10,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",color:"#2d4060",marginBottom:10},

    // metric card
    metGrid:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8},
    metCard:(col)=>({background:"#0a1020",border:"1px solid #172136",borderRadius:10,padding:"10px 12px",borderTop:`2px solid ${col}`}),
    metLabel:{fontSize:10,color:"#3d5c7a",marginBottom:3,fontWeight:500},
    metVal:(col)=>({fontSize:26,fontWeight:800,color:col,lineHeight:1,fontFamily:"monospace"}),
    metUnit:{fontSize:10,color:"#1e3a5f",marginTop:2},
    metBar:{height:3,background:"#172136",borderRadius:2,marginTop:7,overflow:"hidden"},
    metFill:(col,p)=>({height:"100%",borderRadius:2,background:col,width:p+"%",transition:"width .5s"}),
    metStatus:(col)=>({fontSize:10,fontWeight:700,color:col,marginTop:4}),

    // score row
    scoreRow:{display:"flex",alignItems:"center",gap:14,padding:"12px 14px",borderBottom:"1px solid #111e33",flexShrink:0},

    // plough status
    ploughBox:(ready)=>({
      margin:"0 14px 12px",padding:"10px 12px",borderRadius:10,
      background:ready?"#052e16":"#1a0505",
      border:`1px solid ${ready?"#16a34a":"#7f1d1d"}`,
      display:"flex",alignItems:"center",gap:10,flexShrink:0,
    }),
    ploughIcon:(ready)=>({fontSize:22,lineHeight:1}),
    ploughText:{},
    ploughTitle:(ready)=>({fontSize:12,fontWeight:700,color:ready?"#22c55e":"#ef4444",marginBottom:2}),
    ploughSub:{fontSize:10,color:"#4a6080"},

    // npk row
    npkRow:{display:"flex",alignItems:"center",gap:8,marginBottom:8},
    npkEl:(col)=>({fontSize:14,fontWeight:800,color:col,width:16,textAlign:"center",flexShrink:0}),
    npkTrack:{flex:1,height:8,background:"#172136",borderRadius:4,overflow:"hidden"},
    npkFill:(col,p)=>({height:"100%",borderRadius:4,background:col,width:p+"%",transition:"width .5s"}),
    npkPpm:(col)=>({fontSize:11,fontWeight:700,color:col,fontFamily:"monospace",width:56,textAlign:"right"}),
    npkLvl:(col)=>({fontSize:9,fontWeight:700,color:col,width:24,textAlign:"right"}),

    // recs
    recItem:(t)=>({display:"flex",alignItems:"flex-start",gap:8,padding:"6px 8px",borderRadius:8,marginBottom:5,background:t==="ok"?"#052e16":t==="alert"?"#1a0505":"#1c1000",border:`1px solid ${t==="ok"?"#14532d":t==="alert"?"#7f1d1d":"#3d2000"}`}),
    recText:{fontSize:11,color:"#94a3b8",lineHeight:1.5},

    // cal
    calRow:{display:"flex",gap:6},
    calBtn:(set)=>({flex:1,padding:"6px",borderRadius:8,cursor:"pointer",fontSize:11,fontWeight:600,border:`1px solid ${set?"#16a34a":"#172136"}`,background:set?"#052e16":"transparent",color:set?"#22c55e":"#3d5c7a"}),

    // log
    logArea:{flex:1,overflowY:"auto",padding:"6px 12px 12px"},
    logLine:{display:"flex",gap:8,fontSize:10,fontFamily:"monospace",padding:"1px 0"},
    logTs:{color:"#172136",flexShrink:0},

    // main
    main:{flex:1,overflowY:"auto",padding:14,background:"#090e1a",display:"flex",flexDirection:"column",gap:14},
    card:{background:"#0d1526",border:"1px solid #172136",borderRadius:12,padding:16},
    cardHead:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12},
    cardTitle:{fontSize:13,fontWeight:700,color:"#d4e2f4"},
    cardSub:{fontSize:11,color:"#2d4060"},

    // channel grid — 6 columns
    chGrid:{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:8},
    chCard:(sel,col)=>({background:"#0a1020",borderRadius:10,padding:"10px",border:sel?`2px solid ${col}`:"1px solid #172136",cursor:"pointer",transition:"border-color .12s"}),
    chHead:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5},
    chNm:(col)=>({fontSize:14,fontWeight:800,color:col}),
    chNmSub:{fontSize:10,fontWeight:400,color:"#2d4060"},
    chBadge:(col)=>({fontSize:9,fontWeight:700,padding:"2px 5px",borderRadius:4,background:rgba(col,.15),color:col}),
    chRole:{fontSize:9,color:"#2d4060",marginBottom:4,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"},
    chAdc:(col)=>({fontSize:12,fontWeight:700,color:col,fontFamily:"monospace",textAlign:"right",marginTop:4}),
    chBarW:{height:3,background:"#172136",borderRadius:2,marginTop:4,overflow:"hidden"},
    chBarF:(col,p)=>({height:"100%",borderRadius:2,background:col,width:p+"%",transition:"width .3s"}),

    // band heading
    bandHead:{display:"flex",alignItems:"center",gap:10,marginBottom:8,marginTop:4},
    bandTitle:{fontSize:11,fontWeight:700,color:"#4a6080",flexShrink:0},
    bandSub:{fontSize:10,color:"#1e3a5f",flexShrink:0},
    bandLine:{flex:1,height:1,background:"#172136"},

    // analysis grid
    analysisGrid:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14},
    metricBox:{background:"#0a1020",border:"1px solid #172136",borderRadius:10,padding:"12px 14px"},
    mbTitle:{fontSize:11,color:"#3d5c7a",marginBottom:6,fontWeight:600,textTransform:"uppercase",letterSpacing:.8},
    bigNum:(col)=>({fontSize:32,fontWeight:800,color:col,lineHeight:1,fontFamily:"monospace"}),
    bigUnit:{fontSize:11,color:"#2d4060"},
  };

  const METRICS=[
    {label:"Moisture",val:soil?.moisture,unit:"% VWC",col:"#38bdf8",max:100,
     status:soil?soil.moisture<25?"Dry":soil.moisture<65?"Optimal":"Wet":"—",
     sc:soil?soil.moisture<25?"#ef4444":soil.moisture<65?"#22c55e":"#f59e0b":"#2d4060"},
    {label:"Org. Matter",val:soil?.om,unit:"% SOM",col:"#4ade80",max:15,
     status:soil?parseFloat(soil.om)<2?"Low":parseFloat(soil.om)<5?"Moderate":"High":"—",
     sc:soil?parseFloat(soil.om)<2?"#ef4444":parseFloat(soil.om)<5?"#f59e0b":"#22c55e":"#2d4060"},
    {label:"Conductivity",val:soil?.ec,unit:"mS/cm",col:"#22d3ee",max:6,
     status:soil?parseFloat(soil.ec)<0.8?"Low":parseFloat(soil.ec)<3?"Normal":"High":"—",
     sc:soil?parseFloat(soil.ec)<0.8?"#f59e0b":parseFloat(soil.ec)<3?"#22c55e":"#ef4444":"#2d4060"},
    {label:"NIR Index",val:soil?.ndmi,unit:"NDMI",col:"#a78bfa",max:1,
     status:soil?parseFloat(soil.ndmi)>0.1?"Positive":parseFloat(soil.ndmi)<-0.2?"Negative":"Neutral":"—",
     sc:soil?parseFloat(soil.ndmi)>0.1?"#22c55e":parseFloat(soil.ndmi)<-0.2?"#ef4444":"#f59e0b":"#2d4060"},
  ];
  const NPK=[
    {el:"N",val:soil?.N,max:350,col:"#4ade80"},
    {el:"P",val:soil?.P,max:160,col:"#fb923c"},
    {el:"K",val:soil?.K,max:280,col:"#c084fc"},
  ];

  return (
    <div style={C.page}>
      <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-track{background:#090e1a}::-webkit-scrollbar-thumb{background:#1e3a5f;border-radius:2px}`}</style>

      {/* ── TOP BAR ── */}
      <div style={C.top}>
        <span style={C.logo}>Soil<span style={C.logoG}>Spec</span></span>
        <span style={{fontSize:11,color:"#1e3a5f",marginLeft:4}}>AS7265x · ATSAMD21G17D · 18-ch</span>
        <div style={C.tabBar}>
          {[["dashboard","Dashboard"],["channels","18 Channels"],["analysis","Analysis"],["log","Log"]].map(([k,l])=>(
            <button key={k} style={C.tab(tab===k)} onClick={()=>setTab(k)}>{l}</button>
          ))}
        </div>
        <div style={C.chip(conn)}><span style={C.dot(conn)}/>{conn?"LIVE":"OFFLINE"}</div>
        <div style={C.topR}>
          <span style={{fontSize:11,color:"#2d4060"}}>reads <b style={{color:"#3d5c7a"}}>{reads}</b></span>
          <button style={C.btnConn(conn)} onClick={connect}>{conn?"Disconnect":"Connect"}</button>
          {conn&&<button style={C.btnPause(paused)} onClick={togglePause}>{paused?"Resume":"Pause"}</button>}
          <button style={C.btnExp} onClick={doExport}>Export CSV</button>
        </div>
      </div>

      {/* raw strip */}
      <div style={C.rawStrip}>
        <span style={{color:"#172136"}}>RAW ›</span>
        <span style={{color:"#0d9488",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{rawLine}</span>
        <span style={{color:"#172136",flexShrink:0}}>err <span style={{color:"#d97706"}}>{errors}</span></span>
      </div>

      {/* ── BODY ── */}
      <div style={C.body}>

        {/* ── SIDEBAR ── */}
        <div style={C.side}>

          {/* metrics */}
          <div style={C.sideSection}>
            <div style={C.secTitle}>Soil Metrics</div>
            <div style={C.metGrid}>
              {METRICS.map(({label,val,unit,col,max,status,sc})=>(
                <div key={label} style={C.metCard(col)}>
                  <div style={C.metLabel}>{label}</div>
                  <div style={C.metVal(col)}>{val??<span style={{color:"#172136"}}>—</span>}</div>
                  <div style={C.metUnit}>{unit}</div>
                  <div style={C.metBar}><div style={C.metFill(col,val!=null?Math.min(100,Math.abs(parseFloat(val))/max*100):0)}/></div>
                  <div style={C.metStatus(sc)}>{status}</div>
                </div>
              ))}
            </div>
          </div>

          {/* health + plough readiness */}
          <div style={C.scoreRow}>
            <ScoreArc score={soil?.score}/>
            <div style={{flex:1}}>
              <div style={{fontSize:10,color:"#2d4060",marginBottom:2}}>Health Score</div>
              <div style={{fontSize:32,fontWeight:800,color:scoreCol,fontFamily:"monospace",lineHeight:1}}>{soil?.score??<span style={{color:"#172136"}}>—</span>}</div>
              <div style={{fontSize:11,color:scoreCol,fontWeight:600,marginTop:4}}>
                {!soil?"Awaiting data":soil.score>=70?"Good":soil.score>=45?"Moderate":"Poor"}
              </div>
            </div>
          </div>

          {/* plough readiness */}
          <div style={C.ploughBox(soil?.ploughReady)}>
            <span style={C.ploughIcon(soil?.ploughReady)}>{soil?.ploughReady?"🚜":"⛔"}</span>
            <div style={C.ploughText}>
              <div style={C.ploughTitle(soil?.ploughReady)}>
                {!soil?"Awaiting data":soil.ploughReady?"Ready to Plough":"Not Ready to Plough"}
              </div>
              <div style={C.ploughSub}>
                {!soil?"Connect sensor":soil.ploughReady?"Moisture & EC within tillage range":"Check moisture / EC / OM levels"}
              </div>
            </div>
          </div>

          {/* soil type */}
          {soil&&(
            <div style={{...C.sideSection,paddingTop:10,paddingBottom:10}}>
              <div style={C.secTitle}>Soil Classification</div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <span style={{fontSize:16,fontWeight:800,color:"#22d3ee"}}>{soil.soilType}</span>
                <span style={{fontSize:11,color:"#3d5c7a",fontFamily:"monospace"}}>{soil.soilConf}% conf.</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginTop:10}}>
                {[
                  {l:"Compaction",v:soil.compaction+"%",col:soil.compaction>60?"#ef4444":soil.compaction>35?"#f59e0b":"#22c55e"},
                  {l:"Salinity",v:soil.salinityRisk,col:soil.salinityCol},
                  {l:"Red-Edge",v:soil.redEdge+"%",col:"#f43f5e"},
                  {l:"NIR/VIS ratio",v:((adc[15]||0)/(adc[5]||1)).toFixed(2),col:"#a78bfa"},
                ].map(({l,v,col})=>(
                  <div key={l} style={{background:"#0a1020",borderRadius:8,padding:"7px 10px",border:"1px solid #172136"}}>
                    <div style={{fontSize:9,color:"#2d4060",marginBottom:2}}>{l}</div>
                    <div style={{fontSize:14,fontWeight:700,color:col,fontFamily:"monospace"}}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* NPK */}
          <div style={C.sideSection}>
            <div style={C.secTitle}>NPK Estimate</div>
            {NPK.map(({el,val,max,col})=>{
              const pct=val!=null?Math.min(100,val/max*100):0;
              const lvl=val==null?"—":val<max*.25?"LOW":val<max*.6?"MED":"HIGH";
              const lc=lvl==="LOW"?"#ef4444":lvl==="HIGH"?"#22c55e":"#f59e0b";
              return(
                <div key={el} style={C.npkRow}>
                  <span style={C.npkEl(col)}>{el}</span>
                  <div style={C.npkTrack}><div style={C.npkFill(col,pct)}/></div>
                  <span style={C.npkPpm(col)}>{val!=null?val+" ppm":"—"}</span>
                  <span style={C.npkLvl(lc)}>{lvl}</span>
                </div>
              );
            })}
            <div style={{fontSize:9,color:"#172136",marginTop:4}}>* Spectral proxy model — lab verify</div>
          </div>

          {/* AI Recommendations */}
          {soil&&soil.recs.length>0&&(
            <div style={C.sideSection}>
              <div style={C.secTitle}>Recommendations</div>
              {soil.recs.map((r,i)=>(
                <div key={i} style={C.recItem(r.type)}>
                  <span style={{fontSize:14,flexShrink:0}}>{r.icon}</span>
                  <span style={C.recText}>{r.text}</span>
                </div>
              ))}
            </div>
          )}

          {/* calibration */}
          <div style={C.sideSection}>
            <div style={C.secTitle}>Calibration</div>
            <div style={C.calRow}>
              <button style={C.calBtn(!!darkRef)} onClick={capDark}>{darkRef?"✓ Dark":"Dark Ref"}</button>
              <button style={C.calBtn(!!whiteRef)} onClick={capWhite}>{whiteRef?"✓ White":"White Ref"}</button>
            </div>
          </div>

          {/* log */}
          <div style={C.logArea}>
            {logs.length===0&&<div style={{color:"#172136",fontSize:11,padding:"6px 0"}}>Connect to begin…</div>}
            {logs.map((e,i)=>(
              <div key={i} style={C.logLine}>
                <span style={C.logTs}>{e.ts}</span>
                <span style={{color:logColors[e.t]}}>{e.msg}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── MAIN ── */}
        <div style={C.main}>

          {/* ═══ DASHBOARD TAB ═══ */}
          {tab==="dashboard"&&<>

            {/* spectrum bar */}
            <div style={C.card}>
              <div style={C.cardHead}>
                <span style={C.cardTitle}>Full Spectrum — 18 channels · 410–940 nm</span>
                <div style={{display:"flex",gap:16}}>
                  {[["VIS","#fb923c"],["R-Edge","#f43f5e"],["NIR","#a78bfa"]].map(([l,c])=>(
                    <span key={l} style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:"#3d5c7a"}}>
                      <span style={{width:10,height:8,borderRadius:2,background:c}}/>{l}
                    </span>
                  ))}
                </div>
              </div>
              <div style={{position:"relative",height:170}}>
                <Bar data={specBar} options={specOpts} role="img" aria-label="18 channel spectral ADC bar chart"/>
              </div>
            </div>

            {/* row 2: trend + NIR */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
              <div style={C.card}>
                <div style={C.cardHead}>
                  <span style={C.cardTitle}>Channel Trend</span>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:11,padding:"2px 8px",borderRadius:5,fontWeight:700,background:rgba(CH[selCh].col,.15),color:CH[selCh].col}}>
                      {CH[selCh].nm} nm · {CH[selCh].r}
                    </span>
                    <span style={{fontSize:20,fontWeight:800,color:CH[selCh].col,fontFamily:"monospace"}}>{adc[selCh]}</span>
                  </div>
                </div>
                <div style={{position:"relative",height:100}}>
                  <Line data={trendLine} options={trendOpts} role="img" aria-label="Channel ADC trend"/>
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:3,marginTop:10}}>
                  {CH.map((ch,i)=>(
                    <button key={i} onClick={()=>setSelCh(i)}
                      style={{padding:"3px 7px",borderRadius:4,border:"none",cursor:"pointer",fontSize:10,fontWeight:700,
                        background:selCh===i?rgba(ch.col,.25):"transparent",
                        color:selCh===i?ch.col:"#2d4060",
                        outline:selCh===i?`1px solid ${rgba(ch.col,.4)}`:"none"}}>
                      {ch.nm}
                    </button>
                  ))}
                </div>
              </div>

              <div style={C.card}>
                <div style={C.cardHead}>
                  <span style={C.cardTitle}>NIR Channels — moisture sensitive</span>
                  <span style={C.cardSub}>730–940 nm</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                  {[12,13,14,15,16,17].map(i=>{
                    const ch=CH[i],v=adc[i],pct=Math.round(v/4095*100);
                    return(
                      <div key={i} style={C.chCard(selCh===i,ch.col)} onClick={()=>setSelCh(i)}>
                        <div style={C.chHead}>
                          <span style={C.chNm(ch.col)}>{ch.nm}<span style={C.chNmSub}> nm</span></span>
                          <span style={C.chBadge(ch.col)}>NIR</span>
                        </div>
                        <Spark data={hist[i]} color={ch.col}/>
                        <div style={C.chBarW}><div style={C.chBarF(ch.col,pct)}/></div>
                        <div style={C.chAdc(ch.col)}>{v}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>}

          {/* ═══ 18 CHANNELS TAB ═══ */}
          {tab==="channels"&&(
            <>
              {/* ALL 18 IN 3 ROWS OF 6 */}
              <div style={C.card}>
                <div style={C.cardHead}>
                  <span style={C.cardTitle}>All 18 Spectral Channels</span>
                  <span style={C.cardSub}>3 rows × 6 channels · click any card to view trend</span>
                </div>

                {/* Row 1: 410–535 nm (channels 0–5) */}
                <div style={{...C.bandHead}}>
                  <span style={C.bandTitle}>Violet–Green</span>
                  <span style={C.bandSub}>410 · 435 · 460 · 485 · 510 · 535 nm</span>
                  <div style={C.bandLine}/>
                </div>
                <div style={{...C.chGrid,marginBottom:16}}>
                  {[0,1,2,3,4,5].map(i=>{
                    const ch=CH[i],v=adc[i],pct=Math.round(v/4095*100);
                    return(
                      <div key={i} style={C.chCard(selCh===i,ch.col)} onClick={()=>setSelCh(i)}>
                        <div style={C.chHead}>
                          <span style={C.chNm(ch.col)}>{ch.nm}<span style={C.chNmSub}> nm</span></span>
                          <span style={C.chBadge(ch.col)}>{ch.r}</span>
                        </div>
                        <div style={C.chRole}>{ch.role}</div>
                        <Spark data={hist[i]} color={ch.col}/>
                        <div style={C.chBarW}><div style={C.chBarF(ch.col,pct)}/></div>
                        <div style={C.chAdc(ch.col)}>{v}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Row 2: 560–705 nm (channels 6–11) */}
                <div style={C.bandHead}>
                  <span style={C.bandTitle}>Yellow–Red-Edge</span>
                  <span style={C.bandSub}>560 · 585 · 610 · 645 · 680 · 705 nm</span>
                  <div style={C.bandLine}/>
                </div>
                <div style={{...C.chGrid,marginBottom:16}}>
                  {[6,7,8,9,10,11].map(i=>{
                    const ch=CH[i],v=adc[i],pct=Math.round(v/4095*100);
                    return(
                      <div key={i} style={C.chCard(selCh===i,ch.col)} onClick={()=>setSelCh(i)}>
                        <div style={C.chHead}>
                          <span style={C.chNm(ch.col)}>{ch.nm}<span style={C.chNmSub}> nm</span></span>
                          <span style={C.chBadge(ch.col)}>{ch.r}</span>
                        </div>
                        <div style={C.chRole}>{ch.role}</div>
                        <Spark data={hist[i]} color={ch.col}/>
                        <div style={C.chBarW}><div style={C.chBarF(ch.col,pct)}/></div>
                        <div style={C.chAdc(ch.col)}>{v}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Row 3: 730–940 nm (channels 12–17) */}
                <div style={C.bandHead}>
                  <span style={C.bandTitle}>Near-Infrared</span>
                  <span style={C.bandSub}>730 · 760 · 810 · 860 · 900 · 940 nm</span>
                  <div style={C.bandLine}/>
                </div>
                <div style={C.chGrid}>
                  {[12,13,14,15,16,17].map(i=>{
                    const ch=CH[i],v=adc[i],pct=Math.round(v/4095*100);
                    return(
                      <div key={i} style={C.chCard(selCh===i,ch.col)} onClick={()=>setSelCh(i)}>
                        <div style={C.chHead}>
                          <span style={C.chNm(ch.col)}>{ch.nm}<span style={C.chNmSub}> nm</span></span>
                          <span style={C.chBadge(ch.col)}>{ch.r}</span>
                        </div>
                        <div style={C.chRole}>{ch.role}</div>
                        <Spark data={hist[i]} color={ch.col}/>
                        <div style={C.chBarW}><div style={C.chBarF(ch.col,pct)}/></div>
                        <div style={C.chAdc(ch.col)}>{v}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* ═══ ANALYSIS TAB ═══ */}
          {tab==="analysis"&&<>
            {/* top row: classification + compaction + salinity */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14}}>
              <div style={{...C.card,display:"flex",flexDirection:"column",gap:8}}>
                <div style={C.cardTitle}>Soil Classification</div>
                <div style={{fontSize:28,fontWeight:800,color:"#22d3ee",fontFamily:"monospace"}}>{soil?.soilType??"—"}</div>
                <div style={{fontSize:12,color:"#3d5c7a"}}>Confidence: <b style={{color:"#22d3ee"}}>{soil?.soilConf??0}%</b></div>
                <div style={{fontSize:11,color:"#2d4060",marginTop:4,lineHeight:1.7}}>
                  Derived from NIR/VIS ratio, organic matter index, and moisture profile across all 18 spectral channels.
                </div>
              </div>
              <div style={{...C.card,display:"flex",flexDirection:"column",gap:10}}>
                <div style={C.cardTitle}>Compaction Index</div>
                <div style={{fontSize:36,fontWeight:800,color:soil&&soil.compaction>60?"#ef4444":soil&&soil.compaction>35?"#f59e0b":"#22c55e",fontFamily:"monospace",lineHeight:1}}>
                  {soil?.compaction??<span style={{color:"#172136"}}>—</span>}
                  <span style={{fontSize:14,fontWeight:400,color:"#2d4060"}}> /100</span>
                </div>
                <div style={{height:8,background:"#172136",borderRadius:4,overflow:"hidden"}}>
                  <div style={{height:"100%",borderRadius:4,background:soil&&soil.compaction>60?"#ef4444":soil&&soil.compaction>35?"#f59e0b":"#22c55e",width:(soil?.compaction??0)+"%",transition:"width .5s"}}/>
                </div>
                <div style={{fontSize:11,color:"#3d5c7a"}}>
                  {!soil?"—":soil.compaction>60?"Deep tillage recommended":soil.compaction>35?"Moderate compaction":"Soil structure good"}
                </div>
              </div>
              <div style={{...C.card,display:"flex",flexDirection:"column",gap:10}}>
                <div style={C.cardTitle}>Salinity Risk</div>
                <div style={{fontSize:28,fontWeight:800,fontFamily:"monospace",color:soil?.salinityCol??"#172136",lineHeight:1}}>{soil?.salinityRisk??"—"}</div>
                <div style={{fontSize:13,color:"#3d5c7a"}}>EC: <b style={{color:soil?.salinityCol??"#172136",fontFamily:"monospace"}}>{soil?.ec??0} mS/cm</b></div>
                <div style={{fontSize:11,color:"#2d4060",lineHeight:1.7}}>
                  {!soil?"—":parseFloat(soil.ec)<0.8?"Low EC — may need nutrient amendment":parseFloat(soil.ec)<3?"EC in optimal range for most crops":"High EC — salt stress risk, leach before sowing"}
                </div>
              </div>
            </div>

            {/* moisture history trend */}
            <div style={C.card}>
              <div style={C.cardHead}>
                <span style={C.cardTitle}>Moisture Trend — last 30 snapshots</span>
                <span style={C.cardSub}>captured every 10 readings</span>
              </div>
              <div style={{position:"relative",height:130}}>
                {history18.length>1
                  ? <Line data={moistTrend} options={trendLineOpts} role="img" aria-label="Moisture trend over time"/>
                  : <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:"#172136",fontSize:12}}>
                      Collecting data… (need 2+ snapshots)
                    </div>
                }
              </div>
            </div>

            {/* detailed gauges */}
            <div style={{...C.card}}>
              <div style={{...C.cardHead,marginBottom:16}}><span style={C.cardTitle}>Detailed Parameter Analysis</span></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
                <GaugeBar value={soil?.moisture} max={100} color="#38bdf8" label="Soil Moisture" unit="%" markers={[25,65]}
                  status={soil?soil.moisture<25?"DRY":soil.moisture<65?"OPTIMAL":"WET":"—"}
                  statusColor={soil?soil.moisture<25?"#ef4444":soil.moisture<65?"#22c55e":"#f59e0b":"#2d4060"}/>
                <GaugeBar value={soil?.om} max={15} color="#4ade80" label="Organic Matter" unit="% SOM" markers={[13,33]}
                  status={soil?parseFloat(soil.om)<2?"DEFICIENT":parseFloat(soil.om)<5?"MODERATE":"RICH":"—"}
                  statusColor={soil?parseFloat(soil.om)<2?"#ef4444":parseFloat(soil.om)<5?"#f59e0b":"#22c55e":"#2d4060"}/>
                <GaugeBar value={soil?.ec} max={6} color="#22d3ee" label="Electrical Conductivity" unit="mS/cm" markers={[13,50]}
                  status={soil?parseFloat(soil.ec)<0.8?"LOW":parseFloat(soil.ec)<3?"NORMAL":"HIGH":"—"}
                  statusColor={soil?parseFloat(soil.ec)<0.8?"#f59e0b":parseFloat(soil.ec)<3?"#22c55e":"#ef4444":"#2d4060"}/>
                <GaugeBar value={soil?.N} max={350} color="#4ade80" label="Nitrogen (N)" unit="ppm" markers={[23,57]}
                  status={soil?soil.N<80?"LOW":soil.N<200?"MED":"HIGH":"—"}
                  statusColor={soil?soil.N<80?"#ef4444":soil.N<200?"#f59e0b":"#22c55e":"#2d4060"}/>
                <GaugeBar value={soil?.P} max={160} color="#fb923c" label="Phosphorus (P)" unit="ppm" markers={[16,38]}
                  status={soil?soil.P<25?"LOW":soil.P<80?"MED":"HIGH":"—"}
                  statusColor={soil?soil.P<25?"#ef4444":soil.P<80?"#f59e0b":"#22c55e":"#2d4060"}/>
                <GaugeBar value={soil?.K} max={280} color="#c084fc" label="Potassium (K)" unit="ppm" markers={[21,57]}
                  status={soil?soil.K<60?"LOW":soil.K<160?"MED":"HIGH":"—"}
                  statusColor={soil?soil.K<60?"#ef4444":soil.K<160?"#f59e0b":"#22c55e":"#2d4060"}/>
              </div>
            </div>

            {/* channel role table */}
            <div style={C.card}>
              <div style={{...C.cardHead,marginBottom:12}}><span style={C.cardTitle}>Channel-by-channel soil significance</span></div>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead>
                  <tr style={{borderBottom:"1px solid #172136"}}>
                    {["Channel","Region","ADC","% FS","Soil Role"].map(h=>(
                      <th key={h} style={{textAlign:"left",padding:"6px 10px",fontSize:10,color:"#2d4060",fontWeight:700}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CH.map((ch,i)=>{
                    const v=adc[i],pct=Math.round(v/4095*100);
                    return(
                      <tr key={i} style={{borderBottom:"1px solid #0d1625",cursor:"pointer",background:selCh===i?"#0f1e35":"transparent"}}
                        onClick={()=>setSelCh(i)}>
                        <td style={{padding:"7px 10px",fontWeight:700,color:ch.col,fontFamily:"monospace"}}>{ch.nm} nm</td>
                        <td style={{padding:"7px 10px",fontSize:11,color:"#4a6080"}}>{ch.r}</td>
                        <td style={{padding:"7px 10px",fontFamily:"monospace",fontWeight:700,color:"#d4e2f4"}}>{v}</td>
                        <td style={{padding:"7px 10px",width:130}}>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <div style={{flex:1,height:5,background:"#172136",borderRadius:2,overflow:"hidden"}}>
                              <div style={{height:"100%",borderRadius:2,background:ch.col,width:pct+"%",transition:"width .3s"}}/>
                            </div>
                            <span style={{fontSize:10,color:ch.col,fontFamily:"monospace",width:28,textAlign:"right"}}>{pct}%</span>
                          </div>
                        </td>
                        <td style={{padding:"7px 10px",fontSize:11,color:"#4a6080"}}>{ch.role}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>}

          {/* ═══ LOG TAB ═══ */}
          {tab==="log"&&(
            <div style={C.card}>
              <div style={{...C.cardHead,marginBottom:10}}>
                <span style={C.cardTitle}>Event Log</span>
                <button onClick={()=>setLogs([])} style={{fontSize:11,color:"#3d5c7a",background:"none",border:"none",cursor:"pointer"}}>Clear</button>
              </div>
              <div style={{fontFamily:"monospace",fontSize:11,lineHeight:1.8}}>
                {logs.length===0&&<div style={{color:"#172136",padding:"12px 0",textAlign:"center"}}>No events — connect to start logging</div>}
                {logs.map((e,i)=>(
                  <div key={i} style={{display:"flex",gap:12,padding:"2px 6px",borderRadius:4,background:i%2===0?"transparent":"#0a1020"}}>
                    <span style={{color:"#1e3a5f",flexShrink:0,width:72}}>{e.ts}</span>
                    <span style={{color:logColors[e.t]}}>{e.msg}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
