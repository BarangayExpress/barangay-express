import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import RiderApplicationsClient from "./RiderApplicationsClient";

export default async function RiderApplicationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!user.email || user.email.toLowerCase() !== adminEmail) redirect("/dashboard");
  return <RiderApplicationsClient />;
}
