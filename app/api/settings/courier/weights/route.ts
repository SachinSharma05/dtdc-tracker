// app/api/settings/courier/weights/route.ts
import { NextResponse } from "next/server";
import { db } from "../../../../../db";
import { courierWeights } from "../../../../../db/schema";
import { and, gte, lte, or, sql, eq, gt, lt, ne } from "drizzle-orm";

export async function GET() {
  const rows = await db
  .select()
  .from(courierWeights)
  .orderBy(sql`${courierWeights.minWeight} ASC`);

  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { min_weight, max_weight, price } = body;
  if (min_weight == null || max_weight == null || price == null) {
    return NextResponse.json({ error: "min_weight, max_weight, price required" }, { status: 400 });
  }
  if (Number(max_weight) <= Number(min_weight)) {
    return NextResponse.json({ error: "max_weight must be greater than min_weight" }, { status: 400 });
  }

  // check overlap
  const overlapping = await db.select().from(courierWeights).where(
    or(
      and(lte(courierWeights.minWeight, min_weight), gt(courierWeights.maxWeight, min_weight)),
      and(lt(courierWeights.minWeight, max_weight), gte(courierWeights.maxWeight, max_weight)),
      and(gte(courierWeights.minWeight, min_weight), lte(courierWeights.maxWeight, max_weight))
    )
  );
  if (overlapping.length > 0) {
    return NextResponse.json({ error: "Weight slab overlaps with existing slab" }, { status: 400 });
  }

  const inserted = await db.insert(courierWeights).values({ minWeight: min_weight, maxWeight: max_weight, price }).returning();
  return NextResponse.json(inserted[0]);
}

export async function PUT(req: Request) {
  const body = await req.json();
  const { id, min_weight, max_weight, price } = body;
  if (!id || min_weight == null || max_weight == null || price == null) {
    return NextResponse.json({ error: "id, min_weight, max_weight, price required" }, { status: 400 });
  }
  if (Number(max_weight) <= Number(min_weight)) {
    return NextResponse.json({ error: "max_weight must be greater than min_weight" }, { status: 400 });
  }

  // check overlap excluding current id
  const overlapping = await db.select().from(courierWeights).where(
    and(
      ne(courierWeights.id, id),
      or(
        and(lte(courierWeights.minWeight, min_weight), gt(courierWeights.maxWeight, min_weight)),
        and(lt(courierWeights.minWeight, max_weight), gte(courierWeights.maxWeight, max_weight)),
        and(gte(courierWeights.minWeight, min_weight), lte(courierWeights.maxWeight, max_weight))
      )
    )
  );
  if (overlapping.length > 0) {
    return NextResponse.json({ error: "Weight slab overlaps with existing slab" }, { status: 400 });
  }

  await db.update(courierWeights).set({ minWeight: min_weight, maxWeight: max_weight, price }).where(eq(courierWeights.id, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(courierWeights).where(eq(courierWeights.id, Number(id)));
  return NextResponse.json({ ok: true });
}
