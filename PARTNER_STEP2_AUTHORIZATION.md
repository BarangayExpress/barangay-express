# Partner App — Step 2 Authorization Foundation

This step adds the secure server-side authorization layer for Barangay Express Partner businesses.

## Added files

- `lib/partner-auth.ts`
- `app/api/partner/me/route.ts`
- `app/api/partner/businesses/[businessId]/route.ts`

## Architecture rule

`profiles.role` remains unchanged (`customer`, `rider`, `admin`). Partner access is granted through `business_members`, allowing one normal Barangay Express account to also own/manage/work for one or more businesses.

## Endpoints

### `GET /api/partner/me`

Requires a valid, active Barangay Express login. Returns account data and all active business memberships. A valid user with zero memberships receives `has_partner_access: false`; this will power the future "Apply as Partner" flow.

### `GET /api/partner/businesses/:businessId`

Requires the logged-in user to be an active `owner`, `manager`, or `staff` member of that exact business. Returns the business and its operating hours.

## Security

The Migration 001 Partner tables are not directly accessible by browser clients. These API routes first validate the Supabase session, then use the server-only service-role client for protected database reads.

No existing orders, rider dispatch, wallet, commission, payment, chat, notification, or customer flow is modified in Step 2.
