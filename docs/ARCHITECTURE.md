# Architecture

This document describes how AV ENVIRONMENT INTELLIGENCE is built, as the code stood on 2026-11-12: its constraints, runtime layers, data model, on-device database, change history, rules engine, optional cloud schema and synchronisation, file engines, build output and tests. It is written for an engineer who has to maintain or review the system. It states what the code does and marks whatever has not been executed or tested. The application must be approved by client security before real infrastructure information is entered; nothing here states that this approval exists.

## 1. Constraints and decisions

| Constraint | What it means in the code | Reason |
|---|---|---|
| Zero third-party code | No framework, library, package manager, CDN, web font or analytics. The renderer, router, icon set and the ZIP, XLSX and PDF writers are in `app/js`. `app/css/app.css` references no external resource. | Every line that runs can be read in this repository, and the page needs no other origin. |
| No build step in development | `app/index.html` loads 29 classic scripts (plain ES2017; no modules, transpiler or bundler) exactly as they are stored. `tools/serve.ps1` is a static file server. | The code that is reviewed is the code that executes. No Node, npm or bundler has to be installed or trusted; the tools are PowerShell scripts. The release build (section 11) copies, hashes, concatenates and zips files; the only text it rewrites is the file list and version in `sw.js` and, with `-SyncOrigin`, one `connect-src` value. |
| Local-first | Every record is written to IndexedDB on the device, and a service worker caches the application files, so the application opens and saves without a connection. A cloud workspace is an optional second copy, off by default. | Field work must not depend on a network connection. |
| Documentation tool, not a scanner | The application stores what the auditor types, selects and photographs. It performs no network scanning or discovery, configures no device, runs no OCR and calls no external AI service. The only requests to another origin that the code can make are the `fetch` calls in `app/js/sync.js`, to the workspace address entered in Settings. | A value is in the database because a person recorded it. A missing value stays missing and is flagged; it is never inferred. |

Further decisions that shape the code:

- **One schema definition.** `app/js/schema.js` is the single source for the IndexedDB stores, the forms, backup sanitisation, removal plans, the CSV columns, the synchronisation column types and the generated `supabase/schema.sql`.
- **The UUID is the key.** Human-readable record IDs are for people. Export, backup and synchronisation merge on `id` only.
- **Device-only by default.** The page policy is `connect-src 'self'`: the browser refuses every connection to another origin until the site is rebuilt for one workspace origin (section 11).
- **Demo data is synthetic and labelled.** `app/js/seed.js` creates the building "1 Demonstration Plaza" with floors 21–23, addresses from documentation-reserved ranges (192.0.2.0/24, 198.51.100.0/24, MAC 00:00:5E:00:53:xx), `DEMO-` serial numbers and, with three exceptions (`zoomroom-22b`, `reflect.demo.example.net`, `zdm.demo.example.net`), `DEMO-` hostnames. Every seeded row has `is_demo = true`, and the shell shows a "DEMO DATA" banner while any exists.

| Mode | Where the data is | Access control | Status on 2026-11-12 |
|---|---|---|---|
| Device only (default build) | IndexedDB of the browser on that device | Local auditor profile; optional passcode lock (PBKDF2-SHA-256, 210,000 iterations) with auto-lock | Implemented. Covered by the automated suite in a Chromium-based desktop browser. Not tested on a physical iPhone. |
| Cloud workspace (build with `-SyncOrigin`) | The device, plus one Supabase project (PostgreSQL, Storage) | Supabase Auth, email and password; roles enforced by row-level security | Implemented. Tested against mock adapters only. Never run against a real Supabase project. |
| Single-file page (`dist/artifact`) | IndexedDB of the origin that serves the page | Whatever protects the hosting page | Built by `tools/build.ps1`. Not part of the automated suite. |

The passcode lock gates the interface only. The application does not encrypt the records it writes to IndexedDB; see [SECURITY.md](SECURITY.md).

## 2. Runtime layers and files

The application is one page. Its scripts form layers. From the bottom: `core` (utilities, renderer, router), `schema`, `store`, `rules`, `actions`; then the interface kit, the file writers and the feature modules; then the pages; `shell` on top.

| File | `EV` member | Responsibility |
|---|---|---|
| `app/index.html` | | Page skeleton, the Content-Security-Policy `<meta>`, the ordered `<script>` list |
| `app/css/app.css` | | The whole design system. Written for a phone first (bottom navigation); a sidebar replaces it from 1024 px |
| `app/js/core.js` | `EV.APP`, `EV.env`, `EV.U`, `EV.csv`, `EV.h`, `EV.mount`, `EV.redraw`, `EV.router`, `EV.go`, `EV.back`, `EV.icon`, `EV.saveFile` | Environment detection, utilities (`U.uid`, `U.keyId`, dates, SHA-256), CSV encoder, file save and share, virtual DOM, error reporting, router, icon set |
| `app/js/schema.js` | `EV.S` | Vocabularies, the 28 table definitions (`S.T`), `S.DB_CHECKS`, record titles, form field definitions (`S.F`) |
| `app/js/store.js` | `EV.store` | In-memory records, IndexedDB write-through queue, soft delete, outbox, change history, photograph binaries, backup, restore, erase |
| `app/js/rules.js` | `EV.rules` | Derived state only (section 7) |
| `app/js/actions.js` | `EV.act` | Operations on several records: start, complete and verify an audit; record a test result; confirm a finding; promote it to the backlog; link requests; removal plans |
| `app/js/ui.js` | `EV.ui`, `EV.toast` | Controls, sheets, dialogs, schema-driven forms, reference cascades, the autosaving record editor |
| `app/js/photos.js` | `EV.photos` | Capture, thumbnail, gallery, viewer, rotate and annotate (the original bytes are kept) |
| `app/js/zip.js`, `xlsx.js`, `pdf.js` | `EV.zip`, `EV.xlsx`, `EV.pdf` | ZIP writer and reader, Excel writer, PDF writer (section 10) |
| `app/js/reports.js` | `EV.reports` | Eleven report types over one document model; preview, PDF, CSV and Excel renderers |
| `app/js/exporter.js` | `EV.exporter` | Daily export package: scope, collection, delivery ledger, validation, manifest |
| `app/js/handoff.js` | `EV.handoff` | Master workbook (15 tabs), data dictionary, analysis instructions, Claude Project instruction document |
| `app/js/sync.js` | `EV.sync` | Optional Supabase synchronisation over REST (section 9) |
| `app/js/auth.js` | `EV.auth`, `EV.brand` | Device set-up, passcode lock, sign-in screen, the gate |
| `app/js/seed.js` | `EV.seed` | Synthetic demo environment |
| `app/js/pages/*.js` (11 files) | `EV.pages.*`, `EV.editors.*` | One file per navigation section: `command`, `environment`, `audits`, `devices`, `infrastructure`, `backlog`, `coordination`, `spares`, `reports`, `export`, `settings` |
| `app/js/shell.js` | `EV.NAV`, `EV.context`, `EV.onRoute`, `EV.openNew`, `EV.boot` | Frame, navigation, route table, save and sync indicator, quick actions, boot |
| `app/js/main.js` | | Calls `EV.boot()`. A separate file, so the policy needs no inline script |
| `app/sw.js` | | Service worker. Generated by `tools/build.ps1` from `tools/sw.template.js` |
| `app/manifest.webmanifest`, `app/icons/*.png` | | Web-app manifest and four icons |

**Namespace.** The application defines one global, `window.EV`. Each file is a classic script wrapped in a strict-mode function that attaches its object to `EV`. There are no ES modules. Two further globals are test hooks read at start: `window.EV_DB_NAME` (database name, `store.js`) and `window.EV_NO_AUTOBOOT` (`main.js`).

