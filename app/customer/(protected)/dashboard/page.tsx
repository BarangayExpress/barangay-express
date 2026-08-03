import Link from "next/link";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireCustomerPage } from "@/lib/customer";
import BookingChatPanel from "@/app/components/BookingChatPanel";

type CustomerOrder = {
  id: number;
  booking_no: string;
  pickup_address: string;
  dropoff_address: string;
  package_type: string | null;
  payment_method: string | null;
  payment_status: string | null;
  status: string | null;
  price: number | string | null;
  total_amount: number | string | null;
  item_payment_flow: string | null;
  estimated_item_amount: number | string | null;
  actual_item_amount: number | string | null;
  purchase_payment_status: string | null;
  created_at: string;
};

function formatMoney(value: number | string | null) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(Number(value || 0));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

function getCustomerTotal(order: CustomerOrder) {
  if (
    order.item_payment_flow === "rider_advance_cod" &&
    order.actual_item_amount !== null
  ) {
    return Number(order.price || 0) + Number(order.actual_item_amount || 0);
  }

  return Number(order.total_amount || 0);
}

export default async function CustomerDashboardPage() {
  const customer = await requireCustomerPage();
  const supabaseAdmin = createAdminClient();
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(
      "id, booking_no, pickup_address, dropoff_address, package_type, payment_method, payment_status, status, price, total_amount, item_payment_flow, estimated_item_amount, actual_item_amount, purchase_payment_status, created_at"
    )
    .eq("customer_user_id", customer.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Unable to load customer orders: ${error.message}`);
  }

  const orders = (data ?? []) as CustomerOrder[];
  const activeOrders = orders.filter(
    (order) => !["Completed", "Cancelled"].includes(order.status || "")
  ).length;

  return (
    <>
      <section className="bg-gradient-to-br from-blue-950 via-blue-800 to-sky-600 px-4 py-14 text-white">
        <div className="mx-auto max-w-7xl">
          <p className="font-extrabold uppercase tracking-[0.2em] text-sky-300">
            Customer Dashboard
          </p>
          <h1 className="mt-3 text-4xl font-black md:text-5xl">
            Kumusta, {customer.full_name}!
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-blue-100">
            Dito makikita ang lahat ng booking na ginawa gamit ang iyong
            customer account.
          </p>

          <div className="mt-8 grid max-w-xl grid-cols-2 gap-4">
            <div className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur">
              <p className="text-3xl font-black">{orders.length}</p>
              <p className="mt-1 text-sm font-bold text-blue-100">
                Total orders
              </p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur">
              <p className="text-3xl font-black">{activeOrders}</p>
              <p className="mt-1 text-sm font-bold text-blue-100">
                Active orders
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-10 md:py-14">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-3xl font-black text-blue-950">My Orders</h2>
              <p className="mt-2 text-slate-600">
                Pinakabagong booking ang unang makikita.
              </p>
            </div>
            <Link
              href="/book"
              className="rounded-2xl bg-blue-700 px-5 py-3 font-black text-white shadow-lg shadow-blue-200"
            >
              + New Booking
            </Link>
          </div>

          {orders.length === 0 ? (
            <div className="mt-8 rounded-[2rem] border border-dashed border-blue-200 bg-white p-10 text-center">
              <div className="text-5xl">📦</div>
              <h3 className="mt-4 text-2xl font-black text-blue-950">
                Wala pang orders
              </h3>
              <p className="mt-2 text-slate-600">
                Gumawa ng unang delivery booking para makita ito rito.
              </p>
            </div>
          ) : (
            <div className="mt-8 grid gap-5">
              {orders.map((order) => (
                <article
                  key={order.id}
                  className="rounded-[2rem] border border-blue-100 bg-white p-6 shadow-sm md:p-7"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold text-slate-500">
                        {formatDate(order.created_at)}
                      </p>
                      <h3 className="mt-1 text-2xl font-black text-blue-950">
                        {order.booking_no}
                      </h3>
                    </div>
                    <span className="rounded-full bg-blue-100 px-4 py-2 text-sm font-black text-blue-800">
                      {order.status || "Pending"}
                    </span>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-black uppercase tracking-wider text-slate-500">
                        Pickup
                      </p>
                      <p className="mt-2 font-bold leading-6 text-slate-800">
                        📦 {order.pickup_address}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-black uppercase tracking-wider text-slate-500">
                        Drop-off
                      </p>
                      <p className="mt-2 font-bold leading-6 text-slate-800">
                        🏁 {order.dropoff_address}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-5">
                    <div className="flex flex-wrap gap-3 text-sm font-bold text-slate-600">
                      <span>{order.package_type || "Package"}</span>
                      <span>•</span>
                      <span>{order.payment_method || "Cash"}</span>
                      {order.payment_method === "GCash" && (
                        <>
                          <span>•</span>
                          <span>{order.payment_status || "Unpaid"}</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        {order.item_payment_flow === "rider_advance_cod" &&
                          order.actual_item_amount !== null && (
                            <p className="text-xs font-bold text-slate-500">
                              Delivery {formatMoney(order.price)} + item{" "}
                              {formatMoney(order.actual_item_amount)}
                            </p>
                          )}
                        <p className="text-lg font-black text-blue-950">
                          {formatMoney(getCustomerTotal(order))}
                        </p>
                      </div>
                      <Link
                        href={`/track?booking=${encodeURIComponent(
                          order.booking_no
                        )}`}
                        className="rounded-xl border border-blue-200 px-4 py-2 text-sm font-black text-blue-700 hover:bg-blue-50"
                      >
                        Track
                      </Link>
                    </div>
                  </div>

                  {(order.status || "Pending") !== "Pending" && (
                    <div className="-mx-6 -mb-6 mt-6 md:-mx-7 md:-mb-7">
                      <BookingChatPanel
                        orderId={order.id}
                        bookingNo={order.booking_no}
                        role="customer"
                      />
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
