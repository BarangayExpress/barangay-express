import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/require-role";

export const dynamic = "force-dynamic";

function clean(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function temporaryPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, (value) => chars[value % chars.length]).join("");
}

export async function GET(request: Request) {
  const authorization = await requireAdmin();
  if (!authorization.authorized) return authorization.response;
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "pending";
  const admin = createAdminClient();
  let query = admin.from("rider_applications").select("*").order("created_at", { ascending: false });
  if (["pending", "needs_documents", "under_review", "approved", "rejected"].includes(status)) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  const documentColumns = ["license_front_path", "license_back_path", "or_path", "cr_path", "vehicle_photo_path", "rider_selfie_path", "nbi_clearance_path", "barangay_clearance_path"];
  const applications = await Promise.all((data || []).map(async (item) => {
    const document_urls: Record<string, string> = {};
    for (const column of documentColumns) {
      const path = item[column];
      if (!path) continue;
      const { data: signed } = await admin.storage.from("rider-documents").createSignedUrl(path, 600);
      if (signed?.signedUrl) document_urls[column] = signed.signedUrl;
    }
    return { ...item, document_urls };
  }));
  return NextResponse.json({ success: true, applications });
}

export async function PATCH(request: Request) {
  const authorization = await requireAdmin();
  if (!authorization.authorized) return authorization.response;

  const body = (await request.json()) as Record<string, unknown>;
  const applicationId = clean(body.application_id, 80);
  const action = clean(body.action, 20);
  const rejectionReason = clean(body.rejection_reason, 400);
  const documentsRequested = clean(body.documents_requested, 600);
  if (!applicationId || !["approve", "reject", "request_documents", "under_review"].includes(action)) {
    return NextResponse.json({ success: false, error: "Invalid application action." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: application, error: findError } = await admin
    .from("rider_applications")
    .select("*")
    .eq("id", applicationId)
    .single();
  if (findError || !application) return NextResponse.json({ success: false, error: "Application not found." }, { status: 404 });
  if (!["pending", "under_review"].includes(application.status)) return NextResponse.json({ success: false, error: "This application cannot be reviewed in its current status." }, { status: 409 });

  const reviewerId = authorization.userId;
  if (action === "request_documents") {
    if (documentsRequested.length < 3) return NextResponse.json({ success: false, error: "Specify the documents or corrections needed." }, { status: 400 });
    const { error } = await admin.from("rider_applications").update({ status: "needs_documents", documents_requested: documentsRequested, reviewed_by: reviewerId, reviewed_at: new Date().toISOString() }).eq("id", applicationId).in("status", ["pending", "under_review"]);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, status: "needs_documents" });
  }
  if (action === "under_review") {
    const { error } = await admin.from("rider_applications").update({ status: "under_review", reviewed_by: reviewerId, reviewed_at: new Date().toISOString() }).eq("id", applicationId).eq("status", "pending");
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, status: "under_review" });
  }
  if (action === "reject") {
    if (rejectionReason.length < 3) return NextResponse.json({ success: false, error: "Enter a short rejection reason." }, { status: 400 });
    const { error } = await admin.from("rider_applications").update({
      status: "rejected", rejection_reason: rejectionReason, reviewed_by: reviewerId, reviewed_at: new Date().toISOString(),
    }).eq("id", applicationId).eq("status", "pending");
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, status: "rejected" });
  }

  const password = temporaryPassword();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: application.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: application.full_name },
  });
  if (createError || !created.user) {
    const message = createError?.message?.toLowerCase().includes("already")
      ? "An account already uses this email address."
      : createError?.message || "Unable to create the rider account.";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }

  const riderId = created.user.id;
  try {
    const { error: profileError } = await admin.from("profiles").upsert({
      id: riderId, email: application.email, full_name: application.full_name, role: "rider", is_active: true,
    });
    if (profileError) throw profileError;

    const { error: riderError } = await admin.from("rider_profiles").upsert({
      id: riderId,
      full_name: application.full_name,
      phone: application.phone,
      vehicle_type: application.vehicle_type || "Motorcycle",
      plate_number: application.plate_number || null,
      is_active: true,
      is_online: false,
    });
    if (riderError) throw riderError;

    const { error: applicationError } = await admin.from("rider_applications").update({
      status: "approved", reviewed_by: reviewerId, reviewed_at: new Date().toISOString(), created_rider_id: riderId, nbi_verified_at: new Date().toISOString(), verification_notes: "Initial/reapplication documents verified. Active rider does not require recurring NBI renewal.",
    }).eq("id", applicationId).eq("status", "pending");
    if (applicationError) throw applicationError;

    return NextResponse.json({
      success: true,
      status: "approved",
      credentials: { email: application.email, temporary_password: password },
    });
  } catch (error) {
    await admin.auth.admin.deleteUser(riderId).catch(() => undefined);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unable to approve rider." }, { status: 500 });
  }
}
