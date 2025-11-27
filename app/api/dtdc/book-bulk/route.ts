import { NextResponse } from "next/server";

const DEFAULT_URL = "https://app.shipsy.in/api/customer/integration/consignment/softdata";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.consignments || !Array.isArray(body.consignments)) {
      return NextResponse.json({ error: { message: "Missing consignments array" } }, { status: 400 });
    }

    const apiUrl = process.env.DTDC_API_URL || DEFAULT_URL;
    const apiKey = process.env.DTDC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: { message: "Server misconfigured: missing DTDC_API_KEY" } }, { status: 500 });
    }

    const forwardRes = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({ consignments: body.consignments }),
    });

    const json = await forwardRes.json();
    // forward the exact response from DTDC
    return NextResponse.json(json, { status: forwardRes.status });
  } catch (err: any) {
    return NextResponse.json({ error: { message: String(err.message || err) } }, { status: 500 });
  }
}
