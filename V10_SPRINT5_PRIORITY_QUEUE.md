# Barangay Express V10 — Sprint 5 Priority Queue

## What changed

- Pending bookings are now sorted by operational priority, then longest waiting time.
- High priority: pending for 10+ minutes, or food waiting for 5+ minutes.
- Medium priority: pending for 5+ minutes, or a newly received food order.
- Normal priority: all other new pending orders.
- Active orders remain visible after pending orders.
- Queue cards show both priority and waiting time.
- The queue header shows the oldest waiting pending booking.
- Sound hotfix function order is included.

## Unchanged

- First-win rider acceptance
- One active delivery per rider
- Wallet and commission reservation
- Database schema and SQL
- Customer and rider workflows

## QA checklist

1. Open `/dashboard/live-dispatch`.
2. Confirm pending orders appear above active orders.
3. Confirm the longest-waiting high-priority pending order is first.
4. Confirm food bookings receive at least Medium priority.
5. Confirm a food booking waiting at least 5 minutes becomes High priority.
6. Confirm a non-food booking becomes Medium at 5 minutes and High at 10 minutes.
7. Confirm accepted orders still appear under pending orders.
8. Turn Sound on and confirm the test tone works.
9. Create a new booking and confirm the realtime alert and queue update.
