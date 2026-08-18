"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Application = Record<
  string,
  string | number | boolean | null | undefined
> & {
 id: string; full_name: string; email: string; phone: string; status: string; created_at: string; document_urls?: Record<string,string> };
type Credentials = { email: string; temporary_password: string } | null;
const documentLabels: Record<string,string> = { license_front_path:"License Front", license_back_path:"License Back", or_path:"OR", cr_path:"CR", vehicle_photo_path:"Vehicle Photo", rider_selfie_path:"Rider Selfie", nbi_clearance_path:"NBI Clearance", barangay_clearance_path:"Barangay Clearance" };

export default function RiderApplicationsClient() {
  const [items,setItems]=useState<Application[]>([]), [status,setStatus]=useState("pending"), [loading,setLoading]=useState(true), [saving,setSaving]=useState<string|null>(null), [error,setError]=useState("");
  const [credentials,setCredentials]=useState<Credentials>(null);
  const load=useCallback(async()=>{setLoading(true);setError("");try
    {const r=await fetch(`/api/admin/rider-applications?status=${status}&t=${Date.now()}`,{cache:"no-store"});const j=await r.json();if(!r.ok)throw new Error(j.error||"Unable to load applications.");setItems(j.applications||[])}catch(e){setError(e instanceof Error?e.message:"Unable to load applications.")}finally{setLoading(false)}},[status]);
  useEffect(()=>{void load()},[load]);

  async function review(item:Application,action:"approve"|"reject"|"request_documents"|"under_review"){
    let rejection_reason="",documents_requested="";
    if(action==="reject"){rejection_reason=window.prompt(`Reason for rejecting ${item.full_name}:`)||"";if(!rejection_reason.trim())return}
    if(action==="request_documents"){documents_requested=window.prompt("List the missing, expired, or unclear documents:")||"";if(!documents_requested.trim())return}
    if(action==="approve"&&!window.confirm(`Approve ${item.full_name} and create a rider account?`))return;
    setSaving(item.id);setError("");setCredentials(null);
    try{const r=await fetch("/api/admin/rider-applications",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({application_id:item.id,action,rejection_reason,documents_requested})});const j=await r.json();if(!r.ok)throw new Error(j.error||"Review failed.");if(j.credentials)setCredentials(j.credentials);await load()}catch(e){setError(e instanceof Error?e.message:"Review failed.")}finally{setSaving(null)}
  }
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex min-h-screen">

        {/* ADMIN SIDEBAR */}
        <aside className="hidden w-64 shrink-0 flex-col bg-gradient-to-b from-blue-950 to-blue-900 text-white lg:flex">
          <div className="border-b border-white/10 px-6 py-6">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-300">
              Barangay Express
            </p>
            <h2 className="mt-1 text-2xl font-black">Admin Portal</h2>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-5">
            <p className="mb-3 px-3 text-[10px] font-black uppercase tracking-[0.2em] text-blue-300">
              Workspace
            </p>

            <nav className="space-y-1">
              <Link
                href="/dashboard"
                className="block rounded-xl px-4 py-3 font-bold text-blue-100 transition hover:bg-white/10 hover:text-white"
              >
                ◇ Dashboard
              </Link>

              <Link
                href="/dashboard/live-dispatch"
                className="block rounded-xl px-4 py-3 font-bold text-blue-100 transition hover:bg-white/10 hover:text-white"
              >
                ⚡ Live Dispatch
              </Link>

              <Link
                href="/dashboard"
                className="block rounded-xl px-4 py-3 font-bold text-blue-100 transition hover:bg-white/10 hover:text-white"
              >
                ▣ Orders
              </Link>

              <Link
                href="/dashboard"
                className="block rounded-xl px-4 py-3 font-bold text-blue-100 transition hover:bg-white/10 hover:text-white"
              >
                ₱ Payments
              </Link>

              <Link
                href="/dashboard/operations"
                className="block rounded-xl px-4 py-3 font-bold text-blue-100 transition hover:bg-white/10 hover:text-white"
              >
                ⚙ Operations
              </Link>
            </nav>

            <p className="mb-3 mt-8 px-3 text-[10px] font-black uppercase tracking-[0.2em] text-blue-300">
              Management
            </p>

            <nav className="space-y-1">
              <Link
                href="/dashboard/riders"
                className="block rounded-xl px-4 py-3 font-bold text-blue-100 transition hover:bg-white/10 hover:text-white"
              >
                ♟ Riders
              </Link>

              <Link
                href="/dashboard/rider-applications"
                className="block rounded-xl bg-white px-4 py-3 font-black text-blue-950 shadow-sm"
              >
                ✓ Applications
              </Link>

              <Link
                href="/dashboard/rider-wallets"
                className="block rounded-xl px-4 py-3 font-bold text-blue-100 transition hover:bg-white/10 hover:text-white"
              >
                ₱ Rider Wallets
              </Link>
            </nav>
          </div>

          <div className="border-t border-white/10 p-4">
            <div className="rounded-2xl bg-white/10 p-4">
              <p className="font-black">Administrator</p>
              <p className="mt-1 text-xs text-blue-200">Secure session</p>
            </div>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main className="min-w-0 flex-1">
          {/* HEADER */}
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 md:px-8">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-600">
                  Rider Management
                </p>
                <h1 className="text-2xl font-black text-blue-950 md:text-3xl">
                  Rider Verification
                </h1>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href="/dashboard/riders"
                  className="rounded-xl border border-blue-200 bg-white px-4 py-2.5 font-black text-blue-700 transition hover:bg-blue-50"
                >
                  Manage Riders
                </Link>

                <Link
                  href="/dashboard"
                  className="rounded-xl bg-blue-600 px-4 py-2.5 font-black text-white transition hover:bg-blue-700"
                >
                  ← Dashboard
                </Link>
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-7xl p-5 md:p-8">
            {/* INTRO */}
            <section className="mb-6 rounded-3xl border border-blue-100 bg-gradient-to-r from-blue-950 to-blue-700 p-6 text-white shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">
                Rider Applications
              </p>

              <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black md:text-3xl">
                    Verify rider applications
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100">
                    Review applicant information, verify submitted requirements,
                    request missing documents, approve qualified riders, or reject
                    invalid applications.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-blue-100">
                  🔒 Private documents are available only to admins
                </div>
              </div>
            </section>

            {/* FILTERS */}
            <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  "pending",
                  "under_review",
                  "needs_documents",
                  "approved",
                  "rejected",
                ].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setStatus(v)}
                    className={`rounded-xl px-4 py-3 text-sm font-black capitalize transition ${
                      status === v
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-slate-600 hover:bg-slate-100 hover:text-blue-950"
                    }`}
                  >
                    {v.replaceAll("_", " ")}
                  </button>
                ))}
              </div>
            </section>

            {/* ONE-TIME CREDENTIALS */}
            {credentials && (
              <section className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
                <p className="text-xs font-black uppercase tracking-wider text-amber-600">
                  New Rider Account
                </p>

                <h2 className="mt-1 text-lg font-black text-amber-950">
                  One-time rider credentials
                </h2>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl bg-white p-4">
                    <p className="text-xs font-bold uppercase text-slate-400">
                      Email
                    </p>
                    <p className="mt-1 font-black text-slate-900">
                      {credentials.email}
                    </p>
                  </div>

                  <div className="rounded-xl bg-white p-4">
                    <p className="text-xs font-bold uppercase text-slate-400">
                      Temporary Password
                    </p>
                    <p className="mt-1 select-all font-mono font-black text-slate-900">
                      {credentials.temporary_password}
                    </p>
                  </div>
                </div>
              </section>
            )}

            {/* ERROR */}
            {error && (
              <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 font-semibold text-red-700">
                ⚠ {error}
              </div>
            )}

            {/* APPLICATIONS */}
            <div className="space-y-5">
              {loading ? (
                <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm">
                  <p className="font-black text-slate-500">
                    Loading rider applications...
                  </p>
                </div>
              ) : items.length === 0 ? (
                <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-2xl">
                    📋
                  </div>

                  <h3 className="mt-4 text-lg font-black text-blue-950">
                    No {status.replaceAll("_", " ")} applications
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    Applications with this status will appear here.
                  </p>
                </div>
              ) : (
                items.map((item) => (
                  <article
                    key={item.id}
                    className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
                  >
                    {/* APPLICATION HEADER */}
                    <div className="border-b border-slate-100 bg-slate-50 px-5 py-5 md:px-6">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-xl font-black text-blue-950 md:text-2xl">
                              {item.full_name}
                            </h2>

                            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-700">
                              {item.application_type || "initial"}
                            </span>
                          </div>

                          <p className="mt-1 text-sm font-semibold text-slate-500">
                            Submitted{" "}
                            {new Date(item.created_at).toLocaleString("en-PH")}
                          </p>
                        </div>

                        <span className="rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-black uppercase tracking-wide text-blue-700">
                          {item.status.replaceAll("_", " ")}
                        </span>
                      </div>
                    </div>

                    <div className="grid gap-6 p-5 md:p-6 xl:grid-cols-[1fr_1fr_auto]">
                      {/* APPLICANT */}
                      <section className="rounded-2xl bg-slate-50 p-5">
                        <p className="text-xs font-black uppercase tracking-wider text-blue-600">
                          Applicant Information
                        </p>

                        <div className="mt-4 space-y-3">
                          <div>
                            <p className="text-xs font-bold text-slate-400">
                              Email
                            </p>
                            <p className="font-bold text-slate-900">
                              {item.email}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs font-bold text-slate-400">
                              Phone
                            </p>
                            <p className="font-bold text-slate-900">
                              {item.phone}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs font-bold text-slate-400">
                              Address
                            </p>
                            <p className="font-semibold text-slate-700">
                              {item.address || "Not provided"}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs font-bold text-slate-400">
                              Emergency Contact
                            </p>
                            <p className="font-semibold text-slate-700">
                              {item.emergency_contact_name || "Not provided"}
                              {item.emergency_contact_phone
                                ? ` · ${item.emergency_contact_phone}`
                                : ""}
                            </p>
                          </div>
                        </div>
                      </section>

                      {/* VEHICLE */}
                      <section className="rounded-2xl bg-blue-50 p-5">
                        <p className="text-xs font-black uppercase tracking-wider text-blue-600">
                          Vehicle Information
                        </p>

                        <div className="mt-4 space-y-3">
                          <div>
                            <p className="text-xs font-bold text-slate-400">
                              Vehicle
                            </p>
                            <p className="font-black text-blue-950">
                              {item.vehicle_type || "Not specified"}{" "}
                              {item.vehicle_brand || ""}{" "}
                              {item.vehicle_model || ""}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs font-bold text-slate-400">
                              Color
                            </p>
                            <p className="font-semibold text-slate-700">
                              {item.vehicle_color || "Not provided"}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs font-bold text-slate-400">
                              Plate Number
                            </p>
                            <p className="font-semibold text-slate-700">
                              {item.plate_number || "Not provided"}
                            </p>
                          </div>
                        </div>
                      </section>

                      {/* ACTIONS */}
                      {["pending", "under_review"].includes(item.status) && (
                        <section className="flex h-fit min-w-[190px] flex-col gap-2">
                          <button
                            disabled={saving === item.id}
                            onClick={() => review(item, "under_review")}
                            className="rounded-xl bg-blue-600 px-5 py-3 font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Under Review
                          </button>

                          <button
                            disabled={saving === item.id}
                            onClick={() => review(item, "request_documents")}
                            className="rounded-xl bg-amber-500 px-5 py-3 font-black text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Request Docs
                          </button>

                          <button
                            disabled={saving === item.id}
                            onClick={() => review(item, "approve")}
                            className="rounded-xl bg-emerald-600 px-5 py-3 font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Approve Rider
                          </button>

                          <button
                            disabled={saving === item.id}
                            onClick={() => review(item, "reject")}
                            className="rounded-xl bg-red-600 px-5 py-3 font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </section>
                      )}
                    </div>

                    {/* DOCUMENTS */}
                    <div className="border-t border-slate-100 px-5 py-5 md:px-6">
                      <p className="text-xs font-black uppercase tracking-wider text-slate-500">
                        Submitted Requirements
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {Object.entries(documentLabels).map(([key, label]) =>
                          item.document_urls?.[key] ? (
                            <a
                              key={key}
                              href={item.document_urls[key]}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-black text-blue-700 transition hover:bg-blue-100"
                            >
                              ✓ View {label}
                            </a>
                          ) : (
                            <span
                              key={key}
                              className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-black text-red-700"
                            >
                              ✕ Missing {label}
                            </span>
                          )
                        )}
                      </div>

                      {item.documents_requested && (
                        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
                          <strong>Requested documents:</strong>{" "}
                          {item.documents_requested}
                        </div>
                      )}

                      {item.rejection_reason && (
                        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
                          <strong>Rejection reason:</strong>{" "}
                          {item.rejection_reason}
                        </div>
                      )}
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