**Load order** (from `app/index.html`): `core`, `schema`, `store`, `rules`, `actions`, `ui`, `photos`, `zip`, `xlsx`, `pdf`, `reports`, `exporter`, `handoff`, `sync`, `auth`, `seed`, the eleven pages (`command`, `environment`, `audits`, `devices`, `infrastructure`, `backlog`, `coordination`, `spares`, `reports`, `export`, `settings`), `shell`, `main`. At load time a file captures only objects defined before it (`const store = EV.store`). Calls to later files (`EV.ui` from `core.js`, `EV.sync` from `photos.js`, `EV.handoff` from `exporter.js`) are resolved through `EV` at run time. The same list is in `tests/tests.html` (with `tests/suite.js` in place of `main.js`) and in `tests/frame.html`; a new script has to be added in all three. `tools/build.ps1` reads the list from `app/index.html`.

**Boot** (`EV.boot` in `shell.js`): `store.init()` opens IndexedDB and reads every record into memory; `EV.auth.init()` sets the lock state and the inactivity timer; `EV.sync.init()` restores a configured workspace connection; follow-up tasks are reconciled if the device has been set up; `EV.router.start()` chooses the first route; `EV.mount` renders the root view. The service worker is then registered, unless the page is framed, the context is not secure, or the host is `localhost` or `127.0.0.1` without `?sw=1`.

## 3. Rendering and navigation

### 3.1 Virtual DOM

The renderer is about 200 lines of `core.js`.

- `EV.h(selector, props, ...children)` builds a virtual node. The selector carries tag, classes and id (`'div.card#x'`). Strings and numbers become text nodes. `null`, `false` and `true` become an empty text node that keeps its position, so a conditional sibling does not shift the inputs that follow it.
- The whole view is a function of state. `EV.redraw()` schedules one render per frame (`requestAnimationFrame`, plus a 60 ms timer because animation frames pause in hidden tabs). A render calls the root view (`view()` in `shell.js`) and patches the previous tree into the new one.
- A redraw is requested after every DOM event handler (not for `pointermove`, `mousemove`, `touchmove`, `scroll`, `wheel`), again when a handler's promise settles, whenever a record is created, updated or removed, when a flush to IndexedDB completes and every 30 seconds.
- Patching. Nodes with the same tag, key and kind are patched in place; others are replaced. Child lists without keys are matched by position. If any child has a `key`, keyed children are matched by key and the rest by order, and nodes are moved instead of rebuilt.
- Form state. `value`, `checked`, `selected`, `disabled`, `indeterminate`, `open`, `muted` and `readOnly` are set as DOM properties. The value of the focused element is written only when the virtual value changed, so the caret stays in place while autosave re-renders the screen.
- Events and failures. One listener per element and event type; the current handler is looked up when the event fires. A handler error is shown as a toast (`EV.reportError`). A page that throws is replaced by a crash panel (`shell.js`). A patch that throws rebuilds the DOM from the new tree.

**Record data cannot become markup.** Every virtual node carries `_v: VN`, where `VN` is a frozen object private to `core.js`. It is an object identity, so nothing that arrives as data (a restored backup, a synchronised row, a pasted value) can carry it. Any other object used as a child is shown as text (its JSON). Text is written with `document.createTextNode` and attributes with `setAttribute`. Two further rules apply to attribute values: an event handler is attached only when the value is a function (a string is ignored), and `href`, `src`, `action` and `formaction` are never set to a `javascript:` or `vbscript:` address; `srcdoc` is never set at all. `app/js` contains no `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval` or `new Function`. One test passes the renderer an object shaped like a node with an `onerror` property and checks that no element is created and nothing runs.

### 3.2 Routing

- Route table: `resolve()` in `shell.js`. Routes: `/`, `/environment`, `/floor/<id>`, `/room/<id>`, `/audits`, `/audit/<id>`, `/devices`, `/infrastructure`, `/backlog`, `/backlog/<id>`, `/coordination`, `/spares`, `/reports`, `/reports/<type>`, `/export`, `/settings`. Anything else renders `notFound`. Filters and tabs are query parameters (`/devices?filter=incomplete`).
- Hash routes. When the page is not framed, the route is the URL hash (`#/audit/<id>`), so a reload and the browser's Back work.
- In-memory routes. When the page is framed (`window.self !== window.top`), the hash is not used; the route exists only in `EV.router.stack`.
- Restart. Each navigation stores the route in `localStorage` under `ev.route` (the only use of `localStorage`). On start the route is the hash if there is one, else the stored route if it is less than 12 hours old, else `/`.
- Scroll. The scroll position of `#main-scroll` is kept per route and restored when going back. A new screen starts at the top.
- History marks and the back arrow. `EV.go(path)` pushes the route onto `EV.router.stack` (at most 60 entries) and, with hash routes, sets `location.hash`, which adds a browser-history entry. That entry is marked with `history.replaceState({ evPushed: 1 }, '')` and counted in `EV.router.depth`. The back arrow calls `EV.back(fallback)`. If the counter is above zero and the current entry carries the mark, an entry of this application is certainly behind it, and the arrow calls `history.back()`, so it agrees with the browser's Back. Otherwise it rewrites the address in place. The arrow therefore cannot take the browser out of the application, whatever a reload, a Forward or a jump in the history list did to the counter. With nothing to go back to, it replaces the route with `fallback`. The browser's Back and Forward and a hand-edited hash arrive through `hashchange`.

### 3.3 Sheets, dialogs and the gate

- Sheets. `ui.openSheet` puts a sheet on the stack `ui.sheets`. Record editors (`ui.openEditor`), choice lists, the room picker, the photograph viewer and the "File ready" sheet are sheets. The close button, a press on the backdrop, Escape and the browser's Back all call `ui.requestClose`, which first runs the sheet's `beforeClose` check. Back with a sheet or dialog open closes it and stays on the screen underneath, so an editor is never dropped without its close checks.
- Record editor. There is no Save button. Every field change calls `store.update` at once ("Changes save automatically"). "Done" and closing check the required fields. "Discard" on a new record calls `EV.act.discard`; "Delete" calls `EV.act.remove`.
- Dialogs. One question at a time (`ui.confirm`, `ui.alert`, `ui.prompt`). Asking a second question answers the first with its cancel button. Back and Escape answer a question with its cancel button; a plain notice stays until it is acknowledged.
- Route change. `EV.onRoute` calls `ui.closeAll()`: each sheet receives `onRouteClose` and `onClose` (a new record that still lacks required fields is discarded), and an open question is answered with its cancel button.
- Gate. `EV.auth.gate()` returns, in this order: the "Sign in" screen (a workspace is connected and there is no session); "Set up this device" (first start); the lock screen (a passcode is set and the application is locked: at start, by "Lock now", or after the inactivity limit, 15 minutes unless changed).
- While a gate is returned, `view()` renders only the gate. The shell and the page are not in the DOM. Open sheets stay in `ui.sheets` but are not drawn. A question that was open stays pending and hidden; only questions asked by the gate itself are shown. Back and Escape change nothing underneath (`ui.heldByGate()`). Once the gate is passed, the sheets and the pending question are back. One test checks that the text of an open record is not in the page while it is locked.

## 4. Data model

`app/js/schema.js` defines 28 tables in `S.T`. A record is a plain object with the columns of its table plus the common columns.

**Hierarchy.** Organization > Building > Floor > Area > Room > Rack > Device. `org_id` is on every row. A floor belongs to a building; an area to a floor; a room to a floor and optionally to an area; a rack to a room; a device to a building and a floor and optionally to a room and a rack. `building_id` and `floor_id` are also stored on audits, findings, backlog items, requests, infrastructure records, spares and photographs; `ui.cascade` keeps the set consistent when one of them is changed in a form.

