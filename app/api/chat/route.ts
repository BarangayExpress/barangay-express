import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { checkRateLimit, getRequestIp } from "@/lib/rate-limit";
import { requireRole } from "@/lib/require-role";

export const dynamic = "force-dynamic";

const ACTIVE_CHAT_STATUSES = new Set([
  "Accepted",
  "Heading to Pickup",
  "Picked Up",
  "In Transit",
  "Delivered",
]);

type ChatRole = "customer" | "rider";

type ChatOrder = {
  id: number;
  booking_no: string | null;
  status: string | null;
  customer_user_id: string | null;
  assigned_rider: string | null;
  sender_name: string | null;
  sender_phone: string | null;
  receiver_name: string | null;
  receiver_phone: string | null;
};

type ChatAuthorization = {
  userId: string;
  role: ChatRole;
  order: ChatOrder;
};

function parseOrderId(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("order_id");
  const orderId = Number(raw);
  return Number.isSafeInteger(orderId) && orderId > 0 ? orderId : null;
}

async function authorizeChat(
  request: NextRequest
): Promise<
  | { authorized: true; value: ChatAuthorization }
  | { authorized: false; response: NextResponse }
> {
  const authorization = await requireRole(["customer", "rider"]);
  if (!authorization.authorized) {
    return { authorized: false, response: authorization.response };
  }

  const orderId = parseOrderId(request);
  if (!orderId) {
    return {
      authorized: false,
      response: NextResponse.json(
        { success: false, error: "Valid order_id is required." },
        { status: 400 }
      ),
    };
  }

  const supabase = createAdminClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, booking_no, status, customer_user_id, assigned_rider, sender_name, sender_phone, receiver_name, receiver_phone"
    )
    .eq("id", orderId)
    .maybeSingle<ChatOrder>();

  if (error) {
    throw new Error(error.message);
  }

  if (!order) {
    return {
      authorized: false,
      response: NextResponse.json(
        { success: false, error: "Booking not found." },
        { status: 404 }
      ),
    };
  }

  const role = authorization.role as ChatRole;
  const isParticipant =
    (role === "customer" && order.customer_user_id === authorization.userId) ||
    (role === "rider" && order.assigned_rider === authorization.userId);

  if (!isParticipant) {
    return {
      authorized: false,
      response: NextResponse.json(
        { success: false, error: "You do not have access to this booking chat." },
        { status: 403 }
      ),
    };
  }

  return {
    authorized: true,
    value: { userId: authorization.userId, role, order },
  };
}

async function getContactDetails(authorization: ChatAuthorization) {
  if (authorization.role === "rider") {
    return {
      pickup: {
        label: "Call Pickup",
        name: authorization.order.sender_name,
        phone: authorization.order.sender_phone,
      },
      dropoff: {
        label: "Call Drop-off",
        name: authorization.order.receiver_name,
        phone: authorization.order.receiver_phone,
      },
      rider: null,
    };
  }

  if (!authorization.order.assigned_rider) {
    return { pickup: null, dropoff: null, rider: null };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("rider_profiles")
    .select("full_name, phone")
    .eq("id", authorization.order.assigned_rider)
    .maybeSingle<{ full_name: string | null; phone: string | null }>();

  if (error) {
    console.error("Chat rider contact lookup failed:", error);
  }

  return {
    pickup: null,
    dropoff: null,
    rider: data
      ? { label: "Call Rider", name: data.full_name, phone: data.phone }
      : null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const authorized = await authorizeChat(request);
    if (!authorized.authorized) return authorized.response;

    const { userId, role, order } = authorized.value;
    const rateLimit = checkRateLimit(
      `chat:get:${role}:${userId}:${getRequestIp(request)}`,
      180,
      60_000
    );

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many chat refreshes. Please wait." },
        { status: 429 }
      );
    }

    const supabase = createAdminClient();
    const oppositeRole: ChatRole = role === "customer" ? "rider" : "customer";
    const { count, error: countError } = await supabase
      .from("booking_messages")
      .select("id", { count: "exact", head: true })
      .eq("order_id", order.id)
      .eq("sender_role", oppositeRole)
      .is("read_at", null);

    if (countError) throw new Error(countError.message);

    const summaryOnly = request.nextUrl.searchParams.get("summary") === "1";
    const contacts = await getContactDetails(authorized.value);
    const chatEnabled = ACTIVE_CHAT_STATUSES.has(order.status || "");
    const readOnly = ["Completed", "Cancelled"].includes(order.status || "");

    if (summaryOnly) {
      return NextResponse.json({
        success: true,
        booking_no: order.booking_no,
        status: order.status,
        chat_enabled: chatEnabled,
        read_only: readOnly,
        unread_count: count || 0,
        contacts,
      });
    }

    const { data: messages, error: messagesError } = await supabase
      .from("booking_messages")
      .select("id, sender_user_id, sender_role, message, read_at, created_at")
      .eq("order_id", order.id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(200);

    if (messagesError) throw new Error(messagesError.message);

    return NextResponse.json({
      success: true,
      booking_no: order.booking_no,
      status: order.status,
      chat_enabled: chatEnabled,
      read_only: readOnly,
      unread_count: count || 0,
      contacts,
      messages: messages || [],
    });
  } catch (error) {
    console.error("Chat GET error:", error);
    return NextResponse.json(
      { success: false, error: "Unable to load booking chat." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authorized = await authorizeChat(request);
    if (!authorized.authorized) return authorized.response;

    const { userId, role, order } = authorized.value;
    if (!ACTIVE_CHAT_STATUSES.has(order.status || "")) {
      return NextResponse.json(
        {
          success: false,
          error: "Chat is available only while the accepted delivery is active.",
        },
        { status: 409 }
      );
    }

    const rateLimit = checkRateLimit(
      `chat:send:${role}:${userId}:${getRequestIp(request)}`,
      30,
      60_000
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many messages. Please wait a moment." },
        { status: 429 }
      );
    }

    const body = (await request.json()) as { message?: unknown };
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!message || message.length > 1000) {
      return NextResponse.json(
        { success: false, error: "Message must contain 1 to 1000 characters." },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("booking_messages")
      .insert({
        order_id: order.id,
        sender_user_id: userId,
        sender_role: role,
        message,
      })
      .select("id, sender_user_id, sender_role, message, read_at, created_at")
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, message: data }, { status: 201 });
  } catch (error) {
    console.error("Chat POST error:", error);
    return NextResponse.json(
      { success: false, error: "Unable to send message." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authorized = await authorizeChat(request);
    if (!authorized.authorized) return authorized.response;

    const { role, order } = authorized.value;
    const oppositeRole: ChatRole = role === "customer" ? "rider" : "customer";
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("booking_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("order_id", order.id)
      .eq("sender_role", oppositeRole)
      .is("read_at", null);

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Chat PATCH error:", error);
    return NextResponse.json(
      { success: false, error: "Unable to mark messages as read." },
      { status: 500 }
    );
  }
}
