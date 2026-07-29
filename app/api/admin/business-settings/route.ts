import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import {
  BusinessSettingsRow,
  evaluateBusinessAvailability,
} from "@/lib/business-availability";
import { requireAdmin } from "@/lib/require-role";

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