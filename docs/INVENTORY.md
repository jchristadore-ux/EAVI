# AV asset inventory

The application's primary purpose is now an **AV asset inventory**: find every physical AV device, record what it is
and where it is, capture its identifiers, and export clean records for the monitoring portal. The earlier audit
workspace is kept whole as the **Legacy Command Center** (see section 8).

Status (19 November 2026): built and covered by the automated suite (74 tests, 12 of them for this inventory, plus the phone-layout test for its screens). An independent review found 24 defects; all were fixed and the serious ones have tests.
**AI identification has never run against a real AI provider** — no key was available. The client side is tested
against a stand-in service; the server function is written but has not been deployed or executed
([AI_IDENTIFICATION.md](AI_IDENTIFICATION.md)). Not tested on a physical phone.

## 1. In the field

1. **Room Inventory** → building → floor → room (or *Start Room Inventory* on the dashboard, which offers the last
   room first).
2. **+ ADD DEVICE — photograph it** opens the camera at once. Take the front; then, with *Add photograph*, the
   label and the rear panel. Each photograph is tagged Front / Rear panel / Label / Port labels / Other.
3. **Identify with AI** (when available) sends the photographs and fills in what it could read. Everything stays
   editable; uncertain values are offered as suggestions to tap, never filled in.
4. Check the values. For each identifier choose its status: captured, verified, *not accessible*, or *not applicable*.
5. **Confirm & save**. The device is now an asset of that room. **Photograph next device** opens the camera again.
6. **Photograph the room** (on the room page) for a wide view of the room itself; these photographs belong to the
   room, not to a device.
7. When the room is done: **Mark room inventory complete**, then **Next room**.

Without AI the same screen is used to type the details, with the photographs beside the fields. *Save for later*
keeps a capture under **Identify Devices** until someone reviews it. On Android Chrome, *Read barcode* offers each
barcode or QR value found in a photograph as serial, MAC or asset tag (the person chooses); browsers without the
Barcode Detection API (iPhone Safari) do not show the button. *Crop* adds a cropped copy of a photograph (for
example one device out of a rack); the original is kept.

## 1a. Equipment already listed for a room

Rooms imported from the room list carry their equipment as text in *Display configuration*, *Camera
configuration* and *Microphone configuration* (for example "Samsung QM55R (LH55QMRE)", "Neat Bar (NEATBARPRO-SE)",
"Shure Ceiling X4"). **Room Inventory -> List equipment from room details** (all rooms, with a preview) or the note
on a room turns each item into an asset marked **Listed - not yet seen**:

- the text is kept exactly (`listed_text`); "N/A" and empty values are skipped;
- quantities are counted: "X4", "x12", "(x2)", "5x ..." give that many assets;
- the same text named for the camera and the microphones (a video bar) is one *Room collaboration system*;
- the category comes from the column (display, camera, microphone endpoint); the manufacturer only when the text
  starts with a known name; the rest stays, as written, in the model. Nothing is corrected ("Creston" stays unknown);
- listing again adds nothing (also not after an item was merged, deleted or marked not found).

In the room, each listed asset has **Found - photograph** (the capture confirms that asset: it becomes seen, keeps
its ID, and each value keeps its source), **Confirm without photo**, and **Not in this room** (recorded in its notes and
archived). A new capture in a room with listed equipment asks whether it is one of them. Listed assets are counted
separately on the dashboard, do not start a room, are not in the quality figures, and stay out of the legacy audit
screens, follow-up tasks and daily export until they are seen.

## 2. The asset record

An asset is a row of the existing `devices` table, so the legacy screens keep working on the same records. Its
code (`AVEI-DV-0001` …) is the asset ID.

