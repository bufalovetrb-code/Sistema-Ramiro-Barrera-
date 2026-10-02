alter table public.audit_entries
  alter column entity_id type text using entity_id::text;
