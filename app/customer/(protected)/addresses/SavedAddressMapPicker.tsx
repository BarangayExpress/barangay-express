"use client";

import L from "leaflet";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { useEffect } from "react";

type MapPoint = {
  latitude: number;
  longitude: number;
};

type SavedAddressMapPickerProps = {
  point: MapPoint | null;
  onPointChange: (point: MapPoint) => void;
};

const DEFAULT_CENTER: [number, number] = [14.09296, 121.04688];

const addressPinIcon = L.divIcon({
  className: "",
  html: `
    <div style="
      width:44px;
      height:44px;
      display:flex;
      align-items:center;
      justify-content:center;
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      background:linear-gradient(135deg,#2563eb,#0ea5e9);
      border:3px solid white;
      box-shadow:0 8px 20px rgba(15,23,42,.35);
    ">
      <span style="transform:rotate(45deg);font-size:21px;">🏠</span>
    </div>
  `,
  iconSize: [44, 44],
  iconAnchor: [22, 42],
  popupAnchor: [0, -42],
});

function MapClickHandler({
  onPointChange,
}: Pick<SavedAddressMapPickerProps, "onPointChange">) {
  useMapEvents({
    click(event) {
      onPointChange({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
      });
    },
  });

  return null;
}

function RecenterMap({ point }: { point: MapPoint | null }) {
  const map = useMap();

  useEffect(() => {
    if (!point) {
      return;
    }

    map.flyTo([point.latitude, point.longitude], 18, {
      animate: true,
      duration: 0.8,
    });
  }, [map, point]);

  return null;
}

export default function SavedAddressMapPicker({
  point,
  onPointChange,
}: SavedAddressMapPickerProps) {
  return (
    <div className="overflow-hidden rounded-3xl border border-blue-200 bg-slate-100 shadow-inner">
      <div className="border-b border-blue-100 bg-blue-50 px-4 py-3">
        <p className="font-black text-blue-950">📍 Pin exact location</p>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          I-click ang mapa o i-drag ang house pin papunta sa mismong bahay o
          landmark.
        </p>
      </div>

      <div className="h-[360px] w-full">
        <MapContainer
          center={
            point
              ? [point.latitude, point.longitude]
              : DEFAULT_CENTER
          }
          zoom={point ? 18 : 14}
          scrollWheelZoom
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapClickHandler onPointChange={onPointChange} />
          <RecenterMap point={point} />

          {point && (
            <Marker
              position={[point.latitude, point.longitude]}
              icon={addressPinIcon}
              draggable
              eventHandlers={{
                dragend(event) {
                  const marker = event.target as L.Marker;
                  const position = marker.getLatLng();

                  onPointChange({
                    latitude: position.lat,
                    longitude: position.lng,
                  });
                },
              }}
            >
              <Popup>
                <strong>Saved address location</strong>
                <br />
                I-drag ang pin para itama ang pwesto.
              </Popup>
            </Marker>
          )}
        </MapContainer>
      </div>
    </div>
  );
}
