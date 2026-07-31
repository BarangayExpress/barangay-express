import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase-server";

export type AppRole = "admin" | "rider" | "customer";

type AuthorizedResult = {
  authorized: true;
  userId: string;
  email: string | null;
  role: AppRole;
};

type UnauthorizedResult = {
  authorized: false;
  response: NextResponse;
};

export async function requireRole(
  allowedRoles: AppRole[]
): Promise<AuthorizedResult | UnauthorizedResult> {
  const serverSupabase = await createServerClient();

  const {
    data: { user },
    error: userError,
  } = await serverSupabase.auth.getUser();

  if (userError || !user) {
    return {
      authorized: false,
      response: NextResponse.json(
        {
          success: false,
          error: "Unauthorized. Please log in.",
        },
        { status: 401 }
      ),
    };
  }

  const { data: profile, error: profileError } = await serverSupabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return {
      authorized: false,
      response: NextResponse.json(
        {
          success: false,
          error: "User profile not found.",
        },
        { status: 403 }
      ),
    };
  }

  if (!profile.is_active) {
    return {
      authorized: false,
      response: NextResponse.json(
        {
          success: false,
          error: "This account is inactive.",
        },
        { status: 403 }
      ),
    };
  }

  const role = profile.role as AppRole;

  if (!allowedRoles.includes(role)) {
    return {
      authorized: false,
      response: NextResponse.json(
        {
          success: false,
          error: "Forbidden. You do not have permission to access this resource.",
        },
        { status: 403 }
      ),
    };
  }

  return {
    authorized: true,
    userId: user.id,
    email: user.email ?? null,
    role,
  };
}

export async function requireAdmin() {
  return requireRole(["admin"]);
}

export async function requireRider() {
  return requireRole(["rider"]);
}

export async function requireCustomer() {
  return requireRole(["customer"]);
}

export async function requireAdminOrRider() {
  return requireRole(["admin", "rider"]);
}
