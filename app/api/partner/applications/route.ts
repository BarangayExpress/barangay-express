import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import {
  getPartnerMemberships,
  requireActiveAccount,
} from "@/lib/partner-auth";
import { createNotification } from "@/lib/notifications";
import { checkRateLimit, getRequestIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BUSINESS_TYPES = new Set([
  "restaurant",
  "coffee_shop",
  "bakery",
  "grocery",
  "convenience_store",
  "pharmacy",
  "flower_shop",
  "cake_shop",
  "pet_shop",
  "other",
]);

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanOptionalEmail(value: unknown) {
  return clean(value, 254).toLowerCase();
}

function isValidEmail(value: string) {
  return /^\S+@\S+\.\S+$/.test(value);
}

function isValidBusinessPhone(value: string) {
  return /^[0-9+()\-\s]{7,30}$/.test(value);
}

function parseOptionalCoordinate(
  value: unknown,
  minimum: number,
  maximum: number
): number | null | "invalid" {
  if (value === null || value === undefined || value === "") return null;

  const numberValue = typeof value === "number" ? value : Number(value);
  if (
    !Number.isFinite(numberValue) ||
    numberValue < minimum ||
    numberValue > maximum
  ) {
    return "invalid";
  }

  return numberValue;
}

function slugBase(value: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

  return normalized || "business";
}

function makeSlug(name: string) {
  return `${slugBase(name)}-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * GET /api/partner/applications
 *
 * Returns the signed-in customer's Partner businesses/applications.
 */
export async function GET() {
  const account = await requireActiveAccount();
  if (!account.authorized) return account.response;

  if (account.appRole !== "customer") {
    return NextResponse.json(
      {
        success: false,
        error: "Partner applications currently require a customer account.",
      },
      { status: 403 }
    );
  }

  try {
    const memberships = await getPartnerMemberships(account.userId, {
      includeInactiveMemberships: true,
    });

    return NextResponse.json({
      success: true,
      applications: memberships.map((membership) => ({
        business_id: membership.business_id,
        member_role: membership.member_role,
        membership_is_active: membership.membership_is_active,
        name: membership.business.name,
        slug: membership.business.slug,
        business_type: membership.business.business_type,
        address: membership.business.address,
        approval_status: membership.business.approval_status,
        store_status: membership.business.store_status,
        rejection_reason: membership.business.rejection_reason,
        suspension_reason: membership.business.suspension_reason,
        created_at: membership.business.created_at,
        updated_at: membership.business.updated_at,
      })),
    });
  } catch (error) {
    console.error("Partner applications GET error:", error);
    return NextResponse.json(
      { success: false, error: "Unable to load Partner applications." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/partner/applications
 *
 * Creates a pending Partner business. Migration 001 automatically creates the
 * owner's business_members row and seven default business_hours rows.
 */
export async function POST(request: Request) {
  const account = await requireActiveAccount();
  if (!account.authorized) return account.response;

  if (account.appRole !== "customer") {
    return NextResponse.json(
      {
        success: false,
        error: "Partner applications currently require a customer account.",
      },
      { status: 403 }
    );
  }

  const ip = getRequestIp(request);
  const rate = checkRateLimit(
    `partner-application:${account.userId}:${ip}`,
    5,
    60 * 60 * 1000
  );

  if (!rate.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: "Too many Partner application attempts. Please try again later.",
      },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body." },
      { status: 400 }
    );
  }

  const name = clean(body.name, 150);
  const businessTypeRaw = clean(body.business_type, 40).toLowerCase();
  const businessType = BUSINESS_TYPES.has(businessTypeRaw)
    ? businessTypeRaw
    : "other";
  const description = clean(body.description, 1000);
  const phone = clean(body.phone, 30);
  const email = cleanOptionalEmail(body.email) || account.email || "";
  const address = clean(body.address, 500);
  const latitude = parseOptionalCoordinate(body.latitude, -90, 90);
  const longitude = parseOptionalCoordinate(body.longitude, -180, 180);

  if (name.length < 2) {
    return NextResponse.json(
      { success: false, error: "Business name is required." },
      { status: 400 }
    );
  }

  if (address.length < 8) {
    return NextResponse.json(
      { success: false, error: "Please enter the complete business address." },
      { status: 400 }
    );
  }

  if (!isValidBusinessPhone(phone)) {
    return NextResponse.json(
      { success: false, error: "Please enter a valid business phone number." },
      { status: 400 }
    );
  }

  if (email && !isValidEmail(email)) {
    return NextResponse.json(
      { success: false, error: "Please enter a valid business email address." },
      { status: 400 }
    );
  }

  if (latitude === "invalid" || longitude === "invalid") {
    return NextResponse.json(
      { success: false, error: "Invalid business map coordinates." },
      { status: 400 }
    );
  }

  if ((latitude === null) !== (longitude === null)) {
    return NextResponse.json(
      {
        success: false,
        error: "Latitude and longitude must be supplied together.",
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Prevent accidental repeated submission of the same business by the same
  // account while still allowing one owner to manage multiple businesses.
  const { data: existingMemberships, error: existingError } = await admin
    .from("business_members")
    .select(
      `
        business_id,
        business:businesses!business_members_business_id_fkey (
          id,
          name,
          address,
          approval_status
        )
      `
    )
    .eq("user_id", account.userId)
    .eq("member_role", "owner");

  if (existingError) {
    console.error("Partner duplicate check error:", existingError);
    return NextResponse.json(
      { success: false, error: "Unable to validate Partner application." },
      { status: 500 }
    );
  }

  const duplicate = (existingMemberships ?? []).some((row) => {
    const business = Array.isArray(row.business)
      ? row.business[0]
      : row.business;

    return (
      business &&
      business.name.trim().toLowerCase() === name.toLowerCase() &&
      business.address.trim().toLowerCase() === address.toLowerCase()
    );
  });

  if (duplicate) {
    return NextResponse.json(
      {
        success: false,
        error: "You already have an application for this business and address.",
      },
      { status: 409 }
    );
  }

  const { data: business, error: insertError } = await admin
    .from("businesses")
    .insert({
      name,
      slug: makeSlug(name),
      business_type: businessType,
      description: description || null,
      phone,
      email: email || null,
      address,
      latitude,
      longitude,
      approval_status: "pending",
      store_status: "closed",
      is_visible: false,
      created_by: account.userId,
    })
    .select(
      "id, name, slug, business_type, approval_status, store_status, is_visible, created_at"
    )
    .single();

  if (insertError || !business) {
    console.error("Partner business insert error:", insertError);
    return NextResponse.json(
      {
        success: false,
        error: insertError?.message || "Unable to submit Partner application.",
      },
      { status: 500 }
    );
  }

  // Admin notifications are best-effort: a notification problem should not
  // roll back an otherwise valid Partner application.
  try {
    await createNotification({
      recipientType: "admin",
      notificationType: "partner_application_submitted",
      title: "New Partner application",
      message: `${name} submitted a Barangay Express Partner application.`,
      metadata: {
        business_id: business.id,
        business_name: business.name,
        applicant_user_id: account.userId,
      },
    });
  } catch (notificationError) {
    console.error("Partner application admin notification error:", notificationError);
  }

  return NextResponse.json(
    {
      success: true,
      application: {
        business_id: business.id,
        name: business.name,
        slug: business.slug,
        business_type: business.business_type,
        approval_status: business.approval_status,
        store_status: business.store_status,
        is_visible: business.is_visible,
        created_at: business.created_at,
      },
    },
    { status: 201 }
  );
}
