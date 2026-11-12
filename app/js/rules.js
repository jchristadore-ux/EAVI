/* rules.js — application intelligence derived strictly from recorded data.
 * Nothing here invents values: rules flag gaps, surface patterns and propose actions that the auditor
 * must confirm. Observed facts, interpretations, hypotheses and recommendations stay separate. */
(function () {
  'use strict';
  const EV = window.EV, U = EV.U, S = EV.S, store = EV.store;
  const R = (EV.rules = {});

  function memo(fn) { let v = -1, cache; return function () { if (v !== store.version) { cache = fn(); v = store.version; } return cache; }; }
  function memoKey(fn) {
    let v = -1; const m = new Map();
    return function (key) { if (v !== store.version) { m.clear(); v = store.version; } if (!m.has(key)) m.set(key, fn(key)); return m.get(key); };
  }

  R.memo = memo;
  R.memoKey = memoKey;

  /* ------------------------------------------------------------------ naming helpers */
  R.roomLabel = function (room) { return room ? ((room.number || '') + ' ' + (room.name || '')).trim() : '—'; };
  R.floorLabel = function (floor) { return floor ? 'Floor ' + floor.number : '—'; };
  R.where = function (rec) {
    if (!rec) return '';
    const parts = [];
    const f = store.get('floors', rec.floor_id); if (f) parts.push('Floor ' + f.number);
    const r = store.get('rooms', rec.room_id); if (r) parts.push(r.number || r.name);
    return parts.join(' · ');
  };
  R.deviceLabel = function (d) {
    if (!d) return '—';
    const mm = [d.manufacturer, d.model].filter(Boolean).join(' ');
    return d.hostname ? d.hostname + (mm ? ' — ' + mm : '') : (mm || S.title('devices', d));
  };
  R.deviceType = function (d) { return d.category === 'Other' && d.custom_category ? d.custom_category : (d.category || 'Device'); };

  /* ------------------------------------------------------------------ identification validation */
  R.ipValid = function (s) {
    s = String(s || '').trim();
    if (/^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(s)) return true;
    return s.indexOf(':') >= 0 && /^[0-9a-fA-F:]{3,39}$/.test(s); /* permissive IPv6 */
  };
  /* Tidies what is typed into AA:BB:CC:DD:EE:FF. Only real separators are removed. Text that contains anything else
     (a pasted "MAC: 00:00:5E…", a label, a 13th digit) is left exactly as entered, so it is flagged as invalid
     instead of being quietly turned into a different, well-formed address. */
  R.macFormat = function (s) {
    const raw = String(s || '').trim();
    const hex = raw.replace(/[\s:.\-]/g, '');
    if (!hex) return '';
    if (/[^0-9a-fA-F]/.test(hex) || hex.length > 12) return raw;
    return (hex.toUpperCase().match(/.{1,2}/g) || []).join(':');
  };
  R.macValid = function (s) { return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(String(s || '').trim().toUpperCase()); };

  const ID_FIELDS = (R.ID_FIELDS = [
    { k: 'ip_address', s: 'ip_status', label: 'IP address', short: 'IP' },
    { k: 'mac_address', s: 'mac_status', label: 'MAC address', short: 'MAC' },
    { k: 'serial_number', s: 'serial_status', label: 'Serial number', short: 'Serial' }
  ]);
  /* 'verified' | 'recorded' (value present, not yet verified) | 'missing' | 'na' */
  R.idState = function (d, f) {
    const st = d[f.s] || 'unknown';
    if (st === 'not_applicable') return 'na';
    if (U.blank(d[f.k])) return 'missing';
    return (st === 'verified_onsite' || st === 'verified_mgmt') ? 'verified' : 'recorded';
  };
  R.isNetworked = function (d) {
    if (d.ip_status === 'not_applicable' && d.mac_status === 'not_applicable') return false;
    return d.connection_type !== 'Not networked' && d.connection_type !== 'USB only';
  };
  const devCache = new WeakMap();
  R.device = function (d) {
    let r = devCache.get(d);
    if (r) return r;
    const states = {}, missing = [], unverified = [], invalid = [], missingRequired = [];
    ID_FIELDS.forEach(function (f) {
      const st = R.idState(d, f);
      states[f.k] = st;
      if (st === 'missing') missing.push(f.label);
      else if (st === 'recorded') unverified.push(f.label);
    });
    if (!U.blank(d.ip_address) && !R.ipValid(d.ip_address)) invalid.push('IP address format looks invalid');
    if (!U.blank(d.mac_address) && !R.macValid(d.mac_address)) invalid.push('MAC address should be 12 hex digits');
    if (U.blank(d.category)) missingRequired.push('Device role/type');
    if (U.blank(d.manufacturer)) missingRequired.push('Manufacturer');
    if (U.blank(d.model)) missingRequired.push('Model');
    const networked = R.isNetworked(d);
    if (networked && U.blank(d.hostname)) missingRequired.push('Hostname/device name');
    r = {
      states: states, missing: missing, unverified: unverified, invalid: invalid, missingRequired: missingRequired, networked: networked,
      identified: missing.length === 0,
      verified: missing.length === 0 && unverified.length === 0 && missingRequired.length === 0 && invalid.length === 0
    };
    devCache.set(d, r);
    return r;
  };
  /* "Live" means in service and in scope: not archived itself, and not inside an archived room, floor or building. */
  R.liveDevices = memo(function () {
    const rooms = new Set(R.liveRooms().map(function (r) { return r.id; }));
    return store.all('devices').filter(function (d) {
      if (d.archived) return false;
      if (d.room_id) return rooms.has(d.room_id);
      const f = store.get('floors', d.floor_id), b = store.get('buildings', d.building_id);
      return !(f && f.archived) && !(b && b.archived);
    });
  });
  R.roomDevices = function (roomId) { return store.by('devices', 'room_id', roomId).filter(function (d) { return !d.archived; }); };
  R.deviceStats = memo(function () {
    const devs = R.liveDevices();
    const out = { total: devs.length, networked: 0, incomplete: 0, verified: 0, missingIp: 0, missingMac: 0, missingSerial: 0, unverified: 0, missingRequired: 0,
      noPort: 0, noFirmware: 0, byField: {} };
    ID_FIELDS.forEach(function (f) { out.byField[f.k] = { verified: 0, recorded: 0, missing: 0, na: 0 }; });
    devs.forEach(function (d) {
      const r = R.device(d);
      if (r.networked) out.networked++;
      if (!r.identified) out.incomplete++;
      if (r.verified) out.verified++;
      if (r.unverified.length) out.unverified++;
      if (r.missingRequired.length) out.missingRequired++;
      if (r.states.ip_address === 'missing') out.missingIp++;
      if (r.states.mac_address === 'missing') out.missingMac++;
      if (r.states.serial_number === 'missing') out.missingSerial++;
      if (r.networked && U.blank(d.switch_port)) out.noPort++;
      if (U.blank(d.firmware_version) && d.category !== 'Display' && r.networked) out.noFirmware++;
      ID_FIELDS.forEach(function (f) { out.byField[f.k][r.states[f.k]]++; });
    });
    return out;
  });
  /* Values recorded on more than one device — reported as conflicts, never auto-resolved. */
  R.duplicates = memo(function () {
    const out = [];
    [['ip_address', 'IP address'], ['mac_address', 'MAC address'], ['serial_number', 'Serial number'], ['hostname', 'Hostname']].forEach(function (pair) {
      const groups = U.groupBy(R.liveDevices().filter(function (d) { return !U.blank(d[pair[0]]); }), function (d) { return String(d[pair[0]]).trim().toLowerCase(); });
      groups.forEach(function (list, value) { if (list.length > 1) out.push({ field: pair[0], label: pair[1], value: list[0][pair[0]], devices: list }); });
    });
    /* two devices recorded on the same port of the same documented switch */
    U.groupBy(R.liveDevices().filter(function (d) { return d.switch_asset_id && !U.blank(d.switch_port); }), function (d) { return d.switch_asset_id + '|' + String(d.switch_port).trim().toLowerCase(); })
      .forEach(function (list) {
        if (list.length < 2) return;
        const sw = store.get('infra_assets', list[0].switch_asset_id);
        out.push({ field: 'switch_port', label: 'Switch port', value: (sw ? sw.name + ' ' : '') + list[0].switch_port, devices: list });
      });
    return out;
  });

  /* ------------------------------------------------------------------ audits */
  const SUMMARY_ROOM_FIELDS = [['room_type', 'Room type'], ['capacity', 'Capacity'], ['conferencing_platform', 'Primary conferencing platform'],
    ['control_platform', 'AV control platform'], ['dsp_platform', 'DSP platform'], ['display_config', 'Display configuration'],
    ['camera_config', 'Camera configuration'], ['microphone_config', 'Microphone configuration'], ['scheduling_platform', 'Room scheduling platform']];
  const SUMMARY_AUDIT_FIELDS = [['audit_date', 'Audit date'], ['auditor', 'Auditor'], ['operational_status', 'Current operational status']];
  R.SUMMARY_ROOM_FIELDS = SUMMARY_ROOM_FIELDS;
  R.auditRooms = function (audit) {
    if (audit.configuration_id) {
      /* always in the same order (by room number), whatever order the member rows were created or loaded in */
      return U.sortBy(store.by('room_configuration_members', 'configuration_id', audit.configuration_id)
        .map(function (m) { return store.get('rooms', m.room_id); }).filter(Boolean), function (r) { return (r.number || r.name || '') + ' ' + r.id; });
    }
    const room = store.get('rooms', audit.room_id);
    return room ? [room] : [];
  };
  R.auditTitle = function (audit) {
    if (audit.configuration_id) { const c = store.get('room_configurations', audit.configuration_id); return c ? c.name : 'Combined configuration'; }
    return R.roomLabel(store.get('rooms', audit.room_id));
  };
  R.auditDevices = function (audit) {
    let out = [];
    R.auditRooms(audit).forEach(function (r) { out = out.concat(R.roomDevices(r.id)); });
    return out;
  };
  /* The live finding recorded for a functional test, or null (also when that finding has been deleted). */
  R.testFinding = function (t) { return t && t.finding_id ? (store.get('findings', t.finding_id) || null) : null; };
  R.sectionState = function (auditId, key) {
    const row = store.by('audit_sections', 'audit_id', auditId).find(function (s) { return s.section_key === key; });
    return row || null;
  };
  R.auditProgress = memoKey(function (auditId) {
    const audit = store.get('audits', auditId);
    if (!audit) return null;
    const rooms = R.auditRooms(audit);
    const isConfig = !!audit.configuration_id;
    /* space summary */
    const missingSummary = [];
    if (isConfig) {
      const cfg = store.get('room_configurations', audit.configuration_id) || {};
      if (U.blank(cfg.capacity)) missingSummary.push('Combined capacity');
      if (U.blank(cfg.description)) missingSummary.push('Configuration description');
    } else {
      const room = rooms[0] || {};
      SUMMARY_ROOM_FIELDS.forEach(function (f) { if (U.blank(room[f[0]])) missingSummary.push(f[1]); });
    }
    SUMMARY_AUDIT_FIELDS.forEach(function (f) { if (U.blank(audit[f[0]])) missingSummary.push(f[1]); });
    const summaryTotal = (isConfig ? 2 : SUMMARY_ROOM_FIELDS.length) + SUMMARY_AUDIT_FIELDS.length;
    /* devices */
    const devs = R.auditDevices(audit);
    const devNa = (R.sectionState(auditId, 'devices') || {}).state === 'na';
    let devVerified = 0, devIncomplete = 0;
    devs.forEach(function (d) { const r = R.device(d); if (r.verified) devVerified++; if (!r.identified) devIncomplete++; });
    /* functional tests */
    const tests = store.by('functional_tests', 'audit_id', auditId);
    let tDone = 0, tFail = 0, tInv = 0, tPass = 0, tNa = 0, tPendingSuggestion = 0;
    tests.forEach(function (t) {
      if (t.result && t.result !== 'not_tested') tDone++;
      if (t.result === 'fail') tFail++; else if (t.result === 'investigate') tInv++; else if (t.result === 'pass') tPass++; else if (t.result === 'na') tNa++;
      /* reviewed = a finding that still exists, or a recorded dismissal; a finding that was since deleted does not count */
      if ((t.result === 'fail' || t.result === 'investigate') && !R.testFinding(t) && t.suggestion_state !== 'dismissed') tPendingSuggestion++;
    });
    /* network validation */
    const checks = store.by('network_checks', 'audit_id', auditId);
    let nDone = 0, nIssue = 0, nAwait = 0;
    checks.forEach(function (c) {
      if (c.status === 'verified' || c.status === 'na') nDone++;
      if (c.status === 'issue') nIssue++; if (c.status === 'awaiting_it') nAwait++;
    });
    const photos = store.by('photos', 'audit_id', auditId).length;
    const findings = store.by('findings', 'audit_id', auditId).filter(function (f) { return f.status !== 'dismissed' && f.status !== 'duplicate'; }).length;
    const notes = store.by('audit_notes', 'audit_id', auditId).length;

    const pSummary = (summaryTotal - missingSummary.length) / summaryTotal;
    const pDevices = devs.length ? devVerified / devs.length : (devNa ? 1 : 0);
    const pTests = tests.length ? tDone / tests.length : 0;
    const pNet = checks.length ? nDone / checks.length : 0;
    const pPhotos = photos > 0 ? 1 : 0;
    const overall = Math.round(((pSummary + pDevices + pTests + pNet + pPhotos) / 5) * 100);

    const blockers = [];
    if (missingSummary.length) blockers.push('Space summary incomplete: ' + missingSummary.join(', '));
    if (!devs.length && !devNa) blockers.push('No devices recorded — add devices or confirm that this space has no AV devices');
    if (devs.length && devVerified < devs.length) blockers.push((devs.length - devVerified) + ' of ' + devs.length + ' devices are not fully identified and verified');
    const one = function (n, s, p) { return n + ' ' + (n === 1 ? s : p); };
    if (tests.length - tDone > 0) blockers.push(one(tests.length - tDone, 'functional test has', 'functional tests have') + ' no result');
    if (tPendingSuggestion > 0) blockers.push(one(tPendingSuggestion, 'failed or investigated test has', 'failed or investigated tests have') + ' not been reviewed for a finding');
    if (checks.length - nDone > 0) blockers.push(one(checks.length - nDone, 'network validation check is', 'network validation checks are') + ' unresolved');
    if (!photos) blockers.push('No photographs captured');
    return {
      audit: audit, rooms: rooms, isConfig: isConfig,
      summary: { done: summaryTotal - missingSummary.length, total: summaryTotal, missing: missingSummary, complete: missingSummary.length === 0 },
      devices: { total: devs.length, verified: devVerified, incomplete: devIncomplete, na: devNa, complete: devs.length ? devVerified === devs.length : devNa },
      tests: { total: tests.length, done: tDone, fail: tFail, investigate: tInv, pass: tPass, na: tNa, pendingSuggestion: tPendingSuggestion, complete: tests.length > 0 && tDone === tests.length },
      network: { total: checks.length, done: nDone, issue: nIssue, awaiting: nAwait, pct: Math.round(pNet * 100), complete: checks.length > 0 && nDone === checks.length },
      photos: photos, findings: findings, notes: notes,
      overall: overall, blockers: blockers, canVerify: blockers.length === 0
    };
  });
  /* "Fully verified" is a statement about the records, so it is re-checked every time it is shown or exported. An
     audit that was marked fully verified and whose mandatory information has since become incomplete (a device added
     without its identification, a summary field cleared, a finding deleted) reads as "verification lapsed" until the
     gap is closed again. Its recorded status is not changed. */
  R.auditLapsed = function (a) {
    if (!a || a.status !== 'verified') return false;
    const p = R.auditProgress(a.id);
    return !!p && !p.canVerify;
  };
  R.auditStatusLabel = function (a) { return R.auditLapsed(a) ? 'Verification lapsed' : S.label(S.AUDIT_STATUS, a.status); };
  R.latestAudit = function (list) {
    let best = null;
    list.forEach(function (a) { if (!best || (a.started_at || a.created_at) > (best.started_at || best.created_at)) best = a; });
    return best;
  };
  /* 'not_started' | 'in_progress' | 'audited' | 'verified' */
  R.roomState = memoKey(function (roomId) {
    const audits = store.by('audits', 'room_id', roomId);
    if (!audits.length) return { state: 'not_started', audit: null, count: 0 };
    const open = audits.filter(function (a) { return a.status === 'in_progress'; });
    if (open.length) return { state: 'in_progress', audit: R.latestAudit(open), count: audits.length };
    const latest = R.latestAudit(audits);
    return { state: latest.status === 'verified' && !R.auditLapsed(latest) ? 'verified' : 'audited', audit: latest, count: audits.length };
  });
  R.configState = memoKey(function (configId) {
    const audits = store.by('audits', 'configuration_id', configId);
    if (!audits.length) return { state: 'not_started', audit: null, count: 0 };
    const open = audits.filter(function (a) { return a.status === 'in_progress'; });
    if (open.length) return { state: 'in_progress', audit: R.latestAudit(open), count: audits.length };
    const latest = R.latestAudit(audits);
    return { state: latest.status === 'verified' && !R.auditLapsed(latest) ? 'verified' : 'audited', audit: latest, count: audits.length };
  });
  R.STATE_LABEL = { not_started: 'Not started', in_progress: 'In progress', audited: 'Audited', verified: 'Fully verified' };
  /* Archiving a floor or a building takes its rooms out of the active lists and counts as well. */
  R.liveFloors = memo(function () {
    return store.all('floors').filter(function (f) { const b = store.get('buildings', f.building_id); return !f.archived && !(b && b.archived); });
  });
  R.liveRooms = memo(function () {
    const floors = new Set(R.liveFloors().map(function (f) { return f.id; }));
    return store.all('rooms').filter(function (r) { return !r.archived && floors.has(r.floor_id); });
  });
  R.floorRooms = function (floorId) {
    return U.sortBy(store.by('rooms', 'floor_id', floorId).filter(function (r) { return !r.archived; }), function (r) { return r.number || r.name; });
  };
  R.isConference = function (room) { return S.NON_CONFERENCE_TYPES.indexOf(room.room_type) < 0; };
  R.floorProgress = memoKey(function (floorId) {
    const rooms = R.floorRooms(floorId);
    const out = { total: rooms.length, audited: 0, partial: 0, notStarted: 0, verified: 0 };
    rooms.forEach(function (r) {
      const st = R.roomState(r.id).state;
      if (st === 'not_started') out.notStarted++; else if (st === 'in_progress') out.partial++; else { out.audited++; if (st === 'verified') out.verified++; }
    });
    out.pct = U.pct(out.audited, out.total);
    out.label = !out.total ? 'No spaces' : out.audited === out.total ? 'Complete' : (out.audited || out.partial) ? 'In progress' : 'Not started';
    return out;
  });
  R.buildingFloors = function (buildingId) {
    return U.sortBy(store.by('floors', 'building_id', buildingId).filter(function (f) { return !f.archived; }), function (f) { return f.sort_order != null ? U.pad(f.sort_order, 6) : f.number; });
  };
  R.criticality = function (room) {
    if (room.criticality) return room.criticality;
    return S.CRITICAL_TYPES.indexOf(room.room_type) >= 0 ? 'critical' : 'standard';
  };

  /* ------------------------------------------------------------------ dashboard metrics */
  R.metrics = memo(function () {
    const buildings = store.all('buildings').filter(function (b) { return !b.archived; });
    const floors = R.liveFloors();
    const rooms = R.liveRooms();
    /* "audited" means finished: every space on the floor has a completed audit (a floor with an audit merely started
       is "in progress", as the floor list says); a building is audited when every one of its floors with spaces is. */
    const floorDone = function (f) { const fp = R.floorProgress(f.id); return fp.total > 0 && fp.audited === fp.total; };
    const auditedFloors = new Set(floors.filter(floorDone).map(function (f) { return f.id; }));
    const auditedBuildings = new Set(buildings.filter(function (b) {
      const fl = floors.filter(function (f) { return f.building_id === b.id && R.floorProgress(f.id).total > 0; });
      return fl.length > 0 && fl.every(function (f) { return auditedFloors.has(f.id); });
    }).map(function (b) { return b.id; }));
    let completed = 0, inProgress = 0, notStarted = 0;
    rooms.forEach(function (r) { const st = R.roomState(r.id).state; if (st === 'not_started') notStarted++; else if (st === 'in_progress') inProgress++; else completed++; });
    const ds = R.deviceStats();
    const backlog = store.all('backlog_items');
    const openBacklog = backlog.filter(function (b) { return S.BACKLOG_CLOSED.indexOf(b.status) < 0; });
    const untriaged = store.all('findings').filter(function (f) { return f.status === 'open'; });
    const it = store.all('it_requests');
    const considered = backlog.filter(function (b) { return b.status !== 'Rejected'; });
    return {
      buildings: buildings.length, buildingsAudited: buildings.filter(function (b) { return auditedBuildings.has(b.id); }).length,
      floors: floors.length, floorsAudited: floors.filter(function (f) { return auditedFloors.has(f.id); }).length,
      spaces: rooms.length, conferenceSpaces: rooms.filter(R.isConference).length,
      roomsCompleted: completed, roomsInProgress: inProgress, roomsAwaiting: notStarted,
      devices: ds.total, networkDevices: ds.networked, devicesIncomplete: ds.incomplete,
      openFindings: openBacklog.length + untriaged.length, openBacklog: openBacklog.length, untriaged: untriaged.length,
      p1: openBacklog.filter(function (b) { return b.priority === 'P1'; }).length,
      p2: openBacklog.filter(function (b) { return b.priority === 'P2'; }).length,
      p3: openBacklog.filter(function (b) { return b.priority === 'P3'; }).length,
      itOutstanding: it.filter(function (r) { return r.requested_from === 'Client IT' && S.IT_CLOSED.indexOf(r.status) < 0; }).length,
      pdOutstanding: it.filter(function (r) { return r.requested_from === 'PepperDash' && S.IT_CLOSED.indexOf(r.status) < 0; }).length,
      requestsOpen: it.filter(function (r) { return S.IT_CLOSED.indexOf(r.status) < 0; }).length,
      backlogTotal: considered.length, backlogDone: considered.filter(function (b) { return b.status === 'Completed'; }).length,
      backlogPct: U.pct(considered.filter(function (b) { return b.status === 'Completed'; }).length, considered.length),
      photos: store.count('photos')
    };
  });

  /* ------------------------------------------------------------------ spare equipment */
  R.spare = function (s) {
    const flags = [];
    const qty = Number(s.quantity) || 0, min = Number(s.min_stock) || 0;
    /* a quantity nobody has recorded is unknown, not zero */
    if (U.blank(s.quantity)) flags.push({ key: 'uncounted', label: 'Quantity not recorded', tone: 'warn' });
    else if (qty === 0) flags.push({ key: 'zero', label: 'Zero available', tone: 'danger' });
    else if (min > 0 && qty < min) flags.push({ key: 'low', label: 'Below minimum', tone: 'warn' });
    if (U.blank(s.manufacturer) || U.blank(s.model)) flags.push({ key: 'unidentified', label: 'Unidentified stock', tone: 'warn' });
    let eol = s.lifecycle === 'approaching_eol' || s.lifecycle === 'eol';
    if (!eol && s.eol_date) { const d = U.asDate(s.eol_date); if (d && d.getTime() - Date.now() < 365 * 86400000) eol = true; }
    if (eol) flags.push({ key: 'eol', label: s.lifecycle === 'eol' ? 'End of life' : 'Approaching end of life', tone: s.lifecycle === 'eol' ? 'danger' : 'warn' });
    return flags;
  };
  R.liveSpares = memo(function () { return store.all('spare_items').filter(function (s) { return !s.archived; }); });
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  R.spareFor = function (device) {
    const model = norm(device.model);
    if (!model) return [];
    return R.liveSpares().filter(function (s) {
      if ((Number(s.quantity) || 0) <= 0) return false;
      return norm(s.model) === model || norm(s.compatibility).indexOf(model) >= 0 || norm(s.part_number) === model;
    });
  };
  R.spareStats = memo(function () {
    const out = { total: 0, zero: 0, low: 0, uncounted: 0, unidentified: 0, eol: 0, units: 0 };
    R.liveSpares().forEach(function (s) {
      out.total++; out.units += Number(s.quantity) || 0;
      R.spare(s).forEach(function (f) { out[f.key]++; });
    });
    return out;
  });
  /* Critical rooms whose room-critical devices have no in-stock spare. */
  R.spareCoverage = memo(function () {
    const out = [];
    R.liveRooms().forEach(function (room) {
      if (R.criticality(room) !== 'critical') return;
      const gaps = [];
      R.roomDevices(room.id).forEach(function (d) {
        if (S.ROOM_CRITICAL_CATEGORIES.indexOf(d.category) < 0) return;
        if (!R.spareFor(d).length) gaps.push(d);
      });
      if (gaps.length) out.push({ room: room, devices: gaps });
    });
    return out;
  });

  /* ------------------------------------------------------------------ priority guidance (advisory only) */
  R.suggestPriority = function (b) {
    const reasons = [];
    let high = 0, medium = 0, known = 0;
    function lvl(v, label) {
      if (!v || v === 'Unknown') return;
      known++;
      if (v === 'High') { high++; reasons.push('High ' + label); } else if (v === 'Medium') { medium++; reasons.push('Medium ' + label); }
    }
    lvl(b.business_impact, 'business impact');
    lvl(b.user_friction, 'user friction');
    lvl(b.risk_level, 'operational risk');
    if (b.frequency && b.frequency !== 'Unknown') {
      known++;
      if (b.frequency === 'Constant' || b.frequency.indexOf('Frequent') === 0) { high++; reasons.push('Repeated disruption (' + b.frequency.toLowerCase() + ')'); }
      else if (b.frequency === 'Intermittent') { medium++; reasons.push('Intermittent occurrence'); }
    }
    if (b.meeting_impact && b.meeting_impact !== 'Unknown') {
      known++;
      if (b.meeting_impact === 'Meeting cannot proceed') { high += 2; reasons.push('Meetings cannot proceed'); }
      else if (b.meeting_impact === 'Meeting degraded') { medium++; reasons.push('Meetings are degraded'); }
      else if (b.meeting_impact === 'Workaround required') { medium++; reasons.push('Workaround required'); }
    }
    if (b.exec_visibility) { high++; known++; reasons.push('Executive visibility'); }
    if (b.safety_concern) { high += 2; known++; reasons.push('Safety concern'); }
    const room = store.get('rooms', b.room_id);
    if (room && R.criticality(room) === 'critical') { medium++; reasons.push('Executive / critical room'); }
    if (!known) return { priority: null, reasons: [], note: 'Not enough impact information yet. Record business impact, frequency, user friction and operational risk to get guidance.' };
    let p = 'P3';
    if (b.safety_concern || high >= 2) p = 'P1';
    else if (high === 1 || medium >= 1) p = 'P2';
    let note = '';
    const quick = b.effort && (b.effort.indexOf('XS') === 0 || b.effort.indexOf('S ') === 0);
    if (quick && p !== 'P1') note = 'Low implementation effort — candidate quick win.';
    if (b.effort && b.effort.indexOf('XL') === 0 && p === 'P1') note = 'High effort: consider an interim mitigation while the full fix is scheduled.';
    return { priority: p, reasons: reasons, note: note };
  };

  /* ------------------------------------------------------------------ duplicate / similarity detection */
  const STOP = new Set(('the a an and or of in on at to for with from is are was were be not no room rooms conference during when while into than ' +
    'issue issues problem problems needs need failed fail investigation test').split(' '));
  function tokens(s) {
    return new Set(String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(function (w) { return w.length > 2 && !STOP.has(w) && !/^\d+[a-z]?$/.test(w); }));
  }
  function jaccard(a, b) {
    if (!a.size || !b.size) return 0;
    let inter = 0; a.forEach(function (w) { if (b.has(w)) inter++; });
    return inter / (a.size + b.size - inter);
  }
  R.testKeyOfFinding = function (f) { const t = f.test_id ? store.getAny('functional_tests', f.test_id) : null; return t ? t.test_key : null; };
  /* Open backlog items that plausibly describe the same issue as this finding. */
  R.similarBacklog = function (f) {
    const ft = tokens(f.title + ' ' + (f.observation || ''));
    const fKey = R.testKeyOfFinding(f);
    const out = [];
    store.all('backlog_items').forEach(function (b) {
      if (S.BACKLOG_CLOSED.indexOf(b.status) >= 0 && b.status !== 'Deferred') return;
      let score = 0; const why = [];
      if (b.category && b.category === f.category) { score += 2; why.push('same category'); }
      const linked = store.by('findings', 'backlog_item_id', b.id);
      if (fKey && linked.some(function (x) { return R.testKeyOfFinding(x) === fKey; })) { score += 4; why.push('same functional test'); }
      const sim = jaccard(ft, tokens(b.title + ' ' + (b.problem_statement || '')));
      if (sim >= 0.34) { score += 3; why.push('similar wording'); } else if (sim >= 0.2) { score += 1; }
      if (f.room_id && b.room_id === f.room_id) { score += 1; why.push('same room'); }
      if (f.device_id && b.device_id === f.device_id) { score += 2; why.push('same device'); }
      if (score >= 4) out.push({ item: b, score: score, why: why });
    });
    out.sort(function (a, b) { return b.score - a.score; });
    return out.slice(0, 5);
  };
  R.similarFindings = function (f) {
    const ft = tokens(f.title + ' ' + (f.observation || ''));
    const fKey = R.testKeyOfFinding(f);
    return store.all('findings').filter(function (x) {
      if (x.id === f.id || x.status === 'dismissed') return false;
      if (x.room_id !== f.room_id) return false;
      if (fKey && R.testKeyOfFinding(x) === fKey) return true;
      return x.category === f.category && jaccard(ft, tokens(x.title + ' ' + (x.observation || ''))) >= 0.5;
    });
  };
  R.backlogRooms = function (b) {
    const ids = new Set();
    if (b.room_id) ids.add(b.room_id);
    store.by('findings', 'backlog_item_id', b.id).forEach(function (f) { if (f.room_id) ids.add(f.room_id); });
    return Array.from(ids).map(function (id) { return store.get('rooms', id); }).filter(Boolean);
  };
  R.suggestFindingFromTest = function (test, audit) {
    const meta = S.testMeta(test.test_key) || { finding: 'Other' };
    const rooms = R.auditRooms(audit);
    const where = audit.configuration_id ? R.auditTitle(audit) : (rooms[0] ? rooms[0].number || rooms[0].name : '');
    const verb = test.result === 'fail' ? 'failed' : 'needs investigation';
    return {
      title: test.test_name + ' ' + verb + (where ? ' — ' + where : ''),
      category: meta.finding,
      observation: test.comment ? test.comment : 'Functional test "' + test.test_name + '" was recorded as "' + S.label(S.TEST_RESULTS, test.result) + '" during audit ' + audit.code + '.',
      classification: 'observed_fact'
    };
  };

  /* ------------------------------------------------------------------ follow-up tasks (persisted, auto-reconciled) */
  function desiredFollowups() {
    const want = new Map();
    R.liveDevices().forEach(function (d) {
      const r = R.device(d);
      const name = R.deviceLabel(d);
      function party(statusKey) {
        const st = d[statusKey];
        return st === 'awaiting_it' ? 'Client IT' : st === 'awaiting_vendor' ? 'Vendor' : 'Auditor (onsite)';
      }
      if (r.states.ip_address === 'missing') {
        want.set('dev:' + d.id + ':ip', { kind: 'missing_ip', title: 'Obtain IP address — ' + name,
          detail: 'No IP address is recorded and the field is not marked "Not applicable". Network follow-up required.', suggested_party: party('ip_status') });
      }
      if (r.states.mac_address === 'missing') {
        want.set('dev:' + d.id + ':mac', { kind: 'missing_mac', title: 'Verify MAC address — ' + name,
          detail: U.blank(d.ip_address) ? 'No MAC address is recorded.' : 'An IP address (' + d.ip_address + ') is recorded but the MAC address is missing. Verify the MAC from the device label, device UI or switch.',
          suggested_party: party('mac_status') });
      }
      if (r.states.serial_number === 'missing') {
        want.set('dev:' + d.id + ':serial', { kind: 'missing_serial', title: 'Record serial number — ' + name,
          detail: 'No serial number is recorded. Read it from the chassis label or the management system.', suggested_party: party('serial_status') });
      }
      if (r.networked && U.blank(d.switch_port)) {
        want.set('dev:' + d.id + ':port', { kind: 'unknown_port', title: 'Identify switch port — ' + name,
          detail: 'The connected switch port is not documented. Client IT can confirm the switch/port mapping.', suggested_party: 'Client IT' });
      }
      if (r.networked && U.blank(d.firmware_version) && d.category !== 'Display') {
        want.set('dev:' + d.id + ':firmware', { kind: 'firmware_undocumented', title: 'Document firmware version — ' + name,
          detail: 'Firmware is undocumented. Lifecycle and security validation cannot be completed until it is recorded.', suggested_party: 'Auditor (onsite)' });
      }
    });
    return want;
  }
  R.reconcileFollowups = function () {
    if (store.readOnly) return;
    const want = desiredFollowups();
    const existing = new Map();
    store.all('followups').forEach(function (f) { existing.set(f.dedupe_key, f); });
    want.forEach(function (w, key) {
      const ex = existing.get(key);
      const devId = key.split(':')[1];
      const dev = store.get('devices', devId);
      if (!ex) {
        store.create('followups', Object.assign({ id: U.keyId('followup', key), dedupe_key: key, device_id: devId, room_id: dev ? dev.room_id : null, status: 'open', resolved_at: null, it_request_id: null, is_demo: !!(dev && dev.is_demo) }, w));
      } else if (ex.status === 'resolved') {
        store.update('followups', ex.id, Object.assign({ status: 'open', resolved_at: null }, w));
      } else if (ex.title !== w.title || ex.detail !== w.detail || ex.suggested_party !== w.suggested_party) {
        store.update('followups', ex.id, w);
      }
    });
    existing.forEach(function (ex, key) {
      if (!want.has(key) && ex.status !== 'resolved') store.update('followups', ex.id, { status: 'resolved', resolved_at: U.now() });
    });
  };
  const scheduleReconcile = U.debounce(function () { try { R.reconcileFollowups(); } catch (e) { console.error(e); } }, 400);
  /* which devices are live also depends on their room, floor and building being archived or restored */
  store.on(function (table) { if (table === 'devices' || table === 'rooms' || table === 'floors' || table === 'buildings' || table === '*') scheduleReconcile(); });
  R.openFollowups = memo(function () { return store.all('followups').filter(function (f) { return f.status === 'open'; }); });
  R.deviceFollowups = function (deviceId) { return store.by('followups', 'device_id', deviceId).filter(function (f) { return f.status === 'open'; }); };

  /* ------------------------------------------------------------------ derived insights */
  function insightState(key) { return store.by('insight_states', 'insight_key', key)[0] || null; }
  function trackedRequest(key) {
    return store.all('it_requests').find(function (r) { return r.source_key === key && S.IT_CLOSED.indexOf(r.status) < 0; }) || null;
  }
  function trackedFinding(key) { return store.all('findings').find(function (f) { return f.source_key === key && f.status !== 'dismissed'; }) || null; }
  R.insights = memo(function () {
    const out = [];
    function add(i) {
      const st = insightState(i.key);
      i.dismissed = !!(st && st.state === 'dismissed');
      out.push(i);
    }
    /* 1 — potential systemic issues: the same functional test failing in more than one room.
       Only the most recent audit of each space counts: a failure that a later audit of the same space no longer
       shows is history, not a current pattern. */
    const latestOf = new Map();
    store.all('audits').forEach(function (a) {
      const k = a.room_id || a.configuration_id, c = latestOf.get(k);
      if (!c || (a.started_at || a.created_at) > (c.started_at || c.created_at)) latestOf.set(k, a);
    });
    const failing = new Map();
    store.all('functional_tests').forEach(function (t) {
      if (t.result !== 'fail' && t.result !== 'investigate') return;
      const audit = store.get('audits', t.audit_id); if (!audit) return;
      if ((latestOf.get(audit.room_id || audit.configuration_id) || {}).id !== audit.id) return;
      const label = R.auditTitle(audit);
      const g = failing.get(t.test_key) || { name: t.test_name, rooms: new Map(), category: t.category };
      g.rooms.set(audit.room_id || audit.configuration_id, label);
      failing.set(t.test_key, g);
    });
    failing.forEach(function (g, key) {
      if (g.rooms.size < 2) return;
      const names = Array.from(g.rooms.values());
      const ik = 'systemic:' + key;
      const tf = trackedFinding(ik);
      add({ key: ik, kind: 'systemic', severity: 'high', title: 'Potential systemic issue: ' + g.name,
        detail: '"' + g.name + '" failed or needs investigation in ' + names.length + ' spaces: ' + names.join(', ') + '. This is a pattern in recorded results, not a confirmed common cause.',
        tracked: tf ? { table: 'findings', id: tf.id, code: tf.code } : null,
        action: { type: 'finding', label: 'Record systemic finding', prefill: {
          title: g.name + ' — recurring across ' + names.length + ' spaces', category: (S.testMeta(key) || {}).finding || 'Other',
          observation: '"' + g.name + '" was recorded as failed or needing investigation in: ' + names.join(', ') + '.',
          classification: 'observed_fact', hypothesis: '', source: 'insight', source_key: ik } } });
    });
    /* 2 — inconsistent device naming within a room */
    R.liveRooms().forEach(function (room) {
      const names = R.roomDevices(room.id).map(function (d) { return d.hostname; }).filter(function (n) { return !U.blank(n); });
      if (names.length < 3) return;
      const sig = new Set(names.map(function (n) {
        const cs = n === n.toUpperCase() ? 'U' : n === n.toLowerCase() ? 'l' : 'M';
        const sep = n.indexOf('-') >= 0 ? '-' : n.indexOf('_') >= 0 ? '_' : n.indexOf('.') >= 0 ? '.' : '0';
        return cs + sep + String(n.split(/[-_.]/)[0]).toLowerCase();
      }));
      if (sig.size < 2) return;
      const ik = 'naming:' + room.id;
      const tf = trackedFinding(ik);
      add({ key: ik, kind: 'naming', severity: 'low', room_id: room.id, title: 'Inconsistent device naming in ' + (room.number || room.name),
        detail: 'Hostnames in this room do not follow one convention: ' + names.join(', ') + '.',
        tracked: tf ? { table: 'findings', id: tf.id, code: tf.code } : null,
        action: { type: 'finding', label: 'Record documentation finding', prefill: {
          title: 'Device naming is not standardized in ' + (room.number || room.name), category: 'Documentation', room_id: room.id, floor_id: room.floor_id, building_id: room.building_id,
          observation: 'Recorded hostnames: ' + names.join(', ') + '.', classification: 'observed_fact',
          recommended_action: 'Agree a naming standard with Client IT and align device hostnames and labels.', source: 'insight', source_key: ik } } });
    });
    /* 3 — critical rooms with no in-stock spare for room-critical devices */
    R.spareCoverage().forEach(function (g) {
      const ik = 'spare:' + g.room.id;
      const tf = trackedFinding(ik);
      const list = g.devices.map(function (d) { return R.deviceType(d) + ' (' + ([d.manufacturer, d.model].filter(Boolean).join(' ') || 'model not recorded') + ')'; });
      add({ key: ik, kind: 'spare', severity: 'high', room_id: g.room.id, title: 'No spare coverage for critical room ' + (g.room.number || g.room.name),
        detail: 'No in-stock spare matches: ' + list.join('; ') + '.',
        tracked: tf ? { table: 'findings', id: tf.id, code: tf.code } : null,
        action: { type: 'finding', label: 'Record operational risk', prefill: {
          title: 'No spare replacement equipment for ' + R.roomLabel(g.room), category: 'Spare Parts', room_id: g.room.id, floor_id: g.room.floor_id, building_id: g.room.building_id,
          observation: 'Spare inventory holds no in-stock unit matching: ' + list.join('; ') + '.', classification: 'observed_fact', priority_hint: 'P1',
          recommended_action: 'Stock at least one compatible spare or document an agreed replacement path.', source: 'insight', source_key: ik } } });
    });
    /* 4 — undocumented switch ports → Client IT coordination suggestion (per room) */
    const byRoomPort = U.groupBy(R.liveDevices().filter(function (d) { return R.isNetworked(d) && U.blank(d.switch_port); }), function (d) { return d.room_id || 'none'; });
    byRoomPort.forEach(function (list, roomId) {
      const room = store.get('rooms', roomId);
      const ik = 'ports:' + roomId;
      const tr = trackedRequest(ik);
      const where = room ? (room.number || room.name) : 'unassigned devices';
      add({ key: ik, kind: 'ports', severity: 'medium', room_id: room ? room.id : null, title: 'Switch ports undocumented for ' + U.plural(list.length, 'device') + ' — ' + where,
        detail: list.map(R.deviceLabel).join('; '),
        tracked: tr ? { table: 'it_requests', id: tr.id, code: tr.code } : null,
        action: { type: 'it_request', label: 'Draft Client IT request', prefill: {
          topic: 'Switch port mapping — ' + where, requested_from: 'Client IT', request_type: 'Switch port information',
          description: 'Please confirm the switch, port, port description and VLAN for the following AV devices:\n' +
            list.map(function (d) { return '• ' + R.deviceLabel(d) + (d.mac_address ? ' — MAC ' + d.mac_address : '') + (d.ip_address ? ' — IP ' + d.ip_address : ''); }).join('\n'),
          reason: 'Switch port documentation is required to complete network validation.', needed_for: 'Network validation — ' + where,
          room_id: room ? room.id : null, floor_id: room ? room.floor_id : null, building_id: room ? room.building_id : null, priority: 'P2', source_key: ik } } });
    });
    /* 5 — undocumented firmware (per room) */
    const byRoomFw = U.groupBy(R.liveDevices().filter(function (d) { return R.isNetworked(d) && U.blank(d.firmware_version) && d.category !== 'Display'; }), function (d) { return d.room_id || 'none'; });
    byRoomFw.forEach(function (list, roomId) {
      const room = store.get('rooms', roomId);
      const where = room ? (room.number || room.name) : 'unassigned devices';
      add({ key: 'firmware:' + roomId, kind: 'firmware', severity: 'medium', room_id: room ? room.id : null,
        title: 'Firmware undocumented for ' + U.plural(list.length, 'device') + ' — ' + where,
        detail: 'Lifecycle and security validation cannot be completed: ' + list.map(R.deviceLabel).join('; '),
        tracked: null, action: { type: 'navigate', label: 'Review devices', path: '/devices?filter=firmware' } });
    });
    /* 6 — conflicting identification values */
    R.duplicates().forEach(function (dup) {
      add({ key: 'dup:' + dup.field + ':' + String(dup.value).toLowerCase(), kind: 'conflict', severity: 'high',
        title: 'Conflicting ' + dup.label + ': ' + dup.value + ' recorded on ' + dup.devices.length + ' devices',
        detail: dup.devices.map(function (d) { return R.deviceLabel(d) + (R.where(d) ? ' (' + R.where(d) + ')' : ''); }).join('; ') + '. Reconcile onsite or with IT — neither record is assumed correct.',
        tracked: null, action: { type: 'navigate', label: 'Review devices', path: '/devices?filter=conflict' } });
    });
    /* 7 — P1 items without an owner */
    store.all('backlog_items').forEach(function (b) {
      if (b.priority === 'P1' && S.BACKLOG_CLOSED.indexOf(b.status) < 0 && U.blank(b.owner)) {
        add({ key: 'owner:' + b.id, kind: 'owner', severity: 'medium', title: 'P1 item has no owner: ' + b.code, detail: b.title,
          tracked: null, action: { type: 'navigate', label: 'Open item', path: '/backlog/' + b.id } });
      }
    });
    const order = { high: 0, medium: 1, low: 2 };
    out.sort(function (a, b) { return order[a.severity] - order[b.severity]; });
    return out;
  });
  R.activeInsights = function () { return R.insights().filter(function (i) { return !i.dismissed && !i.tracked; }); };
  R.dismissInsight = function (key) {
    const ex = insightState(key);
    if (ex) store.update('insight_states', ex.id, { state: 'dismissed' }); else store.create('insight_states', { id: U.keyId('insight', store.orgId() + ':' + key), insight_key: key, state: 'dismissed', note: '' });
  };
  R.restoreInsight = function (key) { const ex = insightState(key); if (ex) store.update('insight_states', ex.id, { state: 'active' }); };

  /* ------------------------------------------------------------------ priority alerts for the Command Center */
  R.alerts = memo(function () {
    const out = [];
    const ds = R.deviceStats();
    const down = R.liveRooms().filter(function (r) { return r.operational_status === 'Out of service' || r.operational_status === 'Degraded'; });
    const blockers = store.all('backlog_items').filter(function (b) { return b.priority === 'P1' && S.BACKLOG_CLOSED.indexOf(b.status) < 0 && b.meeting_impact === 'Meeting cannot proceed'; });
    if (down.length || blockers.length) {
      out.push({ tone: 'danger', icon: 'alert', title: 'Critical room availability', count: down.length + blockers.length, path: '/backlog?priority=P1',
        detail: [down.length ? U.plural(down.length, 'room') + ' degraded or out of service (' + down.map(function (r) { return r.number || r.name; }).join(', ') + ')' : '',
          blockers.length ? U.plural(blockers.length, 'open P1 item') + ' where meetings cannot proceed' : ''].filter(Boolean).join(' · ') });
    }
    if (ds.incomplete) out.push({ tone: 'warn', icon: 'cpu', title: 'Missing device identification', count: ds.incomplete, path: '/devices?filter=incomplete',
      detail: U.plural(ds.incomplete, 'device') + ' missing IP, MAC or serial number' });
    if (ds.missingIp) out.push({ tone: 'warn', icon: 'network', title: 'Devices with unknown IP addresses', count: ds.missingIp, path: '/devices?filter=ip', detail: 'Flagged for network follow-up' });
    if (ds.missingMac) out.push({ tone: 'warn', icon: 'network', title: 'Devices with missing MAC addresses', count: ds.missingMac, path: '/devices?filter=mac', detail: 'MAC verification required' });
    if (ds.missingSerial) out.push({ tone: 'warn', icon: 'cpu', title: 'Devices with missing serial numbers', count: ds.missingSerial, path: '/devices?filter=serial', detail: 'Read from chassis label or management system' });
    const awaiting = store.all('infra_assets').filter(function (a) { return !a.archived && (a.validation_status === 'awaiting_it' || a.validation_status === 'unknown' || !a.validation_status); }).length;
    const gaps = ds.noPort + awaiting;
    if (gaps) out.push({ tone: 'info', icon: 'layers', title: 'Network documentation gaps', count: gaps, path: '/infrastructure',
      detail: [ds.noPort ? U.plural(ds.noPort, 'device') + ' without a documented switch port' : '', awaiting ? U.plural(awaiting, 'infrastructure record') + ' awaiting IT validation' : ''].filter(Boolean).join(' · ') });
    const infraRisk = store.all('backlog_items').filter(function (b) { return S.BACKLOG_CLOSED.indexOf(b.status) < 0 && (b.category === 'Infrastructure' || b.category === 'Network & Security'); }).length;
    const deps = store.all('network_links').filter(function (l) { return l.kind === 'dependency' && l.status !== 'confirmed'; }).length;
    if (infraRisk || deps) out.push({ tone: 'warn', icon: 'shield', title: 'Unresolved infrastructure risks', count: infraRisk + deps, path: '/infrastructure?tab=dependencies',
      detail: [infraRisk ? U.plural(infraRisk, 'open infrastructure / network backlog item') : '', deps ? U.plural(deps, 'dependency', 'dependencies') + ' not yet confirmed' : ''].filter(Boolean).join(' · ') });
    const ss = R.spareStats();
    const cov = R.spareCoverage().length;
    if (ss.zero || ss.low || cov) out.push({ tone: ss.zero || cov ? 'danger' : 'warn', icon: 'package', title: 'Low spare equipment inventory', count: ss.zero + ss.low + cov, path: '/spares',
      detail: [ss.zero ? ss.zero + ' at zero stock' : '', ss.low ? ss.low + ' below minimum' : '', cov ? U.plural(cov, 'critical room') + ' without spare coverage' : ''].filter(Boolean).join(' · ') });
    return out;
  });
})();
