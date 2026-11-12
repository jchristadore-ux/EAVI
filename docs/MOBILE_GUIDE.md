# Mobile Field Guide

This guide is for an auditor who uses AV ENVIRONMENT INTELLIGENCE on an iPhone while walking floors. It
covers installing the application, the set-up screen, moving around the application with one hand, auditing a room
section by section, working without a connection, the end-of-day export and backup, looking after the data held on
the phone, and the problems the application reports.

> Basis of this guide: it was written from the application code and from tests of the application in a
> Chromium-based desktop browser at a 390 × 844 px viewport, including offline with the server stopped. The
> application has not yet been exercised on a physical iPhone. Camera capture and the iOS share sheet could not be
> exercised in that browser: photograph handling was tested with image files, and the **File ready** sheet with a
> simulated share function. Confirm section 2 on the first device before relying on this guide. A checklist is at
> the end of that section.

How labels are written: labels and buttons of the application are in **bold**, with the wording of the
application. The application shows card titles and small headings in capital letters:
**Data on this device** appears as DATA ON THIS DEVICE. Labels that belong to iOS are in *italics*; their wording
can differ between iOS versions. Messages shown by the application are in quotation marks.

## Quick reference

The whole day on one page. Each line points to the section with the detail.

| Step | What to do | Section |
|---|---|---|
| Once | In Safari open the approved address, *Share* > *Add to Home Screen*. From then on open the application **only from the Home Screen icon** | 2 |
| Once | On **Set up this device** enter **Auditor name**, optionally a passcode, leave **Load the demo environment** on to practise, tap **Start** | 3 |
| Moving around | Bottom bar: **Home**, **Audits**, **NEW**, **Backlog**, **More**. **NEW** starts anything: **New Room Audit**, **Add Device**, **Take Photo**, **Record Finding**, **Create IT Request**, **Add Spare Equipment** | 4 |
| In a room | **NEW** > **New Room Audit**, or the **Resume audit** card on the Command Center. Work down the sections; the bar above the bottom navigation always offers **Photo**, **Device** and **Finding** | 5 |
| Devices | Record IP address, MAC address and serial number each with its own status. Leave what you cannot see empty: the application lists it as missing and never fills it in | 5 |
| Tests | Tap **Pass**, **Fail**, **Investigate** or **N/A**. A failed test only suggests a finding: confirm it or dismiss it | 5 |
| Saving | Nothing to do. The indicator at the top right reads "Saved" with the time. If it shows a problem, keep the application open and read section 10 | 4, 10 |
| No signal | Carry on. Everything works without a connection once the application has been opened once with one | 7 |
| End of day | **More** > **Daily Export & Data Handoff**, generate the package and save it to the approved location. Do this every day | 8 |
| Never | Do not clear Safari website data, and do not remove the Home Screen icon before exporting: both delete the records on the phone | 9 |

## 1. Before the first visit

### 1.1 Approval status

The application has not been approved by client security. It must be approved, together with its hosting, before
any real client infrastructure information is entered. Until then:

- Do not type real device names, IP addresses, MAC addresses, serial numbers, or switch and port details.
- Do not photograph client equipment, labels, screens or documents with the application. A photograph is
  infrastructure information too.
- Work only with the demo data and with invented values.

The application states the same rule under the title **Approval required before production use**, on the set-up
screen and in **Settings**. The approvals that are required are listed in [SECURITY.md](SECURITY.md).

### 1.2 The address

- The application must be served from an approved HTTPS address. The person who deploys it gives you that address;
  see [DEPLOYMENT.md](DEPLOYMENT.md).
- The application needs HTTPS for two of its own functions: keeping an offline copy of itself on the phone, and the
  passcode lock. On an address without HTTPS neither is available.
- Use the site at its own address. A copy shown inside another page cannot be installed to the Home Screen or used
  offline. The last line of **Settings** > **Use on iPhone** states which kind of copy is running.

### 1.3 Practise with the demo data

Work through sections 3 to 8 with the demo data before the first real visit.

| Demo data | Detail |
|---|---|
| How to load it | Leave **Load the demo environment** on at set-up. Later: **Settings** > **Demo data** > **Load demo environment**. |
| What it is | Synthetic records: the building "1 Demonstration Plaza", floors 21 to 23, eight rooms, one combined configuration, devices, audits, pictures, findings, backlog items, coordination requests and spare equipment. |
| How it is marked | Demo records carry a **DEMO** label in lists and screen titles. While demo records are loaded, a **DEMO DATA** banner is shown under the top bar. Serial numbers start with "DEMO-". So do the device hostnames, with one exception ("zoomroom-22b"). IP and MAC addresses come from ranges reserved for documentation. The pictures are generated images, not photographs. |
| Starting points | Room 22A has an audit in progress. Room 22B has a completed audit with failed tests. Rooms 21B, 22C, 22 IDF, 23A-N and 23A-S have no audit yet. |
| How to remove it | **Settings** > **Demo data** > **Remove all demo data**. The confirmation lists any records of your own that were created inside the demo environment (an audit of a demo room, a device added to one, its photographs). They are removed with it. |

### 1.4 What the application does not do

- It does not read values from photographs. There is no OCR. Type every value yourself.
- It does not scan, probe or discover anything on the network, and it does not configure devices.
- It does not call any external AI service.
- In the default build the browser refuses every connection from the application to any other server. Records leave
  the phone only in files that you export and save yourself (section 8).

## 2. Install it on the iPhone

### 2.1 Install

Do these steps once, with a connection.

1. Open the address in Safari. If the hosting asks you to sign in first, sign in. That sign-in belongs to the
   hosting, not to the application; see [DEPLOYMENT.md](DEPLOYMENT.md).
2. If the page shows **Set up this device**, do not fill it in. Set-up is done later, in the installed app.
3. Tap *Share*, then *Add to Home Screen*, then *Add*. The page declares the icon name "AV Intelligence".
4. Close the Safari tab.
5. Open the application from the new Home Screen icon and complete the set-up there (section 3).
6. From now on, always open the application from the Home Screen icon. Do not work in a Safari tab.

### 2.2 Why always the Home Screen icon

