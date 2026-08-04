"use client";

import dynamic from "next/dynamic";
import BookingChatPanel from "@/app/components/BookingChatPanel";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

const CustomerLiveMap = dynamic(() => import("./components/CustomerLiveMap"), {
  ssr: false,
  loading: () => (
    <div className="grid h-[360px] place-items-center rounded-3xl border border-blue-100 bg-slate-50 font-semibold text-slate-500">
      Loading live map...
    </div>
  ),
});

type TrackingOrder = {
  id: number;
  booking_no: string;
  package_type: string | null;
  status: string | null;
  created_at: string | null;
  assigned_rider: string | null;
  accepted_at: string | null;
  heading_to_pickup_at: string | null;
  picked_up_at: string | null;
  in_transit_at: string | null;
  delivered_at: string | null;
  completed_at: string | null;
  cancellation_reason: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  pickup_latitude: number | null;
  pickup_longitude: number | null;
  dropoff_latitude: number | null;
  dropoff_longitude: number | null;
};

type AssignedRiderProfile = {
  id: string;
  full_name: string;
  phone: string | null;
  vehicle_type: string | null;
  plate_number: string | null;
  average_rating?: number | null;
  review_count?: number;
};

type RiderLocation = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  updated_at: string;
};

type StatusToast = {
  status: string;
  icon: string;
  title: string;
  message: string;
};

const statusNotifications: Record<
  string,
  { icon: string; title: string; message: string }
> = {
  Pending: {
    icon: "📝",
    title: "Booking received",
    message: "Natanggap na ang iyong delivery request.",
  },
  Accepted: {
    icon: "✅",
    title: "Rider accepted your booking",
    message: "May rider nang naka-assign sa iyong delivery.",
  },
  "Heading to Pickup": {
    icon: "🏍️",
    title: "Rider is heading to pickup",
    message: "Ihanda na ang package para sa pickup.",
  },
  "Picked Up": {
    icon: "📦",
    title: "Package picked up",
    message: "Nasa rider na ang iyong package.",
  },
  "In Transit": {
    icon: "🚚",
    title: "Package is on the way",
    message: "Papunta na ang rider sa drop-off location.",
  },
  Delivered: {
    icon: "🎉",
    title: "Package delivered",
    message: "Naihatid na ang package sa destination.",
  },
  Completed: {
    icon: "⭐",
    title: "Delivery completed",
    message: "Tapos na ang delivery transaction. Salamat!",
  },
  Cancelled: {
    icon: "❌",
    title: "Booking cancelled",
    message: "Hindi na aktibo ang delivery na ito.",
  },
};

const statusSteps = [
  {
    name: "Pending",
    title: "Booking received",
    description: "Natanggap na namin ang iyong delivery request.",
    icon: "📝",
    timestampKey: "created_at" as const,
  },
  {
    name: "Accepted",
    title: "Rider accepted",
    description: "Nakumpirma na ang booking at may assigned rider na.",
    icon: "✅",
    timestampKey: "accepted_at" as const,
  },
  {
    name: "Heading to Pickup",
    title: "Heading to pickup",
    description: "Papunta na ang rider sa pickup location.",
    icon: "🏍️",
    timestampKey: "heading_to_pickup_at" as const,
  },
  {
    name: "Picked Up",
    title: "Package picked up",
    description: "Nakuha na ng rider ang package at ihahanda na para sa biyahe.",
    icon: "📦",
    timestampKey: "picked_up_at" as const,
  },
  {
    name: "In Transit",
    title: "Package is on the way",
    description: "Papunta na ang package sa receiver.",
    icon: "🚚",
    timestampKey: "in_transit_at" as const,
  },
  {
    name: "Delivered",
    title: "Package delivered",
    description: "Naihatid na ang package sa destination.",
    icon: "🎉",
    timestampKey: "delivered_at" as const,
  },
  {
    name: "Completed",
    title: "Delivery completed",
    description: "Tapos na ang buong delivery transaction.",
    icon: "⭐",
    timestampKey: "completed_at" as const,
  },
];

function getStatusStyle(status: string | null) {
  switch (status) {
    case "Cancelled":
      return "bg-red-100 text-red-700";
    case "Accepted":
      return "bg-sky-100 text-sky-700";
    case "Heading to Pickup":
      return "bg-indigo-100 text-indigo-700";
    case "Picked Up":
      return "bg-violet-100 text-violet-700";
    case "In Transit":
      return "bg-blue-100 text-blue-700";
    case "Delivered":
    case "Completed":
      return "bg-emerald-100 text-emerald-700";
    default:
      return "bg-amber-100 text-amber-700";
  }
}

