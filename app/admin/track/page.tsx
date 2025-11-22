"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import dayjs from "dayjs";
import toast from "react-hot-toast";

/**
 * DTDC spec (for reference in code):
 * /mnt/data/TLS DTDC REST TRACKING API_FINAL_V4.docx (1).pdf
 */

type Row = {
  cn: string;
  header?: any;
  timeline?: any[];
  raw?: any;
  fetched?: boolean;
  error?: string;
};

const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_PAGE_SIZE = 50;
const AUTO_REFRESH_MS = 60 * 60 * 1000; // 60 minutes

const chunkArray = <T,>(arr: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const STATUS_STYLES: Record<string, string> = {
  delivered: "bg-green-100 text-green-800",
  rto: "bg-red-100 text-red-800",
  "in transit": "bg-yellow-100 text-yellow-800",
  "out for delivery": "bg-blue-100 text-blue-800",
  attempted: "bg-orange-100 text-orange-800",
  held: "bg-gray-200 text-gray-800",
  unknown: "bg-slate-200 text-slate-800",
};

function normalizeStatus(s?: string) {
  if (!s) return "unknown";
  const v = s.toLowerCase();
  if (v.includes("deliver")) return "delivered";
  if (v.includes("rto")) return "rto";
  if (v.includes("out for")) return "out for delivery";
  if (v.includes("transit")) return "in transit";
  if (v.includes("attempt")) return "attempted";
  if (v.includes("held")) return "held";
  return v;
}

function StatusBadge({ status }: { status?: string }) {
  const key = normalizeStatus(status);
  const cls = STATUS_STYLES[key] ?? STATUS_STYLES["unknown"];
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded ${cls}`}>
      {status ?? "Unknown"}
    </span>
  );
}

/* Minimal inline timeline renderer (style 1) */
function InlineTimeline({ items }: { items?: any[] }) {
  if (!items || items.length === 0)
    return <div className="text-sm text-gray-500">No timeline available</div>;

  const sorted = [...items].sort((a, b) => {
    const da = `${a.strActionDate ?? ""}${a.strActionTime ?? ""}`;
    const db = `${b.strActionDate ?? ""}${b.strActionTime ?? ""}`;
    return db.localeCompare(da);
  });

  return (
    <div className="text-sm text-gray-700 py-2">
      {sorted.map((t: any, i: number) => (
        <div key={i} className="flex gap-3 border-b border-slate-100 py-2">
          <div className="w-36 text-xs text-gray-500">
            {t.strActionDate ?? t.date ?? ""} {t.strActionTime ?? t.time ?? ""}
          </div>
          <div className="flex-1">
            <div className="font-medium">{t.strAction ?? t.action ?? "-"}</div>
            <div className="text-xs text-gray-500">
              {t.strOrigin ?? t.origin ?? "-"} → {t.strDestination ?? t.destination ?? "-"}
            </div>
            {t.sTrRemarks || t.strRemarks ? (
              <div className="text-xs text-gray-600 mt-1">Remarks: {t.sTrRemarks ?? t.strRemarks}</div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TrackPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [batchSize, setBatchSize] = useState(DEFAULT_BATCH_SIZE);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [selectedFile, setSelectedFile] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const autoRef = useRef<number | null>(null);

  // restore from sessionStorage
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("dtdc_rows");
      if (raw) setRows(JSON.parse(raw));
      const fn = sessionStorage.getItem("dtdc_file");
      if (fn) setSelectedFile(fn);
    } catch {}
    startAutoRefresh();
    return () => stopAutoRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem("dtdc_rows", JSON.stringify(rows));
      sessionStorage.setItem("dtdc_file", selectedFile || "");
    } catch {}
  }, [rows, selectedFile]);

  // auto-refresh logic
  async function autoRefreshOnce() {
    const awbs = rows.map((r) => r.cn).filter(Boolean);
    if (awbs.length === 0) return;
    try {
      const chunks = chunkArray(awbs, batchSize);
      const updatedBuffer: Row[] = [];
      for (const batch of chunks) {
        const res = await fetch("/api/dtdc/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ consignments: batch }),
        });
        const json = await res.json();
        for (const item of json.results) {
          if (item.error) updatedBuffer.push({ cn: item.cn, error: item.error });
          else {
            const parsed = item.parsed ?? {};
            updatedBuffer.push({
              cn: item.cn,
              header: parsed.header,
              timeline: parsed.timeline,
              raw: item.raw ?? parsed,
              fetched: true,
            });
          }
        }
      }
      const mapNew = new Map(updatedBuffer.map((r) => [r.cn, r]));
      const changes: string[] = [];
      const newRows = rows.map((old) => {
        const nv = mapNew.get(old.cn);
        if (!nv) return old;
        const oldStatus = (old.header?.currentStatus ?? old.raw?.strStatus ?? "").toString();
        const newStatus = (nv.header?.currentStatus ?? nv.raw?.strStatus ?? "").toString();
        if (oldStatus !== newStatus) {
          changes.push(`${old.cn}: ${oldStatus || "Unknown"} → ${newStatus || "Unknown"}`);
        }
        return { ...old, ...nv };
      });
      if (changes.length) changes.forEach((c) => toast.success(`Status changed: ${c}`));
      else toast("Auto-refresh completed — no changes", { icon: "🔁" });
      setRows(newRows);
    } catch (e) {
      toast.error("Auto-refresh failed: " + String(e));
    }
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    autoRef.current = window.setInterval(() => {
      autoRefreshOnce();
    }, AUTO_REFRESH_MS);
  }
  function stopAutoRefresh() {
    if (autoRef.current) {
      clearInterval(autoRef.current);
      autoRef.current = null;
    }
  }

  // file input handler with validation
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
      setRows(unique.map((cn) => ({ cn })));
      setPage(1);
      toast.success(`${unique.length} AWBs loaded`);
    };
    reader.readAsArrayBuffer(file);
  }

  // batching
  async function fetchBatched() {
    const awbs = rows.map((r) => r.cn);
    if (awbs.length === 0) return toast("No AWBs loaded.");
    setLoading(true);
    setProgress({ done: 0, total: awbs.length });
    try {
      const chunks = chunkArray(awbs, batchSize);
      const buffer: Row[] = [];
      for (const batch of chunks) {
        const res = await fetch("/api/dtdc/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ consignments: batch }),
        });
        const json = await res.json();
        for (const item of json.results) {
          if (item.error) buffer.push({ cn: item.cn, error: item.error });
          else {
            const parsed = item.parsed ?? {};
            buffer.push({ cn: item.cn, header: parsed.header, timeline: parsed.timeline, raw: item.raw ?? parsed, fetched: true });
          }
        }
        setProgress((p) => ({ ...p, done: Math.min(p.total, p.done + batch.length) }));
      }
      const map = new Map(buffer.map((r) => [r.cn, r]));
      setRows(rows.map((r) => map.get(r.cn) ?? r));
      toast.success("Batch tracking finished");
    } catch (e) {
      toast.error("Batch tracking failed: " + String(e));
    } finally {
      setLoading(false);
    }
  }
  function startTracking() {
    setProgress({ done: 0, total: rows.length });
    fetchBatched();
  }

  // retry single
  async function retrySingle(r: Row) {
    const cn = r.cn;
    r.fetched = false;
    r.error = undefined;
    setRows([...rows]);
    try {
      const res = await fetch("/api/dtdc/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consignments: [cn] }),
      });
      const json = await res.json();
      const item = json.results?.[0];
      if (!item || item.error) {
        r.error = item?.error ?? "Retry failed";
        setRows([...rows]);
        toast.error(`Retry failed: ${cn}`);
        return;
      }
      const parsed = item.parsed ?? {};
      r.header = parsed.header;
      r.timeline = parsed.timeline;
      r.raw = parsed.raw ?? item.raw;
      r.fetched = true;
      r.error = undefined;
      setRows([...rows]);
      toast.success(`Retry success: ${cn}`);
    } catch (err) {
      r.error = String(err);
      setRows([...rows]);
      toast.error(`Retry failed: ${cn}`);
    }
  }

  // filters
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (search && !r.cn.toLowerCase().includes(search.toLowerCase())) return false;
      const st = normalizeStatus(r.header?.currentStatus ?? r.raw?.strStatus ?? "");
      if (statusFilter !== "all" && !st.includes(statusFilter)) return false;
      const dateStr = r.header?.bookedOn ?? r.header?.lastUpdatedOn ?? r.raw?.strBookedDate ?? r.raw?.strStatusTransOn;
      if (dateStr) {
        const d = dayjs(dateStr, ["DDMMYYYY"]);
        if (dateFrom && d.isBefore(dayjs(dateFrom))) return false;
        if (dateTo && d.isAfter(dayjs(dateTo))) return false;
      }
      return true;
    });
  }, [rows, search, statusFilter, dateFrom, dateTo]);

  const snapshot = useMemo(() => {
    const fetchedList = rows.filter((r) => r.fetched);
    const total = fetchedList.length;
    let delivered = 0, rto = 0, pending = 0;
    fetchedList.forEach((r) => {
      const s = normalizeStatus(r.header?.currentStatus ?? r.raw?.strStatus);
      if (s === "delivered") delivered++;
      else if (s === "rto") rto++;
      else pending++;
    });
    const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));
    return { total, delivered, rto, pending, p_delivered: pct(delivered), p_rto: pct(rto), p_pending: pct(pending) };
  }, [rows]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  function exportToExcel() {
    if (filtered.length === 0) return toast("No rows to export.");
    const data = [
      ["Consignment", "Status", "Booked", "Last", "Origin", "Dest", "Remarks"],
      ...filtered.map((r) => [
        r.cn,
        r.header?.currentStatus ?? r.raw?.strStatus ?? "",
        r.header?.bookedOn ?? "",
        r.header?.lastUpdatedOn ?? "",
        r.header?.origin ?? "",
        r.header?.destination ?? "",
        r.timeline?.[0]?.sTrRemarks ?? "",
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

  function removeSelectedFile() {
    setSelectedFile("");
    const input = document.getElementById("excelUpload") as HTMLInputElement;
    if (input) input.value = "";
    setRows([]);
    setProgress({ done: 0, total: 0 });
    toast("Cleared uploaded file");
  }

  function toggleExpand(cn: string) {
    setExpanded((s) => ({ ...s, [cn]: !s[cn] }));
  }

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
              <button onClick={removeSelectedFile} className="text-red-600 text-sm hover:underline">
                ✖ Remove
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <button onClick={startTracking} disabled={loading || rows.length === 0} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-60">
              {loading ? "Tracking..." : "Track (Batched)"}
            </button>
            <button onClick={exportToExcel} className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700">
              Export Excel
            </button>
          </div>
        </div>

        <div className="mt-3 text-sm text-gray-600">Loaded: {rows.length} consignments</div>

        <div className="mt-3">
          <div className="text-xs text-gray-600 mb-1">
            Progress: {progress.done}/{progress.total} ({progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%)
          </div>
          <div className="w-full h-3 bg-slate-200 rounded">
            <div className="h-3 bg-blue-600 rounded" style={{ width: progress.total ? `${(progress.done / progress.total) * 100}%` : "0%" }} />
          </div>
        </div>
      </div>

      {/* Snapshot Summary */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        <div className="bg-white p-4 rounded shadow">
          <div className="text-xs text-gray-600">Total</div>
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
          <label className="text-sm">Batch</label>
          <input type="number" value={batchSize} onChange={(e) => setBatchSize(Math.max(1, Number(e.target.value) || 1))} className="w-20 px-2 py-1 border rounded" />
          <label className="text-sm">Page</label>
          <input type="number" value={pageSize} onChange={(e) => { setPageSize(Math.max(5, Number(e.target.value) || DEFAULT_PAGE_SIZE)); setPage(1); }} className="w-20 px-2 py-1 border rounded" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-xs text-gray-600">
              <th className="p-3">AWB Number</th>
              <th className="p-3">Status</th>
              <th className="p-3">Booked Date</th>
              <th className="p-3">Last Update</th>
              <th className="p-3">Origin</th>
              <th className="p-3">Destination</th>
              <th className="p-3">Retry</th>
              <th className="p-3">Timeline</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={r.cn} className="border-t">
                <td className="p-3 align-top">{r.cn}</td>
                <td className="p-3 align-top"><StatusBadge status={r.header?.currentStatus ?? r.raw?.strStatus} /></td>
                <td className="p-3 align-top">{r.header?.bookedOn ?? r.raw?.strBookedDate ?? "-"}</td>
                <td className="p-3 align-top">{r.header?.lastUpdatedOn ?? r.raw?.strStatusTransOn ?? "-"}</td>
                <td className="p-3 align-top">{r.header?.origin ?? r.raw?.strOrigin ?? "-"}</td>
                <td className="p-3 align-top">{r.header?.destination ?? r.raw?.strDestination ?? "-"}</td>
                <td className="p-3 align-top">
                  <button onClick={() => retrySingle(r)} className="px-2 py-1 bg-orange-600 text-white rounded text-xs">Retry</button>
                  {r.error && <div className="text-xs text-red-600 mt-1">Err</div>}
                </td>
                <td className="p-3 align-top">
                  <button onClick={() => toggleExpand(r.cn)} className="px-2 py-1 border rounded text-xs">View Timeline</button>
                </td>
              </tr>
            ))}

            {/* Inline expanded rows */}
            {pageRows.map((r) => expanded[r.cn] ? (
              <tr key={r.cn + "-expand"} className="bg-slate-50">
                <td colSpan={8} className="p-3">
                  <InlineTimeline items={r.timeline ?? r.raw?.trackDetails} />
                </td>
              </tr>
            ) : null)}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4">
        <div className="text-sm text-gray-600">Showing {filtered.length} results — Page {page}/{totalPages}</div>
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
