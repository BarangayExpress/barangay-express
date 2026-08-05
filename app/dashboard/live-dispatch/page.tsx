import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import LiveDispatchClient from "./LiveDispatchClient";

export default async function LiveDispatchPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const currentEmail = user.email?.trim().toLowerCase();

  if (!adminEmail) throw new Error("ADMIN_EMAIL is missing in .env.local.");
  if (!currentEmail || currentEmail !== adminEmail) redirect("/dashboard");

  return <LiveDispatchClient />;
}
