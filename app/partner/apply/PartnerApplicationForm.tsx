"use client";

import { FormEvent, useState } from "react";

const BUSINESS_TYPES = [
  ["restaurant", "Restaurant"],
  ["coffee_shop", "Coffee Shop"],
  ["bakery", "Bakery"],
  ["grocery", "Grocery"],
  ["convenience_store", "Convenience Store"],
  ["pharmacy", "Pharmacy"],
  ["flower_shop", "Flower Shop"],
  ["cake_shop", "Cake Shop"],
  ["pet_shop", "Pet Shop"],
  ["other", "Other Local Business"],
] as const;

type Props = {
  defaultEmail: string;
};

type SubmittedApplication = {
  business_id: string;
  name: string;
  approval_status: string;
};

export default function PartnerApplicationForm({ defaultEmail }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState<SubmittedApplication | null>(null);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");

  function useCurrentLocation() {
    setError("");

    if (!navigator.geolocation) {
      setError("Location is not supported by this browser.");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(7));
        setLongitude(position.coords.longitude.toFixed(7));
        setLocating(false);
      },
      () => {
        setError(
          "Hindi nakuha ang location. Maaari mong iwanang blanko muna ang map coordinates."
        );
        setLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 30000,
      }
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") || ""),
      business_type: String(form.get("business_type") || "restaurant"),
      description: String(form.get("description") || ""),
      phone: String(form.get("phone") || ""),
      email: String(form.get("email") || ""),
      address: String(form.get("address") || ""),
      latitude: latitude || null,
      longitude: longitude || null,
    };

    try {
      const response = await fetch("/api/partner/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Unable to submit Partner application.");
      }

      setSubmitted(result.application as SubmittedApplication);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to submit Partner application."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-[2rem] border border-emerald-200 bg-white p-8 text-center shadow-sm">
        <div className="text-5xl">✅</div>
        <h2 className="mt-4 text-3xl font-black text-slate-900">
          Partner application submitted
        </h2>
        <p className="mt-3 text-slate-600">
          Ang <strong>{submitted.name}</strong> ay naka-Pending na at hihintayin
          ang review ng Barangay Express Admin.
        </p>
        <div className="mx-auto mt-6 max-w-md rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-800">
          Hindi pa makikita ng customers ang store at mananatiling closed hanggang
          ma-approve ng admin.
        </div>
        <a
          href="/partner/apply"
          className="mt-7 inline-block rounded-xl bg-blue-700 px-6 py-3 font-black text-white hover:bg-blue-800"
        >
          View application status
        </a>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-7 rounded-[2rem] border border-blue-100 bg-white p-6 shadow-sm md:p-8"
    >
      <section>
        <h2 className="text-xl font-black text-blue-950">Business information</h2>
        <p className="mt-1 text-sm text-slate-500">
          Ito ang gagamitin ng admin para i-review ang iyong Partner application.
        </p>

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <label>
            <span className="mb-1 block text-sm font-bold text-slate-700">
              Business name
            </span>
            <input
              name="name"
              required
              maxLength={150}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-blue-500"
              placeholder="Example: Talisay Food House"
            />
          </label>

          <label>
            <span className="mb-1 block text-sm font-bold text-slate-700">
              Business type
            </span>
            <select
              name="business_type"
              defaultValue="restaurant"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-blue-500"
            >
              {BUSINESS_TYPES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-1 block text-sm font-bold text-slate-700">
              Business phone
            </span>
            <input
              name="phone"
              required
              maxLength={30}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-blue-500"
              placeholder="09XXXXXXXXX or landline"
            />
          </label>

          <label>
            <span className="mb-1 block text-sm font-bold text-slate-700">
              Business email
            </span>
            <input
              name="email"
              type="email"
              maxLength={254}
              defaultValue={defaultEmail}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-blue-500"
            />
          </label>
        </div>

        <label className="mt-5 block">
          <span className="mb-1 block text-sm font-bold text-slate-700">
            Short description
          </span>
          <textarea
            name="description"
            rows={3}
            maxLength={1000}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-blue-500"
            placeholder="Ano ang pangunahing products o services ng business?"
          />
        </label>
      </section>

      <section className="border-t border-slate-100 pt-7">
        <h2 className="text-xl font-black text-blue-950">Store location</h2>
        <p className="mt-1 text-sm text-slate-500">
          Mahalaga ang accurate pickup location para sa future rider dispatch.
        </p>

        <label className="mt-5 block">
          <span className="mb-1 block text-sm font-bold text-slate-700">
            Complete business address
          </span>
          <textarea
            name="address"
            required
            rows={3}
            maxLength={500}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-blue-500"
            placeholder="Street / Barangay / Municipality / Province"
          />
        </label>

        <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-black text-blue-950">Store map coordinates</p>
              <p className="mt-1 text-sm text-blue-700">
                Optional sa application stage; maaari pa itong i-correct bago mag-open.
              </p>
            </div>
            <button
              type="button"
              onClick={useCurrentLocation}
              disabled={locating}
              className="rounded-xl bg-white px-4 py-2 text-sm font-black text-blue-700 shadow-sm disabled:opacity-50"
            >
              {locating ? "Getting location..." : "📍 Use Current Location"}
            </button>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label>
              <span className="mb-1 block text-xs font-black uppercase tracking-wider text-blue-700">
                Latitude
              </span>
              <input
                value={latitude}
                onChange={(event) => setLatitude(event.target.value)}
                inputMode="decimal"
                className="w-full rounded-xl border border-blue-200 bg-white px-4 py-3 text-slate-900"
                placeholder="14.1234567"
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-black uppercase tracking-wider text-blue-700">
                Longitude
              </span>
              <input
                value={longitude}
                onChange={(event) => setLongitude(event.target.value)}
                inputMode="decimal"
                className="w-full rounded-xl border border-blue-200 bg-white px-4 py-3 text-slate-900"
                placeholder="120.9876543"
              />
            </label>
          </div>
        </div>
      </section>

      <section className="border-t border-slate-100 pt-7">
        <div className="rounded-2xl bg-slate-50 p-5 text-sm leading-6 text-slate-600">
          <p className="font-black text-slate-800">Before submitting</p>
          <p className="mt-2">
            Ang application ay magiging <strong>Pending</strong>. Hindi automatic
            na makakapag-list ng products o tatanggap ng orders ang business.
            Kailangan muna itong ma-approve ng Barangay Express Admin.
          </p>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 font-semibold text-red-700">
          {error}
        </div>
      )}

      <button
        disabled={submitting}
        className="w-full rounded-xl bg-blue-700 px-6 py-4 text-lg font-black text-white shadow-lg shadow-blue-200 hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Submitting application..." : "Submit Partner Application"}
      </button>
    </form>
  );
}
