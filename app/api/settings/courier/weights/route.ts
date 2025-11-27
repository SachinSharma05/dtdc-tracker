// app/api/settings/courier/weights/route.ts
import { NextResponse } from "next/server";
import { db } from "../../../../../db";
import { courierWeights } from "../../../../../db/schema";
import { and, gt, lt, or, sql } from "drizzle-orm";

export async function GET() {
  const rows = await db
  .select()
  .from(courierWeights)
  .orderBy(sql`${courierWeights.min_weight} ASC`);

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
      and(courierWeights.min_weight.lte(min_weight), courierWeights.max_weight.gt(min_weight)),
      and(courierWeights.min_weight.lt(max_weight), courierWeights.max_weight.gte(max_weight)),
      and(courierWeights.min_weight.gte(min_weight), courierWeights.max_weight.lte(max_weight))
    )
  );
  if (overlapping.length > 0) {
    return NextResponse.json({ error: "Weight slab overlaps with existing slab" }, { status: 400 });
  }

  const inserted = await db.insert(courierWeights).values({ min_weight, max_weight, price }).returning();
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
      courierWeights.id.notEq(id),
      or(
        and(courierWeights.min_weight.lte(min_weight), courierWeights.max_weight.gt(min_weight)),
        and(courierWeights.min_weight.lt(max_weight), courierWeights.max_weight.gte(max_weight)),
        and(courierWeights.min_weight.gte(min_weight), courierWeights.max_weight.lte(max_weight))
      )
    )
  );
  if (overlapping.length > 0) {
    return NextResponse.json({ error: "Weight slab overlaps with existing slab" }, { status: 400 });
  }

  await db.update(courierWeights).set({ min_weight, max_weight, price }).where(courierWeights.id.eq(id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(courierWeights).where(courierWeights.id.eq(Number(id)));
  return NextResponse.json({ ok: true });
}