| Reason | Explanation |
|---|---|
| Separate storage | On iOS the Home Screen app and Safari keep separate storage. Records made in one are not visible in the other. An audit entered in a Safari tab does not appear in the Home Screen app, and the reverse. |
| Storage is less likely to be cleared | Safari can clear the data a site has stored, for example when the phone runs low on space or the site has not been used for a long time. An application installed to the Home Screen is far less likely to have its storage cleared by the system. This reduces the risk. It does not remove it. Export every day (section 8). |
| It opens without a connection | The installed app opens without a connection once it has been opened once with one. Open it from the icon while connected before you go to site. |
| Full screen | The installed app runs full screen, without the Safari address bar. |

### 2.3 Check storage protection

After set-up, check the storage-protection line once.

1. Tap **More**, then **Settings**.
2. In the card **Data on this device**, read the line **Protected from automatic clearing**.

| Value shown | Meaning | What to do |
|---|---|---|
| **Yes** | The browser has granted protected storage to the application. | Nothing more. Keep exporting every day. |
| **Not granted** | The browser has not granted it. The card adds: "The browser may clear this site's data if the device runs low on space or the site is unused for a long time. Install the app to the home screen, request protected storage, and export daily." | Follow the steps below. |
| **Unknown** | The browser did not report a status. No button is offered. | Treat it as **Not granted**: export and save a backup every day. |

If the value is **Not granted**:

1. Check that you are in the installed app. The card **Use on iPhone** ends with "Running as an installed app." If it
   ends with "Running in a browser tab.", you are in Safari: go back to section 2.1.
2. Tap **Request protected storage**.
3. If the message is "Storage is now protected", the line changes to **Yes**.
4. If the message is "Not granted. Installing to the home screen usually enables it.", the application works in the
   same way as before. The only difference is how likely the system is to clear its storage. Export and save a
   backup at the end of every day without exception, and tell the person responsible for the deployment.

The application asks for protected storage once by itself when you tap **Start** at set-up. The same line and button
are in the **Data status** sheet, which opens when you tap the save indicator (section 4.6). There the value reads
**Yes**, **Not granted by the browser** or **Unknown**.

### 2.4 Confirm on the first device

| Check | Expected result |
|---|---|
| Open the application from the Home Screen icon. | It opens full screen. **Settings** > **Use on iPhone** ends with "Running as an installed app." |
| Read **Protected from automatic clearing**. | Note the value and follow section 2.3. |
| Switch on *Airplane Mode*, close the application and open it again from the icon. | It opens. The top bar shows **Offline**. A demo audit can be edited and the save indicator returns to **Saved** with a time. |
| In a demo audit, open **Photos** and tap **Take photo**. | The camera opens. After the picture is taken the message "Photograph saved · Room overview" appears and the photograph is in the gallery. |
| Run a Daily Export (section 8). | The **File ready** sheet appears. **Share / Save to Files** opens the iOS share sheet. With *Save to Files* the ZIP file is stored and can be found in the Files app. |
| Close the application completely and open it again. | The records and photographs are still there. |
| Open the address in a Safari tab. | **Set up this device** is shown, not the records of the installed app. Leave it without filling it in. |

Write down the results. Report any difference to the person responsible for the deployment before the first real
visit.

## 3. First start

### 3.1 The set-up screen

The first screen in the installed app is **Set up this device**.

| Field | Required | Notes |
|---|---|---|
| **Auditor name** | Yes | Recorded on audits, reports and exports. |
| **Email (optional)** | No | Used for report attribution. |
| **Passcode lock (optional)** | No | At least 6 characters. Offered only on an HTTPS address. |
| **Repeat passcode** | Only with a passcode | Must match the passcode. |
| **Load the demo environment** | No | A switch, on when the screen opens. It loads the synthetic demo data (section 1.3). |

Below the fields the screen shows the notice **Approval required before production use**. Tap **Start**. The
application opens on **Command Center**.

| Message | Cause |
|---|---|
| "Enter the auditor name that should appear on audits and reports." | **Auditor name** is empty. |
| "The two passcode entries do not match." | **Passcode lock (optional)** and **Repeat passcode** differ. |
| "Use at least 6 characters for the passcode." | The passcode is too short. |

The name, the email and the passcode can be changed later in **Settings**, in the cards **Auditor profile** and
**Security**.

### 3.2 The passcode

What it is:

- An app lock. The application asks for the passcode every time it starts, after a period with no tap or key press,
  and when you tap the lock icon in the top bar.
- Adjustable. **Settings** > **Security** > **Lock after inactivity** offers 2, 5, 15 and 30 minutes and 1 hour. It
  is 15 minutes until you change it.
- Protected against casual change. **Change passcode** and **Remove passcode** need the current passcode.
- Stored only as a derived value (PBKDF2-SHA-256, 210 000 iterations, random salt). The passcode itself is not
  stored and is not part of a backup.

What it is not:

- It is not encryption. The application does not encrypt the records and photographs it stores on the phone.
  Protection of stored data relies on the iPhone's own passcode and encryption. Keep the iPhone passcode enabled.
- It cannot be recovered or reset. If it is forgotten, the only way back in is **Erase local data…** on the lock
  screen, which deletes every record and photograph on the device.
- It does not protect files that have left the application. Exports, reports and backups are ordinary files and
  are not encrypted.
- It does not prevent erasure. **Erase local data…** on the lock screen works without the passcode.
- It does not limit attempts. The application does not count wrong entries.

When the application locks while you are working, whatever was open is kept and is there again after you unlock.
Without a passcode, anyone who can unlock the iPhone can open the application.

## 4. Finding your way with one hand

### 4.1 The screen

| Area, top to bottom | Contents |
|---|---|
| Top bar | The application mark: the **Organization name** from **Settings** in capitals, or AV ENVIRONMENT INTELLIGENCE when none is set (tap it to go to **Command Center**), **Offline** when the phone reports no connection, the save indicator, and a lock icon when a passcode is set. |
| Banners | **DEMO DATA** while demo records are loaded; **Manage** opens **Settings**. A red banner with the reason when a save has failed. |
| Content | The current screen. It scrolls. The bars do not. |
| Bottom navigation | Five buttons within thumb reach. |

### 4.2 Bottom navigation

| Button | Opens |
|---|---|
| **Home** | **Command Center**: **Resume audit** cards for audits in progress, overview figures, audit progress by floor, recent activity and alerts. |
| **Audits** | **Room Audits**: the floors, the rooms and the state of each room's audit. |
| **NEW** | The sheet **New** with the quick actions (section 4.3). |
| **Backlog** | **Findings & Backlog**. |
| **More** | The sheet **All sections**. |

