-- Barangay Express Multi-Rider System
-- Run this once in Supabase SQL Editor.

alter table public.rider_profiles
  add column if not exists is_online boolean not null default false,
  add column if not exists last_online_at timestamptz,
  add column if not exists last_offline_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists rider_profiles_online_idx
  on public.rider_profiles (is_active, is_online);

create or replace function public.set_rider_availability(
  p_rider_id uuid,
  p_is_online boolean
)
returns public.rider_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.rider_profiles;
begin
  update public.rider_profiles
  set is_online = p_is_online,
      last_online_at = case when p_is_online then now() else last_online_at end,
      last_offline_at = case when not p_is_online then now() else last_offline_at end,
      updated_at = now()
  where id = p_rider_id
    and is_active = true
  returning * into v_profile;

  if v_profile.id is null then
    raise exception 'RIDER_NOT_ACTIVE';
  end if;

  return v_profile;
end;
$$;

revoke execute on function public.set_rider_availability(uuid, boolean) from public, anon;
grant execute on function public.set_rider_availability(uuid, boolean) to authenticated, service_role;

-- Keep inactive riders offline automatically.
create or replace function public.enforce_inactive_rider_offline()
returns trigger
language plpgsql
as $$
begin
  if new.is_active = false then
    new.is_online := false;
    new.last_offline_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists rider_profiles_inactive_offline on public.rider_profiles;
create trigger rider_profiles_inactive_offline
before update on public.rider_profiles
for each row execute function public.enforce_inactive_rider_offline();

-- Enable live rider status changes for the admin dashboard.
-- Safe to run again: it only adds the table when it is not yet published.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rider_profiles'
  ) then
    alter publication supabase_realtime add table public.rider_profiles;
  end if;
end;
$$;

-- Smart Dispatch realtime: make new bookings and accept events visible immediately.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end;
$$;
