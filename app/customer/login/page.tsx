"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

type CustomerProfile = {
  role: string | null;
  is_active: boolean | null;
};

export default function CustomerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setLoading(true);

    const supabase = createClient();

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error || !data.user) {
        throw new Error("Mali ang email o password.");
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, is_active")
        .eq("id", data.user.id)
        .maybeSingle<CustomerProfile>();

      if (profileError || !profile) {
        await supabase.auth.signOut();
        throw new Error("Hindi makita ang customer profile ng account.");
      }

      if (profile.role !== "customer") {
        await supabase.auth.signOut();
        throw new Error("Customer account ang kailangan para sa portal na ito.");
      }

      if (!profile.is_active) {
        await supabase.auth.signOut();
        throw new Error(
          "Inactive ang account na ito. Makipag-ugnayan sa Barangay Express."
        );
      }

      router.replace("/customer/dashboard");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Hindi makapag-login."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-blue-950 via-blue-800 to-sky-600 px-4 py-10">
      <section className="w-full max-w-md rounded-[2rem] bg-white p-7 shadow-2xl md:p-10">
        <Link href="/" className="text-sm font-extrabold text-blue-700">
          ← Bumalik sa homepage
        </Link>

        <div className="mt-8 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-blue-700 to-sky-500 text-3xl shadow-lg shadow-blue-200">
            🏍️
          </div>
          <h1 className="mt-5 text-3xl font-black text-blue-950">
            Customer Login
          </h1>
          <p className="mt-2 leading-7 text-slate-600">
            Tingnan ang iyong orders at saved addresses.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <label className="block">
            <span className="mb-2 block text-sm font-extrabold text-slate-700">
              Email address
            </span>
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={loading}
              className="w-full rounded-2xl border border-slate-200 px-4 py-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-extrabold text-slate-700">
              Password
            </span>
            <div className="relative">
              <input
                required
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={loading}
                className="w-full rounded-2xl border border-slate-200 px-4 py-4 pr-20 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-sm font-bold text-blue-700"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          {errorMessage && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold leading-6 text-red-700">
              ⚠️ {errorMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-gradient-to-r from-blue-700 to-sky-500 px-5 py-4 text-lg font-black text-white shadow-lg shadow-blue-200 disabled:opacity-60"
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <p className="mt-7 text-center text-sm text-slate-600">
          Wala pang account?{" "}
          <Link href="/customer/signup" className="font-black text-blue-700">
            Gumawa ng account
          </Link>
        </p>
      </section>
    </main>
  );
}
