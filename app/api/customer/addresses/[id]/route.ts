import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import {
  cleanCustomerText,
  isValidCoordinate,
  isValidPhilippineMobile,
} from "@/lib/customer";
import { requireCustomer } from "@/lib/require-role";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type AddressPayload = {
  label?: string;
  contact_name?: string;
  phone?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  is_default?: boolean;
};

function validateAddress(body: AddressPayload) {
  const label = cleanCustomerText(body.label, 40);
  const contactName = cleanCustomerText(body.contact_name, 120);
  const phone = cleanCustomerText(body.phone, 20);
  const address = cleanCustomerText(body.address, 500);

  if (!label || !contactName || !address) {
    return { success: false as const, error: "Complete all address fields." };
  }

  if (!isValidPhilippineMobile(phone)) {
    return {
      success: false as const,
      error: "Phone number must use the 09XXXXXXXXX format.",
    };
  }

  if (
    !isValidCoordinate(body.latitude, -90, 90) ||
    !isValidCoordinate(body.longitude, -180, 180)
  ) {
    return {
      success: false as const,
      error: "Choose a valid saved location on the map.",
    };
  }

  return {
    success: true as const,
    address: {
      label,
      contact_name: contactName,
      phone,
      address,
      latitude: body.latitude,
      longitude: body.longitude,
      is_default: body.is_default === true,
    },
  };
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const authorization = await requireCustomer();

    if (!authorization.authorized) {
      return authorization.response;
    }

    const { id } = await context.params;
    const body = (await request.json()) as AddressPayload;
    const validation = validateAddress(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    const supabaseAdmin = createAdminClient();

    if (validation.address.is_default) {
      const { error: clearDefaultError } = await supabaseAdmin
        .from("saved_addresses")
        .update({ is_default: false })
        .eq("customer_user_id", authorization.userId)
        .eq("is_default", true)
        .neq("id", id);

      if (clearDefaultError) {
        throw new Error(clearDefaultError.message);
      }
    }

    const { data, error } = await supabaseAdmin
      .from("saved_addresses")
      .update(validation.address)
      .eq("id", id)
      .eq("customer_user_id", authorization.userId)
      .select(
        "id, label, contact_name, phone, address, latitude, longitude, is_default, created_at, updated_at"
      )
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return NextResponse.json(
        { success: false, error: "Saved address not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, address: data });
  } catch (error) {
    console.error("Saved address PATCH error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to update address.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const authorization = await requireCustomer();

    if (!authorization.authorized) {
      return authorization.response;
    }

    const { id } = await context.params;
    const supabaseAdmin = createAdminClient();
    const { data, error } = await supabaseAdmin
      .from("saved_addresses")
      .delete()
      .eq("id", id)
      .eq("customer_user_id", authorization.userId)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return NextResponse.json(
        { success: false, error: "Saved address not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Saved address DELETE error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to delete address.",
      },
      { status: 500 }
    );
  }
}
