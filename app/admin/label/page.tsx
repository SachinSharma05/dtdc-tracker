"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Loader2, Download, FileText } from "lucide-react";
import toast from "react-hot-toast";

import { generateCustomLabel } from "../../utils/pdf/customeLabel";
import { mergePDFs } from "../../utils/pdf/merge";

export default function GenerateLabelPage() {
  const [awb, setAwb] = useState("");
  const [loading, setLoading] = useState(false);

  async function generate() {
    if (!awb.trim()) {
      toast.error("Please enter AWB");
      return;
    }

    try {
      setLoading(true);

      // Step 1: Get DTDC Label
      const res = await fetch("/api/dtdc/label", {
        method: "POST",
        body: JSON.stringify({ awb }),
      });

      const json = await res.json();

      if (!json?.data || !json.data[0]?.label) {
        toast.error("Failed to retrieve DTDC label");
        setLoading(false);
        return;
      }

      const dtdcBase64 = json.data[0].label;

      // Step 2: Generate Custom Label
      const customPdf = await generateCustomLabel({
        awb,
        company: "Masala Store Pvt Ltd",
        address: "Indore, Madhya Pradesh",
        phone: "+91 98765 43210",
      });

      // Step 3: Merge PDFs
      const mergedPdfBytes = await mergePDFs(customPdf, dtdcBase64);

      // Step 4: Download Final Combined PDF
      const blob = new Blob([mergedPdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `LABEL_${awb}.pdf`;
      a.click();
      toast.success("Label generated");

    } catch (error) {
      console.error(error);
      toast.error("Failed to generate label");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-6 py-6 space-y-6">
      <Card className="max-w-xl mx-auto">
        <CardHeader>
          <CardTitle>Generate Shipping Label</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">

          <div className="space-y-1">
            <label className="text-sm font-medium">Enter AWB Number</label>
            <Input
              placeholder="D2004784350"
              value={awb}
              onChange={(e) => setAwb(e.target.value)}
            />
          </div>

          <Button onClick={generate} disabled={loading} className="w-full">
            {loading ? (
              <Loader2 className="animate-spin h-4 w-4 mr-2" />
            ) : (
              <FileText className="h-4 w-4 mr-2" />
            )}
            Generate Combined Label
          </Button>

        </CardContent>
      </Card>
    </div>
  );
}
