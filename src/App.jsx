import { useState, useRef, useCallback } from "react";
import { Chart, LineElement, BarElement, CategoryScale, LinearScale, PointElement, Filler, Tooltip, Legend } from "chart.js";
import { Line, Bar } from "react-chartjs-2";
Chart.register(LineElement, BarElement, CategoryScale, LinearScale, PointElement, Filler, Tooltip, Legend);

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
const HLEN = 80;
const WF_MAX = 120;
const NM = CH.map(c => c.nm + "");
const rgba = (h,a) => { const r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16); return `rgba(${r},${g},${b},${a})`; };

// known reference spectra from your actual measurements
const REFS = {
  air:        [1478,1058,2091, 985,1213,1409,1326,1473, 940, 248, 165,  70,1165, 373, 132, 100, 220, 718],
  water:      [1835,1231,2454,1208,1554,1838,1590,1857,1034, 314, 195,  79,1669, 469, 172, 126, 309, 928],
  fertiliser: [1541, 975,1893, 847, 884,1271,1270,1212, 853, 229, 157,  68,1242, 329, 123,  99, 203, 772],
};


function computeSmartNPK(adc, refs) {
  if (!adc || adc.every(v => v === 0)) {
    return { N: 0, P: 0, K: 0 };
  }

  const air = refs.air;
  const water = refs.water;

  const norm = adc.map((v, i) => v / (air[i] || 1));

  const vis = norm.slice(0, 8);
  const nir = norm.slice(12, 18);

  const vis_avg = vis.reduce((a,b)=>a+b,0)/vis.length;
  const nir_avg = nir.reduce((a,b)=>a+b,0)/nir.length;

  let diff = 0;
  for (let i = 0; i < 18; i++) {
    diff += Math.abs(adc[i] - water[i]);
  }
  const variation = diff / 18;

  if (vis_avg < 1.1 && nir_avg < 1.1) {
    return { N: 5, P: 3, K: 3 };
  }

  if (variation < 80) {
    return { N: 10, P: 5, K: 5 };
  }

  const concentration = variation / 200;

  let N = 120 + concentration * 180;
  let P = 40  + concentration * 90;
  let K = 70  + concentration * 120;

  return {
    N: Math.round(Math.min(N, 400)),
    P: Math.round(Math.min(P, 200)),
    K: Math.round(Math.min(K, 300))
  };
}

const REF_META = {
  air:        { label:"Air",        emoji:"🌬",  desc:"Empty / Air baseline",   col:"#94a3b8", hint:"No liquid present. Sensor reading ambient environment." },
  water:      { label:"Water",      emoji:"💧",  desc:"Plain Water",             col:"#38bdf8", hint:"Pure water detected. High VIS reflectance, low NIR absorption." },
  fertiliser: { label:"Fertiliser", emoji:"🌿",  desc:"Fertiliser + Water",     col:"#f59e0b", hint:"Dissolved nutrients detected. Suppressed VIS at 485-585 nm band." },
};
function cosineSim(a,b){const dot=a.reduce((s,v,i)=>s+v*b[i],0);const na=Math.sqrt(a.reduce((s,v)=>s+v*v,0));const nb=Math.sqrt(b.reduce((s,v)=>s+v*v,0));return na===0||nb===0?0:dot/(na*nb);}
function classifyADC(adc){if(!adc||adc.every(v=>v===0))return null;const scores=Object.fromEntries(Object.entries(REFS).map(([k,ref])=>[k,Math.round(cosineSim(adc,ref)*10000)/100]));const best=Object.entries(scores).sort((a,b)=>b[1]-a[1])[0][0];const diff=Math.max(...Object.values(scores))-Object.values(scores).sort((a,b)=>a-b)[1];const confidence=Math.round(Math.min(99,diff*8));return{best,scores,confidence};}

function calcSoil(v) {
  if (!v||v.every(x=>x===0)) return null;
  const nir=(v[12]+v[13]+v[14]+v[15]+v[16]+v[17])/6;
  const vis=(v[0]+v[1]+v[2]+v[3]+v[4]+v[5]+v[6]+v[7]+v[8]+v[9]+v[10]+v[11])/12;
  const moisture=Math.max(0,Math.min(100,Math.round((1-nir/4095)*90)));
  const om=Math.max(0.5,Math.min(15,((4095-vis)/4095*10)+1.2));
  const ec=Math.max(0.1,Math.min(6,((v[15]-v[17])/(v[15]+v[17]+1))*3+1.8));
  const ndmi=(nir-vis)/(nir+vis+1);
  const nirRatio=nir/(vis+1);
const npk = computeSmartNPK(v, REFS);
const N = npk.N;
const P = npk.P;
const K = npk.K;
  const score=Math.round(Math.min(98,Math.max(8,(om/10)*35+(1-Math.abs(moisture-42)/42)*30+(N/350)*20+(K/280)*15)));
  let soilType="Mixed Mineral",soilConf=60;
  if(nirRatio>2.5&&om>4){soilType="Loamy / Rich";soilConf=82;}
  else if(nirRatio>1.8&&om>2){soilType="Silty Loam";soilConf=74;}
  else if(nirRatio<1.2&&om<2){soilType="Sandy / Light";soilConf=78;}
  else if(ndmi<-0.2){soilType="Clay / Compact";soilConf=70;}
  const ploughReady=moisture>=20&&moisture<=60&&om>=1.5&&ec<=3;
  const compaction=Math.round(Math.max(0,Math.min(100,(1-nirRatio/3)*60+(1-moisture/80)*40)));
  const salinityRisk=ec>3?"HIGH":ec>1.5?"MEDIUM":"LOW";
  const salinityCol=ec>3?"#ef4444":ec>1.5?"#f59e0b":"#22c55e";
  const recs=[];
  if(moisture<20)recs.push({type:"warn",icon:"💧",text:"Moisture critically low — irrigate before ploughing"});
  if(moisture>70)recs.push({type:"warn",icon:"💧",text:"Soil too wet — wait for drainage before tillage"});
  if(moisture>=20&&moisture<=60)recs.push({type:"ok",icon:"✓",text:"Moisture optimal for tillage operations"});
  if(N<80)recs.push({type:"warn",icon:"🌿",text:"Nitrogen low — apply 40–60 kg/ha urea"});
  if(P<30)recs.push({type:"warn",icon:"🌿",text:"Phosphorus low — consider DAP application"});
  if(K<80)recs.push({type:"warn",icon:"🌿",text:"Potassium low — apply MOP or SOP"});
  if(om<1.5)recs.push({type:"warn",icon:"🪱",text:"Organic matter low — add compost or manure"});
  if(ec>3)recs.push({type:"alert",icon:"⚠",text:"High salinity — leach field before sowing"});
  if(compaction>60)recs.push({type:"warn",icon:"⛏",text:"Compaction detected — deep tillage recommended"});
  if(score>=70)recs.push({type:"ok",icon:"✓",text:"Soil in good condition — proceed with ploughing"});
  return{moisture,om:om.toFixed(1),ec:ec.toFixed(2),ndmi:ndmi.toFixed(3),N,P,K,score,soilType,soilConf,ploughReady,compaction,salinityRisk,salinityCol,recs,nirAvg:Math.round(nir),visAvg:Math.round(vis)};
}

