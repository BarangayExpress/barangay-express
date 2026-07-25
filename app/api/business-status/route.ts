import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import {
  BusinessSettingsRow,
  evaluateBusinessAvailability,
} from "@/lib/business-availability";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
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

    return NextResponse.json(
      {
        success: true,
        settings: {
          announcement: data.announcement,
          opens_at: availability.opensAt,
          closes_at: availability.closesAt,
          timezone: data.timezone,
          updated_at: data.updated_at,
        },
        availability: {
          accepting_bookings: availability.acceptingBookings,
          reason: availability.reason,
          message: availability.message,
          current_time: availability.currentTime,
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("Business status GET error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load business status.",
      },
      { status: 500 }
    );
  }
}