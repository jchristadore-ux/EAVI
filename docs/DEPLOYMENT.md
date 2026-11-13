# Deployment

How to build, host and (optionally) connect the application, and what has to be checked before it is used.
Read [SECURITY.md](SECURITY.md) first: **nothing here makes the application approved**. Until client security has
approved the application and its hosting, deploy it only to evaluate it with the built-in demo data.

## 0. Status of this document

| Item | Status |
|---|---|
| Build script (`tools\build.ps1`) | Run and checked on Windows PowerShell 5.1: produces the site, the single-file page and the source package |
| Built site, served over HTTP on `localhost` | Tested: loads, works offline from its service worker with the server stopped, builds an export offline |
| Hosting on a real HTTPS host | **Not done.** No hosting account, credentials or deployment tooling were available where this was built |
| Header templates in `deploy/` | Written from each host's documented format; **not deployed or tested** |
| Cloud workspace (`supabase/schema.sql`) | Generated and reviewed statically; **never executed** against a database. Sync is tested against mock workspaces only |

The smallest action that produces a live address is in §7.

## 1. Build

Requirements: Windows PowerShell 5.1 or later. No Node, npm, bundler or internet access.

```
powershell -ExecutionPolicy Bypass -File tools\build.ps1
```

| Output | What it is |
|---|---|
| `app\sw.js` | Regenerated: the service worker with the exact list of application files and a version derived from their content |
| `dist\site\` | **The deployable site** — 37 static files. Upload this folder as the web root |
| `dist\av-environment-intelligence-site.zip` | The same folder, zipped |
| `dist\artifact\av-environment-intelligence.html` | One self-contained page (all CSS and JavaScript inline) for a host that accepts a single file. No service worker, no offline start, no page-level security policy. For a private demo only: published as a page on claude.ai it opens directly in the synthetic demo environment and says on every screen that it is a demonstration copy |
| `dist\av-environment-intelligence-source.zip` | The source: `app`, `supabase`, `deploy`, `tools`, `tests`, `docs`, `README.md` |

There are two kinds of site build:

| Build | Command | Content-Security-Policy `connect-src` | Effect |
|---|---|---|---|
| **Device-only** (default) | `tools\build.ps1` | `'self'` | The browser refuses every connection to any other server. Cloud sync cannot be configured |
| Sync-enabled | `tools\build.ps1 -SyncOrigin https://<project>.supabase.co` | `'self' https://<project>.supabase.co` | The browser may also talk to that one origin. The application refuses any other workspace address |

`-SyncOrigin` accepts a bare `https://host[:port]` origin and nothing else. Build the sync-enabled site only after
the cloud database has been approved (§3).

Rebuild after every source change. A new build has a new service-worker version, which is what makes installed
copies update (§5).

## 2. Static hosting

The site is plain files. Any static host works if it meets these requirements.

| Requirement | Why |
|---|---|
| HTTPS with a valid certificate | Service worker, Web Crypto (passcode lock), camera capture and installation to the Home Screen all need a secure context |
| Access control in front of the site: SSO / identity-aware proxy / conditional access, limited to the audit team | The application has no sign-in of its own in device-only mode. The host decides who can load it |
| A stable address that will not change | On iOS the data belongs to the address. A different address is a different, empty application |
| Served from the root of its own host name (or its own sub-path, unchanged afterwards) | The service worker's scope is the folder it is served from |
| The response headers below | Defence in depth beyond the `<meta>` policy |

Response headers (templates in `deploy/`):

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
X-Frame-Options: DENY
Permissions-Policy: camera=(), microphone=(), geolocation=()
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

- For a sync-enabled build the header's `connect-src` must name the same single origin as the build.
- `Permissions-Policy: camera=()` does not affect photograph capture: the application uses the system camera through
  a file input, not a live camera stream.
- Serve `index.html` and `sw.js` with `Cache-Control: no-cache` so that an update is noticed. Every other file may be
  cached normally; the service worker keeps its own versioned copy.

Templates provided (see `deploy/README.md`):

