import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type OsrmRoute = {
  distance: number;
  duration: number;
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
};

type OsrmResponse = {
  code: string;
  message?: string;
  routes?: OsrmRoute[];
};

function readCoordinate(
  request: NextRequest,
  name: string,
  minimum: number,
  maximum: number
) {
  const rawValue = request.nextUrl.searchParams.get(name);

  if (!rawValue) {
    throw new Error(`Missing ${name}.`);
  }

  const value = Number(rawValue);

  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`Invalid ${name}.`);
  }

  return value;
}

export async function GET(request: NextRequest) {
  try {
    const startLatitude = readCoordinate(request, "start_lat", -90, 90);
    const startLongitude = readCoordinate(request, "start_lng", -180, 180);
    const endLatitude = readCoordinate(request, "end_lat", -90, 90);
    const endLongitude = readCoordinate(request, "end_lng", -180, 180);

    const coordinatePath =
      `${startLongitude},${startLatitude};` +
      `${endLongitude},${endLatitude}`;

    const osrmUrl =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${coordinatePath}` +
      `?alternatives=false&steps=false&overview=full&geometries=geojson`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    let response: Response;

    try {
      response = await fetch(osrmUrl, {
        method: "GET",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "User-Agent": "Barangay-Express/1.0",
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const responseText = await response.text();

      console.error("OSRM HTTP error:", {
        status: response.status,
        responseText,
      });

      return NextResponse.json(
        {
          success: false,
          error: `Routing service returned HTTP ${response.status}.`,
        },
        { status: 502 }
      );
    }

    const result = (await response.json()) as OsrmResponse;
    const firstRoute = result.routes?.[0];

    if (
      result.code !== "Ok" ||
      !firstRoute ||
      firstRoute.geometry?.type !== "LineString" ||
      !Array.isArray(firstRoute.geometry.coordinates) ||
      firstRoute.geometry.coordinates.length < 2
    ) {
      console.error("OSRM route not found:", result);

      return NextResponse.json(
        {
          success: false,
          error: result.message || "No road route was found.",
        },
        { status: 404 }
      );
    }

    const leafletCoordinates: [number, number][] =
      firstRoute.geometry.coordinates.map(([longitude, latitude]) => [
        latitude,
        longitude,
      ]);

    return NextResponse.json(
      {
        success: true,
        route: {
          coordinates: leafletCoordinates,
          distance_meters: firstRoute.distance,
          duration_seconds: firstRoute.duration,
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    const isAbortError =
      error instanceof Error && error.name === "AbortError";

    console.error("Route API error:", error);

    return NextResponse.json(
      {
        success: false,
        error: isAbortError
          ? "The routing service took too long to respond."
          : error instanceof Error
            ? error.message
            : "Unknown routing error.",
      },
      { status: isAbortError ? 504 : 400 }
    );
  }
}