import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireRider } from "@/lib/require-role";

export const dynamic = "force-dynamic";

const ORDER_FIELDS = "id, booking_no, sender_name, sender_phone, pickup_address, receiver_name, receiver_phone, dropoff_address, package_type, notes, payment_method, payment_status, item_payment_flow, estimated_item_amount, actual_item_amount, purchase_payment_status, rider_advance_amount, order_amount, total_amount, status, price, created_at, assigned_rider, accepted_at, heading_to_pickup_at, picked_up_at, in_transit_at, delivered_at, completed_at, pickup_latitude, pickup_longitude, dropoff_latitude, dropoff_longitude, proof_photo_url, received_by, receiver_signature_url, proof_submitted_at, cancellation_reason, cancelled_by, cancelled_at";

export async function GET() {
  try {
    const authorization = await requireRider();
    if (!authorization.authorized) return authorization.response;

    const admin = createAdminClient();
    const { data: profile, error: profileError } = await admin
      .from("rider_profiles")
      .select("is_active, is_online")
      .eq("id", authorization.userId)
      .maybeSingle<{ is_active: boolean; is_online: boolean }>();
    if (profileError) throw new Error(profileError.message);

    const { data: assignedOrders, error: assignedError } = await admin
      .from("orders")
      .select(ORDER_FIELDS)
      .eq("assigned_rider", authorization.userId)
      .order("created_at", { ascending: false });
    if (assignedError) throw new Error(assignedError.message);

    let offer: Record<string, unknown> | null = null;
    let offeredOrder: Record<string, unknown> | null = null;

    if (profile?.is_active && profile.is_online) {
      const { data: pendingOrders, error: pendingError } = await admin
        .from("orders")
        .select("id")
        .eq("status", "Pending")
        .is("assigned_rider", null)
        .order("created_at", { ascending: true })
        .limit(25);
      if (pendingError) throw new Error(pendingError.message);

      for (const pending of pendingOrders || []) {
        const { data, error } = await admin.rpc("advance_smart_dispatch", {
          p_order_id: pending.id,
          p_offer_seconds: 20,
        });
        if (error) throw new Error(error.message);
        const current = Array.isArray(data) ? data[0] : data;
        if (current?.state === "offered" && current.current_rider_id === authorization.userId) {
          offer = current;
          const { data: order, error: orderError } = await admin
            .from("orders")
            .select(ORDER_FIELDS)
            .eq("id", pending.id)
            .maybeSingle();
          if (orderError) throw new Error(orderError.message);
          offeredOrder = order;
          break;
        }
      }
    }

    return NextResponse.json({
      success: true,
      orders: offeredOrder ? [offeredOrder, ...(assignedOrders || [])] : assignedOrders || [],
      offer,
    });
  } catch (error) {
    console.error("Rider dispatch API error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unable to load dispatch." },
      { status: 500 }
    );
  }
}
