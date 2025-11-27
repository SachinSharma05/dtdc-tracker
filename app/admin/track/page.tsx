"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import { generateCustomLabel } from "../../utils/pdf/customeLabel";
import { mergePDFs } from "../../utils/pdf/merge";

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

type StatusFilterType = "all" | "delivered" | "in transit" | "out for delivery" | "attempted" | "held" | "rto" | "pending";

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
  const [statusFilter, setStatusFilter] =
  useState<"all" | "delivered" | "in transit" | "out for delivery" | "attempted" | "held" | "rto" | "pending">("all");
  const [tatFilter, setTatFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const searchParams = useSearchParams();

  const autoRef = useRef<number | null>(null);

  useEffect(() => {
    const s = searchParams.get("status");

    if (s === "delivered") {
      setStatusFilter("delivered");
    } else if (s === "pending") {
      setStatusFilter("pending"); // virtual filter
    } else if (s === "rto") {
      setStatusFilter("rto");
    } else {
      setStatusFilter("all");
    }

    setPage(1);
  }, [searchParams]);

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
      if (statusFilter && statusFilter !== "all" && statusFilter !== "pending") {
        params.set("status", statusFilter);
      }
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

  // AWB search
  if (search && search.trim().length > 0) {
    const q = search.trim();
    if (q.length >= 10) {
      out = out.filter((r) => String(r.awb).toLowerCase() === q.toLowerCase());
    } else {
      out = out.filter((r) => String(r.awb).toLowerCase().includes(q.toLowerCase()));
    }
  }

  // TAT filter
  if (tatFilter && tatFilter !== "all") {
    out = out.filter((r) => {
      const t = localComputeTAT(r).toLowerCase();
      return t.includes(tatFilter.toLowerCase());
    });
  }

  // --- Special rule for PENDING ---
  if (statusFilter === "pending") {
    out = out.filter((r) => {
      // Normalize all possible status sources
      const s =
        (r.last_status ??
        r.last_action ??
        "")
          .toString()
          .toLowerCase();

      // Block delivered
      const isDelivered =
        s.includes("deliver") ||
        s.includes("dlvd") ||
        s.includes("delv");

      // Block rto / returned
      const isRto =
        s.includes("rto") ||
        s.includes("rtd") ||
        s.includes("return") ||
        s.includes("returned") ||
        s.includes("to origin");

      return !isDelivered && !isRto;
    });

      return out;
    }

    // Normal status filter
    if (statusFilter && statusFilter !== "all") {
      const sf = statusFilter.toLowerCase();
      out = out.filter((r) =>
        (r.last_status ?? "").toLowerCase().includes(sf)
      );
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

  // Mapping sortable columns
  function colKey(label: string) {
    const map: any = {
      "AWB": "awb",
      "Status": "last_status",
      "Booked": "booked_on",
      "Last Update": "last_updated_on",
      "Origin": "origin",
      "Destination": "destination",
    };
    return map[label] || label;
  }

  // ----------------- Render -----------------
  return (
  <div className="space-y-4 px-4 md:px-2 lg:px-0 py-0">

    {/* Page Title */}
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Track Consignments</h1>
      <p className="text-sm text-muted-foreground mt-1">
        Search, filter, manage, export & analyze your tracking data.
      </p>
    </div>

    {/* Upload Card */}
    <Card className="shadow-sm border">
      <CardContent className="py-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <input id="excelUpload" type="file" accept=".xlsx,.xls" onChange={handleFileInput} className="hidden" />

            <Button variant="outline" onClick={() => document.getElementById("excelUpload")?.click()}>
              <Upload className="mr-2 h-4 w-4" /> Upload Excel
            </Button>

            {selectedFile && (
              <>
                <span className="px-2 py-1 bg-muted/50 rounded border text-xs">
                  {selectedFile}
                </span>
                <Button variant="ghost" size="sm" onClick={() => { setSelectedFile(""); setLoadedAwbs([]); }}>
                  ✖ Remove
                </Button>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={runBatchTracking} disabled={loading || loadedAwbs.length === 0}>
              {loading ? "Tracking..." : "Track (Batched)"}
            </Button>

            <Button variant="outline" onClick={exportToExcel}>
              <DownloadCloud className="mr-2 h-4 w-4" /> Export All
            </Button>

            <Button variant="secondary" onClick={() => fetchPage(true)}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>

            <Button
              variant="outline"
              onClick={() => {
                if (!rows.length) return toast("No rows to export.");
                // export filtered rows only
                const data = [
                  ["AWB", "Status", "Booked", "Last", "Origin", "Dest", "Remarks"],
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
                XLSX.utils.book_append_sheet(wb, ws, "Filtered");
                const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
                const blob = new Blob([out]);
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `filtered-tracking-${new Date().toISOString().slice(0,19).replace(/[:T]/g,"-")}.xlsx`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Export Filtered
            </Button>

          </div>
        </div>

        <div className="mt-4">
          <Progress value={progress.total ? Math.round((progress.done / progress.total) * 100) : 0} />
          <div className="text-xs text-muted-foreground mt-1">
            Progress: {progress.done}/{progress.total} (
            {progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%)
          </div>
        </div>
      </CardContent>
    </Card>

    {/* Filters */}
    <Card className="shadow-sm border top-16 z-30 backdrop-blur bg-white/95">
      <CardContent>
        <div className="flex flex-col md:flex-row gap-3 items-center">

          <Input
            placeholder="Search AWB"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full md:w-64"
          />

          <Select
            value={statusFilter === "pending" ? "all" : statusFilter}
            onValueChange={(v) => {
              if (v === "pending") return;
              setStatusFilter(v as StatusFilterType);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
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

          {/* Date Filters */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">From</span>
            <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />

            <span className="text-sm text-muted-foreground">To</span>
            <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
          </div>

          {/* TAT */}
          <Select value={tatFilter} onValueChange={(v) => { setTatFilter(v); setPage(1); }}>
            <SelectTrigger className="w-40"><SelectValue placeholder="TAT" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="very critical">Very Critical</SelectItem>
            </SelectContent>
          </Select>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Page size</span>
            <Input
              type="number"
              value={pageSize}
              onChange={(e) => { setPageSize(Math.max(5, Number(e.target.value))); setPage(1); }}
              className="w-20"
            />
          </div>
        </div>
      </CardContent>
    </Card>

    {/* Table */}
    <Card className="shadow-sm border">
      <CardContent className="p-0">
        <ScrollArea>
          <Table className="text-sm">
            <TableHeader className="bg-slate-50 sticky top-0 z-20">
              <TableRow>

                {/* --- Sortable columns --- */}
                {[
                  "AWB",
                  "Status",
                  "Booked",
                  "Last Update",
                  "Origin",
                  "Destination",
                ].map((col) => (
                  <TableHead
                    key={col}
                    className="cursor-pointer select-none hover:bg-muted/40"
                    onClick={() => {
                      setRows([...rows].sort((a: any, b: any) =>
                        (a[colKey(col)] ?? "").localeCompare(b[colKey(col)] ?? "")
                      ));
                    }}
                  >
                    {col} ▲▼
                  </TableHead>
                ))}

                <TableHead>TAT</TableHead>
                <TableHead>Movement</TableHead>
                <TableHead>Timeline</TableHead>
                <TableHead></TableHead>
                <TableHead></TableHead>

              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-6 text-muted-foreground">
                    No results found for selected filters.
                  </TableCell>
                </TableRow>
              )}

              {rows.map((r) => {
                const tatLabel = localComputeTAT(r);
                const movementLabel = localComputeMovement(r);

                return (
                  <TableRow
                    key={r.awb}
                    className={`${tatLabel === "Very Critical" ? "bg-red-50" : ""} hover:bg-muted/40 transition`}
                  >
                    <TableCell className="font-semibold">{r.awb}</TableCell>
                    <TableCell>{r.last_status ?? "-"}</TableCell>
                    <TableCell>{r.booked_on ?? "-"}</TableCell>
                    <TableCell>{r.last_updated_on ?? "-"}</TableCell>
                    <TableCell>{r.origin ?? "-"}</TableCell>
                    <TableCell>{r.destination ?? "-"}</TableCell>

                    {/* Critical TAT Highlight */}
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
                        <summary className="cursor-pointer text-primary text-sm">Timeline</summary>
                        <div className="mt-2 text-xs">
                          {r.timeline?.length ? (
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

                    {/* PDF Label Button */}
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          try {
                            // STEP 1: Fetch DTDC Label
                            const res = await fetch("/api/dtdc/label", {
                              method: "POST",
                              body: JSON.stringify({ awb: r.awb }),
                            });

                            const json = await res.json();

                            if (!json?.data?.[0]?.label) {
                              toast.error(json?.error?.message || "DTDC label not available");
                              return;
                            }

                            const dtdcBase64 = json.data[0].label;

                            // STEP 2: Generate Custom Label
                            const customPdf = await generateCustomLabel({
                              awb: r.awb,
                              company: "Masala Store Pvt Ltd",
                              address: "Indore, Madhya Pradesh",
                              phone: "+91 98765 43210",
                            });

                            // STEP 3: Merge Both PDFs
                            const mergedBytes = await mergePDFs(customPdf, dtdcBase64);

                            // STEP 4: Trigger Download
                            const blob = new Blob([mergedBytes], { type: "application/pdf" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `LABEL_${r.awb}.pdf`;
                            a.click();
                            URL.revokeObjectURL(url);

                            toast.success("Label downloaded");

                          } catch (err) {
                            console.error(err);
                            toast.error("Failed to generate combined label");
                          }
                        }}
                      >
                        PDF
                      </Button>
                    </TableCell>

                    <TableCell>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => retrySingle(r.awb)}
                      >
                        Retry
                      </Button>
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
      <div className="text-sm text-muted-foreground">
        Showing {rows.length} — Page {page}/{totalPages}
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => setPage(1)} disabled={page === 1}>First</Button>
        <Button size="sm" variant="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Prev</Button>
        <div className="px-3 py-1 border rounded bg-muted/40">{page}</div>
        <Button size="sm" variant="ghost" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</Button>
        <Button size="sm" variant="ghost" onClick={() => setPage(totalPages)} disabled={page === totalPages}>Last</Button>
      </div>
    </div>

  </div>
);
}