```
buildings ─ floors ─┬─ areas
                    ├─ rooms ─┬─ racks
                    │         ├─ devices ····· followups
                    │         └─ audits ─┬─ functional_tests ····> findings
                    │                    ├─ network_checks
                    │                    ├─ audit_sections
                    │                    └─ audit_notes
                    └─ room_configurations ─┬─ room_configuration_members ──> rooms
                                            └─ audits (audit of a combined configuration)

findings ····> backlog_items <── backlog_it_links ──> it_requests
infra_assets ─── switch_ports ····> devices
network_links  (uplinks and dependencies; each end is stored as a type and an id, without a constraint)
spare_items
photos ──> buildings, floors, rooms
       ····> audits, devices, findings, functional_tests, backlog_items, it_requests, spare_items
activity_log, exports, insight_states

──  foreign key in the cloud schema        ····  soft reference: the id is stored, there is no constraint
```

| # | Table | Code | One row is |
|---|---|---|---|
| 1 | `organizations` | | The owning organization. The application creates no rows here; the device keeps `org_id`, `org_name` and `org_code` as settings |
| 2 | `profiles` | | An audit user. The application creates no rows here; the auditor profile is a setting |
| 3 | `buildings` | | A building: name, address, identifier, site contact |
| 4 | `floors` | | A floor of a building: number, designation, infrastructure notes |
| 5 | `areas` | | A named area of a floor |
| 6 | `rooms` | RM | A room or space: number, name, type, capacity, criticality, platforms, operational status |
| 7 | `room_configurations` | RC | A combined configuration of divisible rooms |
| 8 | `room_configuration_members` | | One room in one configuration |
| 9 | `racks` | RK | An equipment rack in a room |
| 10 | `audits` | AU | One audit of a room or of a configuration: status, dates, `summary_snapshot` |
| 11 | `audit_sections` | | The state of one section of one audit (for example "no AV devices in this space") |
| 12 | `audit_notes` | | A typed auditor note on an audit |
| 13 | `functional_tests` | | One functional test result in an audit |
| 14 | `network_checks` | | One network validation check in an audit |
| 15 | `infra_assets` | NA | An infrastructure documentation record: switch, VLAN, subnet, IP range, reservation, DNS, NTP, firewall, multicast, QoS, monitoring |
| 16 | `devices` | DV | A device. IP address, MAC address and serial number each have their own status column |
| 17 | `switch_ports` | | A documented port of a switch and the device recorded on it |
| 18 | `network_links` | | A switch uplink, or a dependency of a device on an infrastructure record |
| 19 | `backlog_items` | BL | A managed improvement item: evidence, cause analysis, recommendation, impact, priority, owner, status |
| 20 | `findings` | FN | A field observation, classified, optionally linked to a backlog item |
| 21 | `it_requests` | IT | A coordination request to Client IT, PepperDash, a vendor or facilities |
| 22 | `backlog_it_links` | | A link between a backlog item and a coordination request |
| 23 | `spare_items` | SP | A line of spare equipment stock |
| 24 | `photos` | PH | Metadata, thumbnail and links of one photograph |
| 25 | `followups` | | A follow-up task derived from missing device documentation |
| 26 | `insight_states` | | The state of one suggestion (`dismissed` or `active`) |
| 27 | `activity_log` | | One change-history entry |
| 28 | `exports` | | One generated export package: scope, counts, validation result, file name, status |

The declaration order is the dependency order: every hard reference points to a table declared earlier. The synchronisation push uses that order.

**Common columns** (`S.COMMON_COLS`): `id`, `org_id`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `is_demo`. Timestamps are `Date#toISOString` text in UTC. `created_by` and `updated_by` hold the auditor's name (or email) as text.

**Column grammar.** `name` or `name:type` (types `text`, `int`, `num`, `bool`, `date`, `ts`, `json`); `name>table` is an optional reference; `name!>table` a required one; `name~table` a soft reference. Soft references are every `device_id` outside `devices`, `devices.audit_id`, `devices.switch_asset_id`, `functional_tests.finding_id`, `findings.audit_id`, `findings.test_id`, `findings.backlog_item_id`, the links of `photos` other than building, floor and room, and all references of `followups`.

**Record IDs.** Tables with a code get a human-readable record ID at creation: `<prefix>-<kind>-<number>`, for example `AVEI-RM-0004` or `AVEI-BL-001`. The prefix is the setting `org_code` (default `AVEI`; "Record ID prefix" in Settings; changing it does not rename existing IDs). The number is zero-padded to 4 digits for RM, AU, NA, DV and FN, 3 for RC, RK, BL, IT and SP, and 5 for PH. `store.nextCode(table)` takes the higher of the counter `seq:<table>` and the highest number on any row of the table, deleted rows included, and adds one. Allocation is per device: two devices working offline can issue the same ID. The UUID `id` is therefore the only key; a clash that the application can see is renumbered (sections 5.7 and 9.4).

**Deterministic ids.** `U.keyId(kind, key)` hashes `kind|key` (cyrb128) into a version-8 UUID. It is used where the identity of a row is a natural key:

| Table | `kind` | `key` |
|---|---|---|
| `followups` | `followup` | `dev:<device id>:<ip, mac, serial, port or firmware>` (also stored as `dedupe_key`) |
| `audit_sections` | `audit-section` | `<audit id>:<section key>` |
| `backlog_it_links` | `backlog-request` | `<backlog item id>:<request id>` |
| `room_configuration_members` | `config-member` | `<configuration id>:<room id>` |
| `insight_states` | `insight` | `<org id>:<insight key>` |

Two devices that create the same link, task or state while offline produce the same id, so synchronisation merges the rows instead of duplicating them. Creating such a row again over its own deleted version revives that version (`store.create` treats an existing id as a change to it). The ids are stable, not random and not secret.

**Decisions in the model.**

- Findings and backlog items are separate. A finding is a field observation; a backlog item is the managed improvement record. Many findings can link to one item (`findings.backlog_item_id`). `EV.act.promoteFinding` creates an item or attaches to an existing one and sets `systemic` when the linked findings span more than one room.
- Identification is three independent states. `ip_status`, `mac_status` and `serial_status` each hold `verified_onsite`, `verified_mgmt`, `awaiting_it`, `awaiting_vendor`, `unknown` or `not_applicable`.
- Audits are history. Each audit is its own row; starting one creates 52 `functional_tests` and 11 `network_checks` rows from `S.TESTS` and `S.NETWORK_CHECKS`. `summary_snapshot` is captured when the audit is completed or verified. A new audit never replaces an old one.
- A combined room configuration is a `room_configurations` row with one member row per room. An audit targets a room or a configuration.
- Infrastructure records carry `validation_status` (`observed`, `from_docs`, `it_validated`, `awaiting_it`, `unknown`); they are documentation, and nothing is probed. A coordination request (`it_requests`) starts as "Draft"; the application sends nothing to anyone.
- A photograph record holds metadata and a small thumbnail. The image files are stored separately (section 5.6).

## 5. Local persistence (the database architecture on the device)

### 5.1 IndexedDB layout

Database `av_environment_intelligence`, version 1, 31 object stores. There are no secondary indexes: every query runs on the in-memory maps.

| Store | Key | Content |
|---|---|---|
| One per table of `S.T` (28) | `id` | The records, soft-deleted ones included |
| `photo_blobs` | `id` | `{ id, data, mime, size }`. `id` is the photograph id for the original and `<photograph id>:edit` for the edited rendition |
| `outbox` | `id` = `<table>:<record id>` | Markers of changes the workspace has not received |
| `kv` | `k` | Settings |

Migration from the previous database name. On the first start after the update, the application moves every record from the database of the previous name into `av_environment_intelligence`, in resumable chunks, and then deletes the old database. Party and status values stored in records under their previous names are renamed once, to "Client IT", "Client AV Operations", "Pending Client IT" and "Pending Client Approval". The same renaming is applied to records arriving from a restored backup (section 5.7) or a sync pull.

