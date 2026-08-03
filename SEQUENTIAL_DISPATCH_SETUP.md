# Sequential Nearest-Rider Dispatch

1. Run `supabase/multi-rider-system.sql` again in Supabase SQL Editor.
2. Restart the app with `npm run dev`.
3. Keep rider live location enabled and set riders Online.
4. Create a booking with a valid pickup map pin.

The system ranks online riders using their latest GPS location. Rider #1 receives a private 20-second offer. If it expires, the next eligible rider receives it. Only the rider holding the active offer can accept.

Riders whose GPS has not updated recently are ranked after riders with fresh GPS. If pickup coordinates are missing, the system falls back to online order rather than true distance ranking.
