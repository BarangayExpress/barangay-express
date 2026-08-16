"use client";

import OperationsCenter from "./OperationsCenter";
import PaymentsCenter from "./PaymentsCenter";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { createClient } from "@/lib/supabase-browser";
import type { SupabaseClient } from "@supabase/supabase-js";

import LogoutButton from "./LogoutButton";
import NotificationBell from "@/app/components/NotificationBell";
import type { AdminRiderMapItem } from "./AdminLiveMap";

const AdminLiveMap = dynamic(() => import("./AdminLiveMap"), {
  ssr: false,
  loading: () => (
    <div className="grid h-[520px] place-items-center rounded-3xl border border-blue-100 bg-slate-50 font-bold text-slate-500">
      Loading live dispatch map...
    </div>
  ),
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
  notes: string | null;
  payment_method: string | null;

  item_payment_flow: string | null;
  estimated_item_amount: number | string | null;
  actual_item_amount: number | string | null;
  purchase_payment_status: string | null;
  order_amount: number | string | null;
  total_amount: number | string | null;
  merchant_payment_status: string | null;
  
  status: string | null;
  assigned_rider: string | null;
  price: number | string | null;
  created_at: string | null;
  proof_photo_url: string | null;
  received_by: string | null;
  receiver_signature_url: string | null;
  proof_submitted_at: string | null;
};

type NewBookingAlert = {
  bookingNo: string;
  senderName: string;
};

type DeliveryReview = {
  id: number;
  order_id: number;
  booking_no: string;
  rider_id: string | null;
  rider_name: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
};
type AdminView = "dashboard" | "dispatch" | "operations" | "payments" | "map" | "reviews" | "analytics" | "orders";

type RiderSummary = {
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

type ActivityLog = {
  id: number;
  booking_no: string | null;
  order_id: number | null;
  actor: string;
  actor_type: string;
  action: string;
  details: string | null;
  created_at: string;
};
const statuses = [
  "Pending",
  "Accepted",
  "Heading to Pickup",
  "Picked Up",
  "In Transit",
  "Delivered",
  "Completed",
  "Cancelled",
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "No date available";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getStatusClass(status: string | null) {
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

function getStatusDotClass(status: string | null) {
  switch (status) {
    case "Pending":
      return "bg-amber-500";
    case "Accepted":
      return "bg-sky-500";
    case "Heading to Pickup":
      return "bg-indigo-500";
    case "Picked Up":
      return "bg-violet-500";
    case "In Transit":
      return "bg-blue-600";
    case "Delivered":
      return "bg-emerald-500";
    case "Completed":
      return "bg-green-600";
    case "Cancelled":
      return "bg-red-500";
    default:
      return "bg-slate-500";
  }
}


const workflowStatuses = [
  "Pending",
  "Accepted",
  "Heading to Pickup",
  "Picked Up",
  "In Transit",
  "Delivered",
  "Completed",
];

const workflowActions: Record<
  string,
  { label: string; nextStatus: string; description: string } | null
> = {
  Pending: {
    label: "🟢 Accept Order",
    nextStatus: "Accepted",
    description: "Tanggapin ang bagong booking.",
  },
  Accepted: {
    label: "🏍️ Heading to Pickup",
    nextStatus: "Heading to Pickup",
    description: "Sabihin sa customer na papunta ka na sa pickup.",
  },
  "Heading to Pickup": {
    label: "📦 Pick Up Package",
    nextStatus: "Picked Up",
    description: "Kumpirmahing nakuha mo na ang package.",
  },
  "Picked Up": {
    label: "🚚 Start Delivery",
    nextStatus: "In Transit",
    description: "Simulan ang biyahe papunta sa receiver.",
  },
  "In Transit": {
    label: "✅ Mark Delivered",
    nextStatus: "Delivered",
    description: "Kumpirmahing naihatid na ang package.",
  },
  Delivered: {
    label: "🏁 Complete Order",
    nextStatus: "Completed",
    description: "Tapusin at isara ang delivery transaction.",
  },
  Completed: null,
  Cancelled: null,
};

function getWorkflowProgress(status: string) {
  if (status === "Cancelled") return 0;

  const index = workflowStatuses.indexOf(status);
  if (index < 0) return 0;

  return Math.round((index / (workflowStatuses.length - 1)) * 100);
}

function createMapsUrl(address: string | null) {
  if (!address) return null;

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    address
  )}`;
}
function scrollToSection(sectionId: string) {
  const element = document.getElementById(sectionId);

  if (!element) return;

  element.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}
export default function DashboardClient() {
  const supabase = useMemo<SupabaseClient>(() => createClient(), []);

  const [isMounted, setIsMounted] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [newBookingAlert, setNewBookingAlert] =
    useState<NewBookingAlert | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);
  const [selectedProof, setSelectedProof] = useState<Order | null>(null);
  const [reviews, setReviews] = useState<DeliveryReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewsError, setReviewsError] = useState("");
  const [analyticsRange, setAnalyticsRange] = useState<7 | 30 | 90>(7);
  const [liveRiders, setLiveRiders] = useState<AdminRiderMapItem[]>([]);
  const [liveMapLoading, setLiveMapLoading] = useState(true);
  const [liveMapError, setLiveMapError] = useState("");
 
  const [showBackToTop, setShowBackToTop] = useState(false);

  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState("");
  const [riderSummaries, setRiderSummaries] = useState<RiderSummary[]>([]);
  const [ridersLoading, setRidersLoading] = useState(true);
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const [unreadActivityCount, setUnreadActivityCount] = useState(0);
  const [activeAdminView, setActiveAdminView] = useState<AdminView>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [orderPage, setOrderPage] = useState(1);
  const ordersPerPage = 8;

  function navigateFromStatCard(sectionId: string, status?: string) {
    if (status) setFilterStatus(status);

    const viewBySection: Record<string, AdminView> = {
      "operations-section": "operations",
      "payments-section": "payments",
      "rider-map-section": "map",
      "reviews-section": "reviews",
      "analytics-section": "analytics",
      "orders-section": "orders",
      "dashboard-section": "dashboard",
    };

    setActiveAdminView(viewBySection[sectionId] || "dashboard");
    window.setTimeout(() => window.scrollTo({ top: 360, behavior: "smooth" }), 50);
  }
function scrollBackToTop() {
  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
}
const loadRiderSummaries = useCallback(async () => {
  try {
    const response = await fetch(`/api/admin/riders?t=${Date.now()}`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to load riders.");
    setRiderSummaries(Array.isArray(result.riders) ? result.riders : []);
  } catch (error) {
    console.error("Unable to load rider summary:", error);
  } finally {
    setRidersLoading(false);
  }
}, []);

const loadActivityLogs = useCallback(async () => {
  try {
    setActivityError("");

    const response = await fetch("/api/admin/activity-logs", {
      method: "GET",
      cache: "no-store",
      credentials: "include",
    });

    const result = (await response.json()) as {
      success?: boolean;
      logs?: ActivityLog[];
      error?: string;
    };

    if (!response.ok || !result.success) {
      throw new Error(result.error || "Hindi makuha ang activity logs.");
    }

    setActivityLogs(result.logs || []);
  } catch (error) {
    console.error("Unable to load activity logs:", error);

    setActivityError(
      error instanceof Error
        ? error.message
        : "Hindi makuha ang activity logs.",
    );
  } finally {
    setActivityLoading(false);
  }
}, []);

async function refreshDashboardData() {
  if (isAutoRefreshing) return;

  setIsAutoRefreshing(true);

  try {
    await Promise.all([
      loadOrders(false),
      loadReviews(),
      loadActivityLogs(),
      loadRiderSummaries(),
    ]);
  } catch (error) {
    console.error("Dashboard refresh failed:", error);
  } finally {
    setIsAutoRefreshing(false);
  }
}
  const [selectedLiveBooking, setSelectedLiveBooking] =
    useState<string | null>(null);
  const [liveMapUpdatedAt, setLiveMapUpdatedAt] = useState<Date | null>(null);

  const knownOrderIdsRef = useRef<Set<number>>(new Set());
  const initialLoadRef = useRef(true);
  const audioContextRef = useRef<AudioContext | null>(null);
  const soundEnabledRef = useRef(false);
  const notificationTimerRef = useRef<number | null>(null);
  const ordersRef = useRef<Order[]>([]);
  const reviewsRef = useRef<DeliveryReview[]>([]);

  const playNotificationSound = useCallback(() => {
    if (!soundEnabledRef.current || !audioContextRef.current) {
      return;
    }

    const audioContext = audioContextRef.current;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime);

    gainNode.gain.setValueAtTime(0.18, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.001,
      audioContext.currentTime + 0.5
    );

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.5);
  }, []);

  async function enableSoundAlerts() {
    try {
      const AudioContextClass =
        window.AudioContext ||
        (
          window as typeof window & {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;

      if (!AudioContextClass) {
        setErrorMessage(
          "Hindi supported ng browser na ito ang sound notifications."
        );
        return;
      }

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContextClass();
      }

      if (audioContextRef.current.state === "suspended") {
        await audioContextRef.current.resume();
      }

      soundEnabledRef.current = true;
      setSoundEnabled(true);
      setErrorMessage("");

      const oscillator = audioContextRef.current.createOscillator();
      const gainNode = audioContextRef.current.createGain();

      oscillator.frequency.setValueAtTime(
        660,
        audioContextRef.current.currentTime
      );
      gainNode.gain.setValueAtTime(
        0.1,
        audioContextRef.current.currentTime
      );
      gainNode.gain.exponentialRampToValueAtTime(
        0.001,
        audioContextRef.current.currentTime + 0.25
      );

      oscillator.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);

      oscillator.start();
      oscillator.stop(audioContextRef.current.currentTime + 0.25);
    } catch {
      setErrorMessage("Hindi ma-enable ang sound alerts.");
    }
  }

  const loadLiveRiders = useCallback(
    async (currentOrders?: Order[]) => {
      const ordersToTrack = currentOrders ?? ordersRef.current;
      const activeOrders = ordersToTrack.filter(
        (order) =>
          Boolean(order.booking_no) &&
          [
            "Accepted",
            "Heading to Pickup",
            "Picked Up",
            "In Transit",
            "Delivered",
          ].includes(order.status || "")
      );

      if (activeOrders.length === 0) {
        setLiveRiders([]);
        setLiveMapError("");
        setLiveMapLoading(false);
        setLiveMapUpdatedAt(new Date());
        return;
      }

      setLiveMapError("");

      try {
        const results = await Promise.allSettled(
          activeOrders.map(async (order) => {
            const response = await fetch(
              `/api/track?booking_no=${encodeURIComponent(
                order.booking_no || ""
              )}`,
              {
                method: "GET",
                cache: "no-store",
              }
            );

            const rawText = await response.text();
            let result: {
              success?: boolean;
              error?: string;
              order?: {
                booking_no: string;
                status: string | null;
                assigned_rider: string | null;
                pickup_latitude: number | null;
                pickup_longitude: number | null;
                dropoff_latitude: number | null;
                dropoff_longitude: number | null;
              };
              rider_location?: {
                latitude: number;
                longitude: number;
                accuracy: number | null;
                heading: number | null;
                speed: number | null;
                updated_at: string;
              } | null;
            } = {};

            try {
              result = rawText ? JSON.parse(rawText) : {};
            } catch {
              throw new Error(
                `Invalid tracking response for ${
                  order.booking_no || `Order #${order.id}`
                }.`
              );
            }

            if (!response.ok || !result.success || !result.order) {
              throw new Error(
                result.error ||
                  `Hindi makuha ang tracking data ng ${order.booking_no}.`
              );
            }

            if (!result.rider_location) {
              return null;
            }

            const reviewRider = reviewsRef.current.find(
              (review) =>
                review.rider_id === result.order?.assigned_rider &&
                review.rider_name
            );

            return {
              orderId: order.id,
              bookingNo:
                result.order.booking_no ||
                order.booking_no ||
                `Order #${order.id}`,
              status:
                result.order.status || order.status || "Accepted",
              riderId: result.order.assigned_rider,
              riderName: reviewRider?.rider_name || "Ronel Andal",
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
          })
        );

        const successfulRiders = results.flatMap((result) =>
          result.status === "fulfilled" && result.value
            ? [result.value]
            : []
        );

        setLiveRiders(successfulRiders);
        setLiveMapUpdatedAt(new Date());

        const failedCount = results.filter(
          (result) => result.status === "rejected"
        ).length;

        if (failedCount > 0 && successfulRiders.length === 0) {
          setLiveMapError(
            "Hindi makuha ang live rider locations sa ngayon."
          );
        }
      } catch (error) {
        setLiveMapError(
          error instanceof Error
            ? error.message
            : "May error habang kinukuha ang live rider locations."
        );
      } finally {
        setLiveMapLoading(false);
      }
    },
    []
  );

  const loadReviews = useCallback(async () => {
    setReviewsLoading(true);
    setReviewsError("");

    try {
      const response = await fetch("/api/reviews", {
        method: "GET",
        cache: "no-store",
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Hindi makuha ang customer reviews.");
      }

      const fetchedReviews: DeliveryReview[] = Array.isArray(result.reviews)
        ? result.reviews
        : [];
      reviewsRef.current = fetchedReviews;
      setReviews(fetchedReviews);
    } catch (error) {
      setReviewsError(
        error instanceof Error
          ? error.message
          : "May error habang kinukuha ang reviews."
      );
    } finally {
      setReviewsLoading(false);
    }
  }, []);

  const loadOrders = useCallback(
    async (showLoading = true) => {
      if (showLoading) {
        setIsLoading(true);
      } else {
        setIsAutoRefreshing(true);
      }

      setErrorMessage("");

      try {
        const response = await fetch("/api/bookings", {
          method: "GET",
          cache: "no-store",
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || "Hindi makuha ang orders.");
        }

        const fetchedOrders: Order[] = Array.isArray(result.data)
          ? result.data
          : [];

        if (!initialLoadRef.current) {
          const newOrders = fetchedOrders.filter(
            (order) => !knownOrderIdsRef.current.has(order.id)
          );

          if (newOrders.length > 0) {
            const newestOrder = newOrders[0];

            setNewBookingAlert({
              bookingNo:
                newestOrder.booking_no || `Order #${newestOrder.id}`,
              senderName:
                newestOrder.sender_name || "Bagong customer",
            });

            playNotificationSound();

            if (notificationTimerRef.current) {
              window.clearTimeout(notificationTimerRef.current);
            }

            notificationTimerRef.current = window.setTimeout(() => {
              setNewBookingAlert(null);
            }, 8000);
          }
        }

        knownOrderIdsRef.current = new Set(
          fetchedOrders.map((order) => order.id)
        );
        initialLoadRef.current = false;

        ordersRef.current = fetchedOrders;
        setOrders(fetchedOrders);
        setLastUpdated(new Date());
        void loadLiveRiders(fetchedOrders);
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "May error habang kinukuha ang orders."
        );
      } finally {
        setIsLoading(false);
        setIsAutoRefreshing(false);
      }
    },
    [loadLiveRiders, playNotificationSound]
  );

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    loadOrders(true);
    loadReviews();

    // Realtime is the primary update mechanism.
    const channel = supabase
      ?.channel("admin-orders-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
        },
        () => {
          loadOrders(false);
        }
      )
      .subscribe();

    // Slow fallback in case the realtime connection is temporarily interrupted.
    const fallbackIntervalId = window.setInterval(() => {
      loadOrders(false);
      loadReviews();
    }, 60000);

    return () => {
      window.clearInterval(fallbackIntervalId);

      if (channel && supabase) {
        supabase.removeChannel(channel);
      }

      if (notificationTimerRef.current) {
        window.clearTimeout(notificationTimerRef.current);
      }
    };
  }, [loadOrders, loadReviews, supabase]);

  useEffect(() => {
  if (!supabase) return;

  void loadActivityLogs();

  const activityChannel = supabase
    .channel("admin-activity-logs-realtime")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "activity_logs",
      },
      (payload) => {
        const newActivity = payload.new as ActivityLog;

        setActivityLogs((current) =>
          [
            newActivity,
            ...current.filter((item) => item.id !== newActivity.id),
          ].slice(0, 30),
        );

        setUnreadActivityCount((current) => current + 1);

        if (soundEnabled) {
          playNotificationSound();
        }
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(activityChannel);
  };
}, [
  loadActivityLogs,
  playNotificationSound,
  soundEnabled,
  supabase,
]);


  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  useEffect(() => {
    reviewsRef.current = reviews;
  }, [reviews]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void loadLiveRiders();
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [loadLiveRiders]);

  useEffect(() => {
  const handleScroll = () => {
    const scrollPosition =
      window.scrollY ||
      document.documentElement.scrollTop ||
      document.body.scrollTop;

    setShowBackToTop(scrollPosition > 200);
  };

  handleScroll();

  window.addEventListener("scroll", handleScroll, { passive: true });
  document.addEventListener("scroll", handleScroll, { passive: true });

  return () => {
    window.removeEventListener("scroll", handleScroll);
    document.removeEventListener("scroll", handleScroll);
  };
}, []);