function formatDate(date: string | null) {
  if (!date) return "Hindi available";

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

function formatTimelineDate(date: string | null) {
  if (!date) return null;

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsedDate);
}

export default function TrackPage() {
  const searchParams = useSearchParams();

  const [bookingNo, setBookingNo] = useState("");
  const [order, setOrder] = useState<TrackingOrder | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [riderLocation, setRiderLocation] = useState<RiderLocation | null>(null);
  const [assignedRider, setAssignedRider] = useState<AssignedRiderProfile | null>(null);

  const [statusToast, setStatusToast] = useState<StatusToast | null>(null);

  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [reviewMessage, setReviewMessage] = useState("");

  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelPhone, setCancelPhone] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelMessage, setCancelMessage] = useState("");

  const previousStatusRef = useRef<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  function showStatusToast(status: string) {
    const notification = statusNotifications[status];

    if (!notification) return;

    setStatusToast({
      status,
      ...notification,
    });

    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }

    toastTimerRef.current = window.setTimeout(() => {
      setStatusToast(null);
    }, 7000);
  }

  async function trackBooking(value: string) {
    const trimmedBookingNo = value.trim();

    if (!trimmedBookingNo) {
      setErrorMessage("Ilagay ang booking number.");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");
    setOrder(null);
    setRiderLocation(null);
    setAssignedRider(null);
    setRating(0);
    setHoveredRating(0);
    setReviewComment("");
    setReviewSubmitted(false);
    setReviewMessage("");
    setCancelModalOpen(false);
    setCancelPhone("");
    setCancelReason("");
    setCancelMessage("");

    try {
      const response = await fetch(
        `/api/track?booking_no=${encodeURIComponent(trimmedBookingNo)}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Hindi makita ang booking.");
      }

      setOrder(result.order);
      setRiderLocation(result.rider_location || null);
      setAssignedRider(result.assigned_rider_profile || null);
      setBookingNo(trimmedBookingNo);
      previousStatusRef.current = result.order?.status || "Pending";
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "May error habang nagta-track."
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleTrack(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await trackBooking(bookingNo);
  }

  useEffect(() => {
    const bookingFromUrl = searchParams.get("booking");

    if (bookingFromUrl) {
      setBookingNo(bookingFromUrl);
      trackBooking(bookingFromUrl);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!order?.booking_no) return;

    const intervalId = window.setInterval(async () => {
      try {
        const response = await fetch(
          `/api/track?booking_no=${encodeURIComponent(order.booking_no)}`,
          { method: "GET", cache: "no-store" }
        );

        const result = await response.json();

        if (!response.ok || !result.success) return;

        const nextStatus = result.order?.status || "Pending";
        const previousStatus = previousStatusRef.current;

        if (previousStatus && nextStatus !== previousStatus) {
          showStatusToast(nextStatus);
        }

        previousStatusRef.current = nextStatus;
        setOrder(result.order);
        setRiderLocation(result.rider_location || null);
      setAssignedRider(result.assigned_rider_profile || null);
      } catch {
        // Keep the last known location during a temporary network error.
      }
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [order?.booking_no]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!order?.booking_no || order.status !== "Completed") {
      setReviewSubmitted(false);
      return;
    }

    const savedReview = window.localStorage.getItem(
      `barangay-express-review:${order.booking_no}`
    );

    setReviewSubmitted(savedReview === "submitted");
  }, [order?.booking_no, order?.status]);

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!order || order.status !== "Completed") return;

    if (rating < 1 || rating > 5) {
      setReviewMessage("Pumili muna ng rating mula 1 hanggang 5 stars.");
      return;
    }

    setReviewSubmitting(true);
    setReviewMessage("");

    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          booking_no: order.booking_no,
          rating,
          comment: reviewComment.trim() || null,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        if (result.code === "ALREADY_REVIEWED") {
          window.localStorage.setItem(
            `barangay-express-review:${order.booking_no}`,
            "submitted"
          );
          setReviewSubmitted(true);
          setReviewMessage("May review na para sa booking na ito.");
          return;
        }

        throw new Error(result.error || "Hindi ma-submit ang review.");
      }

      window.localStorage.setItem(
        `barangay-express-review:${order.booking_no}`,
        "submitted"
      );

      setReviewSubmitted(true);
      setReviewMessage("");
    } catch (error) {
      setReviewMessage(
        error instanceof Error
          ? error.message
          : "May error habang sine-save ang review."
      );
    } finally {
      setReviewSubmitting(false);
    }
  }

  async function submitCancellation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!order || !["Pending", "Accepted"].includes(order.status || "")) {
      return;
    }

    const normalizedPhone = cancelPhone.replace(/\D/g, "");

    if (!/^09\d{9}$/.test(normalizedPhone)) {
      setCancelMessage(
        "Ilagay ang sender phone number sa 09XXXXXXXXX format."
      );
      return;
    }

    if (cancelReason.trim().length < 3) {
      setCancelMessage("Pumili ng cancellation reason.");
      return;
    }

    setCancelSubmitting(true);
    setCancelMessage("");

    try {
      const response = await fetch("/api/bookings/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          booking_no: order.booking_no,
          sender_phone: normalizedPhone,
          reason: cancelReason.trim(),
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Hindi ma-cancel ang booking.");
      }

      setOrder((currentOrder) =>
        currentOrder
          ? {
              ...currentOrder,
              status: "Cancelled",
              cancellation_reason:
                result.order?.cancellation_reason || cancelReason.trim(),
              cancelled_by: result.order?.cancelled_by || "customer",
              cancelled_at:
                result.order?.cancelled_at || new Date().toISOString(),
            }
          : currentOrder
      );

      setRiderLocation(null);
      previousStatusRef.current = "Cancelled";
      showStatusToast("Cancelled");
      setCancelModalOpen(false);
      setCancelPhone("");
      setCancelReason("");
    } catch (error) {
      setCancelMessage(
        error instanceof Error
          ? error.message
          : "May error habang kinakansela ang booking."
      );
    } finally {
      setCancelSubmitting(false);
    }
  }

  const riderLocationIsFresh =
    riderLocation &&
    Date.now() - new Date(riderLocation.updated_at).getTime() < 60_000;

  const showLiveMap =
    order &&
    riderLocation &&
    ["Accepted", "Heading to Pickup", "Picked Up", "In Transit"].includes(
      order.status || ""
    );

  const currentStepIndex = order
    ? statusSteps.findIndex(
        (step) => step.name === (order.status || "Pending")
      )
    : -1;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-blue-100 bg-white/90 px-4 py-4 shadow-sm backdrop-blur md:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <a href="/customer/dashboard" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-sky-500 text-2xl shadow-lg shadow-blue-200">
              🏍️
            </div>

            <div>
              <p className="text-lg font-extrabold text-blue-950 md:text-xl">
                Barangay Express
              </p>

              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-500">
                Fast • Safe • Local
              </p>
            </div>
          </a>

          <div className="flex items-center gap-2">
            <a
              href="/book"
              className="hidden rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700 sm:inline-block"
            >
              Book Delivery
            </a>

            <a
              href="/customer/dashboard"
              className="rounded-xl border border-blue-100 bg-white px-4 py-2 text-sm font-bold text-blue-700 transition hover:border-blue-300 hover:bg-blue-50"
            >
            ← My Orders
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-950 via-blue-800 to-sky-600 px-4 py-14 text-white md:px-6 md:py-20">
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-blue-300/20 blur-3xl" />

        <div className="relative mx-auto max-w-5xl text-center">
          <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold backdrop-blur">
            📍 Real-time delivery status
          </span>

          <h1 className="mt-6 text-4xl font-extrabold tracking-tight md:text-6xl">
            Track your delivery
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-blue-100">
            Ilagay ang booking number upang makita ang kasalukuyang status ng
            iyong package.
          </p>

          <form
            onSubmit={handleTrack}
            className="mx-auto mt-8 flex max-w-3xl flex-col gap-3 rounded-3xl border border-white/20 bg-white/10 p-3 shadow-2xl backdrop-blur-md sm:flex-row"
          >
            <input
              type="text"
              value={bookingNo}
              onChange={(event) =>
                setBookingNo(event.target.value.toUpperCase())
              }
              placeholder="Halimbawa: BE-1784530495659"
              autoComplete="off"
              className="min-w-0 flex-1 rounded-2xl border border-white/20 bg-white px-5 py-4 font-bold uppercase text-blue-950 outline-none placeholder:font-normal placeholder:text-slate-400 focus:ring-4 focus:ring-sky-300/40"
            />

            <button
              type="submit"
              disabled={isLoading}
              className="rounded-2xl bg-gradient-to-r from-blue-600 to-sky-500 px-7 py-4 font-extrabold text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? "Tracking..." : "Track Package"}
            </button>
          </form>
        </div>
      </section>

      <section className="px-4 py-10 md:px-6 md:py-16">
        <div className="mx-auto max-w-5xl">
          {errorMessage && (
            <div className="mx-auto max-w-3xl rounded-2xl border border-red-200 bg-red-50 px-5 py-4 font-semibold text-red-700 shadow-sm">
              ⚠️ {errorMessage}
            </div>
          )}

          {!order && !errorMessage && !isLoading && (
            <div className="mx-auto max-w-3xl rounded-[2rem] border border-blue-100 bg-white p-8 text-center shadow-xl shadow-slate-200/60">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-blue-50 text-4xl">
                📦
              </div>

              <h2 className="mt-6 text-2xl font-extrabold text-blue-950">
                Ready to track your package
              </h2>

              <p className="mx-auto mt-3 max-w-xl leading-7 text-slate-600">
                Makikita rito ang booking status mula confirmation hanggang
                completion.
              </p>
            </div>
          )}

          {isLoading && (
            <div className="mx-auto max-w-3xl rounded-[2rem] border border-blue-100 bg-white p-10 text-center shadow-xl">
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />

              <p className="mt-5 font-bold text-blue-950">
                Hinahanap ang iyong booking...
              </p>
            </div>
          )}

          {order && !isLoading && order.status !== "Cancelled" && (
            <section className="mb-8 overflow-hidden rounded-[2rem] border border-blue-100 bg-white shadow-xl shadow-slate-200/60">
              <div className="flex flex-col gap-3 border-b border-blue-100 bg-gradient-to-r from-blue-950 to-blue-700 px-6 py-6 text-white sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.18em] text-sky-300">
                    Live rider tracking
                  </p>
                  <h2 className="mt-1 text-2xl font-extrabold">
                    Rider current location
                  </h2>
                </div>

                <span
                  className={`w-fit rounded-full px-4 py-2 text-sm font-extrabold ${
                    riderLocationIsFresh
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {riderLocationIsFresh ? "● LIVE" : "Waiting for update"}
                </span>
              </div>

              <div className="p-4 md:p-6">
                {assignedRider && (
                  <section className="mb-5 overflow-hidden rounded-3xl border border-blue-100 bg-gradient-to-br from-white to-blue-50 shadow-sm">
                    <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-4">
                        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-700 to-sky-500 text-3xl text-white shadow-lg">
                          🏍️
                        </div>
                        <div>
                          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-blue-600">Assigned rider</p>
                          <h3 className="mt-1 text-2xl font-black text-slate-950">{assignedRider.full_name}</h3>
                          <p className="mt-1 text-sm font-semibold text-slate-600">
                            {assignedRider.vehicle_type || "Motorcycle"}
                            {assignedRider.plate_number ? ` • ${assignedRider.plate_number}` : " • No plate recorded"}
                          </p>
                          <p className="mt-2 text-sm font-extrabold text-amber-600">
                            ⭐ {assignedRider.average_rating != null ? assignedRider.average_rating.toFixed(1) : "New rider"}
                            {assignedRider.review_count ? ` (${assignedRider.review_count} review${assignedRider.review_count === 1 ? "" : "s"})` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className={`rounded-2xl px-4 py-3 text-sm font-extrabold ${riderLocationIsFresh ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                          {riderLocationIsFresh ? "● Rider location live" : "● Waiting for rider GPS"}
                        </span>
                      </div>
                    </div>
                    {order.id && (
                      <BookingChatPanel orderId={order.id} bookingNo={order.booking_no} role="customer" />
                    )}
                  </section>
                )}

                {showLiveMap && riderLocation ? (
                  <>
                  <CustomerLiveMap
  latitude={riderLocation.latitude}
  longitude={riderLocation.longitude}
  accuracy={riderLocation.accuracy}
  updatedAt={riderLocation.updated_at}
  pickup={
    order.pickup_latitude !== null &&
    order.pickup_longitude !== null
      ? {
          latitude: order.pickup_latitude,
          longitude: order.pickup_longitude,
        }
      : null
  }
  dropoff={
    order.dropoff_latitude !== null &&
    order.dropoff_longitude !== null
      ? {
          latitude: order.dropoff_latitude,
          longitude: order.dropoff_longitude,
        }
      : null
  }
  orderStatus={order.status}
/>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          GPS accuracy
                        </p>
                        <p className="mt-1 font-extrabold text-blue-950">
                          {riderLocation.accuracy !== null
                            ? `±${Math.round(riderLocation.accuracy)} m`
                            : "Unavailable"}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          Rider update
                        </p>
                        <p className="mt-1 font-extrabold text-blue-950">
                          {formatDate(riderLocation.updated_at)}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          Auto refresh
                        </p>
                        <p className="mt-1 font-extrabold text-blue-950">
                          Every 5 seconds
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="grid min-h-[280px] place-items-center rounded-3xl border border-dashed border-blue-200 bg-blue-50/60 p-8 text-center">
                    <div>
                      <div className="text-5xl">🏍️</div>
                      <h3 className="mt-4 text-xl font-extrabold text-blue-950">
                        Live rider location is not available yet
                      </h3>
                      <p className="mx-auto mt-2 max-w-xl leading-7 text-slate-600">
                        Lalabas dito ang mapa kapag may assigned rider na at
                        naka-on ang kanyang live location.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {order && !isLoading && order.status === "Cancelled" && (
            <section className="mb-8 overflow-hidden rounded-[2rem] border border-red-200 bg-white shadow-xl shadow-red-100/60">
              <div className="bg-gradient-to-r from-red-950 to-red-700 px-6 py-7 text-white md:px-8">
                <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-red-200">
                  Cancellation history
                </p>
                <h2 className="mt-2 text-3xl font-extrabold">
                  Booking cancelled
                </h2>
                <p className="mt-2 text-red-100">
                  Hindi na aktibo ang delivery request na ito.
                </p>
              </div>

              <div className="grid gap-4 p-6 md:grid-cols-3 md:p-8">
                <div className="rounded-2xl border border-red-100 bg-red-50 p-5 md:col-span-2">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-red-600">
                    Cancellation reason
                  </p>
                  <p className="mt-2 font-semibold leading-7 text-red-950">
                    {order.cancellation_reason || "No reason recorded."}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                    Details
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-700">
                    Cancelled by:{" "}
                    <span className="font-extrabold capitalize">
                      {order.cancelled_by || "Not recorded"}
                    </span>
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-700">
                    Time: {formatDate(order.cancelled_at)}
                  </p>
                </div>
              </div>
            </section>
          )}

          {order && !isLoading && (
            <div className="grid items-start gap-8 lg:grid-cols-[1fr_320px]">
              {/* Progress Timeline */}
              <section className="overflow-hidden rounded-[2rem] border border-blue-100 bg-white shadow-xl shadow-slate-200/60">
                <div className="bg-gradient-to-br from-blue-950 to-blue-700 px-6 py-7 text-white md:px-8">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-bold uppercase tracking-[0.18em] text-sky-300">
                        Booking number
                      </p>

                      <h2 className="mt-2 break-all text-2xl font-extrabold md:text-3xl">
                        {order.booking_no}
                      </h2>
                    </div>

                    <span
                      className={`w-fit rounded-full px-4 py-2 text-sm font-extrabold ${getStatusStyle(
                        order.status
                      )}`}
                    >
                      {order.status || "Pending"}
                    </span>
                  </div>
                </div>

                <div className="p-5 md:p-8">
                  <h3 className="text-2xl font-extrabold text-blue-950">
                    Delivery progress
                  </h3>

                  <p className="mt-2 text-slate-600">
                    Narito ang kasalukuyang galaw ng iyong delivery.
                  </p>

                  {order.status === "Cancelled" ? (
                    <div className="mt-8 rounded-3xl border border-red-200 bg-red-50 p-6 text-center">
                      <div className="text-5xl">❌</div>
                      <h4 className="mt-4 text-xl font-extrabold text-red-950">
                        Delivery workflow stopped
                      </h4>
                      <p className="mt-2 leading-7 text-red-800">
                        Ang booking na ito ay kinansela at hindi na magpapatuloy
                        sa susunod na delivery steps.
                      </p>
                    </div>
                  ) : (
                  <div className="mt-8">
                    {statusSteps.map((step, index) => {
                      const isCompleted = index < currentStepIndex;
                      const isCurrent = index === currentStepIndex;
                      const isActive = index <= currentStepIndex;
                      const isLast = index === statusSteps.length - 1;

                      return (
                        <div key={step.name} className="relative flex gap-4">
                          {!isLast && (
                            <div
                              className={`absolute left-[23px] top-12 h-[calc(100%-24px)] w-0.5 ${
                                index < currentStepIndex
                                  ? "bg-blue-600"
                                  : "bg-slate-200"
                              }`}
                            />
                          )}

                          <div
                            className={`relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-4 text-lg font-extrabold ${
                              isCompleted
                                ? "border-blue-100 bg-blue-600 text-white"
                                : isCurrent
                                  ? "border-sky-200 bg-sky-500 text-white shadow-lg shadow-sky-200"
                                  : "border-slate-100 bg-slate-200 text-slate-500"
                            }`}
                          >
                            {isCompleted ? "✓" : step.icon}
                          </div>

                          <div
                            className={`mb-7 flex-1 rounded-2xl border p-4 ${
                              isCurrent
                                ? "border-sky-200 bg-sky-50 shadow-sm"
                                : isCompleted
                                  ? "border-blue-100 bg-blue-50/60"
                                  : "border-slate-200 bg-slate-50"
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p
                                className={`font-extrabold ${
                                  isActive
                                    ? "text-blue-950"
                                    : "text-slate-500"
                                }`}
                              >
                                {step.title}
                              </p>

                              {isCurrent && (
                                <span className="rounded-full bg-sky-500 px-3 py-1 text-xs font-bold text-white">
                                  Current status
                                </span>
                              )}
                            </div>

                            <p
                              className={`mt-1 text-sm leading-6 ${
                                isActive
                                  ? "text-slate-600"
                                  : "text-slate-400"
                              }`}
                            >
                              {step.description}
                            </p>

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              {formatTimelineDate(order[step.timestampKey]) ? (
                                <span
                                  className={`inline-flex rounded-full px-3 py-1 text-xs font-extrabold ${
                                    isCurrent
                                      ? "bg-sky-100 text-sky-700"
                                      : isCompleted
                                        ? "bg-blue-100 text-blue-700"
                                        : "bg-slate-100 text-slate-500"
                                  }`}
                                >
                                  🕒 {formatTimelineDate(order[step.timestampKey])}
                                </span>
                              ) : isCurrent ? (
                                <span className="inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-extrabold text-sky-700">
                                  ● Current
                                </span>
                              ) : isCompleted ? (
                                <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-extrabold text-blue-700">
                                  ✓ Completed
                                </span>
                              ) : (
                                <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-400">
                                  Waiting
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  )}
                </div>
              </section>

              {/* Order Summary */}
              <aside className="space-y-5 lg:sticky lg:top-28">
                <div className="overflow-hidden rounded-[2rem] border border-blue-100 bg-white shadow-xl shadow-slate-200/60">
                  <div className="bg-gradient-to-br from-blue-700 to-sky-500 p-6 text-white">
                    <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-100">
                      Delivery details
                    </p>

                    <h2 className="mt-2 text-2xl font-extrabold">
                      Order summary
                    </h2>
                  </div>

                  <div className="space-y-5 p-6">
                    <div className="rounded-2xl bg-blue-50 p-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-blue-500">
                        Current status
                      </p>

                      <p className="mt-1 text-lg font-extrabold text-blue-950">
                        {order.status || "Pending"}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Package
                      </p>

                      <p className="mt-1 font-extrabold text-blue-950">
                        📦 {order.package_type || "Not specified"}
                      </p>
                    </div>

                    <div className="border-t border-slate-100 pt-5">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Date booked
                      </p>

                      <p className="mt-1 font-semibold text-slate-700">
                        {formatDate(order.created_at)}
                      </p>
                    </div>

                    <div className="border-t border-slate-100 pt-5">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Service area
                      </p>

                      <p className="mt-1 font-semibold text-slate-700">
                        Talisay, Batangas
                      </p>
                    </div>
                  </div>
                </div>

                {["Pending", "Accepted"].includes(order.status || "") && (
                  <div className="rounded-3xl border border-red-200 bg-red-50 p-6">
                    <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-red-600">
                      Customer cancellation
                    </p>
                    <h3 className="mt-1 text-xl font-extrabold text-red-950">
                      Need to cancel?
                    </h3>
                    <p className="mt-2 text-sm font-semibold leading-6 text-red-800">
                      Maaari lamang mag-cancel habang Pending o Accepted pa ang
                      booking.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setCancelMessage("");
                        setCancelModalOpen(true);
                      }}
                      className="mt-5 w-full rounded-2xl bg-red-700 px-5 py-3 font-extrabold text-white transition hover:bg-red-800"
                    >
                      Cancel This Booking
                    </button>
                  </div>
                )}

                {order.status &&
                  !["Pending", "Accepted", "Cancelled", "Completed"].includes(
                    order.status
                  ) && (
                    <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
                      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-amber-700">
                        Cancellation locked
                      </p>
                      <h3 className="mt-1 text-xl font-extrabold text-amber-950">
                        🔒 Cancellation is no longer available
                      </h3>
                      <p className="mt-2 text-sm font-semibold leading-6 text-amber-900">
                        Nagsimula na ang rider sa delivery process. Kapag
                        Picked Up na ang item, maaaring nag-abono na rin ang
                        rider kaya hindi na puwedeng i-cancel online.
                      </p>
                      <a
                        href="tel:09150613802"
                        className="mt-5 block rounded-2xl bg-amber-700 px-5 py-3 text-center font-extrabold text-white transition hover:bg-amber-800"
                      >
                        Contact Barangay Express
                      </a>
                    </div>
                  )}

                <div className="rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 to-sky-50 p-6">
                  <h3 className="font-extrabold text-blue-950">
                    Need assistance?
                  </h3>

                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Ihanda ang booking number kapag makikipag-ugnayan tungkol
                    sa delivery.
                  </p>

                  <a
                    href="tel:09150613802"
                    className="mt-5 block rounded-2xl bg-blue-600 px-5 py-3 text-center font-bold text-white transition hover:bg-blue-700"
                  >
                    Call Barangay Express
                  </a>
                </div>
              </aside>
            </div>
          )}
        </div>
      </section>

      {order?.status === "Completed" && (
        <section className="mx-auto mt-8 max-w-7xl px-4 pb-2 md:px-6">
          <div className="overflow-hidden rounded-[2rem] border border-amber-100 bg-white shadow-xl shadow-amber-100/60">
            {reviewSubmitted ? (
              <div className="px-6 py-10 text-center sm:px-10">
                <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-100 text-4xl">
                  🎉
                </div>

                <p className="mt-5 text-xs font-extrabold uppercase tracking-[0.18em] text-emerald-600">
                  Review submitted
                </p>

                <h2 className="mt-2 text-3xl font-black text-blue-950">
                  Salamat sa iyong feedback!
                </h2>

                <p className="mx-auto mt-3 max-w-xl leading-7 text-slate-600">
                  Nakakatulong ang iyong review para mapabuti ang serbisyo ng
                  Barangay Express.
                </p>

                <div className="mt-5 flex justify-center gap-1 text-3xl text-amber-400">
                  {Array.from({ length: rating || 5 }, (_, index) => (
                    <span key={index}>★</span>
                  ))}
                </div>

                {reviewMessage && (
                  <p className="mt-4 text-sm font-bold text-slate-500">
                    {reviewMessage}
                  </p>
                )}
              </div>
            ) : (
              <form onSubmit={submitReview}>
                <div className="bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 px-6 py-6 text-white sm:px-8">
                  <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-amber-50">
                    Customer rating
                  </p>

                  <h2 className="mt-1 text-2xl font-black sm:text-3xl">
                    How was your delivery?
                  </h2>

                  <p className="mt-2 text-sm font-semibold text-amber-50">
                    I-rate ang iyong overall experience sa Barangay Express.
                  </p>
                </div>

                <div className="space-y-6 px-6 py-7 sm:px-8">
                  <div>
                    <p className="text-center text-sm font-extrabold text-slate-700">
                      Tap a star to rate
                    </p>

                    <div
                      className="mt-4 flex justify-center gap-2"
                      onMouseLeave={() => setHoveredRating(0)}
                    >
                      {[1, 2, 3, 4, 5].map((star) => {
                        const active = star <= (hoveredRating || rating);

                        return (
                          <button
                            key={star}
                            type="button"
                            onMouseEnter={() => setHoveredRating(star)}
                            onFocus={() => setHoveredRating(star)}
                            onBlur={() => setHoveredRating(0)}
                            onClick={() => {
                              setRating(star);
                              setReviewMessage("");
                            }}
                            className={`text-5xl leading-none transition hover:-translate-y-1 focus:outline-none ${
                              active
                                ? "text-amber-400 drop-shadow-sm"
                                : "text-slate-200"
                            }`}
                            aria-label={`${star} star${star === 1 ? "" : "s"}`}
                          >
                            ★
                          </button>
                        );
                      })}
                    </div>

                    <p className="mt-3 text-center font-bold text-slate-500">
                      {rating === 0
                        ? "No rating selected"
                        : rating === 1
                          ? "Poor"
                          : rating === 2
                            ? "Fair"
                            : rating === 3
                              ? "Good"
                              : rating === 4
                                ? "Very good"
                                : "Excellent"}
                    </p>
                  </div>

                  <label className="block">
                    <span className="text-sm font-extrabold text-slate-800">
                      💬 Share your experience
                    </span>

                    <span className="ml-2 text-xs font-semibold text-slate-400">
                      Optional
                    </span>

                    <textarea
                      value={reviewComment}
                      onChange={(event) =>
                        setReviewComment(event.target.value.slice(0, 500))
                      }
                      placeholder="Halimbawa: Mabilis, maingat at magalang ang rider."
                      rows={4}
                      disabled={reviewSubmitting}
                      className="mt-3 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-4 focus:ring-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                    />

                    <span className="mt-2 block text-right text-xs font-bold text-slate-400">
                      {reviewComment.length}/500
                    </span>
                  </label>

                  {reviewMessage && (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-700">
                      ⚠️ {reviewMessage}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={reviewSubmitting || rating === 0}
                    className="w-full rounded-2xl bg-blue-700 px-6 py-4 font-black text-white shadow-lg shadow-blue-200 transition hover:-translate-y-0.5 hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
                  >
                    {reviewSubmitting
                      ? "Submitting review..."
                      : "⭐ Submit Review"}
                  </button>

                  <p className="text-center text-xs font-semibold text-slate-400">
                    Isang review lamang ang maaaring isumite para sa booking na
                    ito.
                  </p>
                </div>
              </form>
            )}
          </div>
        </section>
      )}

      {cancelModalOpen && order && (
        <div
          className="fixed inset-0 z-[1500] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Cancel booking"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !cancelSubmitting) {
              setCancelModalOpen(false);
            }
          }}
        >
          <form
            onSubmit={submitCancellation}
            className="w-full max-w-lg overflow-hidden rounded-[2rem] bg-white shadow-2xl"
          >
            <div className="bg-gradient-to-r from-red-950 to-red-700 px-6 py-6 text-white">
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-red-200">
                Customer cancellation
              </p>
              <h2 className="mt-1 text-2xl font-extrabold">
                Cancel {order.booking_no}
              </h2>
              <p className="mt-2 text-sm font-semibold text-red-100">
                Kailangan ang sender phone number para ma-verify ang request.
              </p>
            </div>

            <div className="space-y-5 p-6">
              <label className="block">
                <span className="mb-2 block text-sm font-extrabold text-slate-800">
                  Sender phone number
                </span>
                <input
                  required
                  type="tel"
                  value={cancelPhone}
                  onChange={(event) => {
                    setCancelPhone(
                      event.target.value.replace(/\D/g, "").slice(0, 11)
                    );
                    setCancelMessage("");
                  }}
                  placeholder="09XXXXXXXXX"
                  pattern="09[0-9]{9}"
                  inputMode="numeric"
                  maxLength={11}
                  disabled={cancelSubmitting}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 font-bold outline-none transition focus:border-red-500 focus:bg-white focus:ring-4 focus:ring-red-100 disabled:opacity-60"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-extrabold text-slate-800">
                  Cancellation reason
                </span>
                <select
                  required
                  value={cancelReason}
                  onChange={(event) => {
                    setCancelReason(event.target.value);
                    setCancelMessage("");
                  }}
                  disabled={cancelSubmitting}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 font-bold outline-none transition focus:border-red-500 focus:bg-white focus:ring-4 focus:ring-red-100 disabled:opacity-60"
                >
                  <option value="">Select a reason</option>
                  <option value="I entered incorrect booking details.">
                    Incorrect booking details
                  </option>
                  <option value="The delivery is no longer needed.">
                    Delivery no longer needed
                  </option>
                  <option value="I created a duplicate booking.">
                    Duplicate booking
                  </option>
                  <option value="The pickup or receiver is unavailable.">
                    Pickup or receiver unavailable
                  </option>
                  <option value="I need to change the pickup or drop-off schedule.">
                    Need to change schedule
                  </option>
                  <option value="Other customer-requested cancellation.">
                    Other reason
                  </option>
                </select>
              </label>

              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold leading-6 text-amber-900">
                Kapag Heading to Pickup o Picked Up na ang status, hindi na
                maaaring i-cancel online upang maprotektahan ang rider sa
                pamasahe at posibleng inabono sa order.
              </div>

              {cancelMessage && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-700">
                  ⚠️ {cancelMessage}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setCancelModalOpen(false)}
                  disabled={cancelSubmitting}
                  className="rounded-2xl border border-slate-200 bg-white px-5 py-4 font-extrabold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  Keep Booking
                </button>

                <button
                  type="submit"
                  disabled={cancelSubmitting}
                  className="rounded-2xl bg-red-700 px-5 py-4 font-extrabold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {cancelSubmitting
                    ? "Cancelling..."
                    : "Confirm Cancellation"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {statusToast && (
        <div
          className="fixed bottom-5 right-4 z-[1400] w-[calc(100%-2rem)] max-w-sm animate-[slideIn_.25s_ease-out] overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-2xl shadow-blue-300/40 sm:bottom-6 sm:right-6"
          role="status"
          aria-live="polite"
        >
          <div className="h-1.5 bg-gradient-to-r from-blue-600 via-sky-500 to-emerald-400" />

          <div className="flex items-start gap-4 p-5">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-2xl">
              {statusToast.icon}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-500">
                Delivery update
              </p>

              <h3 className="mt-1 text-lg font-extrabold text-blue-950">
                {statusToast.title}
              </h3>

              <p className="mt-1 text-sm leading-6 text-slate-600">
                {statusToast.message}
              </p>

              <p className="mt-2 text-xs font-bold text-slate-400">
                Status: {statusToast.status}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setStatusToast(null)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-lg font-black text-slate-500 transition hover:bg-slate-200"
              aria-label="Close delivery update"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <footer className="bg-blue-950 px-6 py-8 text-center text-blue-200">
        <p className="font-semibold">
          © 2026 Barangay Express. Fast • Safe • Local
        </p>
      </footer>
    </main>
  );
}