Settings in `kv`: `org_id`, `org_code`, `org_name`, `profile`, `onboarded`, `lock` (salt, PBKDF2 verifier, iteration count, auto-lock minutes), `sync` (workspace address, publishable key, session tokens, organization, role, pull positions), `sync_conflicts`, the `seq:<table>` counters, `export_ledger`, `export_last`, `last_floor`, `last_room`, `demo_loaded`.

### 5.2 Records in memory, written through

- `store.init()` reads every record of every table into a `Map` per table. Reads are synchronous: `store.get` and `store.all` hide soft-deleted rows; `store.getAny` and `store.raw` do not. `store.by(table, field, value)` builds a grouped index per field on first use and drops it on the next write to that table.
- Writes are `store.create`, `store.update` (no write when nothing changed), `store.remove`, `store.purge` and `store.applyRemote` (a row from synchronisation: no history entry, no outbox entry). A write replaces the record object, never mutates it, then queues the row for IndexedDB, marks the outbox, writes the change history and requests a redraw.
- `store.version` increases on every write; the rules engine memoises on it. `store.readOnly` (the `viewer` role) makes `store.create`, `store.update`, `store.remove`, `store.purge` and `store.restore` throw. `store.applyRemote`, `store.kvSet` and `store.log` have no such guard.

### 5.3 Save queue and failure handling

1. `enqueue` puts the row in a `Map` keyed by store and id, so a later write to the same row replaces the queued one. A flush is scheduled 160 ms after the first queued write. Table rows, settings and outbox entries share the queue.
2. `store.flush()` writes the whole queue in one `readwrite` transaction over the stores involved.
3. When the transaction completes, `store.save.lastSavedAt` is set and the error is cleared. The indicator in the top bar reads `store.save`: "Saving…" while writes are pending, then "Saved" with the time. It is driven by the transaction result, not by a timer.
4. On a transaction error, an abort or an exception, every row of the batch goes back into the queue unless a newer version of it was queued meanwhile. `store.save.error` is set; a quota error has its own message. The flush is retried with a doubling delay, from 1 s up to 15 s. The indicator reads "Save problem" and a banner shows the message. Nothing is reported as saved.
5. The queue is flushed when the page becomes hidden and on `pagehide`.
6. If IndexedDB cannot be opened, the store works in memory only, the indicator reads "Not persisted" and the banner says that records will not survive a reload.

The browser is asked for persistent storage (`navigator.storage.persist()`) during device set-up and from "Request protected storage".

### 5.4 Versions, outbox and tabs

- Monotonic `updated_at`. `stamp(old)` returns the current time, or the stored `updated_at` plus 1 ms when the device clock is not later than it. An edit made on this device therefore always carries a later `updated_at` than the version it was made on. Versions are compared as text.
- Outbox. On a device-only installation `store.syncEnabled` is false and no outbox entry is written. Once the device belongs to a workspace organization, every create, update, remove, history entry and restored row writes `{ id, table, rid, at, base }`. `base` is the `updated_at` of the version the workspace was last known to hold when the first unsent change was made; `null` means the workspace has never held the record. Later changes keep the first `base`. Synchronisation uses it to tell "the workspace still has the version I edited" from "someone else changed it meanwhile" without comparing clocks.
- Tabs. One `BroadcastChannel` per database name. After each completed flush a tab posts the store and id of every row it wrote (outbox entries excluded); other tabs re-read those rows from IndexedDB and redraw. `store.wipeAll` posts `{ wiped: true }`; a tab that receives it drops its queue and reloads, so it cannot write the erased records back.

### 5.5 Soft delete, purge and cascading removal

| Operation | Function | Effect |
|---|---|---|
| Soft delete | `store.remove` | Sets `deleted_at`. The row stays stored, is hidden from active lists and remains available to the change history, the export and synchronisation |
| Hard delete | `store.purge` | Removes the row from memory and IndexedDB and drops its outbox entry. `store.discard` also purges the history entries about it |

Pages do not purge. `EV.act.discard` abandons a record that was only just created: hard on a device-only installation, soft once `store.syncEnabled` is on, because the row may already have been sent. `EV.act.remove` deletes an existing record and is always soft. `EV.act.removeDemo` is hard.

`EV.act.removalPlan(seed, requiredOnly)` computes what must go with a record so that no reference is left pointing at nothing. It scans all tables except `activity_log`, `exports`, `organizations`, `profiles` and `insight_states`, repeatedly, until nothing new is found:

- A row is removed with the seed when it refers to a removed row through a required reference; through `audits.room_id`, `audits.configuration_id` or `followups.device_id`; or when it is a `network_links` row whose "from" end is removed (an uplink also when its "to" end is removed).
- Other references to a removed row are cleared. A functional test whose finding goes returns to `suggestion_state` `pending` or `none`; a finding whose backlog item goes returns from `linked` to `open`.
- A photograph left with no link at all is removed too; otherwise it stays as evidence where it still belongs.
- With `requiredOnly` (used by `EV.act.remove`) only required references and the `network_links` rule are followed and nothing is cleared: a soft-deleted record still exists as history.
- The plan is applied dependants first. A hard removal also deletes the image files of removed photographs.

### 5.6 Photograph binaries

- The original file is stored untouched in `photo_blobs`, in its own transaction, before the record is created. If that write fails, no record is created.
- The record holds metadata and `thumb`, a JPEG data URL of at most 300 px. `thumb` is not exported to CSV; it is part of backups and of synchronised rows.
- Rotating or annotating writes a second rendition under `<photograph id>:edit` and sets `has_edit`. "Revert to original" deletes it. The original is never changed.
- Binaries are read one at a time when needed, never loaded wholesale. Deleting a photograph is a soft delete of the record, and the picture itself goes: `store.remove` clears the thumbnail and removes the original and the edited rendition from `photo_blobs` (`store.dropPhotoFiles`), so a deleted image cannot reach a later export or backup. When a deletion arrives from the workspace, the files are removed on that device too. The copy in the workspace bucket is not removed by the application.

### 5.7 Backup, restore and erase

"Download full backup (.zip)" in Settings writes a ZIP with:

- `backup.json`: `format` (`av-environment-intelligence-backup`; a backup carrying the previous format tag is still accepted on restore), `version`, `exported_at`, `app_version`, `tables` (every row of all 28 tables, soft-deleted rows included) and `kv`;
- `blobs/<key>.bin` and `blobs/<key>.mime` for every stored image file, edited renditions included. `<key>` is the `photo_blobs` key with `:` written as `__` (`<photograph id>__edit` for an edited rendition).

`kv` in a backup holds only the `seq:<table>` counters, `org_name` and `org_code` (`store.backupSettings`). A backup deliberately does not contain the passcode verifier, the workspace address, key and session tokens, the auditor profile, the `org_id` setting, the outbox, kept conflicts or the delivery ledger. The rows themselves keep their `org_id` column (replaced on restore) and the auditor names recorded in `created_by`, `updated_by` and the change history. Without the ledger, the first export from a device restored on new hardware reports every row as `new`.

"Restore from backup" accepts that ZIP or a bare `backup.json`. A backup file is treated as outside data:

- `store.checkBackup` refuses anything that is not this format. A daily export package cannot be restored. A backup that contains demo rows is refused while a workspace is connected.
- Every row is rebuilt from the schema (`sanitize`). A row without a valid UUID `id` is skipped. `org_id` is set to this device's organization. Each column is converted to the type the schema gives it; a value that does not fit the type becomes empty. Properties and tables that the schema does not know are dropped. An invalid `created_at` or `updated_at` is replaced by the current time.
- A record on the device that is as new as, or newer than, the one in the file is never replaced. From the settings in the file only `seq:` counters that are higher than the local ones are taken; profile, lock, workspace connection and organization are never taken from a backup.
- Clashing record IDs. If a row that is new to this device carries a record ID that a live record here already uses, the arriving record gets the next free ID after the merge, and an activity entry with action `renumbered` records the change. The UUID is unchanged.
- Image files are restored after the records. An image without a photograph record is not kept; an image already on the device is not replaced.

