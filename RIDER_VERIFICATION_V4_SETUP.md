# Barangay Express V4 Rider Verification

1. Run `supabase/rider-verification-v4.sql` in Supabase SQL Editor.
2. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only in `.env.local`.
3. Restart with `npm run dev`.
4. Submit a test application at `/apply-rider`.
5. Review documents at `/dashboard/rider-applications`.

## NBI policy
- NBI Clearance is required for a first application.
- Active hired riders do not need recurring NBI renewal.
- A returning rider who reapplies must submit a fresh NBI Clearance.
- Admin may still request a new specific document after a serious incident or compliance need.

## Storage
Documents are stored in the private `rider-documents` bucket. Admin viewing uses signed URLs that expire after 10 minutes.
