import { NextResponse } from "next/server";
import { db } from "../../../../db";
import { consignments } from "../../../../db/schema";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    const q = await db.select({
      total: sql<number>`count(*)`,
      delivered: sql<number>`
        SUM(
          CASE
            WHEN LOWER("last_status") LIKE '%deliver%' THEN 1
            ELSE 0
          END
        )`,
      rto: sql<number>`
        SUM(
          CASE
            WHEN LOWER("last_status") LIKE '%rto%' THEN 1
            ELSE 0
          END
        )`,
      pending: sql<number>`
        SUM(
          CASE
            WHEN LOWER("last_status") NOT LIKE '%deliver%'
             AND LOWER("last_status") NOT LIKE '%rto%' THEN 1
            ELSE 0
          END
        )`,
    }).from(consignments);

    const row = q[0] ?? { total: 0, delivered: 0, rto: 0, pending: 0 };

    return NextResponse.json({
      total: Number(row.total ?? 0),
      delivered: Number(row.delivered ?? 0),
      rto: Number(row.rto ?? 0),
      pending: Number(row.pending ?? 0),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
