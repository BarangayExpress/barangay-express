import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/require-role";

const allowedStatuses = [
  "Pending",
  "Accepted",
  "Heading to Pickup",
  "Picked Up",
  "In Transit",
  "Delivered",
  "Completed",
  "Cancelled",
];

export async function PATCH(request: Request) {
  try {
    const authorization = await requireAdmin();
    if (!authorization.authorized) return authorization.response;

    const body = await request.json();
    const id = Number(body.id);
    const status = String(body.status);

    if (!Number.isInteger(id) || !allowedStatuses.includes(status)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid order ID or status.",
        },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    let error: { message: string } | null = null;

    const { data: currentOrder, error: currentOrderError } = await admin
      .from("orders")
      .select("status, assigned_rider")
      .eq("id", id)
      .single<{ status: string; assigned_rider: string | null }>();

    if (currentOrderError || !currentOrder) {
      return NextResponse.json(
        {
          success: false,
          error: currentOrderError?.message || "Order not found.",
        },
        { status: 404 }
      );
    }

    if (status === "Accepted") {
      return NextResponse.json(
        {
          success: false,
          error:
            "The rider must accept this order from the Rider Portal so the commission can be reserved safely.",
        },
        { status: 409 }
      );
    }

    const riderOnlyStatuses = [
      "Heading to Pickup",
      "Picked Up",
      "In Transit",
      "Delivered",
    ];

    if (riderOnlyStatuses.includes(status) && !currentOrder.assigned_rider) {
      return NextResponse.json(
        {
          success: false,
          error: "This order must be accepted by a rider before delivery can start.",
        },
        { status: 409 }
      );
    }

    if (status === "Cancelled") {
      const result = await admin.rpc("admin_cancel_order_with_commission_release", {
        p_order_id: id,
        p_admin_id: authorization.userId,
        p_reason: "Cancelled by admin",
      });
      error = result.error;
    } else if (status === "Completed") {
      if (!currentOrder.assigned_rider) {
        error = { message: "Completed order must have an assigned rider." };
      } else {
        const result = await admin.rpc("complete_order_with_commission", {
          p_order_id: id,
          p_rider_id: currentOrder.assigned_rider,
        });
        error = result.error;
      }
    } else {
      const result = await admin.from("orders").update({ status }).eq("id", id);
      error = result.error;
    }

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown server error",
      },
      { status: 500 }
    );
  }
}
