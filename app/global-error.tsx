"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="fil">
      <body>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "Arial, sans-serif", background: "#f8fafc" }}>
          <section style={{ maxWidth: 520, textAlign: "center", padding: 32, borderRadius: 24, background: "white", boxShadow: "0 20px 50px rgba(15,23,42,.12)" }}>
            <div style={{ fontSize: 48 }}>⚠️</div>
            <h1 style={{ color: "#172554" }}>Hindi mabuksan ang Barangay Express</h1>
            <p style={{ color: "#475569", lineHeight: 1.7 }}>
              May pansamantalang system error. Pakisubukan muli.
            </p>
            <button type="button" onClick={reset} style={{ marginTop: 16, border: 0, borderRadius: 12, padding: "12px 20px", background: "#1d4ed8", color: "white", fontWeight: 800, cursor: "pointer" }}>
              Subukan muli
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
