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
  useMapEvents,
} from "react-leaflet";

export type MapPoint = {
  latitude: number;
  longitude: number;
};

type BookingMapPickerProps = {
  pickup: MapPoint | null;
  dropoff: MapPoint | null;
  onPickupChange: (point: MapPoint) => void;
  onDropoffChange: (point: MapPoint) => void;
  onRouteChange: (
    distanceKm: number | null,
    durationMinutes: number | null
  ) => void;
};

type RouteResult = {
  coordinates: [number, number][];
  distance_meters: number;
  duration_seconds: number;
};

function emojiIcon(emoji: string, background: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:46px;height:46px;display:flex;align-items:center;justify-content:center;border-radius:999px;background:${background};border:4px solid white;box-shadow:0 10px 24px rgba(15,23,42,.28);font-size:22px">${emoji}</div>`,
    iconSize: [46, 46],
    iconAnchor: [23, 23],
    popupAnchor: [0, -26],
  });
}

function MapClickHandler({
  mode,
  onPickupChange,
  onDropoffChange,
}: {
  mode: "pickup" | "dropoff";
  onPickupChange: (point: MapPoint) => void;
  onDropoffChange: (point: MapPoint) => void;
}) {
  useMapEvents({
    click(event) {
      const point: MapPoint = {
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
      };

      if (mode === "pickup") {
        onPickupChange(point);
      } else {
        onDropoffChange(point);
      }
    },
  });

  return null;
}

function FitMap({
  pickup,
  dropoff,
  route,
}: {
  pickup: MapPoint | null;
  dropoff: MapPoint | null;
  route: [number, number][];
}) {
  const map = useMap();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      map.invalidateSize();

      const points: [number, number][] = [...route];

      if (pickup) {
        points.push([pickup.latitude, pickup.longitude]);
      }

      if (dropoff) {
        points.push([dropoff.latitude, dropoff.longitude]);
      }

      if (points.length > 1) {
        map.fitBounds(points, {
          padding: [45, 45],
          maxZoom: 17,
        });
      } else if (points.length === 1) {
        map.flyTo(points[0], 16);
      }
    }, 120);

    return () => window.clearTimeout(timer);
  }, [
    pickup?.latitude,
    pickup?.longitude,
    dropoff?.latitude,
    dropoff?.longitude,
    route,
    map,
  ]);

  return null;
}

