"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

const textFields = [
  ["full_name", "Full name"], ["email", "Email"], ["phone", "Phone (09XXXXXXXXX)"],
  ["birthdate", "Birthdate"], ["emergency_contact_name", "Emergency contact name"],
  ["emergency_contact_phone", "Emergency contact phone"], ["vehicle_type", "Vehicle type"],
  ["vehicle_brand", "Vehicle brand"], ["vehicle_model", "Vehicle model"], ["vehicle_color", "Vehicle color"],
  ["plate_number", "Plate number"], ["license_number", "Driver's license number"],
] as const;

const fileFields = [
  ["license_front", "Driver's License — Front"], ["license_back", "Driver's License — Back"],
  ["or_document", "Official Receipt (OR)"], ["cr_document", "Certificate of Registration (CR)"],
  ["vehicle_photo", "Vehicle Photo"], ["rider_selfie", "Rider Selfie"],
  ["nbi_clearance", "NBI Clearance (required for first application and reapplication)"],
] as const;

export default function ApplyRiderPage() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitting(true); setError("");
    try {
      const response = await fetch("/api/rider-applications", { method: "POST", body: new FormData(event.currentTarget) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to submit application.");
      setSubmitted(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to submit application."); }
    finally { setSubmitting(false); }
  }

  if (submitted) return <main className="min-h-screen bg-slate-50 px-4 py-16"><div className="mx-auto max-w-xl rounded-3xl border border-green-200 bg-white p-8 text-center shadow-sm"><div className="text-5xl">✅</div><h1 className="mt-4 text-3xl font-black text-slate-900">Application submitted</h1><p className="mt-3 text-slate-600">Ire-review ng admin ang application at documents mo. Kokontakin ka kapag approved o may kailangang palitan.</p><Link href="/" className="mt-7 inline-block rounded-xl bg-blue-600 px-6 py-3 font-black text-white">Back to Home</Link></div></main>;

  return <main className="min-h-screen bg-slate-50 px-4 py-10"><div className="mx-auto max-w-4xl">
    <div className="mb-6"><Link href="/" className="font-bold text-blue-600">← Barangay Express</Link><h1 className="mt-3 text-4xl font-black text-slate-900">Apply as a Rider</h1><p className="mt-2 text-slate-600">Private at admin-only ang uploaded documents. Maximum 5 MB bawat file; JPG, PNG, WEBP, o PDF.</p></div>
    <form onSubmit={submit} className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
      <section><h2 className="text-xl font-black text-slate-900">Application type</h2><select name="application_type" className="mt-3 w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900"><option value="initial">First application</option><option value="reapplication">Reapplication / returning rider</option></select><p className="mt-2 text-sm text-slate-500">Active hired riders do not need to renew NBI clearance. A fresh NBI clearance is required only for reapplication.</p></section>
      <section><h2 className="mb-4 text-xl font-black text-slate-900">Personal and vehicle details</h2><div className="grid gap-5 md:grid-cols-2">{textFields.map(([name,label]) => <label key={name}><span className="mb-1 block text-sm font-bold text-slate-700">{label}</span><input name={name} type={name === "email" ? "email" : name === "birthdate" ? "date" : "text"} required className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-blue-500" defaultValue={name === "vehicle_type" ? "Motorcycle" : ""} /></label>)}</div><label className="mt-5 block"><span className="mb-1 block text-sm font-bold text-slate-700">Complete address</span><textarea name="address" required rows={3} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900" /></label><label className="mt-5 block"><span className="mb-1 block text-sm font-bold text-slate-700">Delivery experience or notes</span><textarea name="experience_notes" rows={3} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900" /></label></section>
      <section><h2 className="mb-2 text-xl font-black text-slate-900">Required verification documents</h2><div className="grid gap-4 md:grid-cols-2">{fileFields.map(([name,label]) => <label key={name} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><span className="mb-2 block text-sm font-black text-slate-800">{label}</span><input name={name} type="file" required accept="image/jpeg,image/png,image/webp,application/pdf" className="block w-full text-sm text-slate-600" /></label>)}<label className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><span className="mb-2 block text-sm font-black text-slate-800">Barangay Clearance (optional)</span><input name="barangay_clearance" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="block w-full text-sm text-slate-600" /></label></div></section>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 font-semibold text-red-700">{error}</div>}
      <button disabled={submitting} className="w-full rounded-xl bg-blue-600 px-6 py-4 text-lg font-black text-white disabled:opacity-50">{submitting ? "Uploading and submitting..." : "Submit Rider Application"}</button>
    </form>
  </div></main>;
}
