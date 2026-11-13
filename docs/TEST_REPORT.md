# Test report

What was tested, how, with what result — and what was not. Date of this run: **12 November 2026**, version 1.0.0.

> **Later run, 12 November 2026 (client name removed, storage renamed):** 58 tests; **57 pass**. The four new tests
> (moving an earlier version's database, resuming an interrupted move, restoring an earlier backup, no client name in
> any file the application loads) pass. The one failure is *offline shell*: in this run's browser pane the service
> worker could not be registered on `localhost` at all ("unknown error when fetching the script"); the unchanged
> previous build failed the same way in the same pane, so the cause is the browser, not the change. That test, and
> the new check that the worker removes the cache of an earlier version, are therefore **not verified by this run**.
> `tools\validate-outputs.ps1`: all checks pass. Checked by hand on the deployed GitHub Pages site in a browser that
> had opened the previous version: after one reload the new worker served the page, the earlier cache was gone, the
> earlier database had been moved (its organization ID arrived) and deleted, and no page text names a client.
> The rest of this report describes the earlier run.
>
> **Later run, 13 November 2026 (room list import fills in existing rooms, space summary columns):** 59 tests; **58
> pass**, including the new fill-in test and the updated import test. The one failure is again *offline shell*, for the
> same browser-pane reason as above.
>
> **Later run, 13 November 2026 (automatic switch to a new version):** 60 tests; **59 pass**, including the new
> *application updates* test. *Offline shell* fails for the same browser-pane reason, so its new check that the worker
> reports its version is not verified by this run. Checked by hand on the deployed site instead: the worker answered
> with its version; a page left open on one version reloaded itself into the next after a simulated return to the
> app. That check found that a version deployed within ten minutes of the previous one had been filled with stale
> files from the browser's HTTP cache (GitHub Pages lets browsers keep files for 10 minutes); the worker now installs
> with `cache: 'reload'`, and after that fix the open page reloaded into the fresh files. The build version now also
> changes when `tools/sw.template.js` changes.
>
> **Later run, 13 November 2026 (room list import update mode; Presentation room type):** 61 tests; **60 pass**,
> including the new update-mode test. *Offline shell* fails for the same browser-pane reason as above.

## 1. Summary

| Layer | Result |
|---|---|
| Automated suite (`tests/suite.js`, in a real browser on a real IndexedDB database) | **54 of 54 pass** |
| Independent validation of generated files (`tools\validate-outputs.ps1`: .NET ZIP reader, `Import-Csv`, PDF structure, Microsoft Excel) | **All checks pass** |
| Manual checks: offline start with the server stopped, single-file build inside a frame, PDF pages rendered by the Windows PDF engine, outside-connection block | Pass (§5) |
| Independent code review with adversarial verification (10 reviewers, 10 verifiers) | 98 findings raised; every confirmed defect fixed or documented (§6) |
| PostgreSQL schema executed against a database | **Not done** |
| Cloud sync against a real Supabase project | **Not done** (mock workspaces only) |
| Physical iPhone | **Not done** (Chromium engine, including a real 390 × 844 px viewport) |

Nothing in this report is a claim about anything in the three "not done" rows. They are listed again in §7 with
what has to be done instead.

## 2. Environment

- Windows 11, Chromium-based browser (the development browser pane), served by `tools\serve.ps1` on
  `http://localhost:5173`.
- Each suite run uses its own database (`av_environment_intelligence_test_<timestamp>`) and removes the databases of
  earlier runs. The application's own database is not touched.
- Microsoft Excel (through COM) and the Windows PDF engine (`Windows.Data.Pdf`) were used as independent readers of
  the generated files.
- No Node, npm, Git, Python or Docker exists on the build machine. Every tool is PowerShell 5.1; the tests are
  plain JavaScript run by the browser.

## 3. How to run it again

```
powershell -ExecutionPolicy Bypass -File tools\serve.ps1
```

1. Build first (`tools\build.ps1`): two tests read build output, the service worker file and the single-file page.
   Then open `http://localhost:5173/tests/tests.html`. The page lists each test as it finishes; the summary line turns
   green at 54 / 54. The run takes about a minute in a visible window (several minutes if the browser window is hidden, because hidden pages run their timers slowly).
