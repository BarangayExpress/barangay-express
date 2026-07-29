"use client";

import { useCallback, useEffect, useState } from "react";
import StoreControlCard from "./operations/StoreControlCard";
type BusinessSettings = {
  id: number;
  manual_open: boolean;
  emergency_stop: boolean;
  announcement: string | null;
  opens_at: string;
  closes_at: string;
  timezone: string;
  updated_at: string;
};

type BusinessAvailability = {
  accepting_bookings: boolean;
  reason:
    | "OPEN"
    | "MANUALLY_CLOSED"
    | "EMERGENCY_STOP"
    | "OUTSIDE_BUSINESS_HOURS";
  message: string;
  current_time: string;
};

type BusinessSettingsResponse = {
  success: boolean;
  settings?: BusinessSettings;
  availability?: BusinessAvailability;
  error?: string;
};

function normalizeTime(value: string | undefined) {
  return value ? value.slice(0, 5) : "";
}

function getReasonLabel(reason: BusinessAvailability["reason"]) {
  switch (reason) {
    case "OPEN":
      return "Accepting bookings";
    case "MANUALLY_CLOSED":
      return "Manually closed";
    case "EMERGENCY_STOP":
      return "Emergency stop active";
    case "OUTSIDE_BUSINESS_HOURS":
      return "Outside business hours";
    default:
      return "Unknown status";
  }
}

