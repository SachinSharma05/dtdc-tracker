"use client";

import { useState } from "react";

export default function PincodePage() {
  const [origin, setOrigin] = useState("");
  const [dest, setDest] = useState("");
  const [services, setServices] = useState<string[]>([]);
  const [error, setError] = useState("");

  async function check() {
    setError("");
    setServices([]);

    const res = await fetch(`/api/dtdc/pincode/service?origin=${origin}&dest=${dest}`);
    const json = await res.json();

    if (json.error) {
      setError(json.error);
      return;
    }

    if (json.status === false || !json.data) {
      setError("No service found");
      return;
    }

    setServices(json.data);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">DTDC Pincode Serviceability</h1>

      <div className="flex gap-4 mb-4">
        <input
          className="border px-3 py-2 rounded"
          placeholder="Origin Pincode"
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
        />

        <input
          className="border px-3 py-2 rounded"
          placeholder="Destination Pincode"
          value={dest}
          onChange={(e) => setDest(e.target.value)}
        />

        <button
          onClick={check}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          Check
        </button>
      </div>

      {error && <p className="text-red-600">{error}</p>}

      {services.length > 0 && (
        <div className="bg-white p-4 rounded shadow">
          <h2 className="text-lg font-semibold mb-2">Available Services</h2>

          <ul className="list-disc pl-6">
            {services.map((s) => (
              <li key={s} className="text-gray-700">{s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
