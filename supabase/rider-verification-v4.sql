-- Barangay Express V4: Rider document verification
-- Run once after rider-application-system.sql.

alter table public.rider_applications
  add column if not exists application_type text not null default 'initial'
    check (application_type in ('initial', 'reapplication')),
  add column if not exists birthdate date,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text,
  add column if not exists vehicle_brand text,
  add column if not exists vehicle_model text,
  add column if not exists vehicle_color text,
  add column if not exists license_front_path text,
  add column if not exists license_back_path text,
  add column if not exists or_path text,
  add column if not exists cr_path text,
  add column if not exists vehicle_photo_path text,
  add column if not exists rider_selfie_path text,
  add column if not exists nbi_clearance_path text,
  add column if not exists barangay_clearance_path text,
  add column if not exists verification_notes text,
  add column if not exists documents_requested text,
  add column if not exists nbi_verified_at timestamptz;

alter table public.rider_applications drop constraint if exists rider_applications_status_check;
alter table public.rider_applications
  add constraint rider_applications_status_check
  check (status in ('pending', 'needs_documents', 'under_review', 'approved', 'rejected'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'rider-documents',
  'rider-documents',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Files are uploaded and viewed only by protected server routes using the service-role key.
