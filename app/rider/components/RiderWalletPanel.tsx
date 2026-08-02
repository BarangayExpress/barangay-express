"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type WalletData = {
  wallet: { available_balance: number | string; reserved_balance: number | string; lifetime_commission: number | string };
  settings: { commission_rate: number | string; minimum_commission: number | string; minimum_topup: number | string; topup_gcash_name: string | null; topup_gcash_number: string | null };
  topups: Array<{ id: string; amount: number | string; reference_number: string; status: string; submitted_at: string; review_note: string | null }>;
};

function money(value: number | string) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 }).format(Number(value || 0));
}

export default function RiderWalletPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [data, setData] = useState<WalletData | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/rider/wallet", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Unable to load wallet.");
      setData(result as WalletData);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load wallet.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    try {
      const response = await fetch("/api/rider/wallet", { method: "POST", body: new FormData(event.currentTarget) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Top-up submission failed.");
      event.currentTarget.reset();
      setMessage("✅ Top-up submitted. Hintayin ang admin verification.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Top-up submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="mb-6 rounded-3xl border border-blue-100 bg-white p-5 font-bold text-slate-500">Loading rider wallet...</div>;
  if (!data) return <div className="mb-6 rounded-3xl border border-red-200 bg-red-50 p-5 font-bold text-red-700">{message}</div>;

  const rate = Number(data.settings.commission_rate) * 100;
  return (
    <section className="mb-6 overflow-hidden rounded-3xl border border-blue-200 bg-white shadow-sm">
      <div className="grid gap-4 bg-gradient-to-r from-blue-950 to-blue-700 p-5 text-white sm:grid-cols-3">
        <div><p className="text-xs font-extrabold uppercase tracking-widest text-sky-300">Available Wallet</p><p className="mt-1 text-3xl font-black">{money(data.wallet.available_balance)}</p></div>
        <div><p className="text-xs font-extrabold uppercase tracking-widest text-sky-300">Reserved</p><p className="mt-1 text-2xl font-black">{money(data.wallet.reserved_balance)}</p></div>
        <div className="flex items-center justify-between gap-4 sm:block"><div><p className="text-xs font-extrabold uppercase tracking-widest text-sky-300">Commission Rule</p><p className="mt-1 font-black">{rate}% • minimum {money(data.settings.minimum_commission)}</p></div><button type="button" onClick={() => setOpen((value) => !value)} className="mt-2 rounded-xl bg-white px-4 py-2 font-extrabold text-blue-800">{open ? "Close" : "+ Top Up"}</button></div>
      </div>

      {open && (
        <form onSubmit={submit} className="grid gap-4 border-t border-blue-100 bg-blue-50 p-5 md:grid-cols-2">
          <div className="md:col-span-2 rounded-2xl border border-blue-200 bg-white p-4 text-sm text-slate-700">
            <p className="font-extrabold text-blue-950">Manual GCash Top-up</p>
            <p className="mt-1">Send to: <strong>{data.settings.topup_gcash_name || "Ask admin to configure GCash name"}</strong> • <strong>{data.settings.topup_gcash_number || "Not configured"}</strong></p>
            <p className="mt-1">Minimum: {money(data.settings.minimum_topup)}. Balance is added only after admin approval.</p>
          </div>
          <label className="font-bold text-slate-700">Amount<input name="amount" type="number" min={Number(data.settings.minimum_topup)} max="50000" step="0.01" required className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-950" /></label>
          <label className="font-bold text-slate-700">GCash reference number<input name="reference_number" minLength={6} maxLength={80} required className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-950" /></label>
          <label className="font-bold text-slate-700 md:col-span-2">Payment screenshot<input name="proof" type="file" accept="image/jpeg,image/png,image/webp" required className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-4 py-3" /></label>
          <button disabled={submitting} className="rounded-xl bg-blue-700 px-5 py-3 font-extrabold text-white disabled:opacity-60 md:col-span-2">{submitting ? "Submitting..." : "Submit Top-up for Verification"}</button>
        </form>
      )}

      {message && <div className="border-t border-slate-100 px-5 py-3 text-sm font-bold text-blue-800">{message}</div>}
      {data.topups.length > 0 && <div className="border-t border-slate-100 p-5"><p className="font-extrabold text-slate-900">Recent top-ups</p><div className="mt-3 space-y-2">{data.topups.slice(0, 3).map((topup) => <div key={topup.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm"><span><strong>{money(topup.amount)}</strong> • Ref {topup.reference_number}</span><span className={`rounded-full px-3 py-1 font-extrabold ${topup.status === "Approved" ? "bg-emerald-100 text-emerald-700" : topup.status === "Rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{topup.status}</span></div>)}</div></div>}
    </section>
  );
}
