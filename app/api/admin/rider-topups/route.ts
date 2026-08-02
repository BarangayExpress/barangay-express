import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/require-role";
import { createNotification } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const authorization = await requireAdmin();
    if (!authorization.authorized) return authorization.response;
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("rider_topup_requests")
      .select("id, rider_id, amount, reference_number, proof_path, status, submitted_at, reviewed_at, review_note")
      .order("submitted_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);

    const riderIds = [...new Set((data || []).map((item) => item.rider_id))];
    const { data: profiles, error: profilesError } = riderIds.length
      ? await admin.from("profiles").select("id, full_name, email").in("id", riderIds)
      : { data: [], error: null };
    if (profilesError) throw new Error(profilesError.message);

    const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));
    const requests = await Promise.all((data || []).map(async (item) => {
      const { data: signed } = await admin.storage.from("rider-topup-proofs").createSignedUrl(item.proof_path, 600);
      return { ...item, rider: profileMap.get(item.rider_id) || null, proof_url: signed?.signedUrl || null };
    }));

    const { data: revenue, error: revenueError } = await admin
      .from("order_commissions")
      .select("commission_amount, status");
    if (revenueError) throw new Error(revenueError.message);

    const { data: settings, error: settingsError } = await admin
      .from("wallet_settings")
      .select("commission_rate, minimum_commission, minimum_topup, topup_gcash_name, topup_gcash_number")
      .eq("id", 1)
      .single();
    if (settingsError) throw new Error(settingsError.message);

    return NextResponse.json({
      success: true,
      requests,
      settings,
      summary: {
        earned_commission: (revenue || []).filter((row) => row.status === "Earned").reduce((sum, row) => sum + Number(row.commission_amount), 0),
        reserved_commission: (revenue || []).filter((row) => row.status === "Reserved").reduce((sum, row) => sum + Number(row.commission_amount), 0),
      },
    });
  } catch (error) {
    console.error("Admin top-ups GET error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unable to load top-ups." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authorization = await requireAdmin();
    if (!authorization.authorized) return authorization.response;
    const body = (await request.json()) as {
      request_id?: string; action?: string; note?: string;
      gcash_name?: string; gcash_number?: string; minimum_topup?: number;
    };
    const requestId = String(body.request_id || "").trim();
    const action = String(body.action || "").trim().toLowerCase();
    const note = String(body.note || "").trim().slice(0, 500);
    if (action === "settings") {
      const gcashName = String(body.gcash_name || "").trim().slice(0, 120);
      const gcashNumber = String(body.gcash_number || "").replace(/\D/g, "");
      const minimumTopup = Number(body.minimum_topup);
      if (gcashName.length < 2 || !/^09\d{9}$/.test(gcashNumber) || !Number.isFinite(minimumTopup) || minimumTopup < 1) {
        return NextResponse.json({ success: false, error: "Enter a valid GCash name, 09XXXXXXXXX number, and minimum top-up." }, { status: 400 });
      }
      const admin = createAdminClient();
      const { data, error } = await admin.from("wallet_settings").update({
        topup_gcash_name: gcashName,
        topup_gcash_number: gcashNumber,
        minimum_topup: minimumTopup.toFixed(2),
        updated_at: new Date().toISOString(),
        updated_by: authorization.userId,
      }).eq("id", 1).select().single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ success: true, settings: data });
    }
    if (!requestId || !["approve", "reject"].includes(action)) {
      return NextResponse.json({ success: false, error: "Valid request and action are required." }, { status: 400 });
    }

    const admin = createAdminClient();
    const functionName = action === "approve" ? "approve_rider_topup" : "reject_rider_topup";
    const { data, error } = await admin.rpc(functionName, {
      p_request_id: requestId,
      p_admin_id: authorization.userId,
      p_review_note: note || (action === "reject" ? "Payment could not be verified." : null),
    });
    if (error) {
      const conflict = error.message.includes("ALREADY_REVIEWED");
      return NextResponse.json({ success: false, error: conflict ? "This request was already reviewed." : error.message }, { status: conflict ? 409 : 400 });
    }
    const reviewedRequest = Array.isArray(data) ? data[0] : data;
    if (reviewedRequest?.rider_id) {
      try {
        await createNotification({
          recipientType: "rider",
          recipientUserId: reviewedRequest.rider_id,
          notificationType: action === "approve" ? "rider_topup_approved" : "rider_topup_rejected",
          title: action === "approve" ? "Wallet Top-up Approved" : "Wallet Top-up Rejected",
          message: action === "approve"
            ? `Na-credit na ang ₱${Number(reviewedRequest.amount).toFixed(2)} sa rider wallet mo.`
            : `Hindi na-approve ang top-up mo. ${note}`,
          metadata: { href: "/rider/dashboard", topup_request_id: reviewedRequest.id },
        });
      } catch (notificationError) {
        console.error("Top-up review notification failed:", notificationError);
      }
    }
    return NextResponse.json({ success: true, request: reviewedRequest });
  } catch (error) {
    console.error("Admin top-ups POST error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unable to review top-up." }, { status: 500 });
  }
}
