/* exporter.js — Daily Export & Data Handoff engine.
 * Builds a self-describing ZIP package of the underlying structured records (never a screen summary):
 * stable IDs, preserved relationships, ISO 8601 timestamps, per-record change status against the previous
 * successful export, photographs in a building/floor/room/device tree, a validation report and analysis instructions. */
(function () {
  'use strict';
  const EV = window.EV, U = EV.U, S = EV.S, store = EV.store, R = EV.rules, A = EV.act;
  const X = (EV.exporter = { last: null });

  X.FILES = [
    { file: 'buildings.csv', table: 'buildings', core: true, desc: 'Buildings in the audited environment.' },
    { file: 'floors.csv', table: 'floors', core: true, desc: 'Floors, one row per floor, linked to buildings.' },
    { file: 'areas.csv', table: 'areas', desc: 'Named areas within a floor.' },
    { file: 'rooms.csv', table: 'rooms', core: true, desc: 'Rooms and spaces with their permanent identifier (code) and current audit state.' },
    { file: 'room_configurations.csv', table: 'room_configurations', desc: 'Combined configurations of divisible rooms.' },
    { file: 'room_configuration_members.csv', table: 'room_configuration_members', desc: 'Which rooms belong to each combined configuration.' },
    { file: 'racks.csv', table: 'racks', desc: 'Equipment racks within rooms.' },
    { file: 'room_audits.csv', table: 'audits', core: true, desc: 'One row per audit of a room or combined configuration, with progress figures. Audits are historical: a newer audit never replaces an older one.' },
    { file: 'audit_sections.csv', table: 'audit_sections', desc: 'Per-audit section state (for example “no AV devices in this space”).' },
    { file: 'devices.csv', table: 'devices', core: true, desc: 'Device inventory. IP, MAC and serial each carry their own verification status; identification_status and missing_fields summarise completeness.' },
    { file: 'functional_tests.csv', table: 'functional_tests', core: true, desc: 'Functional test results per audit (pass, fail, investigate, na, not_tested).' },
    { file: 'network_validation.csv', table: 'network_checks', desc: 'Network validation checklist results per audit.' },
    { file: 'findings.csv', table: 'findings', core: true, desc: 'Field findings. classification separates observed facts from interpretation and unverified hypotheses.' },
    { file: 'backlog.csv', table: 'backlog_items', core: true, desc: 'Improvement backlog items (AVEI-BL-nnn). suspected_cause is an unverified hypothesis; root_cause is populated only when root_cause_confidence is “confirmed”.' },
    { file: 'backlog_request_links.csv', table: 'backlog_it_links', desc: 'Many-to-many links between backlog items and coordination requests.' },
    { file: 'it_coordination.csv', table: 'it_requests', core: true, desc: 'Coordination requests to Client IT, PepperDash, vendors and facilities.' },
    { file: 'infrastructure.csv', table: 'infra_assets', core: true, desc: 'Infrastructure documentation records (switches, VLANs, subnets, IP ranges, reservations, DNS/NTP, firewall, multicast, QoS, monitoring). validation_status states how far each value can be trusted.' },
    { file: 'switch_ports.csv', table: 'switch_ports', desc: 'Documented switch ports and the device connected to each.' },
    { file: 'network_relationships.csv', table: 'network_links', desc: 'Uplinks between switches and device dependencies (DHCP, DNS, NTP, firewall, multicast, QoS, monitoring, firmware).' },
    { file: 'spare_inventory.csv', table: 'spare_items', core: true, desc: 'Spare equipment with stock levels and risk flags.' },
    { file: 'audit_notes.csv', table: 'audit_notes', core: true, desc: 'Auditor notes, each typed as observed fact, interpretation, unverified hypothesis or recommended action.' },
    { file: 'followup_tasks.csv', table: 'followups', desc: 'Automatically tracked follow-up tasks for incomplete device documentation.' },
    { file: 'activity_log.csv', table: 'activity_log', core: true, desc: 'Change history: who changed what and when, with field-level before/after values.' },
    { file: 'photo_index.csv', table: 'photos', core: true, desc: 'One row per photograph with its file path in this package and its links to room, device, audit and finding.' }
  ];
  const SKIP_TABLES = { organizations: 1, profiles: 1, insight_states: 1, exports: 1 };

  /* ------------------------------------------------------------------ column mapping */
  const REF_COLS = {
    buildings: [['building_name', function (r) { return r.name; }]],
    floors: [['floor_number', function (r) { return r.number; }]],
    areas: [['area_name', function (r) { return r.name; }]],
    rooms: [['room_code', function (r) { return r.code; }], ['room_number', function (r) { return r.number; }], ['room_name', function (r) { return r.name; }]],
    room_configurations: [['configuration_name', function (r) { return r.name; }]],
    racks: [['rack_name', function (r) { return r.name; }]],
    audits: [['audit_code', function (r) { return r.code; }]],
    devices: [['device_code', function (r) { return r.code; }], ['device_hostname', function (r) { return r.hostname; }]],
    findings: [['finding_code', function (r) { return r.code; }]],
    backlog_items: [['backlog_code', function (r) { return r.code; }]],
    it_requests: [['request_code', function (r) { return r.code; }]],
    infra_assets: [['switch_name', function (r) { return r.name; }]],
    functional_tests: [['test_key', function (r) { return r.test_key; }]],
    spare_items: [['spare_code', function (r) { return r.code; }]]
  };
  function endpointLabel(type, id) {
    if (!id) return '';
    if (type === 'device') { const d = store.getAny('devices', id); return d ? (d.code + ' ' + (d.hostname || '')).trim() : ''; }
    if (type === 'infra_asset') { const a = store.getAny('infra_assets', id); return a ? (a.code + ' ' + (a.name || '')).trim() : ''; }
    return '';
  }
  function prog(a) { return R.auditProgress(a.id) || null; }
  const DERIVED = {
    rooms: [
      ['audit_state', function (r) { return R.roomState(r.id).state; }],
      ['latest_audit_code', function (r) { const s = R.roomState(r.id); return s.audit ? s.audit.code : ''; }],
      ['audit_count', function (r) { return R.roomState(r.id).count; }],
      ['device_count', function (r) { return R.roomDevices(r.id).length; }],
      ['is_conference_space', function (r) { return R.isConference(r); }],
      ['effective_criticality', function (r) { return R.criticality(r); }]
    ],
    audits: [
      ['space_label', function (a) { return R.auditTitle(a); }],
      ['overall_pct', function (a) { const p = prog(a); return p ? p.overall : ''; }],
      ['summary_complete', function (a) { const p = prog(a); return p ? p.summary.complete : ''; }],
      ['devices_total', function (a) { const p = prog(a); return p ? p.devices.total : ''; }],
      ['devices_verified', function (a) { const p = prog(a); return p ? p.devices.verified : ''; }],
      ['devices_incomplete', function (a) { const p = prog(a); return p ? p.devices.incomplete : ''; }],
      ['tests_total', function (a) { const p = prog(a); return p ? p.tests.total : ''; }],
      ['tests_done', function (a) { const p = prog(a); return p ? p.tests.done : ''; }],
      ['tests_pass', function (a) { const p = prog(a); return p ? p.tests.pass : ''; }],
      ['tests_fail', function (a) { const p = prog(a); return p ? p.tests.fail : ''; }],
      ['tests_investigate', function (a) { const p = prog(a); return p ? p.tests.investigate : ''; }],
      ['tests_na', function (a) { const p = prog(a); return p ? p.tests.na : ''; }],
      ['network_pct', function (a) { const p = prog(a); return p ? p.network.pct : ''; }],
      ['network_issues', function (a) { const p = prog(a); return p ? p.network.issue : ''; }],
      ['network_awaiting_it', function (a) { const p = prog(a); return p ? p.network.awaiting : ''; }],
      ['photo_count', function (a) { const p = prog(a); return p ? p.photos : ''; }],
      ['finding_count', function (a) { const p = prog(a); return p ? p.findings : ''; }],
      ['can_be_fully_verified', function (a) { const p = prog(a); return p ? p.canVerify : ''; }],
      ['verification_lapsed', function (a) { return R.auditLapsed(a); }],
      ['outstanding', function (a) { const p = prog(a); return p ? p.blockers.join(' | ') : ''; }]
    ],
    devices: [
      ['device_type', function (d) { return R.deviceType(d); }],
      ['network_connected', function (d) { return R.isNetworked(d); }],
      ['identification_status', function (d) { return R.device(d).identified ? 'complete' : 'incomplete'; }],
      ['missing_fields', function (d) { return R.device(d).missing.join(' | '); }],
      ['unverified_fields', function (d) { return R.device(d).unverified.join(' | '); }],
      ['fully_verified', function (d) { return R.device(d).verified; }]
    ],
    backlog_items: [
      ['is_open', function (b) { return S.BACKLOG_CLOSED.indexOf(b.status) < 0; }],
      ['linked_finding_codes', function (b) { return store.by('findings', 'backlog_item_id', b.id).map(function (f) { return f.code; }).join(' | '); }],
      ['related_request_codes', function (b) { return A.requestsFor(b.id).map(function (x) { return x.code; }).join(' | '); }],
      ['affected_room_codes', function (b) { return R.backlogRooms(b).map(function (r) { return r.code; }).join(' | '); }]
    ],
    it_requests: [
      ['is_open', function (x) { return S.IT_CLOSED.indexOf(x.status) < 0; }],
      ['is_overdue', function (x) { return S.IT_CLOSED.indexOf(x.status) < 0 && !!x.target_date && x.target_date < U.localDate(); }],
      ['related_backlog_codes', function (x) { return A.backlogFor(x.id).map(function (b) { return b.code; }).join(' | '); }]
    ],
    spare_items: [['risk_flags', function (s) { return R.spare(s).map(function (f) { return f.label; }).join(' | '); }]],
    network_links: [
      ['from_label', function (l) { return endpointLabel(l.from_type, l.from_id); }],
      ['to_label', function (l) { return endpointLabel(l.to_type, l.to_id); }]
    ],
    photos: [
      ['file_path', function (p) { return (X._photoInfo && X._photoInfo.get(p.id) || {}).path || ''; }],
      ['edited_file_path', function (p) { return (X._photoInfo && X._photoInfo.get(p.id) || {}).edited || ''; }],
      ['file_sha256', function (p) { return (X._photoInfo && X._photoInfo.get(p.id) || {}).sha256 || ''; }],
      ['exported_bytes', function (p) { const i = X._photoInfo && X._photoInfo.get(p.id); return i && i.bytes != null ? i.bytes : ''; }]
    ]
  };
  const defCache = {};
  X.defs = function (table) {
    if (defCache[table]) return defCache[table];
    const t = S.T[table];
    const defs = [{ name: 'id', get: function (r) { return r.id; } }];
    const seen = new Set(['id']);
    if (t.colNames.indexOf('code') >= 0) { defs.push({ name: 'code', get: function (r) { return r.code; } }); seen.add('code'); }
    t.columns.forEach(function (c) {
      if (seen.has(c.name) || (table === 'photos' && c.name === 'thumb')) return;
      seen.add(c.name);
      defs.push({ name: c.name, get: function (r) { return r[c.name]; }, ref: c.ref, soft: c.soft });
      if (c.ref && REF_COLS[c.ref]) REF_COLS[c.ref].forEach(function (rc) {
        if (seen.has(rc[0])) return;
        seen.add(rc[0]);
        defs.push({ name: rc[0], derived: true, get: function (r) { const p = store.getAny(c.ref, r[c.name]); return p ? rc[1](p) : ''; } });
      });
    });
    (DERIVED[table] || []).forEach(function (d) { if (!seen.has(d[0])) { seen.add(d[0]); defs.push({ name: d[0], derived: true, get: d[1] }); } });
    ['created_at', 'updated_at', 'created_by', 'updated_by', 'deleted_at', 'is_demo'].forEach(function (k) { defs.push({ name: k, get: function (r) { return r[k]; } }); });
    return (defCache[table] = defs);
  };
  X.columns = function (table) { return X.defs(table).map(function (d) { return d.name; }); };
  X.row = function (table, rec) {
    return X.defs(table).map(function (d) {
      let v;
      try { v = d.get(rec); } catch (e) { v = ''; }
      return v == null ? '' : v;
    });
  };

  /* ------------------------------------------------------------------ delivery ledger
   * record_status must answer one question: "does the consumer already hold this row, exactly as it is now?"
   * A point in time cannot answer it (an export limited to one day, one floor or a repeated window does not carry
   * everything that changed before its timestamp), so the application keeps a ledger instead: for every row that was
   * ever DELIVERED in a package from this device, a signature of the row as it was written. Then
   *     not in the ledger            -> new        signature differs  -> updated        same signature -> unchanged
   * The signature covers the whole CSV row, including the derived columns (audit state, progress figures, linked
   * codes), so a room whose audit moved on is "updated" even though the room record itself was not edited. */
  const SIG_SKIP = { file_path: 1, edited_file_path: 1, file_sha256: 1, exported_bytes: 1 };   /* describe a package, not the record */
  function hash53(str) {
    let h1 = 0xdeadbeef ^ str.length, h2 = 0x41c6ce57 ^ str.length;
    for (let i = 0, ch; i < str.length; i++) { ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(36) + '.' + (h1 >>> 0).toString(36);
  }
  X.signature = function (table, rec) {
    const defs = X.defs(table);
    let s = '';
    for (let i = 0; i < defs.length; i++) {
      if (SIG_SKIP[defs[i].name]) continue;
      let v;
      try { v = defs[i].get(rec); } catch (e) { v = ''; }
      s += (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)) + '\u001f';
    }
    /* The second part is the version of the record itself. It tells "the auditor edited this record" apart from "a
       figure derived from other records moved" (a room renamed, a device of the room identified weeks later). */
    return hash53(s) + '|' + ownStamp(rec);
  };
  function ownStamp(rec) { const t = rec && rec.updated_at ? Date.parse(rec.updated_at) : NaN; return isNaN(t) ? '' : t.toString(36); }
  function deliveredStamp(sig) { const m = /\|([0-9a-z]*)!?$/.exec(String(sig)); return m ? m[1] : null; }
  X.ledger = function () { return store.kvGet('export_ledger') || {}; };
  /* A photograph whose image file was not in the package (index-only export, or the file was not on the device) is
     recorded with this mark, so it stays "updated" until a package has actually carried the image. */
  const NO_IMAGE = '!';
  function commitLedger(pkg) {
    const led = Object.assign({}, X.ledger()), prev = {};
    Object.keys(pkg.sigs).forEach(function (t) {
      const cur = Object.assign({}, led[t] || {}), p = (prev[t] = {});
      Object.keys(pkg.sigs[t]).forEach(function (id) {
        const s = pkg.sigs[t][id];
        /* an index-only package does not take back an image that was already delivered for this same version of the row */
        if (s.slice(-1) === NO_IMAGE && cur[id] === s.slice(0, -1)) return;
        p[id] = cur[id] === undefined ? null : cur[id];
        cur[id] = s;
      });
      led[t] = cur;
    });
    store.kvSet('export_ledger', led);
    store.kvSet('export_last', { export_id: pkg.id, prev: prev });   /* lets the most recent delivery be voided exactly */
  }

  /* ------------------------------------------------------------------ completeness */
  function miss(rec, fields) { return fields.filter(function (f) { return U.blank(rec[f[0]]); }).map(function (f) { return f[1] + ' missing'; }); }
  X.incomplete = function (table, r) {
    switch (table) {
      case 'buildings': return miss(r, [['name', 'name']]);
      case 'floors': return miss(r, [['number', 'floor number']]);
      case 'rooms': return miss(r, [['number', 'room number'], ['name', 'room name'], ['room_type', 'room type']]);
      case 'audits': {
        if (r.deleted_at) return [];
        const p = prog(r);
        const out = [];
        if (r.status === 'in_progress') out.push('audit in progress');
        /* a fully verified audit is complete only while its mandatory information still is (see R.auditLapsed) */
        if (p && R.auditLapsed(r)) out.push('verification lapsed');
        if (p && (r.status !== 'verified' || !p.canVerify)) p.blockers.forEach(function (b) { out.push(b); });
        return out;
      }
      case 'devices': {
        const d = R.device(r);
        return d.missing.map(function (m) { return m + ' missing'; }).concat(d.missingRequired.map(function (m) { return m + ' missing'; })).concat(d.invalid);
      }
      case 'functional_tests': {
        if (!r.result || r.result === 'not_tested') return ['not tested'];
        return (r.result === 'fail' || r.result === 'investigate') && U.blank(r.comment) ? ['no observation recorded for a failed/investigated test'] : [];
      }
      case 'network_checks': return !r.status || r.status === 'not_checked' ? ['not checked'] : [];
      case 'findings': return miss(r, [['title', 'title'], ['observation', 'observed evidence']]).concat(r.status === 'open' ? ['awaiting triage (not yet in backlog)'] : []);
      case 'backlog_items': return miss(r, [['title', 'title'], ['problem_statement', 'problem statement'], ['priority', 'priority'], ['owner', 'owner']])
        .concat(S.BACKLOG_CLOSED.indexOf(r.status) < 0 && U.blank(r.recommendation) ? ['recommendation missing'] : []);
      case 'it_requests': return miss(r, [['topic', 'topic'], ['description', 'description']]).concat(r.status === 'Draft' ? ['draft — not yet submitted'] : []);
      case 'infra_assets': return miss(r, [['name', 'name']]).concat(!r.validation_status || r.validation_status === 'awaiting_it' || r.validation_status === 'unknown' ? ['requires Client IT validation'] : []);
      case 'spare_items': return ((U.blank(r.manufacturer) || U.blank(r.model)) ? ['manufacturer or model not identified'] : []).concat(U.blank(r.quantity) ? ['quantity not recorded'] : []);
      case 'switch_ports': return miss(r, [['port', 'port']]).concat(U.blank(r.description) ? ['port description blank'] : []);
      case 'network_links': return r.status && r.status !== 'confirmed' ? ['not confirmed (' + r.status + ')'] : [];
      case 'photos': { const i = X._photoInfo && X._photoInfo.get(r.id); return i && i.missing ? ['image file not available on this device'] : []; }
      case 'followups': return r.status === 'open' ? ['open follow-up'] : [];
      default: return [];
    }
  };

  /* ------------------------------------------------------------------ scope */
  function dayStart(d) { const x = new Date(d.length === 10 ? d + 'T00:00:00' : d); x.setHours(0, 0, 0, 0); return x; }
  function dayEnd(d) { const x = new Date(d.length === 10 ? d + 'T00:00:00' : d); x.setHours(23, 59, 59, 999); return x; }
  X.history = function () { return U.sortBy(store.all('exports'), function (e) { return e.created_at; }, true); };
  X.lastExport = function (before) {
    return X.history().find(function (e) { return e.status === 'success' && (!before || e.created_at < before); }) || null;
  };
  /* o: { mode: today|range|since|full, from, to, building_id, floor_id, room_ids, photoMode, reexportOf } */
  X.resolveScope = function (o) {
    o = o || {};
    if (o.reexportOf) {
      const prev = store.get('exports', o.reexportOf);
      if (!prev) throw new Error('The export to repeat no longer exists.');
      const f = prev.filters || {};
      const last = X.lastExport();
      /* "Changes since the last export" has no window to repeat (it was whatever had not been delivered then), so it is
         repeated as the time span that export covered. */
      return { mode: prev.mode === 'since' ? 'range' : prev.mode, window_start: prev.window_start, window_end: prev.window_end || prev.created_at,
        baseline_export_id: last ? last.id : null, baseline_export_code: last ? last.code : null, baseline_at: last ? last.created_at : null,
        filters: { building_id: f.building_id || null, floor_id: f.floor_id || null, room_ids: f.room_ids || [] }, photo_mode: o.photoMode || prev.photo_mode || 'original',
        reexport_of: prev.id, reexport_of_code: prev.code, collected_at: U.now() };
    }
    const now = new Date();
    const prev = X.lastExport();
    let start = null, end = now.toISOString();
    const mode = o.mode || 'today';
    if (mode === 'today') start = dayStart(U.localDate(now)).toISOString();
    else if (mode === 'range') { if (!o.from) throw new Error('Choose a start date.'); start = dayStart(o.from).toISOString(); end = dayEnd(o.to || o.from).toISOString(); }
    else if (mode === 'since') start = prev ? prev.created_at : null;
    return { mode: mode, window_start: start, window_end: end, baseline_export_id: prev ? prev.id : null, baseline_export_code: prev ? prev.code : null, baseline_at: prev ? prev.created_at : null,
      filters: { building_id: o.building_id || null, floor_id: o.floor_id || null, room_ids: (o.room_ids || []).slice() }, photo_mode: o.photoMode || 'original', reexport_of: null, collected_at: now.toISOString() };
  };
  function locOf(table, r) {
    if (table === 'buildings') return { building: r.id };
    if (table === 'floors') return { building: r.building_id, floor: r.id };
    if (table === 'rooms') return { building: r.building_id, floor: r.floor_id, room: r.id };
    let room = r.room_id || null, floor = r.floor_id || null, building = r.building_id || null;
    if (!floor && !room && r.audit_id) { const a = store.getAny('audits', r.audit_id); if (a) { room = a.room_id; floor = a.floor_id; building = a.building_id; } }
    if (table === 'switch_ports') { const a = store.getAny('infra_assets', r.switch_asset_id); if (a) { floor = a.floor_id; building = a.building_id; room = a.room_id; } }
    if (table === 'network_links') {
      /* located by its "from" end (a device or a switch), falling back to its "to" end */
      const end = function (type, id) { return id ? store.getAny(type === 'device' ? 'devices' : 'infra_assets', id) : null; };
      const e = end(r.from_type, r.from_id) || end(r.to_type, r.to_id);
      if (e) { room = e.room_id || null; floor = e.floor_id || null; building = e.building_id || null; }
    }
    if (table === 'backlog_it_links') {
      /* a link has no location of its own: it belongs where its backlog item is (or, failing that, its request) */
      const b = store.getAny('backlog_items', r.backlog_item_id), q = store.getAny('it_requests', r.it_request_id);
      const e = b && (b.building_id || b.floor_id || b.room_id) ? b : q;
      if (e) { room = e.room_id || null; floor = e.floor_id || null; building = e.building_id || null; }
    }
    if (table === 'followups' && r.device_id) { const d = store.getAny('devices', r.device_id); if (d) { room = d.room_id; floor = d.floor_id; building = d.building_id; } }
    if (table === 'room_configuration_members') { const rm = store.getAny('rooms', r.room_id); if (rm) { floor = rm.floor_id; building = rm.building_id; } }
    if (room && !floor) { const rm = store.getAny('rooms', room); if (rm) { floor = rm.floor_id; building = rm.building_id; } }
    if (floor && !building) { const f = store.getAny('floors', floor); if (f) building = f.building_id; }
    return { building: building, floor: floor, room: room };
  }

  /* ------------------------------------------------------------------ collection with relationship closure */
  X.collect = function (sc) {
    const full = sc.mode === 'full', since = sc.mode === 'since';
    const led = X.ledger();
    const sigs = new Map();
    const sigOf = function (table, r) { let s = sigs.get(r.id); if (s === undefined) { s = X.signature(table, r); sigs.set(r.id, s); } return s; };
    const delivered = function (table, r) { return led[table] ? led[table][r.id] : undefined; };   /* undefined = never delivered */
    const inWin = function (ts) { return !!ts && (!sc.window_start || ts >= sc.window_start) && ts <= sc.window_end; };
    const dateInWin = function (d) { return !!d && (!sc.window_start || d >= U.localDate(sc.window_start)) && d <= U.localDate(sc.window_end); };
    const F = sc.filters || {};
    const passes = function (table, r) {
      const loc = locOf(table, r);
      if (F.room_ids && F.room_ids.length) {
        if (table === 'audits' && r.configuration_id) return R.auditRooms(r).some(function (m) { return F.room_ids.indexOf(m.id) >= 0; });
        return !!loc.room && F.room_ids.indexOf(loc.room) >= 0;
      }
      if (F.floor_id) return loc.floor === F.floor_id;
      if (F.building_id) return !loc.building || loc.building === F.building_id;
      return true;
    };
    const inc = {};
    S.TABLES.forEach(function (t) { inc[t] = new Map(); });
    const queue = [];
    const add = function (table, r, expand) {
      if (!r || SKIP_TABLES[table] || inc[table].has(r.id)) return;
      inc[table].set(r.id, r);
      queue.push([table, r, !!expand]);
    };
    S.TABLES.forEach(function (table) {
      if (SKIP_TABLES[table]) return;
      store.raw(table).forEach(function (r) {
        const was = delivered(table, r);
        if (r.deleted_at) {
          /* a deletion is reported only for a record an earlier package delivered, and (outside a date window) only once */
          if (was === undefined) return;
          if (full || since) { if (was === sigOf(table, r)) return; }
          else if (!inWin(r.deleted_at)) return;
        } else if (since) {
          /* everything this device has not yet delivered in its current form, whenever it was changed */
          if (was !== undefined && was === sigOf(table, r)) return;
        } else if (!full) {
          const hit = inWin(r.created_at) || inWin(r.updated_at) || (table === 'audits' && dateInWin(r.audit_date));
          if (!hit) return;
        }
        if (!passes(table, r)) return;
        /* A date-based or full export shows each audit, device and backlog item with everything that belongs to it.
           "Since last export" stays minimal: the changed rows plus the records they refer to. */
        add(table, r, !r.deleted_at && !since);
      });
    });
    while (queue.length) {
      const item = queue.pop();
      const table = item[0], r = item[1], expand = item[2];
      S.T[table].columns.forEach(function (c) { if (c.ref && r[c.name]) add(c.ref, store.getAny(c.ref, r[c.name]), false); });
      if (table === 'network_links') {
        if (r.from_type === 'device') add('devices', store.getAny('devices', r.from_id), false);
        if (r.from_type === 'infra_asset') add('infra_assets', store.getAny('infra_assets', r.from_id), false);
        if (r.to_type === 'infra_asset') add('infra_assets', store.getAny('infra_assets', r.to_id), false);
        if (r.to_type === 'device') add('devices', store.getAny('devices', r.to_id), false);
      }
      if (table === 'activity_log' || !expand) continue;
      if (table === 'audits') {
        ['functional_tests', 'network_checks', 'audit_sections', 'audit_notes', 'photos', 'findings'].forEach(function (ct) { store.by(ct, 'audit_id', r.id).forEach(function (x) { add(ct, x, false); }); });
        R.auditDevices(r).forEach(function (d) { add('devices', d, true); });
      } else if (table === 'room_configurations') {
        store.by('room_configuration_members', 'configuration_id', r.id).forEach(function (x) { add('room_configuration_members', x, false); });
      } else if (table === 'backlog_items') {
        store.by('findings', 'backlog_item_id', r.id).forEach(function (x) { add('findings', x, false); });
        store.by('backlog_it_links', 'backlog_item_id', r.id).forEach(function (x) { add('backlog_it_links', x, false); });
        store.by('photos', 'backlog_item_id', r.id).forEach(function (x) { add('photos', x, false); });
      } else if (table === 'it_requests') {
        store.by('backlog_it_links', 'it_request_id', r.id).forEach(function (x) { add('backlog_it_links', x, false); });
      } else if (table === 'devices') {
        store.by('followups', 'device_id', r.id).forEach(function (x) { add('followups', x, false); });
        store.by('switch_ports', 'device_id', r.id).forEach(function (x) { add('switch_ports', x, false); });
        store.all('network_links').forEach(function (l) { if (l.from_type === 'device' && l.from_id === r.id) add('network_links', l, false); });
        store.by('photos', 'device_id', r.id).forEach(function (x) { add('photos', x, false); });
      } else if (table === 'findings') {
        store.by('photos', 'finding_id', r.id).forEach(function (x) { add('photos', x, false); });
      }
    }
    const stat = new Map();
    const tables = {};
    S.TABLES.forEach(function (t) {
      if (SKIP_TABLES[t]) return;
      tables[t] = Array.from(inc[t].values()).sort(function (a, b) { const ka = a.code || a.at || a.created_at || a.id, kb = b.code || b.at || b.created_at || b.id; return ka < kb ? -1 : ka > kb ? 1 : (a.id < b.id ? -1 : 1); });
      tables[t].forEach(function (r) {
        const was = delivered(t, r);
        stat.set(r.id, r.deleted_at ? 'deleted' : was === undefined ? 'new' : was === sigOf(t, r) ? 'unchanged' : 'updated');
      });
    });
    return { scope: sc, tables: tables, status: function (r) { return stat.get(r.id) || 'unchanged'; }, signature: sigOf, full: full, inWin: inWin,
      /* the record itself is new to the consumer, or was edited after the version that was last delivered */
      ownChanged: function (table, r) { const was = delivered(table, r); return was === undefined || deliveredStamp(was) !== ownStamp(r); } };
  };

  /* ------------------------------------------------------------------ dashboard figures for the selected scope */
  X.summarize = function (col) {
    const T = col.tables, st = col.status, sc = col.scope;
    const changed = function (r) { const s = st(r); return s === 'new' || s === 'updated'; };
    const live = function (t) { return T[t].filter(function (r) { return !r.deleted_at; }); };
    const audits = live('audits');
    /* The audits this export is "about" — the ones that were actually worked on. A row also reads "updated" when only
       a derived column moved (a device of the room was identified weeks later, the room or a device was renamed), and
       that is not an audit of the room. So the test is the row's OWN record: for "since last export", new to the
       consumer or edited after the version that was last delivered; for a date-based export, created or edited inside
       its window. It is applied to the audit itself and to its own tests, checks, notes, sections, photographs and
       findings. */
    const since = sc.mode === 'since';
    const touched = function (t, r) { return since ? col.ownChanged(t, r) : (col.inWin(r.created_at) || col.inWin(r.updated_at)); };
    const worked = new Set();
    ['functional_tests', 'network_checks', 'audit_notes', 'audit_sections', 'photos', 'findings'].forEach(function (t) {
      T[t].forEach(function (r) { if (r.audit_id && !r.deleted_at && touched(t, r)) worked.add(r.audit_id); });
    });
    const dated = function (a) { return !!a.audit_date && (!sc.window_start || a.audit_date >= U.localDate(sc.window_start)) && a.audit_date <= U.localDate(sc.window_end); };
    const activeAudits = audits.filter(function (a) { return col.full || touched('audits', a) || worked.has(a.id) || (!since && dated(a)); });
    const devs = live('devices');
    const tests = live('functional_tests');
    const reqs = live('it_requests');
    const backlog = live('backlog_items');
    let missingFields = 0, incDev = 0;
    devs.forEach(function (d) { const m = R.device(d).missing.length; missingFields += m; if (m) incDev++; });
    let incSections = 0;
    const incAudits = [];
    activeAudits.forEach(function (a) {
      const p = R.auditProgress(a.id); if (!p) return;
      const n = [p.summary.complete, p.devices.complete, p.tests.complete, p.network.complete, p.photos > 0].filter(function (x) { return !x; }).length;
      incSections += n;
      if ((a.status !== 'verified' || !p.canVerify) && p.blockers.length) incAudits.push({ code: a.code, space: R.auditTitle(a), status: R.auditLapsed(a) ? 'verification_lapsed' : a.status, outstanding: p.blockers });
    });
    const dates = U.uniq(activeAudits.map(function (a) { return a.audit_date; }).filter(Boolean)).sort();
    const newBacklog = backlog.filter(function (b) { return st(b) === 'new'; });
    const roomIds = U.uniq(activeAudits.map(function (a) { return a.room_id || a.configuration_id; }).filter(Boolean));
    /* environment-wide figures must not bring synthetic requests into a package that holds no demo records */
    const demoPkg = X.hasDemoRows(T);
    const pending = function (party) { return store.all('it_requests').filter(function (x) { return x.requested_from === party && S.IT_CLOSED.indexOf(x.status) < 0 && (demoPkg || !x.is_demo); }).length; };
    return {
      audit_dates: dates,
      buildings_visited: U.uniq(activeAudits.map(function (a) { return a.building_id; }).filter(Boolean)).length,
      floors_visited: U.uniq(activeAudits.map(function (a) { return a.floor_id; }).filter(Boolean)).length,
      floor_ids: U.uniq(activeAudits.map(function (a) { return a.floor_id; }).filter(Boolean)),
      rooms_audited: roomIds.length,
      audits_completed: activeAudits.filter(function (a) { return a.status !== 'in_progress'; }).length,
      audits_in_progress: activeAudits.filter(function (a) { return a.status === 'in_progress'; }).length,
      devices_documented: devs.filter(changed).length,
      devices_new: devs.filter(function (d) { return st(d) === 'new'; }).length,
      devices_in_package: devs.length,
      devices_requiring_followup: incDev,
      photographs: live('photos').length,
      photographs_new: live('photos').filter(function (p) { return st(p) === 'new'; }).length,
      tests_completed: tests.filter(function (t) { return t.result && t.result !== 'not_tested' && (col.full || touched('functional_tests', t)); }).length,
      tests_failed: tests.filter(function (t) { return t.result === 'fail'; }).length,
      tests_to_investigate: tests.filter(function (t) { return t.result === 'investigate'; }).length,
      findings_created: live('findings').filter(function (f) { return st(f) === 'new'; }).length,
      findings_awaiting_triage: live('findings').filter(function (f) { return f.status === 'open'; }).length,
      backlog_new: newBacklog.length,
      backlog_new_p1: newBacklog.filter(function (b) { return b.priority === 'P1'; }).length,
      backlog_new_p2: newBacklog.filter(function (b) { return b.priority === 'P2'; }).length,
      backlog_new_p3: newBacklog.filter(function (b) { return b.priority === 'P3'; }).length,
      backlog_new_unprioritized: newBacklog.filter(function (b) { return !b.priority; }).length,
      outstanding_identification_fields: missingFields,
      incomplete_audit_sections: incSections,
      incomplete_audits: incAudits,
      pending_it_dependencies: pending('Client IT'),
      pending_pepperdash_dependencies: pending('PepperDash'),
      requests_in_package: reqs.length,
      record_total: U.sum(Object.keys(T), function (t) { return T[t].length; })
    };
  };

  /* ------------------------------------------------------------------ validation */
  function isIso(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(s) && !isNaN(Date.parse(s)); }
  X.validate = function (col, photoInfo, fileNames) {
    const T = col.tables;
    const checks = [];
    /* every exception is kept: the report inside the package is the complete list (the screen shows the first few) */
    /* An exception is either a sentence, or a sentence about one record ({ text, table, id, code, sub }). Each gets a
       stable exception_id — the same check on the same record always produces the same id — so an exception can be
       matched, and closed, from one package to the next instead of being listed again as new. */
    const push = function (name, items, sev, okText, badText) {
      const slug = U.slug(name);
      const recs = items.map(function (it) { return typeof it === 'string' ? { text: it } : it; });
      checks.push({ name: name, key: slug, status: recs.length ? sev : 'pass', count: recs.length, detail: recs.length ? badText : okText,
        items: recs.map(function (r) { return r.text; }),
        records: recs.map(function (r) {
          return { exception_id: 'DQ-' + U.keyId('dq', slug + '|' + (r.table ? r.table + '|' + r.id + '|' + (r.sub || '') : r.text)).replace(/-/g, '').slice(0, 12).toUpperCase(),
            table: r.table || null, record_id: r.id || null, record_code: r.code || null, detail: r.text };
        }) });
    };
    const lbl = function (table, r) { return (r.code || r.id) + ' ' + S.title(table, r); };
    const about = function (table, r, text, sub) { return { text: text, table: table, id: r.id, code: r.code || null, sub: sub || '' }; };
    /* 1 — files */
    if (fileNames) {
      const expected = X.FILES.map(function (f) { return f.file; }).concat(['audit_manifest.json', 'claude_analysis_instructions.md', 'validation_report.json', 'end_of_day_summary.md', 'data_dictionary.md']);
      push('Every expected file is present', expected.filter(function (f) { return !fileNames.has(f); }), 'fail', expected.length + ' files present', 'Files missing from the package');
    }
    /* 2 — record ids */
    const noId = [], dupId = [];
    Object.keys(T).forEach(function (t) { const seen = new Set(); T[t].forEach(function (r) { if (!r.id) noId.push(t); else if (seen.has(r.id)) dupId.push(t + ':' + r.id); else seen.add(r.id); }); });
    push('Record IDs are populated and unique', noId.concat(dupId), 'fail', 'All records carry a unique permanent ID', 'Records without an ID or with a repeated ID');
    /* 3 — relationships */
    const broken = [], toDeleted = [], gone = [];
    const idx = {};
    Object.keys(T).forEach(function (t) { idx[t] = new Set(T[t].map(function (r) { return r.id; })); });
    Object.keys(T).forEach(function (t) {
      const cols = S.T[t].columns.filter(function (c) { return c.ref; });
      T[t].forEach(function (r) {
        if (r.deleted_at) return;
        cols.forEach(function (c) {
          const v = r[c.name]; if (!v) return;
          const target = store.getAny(c.ref, v);
          const inPkg = !!idx[c.ref] && idx[c.ref].has(v);
          /* A referenced record that exists but was left out would be a packaging fault: structural. A reference to a
             record that no longer exists anywhere cannot be repaired by packaging, so it must not block the export:
             it is reported as an exception and the column keeps the value that was recorded. */
          if (!target) gone.push(about(t, r, t + ' ' + lbl(t, r) + ' → ' + c.name + ' = ' + v + ' (the referenced ' + c.ref.replace(/_/g, ' ') + ' record no longer exists)', c.name));
          else if (!inPkg) broken.push(about(t, r, t + ' ' + lbl(t, r) + ' → ' + c.name + ' = ' + v + ' (referenced record is missing from the package)', c.name));
          else if (target.deleted_at) toDeleted.push(about(t, r, t + ' ' + lbl(t, r) + ' → ' + c.name + ' references deleted ' + c.ref + ' ' + (target.code || target.id), c.name));
        });
      });
    });
    push('Foreign-key relationships resolve inside the package', broken, 'fail', 'Every reference resolves to a record in this package', 'References that do not resolve');
    push('No record references a record that no longer exists', gone, 'warn', 'Every referenced record exists', 'References to records that no longer exist (treat the reference as empty)');
    push('No live record references a deleted record', toDeleted, 'warn', 'No references to deleted records', 'Live records that reference a deleted record');
    /* 4 — photographs */
    const photoMissing = [];
    T.photos.forEach(function (p) { if (p.deleted_at) return; const i = photoInfo && photoInfo.get(p.id); if (photoInfo && (!i || i.missing)) photoMissing.push(about('photos', p, lbl('photos', p))); });
    push('Photograph references resolve to image files', photoMissing, 'warn',
      photoInfo ? 'Every photograph record has its image file in the package' : col.scope.photo_mode === 'none' ? 'Not applicable: this package is an index only, without image files' : 'Checked when the package is generated',
      'Photograph records whose image file is not on this device');
    /* 5 — timestamps */
    const badTs = [];
    const future = new Date(Date.now() + 5 * 60000).toISOString();
    Object.keys(T).forEach(function (t) {
      T[t].forEach(function (r) {
        if (!isIso(r.created_at) || !isIso(r.updated_at)) badTs.push(about(t, r, t + ' ' + lbl(t, r) + ': timestamp is not ISO 8601', 'iso'));
        else if (r.updated_at < r.created_at) badTs.push(about(t, r, t + ' ' + lbl(t, r) + ': updated_at precedes created_at', 'order'));
        else if (r.updated_at > future) badTs.push(about(t, r, t + ' ' + lbl(t, r) + ': timestamp is in the future (check the device clock)', 'future'));
        if (t === 'audits' && r.audit_date && !/^\d{4}-\d{2}-\d{2}$/.test(r.audit_date)) badTs.push(about(t, r, 'audit ' + r.code + ': audit_date is not a valid date', 'date'));
      });
    });
    const sc = col.scope;
    if (sc.window_start && sc.window_start > sc.window_end) badTs.push('Export window starts after it ends');
    push('Export dates and timestamps are valid', badTs, 'warn', 'All timestamps are valid ISO 8601 and consistent', 'Timestamp problems');
    /* 6 — incomplete device identification */
    const incDev = T.devices.filter(function (d) { return !d.deleted_at && !d.archived && !R.device(d).identified; }).map(function (d) { return about('devices', d, lbl('devices', d) + ' — missing: ' + R.device(d).missing.join(', ')); });
    push('Device identification is complete', incDev, 'warn', 'Every device has IP, MAC and serial recorded or marked not applicable', 'Devices with incomplete identification (allowed, flagged)');
    /* 7 — incomplete room audits (including one marked fully verified whose mandatory information has since lapsed) */
    const incAud = T.audits.filter(function (a) { return !a.deleted_at && (a.status !== 'verified' || R.auditLapsed(a)); }).map(function (a) {
      const p = R.auditProgress(a.id);
      return about('audits', a, a.code + ' ' + R.auditTitle(a) + ' — ' + R.auditStatusLabel(a) + (p && p.blockers.length ? '; ' + p.blockers.length + ' outstanding' : ''));
    });
    push('Room audits are fully verified', incAud, 'warn', 'Every audit in the package is fully verified', 'Audits that are in progress, not yet fully verified, or whose verification has lapsed (allowed, flagged)');
    /* 8 — conflicting values */
    const conflicts = [];
    const ids = new Set(T.devices.map(function (d) { return d.id; }));
    R.duplicates().forEach(function (g) { if (g.devices.some(function (d) { return ids.has(d.id); })) conflicts.push(g.label + ' ' + g.value + ' recorded on ' + g.devices.map(function (d) { return d.code; }).join(', ')); });
    U.groupBy(T.rooms.filter(function (r) { return !r.deleted_at && !r.archived && r.number; }), function (r) { return r.floor_id + '|' + String(r.number).toLowerCase(); }).forEach(function (list) {
      if (list.length > 1) conflicts.push('Room number ' + list[0].number + ' is used by ' + list.length + ' rooms on the same floor: ' + list.map(function (r) { return r.code; }).join(', '));
    });
    U.groupBy(T.switch_ports.filter(function (p) { return !p.deleted_at && p.port; }), function (p) { return p.switch_asset_id + '|' + p.port; }).forEach(function (list) {
      if (list.length > 1) conflicts.push('Switch port ' + list[0].port + ' is documented ' + list.length + ' times on the same switch');
    });
    T.devices.forEach(function (d) {
      if (d.deleted_at) return;
      const rm = store.getAny('rooms', d.room_id);
      if (rm && d.floor_id && rm.floor_id !== d.floor_id) conflicts.push('Device ' + d.code + ' is assigned to room ' + rm.code + ' but carries a different floor');
    });
    T.backlog_items.forEach(function (b) { if (!b.deleted_at && b.root_cause && b.root_cause_confidence !== 'confirmed') conflicts.push('Backlog ' + b.code + ' has a root cause recorded without confirmed confidence'); });
    push('No conflicting values', conflicts, 'warn', 'No conflicting values detected', 'Conflicting values — reconcile; neither value is assumed correct');
    /* 9 — required fields */
    const req = [];
    ['buildings', 'floors', 'rooms', 'findings', 'backlog_items', 'it_requests', 'infra_assets', 'switch_ports'].forEach(function (t) {
      T[t].forEach(function (r) { if (r.deleted_at) return; const m = X.incomplete(t, r).filter(function (x) { return / missing$/.test(x); }); if (m.length) req.push(about(t, r, t + ' ' + lbl(t, r) + ' — ' + m.join(', '))); });
    });
    T.devices.forEach(function (d) { if (d.deleted_at) return; const m = R.device(d).missingRequired; if (m.length) req.push(about('devices', d, 'devices ' + lbl('devices', d) + ' — ' + m.join(', ') + ' missing')); });
    push('Required fields are populated', req, 'warn', 'All required fields are populated', 'Records with required fields missing (allowed, flagged)');
    const fails = checks.filter(function (c) { return c.status === 'fail'; }).length, warns = checks.filter(function (c) { return c.status === 'warn'; }).length;
    return { generated_at: U.now(), result: fails ? 'failed' : warns ? 'passed_with_warnings' : 'passed', structural_errors: fails, warning_checks: warns,
      exception_count: U.sum(checks, function (c) { return c.status === 'pass' ? 0 : c.count; }), checks: checks,
      note: 'Structural errors mean the package cannot be merged reliably. Warnings are data-quality exceptions: the export is allowed and each exception is listed so nothing is silently assumed.' };
  };

  /* ------------------------------------------------------------------ photograph paths */
  /* one folder or file name: never empty, never "." or "..", never starting with a dot */
  function seg(s, fallback) { const v = U.fileSafe(s || fallback).replace(/^\.+/, '').slice(0, 60); return v || fallback; }
  X.photoPath = function (p, ext, suffix) {
    const b = store.getAny('buildings', p.building_id), f = store.getAny('floors', p.floor_id), r = store.getAny('rooms', p.room_id), d = store.getAny('devices', p.device_id);
    return 'photographs/' + seg(b ? (b.identifier || b.name) : '', 'no-building') + '/' + seg(f ? 'Floor_' + f.number : '', 'no-floor') + '/' + seg(r ? (r.number || r.code) : '', 'no-room') + '/' +
      seg(d ? d.code + (d.hostname ? '_' + d.hostname : '') : '', 'room') + '/' + seg(p.code + '_' + (p.category || 'Other'), 'photo') + (suffix || '') + '.' + ext;
  };

  /* ------------------------------------------------------------------ end-of-day summary */
  X.endOfDay = function (col, sum, val) {
    /* a package that holds no demo records must not take its priorities from the demo rooms elsewhere on the device */
    const realOnly = store.hasDemo() && !X.hasDemoRows(col.tables);
    const floors = sum.floor_ids.length || !realOnly ? sum.floor_ids : col.tables.floors.filter(function (f) { return !f.deleted_at; }).map(function (f) { return f.id; });
    let steps = [];
    if (floors.length) floors.forEach(function (fid) { steps = steps.concat(EV.reports.nextSteps({ floor: fid, building: (store.get('floors', fid) || {}).building_id })); });
    else if (!realOnly) steps = EV.reports.nextSteps({});
    steps = U.uniq(steps).filter(function (s) { return !/^No outstanding/.test(s); });
    return {
      rooms_audited: sum.rooms_audited, audits_completed: sum.audits_completed, audits_in_progress: sum.audits_in_progress,
      new_devices: sum.devices_new, devices_requiring_followup: sum.devices_requiring_followup, new_findings: sum.findings_created,
      new_p1: sum.backlog_new_p1, new_p2: sum.backlog_new_p2, new_p3: sum.backlog_new_p3, new_unprioritized: sum.backlog_new_unprioritized,
      outstanding_it_requests: sum.pending_it_dependencies, outstanding_pepperdash_dependencies: sum.pending_pepperdash_dependencies,
      data_quality_exceptions: val.exception_count, photographs: sum.photographs_new,
      next_visit_priorities: steps.length ? steps.slice(0, 12) : ['No outstanding actions are recorded for the spaces in this export.']
    };
  };
  function eodMarkdown(code, sc, sum, eod, val) {
    const L = [];
    L.push('# End-of-day summary — ' + code, '');
    L.push('- Generated: ' + U.isoLocal() + ' (' + U.tz() + ')');
    L.push('- Scope: ' + X.scopeLabel(sc));
    L.push('- Contains demo data: ' + (X.hasDemoRows(val.tables_checked) ? 'YES — synthetic records' : 'no'), '');
    L.push('| Measure | Value |', '|---|---|');
    [['Rooms audited', eod.rooms_audited], ['Audits completed / still in progress', eod.audits_completed + ' / ' + eod.audits_in_progress], ['New devices documented', eod.new_devices],
      ['Devices requiring follow-up', eod.devices_requiring_followup], ['Photographs captured', eod.photographs], ['Functional tests completed', sum.tests_completed], ['New findings', eod.new_findings],
      ['New backlog items — P1 / P2 / P3 / unprioritized', eod.new_p1 + ' / ' + eod.new_p2 + ' / ' + eod.new_p3 + ' / ' + eod.new_unprioritized], ['Outstanding Client IT requests', eod.outstanding_it_requests],
      ['Outstanding PepperDash dependencies', eod.outstanding_pepperdash_dependencies], ['Outstanding identification fields', sum.outstanding_identification_fields], ['Data quality exceptions', eod.data_quality_exceptions],
      ['Validation result', val.result]].forEach(function (r) { L.push('| ' + r[0] + ' | ' + r[1] + ' |'); });
    L.push('', '## Recommended priorities for the next onsite visit', '');
    eod.next_visit_priorities.forEach(function (s, i) { L.push((i + 1) + '. ' + s); });
    L.push('', '_Derived by rule from the recorded data. These are prompts for the auditor, not conclusions._', '');
    return L.join('\n');
  }
  /* Whether THIS package holds synthetic demo records — not whether any exist somewhere on the device. */
  X.hasDemoRows = function (tables) { return !!tables && Object.keys(tables).some(function (t) { return tables[t].some(function (r) { return r.is_demo === true; }); }); };
  X.scopeLabel = function (sc) {
    const m = { today: 'Current day', range: 'Date range', since: 'Changes since the last export', full: 'Full export' }[sc.mode] || sc.mode;
    const win = sc.mode === 'full' ? 'all records' : sc.mode === 'since' ? 'every row not yet delivered in its current form, as of ' + U.isoLocal(sc.window_end)
      : (sc.window_start ? U.isoLocal(sc.window_start) : 'the beginning') + ' → ' + U.isoLocal(sc.window_end);
    const f = sc.filters || {};
    const loc = [];
    if (f.building_id) loc.push((store.getAny('buildings', f.building_id) || {}).name);
    if (f.floor_id) loc.push('Floor ' + (store.getAny('floors', f.floor_id) || {}).number);
    if (f.room_ids && f.room_ids.length) loc.push(f.room_ids.map(function (id) { const r = store.getAny('rooms', id); return r ? (r.number || r.name) : id; }).join(', '));
    return m + ' (' + win + ')' + (loc.length ? ' · ' + loc.filter(Boolean).join(' · ') : ' · all locations') + (sc.reexport_of ? ' · re-export of ' + (sc.reexport_of_code || sc.reexport_of) : '');
  };

  /* ------------------------------------------------------------------ package build */
  X.nextCode = function () {
    const day = U.localDate().replace(/-/g, '');
    const prefix = store.orgCode() + '-EXP-' + day + '-';
    let n = 0;
    store.raw('exports').forEach(function (e) { if (e.code && e.code.indexOf(prefix) === 0) n = Math.max(n, parseInt(e.code.slice(prefix.length), 10) || 0); });
    return prefix + U.pad(n + 1, 2);
  };
  X.estimatePhotos = function (col) {
    const list = col.tables.photos.filter(function (p) { return !p.deleted_at; });
    return { count: list.length, bytes: U.sum(list, function (p) { return p.size_bytes || 0; }) };
  };
  X.build = async function (opts, progress) {
    const say = function (label, done, total) { if (progress) progress({ label: label, done: done, total: total }); };
    await store.flush();
    const sc = X.resolveScope(opts);
    const col = X.collect(sc);
    const code = X.nextCode();
    const uuid = U.uid();
    const zip = EV.zip.create();
    const files = [];
    /* photographs first, so photo_index.csv can state exactly what was packaged */
    const info = new Map();
    const photos = col.tables.photos.filter(function (p) { return !p.deleted_at; });
    let photoBytes = 0, n = 0;
    if (sc.photo_mode !== 'none') {
      for (const p of photos) {
        say('Packaging photographs', ++n, photos.length);
        const rec = { missing: false };
        try {
          const b = await EV.photos.exportBytes(p, sc.photo_mode === 'optimized' ? 'optimized' : 'original', false);
          if (!b) rec.missing = true;
          else {
            let path = X.photoPath(p, b.ext);
            if (zip.has(path)) path = X.photoPath(p, b.ext, '_' + p.id.slice(0, 6));
            await zip.add(path, b.bytes, { compress: false, date: new Date(p.taken_at || p.created_at) });
            rec.path = path; rec.bytes = b.bytes.length; rec.sha256 = await U.sha256Hex(b.bytes);
            photoBytes += b.bytes.length;
            if (p.has_edit) {
              const e = await EV.photos.exportBytes(p, sc.photo_mode === 'optimized' ? 'optimized' : 'original', true);
              if (e) { const ep = X.photoPath(p, e.ext, '_annotated'); if (!zip.has(ep)) { await zip.add(ep, e.bytes, { compress: false }); rec.edited = ep; photoBytes += e.bytes.length; } }
            }
          }
        } catch (err) {
          /* An archive that is full is not a missing photograph: stop, so the auditor can narrow the export, rather
             than deliver a package that silently lacks the remaining images. */
          if (err && err.code === 'ZIP_LIMIT') { X._photoInfo = null; throw err; }
          console.warn('[export] photograph skipped', p.code, err);
          if (!rec.path) rec.missing = true;
        }
        info.set(p.id, rec);
      }
    } else photos.forEach(function (p) { info.set(p.id, { missing: false, path: '', note: 'photographs excluded from this package' }); });
    X._photoInfo = sc.photo_mode === 'none' ? null : info;
    say('Writing data files', 0, X.FILES.length);
    let fi = 0;
    const sigs = {};   /* what this package delivers, row by row: becomes the ledger once the package has been saved */
    for (const f of X.FILES) {
      const defs = X.defs(f.table);
      const cols = defs.map(function (d) { return d.name; }).concat(['record_status', 'is_incomplete', 'incomplete_reasons']);
      const counts = { 'new': 0, updated: 0, unchanged: 0, deleted: 0, incomplete: 0 };
      const rows = [cols];
      const ts = (sigs[f.table] = {});
      col.tables[f.table].forEach(function (r) {
        const st = col.status(r);
        const reasons = r.deleted_at ? [] : X.incomplete(f.table, r);
        counts[st]++; if (reasons.length) counts.incomplete++;
        rows.push(X.row(f.table, r).concat([st, reasons.length > 0, reasons.join(' | ')]));
        const imageAbsent = f.table === 'photos' && !r.deleted_at && !(info.get(r.id) || {}).path;
        ts[r.id] = col.signature(f.table, r) + (imageAbsent ? NO_IMAGE : '');
      });
      const text = EV.csv.encode(rows);
      await zip.add(f.file, text);
      files.push({ path: f.file, table: f.table, description: f.desc, required: !!f.core, record_count: rows.length - 1, columns: cols, primary_key: 'id',
        foreign_keys: defs.filter(function (d) { return d.ref; }).map(function (d) { const tf = X.FILES.find(function (x) { return x.table === d.ref; }); return { column: d.name, references: (tf ? tf.file : d.ref) + ':id', enforced_in_database: !d.soft }; }),
        status_counts: counts, bytes: new TextEncoder().encode(text).length, sha256: await U.sha256Hex(text) });
      say('Writing data files', ++fi, X.FILES.length);
    }
    const names = new Set(files.map(function (f) { return f.path; }).concat(['audit_manifest.json', 'claude_analysis_instructions.md', 'validation_report.json', 'end_of_day_summary.md', 'data_dictionary.md']));
    const val = X.validate(col, X._photoInfo, names);
    const sum = X.summarize(col);
    const eod = X.endOfDay(col, sum, val);
    const prof = EV.auth.profile();
    const manifest = {
      package_format: 'av-environment-audit-export', format_version: EV.APP.exportFormat,
      export_id: code, export_uuid: uuid, generated_at: sc.collected_at, generated_at_local: U.isoLocal(sc.collected_at), timezone: U.tz(),
      generated_by: { name: prof.name || 'Auditor', email: prof.email || null, role: prof.role || 'lead_auditor' },
      application: { name: EV.APP.short, version: EV.APP.version, build: EV.APP.build },
      organization: { id: store.orgId(), name: store.kvGet('org_name') || null, code_prefix: store.orgCode() },
      contains_demo_data: X.hasDemoRows(col.tables),
      scope: { mode: sc.mode, label: X.scopeLabel(sc), window_start: sc.window_start, window_end: sc.window_end, filters: sc.filters, photo_mode: sc.photo_mode, is_reexport: !!sc.reexport_of, reexport_of: sc.reexport_of_code || null,
        note: sc.reexport_of ? 'Repeats the scope of an earlier export. Records show their CURRENT state; history of changes is in activity_log.csv.' : undefined },
      baseline: { previous_export_id: sc.baseline_export_code, previous_export_at: sc.baseline_at, method: 'delivery_ledger',
        meaning: 'record_status compares each row with the last version of that same row that was delivered in ANY earlier package from this device ' +
          '(a per-record delivery ledger), not with a point in time. An earlier package that covered only one day, one floor or a repeated window therefore never hides a change.' +
          (sc.baseline_at ? '' : ' No package has been delivered from this device yet, so every row is “new”.') },
      record_status_definitions: {
        'new': 'Never delivered in an earlier package from this device. Insert into the master workbook.',
        updated: 'Delivered before, and the row is different now — the record was edited, or a derived column changed (for example a room’s audit_state, or an audit’s progress figures). Update the matching row by id, subject to the reconciliation rules.',
        unchanged: 'Identical to the version already delivered. Included because another record in this package refers to it, or because this is a date-based or full export.',
        deleted: 'Delivered before and since deleted in the application. Do NOT delete the row in the master workbook: mark it as withdrawn and keep its history.',
        incomplete: 'Reported separately in is_incomplete / incomplete_reasons because a record can be both new and incomplete.'
      },
      id_conventions: { primary_key: 'id (UUID) — permanent, never reused; use it as the merge key', human_code: 'code — e.g. ' + store.orgCode() + '-RM-0004 rooms, -DV- devices, -AU- audits, -FN- findings, -BL- backlog, -IT- coordination requests, -NA- infrastructure, -SP- spares, -PH- photographs',
        note: 'Codes are allocated on the capturing device. The application renumbers a clash it can see (a record arriving from a workspace or a restored backup), but two devices that send new records at the same moment can still issue the same code: always merge on id, never on code.' },
      conventions: { timestamps: 'ISO 8601, UTC (Z) unless a column name ends in _local', dates: 'YYYY-MM-DD', csv: { encoding: 'UTF-8', byte_order_mark: false, delimiter: ',', quote: '"', line_ending: 'CRLF', header_row: true,
          formula_escaping: 'none — values are exactly as recorded. Read every cell as text; never let a spreadsheet evaluate a cell as a formula.' },
        multi_value_separator: ' | ', booleans: 'true / false', empty: 'An empty cell means “not recorded”. It never means zero, “none” or “not applicable”.' },
      enumerations: {
        verification_status: S.ID_STATUS.map(function (x) { return { value: x[0], label: x[1] }; }), verification_status_columns: ['devices.ip_status', 'devices.mac_status', 'devices.serial_status'],
        identification_status: [{ value: 'complete', label: 'IP, MAC and serial are each recorded or marked not applicable' }, { value: 'incomplete', label: 'At least one of IP, MAC or serial is missing' }],
        functional_test_result: S.TEST_RESULTS.map(function (x) { return { value: x[0], label: x[1] }; }),
        network_check_status: S.NETWORK_CHECK_STATUS.map(function (x) { return { value: x[0], label: x[1] }; }), audit_status: S.AUDIT_STATUS.map(function (x) { return { value: x[0], label: x[1] }; }),
        finding_classification: S.CLASSIFICATION.map(function (x) { return { value: x[0], label: x[1] }; }), finding_status: S.FINDING_STATUS.map(function (x) { return { value: x[0], label: x[1] }; }),
        note_type: S.NOTE_TYPES.map(function (x) { return { value: x[0], label: x[1] }; }), root_cause_confidence: S.ROOT_CAUSE_CONFIDENCE.map(function (x) { return { value: x[0], label: x[1] }; }),
        validation_status: S.VALIDATION_STATUS.map(function (x) { return { value: x[0], label: x[1] }; }), dependency_status: S.DEP_STATUS.map(function (x) { return { value: x[0], label: x[1] }; }),
        priority: S.PRIORITIES.map(function (x) { return { value: x[0], label: x[1], definition: x[2] }; }), backlog_status: S.BACKLOG_STATUSES, backlog_closed_statuses: S.BACKLOG_CLOSED,
        coordination_status: S.IT_STATUSES, coordination_closed_statuses: S.IT_CLOSED, coordination_parties: S.IT_PARTIES, finding_category: S.FINDING_CATEGORIES, device_category: S.DEVICE_CATEGORIES,
        room_type: S.ROOM_TYPES, photo_category: S.PHOTO_CATEGORIES
      },
      verification_precedence: ['verified_onsite', 'verified_mgmt', 'awaiting_it', 'awaiting_vendor', 'unknown'],
      summary: sum,
      end_of_day: eod,
      files: files.concat([
        { path: 'claude_analysis_instructions.md', description: 'How to analyse this package and merge it into the master workbook.' },
        { path: 'data_dictionary.md', description: 'Every file and column, with meaning and allowed values.' },
        { path: 'validation_report.json', description: 'Pre-export validation: structural checks and data-quality exceptions.' },
        { path: 'end_of_day_summary.md', description: 'Human-readable summary of this export and priorities for the next visit.' }
      ]),
      photographs: { included: sc.photo_mode !== 'none', quality: sc.photo_mode, count: photos.length, files_written: Array.from(info.values()).filter(function (i) { return i.path; }).length,
        missing_files: Array.from(info.values()).filter(function (i) { return i.missing; }).length, total_bytes: photoBytes, directory_pattern: 'photographs/<building>/<floor>/<room>/<device code_hostname, or "room" for photographs not tied to a device>/<photo code>_<category>.<ext>',
        index_file: 'photo_index.csv',
        note: sc.photo_mode === 'none' ? 'Index only: this package contains no image files. The photographs remain on the capturing device and are packaged by a later export that includes images.'
          : sc.photo_mode === 'optimized' ? 'Images in this package are re-encoded JPEG renditions (longest edge at most 2048 px), not the original files. The originals remain on the capturing device. A photograph that was rotated or annotated also has an “_annotated” rendition.'
            : 'Original files are packaged unmodified. A photograph that was rotated or annotated also has an “_annotated” rendition; the original is always kept.' },
      validation: { result: val.result, structural_errors: val.structural_errors, warning_checks: val.warning_checks, exception_count: val.exception_count, report: 'validation_report.json' },
      previous_exports: X.history().filter(function (e) { return e.status === 'success'; }).slice(0, 30).map(function (e) { return { export_id: e.code, generated_at: e.created_at, mode: e.mode, records: (e.counts || {}).record_total }; })
    };
    await zip.add('claude_analysis_instructions.md', EV.handoff.analysisInstructions(manifest));
    await zip.add('data_dictionary.md', EV.handoff.dataDictionary(manifest));
    await zip.add('validation_report.json', JSON.stringify(val, null, 2));
    await zip.add('end_of_day_summary.md', eodMarkdown(code, sc, sum, eod, Object.assign({ tables_checked: col.tables }, val)));
    await zip.add('audit_manifest.json', JSON.stringify(manifest, null, 2));
    say('Finalising package', 1, 1);
    const blob = zip.finish();
    X._photoInfo = null;
    const filename = store.orgCode() + '_AV_Audit_Export_' + U.localDate() + '_EXP-' + code.split('-').pop() + '.zip';
    const lightVal = { result: val.result, structural_errors: val.structural_errors, warning_checks: val.warning_checks, exception_count: val.exception_count,
      checks: val.checks.map(function (c) { return { name: c.name, status: c.status, count: c.count, detail: c.detail, items: c.items.slice(0, 25) }; }) };
    const rec = store.create('exports', { id: uuid, code: code, created_at: sc.collected_at, mode: sc.mode, window_start: sc.window_start, window_end: sc.window_end, baseline_export_id: sc.baseline_export_id,
      baseline_at: sc.baseline_at, filters: sc.filters, counts: Object.assign({ files: zip.count(), bytes: blob.size }, sum, { incomplete_audits: sum.incomplete_audits.length, floor_ids: undefined }), validation: lightVal, summary: eod,
      filename: filename, photo_mode: sc.photo_mode, status: 'generated', is_demo: false }, { silent: true });
    X.last = { id: rec.id, blob: blob, filename: filename, manifest: manifest, validation: val, summary: sum, eod: eod, code: code, sigs: sigs };
    return X.last;
  };
  /* A package counts as delivered — its rows enter the ledger — only once it has been handed over: the share sheet
     completed, or a download was started. A browser cannot confirm that a download reached the disk, so the most
     recent delivery can always be voided (X.voidExport), which puts the ledger back exactly as it was. */
  X.deliver = async function (pkg, share) {
    const res = share ? await EV.shareFile(pkg.blob, pkg.filename, 'application/zip') : await EV.saveFile(pkg.blob, pkg.filename, 'application/zip');
    if (res.ok) {
      const e = store.get('exports', pkg.id);
      /* a voided package that is saved after all is delivered after all (rows changed since it was built simply read
         "updated" in the next package) */
      if (e && (e.status === 'generated' || e.status === 'void')) {
        commitLedger(pkg);
        store.update('exports', pkg.id, { status: 'success' }, { silent: true });
        store.log({ action: 'exported', table: 'exports', rec: e, summary: 'Audit package ' + e.code + ' exported — ' + (e.counts.record_total || 0) + ' records, ' + (e.counts.photographs || 0) + ' photographs' });
      }
    }
    return res;
  };
  /* Only the most recent delivery can be undone exactly; an older package is sent again with "Repeat". */
  X.canVoid = function (id) { const l = store.kvGet('export_last'); return !!l && l.export_id === id; };
  X.voidExport = function (id) {
    const l = store.kvGet('export_last');
    if (!l || l.export_id !== id) throw new Error('Only the most recent delivered export can be voided. To send the records of an older export again, use Repeat on it.');
    const led = Object.assign({}, X.ledger());
    Object.keys(l.prev).forEach(function (t) {
      const cur = Object.assign({}, led[t] || {});
      Object.keys(l.prev[t]).forEach(function (rid) { if (l.prev[t][rid] === null) delete cur[rid]; else cur[rid] = l.prev[t][rid]; });
      led[t] = cur;
    });
    store.kvSet('export_ledger', led);
    store.kvDel('export_last');
    const e = store.get('exports', id);
    store.update('exports', id, { status: 'void' }, { silent: true });
    if (e) store.log({ action: 'export_voided', table: 'exports', rec: e, summary: 'Export ' + e.code + ' voided — its records will be sent again' });
  };
})();
