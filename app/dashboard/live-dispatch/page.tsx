import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import LiveDispatchClient from "./LiveDispatchClient";

export default async function LiveDispatchPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
  .from("profiles")
  .select("role, is_active")
  .eq("id", user.id)
  .maybeSingle();

if (!profile?.is_active || profile.role !== "admin") {
  redirect("/");
}

  return <LiveDispatchClient />;
}
