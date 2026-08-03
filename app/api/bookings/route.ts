import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import {
  BusinessSettingsRow,
  evaluateBusinessAvailability,
} from "@/lib/business-availability";
import { requireAdmin, requireCustomer } from "@/lib/require-role";
import { createManyNotifications } from "@/lib/notifications";
import {
  calculateDeliveryFee,
  normalizeOrderAmount,
} from "@/lib/fare";
import { getRoadRouteSummary } from "@/lib/osrm";

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
  item_payment_flow?: string;
  order_amount?: number;
  notes?: string;
  pickup_latitude?: number;
  pickup_longitude?: number;
  dropoff_latitude?: number;
  dropoff_longitude?: number;

  // Maaari pa ring ipadala ng lumang frontend,
  // pero hindi na ito pagkakatiwalaan ng server.
  price?: number;
};

type ValidatedBookingInput = {
  booking_no: string;
  sender_name: string;
  sender_phone: string;
  pickup_address: string;
  receiver_name: string;
  receiver_phone: string;
  dropoff_address: string;
  package_type: string;
  payment_method: string;
  item_payment_flow: string;
  estimated_item_amount: number;
  purchase_payment_status: string;
  order_amount: number;
  notes: string | null;
  pickup_latitude: number;
  pickup_longitude: number;
  dropoff_latitude: number;
  dropoff_longitude: number;
};

type BookingInsertRow = ValidatedBookingInput & {
  price: number;
  status: "Pending";
  customer_user_id: string;
};

type CreatedBooking = {
  id: number;
  booking_no: string;
  price: number;
  order_amount: number;
  total_amount: number;
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
const allowedItemPaymentFlows = new Set([
  "delivery_only",
  "merchant_direct",
  "prepaid_to_rider",
  "rider_advance_cod",
]);

function cleanText(value: unknown, maximumLength: number) {
  if (typeof value !== "string") {
    return "";
  }

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

function validateBookingInput(
  body: BookingPayload
):
  | {
      success: true;
      booking: ValidatedBookingInput;
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
  const itemPaymentFlow = cleanText(body.item_payment_flow || "delivery_only", 50);
  const notes = cleanText(body.notes, 1000);

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

  if (!allowedItemPaymentFlows.has(itemPaymentFlow)) {
    return { success: false, error: "Invalid item payment flow." };
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

  let orderAmount: number;

  try {
    orderAmount = normalizeOrderAmount(body.order_amount ?? 0);
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Invalid order amount.",
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
      item_payment_flow: itemPaymentFlow,
      estimated_item_amount: orderAmount,
      purchase_payment_status:
        itemPaymentFlow === "rider_advance_cod"
          ? "Awaiting Rider Consent"
          : "Not Required",
      order_amount: orderAmount,
      notes: notes || null,
      pickup_latitude: body.pickup_latitude,
      pickup_longitude: body.pickup_longitude,
      dropoff_latitude: body.dropoff_latitude,
      dropoff_longitude: body.dropoff_longitude,
    },
  };
}

async function sendTelegramNotification(
  booking: BookingInsertRow,
  totalAmount: number
) {
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
    `Order amount: ₱${booking.order_amount.toFixed(2)}`,
    `Delivery fee: ₱${booking.price.toFixed(2)}`,
    `TOTAL TO COLLECT: ₱${totalAmount.toFixed(2)}`,
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

export async function GET() {
  try {
    const authorization = await requireAdmin();

    if (!authorization.authorized) {
      return authorization.response;
    }

    const serverSupabase = await createServerClient();

    const { data, error } = await serverSupabase
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
    const authorization = await requireCustomer();

    if (!authorization.authorized) {
      return authorization.response;
    }

    const body = (await request.json()) as BookingPayload;
    const validation = validateBookingInput(body);

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

    const validated = validation.booking;

    const routeSummary = await getRoadRouteSummary(
      {
        latitude: validated.pickup_latitude,
        longitude: validated.pickup_longitude,
      },
      {
        latitude: validated.dropoff_latitude,
        longitude: validated.dropoff_longitude,
      }
    );

    const deliveryFee = calculateDeliveryFee(
      routeSummary.distanceKm
    );

    const bookingToInsert: BookingInsertRow = {
      ...validated,
      price: deliveryFee,
      status: "Pending",
      customer_user_id: authorization.userId,
    };

    const { data: createdBooking, error: insertError } =
      await supabaseAdmin
        .from("orders")
        .insert(bookingToInsert)
        .select(
          "id, booking_no, price, order_amount, total_amount"
        )
        .single<CreatedBooking>();

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
      await sendTelegramNotification(
        bookingToInsert,
        Number(createdBooking.total_amount)
      );
    } catch (telegramError) {
      console.error(
        "Telegram notification failed:",
        telegramError
      );
    }

    try {
      await createManyNotifications({
        notifications: [
          {
            orderId: createdBooking.id,
            bookingNo: createdBooking.booking_no,
            recipientType: "customer",
            recipientUserId: authorization.userId,
            notificationType: "booking_created",
            title: "Booking Confirmed",
            message: `Natanggap na ang booking ${createdBooking.booking_no}.`,
          },
          {
            orderId: createdBooking.id,
            bookingNo: createdBooking.booking_no,
            recipientType: "admin",
            notificationType: "new_booking",
            title: "New Customer Booking",
            message: `May bagong booking: ${createdBooking.booking_no}.`,
          },
          {
            orderId: createdBooking.id,
            bookingNo: createdBooking.booking_no,
            recipientType: "rider",
            notificationType: "new_available_order",
            title: "New Available Delivery",
            message: `May bagong delivery request: ${createdBooking.booking_no}.`,
            metadata: { href: "/rider/dashboard" },
          },
        ],
      });
    } catch (notificationError) {
      console.error("In-app notification failed:", notificationError);
    }

    return NextResponse.json(
      {
        success: true,
        booking_no: createdBooking.booking_no,
        pricing: {
          distance_km:
            Math.round(routeSummary.distanceKm * 100) / 100,
          duration_minutes: routeSummary.durationMinutes,
          delivery_fee: Number(createdBooking.price),
          order_amount: Number(createdBooking.order_amount),
          total_amount: Number(createdBooking.total_amount),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Booking POST API error:", error);

    const isRoutingError =
      error instanceof Error &&
      [
        "routing service",
        "road route",
        "route was found",
      ].some((keyword) =>
        error.message.toLowerCase().includes(keyword)
      );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown server error.",
      },
      {
        status: isRoutingError ? 502 : 500,
      }
    );
  }
}
