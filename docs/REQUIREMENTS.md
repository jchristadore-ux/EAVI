# Requirements checklist — AV ENVIRONMENT INTELLIGENCE

This document traces each requirement of the project brief (sections 1–19, condensed into one checkable line per requirement) to the application as it stood on 2026-11-12. For every line it gives the status, the file or screen that implements it, and how it was verified. It records what exists and what was tested; it is not an approval: the application has not been approved by client security, and it must be approved before real infrastructure information is entered.

## 0. How to read this checklist

Sections 1 to 19 keep the section numbers of the brief, so requirement R5.C4 is in section 5. Section 18 of the brief has no line in this checklist. Section 20 names the tests. Section 21 lists the open items.

**Status.** A status describes the code, which was read for every line.

| Status | Meaning |
|---|---|
| Implemented | The code does what the line says. |
| Implemented with stated limits | The code does it, but part of it is missing, restricted or untried. The row says which part. |
| Not implemented | No code does it. |

**Verified by.** This column says what evidence exists beyond reading the code.

| Entry | Meaning |
|---|---|
| T1 to T54 | A test in `tests/suite.js`. Section 20 gives its exact name. The suite runs in a browser against a separate IndexedDB database. All 54 tests passed on 2026-11-12. |
| Output validation | `tools/validate-outputs.ps1`, run on the files the suite produced. On 2026-11-12: the export ZIP opens with .NET; all 24 CSV files parse with `Import-Csv` and match the manifest counts; the PDFs have a valid xref; every XLSX opens in Microsoft Excel (COM) without repair and the 38 dashboard formulas evaluate. |
| Manual check | Done by hand on 2026-11-12. The row says what was checked. |
| Renders | T45 or T46 opened the screen or editor without an error. This shows that it draws, not that the feature works. |
| Not separately tested | No test, script or manual check covers the point. |

**Where.** File names without a folder, and paths that begin with `pages/`, are in `app/js/`. Other paths start at the project root. Functions are named as the files define them: `S.` in `schema.js`, `R.` in `rules.js`, `A.` in `actions.js`, `P.` in `photos.js`, `X.` in `exporter.js`, `H.` in `handoff.js`, `Rep.` in `reports.js`. Bold text is a label in the user interface.

**Limits.** A row cites these by code. L4 and L5 are things the application does not do at all.

| Code | Limit |
|---|---|
| L1 | `supabase/schema.sql` is generated from `app/js/schema.js` by `tools/gen-schema.js` and has been reviewed statically. It has never been executed against a database. |
| L2 | Cloud sync (Supabase REST, `sync.js`) has been run against mock adapters only, never against a real Supabase project. It is off by default. The default site build cannot switch it on: its Content-Security-Policy (`connect-src 'self'`) blocks every outside connection. `tools/build.ps1 -SyncOrigin https://<project>.supabase.co` adds exactly that one origin. The single-file page in `dist/artifact/` has no policy of its own. |
| L3 | The application has not been tested on a physical iPhone. It was tested in a Chromium-based desktop browser, including a 390 × 844 px viewport, and offline with the server stopped. No test exercises the camera. |
| L4 | There is no OCR. Nothing is read from a photograph, and the application does not claim it. |
| L5 | There is no network scanning or discovery, no device configuration and no call to any external AI service. |
| L6 | Record codes such as `AVEI-DV-0042` are issued per device. A clash is renumbered when the application sees it: a record arriving from the workspace, or a restored backup. Two devices can still hold the same code. The permanent key is the UUID in `id`. |
| L7 | The passcode is an app lock, not encryption. Records and photographs in IndexedDB are protected only by the device's own encryption. |
| L8 | The CSV files inside the daily export package are not formula-escaped (`conventions.csv.formula_escaping` in `audit_manifest.json` begins with "none"). CSV downloads from reports and lists are escaped. |
| L9 | A package is assembled in memory, so its size is limited by the device. The ZIP writer stops at 4 GB or 65,535 files. The export screen warns above about 350 MB of original-quality photographs. |

Related documents: [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md), [DEPLOYMENT.md](DEPLOYMENT.md), [EXPORT_FORMAT.md](EXPORT_FORMAT.md), [MOBILE_GUIDE.md](MOBILE_GUIDE.md), [TEST_REPORT.md](TEST_REPORT.md).

## 1–2. Product and design

| ID | Requirement | Status | Where | Verified by |
|---|---|---|---|---|
| R1.1 | Application name "AV ENVIRONMENT INTELLIGENCE"; tagline "See the environment. Understand the infrastructure. Improve the experience." | Implemented | `core.js` (`EV.APP`), `auth.js` (`EV.brand`). When **Organization name** is set in Settings, the sidebar and the set-up, lock and sign-in screens show it in capitals above "AV ENVIRONMENT INTELLIGENCE", and the phone top bar shows the organization name only. The organization name is not pre-filled; while it is empty, all of them show only "AV ENVIRONMENT INTELLIGENCE". The tagline is on the set-up, lock and sign-in screens, and on the Command Center while no building exists. | Not separately tested. |
| R1.2 | Mobile-first working platform for an onsite AV audit; usable one-handed while walking; desktop is the secondary management/reporting experience. | Implemented with stated limits | One responsive application (`shell.js`, `app/css/app.css`): a bottom bar with the **NEW** button below 1024 px, a sidebar from 1024 px. One-handed use while walking has not been tried on a phone (L3). | T46. |
| R2.1 | Dark charcoal/navy interface, white and muted-grey type, restrained electric-blue accent, clear hierarchy, minimal clutter, large touch targets, no unnecessary animation; not a consumer-app look. | Implemented with stated limits | `app/css/app.css`: one dark theme (background `#090d15`, surfaces `#0f1522`, text `#e8ecf4`, accent `#3d8bff`). The only animations are two short transitions (progress bar, toggle), used only when the device does not ask for reduced motion. Main buttons, inputs and list rows are 44 to 58 px high. Below 1024 px, or on a touch screen, small buttons, icon buttons and filter pills are 44 px as well, and a switch, a text link and a tappable chip have a 44 px touch area. The four pen-colour buttons of the annotation tool are 44 px there too. Limit: with a mouse at 1024 px or more, small buttons are 36 px, icon buttons 32 to 40 px and filter pills 38 px. | T46 measures every tapped control on the screens and sheets it opens at 390 × 844 px (at least 44 × 44 px, or a 44 px touch area), and the five bottom-navigation targets. It also opens the annotation tool from the photograph viewer and measures it. The look is not separately tested. |
| R2.2 | Persistent navigation on desktop; bottom or collapsible navigation on phones. | Implemented | `shell.js`: a sidebar from 1024 px. Below that, a bottom bar with **Home**, **Audits**, **NEW**, **Backlog** and **More**; **More** lists all eleven sections. | T46 (phone width). The sidebar is not separately tested. |
| R2.3 | Primary navigation: Command Center, Buildings & Floors, Room Audits, Device Inventory, Infrastructure, Findings & Backlog, IT Coordination, Spare Equipment, Reports, Settings (plus Daily Export & Data Handoff, R19). | Implemented | `shell.js` (`EV.NAV`): eleven entries with these labels. **Daily Export & Data Handoff** comes before **Settings**. | Renders (T45 opens all eleven). |

