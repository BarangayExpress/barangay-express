import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import {
  BusinessSettingsRow,
  evaluateBusinessAvailability,
} from "@/lib/business-availability";

type UpdatePayload = {
  manual_open?: boolean;
  emergency_stop?: boolean;
  announcement?: string | null;
  opens_at?: string;
  closes_at?: string;
};

function isValidTime(value: string) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

async function requireAdmin() {
  const serverSupabase = await createServerClient();

  const {
    data: { user },
    error,
  } = await serverSupabase.auth.getUser();

  if (error || !user) {
    return {
      authorized: false as const,
      response: NextResponse.json(
        {
          success: false,
          error: "Unauthorized. Please log in.",
        },
        { status: 401 }
      ),
    };
  }

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const currentEmail = user.email?.trim().toLowerCase();

  if (!adminEmail || !currentEmail || currentEmail !== adminEmail) {
    return {
      authorized: false as const,
      response: NextResponse.json(
        {
          success: false,
          error: "Forbidden. Admin access only.",
        },
        { status: 403 }
      ),
    };
  }

  return {
    authorized: true as const,
  };
}

export async function GET() {
  try {
    const authorization = await requireAdmin();

    if (!authorization.authorized) {
      return authorization.response;
    }

    const supabaseAdmin = createAdminClient();

    const { data, error } = await supabaseAdmin
      .from("business_settings")
      .select(
        "id, manual_open, emergency_stop, announcement, opens_at, closes_at, timezone, updated_at"
      )
      .eq("id", 1)
      .single<BusinessSettingsRow>();

    if (error) {
      throw new Error(error.message);
    }

    const availability = evaluateBusinessAvailability(data);

    return NextResponse.json({
      success: true,
      settings: data,
      availability: {
        accepting_bookings: availability.acceptingBookings,
        reason: availability.reason,
        message: availability.message,
        current_time: availability.currentTime,
      },
    });
  } catch (error) {
    console.error("Admin business settings GET error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load business settings.",
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

    const body = (await request.json()) as UpdatePayload;
    const updates: Record<string, boolean | string | null> = {};

    if (typeof body.manual_open === "boolean") {
      updates.manual_open = body.manual_open;
    }

    if (typeof body.emergency_stop === "boolean") {
      updates.emergency_stop = body.emergency_stop;
    }

    if (
      typeof body.announcement === "string" ||
      body.announcement === null
    ) {
      updates.announcement =
        typeof body.announcement === "string"
          ? body.announcement.trim().slice(0, 500) || null
          : null;
    }

    if (typeof body.opens_at === "string") {
      if (!isValidTime(body.opens_at)) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid opening time.",
          },
          { status: 400 }
        );
      }

      updates.opens_at = body.opens_at;
    }

    if (typeof body.closes_at === "string") {
      if (!isValidTime(body.closes_at)) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid closing time.",
          },
          { status: 400 }
        );
      }

      updates.closes_at = body.closes_at;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No valid settings were provided.",
        },
        { status: 400 }
      );
    }

    updates.updated_at = new Date().toISOString();

    const supabaseAdmin = createAdminClient();

    const { data, error } = await supabaseAdmin
      .from("business_settings")
      .update(updates)
      .eq("id", 1)
      .select(
        "id, manual_open, emergency_stop, announcement, opens_at, closes_at, timezone, updated_at"
      )
      .single<BusinessSettingsRow>();

    if (error) {
      throw new Error(error.message);
    }

    const availability = evaluateBusinessAvailability(data);

    return NextResponse.json({
      success: true,
      settings: data,
      availability: {
        accepting_bookings: availability.acceptingBookings,
        reason: availability.reason,
        message: availability.message,
        current_time: availability.currentTime,
      },
    });
  } catch (error) {
    console.error("Admin business settings PATCH error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to update business settings.",
      },
      { status: 500 }
    );
  }
}