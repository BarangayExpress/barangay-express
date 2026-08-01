"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type NotificationItem = {
  id: number;
  booking_no: string | null;
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

export default function NotificationBell({
  defaultHref = "/",
  dark = false,
}: {
  defaultHref?: string;
  dark?: boolean;
}) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json();
      setItems(payload.notifications ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 20_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    function close(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  async function markRead(id?: number) {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(id ? { notification_id: id } : { mark_all: true }),
    });
    setItems((current) =>
      current.map((item) =>
        !id || item.id === id
          ? { ...item, read_at: item.read_at ?? new Date().toISOString() }
          : item
      )
    );
  }

  const unread = items.filter((item) => !item.read_at).length;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        className={`relative grid h-11 w-11 place-items-center rounded-xl border text-lg transition ${
          dark
            ? "border-white/20 bg-white/10 text-white hover:bg-white/20"
            : "border-blue-100 bg-white text-blue-950 hover:bg-blue-50"
        }`}
      >
        🔔
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 grid min-h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-black text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <section className="absolute right-0 top-13 z-[200] w-[min(23rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
          <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-blue-600">Updates</p>
              <h2 className="font-black text-blue-950">Notifications</h2>
            </div>
            {unread > 0 && (
              <button type="button" onClick={() => markRead()} className="text-xs font-extrabold text-blue-700 hover:underline">
                Mark all read
              </button>
            )}
          </header>
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <p className="p-6 text-center text-sm text-slate-500">Loading...</p>
            ) : items.length === 0 ? (
              <p className="p-7 text-center text-sm font-semibold text-slate-500">Wala pang notification.</p>
            ) : (
              items.map((item) => {
                const href = typeof item.metadata?.href === "string" ? item.metadata.href : defaultHref;
                return (
                  <Link
                    key={item.id}
                    href={href}
                    onClick={() => { markRead(item.id); setOpen(false); }}
                    className={`block border-b border-slate-100 px-4 py-3 transition hover:bg-blue-50 ${!item.read_at ? "bg-blue-50/70" : "bg-white"}`}
                  >
                    <div className="flex gap-3">
                      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${!item.read_at ? "bg-blue-600" : "bg-slate-300"}`} />
                      <div>
                        <p className="text-sm font-black text-blue-950">{item.title}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-600">{item.message}</p>
                        <p className="mt-1 text-[10px] font-bold text-slate-400">{new Date(item.created_at).toLocaleString("en-PH")}</p>
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </section>
      )}
    </div>
  );
}
