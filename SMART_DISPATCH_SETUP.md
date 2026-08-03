# Barangay Express V4 Smart Dispatch Setup

1. Run `supabase/multi-rider-system.sql` again in Supabase SQL Editor. It is safe to rerun and now enables realtime changes for `orders`.
2. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only in `.env.local`.
3. Start the app with `npm run dev`.
4. Open two different browser profiles and log in as two riders.
5. Set both riders Online and click `Enable Sound` once in each browser (browsers require a user click before audio can play).
6. Create a customer booking. Both online riders should see it immediately and hear an alert.
7. Accept from one rider. The atomic database function makes the first successful rider win; the order disappears from the other rider.
8. The customer tracking page displays the assigned rider name, vehicle, plate number, call button, live location and ETA/map information.

Note: The 30-second nearest-rider auto-offer is intentionally not enabled yet. The current release uses the safer open-order board plus first-rider-wins. Nearest-rider sequencing requires a background dispatcher and offer-expiration table, which should be added only after this two-rider test is stable.
