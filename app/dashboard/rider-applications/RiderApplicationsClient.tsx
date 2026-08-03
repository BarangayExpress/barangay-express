"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Application = Record<string, any> & { id: string; full_name: string; email: string; phone: string; status: string; created_at: string; document_urls?: Record<string,string> };
type Credentials = { email: string; temporary_password: string } | null;
const documentLabels: Record<string,string> = { license_front_path:"License Front", license_back_path:"License Back", or_path:"OR", cr_path:"CR", vehicle_photo_path:"Vehicle Photo", rider_selfie_path:"Rider Selfie", nbi_clearance_path:"NBI Clearance", barangay_clearance_path:"Barangay Clearance" };

export default function RiderApplicationsClient() {
  const [items,setItems]=useState<Application[]>([]), [status,setStatus]=useState("pending"), [loading,setLoading]=useState(true), [saving,setSaving]=useState<string|null>(null), [error,setError]=useState("");
  const [credentials,setCredentials]=useState<Credentials>(null);
  const load=useCallback(async()=>{setLoading(true);setError("");try{const r=await fetch(`/api/admin/rider-applications?status=${status}&t=${Date.now()}`,{cache:"no-store"});const j=await r.json();if(!r.ok)throw new Error(j.error||"Unable to load applications.");setItems(j.applications||[])}catch(e){setError(e instanceof Error?e.message:"Unable to load applications.")}finally{setLoading(false)}},[status]);
  useEffect(()=>{void load()},[load]);

  async function review(item:Application,action:"approve"|"reject"|"request_documents"|"under_review"){
    let rejection_reason="",documents_requested="";
    if(action==="reject"){rejection_reason=window.prompt(`Reason for rejecting ${item.full_name}:`)||"";if(!rejection_reason.trim())return}
    if(action==="request_documents"){documents_requested=window.prompt("List the missing, expired, or unclear documents:")||"";if(!documents_requested.trim())return}
    if(action==="approve"&&!window.confirm(`Approve ${item.full_name} and create a rider account?`))return;
    setSaving(item.id);setError("");setCredentials(null);
    try{const r=await fetch("/api/admin/rider-applications",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({application_id:item.id,action,rejection_reason,documents_requested})});const j=await r.json();if(!r.ok)throw new Error(j.error||"Review failed.");if(j.credentials)setCredentials(j.credentials);await load()}catch(e){setError(e instanceof Error?e.message:"Review failed.")}finally{setSaving(null)}
  }

  return <main className="min-h-screen bg-slate-50 p-4 md:p-8"><div className="mx-auto max-w-7xl">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><p className="font-bold text-blue-600">Barangay Express Admin</p><h1 className="text-3xl font-black text-slate-900">Rider Verification</h1><p className="mt-1 text-sm text-slate-500">Private documents use temporary signed links and are available only to admins.</p></div><div className="flex gap-2"><Link href="/dashboard/riders" className="rounded-xl border border-blue-200 bg-white px-4 py-3 font-bold text-blue-700">Manage Riders</Link><Link href="/dashboard" className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-bold text-slate-700">← Dashboard</Link></div></div>
    <div className="mb-5 flex flex-wrap gap-2">{["pending","under_review","needs_documents","approved","rejected"].map(v=><button key={v} onClick={()=>setStatus(v)} className={`rounded-xl px-4 py-3 font-black capitalize ${status===v?"bg-blue-600 text-white":"border border-slate-300 bg-white text-slate-700"}`}>{v.replaceAll("_"," ")}</button>)}</div>
    {credentials&&<div className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-5"><h2 className="font-black text-amber-900">One-time rider credentials</h2><p>Email: <strong>{credentials.email}</strong></p><p>Password: <strong className="select-all font-mono">{credentials.temporary_password}</strong></p></div>}
    {error&&<div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 font-semibold text-red-700">{error}</div>}
    <div className="space-y-4">{loading?<p className="rounded-2xl bg-white p-8 text-center font-bold text-slate-500">Loading...</p>:items.length===0?<p className="rounded-2xl border bg-white p-8 text-center text-slate-500">No {status.replaceAll("_"," ")} applications.</p>:items.map(item=><article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap justify-between gap-5"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-black text-slate-900">{item.full_name}</h2><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{item.application_type||"initial"}</span></div><p className="text-slate-600">{item.email} · {item.phone}</p><p className="text-sm text-slate-500">{item.vehicle_type} {item.vehicle_brand} {item.vehicle_model} · {item.vehicle_color||"No color"} · {item.plate_number||"No plate"}</p><p className="mt-2 text-sm text-slate-600">Address: {item.address||"Not provided"}</p><p className="text-sm text-slate-600">Emergency: {item.emergency_contact_name} · {item.emergency_contact_phone}</p>
      <div className="mt-4 flex flex-wrap gap-2">{Object.entries(documentLabels).map(([key,label])=>item.document_urls?.[key]?<a key={key} href={item.document_urls[key]} target="_blank" rel="noreferrer" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700">View {label}</a>:<span key={key} className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">Missing {label}</span>)}</div>
      {item.documents_requested&&<p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">Requested: {item.documents_requested}</p>}{item.rejection_reason&&<p className="mt-3 text-sm font-semibold text-red-700">Rejected: {item.rejection_reason}</p>}<p className="mt-3 text-xs font-semibold text-slate-400">Submitted {new Date(item.created_at).toLocaleString("en-PH")}</p></div>
      {["pending","under_review"].includes(item.status)&&<div className="flex h-fit flex-wrap gap-2"><button disabled={saving===item.id} onClick={()=>review(item,"under_review")} className="rounded-xl bg-blue-600 px-4 py-3 font-black text-white disabled:opacity-50">Under Review</button><button disabled={saving===item.id} onClick={()=>review(item,"request_documents")} className="rounded-xl bg-amber-500 px-4 py-3 font-black text-white disabled:opacity-50">Request Docs</button><button disabled={saving===item.id} onClick={()=>review(item,"approve")} className="rounded-xl bg-green-600 px-4 py-3 font-black text-white disabled:opacity-50">Approve</button><button disabled={saving===item.id} onClick={()=>review(item,"reject")} className="rounded-xl bg-red-600 px-4 py-3 font-black text-white disabled:opacity-50">Reject</button></div>}</div>
    </article>)}</div>
  </div></main>;
}
