import { NextResponse } from "next/server";
import { db } from "../../../../../db";
import { courierServices, courierWeights, courierSettings } from "../../../../../db/schema";
import { eq, and, lte, gte } from "drizzle-orm";

// Simple helper: estimate if two pincodes share same region
function getDistanceType(origin: string, dest: string): "same_city" | "same_state" | "different_state" {
  if (!origin || !dest) return "different_state";

  if (origin.slice(0, 3) === dest.slice(0, 3)) return "same_city";     // 110xxx vs 110yyy
  if (origin.slice(0, 2) === dest.slice(0, 2)) return "same_state";   // 11xxxx vs 11yyyy

  return "different_state";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      service_type_id,
      weight,
      load_type,
      origin_pincode,
      dest_pincode,
      length,
      width,
      height
    } = body;

    if (!service_type_id || !weight || !origin_pincode || !dest_pincode) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Fetch service details
    const service = await db.query.courierServices.findFirst({
      where: eq(courierServices.name, service_type_id),
    });

    if (!service) {
      return NextResponse.json({ error: "Service not found" }, { status: 400 });
    }

    const basePrice = Number(service.basePrice);

    // Fetch weight slab
    const weightSlab = await db.query.courierWeights.findFirst({
      where: and(
        lte(courierWeights.minWeight, weight),
        gte(courierWeights.maxWeight, weight)
      ),
    });

    if (!weightSlab) {
      return NextResponse.json({ error: "No matching weight slab found" }, { status: 400 });
    }

    const weightCharge = Number(weightSlab.price);

    // Fetch global config settings
    const settingsRows = await db.select().from(courierSettings);
    const settings: Record<string, string> = {};
    settingsRows.forEach((r: any) => (settings[r.key] = r.value));

    const ndSurcharge = load_type === "NON-DOCUMENT" ? Number(settings["non_document_surcharge"] || 0) : 0;

    const dimensionalDivisor = Number(settings["dimensional_divisor"] || 5000);

    // Dimensional Weight
    let dimWeight = 0;
    if (load_type === "NON-DOCUMENT" && length && width && height) {
      dimWeight = (Number(length) * Number(width) * Number(height)) / dimensionalDivisor;
    }

    // Charge extra if dimensional weight > actual weight
    const effectiveWeight = Math.max(Number(weight), dimWeight);

    // If effective weight exceeds slab, add extra per slab rules
    // (Version 1: simple — ignore, will keep within slab. Version 2: adjustable.)
    const effectiveWeightCharge = Number(weightSlab.price);

    // Distance-based pricing
    const distType = getDistanceType(origin_pincode, dest_pincode);

    let distanceCharge = 0;
    if (distType === "same_city") distanceCharge = Number(settings["same_city_rate"] || 0);
    else if (distType === "same_state") distanceCharge = Number(settings["same_state_rate"] || 0);
    else distanceCharge = Number(settings["different_state_rate"] || 0);

    const total =
      basePrice + effectiveWeightCharge + distanceCharge + ndSurcharge;

    return NextResponse.json({
      success: true,
      breakdown: {
        service_type: service_type_id,
        base_price: basePrice,
        weight_slab_charge: effectiveWeightCharge,
        non_doc_surcharge: ndSurcharge,
        distance_type: distType,
        distance_charge: distanceCharge,
        dimensional_weight_used: dimWeight,
        actual_weight_used: Number(weight),
        effective_weight_used: effectiveWeight,
      },
      total: Math.ceil(total), // round to nearest rupee
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
