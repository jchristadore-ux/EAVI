/* roomimport.js — load a room list (CSV) into Buildings & Floors.
 * A list is read, checked and shown as a plan before anything is written. Nothing is guessed: a value that does not
 * fit (an unknown room type, a capacity that is not a whole number) is left empty and reported, and a line that cannot
 * be placed with certainty is not imported. A room that already exists is, by default, only filled in: a field it leaves
 * empty takes the list's value and a field that already holds a value is kept. In update mode (chosen on the import
 * screen) every value the list gives replaces the room's current one. An empty cell never clears anything. */
(function () {
  'use strict';
  const EV = window.EV, U = EV.U, S = EV.S, store = EV.store, A = EV.act;
  const RI = (EV.roomImport = {});

  /* ------------------------------------------------------------------ CSV reader */
  /* Quoted fields, doubled quotes, line breaks inside quotes, CRLF, LF or CR line ends, an optional byte-order mark,
     and a comma, semicolon or tab as the separator (whichever the header line uses most). Blank lines are skipped.
     The returned array carries `lines`: the line of the file on which each row starts. */
  EV.csv.parse = function (text) {
    text = String(text == null ? '' : text).replace(/^﻿/, '');
    const first = text.split(/\r\n|\n|\r/)[0] || '';
    const count = function (ch) { let n = 0, q = false; for (let i = 0; i < first.length; i++) { if (first[i] === '"') q = !q; else if (!q && first[i] === ch) n++; } return n; };
    const sep = [',', ';', '\t'].sort(function (a, b) { return count(b) - count(a); })[0];
    const rows = [], lines = []; let row = [], cur = '', q = false, line = 1, startLine = 1;
    const endRow = function () { row.push(cur); cur = ''; if (row.some(function (v) { return String(v).trim() !== ''; })) { rows.push(row); lines.push(startLine); } row = []; };
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else { if (c === '\n' || (c === '\r' && text[i + 1] !== '\n')) line++; cur += c; }
      }
      else if (c === '"' && cur.trim() === '') { q = true; cur = ''; }
      else if (c === sep) { row.push(cur); cur = ''; }
      else if (c === '\r' || c === '\n') { if (c === '\r' && text[i + 1] === '\n') i++; endRow(); line++; startLine = line; }
      else cur += c;
    }
    if (cur !== '' || row.length) endRow();
    rows.lines = lines;
    return rows;
  };

  /* ------------------------------------------------------------------ columns */
  /* key, header written by the template, other headers accepted, meaning */
  RI.COLUMNS = [
    ['building', 'Building', ['building name', 'site', 'location'], 'Building name. Required.'],
    ['building_identifier', 'Building ID', ['building identifier', 'site id', 'building code'], 'Optional short identifier of the building.'],
    ['address', 'Address', ['building address'], 'Optional. Used only when the building is created.'],
    ['floor', 'Floor', ['floor number', 'level', 'floor no'], 'Floor number or name. Required.'],
    ['floor_designation', 'Floor designation', ['floor name', 'floor description'], 'Optional. Used only when the floor is created.'],
    ['area', 'Area', ['zone', 'wing', 'suite'], 'Optional area of the floor.'],
    ['number', 'Room number', ['room no', 'room #', 'room id', 'number', 'room'], 'Room number. A line needs a room number or a room name.'],
    ['name', 'Room name', ['name', 'space name', 'space', 'room description'], 'Room name.'],
    ['room_type', 'Room type', ['type', 'space type'], 'One of: ' + S.ROOM_TYPES.join(', ') + '.'],
    ['capacity', 'Capacity', ['seats', 'seat count', 'occupancy'], 'Whole number of seats.'],
    ['criticality', 'Criticality', ['business criticality'], 'One of: ' + S.CRITICALITY.map(function (c) { return c[1]; }).join(', ') + '.'],
    ['conferencing_platform', 'Conferencing platform', ['vc platform'], 'One of: ' + S.CONF_PLATFORMS.join(', ') + '.'],
    ['control_platform', 'Control platform', ['av control platform', 'control system'], 'One of: ' + S.CONTROL_PLATFORMS.join(', ') + '.'],
    ['dsp_platform', 'DSP platform', ['dsp'], 'One of: ' + S.DSP_PLATFORMS.join(', ') + '.'],
    ['scheduling_platform', 'Scheduling platform', ['room scheduling platform', 'scheduling'], 'One of: ' + S.SCHED_PLATFORMS.join(', ') + '.'],
    ['display_config', 'Display configuration', ['display', 'displays'], 'Free text, kept as written.'],
    ['camera_config', 'Camera configuration', ['camera', 'cameras'], 'Free text, kept as written.'],
    ['microphone_config', 'Microphone configuration', ['microphone', 'microphones', 'mic', 'mics'], 'Free text, kept as written.'],
    ['operational_status', 'Operational status', ['current operational status', 'status'], 'One of: ' + S.OP_STATUS.join(', ') + '.'],
    ['notes', 'Notes', ['comments', 'remarks'], 'Optional. Kept as written.']
  ];
  /* the room fields a list can set, with the label used on the import screen; for an existing room each is filled
     only while it is empty */
  RI.FIELDS = [['name', 'Room name'], ['room_type', 'Room type'], ['capacity', 'Capacity'], ['criticality', 'Criticality'],
    ['conferencing_platform', 'Conferencing platform'], ['control_platform', 'Control platform'], ['dsp_platform', 'DSP platform'],
    ['scheduling_platform', 'Scheduling platform'], ['display_config', 'Display configuration'], ['camera_config', 'Camera configuration'],
    ['microphone_config', 'Microphone configuration'], ['operational_status', 'Operational status'], ['notes', 'Notes']];
  const LISTED = [['conferencing_platform', S.CONF_PLATFORMS, 'Conferencing platform'], ['control_platform', S.CONTROL_PLATFORMS, 'Control platform'],
    ['dsp_platform', S.DSP_PLATFORMS, 'DSP platform'], ['scheduling_platform', S.SCHED_PLATFORMS, 'Scheduling platform'], ['operational_status', S.OP_STATUS, 'Operational status']];
  /* header names: case, and spaces, dashes, underscores and full stops between or after words, do not matter */
  const head = function (s) { return String(s == null ? '' : s).toLowerCase().replace(/[\s_\-.]+/g, ' ').trim(); };
  /* record values are compared as written, apart from case and surrounding or repeated spaces: "10.1" is not "10-1" */
  const key = function (s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase(); };
  const same = function (a, b) { return key(a) === key(b); };
  RI.template = function () { return EV.csv.encode([RI.COLUMNS.map(function (c) { return c[1]; })], { bom: true }); };

  /* ------------------------------------------------------------------ read: text -> rows with named values */
  RI.read = function (text) {
    if (String(text).indexOf('�') >= 0) throw new Error('The file is not saved as UTF-8: some characters cannot be read. In Excel, save it as “CSV UTF-8”.');
    const table = EV.csv.parse(text);
    if (!table.length) throw new Error('The file is empty.');
    const headers = table[0].map(function (h) { return String(h).trim(); });
    const map = {}, used = {}, notes = [];
    /* a header that is exactly a column's own name is bound first; other accepted names only fill what is left */
    [function (c, n) { return head(c[1]) === n || head(c[0]) === n; }, function (c, n) { return c[2].indexOf(n) >= 0; }].forEach(function (fits) {
      headers.forEach(function (h, i) {
        if (used[i] || !h) return;
        const col = RI.COLUMNS.find(function (c) { return map[c[0]] === undefined && fits(c, head(h)); });
        if (col) { map[col[0]] = i; used[i] = true; if (head(col[1]) !== head(h)) notes.push('“' + h + '” is read as ' + col[1]); }
      });
    });
    const unknown = headers.filter(function (h, i) { return h && !used[i]; });
    if (map.building === undefined || map.floor === undefined || (map.number === undefined && map.name === undefined)) {
      throw new Error('The first line must name the columns. Needed: Building, Floor, and Room number or Room name. Found: ' + (headers.filter(Boolean).join(', ') || 'nothing') + '.');
    }
    if (table.length < 2) throw new Error('The file has a header line but no rooms.');
    const rows = table.slice(1).map(function (cells, i) {
      const v = { line: table.lines[i + 1], extra: cells.length > headers.length && cells.slice(headers.length).some(function (x) { return String(x).trim() !== ''; }) };
      RI.COLUMNS.forEach(function (c) { v[c[0]] = map[c[0]] === undefined ? '' : String(cells[map[c[0]]] == null ? '' : cells[map[c[0]]]).trim(); });
      return v;
    });
    return { headers: headers, columns: Object.keys(map), unknown: unknown, headerNotes: notes, rows: rows };
  };

  /* ------------------------------------------------------------------ plan: what the list would create */
  const oneOf = function (list, value) { return list.find(function (x) { return same(Array.isArray(x) ? x[1] : x, value) || (Array.isArray(x) && same(x[0], value)); }); };
  /* the list's values for one room, in the form the room stores them. A value that must fit a list or a type and does
     not is left out and reported in `unfit` — never replaced by a guess. */
  function convert(r) {
    const values = {}, unfit = [];
    if (r.name) values.name = r.name;
    if (r.room_type) { const t = oneOf(S.ROOM_TYPES, r.room_type); if (t) values.room_type = t; else unfit.push(['Room type', r.room_type]); }
    if (r.capacity) { if (/^\d+$/.test(r.capacity)) values.capacity = parseInt(r.capacity, 10); else unfit.push(['Capacity', r.capacity]); }
    if (r.criticality) { const c = oneOf(S.CRITICALITY, r.criticality); if (c) values.criticality = c[0]; else unfit.push(['Criticality', r.criticality]); }
    LISTED.forEach(function (p) { const val = r[p[0]]; if (!val) return; const hit = oneOf(p[1], val); if (hit) values[p[0]] = hit; else unfit.push([p[2], val]); });
    ['display_config', 'camera_config', 'microphone_config'].forEach(function (k) { if (r[k]) values[k] = r[k]; });
    if (r.notes) values.notes = r.notes;
    return { values: values, unfit: unfit };
  }
  const isEmpty = function (v) { return v == null || String(v).trim() === ''; };
  const shown = function (k, v) { if (k === 'criticality') { const c = S.CRITICALITY.find(function (x) { return x[0] === v; }); if (c) return c[1]; } return String(v); };
  /* opts.replace: an existing room takes every value the list gives, not only into empty fields ("update" mode).
     An empty cell never clears anything in either mode. */
  RI.plan = function (parsed, opts) {
    const replace = !!(opts && opts.replace);
    const buildings = store.all('buildings'), floors = store.all('floors'), areas = store.all('areas'), rooms = store.all('rooms');
    const newB = new Map(), newF = new Map(), newA = new Map(), seen = new Map();
    const out = parsed.rows.map(function (r) {
      const row = { line: r.line, source: r, status: 'new', problems: [], notes: [], kept: 0, label: (r.number + ' ' + r.name).trim() || '(no room number or name)' };
      const fail = function (msg) { row.problems.push(msg); row.status = 'error'; return row; };
      if (r.extra) return fail('The line has more values than the header has columns: check for a comma inside a value that is not in quotes');
      if (!r.building) row.problems.push('Building is missing');
      if (!r.floor) row.problems.push('Floor is missing');
      if (!r.number && !r.name) row.problems.push('Room number and room name are both missing');
      if (row.problems.length) { row.status = 'error'; return row; }
      /* the building: an existing one only when the name (and the Building ID, if given) point to exactly one */
      const byName = buildings.filter(function (x) { return same(x.name, r.building); });
      const byId = r.building_identifier ? buildings.filter(function (x) { return !!x.identifier && same(x.identifier, r.building_identifier); }) : [];
      if (byName.length > 1) return fail('More than one building is named “' + r.building + '”: give the buildings different names first');
      if (byId.length > 1) return fail('More than one building has the ID “' + r.building_identifier + '”');
      if (byId.length && byName.length && byId[0].id !== byName[0].id) return fail('Building ID “' + r.building_identifier + '” belongs to “' + byId[0].name + '”, not to “' + byName[0].name + '”');
      if (byId.length && !byName.length) return fail('Building ID “' + r.building_identifier + '” belongs to the existing building “' + byId[0].name + '”, but the list names it “' + r.building + '”');
      const b = byName[0] || null;
      if (b && r.building_identifier && b.identifier && !same(b.identifier, r.building_identifier)) return fail('Building “' + b.name + '” has the ID “' + b.identifier + '”, but the list gives “' + r.building_identifier + '”');
      if (b && b.archived) return fail('Building “' + b.name + '” is archived: restore it before importing rooms into it');
      const bKey = b ? b.id : 'new:' + key(r.building);
      if (!b) {
        const nb = newB.get(bKey);
        if (!nb) newB.set(bKey, { name: r.building, identifier: r.building_identifier, address: r.address, line: r.line });
        else {
          if (r.building_identifier && nb.identifier && !same(nb.identifier, r.building_identifier)) return fail('Building ID differs from line ' + nb.line + ' for the same building (“' + nb.identifier + '” there)');
          if (r.building_identifier && !nb.identifier) nb.identifier = r.building_identifier;
          if (r.address && !nb.address) nb.address = r.address;
          else if (r.address && !same(nb.address, r.address)) row.notes.push('Address differs from line ' + nb.line + ': the address on that line is used for the building');
        }
      }
      const f = b ? floors.find(function (x) { return x.building_id === b.id && same(x.number, r.floor); }) : null;
      if (f && f.archived) return fail('Floor ' + f.number + ' of “' + b.name + '” is archived: restore it before importing rooms onto it');
      const fKey = f ? f.id : bKey + '|' + key(r.floor);
      if (!f) { const nf = newF.get(fKey); if (!nf) newF.set(fKey, { bKey: bKey, number: r.floor, designation: r.floor_designation }); else if (r.floor_designation && !nf.designation) nf.designation = r.floor_designation; }
      let aKey = '';
      if (r.area) {
        const a = f ? areas.find(function (x) { return x.floor_id === f.id && same(x.name, r.area); }) : null;
        if (a && a.archived) return fail('Area “' + a.name + '” is archived: restore it first');
        aKey = a ? a.id : fKey + '|' + key(r.area);
        if (!a && !newA.has(aKey)) newA.set(aKey, { fKey: fKey, name: r.area });
      }
      row.where = { bKey: bKey, fKey: fKey, aKey: aKey };
      /* a room is the same room when it has the same number on the same floor (or, with no number, the same name) */
      const match = function (x) { return r.number ? same(x.number, r.number) : (!x.number && same(x.name, r.name)); };
      const there = f ? rooms.find(function (x) { return x.floor_id === f.id && match(x); }) : null;
      if (there) {
        if (there.archived) { row.status = 'exists'; row.notes.push('Already on this floor (archived): not changed'); return row; }
        /* an existing room is filled in: each field it leaves empty takes the list's value; a field that already holds a
           value is never changed. Its notes are never edited, so a value that does not fit is reported, not added. */
        const cv = convert(r), fill = {}, filled = [], set = [], changed = [];
        RI.FIELDS.forEach(function (f) {
          const k = f[0];
          if (!Object.prototype.hasOwnProperty.call(cv.values, k)) return;
          if (isEmpty(there[k])) { fill[k] = cv.values[k]; filled.push(f[1]); }
          else if (k === 'capacity' ? there[k] !== cv.values[k] : !same(there[k], cv.values[k])) {
            if (replace) { fill[k] = cv.values[k]; changed.push(f[1] + ': ' + shown(k, there[k]) + ' → ' + shown(k, cv.values[k])); }
            else set.push(f[1]);
          }
        });
        if (filled.length || changed.length) {
          /* two lines for the same room would fill it twice, the second over the first: the room is filled once */
          const once = 'room:' + there.id;
          if (seen.has(once)) { row.status = 'duplicate'; row.notes.push('Same room as line ' + seen.get(once) + ' of this list: filled in once'); row.attention = true; return row; }
          seen.set(once, r.line);
          row.status = 'fill'; row.target = there.id; row.fill = fill; row.fields = filled.length + changed.length;
          if (filled.length) row.notes.push('Fills in: ' + filled.join(', '));
          if (changed.length) row.notes.push('Changes: ' + changed.join('; '));
        } else { row.status = 'exists'; row.notes.push(replace ? 'Already on this floor: already matches the list' : 'Already on this floor: nothing to fill in'); }
        cv.unfit.forEach(function (u) { row.notes.push(u[0] + ' “' + u[1] + '” does not fit: not filled in'); row.attention = true; });
        if (set.length) { row.notes.push('Already set, left as it is: ' + set.join(', ')); row.attention = true; }
        return row;
      }
      const dup = fKey + '|' + (r.number ? 'n:' + key(r.number) : 'name:' + key(r.name));
      if (seen.has(dup)) { row.status = 'duplicate'; row.notes.push('Same room as line ' + seen.get(dup) + ' of this list: imported once'); return row; }
      seen.set(dup, r.line);
      /* values that must fit a list or a type: kept only when they do */
      const cv = convert(r);
      const data = Object.assign({ number: r.number, name: '', room_type: '', capacity: null, criticality: '', conferencing_platform: '', control_platform: '',
        dsp_platform: '', scheduling_platform: '', display_config: '', camera_config: '', microphone_config: '', operational_status: '', notes: '' }, cv.values);
      /* what did not fit is not lost: it is kept, word for word, in the new room's notes */
      cv.unfit.forEach(function (u) { row.notes.push(u[0] + ' “' + u[1] + '” does not fit: left empty, kept in the notes'); });
      if (cv.unfit.length) data.notes = [data.notes].concat(cv.unfit.map(function (u) { return u[0] + ' in the source list: ' + u[1]; })).filter(Boolean).join('\n');
      row.kept = cv.unfit.length;
      row.noType = !data.room_type;
      row.data = data;
      return row;
    });
    const n = function (st) { return out.filter(function (r) { return r.status === st; }).length; };
    const plan = { parsed: parsed, replace: replace, rows: out, newBuildings: newB, newFloors: newF, newAreas: newA, unknown: parsed.unknown, headerNotes: parsed.headerNotes,
      counts: { rooms: n('new'), fill: n('fill'), fields: out.reduce(function (s, r) { return s + (r.fields || 0); }, 0),
        exists: n('exists'), duplicate: n('duplicate'), error: n('error'), buildings: 0, floors: 0, areas: 0,
        unfit: out.filter(function (r) { return r.status === 'new' && r.kept; }).length, noType: out.filter(function (r) { return r.status === 'new' && r.noType; }).length } };
    RI.needed(plan);
    return plan;
  };
  /* only the buildings, floors and areas that a room of this list actually needs are created */
  RI.needed = function (plan) {
    const b = new Set(), f = new Set(), a = new Set();
    plan.rows.forEach(function (r) { if (r.status !== 'new') return; if (plan.newBuildings.has(r.where.bKey)) b.add(r.where.bKey); if (plan.newFloors.has(r.where.fKey)) f.add(r.where.fKey); if (r.where.aKey && plan.newAreas.has(r.where.aKey)) a.add(r.where.aKey); });
    plan.counts.buildings = b.size; plan.counts.floors = f.size; plan.counts.areas = a.size;
    return { b: b, f: f, a: a };
  };

  /* ------------------------------------------------------------------ apply */
  /* The plan is rebuilt from the list against the records as they are at this moment, so what is written is what
     would be shown now — not a plan made before something changed (another tab, a synchronisation, a first import). */
  RI.apply = function (planOrParsed, sourceName, opts) {
    if (store.readOnly) throw new Error('This account has read-only access.');
    const plan = RI.plan(planOrParsed.parsed || planOrParsed, opts || { replace: !!planOrParsed.replace });
    const need = RI.needed(plan);
    const made = function (table, data) { return store.create(table, data); };   /* each record gets its own entry in the change history */
    const bId = new Map(), fRec = new Map(), aId = new Map();
    need.b.forEach(function (k) { const x = plan.newBuildings.get(k); bId.set(k, made('buildings', { name: x.name, address: x.address || '', identifier: x.identifier || '', floors_count: null, site_contact: '', notes: '', archived: false }).id); });
    const buildingOf = function (k) { return bId.get(k) || k; };
    need.f.forEach(function (k) {
      const x = plan.newFloors.get(k), b = buildingOf(x.bKey), num = Number(x.number);
      /* same rule as the floor editor: a numbered floor is listed by its number, any other after the numbered ones */
      fRec.set(k, made('floors', { building_id: b, number: x.number, designation: x.designation || '', infrastructure_notes: '', audit_status_override: '',
        sort_order: x.number.trim() !== '' && isFinite(num) ? num : 1000 + store.by('floors', 'building_id', b).length, archived: false }));
    });
    const floorOf = function (k) { return fRec.get(k) || store.get('floors', k); };
    need.a.forEach(function (k) { const x = plan.newAreas.get(k), f = floorOf(x.fKey); aId.set(k, made('areas', { building_id: f.building_id, floor_id: f.id, name: x.name, description: '', archived: false }).id); });
    let rooms = 0, filled = 0, fields = 0;
    plan.rows.forEach(function (r) {
      if (r.status === 'new') {
        A.addRoom(floorOf(r.where.fKey), Object.assign({}, r.data, { area_id: r.where.aKey ? (aId.get(r.where.aKey) || r.where.aKey) : null }));
        rooms++;
      } else if (r.status === 'fill') {
        /* each filled field is in the room's change history, from empty to the list's value */
        store.update('rooms', r.target, r.fill);
        filled++; fields += r.fields;
      }
    });
    const c = plan.counts, skipped = c.exists + c.duplicate + c.error;
    store.log({ action: 'imported', entity_type: 'rooms', summary: 'Room list imported' + (sourceName ? ' from ' + sourceName : '') + ': ' + U.plural(rooms, 'room') + ', ' + U.plural(c.floors, 'floor') + ', ' + U.plural(c.buildings, 'building') +
      (filled ? ', ' + U.plural(filled, 'existing room') + (plan.replace ? ' updated' : ' filled in') + ' (' + U.plural(fields, 'field') + ')' : '') +
      (skipped ? ' — ' + U.plural(skipped, 'line') + ' not imported' : '') });
    return { rooms: rooms, buildings: c.buildings, floors: c.floors, areas: c.areas, filled: filled, fields: fields, replace: plan.replace };
  };

  /* ------------------------------------------------------------------ screen: choose a file, review the plan, import */
  RI.open = function () {
    const h = EV.h, ui = EV.ui;
    const st = { name: '', plan: null, parsed: null, replace: false, error: '', errorTitle: '', done: null, show: 'all', busy: false, seq: 0 };
    const pick = function (e) {
      const file = e.target.files && e.target.files[0]; e.target.value = '';
      if (!file) return undefined;
      const mine = ++st.seq;
      st.error = ''; st.plan = null; st.parsed = null; st.done = null; st.name = file.name; st.show = 'all';
      return file.text().then(function (text) { if (mine === st.seq) { st.parsed = RI.read(text); st.plan = RI.plan(st.parsed, { replace: st.replace }); } })
        .catch(function (err) { if (mine === st.seq) { st.errorTitle = 'This file cannot be imported'; st.error = (err && err.message) || 'The file could not be read.'; } });
    };
    const tone = { 'new': 'ok', fill: 'accent', exists: 'muted', duplicate: 'muted', error: 'danger' }, word = { 'new': 'Import', fill: 'Fill in', exists: 'Exists', duplicate: 'Repeated', error: 'Not imported' };
    const needsLook = function (r) { return r.status === 'error' || r.status === 'duplicate' || r.attention || r.noType || (r.status === 'new' && r.notes.length > 0); };
    const goLabel = function (c, replace) { return [c.rooms ? 'Import ' + U.plural(c.rooms, 'room') : '', c.fill ? (replace ? 'Update ' : 'Fill in ') + U.plural(c.fill, 'room') : ''].filter(Boolean).join(', ').replace(', Fill', ', fill').replace(', Update', ', update') || 'Nothing to import'; };
    const setMode = function (v) { st.replace = v === 'replace'; if (st.parsed && !st.done) st.plan = RI.plan(st.parsed, { replace: st.replace }); };
    const sheet = ui.openSheet({
      title: 'Import a room list', sub: 'CSV file — one line per room', size: 'wide',
      render: function () {
        const p = st.plan, c = p && p.counts;
        word.fill = st.replace ? 'Update' : 'Fill in';
        const rows = p ? p.rows.filter(function (r) { return st.show === 'all' || (st.show === 'attention' ? needsLook(r) : r.status === st.show); }) : [];
        return h('div.stack', null,
          store.readOnly ? ui.note('warn', 'This account has read-only access: a room list can be checked here, but not imported.') : null,
          st.done ? ui.note('ok', 'Imported ' + U.plural(st.done.rooms, 'room') + ', ' + U.plural(st.done.floors, 'floor') + ', ' + U.plural(st.done.areas, 'area') + ' and ' + U.plural(st.done.buildings, 'building') + '.' +
            (st.done.filled ? (st.done.replace ? ' Updated ' + U.plural(st.done.fields, 'field') : ' Filled in ' + U.plural(st.done.fields, 'empty field')) + ' on ' + U.plural(st.done.filled, 'existing room') + '.' : ''), { title: 'Room list imported' }) : null,
          !p && !st.done ? [h('p.muted', { key: 'a' }, 'The first line names the columns. Needed: Building, Floor, and Room number or Room name. From Excel, save the sheet as “CSV UTF-8”.'),
            h('div.kv-list', { key: 'b' }, RI.COLUMNS.filter(function (x) { return ['building', 'floor', 'number', 'name'].indexOf(x[0]) < 0; }).map(function (x) { return ui.kv(x[1], x[3]); }))] : null,
          st.error ? ui.note('danger', st.error, { title: st.errorTitle }) : null,
          st.done ? null : h('div.btn-row.wrap', null,
            h('label.btn.btn-secondary.capture', { 'for': 'room-list-file', role: 'button' }, EV.icon('upload', 17), h('span', null, p ? 'Choose another file' : 'Choose CSV file'),
              h('input', { id: 'room-list-file', type: 'file', accept: '.csv,text/csv,text/plain', 'class': 'file-input', tabindex: '-1', onchange: pick })),
            ui.btn('Download template', { icon: 'download', kind: 'ghost', onclick: function () { return EV.saveFile(RI.template(), 'room_list_template.csv', 'text/csv').then(function (r) { if (!r.ok) EV.toast(r.message || 'The template could not be saved here.', 'warn'); }); } })),
          st.done ? null : ui.field('Rooms that already exist', ui.select(st.replace ? 'replace' : 'fill', [['fill', 'Fill in empty fields only'], ['replace', 'Update to the list’s values']],
            { empty: false, id: 'room-import-mode', onchange: setMode }), { hint: st.replace ? 'Every value in the list replaces the room’s current value. An empty cell changes nothing. Each change is listed below and kept in the room’s change history.'
              : 'Only fields that are still empty are filled. Values already set are kept.' }),
          p && !st.done ? [
            h('div.tiles', { key: 't' },
              ui.stat({ key: 'n', label: 'Rooms to import', value: c.rooms, tone: c.rooms ? 'ok' : null, sub: c.buildings + ' new buildings · ' + c.floors + ' new floors · ' + c.areas + ' new areas' }),
              ui.stat({ key: 'f', label: st.replace ? 'Rooms to update' : 'Rooms to fill in', value: c.fill, tone: c.fill ? 'accent' : null,
                sub: st.replace ? U.plural(c.fields, 'field') + ' to set or change' : U.plural(c.fields, 'empty field') + ' · values already set are kept' }),
              ui.stat({ key: 'e', label: 'Already present', value: c.exists, sub: (st.replace ? 'Already match the list' : 'Nothing to fill in') + (c.duplicate ? ' · ' + c.duplicate + ' repeated in this list' : '') }),
              ui.stat({ key: 'x', label: 'Lines not imported', value: c.error, tone: c.error ? 'danger' : null, sub: 'The reason is on each line' })),
            c.unfit ? ui.note('warn', U.plural(c.unfit, 'room') + ' will be imported with a value left empty because it does not fit. Nothing is guessed: the original text is kept in the room’s notes.', { key: 'w' }) : null,
            c.noType ? ui.note('info', U.plural(c.noType, 'room') + ' will be imported without a room type and listed as incomplete until one is chosen.', { key: 'y' }) : null,
            p.headerNotes.length ? ui.note('info', 'Column names: ' + p.headerNotes.join('; ') + '.', { key: 'hn' }) : null,
            p.unknown.length ? ui.note('info', 'Columns that are not used: ' + p.unknown.join(', ') + '.', { key: 'u' }) : null,
            h('div.toolbar', { key: 'f' }, ui.select(st.show, [['all', 'All lines (' + p.rows.length + ')'], ['attention', 'Lines needing attention'], ['new', 'To import'], ['fill', st.replace ? 'To update' : 'To fill in'], ['exists', 'Already present'], ['duplicate', 'Repeated in this list'], ['error', 'Not imported']],
              { empty: false, aria: 'Show', onchange: function (v) { st.show = v; } })),
            h('div.list', { key: 'l' }, rows.slice(0, 300).map(function (r) {
              return h('div.row', { key: 'r' + r.line },
                h('span.row-main', null, h('span.row-title', null, r.label), h('span.row-sub', null, ['Line ' + r.line, r.source.building, r.source.floor ? 'Floor ' + r.source.floor : '', r.source.area].filter(Boolean).join(' · ')),
                  r.problems.concat(r.notes).concat(r.noType ? ['No room type'] : []).map(function (n, i) { return h('span.row-sub', { key: 'n' + i }, n); })),
                h('span.row-right', null, ui.chip(word[r.status], tone[r.status])));
            })),
            rows.length > 300 ? h('p.muted', { key: 'm' }, 'Showing the first 300 of ' + rows.length + ' lines. Every line is imported or skipped as counted above.') : null
          ] : null);
      },
      footer: function () {
        const p = st.plan;
        return [h('span.grow', { key: 'g' }),
          ui.btn(st.done ? 'Done' : 'Cancel', { key: 'c', kind: st.done ? 'primary' : 'ghost', onclick: function () { ui.closeSheet(sheet); } }),
          p && !st.done ? ui.btn(st.busy ? 'Importing…' : goLabel(p.counts, p.replace), { key: 'i', kind: 'primary', icon: 'check', id: 'room-import-go', disabled: st.busy || store.readOnly || !(p.counts.rooms || p.counts.fill), onclick: function () {
            /* one import per plan: a second tap, or a retry after a failure, never writes the same list twice */
            if (st.busy || st.done || !st.plan) return;
            st.busy = true;
            const plan = st.plan; st.plan = null;
            try { st.done = RI.apply(plan, st.name); }
            catch (err) { st.errorTitle = 'The import did not complete'; st.error = ((err && err.message) || String(err)) + ' Check Buildings & Floors for what was created, then choose the file again: rooms already created are skipped.'; }
            st.busy = false;
          } }) : null];
      }
    });
    return sheet;
  };
})();