"Erase all local data…" calls `store.wipeAll`, which clears every object store in one transaction and then writes back `org_id`, `org_code`, `profile`, `lock` and `onboarded`. The application is then restarted. The workspace connection is not kept. "Erase local data…" on the lock screen removes the profile, the lock and the set-up flag as well.

## 6. Change history

`activity_log` is the change history. `store.create`, `store.update` and `store.remove` write to it, unless they are called with `{ silent: true }` or the table is `activity_log`, `exports`, `insight_states`, `followups`, `profiles` or `organizations`. An entry has `at`, `actor`, `action`, `entity_type`, `entity_id`, `entity_code`, `summary`, `building_id`, `floor_id`, `room_id`, `changes` (a list of `{ f, from, to }`, values cut to 160 characters) and `detail`.

| Kind of entry | Rule |
|---|---|
| Headline (`detail = false`) | Every table not listed in the next row. Shown in the activity feed of the Command Center, and exported |
| Detail (`detail = true`) | `functional_tests`, `network_checks`, `audit_notes`, `audit_sections`, `switch_ports`, `network_links`, `backlog_it_links`, `room_configuration_members`, `photos`. Exported with who, when and from → to. Not shown in the feed |
| Status change | A change of `status` on `backlog_items`, `it_requests` or `audits` gets its own headline entry: action `status_changed`, summary `<record ID> status: <from> → <to>` |
| Rolling | `store.logRolling(key, entry)` reuses one headline entry per key as long as it is used again within 10 minutes. It is used for "Functional testing updated" (`tests:<audit id>`) and "Network validation updated" (`net:<audit id>`), so the feed shows one line per audit while every tap is a detail entry |

- Edits made within 10 minutes of creating a record are folded into its `created` entry, unless the creation was logged with a summary of its own.
- Successive updates of one record, each within 2 minutes of the last, are folded into one `updated` entry: per field, the first `from` and the latest `to`. The folding state is in memory only; after a reload a new entry is started.
- Changes of `thumb`, `remote_ref`, `remote_edit_ref`, `sort_order`, `tested_at`, `checked_at` and `status_changed_at` are not logged.
- Other actions: `testing_updated` and `network_validation_updated` (the rolling entries), `photo_added`, `photo_removed`, `renumbered`, `exported`, `export_voided`, `restored`.
- Photographs are a partial exception among the detail tables. `photos.js` logs adding a photograph (`photo_added`) and deleting one in the viewer (`photo_removed`) as headline entries, so both appear in the feed. Later edits to a photograph record are detail entries.

History entries are records like any other: they go through the save queue, into `activity_log.csv` and, when a workspace is connected, into synchronisation. The cloud schema keeps a second, server-side `audit_trail` written by a trigger (section 8).

## 7. Rules engine

`app/js/rules.js` computes; it does not record facts. Results are memoised on `store.version` and recomputed on demand. No rule writes the stored `status`, `priority` or identification columns of an audit, backlog item, finding, request or device.

| Rule | Function | Result |
|---|---|---|
| Device identification | `R.idState`, `R.device` | Per field (IP address, MAC address, serial number): `verified`, `recorded` (a value that is not verified), `missing` or `na`, from the value and its status column; plus format checks and required fields. `identified` means none of the three is missing; `verified` means nothing is missing, unverified or invalid and no required field is empty |
| Conflicting values | `R.duplicates` | The same IP address, MAC address, serial number, hostname or switch port on more than one live device. Reported; never resolved automatically |
| Audit progress and blockers | `R.auditProgress` | Five parts (space summary, devices, functional tests, network validation, photographs) averaged into `overall`; a list of `blockers`; `canVerify` when the list is empty. `EV.act.verifyAudit` refuses while there is a blocker |
| Verification lapse | `R.auditLapsed` | An audit stored as `verified` whose mandatory information is no longer complete reads "Verification lapsed" on screen and in exports. The stored status is not changed |
| Room, floor and dashboard state | `R.roomState`, `R.floorProgress`, `R.metrics`, `R.alerts` | `not_started`, `in_progress`, `audited`, `verified`; the counts and alerts of the Command Center |
| Follow-up tasks | `R.reconcileFollowups` | For every live device: `missing_ip`, `missing_mac`, `missing_serial`, `unknown_port`, `firmware_undocumented`. The tasks are rows in `followups`, opened, updated, re-opened and resolved by the rule |
| Insights | `R.insights` | Seven kinds: the same functional test failing in two or more spaces, inconsistent hostnames in a room, a critical room without spare coverage, undocumented switch ports, undocumented firmware, conflicting values, a P1 item without an owner |
| Similar items | `R.similarBacklog`, `R.similarFindings` | Candidate duplicates by category, functional test, room, device and wording |
| Priority guidance | `R.suggestPriority` | A suggested P1, P2 or P3 with its reasons, from impact, frequency, friction, risk, meeting impact, executive visibility, safety and room criticality |
| Spare equipment | `R.spare`, `R.spareCoverage` | Stock flags (quantity not recorded, zero, below minimum, unidentified, end of life) and critical rooms without an in-stock spare |

The rules write in two places only. `R.reconcileFollowups` maintains `followups`: at start, 400 ms after a change to devices, rooms, floors or buildings, after a restore, after a pull that changed something and after the demo data is loaded or removed; never for a read-only account. `R.dismissInsight` and `R.restoreInsight` record the auditor's decision in `insight_states`.

Everything else a rule proposes becomes a record only when the auditor confirms it:

- A failed or "needs investigation" test sets `suggestion_state` to `pending`. `EV.act.confirmTestFinding` creates the finding; `EV.act.dismissTestSuggestion` records the dismissal.
- An insight offers a prefilled finding, a drafted coordination request or a link to a screen.
- Priority guidance stays advisory. It is shown with the Priority field, with a button labelled "Apply P1" (or P2, P3). `R.suggestPriority` writes nothing: `priority` is set by the auditor, by that button, or, when `EV.act.promoteFinding` creates an item, from the finding's `priority_hint`.

**Facts, interpretations, hypotheses and recommendations are kept apart.**

| Record | Observed fact | Interpretation | Hypothesis | Recommendation |
|---|---|---|---|---|
| `findings` | `observation` | `interpretation` | `hypothesis` | `recommended_action` |
| `backlog_items` | `problem_statement`, `observed_evidence` | | `suspected_cause` | `recommendation` |
| `audit_notes` | One `text` per note; `note_type` is `observed_fact`, `auditor_interpretation`, `unverified_hypothesis` or `recommended_action` | | | |

`findings.classification` states what a finding primarily is. A hypothesis never becomes a confirmed root cause:

- `backlog_items.root_cause` is a separate column, qualified by `root_cause_confidence` (`not_determined`, `hypothesis`, `probable`, `confirmed`) and `root_cause_basis`.
- When `EV.act.promoteFinding` creates a backlog item, it copies the finding's `hypothesis` into `suspected_cause` and sets the confidence to `hypothesis` (`not_determined` when the finding has no hypothesis). It never fills `root_cause`.
- No code sets the confidence to `confirmed`; only the auditor can select it. The form shows `root_cause` and `root_cause_basis` only while it is `confirmed`. Lowering it clears both and moves the text to `suspected_cause` if that is empty.
- Reports and the master workbook print a root cause only when the confidence is `confirmed`. Export validation reports a root cause recorded without it, and the cloud schema has a CHECK constraint for it.
- Generated text keeps the distinction. The systemic insight says it is "a pattern in recorded results, not a confirmed common cause". A finding suggested from a test states only the recorded result.

