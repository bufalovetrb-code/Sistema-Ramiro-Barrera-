-- RB SmartFarm remote-sync pilot. No browser data is imported by this migration.
create extension if not exists pgcrypto;

do $$ begin
  create type public.farm_member_role as enum ('owner','manager','operator','viewer');
exception when duplicate_object then null; end $$;

create table public.farms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.farm_members (
  farm_id uuid not null references public.farms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.farm_member_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (farm_id,user_id)
);
create table public.farm_records (
  farm_id uuid not null references public.farms(id) on delete cascade,
  entity text not null check (entity in ('Animal','Evento','Parto','Tarea','Configuración')),
  id uuid not null default gen_random_uuid(),
  payload jsonb not null default '{}'::jsonb,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (farm_id,entity,id)
);
create table public.audit_entries (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  entity text not null,
  entity_id text not null,
  action text not null check (action in ('Creación','Edición','Baja lógica','Corrección')),
  occurred_at timestamptz not null default now(),
  local_user text not null,
  reason text
);
create index farm_records_sync_idx on public.farm_records(farm_id,updated_at);
create index audit_entries_farm_idx on public.audit_entries(farm_id,occurred_at desc);

create or replace function public.rb_farm_role(target uuid) returns public.farm_member_role
language sql stable security definer set search_path=public as $$
  select role from public.farm_members where farm_id=target and user_id=auth.uid() limit 1;
$$;
create or replace function public.rb_is_member(target uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.farm_members where farm_id=target and user_id=auth.uid());
$$;
create or replace function public.rb_can_write(target uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce(public.rb_farm_role(target) in ('owner','manager','operator'),false);
$$;
create or replace function public.rb_add_farm_owner() returns trigger
language plpgsql security definer set search_path=public as $$
begin insert into public.farm_members(farm_id,user_id,role) values(new.id,new.created_by,'owner'); return new; end;
$$;
create or replace function public.rb_touch_updated_at() returns trigger
language plpgsql set search_path=public as $$ begin new.updated_at=now(); return new; end; $$;
create trigger rb_add_farm_owner after insert on public.farms
for each row execute function public.rb_add_farm_owner();
create trigger rb_touch_farms before update on public.farms
for each row execute function public.rb_touch_updated_at();
create trigger rb_touch_records before update on public.farm_records
for each row execute function public.rb_touch_updated_at();

alter table public.farms enable row level security;
alter table public.farm_members enable row level security;
alter table public.farm_records enable row level security;
alter table public.audit_entries enable row level security;
create policy "farms_read_member" on public.farms for select to authenticated using(public.rb_is_member(id));
create policy "farms_create_owner" on public.farms for insert to authenticated with check(created_by=auth.uid());
create policy "farms_update_writer" on public.farms for update to authenticated using(public.rb_can_write(id)) with check(public.rb_can_write(id));
create policy "members_read_member" on public.farm_members for select to authenticated using(public.rb_is_member(farm_id));
create policy "records_read_member" on public.farm_records for select to authenticated using(public.rb_is_member(farm_id));
create policy "records_write_member" on public.farm_records for insert to authenticated with check(public.rb_can_write(farm_id));
create policy "records_update_member" on public.farm_records for update to authenticated using(public.rb_can_write(farm_id)) with check(public.rb_can_write(farm_id));
create policy "audit_read_member" on public.audit_entries for select to authenticated using(public.rb_is_member(farm_id));
create policy "audit_write_member" on public.audit_entries for insert to authenticated with check(public.rb_can_write(farm_id));
revoke all on public.farms,public.farm_members,public.farm_records,public.audit_entries from anon;
grant select,insert,update on public.farms,public.farm_members,public.farm_records,public.audit_entries to authenticated;