## 3. Command Center

| ID | Requirement | Status | Where | Verified by |
|---|---|---|---|---|
| R3.1 | Environment overview: buildings audited, floors audited, total conference spaces, rooms completed, rooms awaiting audit, total network-connected devices, devices with incomplete identification, open findings, P1 critical findings, outstanding IT dependencies, backlog completion %. | Implemented | **Environment overview** on the Command Center (`pages/command.js`): the eleven figures, plus **Photographs**. They come from `R.metrics`. | T20. |
| R3.2 | Audit progress by building and floor (total spaces, audited, partially audited, not started). | Implemented | **Audit progress** on the Command Center; `R.floorProgress`. | T4, T6 (floor and room states). Renders (T45). |
| R3.3 | Priority alerts: critical room availability, missing device identification, network documentation gaps, unknown IPs, missing MACs, missing serials, unresolved infrastructure risks, low spare inventory. | Implemented | **Priority alerts**; `R.alerts` has one alert for each of the eight items. An alert is shown when its count is above zero. | T20. |
| R3.4 | Recent activity: latest audits, photographs, device additions, findings, status changes. | Implemented | **Recent activity**: the 14 most recent headline entries of `activity_log`. Detail entries (one test result, one switch port) are in the exported change history, not in this feed. | T41. |
| R3.5 | Every dashboard metric is calculated from application records — nothing hard-coded. | Implemented | `rules.js`: `R.metrics`, `R.deviceStats`, `R.alerts`, recomputed when the records change. | T20. |

## 4. Buildings and floors

| ID | Requirement | Status | Where | Verified by |
|---|---|---|---|---|
| R4.1 | Hierarchy Organization → Building → Floor → Area → Room/Space → Rack → Device; create, edit, archive, organize. | Implemented with stated limits | `pages/environment.js`, `pages/devices.js`: buildings, floors, areas, rooms, racks and devices can be created, edited and archived. Limit: one installation holds one organization. Its name and **Record ID prefix** are edited in Settings; an organization cannot be created or archived in the application. | T4, T48. Areas and racks appear in tests only through the demo seed (T19); their editors are not separately tested. |
| R4.2 | Building fields: name, street address, identifier, number of floors, site contact, notes. | Implemented | `schema.js` (table `buildings`, `S.F.building`). | T4. |
| R4.3 | Floor fields: number/name, designation, area descriptions, infrastructure notes, audit status, associated spaces. | Implemented | `schema.js` (`S.F.floor`, `S.F.area`); floor screen in `pages/environment.js`. The audit status is derived from the room audits unless it is set by hand. | T4 (floor fields). Areas are not separately tested. |
| R4.4 | Every room has a permanent unique identifier. | Implemented with stated limits | `store.js` (`store.create`, `store.nextCode`): a UUID `id` and a code `AVEI-RM-nnnn`, shown on the room and audit screens. The `id` never changes. The code is issued per device and is renumbered after a clash (L6). | T4, T40. |
| R4.5 | Room types: small/medium/large conference, executive conference, boardroom, divisible conference, multipurpose, town hall, presentation, training, huddle, focus, rack room, support area, other. | Implemented | `schema.js` (`S.ROOM_TYPES`, 14 values). | T1. |
| R4.6 | Divisible rooms as related spaces with configurable combined configurations; auditable independently and as a combined configuration. | Implemented | Tables `room_configurations` and `room_configuration_members`; **Combined configurations (divisible rooms)** on the floor screen; `A.startAudit` accepts a room or a configuration. Member rooms keep their own audits. | T28 (a configuration and its members), T50 (an audit of a combined configuration is started, resumed and completed; the member rooms keep their own state). |

## 5. Mobile room audit workflow