**More** lists every section: **Command Center**, **Buildings & Floors**, **Room Audits**, **Device Inventory**,
**Infrastructure**, **Findings & Backlog**, **IT Coordination**, **Spare Equipment**, **Reports**,
**Daily Export & Data Handoff** and **Settings**.

### 4.3 The NEW button

**NEW** opens the sheet **New**. On an audit screen or a room screen, its subtitle names the current space and the
actions apply to that space.

| Action | On an audit or room screen | Anywhere else |
|---|---|---|
| **New Room Audit** | Opens the picker **Start or resume a room audit**. Choose a floor, then a room or a combined configuration. An audit in progress is resumed. Otherwise a new audit is started. | The same. |
| **Add Device** | Opens **Add device** for the current space. | Asks for the room first (**Add a device to…**). |
| **Take Photo** | Opens the camera. The photograph is saved to the current space. | Asks **Photograph which room?**, then opens **Take photos** with **Open camera** and **Library**. |
| **Record Finding** | Opens **New finding** with the current space filled in. | Opens **New finding** with no location. |
| **Create IT Request** | Opens **New coordination request** with the current space filled in. | Opens it with no location. |
| **Add Spare Equipment** | Opens **New spare equipment**. | The same. |

### 4.4 Sheets and editors

- Editors, pickers and menus open as a sheet anchored to the bottom of the screen.
- Close a sheet with the X at its top right, with **Done**, or by tapping the dimmed area above it.
- Editors save every change as you type. There is no save button.
- A new record has **Discard** at the bottom left. An existing record has **Delete** there, where deletion is
  allowed.
- Most editors do not close while a required field (marked with an asterisk) is empty. They show "Complete the
  required fields: …". Closing a new record in that state with the X or the dimmed area asks
  **Discard this new record?** with **Keep editing** and **Discard**.
- The device editor always closes. Missing values are flagged instead (section 5.4).

### 4.5 The back arrow

- It is the left-pointing arrow at the top left of an audit, a floor, a room, a backlog item and a report preview.
- It returns to the screen you came from. Straight after the application has been reopened on a remembered screen,
  it returns to **Command Center**.
- The application remembers the screen you were on for 12 hours and reopens there.

### 4.6 The save indicator

The indicator in the top bar reports the result of the actual write to the phone's storage.

| Indicator | Meaning | What to do |
|---|---|---|
| **Saving…** | A change is waiting to be written, or is being written. | Nothing. |
| **Saved** and a time | The last write was confirmed at that time. | Nothing. |
| **Saved on device** | No change has been written since the application was opened. | Nothing. |
| **Save problem** | A write failed. A red banner gives the reason. The change is held in memory and the application retries by itself. | See section 10. |
| **Not persisted** | The phone's storage is unavailable. Records exist in memory only and are lost when the application closes or reloads. | See section 10. |

If a cloud workspace is ever enabled, the indicator also reads **Saved · synced**, **Saved · offline**,
**Saved · sync issue**, or **Saved ·** with the number of changes still to sync. In each case the change is already
saved on the phone.

Tap the indicator to open **Data status**. It shows **Storage**, **Last write confirmed**, **Writes waiting**,
**Protected from automatic clearing**, **Space used** (when the phone reports it), **Cloud sync** and
**Last export**, and has the button **Open Daily Export**.

When the application goes to the background or is closed, it starts writing any change that is still waiting.

## 5. Auditing a room, step by step

The order of work for one room, in the order of the screen:

1. **Audits** > floor > room.
2. **Space Summary**: fill in every field.
3. **Device Inventory**: add each device and record its serial number, IP address and MAC address, each with its
   status.
4. **Functional Testing**: give every test a result and decide on every suggested finding.
5. **Photos**: take at least the room overview.
6. **Findings**: record what the tests did not already raise.
7. **Network Validation**: answer every check.
8. **Audit Notes**: add your notes.
9. **Mark audit complete**, or **Mark fully verified** when nothing is outstanding.

Everything you enter is saved as you go. There is nothing to submit at the end of a section.

### 5.1 Choose the building, floor and room

The quickest route is the **Audits** button.

1. Tap **Audits**. The screen **Room Audits** opens.
2. Tap the floor in the row of floor buttons at the top (**Floor 21**, **Floor 22** and so on). If more than one
   building is recorded, each button starts with the building name. The application remembers the last floor used.
3. Find the room in the list. Each row shows the room, a status line and a state.
4. Tap the room.

| State on the row | Meaning | Tapping the row |
|---|---|---|
| **Not started**, with **Start** | The room has no audit. | Starts a new audit and opens it. |
| **In progress** | An audit is open. The row shows its progress. | Opens that audit. |
| **Audited** | The latest audit is complete but not fully verified, or its verification has lapsed. | Opens that audit. It does not start a new one. |
| **Fully verified** | The latest audit is fully verified. | Opens that audit. It does not start a new one. |

Below the rooms, the screen lists **Combined configurations** (rooms that can be joined and are audited as one
space) and **Recent audits**.

Other routes:

| Route | Use |
|---|---|
| **Home** > a **Resume audit** card | Returns to one of the three most recently started audits in progress. |
| **Home** > **Start a room audit** (shown as **New audit** when an audit is already in progress), or **NEW** > **New Room Audit** | Opens the picker **Start or resume a room audit**. Choosing a room with no audit in progress starts a new audit at once, also when the room was audited before. |
| **More** > **Buildings & Floors** > floor > room | Opens the room page with **Start audit**, **Resume audit** or **Start a new audit**. |
| The three-dot button on an audit > **Start another audit of this space** | Starts a further audit of a room that already has one. The earlier audit stays in the history. |

If the room is not in the list: **More** > **Buildings & Floors** > the floor > **Add room**. **Room number**,
**Room name** and **Room type** are required. **Add building** and **Add floor** are on the **Buildings & Floors**
screen.

Starting an audit creates the audit with today's date, your auditor name and the status **In progress**, together
with 52 functional tests and 11 network validation checks, all unanswered.

### 5.2 The audit screen

