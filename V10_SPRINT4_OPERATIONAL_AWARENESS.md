# Barangay Express V10 Sprint 4 — Operational Awareness

## Added
- Optional browser sound alerts for newly created and cancelled orders.
- Road-route ETA to pickup and pickup-to-drop-off for the selected active booking.
- More readable live activity wording and event icons.
- Map legend for rider, pickup, and drop-off markers.
- More compact queue cards and icon-assisted dispatcher actions.

## Safety
- No SQL migration.
- No new npm package.
- First-win rider acceptance remains unchanged.
- Admin assignment/reassignment was intentionally not added because accepting an order must continue through the rider workflow so wallet commission reservation stays safe.

## QA
1. Open `/dashboard/live-dispatch`.
2. Click **Sound off** once to enable browser sound.
3. Create a new test booking and confirm a short alert plays.
4. Cancel a test booking and confirm the lower alert tone plays.
5. Select an active order with rider GPS and verify ETA cards appear.
6. Confirm route time gracefully shows `—` if OSRM is unavailable.
7. Verify action buttons, map legend, queue selection, fleet highlight, and realtime refresh still work.
