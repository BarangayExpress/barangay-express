"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";

export default function CustomerLogoutButton() {
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    await createClient().auth.signOut();
    window.location.replace("/customer/login");
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={loading}
      className="rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-extrabold text-blue-700 transition hover:bg-blue-50 disabled:opacity-60"
    >
      {loading ? "Logging out..." : "Log out"}
    </button>
  );
}