| Part | Contents |
|---|---|
| Header | The back arrow, the building and floor, the room, the audit ID, date and auditor, the status, and a three-dot button. |
| Progress | A percentage and a bar. The percentage is the average of five parts: space summary, devices, functional tests, network validation and photographs. The photograph part is complete with the first photograph. |
| Sections | Seven sections, closed when an audit is first opened. Tap a section title to open it. Opening one closes the others. |
| **Finish this audit** | What is still outstanding, with **Mark audit complete** and **Mark fully verified**. |
| Bottom bar | **Photo**, **Device** and **Finding**. It stays visible above the bottom navigation. |

The sections, in the order the screen presents them:

| # | Section | The label on its title shows |
|---|---|---|
| 1 | **Space Summary** | Fields filled out of the total, or **Complete**. |
| 2 | **Device Inventory** | Devices verified out of the total, **None recorded** or **None in this space**. |
| 3 | **Functional Testing** | Tests answered out of the total, and the number failed. |
| 4 | **Photos** | The number of photographs captured. |
| 5 | **Findings** | The number of findings, and of suggested findings awaiting a decision. |
| 6 | **Network Validation** | The percentage of checks resolved, and the number of issues. |
| 7 | **Audit Notes** | The number of notes. |

The sections can be worked in any order. Sections 5.3 to 5.9 follow the screen order.

The three-dot button offers, depending on the audit: **Open room page**, **Room audit report**, **Reopen audit**,
**Start another audit of this space** and **Delete this audit**. Deleting an audit removes its test results, network
checks and notes. Photographs, devices and findings stay with the room.

### 5.3 Space Summary

- The first lines (**Building**, **Floor**, **Area**, **Room**, **Room identifier**) are for reference.
  **Edit room name, area or criticality** opens the room editor.
- Fill in the nine room fields: **Room type**, **Capacity**, **Primary conferencing platform**,
  **AV control platform**, **DSP platform**, **Room scheduling platform**, **Display configuration**,
  **Camera configuration** and **Microphone configuration**.
- Check the three audit fields: **Audit date**, **Auditor** and **Current operational status**.
- All twelve are needed before the audit can be fully verified. Empty ones are marked "Required" after you tap
  **Show what is still outstanding**.
- The nine room fields belong to the room, not to this audit. Values recorded earlier are already there. A change
  made here changes the room record.
- For a combined configuration the section asks for **Combined capacity** and **How the spaces combine**, then the
  three audit fields. The member spaces are listed below, each with an **Edit** button.

### 5.4 Device Inventory

The section lists every device recorded for the room, including devices recorded during earlier audits. Each row
shows the device, its type, three markers (**IP**, **MAC**, **Serial**) coloured by state, the identifiers that are
missing, and one of these labels:

| Label | Meaning |
|---|---|
| **Incomplete** | At least one of IP address, MAC address and serial number is missing. |
| **Check format** | An IP address or a MAC address does not have a valid form. |
| **Unverified** | A value is recorded but not verified. |
| **Details missing** | The type, manufacturer or model is empty, or the hostname of a network device. |
| **Verified** | Nothing is outstanding. |

To add a device:

1. Tap **Device** in the bottom bar, or **Add device** in the section.
2. In the sheet **Add device**, search for the device type or tap it. A type that is not listed can be added as a
   custom type.
3. The editor opens and the device now exists. To remove a device added by mistake, tap **Discard** before you
   close the editor. Closing the editor keeps the device, even if nothing was filled in.
4. Fill in **Manufacturer**, **Model** and **Hostname / device name**, then the three identification fields.

The three identification fields are **Serial number** (under **Physical identification**), **IP address** and
**MAC address** (under **Network identity**). Each one has its own value box, its own status list and its own state
label.

The status list offers **Verified onsite**, **Verified from management system**, **Awaiting IT confirmation**,
**Awaiting vendor confirmation**, **Unknown** and **Not applicable**. A new device starts with **Unknown** in all
three fields.

| State label | Shown when | Effect |
|---|---|---|
| **Missing** | The value box is empty and the status is not **Not applicable**. | The device is flagged incomplete. A follow-up task is created. |
| **Recorded — not verified** | A value is present and the status is **Awaiting IT confirmation**, **Awaiting vendor confirmation** or **Unknown**. | The device is identified but not verified. |
| **Verified** | A value is present and the status is **Verified onsite** or **Verified from management system**. | The field is complete. |
| **Not applicable** | The status is **Not applicable**. | The field is complete. No value is expected. |

A verified status without a value is still **Missing**.

How **Not applicable** works:

- Choose **Not applicable** in the status list of the field. The value box is emptied and disabled.
- Use it only when the device cannot have that identifier, for example a device with no network interface.
- When both **IP address** and **MAC address** are **Not applicable**, the application treats the device as not
  network-connected. It then does not ask for a hostname, a switch port or a firmware version.
- To reverse it, choose another status and type the value again.

When a value looks wrong, the application flags it. It does not correct it, and it never fills in a value.

| Situation | What the application does |
|---|---|
| The IP address does not have a valid form. | Shows "This does not look like a valid IP address." under the field. The value stays as typed. |
| The MAC address does not have 12 hexadecimal digits. | Shows "A MAC address has 12 hexadecimal digits." under the field. No digit is changed or added. |
| A MAC address is typed without separators, with other separators or in lower case. | Rewrites only the separators and the letter case: 00005e005301 becomes 00:00:5E:00:53:01. No digit is changed. Text that contains anything else, or more than 12 digits, is left exactly as typed and flagged. |
| The same IP address, MAC address, serial number, hostname or switch port is recorded on another device. | Shows the note **Conflicting value** in the editor of each of the devices. Both records stay as they are. The note states that neither is assumed correct. |
| An identifier is left empty. | Shows **Missing**. The device stays in the inventory. Nothing is assumed. |

A wrong format or a conflict never prevents saving. A device with a wrong format is labelled **Check format** and
does not count as verified.

Follow-up tasks:

- The application creates a follow-up task for each missing IP address, MAC address and serial number. It also
  creates one for a network device with no **Switch port** recorded and, except for a display, with no
  **Firmware version** recorded.
- A task closes by itself when the value is recorded or the field is marked **Not applicable**.
- Tasks are listed in the device editor and under **More** > **Device Inventory**. **Draft request** turns a task
  into a draft coordination request (section 6).

Other points:

- Evidence photographs: in the device editor, below the fields, the group **Photographs of this device** has
  **Photo of label** and **Rear panel**. They open the camera and link the photograph to the device. **Upload**
  takes an image from the library.
