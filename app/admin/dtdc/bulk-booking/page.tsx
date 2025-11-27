"use client";

import React, { useState, useMemo } from "react";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import toast from "react-hot-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";

type CsvRow = {
  reference_number?: string;
  service_type_id?: string;
  load_type?: string;
  weight?: string;
  origin_name?: string;
  origin_phone?: string;
  origin_pincode?: string;
  dest_name?: string;
  dest_phone?: string;
  dest_pincode?: string;
  // allow extra fields later; ignored now
  [k: string]: any;
};

type PreviewItem = {
  rowIndex: number;
  data: CsvRow;
  generatedRef?: string;
  errors: string[];
  status?: "pending" | "success" | "error";
  message?: string;
  response?: any;
};

const REQUIRED_FIELDS = [
  "service_type_id",
  "load_type",
  "weight",
  "origin_name",
  "origin_phone",
  "origin_pincode",
  "dest_name",
  "dest_phone",
  "dest_pincode",
];

function pad(num: number, size = 4) {
  return String(num).padStart(size, "0");
}

function genDatePrefix() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${dd}`; // YYYYMMDD
}

export default function BulkBookingPage() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const datePrefix = useMemo(() => genDatePrefix(), []);
  const [counterStart] = useState(() => Math.floor(Math.random() * 9000) + 1); // simple local start

  // parse CSV file
  async function handleFile(file: File) {
    setFileName(file.name);
    setPreview([]);
    const text = await file.text();
    const parsed = Papa.parse<CsvRow>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      transform: (v) => v?.trim?.(),
    });

    if (parsed.errors.length) {
      toast.error(
        `CSV parse error: ${parsed.errors.map((e) => e.message).join(", ")}`
      );
    }

    const rows = parsed.data.map((row, idx) => {
      // normalize keys to lower_case underscored (if users use different casing)
      const normalized: CsvRow = {};
      Object.keys(row).forEach((k) => {
        if (!k) return;
        const nk = k.trim().toLowerCase();
        normalized[nk] = row[k];
      });

      // Build item
      const item: PreviewItem = {
        rowIndex: idx,
        data: normalized,
        errors: [],
        status: "pending",
      };

      // validate minimal fields
      REQUIRED_FIELDS.forEach((f) => {
        if (!normalized[f]) {
          item.errors.push(`${f} is required`);
        }
      });

      // validate load_type
      if (normalized["load_type"]) {
        const lt = normalized["load_type"].toUpperCase();
        if (!["DOCUMENT", "NON-DOCUMENT"].includes(lt)) {
          item.errors.push("load_type must be DOCUMENT or NON-DOCUMENT");
        } else {
          item.data.load_type = lt;
        }
      }

      return item;
    });

    setPreview(rows);
    toast({ title: `Loaded ${rows.length} rows`, description: "Preview shows parsed data" });
  }

  // fill/generate reference numbers for rows with empty ref
  function ensureReferences(items: PreviewItem[]) {
    let seq = 1;
    // start from counterStart to avoid collisions across sessions (simple approach)
    seq += counterStart;
    return items.map((it, i) => {
      const data = { ...it.data };
      const existing = (data.reference_number || "").trim();
      if (existing) {
        it.generatedRef = existing;
      } else {
        // BK-YYYYMMDD-0001
        it.generatedRef = `BK-${datePrefix}-${pad(seq + i)}`;
      }
      return { ...it, data: { ...data, reference_number: it.generatedRef } };
    });
  }

  // chunk array into subarrays of size n
  function chunkArray<T>(arr: T[], size = 20) {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      out.push(arr.slice(i, i + size));
    }
    return out;
  }

  // build consignments payload per DTDC spec (minimal mapping)
  function toConsignment(it: PreviewItem) {
    const d = it.data;
    return {
      customer_code: process.env.NEXT_PUBLIC_DTDC_CUSTOMER_CODE || "",
      reference_number: d.reference_number,
      service_type_id: d.service_type_id,
      load_type: d.load_type,
      weight: d.weight,
      weight_unit: "kg",
      origin_details: {
        name: d.origin_name,
        phone: d.origin_phone,
        address_line_1: d.origin_address_line_1 || "",
        pincode: d.origin_pincode,
        city: d.origin_city || "",
        state: d.origin_state || "",
      },
      destination_details: {
        name: d.dest_name,
        phone: d.dest_phone,
        address_line_1: d.dest_address_line_1 || "",
        pincode: d.dest_pincode,
        city: d.dest_city || "",
        state: d.dest_state || "",
      },
    };
  }

  // main submit: chunk in 20, POST sequentially and update preview status
  async function handleSubmit() {
    if (!preview.length) {
      toast({ title: "No data", description: "Please upload a CSV first", variant: "destructive" });
      return;
    }

    // check if any errors exist
    const hasErrors = preview.some((p) => p.errors.length > 0);
    if (hasErrors) {
      toast({ title: "Validation errors", description: "Fix CSV rows marked with errors first", variant: "destructive" });
      return;
    }

    setUploading(true);
    setProgress(0);

    // ensure refs
    let items = ensureReferences(preview);

    const batches = chunkArray(items, 20);
    const totalBatches = batches.length;
    let completedBatches = 0;

    for (const batch of batches) {
      const consignments = batch.map((b) => toConsignment(b));
      try {
        const res = await fetch("/api/dtdc/book-bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ consignments }),
        });

        const json = await res.json();

        // mark items according to response (each consignment processed independently)
        if (json?.status === "OK" && Array.isArray(json.data)) {
          // map each response by reference_number
          for (const resp of json.data) {
            const ref = resp.reference_number || resp?.data?.reference_number;
            const idx = items.findIndex((it) => it.data.reference_number === ref);
            if (idx >= 0) {
              if (resp.success) {
                items[idx].status = "success";
                items[idx].message = "Booking created";
                items[idx].response = resp;
              } else {
                items[idx].status = "error";
                items[idx].message = resp.message || resp.reason || "Failed";
                items[idx].response = resp;
              }
            } else {
              // fallback: mark first pending if no match
              const firstPending = items.find((it) => it.status === "pending");
              if (firstPending) {
                firstPending.status = resp.success ? "success" : "error";
                firstPending.message = resp.message || resp.reason || "Result";
                firstPending.response = resp;
              }
            }
          }
        } else if (json?.error) {
          // whole batch error (400/401 etc)
          batch.forEach((b) => {
            const idx = items.findIndex((it) => it.data.reference_number === b.data.reference_number);
            if (idx >= 0) {
              items[idx].status = "error";
              items[idx].message = json.error.message || "Batch error";
              items[idx].response = json.error;
            }
          });
        } else {
          // unknown response
          batch.forEach((b) => {
            const idx = items.findIndex((it) => it.data.reference_number === b.data.reference_number);
            if (idx >= 0) {
              items[idx].status = "error";
              items[idx].message = "Unknown response";
            }
          });
        }
      } catch (err: any) {
        batch.forEach((b) => {
          const idx = items.findIndex((it) => it.data.reference_number === b.data.reference_number);
          if (idx >= 0) {
            items[idx].status = "error";
            items[idx].message = String(err.message || err);
          }
        });
      }

      completedBatches++;
      setProgress(Math.round((completedBatches / totalBatches) * 100));
      setPreview([...items]);
      // small pause optionally to avoid hammering remote; omitted for speed
    }

    setUploading(false);
    toast({ title: "Upload complete", description: `Processed ${items.length} consignments` });
  }

  return (
    <div className="space-y-4 px-4 md:px-2 lg:px-0 py-0">
        <h1 className="text-2xl font-bold tracking-tight">Bulk Booking — CSV Upload</h1>
      <Card className="p-0">
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="col-span-2">
              <Label>CSV file (columns):</Label>
              <div className="text-sm mb-2">
                reference_number (optional), service_type_id, load_type (DOCUMENT|NON-DOCUMENT), weight,
                origin_name, origin_phone, origin_pincode, dest_name, dest_phone, dest_pincode
              </div>

              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
                className="block"
              />
              {fileName && <div className="mt-2 text-muted-foreground">Loaded: {fileName}</div>}
            </div>

            <div className="flex flex-col gap-2 items-end">
              <div>
                <Button onClick={() => {
                  // Quick sample CSV download
                  const sample = `reference_number,service_type_id,load_type,weight,origin_name,origin_phone,origin_pincode,dest_name,dest_phone,dest_pincode
