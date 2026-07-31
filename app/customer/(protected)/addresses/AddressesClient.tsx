"use client";

import { FormEvent, useEffect, useState } from "react";
import type { SavedAddress } from "@/lib/customer";
import dynamic from "next/dynamic";

type MapPoint = {
  latitude: number;
  longitude: number;
};

type SavedAddressMapPickerProps = {
  point: MapPoint | null;
  onPointChange: (point: MapPoint) => void;
};

const SavedAddressMapPicker = dynamic<SavedAddressMapPickerProps>(
  async () => {
    const componentModule = await import("./SavedAddressMapPicker");
    return componentModule.default;
  },
  {
    ssr: false,
    loading: () => (
      <div className="grid h-[430px] place-items-center rounded-3xl border border-blue-200 bg-slate-100 font-bold text-slate-500">
        Loading live map...
      </div>
    ),
  }
);

type AddressForm = {
  label: string;
  contact_name: string;
  phone: string;
  address: string;
  latitude: string;
  longitude: string;
  is_default: boolean;
};

const emptyForm: AddressForm = {
  label: "",
  contact_name: "",
  phone: "",
  address: "",
  latitude: "",
  longitude: "",
  is_default: false,
};

export default function AddressesClient() {
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [form, setForm] = useState<AddressForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [message, setMessage] = useState("");

  async function loadAddresses() {
    setLoading(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/customer/addresses", {
        cache: "no-store",
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Hindi ma-load ang saved addresses.");
      }

      setAddresses(result.addresses);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Hindi ma-load ang saved addresses."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadAddresses();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  function useCurrentLocation() {
    setLocating(true);
    setErrorMessage("");

    if (!navigator.geolocation) {
      setErrorMessage("Hindi supported ang location sa browser na ito.");
      setLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm((current) => ({
          ...current,
          latitude: String(position.coords.latitude),
          longitude: String(position.coords.longitude),
        }));
        setMessage("Nakuha na ang map coordinates ng address.");
        setLocating(false);
      },
      () => {
        setErrorMessage(
          "Hindi makuha ang location. I-allow ang location permission at subukan muli."
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  function updateMapPoint(point: MapPoint) {
    setForm((current) => ({
      ...current,
      latitude: String(point.latitude),
      longitude: String(point.longitude),
    }));
    setMessage("Updated na ang exact map pin.");
    setErrorMessage("");
  }

  function startEdit(address: SavedAddress) {
    setEditingId(address.id);
    setForm({
      label: address.label,
      contact_name: address.contact_name,
      phone: address.phone,
      address: address.address,
      latitude: String(address.latitude),
      longitude: String(address.longitude),
      is_default: address.is_default,
    });
    setMessage("");
    setErrorMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setErrorMessage("");

    try {
      const endpoint = editingId
        ? `/api/customer/addresses/${editingId}`
        : "/api/customer/addresses";
      const response = await fetch(endpoint, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          latitude: Number(form.latitude),
          longitude: Number(form.longitude),
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Hindi na-save ang address.");
      }

      resetForm();
      setMessage(editingId ? "Updated ang address." : "Saved ang address.");
      await loadAddresses();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Hindi na-save ang address."
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteAddress(id: string) {
    if (!window.confirm("Sigurado ka bang buburahin ang saved address na ito?")) {
      return;
    }

    setErrorMessage("");
    setMessage("");

    try {
      const response = await fetch(`/api/customer/addresses/${id}`, {
        method: "DELETE",
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Hindi nabura ang address.");
      }

      if (editingId === id) {
        resetForm();
      }

      setMessage("Deleted ang saved address.");
      await loadAddresses();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Hindi nabura ang address."
      );
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
      <form
        onSubmit={handleSubmit}
        className="h-fit rounded-[2rem] border border-blue-100 bg-white p-6 shadow-sm md:p-8"
      >
        <p className="font-extrabold uppercase tracking-[0.18em] text-blue-500">
          {editingId ? "Edit Address" : "New Address"}
        </p>
        <h2 className="mt-2 text-2xl font-black text-blue-950">
          {editingId ? "Update saved address" : "Save an address"}
        </h2>

        <div className="mt-6 space-y-4">
          <input
            required
            placeholder="Label (Home, Work, etc.)"
            maxLength={40}
            value={form.label}
            onChange={(event) =>
              setForm((current) => ({ ...current, label: event.target.value }))
            }
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
          <input
            required
            placeholder="Contact name"
            maxLength={120}
            value={form.contact_name}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                contact_name: event.target.value,
              }))
            }
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
          <input
            required
            placeholder="09XXXXXXXXX"
            inputMode="numeric"
            maxLength={11}
            value={form.phone}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                phone: event.target.value.replace(/\D/g, ""),
              }))
            }
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
          <textarea
            required
            placeholder="Complete address, landmark, barangay"
            maxLength={500}
            rows={4}
            value={form.address}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                address: event.target.value,
              }))
            }
            className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />

          <button
            type="button"
            onClick={useCurrentLocation}
            disabled={locating}
            className="w-full rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 font-black text-blue-700 disabled:opacity-60"
          >
            {locating ? "Getting location..." : "📍 Use Current Location"}
          </button>

          <SavedAddressMapPicker
            point={
              form.latitude && form.longitude
                ? {
                    latitude: Number(form.latitude),
                    longitude: Number(form.longitude),
                  }
                : null
            }
            onPointChange={updateMapPoint}
          />

          {form.latitude && form.longitude && (
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
              Location saved: {Number(form.latitude).toFixed(6)},{" "}
              {Number(form.longitude).toFixed(6)}
            </p>
          )}

          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  is_default: event.target.checked,
                }))
              }
              className="h-5 w-5"
            />
            <span className="font-bold text-slate-700">
              Set as default address
            </span>
          </label>
        </div>

        {errorMessage && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            ⚠️ {errorMessage}
          </div>
        )}

        {message && (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
            ✅ {message}
          </div>
        )}

        <div className="mt-5 flex gap-3">
          <button
            type="submit"
            disabled={saving || !form.latitude || !form.longitude}
            className="flex-1 rounded-2xl bg-blue-700 px-5 py-4 font-black text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : editingId ? "Update Address" : "Save Address"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-2xl border border-slate-200 px-5 py-4 font-black text-slate-700"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <section>
        <h2 className="text-3xl font-black text-blue-950">Saved Addresses</h2>
        <p className="mt-2 text-slate-600">
          Maaari mong piliin ang mga ito sa susunod na booking.
        </p>

        {loading ? (
          <div className="mt-6 rounded-2xl bg-white p-6 font-bold text-slate-500">
            Loading addresses...
          </div>
        ) : addresses.length === 0 ? (
          <div className="mt-6 rounded-[2rem] border border-dashed border-blue-200 bg-white p-10 text-center">
            <div className="text-5xl">📍</div>
            <p className="mt-4 text-xl font-black text-blue-950">
              Wala pang saved address
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-4">
            {addresses.map((address) => (
              <article
                key={address.id}
                className="rounded-[2rem] border border-blue-100 bg-white p-6 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-black text-blue-950">
                        {address.label}
                      </h3>
                      {address.is_default && (
                        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-700">
                          Default
                        </span>
                      )}
                    </div>
                    <p className="mt-3 font-bold text-slate-800">
                      {address.contact_name} • {address.phone}
                    </p>
                    <p className="mt-2 leading-7 text-slate-600">
                      {address.address}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(address)}
                      className="rounded-xl border border-blue-200 px-3 py-2 text-sm font-black text-blue-700"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteAddress(address.id)}
                      className="rounded-xl border border-red-200 px-3 py-2 text-sm font-black text-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
