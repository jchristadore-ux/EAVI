# Export format: Daily Export package and data handoff

This document is the reference for the Daily Export package written by AV ENVIRONMENT INTELLIGENCE and for the handoff of that package to the person, or the Claude Project, that merges it into the cumulative master workbook. It states what the code writes: the layout of the archive, `audit_manifest.json`, the 24 CSV files and their conventions, `record_status` and the delivery ledger behind it, the validation report, the photographs, the documents inside the package, the master workbook, and the limits. It describes package format `av-environment-audit-export`, version `1.0`, as written by application version 1.0.0 (build 2026-11-12) in `app/js/exporter.js`, `app/js/handoff.js`, `app/js/pages/export.js` and `app/js/zip.js`.

> **Status.** The application must be approved by client security before real infrastructure information is entered into it. Nothing in this document means that this approval has been given; [SECURITY.md](SECURITY.md) states the current status. Until then the export is to be used with synthetic data only. Uploading a package to a Claude Project, or to any other AI service, is a separate manual step outside the application, and it needs the client's authorisation (section 10.4).

## 1. Package, name and scope

### 1.1 What a package is

A package is one ZIP archive. The application builds it in the browser, on the auditor's device, from the records in its local database. It contains the structured records, not a summary of what a screen shows:

- 24 CSV files, one per exported table. All 24 are always present. A file with no rows holds only its header line.
- `audit_manifest.json`, which describes the package.
- `validation_report.json`.
- Three Markdown documents.
- The photographs of the records in scope, unless they are excluded.

A package is built on the screen **Daily Export & Data Handoff** with the button **EXPORT DAILY AUDIT PACKAGE**. Before the button is pressed, the screen shows the export summary and the pre-export validation for the chosen scope.

Four internal tables are never exported: `organizations`, `profiles`, `insight_states` and `exports` (the export history of the device).

Building a package makes no network request, with one exception in the code: when cloud sync is enabled and an image file is not on the device, the application first tries to fetch it from the workspace. Cloud sync is off by default and is impossible in the default build.

### 1.2 Names

| Item | Pattern | Example |
|---|---|---|
| Export ID (`export_id` in the manifest) | `<prefix>-EXP-<YYYYMMDD>-<NN>` | `AVEI-EXP-20261112-01` |
| File name | `<prefix>_AV_Audit_Export_<YYYY-MM-DD>_EXP-<NN>.zip` | `AVEI_AV_Audit_Export_2026-11-12_EXP-01.zip` |
| `export_uuid` | A UUID: the `id` of the export record on the device | |

- `<prefix>` is the **Record ID prefix** set in Settings. The default is `AVEI`. The manifest repeats it as `organization.code_prefix`.
- The date is the local date of the device when the package is built.
- `<NN>` is a sequence number for that date on that device, written with two digits. Every package that is built takes the next number, whether or not it is saved afterwards. A gap in the numbers is therefore not proof of a lost package. `baseline.previous_export_id` and `previous_exports` in the manifest name the packages that were delivered.

### 1.3 Export modes

| `scope.mode` | Choice on screen | Records selected | `scope.window_start` to `scope.window_end` |
|---|---|---|---|
| `today` | **Current day** (default) | Records created or changed since local midnight, and audits whose `audit_date` is today | Local midnight to the moment of export |
| `range` | **Date range** | The same rule for the local days **From** to **To**, both included. An empty **To** means the day of **From** | Start of **From** to the end of **To** (23:59:59.999 local time) |
| `since` | **Since last export** | Every record this device has not yet delivered in its current form, whatever day it changed (section 5.6). If no package was ever delivered: every record | Time of the previous delivered export (`null` if none) to the moment of export. For information only: the selection uses the ledger, not this window |
| `full` | **Full export** | Every record | `null` to the moment of export |

Rules that apply to every mode:

- Each row states its `record_status` from the delivery ledger (section 5), whatever the mode. A `full` package still says which rows are new, updated or unchanged.
- Deleted records are selected only under the conditions of section 5.4.
- The selected records are completed with related records (1.5).

A `today` or `range` package contains only what falls inside its window. For a hand-off that must not miss earlier changes, the screen recommends **Since last export**.

### 1.4 Location filters

| `scope.filters` key | Field on screen | Records kept |
|---|---|---|
| `building_id` | **Building** | Records located in that building, and records that have no building at all |
| `floor_id` | **Floor** | Records located on that floor |
| `room_ids` | **Rooms** | Records located in one of the selected rooms. An audit of a combined configuration is kept when one of its member rooms is selected |

- Only the most specific filter is applied: rooms before floor, floor before building.
- The location of a record is its own `building_id`, `floor_id` and `room_id`. A record without them takes the location of the record it belongs to:

| Record | Location taken from |
|---|---|
| Test, check, note, section state and other rows of an audit | The audit |
| Switch port | Its switch |
| Network relationship | Its "from" end, otherwise its "to" end |
| Backlog-request link | Its backlog item, otherwise its request |
| Follow-up task | Its device |
| Configuration member | Its room |

- A record with no floor (for example a building-wide infrastructure record) is not selected by a floor or room filter. It enters the package only when a selected record refers to it.
- A filter narrows the selection. It does not remove the related records of 1.5.
- `scope.label` states mode, window and filters in words, for example `Full export (all records) · all locations`.

### 1.5 Records added automatically

Two mechanisms complete the selection.

**References (every mode).** For every record in the package, each record it refers to through a foreign-key column is added, and so on for the added records. Both ends of a network relationship are added. These rows are added whatever the mode and the filters say. They usually read `unchanged`.

**Expansion (modes `today`, `range` and `full`).** A directly selected record that is not deleted brings what belongs to it:

| Selected record | Added with it |
|---|---|
| Audit | Its functional tests, network checks, section states, notes, photographs and findings, and the devices of the audited room or rooms (each device is expanded in turn) |
| Device | Its follow-up tasks, its switch-port rows, the network relationships that start at the device, its photographs |
| Backlog item | Its findings, its links to coordination requests, its photographs |
| Coordination request | Its links to backlog items |
| Finding | Its photographs |
| Combined configuration | Its member rows |

`since` does no expansion: it carries the changed rows and the records they refer to. Activity-log entries are never expanded.

### 1.6 Photograph modes

| `scope.photo_mode` | Choice in the field **Photographs** | Image files in the package |
|---|---|---|
| `original` (default) | **Original quality** | The file as stored on the device, byte for byte |
| `optimized` | **Optimized (max 2048 px)** | A re-encoded JPEG, longest edge at most 2048 px, never enlarged. If the browser cannot decode a stored image, the stored file is packaged unchanged |
| `none` | **Index only — no image files** | None. `photo_index.csv` still lists every photograph in scope |

The screen shows the number of photographs in scope and their total size at original quality. Details are in section 8.

### 1.7 Repeating an export

**Repeat**, in the list **Export history**, builds a new package with a new export ID. It reuses the scope of the earlier export and the current state of the records.

- Mode, window (`window_start`, `window_end`) and filters are those of the earlier export. An earlier `since` export is repeated as `range` over the time span it covered.
- The photograph mode is the one currently selected on the screen, not the one of the earlier export.
- The manifest states `scope.is_reexport: true`, `scope.reexport_of` (the earlier export ID) and a `scope.note`.
- The selection is recomputed. Records show their current state, and a record that was changed again after the window may no longer fall inside it. A repeated package is not a copy of the earlier file.
- `record_status` is computed against the ledger as in any other package.

**Repeat** is the way to send the records of an older package again. Only the most recent delivery can be voided (section 5.7).

## 2. Layout of the ZIP

Everything except the photographs is at the root of the archive. There are no other files or folders. Files are listed in the order in which they are written.

| # | Path | Purpose |
|---|---|---|
| | `photographs/` | Folder tree of image files (section 8). Written first. Absent when the package is index-only or no image was packaged |
| 1 | `buildings.csv` * | Buildings in the audited environment |
| 2 | `floors.csv` * | Floors, one row per floor, linked to buildings |
| 3 | `areas.csv` | Named areas within a floor |
| 4 | `rooms.csv` * | Rooms and spaces, with their permanent identifier (`code`) and current audit state |
| 5 | `room_configurations.csv` | Combined configurations of divisible rooms |
| 6 | `room_configuration_members.csv` | Which rooms belong to each combined configuration |
| 7 | `racks.csv` | Equipment racks within rooms |
| 8 | `room_audits.csv` * | One row per audit of a room or combined configuration, with progress figures |
| 9 | `audit_sections.csv` | Per-audit section state, for example "no AV devices in this space" |
| 10 | `devices.csv` * | Device inventory |
| 11 | `functional_tests.csv` * | Functional test results per audit |
| 12 | `network_validation.csv` | Network validation checklist results per audit |
| 13 | `findings.csv` * | Field findings |
| 14 | `backlog.csv` * | Improvement backlog items |
| 15 | `backlog_request_links.csv` | Links between backlog items and coordination requests |
| 16 | `it_coordination.csv` * | Coordination requests to Client IT, PepperDash, vendors and facilities |
| 17 | `infrastructure.csv` * | Infrastructure documentation records |
| 18 | `switch_ports.csv` | Documented switch ports and the device connected to each |
| 19 | `network_relationships.csv` | Uplinks between switches, and device dependencies |
| 20 | `spare_inventory.csv` * | Spare equipment with stock levels and risk flags |
| 21 | `audit_notes.csv` * | Auditor notes |
| 22 | `followup_tasks.csv` | Automatically tracked follow-up tasks for incomplete device documentation |
| 23 | `activity_log.csv` * | Change history |
| 24 | `photo_index.csv` * | One row per photograph, with its file path in the package and its links |
| 25 | `claude_analysis_instructions.md` | How to analyse this package and merge it into the master workbook (section 9.3) |
| 26 | `data_dictionary.md` | Every file and column of this package (section 9.2) |
| 27 | `validation_report.json` | Structural checks and data-quality exceptions (section 7) |
| 28 | `end_of_day_summary.md` | Summary of this export and priorities for the next visit (section 9.1) |
| 29 | `audit_manifest.json` | Description of the package (section 3). Written last |

