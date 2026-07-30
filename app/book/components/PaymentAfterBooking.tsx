"use client";

import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";

type PaymentAfterBookingProps = {
  bookingNumber: string;
  senderPhone: string;
  paymentMethod: string;
  amount: number;
};

type PaymentSettings = {
  gcash_enabled: boolean;
  gcash_account_name: string | null;
  gcash_number: string | null;
  gcash_qr_url: string | null;
  payment_instructions: string | null;
};

type PaymentSettingsResponse = {
  success: boolean;
  settings?: PaymentSettings;
  error?: string;
};

type PaymentSubmissionResponse = {
  success: boolean;
  message?: string;
  error?: string;
  payment?: {
    booking_no: string;
    payment_method: string;
    payment_status: string;
    payment_reference: string;
    payment_submitted_at: string;
  };
};

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const ALLOWED_FILE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function formatAmount(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

export default function PaymentAfterBooking({
  bookingNumber,
  senderPhone,
  paymentMethod,
  amount,
}: PaymentAfterBookingProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [settings, setSettings] =
    useState<PaymentSettings | null>(null);

  const [paymentReference, setPaymentReference] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreviewUrl, setProofPreviewUrl] = useState("");

  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [settingsError, setSettingsError] = useState("");
  const [submissionError, setSubmissionError] = useState("");
  const [submissionSuccess, setSubmissionSuccess] = useState("");
  const [paymentSubmitted, setPaymentSubmitted] = useState(false);

  useEffect(() => {
    if (paymentMethod !== "GCash") {
      setIsLoadingSettings(false);
      return;
    }

    let cancelled = false;

    async function loadPaymentSettings() {
      setSettingsError("");

      try {
        const response = await fetch("/api/payment-settings", {
          method: "GET",
          cache: "no-store",
        });

        const result =
          (await response.json()) as PaymentSettingsResponse;

        if (!response.ok || !result.success || !result.settings) {
          throw new Error(
            result.error || "Hindi makuha ang GCash payment settings."
          );
        }

        if (!cancelled) {
          setSettings(result.settings);
        }
      } catch (error) {
        if (!cancelled) {
          setSettingsError(
            error instanceof Error
              ? error.message
              : "May error habang kinukuha ang GCash details."
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSettings(false);
        }
      }
    }

    void loadPaymentSettings();

    return () => {
      cancelled = true;
    };
  }, [paymentMethod]);

  useEffect(() => {
    return () => {
      if (proofPreviewUrl) {
        URL.revokeObjectURL(proofPreviewUrl);
      }
    };
  }, [proofPreviewUrl]);

  function handleReferenceChange(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const value = event.target.value
      .replace(/[^A-Za-z0-9-]/g, "")
      .slice(0, 30);

    setPaymentReference(value);
  }

  function handleProofChange(
    event: ChangeEvent<HTMLInputElement>
  ) {
    setSubmissionError("");
    setSubmissionSuccess("");

    const selectedFile = event.target.files?.[0] ?? null;

    if (!selectedFile) {
      return;
    }

    if (!ALLOWED_FILE_TYPES.has(selectedFile.type)) {
      setSubmissionError(
        "JPG, PNG, o WebP image lamang ang maaaring i-upload."
      );

      event.target.value = "";
      return;
    }

    if (
      selectedFile.size <= 0 ||
      selectedFile.size > MAX_FILE_SIZE_BYTES
    ) {
      setSubmissionError(
        "Ang payment proof ay dapat mas maliit sa 5 MB."
      );

      event.target.value = "";
      return;
    }

    if (proofPreviewUrl) {
      URL.revokeObjectURL(proofPreviewUrl);
    }

    setProofFile(selectedFile);
    setProofPreviewUrl(URL.createObjectURL(selectedFile));
  }

  function clearSelectedProof() {
    if (proofPreviewUrl) {
      URL.revokeObjectURL(proofPreviewUrl);
    }

    setProofFile(null);
    setProofPreviewUrl("");
    setSubmissionError("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleSubmitPayment(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setSubmissionError("");
    setSubmissionSuccess("");

    const cleanedReference = paymentReference
      .replace(/\s+/g, "")
      .trim();

    if (!/^[A-Za-z0-9-]{6,30}$/.test(cleanedReference)) {
      setSubmissionError(
        "Ilagay ang 6 hanggang 30 character na GCash reference number."
      );
      return;
    }

    if (!proofFile) {
      setSubmissionError(
        "Mag-upload muna ng malinaw na screenshot ng payment receipt."
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();

      formData.append("booking_no", bookingNumber);
      formData.append("sender_phone", senderPhone);
      formData.append("payment_reference", cleanedReference);
      formData.append("proof", proofFile);

      const response = await fetch("/api/payments/submit", {
        method: "POST",
        body: formData,
      });

      const result =
        (await response.json()) as PaymentSubmissionResponse;

      if (!response.ok || !result.success) {
        throw new Error(
          result.error || "Hindi naisumite ang payment proof."
        );
      }

      setPaymentSubmitted(true);
      setSubmissionSuccess(
        result.message ||
          "Na-submit ang payment proof at naghihintay na ng verification."
      );

      clearSelectedProof();
    } catch (error) {
      setSubmissionError(
        error instanceof Error
          ? error.message
          : "May error habang nagsu-submit ng payment proof."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (paymentMethod !== "GCash") {
    return null;
  }

  if (isLoadingSettings) {
    return (
      <section className="mt-8 rounded-3xl border border-emerald-100 bg-emerald-50 p-6">
        <div className="flex items-center justify-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-700" />

          <p className="font-bold text-emerald-900">
            Loading GCash payment details...
          </p>
        </div>
      </section>
    );
  }

  if (settingsError || !settings) {
    return (
      <section className="mt-8 rounded-3xl border border-red-200 bg-red-50 p-6 text-left">
        <p className="font-extrabold text-red-700">
          ⚠️ Hindi ma-load ang GCash payment details.
        </p>

        <p className="mt-2 text-sm font-semibold text-red-600">
          {settingsError}
        </p>
      </section>
    );
  }

  if (!settings.gcash_enabled) {
    return (
      <section className="mt-8 rounded-3xl border border-amber-200 bg-amber-50 p-6 text-left">
        <p className="font-extrabold text-amber-800">
          GCash is currently unavailable.
        </p>

        <p className="mt-2 text-sm font-semibold text-amber-700">
          Makipag-ugnayan muna sa Barangay Express para sa payment
          instructions.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-8 overflow-hidden rounded-[2rem] border border-emerald-200 bg-white text-left shadow-xl shadow-emerald-100">
      <div className="bg-gradient-to-br from-emerald-700 to-emerald-500 px-6 py-7 text-white">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-emerald-100">
          Online payment
        </p>

        <h3 className="mt-2 text-2xl font-extrabold">
          💳 Pay with GCash
        </h3>

        <p className="mt-2 text-sm font-semibold leading-6 text-emerald-50">
          Bayaran ang eksaktong delivery fee at i-submit ang
          screenshot ng iyong receipt.
        </p>
      </div>

      <div className="space-y-6 p-5 md:p-7">
        <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5">
          <p className="text-xs font-extrabold uppercase tracking-wider text-emerald-600">
            Amount to pay
          </p>

          <p className="mt-2 text-4xl font-extrabold text-emerald-950">
            {formatAmount(amount)}
          </p>

          <p className="mt-2 text-sm font-semibold text-emerald-700">
            Booking: {bookingNumber}
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Account name
              </p>

              <p className="mt-1 font-extrabold text-blue-950">
                {settings.gcash_account_name || "Not configured"}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                GCash number
              </p>

              <p className="mt-1 text-xl font-extrabold text-blue-950">
                {settings.gcash_number || "Not configured"}
              </p>
            </div>

            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <p className="whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-700">
                {settings.payment_instructions ||
                  "I-send ang eksaktong halaga at i-upload ang payment receipt."}
              </p>
            </div>
          </div>

          <div className="grid min-h-64 place-items-center overflow-hidden rounded-3xl border border-dashed border-emerald-300 bg-slate-50 p-4">
            {settings.gcash_qr_url ? (
              <img
                src={settings.gcash_qr_url}
                alt="Barangay Express GCash QR code"
                className="max-h-80 w-auto rounded-2xl object-contain"
              />
            ) : (
              <div className="text-center">
                <p className="text-5xl">📱</p>

                <p className="mt-3 font-extrabold text-slate-700">
                  QR image unavailable
                </p>
              </div>
            )}
          </div>
        </div>

        {paymentSubmitted ? (
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-2xl text-white">
              ✓
            </div>

            <h4 className="mt-4 text-xl font-extrabold text-emerald-950">
              Payment submitted
            </h4>

            <p className="mt-2 font-semibold leading-6 text-emerald-700">
              {submissionSuccess}
            </p>

            <p className="mt-3 text-sm font-semibold text-slate-600">
              Payment status: For Verification
            </p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmitPayment}
            className="rounded-3xl border border-slate-200 bg-slate-50 p-5"
          >
            <h4 className="text-lg font-extrabold text-blue-950">
              Submit payment proof
            </h4>

            <label className="mt-5 block">
              <span className="mb-2 block text-sm font-bold text-slate-700">
                GCash reference number *
              </span>

              <input
                required
                type="text"
                value={paymentReference}
                onChange={handleReferenceChange}
                minLength={6}
                maxLength={30}
                placeholder="Example: 1234567890123"
                autoComplete="off"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 font-bold uppercase outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              />

              <p className="mt-2 text-xs font-semibold text-slate-500">
                Makikita ito sa iyong GCash transaction receipt.
              </p>
            </label>

            <div className="mt-5">
              <span className="mb-2 block text-sm font-bold text-slate-700">
                Screenshot ng payment receipt *
              </span>

              <input
                ref={fileInputRef}
                required
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleProofChange}
                disabled={isSubmitting}
                className="block w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-600 file:mr-4 file:rounded-xl file:border-0 file:bg-emerald-100 file:px-4 file:py-3 file:font-extrabold file:text-emerald-800 hover:file:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
              />

              <p className="mt-2 text-xs font-semibold text-slate-500">
                JPG, PNG, o WebP. Maximum 5 MB.
              </p>
            </div>

            {proofPreviewUrl && proofFile && (
              <div className="mt-5 rounded-3xl border border-emerald-200 bg-white p-4">
                <img
                  src={proofPreviewUrl}
                  alt="Payment proof preview"
                  className="mx-auto max-h-72 rounded-2xl object-contain"
                />

                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-semibold text-slate-600">
                    {proofFile.name}
                  </p>

                  <button
                    type="button"
                    onClick={clearSelectedProof}
                    disabled={isSubmitting}
                    className="shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-extrabold text-red-700"
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}

            {submissionError && (
              <div
                role="alert"
                className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 font-bold text-red-700"
              >
                ⚠️ {submissionError}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-6 w-full rounded-2xl bg-emerald-700 px-6 py-4 text-lg font-extrabold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting
                ? "Submitting payment..."
                : "Submit Payment Proof"}
            </button>

            <p className="mt-3 text-center text-xs font-semibold leading-5 text-slate-500">
              Ibe-verify muna ng admin ang payment bago ito markahan
              bilang Paid.
            </p>
          </form>
        )}
      </div>
    </section>
  );
}