import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { awb } = await req.json();

    const API_KEY = process.env.DTDC_LABEL_API_KEY;
    if (!API_KEY) {
      return NextResponse.json(
        { error: "Missing DTDC_LABEL_API_KEY" },
        { status: 500 }
      );
    }

    const res = await fetch(
      "https://app.shipsy.in/api/customer/integration/consignment/label/multipiece",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": API_KEY,
        },
        body: JSON.stringify({ reference_number: awb }),
      }
    );

    const json = await res.json();
    return NextResponse.json(json);

  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
