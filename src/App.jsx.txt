import { useState } from "react";
import { Line } from "react-chartjs-2";
import { Chart, LineElement, CategoryScale, LinearScale, PointElement } from "chart.js";

Chart.register(LineElement, CategoryScale, LinearScale, PointElement);

export default function App() {

  const [data, setData] = useState([]);
  const [connected, setConnected] = useState(false);

  let port, reader;

  async function connect() {
    try {
      port = await navigator.serial.requestPort({
        filters: [{ usbVendorId: 0x03EB }]
      });

      await port.open({ baudRate: 115200 });
      setConnected(true);

      const decoder = new TextDecoderStream();
      port.readable.pipeTo(decoder.writable);
      reader = decoder.readable.getReader();

      let buffer = "";

      while (true) {
        const { value } = await reader.read();
        buffer += value;

        const lines = buffer.split("\n");
        buffer = lines.pop();

        lines.forEach(line => {
          if (line.includes("RAW:")) {
            const vals = line.replace("RAW:", "").split(",").map(Number);
            if (vals.length === 18) setData(vals);
          }
        });
      }

    } catch (err) {
      console.error(err);
    }
  }

  const chartData = {
    labels: [410,435,460,485,510,535,560,585,610,645,680,705,730,760,810,860,900,940],
    datasets: [{
      label: "Spectrum",
      data: data,
      borderColor: "#00e676"
    }]
  };

  return (
    <div className="p-6 space-y-6">

      <h1 className="text-xl text-accent">SoilSpec — SAMD21</h1>

      <button
        onClick={connect}
        className="bg-accent text-black px-4 py-2 rounded"
      >
        {connected ? "Connected" : "Connect"}
      </button>

      <div className="bg-panel p-4 rounded">
        <Line data={chartData} />
      </div>

    </div>
  );
}