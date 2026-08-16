import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireRole } from "@/lib/require-role";
import { checkRateLimit, getRequestIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type OrderRow = {
  id: number;
  assigned_rider: string | null;
  item_payment_flow: string | null;
  merchant_payment_status: string | null;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authorization = await requireRole(["rider"]);

    if (!authorization.authorized) {
      return authorization.response;
    }

    const { id } = await context.params;
    const orderId = Number(id);

    if (!Number.isSafeInteger(orderId) || orderId <= 0) {
      return NextResponse.json(
        { success: false, error: "Invalid order id." },
        { status: 400 }
      );
    }

    const rateLimit = checkRateLimit(
      `merchant-payment-confirm:${authorization.userId}:${getRequestIp(request)}`,
      10,
      60_000
    );

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests. Please wait." },
        { status: 429 }
      );
    }

    const supabase = createAdminClient();

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(
        "id, assigned_rider, item_payment_flow, merchant_payment_status"
      )
      .eq("id", orderId)
      .maybeSingle<OrderRow>();

    if (orderError) {
      throw new Error(orderError.message);
    }

    if (!order) {
      return NextResponse.json(
        { success: false, error: "Order not found." },
        { status: 404 }
      );
    }

    if (order.assigned_rider !== authorization.userId) {
      return NextResponse.json(
        {
          success: false,
          error: "This order is not assigned to this rider.",
        },
        { status: 403 }
      );
    }

    if (order.item_payment_flow !== "merchant_direct") {
      return NextResponse.json(
        {
          success: false,
          error: "This order does not use Merchant Direct payment.",
        },
        { status: 409 }
      );
    }

    if (order.merchant_payment_status === "Payment Confirmed") {
      return NextResponse.json({
        success: true,
        already_confirmed: true,
      });
    }

    if (order.merchant_payment_status !== "Proof Submitted") {
      return NextResponse.json(
        {
          success: false,
          error: "Customer payment proof has not been submitted yet.",
        },
        { status: 409 }
      );
    }

    const confirmedAt = new Date().toISOString();

    const { data: updated, error: updateError } = await supabase
      .from("orders")
      .update({
        merchant_payment_status: "Payment Confirmed",
        merchant_payment_confirmed_at: confirmedAt,
        merchant_payment_confirmed_by: authorization.userId,
      })
      .eq("id", order.id)
      .eq("assigned_rider", authorization.userId)
      .eq("merchant_payment_status", "Proof Submitted")
      .select(
        "id, merchant_payment_status, merchant_payment_confirmed_at, merchant_payment_confirmed_by"
      )
      .maybeSingle();

    if (updateError) {
      throw new Error(updateError.message);
    }

    if (!updated) {
      return NextResponse.json(
        {
          success: false,
          error: "Merchant payment confirmation conflict. Please refresh.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      order: updated,
    });
  } catch (error) {
    console.error("Confirm merchant payment error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to confirm merchant payment.",
      },
      { status: 500 }
    );
  }
}