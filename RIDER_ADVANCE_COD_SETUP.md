# Rider Advance / COD Setup

This milestone separates the delivery fee from the item/store payment.

## Payment flows

- `delivery_only` — no item purchase.
- `merchant_direct` — customer pays the merchant using the merchant's QR or payment link.
- `prepaid_to_rider` — customer sends the item payment before purchase.
- `rider_advance_cod` — rider voluntarily advances the actual item cost and collects it from the customer upon delivery.

The 15% platform commission continues to use `orders.price` (delivery fee) only. Item cost and rider advance are never included in the commission base or rider wallet.

## Install

1. Confirm that `supabase/rider-wallet-commission-system.sql` was already run successfully.
2. Open Supabase SQL Editor.
3. Copy and run the complete contents of `supabase/rider-advance-cod-system.sql` once.
4. Restart the Next.js development server with `npm run dev`.
5. Create a new test booking. Old bookings intentionally remain `delivery_only`.

## Default safety limits

- Rider Advance enabled: yes
- Per booking: PHP 500
- New customer: PHP 300 until the customer has one completed booking
- Total active exposure per rider: PHP 1,000
- Maximum simultaneous advances per rider: 1

The database enforces these limits atomically. A browser/UI change cannot bypass them.

To change the limits temporarily in Supabase SQL Editor:

```sql
update public.rider_advance_settings
set per_booking_limit = 500,
    new_customer_limit = 300,
    per_rider_exposure_limit = 1000,
    max_active_advances = 1,
    is_enabled = true,
    updated_at = now()
where id = 1;
```

## Correct test flow

1. Customer selects `Rider Advance / COD` and enters an estimated item cost.
2. Rider accepts the delivery. Only the delivery-fee commission is reserved from the commission wallet.
3. Rider checks the store price/receipt and selects **Approve Actual Advance**.
4. Rider enters the actual cost and explicitly consents.
5. Rider completes the delivery workflow and collects the actual item cost plus the delivery fee.
6. Rider selects **Confirm Payment Received**.
7. Only then can the rider complete the booking.

If the customer/admin cancels the booking, it no longer counts as active exposure. The recorded amount and consent remain for audit history.

## Next milestone

Add secure image attachments to booking chat for merchant QR, receipt, and proof of item payment. The database/payment state in this milestone is already prepared for that workflow.
