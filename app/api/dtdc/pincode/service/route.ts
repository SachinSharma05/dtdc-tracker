// app/api/dtdc/pincode/service/route.ts
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const origin = searchParams.get("origin");
  const dest = searchParams.get("dest");

  if (!origin || !dest)
    return NextResponse.json({ error: "origin & dest required" });

  // Fetch token from our own auth API
  const auth = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/dtdc/pincode/auth`);
  const { token } = await auth.json();

  const url = `https://firstmileapi.dtdc.com/dtdc-api/api/custOrder/service/getServiceTypes/${origin}/${dest}`;

  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      "X-Access-Token": token,
    },
  });

  const json = await res.json();

  return NextResponse.json(json);
}
