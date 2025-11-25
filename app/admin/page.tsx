// app/admin/reports/page.tsx
"use client";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

export default function AdminHome() {
  const [stats, setStats] = useState({ total:0, delivered:0, rto:0, pending:0 });
  const [latest, setLatest] = useState<any[]>([]);

  useEffect(() => {
    fetchStats();
    fetchLatest();
  }, []);

  async function fetchStats() {
    try {
      const res = await fetch("/api/dtdc/stats");
      const json = await res.json();
      if (json?.error) return toast.error(json.error);
      setStats(json);
    } catch (e) { toast.error(String(e)); }
  }

  async function fetchLatest() {
    try {
      const res = await fetch("/api/dtdc/consignments?page=1&pageSize=8");
      const json = await res.json();
      setLatest(json.items ?? []);
    } catch {}
  }

  return (
    <div>
      <h1 className="text-2xl mb-4 font-semibold">Reports & Dashboard</h1>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded shadow">
          <div className="text-xs text-gray-600">Total Tracked</div>
          <div className="text-2xl font-bold">{stats.total}</div>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <div className="text-xs text-gray-600">Delivered</div>
          <div className="text-xl">{stats.delivered}</div>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <div className="text-xs text-gray-600">Pending</div>
          <div className="text-xl">{stats.pending}</div>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <div className="text-xs text-gray-600">RTO</div>
          <div className="text-xl">{stats.rto}</div>
        </div>
      </div>

      <div className="bg-white p-4 rounded shadow">
        <div className="text-sm text-gray-600 mb-2">Latest consignments</div>
        <ul className="divide-y">
          {latest.map((r:any) => (
            <li key={r.awb} className="py-2 flex justify-between">
              <div>
                <div className="font-medium">{r.awb}</div>
                <div className="text-xs text-gray-500">{r.origin} → {r.destination}</div>
              </div>
              <div className="text-sm">{r.last_status}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
