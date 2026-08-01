import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-blue-950 to-sky-600 px-5 text-white">
      <section className="max-w-lg text-center">
        <p className="text-7xl font-black text-sky-300">404</p>
        <h1 className="mt-4 text-3xl font-black">Hindi makita ang page</h1>
        <p className="mt-4 leading-7 text-blue-100">
          Maaaring mali ang link o nailipat na ang page na iyong binubuksan.
        </p>
        <Link href="/" className="mt-7 inline-flex rounded-xl bg-white px-6 py-3 font-extrabold text-blue-800 hover:bg-blue-50">
          Bumalik sa homepage
        </Link>
      </section>
    </main>
  );
}
