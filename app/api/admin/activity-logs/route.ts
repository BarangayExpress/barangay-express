import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type ActivityLogRow = {
  id: number;
  booking_no: string | null;
  order_id: number | null;
  actor: string;
  actor_type: string;
  action: string;
  details: string | null;
  created_at: string;
};

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function requireAdmin() {
  const serverSupabase = await createServerClient();

  const {
    data: { user },
    error: userError,
  } = await serverSupabase.auth.getUser();

  if (userError || !user) {
    return {
      success: false as const,
      response: NextResponse.json(
        {
          success: false,
          error: "Unauthorized. Please log in.",
        },
        { status: 401 },
      ),
    };
  }

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const currentEmail = user.email?.trim().toLowerCase();

  if (!adminEmail || !currentEmail || currentEmail !== adminEmail) {
    return {
      success: false as const,
      response: NextResponse.json(
        {
          success: false,
          error: "Forbidden. Admin access only.",
        },
        { status: 403 },
      ),
    };
  }

  return {
    success: true as const,
    user,
  };
}

export async function GET() {
  try {
    const auth = await requireAdmin();

    if (!auth.success) {
      return auth.response;
    }

    const supabaseAdmin = createAdminClient();

    const { data, error } = await supabaseAdmin
      .from("activity_logs")
      .select(
        "id, booking_no, order_id, actor, actor_type, action, details, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(30)
      .returns<ActivityLogRow[]>();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      success: true,
      logs: data ?? [],
    });
  } catch (error) {
    console.error("Unable to load admin activity logs:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load activity logs.",
      },
      { status: 500 },
    );
  }
}