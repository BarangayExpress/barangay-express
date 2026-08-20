import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import type { AppRole } from "@/lib/require-role";

export type BusinessMemberRole = "owner" | "manager" | "staff";
export type BusinessApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "suspended"
  | "inactive";
export type BusinessStoreStatus = "open" | "busy" | "closed";

export type PartnerMembership = {
  membership_id: string;
  business_id: string;
  member_role: BusinessMemberRole;
  membership_is_active: boolean;
  business: {
    id: string;
    name: string;
    slug: string;
    business_type: string;
    description: string | null;
    phone: string | null;
    email: string | null;
    address: string;
    latitude: number | null;
    longitude: number | null;
    logo_url: string | null;
    cover_url: string | null;
    approval_status: BusinessApprovalStatus;
    store_status: BusinessStoreStatus;
    is_visible: boolean;
    rejection_reason: string | null;
    suspension_reason: string | null;
    approved_at: string | null;
    approved_by: string | null;
    created_by: string;
    created_at: string;
    updated_at: string;
  };
};

type BasePartnerAuthorization = {
  authorized: true;
  userId: string;
  email: string | null;
  appRole: AppRole;
  fullName: string | null;
};

type PartnerMemberAuthorization = BasePartnerAuthorization & {
  membership: PartnerMembership;
};

type UnauthorizedResult = {
  authorized: false;
  response: NextResponse;
};

function unauthorized(message: string, status: number): UnauthorizedResult {
  return {
    authorized: false,
    response: NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status }
    ),
  };
}

/**
 * Authenticates the currently signed-in Barangay Express account.
 *
 * Partner access is intentionally NOT represented by profiles.role. A user keeps
 * their normal app role (customer/rider/admin) and receives business access via
 * public.business_members.
 */
export async function requireActiveAccount(): Promise<
  BasePartnerAuthorization | UnauthorizedResult
> {
  const serverSupabase = await createServerClient();
  const {
    data: { user },
    error: userError,
  } = await serverSupabase.auth.getUser();

  if (userError || !user) {
    return unauthorized("Unauthorized. Please log in.", 401);
  }

  // business_members is deliberately locked to service_role, so authenticated
  // Partner APIs validate the session first and then read protected data with
  // the server-only admin client.
  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role, is_active, full_name")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return unauthorized("User profile not found.", 403);
  }

  if (!profile.is_active) {
    return unauthorized("This account is inactive.", 403);
  }

  return {
    authorized: true,
    userId: user.id,
    email: user.email ?? null,
    appRole: profile.role as AppRole,
    fullName: profile.full_name ?? null,
  };
}

export async function getPartnerMemberships(
  userId: string,
  options?: { includeInactiveMemberships?: boolean }
): Promise<PartnerMembership[]> {
  const admin = createAdminClient();

  let query = admin
    .from("business_members")
    .select(
      `
        id,
        business_id,
        member_role,
        is_active,
        business:businesses!business_members_business_id_fkey (
          id,
          name,
          slug,
          business_type,
          description,
          phone,
          email,
          address,
          latitude,
          longitude,
          logo_url,
          cover_url,
          approval_status,
          store_status,
          is_visible,
          rejection_reason,
          suspension_reason,
          approved_at,
          approved_by,
          created_by,
          created_at,
          updated_at
        )
      `
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (!options?.includeInactiveMemberships) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Unable to load business memberships: ${error.message}`);
  }

  return (data ?? [])
    .filter((row) => row.business)
    .map((row) => {
      // Supabase relationship typings can represent to-one joins as either an
      // object or a one-element array depending on generated types. Normalize it.
      const joinedBusiness = Array.isArray(row.business)
        ? row.business[0]
        : row.business;

      return {
        membership_id: row.id,
        business_id: row.business_id,
        member_role: row.member_role as BusinessMemberRole,
        membership_is_active: row.is_active,
        business: joinedBusiness as PartnerMembership["business"],
      };
    });
}

export async function requireBusinessMember(
  businessId: string,
  allowedMemberRoles: BusinessMemberRole[] = ["owner", "manager", "staff"]
): Promise<PartnerMemberAuthorization | UnauthorizedResult> {
  const account = await requireActiveAccount();
  if (!account.authorized) return account;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("business_members")
    .select(
      `
        id,
        business_id,
        member_role,
        is_active,
        business:businesses!business_members_business_id_fkey (
          id,
          name,
          slug,
          business_type,
          description,
          phone,
          email,
          address,
          latitude,
          longitude,
          logo_url,
          cover_url,
          approval_status,
          store_status,
          is_visible,
          rejection_reason,
          suspension_reason,
          approved_at,
          approved_by,
          created_by,
          created_at,
          updated_at
        )
      `
    )
    .eq("business_id", businessId)
    .eq("user_id", account.userId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("requireBusinessMember query error:", error);
    return unauthorized("Unable to verify business access.", 500);
  }

  if (!data || !data.business) {
    return unauthorized(
      "Forbidden. You are not an active member of this business.",
      403
    );
  }

  const memberRole = data.member_role as BusinessMemberRole;
  if (!allowedMemberRoles.includes(memberRole)) {
    return unauthorized(
      "Forbidden. Your business role does not have permission for this action.",
      403
    );
  }

  const joinedBusiness = Array.isArray(data.business)
    ? data.business[0]
    : data.business;

  return {
    ...account,
    membership: {
      membership_id: data.id,
      business_id: data.business_id,
      member_role: memberRole,
      membership_is_active: data.is_active,
      business: joinedBusiness as PartnerMembership["business"],
    },
  };
}

export function requireBusinessOwner(businessId: string) {
  return requireBusinessMember(businessId, ["owner"]);
}

export function requireBusinessManager(businessId: string) {
  return requireBusinessMember(businessId, ["owner", "manager"]);
}