## 8. Cloud database architecture (optional, never executed)

`supabase/schema.sql` has been reviewed by reading it. It has never been executed against a real database. Its syntax, its triggers, its policies and its behaviour behind PostgREST are unproven until it is applied to a test project. Per its own header it is meant for a project that has been approved for this data.

**Generation.** `tools/gen-schema.html` loads `app/js/core.js`, `app/js/schema.js` and `tools/gen-schema.js` in a browser, through the dev server. The script builds the SQL from `S.T` and `S.DB_CHECKS`, shows it and posts it to the dev server, which writes `.testout/schema.sql`. `supabase/schema.sql` is that output (the two files were identical on 2026-11-12); no script performs the copy. The file is not edited by hand. One test checks that every table and column of the application exists in the SQL file with the matching type, that row-level security is enabled on every data table and that nothing is granted to `anon` or `public`.

| Element | Count | Content |
|---|---|---|
| Tables | 29 | 26 data tables (every table of `S.T` except `organizations` and `profiles`), plus the server-managed `organizations`, `org_members` and `audit_trail` |
| Data table columns | | `id uuid primary key` (supplied by the client); `org_id uuid not null references organizations`; the schema columns as `text`, `uuid`, `integer`, `numeric`, `boolean not null default false`, `date`, `timestamptz` or `jsonb`, with `not null` on required references; the common columns; `server_updated_at timestamptz not null default clock_timestamp()` |
| Foreign keys | 48 | One per hard reference, added after all tables exist. Soft references have no constraint |
| Indexes | 116 | Among them: every reference column; `(org_id, server_updated_at, id)` on every data table, for the pull; `(org_id, code)` where a code exists; three unique partial indexes on live rows: `room_configuration_members (configuration_id, room_id)`, `backlog_it_links (backlog_item_id, it_request_id)`, `followups (org_id, dedupe_key)` |
| CHECK constraints on data tables | 50 | 21 vocabulary checks from `S.DB_CHECKS` (null, `''` or a listed value); `updated_at >= created_at` on every table; `backlog_items_root_cause_confirmed_check`; `audits_target_check` (a room or a configuration); `spare_items_quantity_check` (no negative stock) |
| Triggers | 104 | Four on every data table (next table) |
| Policies | 85 | Three per data table, three on `organizations` and `org_members`, one on `audit_trail`, three on `storage.objects` |

| Trigger, in firing order | When | Effect |
|---|---|---|
| `a_keep_newer` (`keep_newer_version`) | Before update | Returns null when `new.updated_at < old.updated_at`. PostgreSQL then skips the update of that row without an error: an older version never overwrites a newer one |
| `b_lock_org` (`lock_org_id`) | Before update | Raises `org_id is immutable` if `org_id` would change |
| `c_stamp` (`stamp_server_updated_at`) | Before insert or update | Sets `server_updated_at` to `clock_timestamp()`. This server stamp, not a device clock, orders the pull |
| `z_audit` (`record_audit_trail`) | After insert or update | Appends organization, table, record id, action, `auth.uid()`, the client's `updated_at` and a soft-delete flag to `audit_trail`. Security definer |

**Row-level security** is enabled on all 29 tables.

| Object | select | insert | update | delete |
|---|---|---|---|---|
| Data tables | `is_org_member(org_id)` | `can_write_org(org_id)` | `can_write_org(org_id)`, using and with check | No privilege, no policy |
| `organizations` | `is_org_member(id)` | None | None | None |
| `org_members` | Own row, or `is_org_admin(org_id)` | `is_org_admin(org_id)` | `is_org_admin(org_id)` | `is_org_admin(org_id)` |
| `audit_trail` | `is_org_admin(org_id)` | By the trigger only | None | None |
| `storage.objects`, bucket `audit-photos` | `is_org_member_path(name)` | `can_write_org_path(name)` | `can_write_org_path(name)` | No policy |

- Roles are in `org_members.role`. `can_write_org` is true for `admin`, `lead_auditor` and `auditor`; a `viewer` can only read. The helper functions are `security definer` with a fixed `search_path`; `execute` is revoked from `public` and `anon` and granted to `authenticated`.
- Least-privilege grants. Every table starts with `revoke all … from anon, authenticated`. `authenticated` then receives `select, insert, update` on the data tables, `select` on `organizations` and `audit_trail`, and `select, insert, update, delete` on `org_members`, which the policy limits to administrators. `anon` receives nothing. A client cannot hard-delete a data row; deletion is `deleted_at`.
- Storage. The bucket `audit-photos` is private. Object names are `<org_id>/<photo_id>/original` and `<org_id>/<photo_id>/edited`. The policies compare the first path segment, as text, with the caller's memberships. There is no delete policy.
- The file ends with the first-time set-up steps as comments: create the accounts, insert the organization, insert the first `org_members` row. The application never uses the service-role key.

## 9. Synchronisation design

Synchronisation is optional and off in the default build. The engine has been run against mock adapters only (section 12). No test sends a request through the Supabase REST adapter, and it has never exchanged a request with a real Supabase project.

- `EV.sync` holds the engine (`pull`, `push`, `reconcile`) and one adapter. The Supabase adapter uses `fetch` against three interfaces of one project: Auth (`/auth/v1/…`), PostgREST (`/rest/v1/<table>`) and Storage (`/storage/v1/object/…`). No SDK is used.
- Adapter interface: `signIn`, `signOut`, `membership`, `upsert`, `fetchSince`, `fetchByIds`, `uploadPhoto`, `downloadPhoto`, `probe`. Tests replace it with `EV.sync.useAdapter(mock)`.
- `organizations` and `profiles` are not synchronised. The other 26 tables are.
- Demo data never leaves the device. `push` drops the outbox entry of any `is_demo` row and never sends the row. A workspace cannot be connected while demo data is on the device. While a workspace is connected, the demo environment cannot be loaded and a backup that contains demo rows cannot be restored.

### 9.1 Connecting and signing in

`EV.sync.connectSupabase(url, anonKey)` ("Connect workspace" in Settings) refuses: an address that is not a bare `https://` origin; a key shorter than 20 characters; a secret key (a JWT whose role is `service_role`, or a key that starts with `sb_secret_`); an origin that the page policy does not allow; a device that still holds demo data; a workspace that does not answer the probe.

`EV.sync.signIn(email, password)` applies these rules:

1. Membership. After the password grant, the account's rows in `org_members` are read. If they cannot be read, or there are none, the session is discarded. There is no session without confirmed membership.
2. One organization per device. A device that has not adopted an organization takes the account's earliest membership, and records carrying the device's provisional `org_id` move to it (`adoptOrg`). A device that has adopted one accepts only accounts that are members of it.
3. Role. `viewer` sets `store.readOnly`. A viewer sends nothing: `push` returns at once, and whatever is already queued stays queued for the next sign-in that may write.
4. From the first sign-in `store.syncEnabled` is on: every later change is queued in the outbox, also while signed out.
5. Only the first sign-in, and only for a role that may write, sends the records that were already on the device (`store.outbox.markAll()`). A later sign-in does not: rows that came from the workspace would be sent back unchanged, and rows edited elsewhere meanwhile would look like conflicts.

While a workspace is connected and no session exists, the gate shows "Sign in". Sign-out uses `scope=local`, so only this device is signed out. The access token is refreshed 90 seconds before it expires; a refresh refused with 400 or 401 clears the session.

### 9.2 A run: pull, then push

`EV.sync.run()` starts 2.5 s after a store change, every 120 s while the page is visible, when the page becomes visible, when the browser reports `online`, shortly after start and from "Sync now". It does nothing while offline or while a run is in progress. It always pulls first: a newer workspace version must be seen, and a displaced local edit kept, before local changes are sent.

