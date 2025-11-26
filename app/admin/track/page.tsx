"use client";

import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import Link from "next/link";
import {
  Card, CardContent
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Upload, RefreshCw, DownloadCloud
} from "lucide-react";

type ConsignmentRow = {
  awb: string;
  last_status?: string | null;
  origin?: string | null;
  destination?: string | null;
  booked_on?: string | null;
  last_updated_on?: string | null;
  last_action?: string | null;
  timeline?: any[];
  tat?: string;
  movement?: string;
};

const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_PAGE_SIZE = 50;
const AUTO_REFRESH_MS = 60 * 60 * 1000;
const CACHE_NAMESPACE = "dtdc_track_cache_v1";
const CACHE_TTL_MS = 30 * 60 * 1000;

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
  const [tatFilter, setTatFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const autoRef = useRef<number | null>(null);

  useEffect(() => {
    fetchPage();
    startAutoRefresh();
    return () => stopAutoRefresh();
  }, []);

  useEffect(() => {
    fetchPage();
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

  function makeCacheKey(params: any) {
    return `${CACHE_NAMESPACE}:${params.page}:${params.pageSize}:${params.search}:${params.statusFilter}:${params.tatFilter}:${params.dateFrom}:${params.dateTo}`;
  }

  function readCache(key: string) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.timestamp || !parsed?.data) return null;
      if (Date.now() - parsed.timestamp > CACHE_TTL_MS) {
        localStorage.removeItem(key);
        return null;
      }
      return parsed.data;
    } catch { return null; }
  }

  function writeCache(key: string, data: any) {
    try {
      localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), data }));
    } catch {}
  }

    // ----------------- Fetch page (with caching + post-filtering) -----------------
  async function fetchPage(forceRefresh = false) {
    try {
      const paramsObj = {
        page,
        pageSize,
        search,
        statusFilter,
        tatFilter,
        dateFrom,
        dateTo,
      };
      const cacheKey = makeCacheKey(paramsObj);

      if (!forceRefresh) {
        const cached = readCache(cacheKey);
        if (cached) {
          let items = cached.items ?? [];
          items = postFilter(items);
          setRows(items);
          setTotalPages(cached.totalPages ?? 1);
          return;
        }
      }

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

      let items = json.items ?? [];
      // cache raw server response
      writeCache(cacheKey, json);

      // apply client-side post-filtering for exact-search and TAT
      items = postFilter(items);

      setRows(items);
      setTotalPages(json.totalPages ?? 1);
    } catch (e) {
      toast.error("Failed to load data: " + String(e));
    }
  }

  // ----------------- Client-side post filtering -----------------
  function postFilter(items: ConsignmentRow[]) {
    let out = [...items];

    // Exact AWB match when user types a full AWB (>= 10 characters).
    // Otherwise keep server-side behavior (which may be partial).
    if (search && search.trim().length > 0) {
      const q = search.trim();
      if (q.length >= 10) {
        out = out.filter((r) => String(r.awb).toLowerCase() === q.toLowerCase());
      } else {
        // fallback: keep server results (which already include like matches)
        out = out.filter((r) => String(r.awb).toLowerCase().includes(q.toLowerCase()));
      }
    }

    // TAT filter (client-side using our localComputeTAT fallback)
    if (tatFilter && tatFilter !== "all") {
      out = out.filter((r) => {
        const t = localComputeTAT(r).toLowerCase();
        return t.includes(tatFilter.toLowerCase());
      });
    }

    // Status filter: if 'all' skip, otherwise filter by last_status includes
    if (statusFilter && statusFilter !== "all") {
      const sf = statusFilter.toLowerCase();
      out = out.filter((r) => (r.last_status ?? "").toLowerCase().includes(sf));
    }

    return out;
  }

  // ----------------- File upload -----------------
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
      setProgress({ done: 0, total: unique.length });
      toast.success(`${unique.length} AWBs loaded`);
    };
    reader.readAsArrayBuffer(file);
  }

  function chunkArray<T>(arr: T[], size: number) {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
    return chunks;
  }

  // ----------------- Batch tracking -----------------
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
        }
        setProgress((p) => ({ ...p, done: Math.min(p.total, p.done + chunk.length) }));
        await fetchPage(true); // refresh and update cache
      }
      toast.success("Batch tracking completed");
    } catch (e) {
      toast.error("Batch tracking failed: " + String(e));
    } finally {
      setLoading(false);
    }
  }

  // ----------------- Retry single -----------------
  async function retrySingle(awb: string) {
    try {
      const res = await fetch("/api/dtdc/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consignments: [awb] }),
      });
      const json = await res.json();
      if (json?.error) return toast.error("Retry failed: " + json.error);
      toast.success("Retry completed successfully");
      await fetchPage(true); // refresh
    } catch (e) {
      toast.error("Retry failed: " + String(e));
    }
  }

  // ----------------- Export -----------------
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

  // ----------------- Local fallback computeTAT & computeMovement -----------------
  const TAT_RULES: Record<string, number> = { D: 3, M: 5, N: 7, I: 10 };

  function localComputeTAT(r: ConsignmentRow) {
    if (r.tat) return r.tat;
    if (!r.booked_on) return "On Time";
    const prefix = r.awb?.charAt(0)?.toUpperCase();
    const allowedDays = TAT_RULES[prefix] ?? 5;
    const age = dayjs().diff(dayjs(r.booked_on), "day");
    if (age > allowedDays + 3) return "Very Critical";
    if (age > allowedDays) return "Critical";
    if (age >= Math.max(0, allowedDays - 1)) return "Warning";
    return "On Time";
  }

  function localComputeMovement(r: ConsignmentRow) {
    if (r.movement) return r.movement;
    if (!r.timeline || r.timeline.length === 0) return "On Time";
    const last = r.timeline[0];
    if (!last?.actionDate) return "On Time";
    const lastTs = new Date(`${last.actionDate}T${last.actionTime ?? "00:00:00"}`).getTime();
    const hours = Math.floor((Date.now() - lastTs) / (1000 * 60 * 60));
    if (hours >= 72) return "Stuck (72+ hrs)";
    if (hours >= 48) return "Slow (48 hrs)";
    if (hours >= 24) return "Slow (24 hrs)";
    return "On Time";
  }

  // maps TAT string -> allowed shadcn badge variant
