"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle, XCircle } from "lucide-react";

const SERVICE_MAP: Record<string, string> = {
  PRIORITY: "Priority Air Express",
  STANDARD: "Standard Surface",
  COD: "Cash on Delivery",
  GROUND: "Ground Surface",
  PREMIUM: "Premium Plus",
  PTP: "Point To Point",
  PTP0200: "PTP 2 PM",
  PTP1200: "PTP 12 PM",
};

export default function PincodePage() {
  const [origin, setOrigin] = useState("");
  const [dest, setDest] = useState("");

  const [result, setResult] = useState<any>(null);
  const [services, setServices] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function check() {
    setError("");
    setResult(null);
    setServices([]);
    setLoading(true);

    const res = await fetch(`/api/dtdc/pincode?origin=${origin}&dest=${dest}`);
    const json = await res.json();
    setLoading(false);

    if (json.error) {
      setError(json.error);
      return;
    }

    if (!json.status) {
      setError(json.message || "No service found");
      return;
    }

    setResult(json);
    setServices(json.services || []);
  }

  function yesNoCard(title: string, available: boolean) {
    return (
      <Card className="p-3 text-center border">
        {available ? (
          <CheckCircle className="mx-auto text-green-600 mb-1" size={22} />
        ) : (
          <XCircle className="mx-auto text-red-500 mb-1" size={22} />
        )}
        <div className="font-medium text-sm">{title}</div>
        <div
          className={`text-xs ${
            available ? "text-green-600" : "text-red-500"
          }`}
        >
          {available ? "Available" : "Not Available"}
        </div>
      </Card>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">DTDC Pincode Serviceability</h1>

      {/* Input Card */}
      <Card className="p-6">
        <CardHeader>
          <CardTitle>Check Serviceability</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              placeholder="Origin Pincode"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
            />
            <Input
              placeholder="Destination Pincode"
              value={dest}
              onChange={(e) => setDest(e.target.value)}
            />

            <Button onClick={check} disabled={loading}>
              {loading ? "Checking..." : "Check"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Results */}
      {result && (
        <Card className="p-6 border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Service Availability
              {services.length > 0 ? (
                <Badge className="bg-green-600">Available</Badge>
              ) : (
                <Badge variant="destructive">Not Serviceable</Badge>
              )}
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {yesNoCard("Air Express", services.includes("PRIORITY"))}
              {yesNoCard("Ground", services.includes("GROUND"))}
              {yesNoCard("Standard", services.includes("STANDARD"))}
              {yesNoCard("COD", services.includes("COD"))}
              {yesNoCard("Premium", services.includes("PREMIUM"))}
              {yesNoCard("PTP", services.includes("PTP"))}
              {yesNoCard("PTP 12PM", services.includes("PTP1200"))}
              {yesNoCard("PTP 2PM", services.includes("PTP0200"))}
            </div>

            <div>
              <h3 className="font-semibold mb-2">Raw Service Codes</h3>
              {services.length === 0 ? (
                <p>No services available.</p>
              ) : (
                <ul className="space-y-1">
                  {services.map((code) => (
                    <li key={code} className="bg-gray-50 p-2 rounded border">
                      <div className="flex justify-between">
                        <span>{SERVICE_MAP[code] || code}</span>
                        <Badge variant="outline">{code}</Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
