# Loading a room list

How to bring a list of rooms into the application in one step: **Buildings & Floors → Import room list**.
The list is a CSV file with one line per room. A header-only template is in
[room_list_template.csv](room_list_template.csv); the same file can be saved from the import screen.

A room list contains real site information. Load it only into a copy of the application that has been approved
for that information ([SECURITY.md](SECURITY.md)).

## 1. The file

- CSV with a header line. Comma, semicolon or tab separated; quotes around values that contain the separator.
- From Excel: *File → Save As → CSV UTF-8*. `.xlsx` files are not read.
- Column order does not matter. Column names are matched without regard to case, spaces, dashes, underscores or
  full stops. A column's own name is matched before the other accepted names, and each is used once.
- Values are compared as written apart from case and extra spaces: room 10.1 is not room 10-1.

| Column | Also accepted | Needed | Notes |
|---|---|---|---|
| Building | Building name, Site, Location | Yes | Matched to an existing building by name; created if there is none |
| Building ID | Building identifier, Site ID, Building code | No | If given, it must agree with the building's ID; a line that disagrees is not imported |
| Address | Building address | No | Used only when the building is created |
| Floor | Floor number, Level, Floor no | Yes | Matched to an existing floor of that building; created if there is none |
| Floor designation | Floor name, Floor description | No | Used only when the floor is created |
| Area | Zone, Wing, Suite | No | Created on the floor if it does not exist |
| Room number | Room no, Room #, Room ID, Number, Room | One of these two | |
| Room name | Name, Space name, Space, Room description | One of these two | |
| Room type | Type, Space type | No | Must be one of the application's room types (listed below) |
| Capacity | Seats, Seat count, Occupancy | No | Whole number |
| Criticality | Business criticality | No | Standard, High visibility, or Executive / critical (or the short forms the application stores) |
| Conferencing platform | VC platform | No | Must be one of the application's platforms |
| Control platform | AV control platform, Control system | No | Must be one of the application's control platforms |
| Notes | Comments, Remarks | No | |

Room types: Small conference room, Medium conference room, Large conference room, Executive conference room,
Boardroom, Divisible conference room, Multipurpose room, Town hall, Training room, Huddle room, Focus room,
Rack room, Support area, Other.

Any other column is ignored and named on the import screen.

## 2. What happens

1. Choose the file. Nothing is written yet: the screen shows a plan — rooms to import, rooms already present,
   lines that cannot be imported, and the buildings, floors and areas that would be created.
2. Review the lines. Each line says what will happen to it and why.
3. Tap **Import**. The list is checked once more against the records as they are at that moment, then the rooms
   are created with new room IDs. Every created building, floor, area and room gets its own entry in the change
   history, followed by one summary entry for the import.

## 3. Rules

- **Nothing is guessed.** A room type, criticality or platform that is not in the application's list, or a capacity
  that is not a whole number, is left empty. The original text is kept word for word in the room's notes, and the
  line is marked on the import screen. A room without a room type is listed as incomplete until one is chosen.
- **Nothing existing is changed.** A room with the same number on the same floor (or, with no number, the same
  name) is left exactly as it is. Importing the same list twice adds nothing.
- A line without a building, a floor, or both a room number and a room name is not imported.
- A line with more values than the header has columns is not imported (usually a comma inside a value that is not
  in quotes).
- A line is not imported when its building cannot be identified with certainty (two buildings with that name, a
  Building ID that belongs to another building) or when the building, floor or area is archived.
- A read-only account can check a list but not import it.
- A room that appears twice in the list is imported once.
- Buildings, floors and areas are created only when a room of the list needs them.
- Devices, audits and photographs are not part of a room list.

## 4. After the import

Open **Buildings & Floors**, pick a floor and check the rooms. Rooms marked incomplete need a room type.
Divisible rooms are set up as a combined configuration on the floor screen after their member rooms exist.
