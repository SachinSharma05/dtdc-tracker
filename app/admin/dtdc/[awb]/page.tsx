"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ClipboardCheck, Clock, RefreshCw } from "lucide-react";

// LocalStorage Helpers (unchanged)
const CACHE_KEY = "dtdc_awb_cache";
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000;

function loadCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveCache(data: any) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(data));
}

/* ------------------ Helpers that return ONLY allowed shadcn Badge variants ------------------ */
/* Allowed: "default" | "destructive" | "outline" | "secondary" */

function getTatVariant(t: string | undefined): "default" | "destructive" | "outline" | "secondary" {
  if (!t) return "default";
  if (t === "On Time") return "secondary";
  if (t === "Warning") return "outline";
  return "destructive"; // Critical / Very Critical -> destructive
}

function getMovementVariant(m: string | undefined): "default" | "destructive" | "outline" | "secondary" {
  if (!m) return "default";
  if (m === "On Time") return "secondary";
  if (m.includes("72") || m.toLowerCase().includes("stuck")) return "destructive";
  if (m.includes("48")) return "outline";
  if (m.includes("24")) return "outline";
  return "default";
}

/* ------------------------------------------------------------------------------------------- */

export default function DetailPage({ params }: { params: Promise<{ awb: string }> }) {
  const { awb } = use(params);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  async function fetchDetail(forceRefresh = false) {
    let cache = loadCache();

    if (!forceRefresh && cache[awb] && Date.now() - cache[awb].timestamp < CACHE_DURATION_MS) {
      setData(cache[awb].data);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/dtdc/detail?awb=${awb}`);
      const json = await res.json();

      if (json.success) {
        cache[awb] = { timestamp: Date.now(), data: json };
        saveCache(cache);
      }

      setData(json);
    } catch (error) {
      console.error(error);
      setData(null);
    }

    setLoading(false);
  }

  useEffect(() => {
    fetchDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awb]);

  if (loading) return <LoadingUI />;
  if (!data?.success) return <ErrorUI message={data?.message || "No data found"} />;

  const { summary, currentStatus, timeline, history, reports, tat, movement, consignment } = data;

  // Build display labels with safe fallbacks
  const tatLabel = tat ?? "Unknown";
  const movementLabel = movement ?? "Unknown";

  return (
    <div className="space-y-6 px-4 md:px-6 lg:px-8 py-6">
      {/* Title + breadcrumb */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <nav className="text-sm text-muted-foreground mb-2">
            <Link href="/admin" className="hover:text-primary">Dashboard</Link>
            <span className="mx-2">/</span>
            <Link href="/admin/track" className="hover:text-primary">Track</Link>
            <span className="mx-2">/</span>
            <span className="font-medium text-primary">{awb}</span>
          </nav>

          <h1 className="text-2xl md:text-3xl font-bold">Shipment Detail — <span className="text-blue-600">{awb}</span></h1>
          <p className="text-sm text-muted-foreground mt-1">Complete tracking information and timeline for this AWB</p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => { setLoading(true); fetchDetail(true); }}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>

          <Link href={`/admin/track`}>
            <Button variant="outline" size="sm">Back to List</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        {/* Summary card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarFallback>{(summary?.awb || "").slice(0, 2)}</AvatarFallback>
                </Avatar>
                <CardTitle className="text-lg">Summary</CardTitle>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant={getTatVariant(String(tatLabel))}>{`TAT: ${tatLabel}`}</Badge>
                <Badge variant={getMovementVariant(String(movementLabel))}>{movementLabel}</Badge>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-2">
            <Row label="AWB" value={summary?.awb} />
            <Row label="Origin" value={summary?.origin} />
            <Row label="Destination" value={summary?.destination} />
            <Row label="Booked On" value={summary?.bookedOn} />
            <Row label="Last Updated" value={summary?.lastUpdatedOn} />
            <Row label="Pieces" value={summary?.pieces ?? "-"} />
          </CardContent>
        </Card>

        {/* Current status */}
        <Card>
          <CardHeader>
            <CardTitle>Current Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3">
              <div>
                <div className="text-xs text-muted-foreground">Status</div>
                <div className="font-semibold text-lg">{currentStatus?.status ?? "-"}</div>
                <div className="text-sm text-muted-foreground mt-1">{currentStatus?.date ?? ""} {currentStatus?.time ?? ""}</div>
              </div>

              <div className="ml-auto text-right">
                <div className="text-xs text-muted-foreground">Location</div>
                <div className="font-medium">{currentStatus?.location ?? "-"}</div>
                {currentStatus?.remarks && <div className="text-xs text-muted-foreground mt-1">{currentStatus.remarks}</div>}
              </div>
            </div>

            <Separator />

            <div className="flex gap-2 flex-wrap">
              <Badge variant="outline">Last Scan: {reports?.lastScanLocation ?? "-"}</Badge>
              <Badge variant={reports?.delivered ? "secondary" : "default"}>Delivered</Badge>
              <Badge variant={reports?.outForDelivery ? "secondary" : "default"}>OFD</Badge>
              <Badge variant={reports?.rto ? "destructive" : "default"}>RTO</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Reports & actions */}
        <Card>
          <CardHeader>
            <CardTitle>Reports & Actions</CardTitle>
          </CardHeader>

          <CardContent className="space-y-3">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">Status Overview</div>
                <div className="text-sm font-semibold">{summary?.currentStatus ?? "-"}</div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <SmallStat label="Delivered" value={reports?.delivered ? "Yes" : "No"} positive={Boolean(reports?.delivered)} />
                <SmallStat label="Out For Delivery" value={reports?.outForDelivery ? "Yes" : "No"} />
                <SmallStat label="RTO" value={reports?.rto ? "Yes" : "No"} negative={Boolean(reports?.rto)} />
                <SmallStat label="Delayed" value={reports?.delayed ? "Yes" : "No"} negative={Boolean(reports?.delayed)} />
              </div>

              <div className="flex gap-2 mt-2">
                <Link href={`/admin/dtdc/${awb}`}>
                  <Button size="sm">Open Full Detail</Button>
                </Link>

                <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard?.writeText(awb); toastSmall('Copied AWB'); }}>
                  <ClipboardCheck className="mr-2 h-4 w-4" /> Copy AWB
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>

        <CardContent>
          {timeline?.length ? (
            <div className="space-y-4">
              {timeline.map((t: any, i: number) => (
                <div key={i} className="flex gap-3">
                  <div className="w-12 text-center">
                    <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center">
                      <Clock className="h-5 w-5 text-slate-600" />
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">{t.date}</div>
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{t.action}</div>
                        <div className="text-sm text-muted-foreground">{t.origin || t.destination}</div>
                      </div>
                      <div className="text-xs text-muted-foreground">{t.time}</div>
                    </div>
                    {t.remarks && <div className="text-sm text-muted-foreground mt-2">{t.remarks}</div>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No timeline available</div>
          )}
        </CardContent>
      </Card>

      {/* Consignment details & history */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Consignment Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Row label="Origin" value={consignment?.origin} />
            <Row label="Destination" value={consignment?.destination} />
            <Row label="Booked On" value={consignment?.bookedOn} />
            <Row label="Last Updated" value={consignment?.lastUpdatedOn} />
            <Row label="Status" value={consignment?.lastStatus} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status History</CardTitle>
          </CardHeader>

          <CardContent>
            {history?.length ? (
              <ScrollArea className="h-56">
                <div className="space-y-3">
                  {history.map((h: any, i: number) => (
                    <div key={i} className="flex justify-between items-center">
                      <div>
                        <div className="font-medium">{h.oldStatus} → {h.newStatus}</div>
                        <div className="text-xs text-muted-foreground">{h.changedAt}</div>
                      </div>
                      <div className="text-sm text-muted-foreground">{h.by ?? "-"}</div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="text-sm text-muted-foreground">No history available</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Refresh button */}
      <div className="flex">
        <Button onClick={() => { setLoading(true); fetchDetail(true); }} className="ml-auto" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh from Server
        </Button>
      </div>
    </div>
  );
}

/* -------------------------- small UI helpers (shadcn style) ------------------------- */

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex justify-between text-sm">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-medium">{value ?? "-"}</div>
    </div>
  );
}

function SmallStat({ label, value, positive, negative }: any) {
  return (
    <div className="p-3 bg-muted/40 rounded border">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 font-semibold ${positive ? "text-green-600" : negative ? "text-red-600" : "text-foreground"}`}>{value}</div>
    </div>
  );
}

function toastSmall(msg: string) {
  try {
    alert(msg);
  } catch {}
}

/* -------------------------- Loading & Error (shadcn style) ------------------------- */

function LoadingUI() {
  return (
    <div className="p-6">
      <Card>
        <CardContent>
          <div className="animate-pulse space-y-2">
            <div className="h-6 bg-slate-200 rounded w-1/3"></div>
            <div className="h-4 bg-slate-200 rounded w-1/2"></div>
            <div className="h-4 bg-slate-200 rounded w-full"></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ErrorUI({ message }: any) {
  return (
    <div className="p-6">
      <Card>
        <CardContent>
          <div className="text-red-600 font-semibold">Error: {message}</div>
        </CardContent>
      </Card>
    </div>
  );
}