2. The suite hands the files it generates (export ZIP, three report PDFs and workbooks, the master workbook) to the
   development server, which writes them to `.testout\`.
3. Validate those files independently:

```
powershell -ExecutionPolicy Bypass -File tools\validate-outputs.ps1
```

4. Optional: `tools\render-pdf.ps1 -Pdf <file> -Pages 1,2` renders report pages to PNG with the Windows PDF engine.

## 4. Automated suite

The tests run against the real application code — the same files the site ships — not against stubs. Persistence
tests read the data back through a second, separate database connection. The numbers are the order in the file.

### 4.1 Data model, rules and persistence

| # | Test | What it establishes |
|---|---|---|
| 1 | schema: every table parses and every reference targets a real table | Table definitions are consistent; catalogue sizes (52 functional tests, 11 network checks, 24 device categories, 13 photograph categories, 12 backlog statuses) |
| 2 | validation helpers: IP and MAC formats | Address checks; text that is not an address is never turned into a different, valid-looking one |
| 3 | csv: quoting, embedded newlines and formula-injection guard | CSV encoder and the guard used for report downloads |
| 4 | create building, floor and rooms; records persist to IndexedDB | A saved record is read back from a second connection; the save indicator reflects completed writes |
| 5 | update is persisted and logged with field-level change history | From → to values are recorded |
| 44 | everything in memory is on disk | After a long session every table matches record for record; every photograph has its image file |
| 46 | phone layout and restart (first half) | A second copy of the application, started from what is stored, reloads every record and resumes an audit in progress exactly |

### 4.2 Audit workflow

| # | Test | What it establishes |
|---|---|---|
| 6 | start audit: 52 tests and 11 network checks created; resume returns the same audit | Audit creation and resume |
| 7 | failed test suggests a finding; nothing is created until the auditor confirms | No automatic findings |
| 8 | finding converts to backlog item AVEI-BL-001; a hypothesis never becomes a confirmed root cause | Suspected cause and root cause stay separate |
| 9 | duplicate detection | The same issue in another room links to the existing backlog item and marks it systemic |
| 10 | device identification: IP, MAC and serial have independent states | Missing fields are named exactly |
| 11 | follow-up tasks are created for missing identification and close themselves when resolved | Derived tasks |
| 12 | conflicting values are reported, never auto-resolved | Duplicate IP detection leaves both values as recorded |
| 13 | audit cannot be marked fully verified until mandatory information is complete | Verification gate and its stated reasons |
| 14 | priority guidance weighs several factors and stays advisory | Priority is never set automatically |
| 15 | photograph: stored with original bytes, thumbnail, links; rotate keeps the original; revert works | Original image bytes are never altered |
| 41 | change history: each test result and network check is a detail entry | Fine-grained history with from → to; one summary line per audit in the feed; status changes logged |
| 42 | a fully verified audit whose mandatory information later becomes incomplete reads as "verification lapsed" | Shown and exported as lapsed; stored status untouched; restored when the gap is closed |
| 43 | coordination requests are drafts until submitted; spare equipment risk flags follow the record | No request date before submission; zero / low / unidentified / end-of-life flags; a quantity nobody recorded is "not recorded", not zero; a new room or stock line has no pre-filled type, quantity, condition or lifecycle |
| 48 | archiving a floor takes its devices out of the open follow-up tasks | Archive and restore keep derived tasks in step |
| 28 | discarding a new record takes its dependants with it | No dangling references after any discard; a missing reference is reported, never blocks an export |
| 50 | a divisible room is audited as one combined configuration | One audit for the combined space with the devices of every member room; the member rooms keep their own state; a custom device type, a comment and a photograph on a test are kept and follow the finding; a naming inconsistency is suggested, never recorded by itself; deleting a photograph removes its image files and thumbnail from the device, leaving only the record that it existed |

### 4.3 Reports, files and export

| # | Test | What it establishes |
|---|---|---|
| 16–18 | zip / xlsx / pdf | The three file writers produce structurally valid files (CRC-32 check value, well-formed XML parts, valid cross-reference table, embedded JPEG) |
| 19 | demo environment loads, is labelled DEMO and uses documentation-reserved identifiers only | 192.0.2.0/24, 198.51.100.0/24, 00:00:5E:00:53:xx, `DEMO-` serials |
| 20 | dashboard metrics are computed from records | No static figures |
| 21 | all eleven reports build and export to PDF, CSV and Excel | Every report type, three formats each |
| 22 | master workbook: fifteen tabs | Fourteen tables, a formula-driven dashboard, dropdown lists, conditional formatting and frozen header rows on the data tabs |
| 23 | daily export (full) | Every file present; headers and counts match the manifest; ids unique; every foreign key resolves; photographs byte-for-byte |
| 24 | delivery ledger | `record_status` is decided row by row; only a delivered package counts |
| 25 | a partial export never hides other changes; void; deletions | A floor-limited export leaves other changes pending; the latest delivery can be voided exactly; a deletion is reported once |
| 26 | a voided package that is saved after all is delivered after all | Void and re-save |
| 27 | export summary counts the audits that were worked on | A rename or a later device edit is not "a room audited"; a package without demo rows is not labelled demo |
| 29 | export scope filters | Floor and room selection keep valid relationships; a date range holds that period's audits with everything that belongs to them; a range in which nothing happened is empty |
| 30 | handoff documents are generated | Analysis instructions and data dictionary |
| 47 | iPhone file delivery | The file is offered in a sheet, shared only on a tap; a dismissed sheet is not recorded as a save (share APIs simulated) |
| 51 | a data-quality exception keeps the same exception ID from one package to the next | Exception IDs are stable while the problem exists, unaffected by unrelated work, and disappear when the problem is resolved |

### 4.4 Security, access and synchronisation

| # | Test | What it establishes |
|---|---|---|
| 37 | passcode lock | PBKDF2 verifier only; changing or removing needs the current passcode; the first tap after the idle limit locks |
| 38 | cloud sync is off unless the build allows one workspace; secret keys are refused | The shipped page is device-only; no inline or `eval` script; non-HTTPS, path-carrying and secret-key inputs refused |
| 39 | backup and restore round-trip; a backup carries no credentials | No session token, key, passcode verifier or profile in a backup |
| 40 | a backup file is outside data | Rows rebuilt from the schema; settings and lock never taken from a backup; clashing record IDs renumbered; restore refused for a read-only account; an object that is not a renderer node is displayed as text; a handler that is not a function is ignored and a script address is never set as an attribute |
| 45 | application shell (second half) | A route change closes open sheets; the lock screen removes the open editor and question from the page; Back and Escape change nothing underneath; a wrong passcode does not unlock |
| 31 | sync: push, pull, photograph upload, demo data stays local, conflicts are kept for review | Engine against a mock workspace |
| 32 | sync: a concurrent change is a conflict whichever clock is ahead | Base-version conflict detection; a declined write is not counted as sent; upload and edit races; storage path derived from ids; record-ID clash renumbered |
| 33 | sync with a server that answers in PostgreSQL's timestamp format | A pushed record is recognised when it returns; nothing is sent twice; a settled read position is not downloaded again |
| 34 | workspace sign-in | First sign-in only sends existing records; no session without membership; another organisation refused; a viewer sends nothing |
| 35 | cloud schema conformance | Every record on the device satisfies the database column types, NOT NULL, CHECK and unique rules; tables are sent in foreign-key order |
| 36 | the generated SQL file is in step with the application schema | Every table and column present with the matching type; row-level security enabled on each; nothing granted to `anon` or `public` |

Tests 31–36 are the only evidence for the cloud path. They use mock workspaces and static comparison with the SQL
text. They do not show that the SQL runs, or that Supabase behaves as the mocks do.

### 4.5 Interface and offline

| # | Test | What it establishes |
|---|---|---|
| 45 | application shell: every screen and editor renders without errors | 26 routes and 8 editors, no console error, no stray records created by navigation |
| 46 | phone layout: every screen fits a 390 px wide viewport | The application loaded in a 390 × 844 px frame: 25 routes plus an audit with every section open; no page or content wider than the screen; no element past the right edge; the bottom navigation on screen; five sheets and the annotation tool within the screen; **every control that is tapped is at least 44 × 44 px** (more than 600 measured across the screens and sheets; switches, text links and tappable chips carry a 44 px touch area around them) |
| 49 | offline shell | The service worker installs; every file the page loads is in its cache; nothing but application files is cached |
| 53 | room list import | A CSV becomes buildings, floors, areas and rooms; values that do not fit a list are left empty and kept word for word in the notes; lines without a building, floor or room are not imported; an existing room is not touched; importing the same list again adds nothing |
| 54 | the production site carries no demo data | The application page, its offline file list and the built site have no demo seed; no production source file holds demo record text; without the seed, Settings offers no demo environment |
| 52 | hosted demonstration copy | Under a stand-in for the claude.ai page host (`tests/hosted-preload.js`): the copy opens in the synthetic demo environment with its **DEMONSTRATION COPY** notice on every screen, keeps routes in memory and offers no workspace connection; a file leaves only through the host's save function; a declined, refused or unavailable save is never recorded as delivered and no download is attempted; and the built single-file page itself, in a frame with no storage at all, still opens in memory and says that nothing will be kept |

## 5. Manual checks (11–12 November 2026)

| Check | Method | Result |
|---|---|---|
| Offline operation of the built site | `dist/site` opened once with its service worker, then **the server was stopped** and the page reloaded | Loaded from cache; navigated; built a full export package (695 KB, 28 files, 0 structural errors) with no server |
| Single-file build | `dist/artifact/av-environment-intelligence.html` inside a sandboxed frame (`tests/embed.html`) | Starts; 12 routes render; no external script or stylesheet; no service worker |
| Report PDFs in an independent renderer | Pages rendered to PNG with `Windows.Data.Pdf` and inspected | Layout, tables, DEMO banner and page footers correct |
| Outside connections (device-only build) | A request to another origin attempted from the page | Blocked by the browser and reported as a `connect-src` violation; connecting a workspace is refused with a plain message |
| First run (375 × 812 px emulation, real pointer clicks and typing) | From an empty browser database: set-up screen → auditor name typed → **Start** with the demo switch on | Demo environment loaded (8 rooms); Command Center shown with the DEMO DATA banner and the "Saved" indicator. Storage protection was not granted by this browser, and *Settings → Data on this device* says so |
| Back and Forward in a real top-level page (`history.back()` / `history.forward()`) | Two navigations; a sheet opened; Back; Back; the in-app back arrow; Forward; a question opened; Back | Back with a sheet open closed the sheet and stayed on the screen; the next Back went to the previous screen; the arrow and the browser history agreed throughout; Back with a question open answered it "cancel" and stayed |
| Click-through at phone size (375 × 812 px emulation, real pointer clicks) | Command Center → *Resume audit* card → audit screen → *Functional Testing* → a result button tapped and tapped back → **NEW** | Layout as designed; the tapped result was in the database 164 ms later with nothing pending; the *New* sheet opened inside the screen with its six actions |

## 6. Independent review

Ten reviewers each read the code for one concern (data and rules, audit screens, management screens, export,
runtime, generated files, security, SQL, requirements 1–9, requirements 10–19). A second, separate agent then tried
to disprove each finding against the source.

| | Count |
|---|---|
| Findings raised | 98 |
| Confirmed by the verifier | 58 |
| No longer reproducible when re-checked — the fix was already in the working tree | 39 |
| Could not be settled by reading (device behaviour) | 1 |

Examples of defects found this way and fixed, each now covered by a test: a form that lost focus after every
keystroke; open editors drawn over the lock screen; a backup carrying session tokens; restored rows trusted
verbatim (markup injection through the renderer); export baseline skipping records after a partial export;
"fully verified" audits never re-validated; clock-based conflict resolution; every sign-in re-sending every record;
server timestamps not recognised by the client; the passcode removable without the passcode.

Confirmed findings that were **not** changed in code, and why:

| Finding | Decision |
|---|---|
| Two devices sending new records at the same moment can keep the same human-readable code | Documented residual risk ([SECURITY.md](SECURITY.md) §4). The UUID is the key; a server-side unique index was rejected because it would abort synchronisation for both devices |
| Daily-export CSV files are not formula-escaped | Deliberate: they are interchange data. Stated in the manifest, the analysis instructions and [SECURITY.md](SECURITY.md) §3.7 |
| Annotation redraw performance on a real phone | Cannot be judged without the device; the drawing surface is prepared once per stroke session |

## 7. Not tested — and what to do about it

| Gap | Why | Required before relying on it |
|---|---|---|
| `supabase/schema.sql` has never been executed | No database service or credentials where this was built | [DEPLOYMENT.md](DEPLOYMENT.md) §3.6, lines 1–10 |
| Cloud sync against a real workspace | Same | [DEPLOYMENT.md](DEPLOYMENT.md) §3.6, lines 11–14 |
| Physical iPhone: camera capture, annotation with a finger, *Add to Home Screen*, storage protection, *Save to Files*, Safari's handling of large ZIP files | No device attached | [DEPLOYMENT.md](DEPLOYMENT.md) §6 on the device model that will be used |
| Hosting templates in `deploy/` | No hosting account | Same §6 |
| Very large data sets | The largest run was the demo environment plus test records (about 900 records and fewer than 20 photographs) | Export is built in memory; photographs dominate. Try a full-day package on the real device before the first long audit day |
| Two real people editing at once | Simulated with mock workspaces | §3.6 lines 11–12 |
| Screen readers and other assistive technology | Not exercised | Accessibility review if required |
| Browsers other than a Chromium engine | Not exercised | Safari on iOS is the target: covered by the device acceptance test |

Requirement-by-requirement status is in [REQUIREMENTS.md](REQUIREMENTS.md).
