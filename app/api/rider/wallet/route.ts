import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireRider } from "@/lib/require-role";
import { createNotification } from "@/lib/notifications";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_SIZE = 5 * 1024 * 1024;

function extensionFor(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

export async function GET() {
  try {
    const authorization = await requireRider();
    if (!authorization.authorized) return authorization.response;

    const admin = createAdminClient();
    const [{ data: wallet, error: walletError }, { data: settings, error: settingsError }, { data: topups, error: topupsError }, { data: transactions, error: transactionsError }] =
      await Promise.all([
        admin.from("rider_wallets").select("available_balance, reserved_balance, lifetime_topups, lifetime_commission, updated_at").eq("rider_id", authorization.userId).maybeSingle(),
        admin.from("wallet_settings").select("commission_rate, minimum_commission, minimum_topup, topup_gcash_name, topup_gcash_number, topup_qr_path").eq("id", 1).single(),
        admin.from("rider_topup_requests").select("id, amount, reference_number, status, submitted_at, reviewed_at, review_note").eq("rider_id", authorization.userId).order("submitted_at", { ascending: false }).limit(10),
        admin.from("wallet_transactions").select("id, transaction_type, available_change, reserved_change, available_balance_after, reserved_balance_after, description, created_at").eq("rider_id", authorization.userId).order("created_at", { ascending: false }).limit(20),
      ]);

    if (walletError || settingsError || topupsError || transactionsError) {
      throw new Error(walletError?.message || settingsError?.message || topupsError?.message || transactionsError?.message);
    }

    return NextResponse.json({
      success: true,
      wallet: wallet || { available_balance: 0, reserved_balance: 0, lifetime_topups: 0, lifetime_commission: 0 },
      settings,
      topups: topups || [],
      transactions: transactions || [],
    });
  } catch (error) {
    console.error("Rider wallet GET error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unable to load wallet." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authorization = await requireRider();
    if (!authorization.authorized) return authorization.response;

    const form = await request.formData();
    const amount = Number(form.get("amount"));
    const referenceNumber = String(form.get("reference_number") || "").trim();
    const proof = form.get("proof");

    const admin = createAdminClient();
    const { data: settings, error: settingsError } = await admin
      .from("wallet_settings")
      .select("minimum_topup")
      .eq("id", 1)
      .single<{ minimum_topup: number | string }>();
    if (settingsError) throw new Error(settingsError.message);

    const minimumTopup = Number(settings.minimum_topup);
    if (!Number.isFinite(amount) || amount < minimumTopup || amount > 50000) {
      return NextResponse.json({ success: false, error: `Top-up must be between ₱${minimumTopup.toFixed(2)} and ₱50,000.` }, { status: 400 });
    }
    if (!/^[A-Za-z0-9-]{6,80}$/.test(referenceNumber)) {
      return NextResponse.json({ success: false, error: "Enter a valid GCash reference number." }, { status: 400 });
    }
    if (!(proof instanceof File) || proof.size === 0) {
      return NextResponse.json({ success: false, error: "GCash proof screenshot is required." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(proof.type)) {
      return NextResponse.json({ success: false, error: "Proof must be JPG, PNG, or WEBP." }, { status: 415 });
    }
    if (proof.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, error: "Proof image must be 5 MB or smaller." }, { status: 413 });
    }

    const path = `${authorization.userId}/${crypto.randomUUID()}.${extensionFor(proof.type)}`;
    const bytes = new Uint8Array(await proof.arrayBuffer());
    const { error: uploadError } = await admin.storage.from("rider-topup-proofs").upload(path, bytes, { contentType: proof.type, upsert: false });
    if (uploadError) throw new Error(uploadError.message);

    const { data: topup, error: insertError } = await admin
      .from("rider_topup_requests")
      .insert({ rider_id: authorization.userId, amount: amount.toFixed(2), reference_number: referenceNumber, proof_path: path })
      .select("id, amount, reference_number, status, submitted_at")
      .single();

    if (insertError) {
      await admin.storage.from("rider-topup-proofs").remove([path]);
      if (insertError.code === "23505") {
        return NextResponse.json({ success: false, error: "This GCash reference number was already submitted." }, { status: 409 });
      }
      throw new Error(insertError.message);
    }

    try {
      await createNotification({
        recipientType: "admin",
        notificationType: "rider_topup_submitted",
        title: "Rider Top-up Needs Verification",
        message: `May bagong rider top-up na ₱${amount.toFixed(2)}. Ref: ${referenceNumber}`,
        metadata: { href: "/dashboard/rider-wallets", topup_request_id: topup.id },
      });
    } catch (notificationError) {
      console.error("Top-up notification failed:", notificationError);
    }

    return NextResponse.json({ success: true, topup }, { status: 201 });
  } catch (error) {
    console.error("Rider wallet POST error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unable to submit top-up." }, { status: 500 });
  }
}
