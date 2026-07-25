import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

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
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized. Mag-login muna.",
        },
        { status: 401 }
      );
    }

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

    const { error } = await supabase
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
