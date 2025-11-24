// app/api/dtdc/stats/route.ts
import { NextResponse } from "next/server";
import { db } from "../../../../db";
import { consignments } from "../../../../db/schema";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    const totalQ = await db.select({ cnt: sql<number>`count(*)` }).from(consignments);
    const total = totalQ[0].cnt ?? 0;

    const deliveredQ = await db.select({ cnt: sql<number>`count(*)` }).from(consignments).where(sql`LOWER(last_status)` .like('%deliver%'));
    const rtoQ = await db.select({ cnt: sql<number>`count(*)` }).from(consignments).where(sql`LOWER(last_status)` .like('%rto%'));
    const pendingQ = await db.select({ cnt: sql<number>`count(*)` }).from(consignments).where(sql`LOWER(last_status)` .not().like('%deliver%').and(sql`LOWER(last_status)` .not().like('%rto%')));

    return NextResponse.json({
      total,
      delivered: deliveredQ[0].cnt ?? 0,
      rto: rtoQ[0].cnt ?? 0,
      pending: pendingQ[0].cnt ?? 0
    });
  } catch (err:any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
