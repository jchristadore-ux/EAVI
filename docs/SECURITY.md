# Security

> **Approval status: NOT APPROVED.** This application, its hosting and (if used) its cloud database must pass
> the client's security review **before any real client infrastructure information is entered**. Until then it may be
> used only with the built-in synthetic demo data. The same notice is shown in the application at set-up and in
> *Settings → About and approvals*.

All audit information (room names, device identities, IP and MAC addresses, serial numbers, switch and port mappings,
VLANs, firewall and topology notes, photographs of equipment) is treated as sensitive enterprise infrastructure data.

This document states what the application does to protect that data, how each control was checked, and what it does
**not** do. Deployment steps are in [DEPLOYMENT.md](DEPLOYMENT.md); test evidence is in [TEST_REPORT.md](TEST_REPORT.md).

## 1. What the application is, and is not

| It is | It is not |
|---|---|
| A documentation and audit tool: people type what they observe and photograph what they see | A network scanner. It performs no discovery, probing, port scanning, SNMP, mDNS, ARP or device configuration, and has no code path that could |
| A static web application with no server-side code of its own | A service that holds a copy of the data. In device-only mode the only copy is on the auditor's device |
| Fully self-contained: 37 first-party files in the built site, no libraries, fonts, CDNs, analytics or telemetry | A client of any AI service. Nothing is sent to Claude or any other model by the application |
| Explicit about what is unknown: missing identifiers stay missing and are flagged | An OCR tool. Nothing is read from photographs automatically |

## 2. Data flows

There are exactly three ways data can leave the browser's storage, and the first needs a deliberate tap every time.

| # | Flow | Trigger | Destination | Default |
|---|---|---|---|---|
| 1 | Daily export ZIP, reports (PDF / CSV / XLSX), master workbook, full backup ZIP, single photograph | The auditor taps an export / download / share button | A file on the device, or wherever the auditor sends it with the system share sheet | Available |
| 2 | Cloud synchronisation | Automatic once a workspace is connected and the auditor has signed in | One Supabase project (database + private storage bucket) | **Off, and impossible in the default build** (see §3.1) |
| 3 | Loading the application itself | Opening the site | The static host that serves the files | n/a |

Uploading an export package to a Claude Project is a separate human step outside the application. It sends client
infrastructure data to an external AI service and therefore **needs the client's explicit authorisation**; the
application says so on the export screen and inside the package instructions.

## 3. Controls

### 3.1 Network egress is denied by the browser (default build)

The page declares this Content-Security-Policy:

```
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:;
connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'
```

- `connect-src 'self'` — the browser refuses every `fetch`, XHR, WebSocket or beacon to any origin other than the
  site itself. A default ("device-only") build therefore cannot transmit audit data anywhere, even if a defect or an
  injected script tried to. *Checked:* an attempted request to another origin is blocked and reported as a
  `connect-src` violation; the in-app *Cloud sync* panel states "No outside connections"; an automated test asserts
  that the shipped page is device-only and allows no inline or `eval` script.
- `script-src 'self'` — no inline script, no `eval`, no third-party script. The code base contains no `eval`,
  `new Function` or HTML-string injection.
- `form-action 'none'`, `object-src 'none'`, `base-uri 'self'` — no form posts, plug-ins or base-URL rewriting.
- Cloud sync is enabled only by an administrator rebuilding the site for **one named origin**
  (`tools\build.ps1 -SyncOrigin https://<project>.supabase.co`), which adds exactly that origin to `connect-src`.
  The application reads the policy and refuses any other workspace address.

Send the same policy as an HTTP response header from the host as well, with `frame-ancestors 'none'` added (a
`<meta>` policy cannot express that directive). Header templates are in `deploy/`; they are templates and have not
been deployed or tested from this environment.

The single-file build (`dist/artifact/`) is different: its scripts are inlined, so it carries **no** page-level
policy and relies entirely on the page that hosts it. It exists for a private preview with demo data only. When it
is published as a page on claude.ai it opens in the synthetic demo environment, carries a **DEMONSTRATION COPY**
notice on every screen (not an approved deployment; do not enter real client information), offers no workspace
connection, and can hand a file to the viewer only through the host's own save prompt.

