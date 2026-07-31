export const BASE_FARE = 49;
export const INCLUDED_DISTANCE_KM = 2;
export const EXTRA_KM_RATE = 10;

export function calculateDeliveryFee(distanceKm: number) {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    throw new Error("Invalid route distance.");
  }

  const extraKilometers = Math.max(
    0,
    Math.ceil(distanceKm - INCLUDED_DISTANCE_KM)
  );

  return BASE_FARE + extraKilometers * EXTRA_KM_RATE;
}

export function normalizeOrderAmount(value: unknown) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Invalid order amount.");
  }

  if (amount > 100_000) {
    throw new Error("Order amount must not exceed ₱100,000.");
  }

  return Math.round(amount * 100) / 100;
}

export function calculateTotalAmount(
  deliveryFee: number,
  orderAmount: number
) {
  if (
    !Number.isFinite(deliveryFee) ||
    deliveryFee < 0 ||
    !Number.isFinite(orderAmount) ||
    orderAmount < 0
  ) {
    throw new Error("Invalid payment amounts.");
  }

  return (
    Math.round((deliveryFee + orderAmount) * 100) / 100
  );
}