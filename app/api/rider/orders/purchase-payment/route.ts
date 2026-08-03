import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireRider } from "@/lib/require-role";

export const dynamic = "force-dynamic";

type Payload = {
  order_id?: number;
  action?: "accept_advance" | "payment_received";
  actual_amount?: number;
};

export async function PATCH(request: Request) {
  const authorization = await requireRider();
  if (!authorization.authorized) return authorization.response;

  try {
    const body = (await request.json()) as Payload;
    const orderId = Number(body.order_id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json({ success: false, error: "Valid order ID is required." }, { status: 400 });
    }

    const admin = createAdminClient();
    const rpc = body.action === "accept_advance"
      ? admin.rpc("rider_accept_advance", {
          p_order_id: orderId,
          p_rider_id: authorization.userId,
          p_actual_amount: Number(body.actual_amount),
        })
      : body.action === "payment_received"
        ? admin.rpc("rider_mark_advance_payment_received", {
            p_order_id: orderId,
            p_rider_id: authorization.userId,
          })
        : null;

    if (!rpc) {
      return NextResponse.json({ success: false, error: "Invalid payment action." }, { status: 400 });
    }

    const { data, error } = await rpc;
    if (error) {
      const messages: Record<string, string> = {
        PER_BOOKING_ADVANCE_LIMIT: "Lampas sa pinapayagang advance amount ang actual item cost.",
        RIDER_EXPOSURE_LIMIT: "Lampas sa kabuuang active advance limit ng rider.",
        ACTIVE_ADVANCE_LIMIT: "May isa ka pang aktibong Rider Advance. Tapusin muna iyon.",
        RIDER_ADVANCE_DISABLED: "Pansamantalang naka-disable ang Rider Advance.",
      };
      const key = Object.keys(messages).find((item) => error.message.includes(item));
      return NextResponse.json({ success: false, code: key || "ADVANCE_UPDATE_FAILED", error: key ? messages[key] : error.message }, { status: 409 });
    }

    const order = Array.isArray(data) ? data[0] || null : data;
    return NextResponse.json({ success: true, order });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unable to update purchase payment." }, { status: 500 });
  }
}
