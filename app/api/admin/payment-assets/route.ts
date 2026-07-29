import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/require-role";

export const dynamic = "force-dynamic";

const BUCKET_NAME = "payment-assets";
const MAX_FILE_SIZE = 5 * 1024 * 1024;

const allowedFileTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

function getFileExtension(file: File) {
  switch (file.type) {
    case "image/png":
      return "png";

    case "image/jpeg":
      return "jpg";

    case "image/webp":
      return "webp";

    default:
      return null;
  }
}

export async function POST(request: Request) {
  try {
    const authorization = await requireAdmin();

    if (!authorization.authorized) {
      return authorization.response;
    }

    const formData = await request.formData();
    const uploadedFile = formData.get("file");

    if (!(uploadedFile instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          error: "QR image file is required.",
        },
        { status: 400 }
      );
    }

    if (!allowedFileTypes.has(uploadedFile.type)) {
      return NextResponse.json(
        {
          success: false,
          error: "Only PNG, JPG, JPEG, and WebP images are allowed.",
        },
        { status: 400 }
      );
    }

    if (uploadedFile.size <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "The selected image is empty.",
        },
        { status: 400 }
      );
    }

    if (uploadedFile.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: "The QR image must not exceed 5 MB.",
        },
        { status: 400 }
      );
    }

    const extension = getFileExtension(uploadedFile);

    if (!extension) {
      return NextResponse.json(
        {
          success: false,
          error: "Unsupported image format.",
        },
        { status: 400 }
      );
    }

    const filePath = `qr/gcash-${Date.now()}.${extension}`;
    const fileBuffer = await uploadedFile.arrayBuffer();

    const supabaseAdmin = createAdminClient();

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .upload(filePath, fileBuffer, {
        contentType: uploadedFile.type,
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    if (!publicUrlData.publicUrl) {
      throw new Error("Unable to generate the QR image URL.");
    }

    return NextResponse.json({
      success: true,
      file_path: filePath,
      public_url: publicUrlData.publicUrl,
    });
  } catch (error) {
    console.error("Payment asset upload error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to upload payment asset.",
      },
      { status: 500 }
    );
  }
}