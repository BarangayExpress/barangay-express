# Barangay Express Admin Dashboard V5 — Sprint 1

This release introduces the reusable admin shell without changing booking, rider, wallet, payment, chat, map, or authentication logic.

## Included
- Fixed desktop sidebar and mobile slide-over navigation
- Sticky top bar with global order search, refresh, and notifications
- New dashboard overview with compact KPI cards
- Recent orders and quick actions panels
- Existing Orders, Payments, Operations, Rider Map, Reviews, and Analytics workspaces retained
- Responsive spacing and consistent design tokens

## Setup
No new SQL migration is required. Restore `.env.local` and `node_modules`, then run `npm run dev`.
