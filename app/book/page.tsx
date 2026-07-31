import { createAdminClient } from "@/lib/supabase-admin";
import { requireCustomerPage } from "@/lib/customer";
import BookingForm from "./BookingForm";

export default async function BookPage() {
  const customer = await requireCustomerPage();
  const supabaseAdmin = createAdminClient();
  const { data: addresses, error } = await supabaseAdmin
    .from("saved_addresses")
    .select(
      "id, label, contact_name, phone, address, latitude, longitude, is_default"
    )
    .eq("customer_user_id", customer.id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Unable to load saved addresses: ${error.message}`);
  }

  return (
    <BookingForm
      customerName={customer.full_name}
      savedAddresses={addresses ?? []}
    />
  );
}
