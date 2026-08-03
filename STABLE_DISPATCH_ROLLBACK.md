# Stable Broadcast Dispatch

This version removes the private countdown and sequential nearest-rider offers.

## Behavior

- Every active rider who is Online and has no active delivery can see pending bookings.
- The first rider whose Accept request succeeds gets the booking.
- The booking disappears from all other rider dashboards after acceptance.
- Each rider can handle a maximum of one active delivery.
- A pending booking stays visible until accepted or cancelled.

## Setup

1. Replace the project with this ZIP.
2. Restore `.env.local` and `node_modules`.
3. Run `supabase/disable-sequential-dispatch.sql` once in Supabase SQL Editor.
4. Restart with `npm run dev`.
5. Hard-refresh both rider pages.
