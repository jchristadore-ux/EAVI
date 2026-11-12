-- =====================================================================================
-- AV ENVIRONMENT INTELLIGENCE  -  PostgreSQL / Supabase schema
-- GENERATED from app/js/schema.js by tools/gen-schema.js. Do not edit by hand; regenerate instead.
--
-- Apply once, in the Supabase SQL editor, to a project that has been approved for this data.
-- Contents: tables, foreign keys, indexes, value constraints, change triggers, server-side audit trail,
--           row-level security (organization membership + role), private photograph bucket and its policies.
-- Model:    every row belongs to an organization (org_id). A signed-in user may read rows of organizations they
--           are a member of; admin / lead_auditor / auditor may write; viewer is read-only. Rows are never hard-
--           deleted by clients (deleted_at marks a soft delete), so history and synchronisation stay consistent.
-- =====================================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- organizations and membership (server-managed)
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_code text not null default 'AVEI' check (short_code ~ '^[A-Z0-9]{2,8}$'),
  notes text,
  created_at timestamptz not null default now()
);
create table if not exists public.org_members (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'auditor' check (role in ('admin', 'lead_auditor', 'auditor', 'viewer')),
  full_name text,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index if not exists org_members_user_idx on public.org_members (user_id);

-- ---------------------------------------------------------------- access helpers (security definer, fixed search_path)
create or replace function public.is_org_member(o uuid) returns boolean
  language sql stable security definer set search_path = public as
  $$ select exists (select 1 from public.org_members m where m.org_id = o and m.user_id = auth.uid()) $$;
create or replace function public.can_write_org(o uuid) returns boolean
  language sql stable security definer set search_path = public as
  $$ select exists (select 1 from public.org_members m where m.org_id = o and m.user_id = auth.uid() and m.role in ('admin', 'lead_auditor', 'auditor')) $$;
create or replace function public.is_org_admin(o uuid) returns boolean
  language sql stable security definer set search_path = public as
  $$ select exists (select 1 from public.org_members m where m.org_id = o and m.user_id = auth.uid() and m.role = 'admin') $$;
revoke all on function public.is_org_member(uuid), public.can_write_org(uuid), public.is_org_admin(uuid) from public, anon;
grant execute on function public.is_org_member(uuid), public.can_write_org(uuid), public.is_org_admin(uuid) to authenticated;

-- Least privilege: signed-out visitors (anon) have no access at all; signed-in users get only what the policies below can allow.
revoke all on table public.organizations, public.org_members from anon, authenticated;
grant select on table public.organizations to authenticated;
grant select, insert, update, delete on table public.org_members to authenticated;
alter table public.organizations enable row level security;
alter table public.org_members enable row level security;
drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations for select to authenticated using (public.is_org_member(id));
drop policy if exists org_members_select on public.org_members;
create policy org_members_select on public.org_members for select to authenticated using (user_id = auth.uid() or public.is_org_admin(org_id));
drop policy if exists org_members_admin_write on public.org_members;
create policy org_members_admin_write on public.org_members for all to authenticated using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));

-- ---------------------------------------------------------------- server-side audit trail (append-only)
create table if not exists public.audit_trail (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  org_id uuid,
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('insert', 'update')),
  actor uuid default auth.uid(),
  client_updated_at timestamptz,
  soft_deleted boolean not null default false
);
create index if not exists audit_trail_org_at_idx on public.audit_trail (org_id, at desc);
create index if not exists audit_trail_record_idx on public.audit_trail (record_id);
revoke all on table public.audit_trail from anon, authenticated;
grant select on table public.audit_trail to authenticated;
alter table public.audit_trail enable row level security;
drop policy if exists audit_trail_select on public.audit_trail;
create policy audit_trail_select on public.audit_trail for select to authenticated using (public.is_org_admin(org_id));
-- no insert / update / delete policy: rows are written only by the trigger below (security definer)

-- ---------------------------------------------------------------- triggers shared by every data table
create or replace function public.stamp_server_updated_at() returns trigger language plpgsql as
  $$ begin new.server_updated_at := clock_timestamp(); return new; end $$;
-- An older version must never overwrite a newer one (offline devices may push late).
create or replace function public.keep_newer_version() returns trigger language plpgsql as
  $$ begin if new.updated_at < old.updated_at then return null; end if; return new; end $$;
-- The owning organization of a row can never be changed.
create or replace function public.lock_org_id() returns trigger language plpgsql as
  $$ begin if new.org_id is distinct from old.org_id then raise exception 'org_id is immutable'; end if; return new; end $$;
create or replace function public.record_audit_trail() returns trigger language plpgsql security definer set search_path = public as
  $$ begin
       insert into public.audit_trail (org_id, table_name, record_id, action, client_updated_at, soft_deleted)
       values (new.org_id, tg_table_name, new.id, lower(tg_op), new.updated_at, new.deleted_at is not null);
       return null;
     end $$;