| Field | Notes |
|---|---|
| Asset ID | `code`, system-generated, never reused |
| Building, floor, room | from the room the device was captured in; *Move to another room* records the move in the history |
| Department | on the room (`rooms.department`) |
| Device category | a drop-down of the shared list (37 built-in in 7 groups); its last entry, *Other - type a new category*, opens a box to type one: a new name (for example "PoE injector") is added to the list (group Other) when **Add** is tapped and is offered in every room after that; the same name in other capitals reuses the listed one. Administrators can hide entries under Settings |
| Manufacturer, model | manufacturer offers the shared list but accepts any name |
| Serial number, MAC address, IP address | each with its own status: Unknown, Verified onsite, Verified from management system, Awaiting IT, Awaiting vendor, **Not accessible / unavailable**, Not applicable |
| Switch port ID | **required once the device has an IP address**: the capture screen does not save without it, unless the port is stated as not accessible or not applicable; a device with an IP and no port is incomplete (dashboard: "Switch port ID not captured"). Same statuses as the other identifiers (`port_status`) |
| Notes | optional (make, product family, function, hostname and asset tag were removed from the inventory screens on 19 November 2026; the columns stay in the database, and the legacy *Technical record* still edits hostname and role) |
| Photographs | all photographs linked to the device; the originals are never changed |
| Source of each value | `field_sources`: AI image recognition, read from label photograph, entered manually, existing record, imported, network discovery (listed for imported data; the application never scans) |
| Identity confirmed | who and when; cleared automatically when the category, manufacturer or model changes afterwards |
| Date captured, last verified | automatic |
| Original AI answer | kept unchanged in `asset_identifications.result`, shown under *Original identification* |

**Identifier states.** *Verified* (value and a verified status), *captured* (value, not yet verified), *not
accessible* (stated), *not applicable* (stated), *not captured yet*. Only the last one counts as missing: a device
that does not expose a MAC address is not an incomplete record once someone says so.

**Verification status** (derived, never typed):

| Status | When |
|---|---|
| Needs identification | category, manufacturer or model missing, or flagged *Needs manual review* |
| AI identified — awaiting review | manufacturer or model came from AI and no person has confirmed the identity (captures not yet confirmed are listed under Identify Devices) |
| Partially verified | identity recorded, but an identifier is not captured, captured-not-verified, or invalid |
| Manually verified | identity confirmed by a person, and every identifier verified, not accessible or not applicable |
| Exported | shown beside the status: the asset was exported and has not changed since |

**Room inventory status**: *Not started*, *In progress* (as soon as a device or capture exists), *Complete* (only
when a person marks it; *Reopen* undoes it).

## 3. AI identification (client side)

- Runs only through the cloud workspace's server function; the browser never holds an AI key. It is unavailable,
  and the screen says why, on a device-only installation, when signed out, offline, or until the operator has
  authorized it on the server (`AI_IDENTIFICATION_ENABLED=true`).
- Sends only the photographs of the capture (re-encoded as JPEG of at most 2048 px, which drops camera metadata,
  whenever the browser can decode the image; otherwise the stored file as it is) and
  the category list. No room, building, user or network data. Only when *Identify with AI* is tapped, unless
  *Identify automatically after a photograph* is switched on in Settings.
- The answer is checked again in the browser: a serial, MAC or IP is used only when it was read from visible text
  and has a valid form (invalid text is shown as "seen, not used"); *confirmed* requires a label or logo; a model
  that similar models share is offered as a choice with its alternatives; a category outside the list is dropped.
- Several devices in one photograph are listed separately; each is saved on its own.
- A value a person typed is never replaced by a later AI answer.

## 3a. Reading a label later

A photograph of a label taken during the walk-through can be read afterwards: in the asset record, **Read label from
photographs** sends that device's photographs (labels first) to the AI identification service and lists each serial
number, MAC address and IP address it read from visible text, each with **Add to device**. Nothing is added until it
is tapped, a verified value is never replaced, and the value is recorded as coming from AI image recognition. Without
AI identification (no provider key), **Read barcodes** reads the barcodes on the label photographs on browsers that
support it (Android Chrome), and the person chooses whether each value is the serial or the MAC address.

## 4. Duplicates

| Signal | Strength |
|---|---|
| Same serial number or MAC address (ignoring case and spaces) | Strong — "Potential duplicate assets" on the dashboard; *Unique devices* subtracts them |
| Same manufacturer and model in the same room | Weak — often several identical devices |
| Nearly identical photographs (difference hash of the image) on two assets | Weak, secondary |

Nothing is merged automatically. Confirming a capture that shares an identifier opens **Compare and merge**: field
by field, choose which value to keep, or *Keep as separate devices* (the pair is then never offered again). A merge
never replaces a verified identifier or a confirmed identity with an unverified value; when both records hold the same
value, the stronger status is kept (verified over unverified); technical details the kept record lacks (firmware,
switch and port, VLAN, warranty and the like) are taken from the merged one and listed before merging; photographs, AI results and
every reference (findings, backlog items, switch ports, network relationships) move to the kept record, and the
merged record is deleted and kept in the history.

