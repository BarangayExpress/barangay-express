-- Barangay Express: Rider Wallet, Manual GCash Top-up, and Commission System
-- Run this complete file once in Supabase SQL Editor.

begin;

create extension if not exists pgcrypto;

create table if not exists public.wallet_settings (
  id smallint primary key default 1 check (id = 1),
  commission_rate numeric(5,4) not null default 0.1500
    check (commission_rate >= 0 and commission_rate <= 1),
  minimum_commission numeric(12,
  2) not null default 5.00
    check (minimum_commission >= 0),
  minimum_topup numeric(12,2) not null default 100.00
    check (minimum_topup > 0),
  topup_gcash_name text,
  topup_gcash_number text,
  topup_qr_path text,
  wallet_enabled_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.wallet_settings (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.rider_wallets (
  rider_id uuid primary key references auth.users(id) on delete restrict,
  available_balance numeric(12,2) not null default 0 check (available_balance >= 0),
  reserved_balance numeric(12,2) not null default 0 check (reserved_balance >= 0),
  lifetime_topups numeric(12,2) not null default 0 check (lifetime_topups >= 0),
  lifetime_commission numeric(12,2) not null default 0 check (lifetime_commission >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rider_topup_requests (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references auth.users(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null default 'GCash' check (payment_method = 'GCash'),
  reference_number text not null,
  proof_path text not null,
  status text not null default 'Pending'
    check (status in ('Pending', 'Approved', 'Rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_note text,
  constraint rider_topup_reference_not_blank
    check (char_length(btrim(reference_number)) between 6 and 80)
);

create unique index if not exists rider_topup_reference_unique_idx
  on public.rider_topup_requests (lower(btrim(reference_number)));
create index if not exists rider_topup_rider_submitted_idx
  on public.rider_topup_requests (rider_id, submitted_at desc);
create index if not exists rider_topup_pending_idx
  on public.rider_topup_requests (submitted_at)
  where status = 'Pending';

create table if not exists public.order_commissions (
  id uuid primary key default gen_random_uuid(),
  order_id bigint not null references public.orders(id) on delete restrict,
  rider_id uuid not null references auth.users(id) on delete restrict,
  commission_rate numeric(5,4) not null check (commission_rate >= 0 and commission_rate <= 1),
  minimum_commission numeric(12,2) not null check (minimum_commission >= 0),
  commission_base numeric(12,2) not null check (commission_base >= 0),
  commission_amount numeric(12,2) not null check (commission_amount >= 0),
  status text not null default 'Reserved'
    check (status in ('Reserved', 'Earned', 'Released')),
  reserved_at timestamptz not null default now(),
  earned_at timestamptz,
  released_at timestamptz,
  release_reason text,
  unique (order_id)
);

create index if not exists order_commissions_rider_status_idx
  on public.order_commissions (rider_id, status, reserved_at desc);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references auth.users(id) on delete restrict,
  transaction_type text not null
    check (transaction_type in (
      'Topup', 'Commission Reserved', 'Commission Earned',
      'Commission Released', 'Admin Credit', 'Admin Debit'
    )),
  available_change numeric(12,2) not null default 0,
  reserved_change numeric(12,2) not null default 0,
  available_balance_after numeric(12,2) not null check (available_balance_after >= 0),
  reserved_balance_after numeric(12,2) not null check (reserved_balance_after >= 0),
  order_id bigint references public.orders(id) on delete restrict,
  topup_request_id uuid references public.rider_topup_requests(id) on delete restrict,
  idempotency_key text not null,
  description text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (idempotency_key)
);

create index if not exists wallet_transactions_rider_created_idx
  on public.wallet_transactions (rider_id, created_at desc);

insert into public.rider_wallets (rider_id)
select id from public.profiles where role = 'rider'
on conflict (rider_id) do nothing;

create or replace function public.create_rider_wallet_on_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'rider' then
    insert into public.rider_wallets (rider_id)
    values (new.id)
    on conflict (rider_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists create_rider_wallet_after_profile on public.profiles;
create trigger create_rider_wallet_after_profile
after insert or update of role on public.profiles
for each row execute function public.create_rider_wallet_on_profile();

create or replace function public.approve_rider_topup(
  p_request_id uuid,
  p_admin_id uuid,
  p_review_note text default null
)
returns public.rider_topup_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.rider_topup_requests;
  wallet_row public.rider_wallets;
begin
  select * into request_row
  from public.rider_topup_requests
  where id = p_request_id
  for update;

  if not found then raise exception 'TOPUP_NOT_FOUND'; end if;
  if request_row.status <> 'Pending' then raise exception 'TOPUP_ALREADY_REVIEWED'; end if;

  insert into public.rider_wallets (rider_id)
  values (request_row.rider_id)
  on conflict (rider_id) do nothing;

  update public.rider_wallets
  set available_balance = available_balance + request_row.amount,
      lifetime_topups = lifetime_topups + request_row.amount,
      updated_at = now()
  where rider_id = request_row.rider_id
  returning * into wallet_row;

  update public.rider_topup_requests
  set status = 'Approved', reviewed_at = now(), reviewed_by = p_admin_id,
      review_note = nullif(btrim(coalesce(p_review_note, '')), '')
  where id = p_request_id
  returning * into request_row;

  insert into public.wallet_transactions (
    rider_id, transaction_type, available_change, reserved_change,
    available_balance_after, reserved_balance_after, topup_request_id,
    idempotency_key, description, created_by
  ) values (
    request_row.rider_id, 'Topup', request_row.amount, 0,
    wallet_row.available_balance, wallet_row.reserved_balance, request_row.id,
    'topup:' || request_row.id::text, 'Approved manual GCash top-up', p_admin_id
  );

  return request_row;
end;
$$;

create or replace function public.reject_rider_topup(
  p_request_id uuid,
  p_admin_id uuid,
  p_review_note text
)
returns public.rider_topup_requests
language plpgsql
security definer
set search_path = public
as $$
declare request_row public.rider_topup_requests;
begin
  select * into request_row from public.rider_topup_requests
  where id = p_request_id for update;
  if not found then raise exception 'TOPUP_NOT_FOUND'; end if;
  if request_row.status <> 'Pending' then raise exception 'TOPUP_ALREADY_REVIEWED'; end if;
  if char_length(btrim(coalesce(p_review_note, ''))) < 3 then
    raise exception 'REJECTION_REASON_REQUIRED';
  end if;
  update public.rider_topup_requests
  set status = 'Rejected', reviewed_at = now(), reviewed_by = p_admin_id,
      review_note = left(btrim(p_review_note), 500)
  where id = p_request_id returning * into request_row;
  return request_row;
end;
$$;

create or replace function public.accept_order_with_commission(
  p_order_id bigint,
  p_rider_id uuid
)
returns setof public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  wallet_row public.rider_wallets;
  settings_row public.wallet_settings;
  commission_value numeric(12,2);
  active_count integer;
begin
  select * into order_row from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if coalesce(order_row.status, 'Pending') <> 'Pending' or order_row.assigned_rider is not null then
    raise exception 'ORDER_ALREADY_ACCEPTED';
  end if;
  if order_row.payment_method = 'GCash' and coalesce(order_row.payment_status, '') <> 'Paid' then
    raise exception 'GCASH_PAYMENT_NOT_VERIFIED';
  end if;

  select count(*) into active_count from public.orders
  where assigned_rider = p_rider_id::text
    and status in ('Accepted','Heading to Pickup','Picked Up','In Transit','Delivered');
  if active_count >= 1 then raise exception 'ACTIVE_ORDER_LIMIT'; end if;

  select * into settings_row from public.wallet_settings where id = 1;
  commission_value := greatest(
    round(greatest(coalesce(order_row.price, 0), 0) * settings_row.commission_rate, 2),
    settings_row.minimum_commission
  );

  insert into public.rider_wallets (rider_id) values (p_rider_id)
  on conflict (rider_id) do nothing;
  select * into wallet_row from public.rider_wallets
  where rider_id = p_rider_id for update;
  if wallet_row.available_balance < commission_value then
    raise exception 'INSUFFICIENT_WALLET_BALANCE';
  end if;

  update public.rider_wallets
  set available_balance = available_balance - commission_value,
      reserved_balance = reserved_balance + commission_value,
      updated_at = now()
  where rider_id = p_rider_id returning * into wallet_row;

  insert into public.order_commissions (
    order_id, rider_id, commission_rate, minimum_commission,
    commission_base, commission_amount, status
  ) values (
    order_row.id, p_rider_id, settings_row.commission_rate,
    settings_row.minimum_commission, greatest(coalesce(order_row.price, 0), 0),
    commission_value, 'Reserved'
  );

  insert into public.wallet_transactions (
    rider_id, transaction_type, available_change, reserved_change,
    available_balance_after, reserved_balance_after, order_id,
    idempotency_key, description, created_by
  ) values (
    p_rider_id, 'Commission Reserved', -commission_value, commission_value,
    wallet_row.available_balance, wallet_row.reserved_balance, order_row.id,
    'commission-reserve:' || order_row.id::text,
    'Commission reserved for ' || coalesce(order_row.booking_no, order_row.id::text), p_rider_id
  );

  return query
  update public.orders
  set status = 'Accepted', assigned_rider = p_rider_id::text, accepted_at = now()
  where id = order_row.id and status = 'Pending' and assigned_rider is null
  returning *;
  if not found then raise exception 'ORDER_ALREADY_ACCEPTED'; end if;
end;
$$;

create or replace function public.complete_order_with_commission(
  p_order_id bigint,
  p_rider_id uuid
)
returns setof public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  commission_row public.order_commissions;
  wallet_row public.rider_wallets;
  settings_row public.wallet_settings;
begin
  select * into order_row from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if order_row.assigned_rider <> p_rider_id::text then raise exception 'ORDER_NOT_ASSIGNED_TO_RIDER'; end if;
  if order_row.status <> 'Delivered' then raise exception 'INVALID_COMPLETION_STATUS'; end if;

  select * into commission_row from public.order_commissions
  where order_id = p_order_id for update;
  if not found then
    -- Orders accepted before this migration are allowed to finish without a
    -- retroactive charge. Every order accepted after launch must have a reserve.
    select * into settings_row from public.wallet_settings where id = 1;
    if order_row.accepted_at is null or order_row.accepted_at >= settings_row.wallet_enabled_at then
      raise exception 'COMMISSION_RESERVATION_NOT_FOUND';
    end if;
    return query update public.orders
    set status = 'Completed', completed_at = now()
    where id = p_order_id and status = 'Delivered' and assigned_rider = p_rider_id::text
    returning *;
    return;
  end if;
  if commission_row.status <> 'Reserved' then
    raise exception 'COMMISSION_RESERVATION_NOT_ACTIVE';
  end if;

  update public.rider_wallets
  set reserved_balance = reserved_balance - commission_row.commission_amount,
      lifetime_commission = lifetime_commission + commission_row.commission_amount,
      updated_at = now()
  where rider_id = p_rider_id
    and reserved_balance >= commission_row.commission_amount
  returning * into wallet_row;
  if not found then raise exception 'WALLET_RESERVATION_MISMATCH'; end if;

  update public.order_commissions
  set status = 'Earned', earned_at = now()
  where id = commission_row.id;

  insert into public.wallet_transactions (
    rider_id, transaction_type, available_change, reserved_change,
    available_balance_after, reserved_balance_after, order_id,
    idempotency_key, description, created_by
  ) values (
    p_rider_id, 'Commission Earned', 0, -commission_row.commission_amount,
    wallet_row.available_balance, wallet_row.reserved_balance, order_row.id,
    'commission-earned:' || order_row.id::text,
    'Platform commission earned for ' || coalesce(order_row.booking_no, order_row.id::text), p_rider_id
  );

  return query update public.orders
  set status = 'Completed', completed_at = now()
  where id = p_order_id and status = 'Delivered' and assigned_rider = p_rider_id::text
  returning *;
  if not found then raise exception 'COMPLETION_CONFLICT'; end if;
end;
$$;

create or replace function public.cancel_customer_order_with_commission_release(
  p_order_id bigint,
  p_customer_id uuid,
  p_reason text
)
returns setof public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  commission_row public.order_commissions;
  wallet_row public.rider_wallets;
begin
  select * into order_row from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if order_row.customer_user_id <> p_customer_id then raise exception 'ORDER_NOT_OWNED_BY_CUSTOMER'; end if;
  if coalesce(order_row.status, 'Pending') not in ('Pending', 'Accepted') then
    raise exception 'CANCELLATION_NOT_ALLOWED';
  end if;

  select * into commission_row from public.order_commissions
  where order_id = p_order_id for update;
  if found and commission_row.status = 'Reserved' then
    update public.rider_wallets
    set available_balance = available_balance + commission_row.commission_amount,
        reserved_balance = reserved_balance - commission_row.commission_amount,
        updated_at = now()
    where rider_id = commission_row.rider_id
      and reserved_balance >= commission_row.commission_amount
    returning * into wallet_row;
    if not found then raise exception 'WALLET_RESERVATION_MISMATCH'; end if;

    update public.order_commissions
    set status = 'Released', released_at = now(), release_reason = 'Customer cancellation'
    where id = commission_row.id;

    insert into public.wallet_transactions (
      rider_id, transaction_type, available_change, reserved_change,
      available_balance_after, reserved_balance_after, order_id,
      idempotency_key, description, created_by
    ) values (
      commission_row.rider_id, 'Commission Released', commission_row.commission_amount,
      -commission_row.commission_amount, wallet_row.available_balance,
      wallet_row.reserved_balance, order_row.id,
      'commission-release:' || order_row.id::text,
      'Commission released after cancellation of ' || coalesce(order_row.booking_no, order_row.id::text),
      p_customer_id
    );
  end if;

  return query update public.orders
  set status = 'Cancelled', cancellation_reason = left(btrim(p_reason), 500),
      cancelled_by = 'customer', cancelled_at = now()
  where id = p_order_id and status in ('Pending', 'Accepted')
  returning *;
  if not found then raise exception 'CANCELLATION_CONFLICT'; end if;
end;
$$;

create or replace function public.admin_cancel_order_with_commission_release(
  p_order_id bigint,
  p_admin_id uuid,
  p_reason text default 'Cancelled by admin'
)
returns setof public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  commission_row public.order_commissions;
  wallet_row public.rider_wallets;
begin
  select * into order_row from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if coalesce(order_row.status, 'Pending') in ('Completed', 'Cancelled') then
    raise exception 'CANCELLATION_NOT_ALLOWED';
  end if;

  select * into commission_row from public.order_commissions
  where order_id = p_order_id for update;
  if found and commission_row.status = 'Reserved' then
    update public.rider_wallets
    set available_balance = available_balance + commission_row.commission_amount,
        reserved_balance = reserved_balance - commission_row.commission_amount,
        updated_at = now()
    where rider_id = commission_row.rider_id
      and reserved_balance >= commission_row.commission_amount
    returning * into wallet_row;
    if not found then raise exception 'WALLET_RESERVATION_MISMATCH'; end if;

    update public.order_commissions
    set status = 'Released', released_at = now(), release_reason = 'Admin cancellation'
    where id = commission_row.id;

    insert into public.wallet_transactions (
      rider_id, transaction_type, available_change, reserved_change,
      available_balance_after, reserved_balance_after, order_id,
      idempotency_key, description, created_by
    ) values (
      commission_row.rider_id, 'Commission Released', commission_row.commission_amount,
      -commission_row.commission_amount, wallet_row.available_balance,
      wallet_row.reserved_balance, order_row.id,
      'commission-release:' || order_row.id::text,
      'Commission released after admin cancellation of ' || coalesce(order_row.booking_no, order_row.id::text),
      p_admin_id
    );
  end if;

  return query update public.orders
  set status = 'Cancelled', cancellation_reason = left(btrim(coalesce(p_reason, 'Cancelled by admin')), 500),
      cancelled_by = 'admin', cancelled_at = now()
  where id = p_order_id and status not in ('Completed', 'Cancelled')
  returning *;
  if not found then raise exception 'CANCELLATION_CONFLICT'; end if;
end;
$$;

alter table public.wallet_settings enable row level security;
alter table public.rider_wallets enable row level security;
alter table public.rider_topup_requests enable row level security;
alter table public.order_commissions enable row level security;
alter table public.wallet_transactions enable row level security;

drop policy if exists "riders read own wallet" on public.rider_wallets;
create policy "riders read own wallet" on public.rider_wallets
for select to authenticated using (rider_id = auth.uid());
drop policy if exists "riders read own topups" on public.rider_topup_requests;
create policy "riders read own topups" on public.rider_topup_requests
for select to authenticated using (rider_id = auth.uid());
drop policy if exists "riders read own commissions" on public.order_commissions;
create policy "riders read own commissions" on public.order_commissions
for select to authenticated using (rider_id = auth.uid());
drop policy if exists "riders read own wallet transactions" on public.wallet_transactions;
create policy "riders read own wallet transactions" on public.wallet_transactions
for select to authenticated using (rider_id = auth.uid());

grant select on public.wallet_settings to authenticated;
grant select on public.rider_wallets to authenticated;
grant select on public.rider_topup_requests to authenticated;
grant select on public.order_commissions to authenticated;
grant select on public.wallet_transactions to authenticated;

revoke execute on function public.approve_rider_topup(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.reject_rider_topup(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.accept_order_with_commission(bigint, uuid) from public, anon, authenticated;
revoke execute on function public.complete_order_with_commission(bigint, uuid) from public, anon, authenticated;
revoke execute on function public.cancel_customer_order_with_commission_release(bigint, uuid, text) from public, anon, authenticated;
revoke execute on function public.admin_cancel_order_with_commission_release(bigint, uuid, text) from public, anon, authenticated;
grant execute on function public.approve_rider_topup(uuid, uuid, text) to service_role;
grant execute on function public.reject_rider_topup(uuid, uuid, text) to service_role;
grant execute on function public.accept_order_with_commission(bigint, uuid) to service_role;
grant execute on function public.complete_order_with_commission(bigint, uuid) to service_role;
grant execute on function public.cancel_customer_order_with_commission_release(bigint, uuid, text) to service_role;
grant execute on function public.admin_cancel_order_with_commission_release(bigint, uuid, text) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'rider-topup-proofs', 'rider-topup-proofs', false, 5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

commit;
