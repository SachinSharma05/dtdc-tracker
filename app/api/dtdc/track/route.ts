// app/api/dtdc/track/route.ts
import { NextResponse } from "next/server";
import { db } from "../../../../db";
import {
  consignments,
  trackingEvents,
  trackingHistory
} from "../../../../db/schema";
import { eq, and, sql } from "drizzle-orm";

const TRACK_PROD =
  "https://blktracksvc.dtdc.com/dtdc-api/rest/JSONCnTrk/getTrackDetails";

const LIVE_API_KEY = process.env.DTDC_LIVE_API_KEY;

function parseDTDC(json: any) {
  if (!json || typeof json !== "object") {
    return { header: null, timeline: [], raw: json, error: "Invalid DTDC Response" };
  }

  const header = json.trackHeader ?? {};
  const timeline = json.trackDetails ?? [];

  return {
    header: {
      shipmentNo: header.strShipmentNo,
      origin: header.strOrigin,
      destination: header.strDestination,
      bookedOn: header.strBookedDate,
      currentStatus: header.strStatus,
      lastUpdatedOn: header.strStatusTransOn,
    },
    timeline,
    raw: json,
  };
}

export async function POST(req: Request) {
  try {
    if (!LIVE_API_KEY) {
      return NextResponse.json({ error: "DTDC_LIVE_API_KEY missing" }, { status: 500 });
    }

    const { consignments: awbs } = await req.json();

    if (!Array.isArray(awbs) || awbs.length === 0) {
      return NextResponse.json({ error: "consignments missing" }, { status: 400 });
    }

    const results: any[] = [];

    for (const awb of awbs) {
      try {
        const res = await fetch(TRACK_PROD, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Access-Token": LIVE_API_KEY,
          },
          body: JSON.stringify({
            trkType: "cnno",
            strcnno: awb,
            addtnlDtl: "Y",
          }),
        });

        let json;
        try {
          json = await res.json();
        } catch {
          json = { error: "Invalid JSON returned by DTDC" };
        }

        if (!res.ok) {
          results.push({ awb, error: json?.message ?? `DTDC error ${res.status}` });
          continue;
        }

        const parsed = parseDTDC(json);

        // UPSERT CONSIGNMENT
        const upsertResult = await db
          .insert(consignments)
          .values({
            awb,
            lastStatus: parsed.header?.currentStatus ?? null,
            origin: parsed.header?.origin ?? null,
            destination: parsed.header?.destination ?? null,
            bookedOn: parsed.header?.bookedOn ?? null,
            lastUpdatedOn: parsed.header?.lastUpdatedOn ?? null,
          })
          .onConflictDoUpdate({
            target: consignments.awb,
            set: {
              lastStatus: parsed.header?.currentStatus ?? sql`last_status`,
              origin: parsed.header?.origin ?? sql`origin`,
              destination: parsed.header?.destination ?? sql`destination`,
              bookedOn: parsed.header?.bookedOn ?? sql`booked_on`,
              lastUpdatedOn: parsed.header?.lastUpdatedOn ?? sql`last_updated_on`,
              updatedAt: sql`NOW()`,
            },
          })
          .returning({ id: consignments.id });

        const consignmentId = upsertResult[0]?.id;

        // INSERT TIMELINE EVENTS
        for (const t of parsed.timeline ?? []) {
          const action = t.strAction ?? t.action ?? "";
          const actionDate = t.strActionDate ?? t.date ?? null;
          const actionTime = t.strActionTime ?? t.time ?? null;
          const origin = t.strOrigin ?? t.origin ?? null;
          const destination = t.strDestination ?? t.destination ?? null;
          const remarks = t.sTrRemarks ?? t.strRemarks ?? null;

          // Avoid duplicates
          const exists = await db
            .select()
            .from(trackingEvents)
            .where(
              and(
                eq(trackingEvents.consignmentId, consignmentId),
                eq(trackingEvents.action, action),
                eq(trackingEvents.actionDate, actionDate),
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

        // LOG STATUS CHANGES
        const previous = await db
          .select({ lastStatus: consignments.lastStatus })
          .from(consignments)
          .where(eq(consignments.id, consignmentId))
          .limit(1);

        const prevStatus = previous[0]?.lastStatus;
        const newStatus = parsed.header?.currentStatus ?? null;

        if (prevStatus !== newStatus) {
          await db.insert(trackingHistory).values({
            consignmentId,
            oldStatus: prevStatus,
            newStatus,
          });
        }

        results.push({ awb, parsed });
      } catch (err: any) {
        results.push({ awb, error: err.message ?? String(err) });
      }
    }

    return NextResponse.json({ results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
