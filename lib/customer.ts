import { redirect } from "next/navigation";
import { createClient as createServerClient } from "@/lib/supabase-server";

export type CustomerProfile = {
  id: string;
  email: string;
  full_name: string;
  role: "customer";
  is_active: boolean;
};

export type SavedAddress = {
  id: string;
  label: string;
  contact_name: string;
  phone: string;
  address: string;
  latitude: number;
  longitude: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export async function requireCustomerPage(): Promise<CustomerProfile> {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/customer/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "customer") {
    await supabase.auth.signOut();
    redirect("/customer/login?error=not-customer");
  }

  if (!profile.is_active) {
    await supabase.auth.signOut();
    redirect("/customer/login?error=inactive");
  }

  return profile as CustomerProfile;
}

export function cleanCustomerText(value: unknown, maximumLength: number) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maximumLength);
}

export function isValidPhilippineMobile(value: string) {
  return /^09\d{9}$/.test(value);
}

export function isValidCoordinate(
  value: unknown,
  minimum: number,
  maximum: number
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
}
