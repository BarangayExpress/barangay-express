"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

type Rider = {
  id: string; email: string | null; full_name: string; phone: string | null; vehicle_type: string | null;
  plate_number: string | null; is_active: boolean; is_online: boolean;
  last_online_at: string | null; active_deliveries: number; completed_deliveries: number;
};

type RiderForm = { email: string; password: string; full_name: string; phone: string; vehicle_type: string; plate_number: string };
const emptyForm: RiderForm = { email: "", password: "", full_name: "", phone: "", vehicle_type: "Motorcycle", plate_number: "" };

export default function RidersClient() {
  const [riders, setRiders] = useState<Rider[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<RiderForm>(emptyForm);
  const [editing, setEditing] = useState<Rider | null>(null);
  const loadingRef = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (!silent) setError("");
    try {
      const response = await fetch(`/api/admin/riders?t=${Date.now()}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load riders.");
      setRiders(result.riders || []);
      setLastUpdated(new Date());
    } finally { loadingRef.current = false; }
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message)).finally(() => setLoading(false));
    const supabase = createClient();
    const channel = supabase.channel("admin-rider-profiles-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "rider_profiles" }, () => { void load(true).catch(() => undefined); })
      .subscribe();
    const intervalId = window.setInterval(() => { void load(true).catch(() => undefined); }, 5000);
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") void load(true).catch(() => undefined); };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => { window.clearInterval(intervalId); document.removeEventListener("visibilitychange", refreshWhenVisible); void supabase.removeChannel(channel); };
  }, [load]);

  async function createRider(event: FormEvent) {
    event.preventDefault(); setCreating(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/admin/riders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to create rider.");
      setSuccess(`${form.full_name} has been added. The rider can now log in using the email and temporary password.`);
      setForm(emptyForm); setShowAdd(false); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to create rider."); }
    finally { setCreating(false); }
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault(); if (!editing) return;
    setSaving(editing.id); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/admin/riders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rider_id: editing.id, full_name: editing.full_name, phone: editing.phone, vehicle_type: editing.vehicle_type, plate_number: editing.plate_number }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Update failed.");
      setSuccess("Rider details updated."); setEditing(null); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Update failed."); }
    finally { setSaving(null); }
  }

  async function toggle(rider: Rider) {
    setSaving(rider.id); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/admin/riders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rider_id: rider.id, is_active: !rider.is_active }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Update failed.");
      setSuccess(`${rider.full_name} was ${rider.is_active ? "deactivated" : "activated"}.`); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Update failed."); }
    finally { setSaving(null); }
  }

  return <main className="min-h-screen bg-slate-50 p-4 md:p-8"><div className="mx-auto max-w-6xl">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div><p className="font-bold text-blue-600">Barangay Express Admin</p><h1 className="text-3xl font-black text-slate-900">Multi-Rider Management</h1><p className="mt-1 text-sm text-slate-500">Live status sync{lastUpdated ? ` · Updated ${lastUpdated.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}</p></div>
      <div className="flex flex-wrap gap-2"><Link href="/dashboard/rider-applications" className="rounded-xl border border-blue-300 bg-blue-50 px-5 py-3 font-black text-blue-700">Applications</Link><button onClick={() => { setShowAdd(v => !v); setEditing(null); setError(""); }} className="rounded-xl bg-blue-600 px-5 py-3 font-black text-white">{showAdd ? "Close Form" : "+ Add Rider"}</button><Link href="/dashboard" className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-bold text-slate-700">← Dashboard</Link></div>
    </div>

    {showAdd && <form onSubmit={createRider} className="mb-5 rounded-2xl border border-blue-200 bg-white p-5 shadow-sm">
      <div className="mb-4"><h2 className="text-xl font-black text-slate-900">Create Rider Account</h2><p className="text-sm text-slate-500">The email is confirmed automatically. Give the temporary password securely to the rider.</p></div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Field label="Full name" required value={form.full_name} onChange={v => setForm({ ...form, full_name: v })} />
        <Field label="Email" type="email" required value={form.email} onChange={v => setForm({ ...form, email: v })} />
        <Field label="Temporary password" type="password" required minLength={8} value={form.password} onChange={v => setForm({ ...form, password: v })} />
        <Field label="Phone (09XXXXXXXXX)" value={form.phone} onChange={v => setForm({ ...form, phone: v })} />
        <Field label="Vehicle type" required value={form.vehicle_type} onChange={v => setForm({ ...form, vehicle_type: v })} />
        <Field label="Plate number" value={form.plate_number} onChange={v => setForm({ ...form, plate_number: v.toUpperCase() })} />
      </div>
      <button disabled={creating} className="mt-5 rounded-xl bg-green-600 px-5 py-3 font-black text-white disabled:opacity-50">{creating ? "Creating rider..." : "Create Rider Account"}</button>
    </form>}

    <div className="mb-5 grid gap-3 sm:grid-cols-3"><Stat label="Total riders" value={riders.length} /><Stat label="Online now" value={riders.filter(r => r.is_online && r.is_active).length} /><Stat label="Active deliveries" value={riders.reduce((n, r) => n + r.active_deliveries, 0)} /></div>
    {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 font-semibold text-red-700">{error}</div>}
    {success && <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-4 font-semibold text-green-800">{success}</div>}

    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {loading ? <p className="p-8 text-center font-bold text-slate-500">Loading riders...</p> : riders.length === 0 ? <p className="p-8 text-center text-slate-500">No rider profiles found.</p> :
        <div className="divide-y divide-slate-200">{riders.map(rider => <div key={rider.id} className="grid gap-4 p-5 md:grid-cols-[1.5fr_1fr_1fr_auto] md:items-center">
          <div><div className="flex items-center gap-2"><span className={`h-3 w-3 rounded-full ${rider.is_online && rider.is_active ? "bg-green-500" : "bg-slate-300"}`} /><h2 className="text-lg font-black text-slate-900">{rider.full_name}</h2></div><p className="mt-1 text-sm text-slate-500">{rider.email || "No email"}</p><p className="text-sm text-slate-500">{rider.phone || "No phone"} · {rider.vehicle_type || "Vehicle not set"} · {rider.plate_number || "No plate"}</p></div>
          <div><p className="text-xs font-bold uppercase text-slate-400">Current status</p><p className="font-bold text-slate-800">{!rider.is_active ? "Deactivated" : rider.is_online ? "Online" : "Offline"}</p></div>
          <div><p className="text-xs font-bold uppercase text-slate-400">Deliveries</p><p className="font-bold text-slate-800">{rider.active_deliveries} active · {rider.completed_deliveries} completed</p></div>
          <div className="flex gap-2 md:flex-col"><button onClick={() => { setEditing({ ...rider }); setShowAdd(false); }} className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 font-black text-blue-700">Edit</button><button disabled={saving === rider.id} onClick={() => toggle(rider)} className={`rounded-xl px-4 py-3 font-black text-white disabled:opacity-50 ${rider.is_active ? "bg-red-600" : "bg-green-600"}`}>{saving === rider.id ? "Saving..." : rider.is_active ? "Deactivate" : "Activate"}</button></div>
        </div>)}</div>}
    </div>

    {editing && <form onSubmit={saveEdit} className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><div><h2 className="text-xl font-black text-slate-900">Edit Rider</h2><p className="text-sm text-slate-500">Account email: {editing.email || "Not available"}</p></div><button type="button" onClick={() => setEditing(null)} className="font-bold text-slate-500">Close</button></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"><Field label="Full name" required value={editing.full_name} onChange={v => setEditing({ ...editing, full_name: v })} /><Field label="Phone" value={editing.phone || ""} onChange={v => setEditing({ ...editing, phone: v })} /><Field label="Vehicle type" value={editing.vehicle_type || ""} onChange={v => setEditing({ ...editing, vehicle_type: v })} /><Field label="Plate number" value={editing.plate_number || ""} onChange={v => setEditing({ ...editing, plate_number: v.toUpperCase() })} /></div><button disabled={saving === editing.id} className="mt-5 rounded-xl bg-blue-600 px-5 py-3 font-black text-white disabled:opacity-50">{saving === editing.id ? "Saving..." : "Save Rider Details"}</button></form>}
  </div></main>;
}

function Field({ label, value, onChange, type = "text", required = false, minLength }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; minLength?: number }) { return <label className="block"><span className="mb-1 block text-sm font-bold text-slate-700">{label}</span><input type={type} required={required} minLength={minLength} value={value} onChange={e => onChange(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-blue-500" /></label>; }
function Stat({ label, value }: { label: string; value: number }) { return <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm font-bold text-slate-500">{label}</p><p className="mt-1 text-3xl font-black text-slate-900">{value}</p></div>; }
