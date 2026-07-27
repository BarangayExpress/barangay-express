"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

const supabase = createClient();
type RiderProfile = {
  id: string;
  full_name: string;
  is_active: boolean | null;
};


const LOGIN_TIMEOUT_MS = 15000;

export default function RiderLoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");


  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
 console.log("Rider login handler started");
    setErrorMessage("");

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      setErrorMessage("Ilagay ang rider email at password.");
      return;
    }

    setLoading(true);

    try {
      const signInResult = await Promise.race([
        supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        }),

        new Promise<never>((_, reject) => {
          window.setTimeout(() => {
            reject(
              new Error(
                "Masyadong matagal ang login request. Tingnan ang internet connection at subukan muli."
              )
            );
          }, LOGIN_TIMEOUT_MS);
        }),
      ]);

      const { data, error } = signInResult;

      if (error || !data.user) {
        throw new Error(
          error?.message || "Hindi makapag-login gamit ang account na ito."
        );
      }

      const { data: riderProfile, error: profileError } =
        await supabase
          .from("rider_profiles")
          .select("id, full_name, is_active")
          .eq("id", data.user.id)
          .maybeSingle<RiderProfile>();

      if (profileError) {
        await supabase.auth.signOut();

        throw new Error(
          "Hindi mabasa ang rider profile. Pakitingnan ang rider_profiles table at RLS policy."
        );
      }

      if (!riderProfile) {
        await supabase.auth.signOut();

        throw new Error(
          "Walang rider profile ang account na ito. Gumamit ng registered rider account."
        );
      }

      if (!riderProfile.is_active) {
        await supabase.auth.signOut();

        throw new Error(
          "Inactive ang rider account na ito. Makipag-ugnayan sa administrator."
        );
      }

      router.replace("/rider/dashboard");
      router.refresh();

      // Fallback para sa mobile browser kung hindi tumuloy ang router.
      window.setTimeout(() => {
        window.location.replace("/rider/dashboard");
      }, 500);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "May hindi inaasahang error. Subukan muli."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 px-5 py-10 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.35),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(37,99,235,0.28),transparent_38%)]" />

      <div className="relative mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 shadow-2xl backdrop-blur-xl lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden flex-col justify-between bg-gradient-to-br from-blue-700 via-blue-800 to-slate-950 p-12 lg:flex">
          <div>
            <div className="inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-bold">
              <span className="text-xl">🏍️</span>
              Barangay Express Rider
            </div>

            <h1 className="mt-10 max-w-xl text-5xl font-black leading-tight">
              Deliver fast.
              <br />
              Serve local.
              <br />
              Earn daily.
            </h1>

            <p className="mt-6 max-w-lg text-lg leading-8 text-blue-100">
              Tanggapin ang bagong orders, sundan ang delivery workflow, buksan
              ang pickup at drop-off sa Maps, at tingnan ang iyong earnings.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {[
              ["📦", "Orders"],
              ["📍", "Maps"],
              ["💰", "Earnings"],
            ].map(([icon, label]) => (
              <div
                key={label}
                className="rounded-2xl border border-white/10 bg-white/10 p-4 text-center"
              >
                <div className="text-2xl">{icon}</div>

                <div className="mt-2 text-sm font-extrabold">
                  {label}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-center p-6 sm:p-10 lg:p-14">
          <div className="w-full max-w-md">
            <div className="lg:hidden">
              <div className="inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-bold">
                <span className="text-xl">🏍️</span>
                Barangay Express Rider
              </div>
            </div>

            <div className="mt-8 flex items-center justify-between gap-3 lg:mt-0">
              <p className="text-sm font-extrabold uppercase tracking-[0.22em] text-sky-400">
                Rider Portal
              </p>

            </div>

            <h2 className="mt-3 text-4xl font-black">
              Welcome back
            </h2>

            <p className="mt-3 leading-7 text-slate-300">
              Mag-login gamit ang iyong registered rider account.
            </p>

            <form
          className="mt-8 space-y-5"
       onSubmit={handleSubmit}
         >
              <div>
                <label
                  htmlFor="rider-email"
                  className="mb-2 block text-sm font-extrabold text-slate-200"
                >
                  Rider email
                </label>

                <input
                  id="rider-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="username"
                  value={email}
                  onChange={(event) =>
                    setEmail(event.target.value)
                  }
                  placeholder="rider@example.com"
                  disabled={loading}
                  className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-4 text-white outline-none transition placeholder:text-slate-500 focus:border-sky-400 focus:ring-4 focus:ring-sky-400/10 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>

              <div>
                <label
                  htmlFor="rider-password"
                  className="mb-2 block text-sm font-extrabold text-slate-200"
                >
                  Password
                </label>

                <div className="relative">
                  <input
                    id="rider-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) =>
                      setPassword(event.target.value)
                    }
                    placeholder="Enter your password"
                    disabled={loading}
                    className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-4 pr-24 text-white outline-none transition placeholder:text-slate-500 focus:border-sky-400 focus:ring-4 focus:ring-sky-400/10 disabled:cursor-not-allowed disabled:opacity-60"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword((value) => !value)
                    }
                    disabled={loading}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl px-3 py-2 text-sm font-extrabold text-sky-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              {errorMessage && (
                <div
                  role="alert"
                  className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm font-bold leading-6 text-red-200"
                >
                  {errorMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-gradient-to-r from-sky-400 to-blue-600 px-5 py-4 text-lg font-black text-white shadow-lg shadow-blue-900/30 transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading
                  ? "Signing in..."
                  : "Login as Rider"}
              </button>
            </form>

            <div className="mt-7 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-slate-400">
              <span className="font-extrabold text-slate-200">
                Security:
              </span>{" "}
              Admin accounts na walang matching active rider profile
              ay hindi makakapasok sa rider portal.
            </div>

            <p className="mt-8 text-center text-sm text-slate-500">
              Fast • Safe • Local
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}