function WaterfallCanvas({rows,selCh,onChClick}){
  const ref=useRef(null);
  useRef(()=>{});
  const draw=useCallback((canvas)=>{
    if(!canvas)return;
    ref.current=canvas;
    const ctx=canvas.getContext("2d");
    const W=canvas.offsetWidth||800,H=canvas.offsetHeight||300;
    canvas.width=W;canvas.height=H;
    ctx.fillStyle="#080c18";ctx.fillRect(0,0,W,H);
    if(!rows.length)return;
    const rH=Math.max(1.5,H/WF_MAX),cW=W/18;
    rows.forEach((row,ri)=>{
      const y=H-(rows.length-ri)*rH;
      row.forEach((val,ci)=>{
        const n=Math.min(1,Math.max(0,val/4095));
        const hx=CH[ci].col;
        const r=parseInt(hx.slice(1,3),16),g=parseInt(hx.slice(3,5),16),b=parseInt(hx.slice(5,7),16);
        ctx.fillStyle=`rgba(${r},${g},${b},${Math.max(0.05,n)})`;
        ctx.fillRect(ci*cW,y,cW-0.5,rH+1);
      });
    });
    ctx.strokeStyle=CH[selCh].col;ctx.lineWidth=1.5;ctx.globalAlpha=0.6;
    ctx.strokeRect(selCh*cW,0,cW,H);ctx.globalAlpha=1;
    ctx.strokeStyle="rgba(15,25,50,0.5)";ctx.lineWidth=0.5;
    for(let i=1;i<18;i++){ctx.beginPath();ctx.moveTo(i*cW,0);ctx.lineTo(i*cW,H);ctx.stroke();}
    CH.filter((_,i)=>i%3===0).forEach((ch,j)=>{ctx.fillStyle="#3d5c7a";ctx.font="9px monospace";ctx.fillText(ch.nm,j*3*cW+4,H-4);});
  },[rows,selCh]);
  return(<canvas ref={draw} style={{width:"100%",height:"100%",display:"block",cursor:"pointer"}} onClick={(e)=>{const rect=e.currentTarget.getBoundingClientRect();const x=e.clientX-rect.left;const idx=Math.floor(x/rect.width*18);if(idx>=0&&idx<18)onChClick(idx);}}/>);
}

function Spark({data,color,height=52}){
  const cfg={labels:data.map((_,i)=>i),datasets:[{data,borderColor:color,backgroundColor:rgba(color,.10),borderWidth:1.5,pointRadius:0,tension:.4,fill:true}]};
  const opts={responsive:true,maintainAspectRatio:false,animation:{duration:0},plugins:{legend:{display:false},tooltip:{enabled:false}},scales:{x:{display:false},y:{display:false,min:0,max:4095}}};
  return <div style={{height,width:"100%"}}><Line data={cfg} options={opts}/></div>;
}

function ScoreArc({score,size=88}){
  const r=36,cx=44,cy=44,circ=2*Math.PI*r;
  const off=circ*(1-(score!=null?Math.min(1,score/100):0));
  const col=score==null?"#1e3a5f":score>=70?"#22c55e":score>=45?"#f59e0b":"#ef4444";
  return(<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
    <svg width={size} height={size} viewBox="0 0 88 88">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1a2a40" strokeWidth={9}/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={col} strokeWidth={9} strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`} style={{transition:"stroke-dashoffset .6s"}}/>
      <text x={cx} y={cy-4} textAnchor="middle" fontSize={19} fontWeight={700} fill={col} fontFamily="monospace">{score??<tspan fill="#1e3a5f">—</tspan>}</text>
      <text x={cx} y={cy+13} textAnchor="middle" fontSize={9} fill="#3d5c7a" fontFamily="monospace">/100</text>
    </svg>
    <span style={{fontSize:10,fontWeight:700,letterSpacing:.8,color:col,textTransform:"uppercase"}}>{score==null?"awaiting":score>=70?"good":score>=45?"moderate":"poor"}</span>
  </div>);
}

function GaugeBar({label,value,max,color,unit,status,statusColor,lo,hi}){
  const pct=value!=null?Math.min(100,Math.abs(parseFloat(value))/max*100):0;
  const loPct=lo!=null?lo/max*100:null,hiPct=hi!=null?hi/max*100:null;
  return(<div style={{marginBottom:14}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,alignItems:"baseline"}}>
      <span style={{fontSize:11,color:"#4a6080",fontWeight:600}}>{label}</span>
      <span style={{fontSize:11,fontWeight:700,color:statusColor||color}}>{status||"—"}</span>
    </div>
    <div style={{height:10,background:"#111e33",borderRadius:5,overflow:"hidden",position:"relative"}}>
      {loPct!=null&&<div style={{position:"absolute",top:0,bottom:0,left:loPct+"%",width:1.5,background:"rgba(255,255,255,.2)",zIndex:1}}/>}
      {hiPct!=null&&<div style={{position:"absolute",top:0,bottom:0,left:hiPct+"%",width:1.5,background:"rgba(255,255,255,.2)",zIndex:1}}/>}
      <div style={{height:"100%",borderRadius:5,background:color,width:pct+"%",transition:"width .5s"}}/>
    </div>
    <div style={{display:"flex",justifyContent:"space-between",marginTop:3}}>
      <span style={{fontSize:12,fontWeight:700,color,fontFamily:"monospace"}}>{value??<span style={{color:"#1e3a5f"}}>—</span>} <span style={{fontSize:10,fontWeight:400,color:"#2d4060"}}>{unit}</span></span>
      {loPct!=null&&hiPct!=null&&<span style={{fontSize:9,color:"#2d4060"}}>optimal {lo}–{hi} {unit}</span>}
    </div>
  </div>);
}

