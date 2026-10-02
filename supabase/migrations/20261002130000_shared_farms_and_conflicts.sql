-- Shared-farm collaboration. Invitations are accepted by the invited
-- authenticated account; the browser never receives access to auth.users.
create table if not exists public.farm_invitations (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  email text not null check (email = lower(trim(email)) and char_length(email) > 3),
  role public.farm_member_role not null default 'viewer',
  invited_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (role <> 'owner'),
  unique (farm_id, email)
);

alter table public.farm_invitations enable row level security;
revoke all on public.farm_invitations from anon, authenticated;

create or replace function public.rb_invite_farm_member(
  target_farm uuid,
  invitee_email text,
  member_role public.farm_member_role
) returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare
  invitation_id uuid;
  normalized_email text := lower(trim(invitee_email));
begin
  if auth.uid() is null then raise exception 'Autenticación requerida.'; end if;
  if public.rb_farm_role(target_farm) <> 'owner' then
    raise exception 'Solo el propietario puede invitar usuarios.';
  end if;
  if member_role = 'owner' then
    raise exception 'El rol propietario no se puede invitar.';
  end if;
  if normalized_email = '' or position('@' in normalized_email) = 0 then
    raise exception 'El correo de invitación no es válido.';
  end if;

  insert into public.farm_invitations (farm_id, email, role, invited_by)
  values (target_farm, normalized_email, member_role, auth.uid())
  on conflict (farm_id, email) do update
    set role = excluded.role, invited_by = excluded.invited_by, created_at = now()
  returning id into invitation_id;
  return invitation_id;
end;
$$;

create or replace function public.rb_list_my_farm_invitations()
returns table (
  invitation_id uuid,
  farm_id uuid,
  farm_name text,
  role public.farm_member_role,
  invited_at timestamptz
)
language sql stable security definer set search_path = public, auth as $$
  select i.id, i.farm_id, f.name, i.role, i.created_at
  from public.farm_invitations i
  join public.farms f on f.id = i.farm_id
  where i.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  order by i.created_at desc;
$$;

create or replace function public.rb_accept_farm_invitation(invitation uuid)
returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare
  current_invitation public.farm_invitations%rowtype;
begin
  if auth.uid() is null then raise exception 'Autenticación requerida.'; end if;
  select * into current_invitation
  from public.farm_invitations
  where id = invitation
    and email = lower(coalesce(auth.jwt() ->> 'email', ''))
  for update;
  if not found then raise exception 'La invitación no existe o no corresponde a esta cuenta.'; end if;

  insert into public.farm_members (farm_id, user_id, role)
  values (current_invitation.farm_id, auth.uid(), current_invitation.role)
  on conflict (farm_id, user_id) do update set role = excluded.role;
  delete from public.farm_invitations where id = current_invitation.id;
  return current_invitation.farm_id;
end;
$$;

create or replace function public.rb_list_farm_members(target_farm uuid)
returns table (
  user_id uuid,
  email text,
  role public.farm_member_role,
  joined_at timestamptz
)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if public.rb_farm_role(target_farm) <> 'owner' then
    raise exception 'Solo el propietario puede administrar usuarios.';
  end if;
  return query
    select m.user_id, u.email::text, m.role, m.created_at
    from public.farm_members m
    join auth.users u on u.id = m.user_id
    where m.farm_id = target_farm
    order by m.created_at;
end;
$$;

