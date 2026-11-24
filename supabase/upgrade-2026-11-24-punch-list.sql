-- Upgrade of 24 November 2026: the punch list (table punch_items).
-- Extracted unchanged from supabase/schema.sql, which is generated from app/js/schema.js. Run it in the Supabase SQL
-- editor BEFORE the application version that uses it is deployed (a client that pushes punch items to a database
-- without the table stops synchronising until the table exists). It only adds: no existing row or column changes.
-- Running the whole supabase/schema.sql instead does the same (it is safe to run again).
begin;
create table if not exists public.punch_items (
  id uuid primary key,
  org_id uuid not null references public.organizations(id),
  code text,
  building_id uuid not null,
  floor_id uuid not null,
  room_id uuid not null,
  device_id uuid,
  text text,
  resolver text,
  status text,
  notes text,
  resolved_at timestamptz,
  resolved_by text,
  sort_order numeric,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text,
  updated_by text,
  deleted_at timestamptz,
  is_demo boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint punch_items_updated_after_created check (updated_at >= created_at)
);

alter table public.punch_items drop constraint if exists punch_items_resolver_check;
alter table public.punch_items add constraint punch_items_resolver_check check (resolver is null or resolver in ('internal', 'integrator', ''));
alter table public.punch_items drop constraint if exists punch_items_status_check;
alter table public.punch_items add constraint punch_items_status_check check (status is null or status in ('open', 'resolved', ''));

alter table public.punch_items drop constraint if exists punch_items_building_id_fkey;
alter table public.punch_items add constraint punch_items_building_id_fkey foreign key (building_id) references public.buildings(id);
alter table public.punch_items drop constraint if exists punch_items_floor_id_fkey;
alter table public.punch_items add constraint punch_items_floor_id_fkey foreign key (floor_id) references public.floors(id);
alter table public.punch_items drop constraint if exists punch_items_room_id_fkey;
alter table public.punch_items add constraint punch_items_room_id_fkey foreign key (room_id) references public.rooms(id);

create index if not exists punch_items_building_id_idx on public.punch_items (building_id);
create index if not exists punch_items_floor_id_idx on public.punch_items (floor_id);
create index if not exists punch_items_room_id_idx on public.punch_items (room_id);
create index if not exists punch_items_device_id_idx on public.punch_items (device_id);
create index if not exists punch_items_sync_idx on public.punch_items (org_id, server_updated_at, id);
create index if not exists punch_items_code_idx on public.punch_items (org_id, code);

revoke all on table public.punch_items from anon, authenticated;
grant select, insert, update on table public.punch_items to authenticated;
alter table public.punch_items enable row level security;
drop policy if exists punch_items_select on public.punch_items;
create policy punch_items_select on public.punch_items for select to authenticated using (public.is_org_member(org_id));
drop policy if exists punch_items_insert on public.punch_items;
create policy punch_items_insert on public.punch_items for insert to authenticated with check (public.can_write_org(org_id));
drop policy if exists punch_items_update on public.punch_items;
create policy punch_items_update on public.punch_items for update to authenticated using (public.can_write_org(org_id)) with check (public.can_write_org(org_id));

drop trigger if exists a_keep_newer on public.punch_items;
create trigger a_keep_newer before update on public.punch_items for each row execute function public.keep_newer_version();
drop trigger if exists b_lock_org on public.punch_items;
create trigger b_lock_org before update on public.punch_items for each row execute function public.lock_org_id();
drop trigger if exists c_stamp on public.punch_items;
create trigger c_stamp before insert or update on public.punch_items for each row execute function public.stamp_server_updated_at();
drop trigger if exists z_audit on public.punch_items;
create trigger z_audit after insert or update on public.punch_items for each row execute function public.record_audit_trail();
commit;
notify pgrst, 'reload schema';
