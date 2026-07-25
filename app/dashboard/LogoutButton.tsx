"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

export default function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();

    const { error } = await supabase.auth.signOut();

    if (error) {
      alert(error.message);
      return;
    }

    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="rounded-xl border border-white px-5 py-3 font-bold text-white transition hover:bg-white hover:text-green-800"
    >
      Logout
    </button>
  );
}