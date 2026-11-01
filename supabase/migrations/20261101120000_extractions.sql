-- PaperTrail: extraction results, their fields, and the per-call cost log.
-- Additive only: three new tables and one nullable column on documents.

-- When the current run claimed the document. A run killed by the function
-- timeout leaves status = 'extracting'; a claim older than the stale window can
-- be taken over (lib/pipeline/extract-document.ts).
alter table papertrail.documents add column extraction_started_at timestamptz;

-- One row per successful run: the validated invoice exactly as returned.
create table papertrail.extractions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references papertrail.documents (id) on delete cascade,
  model text not null,
  mode text not null check (mode in ('json_schema', 'function_call')),
  invoice jsonb not null,
  created_at timestamptz not null default now()
);

comment on table papertrail.extractions is
  'One row per successful extraction run. invoice is the Zod-validated JSON as the model returned it.';

create index extractions_document_id_idx on papertrail.extractions (document_id);

-- One row per extracted field. value keeps its JSON type (number or string);
-- SQL NULL means the document doesn't show the field. A correction is stored
-- next to the original, which is never overwritten: the original is eval data.
create table papertrail.extraction_fields (
  id bigint generated always as identity primary key,
  extraction_id uuid not null references papertrail.extractions (id) on delete cascade,
  position integer not null check (position >= 0),
  field_name text not null check (length(field_name) between 1 and 100),
  value jsonb,
  confidence double precision not null check (confidence between 0 and 1),
  source_quote text,
  corrected_value jsonb,
  corrected_at timestamptz,
  unique (extraction_id, field_name)
);

comment on table papertrail.extraction_fields is
  'One row per field of an extraction, named as flattenFields() names them (lineItems[2].qty).';

-- The unique constraint's index leads with extraction_id, so it covers the foreign key.

-- One row per model call, whatever the outcome. Same shape as the CLI's
-- logs/model-calls.jsonl record (ModelCallRecord in lib/extract/types.ts).
create table papertrail.model_calls (
  id bigint generated always as identity primary key,
  document_id uuid references papertrail.documents (id) on delete set null,
  file_name text not null,
  model text not null,
  mode text not null check (mode in ('json_schema', 'function_call')),
  attempt integer not null check (attempt >= 1),
  outcome text not null check (outcome in ('ok', 'validation_error', 'api_error', 'repaired', 'escalated')),
  input_tokens integer not null check (input_tokens >= 0),
  cached_input_tokens integer not null check (cached_input_tokens >= 0),
  output_tokens integer not null check (output_tokens >= 0),
  reasoning_tokens integer not null check (reasoning_tokens >= 0),
  cost_usd numeric(12, 8) not null check (cost_usd >= 0),
  latency_ms integer not null check (latency_ms >= 0),
  error text,
  created_at timestamptz not null default now()
);

comment on table papertrail.model_calls is
  'One row per model call: tokens, cost, latency and outcome. attempt = 1 rows count extraction runs for the daily cap.';

create index model_calls_document_id_idx on papertrail.model_calls (document_id);
-- The daily cap counts first attempts since midnight UTC.
create index model_calls_first_attempt_created_at_idx on papertrail.model_calls (created_at) where attempt = 1;

-- Same access model as documents: RLS on, no policies, service_role only.
alter table papertrail.extractions enable row level security;
alter table papertrail.extraction_fields enable row level security;
alter table papertrail.model_calls enable row level security;

grant select, insert, update, delete on papertrail.extractions to service_role;
grant select, insert, update, delete on papertrail.extraction_fields to service_role;
grant select, insert, update, delete on papertrail.model_calls to service_role;