| File | Host | What it sets |
|---|---|---|
| `deploy/staticwebapp.config.json` | Azure Static Web Apps | Requires a signed-in Microsoft Entra ID user holding a custom role on every route; the headers above; cache rules |
| `deploy/_headers` | Cloudflare Pages, Netlify | The headers above and cache rules. Access control is configured in the host (Cloudflare Access, Netlify identity / SSO), not in this file |

Copy the template for the chosen host into `dist\site\` before uploading. They are starting points that follow each
host's documented format; confirm the result with the checks in §6 after the first deployment.

## 3. Cloud workspace (optional — shared sync between devices)

Skip this section for a device-only deployment. It needs its own approval (vendor, region, access model, retention):
see [SECURITY.md](SECURITY.md) §5.

### 3.1 Project

Create a Supabase project in the approved organisation and region. Note the project URL
(`https://<project>.supabase.co`) and the **publishable (anon) key**. The service-role key is never used by the
application and must never be entered in a browser; the application refuses it.

### 3.2 Schema

Run `supabase/schema.sql` once in the project's SQL editor. It creates the tables, constraints, indexes, triggers,
the server-side audit trail, row-level-security policies, the private `audit-photos` bucket and its policies.
It is written to be re-runnable (`create … if not exists`, `drop policy if exists`). It does **not** alter the type
of a column that already exists; regenerate and migrate deliberately if the application schema changes.

The file is generated from `app/js/schema.js`. To regenerate it, open `tools/gen-schema.html` through the
development server and copy `.testout\schema.sql` over `supabase\schema.sql`. An automated test fails when the two
are out of step.

### 3.3 Authentication settings

- Disable public sign-ups. Accounts are created by an administrator.
- Enable MFA or connect the organisation's SSO if the plan allows it. The application itself implements e-mail and
  password sign-in only.
- Set a short access-token lifetime.

### 3.4 Organisation and members

Run as the project owner, once (also listed at the end of `schema.sql`):

```sql
insert into public.organizations (name, short_code) values ('<organization name>', 'AVEI') returning id;
insert into public.org_members (org_id, user_id, role, full_name)
  values ('<organization id>', '<auth user id>', 'admin', '<name>');
```

Roles are `admin`, `lead_auditor`, `auditor` and `viewer`. Add one `org_members` row per account.

### 3.5 Site build and connection

1. Build the site for this project: `tools\build.ps1 -SyncOrigin https://<project>.supabase.co` and deploy it (§2),
   with the same origin in the host's `connect-src` header.
2. On each device: remove the demo data (*Settings → Demo data*), then *Settings → Cloud sync*, enter the project
   URL and the publishable key, and sign in. The first sign-in sends the records already on the device; afterwards
   only changes are sent.

### 3.6 Verification checklist — run before any real data is synchronised

The SQL has never been executed, and synchronisation has only been run against mock workspaces. Every line below
must be observed on the real project, with test accounts and demo-like data, and the outcome recorded.