function tatVariant(t: string | undefined): "default" | "destructive" | "outline" | "secondary" {
  if (!t) return "default";
  if (t === "On Time") return "secondary";
  if (t === "Warning") return "outline";
  return "destructive"; // Critical / Very Critical -> destructive
}

// maps Movement string -> allowed shadcn badge variant
function movementVariant(m: string | undefined): "default" | "destructive" | "outline" | "secondary" {
  if (!m) return "default";
  if (m === "On Time") return "secondary";
  if (m.includes("Slow")) return "outline";
  if (m.includes("Stuck") || m.includes("72")) return "destructive";
  return "default";
}

  // ----------------- Render -----------------
  return (
    <div className="space-y-6 px-4 md:px-2 lg:px-0 py-6">
      {/* Page Title */}
      <h1 className="text-2xl font-bold mb-1">Track Consignments</h1>

      {/* Upload / actions card */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <input id="excelUpload" type="file" accept=".xlsx,.xls" onChange={handleFileInput} className="hidden" />

              <Button variant="outline" onClick={() => document.getElementById("excelUpload")?.click()}>
                <Upload className="mr-2" /> Upload Excel
              </Button>

              {selectedFile && (
                <>
                  <span className="px-2 py-1 bg-muted/50 rounded border">{selectedFile}</span>
                  <Button variant="ghost" size="sm" onClick={() => { setSelectedFile(""); setLoadedAwbs([]); }}>
                    ✖ Remove
                  </Button>
                </>
              )}

              <span className="text-sm text-muted-foreground">Loaded from file: {loadedAwbs.length} consignments</span>
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={runBatchTracking} disabled={loading || loadedAwbs.length === 0}>
                {loading ? "Tracking..." : "Track (Batched)"}
              </Button>

              <Button variant="ghost" onClick={exportToExcel}>
                <DownloadCloud className="mr-2" /> Export Excel
              </Button>

              <Button variant="secondary" onClick={() => fetchPage(true)}>
                <RefreshCw className="mr-2" /> Refresh TAT & Movement
              </Button>
            </div>
          </div>

          <div className="mt-4">
            <Progress value={progress.total ? Math.round((progress.done / progress.total) * 100) : 0} />
            <div className="text-xs text-muted-foreground mt-1">
              Progress: {progress.done}/{progress.total} ({progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%)
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-3 items-center">
            <Input placeholder="Search AWB" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="w-full md:w-64" />
            <Select onValueChange={(v) => { setStatusFilter(v); setPage(1); }} value={statusFilter} className="w-48">
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="in transit">In Transit</SelectItem>
                <SelectItem value="out for delivery">Out For Delivery</SelectItem>
                <SelectItem value="attempted">Attempted</SelectItem>
                <SelectItem value="held">Held Up</SelectItem>
                <SelectItem value="rto">RTO</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">From</span>
              <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
              <span className="text-sm text-muted-foreground">To</span>
              <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
            </div>

            <Select onValueChange={(v) => { setTatFilter(v); setPage(1); }} value={tatFilter} className="w-48">
              <SelectTrigger><SelectValue placeholder="TAT" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="very critical">Very Critical</SelectItem>
              </SelectContent>
            </Select>

            <div className="ml-auto flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Page size</span>
              <Input type="number" value={pageSize} onChange={(e) => { setPageSize(Math.max(5, Number(e.target.value) || DEFAULT_PAGE_SIZE)); setPage(1); }} className="w-20" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <ScrollArea>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>AWB</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Booked</TableHead>
                  <TableHead>Last Update</TableHead>
                  <TableHead>Origin</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>TAT</TableHead>
                  <TableHead>Movement</TableHead>
                  <TableHead>Timeline</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Retry</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {rows.map((r) => {
                  const tatLabel = localComputeTAT(r);
                  const movementLabel = localComputeMovement(r);

                  return (
                    <TableRow key={r.awb} className={tatLabel === "Very Critical" ? "bg-red-50" : ""}>
                      <TableCell className="font-medium">{r.awb}</TableCell>
                      <TableCell>{r.last_status ?? "-"}</TableCell>
                      <TableCell>{r.booked_on ?? "-"}</TableCell>
                      <TableCell>{r.last_updated_on ?? "-"}</TableCell>
                      <TableCell>{r.origin ?? "-"}</TableCell>
                      <TableCell>{r.destination ?? "-"}</TableCell>

                      <TableCell>
                        <Badge
                          variant={
                            tatLabel === "Very Critical"
                              ? "destructive"
                              : tatLabel === "Critical"
                              ? "secondary"
                              : tatLabel === "Warning"
                              ? "outline"
                              : "default"
                          }
                        >
                          {tatLabel}
                        </Badge>
                      </TableCell>

                      <TableCell>
                        <Badge
                          variant={
                            movementLabel === "On Time"
                              ? "secondary"
                              : movementLabel.includes("72")
                              ? "destructive"
                              : movementLabel.includes("48")
                              ? "secondary"
                              : movementLabel.includes("24")
                              ? "outline"
                              : "default"
                          }
                        >
                          {movementLabel}
                        </Badge>
                      </TableCell>

                      <TableCell>
                        <details>
                          <summary className="cursor-pointer text-primary text-sm">View Timeline</summary>
                          <div className="mt-2 text-sm">
                            {r.timeline && r.timeline.length > 0 ? (
                              r.timeline.map((t: any, i: number) => (
                                <div key={i} className="mb-2">
                                  <div className="text-xs text-muted-foreground">{t.actionDate} {t.actionTime}</div>
                                  <div className="font-medium">{t.action}</div>
                                  <div className="text-muted-foreground">{t.origin || t.destination}</div>
                                  {t.remarks && <div className="text-xs text-muted-foreground">{t.remarks}</div>}
                                </div>
                              ))
                            ) : (
                              <div className="text-xs text-muted-foreground">No timeline available</div>
                            )}
                          </div>
                        </details>
                      </TableCell>

                      <TableCell>
                        <Link href={`/admin/dtdc/${encodeURIComponent(r.awb)}`}>
                          <Button size="sm" variant="outline">View Details</Button>
                        </Link>
                      </TableCell>

                      <TableCell>
                        <Button size="sm" variant="destructive" onClick={() => retrySingle(r.awb)}>Retry</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">Showing {rows.length} results — Page {page}/{totalPages}</div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setPage(1)} disabled={page === 1}>First</Button>
          <Button size="sm" variant="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Prev</Button>
          <div className="px-3 py-1 border rounded">{page}</div>
          <Button size="sm" variant="ghost" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</Button>
          <Button size="sm" variant="ghost" onClick={() => setPage(totalPages)} disabled={page === totalPages}>Last</Button>
        </div>
      </div>
    </div>
  );
}
