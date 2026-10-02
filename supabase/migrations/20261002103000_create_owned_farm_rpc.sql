-- Create the first remote farm through a controlled server-side entry point.
-- The function obtains the owner exclusively from the authenticated JWT; the
-- browser cannot choose another user's identifier.
create or replace function public.rb_create_owned_farm(farm_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  created_farm_id uuid;
begin
  if caller_id is null then
    raise exception 'Autenticación requerida para crear una finca.';
  end if;

  insert into public.farms (name, created_by)
  values (trim(farm_name), caller_id)
  returning id into created_farm_id;

  return created_farm_id;
end;
$$;

revoke all on function public.rb_create_owned_farm(text) from public, anon;
grant execute on function public.rb_create_owned_farm(text) to authenticated;
