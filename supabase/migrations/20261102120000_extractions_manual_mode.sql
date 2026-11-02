-- PaperTrail: allow a person's hand entry as an extraction (prompt 014).
-- Widens one check constraint; no rows change and nothing is dropped from the data.
-- A manual extraction has model 'manual' and mode 'manual'; its values live in
-- extraction_fields.corrected_value, with value null (the model returned nothing).

alter table papertrail.extractions drop constraint extractions_mode_check;
alter table papertrail.extractions
  add constraint extractions_mode_check check (mode in ('json_schema', 'function_call', 'manual'));
