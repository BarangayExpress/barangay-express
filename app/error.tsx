"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-5 text-slate-900">
      <section className="w-full max-w-lg rounded-3xl border border-red-100 bg-white p-8 text-center shadow-xl">
        <div className="text-5xl">⚠️</div>
        <h1 className="mt-5 text-2xl font-black text-blue-950">May pansamantalang problema</h1>
        <p className="mt-3 leading-7 text-slate-600">
          Hindi makumpleto ang request. Pakisubukan muli. Hindi nawala ang iyong account.
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button type="button" onClick={reset} className="rounded-xl bg-blue-700 px-5 py-3 font-extrabold text-white hover:bg-blue-800">
            Subukan muli
          </button>
          <Link href="/" className="rounded-xl border border-blue-200 px-5 py-3 font-extrabold text-blue-700 hover:bg-blue-50">
            Bumalik sa homepage
          </Link>
        </div>
      </section>
    </main>
  );
}
