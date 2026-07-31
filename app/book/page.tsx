"use client";

import BusinessAvailabilityGate from "./BusinessAvailabilityGate";
import PaymentAfterBooking from "./components/PaymentAfterBooking";
import dynamic from "next/dynamic";
import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useState,
} from "react";

type MapPoint = {
  latitude: number;
  longitude: number;
};

type BookingMapPickerProps = {
  pickup: MapPoint | null;
  dropoff: MapPoint | null;
  onPickupChange: (point: MapPoint) => void;
  onDropoffChange: (point: MapPoint) => void;
  onRouteChange: (
    distanceKm: number | null,
    durationMinutes: number | null
  ) => void;
};

const BookingMapPicker = dynamic<BookingMapPickerProps>(
  async () => {
    const componentModule = await import("./components/BookingMapPicker");
    return componentModule.default;
  },
  {
    ssr: false,
    loading: () => (
      <div className="grid min-h-[430px] place-items-center rounded-3xl border border-slate-200 bg-slate-50 font-bold text-slate-500">
        Loading booking map...
      </div>
    ),
  }
);

type BookingForm = {
  sender_name: string;
  sender_phone: string;
  pickup_address: string;
  receiver_name: string;
  receiver_phone: string;
  dropoff_address: string;
  package_type: string;
  notes: string;
  payment_method: string;

  delivery_fee: string;
  order_amount: string;
  total_amount: string;
};
type BookingApiResponse = {
  success: boolean;
  booking_no?: string;
  error?: string;
  pricing?: {
    distance_km: number;
    duration_minutes: number;
    delivery_fee: number;
    order_amount: number;
    total_amount: number;
  };
};

const initialForm: BookingForm = {
  sender_name: "",
  sender_phone: "",
  pickup_address: "",
  receiver_name: "",
  receiver_phone: "",
  dropoff_address: "",
  package_type: "Document",
  notes: "",
  payment_method: "Cash",

  delivery_fee: "",
  order_amount: "0",
  total_amount: "",
};

const packageOptions = [
  {
    value: "Document",
    icon: "📄",
    label: "Document",
  },
  {
    value: "Food",
    icon: "🍔",
    label: "Food",
  },
  {
    value: "Medicine",
    icon: "💊",
    label: "Medicine",
  },
  {
    value: "Grocery",
    icon: "🛒",
    label: "Grocery",
  },
  {
    value: "Parcel",
    icon: "📦",
    label: "Parcel",
  },
  {
    value: "Other",
    icon: "✨",
    label: "Other",
  },
];

const paymentOptions = [
  {
    value: "Cash",
    icon: "💵",
    label: "Cash",
    description: "Bayaran sa pickup o delivery",
  },
  {
    value: "GCash",
    icon: "📱",
    label: "GCash",
    description: "Digital payment",
  },
];