- A room with no AV devices: while the list is empty, the section shows the switch
  **This space has no AV devices to inventory**. Turn it on only after checking the room, the table and any rack.
- In an audit of a combined configuration, **Device** first asks **Which space holds the device?**

### 5.5 Functional Testing

- The 52 tests are grouped in five categories: **AUDIO** (11), **VIDEO** (12), **CONTROL** (10),
  **INFRASTRUCTURE** (11) and **USER EXPERIENCE** (8).
- Tap a category to open it. Its title shows the tests answered out of the total, and the number failed or to
  investigate.
- For each test tap **Pass**, **Fail**, **Investigate** or **N/A**. Tap the selected result again to clear it.
- The pencil icon on a test opens a comment box. For **Fail** and **Investigate** the comment box opens by itself,
  with a **Photo** button for evidence. Write what you observed. Causes belong in the finding.
- The button that starts with **Add a test to** at the end of a category adds a test of your own.

Bulk results:

| Button | Effect |
|---|---|
| **Pass all untested** | Gives **Pass** to every test in the open category that has no result. Tests already answered are not changed. The application then states how many were marked and asks you to change any that did not pass. |
| **N/A all untested** | Gives **N/A** to every test in the open category that has no result. |

Use **Pass all untested** only when the remaining tests in the category were carried out and passed. It records a
result for each of them.

A failed test suggests a finding. When a test is set to **Fail** or **Investigate**, the block
**Suggested finding** appears under it with a proposed title and category. Nothing has been recorded at that point.
You must choose one of two buttons:

| Button | Effect |
|---|---|
| **Record finding** | Creates the finding and links it to the test and the audit. The comment on the test becomes the observed evidence of the finding. Without a comment, a standard sentence naming the test and its result is used. Photographs taken on the test are linked to the finding. The block then shows the finding ID and **Add to backlog**. |
| **Dismiss** | Records that no finding is wanted for this test. **Undo** brings the suggestion back. |

Write the comment before you tap **Record finding**. Until one of the two buttons has been used, the audit cannot
be fully verified and the **Findings** section shows a warning. A recorded finding is not in the backlog until you
add it (section 6).

### 5.6 Photos

1. Under **Category for the next photo**, tap the category. The row scrolls sideways. **Room overview** is
   selected until you choose another.
2. Tap **Take photo** or **Upload**.
3. The message "Photograph saved" with the category confirms that the photograph is stored. It appears in the
   gallery under its category.

The categories are **Room overview**, **Display(s)**, **Camera(s)**, **Microphone(s)**, **Touch panel**,
**Table connectivity**, **Rack overview**, **Rack elevation**, **Device rear panels**, **Equipment labels**,
**Cable terminations**, **Network switches** and **Other**.

| | **Take photo** | **Upload** |
|---|---|---|
| Source | The camera. The application asks the phone for the rear camera. | Images that are already on the phone, chosen in the phone's own picker. |
| How many | One photograph each time. | Several images can be chosen at once. |
| Other files | Not applicable. | A file that is not an image is skipped with a message. |

- If iOS asks for camera access the first time, allow it.
- The capture time stored with a photograph is the file date that the phone reports, or the time of saving if it
  reports none.
- **Photo** in the bottom bar opens the camera and uses the category last chosen in this section.
- The line that starts with "Not yet captured:" lists the categories that have no photograph yet. It is a
  reminder. One photograph is enough for full verification.
- Take audit photographs from inside the audit. A photograph taken for a room that has no audit in progress is
  stored with the room and does not count towards an audit.

Tap a photograph to open it:

| Control | Effect |
|---|---|
| **Category**, **Linked device**, **Description (optional)** | Change the category, link the photograph to a device of the room, describe what it shows. |
| **Rotate** | Turns the picture a quarter turn clockwise each time. |
| **Annotate** | Draw on the picture with a finger, in one of four pen colours. **Undo** removes the last stroke. **Save annotation** keeps the drawing. **Cancel** drops it. |
| **Revert to original** | Shown once the picture has been rotated or annotated. Removes all rotation and annotation. |
| **Save file** | Offers the picture shown as a file, in the **File ready** sheet (section 8.2). |
| **Delete** | Removes the photograph from galleries and future exports, after confirmation. |
| The arrows at the sides | Previous and next photograph. |

What "original" means:

- The original is the file exactly as the camera or the library delivered it. It is stored unchanged. The
  application never alters it.
- **Rotate** and **Annotate** write one separate edited copy. Galleries and the viewer show the edited copy once it
  exists. The viewer then shows the line **Edits**, and the thumbnail carries a pencil mark.
- The edited copy is a JPEG and can have fewer pixels than the original: at most 3000 px on the longest edge after
  rotation, and 2048 px after annotation.
- The line **Original file** shows the name, size and pixel dimensions of the original.
- A Daily Export at **Original quality** packages the original file unmodified, and the edited copy as a second
  file.

Values are never read from photographs. Type them yourself.

### 5.7 Findings

The section lists the findings recorded for this audit and has the button **Record finding**. A warning is shown
while suggested findings from failed tests await a decision. Working with findings is covered in section 6.

### 5.8 Network Validation

This section is documentation only. Nothing is scanned or probed. The application has no function that contacts a
device, a switch or any other network equipment. You record what you observed or what Client IT confirmed.

- There are 11 checks, from **Device addressing verified** to **Security requirements reviewed with IT**.
- For each check tap **Verified**, **Issue**, **Awaiting IT** or **N/A**. Tap the selected answer again to clear it.
- **N/A all unchecked** gives **N/A** to every check that has no answer.
- Some checks show a line that starts with "Recorded:", for example how many networked devices have a verified IP
  address. The figure is counted from the device records typed in this application. It is not a measurement of the
  network.
- **Issue** and **Awaiting IT** open a comment box. **Awaiting IT** also offers **Draft IT request**, which opens a
  draft coordination request for Client IT with the check filled in. After that, the button shows the request ID
  and status.
- A check is resolved only when it is **Verified** or **N/A**. A check left at **Issue** or **Awaiting IT** stays
  open and prevents full verification.

### 5.9 Audit Notes

1. Choose the kind of note: **Observed fact**, **Auditor interpretation**, **Unverified hypothesis** or
   **Recommended action**.
