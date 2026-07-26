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

type MapPoint = {
  latitude: number;
  longitude: number;
};

type RouteResult = {
  coordinates: [number, number][];
  distance_meters: number;
  duration_seconds: number;
};

type RiderLiveMapProps = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  updatedAt?: Date | null;
  pickup?: MapPoint | null;
  dropoff?: MapPoint | null;
  pickupAddress?: string | null;
  dropoffAddress?: string | null;
  orderStatus?: string | null;
};

function markerIcon(emoji: string, background: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:46px;height:46px;display:flex;align-items:center;justify-content:center;border-radius:999px;background:${background};border:4px solid white;box-shadow:0 8px 22px rgba(0,0,0,.28);font-size:24px">${emoji}</div>`,
    iconSize: [46, 46],
    iconAnchor: [23, 23],
    popupAnchor: [0, -25],
  });
}

async function fetchRoute(start: MapPoint, end: MapPoint) {
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
    throw new Error(result.error || "Hindi makuha ang route.");
  }

  return result.route as RouteResult;
}

function FitMap({
  rider,
  destination,
  route,
}: {
  rider: MapPoint;
  destination: MapPoint | null;
  route: [number, number][];
}) {
  const map = useMap();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      map.invalidateSize();

      if (!destination) {
        map.flyTo([rider.latitude, rider.longitude], 17);
        return;
      }

      const points: [number, number][] =
        route.length > 1
          ? [...route]
          : [
              [rider.latitude, rider.longitude],
              [destination.latitude, destination.longitude],
            ];

      if (points.length > 1) {
        map.fitBounds(points, {
          padding: [45, 45],
          maxZoom: 17,
        });
      } else {
        map.flyTo([rider.latitude, rider.longitude], 17);
      }
    }, 120);

    return () => window.clearTimeout(timer);
  }, [
    rider.latitude,
    rider.longitude,
    destination?.latitude,
    destination?.longitude,
    route,
    map,
  ]);

  return null;
}

function destinationForStatus(
  status: string | null,
  pickup: MapPoint | null,
  dropoff: MapPoint | null
) {
  if (["Delivered", "Completed", "Cancelled"].includes(status || "")) {
    return null;
  }

  if (["Picked Up", "In Transit"].includes(status || "")) {
    return dropoff ?? pickup;
  }

  return pickup ?? dropoff;
}

function navigationLabel(status: string | null) {
  if (["Picked Up", "In Transit"].includes(status || "")) {
    return "Drop-off";
  }

  if (["Delivered", "Completed", "Cancelled"].includes(status || "")) {
    return "Completed";
  }

  return "Pickup";
}

