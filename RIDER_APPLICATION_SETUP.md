# Rider Application Setup

1. Run `supabase/rider-application-system.sql` once in Supabase SQL Editor.
2. Keep `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` without the `NEXT_PUBLIC_` prefix.
3. Start the app with `npm run dev`.
4. Public application page: `/apply-rider`
5. Admin review page: `/dashboard/rider-applications`
6. On approval, copy the one-time temporary password and give it securely to the rider.
