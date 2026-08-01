import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireCustomer } from "@/lib/require-role";
import { createManyNotifications } from "@/lib/notifications";

type CancellationPayload = {
  booking_no?: string;
  sender_phone?: string;
  reason?: string;
};

type OrderRow = {
  id: number;
  booking_no: string;
  sender_phone: string | null;
  status: string | null;
  customer_user_id: string | null;
  assigned_rider: string | null;
};

const customerCancellableStatuses = new Set([
  "Pending",
  "Accepted",
]);

function cleanText(value: unknown, maximumLength: number) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maximumLength);
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

export async function POST(request: Request) {
  try {
    const authorization = await requireCustomer();

    if (!authorization.authorized) {
      return authorization.response;
    }

    const body = (await request.json()) as CancellationPayload;

    const bookingNo = cleanText(body.booking_no, 80).toUpperCase();
    const senderPhone = normalizePhone(
      cleanText(body.sender_phone, 20)
    );
    const reason = cleanText(body.reason, 500);

    if (!bookingNo) {
      return NextResponse.json(
        {
          success: false,
          error: "Booking number is required.",
        },
        { status: 400 }
      );
    }

    if (!/^BE-\d{10,}$/.test(bookingNo)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid booking number.",
        },
        { status: 400 }
      );
    }

    if (!/^09\d{9}$/.test(senderPhone)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Sender phone number must use the 09XXXXXXXXX format.",
        },
        { status: 400 }
      );
    }

    if (reason.length < 3) {
      return NextResponse.json(
        {
          success: false,
          error: "Cancellation reason is required.",
        },
        { status: 400 }
      );
    }

    const supabaseAdmin = createAdminClient();

    const { data: order, error: orderError } =
      await supabaseAdmin
        .from("orders")
        .select(
          "id, booking_no, sender_phone, status, customer_user_id, assigned_rider"
        )
        .eq("booking_no", bookingNo)
        .maybeSingle<OrderRow>();

    if (orderError) {
      throw new Error(orderError.message);
    }

    /*
      Parehong error ang ginagamit kapag:
      - walang booking
      - mali ang sender phone

      Para hindi madaling ma-discover ng ibang tao
      ang private booking information.
    */
    const storedPhone = normalizePhone(order?.sender_phone || "");

    if (
      !order ||
      order.customer_user_id !== authorization.userId ||
      storedPhone !== senderPhone
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Booking number or sender phone number is incorrect.",
        },
        { status: 404 }
      );
    }

    const currentStatus = order.status || "Pending";

    if (currentStatus === "Cancelled") {
      return NextResponse.json(
        {
          success: false,
          code: "ALREADY_CANCELLED",
          error: "This booking has already been cancelled.",
        },
        { status: 409 }
      );
    }

    if (!customerCancellableStatuses.has(currentStatus)) {
      return NextResponse.json(
        {
          success: false,
          code: "CANCELLATION_NOT_ALLOWED",
          error:
            "Customer cancellation is no longer allowed because the rider has already started the pickup process.",
        },
        { status: 409 }
      );
    }

    const cancelledAt = new Date().toISOString();

    /*
      May status condition para hindi ma-cancel kapag
      biglang nag-update ang rider habang pinoproseso
      ang cancellation request.
    */
    const { data: cancelledOrder, error: updateError } =
      await supabaseAdmin
        .from("orders")
        .update({
          status: "Cancelled",
          cancellation_reason: reason,
          cancelled_by: "customer",
          cancelled_at: cancelledAt,
        })
        .eq("id", order.id)
        .in("status", ["Pending", "Accepted"])
        .select(
          "booking_no, status, cancellation_reason, cancelled_by, cancelled_at"
        )
        .maybeSingle();

    if (updateError) {
      throw new Error(updateError.message);
    }

    if (!cancelledOrder) {
      return NextResponse.json(
        {
          success: false,
          code: "STATUS_CHANGED",
          error:
            "The booking status changed before cancellation was completed. Refresh and try again.",
        },
        { status: 409 }
      );
    }

    try {
      await createManyNotifications({
        notifications: [
          {
            orderId: order.id,
            bookingNo: order.booking_no,
            recipientType: "customer",
            recipientUserId: authorization.userId,
            notificationType: "booking_cancelled",
            title: "Booking Cancelled",
            message: `Cancelled na ang ${order.booking_no}.`,
            metadata: { href: "/customer/dashboard" },
          },
          {
            orderId: order.id,
            bookingNo: order.booking_no,
            recipientType: "admin",
            notificationType: "booking_cancelled",
            title: "Customer Cancelled Booking",
            message: `${order.booking_no} was cancelled by the customer.`,
            metadata: { href: "/dashboard" },
          },
          ...(order.assigned_rider
            ? [{
                orderId: order.id,
                bookingNo: order.booking_no,
                recipientType: "rider" as const,
                recipientUserId: order.assigned_rider,
                notificationType: "booking_cancelled",
                title: "Assigned Booking Cancelled",
                message: `Cancelled na ng customer ang ${order.booking_no}.`,
                metadata: { href: "/rider/dashboard" },
              }]
            : []),
        ],
      });
    } catch (notificationError) {
      console.error("Cancellation notification failed:", notificationError);
    }

    return NextResponse.json({
      success: true,
      message: "Booking cancelled successfully.",
      order: cancelledOrder,
    });
  } catch (error) {
    console.error("Customer cancellation API error:", error);

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
