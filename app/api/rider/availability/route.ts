import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireRider } from "@/lib/require-role";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const authorization = await requireRider();
  if (!authorization.authorized) return authorization.response;

  try {
    const body = (await request.json()) as { is_online?: boolean };
    if (typeof body.is_online !== "boolean") {
      return NextResponse.json({ success: false, error: "is_online must be boolean." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("set_rider_availability", {
      p_rider_id: authorization.userId,
      p_is_online: body.is_online,
    });
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, rider: data });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unable to update availability." },
      { status: 409 }
    );
  }
}
