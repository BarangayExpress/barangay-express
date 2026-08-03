-- Barangay Express: controlled Rider Advance / COD
-- Run this complete file once after rider-wallet-commission-system.sql.

begin;

create table if not exists public.rider_advance_settings (
  id smallint primary key default 1 check (id = 1),
  is_enabled boolean not null default true,
  per_booking_limit numeric(12,2) not null default 500 check (per_booking_limit >= 0),
  per_rider_exposure_limit numeric(12,2) not null default 1000 check (per_rider_exposure_limit >= 0),
  max_active_advances integer not null default 1 check (max_active_advances between 0 and 10),
  new_customer_limit numeric(12,2) not null default 300 check (new_customer_limit >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.rider_advance_settings (id) values (1)
on conflict (id) do nothing;

alter table public.orders
  add column if not exists item_payment_flow text not null default 'delivery_only',
  add column if not exists estimated_item_amount numeric(12,2) not null default 0,
  add column if not exists actual_item_amount numeric(12,2),
  add column if not exists purchase_payment_status text not null default 'Not Required',
  add column if not exists rider_advance_amount numeric(12,2),
  add column if not exists rider_advance_consented_at timestamptz,
  add column if not exists rider_advance_paid_at timestamptz;

update public.orders
set estimated_item_amount = greatest(coalesce(order_amount, 0), 0)
where estimated_item_amount = 0 and coalesce(order_amount, 0) > 0;

alter table public.orders drop constraint if exists orders_item_payment_flow_check;
alter table public.orders add constraint orders_item_payment_flow_check check (
  item_payment_flow in ('delivery_only','merchant_direct','prepaid_to_rider','rider_advance_cod')
);
alter table public.orders drop constraint if exists orders_purchase_payment_status_check;
alter table public.orders add constraint orders_purchase_payment_status_check check (
  purchase_payment_status in (
    'Not Required','Awaiting Rider Consent','Advance Approved',
    'Awaiting Customer Payment','Payment Received','Cancelled'
  )
);

create index if not exists orders_rider_advance_exposure_idx
on public.orders (assigned_rider, purchase_payment_status)
where item_payment_flow = 'rider_advance_cod';

create or replace function public.rider_accept_advance(
  p_order_id bigint,
  p_rider_id uuid,
  p_actual_amount numeric
)
returns setof public.orders
language plpgsql security definer set search_path = public
as $$
declare
  order_row public.orders;
  settings_row public.rider_advance_settings;
  exposure numeric(12,2);
  active_advances integer;
  completed_customer_orders integer;
  effective_limit numeric(12,2);
begin
  select * into order_row from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if order_row.assigned_rider <> p_rider_id::text then raise exception 'ORDER_NOT_ASSIGNED_TO_RIDER'; end if;
  if order_row.status not in ('Accepted','Heading to Pickup') then raise exception 'ADVANCE_STATUS_NOT_ALLOWED'; end if;
  if order_row.item_payment_flow <> 'rider_advance_cod' then raise exception 'NOT_RIDER_ADVANCE'; end if;
  if order_row.purchase_payment_status <> 'Awaiting Rider Consent' then raise exception 'ADVANCE_ALREADY_DECIDED'; end if;
  if p_actual_amount is null or p_actual_amount <= 0 then raise exception 'INVALID_ACTUAL_AMOUNT'; end if;

  select * into settings_row from public.rider_advance_settings where id = 1;
  if not settings_row.is_enabled then raise exception 'RIDER_ADVANCE_DISABLED'; end if;

  select count(*) into completed_customer_orders from public.orders
  where customer_user_id = order_row.customer_user_id and status = 'Completed';
  effective_limit := case when completed_customer_orders = 0
    then least(settings_row.per_booking_limit, settings_row.new_customer_limit)
    else settings_row.per_booking_limit end;
  if p_actual_amount > effective_limit then raise exception 'PER_BOOKING_ADVANCE_LIMIT'; end if;

  select coalesce(sum(rider_advance_amount), 0), count(*)
  into exposure, active_advances from public.orders
  where assigned_rider = p_rider_id::text
    and item_payment_flow = 'rider_advance_cod'
    and status not in ('Completed','Cancelled')
    and purchase_payment_status in ('Advance Approved','Awaiting Customer Payment');
  if active_advances >= settings_row.max_active_advances then raise exception 'ACTIVE_ADVANCE_LIMIT'; end if;
  if exposure + p_actual_amount > settings_row.per_rider_exposure_limit then raise exception 'RIDER_EXPOSURE_LIMIT'; end if;

  return query update public.orders
  set actual_item_amount = round(p_actual_amount, 2),
      rider_advance_amount = round(p_actual_amount, 2),
      purchase_payment_status = 'Advance Approved',
      rider_advance_consented_at = now()
  where id = p_order_id returning *;
end;
$$;

create or replace function public.rider_mark_advance_payment_received(
  p_order_id bigint,
  p_rider_id uuid
)
returns setof public.orders
language plpgsql security definer set search_path = public
as $$
begin
  return query update public.orders
  set purchase_payment_status = 'Payment Received', rider_advance_paid_at = now()
  where id = p_order_id and assigned_rider = p_rider_id::text
    and item_payment_flow = 'rider_advance_cod'
    and purchase_payment_status in ('Advance Approved','Awaiting Customer Payment')
  returning *;
  if not found then raise exception 'ADVANCE_PAYMENT_NOT_PENDING'; end if;
end;
$$;

-- Preserve wallet behavior, but prevent completion while Rider Advance is unpaid.
create or replace function public.assert_rider_advance_paid(p_order_id bigint, p_rider_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare order_row public.orders;
begin
  select * into order_row from public.orders where id = p_order_id;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if order_row.assigned_rider <> p_rider_id::text then raise exception 'ORDER_NOT_ASSIGNED_TO_RIDER'; end if;
  if order_row.item_payment_flow = 'rider_advance_cod'
     and order_row.purchase_payment_status <> 'Payment Received' then
    raise exception 'RIDER_ADVANCE_PAYMENT_NOT_RECEIVED';
  end if;
end;
$$;

alter table public.rider_advance_settings enable row level security;
grant select on public.rider_advance_settings to authenticated;
revoke execute on function public.rider_accept_advance(bigint, uuid, numeric) from public, anon, authenticated;
revoke execute on function public.rider_mark_advance_payment_received(bigint, uuid) from public, anon, authenticated;
revoke execute on function public.assert_rider_advance_paid(bigint, uuid) from public, anon, authenticated;
grant execute on function public.rider_accept_advance(bigint, uuid, numeric) to service_role;
grant execute on function public.rider_mark_advance_payment_received(bigint, uuid) to service_role;
grant execute on function public.assert_rider_advance_paid(bigint, uuid) to service_role;

commit;