There are **24 CSV files**. The 14 marked * carry `required: true` in the manifest. The flag is informational: the application writes all 24 CSV files into every package, and the check "Every expected file is present" expects all 29 files.

The master workbook is not part of the package (section 10).

Suggested reading order for the receiver:

1. Read `audit_manifest.json` completely.
2. Check `validation.structural_errors`. If it is above zero, stop and report it.
3. Check `contains_demo_data`.
4. Check that `baseline.previous_export_id` is the package that was merged last (section 5.9).
5. Load each CSV file. Confirm that its header equals `files[].columns` and its row count equals `files[].record_count`.
6. Use `photo_index.csv` to find the image files.

## 3. `audit_manifest.json`

### 3.1 Top-level keys

The manifest has 24 top-level keys, in this order.

| Key | Type | Meaning |
|---|---|---|
| `package_format` | string | Always `av-environment-audit-export` |
| `format_version` | string | `1.0` |
| `export_id` | string | Export ID (1.2) |
| `export_uuid` | string | UUID of the export |
| `generated_at` | string | Moment the scope was resolved, ISO 8601, UTC |
| `generated_at_local` | string | The same moment in the local time of the device, with numeric offset, for example `2026-11-12T11:08:01-05:00` |
| `timezone` | string | Time zone name reported by the browser, for example `America/New_York`; `local` if the browser reports none |
| `generated_by` | object | `name`, `email` (`null` when not set) and `role` of the auditor profile on the device |
| `application` | object | `name`, `version`, `build` |
| `organization` | object | `id` (UUID), `name` (`null` when no organization name is set), `code_prefix` |
| `contains_demo_data` | boolean | `true` when at least one row in this package has `is_demo = true`. It describes the package, not the device |
| `scope` | object | What was selected (3.2) |
| `baseline` | object | What `record_status` is compared with (3.3) |
| `record_status_definitions` | object | A short definition each for `new`, `updated`, `unchanged`, `deleted` and `incomplete` |
| `id_conventions` | object | Text under `primary_key`, `human_code` and `note` (section 11.4) |
| `conventions` | object | Value and CSV conventions (3.4) |
| `enumerations` | object | Allowed values of coded columns (3.5) |
| `verification_precedence` | array | `verified_onsite`, `verified_mgmt`, `awaiting_it`, `awaiting_vendor`, `unknown`: strongest first. Used by the reconciliation rules |
| `summary` | object | Figures for the selected scope (3.6) |
| `end_of_day` | object | Figures of `end_of_day_summary.md` (3.7) |
| `files` | array | One entry per CSV file and per document (3.8) |
| `photographs` | object | What was packaged (3.9) |
| `validation` | object | `result`, `structural_errors`, `warning_checks` and `exception_count` copied from the report (section 7); `report` is `validation_report.json` |
| `previous_exports` | array | Up to 30 most recent packages delivered from this device, newest first: `export_id`, `generated_at`, `mode`, `records` |

### 3.2 `scope`

| Key | Meaning |
|---|---|
| `mode` | `today`, `range`, `since` or `full` (1.3) |
| `label` | The scope in words |
| `window_start`, `window_end` | Time window, ISO 8601 UTC. `window_start` can be `null` |
| `filters` | `building_id`, `floor_id` (`null` when not set) and `room_ids` (array, empty when not set) |
| `photo_mode` | `original`, `optimized` or `none` (1.6) |
| `is_reexport` | `true` for a repeated export (1.7) |
| `reexport_of` | Export ID of the repeated export, otherwise `null` |
| `note` | Present only in a repeated export |

### 3.3 `baseline`

| Key | Meaning |
|---|---|
| `previous_export_id` | Export ID of the most recent package delivered from this device before this one; `null` if there is none |
| `previous_export_at` | When that package was generated |
| `method` | Always `delivery_ledger` |
| `meaning` | The rule of section 5 in one paragraph. When nothing was delivered before, it adds that every row is "new" |

### 3.4 `conventions`

| Key | Value |
|---|---|
| `timestamps` | `ISO 8601, UTC (Z) unless a column name ends in _local` |
| `dates` | `YYYY-MM-DD` |
| `csv.encoding` | `UTF-8` |
| `csv.byte_order_mark` | `false` |
| `csv.delimiter` | `,` |
| `csv.quote` | `"` |
| `csv.line_ending` | `CRLF` |
| `csv.header_row` | `true` |
| `csv.formula_escaping` | `none — values are exactly as recorded. Read every cell as text; never let a spreadsheet evaluate a cell as a formula.` |
| `multi_value_separator` | Space, vertical bar, space |
| `booleans` | `true / false` |
| `empty` | An empty cell means "not recorded". It never means zero, "none" or "not applicable" |

No CSV column name ends in `_local`. Local times are written in `generated_at_local` and inside the text of `scope.label` in the manifest, and in `end_of_day_summary.md` and `claude_analysis_instructions.md`.

### 3.5 `enumerations`

The object has 22 keys. Eleven are lists of `{ value, label }`; `priority` adds a `definition`; the others are plain lists of strings. The CSV files carry the `value`. The `label` is the text the application shows for that value, and the master workbook uses the same text where it has a column for it (10.2). Two keys differ. The `label` of `identification_status` is a one-sentence definition; the workbook shows `Complete` or `Incomplete`. The `label` of `priority` reads `P1 — High`, `P2 — Medium`, `P3 — Low`; the workbook shows `P1`, `P2`, `P3`.

| Key | Column it describes | Values |
|---|---|---|
| `verification_status` | The columns named in `verification_status_columns` | `verified_onsite`, `verified_mgmt`, `awaiting_it`, `awaiting_vendor`, `unknown`, `not_applicable` |
| `verification_status_columns` | | `devices.ip_status`, `devices.mac_status`, `devices.serial_status` |
| `identification_status` | `devices.csv` `identification_status` | `complete`, `incomplete` |
| `functional_test_result` | `functional_tests.csv` `result` | `pass`, `fail`, `investigate`, `na`, `not_tested` |
| `network_check_status` | `network_validation.csv` `status` | `verified`, `issue`, `awaiting_it`, `na`, `not_checked` |
| `audit_status` | `room_audits.csv` `status` | `in_progress`, `complete`, `verified` |
| `finding_classification` | `findings.csv` `classification` | `observed_fact`, `auditor_interpretation`, `unverified_hypothesis` |
| `finding_status` | `findings.csv` `status` | `open`, `linked`, `duplicate`, `dismissed` |
| `note_type` | `audit_notes.csv` `note_type` | `observed_fact`, `auditor_interpretation`, `unverified_hypothesis`, `recommended_action` |
| `root_cause_confidence` | `backlog.csv` `root_cause_confidence` | `not_determined`, `hypothesis`, `probable`, `confirmed` |
| `validation_status` | `infrastructure.csv` and `switch_ports.csv` `validation_status` | `observed`, `from_docs`, `it_validated`, `awaiting_it`, `unknown` |
| `dependency_status` | `network_relationships.csv` `status` | `confirmed`, `awaiting_it`, `assumed`, `unknown` |
| `priority` | `backlog.csv` and `it_coordination.csv` `priority`, `findings.csv` `priority_hint` | `P1`, `P2`, `P3` |
| `backlog_status`, `backlog_closed_statuses` | `backlog.csv` `status` | 12 statuses; closed are `Completed`, `Deferred`, `Rejected` |
| `coordination_status`, `coordination_closed_statuses` | `it_coordination.csv` `status` | `Draft`, `Submitted`, `Acknowledged`, `In Progress`, `Awaiting Response`, `Answered`, `Closed`, `Cancelled`; closed are the last three |
| `coordination_parties` | `it_coordination.csv` `requested_from` | `Client IT`, `PepperDash`, `Vendor`, `Facilities` |
| `finding_category` | `findings.csv` and `backlog.csv` `category` | 10 categories |
| `device_category` | `devices.csv` `category` | 24 categories |
| `room_type` | `rooms.csv` `room_type` | 14 types |
| `photo_category` | `photo_index.csv` `category` | 13 categories |

The manifest names the columns only for `verification_status`. The column mapping of the other keys in this table is taken from `app/js/schema.js`.

Some coded columns are not listed under `enumerations`. Their values, from `app/js/schema.js`:

| Column | Values |
|---|---|
| `infrastructure.csv` `asset_type` | `switch`, `vlan`, `subnet`, `ip_range`, `dhcp_reservation`, `static_ip`, `dns_record`, `dns_server`, `ntp_server`, `firewall_rule`, `multicast`, `qos`, `monitoring`, `other` |
| `network_relationships.csv` `kind` | `uplink`, `dependency` |
| `network_relationships.csv` `from_type`, `to_type` | `device`, `infra_asset` |
| `followup_tasks.csv` `status` | `open`, `resolved`, `dismissed` |
| `spare_inventory.csv` `lifecycle` | `active`, `approaching_eol`, `eol`, `unknown` |
| `functional_tests.csv` `suggestion_state` | `none`, `pending`, `accepted`, `dismissed` |
| `rooms.csv` `criticality` | `standard`, `high`, `critical` |
| `switch_ports.csv` `mode` | `access`, `trunk`, `unknown` |
| `switch_ports.csv` `poe_status` | `delivering`, `enabled`, `disabled`, `unknown` |

### 3.6 `summary`

Several figures count the audits that were **worked on**. In a `full` package these are all audits in the package. Otherwise an audit counts when its own record, or one of its tests, checks, notes, section states, photographs or findings, was created or edited inside the window (`today`, `range`), or is new or was edited since the version last delivered (`since`). In `today` and `range` an audit whose `audit_date` lies in the window counts as well. A row that is "updated" only because a derived column moved does not count.

Deleted rows are left out of every figure except `record_total`.

