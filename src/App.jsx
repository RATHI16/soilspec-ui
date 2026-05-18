```jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";

const WL = [
  410,435,460,485,510,535,560,585,
  610,645,680,705,730,760,810,860,900,940
];

const REFS = {

  air: [
    1234,941,2005,953,1200,1356,1392,1495,
    860,263,181,74,1222,369,131,98,238,808
  ],

  nitrogen: [
    410,270,635,380,572,773,1105,1314,
    880,301,245,69,1239,423,161,119,296,1295
  ],

  phosphorus: [
    410,261,615,338,513,649,666,776,
    565,182,183,60,752,267,112,83,191,816
  ],

  potassium: [
    166,96,218,106,132,159,188,197,
    150,52,64,44,162,91,32,29,41,171
  ],

  NPK: [
    1376,703,1386,552,434,336,506,1021,
    1680,366,288,80,1782,442,169,118,267,992
  ]
};

const REF_META = {

  air: {
    label: "Air",
    emoji: "🌬",
    col: "#94a3b8",
    desc: "Ambient baseline"
  },

  nitrogen: {
    label: "Nitrogen",
    emoji: "🟢",
    col: "#22c55e",
    desc: "Nitrogen fertilizer"
  },

  phosphorus: {
    label: "Phosphorus",
    emoji: "🟠",
    col: "#f97316",
    desc: "Phosphorus fertilizer"
  },

  potassium: {
    label: "Potassium",
    emoji: "🟣",
    col: "#a855f7",
    desc: "Potassium fertilizer"
  },

  NPK: {
    label: "Mixed NPK",
    emoji: "🌿",
    col: "#eab308",
    desc: "Combined fertilizer"
  }
};

function cosineSimilarity(a, b) {

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  return dot / (Math.sqrt(magA) * Math.sqrt(magB) + 1e-9);
}

function classifyADC(v) {

  const scores = {
    air: cosineSimilarity(v, REFS.air) * 100,
    nitrogen: cosineSimilarity(v, REFS.nitrogen) * 100,
    phosphorus: cosineSimilarity(v, REFS.phosphorus) * 100,
    potassium: cosineSimilarity(v, REFS.potassium) * 100,
    NPK: cosineSimilarity(v, REFS.NPK) * 100,
  };

  let best = "air";
  let max = 0;

  for (const k in scores) {
    if (scores[k] > max) {
      max = scores[k];
      best = k;
    }
  }

  return {
    best,
    confidence: Math.round(max),
    scores
  };
}

function calcSoil(v) {

  if (!v || v.length !== 18) return null;

  const cls = classifyADC(v);

  const intensity = v.reduce((a,b)=>a+b,0)/18;

  let N=5,P=3,K=4;

  switch(cls.best){

    case "nitrogen":
      N=Math.round(220+intensity*0.08);
      P=Math.round(25+intensity*0.01);
      K=Math.round(20+intensity*0.01);
      break;

    case "phosphorus":
      N=Math.round(20+intensity*0.01);
      P=Math.round(200+intensity*0.06);
      K=Math.round(25+intensity*0.01);
      break;

    case "potassium":
      N=Math.round(20+intensity*0.01);
      P=Math.round(25+intensity*0.01);
      K=Math.round(240+intensity*0.08);
      break;

    case "NPK":
      N=Math.round(160+intensity*0.05);
      P=Math.round(150+intensity*0.05);
      K=Math.round(180+intensity*0.05);
      break;
  }

  const nir=(v[12]+v[13]+v[14]+v[15]+v[16]+v[17])/6;
  const vis=(v[0]+v[1]+v[2]+v[3]+v[4]+v[5]+v[6]+v[7]+v[8]+v[9]+v[10]+v[11])/12;

  const moisture=Math.round((1-(nir/4095))*100);

  return {
    N,
    P,
    K,
    moisture,
    detected: cls.best,
    confidence: cls.confidence,
    scores: cls.scores,
    nir: Math.round(nir),
    vis: Math.round(vis)
  };
}

export default function App(){

  const [data,setData]=useState(Array(18).fill(0));
  const [connected,setConnected]=useState(false);

  const readerRef=useRef(null);

  async function connectSerial(){

    try{

      const port=await navigator.serial.requestPort();

      await port.open({ baudRate:115200 });

      setConnected(true);

      const decoder=new TextDecoderStream();

      port.readable.pipeTo(decoder.writable);

      const reader=decoder.readable.getReader();

      readerRef.current=reader;

      let buffer="";

      while(true){

        const { value, done } = await reader.read();

        if(done) break;

        buffer += value;

        const lines=buffer.split("\n");

        buffer=lines.pop();

        for(const line of lines){

          if(line.includes("RAW:")){

            const clean=line.split("RAW:")[1]?.trim();

            if(!clean) continue;

            const vals=clean
              .split(",")
              .map(x=>parseInt(x.trim()));

            if(vals.length===18 && vals.every(x=>!isNaN(x))){
              setData(vals);
            }
          }
        }
      }

    }catch(err){
      console.error(err);
    }
  }

  const soil=useMemo(()=>calcSoil(data),[data]);

  const chartData=WL.map((w,i)=>({
    wavelength:w,
    live:data[i],
    ref:soil?REFS[soil.detected][i]:0
  }));

  const radarData=[
    {k:"N",v:soil?.N||0},
    {k:"P",v:soil?.P||0},
    {k:"K",v:soil?.K||0},
    {k:"Moisture",v:soil?.moisture||0},
  ];

  return(
    <div style={{
      minHeight:"100vh",
      background:"#08111f",
      color:"white",
      padding:20,
      fontFamily:"Inter,sans-serif"
    }}>

      <div style={{
        display:"flex",
        justifyContent:"space-between",
        alignItems:"center",
        marginBottom:20
      }}>

        <div>
          <div style={{fontSize:30,fontWeight:800}}>
            SoilSpec AI
          </div>

          <div style={{color:"#7c93b3"}}>
            AS7265X Spectroscopy Dashboard
          </div>
        </div>

        <button
          onClick={connectSerial}
          style={{
            background:connected?"#22c55e":"#2563eb",
            border:"none",
            color:"white",
            padding:"12px 18px",
            borderRadius:12,
            cursor:"pointer",
            fontWeight:700
          }}
        >
          {connected?"Connected":"Connect Sensor"}
        </button>
      </div>

      <div style={{
        display:"grid",
        gridTemplateColumns:"1.5fr 1fr",
        gap:20
      }}>

        <div style={{
          background:"#101b2d",
          borderRadius:20,
          padding:20
        }}>

          <div style={{
            fontSize:18,
            fontWeight:700,
            marginBottom:10
          }}>
            Live Spectral Response
          </div>

          <div style={{height:350}}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke="#1e293b" />
                <XAxis dataKey="wavelength" stroke="#7c93b3" />
                <YAxis stroke="#7c93b3" />
                <Tooltip />

                <Line
                  type="monotone"
                  dataKey="live"
                  stroke="#22c55e"
                  strokeWidth={3}
                  dot={false}
                />

                <Line
                  type="monotone"
                  dataKey="ref"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:20}}>

          <div style={{
            background:"#101b2d",
            borderRadius:20,
            padding:20
          }}>

            <div style={{fontSize:15,color:"#94a3b8"}}>
              Classification
            </div>

            <div style={{
              fontSize:28,
              fontWeight:800,
              marginTop:10,
              color:soil?REF_META[soil.detected].col:"white"
            }}>
              {soil?REF_META[soil.detected].emoji:"🌬"}
              {" "}
              {soil?REF_META[soil.detected].label:"Air"}
            </div>

            <div style={{marginTop:10,color:"#94a3b8"}}>
              {soil?REF_META[soil.detected].desc:"No sample"}
            </div>

            <div style={{
              marginTop:12,
              color:"#22c55e",
              fontWeight:700
            }}>
              Confidence: {soil?.confidence || 0}%
            </div>
          </div>

          <div style={{
            background:"#101b2d",
            borderRadius:20,
            padding:20
          }}>

            <div style={{fontSize:18,fontWeight:700}}>
              NPK Estimation
            </div>

            <div style={{height:260}}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="k" />
                  <PolarRadiusAxis />

                  <Radar
                    dataKey="v"
                    stroke="#22c55e"
                    fill="#22c55e"
                    fillOpacity={0.5}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      <div style={{
        marginTop:20,
        display:"grid",
        gridTemplateColumns:"repeat(4,1fr)",
        gap:16
      }}>

        {[
          {label:"Nitrogen",value:soil?.N,col:"#22c55e"},
          {label:"Phosphorus",value:soil?.P,col:"#f97316"},
          {label:"Potassium",value:soil?.K,col:"#a855f7"},
          {label:"Moisture",value:soil?.moisture+"%",col:"#38bdf8"},
        ].map((x,i)=>(

          <div
            key={i}
            style={{
              background:"#101b2d",
              borderRadius:18,
              padding:20
            }}
          >
            <div style={{color:"#7c93b3"}}>
              {x.label}
            </div>

            <div style={{
              marginTop:10,
              fontSize:32,
              fontWeight:800,
              color:x.col
            }}>
              {x.value || 0}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