| # | Check | Expected |
|---|---|---|
| 1 | `schema.sql` runs from start to finish in the SQL editor | No error. A second run also completes |
| 2 | Row-level security is enabled on every table in `public` | `select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity` returns no rows |
| 3 | With the publishable key and **no** signed-in user, read any table through the REST API | No rows, or a permission error. Never data |
| 4 | A member of organisation A reads and writes rows of organisation B | Reads return nothing; inserts and updates are refused |
| 5 | A `viewer` inserts or updates a row | Refused |
| 6 | Any signed-in user issues a `DELETE` on a data table | Refused |
| 7 | An update carrying an older `updated_at` than the stored row | The stored row is unchanged, and the REST answer does not list that row's id |
| 8 | An update that changes `org_id` | Refused (`org_id is immutable`) |
| 9 | Insert and update a row, then read `audit_trail` as an `admin` and as an `auditor` | One row per write for the admin; nothing for the auditor |
| 10 | The `audit-photos` bucket | Not public. An object is unreachable without a member's token, and unreachable with a token of another organisation |
| 11 | Two devices, two auditors, same organisation: create, edit and delete records and photographs on each while online | Both devices converge; nothing is duplicated; *Settings → Cloud sync → Status* returns to "Up to date" on both |
| 12 | Edit the same record on both devices while one is offline, then reconnect | The later synchroniser sees the other version applied and its own edit under *Sync conflicts held for review* |
| 13 | Leave both devices idle for several minutes with sync enabled and watch the project's API log | No repeating upserts of unchanged rows |
| 14 | Timestamps | A record pushed by a device comes back and is not re-sent (the application normalises the database's timestamp format; this is covered by an automated test against a mock, and must be seen once against the real service) |

If any line fails, do not use sync with real data. Record the failure and fix the schema or the client first.

## 4. Device set-up

Per auditor device (details and the reasons are in [MOBILE_GUIDE.md](MOBILE_GUIDE.md)):

1. A managed, encrypted, passcode-protected device that the organisation can wipe remotely.
2. Open the site address in Safari, sign in through the host's SSO, then *Share → Add to Home Screen*. From then on
   open the application only from the Home Screen icon.
3. Complete the set-up screen: auditor name and an app passcode.
4. *Settings → Data on this device*: confirm that storage is protected from automatic clearing; request it if not.
5. Export every day (*Daily Export*), to the approved destination.

## 5. Updating

1. Change the source, run the test suite (`tests/tests.html` through `tools\serve.ps1`; see
   [TEST_REPORT.md](TEST_REPORT.md)) and `tools\validate-outputs.ps1`.
2. `tools\build.ps1` (with the same `-SyncOrigin` as before, if any) and upload `dist\site\`.
3. Installed copies look for a new version whenever they are opened or returned to with a connection (an iPhone
   home-screen app is usually resumed, not restarted). The new version installs in the background and the page switches
   to it by itself as soon as no editor or dialog is open, nothing is being typed and every change is saved; until then
   a banner offers *Load now*. *Settings → About* shows the build that is running. Data on the device is not touched by
   an update.

The on-device database has a version number (`DB_VERSION` in `app/js/store.js`). Adding a table means raising it;
that has not been needed so far, and there is no migration code beyond creating missing object stores.

## 6. Checks after the first deployment

| Check | How |
|---|---|
| The site is not reachable without signing in | Open the address in a private window |
| Headers are present | Browser developer tools → Network → the document request → response headers |
| No outside connection is possible (device-only build) | *Settings → Cloud sync* shows "No outside connections" |
| Offline start | Open once, switch to aeroplane mode, close and reopen from the Home Screen |
| Storage protection | *Settings → Data on this device* |
| Camera capture, photograph annotation, "File ready" sheet and *Save to Files* | On the actual iPhone model — these have **not** been tested on a physical device |
| A full audit of one demo room, then a daily export opened on a computer | End-to-end acceptance |

## 7. What is needed to go live, in order

| # | Action | Who | Blocks |
|---|---|---|---|
| 1 | Choose and approve a static host with SSO (for example Azure Static Web Apps in the PepperDash or client tenant) | PepperDash lead + Client IT security | Everything below |
| 2 | Upload `dist\site\` plus the matching `deploy/` template; restrict access to the audit team | Whoever administers that host | A live address |
| 3 | Run the checks in §6 on the device model that will be used | Auditor | Field use with demo data |
| 4 | Client security review of the application, hosting, device policy, photography and export handling ([SECURITY.md](SECURITY.md) §5) | Client | Entering real information |
| 5 | Only if shared sync is wanted: approve the cloud database, then §3 including the checklist in §3.6 | Client + administrator | Sync |
| 6 | Only if packages will be analysed in a Claude Project: AI data-use authorisation | Client | Uploading packages |

Putting the source under version control: Git was not available where this was built. Unzip
`dist\av-environment-intelligence-source.zip` on a machine with Git and run:

```bash
git init
```

```bash
git add -A
```

```bash
git commit -m "AV Environment Intelligence 1.0.0"
```

then add the organisation's private remote and push. `dist/` and `.testout/` are build and test output and are
excluded by the supplied `.gitignore`.
