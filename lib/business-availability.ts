export type BusinessSettingsRow = {
  id: number;
  manual_open: boolean;
  emergency_stop: boolean;
  announcement: string | null;
  opens_at: string;
  closes_at: string;
  timezone: string;
  updated_at: string;
};

export type BusinessAvailability = {
  acceptingBookings: boolean;
  reason:
    | "OPEN"
    | "MANUALLY_CLOSED"
    | "EMERGENCY_STOP"
    | "OUTSIDE_BUSINESS_HOURS";
  message: string;
  currentTime: string;
  opensAt: string;
  closesAt: string;
};

function normalizeTime(value: string) {
  return value.slice(0, 5);
}

function getTimeInTimezone(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const hour =
    parts.find((part) => part.type === "hour")?.value ?? "00";

  const minute =
    parts.find((part) => part.type === "minute")?.value ?? "00";

  return `${hour}:${minute}`;
}

function isWithinBusinessHours(
  currentTime: string,
  opensAt: string,
  closesAt: string
) {
  if (opensAt === closesAt) {
    return true;
  }

  if (opensAt < closesAt) {
    return currentTime >= opensAt && currentTime < closesAt;
  }

  // Supports schedules that pass midnight, such as 18:00–02:00.
  return currentTime >= opensAt || currentTime < closesAt;
}

export function evaluateBusinessAvailability(
  settings: BusinessSettingsRow
): BusinessAvailability {
  const opensAt = normalizeTime(settings.opens_at);
  const closesAt = normalizeTime(settings.closes_at);
  const currentTime = getTimeInTimezone(settings.timezone);

  if (settings.emergency_stop) {
    return {
      acceptingBookings: false,
      reason: "EMERGENCY_STOP",
      message:
        settings.announcement?.trim() ||
        "Temporarily unavailable due to an operational emergency.",
      currentTime,
      opensAt,
      closesAt,
    };
  }

  if (!settings.manual_open) {
    return {
      acceptingBookings: false,
      reason: "MANUALLY_CLOSED",
      message:
        settings.announcement?.trim() ||
        "Barangay Express is currently not accepting bookings.",
      currentTime,
      opensAt,
      closesAt,
    };
  }

  if (!isWithinBusinessHours(currentTime, opensAt, closesAt)) {
    return {
      acceptingBookings: false,
      reason: "OUTSIDE_BUSINESS_HOURS",
      message:
        settings.announcement?.trim() ||
        `Bookings are available from ${opensAt} to ${closesAt}.`,
      currentTime,
      opensAt,
      closesAt,
    };
  }

  return {
    acceptingBookings: true,
    reason: "OPEN",
    message:
      settings.announcement?.trim() ||
      "Barangay Express is currently accepting bookings.",
    currentTime,
    opensAt,
    closesAt,
  };
}