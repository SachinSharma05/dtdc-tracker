import { NextResponse } from "next/server";
import { db } from "../../../../db";
import {
  consignments,
  trackingEvents,
  trackingHistory,
} from "../../../../db/schema";
import { eq, and, sql } from "drizzle-orm";

// ==============================================================
// CONFIG — STATIC TOKEN PROVIDED BY DTDC
// ==============================================================
const TRACK_URL =
  "https://blktracksvc.dtdc.com/dtdc-api/rest/JSONCnTrk/getTrackDetails";

const DTDC_TRACKING_TOKEN = process.env.DTDC_TRACKING_TOKEN!;
const DTDC_CUSTOMER_CODE = process.env.DTDC_CUSTOMER_CODE!;

if (!DTDC_TRACKING_TOKEN) console.error("❌ Missing DTDC_TRACKING_TOKEN");
if (!DTDC_CUSTOMER_CODE) console.error("❌ Missing DTDC_CUSTOMER_CODE");

// ==============================================================
// DATE & TIME PARSERS (DTDC FORMAT)
// ==============================================================

// DTDC date "15112025" -> "2025-11-15"
function parseDtdcDate(raw: string | null): string | null {
  if (!raw || raw.length !== 8) return null;
  const dd = raw.substring(0, 2);
  const mm = raw.substring(2, 4);
  const yyyy = raw.substring(4, 8);
  return `${yyyy}-${mm}-${dd}`;
}

// DTDC time "1826" -> "18:26:00"
function parseDtdcTime(raw: string | null): string | null {
  if (!raw || raw.length !== 4) return null;
  const hh = raw.substring(0, 2);
  const mm = raw.substring(2, 4);
  return `${hh}:${mm}:00`;
}

// Combine date & time into timestamp string
function parseDtdcDateTime(dateRaw: string | null, timeRaw: string | null): string | null {
  const d = parseDtdcDate(dateRaw);
  if (!d) return null;
  const t = parseDtdcTime(timeRaw);
  return t ? `${d} ${t}` : d;
}

// ==============================================================
// TIMESTAMP → JS DATE FIX (THIS FIXES toISOString ERRORS)
// ==============================================================

// Convert "2025-11-19 18:26:00" -> new Date("2025-11-19T18:26:00")
function toJsDate(ts: string | null): Date | null {
  if (!ts) return null;
  const formatted = ts.replace(" ", "T");
  const d = new Date(formatted);
  return isNaN(d.getTime()) ? null : d;
}

// ==============================================================
// PARSE DTDC RESPONSE
// ==============================================================
function parseDTDC(json: any) {
  const header = json?.trackHeader ?? {};

  return {
    header: {
      shipmentNo: header.strShipmentNo,
      origin: header.strOrigin,
      destination: header.strDestination,

      bookedOn: parseDtdcDate(header.strBookedDate),
      currentStatus: header.strStatus,
      lastUpdatedOn: parseDtdcDateTime(
        header.strStatusTransOn,
        header.strStatusTransTime
      ),
    },
    timeline: json?.trackDetails ?? [],
    raw: json,
  };
}

// ==============================================================
// MAIN POST HANDLER
// ==============================================================
export async function POST(req: Request) {
  try {
    const { consignments: awbs } = await req.json();

    if (!Array.isArray(awbs) || awbs.length === 0) {
      return NextResponse.json({ error: "consignments missing" }, { status: 400 });
    }

    const results: any[] = [];

    for (const awb of awbs) {
      try {
        // ======================================================
        // 1) CALL DTDC TRACKING API
        // ======================================================
        const res = await fetch(TRACK_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Access-Token": DTDC_TRACKING_TOKEN,
          },
          body: JSON.stringify({
            trkType: "cnno",
            strcnno: awb,
            addtnlDtl: "Y",
            customerCode: DTDC_CUSTOMER_CODE,
          }),
        });

        const rawText = await res.text();
        console.log("DTDC RAW:", rawText);

        let json;
        try {
          json = JSON.parse(rawText);
        } catch {
          results.push({
            awb,
            error: "DTDC did not return JSON",
            raw: rawText,
          });
          continue;
        }

        if (!res.ok) {
          results.push({
            awb,
            error: json?.message ?? `DTDC returned ${res.status}`,
          });
          continue;
        }

        // ======================================================
        // 2) PARSE RESPONSE
        // ======================================================
        const parsed = parseDTDC(json);

        const bookedOnISO = parsed.header.bookedOn;          // DATE STRING (OK)
        const lastUpdatedJS = toJsDate(parsed.header.lastUpdatedOn); // JS DATE REQUIRED

        // ======================================================
        // 3) UPSERT CONSIGNMENT (timestamp uses JS Date)
        // ======================================================
        const upsert = await db
          .insert(consignments)
          .values({
            awb,
            lastStatus: parsed.header.currentStatus,
            origin: parsed.header.origin,
            destination: parsed.header.destination,
            bookedOn: bookedOnISO,
            lastUpdatedOn: lastUpdatedJS,
          })
          .onConflictDoUpdate({
            target: consignments.awb,
            set: {
              lastStatus: parsed.header.currentStatus ?? sql`last_status`,
              origin: parsed.header.origin ?? sql`origin`,
              destination: parsed.header.destination ?? sql`destination`,
              bookedOn: bookedOnISO ?? sql`booked_on`,
              lastUpdatedOn: lastUpdatedJS ?? sql`last_updated_on`,
              updatedAt: sql`NOW()`,
            },
          })
          .returning({ id: consignments.id });

        const consignmentId = upsert[0].id;

        // ======================================================
        // 4) TIMELINE EVENTS INSERT
        // ======================================================
        for (const t of parsed.timeline) {
          const action = t.strAction ?? "";
          const actionDate = parseDtdcDate(t.strActionDate);
          const actionTime = parseDtdcTime(t.strActionTime);

          console.log("EVENT INSERT:", { actionDate, actionTime });

          const origin = t.strOrigin ?? null;
          const destination = t.strDestination ?? null;
          const remarks = t.sTrRemarks ?? t.strRemarks ?? null;

          const exists = await db
          .select()
          .from(trackingEvents)
          .where(
            and(
              eq(trackingEvents.consignmentId, consignmentId),
              eq(trackingEvents.action, action),
              eq(trackingEvents.actionDate, new Date(actionDate)), // FIX
              eq(trackingEvents.actionTime, actionTime)
            )
          )
          .limit(1);


          if (exists.length === 0) {
            await db.insert(trackingEvents).values({
              consignmentId,
              action,
              actionDate,
              actionTime,
              origin,
              destination,
              remarks,
            });
          }
        }

        // ======================================================
        // 5) STATUS HISTORY
        // ======================================================
        const previous = await db
          .select({ lastStatus: consignments.lastStatus })
          .from(consignments)
          .where(eq(consignments.id, consignmentId))
          .limit(1);

        const prevStatus = previous[0]?.lastStatus;
        const newStatus = parsed.header.currentStatus;

        if (prevStatus !== newStatus) {
          await db.insert(trackingHistory).values({
            consignmentId,
            oldStatus: prevStatus,
            newStatus,
          });
        }

        results.push({ awb, parsed });
      } catch (err: any) {
        results.push({ awb, error: err.message });
      }
    }

    return NextResponse.json({ results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
