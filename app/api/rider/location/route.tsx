import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type LocationPayload = {
  latitude?: number;
  longitude?: number;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: "Supabase environment variables are missing." },
        { status: 500 }
      );
    }

    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing rider access token." },
        { status: 401 }
      );
    }

    const accessToken = authorization.slice("Bearer ".length);

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json(
        { error: "Invalid or expired rider session." },
        { status: 401 }
      );
    }

    const payload = (await request.json()) as LocationPayload;

    if (
      !isFiniteNumber(payload.latitude) ||
      !isFiniteNumber(payload.longitude)
    ) {
      return NextResponse.json(
        { error: "Valid latitude and longitude are required." },
        { status: 400 }
      );
    }

    if (
      payload.latitude < -90 ||
      payload.latitude > 90 ||
      payload.longitude < -180 ||
      payload.longitude > 180
    ) {
      return NextResponse.json(
        { error: "Latitude or longitude is outside the valid range." },
        { status: 400 }
      );
    }

    const { data: riderProfile, error: profileError } = await supabase
      .from("rider_profiles")
      .select("id, is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !riderProfile?.is_active) {
      return NextResponse.json(
        { error: "This account is not an active rider." },
        { status: 403 }
      );
    }

    const { data, error } = await supabase
      .from("rider_locations")
      .upsert(
        {
          rider_id: user.id,
          latitude: payload.latitude,
          longitude: payload.longitude,
          accuracy: isFiniteNumber(payload.accuracy)
            ? payload.accuracy
            : null,
          heading: isFiniteNumber(payload.heading) ? payload.heading : null,
          speed: isFiniteNumber(payload.speed) ? payload.speed : null,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "rider_id",
        }
      )
      .select(
        "rider_id, latitude, longitude, accuracy, heading, speed, updated_at"
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      location: data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected server error.",
      },
      { status: 500 }
    );
  }
}