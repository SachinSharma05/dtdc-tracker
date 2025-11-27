// app/api/settings/courier/services/route.ts
import { NextResponse } from "next/server";
import { db } from "../../../../../db";
import { courierServices } from "../../../../../db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET() {
  const rows = await db
  .select()
  .from(courierServices)
  .orderBy(sql`${courierServices.name} ASC`);

  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { name, description = "", basePrice } = body;
  if (!name || basePrice == null) {
    return NextResponse.json({ error: "name and base_price required" }, { status: 400 });
  }
  const inserted = await db.insert(courierServices).values({ name, description, basePrice }).returning();
  return NextResponse.json(inserted[0]);
}

export async function PUT(req: Request) {
  const body = await req.json();
  const { id, name, description, basePrice } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.update(courierServices).set({ name, description, basePrice }).where(eq(courierServices.id, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(courierServices).where(eq(courierServices.id, Number(id)));
  return NextResponse.json({ ok: true });
}
