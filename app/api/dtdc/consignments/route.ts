import { NextResponse } from "next/server";
import { db } from "../../../../db";
import { consignments, trackingEvents } from "../../../../db/schema";
import { and, desc, eq, sql, like } from "drizzle-orm";
import dayjs from "dayjs";

// -------------------------------
// TAT RULES
// -------------------------------
const TAT_RULES: Record<string, number> = {
  D: 3,
  M: 5,
  N: 7,
  I: 10,
};

// -------------------------------
// TAT CALCULATOR
// -------------------------------
function computeTAT(row: any) {
  if (!row.booked_on) return "On Time";

  const prefix = row.awb?.charAt(0)?.toUpperCase();
  const allowedDays = TAT_RULES[prefix] ?? 5;

  const age = dayjs().diff(dayjs(row.booked_on), "day");

  if (age > allowedDays + 3) return "Very Critical";
  if (age > allowedDays) return "Critical";
  if (age >= allowedDays - 1) return "Warning";
  return "On Time";
}

// -------------------------------
// MOVEMENT CALCULATOR
// -------------------------------
function computeMovement(timeline: any[]) {
  if (!timeline || timeline.length === 0) return "On Time";

  const last = timeline[0];
  if (!last?.actionDate) return "On Time";

  const ts = `${last.actionDate}T${last.actionTime || "00:00:00"}`;
  const hours = dayjs().diff(dayjs(ts), "hour");

  if (hours >= 72) return "Stuck (72+ hrs)";
  if (hours >= 48) return "Slow (48 hrs)";
  if (hours >= 24) return "Slow (24 hrs)";

  return "On Time";
}

// -------------------------------
// MAIN API
// -------------------------------
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = url.searchParams;

    const page = Math.max(1, Number(q.get("page") ?? 1));
    const pageSize = Math.max(5, Number(q.get("pageSize") ?? 50));

    const search = q.get("search")?.trim() ?? "";
    const status = q.get("status")?.trim().toLowerCase() ?? "";
    const from = q.get("from") ?? "";
    const to = q.get("to") ?? "";

    const where: any[] = [];

    if (search) {
      where.push(like(consignments.awb, `%${search}%`));
    }

    if (status && status !== "all") {
      where.push(like(sql`LOWER(${consignments.lastStatus})`, `%${status}%`));
    }

    if (from) {
      where.push(sql`${consignments.lastUpdatedOn}::date >= ${from}`);
    }

    if (to) {
      where.push(sql`${consignments.lastUpdatedOn}::date <= ${to}`);
    }

    // ---------------------------
    // Count total
    // ---------------------------
    const total = await db
      .select({ count: sql<number>`count(*)` })
      .from(consignments)
      .where(where.length ? and(...where) : undefined);

    // ---------------------------
    // Fetch main rows
    // ---------------------------
    const rows = await db
      .select({
        id: consignments.id,
        awb: consignments.awb,
        last_status: consignments.lastStatus,
        origin: consignments.origin,
        destination: consignments.destination,
        booked_on: consignments.bookedOn,
        last_updated_on: consignments.lastUpdatedOn,
      })
      .from(consignments)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(consignments.lastUpdatedOn))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const consignmentIds = rows.map((r) => r.id);

    if (consignmentIds.length === 0) {
      return NextResponse.json({
        total: 0,
        page,
        pageSize,
        totalPages: 1,
        items: [],
      });
    }

    // ---------------------------
    // Fetch TIMELINE (latest 2 events per row)
    // ---------------------------
    const timelineRows = await db
      .select()
      .from(trackingEvents)
      .where(sql`${trackingEvents.consignmentId} IN (${sql.join(
        consignmentIds,
        sql`,`
      )})`)
      .orderBy(
        desc(trackingEvents.actionDate),
        desc(trackingEvents.actionTime)
      );

    // group by consignmentId
    const timelineMap: Record<string, any[]> = {};
    for (const t of timelineRows) {
      if (!timelineMap[t.consignmentId]) timelineMap[t.consignmentId] = [];
      if (timelineMap[t.consignmentId].length < 2) {
        timelineMap[t.consignmentId].push({
          action: t.action,
          actionDate: t.actionDate,
          actionTime: t.actionTime,
          origin: t.origin,
          destination: t.destination,
          remarks: t.remarks,
        });
      }
    }

    // ---------------------------
    // Merge + compute TAT + movement
    // ---------------------------
    const items = rows.map((r) => {
      const timeline = timelineMap[r.id] ?? [];
      return {
        ...r,
        timeline,
        tat: computeTAT(r),
        movement: computeMovement(timeline),
      };
    });

    return NextResponse.json({
      total: total[0].count,
      page,
      pageSize,
      totalPages: Math.ceil(total[0].count / pageSize),
      items,
    });
  } catch (err: any) {
    console.error("Consignments API error:", err);
    return NextResponse.json(
      { error: err.message ?? String(err) },
      { status: 500 }
    );
  }
}
