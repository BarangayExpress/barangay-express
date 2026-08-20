# Barangay Express Partner — Step 3 Application Flow

New additive files:

- `app/api/partner/applications/route.ts`
- `app/partner/apply/page.tsx`
- `app/partner/apply/PartnerApplicationForm.tsx`
- `PARTNER_STEP3_APPLICATION.md`

No existing V10 source file is replaced in this step.

## Flow

1. Signed-in customer opens `/partner/apply`.
2. Existing owned businesses/applications are listed.
3. Customer submits a business application.
4. `POST /api/partner/applications` validates the account and input.
5. A `businesses` row is created with:
   - `approval_status = pending`
   - `store_status = closed`
   - `is_visible = false`
6. Migration 001 database triggers automatically create:
   - owner `business_members` membership
   - seven default `business_hours` rows
7. An admin notification is created on a best-effort basis.

Partner access remains separate from `profiles.role`.
