import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import {
  BusinessSettingsRow,
  evaluateBusinessAvailability,
} from "@/lib/business-availability";

type BookingPayload = {
  booking_no?: string;
  sender_name?: string;
  sender_phone?: string;
  pickup_address?: string;
  receiver_name?: string;
  receiver_phone?: string;
  dropoff_address?: string;
  package_type?: string;
  payment_method?: string;
  price?: number;
  notes?: string;
  pickup_latitude?: number;
  pickup_longitude?: number;
  dropoff_latitude?: number;
  dropoff_longitude?: number;
};

type ValidatedBooking = {
  booking_no: string;
  sender_name: string;
  sender_phone: string;
  pickup_address: string;
  receiver_name: string;
  receiver_phone: string;
  dropoff_address: string;
  package_type: string;
  payment_method: string;
  price: number;
  status: "Pending";
  notes: string | null;
  pickup_latitude: number;
  pickup_longitude: number;
  dropoff_latitude: number;
  dropoff_longitude: number;
};

const allowedPackageTypes = new Set([
  "Document",
  "Food",
  "Medicine",
  "Grocery",
  "Parcel",
  "Other",
]);

const allowedPaymentMethods = new Set(["Cash", "GCash"]);

function cleanText(value: unknown, maximumLength: number) {
  if (typeof value !== "string") return "";

  return value.trim().slice(0, maximumLength);
}

function isValidPhilippineMobile(value: string) {
  return /^09\d{9}$/.test(value);
}

