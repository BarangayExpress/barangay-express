# Barangay Express V10 Sprint 3 — Dispatcher Actions

## Added
- Compact dispatcher action bar inside the selected booking panel.
- Call assigned rider when a phone number is available.
- Call customer directly.
- Open tracking and booking chat.
- Copy pickup and drop-off addresses with feedback toast.
- Open pickup or drop-off in Google Maps.
- Open a Google Maps route from pickup to drop-off.

## Preserved
- Stable first-win dispatch.
- One active booking per rider.
- Existing database and API behavior.
- No SQL migration and no new package.

## QA checklist
1. Select an active booking.
2. Confirm the assigned rider is highlighted.
3. Test Call rider and Call customer on a device with calling support.
4. Test Copy pickup and Copy drop-off and paste the address elsewhere.
5. Test Pickup map, Drop-off map, and Open route.
6. Open Tracking & chat and confirm the correct booking loads.
7. Confirm realtime updates and the 15-second fallback refresh still work.
