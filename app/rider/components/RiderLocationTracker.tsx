"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

const RiderLiveMap = dynamic(() => import("./RiderLiveMap"), {
  ssr: false,
  loading: () => (
    <div style={{ height: 340, display: "grid", placeItems: "center", borderRadius: 18, border: "1px solid #e5e7eb", background: "#f8fafc", color: "#64748b" }}>
      Loading map…
    </div>
  ),
});

type TrackerStatus = "idle" | "requesting" | "sharing" | "weak-signal" | "error";
type MapPoint = { latitude: number; longitude: number };

export type ActiveRiderOrder = {
  bookingNo: string | null;
  status: string | null;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  pickup: MapPoint | null;
  dropoff: MapPoint | null;
};

type LastLocation = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  updatedAt: Date;
};

const MAX_ACCURACY = 100;
const GOOD_ACCURACY = 50;

export default function RiderLocationTracker({
  activeOrder = null,
}: {
  activeOrder?: ActiveRiderOrder | null;
}) {
  const watchIdRef = useRef<number | null>(null);
  const sendingRef = useRef(false);
  const lastSentAtRef = useRef(0);

  const [status, setStatus] = useState<TrackerStatus>("idle");
  const [message, setMessage] = useState(
    "I-on ang live location kapag nagsisimula ka nang bumiyahe."
  );
  const [lastLocation, setLastLocation] = useState<LastLocation | null>(null);
  const [latestAccuracy, setLatestAccuracy] = useState<number | null>(null);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  async function sendLocation(position: GeolocationPosition) {
    const now = Date.now();
    const accuracy = Number.isFinite(position.coords.accuracy)
      ? position.coords.accuracy
      : null;

    setLatestAccuracy(accuracy);

    if (accuracy === null || accuracy > MAX_ACCURACY) {
      setStatus("weak-signal");
      setMessage(
        accuracy === null
          ? "Hindi mabasa ang GPS accuracy. Lumabas sa open area."
          : `Mahina ang GPS signal (±${Math.round(
              accuracy
            )} m). Hindi muna sine-save ang lokasyon. Hintayin na bumaba sa ±${MAX_ACCURACY} m o mas mababa.`
      );
      return;
    }

    if (sendingRef.current || now - lastSentAtRef.current < 5000) return;
    if (!supabase) throw new Error("Missing Supabase environment variables.");

    sendingRef.current = true;

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Walang active rider session. Mag-login ulit.");
      }

      const response = await fetch("/api/rider/location", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy,
          heading: position.coords.heading,
          speed: position.coords.speed,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Hindi ma-save ang rider location.");
      }

      lastSentAtRef.current = now;
      setLastLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy,
        updatedAt: new Date(),
      });

      setStatus("sharing");
      setMessage(
        accuracy <= GOOD_ACCURACY
          ? `Live location is active. Good GPS accuracy (±${Math.round(accuracy)} m).`
          : `Live location is active. Acceptable GPS accuracy (±${Math.round(accuracy)} m).`
      );
    } finally {
      sendingRef.current = false;
    }
  }

  function handlePositionError(error: GeolocationPositionError) {
    let text = "Hindi makuha ang GPS location.";

    if (error.code === error.PERMISSION_DENIED) {
      text = "I-allow ang Location at Precise Location sa browser settings.";
    } else if (error.code === error.POSITION_UNAVAILABLE) {
      text = "Hindi available ang GPS signal. Lumabas muna sa open area.";
    } else if (error.code === error.TIMEOUT) {
      text = "Nag-timeout ang GPS. Subukan ulit sa open area.";
    }

    setStatus("error");
    setMessage(text);
  }

  function startTracking() {
    if (!navigator.geolocation) {
      setStatus("error");
      setMessage("Hindi supported ng browser na ito ang GPS tracking.");
      return;
    }

    if (!window.isSecureContext) {
      setStatus("error");
      setMessage("Kailangan ng HTTPS o localhost para gumana ang GPS.");
      return;
    }

    if (watchIdRef.current !== null) return;

    setStatus("requesting");
    setMessage("Kinukuha ang precise GPS location…");

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        void sendLocation(position).catch((error: unknown) => {
          setStatus("error");
          setMessage(
            error instanceof Error ? error.message : "Hindi ma-save ang location."
          );
        });
      },
      handlePositionError,
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20000,
      }
    );
  }

  function stopTracking() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    setStatus("idle");
    setMessage("Naka-off ang live location.");
    setLatestAccuracy(null);
  }

  const isTracking = ["requesting", "sharing", "weak-signal"].includes(status);

  const badgeStyle = {
    idle: { background: "#f1f5f9", color: "#475569" },
    requesting: { background: "#fef3c7", color: "#92400e" },
    sharing: { background: "#dcfce7", color: "#166534" },
    "weak-signal": { background: "#ffedd5", color: "#9a3412" },
    error: { background: "#fee2e2", color: "#991b1b" },
  }[status];

  return (
    <section style={{ marginBottom: 24, padding: 20, borderRadius: 22, background: "#fff", border: "1px solid #e5e7eb", boxShadow: "0 12px 35px rgba(15,23,42,.06)" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 14, marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, color: "#0f172a" }}>📍 Rider Live Location</h2>
          <p style={{ margin: "6px 0 0", color: "#64748b" }}>{message}</p>
        </div>

        <span style={{ ...badgeStyle, padding: "8px 12px", borderRadius: 999, fontSize: 13, fontWeight: 800 }}>
          {status === "sharing" ? "● LIVE" : status === "requesting" ? "Connecting…" : status === "weak-signal" ? "Weak GPS" : status === "error" ? "Needs attention" : "Offline"}
        </span>
      </div>

      {status === "weak-signal" && (
        <div style={{ marginBottom: 16, padding: 14, borderRadius: 14, border: "1px solid #fed7aa", background: "#fff7ed", color: "#9a3412", fontWeight: 700, lineHeight: 1.6 }}>
          ⚠️ Hindi muna sine-save o ipinapakita ang location dahil mahina ang GPS signal. Gumamit ng rider phone, i-on ang Precise Location, at pumunta sa open area.
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: lastLocation ? 18 : 0 }}>
        <button
          type="button"
          onClick={isTracking ? stopTracking : startTracking}
          style={{ border: 0, borderRadius: 12, padding: "12px 17px", cursor: "pointer", background: isTracking ? "#dc2626" : "#16a34a", color: "#fff", fontWeight: 800 }}
        >
          {isTracking ? "■ Stop Live Location" : "▶ Start Live Location"}
        </button>

        {lastLocation && (
          <a
            href={`https://www.google.com/maps?q=${lastLocation.latitude},${lastLocation.longitude}`}
            target="_blank"
            rel="noreferrer"
            style={{ borderRadius: 12, padding: "12px 17px", background: "#eff6ff", color: "#1d4ed8", fontWeight: 800, textDecoration: "none" }}
          >
            Open in Google Maps
          </a>
        )}
      </div>

      {latestAccuracy !== null && (
        <div style={{ marginBottom: 14, padding: 12, borderRadius: 12, background: latestAccuracy <= GOOD_ACCURACY ? "#ecfdf5" : latestAccuracy <= MAX_ACCURACY ? "#fefce8" : "#fff7ed", color: latestAccuracy <= GOOD_ACCURACY ? "#166534" : latestAccuracy <= MAX_ACCURACY ? "#854d0e" : "#9a3412", fontWeight: 800 }}>
          Current GPS accuracy: ±{Math.round(latestAccuracy)} m
          {latestAccuracy > MAX_ACCURACY ? " — blocked" : latestAccuracy <= GOOD_ACCURACY ? " — good" : " — acceptable"}
        </div>
      )}

      {lastLocation ? (
        <>
          <RiderLiveMap
            latitude={lastLocation.latitude}
            longitude={lastLocation.longitude}
            accuracy={lastLocation.accuracy}
            updatedAt={lastLocation.updatedAt}
            pickup={activeOrder?.pickup ?? null}
            dropoff={activeOrder?.dropoff ?? null}
            pickupAddress={activeOrder?.pickupAddress ?? null}
            dropoffAddress={activeOrder?.dropoffAddress ?? null}
            orderStatus={activeOrder?.status ?? null}
          />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginTop: 14 }}>
            <InfoBox label="Latitude" value={lastLocation.latitude.toFixed(6)} />
            <InfoBox label="Longitude" value={lastLocation.longitude.toFixed(6)} />
            <InfoBox label="GPS accuracy" value={lastLocation.accuracy !== null ? `±${Math.round(lastLocation.accuracy)} m` : "Unavailable"} />
            <InfoBox label="Last updated" value={lastLocation.updatedAt.toLocaleTimeString("en-PH")} />
          </div>
        </>
      ) : (
        <div style={{ minHeight: 180, display: "grid", placeItems: "center", borderRadius: 18, border: "1px dashed #cbd5e1", background: "#f8fafc", color: "#64748b", textAlign: "center", padding: 20 }}>
          {status === "weak-signal"
            ? "Naghihintay ng mas accurate na GPS signal. Hindi ipapakita ang maling lokasyon."
            : "Pindutin ang “Start Live Location” para lumabas ang iyong kasalukuyang lokasyon sa mapa."}
        </div>
      )}
    </section>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: 13, borderRadius: 13, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>{label}</div>
      <div style={{ color: "#0f172a", fontWeight: 800, overflowWrap: "anywhere" }}>{value}</div>
    </div>
  );
}