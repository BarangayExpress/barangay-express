# Rider Wallet and 15% Commission Setup

## Important

Do not run individual lines from the migration. Run the complete SQL file once.

## 1. Database migration

1. Open Supabase Dashboard.
2. Open **SQL Editor** and create a new query.
3. In VS Code, open `supabase/rider-wallet-commission-system.sql`.
4. Copy the complete file into Supabase SQL Editor.
5. Press **Run**.
6. The expected result is `Success. No rows returned`.

The migration is designed to preserve all existing riders and orders. Active
orders accepted before the migration can still be completed without a
retroactive commission.

## 2. Configure the top-up GCash account

1. Start the project with `npm run dev`.
2. Log in as admin.
3. Open `/dashboard/rider-wallets`, or click **Rider Wallets** in the admin header.
4. Enter the GCash account name, number, and minimum top-up.
5. Keep the recommended minimum top-up at `100`.

## 3. End-to-end test

Use a test rider and test customer.

1. Rider submits a ₱100 top-up and proof.
2. Admin opens **Rider Wallets** and approves it.
3. Confirm the rider available wallet becomes ₱100.
4. Create a booking with a ₱100 delivery fee.
5. Rider accepts it.
6. Confirm wallet shows ₱85 available and ₱15 reserved.
7. Cancel the booking while its status is `Accepted`.
8. Confirm wallet returns to ₱100 available and ₱0 reserved.
9. Create another ₱100 booking and complete the entire delivery.
10. Confirm wallet stays at ₱85 available, reserved returns to ₱0, and lifetime
    commission becomes ₱15.
11. Confirm the admin earned platform commission becomes ₱15.

## Wallet rules

- Commission is 15% of `orders.price`, with a ₱5 minimum.
- A commission is reserved atomically when a rider accepts an order.
- A rider cannot accept if the available balance is insufficient.
- Reserved commission becomes platform revenue only when the order is completed.
- Customer cancellation releases the full reserved commission.
- Repeated requests cannot duplicate top-ups or commissions.
- Riders have read-only access to their wallet records. All balance changes use
  protected server-side database functions.

## Before committing

Run:

```bash
npm run check
npm run build
git status --short
```

Do not commit `.env.local`, `node_modules`, or `.next`.