| ID | Requirement | Status | Where | Verified by |
|---|---|---|---|---|
| R5.1 | Select a floor, select a room, begin an audit in seconds. | Implemented | **Room Audits** (`pages/audits.js`): floor buttons, then one tap on a room starts or opens its audit. **NEW → New Room Audit** asks for floor and room in one sheet (`ui.pickRoom`). | T6. The time taken is not measured. |
| R5.A | Space summary: building, floor, area, room name/number, room type, capacity, conferencing platform, control platform, DSP platform, display/camera/microphone configuration, scheduling platform, audit date, auditor, operational status. | Implemented | **Space Summary** section of the audit (`pages/audits.js`). Room fields are in `S.F.room`; audit date, auditor and operational status are on the audit. A snapshot is stored when the audit is completed or verified. | T13, T15. |
| R5.B1 | Direct smartphone camera capture and image upload, from the audit screen, without a complicated upload flow. | Implemented with stated limits | `photos.js` (`P.captureLabel`): a file input with `capture="environment"` behind **Take photo** and the **Photo** button of the audit bar; **Upload** takes existing images. The camera has not been tried on a phone (L3). | T15 stores a photograph from an image file. The camera input is not separately tested. |
| R5.B2 | Photo categories: room overview, displays, cameras, microphones, touch panel, table connectivity, rack overview, rack elevation, device rear panels, equipment labels, cable terminations, network switches, other. | Implemented | `schema.js` (`S.PHOTO_CATEGORIES`, 13 values). Three are written **Display(s)**, **Camera(s)**, **Microphone(s)**. | T1. |
| R5.B3 | Every photo: attached to building/floor/room/audit; timestamp; optional description; category tag; organized gallery; device association when applicable; multiple per room and device. | Implemented | `photos.js`: `P.add` records building, floor, room, audit, device, time taken, category and description. Galleries by category in the audit, by room and by device; **Linked device** in the photograph viewer. | T15. |
| R5.B4 | Photo annotation and rotation if feasible. No claim of automatic reading (OCR) unless implemented and tested. | Implemented | Photograph viewer in `photos.js`: **Rotate**, **Annotate** (freehand pen in four colours, **Undo**), **Revert to original**. The original file is never changed; an edit is stored as a second rendition. There is no OCR and none is claimed (L4). | T15 (rotate, revert). T46 opens the annotation tool (four pen colours, drawing surface within the screen). Drawing a stroke and saving it is not separately tested. |
| R5.C1 | Unlimited devices per room, structured record. Required identification: role/type, manufacturer, model, hostname, IP, MAC, serial. | Implemented | `schema.js` (`S.F.device`), `R.device`, device editor in `pages/devices.js`. There is no limit on the number of devices. Hostname is required only for a networked device. The editor never refuses to save; a missing value is flagged. | T10. |
| R5.C2 | Additional fields: subnet, VLAN, firmware, application version, connected switch, switch port, connection type, PoE requirement, PoE class, power source, rack/location, monitoring portal, management URL, warranty, support expiration, notes. | Implemented | Table `devices` and `S.F.device`: every listed field, plus address assignment and DNS name. | Not separately tested field by field. The columns are exported (T23). |
| R5.C3 | Device categories (23 listed + other) and custom device types. | Implemented | `S.DEVICE_CATEGORIES` (24 values). **Add device** in `pages/devices.js`: a type that is not listed is saved as "Other" with **Custom device type**. | T1 (24 categories), T50 (a custom type is kept, shown as the device type and exported). The **Add device** sheet is not separately tested. |
| R5.C4 | IP, MAC and serial have independent completion states; missing values are never assumed or invented. | Implemented | Columns `ip_status`, `mac_status`, `serial_status`; `R.idState` gives verified, recorded, missing or not applicable for each. Text that is not a MAC address is kept as typed (`R.macFormat`). | T10, T2. |
| R5.C5 | A device missing any of them: flagged incomplete, exact missing fields shown, stays in inventory, follow-up task created, counted in the documentation-completeness dashboard. | Implemented | `R.device` (missing fields by name), `R.reconcileFollowups` (table `followups`), **Documentation completeness** on **Device Inventory**. | T10, T11, T20. |
| R5.C6 | Statuses: verified onsite, verified from management system, awaiting IT confirmation, awaiting vendor confirmation, unknown, not applicable. | Implemented | `S.ID_STATUS` (six values with these labels). | T10, T11. |
| R5.C7 | Physical identification kept distinct from network identity. | Implemented | The device editor has the groups **Physical identification** and **Network identity** (`S.F.device`). The master workbook has separate **Device Inventory** and **Network Asset Register** tabs. | T22 (both tabs exist). The form groups are not separately tested. |
| R5.D1 | Functional test checklist with Pass / Fail / Needs investigation / Not applicable / Not tested. | Implemented | `S.TEST_RESULTS`; **Functional Testing** section. The buttons read **Pass**, **Fail**, **Investigate**, **N/A**. Tapping the selected button again returns the test to "Not tested". | T6, T13. |
| R5.D2 | Categories and items: Audio (11), Video (12), Control (10), Infrastructure (11), User experience (8) as listed in the brief. | Implemented | `S.TESTS`: 52 tests with these counts per category, created with every audit (`A.startAudit`). | T1, T6. |
| R5.D3 | Comments and photographs attachable to any failed or investigated test. | Implemented | Test row in `pages/audits.js`: a comment box and a **Photo** button. The photograph carries `test_id`, and follows the finding when one is recorded. | T50 (a comment and a photograph on a test are kept; the photograph follows the finding into the backlog item). The comment box and the **Photo** button are not separately tested. |
| R5.D4 | A failed test suggests a finding; the auditor must confirm before it enters the formal backlog. | Implemented | `A.setTest` marks the suggestion as pending; **Record finding** or **Dismiss** in the test row. A finding enters the backlog only through **Add to backlog** (`A.promoteFinding`). | T7, T8. |

## 6. Findings and backlog

| ID | Requirement | Status | Where | Verified by |
|---|---|---|---|---|
| R6.1 | Unique IDs AVEI-BL-001…; fields: building, floor, room, device, category, problem statement, observed evidence, root cause (only when confirmed), root-cause confidence, recommendation, strategy, expected outcome, operational risk, meeting impact, frequency, user impact, dependencies, effort, cost (optional), owner, requested by, photographs, related IT items, related audit tests, created, updated, status. | Implemented with stated limits | Table `backlog_items`, `S.F.backlog`, backlog item screen in `pages/backlog.js`. Photographs, related requests and related audit tests are links to other records, not columns. `root_cause` is kept only while the confidence is "Confirmed". Codes are issued per device (L6). | T8, T35. |
| R6.2 | Categories: Audio, Video, Control & UX, Network & Security, Documentation, Training, Spare Parts, Infrastructure, Preventive Maintenance, Other. | Implemented | `S.FINDING_CATEGORIES` (10 values). | T1. |
| R6.3 | Priorities P1/P2/P3 with the given definitions; priority based on business impact, frequency, user friction, operational risk and effort — not a single blind score. | Implemented | `S.PRIORITIES` holds the definitions. The auditor sets the priority. `R.suggestPriority` offers guidance from the recorded factors and never sets it. | T14. |
| R6.4 | Workflow statuses: New Discovery, Under Investigation, Pending PepperDash Review, Pending Client IT, Pending Client Approval, Approved, Scheduled, In Progress, Blocked, Completed, Deferred, Rejected. | Implemented | `S.BACKLOG_STATUSES` (12 values); `A.setBacklogStatus`. | T1, T41. |
| R6.5 | Filtering, sorting, searching, grouping, exporting. | Implemented | **Findings & Backlog** (`pages/backlog.js`): filters for status, priority, category, floor and owner; search; five sort orders; six groupings; **CSV** of the listed items; the backlog report. | T21 (report). Filters, sorting, grouping and the **CSV** button are not separately tested. |
| R6.6 | Significant room findings linkable to a backlog record; duplicate findings avoided. | Implemented | `A.promoteFinding` creates an item or links the finding to an existing one. `R.similarBacklog` lists likely matches first; `R.similarFindings` warns in the finding editor. | T8, T9. |