| Key | Meaning |
|---|---|
| `audit_dates` | The distinct `audit_date` values of the audits worked on, sorted |
| `buildings_visited`, `floors_visited` | Number of distinct buildings and floors of those audits |
| `floor_ids` | The `id` values of those floors |
| `rooms_audited` | Number of distinct rooms or combined configurations of those audits |
| `audits_completed` | Those audits whose `status` is not `in_progress` |
| `audits_in_progress` | Those audits whose `status` is `in_progress` |
| `devices_documented` | Device rows with `record_status` `new` or `updated` |
| `devices_new` | Device rows with `record_status` `new` |
| `devices_in_package` | All device rows |
| `devices_requiring_followup` | Device rows with at least one of IP address, MAC address or serial number missing |
| `photographs` | Photograph rows |
| `photographs_new` | Photograph rows with `record_status` `new` |
| `tests_completed` | Tests with a result other than `not_tested` that were worked on (in a `full` package: all of them) |
| `tests_failed`, `tests_to_investigate` | Test rows with `result` `fail` or `investigate` |
| `findings_created` | Finding rows with `record_status` `new` |
| `findings_awaiting_triage` | Finding rows with `status` `open` |
| `backlog_new` | Backlog rows with `record_status` `new` |
| `backlog_new_p1`, `backlog_new_p2`, `backlog_new_p3`, `backlog_new_unprioritized` | The same, by `priority` |
| `outstanding_identification_fields` | Number of missing IP, MAC and serial fields over all device rows |
| `incomplete_audit_sections` | Over the audits worked on: how many of the five sections (space summary, devices, functional tests, network validation, photographs) are not complete |
| `incomplete_audits` | The audits worked on that still have outstanding items: `code`, `space`, `status`, `outstanding` (array). `status` is the recorded status, or `verification_lapsed` (section 6.3) |
| `pending_it_dependencies`, `pending_pepperdash_dependencies` | Open coordination requests to Client IT and to PepperDash **on the whole device**, not only in the package. Demo requests are left out when the package holds no demo row |
| `requests_in_package` | Coordination request rows |
| `record_total` | Number of rows in all 24 CSV files together |

### 3.7 `end_of_day`

| Key | Source |
|---|---|
| `rooms_audited`, `audits_completed`, `audits_in_progress`, `devices_requiring_followup` | The same keys of `summary` |
| `new_devices` | `summary.devices_new` |
| `new_findings` | `summary.findings_created` |
| `new_p1`, `new_p2`, `new_p3`, `new_unprioritized` | `summary.backlog_new_p1` and following |
| `outstanding_it_requests` | `summary.pending_it_dependencies` |
| `outstanding_pepperdash_dependencies` | `summary.pending_pepperdash_dependencies` |
| `data_quality_exceptions` | `validation.exception_count` |
| `photographs` | `summary.photographs_new` |
| `next_visit_priorities` | Up to 12 sentences produced by fixed rules, or the single sentence `No outstanding actions are recorded for the spaces in this export.` |

`next_visit_priorities` is computed for the floors of the audits worked on. When no audit was worked on, it is computed for the whole environment; if the device holds demo data and the package holds none, it is limited to the floors in the package. It reads the current records of those floors on the device, not only the rows in the package. The rules produce sentences about audits in progress, spaces not yet started, devices with incomplete or unverified identification, failed tests without a finding, findings awaiting triage, open P1 items, outstanding and overdue requests, drafted requests, and audits that can be marked fully verified. When the priorities are computed for the whole environment, a sentence about spare coverage for critical rooms can be added. They are prompts for the auditor, not conclusions.

### 3.8 `files[]`

There are 28 entries: the 24 CSV files, then the four documents. The manifest does not list itself, and it does not list the image files (see `photo_index.csv`).

Keys of a CSV entry:

| Key | Meaning |
|---|---|
| `path` | File name in the archive |
| `table` | Source table in the application |
| `description` | A short description of the file |
| `required` | `true` for the 14 files marked * in section 2 |
| `record_count` | Number of data rows, header excluded |
| `columns` | The header, in order |
| `primary_key` | Always `id` |
| `foreign_keys` | Array of `{ column, references, enforced_in_database }`. `references` has the form `rooms.csv:id`. `enforced_in_database` is `false` for a soft reference, which the cloud database schema does not constrain |
| `status_counts` | `new`, `updated`, `unchanged`, `deleted`: number of rows per `record_status`. `incomplete`: number of rows with `is_incomplete = true`, whatever their status |
| `bytes` | Size of the file in bytes (UTF-8) |
| `sha256` | SHA-256 of the file, hexadecimal. `null` when the browser offers no Web Crypto (the page is not in a secure context) |

A document entry has `path` and `description` only.

Example of a CSV entry, shortened, from a package built from synthetic test and demo data:

```json
{
  "path": "devices.csv",
  "table": "devices",
  "required": true,
  "record_count": 20,
  "primary_key": "id",
  "foreign_keys": [
    { "column": "room_id", "references": "rooms.csv:id", "enforced_in_database": true },
    { "column": "audit_id", "references": "room_audits.csv:id", "enforced_in_database": false }
  ],
  "status_counts": { "new": 20, "updated": 0, "unchanged": 0, "deleted": 0, "incomplete": 5 },
  "bytes": 13942,
  "sha256": "bde30a910a8a5cec8f1e14a32e30932630e64261854bfe32f634372ba88a1dea"
}
```

### 3.9 `photographs`

| Key | Meaning |
|---|---|
| `included` | `false` for an index-only package |
| `quality` | `original`, `optimized` or `none` |
| `count` | Photograph rows in the package that are not deleted |
| `files_written` | Photographs whose image file is in the package. `_annotated` renditions are not counted |
| `missing_files` | Photographs whose image file was not available on the device. `0` in an index-only package |
| `total_bytes` | Bytes of all image files written, `_annotated` renditions included |
| `directory_pattern` | The folder pattern of section 8.1, in words |
| `index_file` | `photo_index.csv` |
| `note` | One paragraph that says whether the files are originals, optimized renditions, or absent |

## 4. The CSV files

### 4.1 One row per file

"Name columns" are explained in 4.2. The derived columns are defined in 4.3. The full column list of each file is in `files[].columns` of the manifest and in `data_dictionary.md`.

| File | Source table | One row is | Derived columns, besides name columns |
|---|---|---|---|
| `buildings.csv` | `buildings` | One building | None |
| `floors.csv` | `floors` | One floor of a building | None |
| `areas.csv` | `areas` | One named area of a floor | None |
| `rooms.csv` | `rooms` | One room or space: conference room, rack room or support area | `audit_state`, `latest_audit_code`, `audit_count`, `device_count`, `is_conference_space`, `effective_criticality` |
| `room_configurations.csv` | `room_configurations` | One combined configuration of a divisible room | None |
| `room_configuration_members.csv` | `room_configuration_members` | One room's membership of one combined configuration | None |
| `racks.csv` | `racks` | One equipment rack in a room | None |
| `room_audits.csv` | `audits` | One audit of one room or of one combined configuration. Audits are history: a room can have several rows, and a newer audit never replaces an older one | `space_label`, `overall_pct`, `summary_complete`, `devices_total`, `devices_verified`, `devices_incomplete`, `tests_total`, `tests_done`, `tests_pass`, `tests_fail`, `tests_investigate`, `tests_na`, `network_pct`, `network_issues`, `network_awaiting_it`, `photo_count`, `finding_count`, `can_be_fully_verified`, `verification_lapsed`, `outstanding` |
| `audit_sections.csv` | `audit_sections` | The recorded state of one section of one audit (`section_key`, `state`) | None |
| `devices.csv` | `devices` | One device | `device_type`, `network_connected`, `identification_status`, `missing_fields`, `unverified_fields`, `fully_verified` |
| `functional_tests.csv` | `functional_tests` | One functional test of one audit. An audit starts with the 52 tests of the standard checklist; a test added by the auditor has `is_custom = true` | None |
| `network_validation.csv` | `network_checks` | One network validation check of one audit. An audit starts with 11 checks | None |
| `findings.csv` | `findings` | One field finding | None |
| `backlog.csv` | `backlog_items` | One improvement backlog item | `is_open`, `linked_finding_codes`, `related_request_codes`, `affected_room_codes` |
| `backlog_request_links.csv` | `backlog_it_links` | One link between one backlog item and one coordination request | None |
| `it_coordination.csv` | `it_requests` | One coordination request | `is_open`, `is_overdue`, `related_backlog_codes` |
| `infrastructure.csv` | `infra_assets` | One infrastructure documentation record (`asset_type` says which kind) | None |
| `switch_ports.csv` | `switch_ports` | One documented port of one switch | None |
| `network_relationships.csv` | `network_links` | One uplink between two switches, or one dependency of a device | `from_label`, `to_label` |
| `spare_inventory.csv` | `spare_items` | One line of spare stock | `risk_flags` |
| `audit_notes.csv` | `audit_notes` | One auditor note within an audit | None |
| `followup_tasks.csv` | `followups` | One automatically tracked follow-up task for a device | None |
| `activity_log.csv` | `activity_log` | One change-history entry | None |
| `photo_index.csv` | `photos` | One photograph | `file_path`, `edited_file_path`, `file_sha256`, `exported_bytes` |

Notes on single files:

- `room_audits.csv`: `summary_snapshot` is JSON. It holds the space summary and the progress figures as they stood when the audit was completed or verified.
- `functional_tests.csv`: `test_key` has the form `<category>.<test>`, for example `video.display_power`. The key of a custom test starts with `custom.`.
- `backlog.csv`: `suspected_cause` is an unverified hypothesis. `root_cause` is exported as stored. A root cause recorded without `root_cause_confidence = confirmed` is reported under "No conflicting values" in the validation report.
- `network_relationships.csv`: `from_id` and `to_id` hold the `id` of a row in `devices.csv` or `infrastructure.csv`, according to `from_type` and `to_type`. They are not declared foreign keys: `foreign_keys` is empty for this file and the relationship checks of section 7 do not cover them. The records at both ends are added to the package all the same (1.5).
- `activity_log.csv`: `changes` is JSON, a list of `{ "f": field, "from": old, "to": new }`; long values are shortened to 160 characters when the entry is written. `detail` is `true` for a fine-grained entry, for example a change to one test result, network check, note, switch port or link. `building_id`, `floor_id` and `room_id` are plain values without name columns and are not declared foreign keys.
- `photo_index.csv`: the stored thumbnail is not exported. `remote_ref` and `remote_edit_ref` are set by cloud sync when the workspace holds the image file; they are empty when sync is not used.

