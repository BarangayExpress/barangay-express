"use client";

import { FormEvent, useState } from "react";

type Props = {
  initialFullName: string;
  email: string;
};

export default function ProfileForm({ initialFullName, email }: Props) {
  const [fullName, setFullName] = useState(initialFullName);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setErrorMessage("");

    try {
      const response = await fetch("/api/customer/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: fullName }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Hindi na-update ang profile.");
      }

      setFullName(result.profile.full_name);
      setMessage("Updated na ang iyong customer profile.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Hindi na-update ang profile."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-5">
      <label className="block">
        <span className="mb-2 block text-sm font-extrabold text-slate-700">
          Full name
        </span>
        <input
          required
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          maxLength={120}
          className="w-full rounded-2xl border border-slate-200 px-4 py-4 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-extrabold text-slate-700">
          Email address
        </span>
        <input
          readOnly
          value={email}
          className="w-full cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-100 px-4 py-4 text-slate-500"
        />
      </label>

      {message && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-bold text-emerald-700">
          ✅ {message}
        </div>
      )}

      {errorMessage && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 font-bold text-red-700">
          ⚠️ {errorMessage}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="rounded-2xl bg-blue-700 px-6 py-4 font-black text-white shadow-lg shadow-blue-200 disabled:opacity-60"
      >
        {loading ? "Saving..." : "Save Profile"}
      </button>
    </form>
  );
}
