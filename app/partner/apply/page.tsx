import Link from "next/link";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireCustomerPage } from "@/lib/customer";
import PartnerApplicationForm from "./PartnerApplicationForm";

type ExistingApplication = {
  business_id: string;
  member_role: string;
  business: {
    id: string;
    name: string;
    business_type: string;
    address: string;
    approval_status: string;
    store_status: string;
    rejection_reason: string | null;
    suspension_reason: string | null;
    created_at: string;
  };
};

function statusStyle(status: string) {
  if (status === "approved") return "bg-emerald-100 text-emerald-800";
  if (status === "rejected") return "bg-red-100 text-red-800";
  if (status === "suspended") return "bg-orange-100 text-orange-800";
  if (status === "inactive") return "bg-slate-200 text-slate-700";
  return "bg-amber-100 text-amber-800";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

export default async function PartnerApplyPage() {
  const customer = await requireCustomerPage();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("business_members")
    .select(
      `
        business_id,
        member_role,
        business:businesses!business_members_business_id_fkey (
          id,
          name,
          business_type,
          address,
          approval_status,
          store_status,
          rejection_reason,
          suspension_reason,
          created_at
        )
      `
    )
    .eq("user_id", customer.id)
    .eq("member_role", "owner")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Unable to load Partner applications: ${error.message}`);
  }

  const applications: ExistingApplication[] = (data ?? [])
    .map((row) => {
      const business = Array.isArray(row.business)
        ? row.business[0]
        : row.business;

      if (!business) return null;

      return {
        business_id: row.business_id,
        member_role: row.member_role,
        business,
      } as ExistingApplication;
    })
    .filter((row): row is ExistingApplication => row !== null);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-blue-100 bg-white px-4 py-4 shadow-sm">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
          <Link href="/customer/dashboard" className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-blue-700 to-sky-500 text-2xl shadow-lg shadow-blue-200">
              🏍️
            </span>
            <span>
              <span className="block text-lg font-black text-blue-950">
                Barangay Express
              </span>
              <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-blue-500">
                Partner Application
              </span>
            </span>
          </Link>
          <Link
            href="/customer/dashboard"
            className="rounded-xl border border-blue-200 px-4 py-2 text-sm font-black text-blue-700 hover:bg-blue-50"
          >
            ← Customer Dashboard
          </Link>
        </div>
      </header>

      <section className="bg-gradient-to-br from-blue-950 via-blue-800 to-sky-600 px-4 py-12 text-white">
        <div className="mx-auto max-w-5xl">
          <p className="font-extrabold uppercase tracking-[0.2em] text-sky-300">
            Barangay Express Partner
          </p>
          <h1 className="mt-3 text-4xl font-black md:text-5xl">
            Grow your local business with delivery.
          </h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-blue-100">
            Mag-apply bilang Restaurant/Business Partner. Kapag approved na,
            saka natin ia-activate ang Partner Dashboard, menu/products at
            Customer → Business → Rider delivery flow.
          </p>
        </div>
      </section>

      <section className="px-4 py-10 md:py-14">
        <div className="mx-auto grid max-w-5xl gap-8">
          {applications.length > 0 && (
            <div>
              <div className="mb-5">
                <h2 className="text-2xl font-black text-blue-950">
                  Your Partner applications
                </h2>
                <p className="mt-1 text-slate-600">
                  Makikita rito ang current approval status ng mga business na
                  iyong isinumite.
                </p>
              </div>

              <div className="grid gap-4">
                {applications.map((application) => (
                  <article
                    key={application.business_id}
                    className="rounded-[2rem] border border-blue-100 bg-white p-6 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h3 className="text-2xl font-black text-blue-950">
                          {application.business.name}
                        </h3>
                        <p className="mt-1 capitalize text-slate-500">
                          {application.business.business_type.replaceAll("_", " ")}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-4 py-2 text-sm font-black capitalize ${statusStyle(
                          application.business.approval_status
                        )}`}
                      >
                        {application.business.approval_status}
                      </span>
                    </div>

                    <p className="mt-4 font-semibold leading-6 text-slate-700">
                      📍 {application.business.address}
                    </p>
                    <p className="mt-3 text-sm text-slate-500">
                      Submitted {formatDate(application.business.created_at)}
                    </p>

                    {application.business.approval_status === "pending" && (
                      <div className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-800">
                        Waiting for Barangay Express Admin review. The store is
                        not visible to customers yet.
                      </div>
                    )}

                    {application.business.approval_status === "rejected" && (
                      <div className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700">
                        <strong>Reason:</strong>{" "}
                        {application.business.rejection_reason ||
                          "No rejection reason was provided."}
                      </div>
                    )}

                    {application.business.approval_status === "suspended" && (
                      <div className="mt-5 rounded-2xl bg-orange-50 p-4 text-sm font-semibold text-orange-800">
                        <strong>Suspension:</strong>{" "}
                        {application.business.suspension_reason ||
                          "Please contact Barangay Express Admin."}
                      </div>
                    )}

                    {application.business.approval_status === "approved" && (
                      <div className="mt-5 rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
                        Approved. Partner Dashboard activation is the next
                        development step.
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="mb-5">
              <h2 className="text-2xl font-black text-blue-950">
                {applications.length > 0
                  ? "Register another business"
                  : "Become a Partner"}
              </h2>
              <p className="mt-1 text-slate-600">
                Logged in as {customer.full_name}. Your customer account remains
                a customer account even after becoming a Partner.
              </p>
            </div>

            <PartnerApplicationForm defaultEmail={customer.email || ""} />
          </div>
        </div>
      </section>
    </main>
  );
}
