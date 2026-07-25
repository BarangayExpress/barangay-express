"use client";

import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";

type Point = {
  latitude: number;
  longitude: number;
};

type RouteResult = {
  coordinates: [number, number][];
  distance_meters: number;
  duration_seconds: number;
};

type CustomerLiveMapProps = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  updatedAt: string;
  pickup?: Point | null;
  dropoff?: Point | null;
  orderStatus?: string | null;
};

function emojiIcon(emoji: string, background: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;border-radius:999px;background:${background};border:4px solid #fff;box-shadow:0 10px 24px rgba(15,23,42,.30);font-size:23px">${emoji}</div>`,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    popupAnchor: [0, -27],
  });
}

function formatDistance(meters: number | null) {
  if (meters === null) return "Unavailable";
  return meters < 1000
    ? `${Math.round(meters)} m`
    : `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return "Unavailable";
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes
    ? `${hours} hr ${remainingMinutes} min`
    : `${hours} hr`;
}

function getNavigationStage(status: string | null) {
  if (["Picked Up", "In Transit"].includes(status || "")) {
    return "dropoff" as const;
  }

  if (["Delivered", "Completed", "Cancelled"].includes(status || "")) {
    return "done" as const;
  }

  return "pickup" as const;
}

function getStatusMessage(status: string | null) {
  switch (status) {
    case "Pending":
      return ["⏳", "Waiting for a rider", "Your booking is waiting to be accepted."];
    case "Accepted":
      return ["✅", "Rider accepted your booking", "Your rider is preparing to travel to the pickup point."];
    case "Heading to Pickup":
      return ["🏍️", "Rider is heading to pickup", "Please prepare the package for collection."];
    case "Picked Up":
      return ["📦", "Package picked up", "Your package is now with the rider."];
    case "In Transit":
      return ["🚚", "Package is on the way", "The rider is travelling to the drop-off point."];
    case "Delivered":
      return ["🎉", "Package delivered", "The delivery has reached its destination."];
    case "Completed":
      return ["✅", "Delivery completed", "Thank you for using Barangay Express."];
    case "Cancelled":
      return ["❌", "Booking cancelled", "This delivery is no longer active."];
    default:
      return ["📍", "Tracking your delivery", "Live updates will appear here."];
  }
}

async function fetchRoadRoute(start: Point, end: Point) {
  const params = new URLSearchParams({
    start_lat: String(start.latitude),
    start_lng: String(start.longitude),
    end_lat: String(end.latitude),
    end_lng: String(end.longitude),
  });

  const response = await fetch(`/api/route?${params.toString()}`, {
    cache: "no-store",
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.error || "No road route was found.");
  }

  return result.route as RouteResult;
}

function FitDeliveryMap({
  rider,
  destination,
  routeCoordinates,
}: {
  rider: Point;
  destination: Point | null;
  routeCoordinates: [number, number][];
}) {
  const map = useMap();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      map.invalidateSize();

      if (!destination) {
        map.flyTo([rider.latitude, rider.longitude], 17, {
          animate: true,
          duration: 0.8,
        });
        return;
      }

      const points: [number, number][] =
        routeCoordinates.length > 1
          ? [...routeCoordinates]
          : [
              [rider.latitude, rider.longitude],
              [destination.latitude, destination.longitude],
            ];

      map.fitBounds(points, {
        padding: [50, 50],
        maxZoom: 17,
        animate: true,
      });
    }, 150);

    return () => window.clearTimeout(timer);
  }, [
    rider.latitude,
    rider.longitude,
    destination?.latitude,
    destination?.longitude,
    routeCoordinates,
    map,
  ]);

  return null;
}

export default function CustomerLiveMap({
  latitude,
  longitude,
  accuracy = null,
  updatedAt,
  pickup = null,
  dropoff = null,
  orderStatus = null,
}: CustomerLiveMapProps) {
  const riderIcon = useMemo(() => emojiIcon("🏍️", "#0f172a"), []);
  const pickupIcon = useMemo(() => emojiIcon("📦", "#16a34a"), []);
  const dropoffIcon = useMemo(() => emojiIcon("🏁", "#dc2626"), []);

  const [roadRoute, setRoadRoute] = useState<[number, number][]>([]);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [routeStatus, setRouteStatus] = useState<
    "idle" | "loading" | "ready" | "fallback"
  >("idle");

  const riderPoint = useMemo(
    () => ({ latitude, longitude }),
    [latitude, longitude]
  );

  const navigationStage = useMemo(
    () => getNavigationStage(orderStatus),
    [orderStatus]
  );

  const destination = useMemo(() => {
    if (navigationStage === "pickup") return pickup;
    if (navigationStage === "dropoff") return dropoff;
    return null;
  }, [navigationStage, pickup, dropoff]);

  const [statusIcon, statusTitle, statusSubtitle] =
    getStatusMessage(orderStatus);

  useEffect(() => {
  if (!destination) {
    setRoadRoute([]);
    setDistanceMeters(null);
    setDurationSeconds(null);
    setRouteStatus("idle");
    return;
  }

  const activeDestination: Point = destination;
  let cancelled = false;

  async function loadRoute() {
    setRouteStatus("loading");

    try {
      const route = await fetchRoadRoute(
        riderPoint,
        activeDestination
      );

      if (cancelled) return;

      setRoadRoute(route.coordinates);
      setDistanceMeters(route.distance_meters);
      setDurationSeconds(route.duration_seconds);
      setRouteStatus("ready");
    } catch {
      if (cancelled) return;

      setRoadRoute([
        [riderPoint.latitude, riderPoint.longitude],
        [
          activeDestination.latitude,
          activeDestination.longitude,
        ],
      ]);

      setDistanceMeters(null);
      setDurationSeconds(null);
      setRouteStatus("fallback");
    }
  }

  void loadRoute();

  return () => {
    cancelled = true;
  };
}, [riderPoint, destination]);

 const canShowDropoffAlert =
  orderStatus === "In Transit" && navigationStage === "dropoff";

const canShowPickupAlert =
  ["Accepted", "Heading to Pickup"].includes(orderStatus || "") &&
  navigationStage === "pickup";

const nearbyMessage =
  distanceMeters !== null
    ? canShowDropoffAlert
      ? distanceMeters <= 50
        ? [
            "🏠",
            "Your rider has arrived",
            "Please meet the rider at the pinned drop-off location.",
          ]
        : distanceMeters <= 200
          ? [
              "🔔",
              "Your rider is nearby",
              "Please prepare to receive your package.",
            ]
          : null
      : canShowPickupAlert && distanceMeters <= 200
        ? [
            "📦",
            "Your rider is near the pickup",
            "Please prepare the package for collection.",
          ]
        : null
    : null;
  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-2xl">
            {statusIcon}
          </div>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-600">
              Current delivery status
            </p>
            <h3 className="mt-1 text-xl font-black text-slate-950">
              {statusTitle}
            </h3>
            <p className="mt-1 text-sm font-medium text-slate-600">
              {statusSubtitle}
            </p>
          </div>
        </div>
      </section>

      {nearbyMessage && (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="text-3xl">{nearbyMessage[0]}</div>
            <div>
              <h3 className="text-lg font-black text-amber-950">
                {nearbyMessage[1]}
              </h3>
              <p className="mt-1 font-medium text-amber-800">
                {nearbyMessage[2]}
              </p>
            </div>
          </div>
        </section>
      )}

      <section
        className={`rounded-2xl border p-4 ${
          navigationStage === "pickup"
            ? "border-emerald-100 bg-emerald-50"
            : navigationStage === "dropoff"
              ? "border-rose-100 bg-rose-50"
              : "border-slate-200 bg-slate-50"
        }`}
      >
        <p className="font-black text-slate-900">
          {navigationStage === "pickup"
            ? "🏍️ Rider → 📦 Pickup"
            : navigationStage === "dropoff"
              ? "🏍️ Rider → 🏁 Drop-off"
              : "✅ No active route"}
        </p>
      </section>

      <div className="overflow-hidden rounded-3xl border border-blue-100">
        <MapContainer
          center={[latitude, longitude]}
          zoom={17}
          scrollWheelZoom
          style={{ width: "100%", height: 430 }}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {roadRoute.length > 1 && navigationStage !== "done" && (
            <Polyline
              positions={roadRoute}
              pathOptions={{
                weight: 7,
                opacity: 0.85,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
          )}

          {pickup && navigationStage !== "done" && (
            <Marker
              position={[pickup.latitude, pickup.longitude]}
              icon={pickupIcon}
              opacity={navigationStage === "pickup" ? 1 : 0.55}
            >
              <Popup>
                <strong>Pickup location</strong>
              </Popup>
            </Marker>
          )}

          <Marker position={[latitude, longitude]} icon={riderIcon}>
            <Popup>
              <strong>Barangay Express rider</strong>
              <br />
              {accuracy !== null
                ? `Accuracy: approximately ${Math.round(accuracy)} meters`
                : "Accuracy unavailable"}
              <br />
              Updated: {new Date(updatedAt).toLocaleTimeString("en-PH")}
            </Popup>
          </Marker>

          {dropoff && navigationStage !== "done" && (
            <Marker
              position={[dropoff.latitude, dropoff.longitude]}
              icon={dropoffIcon}
              opacity={navigationStage === "dropoff" ? 1 : 0.55}
            >
              <Popup>
                <strong>Drop-off destination</strong>
              </Popup>
            </Marker>
          )}

          <FitDeliveryMap
            rider={riderPoint}
            destination={destination}
            routeCoordinates={roadRoute}
          />
        </MapContainer>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <p className="text-xs font-extrabold uppercase tracking-wider text-blue-500">
            Remaining distance
          </p>
          <p className="mt-1 text-xl font-black text-blue-950">
            {routeStatus === "loading"
              ? "Calculating..."
              : navigationStage === "done"
                ? "Completed"
                : formatDistance(distanceMeters)}
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
          <p className="text-xs font-extrabold uppercase tracking-wider text-emerald-600">
            Estimated arrival
          </p>
          <p className="mt-1 text-xl font-black text-emerald-950">
            {routeStatus === "loading"
              ? "Calculating..."
              : navigationStage === "done"
                ? "Completed"
                : formatDuration(durationSeconds)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
            Route status
          </p>
          <p className="mt-1 font-black text-slate-900">
            {navigationStage === "done"
              ? "Delivery completed"
              : routeStatus === "ready"
                ? "Following roads"
                : routeStatus === "fallback"
                  ? "Straight-line fallback"
                  : routeStatus === "loading"
                    ? "Loading route"
                    : "Waiting for destination"}
          </p>
        </div>
      </div>
    </div>
  );
}