## 7. Network and infrastructure

| ID | Requirement | Status | Where | Verified by |
|---|---|---|---|---|
| R7.1 | Track VLANs, subnets, IP ranges, DHCP reservations, static assignments, DNS names, switches (model, hostname, management IP), switch ports (description, VLAN, tagged/untagged, PoE status), PoE budget, uplinks, device-to-switch mappings, network/firewall/multicast/QoS/DNS/NTP dependencies, management and monitoring systems. | Implemented | Table `infra_assets` with 14 record types; `switch_ports`; `network_links` (uplinks and device dependencies); switch and port on the device record (`schema.js`). **Infrastructure** tabs **Switches & ports**, **Addressing & services**, **Dependencies** (`pages/infrastructure.js`). | T28 (port and dependency records), T23 (exported). Renders (T45). The editors are not separately tested. |
| R7.2 | Documentation tool only: no automatic collection, no scanning, no discovery, no configuration changes. | Implemented | No such code exists (L5). The only requests to another origin in `app/js` are four `fetch` calls in `sync.js`, to the connected workspace. `shell.js` also registers the service worker `app/sw.js`, which fetches only the application's own files. | T38 (the shipped page allows no outside connection). Manual check: source search for network requests. |
| R7.3 | Record observed values and mark items requiring Client IT validation. | Implemented | `validation_status` on infrastructure records and switch ports (five values, one of them "Requires IT validation"). **Requires Client IT validation** list and **Draft IT validation request** (`pages/infrastructure.js`). | Not separately tested. |
| R7.4 | Infrastructure dependency tracker (device, room, switch, port, VLAN, IP, dependencies). | Implemented | **Dependencies** tab: one card per device with these values and its dependencies, and a **Common dependencies** table. | T28 (dependency records). Renders (T45). |
| R7.5 | Topology documentation with visual device-to-switch relationships. | Implemented | **Topology — device-to-switch relationships** on the **Overview** tab: a diagram of switches, uplinks and mapped devices, drawn from the records only. | Renders (T45, T46). Not separately tested. |
| R7.6 | Network validation checklist (11 items as listed). | Implemented | `S.NETWORK_CHECKS` (11 checks), created with every audit. **Network Validation** section of the audit; the **Validation** tab sums up the latest audit of each space. | T1, T6, T13. |

## 8. IT coordination

| ID | Requirement | Status | Where | Verified by |
|---|---|---|---|---|
| R8.1 | Track requests to Client IT, PepperDash and vendors with the listed topic types. | Implemented | Table `it_requests`; `S.IT_PARTIES` (Client IT, PepperDash, Vendor, Facilities) and `S.IT_TYPES`; **IT Coordination** (`pages/coordination.js`). The application records requests. It does not send them. | T43, T28. |
| R8.2 | Request fields: ID, topic, description, requested from, related building/floor/room/device, reason, needed for, priority, date requested, target date, status, response, supporting documentation, related backlog items. | Implemented | `S.F.it`; codes `AVEI-IT-nnn`; related backlog items through `backlog_it_links`; photographs through `photos.it_request_id`. The date requested is set when the status first becomes "Submitted". | T43 (a new request is a draft with no request date). The date stamp on "Submitted" is not separately tested. |

## 9. Spare equipment

| ID | Requirement | Status | Where | Verified by |
|---|---|---|---|---|
| R9.1 | Fields: name, manufacturer, model, part number, serial, quantity, minimum stock, storage location, assigned floor, compatibility, condition, warranty, notes. | Implemented | Table `spare_items`, `S.F.spare`; **Spare Equipment** (`pages/spares.js`). | T19 (seeded items), T43 (a new stock line starts with nothing pre-filled). Renders (T45). Filling in the editor is not separately tested. |
| R9.2 | Flags: below minimum, zero available, unidentified stock, approaching end of life. Spare risk dashboard. | Implemented | `R.spare` gives the four flags and a fifth, "Quantity not recorded"; **Risk dashboard** and **Critical rooms without spare coverage** on the screen. | T43, T20. |

## 10. Reporting

| ID | Requirement | Status | Where | Verified by |
|---|---|---|---|---|
| R10.1 | Reports: individual room audit, floor summary, building summary, complete environment assessment, device inventory export, network-connected asset register, functional test results, findings and prioritized backlog, IT coordination register, spare equipment assessment, executive summary. | Implemented | `reports.js` (`Rep.TYPES`, eleven report builders); **Reports** screen. | T21. |
| R10.2 | Reports include titles, date and auditor, executive summary, findings, evidence photographs where appropriate, tables, priority classifications, recommendations, dependencies, next steps. | Implemented with stated limits | `reports.js`. Every report has a title, scope, date and author. Next steps are in the room, floor, building, executive and environment reports. Limits: photographs are embedded only in the individual room audit report (the 24 most recent); the device, network, test and coordination reports are registers: one opening line, then tables. | T21 (every report has content). The content of the sections is not separately tested. |
| R10.3 | PDF, CSV and Excel exports where practical; professional enough for client and PepperDash leadership. | Implemented | `Rep.pdf`, `Rep.csv`, `Rep.xlsx`; writers `pdf.js` and `xlsx.js`. Report CSV is formula-escaped. Whether a report is good enough for leadership is a judgement and is not tested. | T21, T17, T18, T3; output validation (PDF, XLSX). |

## 11. Data architecture and persistence

