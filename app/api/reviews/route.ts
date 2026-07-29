import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/require-role";

type ReviewPayload = {
  booking_no?: string;
  rating?: number;
  comment?: string | null;
};

type ReviewRow = {
  id: number;
  order_id: number;
  booking_no: string;
  rider_id: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
};

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function GET() {
  try {
    const authorization = await requireAdmin();

    if (!authorization.authorized) {
      return authorization.response;
    }
    

    const supabaseAdmin = createAdminClient();

    const { data: reviewRows, error: reviewsError } =
      await supabaseAdmin
        .from("delivery_reviews")
        .select(
          "id, order_id, booking_no, rider_id, rating, comment, created_at"
        )
        .order("created_at", { ascending: false });

    if (reviewsError) {
      throw new Error(reviewsError.message);
    }

    const reviews = (reviewRows || []) as ReviewRow[];

    const riderIds = Array.from(
      new Set(
        reviews
          .map((review) => review.rider_id)
          .filter((value): value is string => Boolean(value))
      )
    );

    const riderNameMap = new Map<string, string>();

    if (riderIds.length > 0) {
      const { data: riders, error: ridersError } = await supabaseAdmin
        .from("rider_profiles")
        .select("id, full_name")
        .in("id", riderIds);

      if (ridersError) {
        throw new Error(ridersError.message);
      }

      (riders || []).forEach(
        (rider: { id: string; full_name: string | null }) => {
          riderNameMap.set(
            rider.id,
            rider.full_name || "Unnamed rider"
          );
        }
      );
    }

    return NextResponse.json({
      success: true,
      reviews: reviews.map((review) => ({
        ...review,
        rider_name: review.rider_id
          ? riderNameMap.get(review.rider_id) || "Unnamed rider"
          : null,
      })),
    });
  } catch (error) {
    console.error("Reviews GET API error:", error);

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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ReviewPayload;

    const bookingNo = body.booking_no?.trim();
    const rating = Number(body.rating);

    const comment =
      typeof body.comment === "string"
        ? body.comment.trim().slice(0, 500) || null
        : null;

    if (!bookingNo) {
      return NextResponse.json(
        {
          success: false,
          error: "Booking number is required.",
        },
        { status: 400 }
      );
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json(
        {
          success: false,
          error: "Rating must be a whole number from 1 to 5.",
        },
        { status: 400 }
      );
    }

    const supabaseAdmin = createAdminClient();

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("id, booking_no, assigned_rider, status")
      .eq("booking_no", bookingNo)
      .maybeSingle<{
        id: number;
        booking_no: string;
        assigned_rider: string | null;
        status: string | null;
      }>();

    if (orderError) {
      throw new Error(orderError.message);
    }

    if (!order) {
      return NextResponse.json(
        {
          success: false,
          error: "Booking not found.",
        },
        { status: 404 }
      );
    }

    if (order.status !== "Completed") {
      return NextResponse.json(
        {
          success: false,
          error: "Only completed deliveries can be reviewed.",
        },
        { status: 409 }
      );
    }

    const { data: existingReview, error: existingReviewError } =
      await supabaseAdmin
        .from("delivery_reviews")
        .select("id")
        .eq("order_id", order.id)
        .maybeSingle<{ id: number }>();

    if (existingReviewError) {
      throw new Error(existingReviewError.message);
    }

    if (existingReview) {
      return NextResponse.json(
        {
          success: false,
          code: "ALREADY_REVIEWED",
          error: "A review has already been submitted for this booking.",
        },
        { status: 409 }
      );
    }

    const { data: review, error: insertError } = await supabaseAdmin
      .from("delivery_reviews")
      .insert({
        order_id: order.id,
        booking_no: order.booking_no,
        rider_id: order.assigned_rider,
        rating,
        comment,
      })
      .select("id, rating, comment, created_at")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        return NextResponse.json(
          {
            success: false,
            code: "ALREADY_REVIEWED",
            error: "A review has already been submitted for this booking.",
          },
          { status: 409 }
        );
      }

      throw new Error(insertError.message);
    }

    return NextResponse.json({
      success: true,
      review,
    });
  } catch (error) {
    console.error("Review API error:", error);

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