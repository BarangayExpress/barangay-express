import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const currentEmail = user.email?.trim().toLowerCase();

  if (!adminEmail) {
    throw new Error("ADMIN_EMAIL is missing in .env.local.");
  }

  if (!currentEmail || currentEmail !== adminEmail) {
    const { data: riderProfile } = await supabase
      .from("rider_profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (riderProfile) redirect("/rider/dashboard");
    redirect("/");
  }

  return <DashboardClient />;
}