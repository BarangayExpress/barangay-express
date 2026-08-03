import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireCustomer } from "@/lib/require-role";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const authorization = await requireCustomer();

    if (!authorization.authorized) {
      return authorization.response;
    }

    const supabaseAdmin = createAdminClient();
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, booking_no, pickup_address, dropoff_address, package_type, payment_method, payment_status, status, price, order_amount, total_amount, item_payment_flow, estimated_item_amount, actual_item_amount, purchase_payment_status, rider_advance_amount, created_at"
      )
      .eq("customer_user_id", authorization.userId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, orders: data ?? [] });
  } catch (error) {
    console.error("Customer orders GET error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load customer orders.",
      },
      { status: 500 }
    );
  }
}