## 5. Export & Integration

- **Scope**: entire enterprise, a building, floor, department, room, device category, or the assets selected in the
  registry. **Records**: all, not yet exported or changed since, never exported, changed since. **Verification**:
  manually verified only (default), verified and partially verified, or all confirmed assets.
- **Field mapping** (export profiles): the receiving system's columns in order, each filled from an asset field, a
  fixed value, or left empty, and optionally marked required. Nothing about the portal's schema is assumed: the
  built-in *Standard asset export* uses this application's field names. *Start from the portal's import template*
  takes the header line of the portal's import file and suggests a source for each column by name; check every
  suggestion before saving.
- **Preview** (first 25 rows) and a **validation report**: required columns without a value, invalid MAC/IP values,
  identifiers repeated within the export, assets not manually verified, empty optional columns, assets left out by
  the verification rule, mapping problems. It never blocks an export; exporting with issues asks once.
- **Formats**: CSV (UTF-8 with byte-order mark; values that a spreadsheet would run as formulas are written as text),
  Excel (an *Assets* table and an *Export* sheet with the validation figures), JSON (`export` header + `records`).
- **After the file is saved** (not before, and not when the save is cancelled): an export record (`AVEI-AX-0001` …,
  who, when, mapping, scope, count, file name, validation summary) is kept in **Export history**, and each exported
  asset stores the export ID and a signature of its values. Any later change to the asset makes it *Changed since
  export*; exporting again is always possible.
- **Direct API delivery is not built.** The mapping produces the same records a connector would send; adding one
  later means a new delivery step after `EV.assetExport.build`, without changing the asset data.

## 6. Data model changes and upgrading

- Device database (IndexedDB) version 2 adds the object stores `asset_identifications`, `asset_taxonomy`,
  `export_profiles`, `asset_exports`. Existing records are untouched; new fields are simply absent on old records
  and read as "not recorded".
- New columns: `rooms.department, inventory_status, inventory_completed_at, inventory_completed_by`;
  `devices.make, product_family, asset_tag, identity_confirmed_at, identity_confirmed_by, field_sources, manual_review,
  last_verified_at, ai_identification_id, merged_into, distinct_from, exported_at, export_code, export_sig`;
  `photos.identification_id, phash, crop_of`. Identifier statuses gain `unavailable`.
- `supabase/schema.sql` is safe to run again on the existing workspace: it adds the new tables and columns
  (`add column if not exists`), re-applies every value list, and changes no existing row.
  **Run it in the Supabase SQL editor before deploying this version.** A client of this version pushing to a database
  without the new columns gets "column not found" errors and stops synchronising until the SQL has run.
- The legacy daily export package does not include the inventory tables or the bookkeeping columns, so its format
  (docs/EXPORT_FORMAT.md) is unchanged.

## 7. Where things are in the code

| File | What |
|---|---|
| `app/js/inventory.js` | `EV.inv`: identifier states, status, signature, metrics, duplicates, merge, taxonomy |
| `app/js/identify.js` | `EV.ai` (service client, answer checks) and `EV.identify` (capture screen, crop, barcode, fingerprint) |
| `app/js/pages/inventory.js` | Inventory Dashboard |
| `app/js/pages/rooms.js` | Room Inventory and the room workspace; `EV.assetRow` |
| `app/js/pages/assets.js` | Asset Registry, the asset record, Compare and merge, Identify Devices |
| `app/js/pages/integration.js` | `EV.assetExport`: mappings, validation, CSV / Excel / JSON, export history |
| `supabase/functions/identify-device/` | Server-side AI identification (not yet run) |

## 8. Legacy Command Center

Every earlier screen keeps its route: `/environment`, `/audits`, `/audit/…`, `/room/…`, `/devices`, `/infrastructure`,
`/backlog`, `/coordination`, `/spares`, `/reports`, `/export`. The former dashboard moved from `/` to `/legacy`.
The main navigation shows one *Legacy Command Center* link; *Settings → Show the Legacy Command Center in the
navigation* lists all of its sections. Its data is the same data: a device captured in the inventory appears in the
legacy Device Inventory, and the asset record's *Technical record* button opens the legacy device editor (network,
power and lifecycle fields).
