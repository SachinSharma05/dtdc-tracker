// app/api/dtdc/pincode/auth/route.ts
import { NextResponse } from "next/server";

let cachedToken: string | null = null;
let tokenExpiry: number = 0;

export async function GET() {
  try {
    if (cachedToken && Date.now() < tokenExpiry) {
      return NextResponse.json({ token: cachedToken });
    }

    const username = process.env.DTDC_PINCODE_USERNAME!;
    const password = process.env.DTDC_PINCODE_PASSWORD!;

    const res = await fetch(
      `https://firstmileapi.dtdc.com/dtdc-api/intlapi/splcustomer/authenticate?username=${username}&password=${password}`
    );

    const json = await res.json();

    if (!json?.tokenKey) {
      return NextResponse.json({ error: "No token received", json });
    }

    cachedToken = json.tokenKey;
    tokenExpiry = Date.now() + 15 * 60 * 1000; // 15 minutes

    return NextResponse.json({ token: cachedToken });
  } catch (err: any) {
    return NextResponse.json({ error: err.message });
  }
}
