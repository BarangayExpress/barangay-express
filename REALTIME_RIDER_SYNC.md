# Realtime Rider Status Sync

## Supabase
Run the complete updated file below in Supabase SQL Editor:

`supabase/multi-rider-system.sql`

It is safe to run again. The final block adds `rider_profiles` to the Supabase Realtime publication only when needed.

## Test
1. Keep `/dashboard/riders` open in the admin browser.
2. In another browser, open `/rider/dashboard`.
3. Press **Go Online** or **Go Offline**.
4. The admin status should update immediately. A five-second automatic refresh is included as fallback.
