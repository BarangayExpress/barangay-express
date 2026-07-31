import AddressesClient from "./AddressesClient";

export default function CustomerAddressesPage() {
  return (
    <section className="px-4 py-12">
      <div className="mx-auto max-w-7xl">
        <p className="font-extrabold uppercase tracking-[0.2em] text-blue-500">
          Customer Account
        </p>
        <h1 className="mt-3 text-4xl font-black text-blue-950">
          Saved Addresses
        </h1>
        <p className="mt-3 max-w-2xl leading-7 text-slate-600">
          I-save ang madalas mong pickup o drop-off address kasama ang eksaktong
          phone at map location.
        </p>

        <div className="mt-8">
          <AddressesClient />
        </div>
      </div>
    </section>
  );
}
