import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireRider } from "@/lib/require-role";
import { createNotification } from "@/lib/notifications";

export const dynamic = "force-dynamic";

type UpdatePayload = {
  order_id?: number;
  next_status?: string;
};

type OrderStatus =
  | "Pending"
  | "Accepted"
  | "Heading to Pickup"
  | "Picked Up"
  | "In Transit"
  | "Delivered"
  | "Completed"
  | "Cancelled";

type OrderRow = {
  id: number;
  booking_no: string | null;
  status: OrderStatus | null;
  assigned_rider: string | null;
  payment_method: string | null;
  payment_status: string | null;
  customer_user_id: string | null;
};

const STATUS_TRANSITIONS: Record<
  string,
  {
    nextStatus: OrderStatus;
    timestampColumn:
      | "accepted_at"
      | "heading_to_pickup_at"
      | "picked_up_at"
      | "in_transit_at"
      | "completed_at";
  } | null
> = {
  Pending: {
    nextStatus: "Accepted",
    timestampColumn: "accepted_at",
  },
  Accepted: {
    nextStatus: "Heading to Pickup",
    timestampColumn: "heading_to_pickup_at",
  },
  "Heading to Pickup": {
    nextStatus: "Picked Up",
    timestampColumn: "picked_up_at",
  },
  "Picked Up": {
    nextStatus: "In Transit",
    timestampColumn: "in_transit_at",
  },
  "In Transit": null,
  Delivered: {
    nextStatus: "Completed",
    timestampColumn: "completed_at",
  },
  Completed: null,
  Cancelled: null,
};

const ACTIVE_STATUSES = [
  "Accepted",
  "Heading to Pickup",
  "Picked Up",
  "In Transit",
  "Delivered",
];

