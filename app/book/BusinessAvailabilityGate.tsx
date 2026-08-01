"use client";

import Link from "next/link";

import {
  ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";

type BusinessStatusResponse = {
  success: boolean;
  settings?: {
    announcement: string | null;
    opens_at: string;
    closes_at: string;
    timezone: string;
    updated_at: string;
  };
  availability?: {
    accepting_bookings: boolean;
    reason:
      | "OPEN"
      | "MANUALLY_CLOSED"
      | "EMERGENCY_STOP"
      | "OUTSIDE_BUSINESS_HOURS";
    message: string;
    current_time: string;
  };
  error?: string;
};

type BusinessAvailabilityGateProps = {
  children: ReactNode;
};

function formatTime(value: string) {
  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute)
  ) {
    return value;
  }

  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

function getClosedTitle(reason: string) {
  switch (reason) {
    case "EMERGENCY_STOP":
      return "Temporarily unavailable";
    case "MANUALLY_CLOSED":
      return "We are currently closed";
    case "OUTSIDE_BUSINESS_HOURS":
      return "Outside business hours";
    default:
      return "Bookings are unavailable";
  }
}

export default function BusinessAvailabilityGate({
  children,
}: BusinessAvailabilityGateProps) {
  const [status, setStatus] =
    useState<BusinessStatusResponse | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadStatus = useCallback(async () => {
    setErrorMessage("");

    try {
      const response = await fetch("/api/business-status", {
        method: "GET",
        cache: "no-store",
      });

      const result =
        (await response.json()) as BusinessStatusResponse;

      if (
        !response.ok ||
        !result.success ||
        !result.settings ||
        !result.availability
      ) {
        throw new Error(
          result.error || "Hindi makuha ang business status."
        );
      }

      setStatus(result);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to check booking availability."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();

    const intervalId = window.setInterval(() => {
      void loadStatus();
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, [loadStatus]);

  if (isLoading) {
    return (
      <div className="grid min-h-[420px] place-items-center rounded-[2rem] border border-blue-100 bg-white p-8 shadow-xl">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />

          <p className="mt-5 font-extrabold text-blue-950">
            Checking booking availability...
          </p>
        </div>
      </div>
    );
  }

  if (
    errorMessage ||
    !status?.settings ||
    !status.availability
  ) {
    return (
      <div className="mx-auto max-w-2xl rounded-[2rem] border border-red-200 bg-white p-6 text-center shadow-xl md:p-10">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-50 text-4xl">
          ⚠️
        </div>

        <h2 className="mt-6 text-2xl font-extrabold text-red-800">
          Booking system unavailable
        </h2>

        <p className="mt-3 leading-7 text-slate-600">
          Hindi namin ma-check ang booking availability sa ngayon.
          Subukan ulit pagkatapos ng ilang sandali.
        </p>

        {errorMessage && (
          <p className="mt-3 text-sm font-semibold text-red-600">
            {errorMessage}
          </p>
        )}

        <button
          type="button"
          onClick={() => {
            setIsLoading(true);
            void loadStatus();
          }}
          className="mt-6 rounded-2xl bg-blue-700 px-6 py-4 font-extrabold text-white"
        >
          Check Again
        </button>
      </div>
    );
  }

  const { settings, availability } = status;

  if (!availability.accepting_bookings) {
    return (
      <div className="mx-auto max-w-2xl overflow-hidden rounded-[2rem] border border-red-100 bg-white shadow-2xl shadow-red-100">
        <div className="bg-gradient-to-br from-slate-950 via-red-950 to-red-700 px-6 py-10 text-center text-white md:px-10">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white text-4xl shadow-xl">
            🔒
          </div>

          <p className="mt-6 text-sm font-bold uppercase tracking-[0.18em] text-red-200">
            Barangay Express
          </p>

          <h2 className="mt-2 text-3xl font-extrabold">
            {getClosedTitle(availability.reason)}
          </h2>

          <p className="mt-3 text-red-100">
            Hindi muna kami tumatanggap ng bagong delivery
            bookings.
          </p>
        </div>

        <div className="p-6 text-center md:p-10">
          <div className="rounded-3xl border border-blue-100 bg-blue-50 p-5">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-blue-500">
              Business Hours
            </p>

            <p className="mt-2 text-2xl font-extrabold text-blue-950">
              {formatTime(settings.opens_at)} –{" "}
              {formatTime(settings.closes_at)}
            </p>

            <p className="mt-2 text-sm font-semibold text-blue-600">
              Asia/Manila
            </p>
          </div>

          <div className="mt-5 rounded-3xl border border-amber-100 bg-amber-50 p-5 text-left">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-amber-600">
              Announcement
            </p>

            <p className="mt-2 font-semibold leading-7 text-amber-950">
              {availability.message}
            </p>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setIsLoading(true);
                void loadStatus();
              }}
              className="rounded-2xl bg-blue-700 px-6 py-4 font-extrabold text-white transition hover:bg-blue-800"
            >
              Check Again
            </button>

            <Link
              href="/"
              className="rounded-2xl border border-blue-200 bg-white px-6 py-4 font-extrabold text-blue-700 transition hover:bg-blue-50"
            >
              Return Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {settings.announcement && (
        <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4">
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-500">
            📢 Announcement
          </p>

          <p className="mt-1 font-semibold leading-6 text-blue-950">
            {settings.announcement}
          </p>
        </div>
      )}

      {children}
    </>
  );
}