| ID | Requirement | Status | Where | Verified by |
|---|---|---|---|---|
| R11.1 | Real application with persistent data. Preferred stack: React, TypeScript, Supabase/PostgreSQL, Supabase Storage, secure authentication, row-level security. | Implemented with stated limits | Records persist in IndexedDB on the device (`store.js`). Limits: React and TypeScript are not used; the application is plain ES2017 with no dependencies, and runs from `app/` without a build step (`tools/build.ps1` packages it and writes `app/sw.js`). Supabase (PostgreSQL, Storage, Auth, row-level security) is an optional second copy through `sync.js` and `supabase/schema.sql` (L1, L2). | T4, T44. Cloud side: T31 to T36, on mock adapters and the SQL text. |
| R11.2 | Normalized relational schema with foreign keys, indexes, constraints for the listed core entities. | Implemented with stated limits | 28 tables defined once in `schema.js`. `supabase/schema.sql`, generated from it, has 29 tables, 76 foreign keys (48 between record tables, 27 to `organizations`, one to `auth.users`), 116 indexes and CHECK constraints for the status values (L1). | T1, T35, T36. The SQL has not run. |
| R11.3 | Audit history maintained; an audit is never lost on refresh; autosave with visible confirmation and error recovery; mobile interruptions tolerated. | Implemented | `store.js`: every change is queued and written to IndexedDB after about 160 ms. The top-bar indicator reads **Saving…** until the transaction completes, then **Saved** with the time. A failed write stays queued and is retried. Queues are flushed when the page is hidden. Each audit is its own record, and a new audit does not replace an older one. Browser storage that is not protected can be cleared by the browser; **Settings → Data on this device** shows the state. | T4, T44, T46. Failed writes and retries are not separately tested. |
| R11.4 | Offline-first capture if possible: cached audit, offline entry, queued photos/records, sync on reconnect, visible sync status, safe conflict resolution. No claim of offline capability unless implemented and tested. | Implemented with stated limits | Offline: every record and photograph is on the device, and `app/sw.js` (written by `tools/build.ps1`) caches every application file. Sync: changes are queued in an outbox; a run pulls, then pushes, and starts again when the connection returns. A conflict is detected from the version an edit was based on, not from clocks; the workspace version is applied and the local one is kept under **Sync conflicts held for review**. The top bar shows the save and sync state. Limits: L1, L2, L3. | Offline: T49; manual check with the server stopped. Sync: T31, T32, T33, T34, on mock adapters only. |

## 12. Security

| ID | Requirement | Status | Where | Verified by |
|---|---|---|---|---|
| R12.1 | Secure authentication, role-based access, row-level security, restricted file access, no public photo buckets, no exposed API secrets, secure server-side configuration, audit logging. | Implemented with stated limits | Device-only: a local auditor profile and an optional passcode lock (`auth.js`). The lock is not encryption (L7); without it the application opens for anyone who can unlock the device. Changes are logged in `activity_log`. Cloud workspace: e-mail and password sign-in (`sync.js`). Roles, row-level security on all 29 tables, a private bucket `audit-photos` and an append-only `audit_trail` are defined in `supabase/schema.sql` (L1, L2). The client enforces only the read-only `viewer` role. The source holds no key, and a service-role key is refused. The application has no server-side code; the hosting headers in `deploy/` are templates that have not been deployed. | T37, T34, T38, T39, T5, T41, T36. The database rules have not run. |
| R12.2 | No hard-coded credentials; no public exposure of private IPs or topology; no client data sent to external AI services without authorization; no network scanning or device configuration. | Implemented | `app/`, `tools/`, `supabase/` and `deploy/` hold no key, token or password. The default site build cannot connect to another origin (L2). Nothing is sent to an AI service, and nothing is scanned or configured (L5). Exports, reports and backups are plain files saved by the auditor; uploading a package to Claude is a separate manual step. | T38, T39. Manual check: source search for credentials and for network requests. |
| R12.3 | Deployment model that can be evaluated for client security approval; clearly documented that the application must be approved before real client data is entered; synthetic demo data during development. | Implemented with stated limits | A static site with a device-only Content-Security-Policy (`tools/build.ps1`, `dist/site`). The notice that approval is required is on the set-up screen and in **Settings → About and approvals**. Demo data is synthetic (R15). See [SECURITY.md](SECURITY.md) and [DEPLOYMENT.md](DEPLOYMENT.md). Limits: approval has not been given; the project records no hosted address; the templates in `deploy/` have not been deployed. | T38 (device-only page), T19 (demo data). Hosting is not tested. |

## 13. Mobile experience

| ID | Requirement | Status | Where | Verified by |
|---|---|---|---|---|
| R13.1 | iPhone, 390 px portrait, one-handed, large buttons, fast room switching, camera integration, minimal typing (dropdowns, predefined options), expandable sections, autosave, clear completion indicators. | Implemented with stated limits | Phone layout below 1024 px (`app/css/app.css`). Floor buttons with the last floor remembered. Camera capture (R5.B1). Dropdowns, segmented buttons and **Pass all untested**. Audit sections that expand one at a time, each with a status. Autosave (R11.3). See [MOBILE_GUIDE.md](MOBILE_GUIDE.md). Limit: not tested on a physical iPhone (L3). | T46 (25 routes, an audit with every section open and five sheets at 390 × 844 px; every tapped control is measured), T47 (file delivery, with simulated share functions). Manual check in a Chromium-based desktop browser at 390 × 844 px. |
| R13.2 | Persistent mobile quick-action button "NEW": New Room Audit, Add Device, Take Photo, Record Finding, Create IT Request, Add Spare Equipment. | Implemented | `shell.js` (`openNew`): **NEW** in the bottom bar and **New** in the sidebar open a sheet with these six actions. | Renders (T45, T46). The six labels are not asserted by a test. |
| R13.3 | Room audit progress indicator (space summary, device inventory n/m verified, functional testing n/m, photos, findings, network validation %). | Implemented | Audit screen (`pages/audits.js`): an overall percentage, and a status on each of these six section headers. Figures from `R.auditProgress`. | T6, T13. |
| R13.4 | Leave an audit and resume later. | Implemented | `A.resumeOrStart`; **Resume audit** on the Command Center and on the room screen. | T6, T46. |

## 14. Intelligence

| ID | Requirement | Status | Where | Verified by |
|---|---|---|---|---|
| R14.1 | Failed test → suggest finding. Missing IP → network follow-up flag. IP present but MAC missing → MAC verification flag. | Implemented | `A.setTest` (suggestion); `R.reconcileFollowups` (follow-up kinds `missing_ip`, `missing_mac`). | T7, T11, T43. |
| R14.2 | Same issue in multiple rooms → potential systemic problem. Inconsistent device naming in a room → documentation standardization flag. | Implemented | `R.insights`: kind `systemic` (the same test failing or needing investigation in the latest audit of two or more spaces) and kind `naming`. A backlog item linked from more than one room is marked **Systemic**. | T9 (systemic), T50 (the naming flag is raised and records nothing by itself). |
| R14.3 | Critical room with no spare replacement → operational risk. Unknown switch port → Client IT coordination suggestion. Undocumented firmware → lifecycle/security validation flag. | Implemented | `R.spareCoverage` and insight `spare`; insight `ports` with **Draft Client IT request**; follow-up kinds `unknown_port` and `firmware_undocumented`, and insight `firmware`. | T20 (spare coverage), T11 (port and firmware follow-ups). The insight cards are not separately tested. |
| R14.4 | Audit with incomplete mandatory fields cannot be marked fully verified. | Implemented | `A.verifyAudit` refuses while `R.auditProgress` lists a blocker. A verified audit whose mandatory information later becomes incomplete is shown and exported as "Verification lapsed"; its stored status is not changed (`R.auditLapsed`). | T13, T42. |
| R14.5 | Observed facts, auditor interpretations, unverified hypotheses and recommended actions are kept separate; a suspected root cause is never automatically converted to a confirmed conclusion. | Implemented | Separate fields on a finding (`observation`, `interpretation`, `hypothesis`, `recommended_action`); four note types; `suspected_cause` separate from `root_cause` on a backlog item. | T8, T35. |

