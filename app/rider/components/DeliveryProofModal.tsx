"use client";

import {
  ChangeEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { SupabaseClient } from "@supabase/supabase-js";

type DeliveryProofModalProps = {
  open: boolean;
  orderId: number;
  bookingNo: string | null;
  supabase: SupabaseClient;
  riderId: string;
  onClose: () => void;
  onSubmitted: () => Promise<void> | void;
};

type UploadStage =
  | "idle"
  | "preparing"
  | "watermarking"
  | "uploading"
  | "uploading-signature"
  | "saving"
  | "success";

type Coordinates = {
  latitude: number;
  longitude: number;
} | null;

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_IMAGE_SIDE = 1600;
const JPEG_QUALITY = 0.82;

function getStageLabel(stage: UploadStage) {
  switch (stage) {
    case "preparing":
      return "Preparing photo...";
    case "watermarking":
      return "Adding delivery watermark...";
    case "uploading":
      return "Uploading proof photo...";
    case "uploading-signature":
      return "Uploading receiver signature...";
    case "saving":
      return "Saving delivery record...";
    case "success":
      return "Proof submitted successfully";
    default:
      return "";
  }
}

function getStageProgress(stage: UploadStage) {
  switch (stage) {
    case "preparing":
      return 15;
    case "watermarking":
      return 38;
    case "uploading":
      return 62;
    case "uploading-signature":
      return 82;
    case "saving":
      return 92;
    case "success":
      return 100;
    default:
      return 0;
  }
}

function readImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Hindi mabasa ang napiling larawan."));
    };

    image.src = objectUrl;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = "image/jpeg",
  quality = JPEG_QUALITY
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Hindi ma-process ang delivery photo."));
          return;
        }
        resolve(blob);
      },
      type,
      quality
    );
  });
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
) {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (context.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }

  if (current) lines.push(current);
  return lines;
}

async function createWatermarkedPhoto({
  file,
  bookingNo,
  coordinates,
}: {
  file: File;
  bookingNo: string;
  coordinates: Coordinates;
}) {
  const image = await readImage(file);
  const scale = Math.min(
    1,
    MAX_IMAGE_SIDE / Math.max(image.naturalWidth, image.naturalHeight)
  );

  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Hindi available ang image processor.");

  context.drawImage(image, 0, 0, width, height);

  const padding = Math.max(18, Math.round(width * 0.025));
  const titleSize = Math.max(22, Math.round(width * 0.035));
  const detailSize = Math.max(15, Math.round(width * 0.022));
  const lineGap = Math.round(detailSize * 1.45);

  const timestamp = new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());

  const coordinateText = coordinates
    ? `GPS: ${coordinates.latitude.toFixed(6)}, ${coordinates.longitude.toFixed(
        6
      )}`
    : "GPS: unavailable";

  context.font = `700 ${detailSize}px Arial`;
  const coordinateLines = wrapText(
    context,
    coordinateText,
    width - padding * 2
  );

  const panelHeight =
    padding * 2 +
    titleSize +
    lineGap +
    detailSize * 2 +
    coordinateLines.length * lineGap;

  const panelY = height - panelHeight;

  context.fillStyle = "rgba(2, 6, 23, 0.82)";
  context.fillRect(0, panelY, width, panelHeight);

  context.fillStyle = "#ffffff";
  context.font = `900 ${titleSize}px Arial`;
  context.fillText("BARANGAY EXPRESS", padding, panelY + padding + titleSize);

  context.font = `700 ${detailSize}px Arial`;
  let textY = panelY + padding + titleSize + lineGap;
  context.fillText(`Booking: ${bookingNo}`, padding, textY);

  textY += lineGap;
  context.fillText(`Captured: ${timestamp}`, padding, textY);

  for (const line of coordinateLines) {
    textY += lineGap;
    context.fillText(line, padding, textY);
  }

  const blob = await canvasToBlob(canvas);
  return new File([blob], `delivery-proof-${Date.now()}.jpg`, {
    type: "image/jpeg",
  });
}

function getCurrentCoordinates(): Promise<Coordinates> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => resolve(null),
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    );
  });
}

