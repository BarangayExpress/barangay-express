# Barangay Express V10 — Sprint 1

## Operations Intelligence: Live Dispatch Workspace

### Added
- Dedicated `/dashboard/live-dispatch` workspace.
- Three-panel operations layout: queue, selected booking/map, and fleet/activity.
- Realtime order, rider, and activity refresh.
- Waiting-time urgency colors for pending bookings.
- Search and pending/active queue filters.
- Customer, receiver, route, payment, notes, call, tracking, and full-order shortcuts.
- Existing `AdminLiveMap` integration for active rider GPS.
- Fleet availability and live operations feed.

### Preserved
- Stable first-win dispatch.
- One active booking per rider.
- Existing rider, customer, wallet, chat, payment, and tracking logic.
- No SQL migration and no new npm dependency.

### QA
1. Open `/dashboard/live-dispatch` as admin.
2. Confirm pending and active orders appear in the queue.
3. Select an order and verify details.
4. Turn on an active rider's GPS and verify the map marker.
5. Accept a pending booking and confirm realtime movement from pending to active.
6. Confirm the rider dashboard still uses first-win acceptance.
