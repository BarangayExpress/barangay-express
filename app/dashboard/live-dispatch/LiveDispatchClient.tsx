"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import type { AdminRiderMapItem } from "../AdminLiveMap";

const AdminLiveMap = dynamic(() => import("../AdminLiveMap"), {
  ssr: false,
  loading: () => <div className="grid h-full min-h-[220px] place-items-center bg-slate-100 font-bold text-slate-500">Loading operations map...</div>,
});

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
  payment_method: string | null;
  item_payment_flow?: string | null;
  notes: string | null;
  status: string | null;
  price: number | string | null;
  total_amount?: number | string | null;
  assigned_rider?: string | null;
  created_at: string | null;
};

type Rider = {
  id: string;
  full_name: string;
  phone: string | null;
  vehicle_type: string | null;
  plate_number: string | null;
  is_active: boolean;
  is_online: boolean;
  active_deliveries: number;
  completed_deliveries: number;
};

type Activity = {
  id: number;
  booking_no: string | null;
  actor: string;
  actor_type: string;
  action: string;
  details: string | null;
  created_at: string;
};

const activeStatuses = ["Accepted", "Heading to Pickup", "Picked Up", "In Transit", "Delivered"];

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function parseOrderDate(value: string | null) {
  if (!value) return null;

  // Kapag walang timezone ang Supabase timestamp,
  // ituring natin itong UTC.
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
  const normalizedValue = hasTimezone ? value : `${value}Z`;

  const parsedDate = new Date(normalizedValue);

  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function waitingMinutes(value: string | null) {
  const createdDate = parseOrderDate(value);

  if (!createdDate) return 0;

  return Math.max(
    0,
    Math.floor((Date.now() - createdDate.getTime()) / 60000)
  );
}

function formatWaiting(minutes: number) {
  if (minutes < 1) return "Just now";

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (mins === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${mins} min`;
}

function urgency(minutes: number) {
  if (minutes >= 5) return { card: "border-red-200 bg-red-50", dot: "bg-red-500", label: "text-red-700 bg-red-100" };
  if (minutes >= 2) return { card: "border-amber-200 bg-amber-50", dot: "bg-amber-500", label: "text-amber-700 bg-amber-100" };
  return { card: "border-slate-200 bg-white", dot: "bg-emerald-500", label: "text-emerald-700 bg-emerald-100" };
}

function priorityFor(order: Order) {
  if (order.status !== "Pending") {
    return { rank: 0, label: "Active", tone: "bg-blue-100 text-blue-700" };
  }

  const minutes = waitingMinutes(order.created_at);
  const isFood = (order.package_type || "").toLowerCase().includes("food");

  if (minutes >= 10 || (isFood && minutes >= 5)) {
    return { rank: 3, label: "High", tone: "bg-red-600 text-white" };
  }
  if (minutes >= 5 || isFood) {
    return { rank: 2, label: "Medium", tone: "bg-amber-100 text-amber-800" };
  }
  return { rank: 1, label: "Normal", tone: "bg-slate-100 text-slate-600" };
}


function activityPresentation(activity: Activity) {
  const action = activity.action.toLowerCase();
  const actor = activity.actor && activity.actor !== "system" ? activity.actor : "System";
  if (action.includes("cancel")) return { icon: "✕", tone: "bg-red-100 text-red-700", title: `${actor} cancelled the order` };
  if (action.includes("assign")) return { icon: "🏍", tone: "bg-blue-100 text-blue-700", title: `Rider assignment changed` };
  if (action.includes("accept")) return { icon: "✓", tone: "bg-emerald-100 text-emerald-700", title: `${actor} accepted the order` };
  if (action.includes("pick")) return { icon: "📦", tone: "bg-amber-100 text-amber-700", title: `Order pickup updated` };
  if (action.includes("deliver") || action.includes("complete")) return { icon: "🏁", tone: "bg-emerald-100 text-emerald-700", title: `Delivery status updated` };
  if (action.includes("create")) return { icon: "+", tone: "bg-violet-100 text-violet-700", title: `New booking created` };
  return { icon: "•", tone: "bg-slate-100 text-slate-700", title: activity.action.replaceAll("_", " ") };
}

function formatEta(seconds: number | null) {
  if (!seconds || !Number.isFinite(seconds)) return "—";
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min`;
}

function statusTone(status: string | null) {
  if (status === "Pending") return "bg-amber-100 text-amber-700";
  if (status === "Completed") return "bg-emerald-100 text-emerald-700";
  if (status === "Cancelled") return "bg-red-100 text-red-700";
  return "bg-blue-100 text-blue-700";
}

export default function LiveDispatchClient() {
  const supabase = useMemo(() => createClient(), []);
  const [orders, setOrders] = useState<Order[]>([]);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [liveRiders, setLiveRiders] = useState<AdminRiderMapItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedBookingNo, setSelectedBookingNo] = useState<string | null>(null);
  const [queueFilter, setQueueFilter] = useState<"all" | "pending" | "active">("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [eta, setEta] = useState<{ pickupSeconds: number | null; deliverySeconds: number | null }>({ pickupSeconds: null, deliverySeconds: null });
  const soundEnabledRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  const showActionMessage = useCallback((message: string) => {
    setActionMessage(message);
    window.setTimeout(() => setActionMessage(""), 2200);
  }, []);

  const loadTracking = useCallback(async (currentOrders: Order[], currentRiders: Rider[]) => {
    const active = currentOrders.filter((order) => order.booking_no && activeStatuses.includes(order.status || ""));
    const results = await Promise.allSettled(active.map(async (order) => {
      const response = await fetch(`/api/track?booking_no=${encodeURIComponent(order.booking_no || "")}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success || !result.order || !result.rider_location) return null;
      return {
        orderId: order.id,
        bookingNo: result.order.booking_no || order.booking_no || `Order #${order.id}`,
        status: result.order.status || order.status || "Accepted",
        riderId: result.order.assigned_rider,
        riderName: currentRiders.find((item) => item.id === result.order.assigned_rider)?.full_name || "Assigned rider",
        senderName: order.sender_name,
        receiverName: order.receiver_name,
        pickupAddress: order.pickup_address,
        dropoffAddress: order.dropoff_address,
        latitude: result.rider_location.latitude,
        longitude: result.rider_location.longitude,
        accuracy: result.rider_location.accuracy,
        heading: result.rider_location.heading,
        speed: result.rider_location.speed,
        updatedAt: result.rider_location.updated_at,
        pickupLatitude: result.order.pickup_latitude,
        pickupLongitude: result.order.pickup_longitude,
        dropoffLatitude: result.order.dropoff_latitude,
        dropoffLongitude: result.order.dropoff_longitude,
      } satisfies AdminRiderMapItem;
    }));
    setLiveRiders(results.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []));
  }, []);

  const loadData = useCallback(async () => {
    try {
      setError("");
      const [ordersResponse, ridersResponse, activityResponse] = await Promise.all([
        fetch(`/api/bookings?t=${Date.now()}`, { cache: "no-store" }),
        fetch(`/api/admin/riders?t=${Date.now()}`, { cache: "no-store" }),
        fetch(`/api/admin/activity-logs?t=${Date.now()}`, { cache: "no-store" }),
      ]);
      const [ordersResult, ridersResult, activityResult] = await Promise.all([
        ordersResponse.json(), ridersResponse.json(), activityResponse.json(),
      ]);
      if (!ordersResponse.ok || !ordersResult.success) throw new Error(ordersResult.error || "Unable to load orders.");
      const nextOrders: Order[] = Array.isArray(ordersResult.data) ? ordersResult.data : [];
      
      const nextRiders: Rider[] = Array.isArray(ridersResult.riders) ? ridersResult.riders : [];
      const nextActivities: Activity[] = Array.isArray(activityResult.logs) ? activityResult.logs : [];
      setOrders(nextOrders);
      setRiders(nextRiders);
      setActivities(nextActivities);
      setSelectedId((current) => current ?? nextOrders.find((item) => item.status === "Pending")?.id ?? nextOrders.find((item) => activeStatuses.includes(item.status || ""))?.id ?? null);
      setLastUpdated(new Date());
      void loadTracking(nextOrders, nextRiders);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load dispatch center.");
    } finally {
      setLoading(false);
    }
  }, [loadTracking]);

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);

  const playAlert = useCallback(async (kind: "new" | "cancel" | "test") => {
    if (!soundEnabledRef.current && kind !== "test") return;
    try {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) {
        showActionMessage("Sound is not supported by this browser.");
        return;
      }
      if (!audioContextRef.current || audioContextRef.current.state === "closed") {
        audioContextRef.current = new AudioContextClass();
      }
      const context = audioContextRef.current;
      if (context.state === "suspended") await context.resume();

      const frequencies = kind === "new" ? [880, 1175] : kind === "cancel" ? [420, 300] : [740, 988];
      frequencies.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = context.currentTime + index * 0.17;
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.32, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.15);
      });
    } catch {
      showActionMessage("Browser blocked the sound. Click Sound off, then Sound on again.");
    }
  }, [showActionMessage]);

  const toggleSound = useCallback(async () => {
    if (soundEnabledRef.current) {
      soundEnabledRef.current = false;
      setSoundEnabled(false);
      showActionMessage("Sound alerts turned off.");
      return;
    }
    soundEnabledRef.current = true;
    setSoundEnabled(true);
    await playAlert("test");
    showActionMessage("Sound alerts enabled. Test tone played.");
  }, [playAlert, showActionMessage]);

  useEffect(() => {
    const channel = supabase.channel("v10-live-dispatch")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload) => {
        const next = payload.new as { status?: string } | null;
        const old = payload.old as { status?: string } | null;
        if (payload.eventType === "INSERT") playAlert("new");
        if (next?.status === "Cancelled" && old?.status !== "Cancelled") playAlert("cancel");
        void loadData();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "rider_profiles" }, () => void loadData())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_logs" }, () => void loadData())
      .subscribe();
    const fallback = window.setInterval(() => void loadData(), 15000);
    return () => { window.clearInterval(fallback); supabase.removeChannel(channel); };
  }, [loadData, playAlert, supabase]);

  const queue = useMemo(() => orders
    .filter((order) => order.status === "Pending" || activeStatuses.includes(order.status || ""))
    .filter((order) => queueFilter === "all" || (queueFilter === "pending" ? order.status === "Pending" : activeStatuses.includes(order.status || "")))
    .filter((order) => !search.trim() || [order.booking_no, order.sender_name, order.receiver_name, order.pickup_address, order.dropoff_address].some((value) => value?.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => {
      if (a.status === "Pending" && b.status !== "Pending") return -1;
      if (b.status === "Pending" && a.status !== "Pending") return 1;

      if (a.status === "Pending" && b.status === "Pending") {
        const priorityDifference = priorityFor(b).rank - priorityFor(a).rank;
        if (priorityDifference !== 0) return priorityDifference;
        return waitingMinutes(b.created_at) - waitingMinutes(a.created_at);
      }

      return (
  (parseOrderDate(a.created_at)?.getTime() ?? 0) -
  (parseOrderDate(b.created_at)?.getTime() ?? 0)
);
    }), [orders, queueFilter, search]);

  const oldestPending = useMemo(() =>
    queue.filter((order) => order.status === "Pending")
      .sort((a, b) => waitingMinutes(b.created_at) - waitingMinutes(a.created_at))[0] || null,
  [queue]);

  const selected = orders.find((item) => item.id === selectedId) || null;
  const available = riders.filter((rider) => rider.is_active && rider.is_online && rider.active_deliveries === 0);
  const busy = riders.filter((rider) => rider.is_active && rider.is_online && rider.active_deliveries > 0);
  const offline = riders.filter((rider) => !rider.is_online || !rider.is_active);

  useEffect(() => { setSelectedBookingNo(selected?.booking_no || null); }, [selected]);

  const assignedRider = selected?.assigned_rider
    ? riders.find((rider) => rider.id === selected.assigned_rider) || null
    : null;

  const selectedLiveRider = selected?.booking_no
    ? liveRiders.find((item) => item.bookingNo === selected.booking_no) || null
    : null;

  useEffect(() => {
    let cancelled = false;
    async function loadEta() {
      if (!selectedLiveRider) { setEta({ pickupSeconds: null, deliverySeconds: null }); return; }
      const route = async (startLat: number, startLng: number, endLat: number | null, endLng: number | null) => {
        if (endLat === null || endLng === null) return null;
        try {
          const response = await fetch(`/api/route?start_lat=${startLat}&start_lng=${startLng}&end_lat=${endLat}&end_lng=${endLng}`, { cache: "no-store" });
          const result = await response.json();
          return response.ok && result.success ? Number(result.route?.duration_seconds || 0) || null : null;
        } catch { return null; }
      };
      const pickupSeconds = await route(selectedLiveRider.latitude, selectedLiveRider.longitude, selectedLiveRider.pickupLatitude, selectedLiveRider.pickupLongitude);
      const deliverySeconds = selectedLiveRider.pickupLatitude !== null && selectedLiveRider.pickupLongitude !== null
        ? await route(selectedLiveRider.pickupLatitude, selectedLiveRider.pickupLongitude, selectedLiveRider.dropoffLatitude, selectedLiveRider.dropoffLongitude)
        : null;
      if (!cancelled) setEta({ pickupSeconds, deliverySeconds });
    }
    void loadEta();
    return () => { cancelled = true; };
  }, [selectedLiveRider]);

  const copyText = useCallback(async (label: string, value: string | null) => {
    if (!value) {
      showActionMessage(`${label} is not available.`);
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      showActionMessage(`${label} copied.`);
    } catch {
      showActionMessage(`Unable to copy ${label.toLowerCase()}.`);
    }
  }, [showActionMessage]);

  const mapsUrl = (address: string | null) =>
    address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : "#";

  const routeUrl = selected?.pickup_address && selected?.dropoff_address
    ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(selected.pickup_address)}&destination=${encodeURIComponent(selected.dropoff_address)}`
    : "#";

  return <div className="min-h-screen bg-slate-100 text-slate-900 xl:h-screen xl:overflow-hidden">
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur xl:h-16">
      <div className="flex h-16 items-center gap-3 px-4 md:px-6">
        <Link href="/dashboard" className="grid h-9 w-9 place-items-center rounded-xl bg-blue-950 text-white transition hover:bg-blue-900" aria-label="Back to dashboard">←</Link>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-black uppercase tracking-[.2em] text-blue-600">Barangay Express V10</p>
          <h1 className="truncate text-lg font-black md:text-xl">Live Dispatch Workspace</h1>
        </div>
        <div className="hidden text-right sm:block">
          <p className="text-[11px] font-black text-emerald-600">● LIVE</p>
          <p className="text-[10px] font-semibold text-slate-400">{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", second: "2-digit" })}` : "Connecting..."}</p>
        </div>
        <button onClick={() => void toggleSound()} className={`rounded-xl border px-3 py-2 text-xs font-black transition ${soundEnabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white hover:bg-slate-50"}`}>{soundEnabled ? "🔔 Sound on" : "🔕 Sound off"}</button>
        <button onClick={() => void loadData()} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black transition hover:bg-slate-50">Refresh</button>
      </div>
    </header>

    {actionMessage && <div className="fixed right-4 top-20 z-[1000] rounded-xl bg-slate-950 px-4 py-2 text-xs font-black text-white shadow-xl">{actionMessage}</div>}

    <main className="mx-auto max-w-[1900px] p-3 xl:h-[calc(100vh-64px)] xl:overflow-hidden">
      {error && <div className="mb-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700">{error}</div>}

      <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:h-14">
        {[
          { label: "Waiting", value: orders.filter((item) => item.status === "Pending").length, tone: "text-amber-700" },
          { label: "Active", value: orders.filter((item) => activeStatuses.includes(item.status || "")).length, tone: "text-blue-700" },
          { label: "Available", value: available.length, tone: "text-emerald-700" },
          { label: "GPS live", value: liveRiders.length, tone: "text-violet-700" },
        ].map((item) => <div key={item.label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{item.label}</p>
          <p className={`text-xl font-black ${item.tone}`}>{item.value}</p>
        </div>)}
      </div>

      <div className="grid gap-2 xl:h-[calc(100%-64px)] xl:grid-cols-[300px_minmax(0,1fr)_300px]">
        <section className="flex min-h-[520px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:min-h-0">
          <div className="shrink-0 border-b border-slate-100 p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[.18em] text-amber-600">Queue</p>
                <h2 className="text-sm font-black">Orders requiring attention</h2>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black">{queue.length}</span>
            </div>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search booking or customer" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold outline-none focus:border-blue-400" />
            <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
              {(["all", "pending", "active"] as const).map((item) => <button key={item} onClick={() => setQueueFilter(item)} className={`rounded-lg px-2 py-1.5 text-[10px] font-black capitalize ${queueFilter === item ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}>{item}</button>)}
            </div>
            {oldestPending && <div className="mt-2 flex items-center justify-between rounded-lg border border-red-100 bg-red-50 px-2.5 py-1.5">
              <span className="text-[9px] font-black uppercase tracking-wider text-red-600">Oldest waiting</span>
              <span className="text-[10px] font-black text-red-700">{formatWaiting(waitingMinutes(oldestPending.created_at))} • {oldestPending.booking_no || `#${oldestPending.id}`}</span>
            </div>}
          </div>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
            {loading && <p className="p-6 text-center text-sm font-bold text-slate-500">Loading queue...</p>}
            {!loading && queue.map((order) => {
              const minutes = waitingMinutes(order.created_at);
              const colors = urgency(minutes);
              const priority = priorityFor(order);
              return <button key={order.id} onClick={() => setSelectedId(order.id)} className={`w-full rounded-xl border px-2.5 py-1.5 text-left transition ${colors.card} ${selectedId === order.id ? "ring-2 ring-blue-500" : "hover:border-blue-300"}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${colors.dot}`} />
                    <p className="truncate text-xs font-black">{order.booking_no || `Order #${order.id}`}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[8px] font-black ${statusTone(order.status)}`}>{order.status}</span>
                </div>
                <div className="mt-1 flex items-end justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-bold text-slate-700">{order.sender_name || order.receiver_name || "Customer"}</p>
                    <p className="truncate text-[10px] font-semibold text-slate-400">{order.pickup_address || "Pickup"} → {order.dropoff_address || "Drop-off"}</p>
                  </div>
                  <p className="shrink-0 text-xs font-black">{money(order.total_amount || order.price)}</p>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[8px] font-black ${order.status === "Pending" ? priority.tone : colors.label}`}>{order.status === "Pending" ? `${priority.label} priority` : "In progress"}</span>
                  {order.status === "Pending" && <span className={`inline-flex rounded-full px-2 py-0.5 text-[8px] font-black ${colors.label}`}>{formatWaiting(minutes)} waiting</span>}
                </div>
              </button>;
            })}
            {!loading && queue.length === 0 && <div className="p-8 text-center"><p className="text-3xl">✅</p><p className="mt-2 font-black">Queue is clear</p></div>}
          </div>
        </section>

        <section className="grid min-h-[620px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:min-h-0 xl:grid-rows-[minmax(0,1fr)_minmax(220px,42%)]">
          <div className="min-h-0 overflow-y-auto border-b border-slate-100 p-3">
            {!selected ? <div className="grid h-full min-h-[240px] place-items-center text-center"><div><p className="text-4xl">📦</p><p className="mt-2 font-black">Select a booking</p><p className="text-sm font-semibold text-slate-500">Choose an order from the queue to inspect it.</p></div></div> : <div>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2"><h2 className="text-lg font-black">{selected.booking_no || `Order #${selected.id}`}</h2><span className={`rounded-full px-2 py-1 text-[9px] font-black ${statusTone(selected.status)}`}>{selected.status}</span></div>
                  <p className="mt-0.5 text-[11px] font-semibold text-slate-400">Created {parseOrderDate(selected.created_at) ? parseOrderDate(selected.created_at)!.toLocaleString("en-PH")
  : "—"} </p>
                </div> 
                <div className="text-right"> <p className="text-xl font-black text-blue-700">{money(selected.total_amount || selected.price)}</p><p className="text-[10px] font-bold text-slate-400">{selected.payment_method || "Payment not set"}</p></div>
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-2.5"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Customer</p><div className="mt-1 flex items-center justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-black">{selected.sender_name || "—"}</p><p className="truncate text-[11px] font-bold text-blue-700">{selected.sender_phone || "No phone"}</p></div>{selected.sender_phone && <a href={`tel:${selected.sender_phone}`} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-black">Call</a>}</div></div>
                <div className="rounded-xl bg-slate-50 p-2.5"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Receiver</p><div className="mt-1 flex items-center justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-black">{selected.receiver_name || "—"}</p><p className="truncate text-[11px] font-bold text-blue-700">{selected.receiver_phone || "No phone"}</p></div>{selected.receiver_phone && <a href={`tel:${selected.receiver_phone}`} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-black">Call</a>}</div></div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-2.5"><p className="text-[9px] font-black uppercase tracking-wider text-emerald-600">Pickup</p><p className="mt-1 line-clamp-2 text-xs font-bold">{selected.pickup_address || "—"}</p></div>
                <div className="rounded-xl border border-red-100 bg-red-50 p-2.5"><p className="text-[9px] font-black uppercase tracking-wider text-red-600">Drop-off</p><p className="mt-1 line-clamp-2 text-xs font-bold">{selected.dropoff_address || "—"}</p></div>
              </div>

              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 p-2.5"><p className="text-[9px] font-black uppercase text-slate-400">Package</p><p className="mt-1 truncate text-xs font-black">{selected.package_type || "Not set"}</p></div>
                <div className="rounded-xl border border-slate-200 p-2.5"><p className="text-[9px] font-black uppercase text-slate-400">Payment flow</p><p className="mt-1 truncate text-xs font-black">{selected.item_payment_flow || selected.payment_method || "Not set"}</p></div>
                <div className="rounded-xl border border-slate-200 p-2.5"><p className="text-[9px] font-black uppercase text-slate-400">Assigned rider</p><p className="mt-1 truncate text-xs font-black">{riders.find((rider) => rider.id === selected.assigned_rider)?.full_name || (selected.assigned_rider ? "Assigned rider" : "Waiting for rider")}</p></div>
              </div>

              {selectedLiveRider && <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-2.5"><p className="text-[9px] font-black uppercase tracking-wider text-blue-600">ETA to pickup</p><p className="mt-1 text-sm font-black text-blue-950">{formatEta(eta.pickupSeconds)}</p></div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-2.5"><p className="text-[9px] font-black uppercase tracking-wider text-emerald-600">Pickup to drop-off</p><p className="mt-1 text-sm font-black text-emerald-950">{formatEta(eta.deliverySeconds)}</p></div>
              </div>}

              {selected.notes && <div className="mt-2 rounded-xl border border-slate-200 p-2.5"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Notes</p><p className="mt-1 line-clamp-2 text-xs font-semibold">{selected.notes}</p></div>}

              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-2">
                <p className="mb-2 text-[9px] font-black uppercase tracking-[.16em] text-slate-400">Dispatcher actions</p>
                <div className="flex flex-wrap gap-1.5">
                  <Link href={`/dashboard?view=orders&search=${encodeURIComponent(selected.booking_no || String(selected.id))}`} className="rounded-lg bg-blue-700 px-2.5 py-2 text-[10px] font-black text-white">▣ Open order</Link>
                  <Link href={`/track?booking=${encodeURIComponent(selected.booking_no || "")}`} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10px] font-black">💬 Tracking & chat</Link>
                  {assignedRider?.phone && <a href={`tel:${assignedRider.phone}`} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-[10px] font-black text-emerald-700">☎ Call rider</a>}
                  {selected.sender_phone && <a href={`tel:${selected.sender_phone}`} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10px] font-black">☎ Call customer</a>}
                  <button type="button" onClick={() => void copyText("Pickup address", selected.pickup_address)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10px] font-black">⧉ Copy pickup</button>
                  <button type="button" onClick={() => void copyText("Drop-off address", selected.dropoff_address)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10px] font-black">⧉ Copy drop-off</button>
                  {selected.pickup_address && <a href={mapsUrl(selected.pickup_address)} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10px] font-black">📍 Pickup map</a>}
                  {selected.dropoff_address && <a href={mapsUrl(selected.dropoff_address)} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10px] font-black">🏁 Drop-off map</a>}
                  {selected.pickup_address && selected.dropoff_address && <a href={routeUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-2 text-[10px] font-black text-blue-700">🗺 Open route</a>}
                </div>
              </div>
            </div>}
          </div>

          <div className="relative min-h-[220px] overflow-hidden bg-slate-100">
            <div className="absolute right-2 top-2 z-[500] rounded-lg bg-white/95 px-2 py-1 text-[9px] font-black text-slate-600 shadow">Mini live map</div>
            <div className="absolute bottom-2 left-2 z-[500] flex gap-2 rounded-lg bg-white/95 px-2 py-1 text-[9px] font-black text-slate-600 shadow"><span>🏍 Rider</span><span>📦 Pickup</span><span>🏁 Drop-off</span></div>
            {liveRiders.length > 0 ? <AdminLiveMap riders={liveRiders} selectedBookingNo={selectedBookingNo} onSelectBooking={(bookingNo) => { setSelectedBookingNo(bookingNo); const order = orders.find((item) => item.booking_no === bookingNo); if (order) setSelectedId(order.id); }} /> : <div className="grid h-full min-h-[220px] place-items-center text-center"><div><p className="text-3xl">🗺️</p><p className="mt-1 text-sm font-black">Waiting for rider GPS</p><p className="text-xs font-semibold text-slate-500">Location appears when an active rider shares GPS.</p></div></div>}
          </div>
        </section>

        <aside className="grid min-h-[620px] gap-2 xl:min-h-0 xl:grid-rows-[minmax(0,1fr)_190px]">
          <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex shrink-0 items-center justify-between"><div><p className="text-[9px] font-black uppercase tracking-[.18em] text-emerald-600">Fleet</p><h2 className="text-sm font-black">Rider availability</h2></div><Link href="/dashboard/riders" className="text-[10px] font-black text-blue-700">Manage</Link></div>
            <div className="mt-2 grid shrink-0 grid-cols-3 gap-1.5 text-center">{[{ label: "Available", value: available.length, tone: "text-emerald-700" }, { label: "Busy", value: busy.length, tone: "text-amber-700" }, { label: "Offline", value: offline.length, tone: "text-slate-500" }].map((item) => <div key={item.label} className="rounded-xl bg-slate-50 p-2"><p className={`text-lg font-black ${item.tone}`}>{item.value}</p><p className="text-[8px] font-black uppercase text-slate-400">{item.label}</p></div>)}</div>
            <div className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto">
              {[...available, ...busy, ...offline].map((rider) => {
                const isAssigned = Boolean(selected?.assigned_rider && rider.id === selected.assigned_rider);
                return <div key={rider.id} className={`flex items-center gap-2 rounded-xl border p-2 transition ${isAssigned ? "border-blue-300 bg-blue-50 ring-1 ring-blue-200" : "border-slate-100"}`}>
                  <span className={`h-2.5 w-2.5 rounded-full ${rider.is_active && rider.is_online ? rider.active_deliveries ? "bg-amber-500" : "bg-emerald-500" : "bg-slate-300"}`} />
                  <div className="min-w-0 flex-1"><p className="truncate text-xs font-black">{rider.full_name}</p><p className="truncate text-[9px] font-semibold text-slate-400">{rider.vehicle_type || "Vehicle"}{rider.plate_number ? ` • ${rider.plate_number}` : ""}</p></div>
                  <span className={`text-[8px] font-black uppercase ${isAssigned ? "text-blue-700" : "text-slate-400"}`}>{isAssigned ? "Assigned" : rider.is_online ? rider.active_deliveries ? "Busy" : "Ready" : "Off"}</span>
                </div>;
              })}
            </div>
          </section>

          <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex shrink-0 items-center justify-between"><div><p className="text-[9px] font-black uppercase tracking-[.18em] text-blue-600">Events</p><h2 className="text-sm font-black">Recent activity</h2></div><span className="text-[9px] font-bold text-slate-400">Latest 5</span></div>
            <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto">
              {activities.slice(0, 5).map((item) => { const presentation = activityPresentation(item); return <div key={item.id} className="flex gap-2 rounded-lg border border-slate-100 px-2 py-1.5"><span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-black ${presentation.tone}`}>{presentation.icon}</span><div className="min-w-0 flex-1"><p className="truncate text-[10px] font-black capitalize">{presentation.title}</p><p className="truncate text-[9px] font-semibold text-slate-400">{item.booking_no || item.details || item.actor}</p></div><span className="shrink-0 text-[8px] font-bold text-slate-400">{new Date(item.created_at).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}</span></div>; })}
              {activities.length === 0 && <p className="py-6 text-center text-xs font-bold text-slate-400">No activity yet.</p>}
            </div>
          </section>
        </aside>
      </div>
    </main>
  </div>;
}
