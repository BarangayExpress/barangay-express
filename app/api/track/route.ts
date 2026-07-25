import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const bookingNo = request.nextUrl.searchParams.get("booking_no")?.trim();

  if (!bookingNo) {
    return NextResponse.json(
      { success: false, error: "Booking number is required." },
      { status: 400 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { success: false, error: "Missing Supabase server variables." },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(
      "booking_no, package_type, status, created_at, assigned_rider, pickup_latitude, pickup_longitude, dropoff_latitude, dropoff_longitude"
    )
    .eq("booking_no", bookingNo)
    .maybeSingle();

  if (orderError) {
    return NextResponse.json(
      { success: false, error: orderError.message },
      { status: 400 }
    );
  }

  if (!order) {
    return NextResponse.json(
      { success: false, error: "Hindi makita ang booking." },
      { status: 404 }
    );
  }

  let riderLocation = null;

  if (order.assigned_rider) {
    const { data } = await supabase
      .from("rider_locations")
      .select("latitude, longitude, accuracy, heading, speed, updated_at")
      .eq("rider_id", order.assigned_rider)
      .maybeSingle();

    riderLocation = data;
  }

  return NextResponse.json(
    { success: true, order, rider_location: riderLocation },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