function directionsUrl(
  origin: MapPoint,
  destination: MapPoint | null
) {
  if (!destination) return "#";

  const params = new URLSearchParams({
    api: "1",
    origin: `${origin.latitude},${origin.longitude}`,
    destination: `${destination.latitude},${destination.longitude}`,
    travelmode: "driving",
    dir_action: "navigate",
  });

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export default function RiderLiveMap({
  latitude,
  longitude,
  accuracy = null,
  updatedAt = null,
  pickup = null,
  dropoff = null,
  pickupAddress = null,
  dropoffAddress = null,
  orderStatus = null,
}: RiderLiveMapProps) {
  const riderIcon = useMemo(() => markerIcon("🏍️", "#111827"), []);
  const pickupIcon = useMemo(() => markerIcon("📦", "#16a34a"), []);
  const dropoffIcon = useMemo(() => markerIcon("🏁", "#dc2626"), []);

  const [route, setRoute] = useState<[number, number][]>([]);
  const [routeError, setRouteError] = useState("");
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);

  const rider = useMemo(
    () => ({ latitude, longitude }),
    [latitude, longitude]
  );

  const destination = useMemo(
    () => destinationForStatus(orderStatus, pickup, dropoff),
    [orderStatus, pickup, dropoff]
  );

  const activeDestinationLabel = navigationLabel(orderStatus);

  useEffect(() => {
    if (!destination) {
      setRoute([]);
      setRouteError("");
      setDistanceMeters(null);
      setDurationSeconds(null);
      return;
    }

    const destinationPoint: MapPoint = {
      latitude: destination.latitude,
      longitude: destination.longitude,
    };

    let cancelled = false;

    void fetchRoute(rider, destinationPoint)
      .then((result) => {
        if (cancelled) return;
        setRoute(result.coordinates);
        setDistanceMeters(result.distance_meters);
        setDurationSeconds(result.duration_seconds);
        setRouteError("");
      })
      .catch(() => {
        if (cancelled) return;

        setRoute([
          [rider.latitude, rider.longitude],
          [destinationPoint.latitude, destinationPoint.longitude],
        ]);
        setDistanceMeters(null);
        setDurationSeconds(null);
        setRouteError("Road route unavailable; straight line muna.");
      });

    return () => {
      cancelled = true;
    };
  }, [rider, destination]);

  return (
    <div>
      <div
        style={{
          marginBottom: 12,
          padding: 14,
          borderRadius: 16,
          background:
            activeDestinationLabel === "Pickup"
              ? "#ecfdf5"
              : activeDestinationLabel === "Drop-off"
                ? "#fff1f2"
                : "#f1f5f9",
          border: "1px solid #dbeafe",
        }}
      >
        <strong style={{ color: "#0f172a", fontSize: 18 }}>
          {activeDestinationLabel === "Pickup"
            ? "🏍️ Rider → 📦 Pickup"
            : activeDestinationLabel === "Drop-off"
              ? "🏍️ Rider → 🏁 Drop-off"
              : "✅ Delivery completed"}
        </strong>
      </div>

      <div
        style={{
          overflow: "hidden",
          borderRadius: 18,
          border: "1px solid #e5e7eb",
          background: "#f8fafc",
        }}
      >
        <MapContainer
          center={[latitude, longitude]}
          zoom={17}
          scrollWheelZoom
          style={{ width: "100%", height: 390 }}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {route.length > 1 && (
            <Polyline
              positions={route}
              pathOptions={{ weight: 7, opacity: 0.85 }}
            />
          )}

          {pickup && (
            <Marker
              position={[pickup.latitude, pickup.longitude]}
              icon={pickupIcon}
            >
              <Popup>
                <strong>Pickup point</strong>
                <br />
                {pickupAddress || "No pickup address"}
              </Popup>
            </Marker>
          )}

          <Marker position={[latitude, longitude]} icon={riderIcon}>
            <Popup>
              <strong>Current rider location</strong>
              <br />
              {accuracy !== null
                ? `Accuracy: approximately ${Math.round(accuracy)} meters`
                : "Accuracy unavailable"}
              <br />
              {updatedAt
                ? `Updated: ${updatedAt.toLocaleTimeString()}`
                : "Waiting for update"}
            </Popup>
          </Marker>

          {dropoff && (
            <Marker
              position={[dropoff.latitude, dropoff.longitude]}
              icon={dropoffIcon}
            >
              <Popup>
                <strong>Drop-off point</strong>
                <br />
                {dropoffAddress || "No drop-off address"}
              </Popup>
            </Marker>
          )}

          <FitMap
            rider={rider}
            destination={destination}
            route={route}
          />
        </MapContainer>
      </div>

      {destination ? (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: 10,
              marginTop: 12,
            }}
          >
            <div style={{ borderRadius: 14, padding: 14, background: "#dbeafe" }}>
              <small style={{ fontWeight: 800, color: "#64748b" }}>
                REMAINING DISTANCE
              </small>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 22,
                  fontWeight: 900,
                  color: "#0f172a",
                  opacity: 1,
                }}
              >
                {distanceMeters === null
                  ? "Calculating..."
                  : distanceMeters < 1000
                    ? `${Math.round(distanceMeters)} m`
                    : `${(distanceMeters / 1000).toFixed(1)} km`}
              </div>
            </div>

            <div style={{ borderRadius: 14, padding: 14, background: "#d1fae5" }}>
              <small style={{ fontWeight: 800, color: "#64748b" }}>
                ESTIMATED ARRIVAL
              </small>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 22,
                  fontWeight: 900,
                  color: "#0f172a",
                  opacity: 1,
                }}
              >
                {durationSeconds === null
                  ? "Calculating..."
                  : `${Math.max(1, Math.round(durationSeconds / 60))} min`}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <a
              href={directionsUrl(rider, destination)}
              target="_blank"
              rel="noreferrer"
              style={{
                borderRadius: 12,
                padding: "11px 15px",
                background:
                  activeDestinationLabel === "Pickup" ? "#dcfce7" : "#fee2e2",
                color:
                  activeDestinationLabel === "Pickup" ? "#166534" : "#991b1b",
                fontWeight: 800,
                textDecoration: "none",
              }}
            >
              {activeDestinationLabel === "Pickup" ? "📦" : "🏁"} Navigate to{" "}
              {activeDestinationLabel}
            </a>
          </div>
        </>
      ) : (
        <div
          style={{
            marginTop: 12,
            borderRadius: 14,
            padding: 14,
            background: "#dcfce7",
            color: "#166534",
            fontWeight: 900,
          }}
        >
          ✅ Tapos na ang delivery. Wala nang active navigation route.
        </div>
      )}

      {routeError && (
        <p
          style={{
            marginTop: 10,
            color: "#92400e",
            fontWeight: 700,
          }}
        >
          ⚠️ {routeError}
        </p>
      )}
    </div>
  );
}