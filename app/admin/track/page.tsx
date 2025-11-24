"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import Link from "next/link";

type ConsignmentRow = {
  id?: string;
  awb: string;
  last_status?: string;
  origin?: string;
  destination?: string;
  booked_on?: string;
  last_updated_on?: string;
  last_action?: string;
  last_action_date?: string;
  last_action_time?: string;
};

const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_PAGE_SIZE = 50;
const AUTO_REFRESH_MS = 60 * 60 * 1000; // 60 minutes

export default function TrackPage() {
  const [loadedAwbs, setLoadedAwbs] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalPages, setTotalPages] = useState(1);

  const [rows, setRows] = useState<ConsignmentRow[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const autoRef = useRef<number | null>(null);

  useEffect(() => {
    // load from DB on mount
    fetchPage();
    startAutoRefresh();
    return () => stopAutoRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // whenever filters/page change, fetch page
    fetchPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, search, statusFilter, dateFrom, dateTo]);

  function startAutoRefresh() {
    stopAutoRefresh();
    autoRef.current = window.setInterval(() => {
      fetchPage();
      toast("Auto-refresh: data reloaded", { icon: "🔁" });
    }, AUTO_REFRESH_MS);
  }
  function stopAutoRefresh() {
    if (autoRef.current) {
      clearInterval(autoRef.current);
      autoRef.current = null;
    }
  }

  async function fetchPage() {
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (search) params.set("search", search);
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);

      const res = await fetch(`/api/dtdc/consignments?${params.toString()}`);
      const json = await res.json();
      if (json?.error) {
        toast.error("Failed to load data: " + json.error);
        return;
      }
      setRows(json.items ?? []);
      setTotalPages(json.totalPages ?? 1);
    } catch (e) {
      toast.error("Failed to load data: " + String(e));
    }
  }

  // file input
  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "xlsx" && ext !== "xls") {
      toast.error("Only .xlsx or .xls files are allowed.");
      e.target.value = "";
      return;
    }
    setSelectedFile(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = evt.target?.result;
      if (!data) return;
      const wb = XLSX.read(data, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      const vals = json.map((r) => (r[0] ?? "").toString().trim()).filter(Boolean);
      const unique = [...new Set(vals)];
      setLoadedAwbs(unique);
      setPage(1);
      toast.success(`${unique.length} AWBs loaded`);
    };
    reader.readAsArrayBuffer(file);
  }

  // batching helper
  function chunkArray<T>(arr: T[], size: number) {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
    return chunks;
  }

  // main: send batches to /api/dtdc/track; server writes to DB
  async function runBatchTracking() {
    if (loadedAwbs.length === 0) return toast("No AWBs loaded.");
    setLoading(true);
    setProgress({ done: 0, total: loadedAwbs.length });

    try {
      const chunks = chunkArray(loadedAwbs, DEFAULT_BATCH_SIZE);
      for (const chunk of chunks) {
        const res = await fetch("/api/dtdc/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ consignments: chunk }),
        });
        const json = await res.json();
        if (json?.error) {
          toast.error("Batch error: " + json.error);
          // continue to next
        }
        // update progress
        setProgress((p) => ({ ...p, done: Math.min(p.total, p.done + chunk.length) }));
        // after every chunk, refresh current page to show new DB data
        await fetchPage();
      }
      toast.success("Batch tracking completed");
    } catch (e) {
      toast.error("Batch tracking failed: " + String(e));
    } finally {
      setLoading(false);
    }
  }

  // Retry single AWB: call tracking endpoint for single AWB then refresh page
  async function retrySingle(awb: string) {
    try {
      const res = await fetch("/api/dtdc/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consignments: [awb] }),
      });
      const json = await res.json();
      if (json?.error) return toast.error("Retry failed: " + json.error);
      toast.success("Retry completed");
      await fetchPage();
    } catch (e) {
      toast.error("Retry failed: " + String(e));
    }
  }

  // Export currently loaded rows (the ones shown in table)
  function exportToExcel() {
    if (!rows || rows.length === 0) return toast("No rows to export.");
    const data = [
      ["Consignment", "Status", "Booked", "Last", "Origin", "Dest", "Remarks"],
      ...rows.map((r) => [
        r.awb,
        r.last_status ?? "",
        r.booked_on ?? "",
        r.last_updated_on ?? "",
        r.origin ?? "",
        r.destination ?? "",
        r.last_action ?? "",
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tracking");
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const blob = new Blob([out]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dtdc-tracking-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Export started");
  }

  // Snapshot: compute from rows (which are DB-backed)
  const snapshot = useMemo(() => {
    const total = rows.length;
    let delivered = 0, rto = 0, pending = 0;
    rows.forEach((r) => {
      const s = (r.last_status ?? "").toLowerCase();
      if (s.includes("deliver")) delivered++;
      else if (s.includes("rto")) rto++;
      else pending++;
    });
    const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));
    return { total, delivered, rto, pending, p_delivered: pct(delivered), p_rto: pct(rto), p_pending: pct(pending) };
  }, [rows]);

  return (
    <div>
      <h1 className="text-2xl mb-4 font-bold">Track Consignments</h1>

      {/* Upload & controls */}
      <div className="bg-white p-5 rounded shadow mb-6">
        <input id="excelUpload" type="file" accept=".xlsx,.xls" onChange={handleFileInput} className="hidden" />

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => document.getElementById("excelUpload")?.click()} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">
              📤 Upload Excel
            </button>
            {selectedFile && <span className="text-sm text-gray-700 bg-gray-100 px-2 py-1 rounded border">{selectedFile}</span>}
            {selectedFile && (
              <button onClick={() => { setSelectedFile(""); setLoadedAwbs([]); }} className="text-red-600 text-sm hover:underline">
                ✖ Remove
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <button onClick={runBatchTracking} disabled={loading || loadedAwbs.length === 0} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-60">
              {loading ? "Tracking..." : "Track (Batched)"}
            </button>
            <button onClick={exportToExcel} className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700">
              Export Excel
            </button>
          </div>
        </div>

        <div className="mt-3 text-sm text-gray-600">Loaded from file: {loadedAwbs.length} consignments</div>

        <div className="mt-3">
          <div className="text-xs text-gray-600 mb-1">
            Progress: {progress.done}/{progress.total} ({progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%)
          </div>
          <div className="w-full h-3 bg-slate-200 rounded">
            <div className="h-3 bg-blue-600 rounded" style={{ width: progress.total ? `${(progress.done / progress.total) * 100}%` : "0%" }} />
          </div>
        </div>
      </div>

      {/* Snapshot */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        <div className="bg-white p-4 rounded shadow">
          <div className="text-xs text-gray-600">Total Shown</div>
          <div className="text-2xl font-bold">{snapshot.total}</div>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <div className="text-xs text-gray-600">Delivered</div>
          <div className="text-xl">{snapshot.delivered} ({snapshot.p_delivered}%)</div>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <div className="text-xs text-gray-600">Pending</div>
          <div className="text-xl">{snapshot.pending} ({snapshot.p_pending}%)</div>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <div className="text-xs text-gray-600">RTO</div>
          <div className="text-xl">{snapshot.rto} ({snapshot.p_rto}%)</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 items-center flex-wrap">
        <input placeholder="Search AWB" value={search} onChange={(e) => setSearch(e.target.value)} className="px-3 py-2 border rounded" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 border rounded">
          <option value="all">All</option>
          <option value="delivered">Delivered</option>
          <option value="in transit">In Transit</option>
          <option value="out for delivery">Out For Delivery</option>
          <option value="attempted">Attempted</option>
          <option value="held">Held Up</option>
          <option value="rto">RTO</option>
        </select>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-600">From →</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-3 py-2 border rounded" />
          <span className="text-gray-600">To →</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-3 py-2 border rounded" />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <label className="text-sm">Page size</label>
          <input type="number" value={pageSize} onChange={(e) => { setPageSize(Math.max(5, Number(e.target.value) || DEFAULT_PAGE_SIZE)); setPage(1); }} className="w-20 px-2 py-1 border rounded" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-xs text-gray-600">
              <th className="p-3">AWB</th>
              <th className="p-3">Status</th>
              <th className="p-3">Booked</th>
              <th className="p-3">Last Update</th>
              <th className="p-3">Origin</th>
              <th className="p-3">Destination</th>
              <th className="p-3">Retry</th>
              <th className="p-3">Timeline</th>
              <th className="p-3">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.awb} className="border-t">
                <td className="p-3 align-top">{r.awb}</td>
                <td className="p-3 align-top"><span className="text-xs">{r.last_status ?? "-"}</span></td>
                <td className="p-3 align-top">{r.booked_on ?? "-"}</td>
                <td className="p-3 align-top">{r.last_updated_on ?? "-"}</td>
                <td className="p-3 align-top">{r.origin ?? "-"}</td>
                <td className="p-3 align-top">{r.destination ?? "-"}</td>
                <td className="p-3 align-top">
                  <button onClick={() => retrySingle(r.awb)} className="px-2 py-1 bg-orange-600 text-white rounded text-xs">Retry</button>
                </td>
                <td className="p-3 align-top">
                  <details>
                    <summary className="cursor-pointer text-sm text-blue-600">View Timeline</summary>
                    <div className="mt-2 text-sm text-gray-700">
                      <div className="text-xs text-gray-500">Last action: {r.last_action ?? "-"}</div>
                      <div className="mt-2">
                        {/* to see full timeline, a separate endpoint could be called; for now show last action and recommend "View full timeline" */}
                        <em className="text-xs text-gray-500">For full timeline, click the AWB and view details (future feature)</em>
                      </div>
                    </div>
                  </details>
                </td>
                <td className="p-3 align-top">
                  <Link href={`/admin/dtdc/${encodeURIComponent(r.awb)}`}>
                    <button className="px-2 py-1 bg-blue-600 text-white rounded text-xs">
                      View Details
                    </button>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4">
        <div className="text-sm text-gray-600">Showing {rows.length} results — Page {page}/{totalPages}</div>
        <div className="flex gap-2">
          <button onClick={() => setPage(1)} disabled={page === 1} className="px-2 py-1 border rounded">First</button>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 border rounded">Prev</button>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-2 py-1 border rounded">Next</button>
          <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="px-2 py-1 border rounded">Last</button>
        </div>
      </div>
    </div>
  );
}
