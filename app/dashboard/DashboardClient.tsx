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
  status: string | null;
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
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const [unreadActivityCount, setUnreadActivityCount] = useState(0);

  function navigateFromStatCard(sectionId: string, status?: string) {
  if (status) {
    setFilterStatus(status);
  }

  window.setTimeout(() => {
    scrollToSection(sectionId);
  }, 100);
}
function scrollBackToTop() {
  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
}
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

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="relative overflow-visible bg-gradient-to-r from-blue-950 via-blue-800 to-sky-600 px-4 py-7 text-white shadow-xl md:px-6">
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
              className="rounded-2xl border border-white/20 bg-white/10 px-5 py-3 font-bold text-white backdrop-blur transition hover:bg-white/20"
            >
              + New Booking
            </a>
            <a
              href="/dashboard/riders"
              className="rounded-2xl border border-white/20 bg-white/10 px-5 py-3 font-bold text-white backdrop-blur transition hover:bg-white/20"
            >
              🏍️ Manage Riders
            </a>
            <a
              href="/dashboard/rider-wallets"
              className="rounded-2xl border border-white/20 bg-white/10 px-5 py-3 font-bold text-white backdrop-blur transition hover:bg-white/20"
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
              className="rounded-2xl bg-white px-5 py-3 font-extrabold text-blue-800 shadow-lg transition hover:-translate-y-0.5 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
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
              className="rounded-2xl border border-white/20 bg-white/10 px-5 py-3 font-bold text-white backdrop-blur transition hover:bg-white/20 disabled:cursor-default disabled:bg-emerald-500/30"
            >
              {soundEnabled ? "🔔 Sound Enabled" : "🔕 Enable Sound Alerts"}
            </button>

            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-10">
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
{/* Statistics */}
<section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
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



{/* Quick Navigation */}
<nav className="sticky top-3 z-[80] mt-6">
  <div className="flex gap-2 overflow-x-auto rounded-2xl border border-blue-100 bg-white/95 p-2 shadow-xl shadow-slate-200/60 backdrop-blur">
    {[
      {
        id: "operations-section",
        icon: "⚙️",
        label: "Operations",
      },
      {
        id: "payments-section",
        icon: "💳",
        label: "Payments",
      },
      {
        id: "rider-map-section",
        icon: "🗺️",
        label: "Rider Map",
      },
      {
        id: "reviews-section",
        icon: "⭐",
        label: "Reviews",
      },
      {
        id: "analytics-section",
        icon: "📊",
        label: "Analytics",
      },
      {
        id: "orders-section",
        icon: "📦",
        label: "Orders",
      },
    ].map((item) => (
      <button
        key={item.id}
        type="button"
        onClick={() => scrollToSection(item.id)}
        className="shrink-0 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-extrabold text-slate-700 transition hover:border-blue-600 hover:bg-blue-700 hover:text-white"
      >
        <span className="mr-2">{item.icon}</span>
        {item.label}
      </button>
    ))}
  </div>
</nav>

<div id="operations-section" className="scroll-mt-28">
  <OperationsCenter />
</div>

<div id="payments-section" className="scroll-mt-28">
  <PaymentsCenter />
</div>
{/* Live Admin Dispatch Map */}
<section
  id="rider-map-section"
  className="scroll-mt-28 mt-8 overflow-hidden rounded-[2rem] border border-blue-100 bg-white shadow-xl shadow-blue-100/60"
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

          <div className="p-5 md:p-8">
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
  className="scroll-mt-28 mt-8 overflow-hidden rounded-[2rem] border border-amber-100 bg-white shadow-xl shadow-amber-100/60"
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

          <div className="p-5 md:p-8">
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
                <div className="mt-5 space-y-3">
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
  className="scroll-mt-28 mt-8 overflow-hidden rounded-[2rem] border border-blue-100 bg-white shadow-xl shadow-slate-200/60"
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

          <div className="p-5 md:p-8">
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

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
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

                <div className="mt-5 space-y-3">
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
                  <div className="mt-5 space-y-3">
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
  className="scroll-mt-28 mt-10"
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
            <div className="space-y-6">
              {filteredOrders.map((order) => {
                const currentStatus = order.status || "Pending";
                const orderReview = reviewsByOrderId.get(order.id);

                return (
                  <article
                    key={order.id}
                    className="overflow-hidden rounded-[2rem] border border-blue-100 bg-white shadow-xl shadow-slate-200/60"
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

      <footer className="mt-12 bg-blue-950 px-6 py-8 text-center text-blue-200">
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
    </main>
  );
}
