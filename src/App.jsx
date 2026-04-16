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
  const [history, setHistory] = useState(
    Array.from({ length: 18 }, () => [])
  );
  const [selectedCh, setSelectedCh] = useState(15);
  const [connected, setConnected] = useState(false);

  const portRef = useRef(null);
  const readerRef = useRef(null);

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
              setData([...vals]);

              setHistory(prev => prev.map((arr, i) => {
                const newArr = [...arr, vals[i]];
                if (newArr.length > 60) newArr.shift();
                return newArr;
              }));
            }
          }
        });
      }

    } catch (err) {
      console.error(err);
    }
  }

  // 🌱 metrics
  const avg = data.reduce((a, b) => a + b, 0) / 18;
  const moisture = Math.round((1 - avg / 4095) * 100);

  // 📊 spectrum
  const spectrumData = {
    labels: wavelengths,
    datasets: [{
      data: data,
      borderColor: "#00e676",
      tension: 0.3,
      pointRadius: 3
    }]
  };

  // 📈 selected channel trend
  const trendData = {
    labels: history[selectedCh].map(() => ""),
    datasets: [{
      data: history[selectedCh],
      borderColor: "#00e676",
      tension: 0.3,
      pointRadius: 0
    }]
  };

  return (
    <div className="bg-black text-white h-screen flex flex-col">

      {/* TOPBAR */}
      <div className="flex items-center justify-between p-3 bg-gray-900 border-b border-gray-700">
        <h1 className="text-lg font-bold text-green-400">
          SoilSpec — SAMD21
        </h1>

        <button
          onClick={connect}
          className={`px-3 py-1 rounded ${
            connected ? "bg-green-600" : "bg-green-400 text-black"
          }`}
        >
          {connected ? "Connected" : "Connect"}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* LEFT PANEL — CHANNEL BARS */}
        <div className="w-1/5 p-2 bg-gray-900 overflow-y-auto">
          {data.map((v, i) => (
            <div key={i}
              className={`mb-2 cursor-pointer ${selectedCh === i ? "bg-gray-700" : ""}`}
              onClick={() => setSelectedCh(i)}
            >
              <div className="text-xs">{wavelengths[i]} nm</div>
              <div className="w-full bg-gray-800 h-2">
                <div
                  className="bg-green-400 h-2"
                  style={{ width: `${(v / 4095) * 100}%` }}
                ></div>
              </div>
              <div className="text-xs">{v}</div>
            </div>
          ))}
        </div>

        {/* CENTER */}
        <div className="flex-1 flex flex-col">

          {/* Spectrum */}
          <div className="flex-1 p-4">
            <Line data={spectrumData} />
          </div>

          {/* Trend */}
          <div className="h-40 p-4 border-t border-gray-700">
            <div className="text-sm mb-2">
              Channel {wavelengths[selectedCh]} nm trend
            </div>
            <Line data={trendData} />
          </div>

        </div>

        {/* RIGHT PANEL */}
        <div className="w-1/5 p-4 bg-gray-900 border-l border-gray-700">
          <div className="mb-4">
            <div className="text-xs text-gray-400">Moisture</div>
            <div className="text-2xl text-green-400">{moisture}%</div>
          </div>

          <div>
            <div className="text-xs text-gray-400">Avg ADC</div>
            <div className="text-2xl text-green-400">
              {Math.round(avg)}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}