import { requireCustomerPage } from "@/lib/customer";
import ProfileForm from "./ProfileForm";

export default async function CustomerProfilePage() {
  const customer = await requireCustomerPage();

  return (
    <section className="px-4 py-12">
      <div className="mx-auto max-w-2xl rounded-[2rem] border border-blue-100 bg-white p-7 shadow-sm md:p-10">
        <p className="font-extrabold uppercase tracking-[0.2em] text-blue-500">
          Account Settings
        </p>
        <h1 className="mt-3 text-4xl font-black text-blue-950">
          Customer Profile
        </h1>
        <p className="mt-3 leading-7 text-slate-600">
          Ang email at account role ay protektado. Ang buong pangalan lamang ang
          maaaring baguhin dito.
        </p>

        <ProfileForm
          initialFullName={customer.full_name}
          email={customer.email}
        />
      </div>
    </section>
  );
}