-- ---------------------------------------------------------------- data tables
create table if not exists public.buildings (
  id uuid primary key,
  org_id uuid not null references public.organizations(id),
  name text,
  address text,
  identifier text,
  floors_count integer,
  site_contact text,
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text,
  updated_by text,
  deleted_at timestamptz,
  is_demo boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint buildings_updated_after_created check (updated_at >= created_at)
);
create table if not exists public.floors (
  id uuid primary key,
  org_id uuid not null references public.organizations(id),
  building_id uuid not null,
  number text,
  designation text,
  infrastructure_notes text,
  audit_status_override text,
  sort_order numeric,
  archived boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text,
  updated_by text,
  deleted_at timestamptz,
  is_demo boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint floors_updated_after_created check (updated_at >= created_at)
);
create table if not exists public.areas (
  id uuid primary key,
  org_id uuid not null references public.organizations(id),
  building_id uuid not null,
  floor_id uuid not null,
  name text,
  description text,
  archived boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text,
  updated_by text,
  deleted_at timestamptz,
  is_demo boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint areas_updated_after_created check (updated_at >= created_at)
);
create table if not exists public.rooms (
  id uuid primary key,
  org_id uuid not null references public.organizations(id),
  building_id uuid not null,
  floor_id uuid not null,
  area_id uuid,
  code text,
  name text,
  number text,
  room_type text,
  capacity integer,
  criticality text,
  conferencing_platform text,
  control_platform text,
  dsp_platform text,
  display_config text,
  camera_config text,
  microphone_config text,
  scheduling_platform text,
  operational_status text,
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text,
  updated_by text,
  deleted_at timestamptz,
  is_demo boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint rooms_updated_after_created check (updated_at >= created_at)
);
create table if not exists public.room_configurations (
  id uuid primary key,
  org_id uuid not null references public.organizations(id),
  building_id uuid not null,
  floor_id uuid not null,
  code text,
  name text,
  description text,
  capacity integer,
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text,
  updated_by text,
  deleted_at timestamptz,
  is_demo boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint room_configurations_updated_after_created check (updated_at >= created_at)
);
create table if not exists public.room_configuration_members (
  id uuid primary key,
  org_id uuid not null references public.organizations(id),
  configuration_id uuid not null,
  room_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text,
  updated_by text,
  deleted_at timestamptz,
  is_demo boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint room_configuration_members_updated_after_created check (updated_at >= created_at)
);
create table if not exists public.racks (
  id uuid primary key,
  org_id uuid not null references public.organizations(id),
  building_id uuid not null,
  floor_id uuid not null,
  room_id uuid not null,
  code text,
  name text,
  location text,
  height_ru integer,
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text,
  updated_by text,
  deleted_at timestamptz,
  is_demo boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint racks_updated_after_created check (updated_at >= created_at)
);
create table if not exists public.audits (
  id uuid primary key,
  org_id uuid not null references public.organizations(id),
  code text,
  building_id uuid not null,
  floor_id uuid not null,
  room_id uuid,
  configuration_id uuid,
  audit_date date,
  auditor text,
  status text,
  operational_status text,
  started_at timestamptz,
  completed_at timestamptz,
  verified_at timestamptz,
  summary_snapshot jsonb,
  general_notes text,
  constraint audits_status_check check (status is null or status in ('in_progress', 'complete', 'verified', '')),
  constraint audits_target_check check (room_id is not null or configuration_id is not null),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text,
  updated_by text,
  deleted_at timestamptz,
  is_demo boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint audits_updated_after_created check (updated_at >= created_at)
);
create table if not exists public.audit_sections (
  id uuid primary key,
  org_id uuid not null references public.organizations(id),
  audit_id uuid not null,
  section_key text,
  state text,
  notes text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text,
  updated_by text,
  deleted_at timestamptz,
  is_demo boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint audit_sections_updated_after_created check (updated_at >= created_at)
);
create table if not exists public.audit_notes (
  id uuid primary key,
  org_id uuid not null references public.organizations(id),
  audit_id uuid not null,
  room_id uuid,
  section_key text,
  note_type text,
  text text,
  constraint audit_notes_note_type_check check (note_type is null or note_type in ('observed_fact', 'auditor_interpretation', 'unverified_hypothesis', 'recommended_action', '')),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text,
  updated_by text,
  deleted_at timestamptz,
  is_demo boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint audit_notes_updated_after_created check (updated_at >= created_at)
);
create table if not exists public.functional_tests (
  id uuid primary key,
  org_id uuid not null references public.organizations(id),
  audit_id uuid not null,
  room_id uuid,
  category text,
  test_key text,
  test_name text,
  result text,
  comment text,
  tested_at timestamptz,
  finding_id uuid,
  suggestion_state text,
  is_custom boolean not null default false,
  sort_order integer,
  constraint functional_tests_result_check check (result is null or result in ('pass', 'fail', 'investigate', 'na', 'not_tested', '')),
  constraint functional_tests_suggestion_state_check check (suggestion_state is null or suggestion_state in ('none', 'pending', 'accepted', 'dismissed', '')),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text,
  updated_by text,
  deleted_at timestamptz,
  is_demo boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint functional_tests_updated_after_created check (updated_at >= created_at)
);
create table if not exists public.network_checks (
  id uuid primary key,
  org_id uuid not null references public.organizations(id),
  audit_id uuid not null,
  room_id uuid,
  check_key text,
  check_name text,
  status text,
  comment text,
  checked_at timestamptz,
  sort_order integer,
  constraint network_checks_status_check check (status is null or status in ('verified', 'issue', 'awaiting_it', 'na', 'not_checked', '')),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text,
  updated_by text,
  deleted_at timestamptz,
  is_demo boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint network_checks_updated_after_created check (updated_at >= created_at)
);
create table if not exists public.infra_assets (
  id uuid primary key,
  org_id uuid not null references public.organizations(id),
  code text,
  asset_type text,
  name text,
  identifier text,
  description text,
  building_id uuid,
  floor_id uuid,
  room_id uuid,
  device_id uuid,
  model text,
  hostname text,
  management_ip text,
  ip_address text,
  mac_address text,
  vlan text,
  subnet text,
  gateway text,
  assignment_type text,
  poe_budget_w numeric,
  poe_used_w numeric,
  validation_status text,
  source text,
  notes text,
  archived boolean not null default false,
  constraint infra_assets_asset_type_check check (asset_type is null or asset_type in ('switch', 'vlan', 'subnet', 'ip_range', 'dhcp_reservation', 'static_ip', 'dns_record', 'dns_server', 'ntp_server', 'firewall_rule', 'multicast', 'qos', 'monitoring', 'other', '')),
  constraint infra_assets_validation_status_check check (validation_status is null or validation_status in ('observed', 'from_docs', 'it_validated', 'awaiting_it', 'unknown', '')),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text,
  updated_by text,
  deleted_at timestamptz,
  is_demo boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint infra_assets_updated_after_created check (updated_at >= created_at)
);
create table if not exists public.devices (
  id uuid primary key,
  org_id uuid not null references public.organizations(id),
  code text,
  building_id uuid not null,
  floor_id uuid not null,
  room_id uuid,
  rack_id uuid,
  audit_id uuid,
  category text,
  custom_category text,
  role text,
  manufacturer text,
  model text,
  hostname text,
  ip_address text,
  ip_status text,
  mac_address text,
  mac_status text,
  serial_number text,
  serial_status text,
  subnet text,
  vlan text,
  ip_assignment text,
  dns_name text,
  firmware_version text,
  app_version text,
  switch_asset_id uuid,
  connected_switch text,
  switch_port text,
  connection_type text,
  poe_required text,
  poe_class text,
  power_source text,
  rack_location text,
  monitoring_portal text,
  management_url text,
  warranty_info text,
  support_expiration date,
  notes text,
  archived boolean not null default false,
  constraint devices_ip_status_check check (ip_status is null or ip_status in ('verified_onsite', 'verified_mgmt', 'awaiting_it', 'awaiting_vendor', 'unknown', 'not_applicable', '')),
  constraint devices_mac_status_check check (mac_status is null or mac_status in ('verified_onsite', 'verified_mgmt', 'awaiting_it', 'awaiting_vendor', 'unknown', 'not_applicable', '')),
  constraint devices_serial_status_check check (serial_status is null or serial_status in ('verified_onsite', 'verified_mgmt', 'awaiting_it', 'awaiting_vendor', 'unknown', 'not_applicable', '')),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text,
  updated_by text,
  deleted_at timestamptz,
  is_demo boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint devices_updated_after_created check (updated_at >= created_at)
);
create table if not exists public.switch_ports (
  id uuid primary key,
  org_id uuid not null references public.organizations(id),
  switch_asset_id uuid not null,
  port text,
  description text,
  mode text,
  vlan text,
  tagged_vlans text,
  untagged_vlan text,
  poe_status text,
  poe_class text,
  link_speed text,
  device_id uuid,
  validation_status text,
  notes text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text,
  updated_by text,
  deleted_at timestamptz,
  is_demo boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint switch_ports_updated_after_created check (updated_at >= created_at)
);
create table if not exists public.network_links (
  id uuid primary key,
  org_id uuid not null references public.organizations(id),
  kind text,
  from_type text,
  from_id text,
  to_type text,
  to_id text,
  from_port text,
  to_port text,
  dep_type text,
  description text,
  status text,
  notes text,
  constraint network_links_kind_check check (kind is null or kind in ('uplink', 'dependency', '')),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text,
  updated_by text,
  deleted_at timestamptz,
  is_demo boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint network_links_updated_after_created check (updated_at >= created_at)
);
create table if not exists public.backlog_items (
  id uuid primary key,
  org_id uuid not null references public.organizations(id),
  code text,
  building_id uuid,
  floor_id uuid,
  room_id uuid,
  device_id uuid,
  category text,
  title text,
  problem_statement text,
  observed_evidence text,
  suspected_cause text,
  root_cause text,
  root_cause_confidence text,
  root_cause_basis text,
  recommendation text,
  strategy text,
  expected_outcome text,
  operational_risk text,
  meeting_impact text,
  frequency text,
  user_impact text,
  business_impact text,
  user_friction text,
  risk_level text,
  effort text,
  estimated_cost numeric,
  safety_concern boolean not null default false,
  exec_visibility boolean not null default false,
  dependencies text,
  owner text,
  requested_by text,
  priority text,
  priority_rationale text,
  status text,
  status_changed_at timestamptz,
  target_date date,
  completed_at timestamptz,
  systemic boolean not null default false,
  constraint backlog_items_priority_check check (priority is null or priority in ('', 'P1', 'P2', 'P3')),
  constraint backlog_items_status_check check (status is null or status in ('New Discovery', 'Under Investigation', 'Pending PepperDash Review', 'Pending Client IT', 'Pending Client Approval', 'Approved', 'Scheduled', 'In Progress', 'Blocked', 'Completed', 'Deferred', 'Rejected', '')),
  constraint backlog_items_root_cause_confidence_check check (root_cause_confidence is null or root_cause_confidence in ('not_determined', 'hypothesis', 'probable', 'confirmed', '')),
  constraint backlog_items_root_cause_confirmed_check check (root_cause_confidence = 'confirmed' or coalesce(root_cause, '') = ''),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text,
  updated_by text,
  deleted_at timestamptz,
  is_demo boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint backlog_items_updated_after_created check (updated_at >= created_at)
);
create table if not exists public.findings (
  id uuid primary key,
  org_id uuid not null references public.organizations(id),
  code text,
  building_id uuid,
  floor_id uuid,
  room_id uuid,
  device_id uuid,
  audit_id uuid,
  test_id uuid,
  category text,
  title text,
  observation text,
  classification text,
  interpretation text,
  hypothesis text,
  recommended_action text,
  priority_hint text,
  status text,
  backlog_item_id uuid,
  source text,
  source_key text,
  constraint findings_status_check check (status is null or status in ('open', 'linked', 'duplicate', 'dismissed', '')),
  constraint findings_classification_check check (classification is null or classification in ('observed_fact', 'auditor_interpretation', 'unverified_hypothesis', '')),
  constraint findings_priority_hint_check check (priority_hint is null or priority_hint in ('', 'P1', 'P2', 'P3')),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text,
  updated_by text,
  deleted_at timestamptz,
  is_demo boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint findings_updated_after_created check (updated_at >= created_at)
);
create table if not exists public.it_requests (
  id uuid primary key,
  org_id uuid not null references public.organizations(id),
  code text,
  topic text,
  description text,
  requested_from text,
  vendor_name text,
  request_type text,
  building_id uuid,
  floor_id uuid,
  room_id uuid,
  device_id uuid,
  reason text,
  needed_for text,
  priority text,
  date_requested date,
  target_date date,
  status text,
  response text,
  response_date date,
  documentation text,
  source_key text,
  constraint it_requests_status_check check (status is null or status in ('Draft', 'Submitted', 'Acknowledged', 'In Progress', 'Awaiting Response', 'Answered', 'Closed', 'Cancelled', '')),
  constraint it_requests_requested_from_check check (requested_from is null or requested_from in ('Client IT', 'PepperDash', 'Vendor', 'Facilities', '')),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text,
  updated_by text,
  deleted_at timestamptz,
  is_demo boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint it_requests_updated_after_created check (updated_at >= created_at)
);
create table if not exists public.backlog_it_links (
  id uuid primary key,
  org_id uuid not null references public.organizations(id),
  backlog_item_id uuid not null,
  it_request_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text,
  updated_by text,
  deleted_at timestamptz,
  is_demo boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint backlog_it_links_updated_after_created check (updated_at >= created_at)
);
create table if not exists public.spare_items (
  id uuid primary key,
  org_id uuid not null references public.organizations(id),
  code text,
  name text,
  manufacturer text,
  model text,
  part_number text,
  serial_number text,
  quantity integer,
  min_stock integer,
  storage_location text,
  building_id uuid,
  floor_id uuid,
  compatibility text,
  condition text,
  warranty text,
  lifecycle text,
  eol_date date,
  notes text,
  archived boolean not null default false,
  constraint spare_items_lifecycle_check check (lifecycle is null or lifecycle in ('active', 'approaching_eol', 'eol', 'unknown', '')),
  constraint spare_items_quantity_check check (coalesce(quantity, 0) >= 0 and coalesce(min_stock, 0) >= 0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text,
  updated_by text,
  deleted_at timestamptz,
  is_demo boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint spare_items_updated_after_created check (updated_at >= created_at)
);
create table if not exists public.photos (
  id uuid primary key,
  org_id uuid not null references public.organizations(id),
  code text,
  building_id uuid,
  floor_id uuid,
  room_id uuid,
  audit_id uuid,
  device_id uuid,
  finding_id uuid,
  test_id uuid,
  backlog_item_id uuid,
  it_request_id uuid,
  spare_item_id uuid,
  category text,
  description text,
  taken_at timestamptz,
  original_filename text,
  mime text,
  size_bytes integer,
  width integer,
  height integer,
  has_edit boolean not null default false,
  thumb text,
  remote_ref text,
  remote_edit_ref text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text,
  updated_by text,
  deleted_at timestamptz,
  is_demo boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint photos_updated_after_created check (updated_at >= created_at)
);
create table if not exists public.followups (
  id uuid primary key,
  org_id uuid not null references public.organizations(id),
  kind text,
  device_id uuid,
  room_id uuid,
  title text,
  detail text,
  suggested_party text,
  status text,
  resolved_at timestamptz,
  it_request_id uuid,
  dedupe_key text,
  constraint followups_status_check check (status is null or status in ('open', 'resolved', 'dismissed', '')),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text,
  updated_by text,
  deleted_at timestamptz,
  is_demo boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint followups_updated_after_created check (updated_at >= created_at)
);
create table if not exists public.insight_states (
  id uuid primary key,
  org_id uuid not null references public.organizations(id),
  insight_key text,
  state text,
  note text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text,
  updated_by text,
  deleted_at timestamptz,
  is_demo boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint insight_states_updated_after_created check (updated_at >= created_at)
);
create table if not exists public.activity_log (
  id uuid primary key,
  org_id uuid not null references public.organizations(id),
  at timestamptz,
  actor text,
  action text,
  entity_type text,
  entity_id text,
  entity_code text,
  summary text,
  building_id text,
  floor_id text,
  room_id text,
  changes jsonb,
  detail boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text,
  updated_by text,
  deleted_at timestamptz,
  is_demo boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint activity_log_updated_after_created check (updated_at >= created_at)
);
create table if not exists public.exports (
  id uuid primary key,
  org_id uuid not null references public.organizations(id),
  code text,
  mode text,
  window_start timestamptz,
  window_end timestamptz,
  baseline_export_id text,
  baseline_at timestamptz,
  filters jsonb,
  counts jsonb,
  validation jsonb,
  summary jsonb,
  filename text,
  photo_mode text,
  status text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text,
  updated_by text,
  deleted_at timestamptz,
  is_demo boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint exports_updated_after_created check (updated_at >= created_at)
);

-- ---------------------------------------------------------------- foreign keys (added after all tables exist)
alter table public.floors drop constraint if exists floors_building_id_fkey;
alter table public.floors add constraint floors_building_id_fkey foreign key (building_id) references public.buildings(id);
alter table public.areas drop constraint if exists areas_building_id_fkey;
alter table public.areas add constraint areas_building_id_fkey foreign key (building_id) references public.buildings(id);
alter table public.areas drop constraint if exists areas_floor_id_fkey;
alter table public.areas add constraint areas_floor_id_fkey foreign key (floor_id) references public.floors(id);
alter table public.rooms drop constraint if exists rooms_building_id_fkey;
alter table public.rooms add constraint rooms_building_id_fkey foreign key (building_id) references public.buildings(id);
alter table public.rooms drop constraint if exists rooms_floor_id_fkey;
alter table public.rooms add constraint rooms_floor_id_fkey foreign key (floor_id) references public.floors(id);
alter table public.rooms drop constraint if exists rooms_area_id_fkey;
alter table public.rooms add constraint rooms_area_id_fkey foreign key (area_id) references public.areas(id);
alter table public.room_configurations drop constraint if exists room_configurations_building_id_fkey;
alter table public.room_configurations add constraint room_configurations_building_id_fkey foreign key (building_id) references public.buildings(id);
alter table public.room_configurations drop constraint if exists room_configurations_floor_id_fkey;
alter table public.room_configurations add constraint room_configurations_floor_id_fkey foreign key (floor_id) references public.floors(id);
alter table public.room_configuration_members drop constraint if exists room_configuration_members_configuration_id_fkey;
alter table public.room_configuration_members add constraint room_configuration_members_configuration_id_fkey foreign key (configuration_id) references public.room_configurations(id);
alter table public.room_configuration_members drop constraint if exists room_configuration_members_room_id_fkey;
alter table public.room_configuration_members add constraint room_configuration_members_room_id_fkey foreign key (room_id) references public.rooms(id);
alter table public.racks drop constraint if exists racks_building_id_fkey;
alter table public.racks add constraint racks_building_id_fkey foreign key (building_id) references public.buildings(id);
alter table public.racks drop constraint if exists racks_floor_id_fkey;
alter table public.racks add constraint racks_floor_id_fkey foreign key (floor_id) references public.floors(id);
alter table public.racks drop constraint if exists racks_room_id_fkey;
alter table public.racks add constraint racks_room_id_fkey foreign key (room_id) references public.rooms(id);
alter table public.audits drop constraint if exists audits_building_id_fkey;
alter table public.audits add constraint audits_building_id_fkey foreign key (building_id) references public.buildings(id);
alter table public.audits drop constraint if exists audits_floor_id_fkey;
alter table public.audits add constraint audits_floor_id_fkey foreign key (floor_id) references public.floors(id);
alter table public.audits drop constraint if exists audits_room_id_fkey;
alter table public.audits add constraint audits_room_id_fkey foreign key (room_id) references public.rooms(id);
alter table public.audits drop constraint if exists audits_configuration_id_fkey;
alter table public.audits add constraint audits_configuration_id_fkey foreign key (configuration_id) references public.room_configurations(id);
alter table public.audit_sections drop constraint if exists audit_sections_audit_id_fkey;
alter table public.audit_sections add constraint audit_sections_audit_id_fkey foreign key (audit_id) references public.audits(id);
alter table public.audit_notes drop constraint if exists audit_notes_audit_id_fkey;
alter table public.audit_notes add constraint audit_notes_audit_id_fkey foreign key (audit_id) references public.audits(id);
alter table public.audit_notes drop constraint if exists audit_notes_room_id_fkey;
alter table public.audit_notes add constraint audit_notes_room_id_fkey foreign key (room_id) references public.rooms(id);
alter table public.functional_tests drop constraint if exists functional_tests_audit_id_fkey;
alter table public.functional_tests add constraint functional_tests_audit_id_fkey foreign key (audit_id) references public.audits(id);
alter table public.functional_tests drop constraint if exists functional_tests_room_id_fkey;
alter table public.functional_tests add constraint functional_tests_room_id_fkey foreign key (room_id) references public.rooms(id);
alter table public.network_checks drop constraint if exists network_checks_audit_id_fkey;
alter table public.network_checks add constraint network_checks_audit_id_fkey foreign key (audit_id) references public.audits(id);
alter table public.network_checks drop constraint if exists network_checks_room_id_fkey;
alter table public.network_checks add constraint network_checks_room_id_fkey foreign key (room_id) references public.rooms(id);
alter table public.infra_assets drop constraint if exists infra_assets_building_id_fkey;
alter table public.infra_assets add constraint infra_assets_building_id_fkey foreign key (building_id) references public.buildings(id);
alter table public.infra_assets drop constraint if exists infra_assets_floor_id_fkey;
alter table public.infra_assets add constraint infra_assets_floor_id_fkey foreign key (floor_id) references public.floors(id);
alter table public.infra_assets drop constraint if exists infra_assets_room_id_fkey;
alter table public.infra_assets add constraint infra_assets_room_id_fkey foreign key (room_id) references public.rooms(id);
alter table public.devices drop constraint if exists devices_building_id_fkey;
alter table public.devices add constraint devices_building_id_fkey foreign key (building_id) references public.buildings(id);
alter table public.devices drop constraint if exists devices_floor_id_fkey;
alter table public.devices add constraint devices_floor_id_fkey foreign key (floor_id) references public.floors(id);
alter table public.devices drop constraint if exists devices_room_id_fkey;
alter table public.devices add constraint devices_room_id_fkey foreign key (room_id) references public.rooms(id);
alter table public.devices drop constraint if exists devices_rack_id_fkey;
alter table public.devices add constraint devices_rack_id_fkey foreign key (rack_id) references public.racks(id);
alter table public.switch_ports drop constraint if exists switch_ports_switch_asset_id_fkey;
alter table public.switch_ports add constraint switch_ports_switch_asset_id_fkey foreign key (switch_asset_id) references public.infra_assets(id);
alter table public.backlog_items drop constraint if exists backlog_items_building_id_fkey;
alter table public.backlog_items add constraint backlog_items_building_id_fkey foreign key (building_id) references public.buildings(id);
alter table public.backlog_items drop constraint if exists backlog_items_floor_id_fkey;
alter table public.backlog_items add constraint backlog_items_floor_id_fkey foreign key (floor_id) references public.floors(id);
alter table public.backlog_items drop constraint if exists backlog_items_room_id_fkey;
alter table public.backlog_items add constraint backlog_items_room_id_fkey foreign key (room_id) references public.rooms(id);
alter table public.findings drop constraint if exists findings_building_id_fkey;
alter table public.findings add constraint findings_building_id_fkey foreign key (building_id) references public.buildings(id);
alter table public.findings drop constraint if exists findings_floor_id_fkey;
alter table public.findings add constraint findings_floor_id_fkey foreign key (floor_id) references public.floors(id);
alter table public.findings drop constraint if exists findings_room_id_fkey;
alter table public.findings add constraint findings_room_id_fkey foreign key (room_id) references public.rooms(id);
alter table public.it_requests drop constraint if exists it_requests_building_id_fkey;
alter table public.it_requests add constraint it_requests_building_id_fkey foreign key (building_id) references public.buildings(id);
alter table public.it_requests drop constraint if exists it_requests_floor_id_fkey;
alter table public.it_requests add constraint it_requests_floor_id_fkey foreign key (floor_id) references public.floors(id);
alter table public.it_requests drop constraint if exists it_requests_room_id_fkey;
alter table public.it_requests add constraint it_requests_room_id_fkey foreign key (room_id) references public.rooms(id);
alter table public.backlog_it_links drop constraint if exists backlog_it_links_backlog_item_id_fkey;
alter table public.backlog_it_links add constraint backlog_it_links_backlog_item_id_fkey foreign key (backlog_item_id) references public.backlog_items(id);
alter table public.backlog_it_links drop constraint if exists backlog_it_links_it_request_id_fkey;
alter table public.backlog_it_links add constraint backlog_it_links_it_request_id_fkey foreign key (it_request_id) references public.it_requests(id);
alter table public.spare_items drop constraint if exists spare_items_building_id_fkey;
alter table public.spare_items add constraint spare_items_building_id_fkey foreign key (building_id) references public.buildings(id);
alter table public.spare_items drop constraint if exists spare_items_floor_id_fkey;
alter table public.spare_items add constraint spare_items_floor_id_fkey foreign key (floor_id) references public.floors(id);
alter table public.photos drop constraint if exists photos_building_id_fkey;
alter table public.photos add constraint photos_building_id_fkey foreign key (building_id) references public.buildings(id);
alter table public.photos drop constraint if exists photos_floor_id_fkey;
alter table public.photos add constraint photos_floor_id_fkey foreign key (floor_id) references public.floors(id);
alter table public.photos drop constraint if exists photos_room_id_fkey;
alter table public.photos add constraint photos_room_id_fkey foreign key (room_id) references public.rooms(id);

-- useful uniqueness within an organization
create unique index if not exists room_configuration_members_unique on public.room_configuration_members (configuration_id, room_id) where deleted_at is null;
create unique index if not exists backlog_it_links_unique on public.backlog_it_links (backlog_item_id, it_request_id) where deleted_at is null;
create unique index if not exists followups_dedupe_unique on public.followups (org_id, dedupe_key) where deleted_at is null;

-- ---------------------------------------------------------------- indexes
create index if not exists buildings_sync_idx on public.buildings (org_id, server_updated_at, id);
create index if not exists floors_building_id_idx on public.floors (building_id);
create index if not exists floors_sync_idx on public.floors (org_id, server_updated_at, id);
create index if not exists areas_building_id_idx on public.areas (building_id);
create index if not exists areas_floor_id_idx on public.areas (floor_id);
create index if not exists areas_sync_idx on public.areas (org_id, server_updated_at, id);
create index if not exists rooms_building_id_idx on public.rooms (building_id);
create index if not exists rooms_floor_id_idx on public.rooms (floor_id);
create index if not exists rooms_area_id_idx on public.rooms (area_id);
create index if not exists rooms_sync_idx on public.rooms (org_id, server_updated_at, id);
create index if not exists rooms_code_idx on public.rooms (org_id, code);
create index if not exists room_configurations_building_id_idx on public.room_configurations (building_id);
create index if not exists room_configurations_floor_id_idx on public.room_configurations (floor_id);
create index if not exists room_configurations_sync_idx on public.room_configurations (org_id, server_updated_at, id);
create index if not exists room_configurations_code_idx on public.room_configurations (org_id, code);
create index if not exists room_configuration_members_configuration_id_idx on public.room_configuration_members (configuration_id);
create index if not exists room_configuration_members_room_id_idx on public.room_configuration_members (room_id);
create index if not exists room_configuration_members_sync_idx on public.room_configuration_members (org_id, server_updated_at, id);
create index if not exists racks_building_id_idx on public.racks (building_id);
create index if not exists racks_floor_id_idx on public.racks (floor_id);
create index if not exists racks_room_id_idx on public.racks (room_id);
create index if not exists racks_sync_idx on public.racks (org_id, server_updated_at, id);
create index if not exists racks_code_idx on public.racks (org_id, code);
create index if not exists audits_building_id_idx on public.audits (building_id);
create index if not exists audits_floor_id_idx on public.audits (floor_id);
create index if not exists audits_room_id_idx on public.audits (room_id);
create index if not exists audits_configuration_id_idx on public.audits (configuration_id);
create index if not exists audits_sync_idx on public.audits (org_id, server_updated_at, id);
create index if not exists audits_code_idx on public.audits (org_id, code);
create index if not exists audit_sections_audit_id_idx on public.audit_sections (audit_id);
create index if not exists audit_sections_sync_idx on public.audit_sections (org_id, server_updated_at, id);
create index if not exists audit_notes_audit_id_idx on public.audit_notes (audit_id);
create index if not exists audit_notes_room_id_idx on public.audit_notes (room_id);
create index if not exists audit_notes_sync_idx on public.audit_notes (org_id, server_updated_at, id);
create index if not exists functional_tests_audit_id_idx on public.functional_tests (audit_id);
create index if not exists functional_tests_room_id_idx on public.functional_tests (room_id);
create index if not exists functional_tests_finding_id_idx on public.functional_tests (finding_id);
create index if not exists functional_tests_sync_idx on public.functional_tests (org_id, server_updated_at, id);
create index if not exists network_checks_audit_id_idx on public.network_checks (audit_id);
create index if not exists network_checks_room_id_idx on public.network_checks (room_id);
create index if not exists network_checks_sync_idx on public.network_checks (org_id, server_updated_at, id);
create index if not exists infra_assets_building_id_idx on public.infra_assets (building_id);
create index if not exists infra_assets_floor_id_idx on public.infra_assets (floor_id);
create index if not exists infra_assets_room_id_idx on public.infra_assets (room_id);
create index if not exists infra_assets_device_id_idx on public.infra_assets (device_id);
create index if not exists infra_assets_sync_idx on public.infra_assets (org_id, server_updated_at, id);
create index if not exists infra_assets_code_idx on public.infra_assets (org_id, code);
create index if not exists devices_building_id_idx on public.devices (building_id);
create index if not exists devices_floor_id_idx on public.devices (floor_id);
create index if not exists devices_room_id_idx on public.devices (room_id);
create index if not exists devices_rack_id_idx on public.devices (rack_id);
create index if not exists devices_audit_id_idx on public.devices (audit_id);
create index if not exists devices_switch_asset_id_idx on public.devices (switch_asset_id);
create index if not exists devices_sync_idx on public.devices (org_id, server_updated_at, id);
create index if not exists devices_code_idx on public.devices (org_id, code);
create index if not exists switch_ports_switch_asset_id_idx on public.switch_ports (switch_asset_id);
create index if not exists switch_ports_device_id_idx on public.switch_ports (device_id);
create index if not exists switch_ports_sync_idx on public.switch_ports (org_id, server_updated_at, id);
create index if not exists network_links_sync_idx on public.network_links (org_id, server_updated_at, id);
create index if not exists backlog_items_building_id_idx on public.backlog_items (building_id);
create index if not exists backlog_items_floor_id_idx on public.backlog_items (floor_id);
create index if not exists backlog_items_room_id_idx on public.backlog_items (room_id);
create index if not exists backlog_items_device_id_idx on public.backlog_items (device_id);
create index if not exists backlog_items_sync_idx on public.backlog_items (org_id, server_updated_at, id);
create index if not exists backlog_items_code_idx on public.backlog_items (org_id, code);
create index if not exists findings_building_id_idx on public.findings (building_id);
create index if not exists findings_floor_id_idx on public.findings (floor_id);
create index if not exists findings_room_id_idx on public.findings (room_id);
create index if not exists findings_device_id_idx on public.findings (device_id);
create index if not exists findings_audit_id_idx on public.findings (audit_id);
create index if not exists findings_test_id_idx on public.findings (test_id);
create index if not exists findings_backlog_item_id_idx on public.findings (backlog_item_id);
create index if not exists findings_sync_idx on public.findings (org_id, server_updated_at, id);
create index if not exists findings_code_idx on public.findings (org_id, code);
create index if not exists it_requests_building_id_idx on public.it_requests (building_id);
create index if not exists it_requests_floor_id_idx on public.it_requests (floor_id);
create index if not exists it_requests_room_id_idx on public.it_requests (room_id);
create index if not exists it_requests_device_id_idx on public.it_requests (device_id);
create index if not exists it_requests_sync_idx on public.it_requests (org_id, server_updated_at, id);
create index if not exists it_requests_code_idx on public.it_requests (org_id, code);
create index if not exists backlog_it_links_backlog_item_id_idx on public.backlog_it_links (backlog_item_id);
create index if not exists backlog_it_links_it_request_id_idx on public.backlog_it_links (it_request_id);
create index if not exists backlog_it_links_sync_idx on public.backlog_it_links (org_id, server_updated_at, id);
create index if not exists spare_items_building_id_idx on public.spare_items (building_id);
create index if not exists spare_items_floor_id_idx on public.spare_items (floor_id);
create index if not exists spare_items_sync_idx on public.spare_items (org_id, server_updated_at, id);
create index if not exists spare_items_code_idx on public.spare_items (org_id, code);
create index if not exists photos_building_id_idx on public.photos (building_id);
create index if not exists photos_floor_id_idx on public.photos (floor_id);
create index if not exists photos_room_id_idx on public.photos (room_id);
create index if not exists photos_audit_id_idx on public.photos (audit_id);
create index if not exists photos_device_id_idx on public.photos (device_id);
create index if not exists photos_finding_id_idx on public.photos (finding_id);
create index if not exists photos_test_id_idx on public.photos (test_id);
create index if not exists photos_backlog_item_id_idx on public.photos (backlog_item_id);
create index if not exists photos_it_request_id_idx on public.photos (it_request_id);
create index if not exists photos_spare_item_id_idx on public.photos (spare_item_id);
create index if not exists photos_sync_idx on public.photos (org_id, server_updated_at, id);
create index if not exists photos_code_idx on public.photos (org_id, code);
create index if not exists followups_device_id_idx on public.followups (device_id);
create index if not exists followups_room_id_idx on public.followups (room_id);
create index if not exists followups_it_request_id_idx on public.followups (it_request_id);
create index if not exists followups_sync_idx on public.followups (org_id, server_updated_at, id);
create index if not exists insight_states_sync_idx on public.insight_states (org_id, server_updated_at, id);
create index if not exists activity_log_sync_idx on public.activity_log (org_id, server_updated_at, id);
create index if not exists exports_sync_idx on public.exports (org_id, server_updated_at, id);
create index if not exists exports_code_idx on public.exports (org_id, code);
create index if not exists devices_identity_idx on public.devices (org_id, ip_address, mac_address, serial_number);
create index if not exists activity_log_at_idx on public.activity_log (org_id, at desc);
create index if not exists backlog_items_status_idx on public.backlog_items (org_id, status, priority);

-- ---------------------------------------------------------------- row-level security
revoke all on table public.buildings from anon, authenticated;
grant select, insert, update on table public.buildings to authenticated;
alter table public.buildings enable row level security;
drop policy if exists buildings_select on public.buildings;
create policy buildings_select on public.buildings for select to authenticated using (public.is_org_member(org_id));
drop policy if exists buildings_insert on public.buildings;
create policy buildings_insert on public.buildings for insert to authenticated with check (public.can_write_org(org_id));
drop policy if exists buildings_update on public.buildings;
create policy buildings_update on public.buildings for update to authenticated using (public.can_write_org(org_id)) with check (public.can_write_org(org_id));
revoke all on table public.floors from anon, authenticated;
grant select, insert, update on table public.floors to authenticated;
alter table public.floors enable row level security;
drop policy if exists floors_select on public.floors;
create policy floors_select on public.floors for select to authenticated using (public.is_org_member(org_id));
drop policy if exists floors_insert on public.floors;
create policy floors_insert on public.floors for insert to authenticated with check (public.can_write_org(org_id));
drop policy if exists floors_update on public.floors;
create policy floors_update on public.floors for update to authenticated using (public.can_write_org(org_id)) with check (public.can_write_org(org_id));
revoke all on table public.areas from anon, authenticated;
grant select, insert, update on table public.areas to authenticated;
alter table public.areas enable row level security;
drop policy if exists areas_select on public.areas;
create policy areas_select on public.areas for select to authenticated using (public.is_org_member(org_id));
drop policy if exists areas_insert on public.areas;
create policy areas_insert on public.areas for insert to authenticated with check (public.can_write_org(org_id));
drop policy if exists areas_update on public.areas;
create policy areas_update on public.areas for update to authenticated using (public.can_write_org(org_id)) with check (public.can_write_org(org_id));
revoke all on table public.rooms from anon, authenticated;
grant select, insert, update on table public.rooms to authenticated;
alter table public.rooms enable row level security;
drop policy if exists rooms_select on public.rooms;
create policy rooms_select on public.rooms for select to authenticated using (public.is_org_member(org_id));
drop policy if exists rooms_insert on public.rooms;
create policy rooms_insert on public.rooms for insert to authenticated with check (public.can_write_org(org_id));
drop policy if exists rooms_update on public.rooms;
create policy rooms_update on public.rooms for update to authenticated using (public.can_write_org(org_id)) with check (public.can_write_org(org_id));
revoke all on table public.room_configurations from anon, authenticated;
grant select, insert, update on table public.room_configurations to authenticated;
alter table public.room_configurations enable row level security;
drop policy if exists room_configurations_select on public.room_configurations;
create policy room_configurations_select on public.room_configurations for select to authenticated using (public.is_org_member(org_id));
drop policy if exists room_configurations_insert on public.room_configurations;
create policy room_configurations_insert on public.room_configurations for insert to authenticated with check (public.can_write_org(org_id));
drop policy if exists room_configurations_update on public.room_configurations;
create policy room_configurations_update on public.room_configurations for update to authenticated using (public.can_write_org(org_id)) with check (public.can_write_org(org_id));
revoke all on table public.room_configuration_members from anon, authenticated;
grant select, insert, update on table public.room_configuration_members to authenticated;
alter table public.room_configuration_members enable row level security;
drop policy if exists room_configuration_members_select on public.room_configuration_members;
create policy room_configuration_members_select on public.room_configuration_members for select to authenticated using (public.is_org_member(org_id));
drop policy if exists room_configuration_members_insert on public.room_configuration_members;
create policy room_configuration_members_insert on public.room_configuration_members for insert to authenticated with check (public.can_write_org(org_id));
drop policy if exists room_configuration_members_update on public.room_configuration_members;
create policy room_configuration_members_update on public.room_configuration_members for update to authenticated using (public.can_write_org(org_id)) with check (public.can_write_org(org_id));
revoke all on table public.racks from anon, authenticated;
grant select, insert, update on table public.racks to authenticated;
alter table public.racks enable row level security;
drop policy if exists racks_select on public.racks;
create policy racks_select on public.racks for select to authenticated using (public.is_org_member(org_id));
drop policy if exists racks_insert on public.racks;
create policy racks_insert on public.racks for insert to authenticated with check (public.can_write_org(org_id));
drop policy if exists racks_update on public.racks;
create policy racks_update on public.racks for update to authenticated using (public.can_write_org(org_id)) with check (public.can_write_org(org_id));
revoke all on table public.audits from anon, authenticated;
grant select, insert, update on table public.audits to authenticated;
alter table public.audits enable row level security;
drop policy if exists audits_select on public.audits;
create policy audits_select on public.audits for select to authenticated using (public.is_org_member(org_id));
drop policy if exists audits_insert on public.audits;
create policy audits_insert on public.audits for insert to authenticated with check (public.can_write_org(org_id));
drop policy if exists audits_update on public.audits;
create policy audits_update on public.audits for update to authenticated using (public.can_write_org(org_id)) with check (public.can_write_org(org_id));
revoke all on table public.audit_sections from anon, authenticated;
grant select, insert, update on table public.audit_sections to authenticated;
alter table public.audit_sections enable row level security;
drop policy if exists audit_sections_select on public.audit_sections;
create policy audit_sections_select on public.audit_sections for select to authenticated using (public.is_org_member(org_id));
drop policy if exists audit_sections_insert on public.audit_sections;
create policy audit_sections_insert on public.audit_sections for insert to authenticated with check (public.can_write_org(org_id));
drop policy if exists audit_sections_update on public.audit_sections;
create policy audit_sections_update on public.audit_sections for update to authenticated using (public.can_write_org(org_id)) with check (public.can_write_org(org_id));
revoke all on table public.audit_notes from anon, authenticated;
grant select, insert, update on table public.audit_notes to authenticated;
alter table public.audit_notes enable row level security;
drop policy if exists audit_notes_select on public.audit_notes;
create policy audit_notes_select on public.audit_notes for select to authenticated using (public.is_org_member(org_id));
drop policy if exists audit_notes_insert on public.audit_notes;
create policy audit_notes_insert on public.audit_notes for insert to authenticated with check (public.can_write_org(org_id));
drop policy if exists audit_notes_update on public.audit_notes;
create policy audit_notes_update on public.audit_notes for update to authenticated using (public.can_write_org(org_id)) with check (public.can_write_org(org_id));
revoke all on table public.functional_tests from anon, authenticated;
grant select, insert, update on table public.functional_tests to authenticated;
alter table public.functional_tests enable row level security;
drop policy if exists functional_tests_select on public.functional_tests;
create policy functional_tests_select on public.functional_tests for select to authenticated using (public.is_org_member(org_id));
drop policy if exists functional_tests_insert on public.functional_tests;
create policy functional_tests_insert on public.functional_tests for insert to authenticated with check (public.can_write_org(org_id));
drop policy if exists functional_tests_update on public.functional_tests;
create policy functional_tests_update on public.functional_tests for update to authenticated using (public.can_write_org(org_id)) with check (public.can_write_org(org_id));
revoke all on table public.network_checks from anon, authenticated;
grant select, insert, update on table public.network_checks to authenticated;
alter table public.network_checks enable row level security;
drop policy if exists network_checks_select on public.network_checks;
create policy network_checks_select on public.network_checks for select to authenticated using (public.is_org_member(org_id));
drop policy if exists network_checks_insert on public.network_checks;
create policy network_checks_insert on public.network_checks for insert to authenticated with check (public.can_write_org(org_id));
drop policy if exists network_checks_update on public.network_checks;
create policy network_checks_update on public.network_checks for update to authenticated using (public.can_write_org(org_id)) with check (public.can_write_org(org_id));
revoke all on table public.infra_assets from anon, authenticated;
grant select, insert, update on table public.infra_assets to authenticated;
alter table public.infra_assets enable row level security;
drop policy if exists infra_assets_select on public.infra_assets;
create policy infra_assets_select on public.infra_assets for select to authenticated using (public.is_org_member(org_id));
drop policy if exists infra_assets_insert on public.infra_assets;
create policy infra_assets_insert on public.infra_assets for insert to authenticated with check (public.can_write_org(org_id));
drop policy if exists infra_assets_update on public.infra_assets;
create policy infra_assets_update on public.infra_assets for update to authenticated using (public.can_write_org(org_id)) with check (public.can_write_org(org_id));
revoke all on table public.devices from anon, authenticated;
grant select, insert, update on table public.devices to authenticated;
alter table public.devices enable row level security;
drop policy if exists devices_select on public.devices;
create policy devices_select on public.devices for select to authenticated using (public.is_org_member(org_id));
drop policy if exists devices_insert on public.devices;
create policy devices_insert on public.devices for insert to authenticated with check (public.can_write_org(org_id));
drop policy if exists devices_update on public.devices;
create policy devices_update on public.devices for update to authenticated using (public.can_write_org(org_id)) with check (public.can_write_org(org_id));
revoke all on table public.switch_ports from anon, authenticated;
grant select, insert, update on table public.switch_ports to authenticated;
alter table public.switch_ports enable row level security;
drop policy if exists switch_ports_select on public.switch_ports;
create policy switch_ports_select on public.switch_ports for select to authenticated using (public.is_org_member(org_id));
drop policy if exists switch_ports_insert on public.switch_ports;
create policy switch_ports_insert on public.switch_ports for insert to authenticated with check (public.can_write_org(org_id));
drop policy if exists switch_ports_update on public.switch_ports;
create policy switch_ports_update on public.switch_ports for update to authenticated using (public.can_write_org(org_id)) with check (public.can_write_org(org_id));
revoke all on table public.network_links from anon, authenticated;
grant select, insert, update on table public.network_links to authenticated;
alter table public.network_links enable row level security;
drop policy if exists network_links_select on public.network_links;
create policy network_links_select on public.network_links for select to authenticated using (public.is_org_member(org_id));
drop policy if exists network_links_insert on public.network_links;
create policy network_links_insert on public.network_links for insert to authenticated with check (public.can_write_org(org_id));
drop policy if exists network_links_update on public.network_links;
create policy network_links_update on public.network_links for update to authenticated using (public.can_write_org(org_id)) with check (public.can_write_org(org_id));
revoke all on table public.backlog_items from anon, authenticated;
grant select, insert, update on table public.backlog_items to authenticated;
alter table public.backlog_items enable row level security;
drop policy if exists backlog_items_select on public.backlog_items;
create policy backlog_items_select on public.backlog_items for select to authenticated using (public.is_org_member(org_id));
drop policy if exists backlog_items_insert on public.backlog_items;
create policy backlog_items_insert on public.backlog_items for insert to authenticated with check (public.can_write_org(org_id));
drop policy if exists backlog_items_update on public.backlog_items;
create policy backlog_items_update on public.backlog_items for update to authenticated using (public.can_write_org(org_id)) with check (public.can_write_org(org_id));
revoke all on table public.findings from anon, authenticated;
grant select, insert, update on table public.findings to authenticated;
alter table public.findings enable row level security;
drop policy if exists findings_select on public.findings;
create policy findings_select on public.findings for select to authenticated using (public.is_org_member(org_id));
drop policy if exists findings_insert on public.findings;
create policy findings_insert on public.findings for insert to authenticated with check (public.can_write_org(org_id));
drop policy if exists findings_update on public.findings;
create policy findings_update on public.findings for update to authenticated using (public.can_write_org(org_id)) with check (public.can_write_org(org_id));
revoke all on table public.it_requests from anon, authenticated;
grant select, insert, update on table public.it_requests to authenticated;
alter table public.it_requests enable row level security;
drop policy if exists it_requests_select on public.it_requests;
create policy it_requests_select on public.it_requests for select to authenticated using (public.is_org_member(org_id));
drop policy if exists it_requests_insert on public.it_requests;
create policy it_requests_insert on public.it_requests for insert to authenticated with check (public.can_write_org(org_id));
drop policy if exists it_requests_update on public.it_requests;
create policy it_requests_update on public.it_requests for update to authenticated using (public.can_write_org(org_id)) with check (public.can_write_org(org_id));
revoke all on table public.backlog_it_links from anon, authenticated;
grant select, insert, update on table public.backlog_it_links to authenticated;
alter table public.backlog_it_links enable row level security;
drop policy if exists backlog_it_links_select on public.backlog_it_links;
create policy backlog_it_links_select on public.backlog_it_links for select to authenticated using (public.is_org_member(org_id));
drop policy if exists backlog_it_links_insert on public.backlog_it_links;
create policy backlog_it_links_insert on public.backlog_it_links for insert to authenticated with check (public.can_write_org(org_id));
drop policy if exists backlog_it_links_update on public.backlog_it_links;
create policy backlog_it_links_update on public.backlog_it_links for update to authenticated using (public.can_write_org(org_id)) with check (public.can_write_org(org_id));
revoke all on table public.spare_items from anon, authenticated;
grant select, insert, update on table public.spare_items to authenticated;
alter table public.spare_items enable row level security;
drop policy if exists spare_items_select on public.spare_items;
create policy spare_items_select on public.spare_items for select to authenticated using (public.is_org_member(org_id));
drop policy if exists spare_items_insert on public.spare_items;
create policy spare_items_insert on public.spare_items for insert to authenticated with check (public.can_write_org(org_id));
drop policy if exists spare_items_update on public.spare_items;
create policy spare_items_update on public.spare_items for update to authenticated using (public.can_write_org(org_id)) with check (public.can_write_org(org_id));
revoke all on table public.photos from anon, authenticated;
grant select, insert, update on table public.photos to authenticated;
alter table public.photos enable row level security;
drop policy if exists photos_select on public.photos;
create policy photos_select on public.photos for select to authenticated using (public.is_org_member(org_id));
drop policy if exists photos_insert on public.photos;
create policy photos_insert on public.photos for insert to authenticated with check (public.can_write_org(org_id));
drop policy if exists photos_update on public.photos;
create policy photos_update on public.photos for update to authenticated using (public.can_write_org(org_id)) with check (public.can_write_org(org_id));
revoke all on table public.followups from anon, authenticated;
grant select, insert, update on table public.followups to authenticated;
alter table public.followups enable row level security;
drop policy if exists followups_select on public.followups;
create policy followups_select on public.followups for select to authenticated using (public.is_org_member(org_id));
drop policy if exists followups_insert on public.followups;
create policy followups_insert on public.followups for insert to authenticated with check (public.can_write_org(org_id));
drop policy if exists followups_update on public.followups;
create policy followups_update on public.followups for update to authenticated using (public.can_write_org(org_id)) with check (public.can_write_org(org_id));
revoke all on table public.insight_states from anon, authenticated;
grant select, insert, update on table public.insight_states to authenticated;
alter table public.insight_states enable row level security;
drop policy if exists insight_states_select on public.insight_states;
create policy insight_states_select on public.insight_states for select to authenticated using (public.is_org_member(org_id));
drop policy if exists insight_states_insert on public.insight_states;
create policy insight_states_insert on public.insight_states for insert to authenticated with check (public.can_write_org(org_id));
drop policy if exists insight_states_update on public.insight_states;
create policy insight_states_update on public.insight_states for update to authenticated using (public.can_write_org(org_id)) with check (public.can_write_org(org_id));
revoke all on table public.activity_log from anon, authenticated;
grant select, insert, update on table public.activity_log to authenticated;
alter table public.activity_log enable row level security;
drop policy if exists activity_log_select on public.activity_log;
create policy activity_log_select on public.activity_log for select to authenticated using (public.is_org_member(org_id));
drop policy if exists activity_log_insert on public.activity_log;
create policy activity_log_insert on public.activity_log for insert to authenticated with check (public.can_write_org(org_id));
drop policy if exists activity_log_update on public.activity_log;
create policy activity_log_update on public.activity_log for update to authenticated using (public.can_write_org(org_id)) with check (public.can_write_org(org_id));
revoke all on table public.exports from anon, authenticated;
grant select, insert, update on table public.exports to authenticated;
alter table public.exports enable row level security;
drop policy if exists exports_select on public.exports;
create policy exports_select on public.exports for select to authenticated using (public.is_org_member(org_id));
drop policy if exists exports_insert on public.exports;
create policy exports_insert on public.exports for insert to authenticated with check (public.can_write_org(org_id));
drop policy if exists exports_update on public.exports;
create policy exports_update on public.exports for update to authenticated using (public.can_write_org(org_id)) with check (public.can_write_org(org_id));
-- No DELETE privilege and no DELETE policy exist on any data table: clients cannot hard-delete. Deletion is a soft delete (deleted_at).

-- ---------------------------------------------------------------- triggers
drop trigger if exists a_keep_newer on public.buildings;
create trigger a_keep_newer before update on public.buildings for each row execute function public.keep_newer_version();
drop trigger if exists b_lock_org on public.buildings;
create trigger b_lock_org before update on public.buildings for each row execute function public.lock_org_id();
drop trigger if exists c_stamp on public.buildings;
create trigger c_stamp before insert or update on public.buildings for each row execute function public.stamp_server_updated_at();
drop trigger if exists z_audit on public.buildings;
create trigger z_audit after insert or update on public.buildings for each row execute function public.record_audit_trail();
drop trigger if exists a_keep_newer on public.floors;
create trigger a_keep_newer before update on public.floors for each row execute function public.keep_newer_version();
drop trigger if exists b_lock_org on public.floors;
create trigger b_lock_org before update on public.floors for each row execute function public.lock_org_id();
drop trigger if exists c_stamp on public.floors;
create trigger c_stamp before insert or update on public.floors for each row execute function public.stamp_server_updated_at();
drop trigger if exists z_audit on public.floors;
create trigger z_audit after insert or update on public.floors for each row execute function public.record_audit_trail();
drop trigger if exists a_keep_newer on public.areas;
create trigger a_keep_newer before update on public.areas for each row execute function public.keep_newer_version();
drop trigger if exists b_lock_org on public.areas;
create trigger b_lock_org before update on public.areas for each row execute function public.lock_org_id();
drop trigger if exists c_stamp on public.areas;
create trigger c_stamp before insert or update on public.areas for each row execute function public.stamp_server_updated_at();
drop trigger if exists z_audit on public.areas;
create trigger z_audit after insert or update on public.areas for each row execute function public.record_audit_trail();
drop trigger if exists a_keep_newer on public.rooms;
create trigger a_keep_newer before update on public.rooms for each row execute function public.keep_newer_version();
drop trigger if exists b_lock_org on public.rooms;
create trigger b_lock_org before update on public.rooms for each row execute function public.lock_org_id();
drop trigger if exists c_stamp on public.rooms;
create trigger c_stamp before insert or update on public.rooms for each row execute function public.stamp_server_updated_at();
drop trigger if exists z_audit on public.rooms;
create trigger z_audit after insert or update on public.rooms for each row execute function public.record_audit_trail();
drop trigger if exists a_keep_newer on public.room_configurations;
create trigger a_keep_newer before update on public.room_configurations for each row execute function public.keep_newer_version();
drop trigger if exists b_lock_org on public.room_configurations;
create trigger b_lock_org before update on public.room_configurations for each row execute function public.lock_org_id();
drop trigger if exists c_stamp on public.room_configurations;
create trigger c_stamp before insert or update on public.room_configurations for each row execute function public.stamp_server_updated_at();
drop trigger if exists z_audit on public.room_configurations;
create trigger z_audit after insert or update on public.room_configurations for each row execute function public.record_audit_trail();
drop trigger if exists a_keep_newer on public.room_configuration_members;
create trigger a_keep_newer before update on public.room_configuration_members for each row execute function public.keep_newer_version();
drop trigger if exists b_lock_org on public.room_configuration_members;
create trigger b_lock_org before update on public.room_configuration_members for each row execute function public.lock_org_id();
drop trigger if exists c_stamp on public.room_configuration_members;
create trigger c_stamp before insert or update on public.room_configuration_members for each row execute function public.stamp_server_updated_at();
drop trigger if exists z_audit on public.room_configuration_members;
create trigger z_audit after insert or update on public.room_configuration_members for each row execute function public.record_audit_trail();
drop trigger if exists a_keep_newer on public.racks;
create trigger a_keep_newer before update on public.racks for each row execute function public.keep_newer_version();
drop trigger if exists b_lock_org on public.racks;
create trigger b_lock_org before update on public.racks for each row execute function public.lock_org_id();
drop trigger if exists c_stamp on public.racks;
create trigger c_stamp before insert or update on public.racks for each row execute function public.stamp_server_updated_at();
drop trigger if exists z_audit on public.racks;
create trigger z_audit after insert or update on public.racks for each row execute function public.record_audit_trail();
drop trigger if exists a_keep_newer on public.audits;
create trigger a_keep_newer before update on public.audits for each row execute function public.keep_newer_version();
drop trigger if exists b_lock_org on public.audits;
create trigger b_lock_org before update on public.audits for each row execute function public.lock_org_id();
drop trigger if exists c_stamp on public.audits;
create trigger c_stamp before insert or update on public.audits for each row execute function public.stamp_server_updated_at();
drop trigger if exists z_audit on public.audits;
create trigger z_audit after insert or update on public.audits for each row execute function public.record_audit_trail();
drop trigger if exists a_keep_newer on public.audit_sections;
create trigger a_keep_newer before update on public.audit_sections for each row execute function public.keep_newer_version();
drop trigger if exists b_lock_org on public.audit_sections;
create trigger b_lock_org before update on public.audit_sections for each row execute function public.lock_org_id();
drop trigger if exists c_stamp on public.audit_sections;
create trigger c_stamp before insert or update on public.audit_sections for each row execute function public.stamp_server_updated_at();
drop trigger if exists z_audit on public.audit_sections;
create trigger z_audit after insert or update on public.audit_sections for each row execute function public.record_audit_trail();
drop trigger if exists a_keep_newer on public.audit_notes;
create trigger a_keep_newer before update on public.audit_notes for each row execute function public.keep_newer_version();
drop trigger if exists b_lock_org on public.audit_notes;
create trigger b_lock_org before update on public.audit_notes for each row execute function public.lock_org_id();
drop trigger if exists c_stamp on public.audit_notes;
create trigger c_stamp before insert or update on public.audit_notes for each row execute function public.stamp_server_updated_at();
drop trigger if exists z_audit on public.audit_notes;
create trigger z_audit after insert or update on public.audit_notes for each row execute function public.record_audit_trail();
drop trigger if exists a_keep_newer on public.functional_tests;
create trigger a_keep_newer before update on public.functional_tests for each row execute function public.keep_newer_version();
drop trigger if exists b_lock_org on public.functional_tests;
create trigger b_lock_org before update on public.functional_tests for each row execute function public.lock_org_id();
drop trigger if exists c_stamp on public.functional_tests;
create trigger c_stamp before insert or update on public.functional_tests for each row execute function public.stamp_server_updated_at();
drop trigger if exists z_audit on public.functional_tests;
create trigger z_audit after insert or update on public.functional_tests for each row execute function public.record_audit_trail();
drop trigger if exists a_keep_newer on public.network_checks;
create trigger a_keep_newer before update on public.network_checks for each row execute function public.keep_newer_version();
drop trigger if exists b_lock_org on public.network_checks;
create trigger b_lock_org before update on public.network_checks for each row execute function public.lock_org_id();
drop trigger if exists c_stamp on public.network_checks;
create trigger c_stamp before insert or update on public.network_checks for each row execute function public.stamp_server_updated_at();
drop trigger if exists z_audit on public.network_checks;
create trigger z_audit after insert or update on public.network_checks for each row execute function public.record_audit_trail();
drop trigger if exists a_keep_newer on public.infra_assets;
create trigger a_keep_newer before update on public.infra_assets for each row execute function public.keep_newer_version();
drop trigger if exists b_lock_org on public.infra_assets;
create trigger b_lock_org before update on public.infra_assets for each row execute function public.lock_org_id();
drop trigger if exists c_stamp on public.infra_assets;
create trigger c_stamp before insert or update on public.infra_assets for each row execute function public.stamp_server_updated_at();
drop trigger if exists z_audit on public.infra_assets;
create trigger z_audit after insert or update on public.infra_assets for each row execute function public.record_audit_trail();
drop trigger if exists a_keep_newer on public.devices;
create trigger a_keep_newer before update on public.devices for each row execute function public.keep_newer_version();
drop trigger if exists b_lock_org on public.devices;
create trigger b_lock_org before update on public.devices for each row execute function public.lock_org_id();
drop trigger if exists c_stamp on public.devices;
create trigger c_stamp before insert or update on public.devices for each row execute function public.stamp_server_updated_at();
drop trigger if exists z_audit on public.devices;
create trigger z_audit after insert or update on public.devices for each row execute function public.record_audit_trail();
drop trigger if exists a_keep_newer on public.switch_ports;
create trigger a_keep_newer before update on public.switch_ports for each row execute function public.keep_newer_version();
drop trigger if exists b_lock_org on public.switch_ports;
create trigger b_lock_org before update on public.switch_ports for each row execute function public.lock_org_id();
drop trigger if exists c_stamp on public.switch_ports;
create trigger c_stamp before insert or update on public.switch_ports for each row execute function public.stamp_server_updated_at();
drop trigger if exists z_audit on public.switch_ports;
create trigger z_audit after insert or update on public.switch_ports for each row execute function public.record_audit_trail();
drop trigger if exists a_keep_newer on public.network_links;
create trigger a_keep_newer before update on public.network_links for each row execute function public.keep_newer_version();
drop trigger if exists b_lock_org on public.network_links;
create trigger b_lock_org before update on public.network_links for each row execute function public.lock_org_id();
drop trigger if exists c_stamp on public.network_links;
create trigger c_stamp before insert or update on public.network_links for each row execute function public.stamp_server_updated_at();
drop trigger if exists z_audit on public.network_links;
create trigger z_audit after insert or update on public.network_links for each row execute function public.record_audit_trail();
drop trigger if exists a_keep_newer on public.backlog_items;
create trigger a_keep_newer before update on public.backlog_items for each row execute function public.keep_newer_version();
drop trigger if exists b_lock_org on public.backlog_items;
create trigger b_lock_org before update on public.backlog_items for each row execute function public.lock_org_id();
drop trigger if exists c_stamp on public.backlog_items;
create trigger c_stamp before insert or update on public.backlog_items for each row execute function public.stamp_server_updated_at();
drop trigger if exists z_audit on public.backlog_items;
create trigger z_audit after insert or update on public.backlog_items for each row execute function public.record_audit_trail();
drop trigger if exists a_keep_newer on public.findings;
create trigger a_keep_newer before update on public.findings for each row execute function public.keep_newer_version();
drop trigger if exists b_lock_org on public.findings;
create trigger b_lock_org before update on public.findings for each row execute function public.lock_org_id();
drop trigger if exists c_stamp on public.findings;
create trigger c_stamp before insert or update on public.findings for each row execute function public.stamp_server_updated_at();
drop trigger if exists z_audit on public.findings;
create trigger z_audit after insert or update on public.findings for each row execute function public.record_audit_trail();
drop trigger if exists a_keep_newer on public.it_requests;
create trigger a_keep_newer before update on public.it_requests for each row execute function public.keep_newer_version();
drop trigger if exists b_lock_org on public.it_requests;
create trigger b_lock_org before update on public.it_requests for each row execute function public.lock_org_id();
drop trigger if exists c_stamp on public.it_requests;
create trigger c_stamp before insert or update on public.it_requests for each row execute function public.stamp_server_updated_at();
drop trigger if exists z_audit on public.it_requests;
create trigger z_audit after insert or update on public.it_requests for each row execute function public.record_audit_trail();
drop trigger if exists a_keep_newer on public.backlog_it_links;
create trigger a_keep_newer before update on public.backlog_it_links for each row execute function public.keep_newer_version();
drop trigger if exists b_lock_org on public.backlog_it_links;
create trigger b_lock_org before update on public.backlog_it_links for each row execute function public.lock_org_id();
drop trigger if exists c_stamp on public.backlog_it_links;
create trigger c_stamp before insert or update on public.backlog_it_links for each row execute function public.stamp_server_updated_at();
drop trigger if exists z_audit on public.backlog_it_links;
create trigger z_audit after insert or update on public.backlog_it_links for each row execute function public.record_audit_trail();
drop trigger if exists a_keep_newer on public.spare_items;
create trigger a_keep_newer before update on public.spare_items for each row execute function public.keep_newer_version();
drop trigger if exists b_lock_org on public.spare_items;
create trigger b_lock_org before update on public.spare_items for each row execute function public.lock_org_id();
drop trigger if exists c_stamp on public.spare_items;
create trigger c_stamp before insert or update on public.spare_items for each row execute function public.stamp_server_updated_at();
drop trigger if exists z_audit on public.spare_items;
create trigger z_audit after insert or update on public.spare_items for each row execute function public.record_audit_trail();
drop trigger if exists a_keep_newer on public.photos;
create trigger a_keep_newer before update on public.photos for each row execute function public.keep_newer_version();
drop trigger if exists b_lock_org on public.photos;
create trigger b_lock_org before update on public.photos for each row execute function public.lock_org_id();
drop trigger if exists c_stamp on public.photos;
create trigger c_stamp before insert or update on public.photos for each row execute function public.stamp_server_updated_at();
drop trigger if exists z_audit on public.photos;
create trigger z_audit after insert or update on public.photos for each row execute function public.record_audit_trail();
drop trigger if exists a_keep_newer on public.followups;
create trigger a_keep_newer before update on public.followups for each row execute function public.keep_newer_version();
drop trigger if exists b_lock_org on public.followups;
create trigger b_lock_org before update on public.followups for each row execute function public.lock_org_id();
drop trigger if exists c_stamp on public.followups;
create trigger c_stamp before insert or update on public.followups for each row execute function public.stamp_server_updated_at();
drop trigger if exists z_audit on public.followups;
create trigger z_audit after insert or update on public.followups for each row execute function public.record_audit_trail();
drop trigger if exists a_keep_newer on public.insight_states;
create trigger a_keep_newer before update on public.insight_states for each row execute function public.keep_newer_version();
drop trigger if exists b_lock_org on public.insight_states;
create trigger b_lock_org before update on public.insight_states for each row execute function public.lock_org_id();
drop trigger if exists c_stamp on public.insight_states;
create trigger c_stamp before insert or update on public.insight_states for each row execute function public.stamp_server_updated_at();
drop trigger if exists z_audit on public.insight_states;
create trigger z_audit after insert or update on public.insight_states for each row execute function public.record_audit_trail();
drop trigger if exists a_keep_newer on public.activity_log;
create trigger a_keep_newer before update on public.activity_log for each row execute function public.keep_newer_version();
drop trigger if exists b_lock_org on public.activity_log;
create trigger b_lock_org before update on public.activity_log for each row execute function public.lock_org_id();
drop trigger if exists c_stamp on public.activity_log;
create trigger c_stamp before insert or update on public.activity_log for each row execute function public.stamp_server_updated_at();
drop trigger if exists z_audit on public.activity_log;
create trigger z_audit after insert or update on public.activity_log for each row execute function public.record_audit_trail();
drop trigger if exists a_keep_newer on public.exports;
create trigger a_keep_newer before update on public.exports for each row execute function public.keep_newer_version();
drop trigger if exists b_lock_org on public.exports;
create trigger b_lock_org before update on public.exports for each row execute function public.lock_org_id();
drop trigger if exists c_stamp on public.exports;
create trigger c_stamp before insert or update on public.exports for each row execute function public.stamp_server_updated_at();
drop trigger if exists z_audit on public.exports;
create trigger z_audit after insert or update on public.exports for each row execute function public.record_audit_trail();

-- ---------------------------------------------------------------- photographs: private bucket, organization-scoped paths
-- Object path convention: <org_id>/<photo_id>/original   and   <org_id>/<photo_id>/edited
insert into storage.buckets (id, name, public) values ('audit-photos', 'audit-photos', false) on conflict (id) do update set public = false;
-- The first path segment is compared as text (never cast to uuid), so an object with an unexpected name in any bucket
-- cannot make a policy raise an error. The helper functions are security definer with a fixed search_path.
create or replace function public.is_org_member_path(object_name text) returns boolean
  language sql stable security definer set search_path = public as
  $$ select exists (select 1 from public.org_members m where m.user_id = auth.uid() and m.org_id::text = split_part(object_name, '/', 1)) $$;
create or replace function public.can_write_org_path(object_name text) returns boolean
  language sql stable security definer set search_path = public as
  $$ select exists (select 1 from public.org_members m where m.user_id = auth.uid() and m.role in ('admin', 'lead_auditor', 'auditor') and m.org_id::text = split_part(object_name, '/', 1)) $$;
revoke all on function public.is_org_member_path(text), public.can_write_org_path(text) from public, anon;
grant execute on function public.is_org_member_path(text), public.can_write_org_path(text) to authenticated;
drop policy if exists "audit photos: members read" on storage.objects;
create policy "audit photos: members read" on storage.objects for select to authenticated using (bucket_id = 'audit-photos' and public.is_org_member_path(name));
drop policy if exists "audit photos: writers insert" on storage.objects;
create policy "audit photos: writers insert" on storage.objects for insert to authenticated with check (bucket_id = 'audit-photos' and public.can_write_org_path(name));
drop policy if exists "audit photos: writers update" on storage.objects;
create policy "audit photos: writers update" on storage.objects for update to authenticated using (bucket_id = 'audit-photos' and public.can_write_org_path(name)) with check (bucket_id = 'audit-photos' and public.can_write_org_path(name));
-- No delete policy: photograph binaries are retained; removal is an administrator action with the service role.

-- ---------------------------------------------------------------- first-time setup (run as the project owner, once)
-- 1. Create the auditor accounts under Authentication > Users (disable public sign-ups).
-- 2. insert into public.organizations (name, short_code) values ('<organization name>', 'AVEI') returning id;
-- 3. insert into public.org_members (org_id, user_id, role, full_name) values ('<organization id>', '<auth user id>', 'admin', '<name>');
-- The service-role key is never used by the application and must never be placed in a browser.
