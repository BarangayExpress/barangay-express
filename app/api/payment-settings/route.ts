import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type PublicPaymentSettingsRow = {
  gcash_enabled: boolean;
  gcash_account_name: string | null;
  gcash_number: string | null;
  gcash_qr_url: string | null;
  payment_instructions: string | null;
};

export async function GET() {
  try {
    const supabaseAdmin = createAdminClient();

    const { data, error } = await supabaseAdmin
      .from("business_settings")
      .select(
        "gcash_enabled, gcash_account_name, gcash_number, gcash_qr_url, payment_instructions"
      )
      .eq("id", 1)
      .single<PublicPaymentSettingsRow>();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json(
      {
        success: true,
        settings: {
          gcash_enabled: data.gcash_enabled,
          gcash_account_name: data.gcash_enabled
            ? data.gcash_account_name
            : null,
          gcash_number: data.gcash_enabled
            ? data.gcash_number
            : null,
          gcash_qr_url: data.gcash_enabled
            ? data.gcash_qr_url
            : null,
          payment_instructions: data.gcash_enabled
            ? data.payment_instructions
            : null,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("Public payment settings GET error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load payment settings.",
      },
      { status: 500 }
    );
  }
}