useEffect(() => {
  if (!selectedProof) return;

  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";

  function handleEscape(event: KeyboardEvent) {
    if (event.key === "Escape") {
      setSelectedProof(null);
    }
  }

  window.addEventListener("keydown", handleEscape);

  return () => {
    document.body.style.overflow = previousOverflow;
    window.removeEventListener("keydown", handleEscape);
  };
}, [selectedProof]);

  async function updateStatus(orderId: number, newStatus: string) {
    setUpdatingId(orderId);
    setErrorMessage("");

    try {
      const response = await fetch("/api/bookings/status", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: orderId,
          status: newStatus,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Hindi na-update ang order.");
      }

      setOrders((currentOrders) =>
        currentOrders.map((order) =>
          order.id === orderId
            ? {
                ...order,
                status: newStatus,
              }
            : order
        )
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "May error habang ina-update ang order."
      );
    } finally {
      setUpdatingId(null);
    }
  }

  useEffect(() => {
    void loadRiderSummaries();
    const channel = supabase
      .channel("dashboard-rider-summary-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "rider_profiles" }, () => {
        void loadRiderSummaries();
      })
      .subscribe();
    const intervalId = window.setInterval(() => void loadRiderSummaries(), 15000);
    return () => {
      window.clearInterval(intervalId);
      void supabase.removeChannel(channel);
    };
  }, [loadRiderSummaries, supabase]);

  const stats = useMemo(() => {
    const totalOrders = orders.length;

    const pendingOrders = orders.filter(
      (order) => (order.status || "Pending") === "Pending"
    ).length;

    const activeOrders = orders.filter((order) =>
      [
        "Accepted",
        "Heading to Pickup",
        "Picked Up",
        "In Transit",
        "Delivered",
      ].includes(order.status || "")
    ).length;

    const completedOrders = orders.filter(
      (order) => order.status === "Completed"
    ).length;

    const totalEarnings = orders
      .filter((order) =>
        ["Delivered", "Completed"].includes(order.status || "")
      )
      .reduce((total, order) => total + Number(order.price || 0), 0);

    return {
      totalOrders,
      pendingOrders,
      activeOrders,
      completedOrders,
      totalEarnings,
    };
  }, [orders]);

  const operationsSnapshot = useMemo(() => {
    const online = riderSummaries.filter((r) => r.is_active && r.is_online);
    const busy = online.filter((r) => r.active_deliveries > 0);
    const available = online.filter((r) => r.active_deliveries === 0);
    const activeOrders = orders.filter((order) => ["Accepted", "Heading to Pickup", "Picked Up", "In Transit", "Delivered"].includes(order.status || ""));
    const recentNotifications = activityLogs.slice(0, 5);
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (6 - index));
      const next = new Date(date);
      next.setDate(next.getDate() + 1);
      const revenue = orders
        .filter((order) => {
          const created = order.created_at ? new Date(order.created_at) : null;
          return created && created >= date && created < next && ["Delivered", "Completed"].includes(order.status || "");
        })
        .reduce((sum, order) => sum + Number(order.price || 0), 0);
      return { label: date.toLocaleDateString("en-PH", { weekday: "short" }), revenue };
    });
    const maxRevenue = Math.max(1, ...days.map((day) => day.revenue));
    return { online, busy, available, activeOrders, recentNotifications, days, maxRevenue };
  }, [activityLogs, orders, riderSummaries]);

  const reviewAnalytics = useMemo(() => {
    const totalReviews = reviews.length;
    const totalRating = reviews.reduce(
      (total, review) => total + review.rating,
      0
    );
    const averageRating =
      totalReviews > 0 ? totalRating / totalReviews : 0;
    const satisfactionPercent =
      totalReviews > 0
        ? Math.round(
            (reviews.filter((review) => review.rating >= 4).length /
              totalReviews) *
              100
          )
        : 0;

    const distribution: Record<number, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };

    reviews.forEach((review) => {
      distribution[review.rating] =
        (distribution[review.rating] || 0) + 1;
    });

    return {
      totalReviews,
      averageRating,
      satisfactionPercent,
      distribution,
    };
  }, [reviews]);

  const recentReviews = useMemo(
    () =>
      [...reviews]
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime()
        )
        .slice(0, 6),
    [reviews]
  );

  const reviewsByOrderId = useMemo(
    () =>
      new Map<number, DeliveryReview>(
        reviews.map((review) => [review.order_id, review])
      ),
    [reviews]
  );

  const riderLeaderboard = useMemo(() => {
    const grouped = new Map<
      string,
      {
        riderId: string;
        riderName: string;
        total: number;
        count: number;
      }
    >();

    reviews.forEach((review) => {
      if (!review.rider_id) return;

      const current = grouped.get(review.rider_id) || {
        riderId: review.rider_id,
        riderName: review.rider_name || "Unnamed rider",
        total: 0,
        count: 0,
      };

      current.total += review.rating;
      current.count += 1;
      grouped.set(review.rider_id, current);
    });

    return Array.from(grouped.values())
      .map((rider) => ({
        ...rider,
        average: rider.total / rider.count,
      }))
      .sort((a, b) => b.average - a.average)
      .slice(0, 5);
  }, [reviews]);

  const selectedLiveRider = useMemo(
    () =>
      liveRiders.find(
        (rider) => rider.bookingNo === selectedLiveBooking
      ) ||
      liveRiders[0] ||
      null,
    [liveRiders, selectedLiveBooking]
  );

  const operationsAnalytics = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const startDate = new Date(today);
    startDate.setDate(today.getDate() - (analyticsRange - 1));
    startDate.setHours(0, 0, 0, 0);

    const dateKey = (value: Date) =>
      `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(value.getDate()).padStart(2, "0")}`;

    const dayMap = new Map<
      string,
      {
        key: string;
        label: string;
        orders: number;
        completed: number;
        earnings: number;
        reviews: number;
        ratingTotal: number;
      }
    >();

    for (let index = 0; index < analyticsRange; index += 1) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + index);

      dayMap.set(dateKey(date), {
        key: dateKey(date),
        label: date.toLocaleDateString("en-PH", {
          month: "short",
          day: "numeric",
        }),
        orders: 0,
        completed: 0,
        earnings: 0,
        reviews: 0,
        ratingTotal: 0,
      });
    }

    const rangeOrders = orders.filter((order) => {
      if (!order.created_at) return false;
      const createdAt = new Date(order.created_at);
      return (
        !Number.isNaN(createdAt.getTime()) &&
        createdAt >= startDate &&
        createdAt <= today
      );
    });

    rangeOrders.forEach((order) => {
      if (!order.created_at) return;
      const createdAt = new Date(order.created_at);
      const day = dayMap.get(dateKey(createdAt));

      if (!day) return;

      day.orders += 1;

      if (order.status === "Completed") {
        day.completed += 1;
      }

      if (["Delivered", "Completed"].includes(order.status || "")) {
        day.earnings += Number(order.price || 0);
      }
    });

    const rangeReviews = reviews.filter((review) => {
      const createdAt = new Date(review.created_at);
      return (
        !Number.isNaN(createdAt.getTime()) &&
        createdAt >= startDate &&
        createdAt <= today
      );
    });

    rangeReviews.forEach((review) => {
      const createdAt = new Date(review.created_at);
      const day = dayMap.get(dateKey(createdAt));

      if (!day) return;

      day.reviews += 1;
      day.ratingTotal += review.rating;
    });

    const daily = Array.from(dayMap.values()).map((day) => ({
      ...day,
      averageRating:
        day.reviews > 0 ? day.ratingTotal / day.reviews : 0,
    }));

    const totalOrders = rangeOrders.length;
    const completedOrders = rangeOrders.filter(
      (order) => order.status === "Completed"
    ).length;
    const cancelledOrders = rangeOrders.filter(
      (order) => order.status === "Cancelled"
    ).length;
    const totalEarnings = rangeOrders
      .filter((order) =>
        ["Delivered", "Completed"].includes(order.status || "")
      )
      .reduce((total, order) => total + Number(order.price || 0), 0);

    const statusDistribution = statuses.map((status) => {
      const count = rangeOrders.filter(
        (order) => (order.status || "Pending") === status
      ).length;

      return {
        status,
        count,
        percent:
          totalOrders > 0 ? Math.round((count / totalOrders) * 100) : 0,
      };
    });

    const maxDailyOrders = Math.max(
      1,
      ...daily.map((day) => day.orders)
    );
    const maxDailyEarnings = Math.max(
      1,
      ...daily.map((day) => day.earnings)
    );

    const lineWidth = 600;
    const lineHeight = 180;
    const horizontalPadding = 18;
    const verticalPadding = 18;
    const usableWidth = lineWidth - horizontalPadding * 2;
    const usableHeight = lineHeight - verticalPadding * 2;

    const ratingPoints = daily
      .map((day, index) => {
        const x =
          daily.length === 1
            ? lineWidth / 2
            : horizontalPadding +
              (index / (daily.length - 1)) * usableWidth;
        const value = day.averageRating;
        const y =
          verticalPadding +
          ((5 - value) / 5) * usableHeight;

        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");

    const bestDay = [...daily].sort(
      (a, b) => b.completed - a.completed
    )[0];

    return {
      daily,
      totalOrders,
      completedOrders,
      cancelledOrders,
      totalEarnings,
      completionRate:
        totalOrders > 0
          ? Math.round((completedOrders / totalOrders) * 100)
          : 0,
      reviewRate:
        completedOrders > 0
          ? Math.min(
              100,
              Math.round((rangeReviews.length / completedOrders) * 100)
            )
          : 0,
      averageOrderValue:
        completedOrders > 0 ? totalEarnings / completedOrders : 0,
      averageDailyOrders: totalOrders / analyticsRange,
      statusDistribution,
      maxDailyOrders,
      maxDailyEarnings,
      ratingPoints,
      lineWidth,
      lineHeight,
      bestDay,
      rangeReviews,
    };
  }, [analyticsRange, orders, reviews]);

  const filteredOrders = useMemo(() => {
    const normalizedSearch = searchTerm.toLowerCase().trim();

    return orders.filter((order) => {
      const matchesStatus =
        filterStatus === "All" ||
        (order.status || "Pending") === filterStatus;

      const searchableText = [
        order.booking_no,
        order.sender_name,
        order.sender_phone,
        order.receiver_name,
        order.receiver_phone,
        order.pickup_address,
        order.dropoff_address,
        order.package_type,
        order.payment_method,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        !normalizedSearch || searchableText.includes(normalizedSearch);

      return matchesStatus && matchesSearch;
    });
  }, [orders, filterStatus, searchTerm]);

  const totalOrderPages = Math.max(1, Math.ceil(filteredOrders.length / ordersPerPage));
  const paginatedOrders = filteredOrders.slice(
    (orderPage - 1) * ordersPerPage,
    orderPage * ordersPerPage
  );

  useEffect(() => {
    setOrderPage(1);
  }, [filterStatus, searchTerm]);

  useEffect(() => {
    if (orderPage > totalOrderPages) setOrderPage(totalOrderPages);
  }, [orderPage, totalOrderPages]);

  const hasActiveFilters =
    filterStatus !== "All" || searchTerm.trim().length > 0;

  function clearFilters() {
    setSearchTerm("");
    setFilterStatus("All");
  }

  if (!isMounted) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
          <p className="mt-4 font-extrabold text-blue-950">
            Loading dashboard...
          </p>
        </div>
      </main>
    );
  }

  const sidebarItems: Array<{ view: AdminView; label: string; icon: string; count?: number }> = [
    { view: "dashboard", label: "Dashboard", icon: "⌂" },
    { view: "dispatch", label: "Live Dispatch", icon: "⚡", count: stats.pendingOrders + stats.activeOrders },
    { view: "orders", label: "Orders", icon: "▣", count: stats.totalOrders },
    { view: "payments", label: "Payments", icon: "₱" },
    { view: "operations", label: "Operations", icon: "⚙" },
    { view: "map", label: "Rider Map", icon: "◎", count: liveRiders.length },
    { view: "reviews", label: "Reviews", icon: "★", count: reviews.length },
    { view: "analytics", label: "Analytics", icon: "↗" },
  ];

  const viewTitles: Record<AdminView, { eyebrow: string; title: string; description: string }> = {
    dashboard: { eyebrow: "Command center", title: "Good day, Admin", description: "Here is what is happening across Barangay Express today." },
    dispatch: { eyebrow: "Live operations", title: "Dispatch Center", description: "Watch pending orders, active trips, riders, and alerts in one real-time workspace." },
    orders: { eyebrow: "Order management", title: "Delivery Orders", description: "Search, filter, and manage every booking from one workspace." },
    payments: { eyebrow: "Finance", title: "Payment Center", description: "Review payment activity and delivery collections." },
    operations: { eyebrow: "Operations", title: "Operations Center", description: "Control service availability and day-to-day operations." },
    map: { eyebrow: "Live dispatch", title: "Rider Map", description: "Monitor active riders, pickups, and drop-offs in real time." },
    reviews: { eyebrow: "Customer voice", title: "Reviews", description: "Track customer satisfaction and rider feedback." },
    analytics: { eyebrow: "Performance", title: "Analytics", description: "Understand volume, earnings, completion, and ratings." },
  };

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-900">
      {sidebarOpen && (
        <button type="button" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-[140] bg-slate-950/40 backdrop-blur-sm lg:hidden" />
      )}

      <aside className={`fixed inset-y-0 left-0 z-[150] flex w-64 flex-col border-r border-white/10 bg-gradient-to-b from-[#071a3a] via-[#0b2c63] to-[#0b3f89] text-white shadow-2xl transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/12 text-2xl shadow-inner">🏍️</div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-sky-300">Barangay Express</p>
            <p className="mt-1 text-lg font-black">Admin Portal</p>
          </div>
          <button type="button" onClick={() => setSidebarOpen(false)} className="ml-auto grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-xl lg:hidden">×</button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          <p className="mb-3 px-3 text-[10px] font-black uppercase tracking-[0.22em] text-blue-300">Workspace</p>
          {sidebarItems.map((item) => (
            <button key={item.view} type="button" onClick={() => { if (item.view === "dispatch") { window.location.href = "/dashboard/live-dispatch"; return; } setActiveAdminView(item.view); setSidebarOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); }} className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-extrabold transition ${activeAdminView === item.view ? "bg-white text-blue-950 shadow-xl shadow-blue-950/20" : "text-blue-100 hover:bg-white/10 hover:text-white"}`}>
              <span className={`grid h-8 w-8 place-items-center rounded-lg text-sm ${activeAdminView === item.view ? "bg-blue-50 text-blue-700" : "bg-white/10"}`}>{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {typeof item.count === "number" && <span className={`rounded-full px-2 py-0.5 text-[11px] ${activeAdminView === item.view ? "bg-blue-100 text-blue-700" : "bg-white/10 text-blue-100"}`}>{item.count}</span>}
            </button>
          ))}

          <p className="mb-3 mt-7 px-3 text-[10px] font-black uppercase tracking-[0.22em] text-blue-300">Management</p>
          <Link href="/dashboard/riders" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-extrabold text-blue-100 transition hover:bg-white/10 hover:text-white"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10">♟</span>Riders</Link>
          <Link href="/dashboard/rider-applications" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-extrabold text-blue-100 transition hover:bg-white/10 hover:text-white"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10">✓</span>Applications</Link>
          <Link href="/dashboard/rider-wallets" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-extrabold text-blue-100 transition hover:bg-white/10 hover:text-white"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10">₱</span>Rider Wallets</Link>
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className="rounded-xl bg-white/10 p-3">
            <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-full bg-sky-400 font-black text-blue-950">A</div><div><p className="text-sm font-black">Administrator</p><p className="text-xs text-blue-200">Secure session</p></div></div>
            <div className="mt-3"><LogoutButton /></div>
          </div>
        </div>
      </aside>

      <div className="min-h-screen lg:pl-64">
        <header className="sticky top-0 z-[110] flex h-16 items-center gap-2.5 border-b border-slate-200/80 bg-white/90 px-4 shadow-sm backdrop-blur-xl md:px-7">
          <button type="button" onClick={() => setSidebarOpen(true)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-xl shadow-sm lg:hidden">☰</button>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">{viewTitles[activeAdminView].eyebrow}</p>
            <h1 className="truncate text-xl font-black text-slate-950 md:text-2xl">{viewTitles[activeAdminView].title}</h1>
          </div>
          <div className="hidden max-w-md flex-1 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 md:flex">
            <span className="mr-2 text-slate-400">⌕</span><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search booking, customer, address..." className="w-full bg-transparent text-sm font-semibold outline-none" />
          </div>
          <button type="button" onClick={refreshDashboardData} disabled={isAutoRefreshing} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white shadow-sm transition hover:bg-blue-50 disabled:opacity-50"><span className={isAutoRefreshing ? "animate-spin" : ""}>↻</span></button>
          <div className="relative">
            <button type="button" onClick={() => { setNotificationPanelOpen((current) => !current); setUnreadActivityCount(0); }} className="relative grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white shadow-sm">♢{unreadActivityCount > 0 && <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-black text-white">{unreadActivityCount > 9 ? "9+" : unreadActivityCount}</span>}</button>
          </div>
          <Link href="/book" className="hidden rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-blue-200 transition hover:bg-blue-800 sm:inline-flex">+ New Booking</Link>
        </header>

        {/* Legacy header kept hidden for compatibility */}
      {/* Header */}
      <header className="hidden">
        <div className="absolute -left-20 top-0 h-64 w-64 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="absolute -right-20 bottom-0 h-72 w-72 rounded-full bg-blue-300/20 blur-3xl" />

        <div className="relative mx-auto flex max-w-7xl flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-bold text-blue-100 transition hover:text-white"
            >
              ← Barangay Express Homepage
            </Link>

            <div className="mt-5 flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-3xl shadow-lg backdrop-blur">
                🏍️
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-300">
                  Barangay Express
                </p>

                <h1 className="mt-1 text-3xl font-extrabold md:text-4xl">
                  Admin Dashboard
                </h1>
              </div>
            </div>

            <p className="mt-4 max-w-2xl leading-7 text-blue-100">
              Tingnan, hanapin, at i-manage ang lahat ng delivery bookings mula
              pickup hanggang completion.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <NotificationBell defaultHref="/dashboard" dark />
            <a
              href="/book"
              className="rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 font-bold text-white backdrop-blur transition hover:bg-white/20"
            >
              + New Booking
            </a>
            <a
              href="/dashboard/riders"
              className="rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 font-bold text-white backdrop-blur transition hover:bg-white/20"
            >
              🏍️ Manage Riders
            </a>
            <a
              href="/dashboard/rider-wallets"
              className="rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 font-bold text-white backdrop-blur transition hover:bg-white/20"
            >
              💳 Rider Wallets
            </a>

            <button
              type="button"
              onClick={() => {
                loadOrders(true);
                loadReviews();
              }}
              disabled={isLoading}
              className="rounded-xl bg-white px-4 py-2.5 font-extrabold text-blue-800 shadow-lg transition hover:-translate-y-0.5 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading
                ? "Refreshing..."
                : isAutoRefreshing
                  ? "Checking..."
                  : "↻ Refresh Orders"}
            </button>

            <button
              type="button"
              onClick={enableSoundAlerts}
              disabled={soundEnabled}
              className="rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 font-bold text-white backdrop-blur transition hover:bg-white/20 disabled:cursor-default disabled:bg-emerald-500/30"
            >
              {soundEnabled ? "🔔 Sound Enabled" : "🔕 Enable Sound Alerts"}
            </button>

            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1680px] px-4 py-4 md:px-6 md:py-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-100 bg-white px-5 py-3 shadow-sm">
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                isAutoRefreshing
                  ? "animate-pulse bg-amber-500"
                  : "bg-emerald-500"
              }`}
            />

            <p className="text-sm font-bold text-slate-600">
              {isAutoRefreshing
                ? "Checking for new bookings..."
                : "Live dashboard active"}
            </p>
          </div>

          <div className="flex items-center gap-4">
  <div className="relative">
  <button
    type="button"
    onClick={() => {
      setNotificationPanelOpen((current) => !current);
      setUnreadActivityCount(0);
    }}
    aria-label="Open admin activity log"
    title="Activity Log"
    className="relative flex h-11 items-center justify-center gap-2 rounded-2xl border border-blue-100 bg-white px-4 text-sm font-extrabold text-blue-950 shadow-lg transition hover:bg-blue-50"
  >
    <span aria-hidden="true">📋</span>
    <span>Activity Log</span>

    {unreadActivityCount > 0 && (
      <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-extrabold text-white">
        {unreadActivityCount > 99 ? "99+" : unreadActivityCount}
      </span>
    )}
  </button>

  {notificationPanelOpen && (
    <div className="absolute right-0 top-14 z-[160] w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-500">
            Activity Center
          </p>

          <h3 className="mt-1 text-lg font-extrabold text-blue-950">
            Activity Log
          </h3>
        </div>

        <button
          type="button"
          onClick={() => setNotificationPanelOpen(false)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 font-bold text-slate-500 hover:bg-slate-200"
          aria-label="Close activity log"
        >
          ×
        </button>
      </div>

      <div className="max-h-[28rem] overflow-y-auto">
        {activityLoading ? (
          <div className="p-6 text-center text-sm font-semibold text-slate-500">
            Loading activity log...
          </div>
        ) : activityError ? (
          <div className="m-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            {activityError}
          </div>
        ) : activityLogs.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-3xl">🔕</div>

            <p className="mt-3 font-extrabold text-slate-700">
              Wala pang activity
            </p>
          </div>
        ) : (
          activityLogs.map((activity) => (
            <div
              key={activity.id}
              className="border-b border-slate-100 px-5 py-4 last:border-b-0 hover:bg-slate-50"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-lg">
                  {activity.actor_type === "rider"
                    ? "🏍️"
                    : activity.actor_type === "customer"
                      ? "👤"
                      : "🛡️"}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-extrabold text-slate-800">
                      {activity.action}
                    </p>

                    <span className="shrink-0 text-[11px] font-semibold text-slate-400">
                      {new Date(activity.created_at).toLocaleTimeString(
                        "en-PH",
                        {
                          hour: "numeric",
                          minute: "2-digit",
                        },
                      )}
                    </span>
                  </div>

                  {activity.booking_no && (
                    <p className="mt-1 break-all text-xs font-extrabold text-blue-600">
                      {activity.booking_no}
                    </p>
                  )}

                  {activity.details && (
                    <p className="mt-2 text-sm font-medium leading-5 text-slate-600">
                      {activity.details}
                    </p>
                  )}

                  <p className="mt-2 text-xs font-semibold text-slate-400">
                    {activity.actor}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-center">
        <button
          type="button"
          onClick={() => setUnreadActivityCount(0)}
          className="text-sm font-extrabold text-blue-700 hover:text-blue-900"
        >
          Mark all as read
        </button>
      </div>
    </div>
  )}
</div>

  <p className="text-xs font-semibold text-slate-400">
    Last updated:{" "}
    {lastUpdated
      ? lastUpdated.toLocaleTimeString("en-PH", {
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
        })
      : "Waiting..."}
  </p>
</div>
        </div>
<section id="dispatch-center-section" className={activeAdminView === "dispatch" ? "space-y-4" : "hidden"}>
  <div className="flex flex-col gap-3 rounded-[1.5rem] bg-gradient-to-r from-slate-950 via-blue-950 to-blue-700 p-5 text-white shadow-xl md:flex-row md:items-center md:justify-between">
    <div>
      <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" /><p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Live operations</p></div>
      <h2 className="mt-2 text-2xl font-black">Barangay Express Dispatch Center</h2>
      <p className="mt-1 text-sm font-semibold text-blue-100">Stable first-win dispatch is active. Every eligible online rider can see pending bookings.</p>
    </div>
    <div className="flex flex-wrap gap-2">
      <Link href="/book" className="rounded-xl bg-white px-4 py-2.5 text-sm font-black text-blue-900">+ New booking</Link>
      <button type="button" onClick={refreshDashboardData} className="rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-black text-white">Refresh live data</button>
    </div>
  </div>

  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
    {[
      { label: "Waiting", value: stats.pendingOrders, note: "Visible to available riders", tone: "bg-amber-50 text-amber-700" },
      { label: "Moving now", value: stats.activeOrders, note: "Accepted to delivered", tone: "bg-sky-50 text-sky-700" },
      { label: "Online riders", value: operationsSnapshot.online.length, note: `${operationsSnapshot.available.length} ready`, tone: "bg-emerald-50 text-emerald-700" },
      { label: "Busy riders", value: operationsSnapshot.busy.length, note: "Handling a delivery", tone: "bg-violet-50 text-violet-700" },
      { label: "GPS live", value: liveRiders.length, note: "Sharing current location", tone: "bg-blue-50 text-blue-700" },
    ].map((item) => <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">{item.label}</p><span className={`h-2.5 w-2.5 rounded-full ${item.tone.split(" ")[0].replace("50", "500")}`} /></div><p className="mt-2 text-3xl font-black text-slate-950">{item.value}</p><p className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-black ${item.tone}`}>{item.note}</p></div>)}
  </div>

  <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,.65fr)]">
    <div className="space-y-4">
      <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-amber-600">Dispatch queue</p><h3 className="mt-1 text-xl font-black text-slate-950">Bookings waiting for a rider</h3></div><button type="button" onClick={() => setActiveAdminView("orders")} className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-700">Manage all orders →</button></div>
        <div className="mt-4 space-y-2">
          {orders.filter((order) => (order.status || "Pending") === "Pending").slice(0, 8).map((order) => {
            const ageMinutes = order.created_at ? Math.max(0, Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000)) : 0;
            return <button key={order.id} type="button" onClick={() => { setSearchTerm(order.booking_no || String(order.id)); setActiveAdminView("orders"); }} className={`grid w-full gap-3 rounded-xl border p-3 text-left transition hover:bg-slate-50 md:grid-cols-[1fr_auto_auto] md:items-center ${ageMinutes >= 5 ? "border-red-200 bg-red-50/60" : ageMinutes >= 2 ? "border-amber-200 bg-amber-50/50" : "border-slate-100"}`}><div className="min-w-0"><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${ageMinutes >= 5 ? "animate-pulse bg-red-500" : "bg-amber-500"}`} /><p className="truncate text-sm font-black text-slate-900">{order.booking_no || `Order #${order.id}`}</p></div><p className="mt-1 truncate text-xs font-semibold text-slate-500">{order.pickup_address || "Pickup not set"} → {order.dropoff_address || "Drop-off not set"}</p></div><span className={`rounded-full px-3 py-1 text-[10px] font-black ${ageMinutes >= 5 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{ageMinutes} min waiting</span><span className="text-sm font-black text-slate-900">{formatCurrency(Number(order.price || 0))}</span></button>;
          })}
          {orders.filter((order) => (order.status || "Pending") === "Pending").length === 0 && <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/50 p-8 text-center"><p className="text-3xl">✅</p><p className="mt-2 font-black text-emerald-800">No unassigned bookings</p><p className="mt-1 text-sm font-semibold text-emerald-700">The queue is clear.</p></div>}
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-blue-600">Active trips</p><h3 className="mt-1 text-xl font-black text-slate-950">Deliveries moving now</h3></div><button type="button" onClick={() => setActiveAdminView("map")} className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">Open full map →</button></div>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {operationsSnapshot.activeOrders.slice(0, 8).map((order) => <button key={order.id} type="button" onClick={() => { setSearchTerm(order.booking_no || String(order.id)); setActiveAdminView("orders"); }} className="rounded-xl border border-slate-100 p-3 text-left transition hover:border-blue-200 hover:bg-blue-50/40"><div className="flex items-center justify-between gap-3"><p className="truncate text-sm font-black text-slate-900">{order.booking_no || `Order #${order.id}`}</p><span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black ${getStatusClass(order.status)}`}>{order.status}</span></div><p className="mt-2 truncate text-xs font-semibold text-slate-500">{order.pickup_address || "Pickup"} → {order.dropoff_address || "Drop-off"}</p><div className="mt-3 flex items-center justify-between"><span className="text-xs font-black text-blue-700">View delivery →</span><span className="font-black text-slate-900">{formatCurrency(Number(order.price || 0))}</span></div></button>)}
          {operationsSnapshot.activeOrders.length === 0 && <div className="col-span-full rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm font-bold text-slate-500">No active deliveries right now.</div>}
        </div>
      </section>
    </div>

    <aside className="space-y-4">
      <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-600">Fleet status</p><h3 className="mt-1 text-xl font-black text-slate-950">Riders now</h3></div><Link href="/dashboard/riders" className="text-xs font-black text-blue-700">Manage →</Link></div>
        <div className="mt-4 space-y-2">{riderSummaries.map((rider) => <div key={rider.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3"><span className={`h-3 w-3 rounded-full ${rider.is_active && rider.is_online ? rider.active_deliveries ? "bg-amber-500" : "bg-emerald-500" : "bg-slate-300"}`} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-slate-900">{rider.full_name}</p><p className="truncate text-xs font-semibold text-slate-500">{rider.vehicle_type || "Vehicle not set"}{rider.plate_number ? ` • ${rider.plate_number}` : ""}</p></div><span className="text-[10px] font-black uppercase text-slate-500">{!rider.is_active ? "Inactive" : rider.is_online ? rider.active_deliveries ? "Delivering" : "Available" : "Offline"}</span></div>)}</div>
      </section>

      <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-blue-600">Live events</p><h3 className="mt-1 text-xl font-black text-slate-950">Operations feed</h3></div><button type="button" onClick={() => setNotificationPanelOpen(true)} className="text-xs font-black text-blue-700">Open all →</button></div>
        <div className="mt-4 space-y-2">{activityLogs.slice(0, 8).map((item) => <div key={item.id} className="flex items-start gap-3 rounded-xl border border-slate-100 p-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50">{item.actor_type === "rider" ? "🏍️" : item.actor_type === "customer" ? "👤" : "🛡️"}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-slate-800">{item.action}</p><p className="mt-1 truncate text-xs font-semibold text-slate-500">{item.booking_no || item.details || item.actor}</p></div><span className="shrink-0 text-[10px] font-bold text-slate-400">{new Date(item.created_at).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}</span></div>)}{activityLogs.length === 0 && <p className="py-8 text-center text-sm font-bold text-slate-500">No live events yet.</p>}</div>
      </section>
    </aside>
  </div>
</section>

<section id="dashboard-section" className={activeAdminView === "dashboard" ? "space-y-4" : "hidden"}>
  <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,.45fr)]">
    <div className="space-y-4">
      <div className="overflow-hidden rounded-[1.35rem] bg-gradient-to-br from-blue-950 via-blue-800 to-sky-600 px-5 py-4 text-white shadow-xl shadow-blue-200/50">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-sky-300">Control room</p>
            <h2 className="mt-1 text-2xl font-black">Everything under control.</h2>
            <p className="mt-1 max-w-2xl text-sm font-semibold text-blue-100">Live bookings, fleet availability, payments, and customer activity in one view.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setActiveAdminView("dispatch")} className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-black text-emerald-950 shadow-md transition hover:bg-emerald-300">Open dispatch</button>
            <Link href="/book" className="rounded-xl bg-white px-4 py-2 text-sm font-black text-blue-800 shadow-md transition hover:bg-blue-50">+ New booking</Link>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Orders", value: stats.totalOrders, note: "All bookings", icon: "▣", tone: "text-blue-700 bg-blue-50", view: "orders" as AdminView },
          { label: "Pending", value: stats.pendingOrders, note: "Need rider", icon: "◷", tone: "text-amber-700 bg-amber-50", view: "orders" as AdminView },
          { label: "Active", value: stats.activeOrders, note: "Moving now", icon: "➜", tone: "text-sky-700 bg-sky-50", view: "map" as AdminView },
          { label: "Riders", value: operationsSnapshot.online.length, note: `${operationsSnapshot.available.length} available`, icon: "●", tone: "text-emerald-700 bg-emerald-50", view: "map" as AdminView },
          { label: "Revenue", value: formatCurrency(stats.totalEarnings), note: "Completed", icon: "₱", tone: "text-violet-700 bg-violet-50", view: "payments" as AdminView },
        ].map((card) => (
          <button key={card.label} type="button" onClick={() => setActiveAdminView(card.view)} className="group rounded-2xl border border-slate-200 bg-white p-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{card.label}</p><p className="mt-1 text-2xl font-black text-slate-950">{card.value}</p></div>
              <span className={`grid h-9 w-9 place-items-center rounded-xl text-base font-black ${card.tone}`}>{card.icon}</span>
            </div>
            <p className="mt-2 text-[11px] font-bold text-slate-500">{card.note}<span className="float-right text-blue-600 transition group-hover:translate-x-1">→</span></p>
          </button>
        ))}
      </div>

      <section className="rounded-[1.35rem] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-[11px] font-black uppercase tracking-[0.16em] text-blue-600">Live dispatch</p><h3 className="mt-1 text-lg font-black text-slate-950">Orders moving now</h3></div>
          <button type="button" onClick={() => setActiveAdminView("dispatch")} className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">Open control room →</button>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {operationsSnapshot.activeOrders.slice(0, 6).map((order) => {
            const assignedRider = riderSummaries.find((rider) => String(rider.id) === String(order.assigned_rider));
            return (
              <button key={order.id} type="button" onClick={() => { setSearchTerm(order.booking_no || String(order.id)); setActiveAdminView("orders"); }} className="rounded-xl border border-slate-100 p-3 text-left transition hover:border-blue-200 hover:bg-blue-50/40">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${getStatusDotClass(order.status)}`} /><p className="truncate text-sm font-black text-slate-900">{order.booking_no || `Order #${order.id}`}</p></div><p className="mt-1 truncate text-xs font-semibold text-slate-500">{assignedRider?.full_name || "Assigned rider"}</p></div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black ${getStatusClass(order.status)}`}>{order.status || "Pending"}</span>
                </div>
                <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-3"><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-600">📍 {order.pickup_address || "Pickup not set"}</p><p className="mt-1 truncate text-xs font-bold text-slate-600">🏁 {order.dropoff_address || "Drop-off not set"}</p></div><span className="text-sm font-black text-slate-900">{formatCurrency(Number(order.price || 0))}</span></div>
              </button>
            );
          })}
          {operationsSnapshot.activeOrders.length === 0 && <div className="col-span-full rounded-2xl border border-dashed border-slate-200 p-7 text-center"><p className="text-3xl">🛵</p><p className="mt-2 font-black text-slate-800">No active deliveries</p><p className="mt-1 text-sm font-semibold text-slate-500">Accepted bookings will appear here automatically.</p></div>}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[.9fr_1.1fr]">
        <section className="rounded-[1.35rem] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between"><div><p className="text-[11px] font-black uppercase tracking-[0.16em] text-blue-600">7-day pulse</p><h3 className="mt-1 text-lg font-black text-slate-950">Revenue activity</h3></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{formatCurrency(operationsSnapshot.days.reduce((sum, day) => sum + day.revenue, 0))}</span></div>
          <div className="mt-3 flex h-32 items-end gap-2 rounded-xl bg-slate-50 p-3">{operationsSnapshot.days.map((day, index) => <div key={day.label} className="group flex flex-1 flex-col items-center justify-end gap-1.5"><span className="text-[9px] font-black text-slate-500 opacity-0 transition group-hover:opacity-100">{day.revenue ? formatCurrency(day.revenue) : "₱0"}</span><div title={`${day.label}: ${formatCurrency(day.revenue)}`} className={`w-full rounded-t-lg bg-gradient-to-t transition-all ${index === operationsSnapshot.days.length - 1 ? "from-emerald-600 to-emerald-300" : "from-blue-700 to-sky-400"}`} style={{ height: `${Math.max(7, (day.revenue / operationsSnapshot.maxRevenue) * 72)}px` }} /><span className="text-[9px] font-black uppercase text-slate-400">{day.label}</span></div>)}</div>
        </section>

        <section className="rounded-[1.35rem] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between"><div><p className="text-[11px] font-black uppercase tracking-[0.16em] text-blue-600">Activity timeline</p><h3 className="mt-1 text-lg font-black text-slate-950">Latest updates</h3></div><button type="button" onClick={() => setNotificationPanelOpen(true)} className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">Open all →</button></div>
          <div className="mt-3">{operationsSnapshot.recentNotifications.slice(0, 5).map((item, index) => <div key={item.id} className="relative flex gap-3 pb-3 last:pb-0"><div className="relative flex w-8 shrink-0 justify-center"><span className="z-10 grid h-8 w-8 place-items-center rounded-full bg-blue-50 text-sm ring-4 ring-white">{item.actor_type === "rider" ? "🏍️" : item.actor_type === "customer" ? "👤" : "🛡️"}</span>{index < Math.min(4, operationsSnapshot.recentNotifications.length - 1) && <span className="absolute bottom-[-4px] top-8 w-px bg-slate-200" />}</div><div className="min-w-0 flex-1 rounded-xl border border-slate-100 px-3 py-2"><div className="flex items-start justify-between gap-3"><p className="truncate text-sm font-black text-slate-800">{item.action}</p><span className="shrink-0 text-[10px] font-bold text-slate-400">{new Date(item.created_at).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}</span></div><p className="mt-1 truncate text-xs font-semibold text-slate-500">{item.booking_no || item.details || item.actor}</p></div></div>)}{operationsSnapshot.recentNotifications.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm font-bold text-slate-500">No recent activity yet.</div>}</div>
        </section>
      </div>
    </div>

    <aside className="space-y-4">
      <section className="rounded-[1.35rem] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between"><div><p className="text-[11px] font-black uppercase tracking-[0.16em] text-blue-600">Fleet status</p><h3 className="mt-1 text-lg font-black text-slate-950">Riders now</h3></div><Link href="/dashboard/riders" className="text-xs font-black text-blue-700">Manage →</Link></div>
        <div className="mt-3 grid grid-cols-3 gap-2"><div className="rounded-xl bg-emerald-50 p-2 text-center"><p className="text-xl font-black text-emerald-700">{operationsSnapshot.available.length}</p><p className="text-[9px] font-black uppercase text-emerald-700">Available</p></div><div className="rounded-xl bg-amber-50 p-2 text-center"><p className="text-xl font-black text-amber-700">{operationsSnapshot.busy.length}</p><p className="text-[9px] font-black uppercase text-amber-700">Delivering</p></div><div className="rounded-xl bg-slate-100 p-2 text-center"><p className="text-xl font-black text-slate-700">{riderSummaries.filter((r) => !r.is_online || !r.is_active).length}</p><p className="text-[9px] font-black uppercase text-slate-600">Offline</p></div></div>
        <div className="mt-3 space-y-1.5">{ridersLoading ? <p className="py-5 text-center text-sm font-bold text-slate-500">Loading riders...</p> : riderSummaries.slice(0, 6).map((rider) => <div key={rider.id} className="flex items-center gap-2.5 rounded-xl border border-slate-100 p-2.5"><span className={`h-3 w-3 rounded-full ${rider.is_active && rider.is_online ? rider.active_deliveries ? "bg-amber-500" : "bg-emerald-500" : "bg-slate-300"}`} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-slate-800">{rider.full_name}</p><p className="truncate text-[11px] font-semibold text-slate-500">{rider.vehicle_type || "Vehicle not set"}{rider.plate_number ? ` • ${rider.plate_number}` : ""}</p></div><span className="text-[9px] font-black uppercase text-slate-500">{!rider.is_active ? "Inactive" : rider.is_online ? rider.active_deliveries ? "Delivering" : "Available" : "Offline"}</span></div>)}</div>
      </section>

      <section className="overflow-hidden rounded-[1.35rem] border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-br from-slate-950 to-blue-900 p-4 text-white"><div className="flex items-center justify-between"><div><p className="text-[11px] font-black uppercase tracking-[0.16em] text-sky-300">Field monitor</p><h3 className="mt-1 text-lg font-black">Live GPS summary</h3></div><span className="rounded-full bg-emerald-400/20 px-2.5 py-1 text-[10px] font-black text-emerald-200">● LIVE</span></div></div>
        <div className="relative h-40 overflow-hidden bg-[radial-gradient(circle_at_25%_25%,#dbeafe_0,transparent_34%),radial-gradient(circle_at_75%_65%,#bfdbfe_0,transparent_30%),linear-gradient(135deg,#f8fafc,#e0f2fe)] p-5">
          <div className="absolute inset-0 opacity-35" style={{ backgroundImage: "linear-gradient(#94a3b8 1px, transparent 1px), linear-gradient(90deg, #94a3b8 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
          {liveRiders.slice(0, 5).map((rider, index) => <div key={`${rider.orderId}-${index}`} className="absolute grid h-9 w-9 place-items-center rounded-full border-4 border-white bg-blue-700 text-base shadow-xl" style={{ left: `${18 + ((index * 19) % 65)}%`, top: `${20 + ((index * 23) % 55)}%` }} title={`${rider.riderName} • ${rider.bookingNo}`}>🏍️</div>)}
          {liveRiders.length === 0 && <div className="relative z-10 grid h-full place-items-center text-center"><div><p className="text-3xl">🗺️</p><p className="mt-2 font-black text-slate-800">No live GPS yet</p><p className="mt-1 text-xs font-semibold text-slate-500">Markers appear when riders share location.</p></div></div>}
        </div>
        <div className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100"><div className="p-2.5 text-center"><p className="text-lg font-black text-slate-900">{liveRiders.length}</p><p className="text-[9px] font-black uppercase text-slate-400">GPS live</p></div><div className="p-2.5 text-center"><p className="text-lg font-black text-slate-900">{stats.activeOrders}</p><p className="text-[9px] font-black uppercase text-slate-400">Active</p></div><button type="button" onClick={() => setActiveAdminView("map")} className="p-2.5 text-center hover:bg-blue-50"><p className="text-lg font-black text-blue-700">→</p><p className="text-[9px] font-black uppercase text-blue-600">Open map</p></button></div>
      </section>

      <section className="rounded-[1.35rem] border border-slate-200 bg-white p-4 shadow-sm"><p className="text-[11px] font-black uppercase tracking-[0.16em] text-blue-600">Quick actions</p><h3 className="mt-1 text-lg font-black text-slate-950">Move faster</h3><div className="mt-3 grid gap-2"><Link href="/dashboard/riders" className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-black text-slate-800 hover:border-blue-200 hover:bg-blue-50"><span>Manage riders</span><span>→</span></Link><Link href="/dashboard/rider-applications" className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-black text-slate-800 hover:border-blue-200 hover:bg-blue-50"><span>Review applications</span><span>→</span></Link><Link href="/dashboard/rider-wallets" className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-black text-slate-800 hover:border-blue-200 hover:bg-blue-50"><span>Rider wallets</span><span>→</span></Link></div></section>
    </aside>
  </div>
</section>
{/* Statistics */}
<section className={activeAdminView === "dashboard" ? "hidden" : "grid gap-3 sm:grid-cols-2 xl:grid-cols-5"}>
  <button
    type="button"
    onClick={() => navigateFromStatCard("orders-section", "All")}
    className="group rounded-3xl border border-blue-100 bg-white p-5 text-left shadow-lg shadow-slate-200/60 transition duration-200 hover:-translate-y-1 hover:border-blue-300 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-blue-100"
  >
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm font-bold text-slate-500">Total Orders</p>

        <p className="mt-3 text-4xl font-extrabold text-blue-950">
          {stats.totalOrders}
        </p>
      </div>

      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-2xl transition group-hover:scale-110">
        📦
      </div>
    </div>

    <div className="mt-4 flex items-center justify-between">
      <p className="text-xs font-semibold text-slate-400">
        All delivery bookings
      </p>

      <span className="text-sm font-extrabold text-blue-700 transition group-hover:translate-x-1">
        View →
      </span>
    </div>
  </button>

  <button
    type="button"
    onClick={() => navigateFromStatCard("orders-section", "Pending")}
    className="group rounded-3xl border border-amber-100 bg-white p-5 text-left shadow-lg shadow-slate-200/60 transition duration-200 hover:-translate-y-1 hover:border-amber-300 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-amber-100"
  >
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm font-bold text-slate-500">Pending</p>

        <p className="mt-3 text-4xl font-extrabold text-amber-600">
          {stats.pendingOrders}
        </p>
      </div>

      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-2xl transition group-hover:scale-110">
        ⏳
      </div>
    </div>

    <div className="mt-4 flex items-center justify-between">
      <p className="text-xs font-semibold text-slate-400">
        Waiting for acceptance
      </p>

      <span className="text-sm font-extrabold text-amber-600 transition group-hover:translate-x-1">
        View →
      </span>
    </div>
  </button>

  <button
    type="button"
    onClick={() => navigateFromStatCard("rider-map-section")}
    className="group rounded-3xl border border-sky-100 bg-white p-5 text-left shadow-lg shadow-slate-200/60 transition duration-200 hover:-translate-y-1 hover:border-sky-300 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-sky-100"
  >
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm font-bold text-slate-500">
          Active Deliveries
        </p>

        <p className="mt-3 text-4xl font-extrabold text-sky-600">
          {stats.activeOrders}
        </p>
      </div>

      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-2xl transition group-hover:scale-110">
        🏍️
      </div>
    </div>

    <div className="mt-4 flex items-center justify-between">
      <p className="text-xs font-semibold text-slate-400">
        Currently being handled
      </p>

      <span className="text-sm font-extrabold text-sky-600 transition group-hover:translate-x-1">
        Map →
      </span>
    </div>
  </button>

  <button
    type="button"
    onClick={() => navigateFromStatCard("orders-section", "Completed")}
    className="group rounded-3xl border border-emerald-100 bg-white p-5 text-left shadow-lg shadow-slate-200/60 transition duration-200 hover:-translate-y-1 hover:border-emerald-300 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-emerald-100"
  >
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm font-bold text-slate-500">Completed</p>

        <p className="mt-3 text-4xl font-extrabold text-emerald-600">
          {stats.completedOrders}
        </p>
      </div>

      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-2xl transition group-hover:scale-110">
        ✅
      </div>
    </div>

    <div className="mt-4 flex items-center justify-between">
      <p className="text-xs font-semibold text-slate-400">
        Finished transactions
      </p>

      <span className="text-sm font-extrabold text-emerald-600 transition group-hover:translate-x-1">
        View →
      </span>
    </div>
  </button>

  <button
    type="button"
    onClick={() => navigateFromStatCard("payments-section")}
    className="group rounded-3xl border border-violet-100 bg-gradient-to-br from-blue-950 to-blue-700 p-5 text-left text-white shadow-xl shadow-blue-200/60 transition duration-200 hover:-translate-y-1 hover:shadow-2xl focus:outline-none focus:ring-4 focus:ring-blue-200 sm:col-span-2 xl:col-span-1"
  >
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm font-bold text-blue-100">Total Earnings</p>

        <p className="mt-3 text-3xl font-extrabold">
          {formatCurrency(stats.totalEarnings)}
        </p>
      </div>

      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-2xl transition group-hover:scale-110">
        💰
      </div>
    </div>

    <div className="mt-4 flex items-center justify-between">
      <p className="text-xs font-semibold text-blue-200">
        Delivered and completed
      </p>

      <span className="text-sm font-extrabold text-white transition group-hover:translate-x-1">
        Payments →
      </span>
    </div>
  </button>
</section>



{/* Compact workspace navigation */}
<nav className="hidden">
  <div className="rounded-3xl border border-blue-100 bg-white/95 p-2 shadow-xl shadow-slate-200/60 backdrop-blur">
    <div className="flex gap-2 overflow-x-auto">
      {[
        { view: "orders", icon: "📦", label: "Orders", count: orders.length },
        { view: "payments", icon: "💳", label: "Payments" },
        { view: "operations", icon: "⚙️", label: "Operations" },
        { view: "map", icon: "🗺️", label: "Rider Map", count: liveRiders.length },
        { view: "reviews", icon: "⭐", label: "Reviews", count: reviews.length },
        { view: "analytics", icon: "📊", label: "Analytics" },
      ].map((item) => (
        <button
          key={item.view}
          type="button"
          onClick={() => {
            setActiveAdminView(item.view as AdminView);
            window.scrollTo({ top: 360, behavior: "smooth" });
          }}
          className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-extrabold transition ${
            activeAdminView === item.view
              ? "bg-blue-700 text-white shadow-lg shadow-blue-200"
              : "bg-slate-50 text-slate-700 hover:bg-blue-50 hover:text-blue-700"
          }`}
        >
          <span>{item.icon}</span>
          {item.label}
          {typeof item.count === "number" && (
            <span className={`rounded-full px-2 py-0.5 text-xs ${activeAdminView === item.view ? "bg-white/20" : "bg-white text-slate-500"}`}>
              {item.count}
            </span>
          )}
        </button>
      ))}
    </div>
  </div>
