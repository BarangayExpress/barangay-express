import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireBusinessMember } from "@/lib/partner-auth";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ businessId: string }>;
};

/**
 * GET /api/partner/businesses/:businessId
 *
 * Secure Partner-only business detail endpoint. The caller must be an active
 * owner/manager/staff member of the requested business.
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { businessId } = await context.params;

    if (!businessId) {
      return NextResponse.json(
        { success: false, error: "Business ID is required." },
        { status: 400 }
      );
    }

    const authorization = await requireBusinessMember(businessId);
    if (!authorization.authorized) return authorization.response;

    const admin = createAdminClient();
    const { data: hours, error: hoursError } = await admin
      .from("business_hours")
      .select("id, day_of_week, is_closed, opens_at, closes_at")
      .eq("business_id", businessId)
      .order("day_of_week", { ascending: true });

    if (hoursError) {
      throw new Error(hoursError.message);
    }

    return NextResponse.json({
      success: true,
      membership: {
        member_role: authorization.membership.member_role,
        is_active: authorization.membership.membership_is_active,
      },
      business: authorization.membership.business,
      hours: hours ?? [],
    });
  } catch (error) {
    console.error("Partner business GET error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load Partner business.",
      },
      { status: 500 }
    );
  }
}
