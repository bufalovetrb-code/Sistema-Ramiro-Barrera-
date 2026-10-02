-- Audit entries can refer to a record UUID or to a named configuration action.
-- Preserve both forms exactly as they are stored by the local application.
alter table public.audit_entries
  alter column entity_id type text using entity_id::text;
