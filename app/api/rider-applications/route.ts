import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { checkRateLimit, getRequestIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REQUIRED_FILES = [
  "license_front", "license_back", "or_document", "cr_document",
  "vehicle_photo", "rider_selfie", "nbi_clearance",
] as const;

function clean(value: FormDataEntryValue | null, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function extension(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  if (file.type === "application/pdf") return "pdf";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

export async function POST(request: Request) {
  const ip = getRequestIp(request);
  const rate = checkRateLimit(`rider-application:${ip}`, 3, 60 * 60 * 1000);
  if (!rate.allowed) return NextResponse.json({ success: false, error: "Too many applications. Please try again later." }, { status: 429 });

  const form = await request.formData();
  const fullName = clean(form.get("full_name"), 120);
  const email = clean(form.get("email"), 254).toLowerCase();
  const phone = clean(form.get("phone"), 30);
  const address = clean(form.get("address"), 300);
  const applicationType = clean(form.get("application_type"), 20) === "reapplication" ? "reapplication" : "initial";
  const birthdate = clean(form.get("birthdate"), 20);
  const emergencyContactName = clean(form.get("emergency_contact_name"), 120);
  const emergencyContactPhone = clean(form.get("emergency_contact_phone"), 30);
  const vehicleType = clean(form.get("vehicle_type"), 60) || "Motorcycle";
  const vehicleBrand = clean(form.get("vehicle_brand"), 60);
  const vehicleModel = clean(form.get("vehicle_model"), 60);
  const vehicleColor = clean(form.get("vehicle_color"), 40);
  const plateNumber = clean(form.get("plate_number"), 30).toUpperCase();
  const licenseNumber = clean(form.get("license_number"), 50).toUpperCase();
  const experienceNotes = clean(form.get("experience_notes"), 600);

  if (fullName.length < 2) return NextResponse.json({ success: false, error: "Full name is required." }, { status: 400 });
  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ success: false, error: "Enter a valid email address." }, { status: 400 });
  if (!/^09\d{9}$/.test(phone)) return NextResponse.json({ success: false, error: "Phone number must use the 09XXXXXXXXX format." }, { status: 400 });
  if (address.length < 8 || !birthdate) return NextResponse.json({ success: false, error: "Birthdate and complete address are required." }, { status: 400 });
  if (!/^09\d{9}$/.test(emergencyContactPhone) || emergencyContactName.length < 2) return NextResponse.json({ success: false, error: "Valid emergency contact details are required." }, { status: 400 });

  const files: Record<string, File> = {};
  for (const field of REQUIRED_FILES) {
    const value = form.get(field);
    if (!(value instanceof File) || value.size === 0) return NextResponse.json({ success: false, error: `Required document missing: ${field.replaceAll("_", " ")}.` }, { status: 400 });
    if (value.size > 5 * 1024 * 1024) return NextResponse.json({ success: false, error: `${value.name} exceeds the 5 MB limit.` }, { status: 400 });
    if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(value.type)) return NextResponse.json({ success: false, error: `${value.name} must be JPG, PNG, WEBP, or PDF.` }, { status: 400 });
    files[field] = value;
  }
  const optionalBarangay = form.get("barangay_clearance");
  if (optionalBarangay instanceof File && optionalBarangay.size > 0) files.barangay_clearance = optionalBarangay;

  const admin = createAdminClient();
  const { data: existing } = await admin.from("rider_applications").select("id").ilike("email", email).in("status", ["pending", "needs_documents", "under_review"]).maybeSingle();
  if (existing) return NextResponse.json({ success: false, error: "An active application using this email already exists." }, { status: 409 });

  const applicationId = crypto.randomUUID();
  const paths: Record<string, string> = {};
  const uploaded: string[] = [];
  try {
    for (const [field, file] of Object.entries(files)) {
      const path = `${applicationId}/${field}.${extension(file)}`;
      const { error } = await admin.storage.from("rider-documents").upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
      if (error) throw error;
      uploaded.push(path); paths[field] = path;
    }

    const { error } = await admin.from("rider_applications").insert({
      id: applicationId, full_name: fullName, email, phone, address, application_type: applicationType,
      birthdate, emergency_contact_name: emergencyContactName, emergency_contact_phone: emergencyContactPhone,
      vehicle_type: vehicleType, vehicle_brand: vehicleBrand || null, vehicle_model: vehicleModel || null,
      vehicle_color: vehicleColor || null, plate_number: plateNumber || null, license_number: licenseNumber || null,
      experience_notes: experienceNotes || null, status: "pending",
      license_front_path: paths.license_front, license_back_path: paths.license_back,
      or_path: paths.or_document, cr_path: paths.cr_document, vehicle_photo_path: paths.vehicle_photo,
      rider_selfie_path: paths.rider_selfie, nbi_clearance_path: paths.nbi_clearance,
      barangay_clearance_path: paths.barangay_clearance || null,
    });
    if (error) throw error;
    return NextResponse.json({ success: true, application_id: applicationId }, { status: 201 });
  } catch (error) {
    if (uploaded.length) await admin.storage.from("rider-documents").remove(uploaded);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unable to submit application." }, { status: 500 });
  }
}