## 15. Demo environment

| ID | Requirement | Status | Where | Verified by |
|---|---|---|---|---|
| R15.1 | Building "1 Demonstration Plaza"; floors 21, 22, 23; spaces 21A small, 21B medium, 22A executive, 22B medium, 22C boardroom, 23A divisible. | Implemented | `seed.js`. 23A is two rooms, 23A-N and 23A-S, with the combined configuration "23A Combined (North + South)". A rack room "22 IDF" is added. Eight rooms in all. | T19. |
| R15.2 | Representative devices: Q-SYS Core, Q-SYS DSP, Zoom Rooms appliance, Cisco switch, PTZ camera, touch panel, display, microphone processor; clearly fictional MAC/IP/serial/network names; a few incomplete devices and sample findings. | Implemented | `seed.js`: 17 devices covering each listed type. IP addresses from 192.0.2.0/24 and 198.51.100.0/24, MAC addresses 00:00:5E:00:53:xx, serials starting `DEMO-`. Several devices are left incomplete. Five findings and seven backlog items. | T19. |
| R15.3 | All seeded information clearly labelled DEMO DATA. | Implemented | `is_demo` on every seeded record; the **DEMO DATA** banner (`shell.js`) and **DEMO** chips; demo notices in reports, the workbook and the package manifest (`contains_demo_data`); a banner inside each synthetic image. Demo records are never synchronised. | T19, T21, T23, T31. |

## 16–17. Quality and definition of done

| ID | Requirement | Status | Where | Verified by |
|---|---|---|---|---|
| R16.1 | No broken buttons, placeholder navigation, fake save confirmations, hard-coded dashboard statistics, dead-end workflows or unhandled errors. | Implemented with stated limits | Every route resolves to a screen (`shell.js`). Errors go to `EV.reportError` or a crash panel. The save indicator follows the IndexedDB transaction. Figures are computed. Limit: not every button is exercised by a test. | T45 (26 routes and eight editors without a console error), T4, T20. |
| R16.2 | Tested: create building/floor/room; start and save an audit; upload photographs; multiple devices; missing IP/MAC/serial validation; functional tests; findings; backlog items; status updates; IT requests; spares; report exports; refresh and restore; mobile responsiveness. | Implemented with stated limits | `tests/suite.js`, 54 tests. See [TEST_REPORT.md](TEST_REPORT.md). Limits: photographs are tested from an image file, not the camera; mobile is tested in a desktop browser (L3). | Building, floor, room: T4. Audit: T6, T44. Photographs: T15. Devices: T10, T12. Missing identification: T10, T11. Functional tests: T7, T13. Findings: T7. Backlog: T8, T9. Status updates: T41. Requests: T43. Spares: T43 (risk flags, a new stock line). Reports: T21, output validation. Refresh and restore: T46, T39. Mobile: T46. |
| R17 | Definition of done items 1–16 (deployed URL, authentication, persistence, environment management, audits completed and resumed, photographs, device inventory, missing-identification flags, functional testing, findings → backlog, IT coordination, spares, live dashboard metrics, reports, polished mobile experience, core workflows tested). | Implemented with stated limits | Item by item in the table below. Item 1 is not implemented. | See below. |

| Item | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | Deployed URL | Not implemented | `tools/build.ps1` produces `dist/site` (37 files) and the single-file page `dist/artifact/av-environment-intelligence.html`. The project records no hosted address, and the templates in `deploy/` have not been deployed. See [DEPLOYMENT.md](DEPLOYMENT.md). |
| 2 | Authentication | Implemented with stated limits | R12.1. Device-only: optional passcode lock (L7), T37. Cloud sign-in: T34, on a mock adapter (L2). |
| 3 | Persistence | Implemented | R11.3. T4, T44, T46. |
| 4 | Environment management | Implemented with stated limits | R4.1 to R4.6. One organization per installation. T4, T48, T50. |
| 5 | Audits completed and resumed | Implemented | R13.4, R14.4. T6, T13, T15, T27, T42, T46. |
| 6 | Photographs | Implemented with stated limits | R5.B1 to R5.B4. T15. The camera is not exercised (L3). |
| 7 | Device inventory | Implemented | R5.C1 to R5.C7. T10, T12. |
| 8 | Missing-identification flags | Implemented | R5.C5. T10, T11. |
| 9 | Functional testing | Implemented | R5.D1 to R5.D4. T6, T7, T13. |
| 10 | Findings → backlog | Implemented | R6.6. T7, T8, T9. |
| 11 | IT coordination | Implemented | R8.1, R8.2. T43. |
| 12 | Spares | Implemented | R9.1, R9.2. T43, T20. |
| 13 | Live dashboard metrics | Implemented | R3.5. T20. |
| 14 | Reports | Implemented with stated limits | R10.1 to R10.3. T21; output validation. |
| 15 | Polished mobile experience | Implemented with stated limits | R13.1 to R13.4. T46, T47. No physical iPhone (L3). |
| 16 | Core workflows tested | Implemented with stated limits | 54 tests pass. Not covered: a real database (L1), a real workspace (L2), a physical iPhone (L3). |

## 19. Daily export, Claude analysis and master workbook