2. Type the note.
3. Tap **Add note**. Text left in the box is not saved until you do.

**General audit notes**, at the bottom of the section, is a free text field that saves as you type. Notes are not
required for full verification.

### 5.10 Complete, fully verified, and verification lapsed

The card **Finish this audit** lists what is outstanding and has two buttons.

| | **Mark audit complete** | **Mark fully verified** |
|---|---|---|
| Available | At any time while the audit is in progress. | Only when nothing is outstanding. It is greyed out until then. |
| What it states | The visit to this room is finished. Outstanding items may remain. | Every mandatory item is recorded. |
| Status of the audit | **Complete** | **Fully verified** |
| State of the room in lists | **Audited** | **Fully verified** |
| Afterwards | Everything can still be edited. **Reopen** returns the audit to in progress. | The space summary, the test results, the network checks and the existing notes are locked. **Reopen audit** unlocks them. |

Mandatory for **Mark fully verified**:

1. Every field of **Space Summary** is filled.
2. At least one device is recorded, or **This space has no AV devices to inventory** is on.
3. Every device is **Verified**: each of the three identifiers verified or **Not applicable**, valid formats, and
   the type, manufacturer, model and (for a network device) hostname filled.
4. Every functional test has a result. **N/A** counts.
5. Every test set to **Fail** or **Investigate** has a recorded finding or a dismissed suggestion.
6. Every network validation check is **Verified** or **N/A**.
7. At least one photograph is captured.

**Show what is still outstanding** opens the first section that has something missing. An audit that waits for
information from someone else can be marked complete on the day and fully verified later.

Verification lapsed:

- An audit that was marked fully verified is checked again every time it is shown or exported.
- If mandatory information is no longer complete, the status reads **Verification lapsed** and the audit shows the
  note **Verification has lapsed** with what is missing. Typical causes: a device was added to the room without
  its identification, a summary field was cleared, or the finding of a failed test was deleted.
- The recorded status is not changed. The room reads **Audited** in lists, and reports and exports state the lapse.
- Close the gap and the audit reads **Fully verified** again by itself. Device details can be completed directly in
  the device editor. The locked parts need **Reopen audit**, after which the audit must be marked fully verified
  again.

## 6. Findings, backlog and coordination requests in the field

A finding is an observation made in the field. A backlog item is the managed improvement record that one or more
findings lead to. A coordination request records something needed from Client IT, PepperDash, a vendor or
facilities. The application records requests. It does not send them.

| Task | Where | Notes |
|---|---|---|
| Record a finding | **Finding** in the audit's bottom bar, **Record finding** in the **Findings** section, **NEW** > **Record Finding**, or **Record finding** on a suggested finding | **Finding**, **Category** and **Observed evidence (facts only)** are required. Keep opinion in **Auditor interpretation** and a suspected cause in **Unverified hypothesis**. **Photo**, at the bottom of the editor, adds evidence. |
| Add a finding to the backlog | Open the finding, then **Add to backlog** | If a similar open item exists, the sheet **Add to backlog** lists it with **Link**, above **None of these — create a new backlog item**. Linking avoids a duplicate. |
| See the findings that are not yet in the backlog | **Backlog** > **Awaiting triage** | |
| Set a priority | Open the backlog item, then **Priority** | **P1 — High**, **P2 — Medium** or **P3 — Low**. The guidance shown is advisory. |
| Create a backlog item directly | **Backlog** > **New item** | Asks for a **Title**. |
| Dismiss a finding | Open the finding, then **Dismiss** | **Restore** brings it back. |
| Draft a coordination request | **NEW** > **Create IT Request**, **Draft IT request** on a network check set to **Awaiting IT**, or **Draft request** on a device follow-up task | **Topic**, **Requested from** and **Description** are required. The request starts with the status **Draft**. |
| Follow the requests | **More** > **IT Coordination** | Raise the request through the agreed channel yourself, then update **Status**. |

## 7. Working without a connection

Everything that happens on the phone works without a connection.

| Works without a connection | Needs a connection |
|---|---|
| Opening the application, once it has been opened once with a connection from the Home Screen icon | The first load of the application, and installing it to the Home Screen |
| Starting, editing, completing and verifying audits | Receiving a newer version of the application |
| Recording devices, findings, backlog items, coordination requests and notes | Cloud sync, if a workspace is ever enabled |
| Taking, rotating and annotating photographs | |
| Saving: every change is written to the phone's storage | |
| Reports, the Daily Export package and the backup: all are built on the phone | |

- **Offline** appears in the top bar when the phone reports no connection. Nothing else changes.
- Before you go to site, open the application from the Home Screen icon while connected. Then switch on
  *Airplane Mode* once and check that it opens.
- An export or a backup can be built and saved to the phone without a connection. Passing the file on to a network
  location needs one.

Cloud sync:

- Cloud sync is off by default. In the default build it is impossible: the security policy of the page makes the
  browser refuse every connection to another server. **Settings** > **Cloud sync** shows **No outside connections**.
- Sync is implemented, but it has been tested only against mock adapters and never against a real Supabase project.
  It may be enabled only for an approved workspace; see [DEPLOYMENT.md](DEPLOYMENT.md) and
  [SECURITY.md](SECURITY.md).
- If a workspace is ever enabled, every change is still saved on the phone first and queued. Without a connection
  the indicator reads **Saved · offline**, and the queued changes are sent when the connection returns. Signing in
  to the workspace needs a connection.

## 8. End of day

### 8.1 Daily Export

1. Tap **More**, then **Daily Export & Data Handoff**.
2. Under **What to export**, choose the scope.

| Scope | Contains |
|---|---|
| **Current day** | Today's audits with everything that belongs to them, and every record created or changed today. It is the scope selected when the screen first opens. |
| **Since last export** | Every record that has not yet been delivered in its current form, whatever day it was changed. Before the first delivery, that is every record. The application advises this scope for a hand-off that must not miss earlier changes. |
| **Date range** | The same as **Current day**, for the days from **From** to **To**. |
| **Full export** | Every record. |

**Building**, **Floor** and **Rooms** narrow the scope further.

3. Under **Photographs**, choose the quality.

