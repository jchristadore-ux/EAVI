/* actions.js — domain operations shared by the pages, the demo seed and the test suite. */
(function () {
  'use strict';
  const EV = window.EV, U = EV.U, S = EV.S, store = EV.store, R = EV.rules;
  const A = (EV.act = {});

  /* ------------------------------------------------------------------ audits */
  A.startAudit = function (target, opts) {
    opts = opts || {};
    const room = target.room || null, cfg = target.config || null;
    const base = room || cfg;
    const now = opts.at || U.now();
    const audit = store.create('audits', Object.assign({
      building_id: base.building_id, floor_id: base.floor_id, room_id: room ? room.id : null, configuration_id: cfg ? cfg.id : null,
      audit_date: U.localDate(now), auditor: store.actor(), status: 'in_progress', operational_status: room ? (room.operational_status || '') : '',
      started_at: now, completed_at: null, verified_at: null, summary_snapshot: null, general_notes: '', is_demo: !!opts.demo
    }, opts.data || {}), { silent: !!opts.silent, summary: 'Audit started: ' + (room ? R.roomLabel(room) : cfg.name) });
    let order = 0;
    S.TEST_CATEGORIES.forEach(function (cat) {
      S.TESTS[cat].forEach(function (t) {
        /* the standard checklist is part of starting the audit (one history entry), not 52 separate events */
        store.create('functional_tests', { audit_id: audit.id, room_id: audit.room_id, category: cat, test_key: S.testKey(cat, t[0]), test_name: t[1], result: 'not_tested',
          comment: '', tested_at: null, finding_id: null, suggestion_state: 'none', is_custom: false, sort_order: order++, is_demo: audit.is_demo }, { silent: true });
      });
    });
    S.NETWORK_CHECKS.forEach(function (c, i) {
      store.create('network_checks', { audit_id: audit.id, room_id: audit.room_id, check_key: c[0], check_name: c[1], status: 'not_checked', comment: '', checked_at: null,
        sort_order: i, is_demo: audit.is_demo }, { silent: true });
    });
    if (base.floor_id) store.kvSet('last_floor', base.floor_id);
    return audit;
  };
  /* Open audit for a room/configuration, or null. */
  A.openAudit = function (target) {
    const list = target.room ? store.by('audits', 'room_id', target.room.id) : store.by('audits', 'configuration_id', target.config.id);
    return R.latestAudit(list.filter(function (a) { return a.status === 'in_progress'; }));
  };
  A.resumeOrStart = function (target) { return A.openAudit(target) || A.startAudit(target); };
  function rollTests(audit) {
    const p = R.auditProgress(audit.id);
    store.logRolling('tests:' + audit.id, { action: 'testing_updated', table: 'audits', rec: audit,
      summary: 'Functional testing updated — ' + R.auditTitle(audit) + ' (' + p.tests.done + '/' + p.tests.total + ' complete)' });
  }
  A.setTest = function (id, result) {
    const t = store.get('functional_tests', id);
    if (!t) return;
    const patch = { result: result, tested_at: result === 'not_tested' ? null : U.now() };
    const hasFinding = !!R.testFinding(t);   /* a finding that was since deleted no longer counts as a review */
    if (result === 'fail' || result === 'investigate') { if (!hasFinding && t.suggestion_state !== 'dismissed') patch.suggestion_state = 'pending'; }
    else if (!hasFinding) patch.suggestion_state = 'none';
    store.update('functional_tests', id, patch);
    const audit = store.get('audits', t.audit_id);
    if (audit) rollTests(audit);
  };
  A.setTestsBulk = function (auditId, category, result) {
    let n = 0;
    store.by('functional_tests', 'audit_id', auditId).forEach(function (t) {
      if (t.category === category && (!t.result || t.result === 'not_tested')) { store.update('functional_tests', t.id, { result: result, tested_at: U.now() }); n++; }
    });
    const audit = store.get('audits', auditId);
    if (audit && n) rollTests(audit);
    return n;
  };
  A.addCustomTest = function (audit, category, name) {
    const order = store.by('functional_tests', 'audit_id', audit.id).length;
    return store.create('functional_tests', { audit_id: audit.id, room_id: audit.room_id, category: category, test_key: 'custom.' + U.slug(name) + '.' + U.uid().slice(0, 6),
      test_name: name, result: 'not_tested', comment: '', tested_at: null, finding_id: null, suggestion_state: 'none', is_custom: true, sort_order: order, is_demo: false });
  };
  A.setCheck = function (id, status) {
    const c = store.get('network_checks', id);
    if (!c) return;
    store.update('network_checks', id, { status: status, checked_at: status === 'not_checked' ? null : U.now() });
    const audit = store.get('audits', c.audit_id);
    if (audit) {
      const p = R.auditProgress(audit.id);
      store.logRolling('net:' + audit.id, { action: 'network_validation_updated', table: 'audits', rec: audit,
        summary: 'Network validation updated — ' + R.auditTitle(audit) + ' (' + p.network.pct + '%)' });
    }
  };
  A.setSection = function (auditId, key, patch) {
    const row = R.sectionState(auditId, key);
    const audit = store.get('audits', auditId);
    if (row) store.update('audit_sections', row.id, patch);
    else store.create('audit_sections', Object.assign({ id: U.keyId('audit-section', auditId + ':' + key), audit_id: auditId, section_key: key, state: 'auto', notes: '', is_demo: !!(audit && audit.is_demo) }, patch));
  };
  function snapshot(audit) {
    const snap = { captured_at: U.now() };
    if (audit.configuration_id) {
      const c = store.get('room_configurations', audit.configuration_id) || {};
      snap.configuration = { name: c.name, capacity: c.capacity, description: c.description };
      snap.member_rooms = R.auditRooms(audit).map(function (r) { return r.code + ' ' + R.roomLabel(r); });
      /* the member spaces' own summary, as it stood when this combined audit was completed */
      snap.member_room_details = R.auditRooms(audit).map(function (r) {
        const o = { code: r.code, number: r.number, name: r.name, area: (store.get('areas', r.area_id) || {}).name || null, operational_status: r.operational_status || null };
        R.SUMMARY_ROOM_FIELDS.forEach(function (f) { o[f[0]] = r[f[0]] == null ? null : r[f[0]]; });
        return o;
      });
    } else {
      const r = store.get('rooms', audit.room_id) || {};
      ['code', 'number', 'name', 'room_type', 'capacity', 'criticality', 'conferencing_platform', 'control_platform', 'dsp_platform', 'display_config', 'camera_config',
        'microphone_config', 'scheduling_platform', 'operational_status'].forEach(function (k) { snap[k] = r[k] == null ? null : r[k]; });
    }
    const p = R.auditProgress(audit.id);
    snap.progress = { overall: p.overall, devices_total: p.devices.total, devices_verified: p.devices.verified, tests_done: p.tests.done, tests_total: p.tests.total,
      tests_failed: p.tests.fail, tests_investigate: p.tests.investigate, network_pct: p.network.pct, photos: p.photos, findings: p.findings };
    return snap;
  }
  /* The room carries the operational status found by its MOST RECENT audit. Finishing (or re-finishing) an older
     audit never overwrites what a later audit recorded. */
  function applyRoomStatus(audit) {
    const a = store.get('audits', audit.id) || audit;
    if (a.configuration_id || !a.operational_status) return;
    const room = store.get('rooms', a.room_id);
    const latest = R.latestAudit(store.by('audits', 'room_id', a.room_id));
    if (room && latest && latest.id === a.id && room.operational_status !== a.operational_status) store.update('rooms', room.id, { operational_status: a.operational_status }, { silent: true });
  }
  A.completeAudit = function (audit, opts) {
    const now = U.now();
    applyRoomStatus(audit);
    store.update('audits', audit.id, { status: 'complete', completed_at: now, verified_at: null, summary_snapshot: snapshot(audit) }, opts);
  };
  A.verifyAudit = function (audit) {
    const p = R.auditProgress(audit.id);
    if (!p.canVerify) throw new Error('This audit cannot be marked fully verified yet: ' + p.blockers[0]);
    const now = U.now();
    applyRoomStatus(audit);
    store.update('audits', audit.id, { status: 'verified', completed_at: audit.completed_at || now, verified_at: now, summary_snapshot: snapshot(audit) });
  };
  A.reopenAudit = function (audit) { store.update('audits', audit.id, { status: 'in_progress', verified_at: null }); };
  A.deleteAudit = function (audit) {
    ['functional_tests', 'network_checks', 'audit_sections', 'audit_notes'].forEach(function (t) {
      store.by(t, 'audit_id', audit.id).forEach(function (r) { store.remove(t, r.id, { silent: true }); });
    });
    store.remove('audits', audit.id);
  };

  /* ------------------------------------------------------------------ devices */
  A.addDevice = function (ctx, category) {
    const room = ctx.room || null;
    return store.create('devices', {
      building_id: room ? room.building_id : ctx.building_id || null, floor_id: room ? room.floor_id : ctx.floor_id || null, room_id: room ? room.id : null, rack_id: null,
      audit_id: ctx.audit ? ctx.audit.id : null, category: category, custom_category: '', role: '', manufacturer: '', model: '', hostname: '',
      ip_address: '', ip_status: 'unknown', mac_address: '', mac_status: 'unknown', serial_number: '', serial_status: 'unknown',
      subnet: '', vlan: '', ip_assignment: '', dns_name: '', firmware_version: '', app_version: '', switch_asset_id: null, connected_switch: '', switch_port: '',
      connection_type: '', poe_required: '', poe_class: '', power_source: '', rack_location: '', monitoring_portal: '', management_url: '', warranty_info: '',
      support_expiration: null, notes: '', archived: false
    });
  };
  /* Keep the switch-port register in step with the device record (documentation only — nothing is probed). */
  A.syncDevicePort = function (device) {
    store.by('switch_ports', 'device_id', device.id).forEach(function (p) {
      if (p.switch_asset_id !== device.switch_asset_id || p.port !== device.switch_port) store.update('switch_ports', p.id, { device_id: null });
    });
    if (!device.switch_asset_id || U.blank(device.switch_port)) return;
    const ex = store.by('switch_ports', 'switch_asset_id', device.switch_asset_id).find(function (p) { return p.port === device.switch_port; });
    if (ex) {
      /* A port another live device still claims is not taken from it: the clash is reported as a conflict
         (R.duplicates, "Switch port") and is for a person to reconcile. */
      const other = ex.device_id && ex.device_id !== device.id ? store.get('devices', ex.device_id) : null;
      const stillClaims = other && !other.archived && other.switch_asset_id === device.switch_asset_id && other.switch_port === device.switch_port;
      if (!stillClaims && ex.device_id !== device.id) store.update('switch_ports', ex.id, { device_id: device.id });
    }
    /* A row created from a device record documents only that the device is said to be on this port. Nothing about the
       port itself (mode, VLAN) was observed, so it starts unvalidated for Client IT to confirm. */
    else store.create('switch_ports', { switch_asset_id: device.switch_asset_id, port: device.switch_port, description: '', mode: 'unknown', vlan: '', tagged_vlans: '',
      untagged_vlan: '', poe_status: 'unknown', poe_class: '', link_speed: '', device_id: device.id, validation_status: 'awaiting_it', notes: '', is_demo: !!device.is_demo });
  };

  /* ------------------------------------------------------------------ findings and backlog */
  A.createFinding = function (data, opts) {
    return store.create('findings', Object.assign({
      building_id: null, floor_id: null, room_id: null, device_id: null, audit_id: null, test_id: null, category: 'Other', title: '', observation: '',
      classification: 'observed_fact', interpretation: '', hypothesis: '', recommended_action: '', priority_hint: '', status: 'open', backlog_item_id: null,
      source: 'manual', source_key: ''
    }, data), opts);
  };
  A.confirmTestFinding = function (testId) {
    const t = store.get('functional_tests', testId);
    if (!t) return null;
    const audit = store.get('audits', t.audit_id);
    const rooms = R.auditRooms(audit);
    const room = rooms[0] || {};
    const sug = R.suggestFindingFromTest(t, audit);
    const f = A.createFinding(Object.assign(sug, { building_id: audit.building_id, floor_id: audit.floor_id, room_id: audit.room_id || room.id || null, audit_id: audit.id, test_id: t.id,
      source: 'test_failure', source_key: 'test:' + t.id }));
    store.update('functional_tests', t.id, { finding_id: f.id, suggestion_state: 'accepted' });
    /* evidence photographs attached to the test follow the finding */
    store.by('photos', 'test_id', t.id).forEach(function (p) { if (!p.finding_id) store.update('photos', p.id, { finding_id: f.id }); });
    return f;
  };
  A.dismissTestSuggestion = function (testId) { store.update('functional_tests', testId, { suggestion_state: 'dismissed' }); };
  A.createBacklog = function (data, opts) {
    return store.create('backlog_items', Object.assign({
      building_id: null, floor_id: null, room_id: null, device_id: null, category: 'Other', title: '', problem_statement: '', observed_evidence: '', suspected_cause: '',
      root_cause: '', root_cause_confidence: 'not_determined', root_cause_basis: '', recommendation: '', strategy: '', expected_outcome: '', operational_risk: '',
      meeting_impact: '', frequency: '', user_impact: '', business_impact: '', user_friction: '', risk_level: '', effort: '', estimated_cost: null, safety_concern: false,
      exec_visibility: false, dependencies: '', owner: '', requested_by: store.actor(), priority: '', priority_rationale: '', status: 'New Discovery',
      status_changed_at: U.now(), target_date: null, completed_at: null, systemic: false
    }, data), opts);
  };
  /* Convert a finding into a backlog item, or attach it to an existing item describing the same issue. */
  A.promoteFinding = function (findingId, existingId) {
    const f = store.get('findings', findingId);
    if (!f) return null;
    let b;
    if (existingId) {
      b = store.get('backlog_items', existingId);
      if (!b) return null;
    } else {
      b = A.createBacklog({
        building_id: f.building_id, floor_id: f.floor_id, room_id: f.room_id, device_id: f.device_id, category: f.category, title: f.title,
        problem_statement: f.title, observed_evidence: f.observation, suspected_cause: f.hypothesis || '',
        root_cause_confidence: f.hypothesis ? 'hypothesis' : 'not_determined', recommendation: f.recommended_action || '', priority: f.priority_hint || ''
      });
    }
    store.update('findings', f.id, { backlog_item_id: b.id, status: 'linked' });
    const rooms = R.backlogRooms(store.get('backlog_items', b.id));
    if (rooms.length > 1 && !b.systemic) store.update('backlog_items', b.id, { systemic: true });
    return store.get('backlog_items', b.id);
  };
  A.unlinkFinding = function (findingId) { store.update('findings', findingId, { backlog_item_id: null, status: 'open' }); };
  A.setBacklogStatus = function (id, status) {
    const patch = { status: status, status_changed_at: U.now() };
    if (status === 'Completed') patch.completed_at = U.now(); else patch.completed_at = null;
    store.update('backlog_items', id, patch);
  };
  A.backlogPhotos = function (b) {
    const seen = new Set(); const out = [];
    function add(p) { if (!seen.has(p.id)) { seen.add(p.id); out.push(p); } }
    store.by('photos', 'backlog_item_id', b.id).forEach(add);
    store.by('findings', 'backlog_item_id', b.id).forEach(function (f) {
      store.by('photos', 'finding_id', f.id).forEach(add);
      if (f.test_id) store.by('photos', 'test_id', f.test_id).forEach(add);
    });
    return out;
  };

  /* ------------------------------------------------------------------ coordination requests */
  A.createRequest = function (data, opts) {
    return store.create('it_requests', Object.assign({
      topic: '', description: '', requested_from: 'Client IT', vendor_name: '', request_type: '', building_id: null, floor_id: null, room_id: null, device_id: null,
      /* a draft has not been requested from anyone yet: the date is stamped when the status first becomes Submitted */
      reason: '', needed_for: '', priority: 'P2', date_requested: null, target_date: null, status: 'Draft', response: '', response_date: null,
      documentation: '', source_key: ''
    }, data), opts);
  };
  A.linkRequest = function (backlogId, requestId) {
    const ex = store.by('backlog_it_links', 'backlog_item_id', backlogId).find(function (l) { return l.it_request_id === requestId; });
    if (ex) return ex;
    const b = store.get('backlog_items', backlogId);
    return store.create('backlog_it_links', { id: U.keyId('backlog-request', backlogId + ':' + requestId), backlog_item_id: backlogId, it_request_id: requestId, is_demo: !!(b && b.is_demo) });
  };
  A.unlinkRequest = function (backlogId, requestId) {
    store.by('backlog_it_links', 'backlog_item_id', backlogId).forEach(function (l) { if (l.it_request_id === requestId) store.remove('backlog_it_links', l.id); });
  };
  A.requestsFor = function (backlogId) {
    return store.by('backlog_it_links', 'backlog_item_id', backlogId).map(function (l) { return store.get('it_requests', l.it_request_id); }).filter(Boolean);
  };
  A.backlogFor = function (requestId) {
    return store.by('backlog_it_links', 'it_request_id', requestId).map(function (l) { return store.get('backlog_items', l.backlog_item_id); }).filter(Boolean);
  };
  /* Turn a follow-up task into a drafted coordination request (never sent anywhere automatically). */
  A.requestFromFollowup = function (fu) {
    const d = store.get('devices', fu.device_id);
    const typeMap = { missing_ip: 'IP reservations', missing_mac: 'DHCP mappings', unknown_port: 'Switch port information', firmware_undocumented: 'Firmware standards', missing_serial: 'Device approval' };
    const party = S.IT_PARTIES.indexOf(fu.suggested_party) >= 0 ? fu.suggested_party : 'Client IT';
    const req = A.createRequest({
      topic: fu.title, description: fu.detail + (d ? '\nDevice: ' + R.deviceLabel(d) + (d.code ? ' (' + d.code + ')' : '') : ''), requested_from: party,
      request_type: party === 'Client IT' ? (typeMap[fu.kind] || 'Other') : 'Other', building_id: d ? d.building_id : null, floor_id: d ? d.floor_id : null,
      room_id: d ? d.room_id : null, device_id: d ? d.id : null, reason: 'Device identification is incomplete.', needed_for: 'Complete device documentation',
      source_key: fu.dedupe_key
    });
    store.update('followups', fu.id, { it_request_id: req.id });
    return req;
  };

  /* ------------------------------------------------------------------ environment */
  A.addRoom = function (floor, data, opts) {
    /* nothing is pre-filled: the room type, like every other fact about the room, is what the auditor records */
    return store.create('rooms', Object.assign({
      building_id: floor.building_id, floor_id: floor.id, area_id: null, name: '', number: '', room_type: '', capacity: null, criticality: '',
      conferencing_platform: '', control_platform: '', dsp_platform: '', display_config: '', camera_config: '', microphone_config: '', scheduling_platform: '',
      operational_status: '', notes: '', archived: false
    }, data || {}), opts);
  };
  A.roomDependents = function (roomId) {
    return { audits: store.by('audits', 'room_id', roomId).length, devices: store.by('devices', 'room_id', roomId).length, photos: store.by('photos', 'room_id', roomId).length,
      findings: store.by('findings', 'room_id', roomId).length };
  };

  /* ------------------------------------------------------------------ removal with referential clean-up
   * A record that is removed outright (a new record abandoned in its editor, or the demo environment) must not leave
   * anything pointing at nothing, because a dangling reference cannot be exported or synchronised:
   *   - rows that cannot exist without it go with it: required references, an audit of the room or configuration,
   *     a device's follow-up tasks, the network relationships of a device or switch;
   *   - optional references elsewhere are cleared;
   *   - a photograph left with no link at all goes too; otherwise it stays as evidence where it still belongs. */
  const OWNED = { audits: ['room_id', 'configuration_id'], followups: ['device_id'] };
  const NOT_SCANNED = { activity_log: 1, exports: 1, organizations: 1, profiles: 1, insight_states: 1 };
  const PHOTO_LINKS = ['room_id', 'audit_id', 'device_id', 'finding_id', 'test_id', 'backlog_item_id', 'it_request_id', 'spare_item_id'];
  /* seed: [{ table, id }] → { remove: [{ table, id, rec }] (seed first), clear: [{ table, id, patch }] }
     requiredOnly: follow only references the row cannot exist without (used for an ordinary recorded delete). */
  A.removalPlan = function (seed, requiredOnly) {
    const gone = new Set(), remove = [];
    const take = function (t, r) { if (gone.has(r.id)) return false; gone.add(r.id); remove.push({ table: t, id: r.id, rec: r }); return true; };
    seed.forEach(function (s) { const r = store.getAny(s.table, s.id); if (r) take(s.table, r); });
    const clear = new Map();
    for (let again = true; again;) {
      again = false;
      clear.clear();
      S.TABLES.forEach(function (t) {
        if (NOT_SCANNED[t]) return;
        const cols = S.T[t].columns.filter(function (c) { return c.ref; });
        const owned = requiredOnly ? [] : (OWNED[t] || []);
        store.raw(t).forEach(function (r) {
          if (gone.has(r.id) || (requiredOnly && r.deleted_at)) return;
          if (t === 'network_links') {
            /* a relationship belongs to its "from" end (the device that depends on something, or the switch an uplink
               leaves); an uplink also needs its far end. A dependency whose optional target goes away is kept. */
            if (gone.has(r.from_id) || (r.kind === 'uplink' && gone.has(r.to_id))) { again = take(t, r) || again; return; }
            if (!requiredOnly && r.to_id && gone.has(r.to_id)) clear.set(t + ':' + r.id, { table: t, id: r.id, patch: { to_id: '', to_type: '' } });
            return;
          }
          let patch = null;
          for (let i = 0; i < cols.length; i++) {
            const c = cols[i], v = r[c.name];
            if (!v || !gone.has(v)) continue;
            if (c.required || owned.indexOf(c.name) >= 0) { again = take(t, r) || again; return; }
            (patch = patch || {})[c.name] = null;
          }
          if (!patch || requiredOnly) return;
          if (t === 'photos' && !PHOTO_LINKS.some(function (k) { return r[k] && !(k in patch); })) { again = take(t, r) || again; return; }
          if (t === 'functional_tests' && 'finding_id' in patch) patch.suggestion_state = r.result === 'fail' || r.result === 'investigate' ? 'pending' : 'none';
          if (t === 'findings' && 'backlog_item_id' in patch && r.status === 'linked') patch.status = 'open';
          clear.set(t + ':' + r.id, { table: t, id: r.id, patch: patch });
        });
      });
    }
    return { remove: remove, clear: Array.from(clear.values()) };
  };
  function applyPlan(plan, hard) {
    plan.clear.forEach(function (c) { if (store.getAny(c.table, c.id)) store.update(c.table, c.id, c.patch, { silent: true }); });
    /* dependants before the records they depend on, so no reference is ever left dangling, even momentarily */
    plan.remove.slice().reverse().forEach(function (x) {
      if (!hard) { store.remove(x.table, x.id, { silent: x !== plan.remove[0] }); return; }
      store.discard(x.table, x.id);
      if (x.table === 'photos') store.dropPhotoFiles(x.id);
    });
  }
  /* Abandon a record that was only just created. On a device-only installation it is removed outright, with
     everything that hangs off it. With a cloud workspace connected it may already have been sent, so it is deleted
     the recorded way (deleted_at) and the deletion synchronises like any other. */
  A.discard = function (table, id) {
    const plan = A.removalPlan([{ table: table, id: id }]);
    applyPlan(plan, !store.syncEnabled);
    return plan;
  };
  /* Delete an existing record the recorded way, together with the rows that cannot exist without it. */
  A.remove = function (table, id) {
    /* a deleted record still exists as history, so optional references to it are left as they are */
    const plan = A.removalPlan([{ table: table, id: id }], true);
    applyPlan(plan, false);
    return plan;
  };
  /* The demo environment, plus anything of the auditor's own that was created inside it and cannot exist without it. */
  A.demoRemovalPlan = function () {
    const seed = [];
    S.TABLES.forEach(function (t) { store.raw(t).forEach(function (r) { if (r.is_demo) seed.push({ table: t, id: r.id }); }); });
    const plan = A.removalPlan(seed);
    plan.own = plan.remove.filter(function (x) { return !x.rec.is_demo; });
    return plan;
  };
  A.removeDemo = async function () {
    const plan = A.demoRemovalPlan();
    applyPlan(plan, true);
    store.kvSet('demo_loaded', false);
    await store.flush();
    R.reconcileFollowups();
    return { demo: plan.remove.length - plan.own.length, own: plan.own.length };
  };
})();
