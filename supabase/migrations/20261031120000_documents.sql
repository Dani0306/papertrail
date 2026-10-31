-- PaperTrail: documents table and the private bucket the files live in.
-- Additive only. Touches nothing outside the papertrail schema and its bucket.

create schema if not exists papertrail;

-- Only the server (secret key = service_role) reaches this schema. anon and
-- authenticated get no grants, so the publishable key can't read it even once
-- the schema is exposed in the Data API settings.
grant usage on schema papertrail to service_role;

create table papertrail.documents (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  original_filename text not null check (length(original_filename) between 1 and 255),
  mime_type text not null
    check (mime_type in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  page_count integer check (page_count > 0),
  -- Mirrors DOCUMENT_STATUSES in lib/document-status.ts.
  status text not null default 'uploaded'
    check (status in ('uploaded', 'extracting', 'extracted', 'escalated', 'needs_human', 'reviewed')),
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table papertrail.documents is
  'One row per uploaded invoice. The file itself is in the papertrail-documents bucket at storage_path.';

-- The list page sorts newest first.
create index documents_created_at_idx on papertrail.documents (created_at desc);
-- Covers the uploaded_by foreign key and per-user lookups.
create index documents_uploaded_by_created_at_idx on papertrail.documents (uploaded_by, created_at);

-- No policies: only service_role (which bypasses RLS) is granted access.
alter table papertrail.documents enable row level security;

grant select, insert, update, delete on papertrail.documents to service_role;

-- Private bucket. The limits here are the backstop: they hold even if a client
-- skips the app's own checks.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'papertrail-documents',
  'papertrail-documents',
  false,
  10485760,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;
