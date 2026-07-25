"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";

export type AdminRiderMapItem = {
  orderId: number;
  bookingNo: string;
  status: string;
  riderId: string | null;
  riderName: string | null;
  senderName: string | null;
  receiverName: string | null;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  updatedAt: string;
  pickupLatitude: number | null;
  pickupLongitude: number | null;
  dropoffLatitude: number | null;
  dropoffLongitude: number | null;
};

type AdminLiveMapProps = {
  riders: AdminRiderMapItem[];
  selectedBookingNo: string | null;
  onSelectBooking: (bookingNo: string) => void;
};

function markerIcon(
  emoji: string,
  background: string,
  size = 46
) {
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;border-radius:999px;background:${background};border:4px solid white;box-shadow:0 8px 24px rgba(15,23,42,.32);font-size:${Math.round(
      size * 0.5
    )}px">${emoji}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2)],
  });
}

function FitAllRiders({ riders }: { riders: AdminRiderMapItem[] }) {
  const map = useMap();
  const fitSignature = riders
    .map((rider) =>
      [
        rider.orderId,
        rider.pickupLatitude,
        rider.pickupLongitude,
        rider.dropoffLatitude,
        rider.dropoffLongitude,
      ].join(":")
    )
    .sort()
    .join("|");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      map.invalidateSize();

      if (riders.length === 0) return;

      const points: [number, number][] = [];

      riders.forEach((rider) => {
        points.push([rider.latitude, rider.longitude]);

        if (
          rider.pickupLatitude !== null &&
          rider.pickupLongitude !== null
        ) {
          points.push([
            rider.pickupLatitude,
            rider.pickupLongitude,
          ]);
        }

        if (
          rider.dropoffLatitude !== null &&
          rider.dropoffLongitude !== null
        ) {
          points.push([
            rider.dropoffLatitude,
            rider.dropoffLongitude,
          ]);
        }
      });

      if (points.length === 1) {
        map.flyTo(points[0], 16);
      } else {
        map.fitBounds(points, {
          padding: [55, 55],
          maxZoom: 16,
        });
      }
    }, 150);

    return () => window.clearTimeout(timer);
  }, [fitSignature, map]);

  return null;
}

function formatSpeed(speed: number | null) {
  if (speed === null || !Number.isFinite(speed)) {
    return "Unavailable";
  }

  return `${Math.max(0, speed * 3.6).toFixed(1)} km/h`;
}

function formatAge(updatedAt: string) {
  const ageSeconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(updatedAt).getTime()) / 1000)
  );

  if (ageSeconds < 10) return "Just now";
  if (ageSeconds < 60) return `${ageSeconds}s ago`;

  const minutes = Math.floor(ageSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(updatedAt));
}

export default function AdminLiveMap({
  riders,
  selectedBookingNo,
  onSelectBooking,
}: AdminLiveMapProps) {
  const riderIcon = useMemo(
    () => markerIcon("🏍️", "#172554", 48),
    []
  );
  const selectedRiderIcon = useMemo(
    () => markerIcon("🏍️", "#16a34a", 54),
    []
  );
  const pickupIcon = useMemo(
    () => markerIcon("📦", "#16a34a", 38),
    []
  );
  const dropoffIcon = useMemo(
    () => markerIcon("🏁", "#dc2626", 38),
    []
  );

  const initialCenter: [number, number] =
    riders.length > 0
      ? [riders[0].latitude, riders[0].longitude]
      : [14.1072, 121.0217];

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-100">
      <MapContainer
        center={initialCenter}
        zoom={13}
        scrollWheelZoom
        style={{ width: "100%", height: 520 }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {riders.map((rider) => {
          const isSelected =
            selectedBookingNo === rider.bookingNo;

          return (
            <Marker
              key={`rider-${rider.orderId}`}
              position={[rider.latitude, rider.longitude]}
              icon={isSelected ? selectedRiderIcon : riderIcon}
              eventHandlers={{
                click: () => onSelectBooking(rider.bookingNo),
              }}
            >
              <Popup>
                <div style={{ minWidth: 230 }}>
                  <strong style={{ fontSize: 16 }}>
                    {rider.riderName || "Active rider"}
                  </strong>
                  <br />
                  <span>{rider.bookingNo}</span>
                  <br />
                  <span>Status: {rider.status}</span>
                  <hr style={{ margin: "8px 0" }} />
                  <span>Speed: {formatSpeed(rider.speed)}</span>
                  <br />
                  <span>
                    Accuracy:{" "}
                    {rider.accuracy !== null
                      ? `±${Math.round(rider.accuracy)} m`
                      : "Unavailable"}
                  </span>
                  <br />
                  <span>Updated: {formatAge(rider.updatedAt)}</span>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {riders.map((rider) =>
          rider.pickupLatitude !== null &&
          rider.pickupLongitude !== null ? (
            <Marker
              key={`pickup-${rider.orderId}`}
              position={[
                rider.pickupLatitude,
                rider.pickupLongitude,
              ]}
              icon={pickupIcon}
            >
              <Popup>
                <strong>Pickup</strong>
                <br />
                {rider.bookingNo}
                <br />
                {rider.pickupAddress || "Address unavailable"}
              </Popup>
            </Marker>
          ) : null
        )}

        {riders.map((rider) =>
          rider.dropoffLatitude !== null &&
          rider.dropoffLongitude !== null ? (
            <Marker
              key={`dropoff-${rider.orderId}`}
              position={[
                rider.dropoffLatitude,
                rider.dropoffLongitude,
              ]}
              icon={dropoffIcon}
            >
              <Popup>
                <strong>Drop-off</strong>
                <br />
                {rider.bookingNo}
                <br />
                {rider.dropoffAddress || "Address unavailable"}
              </Popup>
            </Marker>
          ) : null
        )}

        <FitAllRiders riders={riders} />
      </MapContainer>
    </div>
  );
}