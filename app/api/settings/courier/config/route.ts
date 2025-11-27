// app/api/settings/courier/config/route.ts
import { NextResponse } from "next/server";
import { db } from "../../../../../db";
import { courierSettings } from "../../../../../db/schema";

export async function GET() {
  const rows = await db.select().from(courierSettings);
  const obj: Record<string, string> = {};
  rows.forEach((r: any) => (obj[r.key] = r.value));
  return NextResponse.json(obj);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { key, value } = body;
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
  await db.insert(courierSettings).values({ key, value }).onConflictDoNothing(); // avoid duplicates
  return NextResponse.json({ ok: true });
}

export async function PUT(req: Request) {
  const body = await req.json();
  const { key, value } = body;
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
  await db.update(courierSettings).set({ value }).where(courierSettings.key.eq(key));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
  await db.delete(courierSettings).where(courierSettings.key.eq(key));
  return NextResponse.json({ ok: true });
}