export default function OperationsCenter() {
  const [settings, setSettings] =
    useState<BusinessSettings | null>(null);

  const [availability, setAvailability] =
    useState<BusinessAvailability | null>(null);

  const [announcement, setAnnouncement] = useState("");
  const [opensAt, setOpensAt] = useState("08:00");
  const [closesAt, setClosesAt] = useState("18:00");

  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const applyResponse = useCallback(
    (result: BusinessSettingsResponse) => {
      if (!result.settings || !result.availability) {
        return;
      }

      setSettings(result.settings);
      setAvailability(result.availability);
      setAnnouncement(result.settings.announcement || "");
      setOpensAt(normalizeTime(result.settings.opens_at));
      setClosesAt(normalizeTime(result.settings.closes_at));
    },
    []
  );

  const loadSettings = useCallback(async () => {
    setErrorMessage("");

    try {
      const response = await fetch(
        "/api/admin/business-settings",
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const result =
        (await response.json()) as BusinessSettingsResponse;

      if (!response.ok || !result.success) {
        throw new Error(
          result.error || "Hindi makuha ang business settings."
        );
      }

      applyResponse(result);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "May error habang kinukuha ang settings."
      );
    } finally {
      setIsLoading(false);
    }
  }, [applyResponse]);

  useEffect(() => {
    void loadSettings();

    const intervalId = window.setInterval(() => {
      void loadSettings();
    }, 60000);

    return () => window.clearInterval(intervalId);
  }, [loadSettings]);

  async function updateSettings(
    updates: Partial<{
      manual_open: boolean;
      emergency_stop: boolean;
      announcement: string | null;
      opens_at: string;
      closes_at: string;
    }>,
    message: string
  ) {
    setIsUpdating(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await fetch(
        "/api/admin/business-settings",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updates),
        }
      );

      const result =
        (await response.json()) as BusinessSettingsResponse;

      if (!response.ok || !result.success) {
        throw new Error(
          result.error || "Hindi na-update ang business settings."
        );
      }

      applyResponse(result);
      setSuccessMessage(message);

      window.setTimeout(() => {
        setSuccessMessage("");
      }, 4000);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "May error habang ina-update ang settings."
      );
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleToggleStore() {
    if (!settings) return;

    const nextOpenState = !settings.manual_open;

    await updateSettings(
      {
        manual_open: nextOpenState,
      },
      nextOpenState
        ? "Bukas na ulit ang Barangay Express."
        : "Manually closed na ang Barangay Express."
    );
  }

  async function handleEmergencyStop() {
    if (!settings) return;

    if (!settings.emergency_stop) {
      const confirmed = window.confirm(
        "I-activate ang Emergency Stop? Lahat ng bagong bookings ay agad na maha-harang."
      );

      if (!confirmed) return;
    }

    const nextEmergencyState = !settings.emergency_stop;

    await updateSettings(
      {
        emergency_stop: nextEmergencyState,
      },
      nextEmergencyState
        ? "Emergency Stop activated."
        : "Emergency Stop deactivated."
    );
  }

  async function handleSaveAnnouncement() {
    await updateSettings(
      {
        announcement:
          announcement.trim().slice(0, 500) || null,
      },
      "Na-save ang customer announcement."
    );
  }

  async function handleSaveHours() {
    if (!opensAt || !closesAt) {
      setErrorMessage(
        "Kailangang ilagay ang opening at closing time."
      );
      return;
    }

    await updateSettings(
      {
        opens_at: opensAt,
        closes_at: closesAt,
      },
      "Na-update ang business hours."
    );
  }

  if (isLoading) {
    return (
      <section className="mt-8 rounded-[2rem] border border-blue-100 bg-white p-8 shadow-xl shadow-blue-100/50">
        <div className="grid min-h-48 place-items-center">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />

            <p className="mt-4 font-extrabold text-blue-950">
              Loading Operations Center...
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (!settings || !availability) {
    return (
      <section className="mt-8 rounded-[2rem] border border-red-200 bg-red-50 p-6">
        <p className="font-extrabold text-red-700">
          ⚠️ Hindi ma-load ang Operations Center.
        </p>

        <button
          type="button"
          onClick={() => {
            setIsLoading(true);
            void loadSettings();
          }}
          className="mt-4 rounded-2xl bg-red-700 px-5 py-3 font-bold text-white"
        >
          Retry
        </button>
      </section>
    );
  }

  const effectivelyOpen = availability.accepting_bookings;

  return (
    <section className="mt-8 overflow-hidden rounded-[2rem] border border-blue-100 bg-white shadow-xl shadow-blue-100/60">
      <div className="bg-gradient-to-r from-slate-950 via-blue-950 to-blue-700 px-6 py-7 text-white md:px-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-sky-300">
              Business control
            </p>

            <h2 className="mt-1 text-2xl font-extrabold md:text-3xl">
              Operations Center
            </h2>

            <p className="mt-2 max-w-2xl text-sm font-medium text-blue-100">
              Kontrolin ang booking availability, schedule,
              announcement at emergency shutdown.
            </p>
          </div>

          <div
            className={`w-fit rounded-2xl border px-5 py-3 ${
              effectivelyOpen
                ? "border-emerald-300/40 bg-emerald-400/20"
                : "border-red-300/40 bg-red-400/20"
            }`}
          >
            <p className="text-xs font-bold uppercase tracking-wider">
              Current status
            </p>

            <p className="mt-1 text-xl font-extrabold">
              {effectivelyOpen
                ? "🟢 OPEN"
                : "🔴 CLOSED"}
            </p>

            <p className="mt-1 text-xs font-semibold text-blue-100">
              {getReasonLabel(availability.reason)}
            </p>
          </div>
        </div>
      </div>

      <div className="p-5 md:p-8">
        {errorMessage && (
          <div
            role="alert"
            className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 font-bold text-red-700"
          >
            ⚠️ {errorMessage}
          </div>
        )}

        {successMessage && (
          <div
            role="status"
            className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 font-bold text-emerald-700"
          >
            ✅ {successMessage}
          </div>
        )}

        <div className="grid gap-5 xl:grid-cols-2">
         <StoreControlCard
  manualOpen={settings.manual_open}
  currentTime={availability.current_time}
  openingTime={opensAt}
  closingTime={closesAt}
  isUpdating={isUpdating}
  onToggleStore={() => {
    void handleToggleStore();
  }}
/>

          <article
            className={`rounded-3xl border p-5 md:p-6 ${
              settings.emergency_stop
                ? "border-red-300 bg-red-50"
                : "border-amber-200 bg-amber-50"
            }`}
          >
            <p
              className={`text-xs font-extrabold uppercase tracking-[0.16em] ${
                settings.emergency_stop
                  ? "text-red-600"
                  : "text-amber-600"
              }`}
            >
              Emergency control
            </p>

            <h3
              className={`mt-1 text-xl font-extrabold ${
                settings.emergency_stop
                  ? "text-red-950"
                  : "text-amber-950"
              }`}
            >
              {settings.emergency_stop
                ? "🚨 Emergency Stop is active"
                : "Emergency Stop"}
            </h3>

            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              Gamitin lamang kapag kailangang ihinto agad ang lahat
              ng bagong bookings.
            </p>

            <button
              type="button"
              onClick={handleEmergencyStop}
              disabled={isUpdating}
              className={`mt-5 w-full rounded-2xl px-6 py-4 font-extrabold text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-60 ${
                settings.emergency_stop
                  ? "bg-emerald-600 shadow-emerald-200 hover:bg-emerald-700"
                  : "bg-red-700 shadow-red-200 hover:bg-red-800"
              }`}
            >
              {settings.emergency_stop
                ? "Deactivate Emergency Stop"
                : "🚨 STOP ALL BOOKINGS"}
            </button>
          </article>

          <article className="rounded-3xl border border-slate-200 bg-slate-50 p-5 md:p-6">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-500">
              Customer notice
            </p>

            <h3 className="mt-1 text-xl font-extrabold text-blue-950">
              Announcement
            </h3>

            <textarea
              value={announcement}
              onChange={(event) =>
                setAnnouncement(event.target.value.slice(0, 500))
              }
              placeholder="Halimbawa: Out for delivery. Back around 2 PM."
              rows={5}
              maxLength={500}
              className="mt-5 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3.5 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />

            <div className="mt-2 flex items-center justify-between text-xs font-semibold text-slate-400">
              <span>Makikita ito ng customer.</span>
              <span>{announcement.length}/500</span>
            </div>

            <button
              type="button"
              onClick={handleSaveAnnouncement}
              disabled={isUpdating}
              className="mt-5 w-full rounded-2xl bg-blue-700 px-5 py-4 font-extrabold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Save Announcement
            </button>
          </article>

          <article className="rounded-3xl border border-slate-200 bg-slate-50 p-5 md:p-6">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-violet-500">
              Automatic availability
            </p>

            <h3 className="mt-1 text-xl font-extrabold text-blue-950">
              Business Hours
            </h3>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label>
                <span className="mb-2 block text-sm font-bold text-slate-700">
                  Opening time
                </span>

                <input
                  type="time"
                  value={opensAt}
                  onChange={(event) =>
                    setOpensAt(event.target.value)
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 font-bold outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </label>

              <label>
                <span className="mb-2 block text-sm font-bold text-slate-700">
                  Closing time
                </span>

                <input
                  type="time"
                  value={closesAt}
                  onChange={(event) =>
                    setClosesAt(event.target.value)
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 font-bold outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </label>
            </div>

            <p className="mt-4 text-sm font-semibold leading-6 text-slate-500">
              Timezone: {settings.timezone}. Automatic na magsasara
              ang bookings sa labas ng oras na ito.
            </p>

            <button
              type="button"
              onClick={handleSaveHours}
              disabled={isUpdating}
              className="mt-5 w-full rounded-2xl bg-violet-700 px-5 py-4 font-extrabold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Save Business Hours
            </button>
          </article>
        </div>

        <div
          className={`mt-5 rounded-2xl border px-5 py-4 ${
            effectivelyOpen
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          <p className="font-extrabold">
            {effectivelyOpen
              ? "✅ Customers can create new bookings."
              : "⛔ New customer bookings are currently blocked."}
          </p>

          <p className="mt-1 text-sm font-semibold">
            {availability.message}
          </p>
        </div>
      </div>
    </section>
  );
}