Pull position. For each table the engine reads pages of 500 rows of its organization, ordered by `(server_updated_at, id)` and starting after a saved position `{ ts, id }`. This is keyset pagination: rows that share a timestamp are not skipped.

A row is stamped when it is written but becomes visible only when its transaction commits, so a row with an earlier stamp can appear after a later one has been read. Until a position is settled, each pull therefore starts `EV.sync.rereadMs` (15 s) before it. Applying a row twice changes nothing. A position becomes settled when a pull that began at least 15 s after it last moved finds nothing new. From then on pulls continue exactly from it, so the same rows are not downloaded on every run. The position keeps the server's exact timestamp text, because that text is sent back in the next query.

### 9.3 Which version stands

`reconcile(table, row)` decides by what each side's change was based on. For a record that both sides changed it does not compare device clocks, except in the `NO_REVIEW` tables below.

| State on the device | Result |
|---|---|
| No such record | The row is applied. Then the record-ID check (9.4) |
| Same `updated_at` | Same version. A pending outbox entry is removed |
| No unsent change | The row is applied. If it were older than the local row, which should not occur, the local row is queued instead |
| Unsent change, and `base` equals the row's `updated_at` | The workspace still holds the version that was edited. The local change stands and is pushed |
| Unsent change, workspace has moved on, same content | The row is applied and the outbox entry removed. Nothing to review |
| Unsent change, workspace has moved on, different content | Both sides changed the record. The workspace version is applied and the local version is kept as a conflict (9.4) |

`NO_REVIEW` tables (`followups`, `insight_states`, `activity_log`) are regenerated by rule or only appended to. For them the version with the later `updated_at` stands and nothing is kept for review.

Timestamp normalisation. Records on the device hold `Date#toISOString` text (`2026-11-12T10:05:00.123Z`) and versions are compared as text. PostgreSQL answers `2026-11-12T10:05:00.123+00:00`, with up to six fraction digits and without trailing zeros. `fromRemote` converts `created_at`, `updated_at`, `deleted_at` and every `ts` column of an arriving row to the device form. One mock adapter in the suite answers in the PostgreSQL format.

### 9.4 Push, declined writes, kept conflicts and record-ID clashes

- `push` goes through the tables in schema order, parents first. Per table it sends the outbox rows as an upsert on `id`, 200 rows per request. `toRemote` converts only losslessly; any other value is sent as it is, so that the database rejects it and the error is shown.
- Declined writes. The adapter returns the ids the database actually wrote. The trigger `keep_newer_version` skips an update that is older than the stored row, so that id is missing from the answer. Such a row is not counted as sent: the engine fetches the stored row (`fetchByIds`) and reconciles it, which keeps the local edit for review.
- An outbox entry is removed only if the record was not changed while the request was in flight. Otherwise it stays, rebased on the version that was just sent.
- Kept conflicts. The displaced local version is stored in the setting `sync_conflicts` (the latest 100) with the time and author of the workspace version. Settings lists them under "Sync conflicts held for review". "Restore mine" writes the kept version back with `store.update`, which queues it on top of the current workspace version. "Dismiss" drops it. Nothing is merged field by field. The list holds at most 500 versions. If it is full, keeping another discards the oldest, and that is written to the change history (`conflict_discarded`).
- Record-ID clashes. When a pulled row is new to the device and carries a record ID that a different live local record also carries, and that local record has never been held by the workspace (its outbox `base` is `null`), the local record gets the next free ID and an activity entry with action `renumbered`. The UUID is unchanged. Two devices that push new records at the same moment can still end up sharing an ID; `id` remains the only merge key.

### 9.5 Photographs

- Upload order. Image files are uploaded before the row that describes them. If the photograph is edited again during the upload, its row waits for the next run. A row is never sent ahead of its image.
- The storage path is always derived from the record's own ids: `<org_id>/<photograph id>/original` and `…/edited`. `remote_ref` and `remote_edit_ref` only say that the workspace has the file. They are never used as a path, and a download is refused unless both ids are UUIDs.
- A device without the image file fetches it from the workspace the first time the image is needed, and stores it in `photo_blobs`.
- When a pulled photograph row has a different thumbnail or `has_edit`, the locally cached edited rendition is dropped.

## 10. Export, reports and file engines

The format of the daily export package is specified in [EXPORT_FORMAT.md](EXPORT_FORMAT.md). This section covers the machinery.

