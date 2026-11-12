/* Generates supabase/schema.sql from the application's own data model (app/js/schema.js), so the cloud schema and
 * the client can never drift apart. Open tools/gen-schema.html through the dev server; the SQL is shown on the page
 * and posted to the dev server (/__save -> .testout/schema.sql). */
(function () {
  'use strict';
  const S = window.EV.S;
  const SERVER_MANAGED = { organizations: 1, profiles: 1 };
  const TYPES = { text: 'text', uuid: 'uuid', int: 'integer', num: 'numeric', bool: 'boolean', date: 'date', ts: 'timestamptz', json: 'jsonb' };
  const q = function (list) { return list.map(function (v) { return "'" + String(v).replace(/'/g, "''") + "'"; }).join(', '); };
  /* value constraints: the same vocabularies the client uses ('' = not yet recorded), defined once in app/js/schema.js */
  const CHECKS = S.DB_CHECKS;
  const L = [];
  const out = function () { for (let i = 0; i < arguments.length; i++) L.push(arguments[i]); };
  out('-- =====================================================================================',
    '-- AV ENVIRONMENT INTELLIGENCE  -  PostgreSQL / Supabase schema',
    '-- GENERATED from app/js/schema.js by tools/gen-schema.js. Do not edit by hand; regenerate instead.',
    '--',
    '-- Apply once, in the Supabase SQL editor, to a project that has been approved for this data.',
    '-- Contents: tables, foreign keys, indexes, value constraints, change triggers, server-side audit trail,',
    '--           row-level security (organization membership + role), private photograph bucket and its policies.',
    '-- Model:    every row belongs to an organization (org_id). A signed-in user may read rows of organizations they',
    '--           are a member of; admin / lead_auditor / auditor may write; viewer is read-only. Rows are never hard-',
    '--           deleted by clients (deleted_at marks a soft delete), so history and synchronisation stay consistent.',
    '-- =====================================================================================', '',
    'create extension if not exists pgcrypto;', '',
    '-- ---------------------------------------------------------------- organizations and membership (server-managed)',
    'create table if not exists public.organizations (',
    '  id uuid primary key default gen_random_uuid(),',
    '  name text not null,',
    "  short_code text not null default 'AVEI' check (short_code ~ '^[A-Z0-9]{2,8}$'),",
    '  notes text,',
    '  created_at timestamptz not null default now()',
    ');',
    'create table if not exists public.org_members (',
    '  org_id uuid not null references public.organizations(id) on delete cascade,',
    '  user_id uuid not null references auth.users(id) on delete cascade,',
    "  role text not null default 'auditor' check (role in ('admin', 'lead_auditor', 'auditor', 'viewer')),",
    '  full_name text,',
    '  created_at timestamptz not null default now(),',
    '  primary key (org_id, user_id)',
    ');',
    'create index if not exists org_members_user_idx on public.org_members (user_id);', '',
    '-- ---------------------------------------------------------------- access helpers (security definer, fixed search_path)',
    'create or replace function public.is_org_member(o uuid) returns boolean',
    '  language sql stable security definer set search_path = public as',
    '  $$ select exists (select 1 from public.org_members m where m.org_id = o and m.user_id = auth.uid()) $$;',
    'create or replace function public.can_write_org(o uuid) returns boolean',
    '  language sql stable security definer set search_path = public as',
    "  $$ select exists (select 1 from public.org_members m where m.org_id = o and m.user_id = auth.uid() and m.role in ('admin', 'lead_auditor', 'auditor')) $$;",
    'create or replace function public.is_org_admin(o uuid) returns boolean',
    '  language sql stable security definer set search_path = public as',
    "  $$ select exists (select 1 from public.org_members m where m.org_id = o and m.user_id = auth.uid() and m.role = 'admin') $$;",
    'revoke all on function public.is_org_member(uuid), public.can_write_org(uuid), public.is_org_admin(uuid) from public, anon;',
    'grant execute on function public.is_org_member(uuid), public.can_write_org(uuid), public.is_org_admin(uuid) to authenticated;', '',
    '-- Least privilege: signed-out visitors (anon) have no access at all; signed-in users get only what the policies below can allow.',
    'revoke all on table public.organizations, public.org_members from anon, authenticated;',
    'grant select on table public.organizations to authenticated;',
    'grant select, insert, update, delete on table public.org_members to authenticated;',
    'alter table public.organizations enable row level security;',
    'alter table public.org_members enable row level security;',
    'drop policy if exists organizations_select on public.organizations;',
    'create policy organizations_select on public.organizations for select to authenticated using (public.is_org_member(id));',
    'drop policy if exists org_members_select on public.org_members;',
    'create policy org_members_select on public.org_members for select to authenticated using (user_id = auth.uid() or public.is_org_admin(org_id));',
    'drop policy if exists org_members_admin_write on public.org_members;',
    'create policy org_members_admin_write on public.org_members for all to authenticated using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));', '',
    '-- ---------------------------------------------------------------- server-side audit trail (append-only)',
    'create table if not exists public.audit_trail (',
    '  id bigint generated always as identity primary key,',
    '  at timestamptz not null default now(),',
    '  org_id uuid,',
    '  table_name text not null,',
    '  record_id uuid,',
    "  action text not null check (action in ('insert', 'update')),",
    '  actor uuid default auth.uid(),',
    '  client_updated_at timestamptz,',
    '  soft_deleted boolean not null default false',
    ');',
    'create index if not exists audit_trail_org_at_idx on public.audit_trail (org_id, at desc);',
    'create index if not exists audit_trail_record_idx on public.audit_trail (record_id);',
    'revoke all on table public.audit_trail from anon, authenticated;',
    'grant select on table public.audit_trail to authenticated;',
    'alter table public.audit_trail enable row level security;',
    'drop policy if exists audit_trail_select on public.audit_trail;',
    'create policy audit_trail_select on public.audit_trail for select to authenticated using (public.is_org_admin(org_id));',
    '-- no insert / update / delete policy: rows are written only by the trigger below (security definer)', '',
    '-- ---------------------------------------------------------------- triggers shared by every data table',
    'create or replace function public.stamp_server_updated_at() returns trigger language plpgsql as',
    '  $$ begin new.server_updated_at := clock_timestamp(); return new; end $$;',
    '-- An older version must never overwrite a newer one (offline devices may push late).',
    'create or replace function public.keep_newer_version() returns trigger language plpgsql as',
    '  $$ begin if new.updated_at < old.updated_at then return null; end if; return new; end $$;',
    '-- The owning organization of a row can never be changed.',
    'create or replace function public.lock_org_id() returns trigger language plpgsql as',
    "  $$ begin if new.org_id is distinct from old.org_id then raise exception 'org_id is immutable'; end if; return new; end $$;",
    'create or replace function public.record_audit_trail() returns trigger language plpgsql security definer set search_path = public as',
    '  $$ begin',
    '       insert into public.audit_trail (org_id, table_name, record_id, action, client_updated_at, soft_deleted)',
    '       values (new.org_id, tg_table_name, new.id, lower(tg_op), new.updated_at, new.deleted_at is not null);',
    '       return null;',
    '     end $$;', '');

  out('-- ---------------------------------------------------------------- data tables');
  const fks = [], idx = [], pol = [], trg = [];
  S.TABLES.forEach(function (name) {
    if (SERVER_MANAGED[name]) return;
    const t = S.T[name];
    out('create table if not exists public.' + name + ' (', '  id uuid primary key,', '  org_id uuid not null references public.organizations(id),');
    t.columns.forEach(function (c) {
      let line = '  ' + c.name + ' ' + TYPES[c.type];
      if (c.required) line += ' not null';
      if (c.type === 'bool') line += ' not null default false';
      out(line + ',');
      if (c.ref && !c.soft) fks.push('alter table public.' + name + ' drop constraint if exists ' + name + '_' + c.name + '_fkey;',
        'alter table public.' + name + ' add constraint ' + name + '_' + c.name + '_fkey foreign key (' + c.name + ') references public.' + c.ref + '(id);');
      if (c.ref) idx.push('create index if not exists ' + name + '_' + c.name + '_idx on public.' + name + ' (' + c.name + ');');
    });
    (CHECKS[name] || []).forEach(function (ck) {
      out('  constraint ' + name + '_' + ck[0] + '_check check (' + ck[0] + ' is null or ' + ck[0] + ' in (' + q(ck[1]) + ')),');
    });
    if (name === 'backlog_items') out("  constraint backlog_items_root_cause_confirmed_check check (root_cause_confidence = 'confirmed' or coalesce(root_cause, '') = ''),");
    if (name === 'audits') out('  constraint audits_target_check check (room_id is not null or configuration_id is not null),');
    if (name === 'spare_items') out('  constraint spare_items_quantity_check check (coalesce(quantity, 0) >= 0 and coalesce(min_stock, 0) >= 0),');
    out('  created_at timestamptz not null,', '  updated_at timestamptz not null,', '  created_by text,', '  updated_by text,', '  deleted_at timestamptz,', '  is_demo boolean not null default false,',
      '  server_updated_at timestamptz not null default clock_timestamp(),', '  constraint ' + name + '_updated_after_created check (updated_at >= created_at)', ');');
    idx.push('create index if not exists ' + name + '_sync_idx on public.' + name + ' (org_id, server_updated_at, id);');
    if (t.colNames.indexOf('code') >= 0) idx.push('create index if not exists ' + name + '_code_idx on public.' + name + ' (org_id, code);');
    pol.push('revoke all on table public.' + name + ' from anon, authenticated;',
      'grant select, insert, update on table public.' + name + ' to authenticated;',
      'alter table public.' + name + ' enable row level security;',
      'drop policy if exists ' + name + '_select on public.' + name + ';',
      'create policy ' + name + '_select on public.' + name + ' for select to authenticated using (public.is_org_member(org_id));',
      'drop policy if exists ' + name + '_insert on public.' + name + ';',
      'create policy ' + name + '_insert on public.' + name + ' for insert to authenticated with check (public.can_write_org(org_id));',
      'drop policy if exists ' + name + '_update on public.' + name + ';',
      'create policy ' + name + '_update on public.' + name + ' for update to authenticated using (public.can_write_org(org_id)) with check (public.can_write_org(org_id));');
    trg.push('drop trigger if exists a_keep_newer on public.' + name + ';',
      'create trigger a_keep_newer before update on public.' + name + ' for each row execute function public.keep_newer_version();',
      'drop trigger if exists b_lock_org on public.' + name + ';',
      'create trigger b_lock_org before update on public.' + name + ' for each row execute function public.lock_org_id();',
      'drop trigger if exists c_stamp on public.' + name + ';',
      'create trigger c_stamp before insert or update on public.' + name + ' for each row execute function public.stamp_server_updated_at();',
      'drop trigger if exists z_audit on public.' + name + ';',
      'create trigger z_audit after insert or update on public.' + name + ' for each row execute function public.record_audit_trail();');
  });
  out('', '-- ---------------------------------------------------------------- foreign keys (added after all tables exist)');
  fks.forEach(function (l) { out(l); });
  out('', '-- useful uniqueness within an organization',
    'create unique index if not exists room_configuration_members_unique on public.room_configuration_members (configuration_id, room_id) where deleted_at is null;',
    'create unique index if not exists backlog_it_links_unique on public.backlog_it_links (backlog_item_id, it_request_id) where deleted_at is null;',
    'create unique index if not exists followups_dedupe_unique on public.followups (org_id, dedupe_key) where deleted_at is null;');
  out('', '-- ---------------------------------------------------------------- indexes');
  idx.forEach(function (l) { out(l); });
  out('create index if not exists devices_identity_idx on public.devices (org_id, ip_address, mac_address, serial_number);',
    'create index if not exists activity_log_at_idx on public.activity_log (org_id, at desc);',
    'create index if not exists backlog_items_status_idx on public.backlog_items (org_id, status, priority);');
  out('', '-- ---------------------------------------------------------------- row-level security');
  pol.forEach(function (l) { out(l); });
  out('-- No DELETE privilege and no DELETE policy exist on any data table: clients cannot hard-delete. Deletion is a soft delete (deleted_at).');
  out('', '-- ---------------------------------------------------------------- triggers');
  trg.forEach(function (l) { out(l); });
  out('', '-- ---------------------------------------------------------------- photographs: private bucket, organization-scoped paths',
    '-- Object path convention: <org_id>/<photo_id>/original   and   <org_id>/<photo_id>/edited',
    "insert into storage.buckets (id, name, public) values ('audit-photos', 'audit-photos', false) on conflict (id) do update set public = false;",
    '-- The first path segment is compared as text (never cast to uuid), so an object with an unexpected name in any bucket',
    '-- cannot make a policy raise an error. The helper functions are security definer with a fixed search_path.',
    'create or replace function public.is_org_member_path(object_name text) returns boolean',
    '  language sql stable security definer set search_path = public as',
    "  $$ select exists (select 1 from public.org_members m where m.user_id = auth.uid() and m.org_id::text = split_part(object_name, '/', 1)) $$;",
    'create or replace function public.can_write_org_path(object_name text) returns boolean',
    '  language sql stable security definer set search_path = public as',
    "  $$ select exists (select 1 from public.org_members m where m.user_id = auth.uid() and m.role in ('admin', 'lead_auditor', 'auditor') and m.org_id::text = split_part(object_name, '/', 1)) $$;",
    'revoke all on function public.is_org_member_path(text), public.can_write_org_path(text) from public, anon;',
    'grant execute on function public.is_org_member_path(text), public.can_write_org_path(text) to authenticated;',
    'drop policy if exists "audit photos: members read" on storage.objects;',
    "create policy \"audit photos: members read\" on storage.objects for select to authenticated using (bucket_id = 'audit-photos' and public.is_org_member_path(name));",
    'drop policy if exists "audit photos: writers insert" on storage.objects;',
    "create policy \"audit photos: writers insert\" on storage.objects for insert to authenticated with check (bucket_id = 'audit-photos' and public.can_write_org_path(name));",
    'drop policy if exists "audit photos: writers update" on storage.objects;',
    "create policy \"audit photos: writers update\" on storage.objects for update to authenticated using (bucket_id = 'audit-photos' and public.can_write_org_path(name)) with check (bucket_id = 'audit-photos' and public.can_write_org_path(name));",
    '-- No delete policy: photograph binaries are retained; removal is an administrator action with the service role.', '',
    '-- ---------------------------------------------------------------- first-time setup (run as the project owner, once)',
    '-- 1. Create the auditor accounts under Authentication > Users (disable public sign-ups).',
    "-- 2. insert into public.organizations (name, short_code) values ('<organization name>', 'AVEI') returning id;",
    "-- 3. insert into public.org_members (org_id, user_id, role, full_name) values ('<organization id>', '<auth user id>', 'admin', '<name>');",
    '-- The service-role key is never used by the application and must never be placed in a browser.', '');
  const sql = L.join('\n');
  const pre = document.getElementById('sql');
  if (pre) pre.textContent = sql;
  const status = document.getElementById('status');
  fetch('/__save?name=schema.sql', { method: 'POST', body: sql }).then(function (r) { if (status) status.textContent = r.ok ? 'Saved to .testout/schema.sql (' + sql.length + ' characters, ' + L.length + ' lines)' : 'Save failed'; window.SCHEMA_SQL = { ok: r.ok, lines: L.length, chars: sql.length }; })
    .catch(function () { if (status) status.textContent = 'Could not reach the dev server'; window.SCHEMA_SQL = { ok: false }; });
})();
