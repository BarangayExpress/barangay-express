import { createAdminClient } from "@/lib/supabase-admin";

export type NotificationRecipientType =
  | "customer"
  | "rider"
  | "admin";

type NotificationMetadata = Record<
  string,
  string | number | boolean | null
>;

type CreateNotificationInput = {
  orderId?: number | null;
  bookingNo?: string | null;

  recipientType: NotificationRecipientType;
  recipientUserId?: string | null;

  notificationType: string;
  title: string;
  message: string;

  metadata?: NotificationMetadata;
};

type CreateManyNotificationsInput = {
  notifications: CreateNotificationInput[];
};

export async function createNotification(
  input: CreateNotificationInput
) {
  const supabaseAdmin = createAdminClient();

  const { data, error } = await supabaseAdmin
    .from("notifications")
    .insert({
      order_id: input.orderId ?? null,
      booking_no: input.bookingNo ?? null,
      recipient_type: input.recipientType,
      recipient_user_id: input.recipientUserId ?? null,
      notification_type: input.notificationType,
      title: input.title,
      message: input.message,
      metadata: input.metadata ?? {},
    })
    .select(
      `
      id,
      order_id,
      booking_no,
      recipient_type,
      recipient_user_id,
      notification_type,
      title,
      message,
      metadata,
      read_at,
      created_at
      `
    )
    .single();

  if (error) {
    console.error("Create notification error:", error);
    throw new Error(error.message);
  }

  return data;
}

export async function createManyNotifications(
  input: CreateManyNotificationsInput
) {
  if (input.notifications.length === 0) {
    return [];
  }

  const supabaseAdmin = createAdminClient();

  const rows = input.notifications.map((notification) => ({
    order_id: notification.orderId ?? null,
    booking_no: notification.bookingNo ?? null,
    recipient_type: notification.recipientType,
    recipient_user_id:
      notification.recipientUserId ?? null,
    notification_type: notification.notificationType,
    title: notification.title,
    message: notification.message,
    metadata: notification.metadata ?? {},
  }));

  const { data, error } = await supabaseAdmin
    .from("notifications")
    .insert(rows)
    .select(
      `
      id,
      order_id,
      booking_no,
      recipient_type,
      recipient_user_id,
      notification_type,
      title,
      message,
      metadata,
      read_at,
      created_at
      `
    );

  if (error) {
    console.error("Create notifications error:", error);
    throw new Error(error.message);
  }

  return data ?? [];
}
