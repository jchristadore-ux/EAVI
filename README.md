# AV ENVIRONMENT INTELLIGENCE

*See the environment. Understand the infrastructure. Improve the experience.*

A mobile-first, offline-first application for auditing conference-room AV environments: walk a floor with an iPhone,
audit each room, photograph the equipment, inventory every device with its network identity, run the functional
tests, record findings, and leave with a prioritised improvement backlog, reports and a structured daily export.

> **Approval.** The application, its hosting and any cloud database must pass the client's security review before real
> client infrastructure information is entered. See [docs/SECURITY.md](docs/SECURITY.md).
>
> **No demo data in the production site.** The synthetic demo environment lives in `demo/` and is used only by the
> tests and by the single-file demonstration page. The site built into `dist/site` starts empty: load the real rooms
> with *Buildings & Floors → Import room list* ([docs/ROOM_LIST.md](docs/ROOM_LIST.md)).

Version 1.0.0 · 12 November 2026

## What it does

| Area | Summary |
|---|---|
| Command Center | Figures computed from the records: audit progress, incomplete device identification, open backlog by priority, outstanding requests, alerts and suggestions |
| Buildings & Floors | Organization → Building → Floor → Area → Room → Rack → Device, including divisible rooms audited as a combined configuration |
| Room Audits | Space summary, 13 photograph categories with direct camera capture, device inventory, 52 functional tests in 5 groups, findings, an 11-point network validation checklist, notes. Autosaved; resumable; a failed test only *suggests* a finding — the auditor confirms it |
| Device Inventory | IP address, MAC address and serial number each have their own value and verification status. Missing values stay missing and are flagged; nothing is guessed |
| Infrastructure | Switches, ports, addressing, dependencies — documentation typed by people. **Nothing is scanned, probed or configured** |
| Findings & Backlog | Findings become backlog items (`AVEI-BL-001` …) with P1 / P2 / P3 and twelve statuses. Facts, interpretations, hypotheses and recommendations are kept apart; a hypothesis never becomes a confirmed root cause |
| IT Coordination | Requests to Client IT, PepperDash and vendors, drafted in the app and tracked. Nothing is sent by the application |
| Spare Equipment | Stock with risk flags (zero, below minimum, unidentified, end of life) and coverage of critical rooms |
| Reports | Eleven reports, each as PDF, CSV and Excel |
| Daily Export | A ZIP with manifest, 24 CSV files, photographs, validation report, end-of-day summary and analysis instructions; incremental exports; a 15-tab master workbook; reusable Claude Project instructions |

It is one static web application: plain JavaScript, **no third-party code**, no server of its own. Data lives in the
browser's database on the device. The default build cannot make a connection to any other server.

## Documents

| Document | For |
|---|---|
| [docs/MOBILE_GUIDE.md](docs/MOBILE_GUIDE.md) | The auditor: installing on an iPhone, auditing a room, exporting at the end of the day |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Building, hosting, the optional cloud workspace, and what is needed to go live |
| [docs/SECURITY.md](docs/SECURITY.md) | Controls, data flows, residual risks and the approvals required |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How it is built: layers, data model, device and cloud database design, synchronisation |
| [docs/EXPORT_FORMAT.md](docs/EXPORT_FORMAT.md) | The daily export package and the handoff to analysis |
| [docs/CLAUDE_PROJECT_INSTRUCTIONS.md](docs/CLAUDE_PROJECT_INSTRUCTIONS.md) | Reusable instructions for a Claude Project that maintains the master workbook |
| [docs/TEST_REPORT.md](docs/TEST_REPORT.md) | What was tested, the results, and what was not tested |
| [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) | The brief, requirement by requirement, with status and evidence |
| [docs/ROOM_LIST.md](docs/ROOM_LIST.md) | Loading a room list (CSV) into Buildings & Floors |
| [docs/GITHUB.md](docs/GITHUB.md) | Putting the project on GitHub and deploying from it (prepared, not yet done) |
| [CLAUDE.md](CLAUDE.md) | Handoff notes for the next working session: state, rules, open items |

## Run it

Requirements: Windows with PowerShell 5.1 and a current browser. Nothing to install.

```
powershell -ExecutionPolicy Bypass -File tools\serve.ps1
```

| Address | What |
|---|---|
| `http://localhost:5173/app/` | The application (development copy) |
| `http://localhost:5173/tests/tests.html` | The automated test suite (54 tests) |
| `http://localhost:5173/tests/embed.html` | The single-file build inside a frame |

Build the deployable site, the single-file page and the source package:

```
powershell -ExecutionPolicy Bypass -File tools\build.ps1
```

Then upload `dist\site\` to an approved HTTPS static host — see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Layout

```
app/          the application: index.html, css/, js/ (29 files), icons/, manifest, service worker
tests/        in-browser test suite and the pages that host it
tools/        build, development server, output validation, PDF rendering (PowerShell scripts) and the SQL generator
supabase/     schema.sql - PostgreSQL schema, row-level security and storage policies (generated; optional; never executed)
deploy/       response-header and access templates for static hosts (untested templates)
docs/         the documents listed above
dist/         build output (not in version control)
```

## Status

| | |
|---|---|
| Automated tests | 54 of 54 pass, in a real browser on a real IndexedDB database |
| Generated files | Export ZIP, CSVs, PDFs and workbooks validated by independent readers (.NET, Microsoft Excel, Windows PDF engine) |
| Offline | Verified: the built site starts and works with the server stopped |
| Hosting | **Not deployed.** No hosting account was available; the built site is ready to upload |
| Cloud sync | Implemented, off by default, tested against mock workspaces only. The SQL has never been executed |
| iPhone | **Not tested on a physical device.** Tested in a Chromium engine at 390 × 844 px |

Details and the full list of limits: [docs/TEST_REPORT.md](docs/TEST_REPORT.md) §7 and
[docs/SECURITY.md](docs/SECURITY.md) §4.
