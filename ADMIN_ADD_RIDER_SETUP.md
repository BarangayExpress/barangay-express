# Admin Add Rider

The Multi-Rider Management page now has a **+ Add Rider** button.

## Required environment variable

The server must have the existing Supabase service-role key:

```env
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Never expose this key in a variable beginning with `NEXT_PUBLIC_`.

## What happens when Admin creates a rider

1. A confirmed Supabase Authentication user is created.
2. The `profiles` record is set to role `rider`.
3. A matching `rider_profiles` record is created.
4. The rider wallet is created by the existing database trigger.
5. The rider starts Offline and may log in with the email and temporary password.

No additional SQL migration is required for this feature if the previous customer-auth, wallet, and multi-rider SQL files have already been run.
