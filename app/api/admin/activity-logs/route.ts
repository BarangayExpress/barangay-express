import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/require-role";

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

export async function GET() {
  try {
    const authorization = await requireAdmin();

if (!authorization.authorized) {
  return authorization.response;
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