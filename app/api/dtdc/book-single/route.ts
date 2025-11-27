import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const response = await fetch(
      "https://app.shipsy.in/api/customer/integration/consignment/softdata",
      {
        method: "POST",
        headers: {
          "api-key": process.env.DTDC_API_KEY!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    const json = await response.json();
    return NextResponse.json(json);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
