import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { cleanCustomerText } from "@/lib/customer";
import { requireCustomer } from "@/lib/require-role";

export const dynamic = "force-dynamic";

type ProfileUpdatePayload = {
  full_name?: string;
};

export async function GET() {
  try {
    const authorization = await requireCustomer();

    if (!authorization.authorized) {
      return authorization.response;
    }

    const supabaseAdmin = createAdminClient();
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, role, is_active")
      .eq("id", authorization.userId)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, profile: data });
  } catch (error) {
    console.error("Customer profile GET error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load customer profile.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const authorization = await requireCustomer();

    if (!authorization.authorized) {
      return authorization.response;
    }

    const body = (await request.json()) as ProfileUpdatePayload;
    const fullName = cleanCustomerText(body.full_name, 120);

    if (fullName.length < 2) {
      return NextResponse.json(
        {
          success: false,
          error: "Full name must contain at least 2 characters.",
        },
        { status: 400 }
      );
    }

    const supabaseAdmin = createAdminClient();
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update({ full_name: fullName })
      .eq("id", authorization.userId)
      .eq("role", "customer")
      .eq("is_active", true)
      .select("id, email, full_name, role, is_active")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, profile: data });
  } catch (error) {
    console.error("Customer profile PATCH error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to update customer profile.",
      },
      { status: 500 }
    );
  }
}
