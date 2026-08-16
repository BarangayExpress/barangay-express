import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/require-role";

export async function POST(req: Request) {
  try {
    const authorization = await requireAdmin();

    if (!authorization.authorized) {
      return authorization.response;
    }

    const body = await req.json();
    const orderId = Number(body.orderId);
    const riderId = String(body.riderId || "");

    if (!orderId || !riderId) {
      return NextResponse.json(
        {
          success: false,
          error: "Order and rider are required.",
        },
        { status: 400 }
      );
    }

    const serverSupabase = await createServerClient();
    const adminSupabase = createAdminClient();

    // 1. Check booking
    const { data: order, error: orderError } = await serverSupabase
      .from("orders")
      .select("id, booking_no, status, assigned_rider")
      .eq("id", orderId)
      .maybeSingle();

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

    if (order.status !== "Pending") {
      return NextResponse.json(
        {
          success: false,
          error: "Only pending bookings can be manually assigned.",
        },
        { status: 409 }
      );
    }

    if (order.assigned_rider) {
      return NextResponse.json(
        {
          success: false,
          error: "This booking already has an assigned rider.",
        },
        { status: 409 }
      );
    }

   // 2. Check rider availability
const { data: rider, error: riderError } = await adminSupabase
  .from("rider_profiles")
  .select("id, full_name, is_active, is_online")
  .eq("id", riderId)
  .maybeSingle();

if (riderError) {
  throw new Error(riderError.message);
}

if (!rider) {
  return NextResponse.json(
    {
      success: false,
      error: "Rider not found.",
    },
    { status: 404 }
  );
}

if (!rider.is_active) {
  return NextResponse.json(
    {
      success: false,
      error: "This rider is inactive.",
    },
    { status: 409 }
  );
}

if (!rider.is_online) {
  return NextResponse.json(
    {
      success: false,
      error: "This rider is currently offline.",
    },
    { status: 409 }
  );
}

// Check actual active orders instead of trusting a stored counter.
const activeStatuses = [
  "Accepted",
  "Heading to Pickup",
  "Picked Up",
  "In Transit",
  "Delivered",
];

const { count: activeDeliveryCount, error: activeDeliveryError } =
  await adminSupabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("assigned_rider", riderId)
    .in("status", activeStatuses);

if (activeDeliveryError) {
  throw new Error(activeDeliveryError.message);
}

if ((activeDeliveryCount || 0) > 0) {
  return NextResponse.json(
    {
      success: false,
      error: "This rider already has an active delivery.",
    },
    { status: 409 }
  );
}
    const { data: assignmentData, error: assignmentError } =
  await adminSupabase.rpc("accept_order_with_commission", {
    p_order_id: orderId,
    p_rider_id: riderId,
  });

if (assignmentError) {
  const message = assignmentError.message || "";

  if (message.includes("INSUFFICIENT_WALLET_BALANCE")) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Kulang ang rider wallet balance para sa commission ng booking na ito.",
      },
      { status: 409 }
    );
  }

  if (message.includes("ACTIVE_ORDER_LIMIT")) {
    return NextResponse.json(
      {
        success: false,
        error: "May active delivery pa ang rider na ito.",
      },
      { status: 409 }
    );
  }

  if (message.includes("GCASH_PAYMENT_NOT_VERIFIED")) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Hindi pa verified ang GCash payment ng booking na ito.",
      },
      { status: 409 }
    );
  }

  if (message.includes("ORDER_ALREADY_ACCEPTED")) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Na-accept o na-assign na ang booking na ito.",
      },
      { status: 409 }
    );
  }

  throw new Error(message);
}

const updatedOrder = Array.isArray(assignmentData)
  ? assignmentData[0] || null
  : assignmentData;

if (!updatedOrder) {
  return NextResponse.json(
    {
      success: false,
      error: "Unable to assign rider.",
    },
    { status: 409 }
  );
}

    return NextResponse.json({
      success: true,
      order: updatedOrder,
      rider: {
        id: rider.id,
        full_name: rider.full_name,
      },
    });
  } catch (error) {
    console.error("Assign rider API error:", error);

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