| Option | In the package | Consequence |
|---|---|---|
| **Original quality** | Each original file, unmodified. An edited photograph has a second file. | The largest package. |
| **Optimized (max 2048 px)** | JPEG copies with the longest edge at most 2048 px. | The originals remain only on the phone and in a full backup. The photographs count as delivered, and **Since last export** does not send them again unless they change. |
| **Index only — no image files** | The list of photographs, without image files. | The images remain on the phone. They stay in **Since last export** until a package has carried them. |

The line under the field shows the number of photographs and their size at original quality. When that size is
above about 350 MB and **Original quality** is selected, the application warns that the package can exceed what a
phone browser can assemble in memory. It suggests **Optimized (max 2048 px)**, a narrower scope or a desktop
browser.

4. Read **Export summary** and **Export validation**. Validation reads **Passed**, **Passed with warnings** or
   **Structural errors**. Warnings are data-quality exceptions, such as incomplete records or conflicting values.
   They do not block the export and are listed in the package. **Structural errors** block it (section 10).
5. Tap **EXPORT DAILY AUDIT PACKAGE**. The button shows the progress. Keep the application open until the
   **File ready** sheet appears.

### 8.2 The File ready sheet

On an iPhone a finished file is offered in the sheet **File ready**, with the file name and the size. The same
sheet is used for the export package, the backup, reports and single photographs.

| Choice | What happens | For an export: recorded as delivered |
|---|---|---|
| **Share / Save to Files** | The iOS share sheet opens. Choose *Save to Files*, *AirDrop* or another approved destination. | Yes, when the share sheet reports that the file was handed over. |
| **Download** | A browser download of the file is started. | Yes, as soon as the download is started. The application cannot confirm that the file arrived. |
| Closing the sheet with the X, or with a tap above the sheet | Nothing is saved. | No. |

- Use **Share / Save to Files**. **Download** is the fallback.
- Cancelling the iOS share sheet returns you to **File ready**. Nothing has been recorded. Choose again.
- If the sheet shows "Sharing is not available for this file here. Use Download instead.", tap **Download**.

What cancelling means for an export:

- Nothing is recorded as delivered. The card **Package ready** shows a message that starts with "The file was not
  saved." and the buttons **Save package** and **Share / Save to Files**. In **Export history** the export is
  marked **Not saved**.
- The records are unaffected. They are still part of the next **Since last export**.
- The package is kept only while the application stays open. If the application was closed before the file was
  saved, run the export again.

After a successful delivery:

- A message confirms that the audit package was exported. **Package ready** shows **Export ID**, **File**, **Size**,
  **Contents** and **Validation**, with a note that starts with "Delivered."
- Check that the file is where you saved it. The file name has the form
  `AVEI_AV_Audit_Export_2026-11-12_EXP-01.zip`. It starts with the **Record ID prefix**, which is AVEI unless it
  was changed in **Settings**.
- If the file is not there, tap **The file did not arrive — void**, then **Void export**. The records of that
  package are then included in the next **Since last export**. Only the most recent delivery can be voided. An
  older package is produced again with **Repeat** in **Export history**.

The card **Claude handoff** on the same screen describes uploading a package to a Claude Project. That upload is a
separate step outside the application and needs the client's authorisation. The application itself sends nothing to
any AI service.

### 8.3 Save a backup

1. Tap **More**, then **Settings**.
2. In the card **Data on this device**, tap **Download full backup (.zip)**.
3. Save the file from the **File ready** sheet in the same way as the export.
4. A message that starts with "Backup saved:" confirms it. The file name has the form
   `AVEI_AV_Intelligence_Backup_2026-11-12.zip`.

| | Daily export package | Full backup |
|---|---|---|
| Purpose | Hand-off of the audit records for analysis and for the master workbook. | A safety copy, and moving to another device. |
| Contents | The records in the chosen scope as CSV files, the photographs, a manifest, a data dictionary, analysis instructions, a validation report and an end-of-day summary. | Every record and every photograph on the phone, originals and edited copies. |
| Can be restored into the application | No. | Yes, with **Settings** > **Restore from backup**. Records that are newer on the phone are kept. |
| The passcode | Not included. | Not included. The auditor profile is not included either. |
| Encrypted | No. | No. |

Both are ordinary files. Save them only where the security review allows; see [SECURITY.md](SECURITY.md).

### 8.4 Why export every day

- With no workspace, the phone holds the only copy of the day's records and photographs.
- The system can clear the storage of the application (section 2.2). A phone can be lost, damaged or replaced.
- A forgotten passcode can be reset only by erasing the data.
- With **Since last export**, each package contains what has not been delivered yet. A missed day is caught up by
  the next export.
- An export hands the records over. A backup is the only file that can put them back on a phone. Save both.

## 9. Looking after the data

In the default build the records and photographs exist in one place: the storage of the Home Screen app on that
iPhone.

| Rule | Reason |
|---|---|
| Always open the application from the Home Screen icon. | A Safari tab at the same address has its own, separate storage. |
| Do not clear Safari website data for the address of the application without exporting and saving a backup first. | Treat it as deleting the records. This guide does not rely on the storage of the Home Screen app being spared. |
| Do not remove the Home Screen icon without exporting and saving a backup first. | Assume that removing the installed app removes its records and photographs. |
| Export and save a backup every day. | Section 8.4. |
| One device per auditor, unless a workspace has been approved and enabled. | Two phones hold two independent sets of records. Each issues its own record IDs. Nothing merges them automatically. |
| Keep the iPhone passcode on. | The application does not encrypt stored data (section 3.2). |

Moving to another phone: save a full backup on the old phone, install and set up the application on the new one,
then use **Restore from backup**. The passcode and the auditor profile are not part of the backup. Set them on the
new phone.

Delete and remove:

- **Delete** on a record removes it from the active lists. The change history and earlier exports keep their record
  of it.
- Deleting a photograph deletes its picture from the phone: the image file, any edited copy and the thumbnail are
  removed, and the picture is left out of future exports and backups. Only a record that it existed and was deleted
  is kept. This cannot be undone, and it frees the space the picture used.
- **Remove all demo data** deletes the demo records and their image files.

What **Erase all local data…** does. It is in **Settings**, in the card **Erase this device**. It asks you to type
ERASE and then to tap **Erase everything**. It cannot be undone.

