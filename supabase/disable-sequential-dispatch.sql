-- Barangay Express V4: return to stable broadcast dispatch
-- All online and available riders can see pending orders.
-- First successful accept wins; each rider can have only one active delivery.

begin;

-- Remove the optional sequential/private-offer engine.
drop function if exists public.advance_smart_dispatch(bigint, integer);
drop table if exists public.dispatch_candidates cascade;
drop table if exists public.dispatch_jobs cascade;

-- Restore pending bookings as unassigned so they remain visible to all eligible riders.
update public.orders
set assigned_rider = null
where status = 'Pending';

commit;
