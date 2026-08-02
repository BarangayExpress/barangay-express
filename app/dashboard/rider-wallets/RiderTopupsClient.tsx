"use client";

import { useCallback, useEffect, useState } from "react";

type RequestRow = { id: string; amount: number | string; reference_number: string; proof_url: string | null; status: string; submitted_at: string; review_note: string | null; rider: { full_name: string; email: string } | null };
type Settings = { topup_gcash_name: string | null; topup_gcash_number: string | null; minimum_topup: number | string; commission_rate: number | string; minimum_commission: number | string };

function money(value: number | string) { return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 }).format(Number(value)); }

export default function RiderTopupsClient() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [summary, setSummary] = useState({ earned_commission: 0, reserved_commission: 0 });
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/rider-topups", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Unable to load requests.");
      setRequests(result.requests || []); setSummary(result.summary); setSettings(result.settings);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load requests."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function review(id: string, action: "approve" | "reject") {
    const note = action === "reject" ? window.prompt("Reason for rejection:", "Payment could not be verified.") : "Verified in GCash";
    if (note === null) return;
    setWorking(id); setError("");
    try {
      const response = await fetch("/api/admin/rider-topups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request_id: id, action, note }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Review failed.");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Review failed."); }
    finally { setWorking(null); }
  }

  async function saveSettings(form: FormData) {
    setError("");
    try {
      const response = await fetch("/api/admin/rider-topups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "settings", gcash_name: form.get("gcash_name"), gcash_number: form.get("gcash_number"), minimum_topup: Number(form.get("minimum_topup")) }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Unable to save settings.");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to save settings."); }
  }

  return <main className="min-h-screen bg-slate-100 p-5 sm:p-8"><div className="mx-auto max-w-6xl">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-extrabold uppercase tracking-widest text-blue-600">Barangay Express Finance</p><h1 className="mt-1 text-3xl font-black text-blue-950">Rider Wallet & Top-ups</h1></div><a href="/dashboard" className="rounded-xl border border-blue-200 bg-white px-5 py-3 font-extrabold text-blue-800">← Admin Dashboard</a></div>
    <section className="mt-6 grid gap-4 sm:grid-cols-2"><div className="rounded-3xl bg-blue-950 p-6 text-white"><p className="text-sm font-bold text-blue-200">Earned platform commission</p><p className="mt-2 text-3xl font-black">{money(summary.earned_commission)}</p></div><div className="rounded-3xl bg-blue-700 p-6 text-white"><p className="text-sm font-bold text-blue-100">Reserved commission</p><p className="mt-2 text-3xl font-black">{money(summary.reserved_commission)}</p></div></section>
    {settings && <form action={saveSettings} className="mt-6 grid gap-4 rounded-3xl border border-blue-100 bg-white p-5 sm:grid-cols-3"><div className="sm:col-span-3"><h2 className="text-xl font-black text-blue-950">Top-up GCash Settings</h2><p className="text-sm text-slate-500">Commission is fixed by the migration at {Number(settings.commission_rate) * 100}% with {money(settings.minimum_commission)} minimum.</p></div><input name="gcash_name" defaultValue={settings.topup_gcash_name || ""} placeholder="GCash account name" required className="rounded-xl border border-slate-300 px-4 py-3 text-slate-950"/><input name="gcash_number" defaultValue={settings.topup_gcash_number || ""} placeholder="09XXXXXXXXX" required className="rounded-xl border border-slate-300 px-4 py-3 text-slate-950"/><input name="minimum_topup" type="number" min="1" step="0.01" defaultValue={Number(settings.minimum_topup)} required className="rounded-xl border border-slate-300 px-4 py-3 text-slate-950"/><button className="rounded-xl bg-blue-700 px-5 py-3 font-extrabold text-white sm:col-span-3">Save GCash Settings</button></form>}
    {error && <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 font-bold text-red-700">{error}</div>}
    <section className="mt-6 space-y-4">{loading ? <p className="rounded-3xl bg-white p-8 font-bold">Loading...</p> : requests.length === 0 ? <p className="rounded-3xl bg-white p-10 text-center font-bold text-slate-500">Wala pang top-up request.</p> : requests.map((item) => <article key={item.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xl font-black text-blue-950">{item.rider?.full_name || "Rider"} • {money(item.amount)}</p><p className="mt-1 text-sm text-slate-500">{item.rider?.email} • Ref: {item.reference_number}</p><p className="mt-1 text-sm text-slate-500">{new Date(item.submitted_at).toLocaleString("en-PH")}</p></div><span className={`w-fit rounded-full px-4 py-2 font-extrabold ${item.status === "Approved" ? "bg-emerald-100 text-emerald-700" : item.status === "Rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{item.status}</span></div>{item.proof_url && <a href={item.proof_url} target="_blank" rel="noreferrer" className="mt-4 inline-block rounded-xl bg-slate-100 px-4 py-2 font-bold text-blue-700">View GCash Proof</a>}{item.status === "Pending" && <div className="mt-4 flex gap-3"><button disabled={working === item.id} onClick={() => review(item.id, "approve")} className="rounded-xl bg-emerald-600 px-5 py-3 font-extrabold text-white disabled:opacity-50">Approve & Credit Wallet</button><button disabled={working === item.id} onClick={() => review(item.id, "reject")} className="rounded-xl bg-red-600 px-5 py-3 font-extrabold text-white disabled:opacity-50">Reject</button></div>}{item.review_note && <p className="mt-3 text-sm font-semibold text-slate-600">Note: {item.review_note}</p>}</article>)}</section>
  </div></main>;
}
