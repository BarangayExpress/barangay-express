# Barangay Express V10 — Sprint 2

## Dispatcher First Workspace

This release converts the Live Dispatch page from a long webpage into a compact desktop-style operations workspace.

## Improvements

- Fixed-height three-panel desktop layout
- Compact, internally scrollable dispatch queue
- Compact selected-booking details panel
- Mini live map inside the center workspace
- Internally scrollable rider fleet panel
- Assigned rider is highlighted for the selected booking
- Recent activity is limited to the latest five events
- Compact KPI row for Waiting, Active, Available, and GPS Live
- Responsive fallback remains available for smaller screens

## Business Logic

No dispatch or database logic was changed.

- Stable first-win acceptance remains active
- One active delivery per rider remains active
- No SQL migration
- No new npm dependency

## QA Checklist

1. Open `/dashboard/live-dispatch` at 100% browser zoom.
2. Confirm the whole desktop workspace fits within one screen or requires only minimal page scrolling.
3. Create several pending bookings and confirm only the Queue panel scrolls.
4. Click different bookings and confirm the center details update immediately.
5. Accept a booking using a rider account.
6. Confirm the assigned rider becomes highlighted in the Fleet panel.
7. Enable rider GPS and confirm the mini map displays the active rider.
8. Confirm the Events panel shows only the five latest events and scrolls internally.
9. Test at a narrow browser width and confirm the layout stacks normally.
10. Verify customer booking, rider acceptance, chat, wallet, and tracking still work.

## Rollback

Return to the previous committed V10 Sprint 1 version or restore the previous project ZIP. No database rollback is required.
