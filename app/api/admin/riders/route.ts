import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/require-role";

export const dynamic = "force-dynamic";

function clean(value: unknown, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET() {
  const authorization = await requireAdmin();
  if (!authorization.authorized) return authorization.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("rider_profiles")
    .select("id, full_name, phone, vehicle_type, plate_number, is_active, is_online, last_online_at, last_offline_at, created_at")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  const ids = (data || []).map((rider) => rider.id);
  const [{ data: orders }, { data: profiles }] = await Promise.all([
    ids.length ? admin.from("orders").select("assigned_rider, status").in("assigned_rider", ids) : Promise.resolve({ data: [] }),
    ids.length ? admin.from("profiles").select("id, email").in("id", ids) : Promise.resolve({ data: [] }),
  ]);

  const enriched = (data || []).map((rider) => {
    const riderOrders = (orders || []).filter((order) => order.assigned_rider === rider.id);
    const account = (profiles || []).find((profile) => profile.id === rider.id);
    return {
      ...rider,
      email: account?.email || null,
      active_deliveries: riderOrders.filter((o) => ["Accepted", "Heading to Pickup", "Picked Up", "In Transit", "Delivered"].includes(o.status || "")).length,
      completed_deliveries: riderOrders.filter((o) => o.status === "Completed").length,
    };
  });

  return NextResponse.json({ success: true, riders: enriched });
}

export async function POST(request: Request) {
  const authorization = await requireAdmin();
  if (!authorization.authorized) return authorization.response;

  const body = (await request.json()) as Record<string, unknown>;
  const email = clean(body.email, 254).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  const fullName = clean(body.full_name);
  const phone = clean(body.phone, 30);
  const vehicleType = clean(body.vehicle_type, 60) || "Motorcycle";
  const plateNumber = clean(body.plate_number, 30);

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ success: false, error: "Enter a valid rider email address." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ success: false, error: "Temporary password must contain at least 8 characters." }, { status: 400 });
  }
  if (fullName.length < 2) {
    return NextResponse.json({ success: false, error: "Rider full name is required." }, { status: 400 });
  }
  if (phone && !/^09\d{9}$/.test(phone)) {
    return NextResponse.json({ success: false, error: "Phone number must use the 09XXXXXXXXX format." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createError || !created.user) {
    const message = createError?.message?.toLowerCase().includes("already")
      ? "That email address already has an account."
      : createError?.message || "Unable to create rider account.";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }

  const riderId = created.user.id;
  try {
    const { error: profileError } = await admin.from("profiles").upsert({
      id: riderId,
      email,
      full_name: fullName,
      role: "rider",
      is_active: true,
    });
    if (profileError) throw profileError;

    const { data: rider, error: riderError } = await admin.from("rider_profiles").upsert({
      id: riderId,
      full_name: fullName,
      phone: phone || null,
      vehicle_type: vehicleType,
      plate_number: plateNumber || null,
      is_active: true,
      is_online: false,
    }).select().single();
    if (riderError) throw riderError;

    return NextResponse.json({ success: true, rider: { ...rider, email } }, { status: 201 });
  } catch (error) {
    await admin.auth.admin.deleteUser(riderId).catch(() => undefined);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unable to save the rider profile.",
    }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const authorization = await requireAdmin();
  if (!authorization.authorized) return authorization.response;

  const body = (await request.json()) as {
    rider_id?: string;
    full_name?: string;
    phone?: string | null;
    vehicle_type?: string | null;
    plate_number?: string | null;
    is_active?: boolean;
  };
  if (!body.rider_id) return NextResponse.json({ success: false, error: "Rider ID is required." }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (body.full_name !== undefined) {
    const name = clean(body.full_name);
    if (name.length < 2) return NextResponse.json({ success: false, error: "Rider full name is required." }, { status: 400 });
    updates.full_name = name;
  }
  if (body.phone !== undefined) {
    const phone = clean(body.phone, 30);
    if (phone && !/^09\d{9}$/.test(phone)) return NextResponse.json({ success: false, error: "Phone number must use the 09XXXXXXXXX format." }, { status: 400 });
    updates.phone = phone || null;
  }
  if (body.vehicle_type !== undefined) updates.vehicle_type = clean(body.vehicle_type, 60) || null;
  if (body.plate_number !== undefined) updates.plate_number = clean(body.plate_number, 30) || null;
  if (body.is_active !== undefined) updates.is_active = body.is_active;
  if (body.is_active === false) updates.is_online = false;

  const admin = createAdminClient();
  const { data, error } = await admin.from("rider_profiles").update(updates).eq("id", body.rider_id).select().single();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  const profileUpdates: Record<string, unknown> = {};
  if (updates.full_name !== undefined) profileUpdates.full_name = updates.full_name;
  if (body.is_active !== undefined) profileUpdates.is_active = body.is_active;
  if (Object.keys(profileUpdates).length) {
    const { error: profileError } = await admin.from("profiles").update(profileUpdates).eq("id", body.rider_id);
    if (profileError) return NextResponse.json({ success: false, error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, rider: data });
}
