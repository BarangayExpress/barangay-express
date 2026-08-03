import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import RidersClient from "./RidersClient";

export default async function RidersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!user.email || user.email.toLowerCase() !== adminEmail) redirect("/dashboard");
  return <RidersClient />;
}