### 3.2 Authentication

| Mode | Mechanism | Notes |
|---|---|---|
| Hosting (recommended for every deployment) | The static host's own access control — SSO / identity-aware proxy / conditional access | Protects delivery of the application. Not provided by the application; see [DEPLOYMENT.md](DEPLOYMENT.md) |
| Device-only | Local auditor profile plus an optional app passcode: PBKDF2-HMAC-SHA-256, 210 000 iterations, 16-byte random salt; only the derived verifier is stored. Auto-lock after 2, 5, 15, 30 or 60 minutes of inactivity | An **app lock**, not encryption. Requires HTTPS (Web Crypto). A forgotten passcode cannot be recovered; the only reset erases local data |
| Cloud workspace | Supabase Auth, e-mail + password, over HTTPS. Accounts are created by the workspace administrator; public sign-up must be disabled | MFA / SSO are configured in the Supabase project, not in this application. The password is sent only to the workspace and is never stored |

Behaviour of the app lock (*each point is covered by an automated test*):

- Changing or removing the passcode requires the current passcode, so an unlocked, unattended device is not enough
  to replace or remove it.
- The idle limit is checked before any tap or key press renews the session: the first input after the limit locks.
- While the lock screen (or the workspace sign-in screen) is showing, nothing that was open is in the page: open
  editors and any open question are removed from the document, cannot be reached with Back or Escape, and return
  unchanged after unlocking.

Behaviour of workspace sign-in (*covered by automated tests against a mock workspace*):

- A session counts only once membership of a workspace organisation has been read. Any failure signs out again.
- A device belongs to one organisation. An account of another organisation is refused on a device that already
  holds records.
- Signing out ends the session on that device only (`scope=local`).

### 3.3 Role-based access and row-level security (cloud workspace)

Roles: `admin`, `lead_auditor`, `auditor`, `viewer` (table `org_members`, managed server-side).

- Every data table has row-level security enabled. A signed-in user can **read** only rows of organisations they are
  a member of; **insert / update** additionally require the role `admin`, `lead_auditor` or `auditor`. `viewer` is
  read-only (also enforced in the client, which refuses writes and sends nothing).
- Table privileges are least-privilege: everything is revoked from `anon` and `authenticated`, then only
  `select, insert, update` are granted to `authenticated` on data tables. Nothing is granted to `anon` or `public`.
- There are **no DELETE policies** on data tables: clients cannot hard-delete. Deletion is a soft delete (`deleted_at`).
- `org_id` is immutable (trigger), so a row can never be moved to another organisation. The client also limits every
  read to the one organisation the device belongs to.
- An update carrying an older `updated_at` than the stored row is discarded (trigger). The client asks the database
  which rows it actually wrote; a declined row is fetched and the local edit is kept under *Sync conflicts held for
  review* instead of being counted as sent.
- Concurrent edits are detected by the version each edit was based on, not by comparing device clocks. Nothing is
  merged or dropped silently: the workspace version is applied and the displaced local version is kept for review.
- An append-only `audit_trail` table records every insert and update (who, when, which record); it is written by a
  trigger and readable only by `admin`.
- Access helper functions are `SECURITY DEFINER` with a fixed `search_path`, executable only by `authenticated`.

None of the above has been exercised against a real database: see §4 and the verification checklist in
[DEPLOYMENT.md](DEPLOYMENT.md) §3.6.

### 3.4 Photograph files

- Device: image binaries are stored in IndexedDB, separate from the records. The original bytes are never altered;
  rotation and annotation are stored as a second rendition.
- Cloud: one **private** bucket, `audit-photos`. Object paths are `<org_id>/<photo_id>/original|edited`; storage
  policies allow read to organisation members and write to writers of that organisation only. No public URLs or
  signed public links are ever generated; downloads use the user's bearer token. There is no client delete policy.
- The storage path requested is always derived from the record's own ids (both checked to be UUIDs), never read
  from a stored value, so a value in a synchronised row cannot steer a request elsewhere (*automated test*).
