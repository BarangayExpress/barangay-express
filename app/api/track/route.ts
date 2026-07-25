import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type TrackingOrderRow = {
  booking_no: string;
  package_type: string | null;
  status: string | null;
  created_at: string | null;
  assigned_rider: string | null;
  accepted_at: string | null;
  heading_to_pickup_at: string | null;
  picked_up_at: string | null;
  in_transit_at: string | null;
  delivered_at: string | null;
  completed_at: string | null;
  pickup_latitude: number | null;
  pickup_longitude: number | null;
  dropoff_latitude: number | null;
  dropoff_longitude: number | null;
  cancellation_reason: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
};

type RiderLocationRow = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  updated_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const bookingNo = request.nextUrl.searchParams
      .get("booking_no")
      ?.trim()
      .toUpperCase();

    if (!bookingNo) {
      return NextResponse.json(
        {
          success: false,
          error: "Booking number is required.",
        },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(
        "booking_no, package_type, status, created_at, assigned_rider, accepted_at, heading_to_pickup_at, picked_up_at, in_transit_at, delivered_at, completed_at, pickup_latitude, pickup_longitude, dropoff_latitude, dropoff_longitude, cancellation_reason, cancelled_by, cancelled_at"
      )
      .eq("booking_no", bookingNo)
      .maybeSingle<TrackingOrderRow>();

    if (orderError) {
      throw new Error(orderError.message);
    }

    if (!order) {
      return NextResponse.json(
        {
          success: false,
          error: "Hindi makita ang booking.",
        },
        { status: 404 }
      );
    }

    let riderLocation: RiderLocationRow | null = null;

    if (order.assigned_rider && order.status !== "Cancelled") {
      const { data, error: riderLocationError } = await supabase
        .from("rider_locations")
        .select(
          "latitude, longitude, accuracy, heading, speed, updated_at"
        )
        .eq("rider_id", order.assigned_rider)
        .maybeSingle<RiderLocationRow>();

      if (riderLocationError) {
        console.error(
          "Rider location lookup failed:",
          riderLocationError
        );
      } else {
        riderLocation = data;
      }
    }

    return NextResponse.json(
      {
        success: true,
        order,
        rider_location: riderLocation,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("Tracking API error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown server error.",
      },
      { status: 500 }
    );
  }
}