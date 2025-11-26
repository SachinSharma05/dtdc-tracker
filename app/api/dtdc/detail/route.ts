import { NextResponse } from "next/server";
import { db } from "../../../../db";
import { consignments, trackingEvents, trackingHistory } from "../../../../db/schema";
import { eq, asc, desc } from "drizzle-orm";

// ----------------- Helpers -----------------

function toIsoDateOrNull(v: any): string | null {
  if (!v) return null;
  // If it's a JS Date object:
  if (v instanceof Date) return v.toISOString();
  // If it's a string in YYYY-MM-DD or YYYY-MM-DD HH:MM:SS, try normalize
  if (typeof v === "string") {
    // If timestamp with space -> convert to T for ISO
    if (v.includes(" ")) return new Date(v.replace(" ", "T")).toISOString();
    // If date-only
    return new Date(v).toISOString();
  }
  return null;
}

function parseDateOnlyToISO(v: any): string | null {
  if (!v) return null;
  if (typeof v === "string") {
    // Accept YYYY-MM-DD already, or other formats
    return new Date(v).toISOString().slice(0, 10);
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return null;
}

function safeString(v: any) {
  if (v == null) return "";
  return String(v);
}

// TAT rules by AWB prefix (customize as needed)
const TAT_RULES: Record<string, number> = {
  D: 3,
  M: 5,
  N: 7,
  I: 10,
};

// Compute TAT (returns label)
function computeTAT(bookedOn: string | null, awb: string | undefined) {
  if (!bookedOn) return "Unknown";

  const prefix = (awb?.charAt(0) ?? "").toUpperCase();
  const allowed = TAT_RULES[prefix] ?? 5;

  const bookDate = new Date(bookedOn);
  if (isNaN(bookDate.getTime())) return "Unknown";

  const msPerDay = 24 * 60 * 60 * 1000;
  const ageDays = Math.floor((Date.now() - bookDate.getTime()) / msPerDay);

  if (ageDays > allowed + 3) return "Very Critical";
  if (ageDays > allowed) return "Critical";
  if (ageDays >= Math.max(0, allowed - 1)) return "Warning";
  return "On Time";
}

// Movement detection using timeline array (precise)
function computeMovementFromTimeline(timeline: any[]) {
  if (!Array.isArray(timeline) || timeline.length === 0) return "Unknown";

  // timeline is chronological (oldest first). Last event is timeline[timeline.length-1]
  const last = timeline[timeline.length - 1];
  const prev = timeline.length > 1 ? timeline[timeline.length - 2] : null;

  // Determine last scan datetime
  const lastDateStr = last.date; // expected format YYYY-MM-DD or JS Date string
  const lastTimeStr = last.time; // expected HH:MM:SS
  const lastDateTime = lastDateStr ? new Date((String(lastDateStr).includes("T") ? lastDateStr : `${lastDateStr}T${String(lastTimeStr ?? "00:00:00")}`)) : null;

  const now = Date.now();
  if (!lastDateTime || isNaN(lastDateTime.getTime())) return "Unknown";

  const hours = Math.floor((now - lastDateTime.getTime()) / (1000 * 60 * 60));

  // Primary: if previous exists and location unchanged for repeated scans → No Movement
  const lastLoc = (last.origin || last.destination || "").trim();
  const prevLoc = prev ? (prev.origin || prev.destination || "").trim() : null;

  if (prev && prevLoc && lastLoc && prevLoc === lastLoc) {
    if (hours >= 72) return "No Movement (72+ hrs)";
    if (hours >= 48) return "No Movement (48 hrs)";
    if (hours >= 24) return "No Movement (24 hrs)";
    return "No Movement";
  }

  // Secondary: even if location changed but scan is stale
  if (hours >= 72) return "Stuck (72+ hrs)";
  if (hours >= 48) return "Slow (48 hrs)";
  if (hours >= 24) return "Slow (24 hrs)";

  // Otherwise moving
  return "On Time";
}

// Format timeline events for output
function mapTimelineRow(t: any) {
  // t.actionDate (date column) may be YYYY-MM-DD string
  // t.actionTime (time column) is HH:MM:SS
  return {
    action: safeString(t.action),
    date: t.actionDate ? String(t.actionDate) : null,
    time: t.actionTime ? String(t.actionTime) : null,
    origin: safeString(t.origin),
    destination: safeString(t.destination),
    remarks: safeString(t.remarks),
  };
}

// ----------------- Route -----------------
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const awb = searchParams.get("awb");

    if (!awb) {
      return NextResponse.json(
        { success: false, message: "awb is required" },
        { status: 400 }
      );
    }

    // 1️⃣ Fetch master consignment
    const consignmentRows = await db
      .select()
      .from(consignments)
      .where(eq(consignments.awb, awb))
      .limit(1);

    if (!consignmentRows || consignmentRows.length === 0) {
      return NextResponse.json(
        { success: false, message: "No consignment found for this AWB" },
        { status: 404 }
      );
    }

    const c = consignmentRows[0];

    // 2️⃣ Fetch timeline events (chronological)
    const timelineRows = await db
      .select()
      .from(trackingEvents)
      .where(eq(trackingEvents.consignmentId, c.id))
      .orderBy(asc(trackingEvents.actionDate), asc(trackingEvents.actionTime));

    // 3️⃣ Fetch status change log (latest first)
    const historyRows = await db
      .select()
      .from(trackingHistory)
      .where(eq(trackingHistory.consignmentId, c.id))
      .orderBy(desc(trackingHistory.changedAt));

    // 4️⃣ Build clean structured response
    const summary = {
      awb: c.awb,
      origin: c.origin ?? null,
      destination: c.destination ?? null,
      bookedOn: parseDateOnlyToISO(c.bookedOn) , // YYYY-MM-DD
      lastUpdatedOn: toIsoDateOrNull(c.lastUpdatedOn), // ISO timestamp
      currentStatus: c.lastStatus ?? null,
    };

    // map timeline
    const cleanTimeline = timelineRows.map(mapTimelineRow);

    // currentStatus computed from last timeline event if available
    const lastEvent = cleanTimeline.length ? cleanTimeline[cleanTimeline.length - 1] : null;
    const currentStatus = {
      status: summary.currentStatus,
      date: lastEvent?.date ?? summary.bookedOn,
      time: lastEvent?.time ?? null,
      location: lastEvent?.origin || lastEvent?.destination || summary.origin,
      remarks: lastEvent?.remarks ?? null,
    };

    // TAT & Movement
    const tat = computeTAT(summary.bookedOn, c.awb);
    const movement = computeMovementFromTimeline(cleanTimeline);

    // reports
    const reports = {
      delivered: (c.lastStatus ?? "").toLowerCase().includes("delivered"),
      outForDelivery: (c.lastStatus ?? "").toLowerCase().includes("out for delivery"),
      rto: (c.lastStatus ?? "").toLowerCase().includes("rto"),
      delayed:
        !!c.lastUpdatedOn &&
        new Date(c.lastUpdatedOn).getTime() < Date.now() - 3 * 24 * 60 * 60 * 1000,
      lastScanLocation: lastEvent?.origin ?? summary.origin,
    };

    return NextResponse.json({
      success: true,
      awb,
      summary,
      currentStatus,
      tat,
      movement,
      timeline: cleanTimeline,
      history: historyRows,
      reports,
      consignment: c,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err.message ?? String(err) },
      { status: 500 }
    );
  }
}
