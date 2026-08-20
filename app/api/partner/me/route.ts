import { NextResponse } from "next/server";
import {
  getPartnerMemberships,
  requireActiveAccount,
} from "@/lib/partner-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/partner/me
 *
 * Returns the signed-in account plus all active businesses the user can access.
 * Having zero memberships is valid and is how the UI can decide to show
 * "Apply as Partner" instead of the Partner dashboard.
 */
export async function GET() {
  try {
    const authorization = await requireActiveAccount();
    if (!authorization.authorized) return authorization.response;

    const memberships = await getPartnerMemberships(authorization.userId);

    return NextResponse.json({
      success: true,
      account: {
        user_id: authorization.userId,
        email: authorization.email,
        full_name: authorization.fullName,
        app_role: authorization.appRole,
      },
      has_partner_access: memberships.length > 0,
      memberships,
    });
  } catch (error) {
    console.error("Partner me GET error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load Partner access.",
      },
      { status: 500 }
    );
  }
}
