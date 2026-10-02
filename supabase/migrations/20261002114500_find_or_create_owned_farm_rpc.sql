-- Resolve a farm on the server so a restored device reuses the latest farm
-- already owned by the authenticated user instead of creating a duplicate.
create or replace function public.rb_find_or_create_owned_farm(farm_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  resolved_farm_id uuid;
begin
  if caller_id is null then
    raise exception 'Autenticación requerida para crear una finca.';
  end if;

  select id into resolved_farm_id
  from public.farms
  where created_by = caller_id
    and name = trim(farm_name)
  order by created_at desc
  limit 1;

  if resolved_farm_id is null then
    insert into public.farms (name, created_by)
    values (trim(farm_name), caller_id)
    returning id into resolved_farm_id;
  end if;

  return resolved_farm_id;
end;
$$;

revoke all on function public.rb_find_or_create_owned_farm(text) from public, anon;
grant execute on function public.rb_find_or_create_owned_farm(text) to authenticated;
