import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireRole } from "@/lib/require-role";

export const dynamic = "force-dynamic";

type PatchBody = {
  notification_id?: number;
  mark_all?: boolean;
};

async function authorize() {
  return requireRole(["customer", "rider", "admin"]);
}

function scopedQuery<T>(
  query: T,
  role: "customer" | "rider" | "admin",
  userId: string
) {
  const builder = query as T & {
    eq: (column: string, value: string) => T;
    or: (filter: string) => T;
  };

  const byRole = builder.eq("recipient_type", role);
  if (role === "customer") {
    return (byRole as typeof builder).eq("recipient_user_id", userId);
  }

  return (byRole as typeof builder).or(
    `recipient_user_id.eq.${userId},recipient_user_id.is.null`
  );
}

export async function GET() {
  try {
    const authorization = await authorize();
    if (!authorization.authorized) return authorization.response;

    const admin = createAdminClient();
    let listQuery = admin
      .from("notifications")
      .select(
        "id, order_id, booking_no, notification_type, title, message, metadata, read_at, created_at"
      );
    listQuery = scopedQuery(
      listQuery,
      authorization.role,
      authorization.userId
    );

    const { data, error } = await listQuery
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);

    const notifications = data ?? [];
    return NextResponse.json(
      {
        success: true,
        notifications,
        unread_count: notifications.filter((item) => !item.read_at).length,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    console.error("Notifications GET error:", error);
    return NextResponse.json(
      { success: false, error: "Hindi ma-load ang notifications." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const authorization = await authorize();
    if (!authorization.authorized) return authorization.response;

    const body = (await request.json()) as PatchBody;
    const notificationId = Number(body.notification_id);
    if (!body.mark_all && (!Number.isInteger(notificationId) || notificationId <= 0)) {
      return NextResponse.json(
        { success: false, error: "Valid notification ID is required." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    let updateQuery = admin
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null);
    updateQuery = scopedQuery(
      updateQuery,
      authorization.role,
      authorization.userId
    );
    if (!body.mark_all) updateQuery = updateQuery.eq("id", notificationId);

    const { error } = await updateQuery;
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Notifications PATCH error:", error);
    return NextResponse.json(
      { success: false, error: "Hindi ma-update ang notification." },
      { status: 500 }
    );
  }
}