</nav>

<div className={activeAdminView === "dashboard" ? "hidden" : "mt-6 rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-sm"}>
  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-blue-500">Admin workspace</p>
      <h2 className="mt-1 text-xl font-black text-blue-950">
        {{ dashboard: "Dashboard", dispatch: "Live Dispatch Center", orders: "Delivery Orders", payments: "Payment Center", operations: "Operations Center", map: "Live Rider Map", reviews: "Customer Reviews", analytics: "Business Analytics" }[activeAdminView]}
      </h2>
    </div>
    <p className="text-sm font-semibold text-slate-500">One section at a time for a cleaner dashboard.</p>
  </div>
</div>

<div id="operations-section" className={activeAdminView === "operations" ? "scroll-mt-28" : "hidden"}>
  <OperationsCenter />
</div>

<div id="payments-section" className={activeAdminView === "payments" ? "scroll-mt-28" : "hidden"}>
  <PaymentsCenter />
</div>
{/* Live Admin Dispatch Map */}
<section
  id="rider-map-section"
  className={activeAdminView === "map" ? "scroll-mt-28 mt-8 overflow-hidden rounded-[1.5rem] border border-blue-100 bg-white shadow-xl shadow-blue-100/60" : "hidden"}
>
          <div className="bg-gradient-to-r from-slate-950 via-blue-950 to-blue-700 px-6 py-6 text-white md:px-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-sky-300">
                  Live dispatch center
                </p>
                <h2 className="mt-1 text-2xl font-extrabold md:text-3xl">
                  Active Rider Map
                </h2>
                <p className="mt-2 max-w-2xl text-sm font-medium text-blue-100">
                  Real-time rider location, pickup, drop-off, speed, at GPS accuracy.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-extrabold">
                  🏍️ {liveRiders.length} rider{liveRiders.length === 1 ? "" : "s"} visible
                </span>
                <span className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-extrabold">
                  ↻ Every 5 seconds
                </span>
              </div>
            </div>
          </div>

          <div className="p-5 md:p-6">
            {liveMapError && (
              <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 font-bold text-red-700">
                ⚠️ {liveMapError}
              </div>
            )}

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div>
                {liveMapLoading ? (
                  <div className="grid h-[520px] place-items-center rounded-3xl border border-blue-100 bg-slate-50">
                    <div className="text-center">
                      <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
                      <p className="mt-4 font-extrabold text-blue-950">
                        Loading active riders...
                      </p>
                    </div>
                  </div>
                ) : liveRiders.length > 0 ? (
                  <AdminLiveMap
                    riders={liveRiders}
                    selectedBookingNo={selectedLiveRider?.bookingNo || null}
                    onSelectBooking={setSelectedLiveBooking}
                  />
                ) : (
                  <div className="grid h-[520px] place-items-center rounded-3xl border border-dashed border-blue-200 bg-blue-50/50 p-8 text-center">
                    <div>
                      <div className="text-6xl">🗺️</div>
                      <h3 className="mt-5 text-2xl font-extrabold text-blue-950">
                        Walang active rider GPS
                      </h3>
                      <p className="mx-auto mt-2 max-w-xl leading-7 text-slate-600">
                        Accepted na ang order, pero lalabas lamang ang marker kapag naka-on ang live location sa Rider Dashboard at may na-save nang GPS coordinates.
                      </p>
                    </div>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-slate-500">
                  <div className="flex flex-wrap gap-4">
                    <span>🏍️ Rider</span>
                    <span>📦 Pickup</span>
                    <span>🏁 Drop-off</span>
                  </div>
                  <span>
                    Last checked:{" "}
                    {liveMapUpdatedAt
                      ? liveMapUpdatedAt.toLocaleTimeString("en-PH")
                      : "Waiting..."}
                  </span>
                </div>
              </div>

              <aside className="space-y-4">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-500">
                    Active deliveries
                  </p>
                  <h3 className="mt-1 text-xl font-extrabold text-blue-950">
                    Rider dispatch list
                  </h3>

                  {liveRiders.length === 0 ? (
                    <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm font-semibold text-slate-500">
                      No active GPS data yet.
                    </div>
                  ) : (
                    <div className="mt-5 max-h-[360px] space-y-3 overflow-y-auto pr-1">
                      {liveRiders.map((rider) => {
                        const isSelected =
                          selectedLiveRider?.bookingNo === rider.bookingNo;
                        const isFresh =
                          Date.now() - new Date(rider.updatedAt).getTime() <
                          60_000;

                        return (
                          <button
                            key={rider.orderId}
                            type="button"
                            onClick={() =>
                              setSelectedLiveBooking(rider.bookingNo)
                            }
                            className={`w-full rounded-2xl border p-4 text-left transition ${
                              isSelected
                                ? "border-blue-300 bg-blue-50 shadow-md"
                                : "border-slate-200 bg-white hover:border-blue-200"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate font-extrabold text-blue-950">
                                  {rider.riderName || "Active rider"}
                                </p>
                                <p className="mt-1 break-all text-xs font-bold text-blue-600">
                                  {rider.bookingNo}
                                </p>
                              </div>
                              <span
                                className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${
                                  isFresh
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-amber-100 text-amber-700"
                                }`}
                              >
                                {isFresh ? "● LIVE" : "STALE"}
                              </span>
                            </div>
                            <p className="mt-3 text-xs font-semibold text-slate-500">
                              {rider.status}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {selectedLiveRider && (
                  <div className="rounded-3xl bg-gradient-to-br from-blue-950 to-blue-700 p-5 text-white">
                    <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-sky-300">
                      Selected rider
                    </p>
                    <h3 className="mt-1 text-xl font-extrabold">
                      {selectedLiveRider.riderName || "Active rider"}
                    </h3>
                    <p className="mt-1 break-all text-sm font-bold text-blue-200">
                      {selectedLiveRider.bookingNo}
                    </p>

                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-white/10 p-3">
                        <p className="text-[10px] font-bold uppercase text-blue-300">
                          Speed
                        </p>
                        <p className="mt-1 font-extrabold">
                          {selectedLiveRider.speed !== null
                            ? `${Math.max(0, selectedLiveRider.speed * 3.6).toFixed(1)} km/h`
                            : "Unavailable"}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-white/10 p-3">
                        <p className="text-[10px] font-bold uppercase text-blue-300">
                          Accuracy
                        </p>
                        <p className="mt-1 font-extrabold">
                          {selectedLiveRider.accuracy !== null
                            ? `±${Math.round(selectedLiveRider.accuracy)} m`
                            : "Unavailable"}
                        </p>
                      </div>
                    </div>

                    <a
                      href={`https://www.google.com/maps?q=${selectedLiveRider.latitude},${selectedLiveRider.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 block rounded-2xl bg-white px-4 py-3 text-center font-extrabold text-blue-900"
                    >
                      ↗ Open Rider in Google Maps
                    </a>
                  </div>
                )}
              </aside>
            </div>
          </div>
        </section>

        <section
  id="reviews-section"
  className={activeAdminView === "reviews" ? "scroll-mt-28 mt-8 overflow-hidden rounded-[1.5rem] border border-amber-100 bg-white shadow-xl shadow-amber-100/60" : "hidden"}
>
          <div className="bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 px-6 py-6 text-white md:px-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-amber-50">
                  Customer feedback
                </p>
                <h2 className="mt-1 text-2xl font-extrabold md:text-3xl">
                  Rider Performance & Reviews
                </h2>
              </div>
              {reviewAnalytics.totalReviews >= 5 &&
                reviewAnalytics.averageRating >= 4.8 && (
                  <span className="w-fit rounded-full border border-white/30 bg-white/20 px-4 py-2 text-sm font-extrabold">
                    🏆 Top Rider Quality
                  </span>
                )}
            </div>
          </div>

          <div className="p-5 md:p-6">
            {reviewsError && (
              <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 font-bold text-red-700">
                ⚠️ {reviewsError}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-3xl border border-amber-100 bg-amber-50 p-5">
                <p className="text-sm font-bold text-amber-700">Average Rating</p>
                <p className="mt-2 text-4xl font-extrabold text-amber-950">
                  {reviewsLoading ? "..." : reviewAnalytics.averageRating.toFixed(1)}
                </p>
                <p className="mt-2 text-xl text-amber-400">
                  {"★".repeat(Math.round(reviewAnalytics.averageRating))}
                  <span className="text-slate-200">
                    {"★".repeat(Math.max(0, 5 - Math.round(reviewAnalytics.averageRating)))}
                  </span>
                </p>
              </div>

              <div className="rounded-3xl border border-blue-100 bg-blue-50 p-5">
                <p className="text-sm font-bold text-blue-700">Total Reviews</p>
                <p className="mt-2 text-4xl font-extrabold text-blue-950">
                  {reviewsLoading ? "..." : reviewAnalytics.totalReviews}
                </p>
                <p className="mt-2 text-sm font-semibold text-blue-600">
                  Submitted customer feedback
                </p>
              </div>

              <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5">
                <p className="text-sm font-bold text-emerald-700">Satisfaction</p>
                <p className="mt-2 text-4xl font-extrabold text-emerald-950">
                  {reviewsLoading ? "..." : `${reviewAnalytics.satisfactionPercent}%`}
                </p>
                <p className="mt-2 text-sm font-semibold text-emerald-600">
                  Ratings of 4 or 5 stars
                </p>
              </div>

              <div className="rounded-3xl border border-violet-100 bg-violet-50 p-5">
                <p className="text-sm font-bold text-violet-700">Best Rider</p>
                <p className="mt-2 truncate text-xl font-extrabold text-violet-950">
                  {reviewsLoading
                    ? "Loading..."
                    : riderLeaderboard[0]?.riderName || "No reviews yet"}
                </p>
                <p className="mt-2 text-sm font-semibold text-violet-600">
                  {riderLeaderboard[0]
                    ? `⭐ ${riderLeaderboard[0].average.toFixed(1)} • ${riderLeaderboard[0].count} review${riderLeaderboard[0].count === 1 ? "" : "s"}`
                    : "Waiting for rider feedback"}
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <h3 className="text-lg font-extrabold text-blue-950">
                  Rating distribution
                </h3>
                <div className="mt-3 space-y-1.5">
                  {[5, 4, 3, 2, 1].map((star) => {
                    const count = reviewAnalytics.distribution[star] || 0;
                    const percent =
                      reviewAnalytics.totalReviews > 0
                        ? Math.round((count / reviewAnalytics.totalReviews) * 100)
                        : 0;

                    return (
                      <div key={star}>
                        <div className="mb-1 flex items-center justify-between text-sm font-bold">
                          <span className="text-amber-500">{star} ★</span>
                          <span className="text-slate-500">{count} ({percent}%)</span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-amber-400"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-extrabold text-blue-950">
                    Latest customer reviews
                  </h3>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-extrabold text-blue-700">
                    Latest {recentReviews.length}
                  </span>
                </div>

                {recentReviews.length === 0 ? (
                  <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
                    Wala pang customer review.
                  </div>
                ) : (
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    {recentReviews.map((review) => (
                      <article key={review.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-lg text-amber-400">
                            {"★".repeat(review.rating)}
                            <span className="text-slate-200">
                              {"★".repeat(5 - review.rating)}
                            </span>
                          </p>
                          <span className="text-xs font-bold text-slate-400">
                            {formatDate(review.created_at)}
                          </span>
                        </div>
                        <p className="mt-3 min-h-12 text-sm font-semibold leading-6 text-slate-700">
                          {review.comment || "No written comment."}
                        </p>
                        <div className="mt-3 border-t border-slate-200 pt-3">
                          <p className="break-all text-xs font-extrabold text-blue-700">
                            {review.booking_no}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            Rider: {review.rider_name || "Not assigned"}
                          </p>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Operations Analytics */}
        <section
  id="analytics-section"
  className={activeAdminView === "analytics" ? "scroll-mt-28 mt-8 overflow-hidden rounded-[1.5rem] border border-blue-100 bg-white shadow-xl shadow-slate-200/60" : "hidden"}
> 
          <div className="bg-gradient-to-r from-blue-950 via-blue-800 to-sky-600 px-6 py-6 text-white md:px-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-sky-300">
                  Business intelligence
                </p>
                <h2 className="mt-1 text-2xl font-extrabold md:text-3xl">
                  Operations Analytics
                </h2>
                <p className="mt-2 max-w-2xl text-sm font-medium text-blue-100">
                  Deliveries, earnings, ratings, at rider performance sa napiling panahon.
                </p>
              </div>

              <div className="flex w-fit rounded-2xl border border-white/15 bg-white/10 p-1.5 backdrop-blur">
                {([7, 30, 90] as const).map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setAnalyticsRange(days)}
                    className={`rounded-xl px-4 py-2 text-sm font-extrabold transition ${
                      analyticsRange === days
                        ? "bg-white text-blue-900 shadow-lg"
                        : "text-blue-100 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {days} Days
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="p-5 md:p-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
              <div className="rounded-3xl border border-blue-100 bg-blue-50 p-5 xl:col-span-1">
                <p className="text-sm font-bold text-blue-700">Range Orders</p>
                <p className="mt-2 text-3xl font-extrabold text-blue-950">
                  {operationsAnalytics.totalOrders}
                </p>
                <p className="mt-2 text-xs font-semibold text-blue-600">
                  Last {analyticsRange} days
                </p>
              </div>

              <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5 xl:col-span-1">
                <p className="text-sm font-bold text-emerald-700">
                  Completion Rate
                </p>
                <p className="mt-2 text-3xl font-extrabold text-emerald-950">
                  {operationsAnalytics.completionRate}%
                </p>
                <p className="mt-2 text-xs font-semibold text-emerald-600">
                  {operationsAnalytics.completedOrders} completed
                </p>
              </div>

              <div className="rounded-3xl border border-violet-100 bg-violet-50 p-5 xl:col-span-1">
                <p className="text-sm font-bold text-violet-700">
                  Range Earnings
                </p>
                <p className="mt-2 text-2xl font-extrabold text-violet-950">
                  {formatCurrency(operationsAnalytics.totalEarnings)}
                </p>
                <p className="mt-2 text-xs font-semibold text-violet-600">
                  Delivered and completed
                </p>
              </div>

              <div className="rounded-3xl border border-amber-100 bg-amber-50 p-5 xl:col-span-1">
                <p className="text-sm font-bold text-amber-700">
                  Average Order
                </p>
                <p className="mt-2 text-2xl font-extrabold text-amber-950">
                  {formatCurrency(operationsAnalytics.averageOrderValue)}
                </p>
                <p className="mt-2 text-xs font-semibold text-amber-600">
                  Per completed delivery
                </p>
              </div>

              <div className="rounded-3xl border border-sky-100 bg-sky-50 p-5 xl:col-span-1">
                <p className="text-sm font-bold text-sky-700">Review Rate</p>
                <p className="mt-2 text-3xl font-extrabold text-sky-950">
                  {operationsAnalytics.reviewRate}%
                </p>
                <p className="mt-2 text-xs font-semibold text-sky-600">
                  Completed orders reviewed
                </p>
              </div>

              <div className="rounded-3xl border border-red-100 bg-red-50 p-5 xl:col-span-1">
                <p className="text-sm font-bold text-red-700">Cancelled</p>
                <p className="mt-2 text-3xl font-extrabold text-red-950">
                  {operationsAnalytics.cancelledOrders}
                </p>
                <p className="mt-2 text-xs font-semibold text-red-600">
                  Within selected range
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              <article className="rounded-3xl border border-slate-200 bg-white p-5 md:p-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-blue-500">
                      Delivery volume
                    </p>
                    <h3 className="mt-1 text-xl font-extrabold text-blue-950">
                      Orders per day
                    </h3>
                  </div>
                  <p className="text-sm font-bold text-slate-500">
                    Avg. {operationsAnalytics.averageDailyOrders.toFixed(1)} / day
                  </p>
                </div>

                <div className="mt-6 flex h-64 items-end gap-1 overflow-x-auto rounded-2xl border border-slate-100 bg-slate-50 px-3 pb-3 pt-6">
                  {operationsAnalytics.daily.map((day) => (
                    <div
                      key={day.key}
                      className="flex min-w-[28px] flex-1 flex-col items-center justify-end"
                    >
                      <span className="mb-2 text-[10px] font-extrabold text-blue-700">
                        {day.orders}
                      </span>
                      <div
                        title={`${day.label}: ${day.orders} orders`}
                        className="w-full max-w-8 rounded-t-lg bg-gradient-to-t from-blue-700 to-sky-400 transition hover:opacity-80"
                        style={{
                          height: `${Math.max(
                            day.orders > 0 ? 8 : 2,
                            (day.orders /
                              operationsAnalytics.maxDailyOrders) *
                              170
                          )}px`,
                        }}
                      />
                      {(analyticsRange <= 7 ||
                        day.key.endsWith("-01") ||
                        day === operationsAnalytics.daily.at(-1)) && (
                        <span className="mt-2 whitespace-nowrap text-[9px] font-bold text-slate-400">
                          {day.label}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </article>

              <article className="rounded-3xl border border-slate-200 bg-white p-5 md:p-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-violet-500">
                      Revenue
                    </p>
                    <h3 className="mt-1 text-xl font-extrabold text-blue-950">
                      Daily earnings
                    </h3>
                  </div>
                  <p className="text-sm font-extrabold text-violet-700">
                    {formatCurrency(operationsAnalytics.totalEarnings)}
                  </p>
                </div>

                <div className="mt-6 flex h-64 items-end gap-1 overflow-x-auto rounded-2xl border border-slate-100 bg-slate-50 px-3 pb-3 pt-6">
                  {operationsAnalytics.daily.map((day) => (
                    <div
                      key={day.key}
                      className="flex min-w-[28px] flex-1 flex-col items-center justify-end"
                    >
                      <span className="mb-2 text-[9px] font-extrabold text-violet-700">
                        {day.earnings > 0
                          ? `₱${Math.round(day.earnings)}`
                          : "0"}
                      </span>
                      <div
                        title={`${day.label}: ${formatCurrency(day.earnings)}`}
                        className="w-full max-w-8 rounded-t-lg bg-gradient-to-t from-violet-800 to-fuchsia-400 transition hover:opacity-80"
                        style={{
                          height: `${Math.max(
                            day.earnings > 0 ? 8 : 2,
                            (day.earnings /
                              operationsAnalytics.maxDailyEarnings) *
                              170
                          )}px`,
                        }}
                      />
                      {(analyticsRange <= 7 ||
                        day.key.endsWith("-01") ||
                        day === operationsAnalytics.daily.at(-1)) && (
                        <span className="mt-2 whitespace-nowrap text-[9px] font-bold text-slate-400">
                          {day.label}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </article>
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr_0.9fr]">
              <article className="rounded-3xl border border-slate-200 bg-white p-5 md:p-6">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-amber-500">
                    Customer experience
                  </p>
                  <h3 className="mt-1 text-xl font-extrabold text-blue-950">
                    Rating trend
                  </h3>
                </div>

                <div className="mt-5 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 p-3">
                  <svg
                    viewBox={`0 0 ${operationsAnalytics.lineWidth} ${operationsAnalytics.lineHeight}`}
                    className="h-52 w-full"
                    role="img"
                    aria-label="Customer rating trend"
                  >
                    {[1, 2, 3, 4, 5].map((rating) => {
                      const y =
                        18 +
                        ((5 - rating) / 5) *
                          (operationsAnalytics.lineHeight - 36);

                      return (
                        <g key={rating}>
                          <line
                            x1="18"
                            y1={y}
                            x2={operationsAnalytics.lineWidth - 18}
                            y2={y}
                            stroke="currentColor"
                            className="text-slate-200"
                            strokeDasharray="4 5"
                          />
                          <text
                            x="2"
                            y={y + 4}
                            className="fill-slate-400 text-[10px] font-bold"
                          >
                            {rating}
                          </text>
                        </g>
                      );
                    })}

                    <polyline
                      points={operationsAnalytics.ratingPoints}
                      fill="none"
                      stroke="currentColor"
                      className="text-amber-500"
                      strokeWidth="5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    {operationsAnalytics.daily.map((day, index) => {
                      const x =
                        operationsAnalytics.daily.length === 1
                          ? operationsAnalytics.lineWidth / 2
                          : 18 +
                            (index /
                              (operationsAnalytics.daily.length - 1)) *
                              (operationsAnalytics.lineWidth - 36);
                      const y =
                        18 +
                        ((5 - day.averageRating) / 5) *
                          (operationsAnalytics.lineHeight - 36);

                      return (
                        <circle
                          key={day.key}
                          cx={x}
                          cy={y}
                          r={day.reviews > 0 ? 5 : 2}
                          fill="currentColor"
                          className={
                            day.reviews > 0
                              ? "text-amber-500"
                              : "text-slate-300"
                          }
                        >
                          <title>
                            {day.label}:{" "}
                            {day.reviews > 0
                              ? `${day.averageRating.toFixed(1)} rating`
                              : "No reviews"}
                          </title>
                        </circle>
                      );
                    })}
                  </svg>
                </div>

                <p className="mt-3 text-xs font-semibold text-slate-500">
                  Days without reviews appear at zero and do not affect the overall average.
                </p>
              </article>

              <article className="rounded-3xl border border-slate-200 bg-white p-5 md:p-6">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-emerald-500">
                    Workflow health
                  </p>
                  <h3 className="mt-1 text-xl font-extrabold text-blue-950">
                    Status distribution
                  </h3>
                </div>

                <div className="mt-3 space-y-1.5">
                  {operationsAnalytics.statusDistribution
                    .filter((item) => item.count > 0)
                    .map((item) => (
                      <div key={item.status}>
                        <div className="mb-1.5 flex items-center justify-between gap-4 text-sm font-bold">
                          <span className="flex items-center gap-2 text-slate-700">
                            <span
                              className={`h-2.5 w-2.5 rounded-full ${getStatusDotClass(
                                item.status
                              )}`}
                            />
                            {item.status}
                          </span>
                          <span className="text-slate-500">
                            {item.count} ({item.percent}%)
                          </span>
                        </div>
                        <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full ${getStatusDotClass(
                              item.status
                            )}`}
                            style={{ width: `${item.percent}%` }}
                          />
                        </div>
                      </div>
                    ))}

                  {operationsAnalytics.totalOrders === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm font-semibold text-slate-500">
                      Walang order sa napiling panahon.
                    </div>
                  )}
                </div>
              </article>

              <article className="rounded-3xl border border-slate-200 bg-white p-5 md:p-6">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-violet-500">
                    Rider leaderboard
                  </p>
                  <h3 className="mt-1 text-xl font-extrabold text-blue-950">
                    Top performance
                  </h3>
                </div>

                {riderLeaderboard.length === 0 ? (
                  <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm font-semibold text-slate-500">
                    Wala pang rider reviews.
                  </div>
                ) : (
                  <div className="mt-3 space-y-1.5">
                    {riderLeaderboard.map((rider, index) => (
                      <div
                        key={rider.riderId}
                        className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3"
                      >
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-lg font-extrabold shadow-sm">
                          {index === 0
                            ? "🥇"
                            : index === 1
                              ? "🥈"
                              : index === 2
                                ? "🥉"
                                : index + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-extrabold text-blue-950">
                            {rider.riderName}
                          </p>
                          <p className="text-xs font-semibold text-slate-500">
                            {rider.count} review{rider.count === 1 ? "" : "s"}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-extrabold text-amber-600">
                            ⭐ {rider.average.toFixed(1)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-5 rounded-2xl bg-blue-950 p-4 text-white">
                  <p className="text-xs font-bold uppercase tracking-wider text-blue-300">
                    Best delivery day
                  </p>
                  <p className="mt-1 text-lg font-extrabold">
                    {operationsAnalytics.bestDay?.label || "No data"}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-blue-100">
                    {operationsAnalytics.bestDay?.completed || 0} completed deliveries
                  </p>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* Search and Filter */}
        <section className="mt-8 rounded-[2rem] border border-blue-100 bg-white p-5 shadow-xl shadow-slate-200/60 md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
            <label className="flex-1">
              <span className="mb-2 block text-sm font-extrabold text-blue-950">
                🔍 Search orders
              </span>

              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Booking number, pangalan, phone o address"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
              />
            </label>

            <label className="w-full lg:max-w-xs">
              <span className="mb-2 block text-sm font-extrabold text-blue-950">
                ⚙️ Filter by status
              </span>

              <select
                value={filterStatus}
                onChange={(event) => setFilterStatus(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
              >
                <option value="All">All statuses</option>

                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-4 font-bold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
              >
                Clear Filters
              </button>
            )}
          </div>
        </section>

        {errorMessage && (
          <div
            role="alert"
            className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 font-semibold text-red-700 shadow-sm"
          >
            ⚠️ {errorMessage}
          </div>
        )}

        {/* Orders */}
        {/* Orders */}
<section
  id="orders-section"
  className={activeAdminView === "orders" ? "scroll-mt-28 mt-8" : "hidden"}
>
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-blue-500">
                Delivery management
              </p>

              <h2 className="mt-1 text-3xl font-extrabold text-blue-950">
                Delivery Orders
              </h2>
            </div>

            <span className="w-fit rounded-full bg-blue-50 px-4 py-2 text-sm font-extrabold text-blue-700">
              {filteredOrders.length} result
              {filteredOrders.length === 1 ? "" : "s"}
            </span>
          </div>

          {isLoading ? (
            <div className="rounded-[2rem] border border-blue-100 bg-white p-12 text-center shadow-xl">
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />

              <p className="mt-5 font-extrabold text-blue-950">
                Loading delivery orders...
              </p>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="rounded-[2rem] border border-blue-100 bg-white p-12 text-center shadow-xl">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-blue-50 text-4xl">
                📭
              </div>

              <h3 className="mt-5 text-2xl font-extrabold text-blue-950">
                Walang order na nakita
              </h3>

              <p className="mx-auto mt-2 max-w-lg leading-7 text-slate-600">
                Walang booking na tumutugma sa iyong search o status filter.
              </p>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-6 rounded-2xl bg-blue-600 px-6 py-3 font-bold text-white transition hover:bg-blue-700"
                >
                  Clear Filters
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {paginatedOrders.map((order) => {
                const currentStatus = order.status || "Pending";
                const orderReview = reviewsByOrderId.get(order.id);

                return (
                  <article
                    key={order.id}
                    className="overflow-hidden rounded-[1.5rem] border border-blue-100 bg-white shadow-xl shadow-slate-200/60"
                  >
                    {/* Order header */}
                    <div className="flex flex-col gap-5 border-b border-slate-100 bg-gradient-to-r from-blue-50/80 to-sky-50/60 p-5 md:flex-row md:items-center md:justify-between md:p-6">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-500">
                          Booking number
                        </p>

                        <h3 className="mt-2 break-all text-xl font-extrabold text-blue-950 md:text-2xl">
                          {order.booking_no || `Order #${order.id}`}
                        </h3>

                        <p className="mt-2 text-sm font-medium text-slate-500">
                          🗓️ {formatDate(order.created_at)}
                        </p>
                      </div>

                      <span
                        className={`inline-flex w-fit items-center gap-2 rounded-full border px-4 py-2 text-sm font-extrabold ${getStatusClass(
                          currentStatus
                        )}`}
                      >
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${getStatusDotClass(
                            currentStatus
                          )}`}
                        />

                        {currentStatus}
                      </span>
                    </div>

                    {/* Details */}
                    <div className="grid gap-5 p-5 lg:grid-cols-3 md:p-6">
                      <div className="rounded-3xl border border-slate-100 bg-slate-50 p-5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-xl">
                            📤
                          </div>

                          <h4 className="font-extrabold text-blue-950">
                            Sender
                          </h4>
                        </div>

                        <p className="mt-4 text-lg font-extrabold text-slate-900">
                          {order.sender_name || "No sender name"}
                        </p>

                        <a
                          href={
                            order.sender_phone
                              ? `tel:${order.sender_phone}`
                              : undefined
                          }
                          className="mt-1 block text-sm font-semibold text-blue-600"
                        >
                          {order.sender_phone || "No phone number"}
                        </a>

                        <div className="mt-5 border-t border-slate-200 pt-4">
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                            📍 Pickup address
                          </p>

                          <p className="mt-2 text-sm leading-6 text-slate-600">
                            {order.pickup_address || "No pickup address"}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-3xl border border-slate-100 bg-slate-50 p-5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-xl">
                            📥
                          </div>

                          <h4 className="font-extrabold text-blue-950">
                            Receiver
                          </h4>
                        </div>

                        <p className="mt-4 text-lg font-extrabold text-slate-900">
                          {order.receiver_name || "No receiver name"}
                        </p>

                        <a
                          href={
                            order.receiver_phone
                              ? `tel:${order.receiver_phone}`
                              : undefined
                          }
                          className="mt-1 block text-sm font-semibold text-blue-600"
                        >
                          {order.receiver_phone || "No phone number"}
                        </a>

                        <div className="mt-5 border-t border-slate-200 pt-4">
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                            📍 Drop-off address
                          </p>

                          <p className="mt-2 text-sm leading-6 text-slate-600">
                            {order.dropoff_address || "No drop-off address"}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-3xl border border-blue-100 bg-blue-50/60 p-5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-xl shadow-sm">
                            📦
                          </div>

                          <h4 className="font-extrabold text-blue-950">
                            Delivery Details
                          </h4>
                        </div>

                        <div className="mt-5 space-y-4">
                          <div className="flex items-start justify-between gap-4">
                            <p className="text-sm font-semibold text-slate-500">
                              Package
                            </p>

                            <p className="text-right text-sm font-extrabold text-blue-950">
                              {order.package_type || "Not specified"}
                            </p>
                          </div>

                          <div className="flex items-start justify-between gap-4 border-t border-blue-100 pt-4">
                            <p className="text-sm font-semibold text-slate-500">
                              Payment
                            </p>

                            <p className="text-right text-sm font-extrabold text-blue-950">
                              {order.payment_method || "Not specified"}
                            </p>
                          </div>

                          <div className="flex items-start justify-between gap-4 border-t border-blue-100 pt-4">
                            <p className="text-sm font-semibold text-slate-500">
                              Delivery fee
                            </p>

                            <p className="text-right text-lg font-extrabold text-blue-700">
                              {formatCurrency(Number(order.price || 0))}
                            </p>
                          </div>

                          {order.item_payment_flow === "rider_advance_cod" && (
  <div className="border-t border-amber-200 pt-4">
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-xs font-black uppercase tracking-wider text-amber-700">
        Rider Advance / COD
      </p>

      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-semibold text-slate-500">
            Estimated item cost
          </span>
          <span className="text-sm font-extrabold text-amber-950">
            {formatCurrency(
              Number(order.estimated_item_amount || order.order_amount || 0)
            )}
          </span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-semibold text-slate-500">
            Actual item cost
          </span>
          <span className="text-sm font-extrabold text-amber-950">
            {order.actual_item_amount
              ? formatCurrency(Number(order.actual_item_amount))
              : "Not entered"}
          </span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-semibold text-slate-500">
            COD status
          </span>
          <span className="text-right text-sm font-extrabold text-amber-950">
            {order.purchase_payment_status || "Pending"}
          </span>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-amber-200 pt-2">
          <span className="text-sm font-black text-slate-700">
            Final customer total
          </span>
          <span className="text-lg font-black text-amber-950">
            {formatCurrency(
              Number(order.price || 0) +
                Number(
                  order.actual_item_amount ||
                    order.estimated_item_amount ||
                    order.order_amount ||
                    0
                )
            )}
          </span>
        </div>
      </div>
    </div>
  </div>
)}

{order.item_payment_flow === "merchant_direct" && (
  <div className="border-t border-blue-100 pt-4">
    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
      <p className="text-xs font-black uppercase tracking-wider text-blue-700">
        Merchant Direct Payment
      </p>

      <div className="mt-3 flex items-center justify-between gap-4">
        <span className="text-sm font-semibold text-slate-500">
          Payment status
        </span>

        <span className="text-right text-sm font-extrabold text-blue-950">
          {order.merchant_payment_status || "Waiting for Merchant QR"}
        </span>
      </div>
    </div>
  </div>
)}

                          {order.notes && (
                            <div className="border-t border-blue-100 pt-4">
                              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                                📝 Notes
                              </p>

                              <p className="mt-2 text-sm leading-6 text-slate-600">
                                {order.notes}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {(order.proof_photo_url ||
                      order.received_by ||
                      order.proof_submitted_at) && (
                      <div className="border-t border-emerald-100 bg-emerald-50/60 p-5 md:p-6">
                        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                          <div className="flex items-start gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-2xl text-white shadow-lg shadow-emerald-200">
                              📸
                            </div>

                            <div>
                              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-emerald-700">
                                Proof of Delivery
                              </p>

                              <h4 className="mt-1 text-xl font-extrabold text-emerald-950">
                                Delivery proof submitted
                              </h4>

                              <div className="mt-3 grid gap-1 text-sm text-emerald-900 sm:grid-cols-2 sm:gap-x-8">
                                <p>
                                  <span className="font-semibold text-emerald-700">
                                    Received by:
                                  </span>{" "}
                                  <span className="font-extrabold">
                                    {order.received_by || "Not recorded"}
                                  </span>
                                </p>

                                <p>
                                  <span className="font-semibold text-emerald-700">
                                    Submitted:
                                  </span>{" "}
                                  <span className="font-extrabold">
                                    {formatDate(order.proof_submitted_at)}
                                  </span>
                                </p>
                              </div>
                            </div>
                          </div>

                          {order.proof_photo_url ? (
                            <button
                              type="button"
                              onClick={() => setSelectedProof(order)}
                              className="w-full rounded-2xl bg-emerald-700 px-6 py-4 font-extrabold text-white shadow-lg shadow-emerald-200 transition hover:-translate-y-0.5 hover:bg-emerald-800 lg:w-auto"
                            >
                              🖼️ View Proof Photo
                            </button>
                          ) : (
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-center text-sm font-bold text-amber-700">
                              Photo URL not available
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {currentStatus === "Completed" && (
                      <div className="border-t border-amber-100 bg-amber-50/70 p-5 md:p-6">
                        <div className="flex items-start gap-4">
                          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-400 text-2xl text-white">
                            ⭐
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-amber-700">
                              Customer Review
                            </p>
                            {orderReview ? (
                              <>
                                <div className="mt-2 flex flex-wrap items-center gap-3">
                                  <p className="text-2xl text-amber-400">
                                    {"★".repeat(orderReview.rating)}
                                    <span className="text-slate-200">
                                      {"★".repeat(5 - orderReview.rating)}
                                    </span>
                                  </p>
                                  <span className="rounded-full bg-white px-3 py-1 text-sm font-extrabold text-amber-800">
                                    {orderReview.rating}/5
                                  </span>
                                </div>
                                <p className="mt-3 rounded-2xl border border-amber-100 bg-white px-4 py-3 font-semibold leading-6 text-slate-700">
                                  {orderReview.comment ||
                                    "Customer submitted a rating without a written comment."}
                                </p>
                                <p className="mt-3 text-xs font-bold text-amber-700">
                                  Reviewed: {formatDate(orderReview.created_at)}
                                </p>
                              </>
                            ) : (
                              <div className="mt-3 rounded-2xl border border-dashed border-amber-300 bg-white/70 px-4 py-4 text-sm font-bold text-amber-700">
                                No customer review yet.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Rider workflow */}
                    <div className="border-t border-blue-100 bg-gradient-to-r from-blue-950 to-blue-800 p-5 text-white md:p-6">
                      <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
                        <div>
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-300">
                                Rider workflow
                              </p>

                              <p className="mt-1 text-xl font-extrabold">
                                {currentStatus === "Completed"
                                  ? "Order completed"
                                  : currentStatus === "Cancelled"
                                    ? "Order cancelled"
                                    : workflowActions[currentStatus]?.description ||
                                      "Update the delivery status."}
                              </p>
                            </div>

                            <span className="rounded-full bg-white/10 px-4 py-2 text-sm font-extrabold text-blue-100">
                              {getWorkflowProgress(currentStatus)}% complete
                            </span>
                          </div>

                          <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/15">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-all duration-500"
                              style={{
                                width: `${getWorkflowProgress(currentStatus)}%`,
                              }}
                            />
                          </div>

                          <div className="mt-3 hidden justify-between text-[11px] font-bold text-blue-200 sm:flex">
                            <span>Pending</span>
                            <span>Accepted</span>
                            <span>Pickup</span>
                            <span>Transit</span>
                            <span>Delivered</span>
                            <span>Completed</span>
                          </div>
                        </div>

                        <div className="flex w-full flex-col gap-3 lg:w-[320px]">
                          {currentStatus === "Accepted" ||
                          currentStatus === "Heading to Pickup" ? (
                            createMapsUrl(order.pickup_address) && (
                              <a
                                href={createMapsUrl(order.pickup_address) || "#"}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-2xl border border-white/20 bg-white/10 px-5 py-4 text-center font-extrabold text-white transition hover:bg-white/20"
                              >
                                📍 Open Pickup in Maps
                              </a>
                            )
                          ) : null}

                          {["Picked Up", "In Transit", "Delivered"].includes(
                            currentStatus
                          ) &&
                          createMapsUrl(order.dropoff_address) ? (
                            <a
                              href={createMapsUrl(order.dropoff_address) || "#"}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-2xl border border-white/20 bg-white/10 px-5 py-4 text-center font-extrabold text-white transition hover:bg-white/20"
                            >
                              📍 Open Drop-off in Maps
                            </a>
                          ) : null}

                          {workflowActions[currentStatus] && (
                            <button
                              type="button"
                              disabled={updatingId === order.id}
                              onClick={() =>
                                updateStatus(
                                  order.id,
                                  workflowActions[currentStatus]!.nextStatus
                                )
                              }
                              className="rounded-2xl bg-white px-5 py-4 font-extrabold text-blue-900 shadow-lg transition hover:-translate-y-0.5 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {updatingId === order.id
                                ? "Updating..."
                                : workflowActions[currentStatus]!.label}
                            </button>
                          )}

                          {currentStatus === "Completed" && (
                            <div className="rounded-2xl border border-emerald-300/30 bg-emerald-400/15 px-5 py-4 text-center font-extrabold text-emerald-100">
                              ✅ Delivery successfully completed
                            </div>
                          )}

                          {currentStatus === "Cancelled" && (
                            <div className="rounded-2xl border border-red-300/30 bg-red-400/15 px-5 py-4 text-center font-extrabold text-red-100">
                              ❌ This order was cancelled
                            </div>
                          )}

                          {!["Completed", "Cancelled"].includes(currentStatus) && (
                            <button
                              type="button"
                              disabled={updatingId === order.id}
                              onClick={() => {
                                const shouldCancel = window.confirm(
                                  "Sigurado ka bang gusto mong i-cancel ang order na ito?"
                                );

                                if (shouldCancel) {
                                  updateStatus(order.id, "Cancelled");
                                }
                              }}
                              className="rounded-2xl border border-red-300/30 bg-red-500/10 px-5 py-3 font-bold text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Cancel Order
                            </button>
                          )}

                          <details className="rounded-2xl border border-white/15 bg-white/5 p-3">
                            <summary className="cursor-pointer text-center text-sm font-bold text-blue-200">
                              Manual status control
                            </summary>

                            <select
                              value={currentStatus}
                              disabled={updatingId === order.id}
                              onChange={(event) =>
                                updateStatus(order.id, event.target.value)
                              }
                              className="mt-3 w-full rounded-xl border border-white/20 bg-white px-4 py-3 font-extrabold text-blue-950 outline-none disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {statuses.map((status) => (
                                <option key={status} value={status}>
                                  {status}
                                </option>
                              ))}
                            </select>
                          </details>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {!isLoading && filteredOrders.length > ordersPerPage && (
            <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-slate-500">
                Showing {(orderPage - 1) * ordersPerPage + 1}–{Math.min(orderPage * ordersPerPage, filteredOrders.length)} of {filteredOrders.length}
              </p>
              <div className="flex items-center gap-2">
                <button type="button" disabled={orderPage === 1} onClick={() => setOrderPage((page) => Math.max(1, page - 1))} className="rounded-xl border border-slate-200 px-4 py-2 font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
                <span className="rounded-xl bg-blue-50 px-4 py-2 text-sm font-extrabold text-blue-700">Page {orderPage} of {totalOrderPages}</span>
                <button type="button" disabled={orderPage === totalOrderPages} onClick={() => setOrderPage((page) => Math.min(totalOrderPages, page + 1))} className="rounded-xl bg-blue-700 px-4 py-2 font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </section>
      </div>

      {selectedProof?.proof_photo_url && (
        <div
          className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/85 p-3 backdrop-blur-sm sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Proof of Delivery"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedProof(null);
            }
          }}
        >
          <div className="flex max-h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-emerald-700">
                  Proof of Delivery
                </p>

                <h2 className="mt-1 truncate text-xl font-extrabold text-blue-950 sm:text-2xl">
                  {selectedProof.booking_no ||
                    `Order #${selectedProof.id}`}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setSelectedProof(null)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-2xl font-bold text-slate-600 transition hover:bg-slate-200"
                aria-label="Close proof viewer"
              >
                ×
              </button>
            </div>

            <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="flex min-h-[320px] items-center justify-center bg-slate-950 p-3 sm:p-6">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selectedProof.proof_photo_url}
                  alt={`Proof of delivery for ${
                    selectedProof.booking_no ||
                    `Order #${selectedProof.id}`
                  }`}
                  className="max-h-[72vh] max-w-full rounded-2xl object-contain shadow-2xl"
                />
              </div>

              <aside className="border-t border-slate-200 bg-white p-5 lg:border-l lg:border-t-0 lg:p-6">
                <div className="space-y-5">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Booking number
                    </p>
                    <p className="mt-1 break-all font-extrabold text-blue-950">
                      {selectedProof.booking_no ||
                        `Order #${selectedProof.id}`}
                    </p>
                  </div>

                  <div className="border-t border-slate-200 pt-5">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Original receiver
                    </p>
                    <p className="mt-1 font-extrabold text-slate-900">
                      {selectedProof.receiver_name || "Not recorded"}
                    </p>
                  </div>

                  <div className="border-t border-slate-200 pt-5">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Received by
                    </p>
                    <p className="mt-1 font-extrabold text-emerald-700">
                      {selectedProof.received_by || "Not recorded"}
                    </p>
                  </div>

                  <div className="border-t border-slate-200 pt-5">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Proof submitted
                    </p>
                    <p className="mt-1 font-extrabold text-slate-900">
                      {formatDate(selectedProof.proof_submitted_at)}
                    </p>
                  </div>

                  <div className="border-t border-slate-200 pt-5">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Signature
                    </p>

                    {selectedProof.receiver_signature_url ? (
                      <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white p-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={selectedProof.receiver_signature_url}
                          alt={`Receiver signature for ${
                            selectedProof.booking_no ||
                            `Order #${selectedProof.id}`
                          }`}
                          className="h-32 w-full object-contain"
                        />
                      </div>
                    ) : (
                      <p className="mt-1 font-bold text-slate-500">
                        Not yet added
                      </p>
                    )}
                  </div>

                  <a
                    href={selectedProof.proof_photo_url}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-2xl bg-blue-700 px-5 py-4 text-center font-extrabold text-white transition hover:bg-blue-800"
                  >
                    ↗ Open Original Photo
                  </a>

                  <button
                    type="button"
                    onClick={() => setSelectedProof(null)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 font-extrabold text-slate-700 transition hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>
              </aside>
            </div>
          </div>
        </div>
      )}

      <footer className="hidden">
        <p className="font-semibold">
          © 2026 Barangay Express Admin Portal
        </p>

        <p className="mt-1 text-sm">Fast • Safe • Local</p>
      </footer>

         {newBookingAlert && (
        <div className="fixed bottom-5 right-4 z-[100] w-[calc(100%-2rem)] max-w-sm rounded-3xl border border-sky-200 bg-white p-5 shadow-2xl shadow-blue-300/40 sm:right-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-sky-500 text-2xl text-white">
              🔔
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-500">
                New booking received
              </p>

              <h3 className="mt-1 break-all text-lg font-extrabold text-blue-950">
                {newBookingAlert.bookingNo}
              </h3>

              <p className="mt-1 text-sm font-semibold text-slate-600">
                Customer: {newBookingAlert.senderName}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setNewBookingAlert(null)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 font-bold text-slate-500 hover:bg-slate-200"
              aria-label="Close notification"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Floating Action Center */}
      <div className="fixed bottom-5 right-5 z-[120] flex flex-col items-end gap-3">
        {true && (
          <button
            type="button"
            onClick={scrollBackToTop}
            aria-label="Back to top"
            title="Back to top"
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-xl shadow-xl shadow-slate-300/60 transition hover:-translate-y-1 hover:border-blue-300 hover:bg-blue-50 focus:outline-none focus:ring-4 focus:ring-blue-100"
          >
            ⬆️
          </button>
        )}

        <button
          type="button"
          onClick={refreshDashboardData}
          disabled={isAutoRefreshing}
          aria-label="Refresh dashboard"
          title="Refresh dashboard"
          className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-200 bg-blue-700 text-xl text-white shadow-xl shadow-blue-300/60 transition hover:-translate-y-1 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className={isAutoRefreshing ? "animate-spin" : ""}>🔄</span>
        </button>

        <button
          type="button"
          onClick={() => setSoundEnabled((current) => !current)}
          aria-label={
            soundEnabled
              ? "Turn off notification sounds"
              : "Turn on notification sounds"
          }
          title={
            soundEnabled
              ? "Notification sounds on"
              : "Notification sounds off"
          }
          className={`flex h-12 w-12 items-center justify-center rounded-2xl border text-xl shadow-xl transition hover:-translate-y-1 focus:outline-none focus:ring-4 ${
            soundEnabled
              ? "border-emerald-300 bg-emerald-600 text-white shadow-emerald-300/60 focus:ring-emerald-200"
              : "border-slate-200 bg-white text-slate-700 shadow-slate-300/60 focus:ring-slate-200"
          }`}
        >
          {soundEnabled ? "🔔" : "🔕"}
        </button>
      </div>
      </div>
    </main>
  );
}