function isValidCoordinate(
  value: unknown,
  minimum: number,
  maximum: number
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function validateBooking(body: BookingPayload):
  | {
      success: true;
      booking: ValidatedBooking;
    }
  | {
      success: false;
      error: string;
    } {
  const bookingNo = cleanText(body.booking_no, 80);
  const senderName = cleanText(body.sender_name, 120);
  const senderPhone = cleanText(body.sender_phone, 20);
  const pickupAddress = cleanText(body.pickup_address, 500);
  const receiverName = cleanText(body.receiver_name, 120);
  const receiverPhone = cleanText(body.receiver_phone, 20);
  const dropoffAddress = cleanText(body.dropoff_address, 500);
  const packageType = cleanText(body.package_type, 50);
  const paymentMethod = cleanText(body.payment_method, 50);
  const notes = cleanText(body.notes, 1000);
  const price = Number(body.price);

  if (!bookingNo || !/^BE-\d{10,}$/.test(bookingNo)) {
    return {
      success: false,
      error: "Invalid booking number.",
    };
  }

  if (!senderName) {
    return {
      success: false,
      error: "Sender name is required.",
    };
  }

  if (!isValidPhilippineMobile(senderPhone)) {
    return {
      success: false,
      error: "Sender phone number must use the 09XXXXXXXXX format.",
    };
  }

  if (!pickupAddress) {
    return {
      success: false,
      error: "Pickup address is required.",
    };
  }

  if (!receiverName) {
    return {
      success: false,
      error: "Receiver name is required.",
    };
  }

  if (!isValidPhilippineMobile(receiverPhone)) {
    return {
      success: false,
      error: "Receiver phone number must use the 09XXXXXXXXX format.",
    };
  }

  if (!dropoffAddress) {
    return {
      success: false,
      error: "Drop-off address is required.",
    };
  }

  if (!allowedPackageTypes.has(packageType)) {
    return {
      success: false,
      error: "Invalid package type.",
    };
  }

  if (!allowedPaymentMethods.has(paymentMethod)) {
    return {
      success: false,
      error: "Invalid payment method.",
    };
  }

  if (!Number.isFinite(price) || price <= 0 || price > 100000) {
    return {
      success: false,
      error: "Invalid delivery fee.",
    };
  }

  if (
    !isValidCoordinate(body.pickup_latitude, -90, 90) ||
    !isValidCoordinate(body.pickup_longitude, -180, 180) ||
    !isValidCoordinate(body.dropoff_latitude, -90, 90) ||
    !isValidCoordinate(body.dropoff_longitude, -180, 180)
  ) {
    return {
      success: false,
      error: "Valid pickup and drop-off map locations are required.",
    };
  }

  return {
    success: true,
    booking: {
      booking_no: bookingNo,
      sender_name: senderName,
      sender_phone: senderPhone,
      pickup_address: pickupAddress,
      receiver_name: receiverName,
      receiver_phone: receiverPhone,
      dropoff_address: dropoffAddress,
      package_type: packageType,
      payment_method: paymentMethod,
      price: Math.round(price),
      status: "Pending",
      notes: notes || null,
      pickup_latitude: body.pickup_latitude,
      pickup_longitude: body.pickup_longitude,
      dropoff_latitude: body.dropoff_latitude,
      dropoff_longitude: body.dropoff_longitude,
    },
  };
}

async function sendTelegramNotification(booking: ValidatedBooking) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.warn("Telegram token or chat ID is missing.");
    return;
  }

  const message = [
    "🚚 NEW BARANGAY EXPRESS BOOKING",
    "",
    `Booking: ${booking.booking_no}`,
    "",
    `Sender: ${booking.sender_name}`,
    `Phone: ${booking.sender_phone}`,
    `Pickup: ${booking.pickup_address}`,
    "",
    `Receiver: ${booking.receiver_name}`,
    `Phone: ${booking.receiver_phone}`,
    `Drop-off: ${booking.dropoff_address}`,
    "",
    `Package: ${booking.package_type}`,
    `Payment: ${booking.payment_method}`,
    `Fee: ₱${booking.price}`,
    `Status: ${booking.status}`,
    booking.notes ? `Notes: ${booking.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
      }),
    }
  );

  if (!response.ok) {
    const telegramError = await response.text();
    throw new Error(`Telegram error: ${telegramError}`);
  }
}

async function requireAdmin() {
  const serverSupabase = await createServerClient();

  const {
    data: { user },
    error,
  } = await serverSupabase.auth.getUser();

  if (error || !user) {
    return {
      authorized: false as const,
      response: NextResponse.json(
        {
          success: false,
          error: "Unauthorized. Please log in.",
        },
        { status: 401 }
      ),
    };
  }

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const currentEmail = user.email?.trim().toLowerCase();

  if (!adminEmail || !currentEmail || currentEmail !== adminEmail) {
    return {
      authorized: false as const,
      response: NextResponse.json(
        {
          success: false,
          error: "Forbidden. Admin access only.",
        },
        { status: 403 }
      ),
    };
  }

  return {
    authorized: true as const,
    serverSupabase,
  };
}

export async function GET() {
  try {
    const authorization = await requireAdmin();

    if (!authorization.authorized) {
      return authorization.response;
    }

    const { data, error } = await authorization.serverSupabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Bookings GET API error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown server error.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BookingPayload;
    const validation = validateBooking(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: validation.error,
        },
        { status: 400 }
      );
    }

    const supabaseAdmin = createAdminClient();

    const { data: settings, error: settingsError } =
      await supabaseAdmin
        .from("business_settings")
        .select(
          "id, manual_open, emergency_stop, announcement, opens_at, closes_at, timezone, updated_at"
        )
        .eq("id", 1)
        .single<BusinessSettingsRow>();

    if (settingsError) {
      throw new Error(
        `Unable to verify business availability: ${settingsError.message}`
      );
    }

    const availability = evaluateBusinessAvailability(settings);

    if (!availability.acceptingBookings) {
      return NextResponse.json(
        {
          success: false,
          code: availability.reason,
          error: availability.message,
          business_hours: {
            opens_at: availability.opensAt,
            closes_at: availability.closesAt,
          },
        },
        { status: 403 }
      );
    }

    const { error: insertError } = await supabaseAdmin
      .from("orders")
      .insert(validation.booking);

    if (insertError) {
      if (insertError.code === "23505") {
        return NextResponse.json(
          {
            success: false,
            error: "This booking number already exists.",
          },
          { status: 409 }
        );
      }

      throw new Error(insertError.message);
    }

    try {
      await sendTelegramNotification(validation.booking);
    } catch (telegramError) {
      console.error("Telegram notification failed:", telegramError);
    }

    return NextResponse.json(
      {
        success: true,
        booking_no: validation.booking.booking_no,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Booking POST API error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown server error.",
      },
      { status: 500 }
    );
  }
}