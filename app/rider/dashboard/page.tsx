"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-browser";
import RiderLocationTracker from "../components/RiderLocationTracker";
import DeliveryProofModal from "../components/DeliveryProofModal";
import NotificationBell from "@/app/components/NotificationBell";
import BookingChatPanel from "@/app/components/BookingChatPanel";
import RiderWalletPanel from "../components/RiderWalletPanel";

type RiderProfile = {
  id: string;
  full_name: string;
  phone: string | null;
  vehicle_type: string | null;
  plate_number: string | null;
  is_active: boolean | null;
  is_online: boolean | null;
};

type Order = {
  id: number;
  booking_no: string | null;
  sender_name: string | null;
  sender_phone: string | null;
  pickup_address: string | null;
  receiver_name: string | null;
  receiver_phone: string | null;
  dropoff_address: string | null;
  package_type: string | null;
  notes: string | null;

  payment_method: string | null;
  payment_status: string | null;
  item_payment_flow: string | null;
  estimated_item_amount: number | string | null;
  actual_item_amount: number | string | null;
  purchase_payment_status: string | null;
  rider_advance_amount: number | string | null;
  order_amount: number | string | null;
  total_amount: number | string | null;

  status: string | null;
  price: number | string | null;
  created_at: string | null;
  assigned_rider: string | null;
  accepted_at: string | null;
  heading_to_pickup_at: string | null;
  picked_up_at: string | null;
  in_transit_at: string | null;
  delivered_at: string | null;
  completed_at: string | null;
  pickup_latitude: number | null;
  pickup_longitude: number | null;
  dropoff_latitude: number | null;
  dropoff_longitude: number | null;
  proof_photo_url: string | null;
  received_by: string | null;
  receiver_signature_url: string | null;
  proof_submitted_at: string | null;
  cancellation_reason: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  commission_amount?: number;
  merchant_payment_status: string | null;
  merchant_qr_sent_at: string | null;
  merchant_payment_proof_at: string | null;
  merchant_payment_confirmed_at: string | null;
  merchant_payment_confirmed_by: string | null;
  };

const ACTIVE_STATUSES = [
  "Accepted",
  "Heading to Pickup",
  "Picked Up",
  "In Transit",
  "Delivered",
];

const MAX_ACTIVE_DELIVERIES = 1;

const WORKFLOW: Record<
  string,
  { label: string; nextStatus: string; timestampColumn: keyof Order } | null
> = {
  Pending: {
    label: "🟢 Accept Order",
    nextStatus: "Accepted",
    timestampColumn: "accepted_at",
  },
  Accepted: {
    label: "🏍️ Heading to Pickup",
    nextStatus: "Heading to Pickup",
    timestampColumn: "heading_to_pickup_at",
  },
  "Heading to Pickup": {
    label: "📦 Package Picked Up",
    nextStatus: "Picked Up",
    timestampColumn: "picked_up_at",
  },
  "Picked Up": {
    label: "🚚 Start Delivery",
    nextStatus: "In Transit",
    timestampColumn: "in_transit_at",
  },
  "In Transit": null,
  Delivered: {
    label: "🏁 Complete Order",
    nextStatus: "Completed",
    timestampColumn: "completed_at",
  },
  Completed: null,
  Cancelled: null,
};

const PROGRESS_STATUSES = [
  "Pending",
  "Accepted",
  "Heading to Pickup",
  "Picked Up",
  "In Transit",
  "Delivered",
  "Completed",
];

