-- Audit history is append-only.  Browser sync may retry an already uploaded
-- entry, so insert through this controlled function and ignore the same ID.
-- This avoids granting general UPDATE access to audit_entries.
create or replace function public.rb_append_audit_entries(
  target_farm uuid,
  entries jsonb
) returns integer
language plpgsql security definer set search_path = public, auth as $$
declare
  inserted_count integer;
begin
  if auth.uid() is null or not public.rb_can_write(target_farm) then
    raise exception 'No tienes permiso de edición en esta finca.';
  end if;
  if jsonb_typeof(entries) <> 'array' then
    raise exception 'Las auditorías deben enviarse como una lista.';
  end if;

  insert into public.audit_entries (
    id, farm_id, entity, entity_id, action, occurred_at, local_user, reason
  )
  select
    (entry ->> 'id')::uuid,
    target_farm,
    entry ->> 'entity',
    entry ->> 'entity_id',
    entry ->> 'action',
    coalesce((entry ->> 'occurred_at')::timestamptz, now()),
    coalesce(nullif(entry ->> 'local_user', ''), 'Usuario remoto'),
    nullif(entry ->> 'reason', '')
  from jsonb_array_elements(entries) as entry
  on conflict (id) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.rb_append_audit_entries(uuid, jsonb) from public, anon;
grant execute on function public.rb_append_audit_entries(uuid, jsonb) to authenticated;
