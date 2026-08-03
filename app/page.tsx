import { createClient as createServerClient } from "@/lib/supabase-server";
import Link from "next/link";

export default async function Home() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let accountHref = "/customer/login";
  let accountLabel = "Customer Login";
  let isCustomerLoggedIn = false;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.is_active && profile.role === "customer") {
      accountHref = "/customer/dashboard";
      accountLabel = "My Account";
      isCustomerLoggedIn = true;
    } else if (profile?.is_active && profile.role === "rider") {
      accountHref = "/rider/dashboard";
      accountLabel = "Rider Dashboard";
    } else if (profile?.is_active && profile.role === "admin") {
      accountHref = "/dashboard";
      accountLabel = "Admin Dashboard";
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-blue-100 bg-white/90 px-6 py-4 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-2xl shadow-lg shadow-blue-200">
              🚚
            </div>

            <div>
              <p className="text-2xl font-extrabold text-blue-950 md:text-3xl">
                Barangay Express
              </p>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-500">
                Local Delivery Service
              </p>
            </div>
          </Link>

          <nav className="hidden items-center gap-7 font-semibold text-slate-700 md:flex">
            <Link href="/" className="transition hover:text-blue-600">
              Home
            </Link>

            <Link href="/book" className="transition hover:text-blue-600">
              Book
            </Link>

            <Link href="/#rates" className="transition hover:text-blue-600">
              Rates
            </Link>

            <Link href="/track" className="transition hover:text-blue-600">
              Track
            </Link>

            <Link href="/apply-rider" className="transition hover:text-blue-600">
              Apply as Rider
            </Link>

            <Link href="/#contact" className="transition hover:text-blue-600">
              Contact
            </Link>

            <a
              href={accountHref}
              className="rounded-xl border border-blue-200 px-4 py-2 text-blue-700 transition hover:bg-blue-50"
            >
              {accountLabel}
            </a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-950 via-blue-800 to-sky-600 px-6 py-24 text-white md:py-32">
        <div className="absolute -left-20 top-10 h-72 w-72 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="absolute -right-20 bottom-0 h-96 w-96 rounded-full bg-blue-300/20 blur-3xl" />

        <div className="relative mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2">
          <div>
            <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold backdrop-blur">
              Mabilis na delivery sa loob ng municipality
            </span>

            <h1 className="mt-7 text-5xl font-extrabold leading-tight md:text-7xl">
              Hatid sa kapitbahay,
              <span className="block text-sky-300">mabilis at maaasahan.</span>
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-blue-100 md:text-xl">
              Mag-book ng delivery para sa documents, pagkain, grocery, gamot
              at maliliit na parcels. Simple, abot-kaya at madaling i-track.
            </p>

            <div className="mt-9 flex flex-col gap-4 sm:flex-row">
              <a
                href="/book"
                className="rounded-2xl bg-white px-7 py-4 text-center text-lg font-bold text-blue-800 shadow-xl shadow-blue-950/20 transition hover:-translate-y-1 hover:bg-blue-50"
              >
                Book Delivery
              </a>

              <a
                href="/apply-rider"
                className="rounded-2xl border border-white/30 bg-white/10 px-7 py-4 text-center text-lg font-bold text-white backdrop-blur transition hover:bg-white/20"
              >
                Apply as Rider
              </a>

              <a
                href="/track"
                className="rounded-2xl border border-white/30 bg-white/10 px-7 py-4 text-center text-lg font-bold text-white backdrop-blur transition hover:bg-white/20"
              >
                Track Order
              </a>
            </div>

            {!isCustomerLoggedIn && (
              <p className="mt-5 text-sm font-semibold text-blue-100">
                Wala pang customer account?{" "}
                <a
                  href="/customer/signup"
                  className="font-black text-white underline underline-offset-4"
                >
                  Sign up free
                </a>
              </p>
            )}

            <div className="mt-10 grid max-w-xl grid-cols-3 gap-4">
              <div>
                <p className="text-2xl font-extrabold">Fast</p>
                <p className="text-sm text-blue-200">Local delivery</p>
              </div>

              <div>
                <p className="text-2xl font-extrabold">Secure</p>
                <p className="text-sm text-blue-200">Order tracking</p>
              </div>

              <div>
                <p className="text-2xl font-extrabold">Affordable</p>
                <p className="text-sm text-blue-200">Local rates</p>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/20 bg-white/10 p-6 shadow-2xl backdrop-blur-xl">
            <div className="rounded-3xl bg-white p-6 text-slate-900 shadow-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold uppercase tracking-wider text-blue-500">
                    Easy Booking
                  </p>
                  <h2 className="mt-1 text-2xl font-extrabold text-blue-950">
                    Delivery in 3 simple steps
                  </h2>
                </div>

                <div className="text-4xl">📦</div>
              </div>

              <div className="mt-7 space-y-4">
                <div className="flex gap-4 rounded-2xl bg-blue-50 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 font-bold text-white">
                    1
                  </div>
                  <div>
                    <p className="font-bold">Fill out the booking form</p>
                    <p className="text-sm text-slate-600">
                      Ilagay ang pickup at drop-off details.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4 rounded-2xl bg-sky-50 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500 font-bold text-white">
                    2
                  </div>
                  <div>
                    <p className="font-bold">Wait for confirmation</p>
                    <p className="text-sm text-slate-600">
                      Makakatanggap agad ng booking number.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4 rounded-2xl bg-indigo-50 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 font-bold text-white">
                    3
                  </div>
                  <div>
                    <p className="font-bold">Track your delivery</p>
                    <p className="text-sm text-slate-600">
                      Tingnan ang live status gamit ang booking number.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="font-bold uppercase tracking-[0.22em] text-blue-500">
              Our Services
            </p>

            <h2 className="mt-3 text-4xl font-extrabold text-blue-950 md:text-5xl">
              Para sa araw-araw mong delivery needs
            </h2>

            <p className="mt-5 text-lg text-slate-600">
              Isang simpleng local delivery service para sa mahalagang gamit at
              errands mo.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["📦", "Parcel Delivery", "Documents at maliliit na packages"],
              ["🍔", "Food Pickup", "Restaurant at food orders"],
              ["💊", "Medicine Delivery", "Gamot at pharmacy pickup"],
              ["🛒", "Grocery Delivery", "Daily essentials at groceries"],
            ].map(([icon, title, text]) => (
              <div
                key={title}
                className="rounded-3xl border border-blue-100 bg-white p-7 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-3xl">
                  {icon}
                </div>

                <h3 className="mt-5 text-xl font-extrabold text-blue-950">
                  {title}
                </h3>

                <p className="mt-3 leading-7 text-slate-600">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Rates */}
      <section
        id="rates"
        className="scroll-mt-24 bg-blue-950 px-6 py-20 text-white"
      >
        <div className="mx-auto max-w-5xl">
          <div className="text-center">
            <p className="font-bold uppercase tracking-[0.22em] text-sky-300">
              Simple Pricing
            </p>

            <h2 className="mt-3 text-4xl font-extrabold md:text-5xl">
              Delivery Rates
            </h2>

            <p className="mt-4 text-blue-200">
              Affordable rates para sa delivery sa loob ng municipality.
            </p>
          </div>

          <div className="mt-10 overflow-hidden rounded-3xl border border-white/10 bg-white/10 shadow-2xl backdrop-blur">
            {[
              ["0–2 KM", "₱49"],
              ["2–5 KM", "₱79"],
              ["5–10 KM", "₱129"],
            ].map(([distance, price], index) => (
              <div
                key={distance}
                className={`flex items-center justify-between px-7 py-6 ${
                  index < 2 ? "border-b border-white/10" : ""
                }`}
              >
                <span className="text-lg font-semibold">{distance}</span>
                <span className="text-2xl font-extrabold text-sky-300">
                  {price}
                </span>
              </div>
            ))}
          </div>

          <p className="mt-5 text-center text-sm text-blue-300">
            Final fare may vary depende sa item, waiting time at special
            requests.
          </p>
        </div>
      </section>

      {/* Contact */}
      <section
        id="contact"
        className="scroll-mt-24 bg-white px-6 py-20"
      >
        <div className="mx-auto grid max-w-6xl gap-10 rounded-[2rem] border border-blue-100 bg-gradient-to-br from-blue-50 to-sky-50 p-8 shadow-sm md:grid-cols-2 md:p-12">
          <div>
            <p className="font-bold uppercase tracking-[0.22em] text-blue-500">
              Contact Us
            </p>

            <h2 className="mt-3 text-4xl font-extrabold text-blue-950">
              May delivery request ka?
            </h2>

            <p className="mt-5 leading-8 text-slate-600">
              Makipag-ugnayan para sa booking questions, special delivery
              requests at coverage area.
            </p>
          </div>

          <div className="space-y-4">
            <a
              href="tel:09150613802"
              className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm transition hover:shadow-md"
            >
              <span className="text-2xl">📞</span>
              <div>
                <p className="text-sm font-bold text-blue-500">Phone</p>
                <p className="font-bold text-blue-950">0915-061-3802</p>
              </div>
            </a>

            <a
              href="mailto:barangayexpress@gmail.com"
              className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm transition hover:shadow-md"
            >
              <span className="text-2xl">📧</span>
              <div>
                <p className="text-sm font-bold text-blue-500">Email</p>
                <p className="font-bold text-blue-950">
                  barangayexpress@gmail.com
                </p>
              </div>
            </a>

            <div className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm">
              <span className="text-2xl">📍</span>
              <div>
                <p className="text-sm font-bold text-blue-500">Coverage</p>
                <p className="font-bold text-blue-950">
                  Talisay, Batangas
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-blue-950 px-6 py-8 text-center text-blue-200">
        <p className="font-semibold">
          © 2026 Barangay Express. All rights reserved.
        </p>

        <a
          href="/login"
          className="mt-2 inline-block text-sm text-blue-300 hover:text-white"
        >
          Admin Login
        </a>
      </footer>
    </main>
  );
}
