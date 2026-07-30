import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/require-role";

export const dynamic = "force-dynamic";

type PaymentStatus =
  | "Unpaid"
  | "For Verification"
  | "Paid"
  | "Rejected"
  | "Refunded";

type PaymentUpdatePayload = {
  order_id?: number;
  action?: "approve" | "reject" | "refund" | "reset";
};

type PaymentOrderRow = {
  id: number;
  booking_no: string | null;
  sender_name: string | null;
  sender_phone: string | null;
  receiver_name: string | null;
  payment_method: string | null;
  payment_status: PaymentStatus | null;
  payment_reference: string | null;
  payment_submitted_at: string | null;
  payment_verified_at: string | null;
  payment_proof_path: string | null;
  payment_verified_by: string | null;
  cash_collected_at: string | null;
  cash_collected_by: string | null;
  price: number | string | null;
  status: string | null;
  created_at: string | null;
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
const { data, error } = await supabaseAdmin
  .from("orders")
  .select(
    `
    id,
    booking_no,
    sender_name,
    sender_phone,
    receiver_name,
    payment_method,
    payment_status,
    payment_reference,
    payment_submitted_at,
    payment_verified_at,
    payment_verified_by,
    cash_collected_at,
    cash_collected_by,
    price,
    status,
    created_at,
    payment_proof_path
    `
  )
  .order("created_at", { ascending: false })
  .returns<PaymentOrderRow[]>();

if (error) {
  throw new Error(error.message);
}

const payments = await Promise.all(
  (data ?? []).map(async (payment) => {
    let payment_proof_url: string | null = null;

    if (payment.payment_proof_path) {
      const { data: signedUrlData, error: signedUrlError } =
        await supabaseAdmin.storage
          .from("payment-proofs")
          .createSignedUrl(
            payment.payment_proof_path,
            60 * 60
          );

      if (signedUrlError) {
        console.warn(
          `Unable to create signed payment-proof URL for ${
            payment.booking_no || payment.id
          }:`,
          signedUrlError.message
        );
      } else {
        payment_proof_url =
          signedUrlData?.signedUrl ?? null;
      }
    }

    return {
      ...payment,
      payment_proof_url,
    };
  })
);

return NextResponse.json(
  {
    success: true,
    payments,
  },
  {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  }
);
  } catch (error) {
    console.error("Payments GET API error:", error);

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

export async function PATCH(request: Request) {
  try {
    const authorization = await requireAdmin();

if (!authorization.authorized) {
  return authorization.response;
}
    const body = (await request.json()) as PaymentUpdatePayload;

    const orderId = Number(body.order_id);
    const action = body.action;

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Valid order ID is required.",
        },
        { status: 400 }
      );
    }

    if (
      !action ||
      !["approve", "reject", "refund", "reset"].includes(action)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid payment action.",
        },
        { status: 400 }
      );
    }

    const supabaseAdmin = createAdminClient();

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select(
        "id, booking_no, payment_method, payment_status, payment_reference"
      )
      .eq("id", orderId)
      .maybeSingle<{
        id: number;
        booking_no: string | null;
        payment_method: string | null;
        payment_status: PaymentStatus | null;
        payment_reference: string | null;
      }>();

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

    const now = new Date().toISOString();

    let updates: {
      payment_status: PaymentStatus;
      payment_verified_at: string | null;
      payment_verified_by: string | null;
    };

    if (action === "approve") {
      if (order.payment_method !== "GCash") {
        return NextResponse.json(
          {
            success: false,
            error: "Only GCash payments require admin verification.",
          },
          { status: 409 }
        );
      }

      if (!order.payment_reference) {
        return NextResponse.json(
          {
            success: false,
            error: "Payment reference is missing.",
          },
          { status: 409 }
        );
      }

      if (order.payment_status !== "For Verification") {
        return NextResponse.json(
          {
            success: false,
            error:
              "Only payments marked For Verification can be approved.",
          },
          { status: 409 }
        );
      }

      updates = {
        payment_status: "Paid",
        payment_verified_at: now,
        payment_verified_by: authorization.email|| authorization.userId,
      };
    } else if (action === "reject") {
      if (order.payment_method !== "GCash") {
        return NextResponse.json(
          {
            success: false,
            error: "Only GCash payments can be rejected.",
          },
          { status: 409 }
        );
      }

      if (order.payment_status !== "For Verification") {
        return NextResponse.json(
          {
            success: false,
            error:
              "Only payments marked For Verification can be rejected.",
          },
          { status: 409 }
        );
      }

      updates = {
        payment_status: "Rejected",
        payment_verified_at: now,
        payment_verified_by:authorization.email ||authorization.userId,
      };
    } else if (action === "refund") {
      if (order.payment_status !== "Paid") {
        return NextResponse.json(
          {
            success: false,
            error: "Only paid orders can be marked as refunded.",
          },
          { status: 409 }
        );
      }

      updates = {
        payment_status: "Refunded",
        payment_verified_at: now,
        payment_verified_by:authorization.email ||authorization.userId,
      };
    } else {
      updates = {
        payment_status: "Unpaid",
        payment_verified_at: null,
        payment_verified_by: null,
      };
    }

    const { data: updatedOrder, error: updateError } = await supabaseAdmin
      .from("orders")
      .update(updates)
      .eq("id", orderId)
      .select(
        "id, booking_no, payment_method, payment_status, payment_reference, payment_verified_at, payment_verified_by"
      )
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    return NextResponse.json({
      success: true,
      payment: updatedOrder,
    });
  } catch (error) {
    console.error("Payments PATCH API error:", error);

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