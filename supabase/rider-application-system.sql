-- Barangay Express: Rider Application and Admin Approval System
-- Run this file once in Supabase SQL Editor.

create table if not exists public.rider_applications (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text not null,
  address text,
  vehicle_type text not null default 'Motorcycle',
  plate_number text,
  license_number text,
  experience_notes text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  created_rider_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists rider_applications_pending_email_unique
on public.rider_applications (lower(email))
where status = 'pending';

create index if not exists rider_applications_status_created_idx
on public.rider_applications (status, created_at desc);

alter table public.rider_applications enable row level security;

-- The public form and admin actions use protected server API routes with the service-role key.
-- No direct browser table access is required.

create or replace function public.touch_rider_application_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists rider_applications_touch_updated_at on public.rider_applications;
create trigger rider_applications_touch_updated_at
before update on public.rider_applications
for each row execute function public.touch_rider_application_updated_at();
