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

    const { error } = await createAdminClient()
      .from("orders")
      .update({ status })
      .eq("id", id);

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
