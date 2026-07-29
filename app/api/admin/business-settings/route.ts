import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import {
  BusinessSettingsRow,
  evaluateBusinessAvailability,
} from "@/lib/business-availability";
import { requireAdmin } from "@/lib/require-role";

type AdminBusinessSettingsRow = BusinessSettingsRow & {
  gcash_enabled: boolean;
  gcash_account_name: string | null;
  gcash_number: string | null;
  gcash_qr_url: string | null;
  payment_instructions: string | null;
};

type UpdatePayload = {
  manual_open?: boolean;
  emergency_stop?: boolean;
  announcement?: string | null;
  opens_at?: string;
  closes_at?: string;

  gcash_enabled?: boolean;
  gcash_account_name?: string | null;
  gcash_number?: string | null;
  gcash_qr_url?: string | null;
  payment_instructions?: string | null;
};

const SETTINGS_SELECT = `
  id,
  manual_open,
  emergency_stop,
  announcement,
  opens_at,
  closes_at,
  timezone,
  updated_at,
  gcash_enabled,
  gcash_account_name,
  gcash_number,
  gcash_qr_url,
  payment_instructions
`;

function isValidTime(value: string) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function cleanNullableText(
  value: string | null,
  maximumLength: number
): string | null {
  if (value === null) {
    return null;
  }

  const cleanedValue = value.trim().slice(0, maximumLength);

  return cleanedValue || null;
}

function normalizePhilippineMobileNumber(value: string | null) {
  if (value === null) {
    return null;
  }

  const cleanedValue = value.replace(/[^\d+]/g, "").trim();

  if (!cleanedValue) {
    return null;
  }

  if (/^09\d{9}$/.test(cleanedValue)) {
    return cleanedValue;
  }

  if (/^\+639\d{9}$/.test(cleanedValue)) {
    return `0${cleanedValue.slice(3)}`;
  }

  throw new Error(
    "Invalid GCash number. Use the format 09XXXXXXXXX."
  );
}

function isValidHttpUrl(value: string) {
  try {
    const parsedUrl = new URL(value);

    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
  } catch {
    return false;
  }
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
      .select(SETTINGS_SELECT)
      .eq("id", 1)
      .single<AdminBusinessSettingsRow>();

    if (error) {
      throw new Error(error.message);
    }

    const availability = evaluateBusinessAvailability(data);

    return NextResponse.json(
      {
        success: true,
        settings: data,
        availability: {
          accepting_bookings: availability.acceptingBookings,
          reason: availability.reason,
          message: availability.message,
          current_time: availability.currentTime,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
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

    const updates: Record<
      string,
      boolean | string | null
    > = {};

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
      updates.announcement = cleanNullableText(
        body.announcement,
        500
      );
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

    if (typeof body.gcash_enabled === "boolean") {
      updates.gcash_enabled = body.gcash_enabled;
    }

    if (
      typeof body.gcash_account_name === "string" ||
      body.gcash_account_name === null
    ) {
      updates.gcash_account_name = cleanNullableText(
        body.gcash_account_name,
        120
      );
    }

    if (
      typeof body.gcash_number === "string" ||
      body.gcash_number === null
    ) {
      try {
        updates.gcash_number =
          normalizePhilippineMobileNumber(body.gcash_number);
      } catch (error) {
        return NextResponse.json(
          {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Invalid GCash number.",
          },
          { status: 400 }
        );
      }
    }

    if (
      typeof body.gcash_qr_url === "string" ||
      body.gcash_qr_url === null
    ) {
      const qrUrl = cleanNullableText(body.gcash_qr_url, 2000);

      if (qrUrl && !isValidHttpUrl(qrUrl)) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid GCash QR image URL.",
          },
          { status: 400 }
        );
      }

      updates.gcash_qr_url = qrUrl;
    }

    if (
      typeof body.payment_instructions === "string" ||
      body.payment_instructions === null
    ) {
      updates.payment_instructions = cleanNullableText(
        body.payment_instructions,
        1000
      );
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
      .select(SETTINGS_SELECT)
      .single<AdminBusinessSettingsRow>();

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