export async function PATCH(request: Request) {
  try {
    const authorization = await requireRider();

    if (!authorization.authorized) {
      return authorization.response;
    }

    const body = (await request.json()) as UpdatePayload;
    const orderId = Number(body.order_id);
    const requestedNextStatus = String(body.next_status || "").trim();

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Valid order ID is required.",
        },
        { status: 400 }
      );
    }

    if (!requestedNextStatus) {
      return NextResponse.json(
        {
          success: false,
          error: "Next order status is required.",
        },
        { status: 400 }
      );
    }

    const supabaseAdmin = createAdminClient();

    const { data: order, error: orderError } =
      await supabaseAdmin
        .from("orders")
        .select(
          "id, booking_no, status, assigned_rider, payment_method, payment_status, customer_user_id"
        )
        .eq("id", orderId)
        .maybeSingle<OrderRow>();

    if (orderError) {
      throw new Error(orderError.message);
    }

    if (!order) {
      return NextResponse.json(
        {
          success: false,
          error: "Order not found.",
        },
        { status: 404 }
      );
    }

    const currentStatus = order.status || "Pending";
    const transition = STATUS_TRANSITIONS[currentStatus];

    if (!transition) {
      return NextResponse.json(
        {
          success: false,
          error: "This order cannot move to another status.",
        },
        { status: 409 }
      );
    }

    if (transition.nextStatus !== requestedNextStatus) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid status transition from ${currentStatus} to ${requestedNextStatus}.`,
        },
        { status: 409 }
      );
    }

    /*
     * GCash payment lock:
     * The customer may still track the booking, but the rider
     * cannot accept it until admin verification marks it Paid.
     */
    if (
      currentStatus === "Pending" &&
      order.payment_method === "GCash" &&
      order.payment_status !== "Paid"
    ) {
      return NextResponse.json(
        {
          success: false,
          code: "GCASH_PAYMENT_NOT_VERIFIED",
          error:
            "Hindi pa verified ang GCash payment. Hintayin munang ma-approve ng admin bago tanggapin ang order.",
        },
        { status: 409 }
      );
    }

    if (
      currentStatus === "Pending" &&
      order.assigned_rider !== null
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Na-accept na ng ibang rider ang order na ito.",
        },
        { status: 409 }
      );
    }

    if (
      currentStatus !== "Pending" &&
      order.assigned_rider !== authorization.userId
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Hindi naka-assign sa iyo ang order na ito.",
        },
        { status: 403 }
      );
    }

    if (currentStatus === "Pending") {
      const { count, error: activeCountError } =
        await supabaseAdmin
          .from("orders")
          .select("id", {
            count: "exact",
            head: true,
          })
          .eq("assigned_rider", authorization.userId)
          .in("status", ACTIVE_STATUSES);

      if (activeCountError) {
        throw new Error(activeCountError.message);
      }

      if ((count || 0) >= 1) {
        return NextResponse.json(
          {
            success: false,
            error:
              "May active delivery ka pa. Kumpletuhin muna ito bago tumanggap ng panibagong order.",
          },
          { status: 409 }
        );
      }
    }

    let updatedOrder: Record<string, unknown> | null = null;

    if (currentStatus === "Pending") {
      const { data, error } = await supabaseAdmin.rpc(
        "accept_order_with_commission",
        { p_order_id: orderId, p_rider_id: authorization.userId }
      );

      if (error) {
        const messages: Record<string, { code: string; message: string }> = {
          INSUFFICIENT_WALLET_BALANCE: {
            code: "INSUFFICIENT_WALLET_BALANCE",
            message: "Kulang ang available wallet balance para sa commission ng booking na ito. Mag-top-up muna.",
          },
          ORDER_ALREADY_ACCEPTED: {
            code: "ORDER_ALREADY_ACCEPTED",
            message: "Na-accept na ng ibang rider ang order na ito.",
          },
          ACTIVE_ORDER_LIMIT: {
            code: "ACTIVE_ORDER_LIMIT",
            message: "May active delivery ka pa. Kumpletuhin muna ito.",
          },
          GCASH_PAYMENT_NOT_VERIFIED: {
            code: "GCASH_PAYMENT_NOT_VERIFIED",
            message: "Hindi pa verified ang GCash payment.",
          },
        };
        const match = Object.keys(messages).find((key) => error.message.includes(key));
        const mapped = match ? messages[match] : null;
        return NextResponse.json(
          { success: false, code: mapped?.code || "WALLET_ACCEPT_FAILED", error: mapped?.message || error.message },
          { status: 409 }
        );
      }
      updatedOrder = Array.isArray(data) ? data[0] || null : data;
    } else if (currentStatus === "Delivered" && transition.nextStatus === "Completed") {
      const { data, error } = await supabaseAdmin.rpc(
        "complete_order_with_commission",
        { p_order_id: orderId, p_rider_id: authorization.userId }
      );
      if (error) {
        return NextResponse.json(
          { success: false, code: "COMMISSION_FINALIZATION_FAILED", error: "Hindi ma-finalize ang commission. I-refresh at subukan muli." },
          { status: 409 }
        );
      }
      updatedOrder = Array.isArray(data) ? data[0] || null : data;
    } else {
      const now = new Date().toISOString();
      const updates: Record<string, string> = {
        status: transition.nextStatus,
        [transition.timestampColumn]: now,
      };
      const { data, error: updateError } = await supabaseAdmin
        .from("orders")
        .update(updates)
        .eq("id", orderId)
        .eq("status", currentStatus)
        .eq("assigned_rider", authorization.userId)
        .select(
          `
          id,
          booking_no,
          sender_name,
          sender_phone,
          pickup_address,
          receiver_name,
          receiver_phone,
          dropoff_address,
          package_type,
          notes,
          payment_method,
          payment_status,
          status,
          price,
          order_amount,
          total_amount,
          created_at,
          assigned_rider,
          accepted_at,
          heading_to_pickup_at,
          picked_up_at,
          in_transit_at,
          delivered_at,
          completed_at,
          pickup_latitude,
          pickup_longitude,
          dropoff_latitude,
          dropoff_longitude,
          proof_photo_url,
          received_by,
          receiver_signature_url,
          proof_submitted_at
          `
        )
        .maybeSingle();
      if (updateError) throw new Error(updateError.message);
      updatedOrder = data;
    }

    if (!updatedOrder) {
      return NextResponse.json(
        {
          success: false,
          error:
            currentStatus === "Pending"
              ? "Na-accept na ng ibang rider ang order na ito."
              : "Hindi na-update ang order dahil nagbago na ang kasalukuyang status.",
        },
        { status: 409 }
      );
    }

    if (order.customer_user_id) {
      const statusMessages: Record<string, string> = {
        Accepted: "Tinanggap na ng rider ang iyong booking.",
        "Heading to Pickup": "Papunta na ang rider sa pickup location.",
        "Picked Up": "Nakuha na ng rider ang iyong item.",
        "In Transit": "Papunta na sa drop-off location ang delivery.",
        Completed: "Completed na ang iyong delivery. Salamat!",
      };
      try {
        await createNotification({
          orderId: order.id,
          bookingNo: order.booking_no,
          recipientType: "customer",
          recipientUserId: order.customer_user_id,
          notificationType: "order_status_changed",
          title: `Order ${transition.nextStatus}`,
          message: statusMessages[transition.nextStatus] ?? `Ang booking mo ay ${transition.nextStatus} na.`,
          metadata: { href: "/customer/dashboard", status: transition.nextStatus },
        });
      } catch (notificationError) {
        console.error("Order status notification failed:", notificationError);
      }
    }

    return NextResponse.json({
      success: true,
      order: updatedOrder,
    });
  } catch (error) {
    console.error("Rider order status API error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to update rider order.",
      },
      { status: 500 }
    );
  }
}
