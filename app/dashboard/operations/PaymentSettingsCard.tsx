"use client";

import {
  ChangeEvent,
  useRef,
  useState,
} from "react";

type PaymentSettingsCardProps = {
  gcashEnabled: boolean;
  gcashAccountName: string;
  gcashNumber: string;
  gcashQrUrl: string;
  paymentInstructions: string;
  isUpdating: boolean;
  onGcashEnabledChange: (value: boolean) => void;
  onGcashAccountNameChange: (value: string) => void;
  onGcashNumberChange: (value: string) => void;
  onGcashQrUrlChange: (value: string) => void;
  onPaymentInstructionsChange: (value: string) => void;
  onSave: () => void;
};

type UploadResponse = {
  success: boolean;
  public_url?: string;
  file_path?: string;
  error?: string;
};

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const allowedFileTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export default function PaymentSettingsCard({
  gcashEnabled,
  gcashAccountName,
  gcashNumber,
  gcashQrUrl,
  paymentInstructions,
  isUpdating,
  onGcashEnabledChange,
  onGcashAccountNameChange,
  onGcashNumberChange,
  onGcashQrUrlChange,
  onPaymentInstructionsChange,
  onSave,
}: PaymentSettingsCardProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedFile, setSelectedFile] =
    useState<File | null>(null);

  const [localPreviewUrl, setLocalPreviewUrl] =
    useState("");

  const [isUploading, setIsUploading] =
    useState(false);

  const [uploadError, setUploadError] =
    useState("");

  const [uploadSuccess, setUploadSuccess] =
    useState("");

  const qrPreviewUrl =
    localPreviewUrl || gcashQrUrl;

  function clearLocalPreview() {
    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl);
    }

    setLocalPreviewUrl("");
  }

  function handleFileChange(
    event: ChangeEvent<HTMLInputElement>
  ) {
    setUploadError("");
    setUploadSuccess("");

    const file =
      event.target.files?.[0] ?? null;

    if (!file) {
      return;
    }

    if (!allowedFileTypes.has(file.type)) {
      setUploadError(
        "PNG, JPG, JPEG, o WebP image lamang ang puwedeng i-upload."
      );

      event.target.value = "";
      return;
    }

    if (file.size <= 0) {
      setUploadError(
        "Walang laman ang napiling image."
      );

      event.target.value = "";
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setUploadError(
        "Ang QR image ay hindi dapat lumampas sa 5 MB."
      );

      event.target.value = "";
      return;
    }

    clearLocalPreview();

    setSelectedFile(file);
    setLocalPreviewUrl(
      URL.createObjectURL(file)
    );
  }

  async function handleUploadQr() {
    if (!selectedFile) {
      setUploadError(
        "Pumili muna ng QR image."
      );
      return;
    }

    setIsUploading(true);
    setUploadError("");
    setUploadSuccess("");

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch(
        "/api/admin/payment-assets",
        {
          method: "POST",
          body: formData,
        }
      );

      const result =
        (await response.json()) as UploadResponse;

      if (
        !response.ok ||
        !result.success ||
        !result.public_url
      ) {
        throw new Error(
          result.error ||
            "Hindi na-upload ang QR image."
        );
      }

      onGcashQrUrlChange(result.public_url);

      setUploadSuccess(
        "Na-upload ang GCash QR image. Pindutin ang Save GCash Settings para ma-save ang URL."
      );

      setSelectedFile(null);
      clearLocalPreview();

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      setUploadError(
        error instanceof Error
          ? error.message
          : "May error habang ina-upload ang QR image."
      );
    } finally {
      setIsUploading(false);
    }
  }

  function handleCancelSelection() {
    setSelectedFile(null);
    clearLocalPreview();
    setUploadError("");
    setUploadSuccess("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleRemoveQr() {
    const confirmed = window.confirm(
      "Alisin ang kasalukuyang GCash QR image?"
    );

    if (!confirmed) {
      return;
    }

    setSelectedFile(null);
    clearLocalPreview();
    setUploadError("");
    setUploadSuccess(
      "Inalis ang QR URL sa form. Pindutin ang Save GCash Settings para makumpirma."
    );

    onGcashQrUrlChange("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <article className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-white to-emerald-50 p-5 md:p-6 xl:col-span-2">
      <div className="flex flex-col gap-4 border-b border-emerald-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-emerald-600">
            Online payment
          </p>

          <h3 className="mt-1 text-2xl font-extrabold text-blue-950">
            💳 GCash Payment Settings
          </h3>

          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
            Baguhin ang GCash account details,
            payment instructions at QR image na
            makikita ng customer.
          </p>
        </div>

        <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-emerald-200 bg-white px-4 py-3">
          <input
            type="checkbox"
            checked={gcashEnabled}
            onChange={(event) =>
              onGcashEnabledChange(
                event.target.checked
              )
            }
            className="h-5 w-5 accent-emerald-600"
          />

          <span className="font-extrabold text-emerald-800">
            Enable GCash
          </span>
        </label>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-700">
              GCash account name
            </span>

            <input
              type="text"
              value={gcashAccountName}
              onChange={(event) =>
                onGcashAccountNameChange(
                  event.target.value
                )
              }
              maxLength={120}
              placeholder="Barangay Express"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-700">
              GCash number
            </span>

            <input
              type="tel"
              value={gcashNumber}
              onChange={(event) =>
                onGcashNumberChange(
                  event.target.value
                )
              }
              maxLength={11}
              inputMode="numeric"
              placeholder="09XXXXXXXXX"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
            />
          </label>

          <div>
            <span className="mb-2 block text-sm font-bold text-slate-700">
              GCash QR image
            </span>

            <div className="rounded-3xl border border-dashed border-emerald-300 bg-white p-5">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileChange}
                disabled={isUploading}
                className="block w-full text-sm font-semibold text-slate-600 file:mr-4 file:rounded-xl file:border-0 file:bg-emerald-100 file:px-4 file:py-3 file:font-extrabold file:text-emerald-800 hover:file:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
              />

              <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">
                Allowed: PNG, JPG, JPEG o WebP.
                Maximum file size: 5 MB.
              </p>

              {selectedFile && (
                <div className="mt-4 rounded-2xl bg-emerald-50 p-4">
                  <p className="text-sm font-extrabold text-emerald-900">
                    Selected image
                  </p>

                  <p className="mt-1 break-all text-sm font-semibold text-emerald-700">
                    {selectedFile.name}
                  </p>

                  <p className="mt-1 text-xs font-semibold text-emerald-600">
                    {(
                      selectedFile.size /
                      1024 /
                      1024
                    ).toFixed(2)}{" "}
                    MB
                  </p>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => {
                        void handleUploadQr();
                      }}
                      disabled={isUploading}
                      className="rounded-xl bg-emerald-700 px-4 py-3 font-extrabold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isUploading
                        ? "Uploading QR..."
                        : "Upload QR Image"}
                    </button>

                    <button
                      type="button"
                      onClick={handleCancelSelection}
                      disabled={isUploading}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 font-extrabold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Cancel Selection
                    </button>
                  </div>
                </div>
              )}

              {uploadError && (
                <div
                  role="alert"
                  className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700"
                >
                  ⚠️ {uploadError}
                </div>
              )}

              {uploadSuccess && (
                <div
                  role="status"
                  className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700"
                >
                  ✅ {uploadSuccess}
                </div>
              )}

              {gcashQrUrl && (
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleRemoveQr}
                    disabled={
                      isUploading ||
                      isUpdating
                    }
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-extrabold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Remove QR Image
                  </button>

                  <a
                    href={gcashQrUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border border-emerald-200 bg-white px-4 py-3 text-center font-extrabold text-emerald-700 transition hover:bg-emerald-50"
                  >
                    Open Uploaded Image
                  </a>
                </div>
              )}
            </div>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-700">
              Payment instructions
            </span>

            <textarea
              value={paymentInstructions}
              onChange={(event) =>
                onPaymentInstructionsChange(
                  event.target.value.slice(
                    0,
                    1000
                  )
                )
              }
              rows={5}
              maxLength={1000}
              placeholder="I-send ang eksaktong halaga at i-upload ang malinaw na screenshot ng resibo."
              className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3.5 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
            />

            <div className="mt-2 text-right text-xs font-semibold text-slate-400">
              {paymentInstructions.length}/1000
            </div>
          </label>
        </div>

        <div className="rounded-3xl border border-emerald-200 bg-white p-5">
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-emerald-600">
            Customer preview
          </p>

          <h4 className="mt-2 text-xl font-extrabold text-blue-950">
            Pay with GCash
          </h4>

          <div className="mt-5 space-y-4">
            <div className="rounded-2xl bg-emerald-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">
                Account name
              </p>

              <p className="mt-1 font-extrabold text-emerald-950">
                {gcashAccountName ||
                  "Not configured"}
              </p>
            </div>

            <div className="rounded-2xl bg-emerald-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">
                GCash number
              </p>

              <p className="mt-1 text-xl font-extrabold text-emerald-950">
                {gcashNumber ||
                  "Not configured"}
              </p>
            </div>

            <div className="grid min-h-64 place-items-center overflow-hidden rounded-2xl border border-dashed border-emerald-300 bg-slate-50 p-4">
              {qrPreviewUrl ? (
                <img
                  src={qrPreviewUrl}
                  alt="GCash QR code preview"
                  className="max-h-72 w-auto rounded-xl object-contain"
                />
              ) : (
                <div className="text-center">
                  <p className="text-5xl">
                    📱
                  </p>

                  <p className="mt-3 font-extrabold text-slate-700">
                    No QR image yet
                  </p>

                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    Pumili at mag-upload ng QR
                    image.
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-600">
                {paymentInstructions ||
                  "Payment instructions will appear here."}
              </p>
            </div>

            <div
              className={`rounded-2xl px-4 py-3 font-extrabold ${
                gcashEnabled
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              {gcashEnabled
                ? "✅ GCash is available to customers"
                : "⛔ GCash is currently disabled"}
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onSave}
        disabled={
          isUpdating || isUploading
        }
        className="mt-6 w-full rounded-2xl bg-emerald-700 px-6 py-4 text-lg font-extrabold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isUpdating
          ? "Saving GCash settings..."
          : "Save GCash Settings"}
      </button>
    </article>
  );
}