### 4.2 Column order and name columns

Every file has the same column order:

1. `id`.
2. `code`, in the files that have one.
3. The columns of the source table, in the order of `app/js/schema.js`. Each foreign-key column is followed at once by the name columns of the record it refers to.
4. The derived columns of the file (4.3).
5. Nine trailing columns: `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `is_demo`, `record_status`, `is_incomplete`, `incomplete_reasons`.

Name columns are added for convenience, so that a row can be read without joining files:

| Foreign key to | Name columns that follow it |
|---|---|
| `buildings.csv` | `building_name` |
| `floors.csv` | `floor_number` |
| `areas.csv` | `area_name` |
| `rooms.csv` | `room_code`, `room_number`, `room_name` |
| `room_configurations.csv` | `configuration_name` |
| `racks.csv` | `rack_name` |
| `room_audits.csv` | `audit_code` |
| `devices.csv` | `device_code`, `device_hostname` |
| `findings.csv` | `finding_code` |
| `backlog.csv` | `backlog_code` |
| `it_coordination.csv` | `request_code` |
| `infrastructure.csv` | `switch_name` (the `name` of the referenced record) |
| `functional_tests.csv` | `test_key` |
| `spare_inventory.csv` | `spare_code` |

A name column is empty when the reference is empty or the referenced record no longer exists. It is filled from the referenced record even when that record is deleted.

The CSV files have no `org_id` column. The organisation is stated once, under `organization` in the manifest.

### 4.3 Derived columns

Derived columns are computed at export time, from the record itself or from other records. They are not stored on the record.

| File | Column | How it is computed |
|---|---|---|
| `rooms.csv` | `audit_state` | `not_started`: the room has no audit. `in_progress`: at least one of its audits is in progress. `verified`: its latest audit is fully verified and has not lapsed (6.3). Otherwise `audited`. Audits of a combined configuration are not counted here |
| | `latest_audit_code` | Code of the audit that decides the state |
| | `audit_count` | Number of audits of the room |
| | `device_count` | Devices of the room that are not archived |
| | `is_conference_space` | `false` for the room types `Rack room` and `Support area` |
| | `effective_criticality` | `criticality` when recorded. Otherwise `critical` for `Executive conference room`, `Boardroom` and `Town hall`, else `standard` |
| `room_audits.csv` | `space_label` | Room number and name, or the name of the combined configuration |
| | `overall_pct` | Mean of five ratios, in percent: space-summary fields filled, devices fully verified, tests with a result, network checks resolved, at least one photograph |
| | `summary_complete` | `true` when no space-summary field is missing |
| | `devices_total`, `devices_verified`, `devices_incomplete` | Devices of the audited room or rooms that are not archived; those fully verified; those with identification missing |
| | `tests_total`, `tests_done`, `tests_pass`, `tests_fail`, `tests_investigate`, `tests_na` | Tests of the audit, by result. `tests_done` counts every result other than `not_tested` |
| | `network_pct`, `network_issues`, `network_awaiting_it` | Share of checks with status `verified` or `na`; number with `issue`; number with `awaiting_it` |
| | `photo_count`, `finding_count` | Photographs linked to the audit; its findings that are neither dismissed nor duplicate |
| | `can_be_fully_verified` | `true` when nothing is outstanding |
| | `verification_lapsed` | Section 6.3 |
| | `outstanding` | What still prevents full verification (6.2) |
| `devices.csv` | `device_type` | `category`, or `custom_category` when the category is `Other` and a custom type is recorded |
| | `network_connected` | `false` when `ip_status` and `mac_status` are both `not_applicable`, or `connection_type` is `Not networked` or `USB only`. Otherwise `true` |
| | `identification_status` | `complete` when none of IP address, MAC address and serial number is missing. A field is missing when it has no value and its status is not `not_applicable` |
| | `missing_fields` | The missing ones of `IP address`, `MAC address`, `Serial number` |
| | `unverified_fields` | The ones that have a value whose status is not `verified_onsite`, `verified_mgmt` or `not_applicable` |
| | `fully_verified` | `true` when nothing is missing or unverified, device type, manufacturer and model are recorded, a network-connected device has a hostname, and the IP and MAC formats are valid |
| `backlog.csv` | `is_open` | `status` is not `Completed`, `Deferred` or `Rejected` |
| | `linked_finding_codes` | Codes of the findings linked to the item |
| | `related_request_codes` | Codes of the requests linked through `backlog_request_links.csv` |
| | `affected_room_codes` | Code of the item's own room and of the rooms of its linked findings |
| `it_coordination.csv` | `is_open` | `status` is not `Answered`, `Closed` or `Cancelled` |
| | `is_overdue` | The request is open and `target_date` is earlier than the local date of export |
| | `related_backlog_codes` | Codes of the backlog items linked to the request |
| `spare_inventory.csv` | `risk_flags` | `Quantity not recorded`: quantity is empty. `Zero available`: quantity is 0. `Below minimum`: quantity is below a minimum above 0. `Unidentified stock`: manufacturer or model is empty. `End of life`: lifecycle is `eol`. `Approaching end of life`: lifecycle is `approaching_eol`, or `eol_date` is less than 365 days ahead or already past |
| `network_relationships.csv` | `from_label`, `to_label` | Code and hostname of the device, or code and name of the infrastructure record, at that end |
| `photo_index.csv` | `file_path`, `edited_file_path`, `file_sha256`, `exported_bytes` | Section 8 |

The progress columns of `room_audits.csv` are empty for a deleted audit.

### 4.4 Conventions that apply to every CSV file

| Subject | Rule |
|---|---|
| Encoding | UTF-8, without a byte-order mark |
| Delimiter and header | Comma. The first line is the header and equals `files[].columns` |
| Line ending | CRLF after every record, the last one included |
| Quoting | A field is put in double quotes only when it contains a double quote, a comma, a carriage return or a line feed. A double quote inside the field is doubled. Line breaks inside a quoted field are kept, so one record can span several physical lines: use a CSV parser, not a line splitter |
| Empty value | Written as an empty field. It means "not recorded". It never means zero, "none" or "not applicable". "Not applicable" is always recorded explicitly, for example `ip_status = not_applicable` |
| Boolean | `true` or `false`, lower case. A derived boolean that cannot be computed is empty |
| Number | Plain decimal digits, no thousands separator |
| Date | `YYYY-MM-DD`: `audit_date`, `support_expiration`, `target_date`, `date_requested`, `response_date`, `eol_date` |
| Timestamp | ISO 8601 in UTC with milliseconds and `Z`, for example `2026-11-12T16:07:59.722Z`: `created_at`, `updated_at`, `deleted_at`, `started_at`, `completed_at`, `verified_at`, `tested_at`, `checked_at`, `status_changed_at`, `taken_at`, `resolved_at`, `at` |
| JSON | `summary_snapshot` and `changes` hold JSON text in one field |
| Several values in one field | Separated by space, vertical bar, space |
| `id` | First column of every file. A UUID. Permanent, never reused. It is the primary key and the merge key |
| `code` | Second column of the 11 files that have one. Form `<prefix>-<XX>-<number>`, for example `AVEI-DV-0007`. `XX` is `RM` rooms, `RC` room configurations, `RK` racks, `AU` audits, `DV` devices, `FN` findings, `BL` backlog, `IT` coordination requests, `NA` infrastructure, `SP` spares, `PH` photographs. It is for people. It is not a key (section 11.4) |
| Foreign key | A column that holds the `id` of a row in another file. Listed under `files[].foreign_keys` |
| Row order | Ascending by `code`; in files without a code, by `at` or `created_at`. The order carries no meaning |

Every value is written as it is stored. The application itself stamps timestamps in UTC with `Z`. A timestamp that reached the device in a restored backup keeps the form it had in that file when that form is ISO 8601 with `Z` or with a numeric offset; a backup timestamp in any other form is not restored. The validation (section 7, check 7) accepts the same two forms for `created_at` and `updated_at` and reports anything else.

The nine trailing columns:

| Column | Meaning |
|---|---|
| `created_at` | When the record was created |
| `updated_at` | When the record itself was last changed. It never moves backwards. A change in a derived column does not move it |
| `created_by`, `updated_by` | Name of the auditor who created the record and who changed it last |
| `deleted_at` | Set when the record was deleted in the application; otherwise empty |
| `is_demo` | `true` for a synthetic demo record |
| `record_status` | `new`, `updated`, `unchanged` or `deleted` (section 5) |
| `is_incomplete` | `true` when `incomplete_reasons` is not empty (section 6) |
| `incomplete_reasons` | Why the record is incomplete; several reasons are separated like any other multi-value field |

### 4.5 Package CSV files are not formula-escaped

The CSV files of a package are written without any formula guard. A value is written exactly as it was recorded, also when it begins with `=`, `+`, `-` or `@`.

Why: the files are interchange data for a merge. The manifest states under `conventions.csv.formula_escaping` that "values are exactly as recorded". An escape character would become part of the value, and the receiver could no longer compare it with the value in the application or in an earlier package.

What the reader must do:

1. Read every file with a CSV parser and treat every cell as text. Convert to a number, date or boolean only for columns that are declared as such.
2. Do not open a package CSV directly in a spreadsheet program. If a spreadsheet must be used, import the file with every column typed as text.
3. When a value is written into the master workbook, write it as a text or number cell. A value that begins with `=`, `+`, `-` or `@` is what the auditor typed: store it as text and never let a spreadsheet evaluate it. This is reconciliation rule 11 in `claude_analysis_instructions.md`.

The other CSV downloads of the application (a report as CSV, the list on a screen as CSV) are made for people. They start with a byte-order mark, they prefix an apostrophe to text that begins with a formula character, and they have no `record_status` column. They are not package files and this document does not describe them.

## 5. `record_status` and the delivery ledger

### 5.1 The question it answers

`record_status` answers one question for each row: does the receiver already hold this row, exactly as it is now?

A point in time cannot answer that. A package limited to one day, one floor or a repeated window does not carry everything that changed before its timestamp. The application therefore keeps a delivery ledger and compares row by row.

### 5.2 The ledger

| Subject | Fact |
|---|---|
| What it is | For every row that was ever delivered in a package from this device: a signature of the row as it was written |
| Signature | A non-cryptographic hash over the values of all columns of the CSV row, stored and derived, followed by the record's own `updated_at`. Left out: `file_path`, `edited_file_path`, `file_sha256` and `exported_bytes`, which describe a package and not the record, and the three columns `record_status`, `is_incomplete`, `incomplete_reasons` |
| Where it is stored | On the device, in the application's IndexedDB database `av_environment_intelligence`, object store `kv`, key `export_ledger`, as `{ table: { record id: signature } }`. A second key, `export_last`, names the export that was delivered last and keeps the ledger entries that delivery replaced |
| Where it is not | It is not in the package and it is not written to a backup file. It belongs to one device and one browser storage. **Erase all local data…** in Settings removes it together with the records |
| When it is committed | Only when a package has been handed over (5.3). Building a package changes nothing |

Because the ledger keeps a hash and not the values, the application cannot say which column changed. A row is simply `updated`. For an edited record, `activity_log.csv` lists the changed fields.

### 5.3 When a package counts as delivered

A package counts as delivered when the save reports success:

- the system share sheet completed, or
- a browser download was started, or
- the host page accepted the file through its download capability, when the application runs inside a host that provides one (section 11.2).

At that moment three things happen. The signature of every row in the package is written to the ledger. The export record changes from `generated` to `success`; the history shows **Delivered** instead of **Not saved**. An `exported` entry is added to the activity log; it is itself a new row for a later package.

A browser cannot confirm that a download reached the disk. That is why the most recent delivery can always be voided (5.7).

### 5.4 The four values

| Value | Condition in the code | What the receiver does |
|---|---|---|
| `deleted` | `deleted_at` is set | Do not delete the row in the master workbook. Mark it as withdrawn, date it and keep its history |
| `new` | The ledger has no entry for this `id` | Insert the row. If the `id` is already in the workbook, treat the row as updated; never add a second row for an `id` |
| `unchanged` | The ledger entry equals the current signature | Nothing. The row should already be in the workbook exactly as it is. If it is not, an earlier package was never merged (5.9) |
| `updated` | The ledger entry differs from the current signature | Update the matching row by `id`, under the reconciliation rules |

The conditions are tested in this order. `files[].status_counts` gives the number of rows per value.

Deleted records:

- A deleted record is selected only if an earlier package delivered it. A record that was created and deleted between two deliveries is not selected.
- In `since` and `full` packages a deletion is reported once. After the package that carries it has been delivered, it is not selected again, unless a name column or a derived column of the deleted row changes afterwards (for example its room is renamed). The row is then selected once more, still as `deleted`.
- In `today` and `range` packages a deletion is selected whenever the window covers the moment of deletion.
- A deleted record can also be in a package because a live record still refers to it, whether or not it was delivered before. The validation report lists that case under "No live record references a deleted record".
- Two operations remove records outright instead of marking them as deleted: **Remove all demo data** in Settings, and **Discard** on a record that has just been created, on a device that is not connected to a cloud workspace. Such a record leaves no `deleted` row. If an earlier package carried it, later packages simply no longer contain it.

`is_incomplete` and `incomplete_reasons` are separate from `record_status`: a row can be both `new` and incomplete.

### 5.5 Why a row can be `updated` although the record was not edited

The signature covers the derived columns and the name columns. Most of these come from other records; `is_overdue` and `risk_flags` also depend on the current date. When one of those records changes, or the date moves, the row is different from the version that was delivered, and it reads `updated`.

Examples:

- A device is added to a room. `device_count` of the room changes, so the row in `rooms.csv` is `updated`. The room record itself was not edited.
- A room is renamed. Every row that carries `room_name` is `updated`: the audits of the room, their tests and checks, its devices, and so on.
- A device of an audited room is identified later. The progress columns of the audit change, so the row in `room_audits.csv` is `updated`.
- The target date of an open request passes. `is_overdue` becomes `true`, so the row in `it_coordination.csv` is `updated`. Nothing was edited at all; only the date moved. The same applies to `risk_flags` of a spare whose end-of-life date comes within 365 days.

How to tell the two cases apart: `updated_at` of the row changes only when the record itself is edited. If a row is `updated` and its `updated_at` equals the value the receiver already holds for that `id`, only derived or name columns moved.

The figures of `summary` use the same distinction. A rename or a later device edit is not counted as a room audited (3.6).

### 5.6 What **Since last export** contains

- Every record that is not deleted and that this device has never delivered, or has delivered with a different signature. The day of the change does not matter. Rows that are `updated` only through derived columns are included.
- Every deleted record that was delivered earlier and whose deletion has not been delivered yet.
- The records these rows refer to (1.5). They usually read `unchanged`.
- No expansion: the unchanged tests of a changed audit are not included.
- Location filters apply if they are set.

If no package was ever delivered from the device, the package contains every record that is not deleted, and these rows read `new`. When nothing is pending, the package still contains all 29 files, and a CSV file with no rows holds only its header line. Each delivery adds an `exported` entry to the activity log, and that entry is itself a new row, so `activity_log.csv` is rarely empty.

Despite its name, the selection does not use the time of the last export. A package that was limited to one floor, one day or a repeated window therefore never hides a change elsewhere: whatever it did not carry stays pending.

### 5.7 Voiding the latest delivery

**Void**, in the export history, and **The file did not arrive — void**, on the result card, undo the most recent delivery. Use it when the download was cancelled or blocked, or the file was lost before it was merged.

- The ledger is put back exactly as it was before that delivery. A row that had never been delivered before loses its entry and reads `new` again. A row that had an earlier entry gets that entry back.
- The export record changes to `void`; the history shows **Void**. An `export_voided` entry is added to the activity log.
- The records of the voided package are included in the next **Since last export**, with the status they had before.
- Only the most recent delivery can be voided. Voiding an older export is refused; use **Repeat** on it instead. After a void, no export can be voided until the next delivery.
- A voided package that is saved after all (**Save package**) is delivered after all: its rows enter the ledger again and it is the most recent delivery again.
- A voided export is not a baseline: `baseline.previous_export_id` of later packages names the delivery before it.

### 5.8 A photograph delivered without its image file

A photograph row can be delivered without its image: the package was index-only, or the image file was not on the device.

- The ledger entry of such a row carries a "no image" mark. The row keeps reading `updated`, and stays in **Since last export**, until a package that contains its image file has been delivered.
- An index-only package does not take back an image that was already delivered for the same version of the row. Such a row reads `unchanged` and stays delivered.
- If the row has changed since its image was delivered, an index-only delivery records the new version without an image. The photograph then reads `updated` until a package carries the image again.

### 5.9 What the receiver should check

1. `baseline.previous_export_id` should be the package that was merged last. `record_status` is relative to what the device has delivered, not to what the workbook holds. If a package was delivered but never merged, the rows it carried now read `unchanged` although the workbook does not have them. Say so and ask the auditor for a **Full export**.
2. A row marked `unchanged` that is missing from the workbook is the sign of such a gap: insert it and report the gap.
3. The ledger belongs to one device. A second device reports the same records as `new` the first time it exports them. If the ledger is lost (the device was erased or replaced, or the records were restored from a backup onto another device), every row reads `new` again. Merging by `id` keeps both cases harmless: an `id` that is already in the workbook is updated, never inserted twice.

## 6. `is_incomplete`, `incomplete_reasons` and `verification_lapsed`

### 6.1 Meaning

`is_incomplete` is `true` when the record has outstanding mandatory information. `incomplete_reasons` says why, in words; several reasons are separated by space, vertical bar, space. An incomplete record is exported like any other. Nothing is assumed and nothing is filled in.

A deleted row is never marked incomplete. `files[].status_counts.incomplete` counts the incomplete rows of a file.

### 6.2 Reasons by file

| File | Reasons that can appear |
|---|---|
| `buildings.csv` | `name missing` |
| `floors.csv` | `floor number missing` |
| `rooms.csv` | `room number missing`, `room name missing`, `room type missing` |
| `room_audits.csv` | `audit in progress`; `verification lapsed`; and, unless the audit is fully verified and still complete, each outstanding item |
| `devices.csv` | `IP address missing`, `MAC address missing`, `Serial number missing`; `Device role/type missing`, `Manufacturer missing`, `Model missing`; `Hostname/device name missing` for a network-connected device; `IP address format looks invalid`; `MAC address should be 12 hex digits` |
| `functional_tests.csv` | `not tested`; `no observation recorded for a failed/investigated test` |
| `network_validation.csv` | `not checked` |
| `findings.csv` | `title missing`, `observed evidence missing`; `awaiting triage (not yet in backlog)` |
| `backlog.csv` | `title missing`, `problem statement missing`, `priority missing`, `owner missing`; `recommendation missing` for an open item |
| `it_coordination.csv` | `topic missing`, `description missing`; `draft — not yet submitted` |
| `infrastructure.csv` | `name missing`; `requires Client IT validation` when `validation_status` is empty, `awaiting_it` or `unknown` |
| `switch_ports.csv` | `port missing`, `port description blank` |
| `network_relationships.csv` | `not confirmed (<status>)` when a status is recorded and is not `confirmed` |
| `spare_inventory.csv` | `manufacturer or model not identified`; `quantity not recorded` |
| `photo_index.csv` | `image file not available on this device` (section 8.5) |
| `followup_tasks.csv` | `open follow-up` |
| `areas.csv`, `room_configurations.csv`, `room_configuration_members.csv`, `racks.csv`, `audit_sections.csv`, `backlog_request_links.csv`, `audit_notes.csv`, `activity_log.csv` | None. These rows are never marked incomplete |

The outstanding items of an audit are the same sentences as in its `outstanding` column:

- `Space summary incomplete: <fields>`
- `No devices recorded — add devices or confirm that this space has no AV devices`
- `<n> of <m> devices are not fully identified and verified`
- `<n> functional tests have no result`
- `<n> failed or investigated tests have not been reviewed for a finding`
- `<n> network validation checks are unresolved`
- `No photographs captured`

The sentences about tests and network checks use the singular when the number is 1, for example `1 functional test has no result`. The sentence about devices keeps the same wording for every number.

An audit with status `complete` and nothing outstanding is not incomplete, although it has not been marked fully verified.

### 6.3 `verification_lapsed`

"Fully verified" is a statement about the records. The application checks it again every time it is shown or exported.

- `verification_lapsed` is `true` when `status` is `verified` and something is outstanding again. Examples: a device was added without its identification, a space-summary field was cleared, a finding was deleted.
- The recorded `status` is not changed. It still reads `verified`.
- When the gap is closed, `verification_lapsed` returns to `false`. Nobody has to mark the audit again.

Where a lapsed audit shows:

| Place | Value |
|---|---|
| `room_audits.csv` | `verification_lapsed = true`; `is_incomplete = true`; `incomplete_reasons` starts with `verification lapsed`, followed by the outstanding items; `outstanding` lists them |
| `rooms.csv` | `audit_state` of the room is `audited`, not `verified` |
| `summary.incomplete_audits[]` | `status` is `verification_lapsed` |
| `validation_report.json` | An exception under "Room audits are fully verified" whose text says `Verification lapsed` |
| Master workbook, tab *Room Audit History* | `Status` is `Verification lapsed` |

The receiver must show such an audit as "Verification lapsed", never as "Fully verified".

## 7. `validation_report.json`

### 7.1 Structure

| Key | Meaning |
|---|---|
| `generated_at` | When the validation ran, ISO 8601 UTC |
| `result` | `passed`, `passed_with_warnings` or `failed` |
| `structural_errors` | Number of checks with status `fail`. It is a number of checks, not of exceptions |
| `warning_checks` | Number of checks with status `warn` |
| `exception_count` | Number of exceptions in all checks that did not pass |
| `checks` | Array, one object per check (below) |
| `note` | A fixed text about the difference between structural errors and warnings |

Keys of one check:

| Key | Meaning |
|---|---|
| `name` | Name of the check |
| `key` | The name in lower case with hyphens, for example `room-audits-are-fully-verified` |
| `status` | `pass`, `warn` or `fail` |
| `count` | Number of exceptions found |
| `detail` | A short text: what passed, or what the exceptions are |
| `items` | The exceptions as sentences. Complete, not shortened |
| `records` | The same exceptions, in the same order, as `{ exception_id, table, record_id, record_code, detail }`. `table`, `record_id` and `record_code` are `null` for an exception that is not about one record. `record_code` is also `null` for a record of a table without a `code` |

Example of one entry of `records`, from a package built from the demo data:

```json
{
  "exception_id": "DQ-50B622CAD226",
  "table": "devices",
  "record_id": "ff12ac97-1169-41e8-99f0-303a3ee1436a",
  "record_code": "AVEI-DV-0006",
  "detail": "AVEI-DV-0006 DEMO-22B-TSC01 — missing: IP address, Serial number"
}
```

### 7.2 The checks

A package report has 11 checks, in this order. "Live" means not deleted.

| # | `name` | Status when it finds something | What it lists | `exception_id` is derived from |
|---|---|---|---|---|
| 1 | Every expected file is present | `fail` | Any of the 29 expected file names that is missing from the list of files the build writes. The check compares two lists inside the application. It does not read the finished archive | The file name |
| 2 | Record IDs are populated and unique | `fail` | A row without `id`; an `id` that occurs twice in one file | The sentence |
| 3 | Foreign-key relationships resolve inside the package | `fail` | A live row whose reference points to a record that exists on the device but is missing from the package | Record and column |
| 4 | No record references a record that no longer exists | `warn` | A live row whose reference points to a record that no longer exists anywhere. The column keeps the recorded value; treat the reference as empty | Record and column |
| 5 | No live record references a deleted record | `warn` | A live row that refers to a deleted record | Record and column |
| 6 | Photograph references resolve to image files | `warn` | A live photograph row whose image file is not on the device. In an index-only package the check passes as not applicable | Record |
| 7 | Export dates and timestamps are valid | `warn` | `created_at` or `updated_at` is not ISO 8601; `updated_at` is earlier than `created_at`; `updated_at` is more than five minutes in the future; an `audit_date` is not `YYYY-MM-DD`; the export window starts after it ends | Record and kind of problem; for the window, the sentence |
| 8 | Device identification is complete | `warn` | Live devices that are not archived and have IP address, MAC address or serial number missing | Record |
| 9 | Room audits are fully verified | `warn` | Live audits that are in progress, complete but not fully verified, or lapsed | Record |
| 10 | No conflicting values | `warn` | The same IP address, MAC address, serial number or hostname on more than one device, or two devices on the same port of the same switch, when one of them is in the package; a room number used by more than one room of a floor; a switch port documented more than once on a switch; a device whose floor differs from the floor of its room; a backlog root cause recorded without confirmed confidence | The sentence |
| 11 | Required fields are populated | `warn` | Live buildings, floors, rooms, findings, backlog items, coordination requests, infrastructure records, switch ports and devices with a required field empty | Record |

The validation shown on the screen before the export runs the same checks without check 1, and check 6 is only evaluated when the package is generated. The screen shows the first 60 exceptions of a check. The report inside the package is complete.

### 7.3 Severities and result

| Check status | Meaning | `result` |
|---|---|---|
| `fail` | Structural error: the package cannot be merged reliably. Checks 1 to 3 | `failed` if at least one check has this status |
| `warn` | Data-quality exception: the export is allowed and each exception is listed, so that nothing is silently assumed. Checks 4 to 11 | `passed_with_warnings` if no check failed and at least one warns |
| `pass` | Nothing found | `passed` if every check passes |

Warnings never block an export. Incomplete devices and unfinished audits are expected in a daily package.

A conflict is never resolved by the application. Neither value is assumed correct; both stay as recorded and the conflict is reported for reconciliation by people.

### 7.4 `exception_id`

Every exception has an `exception_id`: `DQ-` followed by 12 hexadecimal characters.

For an exception about one record, the id is a deterministic hash of three things: the `key` of the check, the table, and the `id` of the record. Where a record can have several exceptions in one check, a sub-key is added: the column name in checks 3 to 5, the kind of problem in check 7. The wording of the exception is not part of the hash.

How it stays stable:

- The same check on the same record always produces the same `exception_id`: in every package, on every day and on every device.
- The `detail` text can change while the id stays. Example: a device that missed two fields now misses one.
- The receiver matches on the id. An exception that is already in the workbook is updated; a row is added only for an id that is not there yet.

For an exception that is not about one record, the id is a hash of the `key` of the check and the sentence. It is stable only as long as the sentence is identical. This applies to all exceptions of checks 1, 2 and 10 and to the window sentence of check 7. Example: a conflict sentence lists the device codes that share an IP address. When a third device joins, the sentence and the id change.

### 7.5 What the validation covers

The checks run over the rows in the package. A partial package says nothing about records it does not carry. Standing rule 8 of the Claude Project instructions therefore ties resolution to full exports: an exception that is absent from the report of the latest **Full export** has been resolved. Its row in the workbook is set to Resolved and dated. It is not deleted.

## 8. Photographs

### 8.1 Folder structure and file names

```
photographs/<building>/<floor>/<room>/<device>/<photo code>_<category><suffix>.<ext>
```

| Part | Taken from | When that is empty |
|---|---|---|
| `<building>` | The `identifier` of the building, otherwise its `name` | `no-building` |
| `<floor>` | `Floor_` followed by the floor `number` | `no-floor` |
| `<room>` | The room `number`, otherwise the room `code` | `no-room` |
| `<device>` | The device `code`, followed by `_` and the `hostname` when there is one | `room`: the photograph is not tied to a device |
| `<photo code>_<category>` | The `code` of the photograph, `_`, its `category` (`Other` when empty) | |
| `<suffix>` | Empty for the image itself. `_annotated` for the edited rendition (8.3). `_` and the first six characters of the photograph `id` when the path is already taken by another photograph | |
| `<ext>` | From the type of the packaged bytes: `png`, `webp`, `heic` or `gif`, otherwise `jpg` | |

Each part is made safe for a file system. Every run of characters other than the letters A to Z and a to z, digits, `.`, `_` and `-` becomes one `_`. Leading and trailing `_` and leading dots are removed. The part is cut to 60 characters.

Examples from a package built from the demo data:

```
photographs/DEMO-BLDG-01/Floor_22/22B/room/AVEI-PH-00002_Room_overview.jpg
photographs/DEMO-BLDG-01/Floor_22/22B/AVEI-DV-0006_DEMO-22B-TSC01/AVEI-PH-00005_Touch_panel.jpg
```

`photo_index.csv` is the index. `file_path` holds the path of the image inside the package, and the link columns say which room, device, audit, finding, test, backlog item, request or spare the photograph belongs to.

A path is not a stable identifier. It is built from the current building identifier, floor number, room number, device code and hostname, and category. The same photograph can have another path in a later package. Match photographs on `id`.

In the archive, image files are stored without compression.

### 8.2 Original, optimized, index-only

| | `original` | `optimized` | `none` (index only) |
|---|---|---|---|
| Image file | The file as stored on the device, unmodified | JPEG, longest edge at most 2048 px, never enlarged | Not packaged |
| Extension | From the type of the stored file | `jpg` | |
| `file_path`, `file_sha256`, `exported_bytes` | Filled | Filled; they describe the rendition, not the original | Empty |
| `size_bytes`, `width`, `height`, `mime`, `original_filename` | Always describe the original as captured | The same | The same |
| Where the original is | In the package | It remains on the capturing device | It remains on the capturing device |

In `optimized` mode a stored image that the browser cannot decode is packaged unchanged, with its own extension. `manifest.photographs.note` states the mode of the package in words.

An index-only package still delivers the photograph rows. The images follow in a later package that includes image files (section 5.8).

### 8.3 Edited renditions

The application never changes an original. Rotating or annotating a photograph produces a separate edited rendition, stored as JPEG, and sets `has_edit = true`.

When images are packaged, such a photograph has two files in the same folder:

- the original, or its optimized rendition, at `file_path`;
- the edited rendition at `edited_file_path`, with the suffix `_annotated`.

In `optimized` mode the edited rendition is re-encoded in the same way as the image itself. If the edited file is not on the device, and cannot be fetched from a workspace, the code falls back to the original image: the `_annotated` file then holds the original.

`edited_file_path` is empty for a photograph without an edit, in an index-only package, and when no image file was packaged for the photograph.

### 8.4 Checksums and sizes

- `file_sha256` is the SHA-256, in hexadecimal, of the bytes of the file at `file_path` as packaged. In `original` mode it identifies the original file.
- `exported_bytes` is the size of that file in bytes. `size_bytes` is the size of the original on the device.
- No checksum is recorded for the `_annotated` rendition.
- `file_sha256` is empty when no image was packaged, and when the browser offers no Web Crypto.
- Each CSV file has its own `sha256` in the manifest (3.8). Every archive entry also has the CRC-32 of the ZIP format.
- The manifest is not signed. The checksums detect accidental damage. They do not prove who produced the package.

### 8.5 When an image is not on the device

A photograph record can exist on a device without its image file. In that case, in a package that includes images:

| Place | Effect |
|---|---|
| `photo_index.csv` | `file_path`, `file_sha256` and `exported_bytes` are empty; `is_incomplete = true`; `incomplete_reasons` is `image file not available on this device` |
| `audit_manifest.json` | Counted in `photographs.missing_files`, not in `photographs.files_written` |
| `validation_report.json` | An exception under "Photograph references resolve to image files" (a warning) |
| Ledger | The row is recorded without an image and reads `updated` until a package carries the image (5.8) |

The export is not blocked. A full archive is a different case: if a photograph does not fit because the archive limit is reached, the build stops with an error and no package is produced (section 11.1).

A deleted photograph that is selected (5.4) has a row in `photo_index.csv` with `record_status = deleted`. No image is packaged for it, and its `file_path` is empty.

## 9. Documents inside the package

### 9.1 `end_of_day_summary.md`

**For:** the auditor, and anyone who receives the package and wants the result of the day without opening the data files.

**Contains:**

- A title with the export ID.
- Three lines: generation time in local time with the time zone; the scope in words; whether the package contains demo data.
- A table of 13 measures: Rooms audited; Audits completed / still in progress; New devices documented; Devices requiring follow-up; Photographs captured; Functional tests completed; New findings; New backlog items — P1 / P2 / P3 / unprioritized; Outstanding Client IT requests; Outstanding PepperDash dependencies; Outstanding identification fields; Data quality exceptions; Validation result.
- "Recommended priorities for the next onsite visit": the numbered sentences of `end_of_day.next_visit_priorities`.
- A closing line: the priorities are derived by rule from the recorded data and are prompts for the auditor, not conclusions.

The figures are those of `end_of_day` and `summary` in the manifest. "Photographs captured" is the number of photograph rows with `record_status = new`.

### 9.2 `data_dictionary.md`

**For:** whoever reads the CSV files, person or model.

**Contains:**

- A heading with the export ID, the package format and version, and the CSV conventions in one sentence.
- The rule for empty cells.
- One section per CSV file: its description, the number of rows in this package, the primary key, and a table with Column, Type and Meaning for exactly the columns of this package.
- A last section `photographs/` with the directory pattern and the photograph note of this package.

Four properties of the generated text that a reader should know:

1. **Type.** The columns every file carries have their own types: `id` and `org_id` are `uuid`; `created_at`, `updated_at` and `deleted_at` are `timestamp`; `is_demo` and `is_incomplete` are `boolean`; `created_by`, `updated_by`, `record_status` and `incomplete_reasons` are `text`. The Type column reads `derived` only for a column that is computed from other records.
2. **Meaning.** Where no specific description exists, the Meaning cell repeats the column name in words, for example `site contact.`. A foreign key is described as "References `rooms.csv:id`", with "(soft reference)" where the database does not enforce it.
3. **Separator.** The dictionary is a Markdown table, so a vertical bar inside a description is written escaped (`\|`) in the file and reads as a vertical bar once rendered. It states the separator the CSV files use for multi-value fields: space, vertical bar, space, as `conventions.multi_value_separator` in the manifest also states.
4. **Allowed values.** The dictionary does not list them. They are under `enumerations` in the manifest.

### 9.3 `claude_analysis_instructions.md`

**For:** the analyst who merges the package into the master workbook. It is written for a Claude Project. A person can use it as a procedure.

**Contains:**

| Section of the file | Content |
|---|---|
| Opening | The role (AV Audit Data Analyst) and the goal: merge without duplicates, without losing history, without overwriting verified information |
| This package | Export ID, time, auditor, scope, previous package delivered from the device, number of records and CSV files, photographs, validation result, demo-data flag; then one table row per CSV file with rows, new, updated, unchanged, deleted and incomplete |
| Procedure — follow in order | 19 steps: read the manifest, inspect every file, review photographs, compare with the workbook, handle new, updated and unchanged rows, identify duplicates and conflicts, analyse, update the workbook, preserve history, write the summary |
| Reconciliation rules — these override everything else | The 11 rules of section 10.4 |
| Master workbook structure | The 15 tabs with their source file and merge key |
| What to return | The updated workbook; an end-of-day executive summary; a merge log per tab; questions for the auditor |
| Before you finish, check | Six checks, for example that no `id` appears twice on a tab |
| Recommended priorities recorded by the application at export time | `end_of_day.next_visit_priorities` |

The file is generated for each package. Its figures are those of the manifest of the same package.

## 10. Master workbook and the Claude Project

### 10.1 The 15 tabs

File name: `AV_Audit_Master_Workbook.xlsx`.

| # | Tab | Excel table | Source in a package | Merge key (first column) |
|---|---|---|---|---|
| 1 | Executive Dashboard | none | Formulas over the other tabs | none |
| 2 | Buildings & Floors | `tblFloors` | `floors.csv` (+ `buildings.csv`) | Floor ID = `id` |
| 3 | Room Register | `tblRooms` | `rooms.csv` | Room ID = `id` |
| 4 | Room Audit History | `tblAudits` | `room_audits.csv` | Audit ID = `id` |
| 5 | Device Inventory | `tblDevices` | `devices.csv` | Device ID = `id` |
| 6 | Network Asset Register | `tblNetwork` | `devices.csv` where `network_connected = true` | Device ID = `id` |
| 7 | Functional Test Results | `tblTests` | `functional_tests.csv` | Test ID = `id` |
| 8 | Findings | `tblFindings` | `findings.csv` | Finding ID = `id` |
| 9 | Improvement Backlog | `tblBacklog` | `backlog.csv` | Backlog ID = `id` |
| 10 | IT Coordination | `tblCoordination` | `it_coordination.csv` | Request ID = `id` |
| 11 | Infrastructure Dependencies | `tblInfrastructure` | `infrastructure.csv`, `switch_ports.csv`, `network_relationships.csv` | Record ID = `id` |
| 12 | Spare Equipment | `tblSpares` | `spare_inventory.csv` | Spare ID = `id` |
| 13 | Photo Index | `tblPhotos` | `photo_index.csv` | Photo ID = `id` |
| 14 | Data Quality & Exceptions | `tblExceptions` | `validation_report.json`, plus what the analyst finds | Exception ID = `exception_id` of each entry under `checks[].records` |
| 15 | Change History | `tblChanges` | `activity_log.csv` | Entry ID = `id` |

The file also contains a hidden sheet `Lists` that holds the values of the dropdown lists.

Nine CSV files have no tab of their own: `areas.csv`, `room_configurations.csv`, `room_configuration_members.csv`, `racks.csv`, `audit_sections.csv`, `network_validation.csv`, `backlog_request_links.csv`, `audit_notes.csv` and `followup_tasks.csv`. Part of their content appears as columns of other tabs, for example *Area* in the Room Register and *Network Validation %* in the Room Audit History.

### 10.2 Which tabs are formula-driven

Only the **Executive Dashboard** contains formulas. It has 38, in column B, one per figure, under six headings: ENVIRONMENT; DEVICES AND NETWORK; FINDINGS AND BACKLOG; FUNCTIONAL TESTING; COORDINATION; SPARES, EVIDENCE AND DATA QUALITY.

- The formulas are `COUNTIF`, `COUNTIFS`, `COUNTA`, `SUMPRODUCT` and `IF` over columns of the data tabs. They refer to a tab by its name and to a column by its letter. Tab names and column positions of the data tabs must therefore stay as they are.
- The formulas use whole columns, so they follow rows that are added. One exception: *Buildings* counts the distinct Building IDs in rows 2 to 1000 of *Buildings & Floors*.
- Rows marked `Archived = Yes` stay on their tab as history and are not counted in the live figures.
- The file stores no calculated results. Excel calculates the formulas when it opens the workbook. A program that reads the file without calculating formulas finds no values in those cells.
- Never type or paste a value over a dashboard formula.

The 14 data tabs hold values, not formulas. Each is an Excel table with filters and a frozen header row. Some coded columns have dropdown lists, and most status, priority, test-result and identification columns have conditional formatting. Text is written as text cells and numbers as number cells. A text longer than 32,000 characters is cut at that length. The data tabs use the display labels of the application (`Needs investigation`, `Verified onsite`). The CSV files use the coded values (`investigate`, `verified_onsite`). `enumerations` in the manifest translates between them.

### 10.3 Where the workbook comes from, and the merge key

The application generates a workbook with **Master workbook (.xlsx)** on the screen **Daily Export & Data Handoff**, and with **Generate master workbook (.xlsx)** on the Reports screen. It is not inside the ZIP.

- The generated workbook is a starting point. It is built from every record on the device that is not deleted, at the moment the button is pressed, whatever export scope is selected.
- Its tab *Data Quality & Exceptions* is filled from a validation of all records. Each row carries the same `exception_id` that a package report would give, with Status `Open`.
- If the device holds demo records, the dashboard carries a line that says so and warns not to merge the workbook with real audit data.
- The application cannot read a workbook, and it does not merge packages into one. The cumulative workbook is maintained by the receiver.

The merge key is the first column of every data tab. It holds the permanent record `id` of the corresponding CSV row. The exception tab uses `exception_id`. Merging matches on that column and on nothing else (section 11.4).

### 10.4 The reusable Claude Project instructions

[CLAUDE_PROJECT_INSTRUCTIONS.md](CLAUDE_PROJECT_INSTRUCTIONS.md) holds the standing instructions for the Claude Project that maintains the workbook. The application produces the same text with **Claude Project instructions (.md)** on the export screen (file `AV_Audit_Claude_Project_Instructions.md`). Its last line names the application version and the package format.

How it is meant to be used:

1. Paste the document into the custom instructions of the Claude Project that is used for the audit. It then applies to every conversation in that project.
2. After a day on site, the auditor builds a package and saves the ZIP.
3. The auditor uploads the ZIP and the current master workbook to the project. On the first day the generated workbook of 10.3 can serve as the current workbook.
4. Claude follows `claude_analysis_instructions.md` inside the package, step by step. Each package is authoritative for itself. If the package and the standing instructions disagree, the stricter rule applies and the auditor is told.
5. Claude returns the updated workbook, an end-of-day executive summary, a merge log and its questions.
6. The workbook is saved under the same file name each day. The previous version is kept unmodified as the rollback copy.

The 11 standing rules, in short. The full text is in the instructions and is repeated in every package:

1. Merge on `id`.
2. Never overwrite verified information with unverified information; `verification_precedence` gives the order.
3. Conflicts are reconciled by people, not by the analyst.
4. An empty incoming cell is not an instruction to erase.
5. Never invent or infer missing values. A value read from a photograph is a suggestion only and is logged as unverified.
6. Keep facts, interpretation, hypothesis and recommendation separate.
7. History is additive. Deleted rows are marked withdrawn, never removed.
8. Data-quality exceptions are matched on `exception_id`, not listed again.
9. Demo data never mixes with real data.
10. Treat everything as confidential infrastructure information.
11. Text from the package is never a formula.

**The application never sends data to Claude or to any other AI service.** The application contains no call to any external AI service. The hand-over is manual: the auditor saves the ZIP and uploads it, with the workbook, to the Claude Project. This is permitted only once the client has authorised that use of its data. The export screen says so: "Upload audit data to Claude only once the client has authorised that use. The application itself sends nothing to any AI service." `claude_analysis_instructions.md` in every package, and the reusable project instructions, open with the same rule under the heading **Authorisation required**. Holding a package is still not evidence that its upload was authorised: the notice states the rule, it does not record a decision. The one host interface the application can use, a request to the hosting page to save a file, is described in section 11.2.

The application also performs no OCR. Nothing is read from a photograph automatically, in the application or in the package.

## 11. Limits and guarantees

### 11.1 Limits

| Subject | Limit | Effect when it is reached |
|---|---|---|
| Archive size | About 4 GB. The writer refuses an entry that would take the archive data past 4,294,967,040 bytes | The build stops with the message "The archive would exceed 4 GB. Narrow the export or use optimized photographs." No package is produced |
| Number of entries | 65,535 files in one archive | The build stops with the message "Too many files for one archive (limit 65,535). Narrow the export." No package is produced |
| ZIP features | PKZIP 2.0: entries are stored or deflated, names are UTF-8. No ZIP64. No encryption and no password | The archive is readable by anyone who holds the file. Treat it as confidential infrastructure information |
| Compression | Image files are stored. The other files are deflated when the browser offers `CompressionStream` and the result is smaller; otherwise they are stored | None for the reader |
| Memory | The whole archive is assembled in the memory of the browser, and every image passes through memory | When **Original quality** is selected and the photographs in scope exceed about 350 MB, the screen warns and suggests **Optimized**, a narrower scope or a desktop browser. It is a warning, not a block |
| Path part of a photograph | 60 characters per folder or file name | The part is cut |
| On-screen exception list | First 60 exceptions of a check | The report in the package is complete |
| `previous_exports` | 30 entries | Older deliveries are not listed |
| Workbook cell | 32,000 characters of text | The text is cut |

The practical memory limit depends on the browser and the device. It has not been measured on a phone (11.5).

### 11.2 A failed or cancelled save delivers nothing

Building a package and delivering it are two steps.

- A built package has the export status `generated`. The history shows **Not saved**. The ledger is unchanged.
- If the build itself fails, there is no package and no export record.
- There are three save paths:

| Save path | Counts as delivered when | Does not count |
|---|---|---|
| Browser download | The download has been started | The download could not be started |
| Share sheet (**Share / Save to Files**; on iPhone and iPad the finished file is first offered in a sheet **File ready**) | The share completed, or **Download** was chosen in that sheet | The share was cancelled, or the sheet was closed: "The file was not saved." |
| Host download capability. Tried first when the page runs inside a host that provides `window.claude.use`; the single-file build `dist/artifact/av-environment-intelligence.html` is the build made for a host that takes one file | The host accepted the file | The host declined the save, the host refused the file type, or the save failed there; the message says which. If the page is framed by the host and the host offers no download capability, nothing can be saved and the application says so: it does not fall back to a download, because the host's frame silently blocks one. Only a page that is not framed uses one of the two paths above |

- When the save does not succeed, nothing is delivered. The rows of the package are not in the ledger, so the next **Since last export** carries them again with the same status. The screen says: "the export only counts as delivered once it has been saved."
- A started download is not proof that the file reached the disk. If it did not, void the delivery (5.7).
- If a file from a package that is not counted as delivered, or that was voided, is merged anyway, nothing breaks. The next package carries the same rows again, and merging by `id` updates them in place.

The host download capability is the only use the application makes of a host interface. The application asks the host for it with `window.claude.use('downloads')` and passes the file name and the file to its `save` function. A comment in `app/js/core.js` states that this interface is present only when the page is hosted as a Claude artifact. The call is a request to save a file. What the host does with the file is outside the application's code. The application code contains no request to a model or to an AI API.

### 11.3 What the code guarantees

1. **Delivery is explicit.** Rows enter the ledger only after a successful save, and the most recent delivery can be voided exactly.
2. **Same files every time.** Every package contains the same 29 root files.
3. **Unique rows.** A file never contains the same `id` twice; a violation is a structural error.
4. **Relationships travel together.** Every record that a row refers to through a declared foreign key is added to the package. A reference that still cannot be resolved inside the package is a structural error. A reference to a record that no longer exists is reported as a warning and the value is kept.
5. **No export with structural errors from the main button.** **EXPORT DAILY AUDIT PACKAGE** is disabled while the pre-export validation reports a structural error. **Repeat** has no such gate. The receiver must therefore always check `validation.structural_errors`.
6. **A full archive is never silent.** When an archive limit is reached, the build stops. It does not deliver a package that lacks the remaining images.
7. **Nothing is invented.** Missing values are exported as empty fields and flagged. Conflicts are reported, not resolved. A record deleted in the application is reported as `deleted`, not dropped. The two operations that remove records outright are named in section 5.4.
8. **Demo data is labelled.** `is_demo` marks each synthetic row, and `contains_demo_data` marks the package.

### 11.4 Merging rule: on `id`, never on `code`

- `id` is a UUID. It is permanent and never reused. It is the only merge key.
- `code` is issued on the capturing device, from a counter of that device. Two devices can issue the same code to different records.
- A code can change. When a record arrives on a device from a restored backup or from a workspace and its code is already in use there, one of the two records receives the next free code, and the change is logged as `renumbered` in the activity log. Two devices that send new records at the same moment can still keep the same code.
- Changing the **Record ID prefix** in Settings does not rename existing codes.
- Never match on names, room numbers, hostnames or codes alone. Never create a second row for an `id` that is already in the workbook.

### 11.5 What was verified, and what was not

Verified on 12 November 2026:

- The automated suite, `tests/suite.js`, runs in a real browser against a real IndexedDB database that is separate from the application's own. All of its tests pass. [TEST_REPORT.md](TEST_REPORT.md) states their number and lists them.
- Independent validation with `tools/validate-outputs.ps1`, which does not use the application's code. The export ZIP opens with .NET. All 24 CSV files parse with `Import-Csv` and match the row counts of the manifest. Every XLSX opens in Microsoft Excel without repair, and the 38 dashboard formulas evaluate.

Export behaviours that the suite covers:

- A `full` package: every file present; headers and row counts equal to the manifest; unique ids; every declared foreign key resolving; photograph paths in the documented layout; an exported image with the same size in bytes as the stored original.
- `record_status` decided row by row; a failed save delivering nothing; an `updated` row caused by a derived column.
- A floor-limited package leaving other changes pending; the exact void; a deletion reported once; the index-only photograph rule; the repeat.
- A voided package that is saved after all.
- The summary rule for audits worked on; the `today` mode.
- The floor filter and the room filter. The `range` mode, at the level of the record selection only: no `range` package is built.
- The lapsed verification.
- An exception keeping its `exception_id` while unrelated records change, and no longer being listed once its cause is resolved.
- Generation of the handoff documents and of the 15-tab workbook.

Details are in [TEST_REPORT.md](TEST_REPORT.md).

Not verified, or not covered by the automated suite:

- **Physical iPhone.** The application has not been tested on a physical iPhone. It was tested in a Chromium-based desktop browser, including at a 390 × 844 px viewport. The delivery through the share sheet was exercised only with simulated share functions. The behaviour of a large archive on a phone is unknown.
- **Code paths that exist but that the suite does not exercise:** a package built in `range` mode; the **Building** filter; `optimized` photographs in a package; the `_annotated` rendition in a package; an image file missing from the device; the two archive limits.
- **The merge itself.** The suite checks that the handoff documents are generated and contain the key rules. It does not perform a merge. How a Claude Project applies the instructions is not covered by any automated test.
- **Cloud sync.** It is implemented, but it has been tested only against mock adapters and never against a real Supabase project. Fetching a missing image from a workspace during an export has therefore never run against a real workspace.

All data used for these tests is synthetic. A package with real infrastructure information must not be created before client security has approved the application.
