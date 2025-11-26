// app/api/dtdc/pincode/route.ts
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const origin = searchParams.get("origin");
  const dest = searchParams.get("dest");

  if (!origin || !dest) {
    return NextResponse.json({ error: "origin & dest required" });
  }

  const url = `https://firstmileapi.dtdc.com/dtdc-api/api/custOrder/service/getServiceTypes/${origin}/${dest}`;

  const token = process.env.DTDC_TRACKING_TOKEN;

  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      "X-Access-Token": token!,
    },
  });

  const json = await res.json();

  return NextResponse.json({
    raw: json,
    status: json.status ?? false,
    message: json.message ?? "",
    services: json.data ?? [],
    errorMessage: json.errorMessage ?? null
  });
}
