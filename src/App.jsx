import { useState, useRef } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
} from "chart.js";

Chart.register(LineElement, CategoryScale, LinearScale, PointElement);

const wavelengths = [410,435,460,485,510,535,560,585,610,645,680,705,730,760,810,860,900,940];

export default function App() {

  const [data, setData] = useState(new Array(18).fill(0));
  const [connected, setConnected] = useState(false);

  const portRef = useRef(null);
  const readerRef = useRef(null);

  // 🔌 CONNECT FUNCTION
  async function connect() {
    try {
      portRef.current = await navigator.serial.requestPort({
        filters: [{ usbVendorId: 0x03EB }]
      });

      await portRef.current.open({ baudRate: 115200 });
      setConnected(true);

      const decoder = new TextDecoderStream();
      portRef.current.readable.pipeTo(decoder.writable);
      readerRef.current = decoder.readable.getReader();

      let buffer = "";

      while (true) {
        const { value, done } = await readerRef.current.read();
        if (done) break;

        buffer += value;

        const lines = buffer.split("\n");
        buffer = lines.pop();

        lines.forEach(line => {
          if (line.includes("RAW")) {

            const clean = line.split("RAW:")[1]?.trim();
            if (!clean) return;

            const vals = clean.split(",").map(v => parseInt(v));

            if (vals.length === 18) {
              setData([...vals]); // trigger UI update
            }
          }
        });
      }

    } catch (err) {
      console.error("Connection error:", err);
    }
  }

  // 📊 CHART
  const chartData = {
    labels: wavelengths,
    datasets: [
      {
        label: "Spectrum",
        data: data,
        borderColor: "#00e676",
        tension: 0.3,
      },
    ],
  };

  // 🌱 SIMPLE SOIL METRICS
  const avg = data.reduce((a, b) => a + b, 0) / 18;
  const moisture = Math.round((1 - avg / 4095) * 100);

  return (
    <div className="p-6 space-y-6 bg-black min-h-screen text-white">

      {/* HEADER */}
      <h1 className="text-2xl font-bold text-green-400">
        SoilSpec — SAMD21
      </h1>

      {/* CONNECT BUTTON */}
      <button
        onClick={connect}
        className={`px-4 py-2 rounded ${
          connected ? "bg-green-600" : "bg-green-400 text-black"
        }`}
      >
        {connected ? "Connected" : "Connect"}
      </button>

      {/* 🌱 SOIL METRICS */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-800 p-4 rounded">
          <div className="text-sm text-gray-400">Moisture</div>
          <div className="text-2xl text-green-400">{moisture}%</div>
        </div>

        <div className="bg-gray-800 p-4 rounded">
          <div className="text-sm text-gray-400">Average ADC</div>
          <div className="text-2xl text-green-400">
            {Math.round(avg)}
          </div>
        </div>
      </div>

      {/* 📊 GRAPH */}
      <div className="bg-gray-900 p-4 rounded">
        <Line data={chartData} />
      </div>

      {/* 📊 18 CHANNEL BARS */}
      <div className="grid grid-cols-6 gap-2">
        {data.map((v, i) => (
          <div key={i} className="text-center">
            <div
              className="bg-green-400 w-full"
              style={{
                height: `${(v / 4095) * 100}px`,
              }}
            ></div>
            <div className="text-xs mt-1">{wavelengths[i]}</div>
          </div>
        ))}
      </div>

    </div>
  );
}