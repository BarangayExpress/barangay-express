"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type PaymentStatus =
  | "Unpaid"
  | "For Verification"
  | "Paid"
  | "Rejected"
  | "Refunded";

type PaymentOrder = {
  id: number;
  booking_no: string | null;
  sender_name: string | null;
  sender_phone: string | null;
  receiver_name: string | null;
  payment_method: string | null;
  payment_status: PaymentStatus | null;
  payment_reference: string | null;
  payment_submitted_at: string | null;
  payment_verified_at: string | null;
  payment_verified_by: string | null;
  cash_collected_at: string | null;
  cash_collected_by: string | null;
  price: number | string | null;
  status: string | null;
  created_at: string | null;
};

type PaymentAction = "approve" | "reject" | "refund" | "reset";

const paymentStatuses: Array<PaymentStatus | "All"> = [
  "All",
  "Unpaid",
  "For Verification",
  "Paid",
  "Rejected",
  "Refunded",
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "Not recorded";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getPaymentStatusClass(status: PaymentStatus | null) {
  switch (status) {
    case "For Verification":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "Paid":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "Rejected":
      return "border-red-200 bg-red-50 text-red-700";
    case "Refunded":
      return "border-violet-200 bg-violet-50 text-violet-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

export default function PaymentsCenter() {
  const [payments, setPayments] = useState<PaymentOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    PaymentStatus | "All"
  >("All");
  const [methodFilter, setMethodFilter] = useState("All");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadPayments = useCallback(async (showFullLoader = false) => {
    if (showFullLoader) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    setErrorMessage("");

    try {
      const response = await fetch("/api/admin/payments", {
        method: "GET",
        cache: "no-store",
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Hindi makuha ang payments.");
      }

      setPayments(Array.isArray(result.payments) ? result.payments : []);
      setLastUpdated(new Date());
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "May error habang kinukuha ang payments."
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadPayments(true);

    const intervalId = window.setInterval(() => {
      void loadPayments(false);
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, [loadPayments]);

  async function updatePayment(
    payment: PaymentOrder,
    action: PaymentAction
  ) {
    const actionLabel =
      action === "approve"
        ? "approve"
        : action === "reject"
          ? "reject"
          : action === "refund"
            ? "mark as refunded"
            : "reset";

    const shouldContinue = window.confirm(
      `Sigurado ka bang gusto mong ${actionLabel} ang payment ng ${
        payment.booking_no || `Order #${payment.id}`
      }?`
    );

    if (!shouldContinue) return;

    setUpdatingId(payment.id);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/admin/payments", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          order_id: payment.id,
          action,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Hindi ma-update ang payment.");
      }

      setPayments((currentPayments) =>
        currentPayments.map((currentPayment) =>
          currentPayment.id === payment.id
            ? {
                ...currentPayment,
                ...result.payment,
              }
            : currentPayment
        )
      );

      setSuccessMessage(
        `${payment.booking_no || `Order #${payment.id}`} payment updated successfully.`
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "May error habang ina-update ang payment."
      );
    } finally {
      setUpdatingId(null);
    }
  }

  const analytics = useMemo(() => {
    const statusCount = (status: PaymentStatus) =>
      payments.filter(
        (payment) => (payment.payment_status || "Unpaid") === status
      ).length;

    const paidAmount = payments
      .filter((payment) => payment.payment_status === "Paid")
      .reduce(
        (total, payment) => total + Number(payment.price || 0),
        0
      );

    const pendingAmount = payments
      .filter((payment) =>
        ["Unpaid", "For Verification"].includes(
          payment.payment_status || "Unpaid"
        )
      )
      .reduce(
        (total, payment) => total + Number(payment.price || 0),
        0
      );

    return {
      unpaid: statusCount("Unpaid"),
      forVerification: statusCount("For Verification"),
      paid: statusCount("Paid"),
      rejected: statusCount("Rejected"),
      refunded: statusCount("Refunded"),
      paidAmount,
      pendingAmount,
    };
  }, [payments]);

  const filteredPayments = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return payments.filter((payment) => {
      const currentStatus = payment.payment_status || "Unpaid";

      const matchesStatus =
        statusFilter === "All" || currentStatus === statusFilter;

      const matchesMethod =
        methodFilter === "All" ||
        (payment.payment_method || "") === methodFilter;

      const searchableText = [
        payment.booking_no,
        payment.sender_name,
        payment.sender_phone,
        payment.receiver_name,
        payment.payment_method,
        payment.payment_reference,
        payment.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        !normalizedSearch || searchableText.includes(normalizedSearch);

      return matchesStatus && matchesMethod && matchesSearch;
    });
  }, [payments, searchTerm, statusFilter, methodFilter]);

  return (
    <section className="mt-8 overflow-hidden rounded-[2rem] border border-violet-100 bg-white shadow-xl shadow-violet-100/60">
      <div className="bg-gradient-to-r from-violet-950 via-purple-800 to-fuchsia-600 px-6 py-6 text-white md:px-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-fuchsia-200">
              Financial operations
            </p>
            <h2 className="mt-1 text-2xl font-extrabold md:text-3xl">
              Payments Center
            </h2>
            <p className="mt-2 max-w-2xl text-sm font-medium text-violet-100">
              I-monitor ang Cash at GCash payments, verification requests,
              paid orders, rejected submissions, at refunds.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-extrabold">
              {isRefreshing ? "Refreshing..." : `${payments.length} payments`}
            </span>

            <button
              type="button"
              onClick={() => void loadPayments(false)}
              disabled={isRefreshing}
              className="rounded-2xl bg-white px-5 py-3 font-extrabold text-violet-900 shadow-lg transition hover:-translate-y-0.5 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              ↻ Refresh Payments
            </button>
          </div>
        </div>
      </div>

      <div className="p-5 md:p-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-100 bg-violet-50 px-5 py-3">
          <p className="text-sm font-bold text-violet-800">
            Payment database is active
          </p>
          <p className="text-xs font-semibold text-violet-500">
            Last updated:{" "}
            {lastUpdated
              ? lastUpdated.toLocaleTimeString("en-PH")
              : "Waiting..."}
          </p>
        </div>

        {errorMessage && (
          <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 font-bold text-red-700">
            ⚠️ {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 font-bold text-emerald-700">
            ✅ {successMessage}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-bold text-slate-600">Unpaid</p>
            <p className="mt-2 text-3xl font-extrabold text-slate-950">
              {analytics.unpaid}
            </p>
          </div>

          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-sm font-bold text-amber-700">
              For Verification
            </p>
            <p className="mt-2 text-3xl font-extrabold text-amber-950">
              {analytics.forVerification}
            </p>
          </div>

          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-sm font-bold text-emerald-700">Paid</p>
            <p className="mt-2 text-3xl font-extrabold text-emerald-950">
              {analytics.paid}
            </p>
          </div>

          <div className="rounded-3xl border border-red-200 bg-red-50 p-5">
            <p className="text-sm font-bold text-red-700">Rejected</p>
            <p className="mt-2 text-3xl font-extrabold text-red-950">
              {analytics.rejected}
            </p>
          </div>

          <div className="rounded-3xl border border-violet-200 bg-violet-50 p-5">
            <p className="text-sm font-bold text-violet-700">Paid Amount</p>
            <p className="mt-2 text-2xl font-extrabold text-violet-950">
              {formatCurrency(analytics.paidAmount)}
            </p>
          </div>

          <div className="rounded-3xl bg-gradient-to-br from-violet-950 to-fuchsia-700 p-5 text-white">
            <p className="text-sm font-bold text-violet-100">
              Pending Amount
            </p>
            <p className="mt-2 text-2xl font-extrabold">
              {formatCurrency(analytics.pendingAmount)}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-5 lg:grid-cols-[1fr_220px_220px]">
          <label>
            <span className="mb-2 block text-sm font-extrabold text-slate-800">
              🔍 Search payments
            </span>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Booking, customer, phone o reference"
              className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
            />
          </label>

          <label>
            <span className="mb-2 block text-sm font-extrabold text-slate-800">
              Payment status
            </span>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value as PaymentStatus | "All"
                )
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
            >
              {paymentStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-2 block text-sm font-extrabold text-slate-800">
              Payment method
            </span>
            <select
              value={methodFilter}
              onChange={(event) => setMethodFilter(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
            >
              <option value="All">All methods</option>
              <option value="Cash">Cash</option>
              <option value="GCash">GCash</option>
            </select>
          </label>
        </div>

        {isLoading ? (
          <div className="mt-6 rounded-3xl border border-violet-100 bg-violet-50 p-12 text-center">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-violet-100 border-t-violet-600" />
            <p className="mt-4 font-extrabold text-violet-950">
              Loading payments...
            </p>
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
            <div className="text-5xl">💳</div>
            <h3 className="mt-4 text-xl font-extrabold text-slate-900">
              Walang payment na nakita
            </h3>
            <p className="mt-2 text-slate-500">
              Subukan ang ibang search o filter.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {filteredPayments.map((payment) => {
              const currentStatus =
                payment.payment_status || "Unpaid";

              return (
                <article
                  key={payment.id}
                  className="overflow-hidden rounded-3xl border border-slate-200 bg-white"
                >
                  <div className="flex flex-col gap-4 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-fuchsia-50 p-5 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-violet-500">
                        Booking number
                      </p>
                      <h3 className="mt-1 break-all text-xl font-extrabold text-violet-950">
                        {payment.booking_no || `Order #${payment.id}`}
                      </h3>
                      <p className="mt-2 text-sm font-semibold text-slate-500">
                        Created: {formatDate(payment.created_at)}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <span
                        className={`rounded-full border px-4 py-2 text-sm font-extrabold ${getPaymentStatusClass(
                          currentStatus
                        )}`}
                      >
                        {currentStatus}
                      </span>

                      <span className="rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-extrabold text-blue-700">
                        {payment.payment_method || "No method"}
                      </span>

                      <span className="rounded-full bg-violet-950 px-4 py-2 text-sm font-extrabold text-white">
                        {formatCurrency(Number(payment.price || 0))}
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-5 p-5 xl:grid-cols-[1fr_1fr_1fr_auto]">
                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                        Customer
                      </p>
                      <p className="mt-2 font-extrabold text-slate-900">
                        {payment.sender_name || "No sender name"}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-500">
                        {payment.sender_phone || "No phone number"}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                        GCash reference
                      </p>
                      <p className="mt-2 break-all font-extrabold text-slate-900">
                        {payment.payment_reference || "Not submitted"}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-500">
                        Submitted: {formatDate(payment.payment_submitted_at)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                        Verification
                      </p>
                      <p className="mt-2 font-extrabold text-slate-900">
                        {payment.payment_verified_by || "Not verified"}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-500">
                        {formatDate(payment.payment_verified_at)}
                      </p>
                    </div>

                    <div className="flex min-w-[220px] flex-col gap-2">
                      {payment.payment_method === "GCash" &&
                        currentStatus === "For Verification" && (
                          <>
                            <button
                              type="button"
                              disabled={updatingId === payment.id}
                              onClick={() =>
                                void updatePayment(payment, "approve")
                              }
                              className="rounded-2xl bg-emerald-600 px-5 py-3 font-extrabold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                            >
                              ✅ Approve Payment
                            </button>

                            <button
                              type="button"
                              disabled={updatingId === payment.id}
                              onClick={() =>
                                void updatePayment(payment, "reject")
                              }
                              className="rounded-2xl bg-red-600 px-5 py-3 font-extrabold text-white transition hover:bg-red-700 disabled:opacity-60"
                            >
                              ❌ Reject Payment
                            </button>
                          </>
                        )}

                      {currentStatus === "Paid" && (
                        <button
                          type="button"
                          disabled={updatingId === payment.id}
                          onClick={() =>
                            void updatePayment(payment, "refund")
                          }
                          className="rounded-2xl bg-violet-700 px-5 py-3 font-extrabold text-white transition hover:bg-violet-800 disabled:opacity-60"
                        >
                          ↩ Mark Refunded
                        </button>
                      )}

                      {["Rejected", "Refunded"].includes(currentStatus) && (
                        <button
                          type="button"
                          disabled={updatingId === payment.id}
                          onClick={() =>
                            void updatePayment(payment, "reset")
                          }
                          className="rounded-2xl border border-slate-300 bg-white px-5 py-3 font-extrabold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                        >
                          Reset to Unpaid
                        </button>
                      )}

                      {!(
                        (payment.payment_method === "GCash" &&
                          currentStatus === "For Verification") ||
                        currentStatus === "Paid" ||
                        ["Rejected", "Refunded"].includes(currentStatus)
                      ) && (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-center text-sm font-bold text-slate-500">
                          No admin action available
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}