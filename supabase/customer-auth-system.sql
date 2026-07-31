-- Barangay Express: complete customer authentication foundation
-- Run this whole file once in Supabase SQL Editor.

begin;

create extension if not exists pgcrypto;

alter table public.orders
  add column if not exists customer_user_id uuid references auth.users(id) on delete set null;

create index if not exists orders_customer_user_id_created_at_idx
  on public.orders (customer_user_id, created_at desc);

-- Public sign-ups must always become customers. A caller-supplied role in
-- auth metadata is intentionally ignored so nobody can self-register as admin
-- or rider.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_name text;
begin
  requested_name := btrim(coalesce(new.raw_user_meta_data ->> 'full_name', ''));

  if char_length(requested_name) < 2 then
    requested_name := split_part(coalesce(new.email, 'Customer'), '@', 1);
  end if;

  insert into public.profiles (id, email, full_name, role, is_active)
  values (
    new.id,
    coalesce(new.email, ''),
    left(requested_name, 120),
    'customer',
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create table if not exists public.saved_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  contact_name text not null,
  phone text not null,
  address text not null,
  latitude double precision not null,
  longitude double precision not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_addresses_label_length
    check (char_length(btrim(label)) between 1 and 40),
  constraint saved_addresses_contact_name_length
    check (char_length(btrim(contact_name)) between 1 and 120),
  constraint saved_addresses_phone_format
    check (phone ~ '^09[0-9]{9}$'),
  constraint saved_addresses_address_length
    check (char_length(btrim(address)) between 1 and 500),
  constraint saved_addresses_latitude_range
    check (latitude between -90 and 90),
  constraint saved_addresses_longitude_range
    check (longitude between -180 and 180)
);

create index if not exists saved_addresses_customer_user_id_idx
  on public.saved_addresses (customer_user_id, created_at desc);

create unique index if not exists saved_addresses_one_default_per_customer_idx
  on public.saved_addresses (customer_user_id)
  where is_default = true;

create or replace function public.set_saved_address_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_saved_address_updated_at on public.saved_addresses;
create trigger set_saved_address_updated_at
before update on public.saved_addresses
for each row execute function public.set_saved_address_updated_at();

alter table public.profiles enable row level security;
alter table public.saved_addresses enable row level security;
alter table public.orders enable row level security;

drop policy if exists "customers can read own profile" on public.profiles;
create policy "customers can read own profile"
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists "customers can read own addresses" on public.saved_addresses;
create policy "customers can read own addresses"
on public.saved_addresses
for select
to authenticated
using (customer_user_id = auth.uid());

drop policy if exists "customers can insert own addresses" on public.saved_addresses;
create policy "customers can insert own addresses"
on public.saved_addresses
for insert
to authenticated
with check (customer_user_id = auth.uid());

drop policy if exists "customers can update own addresses" on public.saved_addresses;
create policy "customers can update own addresses"
on public.saved_addresses
for update
to authenticated
using (customer_user_id = auth.uid())
with check (customer_user_id = auth.uid());

drop policy if exists "customers can delete own addresses" on public.saved_addresses;
create policy "customers can delete own addresses"
on public.saved_addresses
for delete
to authenticated
using (customer_user_id = auth.uid());

drop policy if exists "customers can read own orders" on public.orders;
create policy "customers can read own orders"
on public.orders
for select
to authenticated
using (customer_user_id = auth.uid());

grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.saved_addresses to authenticated;
grant select on public.orders to authenticated;

commit;
