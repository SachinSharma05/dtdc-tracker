// app/admin/reports/page.tsx
"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ArrowUpRight, Clock, Box } from "lucide-react";

export default function AdminHome() {
  const [stats, setStats] = useState({ total: 0, delivered: 0, rto: 0, pending: 0 });
  const [latest, setLatest] = useState<any[]>([]);

  async function fetchStats() {
    try {
      const res = await fetch("/api/dtdc/stats");
      const json = await res.json();
      if (json?.error) return toast.error(json.error);
      setStats(json);
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function fetchLatest() {
    try {
      const res = await fetch("/api/dtdc/consignments?page=1&pageSize=10&sortBy=created_at&sortOrder=desc");
      const json = await res.json();
      if (json?.error) return toast.error(json.error);
      setLatest(json.items ?? []);
    } catch (e) {
      toast.error(String(e));
    }
  }

  useEffect(() => {
    fetchStats();
    fetchLatest();
  }, []);

  return (
    <div className="space-y-4 px-4 md:px-2 lg:px-0 py-0">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Reports & Dashboard</h1>

        <div className="flex items-center gap-2">
          <Button onClick={fetchStats} variant="outline" size="sm">
            Refresh
          </Button>
          <Link href="/admin/track">
            <Button size="sm">Open Track</Button>
          </Link>
        </div>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">

        {/* Total */}
        <Link href="/admin/track?status=all">
          <Card className="hover:shadow-lg cursor-pointer transition">
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="text-sm">Total Tracked</CardTitle>
              <Badge variant="secondary">All</Badge>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-xs text-muted-foreground mt-1">Total consignments tracked</div>
            </CardContent>
          </Card>
        </Link>

        {/* Delivered */}
        <Link href="/admin/track?status=delivered">
          <Card className="hover:shadow-lg cursor-pointer transition">
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="text-sm">Delivered</CardTitle>
              <Badge variant="default">Success</Badge>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.delivered}</div>
              <div className="text-xs text-muted-foreground mt-1">Successfully delivered</div>
            </CardContent>
          </Card>
        </Link>

        {/* Pending */}
        <Link href="/admin/track?status=pending">
          <Card className="hover:shadow-lg cursor-pointer transition">
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="text-sm">Pending</CardTitle>
              <Badge variant="outline">Open</Badge>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pending}</div>
              <div className="text-xs text-muted-foreground mt-1">Not yet delivered</div>
            </CardContent>
          </Card>
        </Link>

        {/* RTO */}
        <Link href="/admin/track?status=rto">
          <Card className="hover:shadow-lg cursor-pointer transition">
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="text-sm">RTO</CardTitle>
              <Badge variant="destructive">RTO</Badge>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.rto}</div>
              <div className="text-xs text-muted-foreground mt-1">Returned to origin</div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Latest consignments */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between w-full">
            <CardTitle>Latest consignments</CardTitle>
            <div className="text-sm text-muted-foreground">{latest.length} shown</div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <ScrollArea className="max-h-[420px]">
            <ul className="divide-y">
              {latest.length === 0 && (
                <li className="p-4 text-sm text-muted-foreground">No recent consignments found.</li>
              )}

              {latest.map((r: any) => (
                <li key={r.awb} className="flex items-center gap-3 p-4">
                  <div className="w-12 flex-shrink-0">
                    <div className="h-10 w-10 rounded-md bg-slate-50 flex items-center justify-center text-sm font-semibold">
                      {String(r.awb || "").slice(0, 2)}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <div className="font-medium text-sm">{r.awb}</div>
                        <div className="text-xs text-muted-foreground">{r.origin} → {r.destination}</div>
                      </div>

                      <div className="text-right">
                        <div className="text-sm">{r.last_status ?? "-"}</div>
                        <div className="text-xs text-muted-foreground mt-1">{r.last_updated_on ?? ""}</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link href={`/admin/dtdc/${encodeURIComponent(r.awb)}`}>
                      <Button size="sm" variant="outline">
                        View Details <ArrowUpRight className="ml-2" size={14} />
                      </Button>
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