- Collection (`X.collect` in `exporter.js`). Rows are selected by mode: `full` takes everything; `today` and `range` take rows created or updated in the window (audits also by `audit_date`); `since` takes every row whose current form has not been delivered. A soft-deleted row is selected only if an earlier package delivered it: once by `full` and `since`, and by `today` and `range` when the deletion falls in the window. Building, floor and room filters apply. Every record that a selected row refers to is added, so each foreign key resolves inside the package. Date-based and full exports also add the dependants of audits, configurations, backlog items, requests, devices and findings. `organizations`, `profiles`, `insight_states` and `exports` are not exported, which leaves 24 CSV files.
- Delivery ledger. `record_status` answers one question: does the consumer already hold this row exactly as it is now? A point in time cannot answer it, so the setting `export_ledger` keeps, for every row ever delivered from this device, a signature of the CSV row (a hash of its columns from `X.defs`, derived columns included, without the four package-specific columns of `photo_index.csv`, plus the record's own `updated_at`). A soft-deleted row is `deleted`. Otherwise, not in the ledger is `new`; a different signature is `updated`; the same is `unchanged`. The ledger is written only when the package has been handed over (`X.deliver` succeeded). `export_last` keeps the previous values, so the most recent delivery can be voided exactly (`X.voidExport`).
- Validation (`X.validate`) runs before the package is closed. Structural failures and data-quality warnings go into `validation_report.json`.
- ZIP writer (`zip.js`). PKZIP 2.0 with stored and deflated entries, UTF-8 names and its own CRC-32. Deflate uses the browser's `CompressionStream` when present; photographs are stored uncompressed. There is no ZIP64: at 65,535 entries or 4 GB the writer throws `ZIP_LIMIT` and the export stops instead of dropping files. `EV.zip.read` is the reader used by restore and by the tests.
- XLSX writer (`xlsx.js`). SpreadsheetML parts written as text and packed with `EV.zip`: several sheets, Excel tables with filters, frozen header rows, column widths, wrapped text, dropdown lists, conditional formatting, formulas that Excel recalculates on opening, and free-form dashboard sheets.
- PDF writer (`pdf.js`). PDF 1.4 with the standard Helvetica and Courier fonts (WinAnsi encoding, built-in advance widths for line wrapping, no embedded font), vector rules and fills, and JPEG images. Photographs are re-encoded to JPEG through a canvas before they are embedded.
- Reports (`reports.js`). Eleven report types build one document model, which has three renderers: on-screen preview, PDF, and CSV or Excel. CSV downloads meant for people are written with a byte-order mark and a formula-injection guard. The CSV files of the export package are not: their values are exactly as recorded, and the manifest says so.
- Hand-off (`handoff.js`): the master workbook with 15 tabs, the data dictionary, the analysis instructions and the Claude Project instruction document. They are files the auditor saves; the application sends them nowhere.

**iOS file delivery.** `EV.saveFile` is the exit for generated files, with one exception: the "Share / Save to Files" button of a finished export package, shown when the browser can share the file, calls `EV.shareFile` through `X.deliver(pkg, true)`. On iPhone and iPad, when the browser can share the file and the page is not framed, the finished file is offered in a "File ready" sheet with the buttons "Share / Save to Files" and "Download". `navigator.share` is called synchronously inside the tap: iOS opens the share sheet only from a user gesture, and generating a file takes longer than the original tap remains valid. Closing the sheet without choosing returns `ok: false`, so a dismissed sheet is not a save and an export package is not entered in the ledger. Elsewhere the file is saved through a temporary download link. If the embedding host provides `window.claude.use`, the file is handed to that host's `downloads` capability instead; this is a file-save interface of the host, not a call to an AI service. Framed by such a host without that capability, the application reports that the file cannot be saved; it never falls back to a download the frame would silently block. The sheet flow is tested with the share functions simulated. It has not been run on a physical iPhone.

## 11. Build and deployment artefacts

`tools/build.ps1` deletes `dist/` and produces:

| Output | Content |
|---|---|
| `app/sw.js` (rewritten in the source tree) | The service worker: `tools/sw.template.js` with the file list and the version filled in |
| `dist/site/` | A copy of `app/`: 37 files. The deployable static site |
| `dist/av-environment-intelligence-site.zip` | The same site, zipped |
| `dist/artifact/av-environment-intelligence.html` | The single-file page: a title, two `<meta>` tags, the stylesheet, `<div id="app">` and the 29 scripts inline, in load order. It is a document fragment without `<html>`, `<head>` or `<body>`. It has no service worker, no manifest and no Content-Security-Policy `<meta>`. Published as a page on claude.ai (`EV.env.hosted`) it is a demonstration copy: it opens directly in the synthetic demo environment, shows a **DEMONSTRATION COPY** notice on every screen, keeps its routes in memory, offers no workspace connection and saves files only through the host |
| `dist/av-environment-intelligence-source.zip` | The folders `app`, `supabase`, `deploy`, `tools`, `tests` and `docs`, plus `README.md` and `.gitignore`; each only if it exists |

**Service worker.**

- Versioned pre-cache. The version is the first 12 hexadecimal digits of a SHA-256 over the hashes of all application files and the sync origin. The cache name is `av-environment-intelligence-<folder path>-<version>`. It carries the folder the worker is served from, so two copies of the application on one origin do not share or delete each other's cache. On install the worker caches every file of the list (`./` and the 36 files of `app/` other than `sw.js`); one missing file fails the installation. On activation it deletes the earlier versions of this copy, and also the caches written under the previous name prefix.
- Cache-first, same-origin only. Only same-origin `GET` requests are handled. A request is answered from this cache, then from the network; an offline navigation falls back to the cached `index.html`. Requests to any other origin, including a sync workspace, are neither intercepted nor cached. Audit records and photographs are never in this cache; they are in IndexedDB.

**Content-Security-Policy** (`<meta>` in `app/index.html`): `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'`. No inline script and no `eval` is allowed, which is why `main.js` is a separate file. The default build is device-only: with `connect-src 'self'` the browser refuses every connection to another origin, so cloud sync is impossible.

- `tools/build.ps1 -SyncOrigin https://<project>.supabase.co` accepts one bare `https` origin and adds exactly that origin to `connect-src` in `dist/site/index.html`. Nothing else is opened. The origin is part of the service-worker version, so a different origin is a different build.
- The application reads the policy at run time (`EV.sync.policy()`). Settings states whether the build is device-only or names the allowed workspace, and `connectSupabase` refuses any other address.
- The single-file page carries no policy of its own. There the application reports the policy as not known, and what the page may connect to is decided by the host that serves it.
- `deploy/` holds host configuration templates that repeat the policy as a response header, with `frame-ancestors 'none'` added. Per `deploy/README.md` they have not been deployed or tested.

`tools/serve.ps1` is the development server and must not be deployed. It serves the project folder on `http://localhost:5173/` with `Cache-Control: no-store`. Its only write path, `POST /__save`, accepts same-origin requests and a fixed list of file types, and writes to `.testout/`, which it never serves.

Hosting, the workspace set-up and the checks to run after a first deployment are in [DEPLOYMENT.md](DEPLOYMENT.md). Controls, data flows and the approvals required before real infrastructure information is entered are in [SECURITY.md](SECURITY.md).

## 12. Testing architecture

**In-browser suite.** `tests/tests.html`, opened through `tools/serve.ps1`, loads the application scripts and `tests/suite.js`. `tests/preload.js` gives each run its own database, `av_environment_intelligence_test_<timestamp>`, and stops the automatic boot. The application's own database is not touched; databases of earlier runs are deleted at the start. The 54 tests run in file order in one page, on real IndexedDB, and later tests build on the records of earlier ones. [TEST_REPORT.md](TEST_REPORT.md) records the run of 2026-11-12 in a Chromium-based desktop browser: 51 of 51 passed.

| Area | How it is tested |
|---|---|
| Persistence | Records are read back through a second database connection and compared with memory, table by table |
| Rules and workflow | Audit start, test results, findings, backlog, duplicates, identification states, follow-up tasks, verification and its lapse, priority guidance, change history, the audit of a combined room configuration |
| File engines | ZIP read back by the application's own reader; XLSX parts parsed as XML; PDF header, cross-reference offsets and trailer checked |
| Export | A full package is unzipped and checked against its manifest; further tests cover the delivery ledger, voiding, the summary figures, the scope filters and the stability of exception IDs from one package to the next |
| Synchronisation | Mock adapters only: push, pull, conflicts by base version, declined writes, record-ID renumbering, a mock that answers in PostgreSQL's timestamp format, the sign-in rules |
| Cloud schema | Every record the tests have produced is checked against the column types, NOT NULL, CHECK and unique rules; the SQL file is compared with `S.T` as text |
| Security | Passcode lock; policy parsing and refusal of secret keys; a backup carries no credentials; restored rows are sanitised; data shown as text by the renderer |
| Interface | Every screen and editor renders without a console error; the lock screen hides what was open |
| Phone layout | `tests/frame.html` runs the application in a real 390 × 844 px `<iframe>` on the database of the running test. Every screen is measured for horizontal overflow; every control that is tapped is measured (at least 44 × 44 px, or a 44 px touch area for a switch, a text link and a tappable chip), including the annotation tool; sheets fit the frame. The frame is also a restart test: it reloads every record |
| Service worker | `app/sw.js` is registered and must reach `activated`. Every file the page loads must be in its cache, and nothing but application files |
| iPhone file delivery | `EV.env.ios` is forced and `navigator.share` and `navigator.canShare` are replaced by stand-ins |

**Independent validation of generated files.** The suite posts the files it generates to the dev server, which writes them to `.testout/`. `tools/validate-outputs.ps1` then reads them with other implementations: the export ZIP with .NET `System.IO.Compression`; all 24 CSV files with `Import-Csv`, comparing row counts with the manifest; the PDF files by structure (header, pages, cross-reference table); every XLSX file in Microsoft Excel through COM, which must open it without repair, and the 38 dashboard formulas of the master workbook must evaluate. All of these checks passed on 2026-11-12. `tools/render-pdf.ps1` renders PDF pages to PNG with the Windows PDF engine for inspection; it makes no assertion.

**Not covered.**

- No physical iPhone. Safari, installation to the Home Screen, the camera, the share sheet and storage behaviour on the device are untested. The tests ran in a Chromium-based desktop browser, including at the 390 × 844 px viewport and offline with the server stopped.
- No real Supabase project. Auth, PostgREST, Storage, row-level security and the triggers have never run. `supabase/schema.sql` has never been executed.
- The suite has no assertion on tab-to-tab propagation over `BroadcastChannel`, on the retry path and the memory-only fallback of the save queue, on `store.wipeAll`, or on the single-file page. `tests/embed.html` loads that page in a sandboxed frame; it holds no assertions. The last test of the suite does assert on it: it loads the built single-file page in a frame without storage, under a stand-in for the page host.

The results, the manual checks and the full list of gaps are in [TEST_REPORT.md](TEST_REPORT.md).
