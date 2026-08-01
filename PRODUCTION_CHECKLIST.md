# Barangay Express Production Checklist

## Required environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TELEGRAM_BOT_TOKEN` (optional if Telegram alerts are disabled)
- `TELEGRAM_CHAT_ID` (optional if Telegram alerts are disabled)

Never expose `SUPABASE_SERVICE_ROLE_KEY` in browser code and never prefix it with `NEXT_PUBLIC_`.

## Before every deployment

1. Run `npm ci`.
2. Run `npm run check`.
3. Run `npm run build` in the deployment environment.
4. Confirm `/api/health` returns HTTP 200 and `status: "ok"`.
5. Test customer login, booking, tracking, and saved addresses.
6. Test GCash proof submission and admin approval.
7. Test rider acceptance, status updates, live location, and proof of delivery.
8. Confirm customer, rider, and admin notifications.

## Supabase production checks

- Email confirmation is enabled for customers.
- RLS is enabled on user-owned tables.
- Admin and service-role keys exist only in server environment variables.
- `profiles.is_active` is enforced by every protected API.
- Storage buckets restrict upload type and size.
- Database backups and point-in-time recovery match the selected Supabase plan.

## Hosting checks

- HTTPS is active.
- Production domain is added to Supabase Auth Site URL and Redirect URLs.
- Health checks use `/api/health`.
- Logs and failed requests are reviewed after deployment.
- Test on Android Chrome, iPhone Safari, and a desktop browser.