- Deleting a photograph deletes the picture, not just its listing: the original, any edited rendition and the
  thumbnail are removed from the device (and from every other device when the deletion synchronises), so a deleted
  image cannot reach a later export or backup (*automated test*). Only the record that it existed is kept. The copy
  in a cloud workspace bucket is **not** removed by the application - clients have no delete permission there - and
  stays until an administrator deletes it.

### 3.5 Secrets

- The source contains no credentials, keys or endpoints. *Checked by search of the source tree.*
- The workspace address and its **publishable (anon) key** are entered at run time and stored on the device. The
  anon key is not a secret; row-level security is what protects the data.
- A secret / service-role key is refused if entered (JWT role claim and `sb_secret_` prefix are both checked), and
  is never needed by the application (*automated test*).
- Backup files contain record data and photographs only. The passcode verifier, the workspace session tokens, the
  workspace key and the auditor profile are **excluded** (*automated test*).

### 3.6 Audit logging

- Device: `activity_log` records every create, update, delete, status change, export, restore and renumbering with
  actor, timestamp and field-level before/after values. Changes to fine-grained records (one test result, one
  network check, a note, a switch port, a photograph's details) are stored as *detail* entries: they are in the
  exported change history with from → to values, while the activity feed shows one summary line per audit. The whole
  log is included in every export.
- Cloud: the server-side `audit_trail` described above, independent of anything the client reports.

### 3.7 Data integrity rules

- Missing IP / MAC / serial values are never invented; each has its own verification status and incomplete records
  are flagged everywhere they appear, including exports. A value that does not look like an address is kept exactly
  as typed and flagged; it is never reformatted into a different, valid-looking one.
- A suspected cause is stored separately from a confirmed root cause; a root cause is accepted only with confidence
  "confirmed" (UI rule and database CHECK constraint).
- An audit marked fully verified whose mandatory information later becomes incomplete is shown and exported as
  "verification lapsed"; the recorded status is not silently changed.
- **Outside data is never trusted as code or structure.** A backup file is rebuilt row by row from the schema: each
  column gets a value of its own type, unknown properties are dropped, rows without a valid id are skipped, and
  every restored row is stamped with this device's organisation. Settings, the lock and the workspace connection
  are never taken from a backup. The renderer shows any object it did not create itself as text, so record content
  can never become markup; it attaches an event handler only when the value is a function, and never sets a
  `javascript:` address or `srcdoc` as an attribute (*automated tests*). A read-only account cannot restore a backup.
- **Renamed on-device storage.** The device database is now `av_environment_intelligence`. On the first start after
  the update the application moves every record from the database of the previous name into the new one, in
  resumable chunks, and then deletes the old database. Party and status values stored under their previous names are
  renamed once (to "Client IT", "Client AV Operations", "Pending Client IT", "Pending Client Approval"); the same
  renaming is applied to records arriving from a restored backup or a sync pull. Backups carrying the previous format
  tag still restore. The offline cache name prefix is now `av-environment-intelligence-`, and the service worker also
  deletes caches with the previous prefix.
- CSV downloads meant to be opened in a spreadsheet (the CSV button on a report) neutralise formula injection: a
  cell starting with `=`, `+`, `-`, `@`, tab or CR is written with a leading apostrophe. The CSV files **inside the
  daily export package** are a data-interchange format and are deliberately **not** altered
  (`conventions.csv.formula_escaping` in `audit_manifest.json` is `none`): they carry every value exactly as
  recorded, must be imported as text, and must not be opened directly in a spreadsheet.
- Demo records are flagged `is_demo`, labelled DEMO in the interface, use documentation-reserved addresses
  (192.0.2.0/24, 198.51.100.0/24, MAC 00:00:5E:00:53:xx) and are **never synchronised**; a workspace cannot be
  connected while demo data is present, and a backup containing demo data cannot be restored into a connected device.

### 3.8 Development tools

`tools\serve.ps1` is a local development and test server. It listens on `localhost` only, accepts a file write only
from a page it served itself (Origin check) and only for the file types the test suite produces, and never serves
the folder it writes to. It is not part of the product and must never be deployed.

## 4. Residual risks the reviewer should weigh

| Risk | Detail | Mitigation available |
|---|---|---|
| Data at rest on the device is not encrypted by the application | IndexedDB is protected by the device's own encryption (iOS Data Protection) and passcode. The app passcode only gates the interface | Managed, encrypted, passcode-protected devices only; remote-wipe capability; short auto-lock |
| Exported files are plain files | ZIP, PDF, XLSX, CSV and backup files are unencrypted. Once saved or shared they are governed by wherever they are put | Define an approved destination (e.g. a managed OneDrive / Files location); prohibit personal mail and messaging |
| Data-package CSV files are not formula-escaped | A recorded value such as `=HYPERLINK(…)` or `+1 212 …` is written unchanged to `devices.csv`, `audit_notes.csv` and the other package files | Import package CSVs as text (or leave them to the analyst tooling); give people the report CSV downloads, which are escaped |
| Photographs can contain more than intended | Labels, screens, whiteboards, people; originals keep whatever metadata the camera wrote (EXIF) | Photography policy for the site; review photographs before export |
| Browser storage can be evicted | Safari may clear site data that is not installed to the Home Screen and unused for a period | Install to Home Screen; the app requests persistent storage and shows whether it was granted; **export daily** |
| Offline shell outlives a host session | Once cached, the application opens offline even if the host's SSO session has expired. The host's sign-in protects delivery of the app, not the data already on the device | Device controls above; app passcode with auto-lock |
| Workspace session tokens are stored on the device | Access and refresh tokens are kept in IndexedDB so sync can resume | CSP and no third-party code remove the usual token-theft vectors; sign out or erase the device to revoke locally; short token lifetimes in the project settings |
| Password-only sign-in in cloud mode | The application implements e-mail + password only | Enforce MFA / SSO in the Supabase project, or place the site behind an identity-aware proxy |
| Record codes are issued per device | The application renumbers a clash it can see (a record arriving from the workspace that the device has not yet sent, or a restored backup). Two devices that send new records at the same moment can still both keep the same human-readable code (e.g. `AVEI-DV-0042`). The permanent key is the UUID, which never collides | Treat the UUID as the key (the export and workbook do); one device per auditor per day, or sync before starting |
| **The PostgreSQL schema has not been executed** | `supabase/schema.sql` is generated and reviewed statically but has never run against a live database from this environment; sync was tested against mock workspaces only | Run the verification checklist in [DEPLOYMENT.md](DEPLOYMENT.md) §3.6 before any real data is synchronised |
| Not tested on a physical iPhone | Tested in a desktop Chromium engine, including a real 390 × 844 px viewport and the iOS file-delivery path with simulated share APIs. Photograph handling was tested with image files given to the code the camera input feeds; the camera itself was not exercised | Field acceptance test on the managed device model before the first audit day ([MOBILE_GUIDE.md](MOBILE_GUIDE.md)) |

## 5. Approvals required before production use

1. **Application security review** of this code base (about 10 300 lines of first-party JavaScript in 29 files, no
   dependencies).
2. **Hosting approval** for the static site: tenant, access control (SSO), TLS, response headers, logging.
3. **Device policy**: which devices may hold audit data; MDM, encryption, passcode, remote wipe, backup rules.
4. **Photography approval** for the audited floors (trading and client areas may have their own rules).
5. **Export handling**: approved storage location, retention period and disposal for exports, reports and backups.
6. **Cloud database approval** — only if shared sync is wanted: vendor, region / data residency, access model,
   backup and retention, administrator accounts, MFA.
7. **AI data-use authorisation** — only if daily packages will be uploaded to a Claude Project: which Claude plan and
   workspace, what data may be uploaded, retention, who may access the Project.

## 6. Reporting a concern

Stop entering data, export what is on the device, and raise it with the PepperDash project lead and client IT
security. *Settings → Erase this device* permanently removes every record and photograph stored by the application
in that browser.