function formatCurrency(value: number | string | null) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDate(value: string | null) {
  if (!value) return "No date";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getProgress(status: string) {
  const index = PROGRESS_STATUSES.indexOf(status);
  if (index < 0) return 0;
  return Math.round((index / (PROGRESS_STATUSES.length - 1)) * 100);
}

function getStatusClass(status: string) {
  switch (status) {
    case "Pending":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "Accepted":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "Heading to Pickup":
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    case "Picked Up":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "In Transit":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "Delivered":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "Completed":
      return "border-green-200 bg-green-50 text-green-700";
    case "Cancelled":
      return "border-red-200 bg-red-50 text-red-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function mapsUrl(
  latitude: number | null,
  longitude: number | null,
  fallbackAddress: string | null
) {
  if (
    latitude !== null &&
    longitude !== null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
  ) {
    return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving`;
  }

  if (!fallbackAddress) return "#";

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    fallbackAddress
  )}`;
}

function isToday(value: string | null) {
  if (!value) return false;

  const date = new Date(value);
  const today = new Date();

  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

export default function RiderDashboardPage() {
  const router = useRouter();

 const supabase = useMemo(() => createClient(), []);

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<RiderProfile | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<
    "available" | "active" | "completed" | "cancelled"
  >("available");
  const [proofOrder, setProofOrder] = useState<Order | null>(null);
  const [walletRefreshKey, setWalletRefreshKey] = useState(0);
  const [availabilitySaving, setAvailabilitySaving] = useState(false);
  const [soundAlertsEnabled, setSoundAlertsEnabled] = useState(false);
  const previousAvailableIdsRef = useRef<Set<number>>(new Set());
  const soundInitializedRef = useRef(false);

  const loadDashboard = useCallback(
    async (showFullLoader = false) => {
    

      if (showFullLoader) setLoading(true);
      else setRefreshing(true);

      try {
        setErrorMessage("");

        const {
          data: { user: currentUser },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !currentUser) {
          router.replace("/rider/login");
          return;
        }

        const { data: riderProfile, error: profileError } = await supabase
          .from("rider_profiles")
          .select(
            "id, full_name, phone, vehicle_type, plate_number, is_active, is_online"
          )
          .eq("id", currentUser.id)
          .maybeSingle<RiderProfile>();

        if (profileError || !riderProfile || !riderProfile.is_active) {
          await supabase.auth.signOut();
          router.replace("/rider/login");
          return;
        }

        const { data: orderRows, error: ordersError } = await supabase
          .from("orders")
          .select(
  "id, booking_no, sender_name, sender_phone, pickup_address, receiver_name, receiver_phone, dropoff_address, package_type, notes, payment_method, payment_status, item_payment_flow, estimated_item_amount, actual_item_amount, purchase_payment_status, rider_advance_amount, order_amount, total_amount, status, price, created_at, assigned_rider, accepted_at, heading_to_pickup_at, picked_up_at, in_transit_at, delivered_at, completed_at, pickup_latitude, pickup_longitude, dropoff_latitude, dropoff_longitude, proof_photo_url, received_by, receiver_signature_url, proof_submitted_at, merchant_payment_status, merchant_qr_sent_at, merchant_payment_proof_at, merchant_payment_confirmed_at, merchant_payment_confirmed_by, cancellation_reason, cancelled_by, cancelled_at"
)
.or(
  `and(status.eq.Pending,assigned_rider.is.null),assigned_rider.eq.${currentUser.id}`
)
.order("created_at", { ascending: false });

        if (ordersError) {
          throw new Error(ordersError.message);
        }

        const orderIds = (orderRows || []).map((order) => order.id);
        const { data: commissionRows, error: commissionsError } = orderIds.length
          ? await supabase
              .from("order_commissions")
              .select("order_id, commission_amount")
              .in("order_id", orderIds)
          : { data: [], error: null };

        if (commissionsError) {
          throw new Error(commissionsError.message);
        }

        const commissions = new Map(
          (commissionRows || []).map((row) => [
            Number(row.order_id),
            Number(row.commission_amount || 0),
          ])
        );

        setUser(currentUser);
        setProfile(riderProfile);
        setOrders(
          ((orderRows || []) as Order[]).map((order) => ({
            ...order,
            commission_amount: commissions.get(order.id) || 0,
          }))
        );
        setLastUpdated(new Date());
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Hindi ma-load ang rider dashboard."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [router, supabase]
  );

  useEffect(() => {
    loadDashboard(true);

    // Any new order or status change refreshes the rider view immediately.
    const channel = supabase
      ?.channel("rider-orders-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
        },
        () => {
          loadDashboard(false);
        }
      )
      .subscribe();

    // Slow fallback if the realtime connection drops.
    const fallbackInterval = window.setInterval(() => {
      loadDashboard(false);
    }, 60000);

    return () => {
      window.clearInterval(fallbackInterval);

      if (channel && supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, [loadDashboard, supabase]);

  async function updateOrder(order: Order) {
  if (!user) return;

  const currentStatus = order.status || "Pending";
  const action = WORKFLOW[currentStatus];

  if (!action) return;

  if (
    currentStatus === "Pending" &&
    activeOrders.length >= MAX_ACTIVE_DELIVERIES
  ) {
    setErrorMessage(
      "May active delivery ka pa. Kumpletuhin muna ito bago tumanggap ng panibagong order."
    );
    setActiveTab("active");
    return;
  }

  setUpdatingId(order.id);
  setErrorMessage("");

  try {
    const response = await fetch(
      "/api/rider/orders/status",
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          order_id: order.id,
          next_status: action.nextStatus,
        }),
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success || !result.order) {
      throw new Error(
        result.error || "Hindi ma-update ang order."
      );
    }

    const updatedOrder = result.order as Order;

    setOrders((currentOrders) =>
      currentOrders.map((item) =>
        item.id === order.id ? updatedOrder : item
      )
    );

    if (currentStatus === "Pending") {
      setActiveTab("active");
    }
    if (["Pending", "Delivered"].includes(currentStatus)) {
      setWalletRefreshKey((value) => value + 1);
    }
  } catch (error) {
    setErrorMessage(
      error instanceof Error
        ? error.message
        : "May error habang ina-update ang order."
    );

    await loadDashboard(false);
  } finally {
    setUpdatingId(null);
  }
}
  async function toggleAvailability() {
    if (!profile) return;
    setAvailabilitySaving(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/rider/availability", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_online: !profile.is_online }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Hindi ma-update ang rider status.");
      setProfile((current) => current ? { ...current, is_online: !current.is_online } : current);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Hindi ma-update ang rider status.");
    } finally {
      setAvailabilitySaving(false);
    }
  }

  async function updatePurchasePayment(order: Order, action: "accept_advance" | "payment_received") {
    let actualAmount: number | undefined;
    if (action === "accept_advance") {
      const answer = window.prompt(
        "Ilagay ang ACTUAL item cost ayon sa resibo. Sa pagpapatuloy, pumapayag kang mag-advance ng halagang ito.",
        String(order.estimated_item_amount || order.order_amount || "")
      );
      if (answer === null) return;
      actualAmount = Number(answer);
      if (!Number.isFinite(actualAmount) || actualAmount <= 0) {
        setErrorMessage("Maglagay ng valid na actual item cost.");
        return;
      }
    } else if (!window.confirm("Nabayaran ka na ba ng customer para sa actual item cost?")) {
      return;
    }

    setUpdatingId(order.id);
    setErrorMessage("");
    try {
      const response = await fetch("/api/rider/orders/purchase-payment", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: order.id, action, actual_amount: actualAmount }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Hindi ma-update ang item payment.");
      await loadDashboard(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Hindi ma-update ang item payment.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function confirmMerchantPayment(order: Order) {
  if (updatingId === order.id) return;

  const confirmed = window.confirm(
    "Confirm that the merchant received the customer's payment?"
  );

  if (!confirmed) return;

  setUpdatingId(order.id);

  try {
    const response = await fetch(
      `/api/rider/orders/${order.id}/confirm-merchant-payment`,
      {
        method: "POST",
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(
        result.error || "Unable to confirm merchant payment."
      );
    }

    await loadDashboard(false);
  } catch (error) {
    alert(
      error instanceof Error
        ? error.message
        : "Unable to confirm merchant payment."
    );
  } finally {
    setUpdatingId(null);
  }
}

  function playBookingAlert() {
    try {
      const AudioContextClass = window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, context.currentTime);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.22, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.45);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.48);
      oscillator.addEventListener("ended", () => context.close());
    } catch (error) {
      console.error("Booking alert sound failed:", error);
    }
  }

  function enableSoundAlerts() {
    setSoundAlertsEnabled(true);
    soundInitializedRef.current = true;
    playBookingAlert();
  }

  async function logout() {
    await supabase.auth.signOut();

    router.replace("/rider/login");
    router.refresh();
  }

  const availableOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          (order.status || "Pending") === "Pending" &&
          order.assigned_rider === null
      ),
    [orders]
  );

  useEffect(() => {
    const currentIds = new Set(availableOrders.map((order) => order.id));
    const hasNewOrder = Array.from(currentIds).some(
      (id) => !previousAvailableIdsRef.current.has(id)
    );

    if (
      soundInitializedRef.current &&
      soundAlertsEnabled &&
      profile?.is_online &&
      hasNewOrder
    ) {
      playBookingAlert();
    }

    previousAvailableIdsRef.current = currentIds;
  }, [availableOrders, profile?.is_online, soundAlertsEnabled]);

  const activeOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.assigned_rider === user?.id &&
          ACTIVE_STATUSES.includes(order.status || "")
      ),
    [orders, user]
  );

  const completedOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.assigned_rider === user?.id && order.status === "Completed"
      ),
    [orders, user]
  );

  const cancelledOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.assigned_rider === user?.id && order.status === "Cancelled"
      ),
    [orders, user]
  );

  const completedToday = useMemo(
    () => completedOrders.filter((order) => isToday(order.completed_at)),
    [completedOrders]
  );

  const earningsToday = useMemo(
    () =>
      completedToday.reduce(
        (total, order) =>
          total + Number(order.price || 0) - Number(order.commission_amount || 0),
        0
      ),
    [completedToday]
  );

  const displayedOrders =
    activeTab === "available"
      ? availableOrders
      : activeTab === "active"
        ? activeOrders
        : activeTab === "completed"
          ? completedOrders
          : cancelledOrders;

  const currentActiveOrder = activeOrders[0] ?? null;
  const canAcceptOrder = activeOrders.length < MAX_ACTIVE_DELIVERIES && Boolean(profile?.is_online);
  const remainingDeliverySlots = Math.max(
    0,
    MAX_ACTIVE_DELIVERIES - activeOrders.length
  );

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6">
        <div className="rounded-3xl border border-white/10 bg-white/10 px-8 py-7 text-center text-white shadow-2xl">
          <div className="mx-auto h-11 w-11 animate-spin rounded-full border-4 border-white/20 border-t-sky-400" />
          <p className="mt-4 font-extrabold">Loading rider dashboard...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="bg-gradient-to-r from-slate-950 via-blue-950 to-blue-800 text-white shadow-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-6 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="rounded-2xl bg-white/10 p-3 text-3xl">🏍️</span>
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-sky-300">
                  Barangay Express Rider
                </p>
                <h1 className="mt-1 text-2xl font-black sm:text-3xl">
                  Hello, {profile?.full_name || "Rider"} 👋
                </h1>
              </div>
            </div>

            <p className="mt-3 text-sm text-blue-200">
              {profile?.vehicle_type || "Motorcycle"}
              {profile?.plate_number ? ` • ${profile.plate_number}` : ""}
              {lastUpdated
                ? ` • Updated ${lastUpdated.toLocaleTimeString("en-PH", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}`
                : ""}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <NotificationBell defaultHref="/rider/dashboard" dark />
            <button
              type="button"
              onClick={() => loadDashboard(false)}
              disabled={refreshing}
              className="rounded-2xl border border-white/15 bg-white/10 px-5 py-3 font-extrabold transition hover:bg-white/20 disabled:opacity-60"
            >
              {refreshing ? "Refreshing..." : "↻ Refresh"}
            </button>

            <button
              type="button"
              onClick={enableSoundAlerts}
              className={`rounded-2xl border px-5 py-3 font-extrabold transition ${
                soundAlertsEnabled
                  ? "border-emerald-300 bg-emerald-500/20 text-emerald-100"
                  : "border-white/15 bg-white/10 hover:bg-white/20"
              }`}
            >
              {soundAlertsEnabled ? "🔔 Sound On" : "🔕 Enable Sound"}
            </button>

            <button
              type="button"
              onClick={logout}
              className="rounded-2xl bg-white px-5 py-3 font-extrabold text-blue-950 transition hover:bg-sky-50"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-7 sm:px-8">
        {errorMessage && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 font-bold text-red-700">
            {errorMessage}
          </div>
        )}

        <section className={`mb-6 rounded-3xl border p-5 shadow-sm ${profile?.is_online ? "border-green-200 bg-green-50" : "border-slate-200 bg-white"}`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-slate-500">Rider availability</p>
              <h2 className="mt-1 text-xl font-black text-slate-950">{profile?.is_online ? "You are online" : "You are offline"}</h2>
              <p className="mt-1 text-sm text-slate-600">Only online riders can accept newly available orders.</p>
            </div>
            <button type="button" onClick={toggleAvailability} disabled={availabilitySaving} className={`rounded-2xl px-5 py-3 font-black text-white disabled:opacity-50 ${profile?.is_online ? "bg-slate-700" : "bg-green-600"}`}>
              {availabilitySaving ? "Updating..." : profile?.is_online ? "Go Offline" : "Go Online"}
            </button>
          </div>
        </section>

        <RiderWalletPanel refreshKey={walletRefreshKey} />

        <section
          className={`mb-6 rounded-3xl border p-5 shadow-sm ${
            canAcceptOrder
              ? "border-emerald-200 bg-emerald-50"
              : "border-amber-200 bg-amber-50"
          }`}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p
                className={`text-xs font-extrabold uppercase tracking-[0.18em] ${
                  canAcceptOrder ? "text-emerald-700" : "text-amber-700"
                }`}
              >
                Delivery capacity
              </p>
              <h2 className="mt-1 text-xl font-black text-slate-950">
                {canAcceptOrder
                  ? `Ready to accept ${remainingDeliverySlots} order`
                  : !profile?.is_online
                    ? "Go online to accept a new order"
                    : "Current delivery must be completed first"}
              </h2>
              <p className="mt-1 text-sm font-medium text-slate-600">
                Maximum active deliveries: {MAX_ACTIVE_DELIVERIES}
              </p>
            </div>

            <span
              className={`w-fit rounded-full px-4 py-2 text-sm font-extrabold ${
                canAcceptOrder
                  ? "bg-emerald-600 text-white"
                  : "bg-amber-500 text-white"
              }`}
            >
              {canAcceptOrder ? "● AVAILABLE" : "🔒 LOCKED"}
            </span>
          </div>
        </section>

        <RiderLocationTracker
          activeOrder={
            currentActiveOrder
              ? {
                  bookingNo: currentActiveOrder.booking_no,
                  status: currentActiveOrder.status,
                  pickupAddress: currentActiveOrder.pickup_address,
                  dropoffAddress: currentActiveOrder.dropoff_address,
                  pickup:
                    currentActiveOrder.pickup_latitude !== null &&
                    currentActiveOrder.pickup_longitude !== null
                      ? {
                          latitude: currentActiveOrder.pickup_latitude,
                          longitude: currentActiveOrder.pickup_longitude,
                        }
                      : null,
                  dropoff:
                    currentActiveOrder.dropoff_latitude !== null &&
                    currentActiveOrder.dropoff_longitude !== null
                      ? {
                          latitude: currentActiveOrder.dropoff_latitude,
                          longitude: currentActiveOrder.dropoff_longitude,
                        }
                      : null,
                }
              : null
          }
        />

        <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Net Earnings Today",
              value: formatCurrency(earningsToday),
              icon: "💰",
            },
            {
              label: "Completed Today",
              value: completedToday.length,
              icon: "✅",
            },
            {
              label: "Active Delivery",
              value: activeOrders.length,
              icon: "🚚",
            },
            {
              label: "Available Orders",
              value: availableOrders.length,
              icon: "📦",
            },
          ].map((card) => (
            <article
              key={card.label}
              className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-500">
                    {card.label}
                  </p>
                  <p className="mt-2 text-3xl font-black text-slate-950">
                    {card.value}
                  </p>
                </div>
                <span className="rounded-2xl bg-blue-50 p-3 text-2xl">
                  {card.icon}
                </span>
              </div>
            </article>
          ))}
        </section>

        <section className="mt-7 rounded-3xl border border-slate-200 bg-white p-2 shadow-sm">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              {
                key: "available" as const,
                label: `Available (${availableOrders.length})`,
              },
              {
                key: "active" as const,
                label: `My Active (${activeOrders.length})`,
              },
              {
                key: "completed" as const,
                label: `Completed (${completedOrders.length})`,
              },
              {
                key: "cancelled" as const,
                label: `Cancelled (${cancelledOrders.length})`,
              },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-2xl px-3 py-3 text-sm font-extrabold transition sm:text-base ${
                  activeTab === tab.key
                    ? "bg-blue-700 text-white shadow"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-6 space-y-5">
          {displayedOrders.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
              <div className="text-5xl">📭</div>
              <h2 className="mt-4 text-2xl font-black text-slate-900">
                Walang order dito
              </h2>
              <p className="mt-2 text-slate-500">
                Automatic itong mag-a-update sa oras na may bagong order o status change.
              </p>
            </div>
          ) : (

            displayedOrders.map((order) => {
              const status = order.status || "Pending";
              const action = WORKFLOW[status];

              const gcashLocked =status === "Pending" &&
                    order.payment_method === "GCash" &&
                    order.payment_status !== "Paid";

              const bookingLocked =
                    status === "Pending" && !canAcceptOrder;

              const showPickupMap = [
                "Pending",
                "Accepted",
                "Heading to Pickup",
              ].includes(status);

              const merchantPaymentLocked =
                    order.item_payment_flow === "merchant_direct" &&
                    status === "Picked Up" &&
                    order.merchant_payment_status !== "Payment Confirmed";

              const riderAdvancePaymentLocked =
                    order.item_payment_flow === "rider_advance_cod" &&
                    status === "Delivered" &&
                    order.purchase_payment_status !== "Payment Received";

              return (
                <article
                  key={order.id}
                  className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
                >
                  <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-blue-600">
                        Booking Number
                      </p>
                      <h2 className="mt-1 text-2xl font-black text-slate-950">
                        {order.booking_no || `Order #${order.id}`}
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        {formatDate(order.created_at)}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded-full border px-4 py-2 text-sm font-extrabold ${getStatusClass(
                          status
                        )}`}
                      >
                        {status}
                      </span>

                      <span className="text-xl font-black text-blue-700">
                        {formatCurrency(order.price)}
                      </span>
                    </div>
                  </div>

                  {status === "Cancelled" && (
                    <div className="border-t border-red-100 bg-red-50 px-5 py-4 sm:px-6">
                      <p className="font-extrabold text-red-900">
                        ❌ Cancelled booking
                      </p>
                      <p className="mt-1 text-sm font-semibold text-red-700">
                        Reason: {order.cancellation_reason || "No reason provided"}
                      </p>
                      <p className="mt-1 text-sm text-red-700">
                        Cancelled: {formatDate(order.cancelled_at)}
                      </p>
                    </div>
                  )}

                  {bookingLocked ? (
  <div className="border-t border-amber-200 bg-amber-50 p-6">
    <div className="rounded-2xl border border-amber-300 bg-white p-6 text-center">
      <div className="text-3xl">🔒</div>

      <h3 className="mt-3 text-lg font-black text-slate-950">
        Booking details locked
      </h3>

      <p className="mx-auto mt-2 max-w-lg text-sm font-semibold leading-6 text-slate-600">
        Complete your current delivery first to unlock the pickup,
        drop-off, customer details, and navigation.
      </p>
    </div>
  </div>
) : (
  <>

                  <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-2">
                    <div className="rounded-2xl bg-sky-50 p-5">
                      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-sky-700">
                        Pickup
                      </p>
                      <h3 className="mt-2 text-lg font-black text-slate-950">
                        {order.sender_name || "Sender"}
                      </h3>
                      <p className="mt-1 font-bold text-slate-600">
                        {order.sender_phone || "No phone"}
                      </p>
                      <p className="mt-3 leading-7 text-slate-700">
                        {order.pickup_address || "No pickup address"}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-indigo-50 p-5">
                      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-indigo-700">
                        Drop-off
                      </p>
                      <h3 className="mt-2 text-lg font-black text-slate-950">
                        {order.receiver_name || "Receiver"}
                      </h3>
                      <p className="mt-1 font-bold text-slate-600">
                        {order.receiver_phone || "No phone"}
                      </p>
                      <p className="mt-3 leading-7 text-slate-700">
                        {order.dropoff_address || "No drop-off address"}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 border-t border-slate-100 p-5 sm:grid-cols-3 sm:p-6">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Package
                      </p>
                      <p className="mt-1 font-extrabold text-slate-800">
                        {order.package_type || "Not specified"}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Payment
                      </p>
                      <p className="mt-1 font-extrabold text-slate-800">
                        {order.payment_method || "Not specified"}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Notes
                      </p>
                      <p className="mt-1 font-extrabold text-slate-800">
                        {order.notes || "No notes"}
                      </p>
                    </div>
                  </div>
                    </>
)}

              {order.item_payment_flow === "merchant_direct" &&
  status !== "Cancelled" && (
    <div className="border-t border-blue-200 bg-gradient-to-r from-blue-50 via-white to-indigo-50 p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-xl text-white shadow-sm">
            🏪
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-black text-slate-950">
                Merchant Direct Payment
              </p>

              <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-blue-700">
                Direct to Merchant
              </span>
            </div>

            <p className="mt-1 max-w-2xl text-sm font-semibold text-slate-600">
              I-send ang merchant QR sa customer gamit ang Booking Chat.
              Magbabayad ang customer diretso sa merchant at magsesend ng
              payment proof.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm">
                1. Send Merchant QR
              </span>

              <span className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm">
                2. Customer Pays
              </span>

              <span className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm">
                3. Verify Proof
              </span>
            </div>
          </div>
        </div>

        <div className="shrink-0">
  {order.merchant_payment_status === "Payment Confirmed" ? (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-center shadow-sm">
      <p className="text-xs font-black uppercase tracking-wide text-emerald-600">
        Payment Verified
      </p>

      <p className="mt-1 font-black text-emerald-800">
        ✓ Merchant Paid
      </p>

      {order.merchant_payment_confirmed_at && (
        <p className="mt-1 text-[10px] font-bold text-emerald-600">
          {new Date(
            order.merchant_payment_confirmed_at
          ).toLocaleString("en-PH")}
        </p>
      )}
    </div>
  ) : order.merchant_payment_status === "Proof Submitted" ? (
    <button
      type="button"
      disabled={updatingId === order.id}
      onClick={() => void confirmMerchantPayment(order)}
      className="rounded-2xl bg-emerald-600 px-5 py-3 font-black text-white shadow-sm transition hover:bg-emerald-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
    >
      {updatingId === order.id
        ? "Confirming..."
        : "✓ Confirm Merchant Payment"}
    </button>
  ) : (
    <div className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-3 text-center">
      <p className="text-[10px] font-black uppercase tracking-wide text-blue-600">
        Payment Status
      </p>

      <p className="mt-1 text-sm font-black text-blue-900">
        {order.merchant_payment_status || "Waiting for Merchant QR"}
      </p>
    </div>
  )}
</div>

      </div>
    </div>
  )}
                  

                  {order.item_payment_flow === "rider_advance_cod" && status !== "Cancelled" && (
                    <div className="border-t border-amber-200 bg-amber-50 p-5 sm:p-6">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-black text-amber-950">Rider Advance / COD</p>
                          <p className="mt-1 text-sm font-semibold text-amber-800">
                            Estimate: {formatCurrency(order.estimated_item_amount || order.order_amount)} • Actual: {order.actual_item_amount ? formatCurrency(order.actual_item_amount) : "Not entered"}
                          </p>
                          <p className="mt-1 text-sm text-amber-800">Status: {order.purchase_payment_status}</p>
                        </div>
                        {status !== "Pending" && order.purchase_payment_status === "Awaiting Rider Consent" && (
                          <button type="button" disabled={updatingId === order.id} onClick={() => updatePurchasePayment(order, "accept_advance")}
                            className="rounded-2xl bg-amber-500 px-5 py-3 font-black text-amber-950 disabled:opacity-50">
                            Approve Actual Advance
                          </button>
                        )}
                        {["Advance Approved", "Awaiting Customer Payment"].includes(order.purchase_payment_status || "") && (
                          <button type="button" disabled={updatingId === order.id} onClick={() => updatePurchasePayment(order, "payment_received")}
                            className="rounded-2xl bg-emerald-600 px-5 py-3 font-black text-white disabled:opacity-50">
                            Confirm Payment Received
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {["Delivered", "Completed"].includes(status) &&
                    order.proof_photo_url && (
                      <div className="border-t border-emerald-100 bg-emerald-50 px-5 py-4 sm:px-6">
                        <p className="font-extrabold text-emerald-900">
                          ✅ Proof of Delivery submitted
                        </p>
                        <p className="mt-1 text-sm font-semibold text-emerald-700">
                          Received by: {order.received_by || "Not recorded"}
                        </p>
                        <p className="mt-1 text-sm text-emerald-700">
                          Submitted: {formatDate(order.proof_submitted_at)}
                        </p>
                    </div>
                  )}

                  {order.assigned_rider === user?.id && status !== "Pending" && (
                    <BookingChatPanel
                      orderId={order.id}
                      bookingNo={order.booking_no}
                      role="rider"
                    />
                  )}

                  {status !== "Cancelled" && (
                  <div className="border-t border-slate-100 bg-slate-950 p-5 text-white sm:p-6">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-extrabold">Delivery Progress</p>
                          <p className="text-sm font-bold text-sky-300">
                            {getProgress(status)}%
                          </p>
                        </div>

                        <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/15">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-all duration-500"
                            style={{ width: `${getProgress(status)}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
                        {bookingLocked ? (
  <button
    type="button"
    disabled
    className="cursor-not-allowed rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-center font-extrabold text-slate-500"
  >
    🔒 Map Locked
  </button>
) : (
  <a
    href={mapsUrl(
      showPickupMap
        ? order.pickup_latitude
        : order.dropoff_latitude,
      showPickupMap
        ? order.pickup_longitude
        : order.dropoff_longitude,
      showPickupMap
        ? order.pickup_address
        : order.dropoff_address
    )}
    target="_blank"
    rel="noreferrer"
    className="rounded-2xl border border-white/15 bg-white/10 px-5 py-4 text-center font-extrabold transition hover:bg-white/20"
  >
    📍 Open {showPickupMap ? "Pickup" : "Drop-off"} Maps
  </a>
)}
                        {status === "In Transit" && (
                          <button
                            type="button"
                            onClick={() => setProofOrder(order)}
                            className="rounded-2xl bg-emerald-400 px-5 py-4 font-black text-emerald-950 transition hover:bg-emerald-300"
                          >
                            📸 Submit Proof of Delivery
                          </button>
                        )}

                       
                      
                        {action && (
                          <div className="flex flex-col gap-2">
                            <button
                              type="button"

          disabled={
                  updatingId === order.id ||
                  merchantPaymentLocked ||
                  riderAdvancePaymentLocked ||
                   (status === "Pending" && (!canAcceptOrder || gcashLocked))
                  }
                              onClick={() => updateOrder(order)}

                              title={
                                merchantPaymentLocked
                                ? "Merchant payment must be confirmed before starting delivery."
                                : riderAdvancePaymentLocked
                                ? "Confirm that the customer paid the COD amount before completing the order."
                                : gcashLocked
                                ? "Waiting for GCash payment verification."
                                 : status === "Pending" && !canAcceptOrder
                                ? "Complete your current delivery before accepting another booking."
                                : undefined
                                }
                              className="rounded-2xl bg-white px-5 py-4 font-black text-blue-950 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 disabled:opacity-100"
                            >
                              {updatingId === order.id
                                  ? "Updating..."
                                  : merchantPaymentLocked
                                  ? "🔒 Confirm Merchant Payment First"
                                  : riderAdvancePaymentLocked
                                  ? "🔒 Confirm COD Payment First"             
                                  : gcashLocked
                                  ? "💳 Waiting for Payment Verification"
                                  : status === "Pending" && !canAcceptOrder
                                  ? "🔒 Finish Current Delivery First"
                                  : action.label}
                            </button>

                            {status === "Pending" && !canAcceptOrder && (
                              <p className="max-w-xs text-center text-xs font-bold leading-5 text-amber-200">
                                May active delivery ka pa. Magiging available ito
                                kapag Completed na ang kasalukuyang order.
                              </p>
                            )}
                          </div>
                        )}

                        {status === "Completed" && (
                          <div className="rounded-2xl bg-emerald-500/15 px-5 py-4 text-center font-extrabold text-emerald-200">
                            ✅ Delivery completed
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  )}
                </article>
              );
            })
          )}
        </section>
      </div>

      {proofOrder && user && (
        <DeliveryProofModal
          open={Boolean(proofOrder)}
          orderId={proofOrder.id}
          bookingNo={proofOrder.booking_no}
          supabase={supabase}
          riderId={user.id}
          onClose={() => setProofOrder(null)}
          onSubmitted={() => loadDashboard(false)}
        />
      )}
    </main>
  );
}