export default function BookPage() {
  const [form, setForm] = useState<BookingForm>(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingNumber, setBookingNumber] = useState("");
  const [completedSenderPhone, setCompletedSenderPhone] = useState("");
  const [completedPaymentMethod, setCompletedPaymentMethod] =useState("");
  const [completedAmount, setCompletedAmount] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [pickupPoint, setPickupPoint] = useState<MapPoint | null>(null);
  const [dropoffPoint, setDropoffPoint] = useState<MapPoint | null>(null);
  const [routeDistanceKm, setRouteDistanceKm] = useState<number | null>(null);
  const [routeDurationMinutes, setRouteDurationMinutes] = useState<number | null>(
    null
  );

  function updateField(
  event: ChangeEvent<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >
) {
  const { name, value } = event.target;

  setForm((currentForm) => ({
    ...currentForm,
    [name]: value,
  }));
}
 function updateOrderAmount(
  event: ChangeEvent<HTMLInputElement>
) {
  const rawValue = event.target.value.replace(/[^\d.]/g, "");

  const orderAmount = Number(rawValue || 0);
  const deliveryFee = Number(form.delivery_fee || 0);

  if (
    !Number.isFinite(orderAmount) ||
    orderAmount < 0 ||
    orderAmount > 100000
  ) {
    return;
  }

  setForm((currentForm) => ({
    ...currentForm,
    order_amount: rawValue,
    total_amount: String(
      Math.round((deliveryFee + orderAmount) * 100) / 100
    ),
  }));
}



  function selectPackage(packageType: string) {
    setForm((currentForm) => ({
      ...currentForm,
      package_type: packageType,
    }));
  }

  function selectPayment(paymentMethod: string) {
    setForm((currentForm) => ({
      ...currentForm,
      payment_method: paymentMethod,
    }));
  }

  const handleRouteChange = useCallback(
  (
    distanceKm: number | null,
    durationMinutes: number | null
  ) => {
    setRouteDistanceKm(distanceKm);
    setRouteDurationMinutes(durationMinutes);

    if (distanceKm === null) {
      setForm((currentForm) => ({
        ...currentForm,
        delivery_fee: "",
        total_amount: String(
          Number(currentForm.order_amount || 0)
        ),
      }));

      return;
    }

    const baseFare = 49;
    const includedKm = 2;
    const extraKmRate = 10;

    const extraKm = Math.max(
      0,
      Math.ceil(distanceKm - includedKm)
    );

    const calculatedFare =
      baseFare + extraKm * extraKmRate;

    setForm((currentForm) => {
      const orderAmount = Number(
        currentForm.order_amount || 0
      );

      return {
        ...currentForm,
        delivery_fee: String(calculatedFare),
        total_amount: String(
          calculatedFare + orderAmount
        ),
      };
    });
  },
  []
);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setBookingNumber("");
    setErrorMessage("");

    if (
      !form.sender_name.trim() ||
      !form.sender_phone.trim() ||
      !form.pickup_address.trim() ||
      !form.receiver_name.trim() ||
      !form.receiver_phone.trim() ||
      !form.dropoff_address.trim() ||
      !pickupPoint ||
      !dropoffPoint ||
      !form.delivery_fee
    ) {
      setErrorMessage("Pakikumpleto ang lahat ng required fields.");
      return;
    }

    const deliveryFee = Number(form.delivery_fee);
    const orderAmount = Number(form.order_amount || 0);
    const totalAmount = Number(form.total_amount);

    if (!Number.isFinite(deliveryFee) || deliveryFee <= 0) {
  setErrorMessage("Maglagay ng valid na delivery fee.");
  return;
}

    setIsSubmitting(true);

    try {
      const newBookingNumber = `BE-${Date.now()}`;

      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          booking_no: newBookingNumber,
          sender_name: form.sender_name.trim(),
          sender_phone: form.sender_phone.trim(),
          pickup_address: form.pickup_address.trim(),
          receiver_name: form.receiver_name.trim(),
          receiver_phone: form.receiver_phone.trim(),
          dropoff_address: form.dropoff_address.trim(),
          package_type: form.package_type,
          notes: form.notes.trim(),
          payment_method: form.payment_method,
          status: "Pending",
          price: deliveryFee,
          order_amount: orderAmount,
          total_amount: totalAmount,
          pickup_latitude: pickupPoint.latitude,
          pickup_longitude: pickupPoint.longitude,
          dropoff_latitude: dropoffPoint.latitude,
          dropoff_longitude: dropoffPoint.longitude,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Hindi na-save ang booking.");
      }

      setBookingNumber(newBookingNumber);
      setCompletedSenderPhone(form.sender_phone.trim());
      setCompletedPaymentMethod(form.payment_method);
      setCompletedAmount(totalAmount);
      setForm(initialForm);
      setPickupPoint(null);
      setDropoffPoint(null);
      setRouteDistanceKm(null);
      setRouteDurationMinutes(null);

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "May nangyaring error habang nagsa-save.";

      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const selectedPackage =
    packageOptions.find((item) => item.value === form.package_type) ??
    packageOptions[0];

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-blue-100 bg-white/90 px-4 py-4 shadow-sm backdrop-blur md:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <a href="/" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-sky-500 text-2xl shadow-lg shadow-blue-200">
              🏍️
            </div>

            <div>
              <p className="text-lg font-extrabold text-blue-950 md:text-xl">
                Barangay Express
              </p>

              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-500">
                Fast • Safe • Local
              </p>
            </div>
          </a>

          <a
            href="/"
            className="rounded-xl border border-blue-100 bg-white px-4 py-2 text-sm font-bold text-blue-700 transition hover:border-blue-300 hover:bg-blue-50"
          >
            ← Home
          </a>
        </div>
      </header>

      {/* Page Heading */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-950 via-blue-800 to-sky-600 px-4 py-14 text-white md:px-6 md:py-20">
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-blue-300/20 blur-3xl" />

        <div className="relative mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold backdrop-blur">
              🏍️ Local motorcycle delivery
            </span>

            <h1 className="mt-6 text-4xl font-extrabold tracking-tight md:text-6xl">
              Book your delivery
            </h1>

            <p className="mt-4 max-w-2xl text-lg leading-8 text-blue-100">
              Kumpletuhin ang pickup at delivery information. Makakatanggap ka
              agad ng booking number na maaari mong gamitin sa tracking page.
            </p>
          </div>

          {/* Progress */}
          <div className="mt-10 grid max-w-3xl grid-cols-4 gap-2">
            {[
              ["1", "Booking"],
              ["2", "Confirmation"],
              ["3", "Delivery"],
              ["4", "Complete"],
            ].map(([number, label], index) => (
              <div key={label} className="text-center">
                <div
                  className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full text-sm font-extrabold ${
                    index === 0
                      ? "bg-white text-blue-700"
                      : "border border-white/30 bg-white/10 text-white"
                  }`}
                >
                  {number}
                </div>

                <p className="mt-2 hidden text-xs font-semibold text-blue-100 sm:block">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-10 md:px-6 md:py-16">
        <div className="mx-auto max-w-7xl">
          {/* Success Screen */}
          {bookingNumber ? (
            <div className="mx-auto max-w-2xl overflow-hidden rounded-[2rem] border border-blue-100 bg-white shadow-2xl shadow-blue-100">
              <div className="bg-gradient-to-br from-blue-700 to-sky-500 px-6 py-10 text-center text-white md:px-10">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white text-4xl shadow-xl">
                  ✅
                </div>

                <h2 className="mt-6 text-3xl font-extrabold">
                  Booking confirmed!
                </h2>

                <p className="mt-3 text-blue-100">
                  Matagumpay na natanggap ang iyong delivery request.
                </p>
              </div>

              <div className="p-6 text-center md:p-10">
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-blue-500">
                  Booking number
                </p>

                <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-5 py-5">
                  <p className="break-all text-2xl font-extrabold text-blue-950 md:text-3xl">
                    {bookingNumber}
                  </p>
                </div>

                <p className="mt-5 leading-7 text-slate-600">
                  I-save o i-screenshot ang booking number. Kakailanganin ito
                  upang makita ang status ng iyong delivery.
                </p>
                
                <PaymentAfterBooking
                  bookingNumber={bookingNumber}
                  senderPhone={completedSenderPhone}
                  paymentMethod={completedPaymentMethod}
                  amount={completedAmount}
                  /> 

                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  <a
                    href={`/track?booking=${encodeURIComponent(bookingNumber)}`}
                    className="rounded-2xl bg-blue-600 px-6 py-4 font-bold text-white shadow-lg shadow-blue-200 transition hover:-translate-y-0.5 hover:bg-blue-700"
                  >
                    Track Delivery
                  </a>

                  <button
                    type="button"
                    onClick={() => {
                    setBookingNumber("");
                    setCompletedSenderPhone("");
                    setCompletedPaymentMethod("");
                    setCompletedAmount(0);
                  }}
                    className="rounded-2xl border border-blue-200 bg-white px-6 py-4 font-bold text-blue-700 transition hover:bg-blue-50"
                  >
                    Create Another Booking
                  </button>
                </div>
              </div>
            </div>
          ) : (
             <BusinessAvailabilityGate>
            <div className="grid items-start gap-8 lg:grid-cols-[1fr_380px]">
              {/* Booking Form */}
              <form
                onSubmit={handleSubmit}
                className="space-y-7 rounded-[2rem] border border-blue-100 bg-white p-5 shadow-xl shadow-slate-200/60 md:p-8"
              >
                {/* Sender */}
                <section className="rounded-3xl border border-blue-100 bg-gradient-to-br from-white to-blue-50/50 p-5 md:p-7">
                  <div className="mb-6 flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-2xl text-white shadow-lg shadow-blue-200">
                      📍
                    </div>

                    <div>
                      <p className="text-sm font-bold uppercase tracking-wider text-blue-500">
                        Step 1
                      </p>

                      <h2 className="text-xl font-extrabold text-blue-950">
                        Pickup details
                      </h2>
                    </div>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-sm font-bold text-slate-700">
                        Sender name *
                      </span>

                      <input
                        required
                        type="text"
                        name="sender_name"
                        value={form.sender_name}
                        onChange={updateField}
                        placeholder="Juan Dela Cruz"
                        autoComplete="name"
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-bold text-slate-700">
                        Sender phone *
                      </span>

                      <input
                        required
                        type="tel"
                        name="sender_phone"
                        value={form.sender_phone}
                        onChange={updateField}
                        placeholder="09XXXXXXXXX"
                        pattern="09[0-9]{9}"
                        maxLength={11}
                        inputMode="numeric"
                        autoComplete="tel"
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                      />
                    </label>
                  </div>

                  <label className="mt-5 block">
                    <span className="mb-2 block text-sm font-bold text-slate-700">
                      Complete pickup address *
                    </span>

                    <textarea
                      required
                      name="pickup_address"
                      value={form.pickup_address}
                      onChange={updateField}
                      placeholder="House number, street, barangay at landmark"
                      rows={3}
                      className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3.5 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    />
                  </label>
                </section>

                {/* Receiver */}
                <section className="rounded-3xl border border-sky-100 bg-gradient-to-br from-white to-sky-50/60 p-5 md:p-7">
                  <div className="mb-6 flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500 text-2xl text-white shadow-lg shadow-sky-200">
                      🏠
                    </div>

                    <div>
                      <p className="text-sm font-bold uppercase tracking-wider text-sky-500">
                        Step 2
                      </p>

                      <h2 className="text-xl font-extrabold text-blue-950">
                        Delivery details
                      </h2>
                    </div>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-sm font-bold text-slate-700">
                        Receiver name *
                      </span>

                      <input
                        required
                        type="text"
                        name="receiver_name"
                        value={form.receiver_name}
                        onChange={updateField}
                        placeholder="Maria Santos"
                        autoComplete="name"
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-bold text-slate-700">
                        Receiver phone *
                      </span>

                      <input
                        required
                        type="tel"
                        name="receiver_phone"
                        value={form.receiver_phone}
                        onChange={updateField}
                        placeholder="09XXXXXXXXX"
                        pattern="09[0-9]{9}"
                        maxLength={11}
                        inputMode="numeric"
                        autoComplete="tel"
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                      />
                    </label>
                  </div>

                  <label className="mt-5 block">
                    <span className="mb-2 block text-sm font-bold text-slate-700">
                      Complete drop-off address *
                    </span>

                    <textarea
                      required
                      name="dropoff_address"
                      value={form.dropoff_address}
                      onChange={updateField}
                      placeholder="House number, street, barangay at landmark"
                      rows={3}
                      className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3.5 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    />
                  </label>
                </section>

                <BookingMapPicker
                  pickup={pickupPoint}
                  dropoff={dropoffPoint}
                  onPickupChange={setPickupPoint}
                  onDropoffChange={setDropoffPoint}
                  onRouteChange={handleRouteChange}
                />

                {/* Package Type */}
                <section className="rounded-3xl border border-indigo-100 bg-white p-5 md:p-7">
                  <div className="mb-6 flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-2xl text-white shadow-lg shadow-indigo-200">
                      📦
                    </div>

                    <div>
                      <p className="text-sm font-bold uppercase tracking-wider text-indigo-500">
                        Step 3
                      </p>

                      <h2 className="text-xl font-extrabold text-blue-950">
                        Package type
                      </h2>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {packageOptions.map((item) => {
                      const isSelected =
                        form.package_type === item.value;

                      return (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => selectPackage(item.value)}
                          className={`rounded-2xl border p-4 text-left transition ${
                            isSelected
                              ? "border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-200"
                              : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50"
                          }`}
                        >
                          <span className="block text-2xl">{item.icon}</span>

                          <span className="mt-2 block text-sm font-extrabold">
                            {item.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                {/* Payment */}
                <section className="rounded-3xl border border-blue-100 bg-white p-5 md:p-7">
                  <div className="mb-6 flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-2xl text-white shadow-lg shadow-blue-200">
                      💳
                    </div>

                    <div>
                      <p className="text-sm font-bold uppercase tracking-wider text-blue-500">
                        Step 4
                      </p>

                      <h2 className="text-xl font-extrabold text-blue-950">
                        Payment and fare
                      </h2>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {paymentOptions.map((item) => {
                      const isSelected =
                        form.payment_method === item.value;

                      return (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => selectPayment(item.value)}
                          className={`flex items-center gap-4 rounded-2xl border p-4 text-left transition ${
                            isSelected
                              ? "border-blue-600 bg-blue-50 ring-2 ring-blue-100"
                              : "border-slate-200 bg-white hover:border-blue-300"
                          }`}
                        >
                          <span className="text-3xl">{item.icon}</span>

                          <span>
                            <span className="block font-extrabold text-blue-950">
                              {item.label}
                            </span>

                            <span className="block text-xs text-slate-500">
                              {item.description}
                            </span>
                          </span>

                          {isSelected && (
                            <span className="ml-auto flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs text-white">
                              ✓
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-6 grid gap-5 md:grid-cols-2">
  <label className="block">
    <span className="mb-2 block text-sm font-bold text-slate-700">
      Estimated delivery fee
    </span>

    <div className="flex overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
      <span className="flex items-center bg-blue-50 px-5 text-xl font-extrabold text-blue-700">
        ₱
      </span>

      <input
        readOnly
        type="text"
        value={form.delivery_fee}
        placeholder="Select map locations"
        className="w-full cursor-not-allowed bg-slate-100 px-4 py-4 text-lg font-bold text-slate-800 outline-none"
      />
    </div>

    <p className="mt-2 text-sm leading-6 text-slate-500">
      Automatic estimate: ₱49 sa unang 2 km, pagkatapos ay ₱10
      bawat succeeding kilometer. Server ang magkukumpirma ng final fee.
    </p>
  </label>

  <label className="block">
    <span className="mb-2 block text-sm font-bold text-slate-700">
      Order amount / item cost
      <span className="ml-1 font-semibold text-slate-400">
        (optional)
      </span>
    </span>

    <div className="flex overflow-hidden rounded-2xl border border-slate-200 bg-white transition focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100">
      <span className="flex items-center bg-amber-50 px-5 text-xl font-extrabold text-amber-700">
        ₱
      </span>

      <input
        type="number"
        name="order_amount"
        value={form.order_amount}
        onChange={updateOrderAmount}
        placeholder="0"
        min="0"
        max="100000"
        step="0.01"
        inputMode="decimal"
        className="w-full px-4 py-4 text-lg font-bold outline-none"
      />
    </div>

    <p className="mt-2 text-sm leading-6 text-slate-500">
      Halimbawa: presyo ng pagkain o item na bibilhin ng rider.
      Ilagay ang ₱0 kung delivery lamang.
    </p>
  </label>
</div>

<div className="mt-5 rounded-3xl bg-gradient-to-br from-blue-950 to-blue-700 p-6 text-white">
  <div className="flex items-center justify-between gap-4">
    <div>
      <p className="text-sm font-bold uppercase tracking-wider text-blue-200">
        Estimated total to pay
      </p>

      <p className="mt-2 text-sm font-semibold text-blue-100">
        Order amount + delivery fee
      </p>
    </div>

    <p className="text-4xl font-extrabold text-sky-300">
      ₱{form.total_amount || "0"}
    </p>
  </div>
</div>
                  <label className="mt-6 block">
                    <span className="mb-2 block text-sm font-bold text-slate-700">
                      Package description o special instructions
                    </span>

                    <textarea
                      name="notes"
                      value={form.notes}
                      onChange={updateField}
                      placeholder="Halimbawa: fragile item, tawagan bago dumating o specific landmark"
                      rows={4}
                      className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3.5 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    />
                  </label>
                </section>

                {errorMessage && (
                  <div
                    role="alert"
                    className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 font-semibold text-red-700"
                  >
                    ⚠️ {errorMessage}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full rounded-2xl bg-gradient-to-r from-blue-700 to-sky-500 px-6 py-4 text-lg font-extrabold text-white shadow-xl shadow-blue-200 transition hover:-translate-y-0.5 hover:shadow-2xl disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting
                    ? "Submitting booking..."
                    : "🏍️ Book Delivery"}
                </button>

                <p className="text-center text-xs leading-5 text-slate-500">
                  Sa pag-submit, kinukumpirma mong tama ang pickup at delivery
                  information.
                </p>
              </form>

              {/* Live Summary */}
              <aside className="top-28 space-y-5 lg:sticky">
                <div className="overflow-hidden rounded-[2rem] border border-blue-100 bg-white shadow-xl shadow-slate-200/60">
                  <div className="bg-gradient-to-br from-blue-950 to-blue-700 px-6 py-6 text-white">
                    <p className="text-sm font-bold uppercase tracking-[0.18em] text-sky-300">
                      Booking summary
                    </p>

                    <h2 className="mt-2 text-2xl font-extrabold">
                      Your delivery
                    </h2>
                  </div>

                  <div className="space-y-5 p-6">
                    <div className="flex items-center gap-4 rounded-2xl bg-blue-50 p-4">
                      <span className="text-3xl">
                        {selectedPackage.icon}
                      </span>

                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-blue-500">
                          Package
                        </p>

                        <p className="font-extrabold text-blue-950">
                          {selectedPackage.label}
                        </p>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Pickup
                      </p>

                      <p className="mt-1 break-words font-semibold text-slate-700">
                        {form.pickup_address || "Hindi pa nailalagay"}
                      </p>
                    </div>

                    <div className="border-t border-slate-100 pt-5">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Destination
                      </p>

                      <p className="mt-1 break-words font-semibold text-slate-700">
                        {form.dropoff_address || "Hindi pa nailalagay"}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-5">
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          Distance
                        </p>
                        <p className="mt-1 font-extrabold text-blue-950">
                          {routeDistanceKm !== null
                            ? `${routeDistanceKm.toFixed(1)} km`
                            : "Not calculated"}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-slate-50 p-3">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          Estimated time
                        </p>
                        <p className="mt-1 font-extrabold text-blue-950">
                          {routeDurationMinutes !== null
                            ? `${routeDurationMinutes} min`
                            : "Not calculated"}
                        </p>
                      </div>
                    </div>

                    <div className="border-t border-slate-100 pt-5">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Payment
                      </p>

                      <p className="mt-1 font-extrabold text-blue-950">
                        {form.payment_method}
                      </p>
                    </div>

                    <div className="space-y-3 rounded-2xl bg-blue-950 p-5 text-white">
  <div className="flex items-center justify-between gap-3">
    <p className="text-sm font-semibold text-blue-200">
      Delivery fee
    </p>

    <p className="font-extrabold">
      ₱{form.delivery_fee || "0"}
    </p>
  </div>

  <div className="flex items-center justify-between gap-3">
    <p className="text-sm font-semibold text-blue-200">
      Order amount
    </p>

    <p className="font-extrabold">
      ₱{form.order_amount || "0"}
    </p>
  </div>

  <div className="border-t border-white/20 pt-4">
    <p className="text-sm font-semibold text-blue-200">
      Estimated total to pay
    </p>

    <p className="mt-2 text-4xl font-extrabold text-sky-300">
      ₱{form.total_amount || "0"}
    </p>
  </div>
</div>
                  </div>
                </div>

                <div className="rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 to-sky-50 p-6">
                  <h3 className="font-extrabold text-blue-950">
                    Barangay Express benefits
                  </h3>

                  <div className="mt-4 space-y-3 text-sm font-semibold text-slate-600">
                    <p>✓ Fast local motorcycle delivery</p>
                    <p>✓ Booking number at order tracking</p>
                    <p>✓ Cash at GCash payment options</p>
                    <p>✓ Serving Talisay, Batangas</p>
                  </div>
                </div>
         </aside>
    </div>
    
  </BusinessAvailabilityGate>
 )}
         </div>
      </section>

      <footer className="bg-blue-950 px-6 py-8 text-center text-blue-200">
        <p className="font-semibold">
          © 2026 Barangay Express. Fast • Safe • Local
        </p>
      </footer>
    </main>
  );
}