,PRIORITY,DOCUMENT,0.5,Sender A,9999999999,110001,Receiver A,8888888888,400001
REF-ABC,PRIORITY,NON-DOCUMENT,1.5,Sender B,7777777777,110002,Receiver B,6666666666,400002
`;
                  const blob = new Blob([sample], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "dtdc_bulk_sample.csv";
                  a.click();
                  URL.revokeObjectURL(url);
                }}>
                  Download Sample CSV
                </Button>
              </div>

              <div>
                <Button variant="secondary" onClick={() => {
                  // clear
                  setFileName(null);
                  setPreview([]);
                  setProgress(0);
                }}>
                  Clear
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Preview & Validation</CardTitle>
        </CardHeader>
        <CardContent>
          {preview.length === 0 ? (
            <div className="text-sm text-muted-foreground">No rows loaded yet.</div>
          ) : (
            <>
              <div className="mb-3">
                <Progress value={progress} className="w-full" />
                <div className="text-sm mt-2">Progress: {progress}%</div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Load</TableHead>
                    <TableHead>Origin</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Errors / Message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((p, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{p.rowIndex + 1}</TableCell>
                      <TableCell>{p.data.reference_number || p.generatedRef || "-"}</TableCell>
                      <TableCell>{p.data.service_type_id}</TableCell>
                      <TableCell>{p.data.load_type}</TableCell>
                      <TableCell>
                        {p.data.origin_name}<br />
                        {p.data.origin_phone}<br />
                        {p.data.origin_pincode}
                      </TableCell>
                      <TableCell>
                        {p.data.dest_name}<br />
                        {p.data.dest_phone}<br />
                        {p.data.dest_pincode}
                      </TableCell>
                      <TableCell className={p.status === "success" ? "text-green-600" : p.status === "error" ? "text-red-600" : ""}>
                        {p.status || "pending"}
                      </TableCell>
                      <TableCell>
                        {p.errors.length ? (<ul className="text-sm text-red-600">{p.errors.map((e,i)=> <li key={i}>{e}</li>)}</ul>) : (p.message || "-")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex gap-2 mt-4">
                <Button onClick={handleSubmit} disabled={uploading}>
                  {uploading ? "Uploading..." : "Start Bulk Upload"}
                </Button>
                <Button variant="ghost" onClick={() => {
                  // regenerate refs for preview (useful after fixes)
                  setPreview(ensureReferences(preview));
                }}>
                  Ensure / Regenerate References
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
