import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireRole } from "@/lib/require-role";
import { checkRateLimit, getRequestIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

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
};

function safeExtension(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

export async function POST(request: NextRequest) {
  try {
    const authorization = await requireRole(["customer", "rider"]);

    if (!authorization.authorized) {
      return authorization.response;
    }

    const role = authorization.role as ChatRole;
    const userId = authorization.userId;

    const rateLimit = checkRateLimit(
      `chat:image:${role}:${userId}:${getRequestIp(request)}`,
      10,
      60_000
    );

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Too many image uploads. Please wait a moment.",
        },
        { status: 429 }
      );
    }

    const formData = await request.formData();

    const file = formData.get("file");
    const rawOrderId = formData.get("order_id");
    const rawKind = formData.get("kind");

    const orderId = Number(rawOrderId);

    if (!Number.isSafeInteger(orderId) || orderId <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Valid order_id is required.",
        },
        { status: 400 }
      );
    }

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          error: "Image file is required.",
        },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        {
          success: false,
          error: "Only JPG, PNG, and WEBP images are allowed.",
        },
        { status: 400 }
      );
    }

    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: "Image must be 5 MB or smaller.",
        },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(
        "id, booking_no, status, customer_user_id, assigned_rider"
      )
      .eq("id", orderId)
      .maybeSingle<ChatOrder>();

    if (orderError) {
      throw new Error(orderError.message);
    }

    if (!order) {
      return NextResponse.json(
        {
          success: false,
          error: "Booking not found.",
        },
        { status: 404 }
      );
    }

    const isParticipant =
      (role === "customer" &&
        order.customer_user_id === userId) ||
      (role === "rider" &&
        order.assigned_rider === userId);

    if (!isParticipant) {
      return NextResponse.json(
        {
          success: false,
          error: "You do not have access to this booking chat.",
        },
        { status: 403 }
      );
    }

    if (!ACTIVE_CHAT_STATUSES.has(order.status || "")) {
      return NextResponse.json(
        {
          success: false,
          error: "Images can only be sent while the delivery is active.",
        },
        { status: 409 }
      );
    }

    const kind =
      rawKind === "merchant_qr"
        ? "merchant_qr"
        : rawKind === "payment_proof"
        ? "payment_proof"
        : "chat_image";

    if (kind === "merchant_qr" && role !== "rider") {
      return NextResponse.json(
        {
          success: false,
          error: "Only the assigned rider can send a merchant QR.",
        },
        { status: 403 }
      );
    }

    if (kind === "payment_proof" && role !== "customer") {
      return NextResponse.json(
        {
          success: false,
          error: "Only the customer can send payment proof.",
        },
        { status: 403 }
      );
    }

    const extension = safeExtension(file.type);

    const filename = `${kind}-${Date.now()}-${crypto.randomUUID()}.${extension}`;

    const storagePath = `orders/${order.id}/${filename}`;

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from("Booking Chat")
      .upload(storagePath, bytes, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const label =
      kind === "merchant_qr"
        ? "Merchant payment QR"
        : kind === "payment_proof"
        ? "Payment proof"
        : "Photo";

    const { data: message, error: messageError } = await supabase
      .from("booking_messages")
      .insert({
        order_id: order.id,
        sender_user_id: userId,
        sender_role: role,
        message: label,
        message_type: "image",
        attachment_path: storagePath,
        attachment_name: file.name || filename,
        attachment_mime_type: file.type,
      })
      .select(
        "id, sender_user_id, sender_role, message, message_type, attachment_path, attachment_name, attachment_mime_type, read_at, created_at"
      )
      .single();

    if (messageError) {
      await supabase.storage
       .from("Booking Chat")
        .remove([storagePath]);

      throw new Error(messageError.message);
    }

    if (kind === "merchant_qr") {
  const { error: merchantQrError } = await supabase
    .from("orders")
    .update({
      merchant_payment_status: "Waiting for Customer Payment",
      merchant_qr_sent_at: new Date().toISOString(),
    })
    .eq("id", order.id)
    .eq("item_payment_flow", "merchant_direct");

  if (merchantQrError) {
    console.error(
      "Unable to update merchant QR payment state:",
      merchantQrError
    );
  }
}

if (kind === "payment_proof") {
  const { error: paymentProofError } = await supabase
    .from("orders")
    .update({
      merchant_payment_status: "Proof Submitted",
      merchant_payment_proof_at: new Date().toISOString(),
    })
    .eq("id", order.id)
    .eq("item_payment_flow", "merchant_direct");

  if (paymentProofError) {
    console.error(
      "Unable to update merchant payment proof state:",
      paymentProofError
    );
  }
}

    return NextResponse.json(
      {
        success: true,
        message,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Chat image upload error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to upload image.",
      },
      { status: 500 }
    );
  }
}