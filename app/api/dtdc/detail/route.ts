// app/api/dtdc/detail/route.ts
import { NextResponse } from "next/server";
import { db } from "../../../../db";
import { consignments, trackingEvents, trackingHistory } from "../../../../db/schema";
import { eq, asc, desc } from "drizzle-orm";

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
    const consignment = await db
      .select()
      .from(consignments)
      .where(eq(consignments.awb, awb))
      .limit(1);

    if (consignment.length === 0) {
      return NextResponse.json(
        { success: false, message: "No consignment found for this AWB" },
        { status: 404 }
      );
    }

    const c = consignment[0];

    // 2️⃣ Fetch timeline events
    const timeline = await db
      .select()
      .from(trackingEvents)
      .where(eq(trackingEvents.consignmentId, c.id))
      .orderBy(asc(trackingEvents.actionDate), asc(trackingEvents.actionTime));

    // 3️⃣ Fetch status change log
    const history = await db
      .select()
      .from(trackingHistory)
      .where(eq(trackingHistory.consignmentId, c.id))
      .orderBy(desc(trackingHistory.changedAt));

    // 4️⃣ Build clean structured response
    const summary = {
      awb: c.awb,
      origin: c.origin,
      destination: c.destination,
      bookedOn: c.bookedOn,
      lastUpdatedOn: c.lastUpdatedOn,
      currentStatus: c.lastStatus,
    };

    const currentStatus = {
      status: c.lastStatus,
      date: c.lastUpdatedOn,
      location:
        timeline?.[timeline.length - 1]?.origin ??
        timeline?.[timeline.length - 1]?.destination ??
        c.origin,
      remarks: timeline?.[timeline.length - 1]?.remarks ?? "",
    };

    const cleanTimeline = timeline.map((t) => ({
      action: t.action,
      date: t.actionDate,
      time: t.actionTime,
      origin: t.origin,
      destination: t.destination,
      remarks: t.remarks,
    }));

    const reports = {
      delivered:
        (c.lastStatus ?? "").toLowerCase().includes("delivered") || false,
      outForDelivery:
        (c.lastStatus ?? "")
          .toLowerCase()
          .includes("out for delivery") || false,
      rto: (c.lastStatus ?? "").toLowerCase().includes("rto") || false,
      delayed:
        c.lastUpdatedOn &&
        new Date(c.lastUpdatedOn).getTime() <
          Date.now() - 3 * 24 * 60 * 60 * 1000,
      lastScanLocation: cleanTimeline.at(-1)?.origin ?? c.origin,
    };

    // 5️⃣ Final Response
    return NextResponse.json({
      success: true,
      awb,
      summary,
      currentStatus,
      timeline: cleanTimeline,
      history,
      consignment: c, // raw DB row
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err.message ?? String(err) },
      { status: 500 }
    );
  }
}
