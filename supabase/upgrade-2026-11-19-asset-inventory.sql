-- AV Environment Intelligence: upgrade for the asset inventory (19 November 2026).
-- Extracted from supabase/schema.sql: only adds tables, columns, value lists, policies, triggers and indexes. Changes no row.
begin;
create table if not exists public.asset_identifications (
  id uuid primary key,
  org_id uuid not null references public.organizations(id),
  building_id uuid,
  floor_id uuid,
  room_id uuid,
  device_id uuid,
  status text,
  provider text,
  model text,
  requested_at timestamptz,
  completed_at timestamptz,
  result jsonb,
  error text,
  selected_index integer,
  draft jsonb,
  notes text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text,
  updated_by text,
  deleted_at timestamptz,
  is_demo boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint asset_identifications_updated_after_created check (updated_at >= created_at)
);
create table if not exists public.asset_taxonomy (
  id uuid primary key,
  org_id uuid not null references public.organizations(id),
  kind text,
  name text,
  group_name text,
  archived boolean not null default false,
  sort_order numeric,
  notes text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text,
  updated_by text,
  deleted_at timestamptz,
  is_demo boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint asset_taxonomy_updated_after_created check (updated_at >= created_at)
);
create table if not exists public.export_profiles (
  id uuid primary key,
  org_id uuid not null references public.organizations(id),
  name text,
  target_system text,
  format text,
  mapping jsonb,
  options jsonb,
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text,
  updated_by text,
  deleted_at timestamptz,
  is_demo boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint export_profiles_updated_after_created check (updated_at >= created_at)
);
create table if not exists public.asset_exports (
  id uuid primary key,
  org_id uuid not null references public.organizations(id),
  profile_id uuid,
  profile_name text,
  format text,
  scope jsonb,
  record_count integer,
  counts jsonb,
  validation jsonb,
  filename text,
  exported_by text,
  status text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text,
  updated_by text,
  deleted_at timestamptz,
  is_demo boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp(),
  constraint asset_exports_updated_after_created check (updated_at >= created_at)
);
alter table public.rooms add column if not exists department text;
alter table public.rooms add column if not exists inventory_status text;
alter table public.rooms add column if not exists inventory_completed_at timestamptz;
alter table public.rooms add column if not exists inventory_completed_by text;
alter table public.devices add column if not exists make text;
alter table public.devices add column if not exists product_family text;
alter table public.devices add column if not exists asset_tag text;
alter table public.devices add column if not exists identity_confirmed_at timestamptz;
alter table public.devices add column if not exists identity_confirmed_by text;
alter table public.devices add column if not exists field_sources jsonb;
alter table public.devices add column if not exists manual_review boolean not null default false;
alter table public.devices add column if not exists last_verified_at timestamptz;
alter table public.devices add column if not exists ai_identification_id uuid;
alter table public.devices add column if not exists merged_into uuid;
alter table public.devices add column if not exists distinct_from jsonb;
alter table public.devices add column if not exists exported_at timestamptz;
alter table public.devices add column if not exists export_code text;
alter table public.devices add column if not exists export_sig text;
alter table public.devices add column if not exists presence text;
alter table public.devices add column if not exists listed_text text;
alter table public.photos add column if not exists identification_id uuid;
alter table public.photos add column if not exists phash text;
alter table public.photos add column if not exists crop_of uuid;
alter table public.rooms drop constraint if exists rooms_inventory_status_check;
alter table public.rooms add constraint rooms_inventory_status_check check (inventory_status is null or inventory_status in ('', 'in_progress', 'complete'));
alter table public.audits drop constraint if exists audits_status_check;
alter table public.audits add constraint audits_status_check check (status is null or status in ('in_progress', 'complete', 'verified', ''));
alter table public.audit_notes drop constraint if exists audit_notes_note_type_check;
alter table public.audit_notes add constraint audit_notes_note_type_check check (note_type is null or note_type in ('observed_fact', 'auditor_interpretation', 'unverified_hypothesis', 'recommended_action', ''));
alter table public.functional_tests drop constraint if exists functional_tests_result_check;
alter table public.functional_tests add constraint functional_tests_result_check check (result is null or result in ('pass', 'fail', 'investigate', 'na', 'not_tested', ''));
alter table public.functional_tests drop constraint if exists functional_tests_suggestion_state_check;
alter table public.functional_tests add constraint functional_tests_suggestion_state_check check (suggestion_state is null or suggestion_state in ('none', 'pending', 'accepted', 'dismissed', ''));
alter table public.network_checks drop constraint if exists network_checks_status_check;
alter table public.network_checks add constraint network_checks_status_check check (status is null or status in ('verified', 'issue', 'awaiting_it', 'na', 'not_checked', ''));
alter table public.infra_assets drop constraint if exists infra_assets_asset_type_check;
alter table public.infra_assets add constraint infra_assets_asset_type_check check (asset_type is null or asset_type in ('switch', 'vlan', 'subnet', 'ip_range', 'dhcp_reservation', 'static_ip', 'dns_record', 'dns_server', 'ntp_server', 'firewall_rule', 'multicast', 'qos', 'monitoring', 'other', ''));
alter table public.infra_assets drop constraint if exists infra_assets_validation_status_check;
alter table public.infra_assets add constraint infra_assets_validation_status_check check (validation_status is null or validation_status in ('observed', 'from_docs', 'it_validated', 'awaiting_it', 'unknown', ''));
alter table public.asset_identifications drop constraint if exists asset_identifications_status_check;
alter table public.asset_identifications add constraint asset_identifications_status_check check (status is null or status in ('draft', 'analyzing', 'ready', 'failed', 'confirmed', 'discarded', ''));
alter table public.devices drop constraint if exists devices_ip_status_check;
alter table public.devices add constraint devices_ip_status_check check (ip_status is null or ip_status in ('verified_onsite', 'verified_mgmt', 'awaiting_it', 'awaiting_vendor', 'unknown', 'unavailable', 'not_applicable', ''));
alter table public.devices drop constraint if exists devices_mac_status_check;
alter table public.devices add constraint devices_mac_status_check check (mac_status is null or mac_status in ('verified_onsite', 'verified_mgmt', 'awaiting_it', 'awaiting_vendor', 'unknown', 'unavailable', 'not_applicable', ''));
alter table public.devices drop constraint if exists devices_serial_status_check;
alter table public.devices add constraint devices_serial_status_check check (serial_status is null or serial_status in ('verified_onsite', 'verified_mgmt', 'awaiting_it', 'awaiting_vendor', 'unknown', 'unavailable', 'not_applicable', ''));
alter table public.devices drop constraint if exists devices_presence_check;
alter table public.devices add constraint devices_presence_check check (presence is null or presence in ('', 'listed', 'not_found'));
alter table public.network_links drop constraint if exists network_links_kind_check;
alter table public.network_links add constraint network_links_kind_check check (kind is null or kind in ('uplink', 'dependency', ''));
alter table public.backlog_items drop constraint if exists backlog_items_priority_check;
alter table public.backlog_items add constraint backlog_items_priority_check check (priority is null or priority in ('', 'P1', 'P2', 'P3'));
alter table public.backlog_items drop constraint if exists backlog_items_status_check;
alter table public.backlog_items add constraint backlog_items_status_check check (status is null or status in ('New Discovery', 'Under Investigation', 'Pending PepperDash Review', 'Pending Client IT', 'Pending Client Approval', 'Approved', 'Scheduled', 'In Progress', 'Blocked', 'Completed', 'Deferred', 'Rejected', ''));
alter table public.backlog_items drop constraint if exists backlog_items_root_cause_confidence_check;
alter table public.backlog_items add constraint backlog_items_root_cause_confidence_check check (root_cause_confidence is null or root_cause_confidence in ('not_determined', 'hypothesis', 'probable', 'confirmed', ''));
alter table public.findings drop constraint if exists findings_status_check;
alter table public.findings add constraint findings_status_check check (status is null or status in ('open', 'linked', 'duplicate', 'dismissed', ''));
alter table public.findings drop constraint if exists findings_classification_check;
alter table public.findings add constraint findings_classification_check check (classification is null or classification in ('observed_fact', 'auditor_interpretation', 'unverified_hypothesis', ''));
alter table public.findings drop constraint if exists findings_priority_hint_check;
alter table public.findings add constraint findings_priority_hint_check check (priority_hint is null or priority_hint in ('', 'P1', 'P2', 'P3'));
alter table public.it_requests drop constraint if exists it_requests_status_check;
alter table public.it_requests add constraint it_requests_status_check check (status is null or status in ('Draft', 'Submitted', 'Acknowledged', 'In Progress', 'Awaiting Response', 'Answered', 'Closed', 'Cancelled', ''));
alter table public.it_requests drop constraint if exists it_requests_requested_from_check;
alter table public.it_requests add constraint it_requests_requested_from_check check (requested_from is null or requested_from in ('Client IT', 'PepperDash', 'Vendor', 'Facilities', ''));
alter table public.spare_items drop constraint if exists spare_items_lifecycle_check;
alter table public.spare_items add constraint spare_items_lifecycle_check check (lifecycle is null or lifecycle in ('active', 'approaching_eol', 'eol', 'unknown', ''));
alter table public.followups drop constraint if exists followups_status_check;
alter table public.followups add constraint followups_status_check check (status is null or status in ('open', 'resolved', 'dismissed', ''));
alter table public.asset_taxonomy drop constraint if exists asset_taxonomy_kind_check;
alter table public.asset_taxonomy add constraint asset_taxonomy_kind_check check (kind is null or kind in ('category', 'manufacturer', ''));
alter table public.export_profiles drop constraint if exists export_profiles_format_check;
alter table public.export_profiles add constraint export_profiles_format_check check (format is null or format in ('csv', 'xlsx', 'json', ''));
alter table public.asset_exports drop constraint if exists asset_exports_format_check;
alter table public.asset_exports add constraint asset_exports_format_check check (format is null or format in ('csv', 'xlsx', 'json', ''));
alter table public.asset_exports drop constraint if exists asset_exports_status_check;
alter table public.asset_exports add constraint asset_exports_status_check check (status is null or status in ('success', 'failed', ''));
alter table public.asset_identifications drop constraint if exists asset_identifications_building_id_fkey;
alter table public.asset_identifications add constraint asset_identifications_building_id_fkey foreign key (building_id) references public.buildings(id);
alter table public.asset_identifications drop constraint if exists asset_identifications_floor_id_fkey;
alter table public.asset_identifications add constraint asset_identifications_floor_id_fkey foreign key (floor_id) references public.floors(id);
alter table public.asset_identifications drop constraint if exists asset_identifications_room_id_fkey;
alter table public.asset_identifications add constraint asset_identifications_room_id_fkey foreign key (room_id) references public.rooms(id);
create index if not exists asset_identifications_building_id_idx on public.asset_identifications (building_id);
create index if not exists asset_identifications_floor_id_idx on public.asset_identifications (floor_id);
create index if not exists asset_identifications_room_id_idx on public.asset_identifications (room_id);
create index if not exists asset_identifications_device_id_idx on public.asset_identifications (device_id);
create index if not exists asset_identifications_sync_idx on public.asset_identifications (org_id, server_updated_at, id);
create index if not exists asset_taxonomy_sync_idx on public.asset_taxonomy (org_id, server_updated_at, id);
create index if not exists export_profiles_sync_idx on public.export_profiles (org_id, server_updated_at, id);
create index if not exists asset_exports_profile_id_idx on public.asset_exports (profile_id);
create index if not exists asset_exports_sync_idx on public.asset_exports (org_id, server_updated_at, id);
revoke all on table public.asset_identifications from anon, authenticated;
grant select, insert, update on table public.asset_identifications to authenticated;
alter table public.asset_identifications enable row level security;
drop policy if exists asset_identifications_select on public.asset_identifications;
create policy asset_identifications_select on public.asset_identifications for select to authenticated using (public.is_org_member(org_id));
drop policy if exists asset_identifications_insert on public.asset_identifications;
create policy asset_identifications_insert on public.asset_identifications for insert to authenticated with check (public.can_write_org(org_id));
drop policy if exists asset_identifications_update on public.asset_identifications;
create policy asset_identifications_update on public.asset_identifications for update to authenticated using (public.can_write_org(org_id)) with check (public.can_write_org(org_id));
revoke all on table public.asset_taxonomy from anon, authenticated;
grant select, insert, update on table public.asset_taxonomy to authenticated;
alter table public.asset_taxonomy enable row level security;
drop policy if exists asset_taxonomy_select on public.asset_taxonomy;
create policy asset_taxonomy_select on public.asset_taxonomy for select to authenticated using (public.is_org_member(org_id));
drop policy if exists asset_taxonomy_insert on public.asset_taxonomy;
create policy asset_taxonomy_insert on public.asset_taxonomy for insert to authenticated with check (public.can_write_org(org_id));
drop policy if exists asset_taxonomy_update on public.asset_taxonomy;
create policy asset_taxonomy_update on public.asset_taxonomy for update to authenticated using (public.can_write_org(org_id)) with check (public.can_write_org(org_id));
revoke all on table public.export_profiles from anon, authenticated;
grant select, insert, update on table public.export_profiles to authenticated;
alter table public.export_profiles enable row level security;
drop policy if exists export_profiles_select on public.export_profiles;
create policy export_profiles_select on public.export_profiles for select to authenticated using (public.is_org_member(org_id));
drop policy if exists export_profiles_insert on public.export_profiles;
create policy export_profiles_insert on public.export_profiles for insert to authenticated with check (public.can_write_org(org_id));
drop policy if exists export_profiles_update on public.export_profiles;
create policy export_profiles_update on public.export_profiles for update to authenticated using (public.can_write_org(org_id)) with check (public.can_write_org(org_id));
revoke all on table public.asset_exports from anon, authenticated;
grant select, insert, update on table public.asset_exports to authenticated;
alter table public.asset_exports enable row level security;
drop policy if exists asset_exports_select on public.asset_exports;
create policy asset_exports_select on public.asset_exports for select to authenticated using (public.is_org_member(org_id));
drop policy if exists asset_exports_insert on public.asset_exports;
create policy asset_exports_insert on public.asset_exports for insert to authenticated with check (public.can_write_org(org_id));
drop policy if exists asset_exports_update on public.asset_exports;
create policy asset_exports_update on public.asset_exports for update to authenticated using (public.can_write_org(org_id)) with check (public.can_write_org(org_id));
drop trigger if exists a_keep_newer on public.asset_identifications;
create trigger a_keep_newer before update on public.asset_identifications for each row execute function public.keep_newer_version();
drop trigger if exists b_lock_org on public.asset_identifications;
create trigger b_lock_org before update on public.asset_identifications for each row execute function public.lock_org_id();
drop trigger if exists c_stamp on public.asset_identifications;
create trigger c_stamp before insert or update on public.asset_identifications for each row execute function public.stamp_server_updated_at();
drop trigger if exists z_audit on public.asset_identifications;
create trigger z_audit after insert or update on public.asset_identifications for each row execute function public.record_audit_trail();
drop trigger if exists a_keep_newer on public.asset_taxonomy;
create trigger a_keep_newer before update on public.asset_taxonomy for each row execute function public.keep_newer_version();
drop trigger if exists b_lock_org on public.asset_taxonomy;
create trigger b_lock_org before update on public.asset_taxonomy for each row execute function public.lock_org_id();
drop trigger if exists c_stamp on public.asset_taxonomy;
create trigger c_stamp before insert or update on public.asset_taxonomy for each row execute function public.stamp_server_updated_at();
drop trigger if exists z_audit on public.asset_taxonomy;
create trigger z_audit after insert or update on public.asset_taxonomy for each row execute function public.record_audit_trail();
drop trigger if exists a_keep_newer on public.export_profiles;
create trigger a_keep_newer before update on public.export_profiles for each row execute function public.keep_newer_version();
drop trigger if exists b_lock_org on public.export_profiles;
create trigger b_lock_org before update on public.export_profiles for each row execute function public.lock_org_id();
drop trigger if exists c_stamp on public.export_profiles;
create trigger c_stamp before insert or update on public.export_profiles for each row execute function public.stamp_server_updated_at();
drop trigger if exists z_audit on public.export_profiles;
create trigger z_audit after insert or update on public.export_profiles for each row execute function public.record_audit_trail();
drop trigger if exists a_keep_newer on public.asset_exports;
create trigger a_keep_newer before update on public.asset_exports for each row execute function public.keep_newer_version();
drop trigger if exists b_lock_org on public.asset_exports;
create trigger b_lock_org before update on public.asset_exports for each row execute function public.lock_org_id();
drop trigger if exists c_stamp on public.asset_exports;
create trigger c_stamp before insert or update on public.asset_exports for each row execute function public.stamp_server_updated_at();
drop trigger if exists z_audit on public.asset_exports;
create trigger z_audit after insert or update on public.asset_exports for each row execute function public.record_audit_trail();
create index if not exists devices_ai_identification_id_idx on public.devices (ai_identification_id);
create index if not exists devices_merged_into_idx on public.devices (merged_into);
create index if not exists photos_identification_id_idx on public.photos (identification_id);
create index if not exists photos_crop_of_idx on public.photos (crop_of);
commit;
-- make the REST API see the new tables and columns at once
notify pgrst, 'reload schema';