function signatureCanvasToBlob(
  canvas: HTMLCanvasElement
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Hindi ma-process ang receiver signature."));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

export default function DeliveryProofModal({
  open,
  orderId,
  bookingNo,
  supabase,
  riderId,
  onClose,
  onSubmitted,
}: DeliveryProofModalProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const signingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const [photo, setPhoto] = useState<File | null>(null);
  const [receiverName, setReceiverName] = useState("");
  const [hasSignature, setHasSignature] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [coordinates, setCoordinates] = useState<Coordinates>(null);
  const [locating, setLocating] = useState(false);
  const [stage, setStage] = useState<UploadStage>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const submitting =
    stage !== "idle" && stage !== "success";

  useEffect(() => {
    if (!photo) {
      setPreviewUrl("");
      return;
    }

    const url = URL.createObjectURL(photo);
    setPreviewUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [photo]);

  useEffect(() => {
    if (!open) {
      setPhoto(null);
      setReceiverName("");
      setHasSignature(false);
      setCoordinates(null);
      setStage("idle");
      setErrorMessage("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    const setupCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.max(window.devicePixelRatio || 1, 1);

      canvas.width = Math.max(1, Math.floor(rect.width * ratio));
      canvas.height = Math.max(1, Math.floor(rect.height * ratio));

      const context = canvas.getContext("2d");
      if (!context) return;

      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = 2.5;
      context.strokeStyle = "#0f172a";
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, rect.width, rect.height);
    };

    setupCanvas();
    window.addEventListener("resize", setupCanvas);

    return () => {
      window.removeEventListener("resize", setupCanvas);
    };
  }, [open]);

  const hasPhoto = Boolean(photo);
  const hasReceiver = Boolean(receiverName.trim());
  const canSubmit =
    hasPhoto && hasReceiver && hasSignature && !submitting;

  const progress = getStageProgress(stage);
  const stageLabel = getStageLabel(stage);

  async function captureLocation() {
    setLocating(true);
    const result = await getCurrentCoordinates();
    setCoordinates(result);
    setLocating(false);
  }

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setErrorMessage("");
    setStage("idle");

    if (!selected) return;

    if (!selected.type.startsWith("image/")) {
      setPhoto(null);
      setErrorMessage("Image file lamang ang puwedeng gamitin.");
      return;
    }

    if (selected.size > MAX_FILE_SIZE) {
      setPhoto(null);
      setErrorMessage("Masyadong malaki ang photo. Maximum ay 10 MB.");
      return;
    }

    setPhoto(selected);

    if (!coordinates) {
      await captureLocation();
    }
  }

  function openCamera() {
    if (!submitting) inputRef.current?.click();
  }

  function clearPhoto() {
    if (submitting) return;
    setPhoto(null);
    if (inputRef.current) inputRef.current.value = "";
  }


  function getSignaturePoint(
    event: ReactPointerEvent<HTMLCanvasElement>
  ) {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function startSignature(
    event: ReactPointerEvent<HTMLCanvasElement>
  ) {
    if (submitting) return;

    const canvas = signatureCanvasRef.current;
    const point = getSignaturePoint(event);

    if (!canvas || !point) return;

    canvas.setPointerCapture(event.pointerId);
    signingRef.current = true;
    lastPointRef.current = point;
  }

  function drawSignature(
    event: ReactPointerEvent<HTMLCanvasElement>
  ) {
    if (!signingRef.current || submitting) return;

    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext("2d");
    const point = getSignaturePoint(event);
    const previousPoint = lastPointRef.current;

    if (!canvas || !context || !point || !previousPoint) return;

    context.beginPath();
    context.moveTo(previousPoint.x, previousPoint.y);
    context.lineTo(point.x, point.y);
    context.stroke();

    lastPointRef.current = point;
    setHasSignature(true);
  }

  function endSignature(
    event: ReactPointerEvent<HTMLCanvasElement>
  ) {
    const canvas = signatureCanvasRef.current;

    if (canvas?.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }

    signingRef.current = false;
    lastPointRef.current = null;
  }

  function clearSignature() {
    if (submitting) return;

    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const context = canvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, rect.width, rect.height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, rect.width, rect.height);
    context.strokeStyle = "#0f172a";
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 2.5;

    setHasSignature(false);
  }

  async function submitProof() {
    if (!photo || !receiverName.trim() || !hasSignature) {
      setErrorMessage(
        "Kailangan ang delivery photo, pangalan ng tumanggap, at receiver signature."
      );
      return;
    }

    setErrorMessage("");

    let uploadedPhotoPath = "";
    let uploadedSignaturePath = "";

    try {
      setStage("preparing");

      const finalCoordinates =
        coordinates ?? (await getCurrentCoordinates());
      setCoordinates(finalCoordinates);

      setStage("watermarking");

      const processedPhoto = await createWatermarkedPhoto({
        file: photo,
        bookingNo: bookingNo || `Order-${orderId}`,
        coordinates: finalCoordinates,
      });

      const uploadTimestamp = Date.now();
      uploadedPhotoPath = `${riderId}/${orderId}/${uploadTimestamp}.jpg`;

      setStage("uploading");

      const { error: uploadError } = await supabase.storage
        .from("delivery-proofs")
        .upload(uploadedPhotoPath, processedPhoto, {
          cacheControl: "3600",
          contentType: "image/jpeg",
          upsert: false,
        });

      if (uploadError) throw new Error(uploadError.message);

      const { data: publicUrlData } = supabase.storage
        .from("delivery-proofs")
        .getPublicUrl(uploadedPhotoPath);

      const signatureCanvas = signatureCanvasRef.current;
      if (!signatureCanvas) {
        throw new Error("Hindi makita ang receiver signature.");
      }

      const signatureBlob = await signatureCanvasToBlob(signatureCanvas);
      const signatureFile = new File(
        [signatureBlob],
        `receiver-signature-${uploadTimestamp}.png`,
        { type: "image/png" }
      );

      uploadedSignaturePath = `${riderId}/${orderId}/signature-${uploadTimestamp}.png`;

      setStage("uploading-signature");

      const { error: signatureUploadError } = await supabase.storage
        .from("delivery-proofs")
        .upload(uploadedSignaturePath, signatureFile, {
          cacheControl: "3600",
          contentType: "image/png",
          upsert: false,
        });

      if (signatureUploadError) {
        throw new Error(signatureUploadError.message);
      }

      const { data: signatureUrlData } = supabase.storage
        .from("delivery-proofs")
        .getPublicUrl(uploadedSignaturePath);

      setStage("saving");

      const now = new Date().toISOString();

      const { data: updatedOrder, error: updateError } = await supabase
        .from("orders")
        .update({
          proof_photo_url: publicUrlData.publicUrl,
          received_by: receiverName.trim(),
          receiver_signature_url: signatureUrlData.publicUrl,
          proof_submitted_at: now,
          delivered_at: now,
          status: "Delivered",
        })
        .eq("id", orderId)
        .eq("assigned_rider", riderId)
        .eq("status", "In Transit")
        .select("id, receiver_signature_url")
        .maybeSingle<{
          id: number;
          receiver_signature_url: string | null;
        }>();

      if (updateError) throw new Error(updateError.message);

      if (!updatedOrder) {
        throw new Error(
          "Hindi na-update ang order. Siguraduhing In Transit pa ang status."
        );
      }

      if (!updatedOrder.receiver_signature_url) {
        throw new Error(
          "Na-upload ang proof pero hindi na-save ang receiver signature URL."
        );
      }

      setStage("success");
      await onSubmitted();

      window.setTimeout(() => {
        onClose();
      }, 900);
    } catch (error) {
      const uploadedPaths = [
        uploadedPhotoPath,
        uploadedSignaturePath,
      ].filter(Boolean);

      if (uploadedPaths.length > 0) {
        await supabase.storage
          .from("delivery-proofs")
          .remove(uploadedPaths);
      }

      setStage("idle");
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Hindi na-submit ang proof of delivery. Subukan ulit."
      );
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1100] flex items-end justify-center bg-slate-950/75 p-0 backdrop-blur-sm sm:items-center sm:p-5">
      <div className="max-h-[95vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-xl sm:rounded-3xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-blue-600">
              Proof of Delivery
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-950">
              {bookingNo || `Order #${orderId}`}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl bg-slate-100 px-3 py-2 font-black text-slate-700 transition hover:bg-slate-200 disabled:opacity-40"
          >
            ✕
          </button>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          {errorMessage && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 font-bold text-red-700">
              {errorMessage}
            </div>
          )}

          {stage === "success" ? (
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-6 py-10 text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-600 text-4xl text-white">
                ✓
              </div>
              <h3 className="mt-5 text-2xl font-black text-emerald-950">
                Proof submitted
              </h3>
              <p className="mt-2 font-semibold text-emerald-700">
                Delivered na ang order. Lalabas na ang Complete Order button.
              </p>
            </div>
          ) : (
            <>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoChange}
                className="hidden"
                disabled={submitting}
              />

              {!photo ? (
                <button
                  type="button"
                  onClick={openCamera}
                  disabled={submitting}
                  className="w-full rounded-3xl border-2 border-dashed border-blue-300 bg-blue-50 px-6 py-10 text-center transition hover:bg-blue-100 disabled:opacity-50"
                >
                  <span className="block text-5xl">📸</span>
                  <span className="mt-4 block text-xl font-black text-blue-950">
                    Take Delivery Photo
                  </span>
                  <span className="mt-2 block text-sm font-semibold text-blue-700">
                    Bubuksan ang camera kapag supported ng device.
                  </span>
                </button>
              ) : (
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="overflow-hidden rounded-2xl bg-slate-200">
                    {previewUrl ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={previewUrl}
                          alt="Delivery proof preview"
                          className="h-64 w-full object-contain"
                        />
                      </>
                    ) : (
                      <div className="flex h-64 items-center justify-center text-center">
                        <div>
                          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-300 border-t-blue-600" />
                          <p className="mt-3 text-sm font-bold text-slate-600">
                            Preparing photo preview...
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={openCamera}
                      disabled={submitting}
                      className="rounded-2xl border border-blue-200 bg-white px-4 py-3 font-black text-blue-800 transition hover:bg-blue-50 disabled:opacity-50"
                    >
                      📸 Retake
                    </button>

                    <button
                      type="button"
                      onClick={clearPhoto}
                      disabled={submitting}
                      className="rounded-2xl border border-red-200 bg-white px-4 py-3 font-black text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                    >
                      🗑 Remove
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label
                  htmlFor="pod-receiver-name"
                  className="text-sm font-black text-slate-900"
                >
                  👤 Pangalan ng tumanggap
                </label>
                <input
                  id="pod-receiver-name"
                  type="text"
                  value={receiverName}
                  onChange={(event) => setReceiverName(event.target.value)}
                  placeholder="Halimbawa: Juan Dela Cruz"
                  disabled={submitting}
                  className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-4 font-bold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100"
                />
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <label className="text-sm font-black text-slate-900">
                    ✍️ Pirma ng tumanggap
                  </label>

                  <button
                    type="button"
                    onClick={clearSignature}
                    disabled={!hasSignature || submitting}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Clear signature
                  </button>
                </div>

                <div className="mt-2 overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-white">
                  <canvas
                    ref={signatureCanvasRef}
                    onPointerDown={startSignature}
                    onPointerMove={drawSignature}
                    onPointerUp={endSignature}
                    onPointerCancel={endSignature}
                    onPointerLeave={endSignature}
                    className="h-44 w-full cursor-crosshair touch-none"
                    aria-label="Receiver signature pad"
                  />
                </div>

                <p className="mt-2 text-xs font-semibold text-slate-500">
                  Pumirma gamit ang daliri sa phone o mouse/touchpad sa laptop.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-black text-slate-900">Submission checklist</p>

                <div className="mt-3 space-y-2 text-sm font-bold">
                  <p className={hasPhoto ? "text-emerald-700" : "text-slate-500"}>
                    {hasPhoto ? "✓" : "○"} Delivery photo
                  </p>
                  <p
                    className={
                      hasReceiver ? "text-emerald-700" : "text-slate-500"
                    }
                  >
                    {hasReceiver ? "✓" : "○"} Receiver name
                  </p>
                  <p
                    className={
                      hasSignature ? "text-emerald-700" : "text-slate-500"
                    }
                  >
                    {hasSignature ? "✓" : "○"} Receiver signature
                  </p>
                  <p
                    className={
                      coordinates ? "text-emerald-700" : "text-amber-700"
                    }
                  >
                    {coordinates ? "✓" : "○"} GPS location{" "}
                    {!coordinates && "(optional kapag unavailable)"}
                  </p>
                </div>

                {!coordinates && (
                  <button
                    type="button"
                    onClick={captureLocation}
                    disabled={locating || submitting}
                    className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-black text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
                  >
                    {locating ? "Getting GPS..." : "📍 Get Current Location"}
                  </button>
                )}
              </div>

              {submitting && (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-black text-blue-950">{stageLabel}</p>
                    <p className="font-black text-blue-700">{progress}%</p>
                  </div>

                  <div className="mt-3 h-3 overflow-hidden rounded-full bg-blue-100">
                    <div
                      className="h-full rounded-full bg-blue-700 transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  <p className="mt-2 text-xs font-semibold text-blue-700">
                    Stage-based progress ito; maaaring magtagal depende sa internet.
                  </p>
                </div>
              )}

              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold leading-6 text-amber-800">
                Lalagyan ng booking number, oras, at GPS watermark ang uploaded
                photo. Isasama rin ang receiver signature sa delivery record.
                Kapag na-submit, magiging <strong>Delivered</strong> ang order.
              </div>

              <button
                type="button"
                onClick={submitProof}
                disabled={!canSubmit}
                className="w-full rounded-2xl bg-blue-700 px-5 py-4 font-black text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
              >
                {submitting
                  ? stageLabel
                  : "✅ Submit Proof of Delivery"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}