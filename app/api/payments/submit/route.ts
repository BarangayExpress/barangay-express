import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireCustomer } from "@/lib/require-role";

export const dynamic = "force-dynamic";

const PAYMENT_PROOFS_BUCKET = "payment-proofs";
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const ALLOWED_FILE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

type PaymentOrderRow = {
  id: number;
  booking_no: string;
  sender_phone: string | null;
  payment_method: string | null;
  payment_status: string | null;
  payment_proof_path: string | null;
  status: string | null;
  customer_user_id: string | null;
};

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function sanitizeReference(value: string) {
  return value.replace(/\s+/g, "").trim();
}

function getFileExtension(file: File) {
  switch (file.type) {
    case "image/jpeg":
      return "jpg";

    case "image/png":
      return "png";

    case "image/webp":
      return "webp";

    default:
      return "";
  }
}

export async function POST(request: Request) {
  let uploadedProofPath: string | null = null;

  try {
    const authorization = await requireCustomer();

    if (!authorization.authorized) {
      return authorization.response;
    }

    const formData = await request.formData();

    const bookingNo = String(formData.get("booking_no") || "")
      .trim()
      .toUpperCase();

    const senderPhone = normalizePhone(
      String(formData.get("sender_phone") || "")
    );

    const paymentReference = sanitizeReference(
      String(formData.get("payment_reference") || "")
    );

    const proofFile = formData.get("proof");

    if (!bookingNo) {
      return NextResponse.json(
        {
          success: false,
          error: "Booking number is required.",
        },
        { status: 400 }
      );
    }

    if (!/^09\d{9}$/.test(senderPhone)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Enter the sender phone number in 09XXXXXXXXX format.",
        },
        { status: 400 }
      );
    }

    if (!/^[A-Za-z0-9-]{6,30}$/.test(paymentReference)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Payment reference must contain 6 to 30 letters, numbers, or hyphens.",
        },
        { status: 400 }
      );
    }

    if (!(proofFile instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          error: "Payment proof image is required.",
        },
        { status: 400 }
      );
    }

    if (!ALLOWED_FILE_TYPES.has(proofFile.type)) {
      return NextResponse.json(
        {
          success: false,
          error: "Only JPG, PNG, or WebP images are allowed.",
        },
        { status: 415 }
      );
    }

    if (
      proofFile.size <= 0 ||
      proofFile.size > MAX_FILE_SIZE_BYTES
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Payment proof must be 5 MB or smaller.",
        },
        { status: 413 }
      );
    }

    const extension = getFileExtension(proofFile);

    if (!extension) {
      return NextResponse.json(
        {
          success: false,
          error: "Unsupported payment-proof image format.",
        },
        { status: 415 }
      );
    }

    const supabaseAdmin = createAdminClient();

    const { data: order, error: orderError } =
      await supabaseAdmin
        .from("orders")
        .select(
          "id, booking_no, sender_phone, payment_method, payment_status, payment_proof_path, status, customer_user_id"
        )
        .eq("booking_no", bookingNo)
        .maybeSingle<PaymentOrderRow>();

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

    if (order.customer_user_id !== authorization.userId) {
      return NextResponse.json(
        {
          success: false,
          error: "This booking does not belong to your customer account.",
        },
        { status: 403 }
      );
    }

    if (
      normalizePhone(order.sender_phone || "") !== senderPhone
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "The sender phone number does not match this booking.",
        },
        { status: 403 }
      );
    }

    if (order.payment_method !== "GCash") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Only bookings using GCash can submit payment proof.",
        },
        { status: 409 }
      );
    }

    if (order.status === "Cancelled") {
      return NextResponse.json(
        {
          success: false,
          error:
            "A cancelled booking cannot accept payment proof.",
        },
        { status: 409 }
      );
    }

    if (order.payment_status === "Paid") {
      return NextResponse.json(
        {
          success: false,
          error: "This booking is already marked as paid.",
        },
        { status: 409 }
      );
    }

    if (order.payment_status === "Refunded") {
      return NextResponse.json(
        {
          success: false,
          error:
            "A refunded payment cannot be submitted again.",
        },
        { status: 409 }
      );
    }

    if (order.payment_status === "For Verification") {
      return NextResponse.json(
        {
          success: false,
          error:
            "A payment proof is already waiting for verification.",
        },
        { status: 409 }
      );
    }

    const safeBookingNo = bookingNo.replace(
      /[^A-Z0-9-_]/g,
      "-"
    );

    const uniqueSuffix = crypto.randomUUID();

    uploadedProofPath =
      `receipts/${safeBookingNo}/` +
      `${Date.now()}-${uniqueSuffix}.${extension}`;

    const fileBuffer = await proofFile.arrayBuffer();

    const { error: uploadError } =
      await supabaseAdmin.storage
        .from(PAYMENT_PROOFS_BUCKET)
        .upload(uploadedProofPath, fileBuffer, {
          contentType: proofFile.type,
          cacheControl: "3600",
          upsert: false,
        });

    if (uploadError) {
      throw new Error(
        `Payment proof upload failed: ${uploadError.message}`
      );
    }

    const now = new Date().toISOString();

    const { data: updatedOrder, error: updateError } =
      await supabaseAdmin
        .from("orders")
        .update({
          payment_reference: paymentReference,
          payment_proof_path: uploadedProofPath,
          payment_proof_url: null,
          payment_status: "For Verification",
          payment_submitted_at: now,
          payment_rejection_reason: null,
          payment_verified_at: null,
          payment_verified_by: null,
        })
        .eq("id", order.id)
        .select(
          "booking_no, payment_method, payment_status, payment_reference, payment_submitted_at"
        )
        .single();

    if (updateError) {
      await supabaseAdmin.storage
        .from(PAYMENT_PROOFS_BUCKET)
        .remove([uploadedProofPath]);

      uploadedProofPath = null;

      throw new Error(updateError.message);
    }

    if (
      order.payment_proof_path &&
      order.payment_proof_path !== uploadedProofPath
    ) {
      const { error: removeOldProofError } =
        await supabaseAdmin.storage
          .from(PAYMENT_PROOFS_BUCKET)
          .remove([order.payment_proof_path]);

      if (removeOldProofError) {
        console.warn(
          "Previous payment proof could not be removed:",
          removeOldProofError.message
        );
      }
    }

    return NextResponse.json({
      success: true,
      message:
        "Payment proof submitted and is now waiting for admin verification.",
      payment: updatedOrder,
    });
  } catch (error) {
    console.error("Payment proof submission error:", error);

    if (uploadedProofPath) {
      try {
        const supabaseAdmin = createAdminClient();

        await supabaseAdmin.storage
          .from(PAYMENT_PROOFS_BUCKET)
          .remove([uploadedProofPath]);
      } catch (cleanupError) {
        console.warn(
          "Unable to clean up uploaded payment proof:",
          cleanupError
        );
      }
    }

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to submit payment proof.",
      },
      { status: 500 }
    );
  }
}
