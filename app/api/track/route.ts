import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { checkRateLimit, getRequestIp } from "@/lib/rate-limit";
import { requireRole } from "@/lib/require-role";

export const dynamic = "force-dynamic";

type TrackingOrderRow = {
  id: number;
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

type AssignedRiderRow = {
  id: string;
  full_name: string;
  phone: string | null;
  vehicle_type: string | null;
  plate_number: string | null;
  average_rating?: number | null;
  review_count?: number;
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
    const authorization = await requireRole(["customer", "admin"]);
    if (!authorization.authorized) return authorization.response;

    const rateLimit = checkRateLimit(
      `track:${authorization.role}:${authorization.userId}:${getRequestIp(request)}`,
      authorization.role === "admin" ? 600 : 30,
      60_000
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many tracking requests. Please wait a minute." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
          },
        }
      );
    }

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

    let orderQuery = supabase
      .from("orders")
      .select(
        "id, booking_no, package_type, status, created_at, assigned_rider, accepted_at, heading_to_pickup_at, picked_up_at, in_transit_at, delivered_at, completed_at, pickup_latitude, pickup_longitude, dropoff_latitude, dropoff_longitude, cancellation_reason, cancelled_by, cancelled_at"
      )
      .eq("booking_no", bookingNo);

    if (authorization.role === "customer") {
      orderQuery = orderQuery.eq(
        "customer_user_id",
        authorization.userId
      );
    }

    const { data: order, error: orderError } =
      await orderQuery.maybeSingle<TrackingOrderRow>();

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
    let assignedRider: AssignedRiderRow | null = null;

    if (order.assigned_rider && order.status !== "Cancelled") {
      const { data: riderData, error: riderError } = await supabase
        .from("rider_profiles")
        .select("id, full_name, phone, vehicle_type, plate_number")
        .eq("id", order.assigned_rider)
        .maybeSingle<AssignedRiderRow>();

      if (riderError) {
        console.error("Assigned rider lookup failed:", riderError);
      } else if (riderData) {
        const { data: ratingRows, error: ratingsError } = await supabase
          .from("delivery_reviews")
          .select("rating")
          .eq("rider_id", order.assigned_rider);

        if (ratingsError) {
          console.error("Rider rating lookup failed:", ratingsError);
          assignedRider = riderData;
        } else {
          const ratings = (ratingRows || []) as { rating: number }[];
          const reviewCount = ratings.length;
          const averageRating = reviewCount
            ? ratings.reduce((sum, item) => sum + Number(item.rating || 0), 0) / reviewCount
            : null;

          assignedRider = {
            ...riderData,
            average_rating: averageRating,
            review_count: reviewCount,
          };
        }
      }

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
        assigned_rider_profile: assignedRider,
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
            ? "Unable to retrieve tracking information."
            : "Unknown server error.",
      },
      { status: 500 }
    );
  }
}
