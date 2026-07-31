import Link from "next/link";
import { requireCustomerPage } from "@/lib/customer";
import CustomerLogoutButton from "../CustomerLogoutButton";

export default async function CustomerProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const customer = await requireCustomerPage();

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-50 border-b border-blue-100 bg-white/95 px-4 py-4 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <Link href="/customer/dashboard" className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-blue-700 to-sky-500 text-2xl shadow-lg shadow-blue-200">
              🏍️
            </span>
            <span>
              <span className="block text-lg font-black text-blue-950">
                Barangay Express
              </span>
              <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-blue-500">
                Customer Portal
              </span>
            </span>
          </Link>

          <nav className="flex flex-wrap items-center justify-end gap-2">
            <Link
              href="/customer/dashboard"
              className="rounded-xl px-3 py-2 text-sm font-extrabold text-slate-700 hover:bg-blue-50 hover:text-blue-700"
            >
              My Orders
            </Link>
            <Link
              href="/book"
              className="rounded-xl bg-blue-700 px-3 py-2 text-sm font-extrabold text-white hover:bg-blue-800"
            >
              Book Delivery
            </Link>
            <Link
              href="/customer/addresses"
              className="rounded-xl px-3 py-2 text-sm font-extrabold text-slate-700 hover:bg-blue-50 hover:text-blue-700"
            >
              Addresses
            </Link>
            <Link
              href="/customer/profile"
              className="rounded-xl px-3 py-2 text-sm font-extrabold text-slate-700 hover:bg-blue-50 hover:text-blue-700"
            >
              {customer.full_name}
            </Link>
            <CustomerLogoutButton />
          </nav>
        </div>
      </header>

      {children}
    </main>
  );
}
