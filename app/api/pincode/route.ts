import { NextResponse } from "next/server";
import { pinDB } from "../../../lib/pinDB";
import { indianPincodes } from "../../../db/pincodeSchema";
import { eq } from "drizzle-orm";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const pin = url.searchParams.get("pin");

  if (!pin || pin.length !== 6) {
    return NextResponse.json(
      { found: false, error: "Invalid Pincode" },
      { status: 400 }
    );
  }

  // SQLite supports .get() for single result
  const result = pinDB
    .select()
    .from(indianPincodes)
    .where(eq(indianPincodes.pincode, pin))
    .get();

  if (!result) {
    return NextResponse.json({ found: false });
  }

  return NextResponse.json({
    found: true,
    pincode: pin,
    office: result.office,
    city: result.district,
    district: result.district,
    state: result.state,
    region: result.region,
    division: result.division,
  });
}