async function fetchRoute(pickup: MapPoint, dropoff: MapPoint) {
  const params = new URLSearchParams({
    start_lat: String(pickup.latitude),
    start_lng: String(pickup.longitude),
    end_lat: String(dropoff.latitude),
    end_lng: String(dropoff.longitude),
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

export default function BookingMapPicker({
  pickup,
  dropoff,
  onPickupChange,
  onDropoffChange,
  onRouteChange,
}: BookingMapPickerProps) {
  const [mode, setMode] = useState<"pickup" | "dropoff">("pickup");
  const [route, setRoute] = useState<[number, number][]>([]);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [routeError, setRouteError] = useState("");

  const pickupIcon = useMemo(() => emojiIcon("📦", "#16a34a"), []);
  const dropoffIcon = useMemo(() => emojiIcon("🏁", "#dc2626"), []);

  useEffect(() => {
    if (!pickup || !dropoff) {
      setRoute([]);
      setRouteError("");
      onRouteChange(null, null);
      return;
    }

    const pickupPoint: MapPoint = {
      latitude: pickup.latitude,
      longitude: pickup.longitude,
    };

    const dropoffPoint: MapPoint = {
      latitude: dropoff.latitude,
      longitude: dropoff.longitude,
    };

    let cancelled = false;

    async function loadRoute() {
      setLoadingRoute(true);
      setRouteError("");

      try {
        const result = await fetchRoute(pickupPoint, dropoffPoint);

        if (cancelled) return;

        setRoute(result.coordinates);
        onRouteChange(
          result.distance_meters / 1000,
          Math.max(1, Math.round(result.duration_seconds / 60))
        );
      } catch (error) {
        if (cancelled) return;

        setRoute([
          [pickupPoint.latitude, pickupPoint.longitude],
          [dropoffPoint.latitude, dropoffPoint.longitude],
        ]);
        onRouteChange(null, null);
        setRouteError(
          error instanceof Error
            ? error.message
            : "Hindi makuha ang route."
        );
      } finally {
        if (!cancelled) {
          setLoadingRoute(false);
        }
      }
    }

    void loadRoute();

    return () => {
      cancelled = true;
    };
  }, [
    pickup?.latitude,
    pickup?.longitude,
    dropoff?.latitude,
    dropoff?.longitude,
    onRouteChange,
  ]);

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setRouteError("Hindi supported ng browser ang GPS.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point: MapPoint = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };

        if (mode === "pickup") {
          onPickupChange(point);
          setMode("dropoff");
        } else {
          onDropoffChange(point);
        }
      },
      () => setRouteError("Hindi makuha ang current location."),
      {
        enableHighAccuracy: true,
        timeout: 15000,
      }
    );
  }

  const defaultCenter: [number, number] = pickup
    ? [pickup.latitude, pickup.longitude]
    : [14.092, 121.045];

  return (
    <section className="rounded-3xl border border-emerald-100 bg-white p-5 md:p-7">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-emerald-600">
            Map location
          </p>
          <h2 className="text-xl font-extrabold text-blue-950">
            Select pickup and drop-off pins
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Piliin muna ang mode, pagkatapos mag-click sa mapa.
          </p>
        </div>

        <button
          type="button"
          onClick={useCurrentLocation}
          className="rounded-2xl bg-emerald-600 px-4 py-3 font-extrabold text-white transition hover:bg-emerald-700"
        >
          📍 Use Current Location
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setMode("pickup")}
          className={`rounded-2xl border px-4 py-3 font-extrabold transition ${
            mode === "pickup"
              ? "border-emerald-600 bg-emerald-600 text-white"
              : "border-slate-200 bg-white text-slate-700"
          }`}
        >
          📦 Set Pickup
        </button>

        <button
          type="button"
          onClick={() => setMode("dropoff")}
          className={`rounded-2xl border px-4 py-3 font-extrabold transition ${
            mode === "dropoff"
              ? "border-red-600 bg-red-600 text-white"
              : "border-slate-200 bg-white text-slate-700"
          }`}
        >
          🏁 Set Drop-off
        </button>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200">
        <MapContainer
          center={defaultCenter}
          zoom={14}
          scrollWheelZoom
          style={{ width: "100%", height: 430 }}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapClickHandler
            mode={mode}
            onPickupChange={(point) => {
              onPickupChange(point);
              setMode("dropoff");
            }}
            onDropoffChange={onDropoffChange}
          />

          {route.length > 1 && (
            <Polyline
              positions={route}
              pathOptions={{
                weight: 7,
                opacity: 0.85,
              }}
            />
          )}

          {pickup && (
            <Marker
              position={[pickup.latitude, pickup.longitude]}
              icon={pickupIcon}
              draggable
              eventHandlers={{
                dragend(event) {
                  const marker = event.target as L.Marker;
                  const point = marker.getLatLng();

                  onPickupChange({
                    latitude: point.lat,
                    longitude: point.lng,
                  });
                },
              }}
            >
              <Popup>Pickup location</Popup>
            </Marker>
          )}

          {dropoff && (
            <Marker
              position={[dropoff.latitude, dropoff.longitude]}
              icon={dropoffIcon}
              draggable
              eventHandlers={{
                dragend(event) {
                  const marker = event.target as L.Marker;
                  const point = marker.getLatLng();

                  onDropoffChange({
                    latitude: point.lat,
                    longitude: point.lng,
                  });
                },
              }}
            >
              <Popup>Drop-off location</Popup>
            </Marker>
          )}

          <FitMap pickup={pickup} dropoff={dropoff} route={route} />
        </MapContainer>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">
            Pickup coordinates
          </p>
          <p className="mt-1 font-extrabold text-slate-900">
            {pickup
              ? `${pickup.latitude.toFixed(6)}, ${pickup.longitude.toFixed(6)}`
              : "Not selected"}
          </p>
        </div>

        <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-red-600">
            Drop-off coordinates
          </p>
          <p className="mt-1 font-extrabold text-slate-900">
            {dropoff
              ? `${dropoff.latitude.toFixed(6)}, ${dropoff.longitude.toFixed(6)}`
              : "Not selected"}
          </p>
        </div>
      </div>

      {loadingRoute && (
        <p className="mt-4 font-bold text-blue-700">
          Calculating road route...
        </p>
      )}

      {routeError && (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 font-semibold text-amber-700">
          ⚠️ {routeError}
        </p>
      )}
    </section>
  );
}