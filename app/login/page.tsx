"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setErrorMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setErrorMessage(error.message);
      setIsLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-blue-950 via-blue-800 to-sky-600 px-4 py-10 text-slate-900">
      <div className="absolute -left-24 top-10 h-80 w-80 rounded-full bg-sky-400/20 blur-3xl" />
      <div className="absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-blue-300/20 blur-3xl" />

      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/20 bg-white/10 shadow-2xl backdrop-blur-xl lg:grid-cols-2">
        {/* Branding panel */}
        <section className="hidden flex-col justify-between bg-gradient-to-br from-blue-950 to-blue-700 p-10 text-white lg:flex">
          <div>
            <a href="/" className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-3xl shadow-lg">
                🏍️
              </div>

              <div>
                <p className="text-2xl font-extrabold">Barangay Express</p>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-300">
                  Fast • Safe • Local
                </p>
              </div>
            </a>

            <div className="mt-16">
              <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold">
                Admin portal
              </span>

              <h1 className="mt-6 text-5xl font-extrabold leading-tight">
                Manage deliveries with confidence.
              </h1>

              <p className="mt-5 max-w-md text-lg leading-8 text-blue-100">
                Tingnan ang bookings, baguhin ang delivery status, at pamahalaan
                ang araw-araw na operasyon ng Barangay Express.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-2xl">📦</p>
              <p className="mt-2 text-sm font-bold">Bookings</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-2xl">🏍️</p>
              <p className="mt-2 text-sm font-bold">Deliveries</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-2xl">📍</p>
              <p className="mt-2 text-sm font-bold">Tracking</p>
            </div>
          </div>
        </section>

        {/* Login form */}
        <section className="bg-white p-6 md:p-10 lg:p-12">
          <div className="mx-auto max-w-md">
            <a
              href="/"
              className="inline-flex items-center gap-2 text-sm font-bold text-blue-700 transition hover:text-blue-900"
            >
              ← Bumalik sa homepage
            </a>

            <div className="mt-8 lg:hidden">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-sky-500 text-2xl shadow-lg shadow-blue-200">
                  🏍️
                </div>

                <div>
                  <p className="text-xl font-extrabold text-blue-950">
                    Barangay Express
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-500">
                    Fast • Safe • Local
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-10">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-500">
                Secure access
              </p>

              <h2 className="mt-3 text-4xl font-extrabold text-blue-950">
                Admin login
              </h2>

              <p className="mt-3 leading-7 text-slate-600">
                Gamitin ang iyong authorized admin account para ma-access ang
                dashboard.
              </p>
            </div>

            <form onSubmit={handleLogin} className="mt-8 space-y-5">
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">
                  Admin email
                </span>

                <div className="flex items-center overflow-hidden rounded-2xl border border-slate-200 bg-white transition focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100">
                  <span className="px-4 text-xl">📧</span>

                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="admin@example.com"
                    autoComplete="email"
                    className="min-w-0 flex-1 px-1 py-4 pr-4 outline-none placeholder:text-slate-400"
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">
                  Password
                </span>

                <div className="flex items-center overflow-hidden rounded-2xl border border-slate-200 bg-white transition focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100">
                  <span className="px-4 text-xl">🔒</span>

                  <input
                    required
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    className="min-w-0 flex-1 px-1 py-4 outline-none placeholder:text-slate-400"
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="px-4 text-sm font-bold text-blue-600 transition hover:text-blue-800"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </label>

              {errorMessage && (
                <div
                  role="alert"
                  className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 font-semibold text-red-700"
                >
                  ⚠️ {errorMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-2xl bg-gradient-to-r from-blue-700 to-sky-500 px-6 py-4 text-lg font-extrabold text-white shadow-xl shadow-blue-200 transition hover:-translate-y-0.5 hover:shadow-2xl disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? "Signing in..." : "Login to Dashboard"}
              </button>
            </form>

            <div className="mt-8 rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <p className="text-sm font-bold text-blue-950">
                🔐 Authorized personnel only
              </p>

              <p className="mt-1 text-sm leading-6 text-slate-600">
                Huwag ibahagi ang iyong admin email at password sa ibang tao.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}