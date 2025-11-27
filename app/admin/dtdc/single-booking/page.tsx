"use client";

import { useForm } from "react-hook-form";
import { useEffect, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import toast from "react-hot-toast";

export default function SingleBookingPage() {
  const [loading, setLoading] = useState(false);

  // Dynamic DB settings
  const [serviceTypes, setServiceTypes] = useState<any[]>([]);
  const [weightSlabs, setWeightSlabs] = useState<any[]>([]);

  // Price
  const [price, setPrice] = useState<number | null>(null);
  const [priceDetails, setPriceDetails] = useState<any>(null);

  // Fetch Courier Settings
  async function loadSettings() {
    const s = await fetch("/api/settings/courier/services").then((r) => r.json());
    const w = await fetch("/api/settings/courier/weights").then((r) => r.json());
    setServiceTypes(s);
    setWeightSlabs(w);
  }

  // Auto-fetch city/state based on pincode
  async function fetchPincodeDetails(pin: string, type: "origin" | "dest") {
  if (!pin || pin.length < 6) return;

    const res = await fetch(`/api/pincode?pin=${pin}`);
    const json = await res.json();

    if (json.found) {
      form.setValue(`${type}_city`, json.city);
      form.setValue(`${type}_state`, json.state);
    } else {
      toast.error("Invalid pincode");
    }
  }

  // Form
  const form = useForm({
    defaultValues: {
      reference_number: "",
      service_type_id: "",
      load_type: "DOCUMENT",
      weight: "",
      length: "",
      width: "",
      height: "",
      origin_name: "",
      origin_phone: "",
      origin_pincode: "",
      origin_city: "",
      origin_state: "",
      dest_name: "",
      dest_phone: "",
      dest_pincode: "",
      dest_city: "",
      dest_state: "",
    },
  });

  const loadType = form.watch("load_type");

  // Price Estimate
  async function updatePrice() {
    const values = form.getValues();

    if (!values.service_type_id || !values.weight) return;

    const res = await fetch("/api/settings/courier/price-estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_type_id: values.service_type_id,
        weight: Number(values.weight),
        load_type: values.load_type,
        origin_pincode: values.origin_pincode,
        dest_pincode: values.dest_pincode,
        length: values.length,
        width: values.width,
        height: values.height,
      }),
    });

    const data = await res.json();

    if (data.success) {
      setPrice(data.total);
      setPriceDetails(data.breakdown);
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  // Watchers for auto price update
  useEffect(() => {
    updatePrice();
  }, [
    form.watch("service_type_id"),
    form.watch("weight"),
    form.watch("load_type"),
    form.watch("origin_pincode"),
    form.watch("dest_pincode"),
    form.watch("length"),
    form.watch("width"),
    form.watch("height"),
  ]);

  // Submit
  const onSubmit = async (values: any) => {
    setLoading(true);

    // Basic validation
    if (!values.origin_name || !values.dest_name) {
      toast.error("Sender and Receiver names are required.");
      setLoading(false);
      return;
    }

    const consignment = {
      customer_code: process.env.NEXT_PUBLIC_DTDC_CUSTOMER_CODE,
      reference_number: values.reference_number || `AUTO-${Date.now()}`,
      service_type_id: values.service_type_id,
      load_type: values.load_type,
      weight: values.weight,
      weight_unit: "kg",

      ...(values.load_type === "NON-DOCUMENT" && {
        dimension_unit: "cm",
        length: values.length,
        width: values.width,
        height: values.height,
      }),

      origin_details: {
        name: values.origin_name,
        phone: values.origin_phone,
        address_line_1: "NA",
        pincode: values.origin_pincode,
        city: values.origin_city,
        state: values.origin_state,
      },
      destination_details: {
        name: values.dest_name,
        phone: values.dest_phone,
        address_line_1: "NA",
        pincode: values.dest_pincode,
        city: values.dest_city,
        state: values.dest_state,
      },
    };

    const res = await fetch("/api/dtdc/book-single", {
      method: "POST",
      body: JSON.stringify({ consignments: [consignment] }),
    });

    const json = await res.json();

    if (json?.data?.[0]?.success) {
      toast.success(`Booking Successful — AWB: ${json.data[0].reference_number}`);
    } else {
      toast.error(json?.data?.[0]?.message || "Booking failed");
    }

    setLoading(false);
  };

  return (
    <div className="space-y-4 px-4 md:px-2 lg:px-0 py-0 max-w-6xl mx-auto">

      {/* Page Title */}
      <h1 className="text-2xl font-bold tracking-tight mb-2">Single Consignment Booking</h1>

      <Card className="shadow-sm border">
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

              {/* LEFT PANEL */}
              <div className="space-y-6">

                <h2 className="font-semibold text-lg">Booking Details</h2>

                {/* Reference Number */}
                <div>
                  <Label>Reference Number (Optional)</Label>
                  <Input placeholder="Auto-generated if empty" {...form.register("reference_number")} />
                </div>

                {/* Service Type */}
                <div>
                  <Label>Service Type</Label>
                  <Select
                    onValueChange={(v) => form.setValue("service_type_id", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Service Type" />
                    </SelectTrigger>
                    <SelectContent>
                      {serviceTypes.map((s) => (
                        <SelectItem key={s.id} value={s.name}>
                          {s.name} (₹{s.base_price})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Load Type */}
                <div>
                  <Label>Load Type</Label>
                  <Select onValueChange={(v) => form.setValue("load_type", v)} defaultValue="DOCUMENT">
                    <SelectTrigger>
                      <SelectValue placeholder="Select Load Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DOCUMENT">DOCUMENT</SelectItem>
                      <SelectItem value="NON-DOCUMENT">NON-DOCUMENT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Weight */}
                <div>
                  <Label>Weight (KG)</Label>
                  <Select onValueChange={(v) => form.setValue("weight", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Weight Slab" />
                    </SelectTrigger>
                    <SelectContent>
                      {weightSlabs.map((w) => (
                        <SelectItem
                          key={w.id}
                          value={String(w.min_weight)}
                        >
                          {w.min_weight} - {w.max_weight} KG (₹{w.price})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Dimensions for Non-doc */}
                {loadType === "NON-DOCUMENT" && (
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Length (cm)</Label>
                      <Input type="number" {...form.register("length")} />
                    </div>
                    <div>
                      <Label>Width (cm)</Label>
                      <Input type="number" {...form.register("width")} />
                    </div>
                    <div>
                      <Label>Height (cm)</Label>
                      <Input type="number" {...form.register("height")} />
                    </div>
                  </div>
                )}

                {/* Price Box */}
                <div className="p-4 border rounded-lg bg-gray-50">
                  <p className="text-sm font-medium">Estimated Charge</p>
                  <p className="text-2xl font-bold mt-2">₹ {price ?? "---"}</p>

                  {priceDetails && (
                    <div className="mt-3 text-xs text-muted-foreground space-y-1">
                      <p>Service Base: ₹ {priceDetails.base_price}</p>
                      <p>Weight Charge: ₹ {priceDetails.weight_slab_charge}</p>
                      <p>Distance Charge: ₹ {priceDetails.distance_charge}</p>
                      {priceDetails.non_doc_surcharge > 0 && (
                        <p>Non-Doc Surcharge: ₹ {priceDetails.non_doc_surcharge}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT PANEL */}
              <div className="space-y-10">

                {/* Origin */}
                <div className="p-4 border rounded-lg bg-blue-50">
                  <h3 className="font-semibold mb-3">Sender (Origin) Details</h3>
                  <div className="space-y-3">
                    <Input placeholder="Name" {...form.register("origin_name")} />
                    <Input placeholder="Phone" {...form.register("origin_phone")} />
                    <Input
                      placeholder="Pincode"
                      {...form.register("origin_pincode")}
                      onBlur={(e) => fetchPincodeDetails(e.target.value, "origin")}
                    />
                    <Input placeholder="City" {...form.register("origin_city")} readOnly />
                    <Input placeholder="State" {...form.register("origin_state")} readOnly />
                  </div>
                </div>

                {/* Destination */}
                <div className="p-4 border rounded-lg bg-green-50">
                  <h3 className="font-semibold mb-3">Receiver (Destination) Details</h3>
                  <div className="space-y-3">
                    <Input placeholder="Name" {...form.register("dest_name")} />
                    <Input placeholder="Phone" {...form.register("dest_phone")} />
                    <Input
                      placeholder="Pincode"
                      {...form.register("dest_pincode")}
                      onBlur={(e) => fetchPincodeDetails(e.target.value, "dest")}
                    />
                    <Input placeholder="City" {...form.register("dest_city")} readOnly />
                    <Input placeholder="State" {...form.register("dest_state")} readOnly />
                  </div>
                </div>

              </div>
            </div>

            <Button className="mt-8 w-full" disabled={loading}>
              {loading ? "Submitting..." : "Create Booking"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
