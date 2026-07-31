import "server-only";

type RouteCoordinate = {
  latitude: number;
  longitude: number;
};

type OsrmRoute = {
  distance: number;
  duration: number;
};

type OsrmResponse = {
  code: string;
  message?: string;
  routes?: OsrmRoute[];
};

export type RoadRouteSummary = {
  distanceMeters: number;
  distanceKm: number;
  durationSeconds: number;
  durationMinutes: number;
};

function validateCoordinate(
  coordinate: RouteCoordinate,
  label: string
) {
  if (
    !Number.isFinite(coordinate.latitude) ||
    coordinate.latitude < -90 ||
    coordinate.latitude > 90
  ) {
    throw new Error(`Invalid ${label} latitude.`);
  }

  if (
    !Number.isFinite(coordinate.longitude) ||
    coordinate.longitude < -180 ||
    coordinate.longitude > 180
  ) {
    throw new Error(`Invalid ${label} longitude.`);
  }
}

export async function getRoadRouteSummary(
  start: RouteCoordinate,
  end: RouteCoordinate
): Promise<RoadRouteSummary> {
  validateCoordinate(start, "start");
  validateCoordinate(end, "end");

  const coordinatePath =
    `${start.longitude},${start.latitude};` +
    `${end.longitude},${end.latitude}`;

  const osrmUrl =
    "https://router.project-osrm.org/route/v1/driving/" +
    `${coordinatePath}` +
    "?alternatives=false&steps=false&overview=false";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(osrmUrl, {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "Barangay-Express/1.0",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const responseText = await response.text();

      console.error("OSRM HTTP error:", {
        status: response.status,
        responseText,
      });

      throw new Error(
        `Routing service returned HTTP ${response.status}.`
      );
    }

    const result = (await response.json()) as OsrmResponse;
    const route = result.routes?.[0];

    if (
      result.code !== "Ok" ||
      !route ||
      !Number.isFinite(route.distance) ||
      route.distance <= 0 ||
      !Number.isFinite(route.duration) ||
      route.duration < 0
    ) {
      throw new Error(
        result.message || "No valid road route was found."
      );
    }

    return {
      distanceMeters: route.distance,
      distanceKm: route.distance / 1000,
      durationSeconds: route.duration,
      durationMinutes: Math.max(
        1,
        Math.ceil(route.duration / 60)
      ),
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "AbortError"
    ) {
      throw new Error(
        "The routing service took too long to respond."
      );
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}