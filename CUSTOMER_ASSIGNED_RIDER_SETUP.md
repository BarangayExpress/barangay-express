# Customer Assigned Rider Experience

No new SQL migration is required for this update.

## Included
- Assigned rider card remains visible after acceptance even when live GPS is not yet available.
- Rider name, phone, vehicle type, plate number, average rating, and review count.
- Call Rider action.
- Customer-to-rider booking chat inside the tracking page.
- Live/waiting GPS indicator.
- Existing live map, ETA, and progress timeline remain intact.

## Test
1. Run `npm run dev`.
2. Create a customer booking.
3. Accept it from a rider account.
4. Open the booking from the customer dashboard or `/track?booking=<BOOKING_NO>`.
5. Confirm the rider card appears immediately after acceptance.
6. Test Call Rider and Chat.
7. Start rider live location and confirm the status changes to live and the map appears.

The existing `booking-chat-system.sql` and review system must already be installed, as in the current V4 project.
