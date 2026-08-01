import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { createNotification } from "@/lib/notifications";
import { requireRider } from "@/lib/require-role";

export async function POST(request: Request) {
  try {
    const authorization = await requireRider();
    if (!authorization.authorized) return authorization.response;

    const { order_id } = (await request.json()) as { order_id?: number };
    const orderId = Number(order_id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json({ success: false, error: "Invalid order ID." }, { status: 400 });
    }

    const { data: order, error } = await createAdminClient()
      .from("orders")
      .select("id, booking_no, customer_user_id, assigned_rider, status")
      .eq("id", orderId)
      .maybeSingle<{
        id: number;
        booking_no: string | null;
        customer_user_id: string | null;
        assigned_rider: string | null;
        status: string | null;
      }>();
    if (error) throw new Error(error.message);
    if (!order || order.assigned_rider !== authorization.userId || order.status !== "Delivered") {
      return NextResponse.json({ success: false, error: "Delivered order not found." }, { status: 404 });
    }

    if (order.customer_user_id) {
      await createNotification({
        orderId: order.id,
        bookingNo: order.booking_no,
        recipientType: "customer",
        recipientUserId: order.customer_user_id,
        notificationType: "order_delivered",
        title: "Order Delivered",
        message: `Delivered na ang ${order.booking_no}.`,
        metadata: { href: "/customer/dashboard", status: "Delivered" },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delivered notification error:", error);
    return NextResponse.json({ success: false, error: "Notification failed." }, { status: 500 });
  }
}
