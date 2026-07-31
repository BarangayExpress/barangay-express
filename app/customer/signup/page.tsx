"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

export default function CustomerSignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    const cleanName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (cleanName.length < 2) {
      setErrorMessage("Ilagay ang iyong buong pangalan.");
      return;
    }

    if (password.length < 8) {
      setErrorMessage("Ang password ay dapat hindi bababa sa 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Hindi magkapareho ang dalawang password.");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await createClient().auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            full_name: cleanName,
            role: "customer",
          },
          emailRedirectTo: `${window.location.origin}/customer/login`,
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data.session) {
        window.location.replace("/customer/dashboard");
        return;
      }

      setSuccessMessage(
        "Account created! Buksan ang confirmation email bago mag-login."
      );
      setPassword("");
      setConfirmPassword("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Hindi nagawa ang customer account."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-lg rounded-[2rem] border border-blue-100 bg-white p-7 shadow-xl shadow-blue-100 md:p-10">
        <Link href="/" className="text-sm font-extrabold text-blue-700">
          ← Bumalik sa homepage
        </Link>

        <h1 className="mt-8 text-4xl font-black text-blue-950">
          Create Customer Account
        </h1>
        <p className="mt-3 leading-7 text-slate-600">
          Kailangan ang account para makapag-book at makita ang iyong orders.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <label className="block">
            <span className="mb-2 block text-sm font-extrabold text-slate-700">
              Full name
            </span>
            <input
              required
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              autoComplete="name"
              maxLength={120}
              className="w-full rounded-2xl border border-slate-200 px-4 py-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-extrabold text-slate-700">
              Email address
            </span>
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              className="w-full rounded-2xl border border-slate-200 px-4 py-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-extrabold text-slate-700">
              Password
            </span>
            <input
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              className="w-full rounded-2xl border border-slate-200 px-4 py-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-extrabold text-slate-700">
              Confirm password
            </span>
            <input
              required
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              className="w-full rounded-2xl border border-slate-200 px-4 py-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </label>

          {errorMessage && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              ⚠️ {errorMessage}
            </div>
          )}

          {successMessage && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold leading-6 text-emerald-700">
              ✅ {successMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-gradient-to-r from-blue-700 to-sky-500 px-5 py-4 text-lg font-black text-white shadow-lg shadow-blue-200 disabled:opacity-60"
          >
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <p className="mt-7 text-center text-sm text-slate-600">
          May account na?{" "}
          <Link href="/customer/login" className="font-black text-blue-700">
            Mag-login
          </Link>
        </p>
      </section>
    </main>
  );
}
