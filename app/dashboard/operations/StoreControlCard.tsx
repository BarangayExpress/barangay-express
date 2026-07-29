type StoreControlCardProps = {
  manualOpen: boolean;
  currentTime: string;
  openingTime: string;
  closingTime: string;
  isUpdating: boolean;
  onToggleStore: () => void;
};

function formatTime(value: string) {
  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return value;
  }

  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

export default function StoreControlCard({
  manualOpen,
  currentTime,
  openingTime,
  closingTime,
  isUpdating,
  onToggleStore,
}: StoreControlCardProps) {
  return (
    <article className="rounded-3xl border border-blue-100 bg-blue-50/50 p-5 md:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-500">
            Manual store control
          </p>

          <h3 className="mt-1 text-xl font-extrabold text-blue-950">
            {manualOpen
              ? "Store is manually open"
              : "Store is manually closed"}
          </h3>

          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            Ang schedule at Emergency Stop ay maaari pa ring mag-close ng
            bookings kahit manually open.
          </p>
        </div>

        <button
          type="button"
          onClick={onToggleStore}
          disabled={isUpdating}
          className={`shrink-0 rounded-2xl px-6 py-4 font-extrabold text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-60 ${
            manualOpen
              ? "bg-red-600 shadow-red-200 hover:bg-red-700"
              : "bg-emerald-600 shadow-emerald-200 hover:bg-emerald-700"
          }`}
        >
          {manualOpen ? "Close Store" : "Open Store"}
        </button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Current Manila time
          </p>

          <p className="mt-1 text-xl font-extrabold text-blue-950">
            {formatTime(currentTime)}
          </p>
        </div>

        <div className="rounded-2xl bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Booking schedule
          </p>

          <p className="mt-1 font-extrabold text-blue-950">
            {formatTime(openingTime)} – {formatTime(closingTime)}
          </p>
        </div>
      </div>
    </article>
  );
}