| Removed | Kept |
|---|---|
| Every record: buildings, floors, rooms, audits, devices, findings, backlog items, coordination requests, spare equipment, infrastructure records, notes and the change history | The auditor name, email and role |
| Every photograph, original and edited | The passcode lock |
| The export history and the record of what has been delivered. The next export treats every record as new. | The **Record ID prefix** |
| The record ID counters. Numbering starts again at 1. | The completed set-up. The set-up screen is not shown again. |
| Other stored settings, including **Organization name** and any workspace connection and sign-in | |

Afterwards the application restarts. Files already saved outside the application are not touched. Only the copy you
are in is erased: the Home Screen app, or a Safari tab.

**Erase local data…** on the lock screen does the same and also removes the passcode and the auditor profile. The
application then restarts at **Set up this device**.

## 10. Troubleshooting

| Symptom | Cause | What to do |
|---|---|---|
| **Set up this device** appears on a phone that was already set up. | The application found no set-up in the storage it was opened with. It was opened in Safari instead of from the Home Screen icon, the storage of the installed app has been cleared or erased, or the application could not open its storage (next row). | Do not fill in the set-up. Close it and open the Home Screen icon. If the set-up screen appears there too, the application cannot read its records on the phone: set up again. If the red banner of the next row then appears, follow that row. Otherwise use **Settings** > **Restore from backup** with the latest backup, and report it. |
| Red banner: "Device storage is unavailable in this browser session. Records will not survive a reload — export before closing." The indicator reads **Not persisted**. | The browser did not let the application open its storage. Everything entered is held in memory only. | Do not close or reload the application. Run a Daily Export and save a backup now. Then close the application completely and open it from the Home Screen icon. If the banner returns, stop entering data and report it. |
| Red banner: "Device storage is full. Export the audit package and free space — changes are held in memory." The indicator reads **Save problem**. | The phone refused a write for lack of space. | Keep the application open. Export and save a backup. Free space on the phone. The application retries by itself; wait for the indicator to return to **Saved**. |
| Red banner: "Could not write to device storage — retrying automatically." The indicator reads **Save problem**. | A write to the phone's storage failed. | Keep the application open. It retries by itself, at most 15 seconds apart. If the banner stays, export and save a backup before closing. |
| A message that starts with "Photograph not saved: The photograph could not be stored on this device". | The image file could not be written to the phone's storage. The photograph was not kept. | Free space on the phone, then take the photograph again. Export first; then deleting photographs you no longer need in the application also frees space (section 9). |
| The viewer shows "The image file for this photograph is not on this device." **Rotate**, **Annotate** and **Save file** are greyed out. | The record exists but its image file is not stored on this phone, for example after restoring a backup that did not contain the image. | Restore the full backup ZIP that contains the image, or take the photograph again. A Daily Export still runs. Its validation report lists the photograph under "Photograph references resolve to image files". |
| A photograph tile shows an icon instead of a picture. | No preview could be made, for example because the browser could not decode the image. The original file is still stored. | Open the photograph. If it does not display, take it again. |
| **EXPORT DAILY AUDIT PACKAGE** is greyed out and **Export validation** reads **Structural errors**. | A structural check failed: a record without a unique ID, or a reference that does not resolve inside the package. The application states that such a package cannot be merged reliably. | Tap the failed checks and note the records they list. Save a backup from **Settings**; a backup does not depend on export validation. Report the list. |
| A warning that the package "can exceed what a phone browser can assemble in memory", or the note **The export could not be generated**. | The warning: **Original quality** is selected and the photographs in the scope total more than about 350 MB. The note: the package could not be built. It gives the reason, for example that the archive would exceed 4 GB. | Narrow the scope with **Floor** or **Rooms** and export in several parts, or choose **Optimized (max 2048 px)**. |
| The **File ready** sheet was closed and the export reads **Not saved**. | The file was neither shared nor downloaded. Nothing was recorded as delivered. | Tap **Save package** or **Share / Save to Files** on the card **Package ready**. If the application was closed in the meantime, run the export again. |
| The export reads **Delivered** but the file cannot be found. | The hand-over was started but the file did not arrive, for example a download that was not completed. | Tap **The file did not arrive — void**, or **Void** in **Export history**. Then export again. |
| "Sharing is not available for this file here. Use Download instead." | The share sheet refused the file. | Tap **Download**, then check that the file arrived. |
| No **File ready** sheet appears and a download starts. | The browser reported that it cannot share this file. The application used an ordinary download and recorded the delivery. | Check that the file arrived. If it did not, void the export and report it. |
| The screen **Locked** appears while you work. | The application was not touched for longer than **Lock after inactivity**, the lock icon was tapped, or the application was restarted. | Enter the passcode and tap **Unlock**. Unless the application was restarted, what was open is still there. |
| "That passcode is not correct." and the passcode is lost. | The passcode cannot be recovered. | The only reset is **Erase local data…** on the lock screen, which deletes every record and photograph on the phone. Afterwards set up again and use **Restore from backup** with the latest backup. Work done after that backup is no longer on the phone. |
| The set-up screen has no passcode fields, or **Security** shows "A passcode lock needs a secure (HTTPS) connection. It is unavailable on this address." | The application is not served over HTTPS. | Do not use this address for field work. Report it to the person responsible for the deployment. |
| **Mark fully verified** is greyed out. | Mandatory information is outstanding. | Read the list in **Finish this audit** and tap **Show what is still outstanding** (section 5.10). |
| An audit reads **Verification lapsed**. | Mandatory information became incomplete after the audit was marked fully verified. | Read the note **Verification has lapsed** and close the gap (section 5.10). |
| A device is labelled **Check format**. | An IP address or a MAC address does not have a valid form. The application did not correct it. | Open the device, compare the value with the device or its label, and type it again. |
| The note **Conflicting value** on a device. | The same identifier is recorded on another device. | Check both devices on site or with IT and correct the wrong record. The application does not choose. |
| **Protected from automatic clearing** reads **Not granted**. | The browser has not granted protected storage. | See section 2.3. |
| A note typed in **Audit Notes** is missing after the application was reopened. | The text was still in the box. A note is saved only with **Add note**. | Type it again and tap **Add note**. |
| "Something went wrong" with "This screen could not be displayed. Your saved data is not affected." | The screen failed to draw. | Tap **Command Center** or **Reload**. If it happens again on the same screen, note the text shown and report it. |
| A message that ends with "Daily export packages cannot be restored; use a backup file." | A Daily Export package was chosen for **Restore from backup**. | Choose a file saved with **Download full backup (.zip)**. |