| ID | Requirement | Status | Where | Verified by |
|---|---|---|---|---|
| R19.A | Navigation item "Daily Export & Data Handoff"; dashboard: audit date, buildings/floors visited, rooms audited, devices documented, photographs, tests completed, findings created, new backlog items, outstanding identification fields, incomplete audit sections, pending IT dependencies. Selection: current day, custom date range, building, floor, rooms, all records since last export. Prominent "EXPORT DAILY AUDIT PACKAGE". | Implemented | `shell.js` (navigation entry); `pages/export.js`: **Export summary** with twelve figures; scope **Current day**, **Since last export**, **Date range** or **Full export**, with building, floor and room filters; the button carries exactly this label. | T27, T29, T24. Renders (T45). |
| R19.B | ZIP containing audit_manifest.json, buildings.csv, floors.csv, rooms.csv, room_audits.csv, devices.csv, functional_tests.csv, findings.csv, backlog.csv, it_coordination.csv, infrastructure.csv, spare_inventory.csv, audit_notes.csv, activity_log.csv, photographs/ directory, claude_analysis_instructions.md. Stable unique IDs, preserved relationships, ISO 8601 timestamps, consistent field names, unique export ID and timestamp. Every record marked New / Updated / Unchanged / Incomplete. Original record IDs included. Underlying structured records, not a screen summary. | Implemented with stated limits | `X.build` in `exporter.js`. The package holds the listed files and more: 24 CSV files in all, `validation_report.json`, `data_dictionary.md`, `end_of_day_summary.md`. Every row has the UUID `id`; the export ID is `AVEI-EXP-yyyymmdd-nn`. `record_status` is `new`, `updated`, `unchanged` or `deleted`. It is decided row by row from a delivery ledger of what earlier packages from this device delivered. Only a package that was saved or shared counts, and the latest delivery can be voided. "Incomplete" is not a status value: it is in the columns `is_incomplete` and `incomplete_reasons`. Limits: L6, L8, L9. See [EXPORT_FORMAT.md](EXPORT_FORMAT.md). | T23, T24, T25, T26, T16; output validation (ZIP, CSV). |
| R19.C | Photographs organised /photographs/building/floor/room/device/; metadata record per photo (ID, original filename, building, floor, room, device ID, category, description, capture timestamp, audit ID, finding ID); original quality preserved; photo index; no large photos embedded in JSON. | Implemented | `X.photoPath`: `photographs/<building>/<floor>/<room>/<device, or "room">/<photo code>_<category>.<ext>`. `photo_index.csv` has one row per photograph with the listed metadata and the file path. **Original quality** packages the stored file unchanged; **Optimized (max 2048 px)** and **Index only — no image files** are options that do not. Thumbnails are not exported, and no image is embedded in JSON. | T23. |
| R19.D | claude_analysis_instructions.md in every export instructing the 18 listed steps; never overwrite verified with unverified; conflicts flagged for reconciliation. | Implemented | `H.analysisInstructions` in `handoff.js`, written into every package with that package's figures. It has a 19-step procedure and eleven reconciliation rules, including these two. | T23 (file present, rule text, export ID), T30 (the same rules in the project instructions). The steps are not compared with the brief by a test. |
| R19.E | Master Excel workbook design with 15 tabs (Executive Dashboard, Buildings & Floors, Room Register, Room Audit History, Device Inventory, Network Asset Register, Functional Test Results, Findings, Improvement Backlog, IT Coordination, Infrastructure Dependencies, Spare Equipment, Photo Index, Data Quality & Exceptions, Change History); tables, filters, frozen headers, consistent formatting, dropdowns, conditional formatting; formula-driven dashboard; no duplicates on re-import; permanent record IDs as merge keys. | Implemented with stated limits | `H.masterWorkbook` and `xlsx.js`: fifteen tabs; fourteen Excel tables with filters and frozen header rows; dropdown lists and conditional formatting on coded columns such as status and priority; **Executive Dashboard** with 38 formulas. The first column of every data tab is the record ID; on **Data Quality & Exceptions** it is the `exception_id`. The workbook is built from the records on the device. Limit: the application does not merge a package into a workbook. That is done outside it, by the rules in the instructions, and has not been tested. | T22, T17; output validation (XLSX, 38 formulas). |
| R19.F | Incremental exports: last successful export timestamp and ID, creation/update timestamps, change history, export history; full export, changes since last export, specific date, re-export of a previous date; a record changed after export is "updated" next time; historical audits never deleted. | Implemented | Table `exports`, the delivery ledger and **Export history** (`exporter.js`, `pages/export.js`). Scopes: **Full export**, **Since last export**, **Current day**, **Date range** (one date when both ends are the same). **Repeat** rebuilds the scope of an earlier export from the current records; it does not reproduce the earlier file. The manifest gives the previous export ID and time. `activity_log.csv` is the change history, with headline and detail entries. A deleted record is kept with `deleted_at`. **Since last export** and **Full export** report it once as `deleted`; **Current day** and **Date range** report it whenever the deletion falls inside their window. | T24, T25, T26, T27, T29 (a date range of today, an empty range, a range without a start date), T41, T5. |
| R19.G | Reusable Claude Project instruction document (AV Audit Data Analyst); self-describing package. | Implemented | `H.projectInstructions`: **Claude Project instructions (.md)** on the export screen; a generated copy is `docs/CLAUDE_PROJECT_INSTRUCTIONS.md`. `audit_manifest.json` lists every file with its columns and keys, and the allowed values of the coded columns; `data_dictionary.md` explains the columns. | T30, T23. |
| R19.H | Pre-export validation: files present, IDs populated, foreign keys valid, photo references resolve, dates/timestamps, incomplete device identification, incomplete room audits, conflicting values, missing required fields; export allowed with flags; validation report. | Implemented | `X.validate`: eleven checks that cover each listed point. The button is disabled while the preview finds a structural error (a missing or repeated ID, a reference that does not resolve inside the package). Every other finding is a warning and the export proceeds. `validation_report.json` lists every exception with an `exception_id` (`DQ-` and 12 characters derived from the check and the record, or from the check and the sentence when the exception is not about one record), so the same exception has the same ID in every package. | T23, T28, T42, T12, T51 (an `exception_id` stays the same while the exception exists, and goes when it is resolved). |
| R19.I | End-of-day summary: rooms audited today, new devices, devices requiring follow-up, new findings, new P1/P2/P3, outstanding IT requests, outstanding PepperDash dependencies, data-quality exceptions, recommended priorities for the next visit. | Implemented | `X.endOfDay`: `end_of_day_summary.md` in the package, `end_of_day` in the manifest, and **End-of-day summary** on the export screen once a package is built. The priorities come from `Rep.nextSteps`, by rule from the records. | T23 (file present), T27 (figures). |

