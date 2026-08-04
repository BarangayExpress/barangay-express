# Barangay Express Admin Live Operations Dashboard

This update adds a compact real-time operations layer to the existing V5 admin dashboard.

## Included

- Live dispatch board for active deliveries
- Rider availability panel (online, busy, offline)
- Recent activity feed connected to the existing activity log
- Seven-day revenue activity chart
- Mini field-view summary using existing live rider tracking data
- Existing orders, payments, map, reviews, analytics, wallet, and rider logic retained

## Setup

No new SQL migration or package is required.

1. Restore `.env.local` and `node_modules` after replacing the project folder.
2. Run `npm run dev`.
3. Open `/dashboard`.

The rider panel reads from the existing `/api/admin/riders` endpoint and updates through Supabase Realtime with a 15-second fallback refresh.