create or replace function public.rb_set_farm_member_role(
  target_farm uuid,
  target_user uuid,
  member_role public.farm_member_role
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.rb_farm_role(target_farm) <> 'owner' then
    raise exception 'Solo el propietario puede cambiar permisos.';
  end if;
  if member_role = 'owner' then raise exception 'El rol propietario no se puede transferir aquí.'; end if;
  if exists (select 1 from public.farms where id = target_farm and created_by = target_user) then
    raise exception 'No se puede cambiar el rol del propietario original.';
  end if;
  update public.farm_members set role = member_role
  where farm_id = target_farm and user_id = target_user;
  if not found then raise exception 'El usuario no pertenece a esta finca.'; end if;
end;
$$;

create or replace function public.rb_remove_farm_member(target_farm uuid, target_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.rb_farm_role(target_farm) <> 'owner' then
    raise exception 'Solo el propietario puede retirar usuarios.';
  end if;
  if exists (select 1 from public.farms where id = target_farm and created_by = target_user) then
    raise exception 'No se puede retirar al propietario original.';
  end if;
  delete from public.farm_members where farm_id = target_farm and user_id = target_user;
  if not found then raise exception 'El usuario no pertenece a esta finca.'; end if;
end;
$$;

-- Optimistic concurrency: a write proceeds only when the version previously
-- downloaded by the device still matches. On a collision, the remote version
-- is preserved and returned by the next download; nothing is silently lost.
create or replace function public.rb_apply_farm_changes(target_farm uuid, changes jsonb)
returns table (entity text, id uuid, version bigint, status text)
language plpgsql security definer set search_path = public as $$
declare
  change jsonb;
  current_record public.farm_records%rowtype;
  change_entity text;
  change_id uuid;
  base_version bigint;
  change_deleted_at timestamptz;
  change_created_at timestamptz;
begin
  if auth.uid() is null or not public.rb_can_write(target_farm) then
    raise exception 'No tienes permiso de edición en esta finca.';
  end if;
  if jsonb_typeof(changes) <> 'array' then raise exception 'Cambios inválidos.'; end if;

  for change in select value from jsonb_array_elements(changes) loop
    change_entity := change ->> 'entity';
    change_id := (change ->> 'id')::uuid;
    base_version := coalesce((change ->> 'base_version')::bigint, 0);
    change_created_at := coalesce((change ->> 'created_at')::timestamptz, now());
    change_deleted_at := nullif(change ->> 'deleted_at', '')::timestamptz;
    if change_entity not in ('Animal','Evento','Parto','Tarea','Configuración') then
      raise exception 'Entidad no permitida: %', change_entity;
    end if;
    select * into current_record from public.farm_records
      where farm_id = target_farm and farm_records.entity = change_entity and farm_records.id = change_id
      for update;
    if not found then
      insert into public.farm_records (farm_id, entity, id, payload, version, created_at, updated_at, deleted_at)
      values (target_farm, change_entity, change_id, coalesce(change -> 'payload', '{}'::jsonb), 1,
        change_created_at, now(), change_deleted_at);
      entity := change_entity; id := change_id; version := 1; status := 'applied'; return next;
    elsif current_record.payload = coalesce(change -> 'payload', '{}'::jsonb)
      and current_record.deleted_at is not distinct from change_deleted_at then
      entity := change_entity; id := change_id; version := current_record.version; status := 'unchanged'; return next;
    elsif current_record.version = base_version then
      update public.farm_records set payload = coalesce(change -> 'payload', '{}'::jsonb),
        version = current_record.version + 1, deleted_at = change_deleted_at
      where farm_id = target_farm and farm_records.entity = change_entity and farm_records.id = change_id;
      entity := change_entity; id := change_id; version := current_record.version + 1; status := 'applied'; return next;
    else
      entity := change_entity; id := change_id; version := current_record.version; status := 'conflict'; return next;
    end if;
  end loop;
end;
$$;

revoke all on function public.rb_invite_farm_member(uuid, text, public.farm_member_role) from public, anon;
revoke all on function public.rb_list_my_farm_invitations() from public, anon;
revoke all on function public.rb_accept_farm_invitation(uuid) from public, anon;
revoke all on function public.rb_list_farm_members(uuid) from public, anon;
revoke all on function public.rb_set_farm_member_role(uuid, uuid, public.farm_member_role) from public, anon;
revoke all on function public.rb_remove_farm_member(uuid, uuid) from public, anon;
revoke all on function public.rb_apply_farm_changes(uuid, jsonb) from public, anon;
grant execute on function public.rb_invite_farm_member(uuid, text, public.farm_member_role) to authenticated;
grant execute on function public.rb_list_my_farm_invitations() to authenticated;
grant execute on function public.rb_accept_farm_invitation(uuid) to authenticated;
grant execute on function public.rb_list_farm_members(uuid) to authenticated;
grant execute on function public.rb_set_farm_member_role(uuid, uuid, public.farm_member_role) to authenticated;
grant execute on function public.rb_remove_farm_member(uuid, uuid) to authenticated;
grant execute on function public.rb_apply_farm_changes(uuid, jsonb) to authenticated;
