import { NextResponse } from "next/server";

const AUTH_STAGING =
  "http://dtdcstagingapi.dtdc.com/dtdc-tracking-api/dtdc-api/api/dtdc/authenticate";
const AUTH_PROD =
  "https://blktracksvc.dtdc.com/dtdc-api/api/dtdc/authenticate";

const TRACK_STAGING =
  "http://dtdcstagingapi.dtdc.com/dtdc-tracking-api/dtdc-api/rest/JSONCnTrk/getTrackDetails";
const TRACK_PROD =
  "https://blktracksvc.dtdc.com/dtdc-api/rest/JSONCnTrk/getTrackDetails";

// In-memory token cache
let tokenCache: { token?: string; expiresAt?: number } = {};

async function getToken(username: string, password: string, staging: boolean) {
  const now = Date.now();
  if (
    tokenCache.token &&
    tokenCache.expiresAt &&
    tokenCache.expiresAt > now &&
    process.env.NODE_ENV === "development"
  ) {
    return tokenCache.token;
  }

  const url = staging ? AUTH_STAGING : AUTH_PROD;

  const res = await fetch(
    `${url}?username=${encodeURIComponent(
      username
    )}&password=${encodeURIComponent(password)}`
  );

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Auth failed: ${res.status} ${txt}`);
  }

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = { error: "Invalid JSON returned from DTDC" };
  }

  // Based on DTDC spec (PDF) – token is returned on 200
  const token =
    json?.token ||
    json?.Token ||
    json?.access_token ||
    json?.apikey ||
    json; // fallback

  const t = typeof token === "string" ? token : JSON.stringify(token);

  tokenCache = {
    token: t,
    expiresAt: now + 15 * 60 * 1000, // 15 min TTL
  };

  return t;
}

function parseDTDC(json: any) {
  if (!json) return { statusFlag: false, raw: json };

  const header = json.trackHeader ?? {};
  const details = json.trackDetails ?? [];

  return {
    header: {
      shipmentNo: header.strShipmentNo,
      origin: header.strOrigin,
      destination: header.strDestination,
      bookedOn: header.strBookedDate,
      currentStatus: header.strStatus,
      lastUpdatedOn: header.strStatusTransOn,
    },
    timeline: details,
    raw: json,
  };
}

export async function POST(req: Request) {
  try {
    const { consignments } = await req.json();

    if (!Array.isArray(consignments) || consignments.length === 0) {
      return NextResponse.json(
        { error: "consignments must be a non-empty array" },
        { status: 400 }
      );
    }

    const username = process.env.DTDC_USERNAME!;
    const password = process.env.DTDC_PASSWORD!;
    const staging =
      (process.env.DTDC_USE_STAGING ?? "true").toLowerCase() === "true";

    const token = await getToken(username, password, staging);
    const trackUrl = staging ? TRACK_STAGING : TRACK_PROD;

    const results = [];

    for (const cn of consignments) {
      try {
        const res = await fetch(trackUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Access-Token": token,
          },
          body: JSON.stringify({
            trkType: "cnno",
            strcnno: cn,
            addtnlDtl: "Y",
          }),
        });

        const json = await res.json().catch(() => null);

        results.push({
        cn,
        parsed: json?.trackHeader ? parseDTDC(json) : null,
        raw: json,
        error: json?.error || (json?.trackHeader ? null : "Invalid tracking data")
      });
      } catch (e: any) {
        results.push({
          cn,
          error: e.message,
        });
      }
    }

    return NextResponse.json({ results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