function ChCard({ch,val,hist,selected,onClick}){
  const pct=Math.round(val/4095*100);
  return(<div onClick={onClick} style={{background:"#0a1020",borderRadius:10,padding:"10px 10px 8px",cursor:"pointer",border:selected?`2px solid ${ch.col}`:"1px solid #172136",transition:"border-color .12s",boxShadow:selected?`0 0 12px ${rgba(ch.col,.2)}`:"none"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
      <span style={{fontSize:14,fontWeight:800,color:ch.col,fontFamily:"monospace"}}>{ch.nm}<span style={{fontSize:9,fontWeight:400,color:"#2d4060"}}> nm</span></span>
      <span style={{fontSize:8,fontWeight:700,padding:"2px 5px",borderRadius:3,background:rgba(ch.col,.15),color:ch.col}}>{ch.r}</span>
    </div>
    <div style={{fontSize:9,color:"#2d4060",marginBottom:5,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{ch.role}</div>
    <Spark data={hist} color={ch.col} height={46}/>
    <div style={{height:3,background:"#172136",borderRadius:2,margin:"5px 0 3px",overflow:"hidden"}}>
      <div style={{height:"100%",borderRadius:2,background:ch.col,width:pct+"%",transition:"width .3s"}}/>
    </div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <span style={{fontSize:10,color:"#2d4060"}}>{pct}%</span>
      <span style={{fontSize:12,fontWeight:700,color:ch.col,fontFamily:"monospace"}}>{val}</span>
    </div>
  </div>);
}

// ── COMPARE TAB ─────────────────────────────────────────────────────────────
function ClassifyTab({adc,reads}){
  const clf=classifyADC(adc);
  const S={
    card:{background:"#0c1322",border:"1px solid #14213a",borderRadius:11,padding:16,marginBottom:12},
    ct:{fontSize:12,fontWeight:700,color:"#d4e2f4"},cs:{fontSize:10,color:"#2d4060"},
  };
  const diff=clf?adc.map((v,i)=>v-REFS[clf.best][i]):new Array(18).fill(0);
  const maxD=Math.max(...diff.map(Math.abs),1);
  const overData={labels:CH.map(c=>c.nm+""),datasets:[
    {label:"Live",data:adc,borderColor:"#22c55e",backgroundColor:"rgba(34,197,94,0.08)",borderWidth:2.5,pointRadius:3,pointBackgroundColor:"#22c55e",tension:.35,fill:true,order:1},
    ...(clf?[{label:REF_META[clf.best].label+" (ref)",data:REFS[clf.best],borderColor:REF_META[clf.best].col,backgroundColor:REF_META[clf.best].col.replace(")",",0.06)").replace("rgb","rgba"),borderWidth:2,borderDash:[6,3],pointRadius:2,tension:.35,fill:false,order:2}]:[]),
  ]};
  const overOpts={responsive:true,maintainAspectRatio:false,animation:{duration:0},plugins:{legend:{display:true,position:"top",labels:{color:"#7b96b8",font:{size:11},boxWidth:14,padding:12}},tooltip:{callbacks:{label:ctx=>" "+ctx.dataset.label+": "+ctx.parsed.y+" ADC"}}},scales:{x:{ticks:{color:"#3d5c7a",font:{size:10,family:"monospace"}},grid:{color:"#0d1625"},border:{display:false}},y:{min:0,max:4095,ticks:{color:"#3d5c7a",font:{size:10},maxTicksLimit:6},grid:{color:"#111e33"},border:{display:false}}}};
  const diffData={labels:CH.map(c=>c.nm+""),datasets:[{label:"Δ",data:diff,backgroundColor:diff.map(d=>d>0?"rgba(34,197,94,0.7)":"rgba(239,68,68,0.7)"),borderColor:diff.map(d=>d>0?"#22c55e":"#ef4444"),borderWidth:1.5,borderRadius:3}]};
  const diffOpts={responsive:true,maintainAspectRatio:false,animation:{duration:0},plugins:{legend:{display:false},tooltip:{callbacks:{title:ctx=>CH[ctx[0].dataIndex].nm+" nm",label:ctx=>" Δ "+(ctx.parsed.y>0?"+":"")+ctx.parsed.y+" ADC"}}},scales:{x:{ticks:{color:"#3d5c7a",font:{size:10,family:"monospace"}},grid:{color:"#0d1625"},border:{display:false}},y:{ticks:{color:"#3d5c7a",font:{size:10},maxTicksLimit:6},grid:{color:"#111e33"},border:{display:false}}}};
  return(
    <div style={{flex:1,overflowY:"auto",background:"#080c18",padding:12,display:"flex",flexDirection:"column",gap:12}}>

      {/* ─ AUTO DETECT PANEL ─ */}
      <div style={{...S.card,padding:0,overflow:"hidden"}}>
        <div style={{padding:"10px 16px",borderBottom:"1px solid #0f1a2d",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={S.ct}>Live Sample Classification</span>
          <span style={{fontSize:10,color:"#2d4060"}}>{reads>0?reads+" reads":"No data — connect sensor"}</span>
        </div>

        {/* 3 condition cards */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:0}}>
          {Object.entries(REF_META).map(([key,meta])=>{
            const isMatch=clf?.best===key;
            const score=clf?.scores[key]??0;
            const conf=clf?.confidence??0;
            const pct=score;
            return(
              <div key={key} style={{
                padding:"20px 20px 16px",
                background:isMatch?rgba(meta.col,.12):"transparent",
                borderRight:"1px solid #14213a",
                borderTop:isMatch?`3px solid ${meta.col}`:"3px solid transparent",
                transition:"all .3s",
                position:"relative",
              }}>
                {isMatch&&<div style={{position:"absolute",top:10,right:12,fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:10,background:rgba(meta.col,.25),color:meta.col,letterSpacing:.8}}>DETECTED</div>}
                <div style={{fontSize:32,marginBottom:6}}>{meta.emoji}</div>
                <div style={{fontSize:20,fontWeight:800,color:isMatch?meta.col:"#4a6080",marginBottom:3}}>{meta.label}</div>
                <div style={{fontSize:11,color:"#3d5c7a",marginBottom:12}}>{meta.desc}</div>

                {/* match score bar */}
                <div style={{marginBottom:4}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontSize:9,color:"#2d4060",fontWeight:600,letterSpacing:.8,textTransform:"uppercase"}}>Match Score</span>
                    <span style={{fontSize:12,fontWeight:700,color:isMatch?meta.col:"#4a6080",fontFamily:"monospace"}}>{pct.toFixed(1)}%</span>
                  </div>
                  <div style={{height:6,background:"#14213a",borderRadius:3,overflow:"hidden"}}>
                    <div style={{height:"100%",borderRadius:3,background:isMatch?meta.col:"#1e3a5f",width:(pct/100*100)+"%",transition:"width .5s"}}/>
                  </div>
                </div>

                {isMatch&&<div style={{marginTop:10,fontSize:10,color:"#7b96b8",lineHeight:1.6,borderTop:"1px solid #14213a",paddingTop:10}}>{meta.hint}</div>}
              </div>
            );
          })}
        </div>

        {/* confidence strip */}
        {clf&&(
          <div style={{padding:"10px 16px",background:"#080e1c",display:"flex",alignItems:"center",gap:16,borderTop:"1px solid #0f1a2d"}}>
            <span style={{fontSize:10,color:"#4a6080"}}>Classification confidence:</span>
            <div style={{flex:1,height:5,background:"#14213a",borderRadius:3,overflow:"hidden"}}>
              <div style={{height:"100%",borderRadius:3,background:clf.confidence>60?"#22c55e":clf.confidence>30?"#f59e0b":"#ef4444",width:clf.confidence+"%",transition:"width .5s"}}/>
            </div>
            <span style={{fontSize:11,fontWeight:700,color:clf.confidence>60?"#22c55e":clf.confidence>30?"#f59e0b":"#ef4444",fontFamily:"monospace"}}>{clf.confidence}%</span>
            {clf.confidence<30&&<span style={{fontSize:10,color:"#ef4444"}}>⚠ Low — readings may be ambiguous</span>}
          </div>
        )}
      </div>

      {/* ─ OVERLAY CHART ─ */}
      <div style={S.card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <span style={S.ct}>Live vs detected reference — spectral overlay</span>
          {clf&&<span style={{fontSize:10,padding:"2px 10px",borderRadius:10,background:rgba(REF_META[clf.best].col,.15),color:REF_META[clf.best].col,fontWeight:700}}>{REF_META[clf.best].emoji} {REF_META[clf.best].label} detected</span>}
        </div>
        <div style={{position:"relative",height:190}}>
          <Line data={overData} options={overOpts} role="img" aria-label="Spectral overlay chart"/>
        </div>
      </div>

      {/* ─ DIFFERENCE CHART ─ */}
      {clf&&(
        <div style={S.card}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <div>
              <span style={S.ct}>Difference — Live minus {REF_META[clf.best].label} reference</span>
              <div style={{fontSize:10,color:"#2d4060",marginTop:2}}>
                <span style={{color:"#22c55e"}}>Green = Live higher</span><span style={{margin:"0 8px",color:"#2d4060"}}>|</span><span style={{color:"#ef4444"}}>Red = Reference higher</span>
              </div>
            </div>
            <div style={{display:"flex",gap:14,fontSize:10}}>
              <span>Max↑ <b style={{color:"#22c55e",fontFamily:"monospace"}}>{Math.max(...diff).toFixed(0)}</b></span>
              <span>Max↓ <b style={{color:"#ef4444",fontFamily:"monospace"}}>{Math.min(...diff).toFixed(0)}</b></span>
              <span>RMS <b style={{color:"#f59e0b",fontFamily:"monospace"}}>{Math.sqrt(diff.reduce((s,d)=>s+d*d,0)/18).toFixed(0)}</b></span>
            </div>
          </div>
          <div style={{position:"relative",height:150}}>
            <Bar data={diffData} options={diffOpts} role="img" aria-label="Difference bar chart"/>
          </div>
        </div>
      )}

      {/* ─ CHANNEL TABLE ─ */}
      {clf&&(
        <div style={S.card}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <span style={S.ct}>Channel breakdown — Live vs {REF_META[clf.best].label}</span>
            <span style={{fontSize:10,color:"#2d4060"}}>★ = significant difference (&gt;200 ADC)</span>
          </div>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr style={{borderBottom:"1px solid #14213a"}}>
                {["Channel","Role","Live","Ref","Δ","Δ%","Signal"].map(h=>(
                  <th key={h} style={{textAlign:"left",padding:"5px 8px",fontSize:9,color:"#2d4060",fontWeight:700,textTransform:"uppercase",letterSpacing:.8}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CH.map((ch,i)=>{
                const lv=adc[i],rv=REFS[clf.best][i],dv=lv-rv,pct=rv===0?0:Math.round(dv/rv*100);
                const key=Math.abs(dv)>200;
                const col=dv>0?"#22c55e":dv<0?"#ef4444":"#4a6080";
                return(
                  <tr key={i} style={{borderBottom:"1px solid #0c1322",background:key?"rgba(255,255,255,.018)":"transparent"}}>
                    <td style={{padding:"6px 8px",fontWeight:800,color:ch.col,fontFamily:"monospace",fontSize:12}}>
                      {key&&<span style={{color:col,marginRight:4}}>★</span>}{ch.nm}<span style={{fontSize:9,fontWeight:400,color:"#2d4060"}}> nm</span>
                    </td>
                    <td style={{padding:"6px 8px",fontSize:10,color:"#4a6080"}}>{ch.role}</td>
                    <td style={{padding:"6px 8px",fontFamily:"monospace",fontWeight:700,color:"#22c55e",fontSize:12}}>{lv}</td>
                    <td style={{padding:"6px 8px",fontFamily:"monospace",fontWeight:700,color:REF_META[clf.best].col,fontSize:12}}>{rv}</td>
                    <td style={{padding:"6px 8px",fontFamily:"monospace",fontWeight:700,fontSize:12,color:col}}>{dv>0?"+":""}{dv}</td>
                    <td style={{padding:"6px 8px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:5}}>
                        <div style={{width:50,height:5,background:"#14213a",borderRadius:2,overflow:"hidden"}}>
                          <div style={{height:"100%",background:col,width:Math.min(100,Math.abs(dv)/maxD*100)+"%",borderRadius:2}}/>
                        </div>
                        <span style={{fontSize:9,color:col,fontFamily:"monospace"}}>{pct>0?"+":""}{pct}%</span>
                      </div>
                    </td>
                    <td style={{padding:"6px 8px"}}>
                      <span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:3,background:rgba(col,.12),color:col}}>
                        {Math.abs(dv)>200?"KEY":Math.abs(dv)>80?"MOD":"~"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


// ── MAIN ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [adc,    setAdc]    = useState(new Array(18).fill(0));
  const [hist,   setHist]   = useState(()=>Array.from({length:18},()=>Array(HLEN).fill(0)));
  const [wfRows, setWfRows] = useState([]);
  const [conn,   setConn]   = useState(false);
  const [paused, setPaused] = useState(false);
  const [reads,  setReads]  = useState(0);
  const [errors, setErrors] = useState(0);
  const [rawLine,setRaw]    = useState("— waiting for device");
  const [darkRef,setDark]   = useState(null);
  const [whiteRef,setWhite] = useState(null);
  const [selCh,  setSelCh]  = useState(15);
  const [tab,    setTab]    = useState("dashboard");
  const [logs,   setLogs]   = useState([]);
  const [csvBuf, setCsv]    = useState([]);
  const [snapshots,setSnaps]= useState([]);

  const histRef=useRef(Array.from({length:18},()=>Array(HLEN).fill(0)));
  const wfRef=useRef([]);
  const adcRef=useRef(new Array(18).fill(0));
  const portRef=useRef(null);
  const rdrRef=useRef(null);
  const pauseRef=useRef(false);
  const snapRef=useRef([]);

  const log=useCallback((msg,t="info")=>{const ts=new Date().toLocaleTimeString("en-GB");setLogs(p=>{const n=[...p,{ts,msg,t}];return n.length>200?n.slice(-200):n;});},[]);

  async function connect(){
    if(conn){await disconnect();return;}
    try{
      portRef.current=await navigator.serial.requestPort({filters:[{usbVendorId:0x03EB}]});
      await portRef.current.open({baudRate:115200,dataBits:8,stopBits:1,parity:"none"});
      setConn(true);log("Port opened — 115200 8N1","ok");log("Waiting for: RAW:v1,v2,...,v18","info");
      const dec=new TextDecoderStream();
      portRef.current.readable.pipeTo(dec.writable);
      rdrRef.current=dec.readable.getReader();
      let buf="",n=0;
      while(true){
        const{value,done}=await rdrRef.current.read();if(done)break;
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
              wfRef.current=[...wfRef.current,corr];
              if(wfRef.current.length>WF_MAX)wfRef.current=wfRef.current.slice(-WF_MAX);
              setWfRows([...wfRef.current]);
              adcRef.current=corr;setAdc([...corr]);
              n++;setReads(n);
              if(n%10===0){const snap={t:new Date().toLocaleTimeString("en-GB"),...calcSoil(corr)};snapRef.current=[...snapRef.current.slice(-29),snap];setSnaps([...snapRef.current]);}
              setCsv(p=>{const r=[new Date().toISOString(),...corr];const nx=[...p,r];return nx.length>10000?nx.slice(-10000):nx;});
            }
          }else if(line.includes(","))setErrors(e=>e+1);
        }
      }
    }catch(e){if(e.name!=="NotFoundError")log("Error: "+e.message,"err");else log("Cancelled","warn");setConn(false);}
  }
  async function disconnect(){setConn(false);log("Disconnected","warn");try{if(rdrRef.current){await rdrRef.current.cancel();rdrRef.current=null;}if(portRef.current){await portRef.current.close();portRef.current=null;}}catch{}}
  function togglePause(){pauseRef.current=!pauseRef.current;setPaused(pauseRef.current);log(pauseRef.current?"Paused":"Resumed","warn");}
  function capDark(){if(!conn||reads===0){log("No data","err");return;}setDark([...adcRef.current]);log("Dark ref captured","ok");}
  function capWhite(){if(!conn||reads===0){log("No data","err");return;}setWhite([...adcRef.current]);log("White ref captured","ok");}
  function doExport(){if(!csvBuf.length){log("No data","warn");return;}const hdr=["timestamp",...CH.map(c=>c.nm+"nm")].join(",");const blob=new Blob([hdr+"\n"+csvBuf.map(r=>r.join(",")).join("\n")],{type:"text/csv"});const a=Object.assign(document.createElement("a"),{href:URL.createObjectURL(blob),download:"soilspec_"+new Date().toISOString().slice(0,19).replace(/:/g,"-")+".csv"});a.click();log("Exported "+csvBuf.length+" rows","ok");}

  const soil=calcSoil(adc);
  const sc=!soil?"#1e3a5f":soil.score>=70?"#22c55e":soil.score>=45?"#f59e0b":"#ef4444";

  const specBar={labels:NM,datasets:[{data:adc,backgroundColor:CH.map(c=>rgba(c.col,.78)),borderColor:CH.map(c=>c.col),borderWidth:1.5,borderRadius:3}]};
  const specOpts={responsive:true,maintainAspectRatio:false,animation:{duration:0},plugins:{legend:{display:false},tooltip:{callbacks:{title:ctx=>CH[ctx[0].dataIndex].nm+" nm — "+CH[ctx[0].dataIndex].role,label:ctx=>"  ADC: "+ctx.parsed.y}}},scales:{x:{ticks:{color:"#3d5c7a",font:{size:10,family:"monospace"}},grid:{color:"#0d1625"},border:{display:false}},y:{min:0,max:4095,ticks:{color:"#3d5c7a",font:{size:10},maxTicksLimit:5},grid:{color:"#111e33"},border:{display:false}}}};
  const trendLine={labels:hist[selCh].map((_,i)=>i),datasets:[{data:hist[selCh],borderColor:CH[selCh].col,backgroundColor:rgba(CH[selCh].col,.10),borderWidth:2,pointRadius:0,tension:.4,fill:true}]};
  const trendOpts={responsive:true,maintainAspectRatio:false,animation:{duration:0},plugins:{legend:{display:false},tooltip:{enabled:false}},scales:{x:{display:false},y:{min:0,max:4095,ticks:{color:"#3d5c7a",font:{size:9},maxTicksLimit:4},grid:{color:"#111e33"},border:{display:false}}}};
  const moistChart={labels:snapshots.map(s=>s.t),datasets:[{label:"Moisture %",data:snapshots.map(s=>s.moisture??null),borderColor:"#38bdf8",backgroundColor:rgba("#38bdf8",.08),borderWidth:2,pointRadius:2,pointBackgroundColor:"#38bdf8",tension:.4,fill:true,spanGaps:true},{label:"Score",data:snapshots.map(s=>s.score??null),borderColor:"#22c55e",backgroundColor:rgba("#22c55e",.05),borderWidth:1.5,pointRadius:0,tension:.4,fill:false,spanGaps:true,yAxisID:"y2"}]};
  const moistOpts={responsive:true,maintainAspectRatio:false,animation:{duration:0},plugins:{legend:{display:false}},scales:{x:{ticks:{color:"#3d5c7a",font:{size:9},maxTicksLimit:8},grid:{color:"#111e33"},border:{display:false}},y:{min:0,max:100,ticks:{color:"#38bdf8",font:{size:9},maxTicksLimit:5},grid:{color:"#111e33"},border:{display:false}},y2:{position:"right",min:0,max:100,ticks:{color:"#22c55e",font:{size:9},maxTicksLimit:5},grid:{display:false},border:{display:false}}}};
  const logCol={ok:"#22c55e",warn:"#f59e0b",err:"#ef4444",info:"#3b82f6",alert:"#ef4444"};

  const V={
    page:{display:"flex",flexDirection:"column",height:"100vh",background:"#080c18",color:"#d4e2f4",fontFamily:"'Inter','Segoe UI',system-ui,sans-serif",fontSize:13,overflow:"hidden"},
    top:{display:"flex",alignItems:"center",gap:10,padding:"0 14px",height:48,background:"#0c1322",borderBottom:"1px solid #14213a",flexShrink:0},
    logo:{fontSize:15,fontWeight:800,color:"#d4e2f4",letterSpacing:.5},logoG:{color:"#22c55e"},
    tabs:{display:"flex",gap:1,marginLeft:8},
    tab:(on)=>({padding:"4px 14px",borderRadius:6,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,background:on?"#142236":"transparent",color:on?"#d4e2f4":"#3d5c7a",borderBottom:on?"2px solid #22c55e":"2px solid transparent",transition:"all .12s"}),
    chip:(on)=>({display:"flex",alignItems:"center",gap:6,padding:"3px 10px",borderRadius:20,background:on?"#052e16":"#0c1322",border:`1px solid ${on?"#16a34a":"#14213a"}`,color:on?"#22c55e":"#3d5c7a",fontSize:11,fontWeight:700}),
    dot:(on)=>({width:7,height:7,borderRadius:"50%",background:on?"#22c55e":"#1e3a5f",animation:on?"blink 1.4s infinite":"none",flexShrink:0}),
    tr:{marginLeft:"auto",display:"flex",gap:6,alignItems:"center"},
    btn:(col,bg,bc)=>({padding:"4px 12px",borderRadius:7,border:`1px solid ${bc}`,background:bg,color:col,cursor:"pointer",fontSize:11,fontWeight:700,transition:"all .12s"}),
    raw:{height:19,background:"#060a13",borderBottom:"1px solid #0f1a2d",display:"flex",alignItems:"center",padding:"0 14px",gap:8,fontSize:9,fontFamily:"monospace",flexShrink:0},
    body:{display:"flex",flex:1,overflow:"hidden"},
    side:{width:270,flexShrink:0,background:"#0c1322",borderRight:"1px solid #14213a",display:"flex",flexDirection:"column",overflowY:"auto"},
    ss:(ex)=>({padding:"10px 12px",borderBottom:"1px solid #0f1a2d",...ex}),
    sst:{fontSize:9,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",color:"#2d4060",marginBottom:8},
    mg:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7},
    mc:(col)=>({background:"#080e1c",border:"1px solid #14213a",borderRadius:9,padding:"9px 11px",borderTop:`2px solid ${col}`}),
    ml:{fontSize:9,color:"#3d5c7a",marginBottom:3,fontWeight:600},
    mv:(col)=>({fontSize:24,fontWeight:800,color:col,lineHeight:1,fontFamily:"monospace"}),
    mu:{fontSize:9,color:"#1e3a5f",marginTop:1},
    mb:{height:2,background:"#14213a",borderRadius:2,marginTop:6,overflow:"hidden"},
    mf:(col,p)=>({height:"100%",borderRadius:2,background:col,width:p+"%",transition:"width .5s"}),
    ms:(col)=>({fontSize:9,fontWeight:700,color:col,marginTop:3}),
    sr:{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",borderBottom:"1px solid #0f1a2d",flexShrink:0},
    pb:(ready)=>({margin:"0 12px 10px",padding:"9px 11px",borderRadius:9,background:ready?"#052e16":"#1a0505",border:`1px solid ${ready?"#16a34a":"#7f1d1d"}`,display:"flex",alignItems:"center",gap:10,flexShrink:0}),
    nr:{display:"flex",alignItems:"center",gap:7,marginBottom:7},
    nel:(col)=>({fontSize:13,fontWeight:800,color:col,width:14,textAlign:"center",flexShrink:0}),
    ntr:{flex:1,height:7,background:"#14213a",borderRadius:4,overflow:"hidden"},
    nf:(col,p)=>({height:"100%",borderRadius:4,background:col,width:p+"%",transition:"width .5s"}),
    nppm:(col)=>({fontSize:10,fontWeight:700,color:col,fontFamily:"monospace",width:54,textAlign:"right"}),
    nlvl:(col)=>({fontSize:8,fontWeight:700,color:col,width:24,textAlign:"right"}),
    sg:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginTop:8},
    sc2:{background:"#080e1c",borderRadius:7,padding:"6px 9px",border:"1px solid #14213a"},
    scl:{fontSize:8,color:"#2d4060",marginBottom:1},
    scv:(col)=>({fontSize:13,fontWeight:700,color:col,fontFamily:"monospace"}),
    ri:(t)=>({display:"flex",alignItems:"flex-start",gap:7,padding:"6px 8px",borderRadius:7,marginBottom:4,background:t==="ok"?"#052e16":t==="alert"?"#1a0505":"#100a00",border:`1px solid ${t==="ok"?"#14532d":t==="alert"?"#7f1d1d":"#3d1f00"}`}),
    cr:{display:"flex",gap:5},
    cb:(set)=>({flex:1,padding:"5px",borderRadius:7,cursor:"pointer",fontSize:10,fontWeight:700,border:`1px solid ${set?"#16a34a":"#14213a"}`,background:set?"#052e16":"transparent",color:set?"#22c55e":"#3d5c7a"}),
    main:{flex:1,overflowY:"auto",background:"#080c18",display:"flex",flexDirection:"column",gap:12,padding:12},
    card:{background:"#0c1322",border:"1px solid #14213a",borderRadius:11,padding:14},
    ch:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10},
    ct:{fontSize:12,fontWeight:700,color:"#d4e2f4"},cs:{fontSize:10,color:"#2d4060"},
    bh:{display:"flex",alignItems:"center",gap:10,marginBottom:7,marginTop:2},
    bt:{fontSize:10,fontWeight:700,color:"#4a6080",flexShrink:0},
    bs:{fontSize:9,color:"#1e3a5f",flexShrink:0},
    bl:{flex:1,height:1,background:"#14213a"},
    g6:{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:8},
    tile:(sel,col)=>({minWidth:54,flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,borderRight:"1px solid #14213a",padding:"4px 2px",cursor:"pointer",transition:"background .1s",background:sel?"#142236":"transparent",borderTop:sel?`2px solid ${col}`:"2px solid transparent"}),
  };

  const METRICS=[
    {label:"Moisture",val:soil?.moisture,unit:"% VWC",col:"#38bdf8",max:100,status:!soil?"—":soil.moisture<25?"Dry":soil.moisture<65?"Optimal":"Wet",sc:!soil?"#2d4060":soil.moisture<25?"#ef4444":soil.moisture<65?"#22c55e":"#f59e0b"},
    {label:"Org. Matter",val:soil?.om,unit:"% SOM",col:"#4ade80",max:15,status:!soil?"—":parseFloat(soil?.om)<2?"Low":parseFloat(soil?.om)<5?"Moderate":"High",sc:!soil?"#2d4060":parseFloat(soil?.om)<2?"#ef4444":parseFloat(soil?.om)<5?"#f59e0b":"#22c55e"},
    {label:"Conductivity",val:soil?.ec,unit:"mS/cm",col:"#22d3ee",max:6,status:!soil?"—":parseFloat(soil?.ec)<0.8?"Low":parseFloat(soil?.ec)<3?"Normal":"High",sc:!soil?"#2d4060":parseFloat(soil?.ec)<0.8?"#f59e0b":parseFloat(soil?.ec)<3?"#22c55e":"#ef4444"},
    {label:"NIR Index",val:soil?.ndmi,unit:"NDMI",col:"#a78bfa",max:1,status:!soil?"—":parseFloat(soil?.ndmi)>0.1?"High":parseFloat(soil?.ndmi)<-0.2?"Low":"Neutral",sc:!soil?"#2d4060":parseFloat(soil?.ndmi)>0.1?"#22c55e":parseFloat(soil?.ndmi)<-0.2?"#ef4444":"#f59e0b"},
  ];
  const NPK=[{el:"N",val:soil?.N,max:350,col:"#4ade80"},{el:"P",val:soil?.P,max:160,col:"#fb923c"},{el:"K",val:soil?.K,max:280,col:"#c084fc"}];

  return(
    <div style={V.page}>
      <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-track{background:#080c18}::-webkit-scrollbar-thumb{background:#1e3a5f;border-radius:2px}button:hover{filter:brightness(1.12)}`}</style>

      <div style={V.top}>
        <span style={V.logo}>Soil<span style={V.logoG}>Spec</span></span>
        <span style={{fontSize:10,color:"#1e3a5f"}}>AS7265x · ATSAMD21G17D</span>
        <div style={V.tabs}>
          {[["dashboard","Dashboard"],["channels","18 Channels"],["classify","Classify 🔬"],["analysis","Analysis"],["log","Log"]].map(([k,l])=>(
            <button key={k} style={{...V.tab(tab===k),...(k==="classify"?{color:tab===k?"#d4e2f4":"#22d3ee",borderBottom:tab===k?"2px solid #22d3ee":"2px solid transparent"}:{})}} onClick={()=>setTab(k)}>{l}</button>
          ))}
        </div>
        <div style={V.chip(conn)}><span style={V.dot(conn)}/>{conn?"LIVE":"OFFLINE"}</div>
        <div style={V.tr}>
          <span style={{fontSize:10,color:"#2d4060"}}>reads <b style={{color:"#3d5c7a"}}>{reads}</b></span>
          <button style={V.btn(conn?"#ef4444":"#22c55e",conn?"#1a0505":"#052e16",conn?"#7f1d1d":"#16a34a")} onClick={connect}>{conn?"Disconnect":"Connect"}</button>
          {conn&&<button style={V.btn(paused?"#f59e0b":"#4a6080","transparent",paused?"#d97706":"#14213a")} onClick={togglePause}>{paused?"Resume":"Pause"}</button>}
          <button style={V.btn("#3b82f6","transparent","#1a3a5a")} onClick={doExport}>Export CSV</button>
        </div>
      </div>

      <div style={V.raw}>
        <span style={{color:"#14213a"}}>RAW ›</span>
        <span style={{color:"#0d9488",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{rawLine}</span>
        <span style={{color:"#14213a"}}>err <span style={{color:"#d97706"}}>{errors}</span></span>
      </div>

      <div style={V.body}>
        {/* SIDEBAR */}
        <div style={V.side}>
          <div style={V.ss({})}>
            <div style={V.sst}>Soil Metrics</div>
            <div style={V.mg}>
              {METRICS.map(({label,val,unit,col,max,status,sc:stc})=>(
                <div key={label} style={V.mc(col)}>
                  <div style={V.ml}>{label}</div>
                  <div style={V.mv(col)}>{val??<span style={{color:"#1e3a5f"}}>—</span>}</div>
                  <div style={V.mu}>{unit}</div>
                  <div style={V.mb}><div style={V.mf(col,val!=null?Math.min(100,Math.abs(parseFloat(val))/max*100):0)}/></div>
                  <div style={V.ms(stc)}>{status}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={V.sr}>
            <ScoreArc score={soil?.score}/>
            <div style={{flex:1}}>
              <div style={{fontSize:9,color:"#2d4060",marginBottom:2,fontWeight:600,letterSpacing:.8,textTransform:"uppercase"}}>Health Score</div>
              <div style={{fontSize:30,fontWeight:800,color:sc,fontFamily:"monospace",lineHeight:1}}>{soil?.score??<span style={{color:"#1e3a5f"}}>—</span>}</div>
            </div>
          </div>
          <div style={V.pb(soil?.ploughReady)}>
            <span style={{fontSize:20}}>{!soil?"⏳":soil.ploughReady?"🚜":"⛔"}</span>
            <div>
              <div style={{fontSize:11,fontWeight:800,color:!soil?"#3d5c7a":soil.ploughReady?"#22c55e":"#ef4444",marginBottom:1}}>{!soil?"Awaiting data":soil.ploughReady?"Ready to Plough":"Not Ready to Plough"}</div>
              <div style={{fontSize:10,color:"#4a6080"}}>{!soil?"Connect sensor":soil.ploughReady?"Moisture & EC in tillage range":"Check moisture / EC / OM"}</div>
            </div>
          </div>
          {soil&&(<div style={V.ss({})}>
            <div style={V.sst}>Soil Intelligence</div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <span style={{fontSize:15,fontWeight:800,color:"#22d3ee"}}>{soil.soilType}</span>
              <span style={{fontSize:10,color:"#3d5c7a",fontFamily:"monospace"}}>{soil.soilConf}% conf</span>
            </div>
            <div style={V.sg}>
              {[{l:"Compaction",v:soil.compaction+"/100",col:soil.compaction>60?"#ef4444":soil.compaction>35?"#f59e0b":"#22c55e"},{l:"Salinity",v:soil.salinityRisk,col:soil.salinityCol},{l:"Red-Edge",v:Math.round(soil.nirAvg/40.95)+"%",col:"#f43f5e"},{l:"NIR/VIS",v:(soil.nirAvg/(soil.visAvg||1)).toFixed(2),col:"#a78bfa"}].map(({l,v,col})=>(
                <div key={l} style={V.sc2}><div style={V.scl}>{l}</div><div style={V.scv(col)}>{v}</div></div>
              ))}
            </div>
          </div>)}
          <div style={V.ss({})}>
            <div style={V.sst}>NPK Estimate</div>
            {NPK.map(({el,val,max,col})=>{const pct=val!=null?Math.min(100,val/max*100):0;const lvl=val==null?"—":val<max*.25?"LOW":val<max*.6?"MED":"HIGH";const lc=lvl==="LOW"?"#ef4444":lvl==="HIGH"?"#22c55e":"#f59e0b";return(<div key={el} style={V.nr}><span style={V.nel(col)}>{el}</span><div style={V.ntr}><div style={V.nf(col,pct)}/></div><span style={V.nppm(col)}>{val!=null?val+" ppm":"—"}</span><span style={V.nlvl(lc)}>{lvl}</span></div>);})}
            <div style={{fontSize:8,color:"#1e3a5f",marginTop:2}}>* Spectral proxy — verify with lab analysis</div>
          </div>
          {soil&&soil.recs.length>0&&(<div style={V.ss({})}>
            <div style={V.sst}>Recommendations</div>
            {soil.recs.map((r,i)=>(<div key={i} style={V.ri(r.type)}><span style={{fontSize:13,flexShrink:0}}>{r.icon}</span><span style={{fontSize:10,color:"#94a3b8",lineHeight:1.5}}>{r.text}</span></div>))}
          </div>)}
          <div style={V.ss({})}>
            <div style={V.sst}>Calibration</div>
            <div style={V.cr}>
              <button style={V.cb(!!darkRef)} onClick={capDark}>{darkRef?"✓ Dark":"Dark Ref"}</button>
              <button style={V.cb(!!whiteRef)} onClick={capWhite}>{whiteRef?"✓ White":"White Ref"}</button>
            </div>
            <div style={{display:"flex",gap:10,marginTop:5,fontSize:9,color:"#2d4060"}}>
              <span>Dark: <span style={{color:darkRef?"#22c55e":"#1e3a5f"}}>{darkRef?"set":"unset"}</span></span>
              <span>White: <span style={{color:whiteRef?"#22c55e":"#1e3a5f"}}>{whiteRef?"set":"unset"}</span></span>
            </div>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"6px 10px 10px"}}>
            {logs.length===0&&<div style={{color:"#14213a",fontSize:10,padding:"6px 0"}}>Connect to begin…</div>}
            {logs.map((e,i)=>(<div key={i} style={{display:"flex",gap:7,fontSize:9,fontFamily:"monospace",padding:"1px 0"}}><span style={{color:"#14213a",flexShrink:0}}>{e.ts}</span><span style={{color:logCol[e.t]}}>{e.msg}</span></div>))}
          </div>
        </div>

        {/* MAIN — classify tab fills full width; others use standard layout */}
        {tab==="classify"
          ? <ClassifyTab adc={adc} reads={reads}/>
          : <div style={V.main}>

          {tab==="dashboard"&&<>
            <div style={{...V.card,display:"flex",flexDirection:"column",gap:0,padding:0,overflow:"hidden",flex:"0 0 auto",height:240}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 14px",borderBottom:"1px solid #0f1a2d"}}>
                <span style={V.ct}>Spectral Waterfall — live scan history</span>
                <span style={{...V.cs,fontFamily:"monospace"}}>{wfRows.length} scans · 18 channels · 410–940 nm</span>
              </div>
              <div style={{flex:1,position:"relative"}}><WaterfallCanvas rows={wfRows} selCh={selCh} onChClick={setSelCh}/></div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1.4fr 1fr",gap:12}}>
              <div style={V.card}>
                <div style={V.ch}>
                  <span style={V.ct}>Full Spectrum — 18 channels</span>
                  <div style={{display:"flex",gap:12}}>{[["VIS","#fb923c"],["R-Edge","#f43f5e"],["NIR","#a78bfa"]].map(([l,c])=>(<span key={l} style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:"#3d5c7a"}}><span style={{width:10,height:7,borderRadius:2,background:c}}/>{l}</span>))}</div>
                </div>
                <div style={{position:"relative",height:150}}><Bar data={specBar} options={specOpts} role="img" aria-label="18 channel ADC bar chart"/></div>
              </div>
              <div style={V.card}>
                <div style={V.ch}>
                  <div style={{display:"flex",flexDirection:"column",gap:3}}>
                    <span style={V.ct}>Channel Trend</span>
                    <span style={{fontSize:10,color:"#2d4060"}}>{CH[selCh].role}</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:10,padding:"2px 8px",borderRadius:5,fontWeight:700,background:rgba(CH[selCh].col,.15),color:CH[selCh].col}}>{CH[selCh].nm} nm · {CH[selCh].r}</span>
                    <span style={{fontSize:22,fontWeight:800,color:CH[selCh].col,fontFamily:"monospace"}}>{adc[selCh]}</span>
                  </div>
                </div>
                <div style={{position:"relative",height:110}}><Line data={trendLine} options={trendOpts} role="img" aria-label="Channel trend"/></div>
                <div style={{display:"flex",flexWrap:"wrap",gap:2,marginTop:8}}>
                  {CH.map((ch,i)=>(<button key={i} onClick={()=>setSelCh(i)} style={{padding:"2px 6px",borderRadius:3,border:"none",cursor:"pointer",fontSize:9,fontWeight:700,background:selCh===i?rgba(ch.col,.25):"transparent",color:selCh===i?ch.col:"#2d4060",outline:selCh===i?`1px solid ${rgba(ch.col,.35)}`:"none"}}>{ch.nm}</button>))}
                </div>
              </div>
            </div>
            <div style={{...V.card,padding:"8px 4px"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 10px",marginBottom:6}}>
                <span style={V.ct}>Selected Channel Readout</span>
                <span style={V.cs}>click any tile to select</span>
              </div>
              <div style={{display:"flex",overflowX:"auto"}}>
                {CH.map((ch,i)=>(<div key={i} onClick={()=>setSelCh(i)} style={V.tile(selCh===i,ch.col)}><span style={{fontSize:8,color:"#3d5c7a"}}>{ch.nm}nm</span><span style={{width:20,height:4,borderRadius:1,background:ch.col,flexShrink:0}}/><span style={{fontSize:11,fontWeight:700,color:ch.col,fontFamily:"monospace"}}>{adc[i]}</span><span style={{fontSize:7,color:"#2d4060",letterSpacing:.3,textTransform:"uppercase"}}>{ch.r}</span></div>))}
              </div>
            </div>
          </>}

          {tab==="channels"&&(
            <div style={V.card}>
              <div style={V.ch}><span style={V.ct}>All 18 Channels — 3 rows × 6</span><span style={V.cs}>click any card → Dashboard trend</span></div>
              {[{lbl:"Row 1 — Violet to Green",sub:"410 · 435 · 460 · 485 · 510 · 535 nm",ids:[0,1,2,3,4,5]},{lbl:"Row 2 — Yellow to Red-Edge",sub:"560 · 585 · 610 · 645 · 680 · 705 nm",ids:[6,7,8,9,10,11]},{lbl:"Row 3 — Near-Infrared",sub:"730 · 760 · 810 · 860 · 900 · 940 nm",ids:[12,13,14,15,16,17]}].map(({lbl,sub,ids})=>(
                <div key={lbl}>
                  <div style={V.bh}><span style={V.bt}>{lbl}</span><span style={V.bs}>{sub}</span><div style={V.bl}/></div>
                  <div style={{...V.g6,marginBottom:14}}>{ids.map(i=><ChCard key={i} ch={CH[i]} val={adc[i]} hist={hist[i]} selected={selCh===i} onClick={()=>{setSelCh(i);setTab("dashboard");}}/>)}</div>
                </div>
              ))}
            </div>
          )}

          {tab==="analysis"&&<>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
              <div style={{...V.card,borderTop:"2px solid #22d3ee"}}><div style={{fontSize:10,color:"#3d5c7a",fontWeight:700,marginBottom:6,textTransform:"uppercase",letterSpacing:.8}}>Soil Classification</div><div style={{fontSize:22,fontWeight:800,color:"#22d3ee",marginBottom:4}}>{soil?.soilType??"—"}</div><div style={{fontSize:11,color:"#3d5c7a",marginBottom:10}}>Confidence: <b style={{color:"#22d3ee",fontFamily:"monospace"}}>{soil?.soilConf??0}%</b></div><div style={{fontSize:10,color:"#2d4060",lineHeight:1.7}}>Derived from NIR/VIS ratio, organic matter index, and moisture profile across all 18 spectral channels.</div></div>
              <div style={{...V.card,borderTop:"2px solid #ef4444"}}><div style={{fontSize:10,color:"#3d5c7a",fontWeight:700,marginBottom:6,textTransform:"uppercase",letterSpacing:.8}}>Compaction Index</div><div style={{fontSize:32,fontWeight:800,fontFamily:"monospace",lineHeight:1,color:soil&&soil.compaction>60?"#ef4444":soil&&soil.compaction>35?"#f59e0b":"#22c55e",marginBottom:8}}>{soil?.compaction??<span style={{color:"#1e3a5f"}}>—</span>}<span style={{fontSize:13,fontWeight:400,color:"#2d4060"}}>/100</span></div><div style={{height:8,background:"#14213a",borderRadius:4,overflow:"hidden",marginBottom:8}}><div style={{height:"100%",borderRadius:4,background:soil&&soil.compaction>60?"#ef4444":soil&&soil.compaction>35?"#f59e0b":"#22c55e",width:(soil?.compaction??0)+"%",transition:"width .5s"}}/></div><div style={{fontSize:11,color:"#4a6080"}}>{!soil?"—":soil.compaction>60?"Deep tillage recommended":soil.compaction>35?"Moderate — standard tillage":"Soil structure good"}</div></div>
              <div style={{...V.card,borderTop:`2px solid ${soil?.salinityCol??"#22c55e"}`}}><div style={{fontSize:10,color:"#3d5c7a",fontWeight:700,marginBottom:6,textTransform:"uppercase",letterSpacing:.8}}>Salinity Risk</div><div style={{fontSize:28,fontWeight:800,fontFamily:"monospace",color:soil?.salinityCol??"#1e3a5f",lineHeight:1,marginBottom:6}}>{soil?.salinityRisk??"—"}</div><div style={{fontSize:13,color:"#3d5c7a",marginBottom:6}}>EC: <b style={{color:soil?.salinityCol??"#1e3a5f",fontFamily:"monospace"}}>{soil?.ec??0} mS/cm</b></div><div style={{fontSize:10,color:"#2d4060",lineHeight:1.7}}>{!soil?"—":parseFloat(soil.ec)<0.8?"Low EC — nutrient amendment may help":parseFloat(soil.ec)<3?"EC in optimal range for most crops":"High EC — leach field before sowing"}</div></div>
            </div>
            <div style={V.card}>
              <div style={V.ch}><span style={V.ct}>Moisture % & Health Score — field trend</span><div style={{display:"flex",gap:14}}>{[["Moisture %","#38bdf8"],["Health Score","#22c55e"]].map(([l,c])=>(<span key={l} style={{display:"flex",alignItems:"center",gap:5,fontSize:10,color:"#3d5c7a"}}><span style={{width:12,height:3,borderRadius:1,background:c}}/>{l}</span>))}</div></div>
              <div style={{position:"relative",height:130}}>{snapshots.length>1?<Line data={moistChart} options={moistOpts} role="img" aria-label="Moisture trend"/>:<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:"#1e3a5f",fontSize:11}}>Collecting data — need 2+ snapshots</div>}</div>
            </div>
            <div style={V.card}>
              <div style={{...V.ch,marginBottom:16}}><span style={V.ct}>Detailed Parameter Gauges</span><span style={V.cs}>markers show optimal range</span></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 28px"}}>
                <GaugeBar label="Soil Moisture" value={soil?.moisture} max={100} color="#38bdf8" unit="%" lo={20} hi={65} status={!soil?"—":soil.moisture<25?"DRY":soil.moisture<65?"OPTIMAL":"WET"} statusColor={!soil?"#2d4060":soil.moisture<25?"#ef4444":soil.moisture<65?"#22c55e":"#f59e0b"}/>
                <GaugeBar label="Organic Matter" value={soil?.om} max={15} color="#4ade80" unit="% SOM" lo={2} hi={8} status={!soil?"—":parseFloat(soil?.om)<2?"DEFICIENT":parseFloat(soil?.om)<5?"MODERATE":"RICH"} statusColor={!soil?"#2d4060":parseFloat(soil?.om)<2?"#ef4444":parseFloat(soil?.om)<5?"#f59e0b":"#22c55e"}/>
                <GaugeBar label="Electrical Conductivity" value={soil?.ec} max={6} color="#22d3ee" unit="mS/cm" lo={0.5} hi={3} status={!soil?"—":parseFloat(soil?.ec)<0.8?"LOW":parseFloat(soil?.ec)<3?"NORMAL":"HIGH"} statusColor={!soil?"#2d4060":parseFloat(soil?.ec)<0.8?"#f59e0b":parseFloat(soil?.ec)<3?"#22c55e":"#ef4444"}/>
                <GaugeBar label="Nitrogen (N)" value={soil?.N} max={350} color="#4ade80" unit="ppm" lo={80} hi={220} status={!soil?"—":soil?.N<80?"LOW":soil?.N<220?"ADEQUATE":"HIGH"} statusColor={!soil?"#2d4060":soil?.N<80?"#ef4444":soil?.N<220?"#22c55e":"#f59e0b"}/>
                <GaugeBar label="Phosphorus (P)" value={soil?.P} max={160} color="#fb923c" unit="ppm" lo={30} hi={90} status={!soil?"—":soil?.P<30?"LOW":soil?.P<90?"ADEQUATE":"HIGH"} statusColor={!soil?"#2d4060":soil?.P<30?"#ef4444":soil?.P<90?"#22c55e":"#f59e0b"}/>
                <GaugeBar label="Potassium (K)" value={soil?.K} max={280} color="#c084fc" unit="ppm" lo={60} hi={160} status={!soil?"—":soil?.K<60?"LOW":soil?.K<160?"ADEQUATE":"HIGH"} statusColor={!soil?"#2d4060":soil?.K<60?"#ef4444":soil?.K<160?"#22c55e":"#f59e0b"}/>
              </div>
            </div>
            <div style={V.card}>
              <div style={{...V.ch,marginBottom:10}}><span style={V.ct}>Channel significance table</span><span style={V.cs}>click row → Dashboard trend</span></div>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr style={{borderBottom:"1px solid #14213a"}}>{["Channel","Region","ADC","% FS","Level","Soil Role"].map(h=>(<th key={h} style={{textAlign:"left",padding:"5px 8px",fontSize:9,color:"#2d4060",fontWeight:700,textTransform:"uppercase",letterSpacing:.8}}>{h}</th>))}</tr></thead>
                <tbody>{CH.map((ch,i)=>{const v=adc[i],pct=Math.round(v/4095*100);return(<tr key={i} style={{borderBottom:"1px solid #0c1322",cursor:"pointer",background:selCh===i?"#111e33":"transparent"}} onClick={()=>{setSelCh(i);setTab("dashboard");}}><td style={{padding:"6px 8px",fontWeight:800,color:ch.col,fontFamily:"monospace",fontSize:12}}>{ch.nm}<span style={{fontSize:9,fontWeight:400,color:"#2d4060"}}> nm</span></td><td style={{padding:"6px 8px",fontSize:10,color:"#4a6080"}}>{ch.r}</td><td style={{padding:"6px 8px",fontFamily:"monospace",fontWeight:700,color:"#d4e2f4",fontSize:12}}>{v}</td><td style={{padding:"6px 8px",width:120}}><div style={{display:"flex",alignItems:"center",gap:6}}><div style={{flex:1,height:5,background:"#14213a",borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",borderRadius:2,background:ch.col,width:pct+"%",transition:"width .3s"}}/></div><span style={{fontSize:9,color:ch.col,fontFamily:"monospace",width:24,textAlign:"right"}}>{pct}%</span></div></td><td style={{padding:"6px 8px"}}><span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:3,background:rgba(ch.col,.12),color:ch.col}}>{pct>75?"HIGH":pct>35?"MED":"LOW"}</span></td><td style={{padding:"6px 8px",fontSize:10,color:"#4a6080"}}>{ch.role}</td></tr>);})}</tbody>
              </table>
            </div>
          </>}

          {tab==="log"&&(
            <div style={V.card}>
              <div style={{...V.ch,marginBottom:8}}><span style={V.ct}>Event Log</span><button onClick={()=>setLogs([])} style={{fontSize:10,color:"#3d5c7a",background:"none",border:"none",cursor:"pointer"}}>Clear</button></div>
              <div style={{fontFamily:"monospace",fontSize:10,lineHeight:1.9,maxHeight:"70vh",overflowY:"auto"}}>
                {logs.length===0&&<div style={{color:"#14213a",padding:"20px 0",textAlign:"center"}}>No events — connect to start logging</div>}
                {logs.map((e,i)=>(<div key={i} style={{display:"flex",gap:12,padding:"2px 6px",borderRadius:4,background:i%2===0?"transparent":"#080e1c"}}><span style={{color:"#1e3a5f",flexShrink:0,width:68}}>{e.ts}</span><span style={{color:logCol[e.t]}}>{e.msg}</span></div>))}
              </div>
            </div>
          )}

        </div>}
      </div>
    </div>
  );
}
