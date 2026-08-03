# Multi-Rider Setup

## 1. Run the SQL migration
Open Supabase → SQL Editor and run:

`supabase/multi-rider-system.sql`

This adds online/offline state, timestamps, indexes, and the secure availability RPC.

## 2. Existing rider accounts
Existing rows in `rider_profiles` will default to offline. Riders must press **Go Online** in the Rider Dashboard before accepting new bookings.

## 3. Add another rider
1. Supabase → Authentication → Users → Add user.
2. Copy the new user's UUID.
3. Add/update the matching row in `profiles`:

```sql
insert into public.profiles (id, full_name, role, is_active)
values ('RIDER_USER_UUID', 'Rider Name', 'rider', true)
on conflict (id) do update
set full_name = excluded.full_name,
    role = 'rider',
    is_active = true;
```

4. Add the rider profile:

```sql
insert into public.rider_profiles
  (id, full_name, phone, vehicle_type, plate_number, is_active, is_online)
values
  ('RIDER_USER_UUID', 'Rider Name', '09XXXXXXXXX', 'Motorcycle', 'ABC 1234', true, false)
on conflict (id) do update
set full_name = excluded.full_name,
    phone = excluded.phone,
    vehicle_type = excluded.vehicle_type,
    plate_number = excluded.plate_number,
    is_active = true;
```

## 4. Admin controls
Open `/dashboard/riders` or press **Manage Riders** from the Admin Dashboard.

The admin can see online riders, active deliveries, completed deliveries, and activate/deactivate rider accounts.

## Multi-rider acceptance rules
- Rider must be active and online.
- Rider can have only one active delivery.
- Pending GCash orders still require admin payment verification.
- The existing atomic `accept_order_with_commission` RPC remains the final lock, so the first rider to accept wins.