## 20. Test index

The numbers are the order of the tests in `tests/suite.js`. The names are exact.

| No. | Test name |
|---|---|
| T1 | schema: every table parses and every reference targets a real table |
| T2 | validation helpers: IP and MAC formats |
| T3 | csv: quoting, embedded newlines and formula-injection guard |
| T4 | create building, floor and rooms; records persist to IndexedDB |
| T5 | update is persisted and logged with field-level change history |
| T6 | start audit: 52 tests and 11 network checks created; resume returns the same audit |
| T7 | failed test suggests a finding; nothing is created until the auditor confirms |
| T8 | finding converts to backlog item AVEI-BL-001; a hypothesis never becomes a confirmed root cause |
| T9 | duplicate detection: the same issue in another room links to the existing item and marks it systemic |
| T10 | device identification: IP, MAC and serial have independent states; missing fields are named exactly |
| T11 | follow-up tasks are created for missing identification and close themselves when resolved |
| T12 | conflicting values are reported, never auto-resolved |
| T13 | audit cannot be marked fully verified until mandatory information is complete |
| T14 | priority guidance weighs several factors and stays advisory |
| T15 | photograph: stored with original bytes, thumbnail, links; rotate keeps the original; revert works |
| T16 | zip: write and read back, stored and deflated entries, UTF-8 names |
| T17 | xlsx: workbook parts are present and well-formed XML |
| T18 | pdf: structure is valid (header, xref offsets, trailer) and embeds a JPEG |
| T19 | demo environment loads, is labelled DEMO and uses documentation-reserved identifiers only |
| T20 | dashboard metrics are computed from records |
| T21 | all eleven reports build and export to PDF, CSV and Excel |
| T22 | master workbook: fifteen tabs with tables, dashboard formulas, dropdowns and conditional formatting |
| T23 | daily export (full): every file present, IDs and relationships valid, counts match the manifest |
| T24 | delivery ledger: record_status is decided row by row; only a delivered package counts; a derived change is “updated” |
| T25 | a partial export never hides other changes; the latest delivery can be voided exactly; deletions are reported once |
| T26 | a voided package that is saved after all is delivered after all |
| T27 | export summary counts the audits that were worked on, not the ones whose derived figures merely moved |
| T28 | discarding a new record takes its dependants with it; nothing is left pointing at a missing record |
| T29 | export scope filters: floor and room selection |
| T30 | handoff documents are generated |
| T31 | sync: push, pull, photograph upload, demo data stays local, conflicts are kept for review |
| T32 | sync: a concurrent change is a conflict whichever clock is ahead; a declined write is never counted as sent; clashing record IDs are renumbered |
| T33 | sync with a server that answers in PostgreSQL's timestamp format: a pushed record is recognised when it comes back, nothing is sent twice, an edit after a push is not a conflict, a settled position is not read again |
| T34 | workspace sign-in: only the first sign-in sends what was already on the device; no session without confirmed membership; a viewer sends nothing |
| T35 | cloud schema conformance: every record satisfies the database column types and constraints; tables push in foreign-key order |
| T36 | the generated SQL file is in step with the application schema: every table and column exists with the matching type |
| T37 | passcode lock: PBKDF2 verification; the passcode is never stored; changing or removing it needs the current passcode |
| T38 | cloud sync is off unless the build allows one workspace; secret keys are refused |
| T39 | backup and restore round-trip keeps every record; a backup carries no credentials |
| T40 | a backup file is outside data: rows are rebuilt from the schema; settings, lock and organization are never taken from it; record content cannot become markup |
| T41 | change history: each test result and network check is a detail entry with from → to; the activity feed keeps one summary line per audit |
| T42 | a fully verified audit whose mandatory information later becomes incomplete reads as “verification lapsed”; the recorded status is not changed |
| T43 | coordination requests are drafts until submitted; spare equipment risk flags follow the record |
| T44 | everything in memory is on disk: each table read through a separate database connection matches record for record |
| T45 | application shell: every screen and editor renders without errors; the lock screen hides whatever was open |
| T46 | phone layout and restart: a second copy of the application reloads every record from the device, and every screen fits a 390 px wide viewport |
| T47 | iPhone file delivery: the file is offered in a sheet, shared only on a tap, and a dismissed sheet is not a save |
| T48 | archiving a floor takes its devices out of the open follow-up tasks; restoring it brings them back |
| T49 | offline shell: the service worker installs, and every file the application page loads is in its cache |
| T50 | a divisible room is audited as one combined configuration; a custom device type, a test comment and a test photograph are kept; a naming inconsistency is suggested, not recorded |
| T51 | a data-quality exception keeps the same exception ID from one package to the next, and loses it when it is resolved |
| T52 | hosted demonstration copy: opens in the labelled demo environment; a file leaves only through the host's save function; a save that did not happen is never reported as one; blocked storage does not stop the page |
| T53 | room list import: a CSV becomes buildings, floors, areas and rooms; nothing is guessed, nothing existing is changed, and a second import adds nothing |
| T54 | the production site carries no demo data: no demo records, no seed file, no control that offers them |

T31 to T34 run against mock adapters. T35 checks the records against the column types and constraints defined in `schema.js`; T36 compares `schema.js` with the text of `supabase/schema.sql`. Neither runs the SQL.

## 21. Open items

- The application has not been approved by client security (R12.3).
- No hosted address exists; the templates in `deploy/` have not been deployed (R17 item 1).
- `supabase/schema.sql` has never been executed, and sync has never run against a real Supabase project (L1, L2).
- Nothing has been tested on a physical iPhone: camera capture, annotation by touch, installation to the Home Screen and file saving are untried (L3).
- React and TypeScript, the preferred stack, are not used (R11.1).
- No test covers: drawing an annotation (R5.B4; T46 opens the annotation tool and measures it, it does not draw), backlog filters, sorting and grouping (R6.5), IT-validation marking (R7.3), the topology diagram (R7.5), a failed write and its retry (R11.3).
- Merging a package into the master workbook is done outside the application and has not been tested (R19.E).
- Only the individual room audit report embeds photographs (R10.2).
- The client enforces only the `viewer` role. The other role rules exist only in the SQL that has not run (R12.1).
- One installation holds one organization; organizations cannot be created or archived in the application (R4.1).
- The generated analysis procedure has 19 steps where the brief lists 18; the two lists have not been compared (R19.D).
