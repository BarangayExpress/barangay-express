"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  ImagePlus,
  QrCode,
  ReceiptText,
} from "lucide-react";

type ChatRole = "customer" | "rider";

type ChatMessage = {
  id: number;
  sender_user_id: string | null;
  sender_role: ChatRole;
  message: string;

  message_type: "text" | "image";
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_mime_type: string | null;
  attachment_url: string | null;

  read_at: string | null;
  created_at: string;
};

type Contact = {
  label: string;
  name: string | null;
  phone: string | null;
};

type ChatResponse = {
  success?: boolean;
  error?: string;
  booking_no?: string | null;
  status?: string | null;
  chat_enabled?: boolean;
  read_only?: boolean;
  unread_count?: number;
  contacts?: {
    pickup: Contact | null;
    dropoff: Contact | null;
    rider: Contact | null;
  };
  messages?: ChatMessage[];
};

function telUrl(phone: string | null) {
  if (!phone) return null;
  const normalized = phone.trim().replace(/[^+\d]/g, "");
  return normalized ? `tel:${normalized}` : null;
}

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

export default function BookingChatPanel({
  orderId,
  bookingNo,
  role,
}: {
  orderId: number;
  bookingNo: string | null;
  role: ChatRole;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [data, setData] = useState<ChatResponse>({});
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadKindRef = useRef<
  "merchant_qr" | "payment_proof" | "chat_image"
>("chat_image");

  const load = useCallback(
    async (summaryOnly = false) => {
      try {
        const response = await fetch(
          `/api/chat?order_id=${orderId}${summaryOnly ? "&summary=1" : ""}`,
          { cache: "no-store" }
        );
        const result = (await response.json()) as ChatResponse;

        if (!response.ok || !result.success) {
          throw new Error(result.error || "Hindi ma-load ang chat.");
        }

        setData((current) =>
          summaryOnly ? { ...current, ...result, messages: current.messages } : result
        );
        setError("");

        if (!summaryOnly && (result.unread_count || 0) > 0) {
          await fetch(`/api/chat?order_id=${orderId}`, {
            method: "PATCH",
          });
          setData((current) => ({ ...current, unread_count: 0 }));
        }
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : "Hindi ma-load ang chat."
        );
      } finally {
        setLoading(false);
      }
    },
    [orderId]
  );

  useEffect(() => {
    void load(!open);
    const interval = window.setInterval(
      () => void load(!open),
      open ? 4000 : 15000
    );
    return () => window.clearInterval(interval);
  }, [load, open]);

  useEffect(() => {
    if (!open) return;

    const container = messagesContainerRef.current;
    if (!container) return;

    // Scroll only inside the chat message area. Using scrollIntoView here
    // also moves the whole customer tracking page down.
    window.requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    });
  }, [data.messages, open]);

  async function togglePanel() {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen) {
      setLoading(true);
      await load(false);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || sending) return;

    setSending(true);
    setError("");
    try {
      const response = await fetch(`/api/chat?order_id=${orderId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const result = (await response.json()) as ChatResponse & {
        message?: ChatMessage;
      };

      if (!response.ok || !result.success || !result.message) {
        throw new Error(result.error || "Hindi ma-send ang message.");
      }

      setDraft("");
      setData((current) => ({
        ...current,
        messages: [...(current.messages || []), result.message as ChatMessage],
      }));
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Hindi ma-send ang message."
      );
    } finally {
      setSending(false);
    }
  }

 function chooseImage(
  kind: "merchant_qr" | "payment_proof" | "chat_image"
) {
  uploadKindRef.current = kind;
  fileInputRef.current?.click();
}

async function uploadImage(file: File) {
  if (uploading) return;

  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    setError("JPG, PNG, or WEBP images only.");
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    setError("Image must be 5 MB or smaller.");
    return;
  }

  setUploading(true);
  setError("");

  try {
    const formData = new FormData();

    formData.append("order_id", String(orderId));
    formData.append("kind", uploadKindRef.current);
    formData.append("file", file);

    const response = await fetch("/api/chat/upload", {
      method: "POST",
      body: formData,
    });

    const result = (await response.json()) as ChatResponse & {
      message?: ChatMessage;
    };

    if (!response.ok || !result.success || !result.message) {
      throw new Error(result.error || "Hindi ma-upload ang image.");
    }

    setData((current) => ({
      ...current,
      messages: [
        ...(current.messages || []),
        result.message as ChatMessage,
      ],
    }));
  } catch (uploadError) {
    setError(
      uploadError instanceof Error
        ? uploadError.message
        : "Hindi ma-upload ang image."
    );
  } finally {
    setUploading(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }
} 

  const unread = data.unread_count || 0;
  const contacts = [
    data.contacts?.rider,
    data.contacts?.pickup,
    data.contacts?.dropoff,
  ].filter((contact): contact is Contact => Boolean(contact));

  return (
    <div className="border-t border-blue-100 bg-blue-50/60 px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void togglePanel()}
          aria-expanded={open}
          className="group relative inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-700 to-indigo-600 px-4 py-2.5 text-sm font-black text-white shadow-md shadow-blue-200 transition hover:-translate-y-0.5 hover:shadow-lg"
        >
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-white/15 transition group-hover:bg-white/25">
            {open ? (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" strokeLinejoin="round" />
                <path d="M8 9h8M8 13h5" strokeLinecap="round" />
              </svg>
            )}
          </span>
          {open ? "Close chat" : "Message rider"}
          {unread > 0 && (
            <span className="absolute -right-2 -top-2 min-w-6 rounded-full bg-red-600 px-1.5 py-0.5 text-xs text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>

        {contacts.map((contact) => {
          const href = telUrl(contact.phone);
          return href ? (
            <a
              key={contact.label}
              href={href}
              title={`${contact.name || contact.label}: ${contact.phone}`}
              className="group inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-white px-4 py-2.5 text-sm font-black text-emerald-700 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-md"
            >
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-100 transition group-hover:bg-emerald-200">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.34 1.78.65 2.62a2 2 0 0 1-.45 2.11L8.04 9.72a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.84.31 1.72.53 2.62.65A2 2 0 0 1 22 16.92z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              {contact.label}
            </a>
          ) : null;
        })}
      </div>

      {open && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="font-black text-blue-950">Booking Chat</p>
            <p className="text-xs font-bold text-slate-500">
              {bookingNo || data.booking_no || `Order #${orderId}`}
            </p>
          </div>

          <div
            ref={messagesContainerRef}
            className="max-h-80 space-y-3 overflow-y-auto overscroll-contain bg-slate-50 p-4"
          >
            {loading && !data.messages ? (
              <p className="py-8 text-center text-sm font-bold text-slate-500">
                Loading messages…
              </p>
            ) : (data.messages || []).length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-3xl">💬</p>
                <p className="mt-2 font-bold text-slate-600">
                  Wala pang message. Simulan ang conversation.
                </p>
              </div>
            ) : (
              (data.messages || []).map((message) => {
                const mine = message.sender_role === role;
                return (
                  <div
                    key={message.id}
                    className={`flex ${mine ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                        mine
                          ? "rounded-br-md bg-blue-700 text-white"
                          : "rounded-bl-md border border-slate-200 bg-white text-slate-900"
                      }`}
                    >
                     {message.message_type === "image" ? (
  <div>
    <div
      className={`mb-2 flex items-center gap-2 text-xs font-black ${
        mine ? "text-blue-100" : "text-slate-600"
      }`}
    >
      {message.message === "Merchant payment QR" ? (
        <QrCode className="h-4 w-4" />
      ) : message.message === "Payment proof" ? (
        <ReceiptText className="h-4 w-4" />
      ) : (
        <ImagePlus className="h-4 w-4" />
      )}

      <span>{message.message}</span>
    </div>

    {message.attachment_url ? (
      <button
        type="button"
        onClick={() => setPreviewImage(message.attachment_url)}
        className="block overflow-hidden rounded-xl bg-white"
        title="View full image"
      >
        <img
          src={message.attachment_url}
          alt={message.message || "Chat attachment"}
          className="max-h-72 w-auto max-w-full object-contain"
        />
      </button>
    ) : (
      <div
        className={`rounded-xl px-4 py-3 text-xs font-bold ${
          mine
            ? "bg-blue-600 text-blue-100"
            : "bg-slate-100 text-slate-500"
        }`}
      >
        Image unavailable
      </div>
    )}
  </div>
) : (
  <p className="whitespace-pre-wrap break-words text-sm font-semibold leading-6">
    {message.message}
  </p>
)}
                      <p
                        className={`mt-1 text-[11px] ${
                          mine ? "text-blue-100" : "text-slate-400"
                        }`}
                      >
                        {mine ? "You" : message.sender_role === "rider" ? "Rider" : "Customer"}
                        {" • "}
                        {formatMessageTime(message.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {error && (
            <div className="border-t border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              ⚠️ {error}
            </div>
          )}
          
          <input
  ref={fileInputRef}
  type="file"
  accept="image/jpeg,image/png,image/webp"
  className="hidden"
  onChange={(event) => {
    const file = event.target.files?.[0];

    if (file) {
      void uploadImage(file);
    }
  }}
/>

{data.chat_enabled && (
  <div className="border-t border-slate-100 bg-white px-3 pt-3">
    <div className="flex flex-wrap gap-2">

      {role === "rider" && (
        <button
          type="button"
          disabled={uploading}
          onClick={() => chooseImage("merchant_qr")}
          className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <QrCode className="h-4 w-4" strokeWidth={2.3} />
          {uploading ? "Uploading..." : "Send Merchant QR"}
        </button>
      )}

      {role === "customer" && (
        <button
          type="button"
          disabled={uploading}
          onClick={() => chooseImage("payment_proof")}
          className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ReceiptText className="h-4 w-4" strokeWidth={2.3} />
          {uploading ? "Uploading..." : "Send Payment Proof"}
        </button>
      )}

      <button
        type="button"
        disabled={uploading}
        onClick={() => chooseImage("chat_image")}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:border-blue-200 hover:bg-slate-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ImagePlus className="h-4 w-4" strokeWidth={2.3} />
        Send Photo
      </button>

    </div>

    <p className="mt-2 text-[10px] font-semibold text-slate-400">
      JPG, PNG or WEBP • Maximum 5 MB
    </p>
  </div>
)}

          {data.chat_enabled ? (
            <form
              onSubmit={sendMessage}
              className="flex gap-2 border-t border-slate-100 p-3"
            >
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={1000}
                placeholder="Type a message…"
                className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                className="rounded-xl bg-blue-700 px-5 py-3 font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {sending ? "…" : "Send"}
              </button>
            </form>
          ) : (
            <div className="border-t border-slate-100 bg-slate-100 px-4 py-3 text-center text-sm font-bold text-slate-600">
              {data.read_only
                ? "Read-only na ang chat dahil tapos o cancelled na ang booking."
                : "Magiging available ang chat kapag na-accept na ng rider ang booking."}
            </div>
          )}
        </div>
      )}
     
     {previewImage && (
  <div
    className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
    onClick={() => setPreviewImage(null)}
  >
    <div
      className="relative max-h-[92vh] max-w-5xl"
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setPreviewImage(null)}
        className="absolute -right-2 -top-12 rounded-xl bg-white/10 px-4 py-2 text-sm font-black text-white backdrop-blur transition hover:bg-white/20"
      >
        ✕ Close
      </button>

      <img
        src={previewImage}
        alt="Chat attachment preview"
        className="max-h-[85vh] max-w-full rounded-2xl bg-white object-contain shadow-2xl"
      />
    </div>
  </div>
)}

    </div>
  );
}
