/* reports.js — report definitions (one document model) and its three renderers: on-screen preview, PDF, CSV / Excel.
 * Narrative text is assembled only from recorded facts; hypotheses are always labelled as such. */
(function () {
  'use strict';
  const EV = window.EV, h = EV.h, U = EV.U, S = EV.S, store = EV.store, R = EV.rules, A = EV.act;
  const Rep = (EV.reports = {});

  Rep.TYPES = [
    { id: 'executive', name: 'Executive summary', desc: 'Leadership brief: status, critical findings, risks, dependencies and next steps.', scope: 'building' },
    { id: 'environment', name: 'Complete environment assessment', desc: 'Full assessment across every building, floor and space.', scope: 'building' },
    { id: 'building', name: 'Building audit summary', desc: 'Progress, findings and risks for one building, floor by floor.', scope: 'building', required: true },
    { id: 'floor', name: 'Floor audit summary', desc: 'Every space on one floor with audit status, devices and findings.', scope: 'floor', required: true },
    { id: 'room', name: 'Individual room audit', desc: 'One audit in full: summary, tests, devices, network validation, findings and photographs.', scope: 'audit', required: true },
    { id: 'devices', name: 'Device inventory export', desc: 'Every device with physical and network identification status.', scope: 'floor', landscape: true },
    { id: 'network', name: 'Network-connected asset register', desc: 'Networked devices with addressing, switch/port mapping, plus switches, ports and infrastructure records.', scope: 'floor', landscape: true },
    { id: 'tests', name: 'Functional test results', desc: 'Results by category with every failed or investigated test.', scope: 'floor' },
    { id: 'backlog', name: 'Findings and prioritized improvement backlog', desc: 'P1 items in detail, P2/P3 tables and findings awaiting triage.', scope: 'floor', landscape: true },
    { id: 'coordination', name: 'IT coordination register', desc: 'Requests to Client IT, PepperDash, vendors and facilities.', scope: 'none', landscape: true },
    { id: 'spares', name: 'Spare equipment assessment', desc: 'Stock levels, risk flags and critical rooms without spare coverage.', scope: 'none' }
  ];

  /* ------------------------------------------------------------------ helpers */
  function inScope(rec, sc) { return (!sc.building || rec.building_id === sc.building) && (!sc.floor || rec.floor_id === sc.floor); }
  /* Backlog items, findings and coordination requests may legitimately have no location (a systemic item, a request
     about a firmware baseline). Such a record belongs to every building-level report; only a floor report, which is
     about one place, leaves it out. */
  function inScopeLoose(rec, sc) { return (!sc.building || !rec.building_id || rec.building_id === sc.building) && (!sc.floor || rec.floor_id === sc.floor); }
  /* synthetic demo records in the scope of this report (not merely somewhere on the device) */
  function demoIn(sc) {
    if (sc.audit) { const a = store.get('audits', sc.audit); return !!(a && a.is_demo); }
    const hit = function (t, loose) { return store.all(t).some(function (r) { return r.is_demo && (loose ? inScopeLoose(r, sc) : inScope(r, sc)); }); };
    return hit('rooms') || hit('devices') || hit('audits') || hit('backlog_items', true) || hit('findings', true) || hit('it_requests', true) || hit('infra_assets', true) || hit('spare_items', true);
  }
  /* these reports contain device-wide sections (alerts, insights, infrastructure, spares, switch ports) whatever the scope */
  const WIDE = { executive: 1, environment: 1, network: 1 };
  function scopeText(sc) {
    if (sc.audit) { const a = store.get('audits', sc.audit); return a ? R.auditTitle(a) + ' — audit ' + a.code : 'Audit'; }
    const f = store.get('floors', sc.floor), b = store.get('buildings', sc.building || (f ? f.building_id : null));
    if (f) return (b ? b.name + ' — ' : '') + 'Floor ' + f.number;
    if (b) return b.name;
    return 'All buildings';
  }
  function base(type, title, sc, extra) {
    const prof = EV.auth.profile();
    return Object.assign({
      type: type, title: title, subtitle: scopeText(sc), generated_at: U.now(), demo: demoIn(sc) || (WIDE[type] === 1 && store.hasDemo()), blocks: [],
      meta: [['Report date', U.fmtDate(new Date())], ['Prepared by', prof.name || 'Auditor'], store.kvGet('org_name') ? ['Organization', store.kvGet('org_name')] : null, ['Scope', scopeText(sc)]].filter(Boolean),
      filename: U.fileSafe((store.orgCode() || 'AVEI') + '_' + title + '_' + scopeText(sc) + '_' + U.localDate())
    }, extra || {});
  }
  const B = {
    h1: function (t) { return { t: 'h1', text: t }; },
    h2: function (t) { return { t: 'h2', text: t }; },
    p: function (t) { return { t: 'p', text: t }; },
    bullets: function (items) { return { t: 'bullets', items: items }; },
    kv: function (items) { return { t: 'kv', items: items.filter(function (i) { return i; }) }; },
    stats: function (items) { return { t: 'stats', items: items }; },
    table: function (title, columns, rows, o) { return Object.assign({ t: 'table', title: title, columns: columns, rows: rows }, o || {}); },
    callout: function (tone, text) { return { t: 'callout', tone: tone, text: text }; },
    photos: function (items) { return { t: 'photos', items: items }; }
  };
  function idCell(d, f) {
    const s = R.idState(d, f);
    if (s === 'na') return 'N/A';
    if (s === 'missing') return 'MISSING';
    return d[f.k] + (s === 'recorded' ? ' (unverified)' : '');
  }
  /* the same wording, in the same order, as the status chip in the application */
  function idState(d) {
    const r = R.device(d);
    return !r.identified ? 'Incomplete' : r.invalid.length ? 'Check format' : r.unverified.length ? 'Unverified' : r.missingRequired.length ? 'Details missing' : 'Verified';
  }
  function roomNo(id) { const r = store.get('rooms', id); return r ? (r.number || r.name) : '—'; }
  function floorNo(id) { const f = store.get('floors', id); return f ? f.number : '—'; }
  function sortRooms(list) { return U.sortBy(list, function (r) { return floorNo(r.floor_id) + ' ' + (r.number || r.name); }); }
  function devicesIn(sc) { return U.sortBy(R.liveDevices().filter(function (d) { return inScope(d, sc); }), function (d) { return floorNo(d.floor_id) + ' ' + roomNo(d.room_id) + ' ' + d.category; }); }
  function latestAudits(sc) {
    const m = new Map();
    U.sortBy(store.all('audits').filter(function (a) { return inScope(a, sc); }), function (a) { return a.started_at; }, true)
      .forEach(function (a) { const k = a.room_id || a.configuration_id; if (!m.has(k)) m.set(k, a); });
    return Array.from(m.values());
  }
  function devicesTable(devs, title) {
    return B.table(title || 'Device inventory', ['ID', 'Floor', 'Room', 'Type', 'Manufacturer', 'Model', 'Hostname', 'IP address', 'MAC address', 'Serial number', 'Firmware', 'Status'],
      devs.map(function (d) {
        return [d.code, floorNo(d.floor_id), roomNo(d.room_id), R.deviceType(d), d.manufacturer || '', d.model || '', d.hostname || '', idCell(d, R.ID_FIELDS[0]), idCell(d, R.ID_FIELDS[1]), idCell(d, R.ID_FIELDS[2]),
          d.firmware_version || '', idState(d)];
      }), { toneCols: [7, 8, 9, 11], primary: true, sheet: 'Devices' });
  }
  function backlogTable(items, title) {
    return B.table(title, ['ID', 'Priority', 'Status', 'Category', 'Location', 'Title', 'Recommendation', 'Owner', 'Effort', 'Target'],
      items.map(function (b) {
        return [b.code, b.priority || 'Unprioritized', b.status, b.category, R.where(b) || '—', b.title, b.recommendation || '', b.owner || 'Unassigned', (b.effort || '').split(' (')[0], b.target_date ? U.fmtDate(b.target_date) : ''];
      }), { toneCols: [1, 2], sheet: 'Backlog' });
  }
  function sortBacklog(list) {
    const o = { P1: 0, P2: 1, P3: 2, '': 3 };
    return list.slice().sort(function (a, b) { return (o[a.priority || ''] - o[b.priority || '']) || (a.code < b.code ? -1 : 1); });
  }
  function openBacklog(sc) { return sortBacklog(store.all('backlog_items').filter(function (b) { return S.BACKLOG_CLOSED.indexOf(b.status) < 0 && inScopeLoose(b, sc); })); }
  /* open coordination requests in scope; `sent` leaves out drafts, which nobody has received yet */
  function openRequests(sc) { return store.all('it_requests').filter(function (x) { return S.IT_CLOSED.indexOf(x.status) < 0 && inScopeLoose(x, sc); }); }
  function sent(list) { return list.filter(function (x) { return x.status !== 'Draft'; }); }
  function requestsTable(list, title) {
    return B.table(title, ['ID', 'Requested from', 'Type', 'Topic', 'Location', 'Priority', 'Status', 'Requested', 'Target', 'Response'],
      list.map(function (x) {
        return [x.code, x.requested_from + (x.vendor_name ? ' (' + x.vendor_name + ')' : ''), x.request_type || '', x.topic, R.where(x) || '—', x.priority || '', x.status, x.date_requested ? U.fmtDate(x.date_requested) : '',
          x.target_date ? U.fmtDate(x.target_date) : '', x.response || ''];
      }), { toneCols: [5, 6], sheet: 'Coordination' });
  }
  function progressRows(sc) {
    const rows = [];
    store.all('buildings').filter(function (b) { return !b.archived && (!sc.building || b.id === sc.building); }).forEach(function (b) {
      R.buildingFloors(b.id).forEach(function (f) {
        if (sc.floor && f.id !== sc.floor) return;
        const fp = R.floorProgress(f.id);
        rows.push([b.name, 'Floor ' + f.number, f.designation || '', fp.total, fp.audited, fp.partial, fp.notStarted, fp.pct + '%']);
      });
    });
    return rows;
  }
  function roomsTable(rooms, title) {
    return B.table(title || 'Spaces', ['Room', 'Type', 'Capacity', 'Audit status', 'Operational status', 'Tests failed', 'To investigate', 'Devices verified', 'Findings', 'Network validation'],
      rooms.map(function (r) {
        const rs = R.roomState(r.id);
        const p = rs.audit ? R.auditProgress(rs.audit.id) : null;
        /* device verification does not depend on an audit: a room with no audit still reports its real figure */
        const devs = R.roomDevices(r.id);
        return [R.roomLabel(r), r.room_type, r.capacity || '', R.STATE_LABEL[rs.state], r.operational_status || 'Not recorded', p ? p.tests.fail : '', p ? p.tests.investigate : '',
          devs.length ? devs.filter(function (d) { return R.device(d).verified; }).length + '/' + devs.length : '', p ? p.findings : '', p ? p.network.pct + '%' : ''];
      }), { toneCols: [3, 4], sheet: 'Spaces' });
  }
  /* Rule-based next steps derived from open work. Used by reports and the end-of-day summary. */
  Rep.nextSteps = function (sc) {
    sc = sc || {};
    const out = [];
    const rooms = R.liveRooms().filter(function (r) { return inScope(r, sc); });
    const inProg = rooms.filter(function (r) { return R.roomState(r.id).state === 'in_progress'; });
    const notStarted = rooms.filter(function (r) { return R.roomState(r.id).state === 'not_started'; });
    const audited = rooms.filter(function (r) { return R.roomState(r.id).state === 'audited'; });
    const names = function (list, n) { return sortRooms(list).slice(0, n || 6).map(function (r) { return r.number || r.name; }).join(', ') + (list.length > (n || 6) ? '…' : ''); };
    if (inProg.length) out.push('Finish ' + U.plural(inProg.length, 'audit') + ' in progress: ' + names(inProg) + '.');
    if (notStarted.length) out.push('Audit ' + U.plural(notStarted.length, 'space') + ' not yet started: ' + names(notStarted) + '.');
    const devs = R.liveDevices().filter(function (d) { return inScope(d, sc); });
    const inc = devs.filter(function (d) { return !R.device(d).identified; });
    if (inc.length) {
      const by = U.groupBy(inc, function (d) { return roomNo(d.room_id); });
      out.push('Resolve identification for ' + U.plural(inc.length, 'device') + ' (missing IP, MAC or serial) in: ' + Array.from(by.keys()).sort(U.natCmp).map(function (k) { return k + ' (' + by.get(k).length + ')'; }).join(', ') + '.');
    }
    const unv = devs.filter(function (d) { const r = R.device(d); return r.identified && r.unverified.length; });
    if (unv.length) out.push('Verify recorded-but-unverified identifiers on ' + U.plural(unv.length, 'device') + '.');
    const failing = [];
    latestAudits(sc).forEach(function (a) { const p = R.auditProgress(a.id); if (p.tests.pendingSuggestion) failing.push(R.auditTitle(a)); });
    if (failing.length) out.push('Review failed or investigated tests that have no finding yet: ' + failing.join(', ') + '.');
    const triage = store.all('findings').filter(function (f) { return f.status === 'open' && inScopeLoose(f, sc); });
    if (triage.length) out.push('Triage ' + U.plural(triage.length, 'finding') + ' awaiting a backlog decision.');
    const p1 = openBacklog(sc).filter(function (b) { return b.priority === 'P1'; });
    const noOwner = p1.filter(function (b) { return U.blank(b.owner); });
    if (p1.length) out.push('Progress ' + U.plural(p1.length, 'open P1 item') + ': ' + p1.slice(0, 4).map(function (b) { return b.code; }).join(', ') + (noOwner.length ? ' (' + noOwner.length + ' without an owner)' : '') + '.');
    const reqs = openRequests(sc);
    /* requests Client IT has actually received; "overdue" counts only those */
    const it = sent(reqs).filter(function (x) { return x.requested_from === 'Client IT'; });
    const overdue = it.filter(function (x) { return x.target_date && x.target_date < U.localDate(); });
    if (it.length) out.push('Follow up ' + U.plural(it.length, 'outstanding Client IT request') + (overdue.length ? ' (' + overdue.length + ' overdue)' : '') + '.');
    const others = sent(reqs).filter(function (x) { return x.requested_from !== 'Client IT'; });
    const othersOverdue = others.filter(function (x) { return x.target_date && x.target_date < U.localDate(); });
    if (othersOverdue.length) out.push('Chase ' + U.plural(othersOverdue.length, 'overdue request') + ' with ' + U.uniq(othersOverdue.map(function (x) { return x.requested_from; })).join(', ') + '.');
    const drafts = reqs.filter(function (x) { return x.status === 'Draft'; });
    if (drafts.length) out.push('Submit ' + U.plural(drafts.length, 'drafted coordination request') + ' through the agreed channel.');
    if (audited.length) out.push(U.plural(audited.length, 'completed audit') + ' can be marked fully verified once mandatory information is closed out: ' + names(audited, 5) + '.');
    if (!sc.floor) {
      const cov = R.spareCoverage().filter(function (g) { return !sc.building || g.room.building_id === sc.building; });
      if (cov.length) out.push('Agree spare coverage for ' + U.plural(cov.length, 'critical room') + ': ' + cov.map(function (g) { return g.room.number || g.room.name; }).join(', ') + '.');
    }
    return out.length ? out : ['No outstanding actions are recorded for this scope.'];
  };
  function summaryStats(sc) {
    const rooms = R.liveRooms().filter(function (r) { return inScope(r, sc); });
    const done = rooms.filter(function (r) { const s = R.roomState(r.id).state; return s === 'audited' || s === 'verified'; }).length;
    const devs = R.liveDevices().filter(function (d) { return inScope(d, sc); });
    const inc = devs.filter(function (d) { return !R.device(d).identified; }).length;
    const ob = openBacklog(sc);
    const reqs = openRequests(sc);
    return { rooms: rooms, done: done, devs: devs, inc: inc, ob: ob, p1: ob.filter(function (b) { return b.priority === 'P1'; }), p2: ob.filter(function (b) { return b.priority === 'P2'; }), p3: ob.filter(function (b) { return b.priority === 'P3'; }),
      unprioritized: ob.filter(function (b) { return !b.priority; }), it: sent(reqs), drafts: reqs.filter(function (x) { return x.status === 'Draft'; }) };
  }
  function statBlock(s) {
    return B.stats([
      { label: 'Spaces audited', value: s.done + ' / ' + s.rooms.length }, { label: 'Devices inventoried', value: String(s.devs.length) },
      { label: 'Incomplete identification', value: String(s.inc), tone: s.inc ? 'warn' : 'ok' }, { label: 'Open backlog items', value: String(s.ob.length) },
      { label: 'P1 — High', value: String(s.p1.length), tone: s.p1.length ? 'danger' : 'ok' }, { label: 'P2 — Medium', value: String(s.p2.length), tone: s.p2.length ? 'warn' : null },
      { label: 'P3 — Low', value: String(s.p3.length) }, { label: 'Requests outstanding', value: String(s.it.length), sub: s.drafts.length ? s.drafts.length + ' more drafted, not yet sent' : '' }
    ]);
  }
  /* "N open items: a P1, b P2, c P3" always adds up: items not yet prioritized are stated as well */
  function priorityBreakdown(s) {
    return s.p1.length + ' P1 (high), ' + s.p2.length + ' P2 (medium)' + (s.unprioritized.length ? ', ' + s.p3.length + ' P3 (low) and ' + s.unprioritized.length + ' not yet prioritized' : ' and ' + s.p3.length + ' P3 (low)');
  }
  function narrative(sc, s) {
    const ds = s.devs.length ? ' ' + s.devs.length + ' devices are inventoried; ' + (s.inc ? s.inc + ' still lack an IP address, MAC address or serial number and are tracked as follow-up tasks.' : 'all have complete identification.') : ' No devices have been inventoried yet.';
    const bl = s.ob.length ? ' The improvement backlog holds ' + U.plural(s.ob.length, 'open item') + ': ' + priorityBreakdown(s) + '.' : ' No backlog items are open.';
    return 'As of ' + U.fmtDate(new Date()) + ', ' + s.done + ' of ' + U.plural(s.rooms.length, 'space') + ' in scope (' + scopeText(sc) + ') ' + (s.done === 1 ? 'has' : 'have') + ' a completed audit.' + ds + bl +
      (s.it.length ? ' ' + U.plural(s.it.length, 'coordination request') + ' ' + (s.it.length === 1 ? 'is' : 'are') + ' outstanding with Client IT, PepperDash or vendors.' : '') +
      (s.drafts.length ? ' ' + U.plural(s.drafts.length, 'further request') + ' ' + (s.drafts.length === 1 ? 'is' : 'are') + ' drafted and not yet submitted.' : '');
  }
  function backlogDetail(b) {
    const cause = b.root_cause_confidence === 'confirmed' && b.root_cause ? ['Root cause (confirmed)', b.root_cause + (b.root_cause_basis ? ' — confirmed by: ' + b.root_cause_basis : '')]
      : b.suspected_cause ? ['Suspected cause (unverified hypothesis)', b.suspected_cause] : ['Root cause', 'Not determined'];
    return [B.h2(b.code + ' · ' + (b.priority || 'Unprioritized') + ' · ' + b.title),
      B.kv([['Status', b.status], ['Location', R.where(b) || '—'], ['Category', b.category], ['Problem statement', b.problem_statement || '—'], ['Observed evidence', b.observed_evidence || '—'], cause,
        ['Recommendation', b.recommendation || '—'], b.expected_outcome ? ['Expected business outcome', b.expected_outcome] : null, b.operational_risk ? ['Operational risk', b.operational_risk] : null,
        ['Impact', [b.meeting_impact, b.frequency ? 'frequency: ' + b.frequency : '', b.business_impact ? 'business impact: ' + b.business_impact : ''].filter(Boolean).join(' · ') || '—'],
        b.priority_rationale ? ['Priority rationale', b.priority_rationale] : null, b.dependencies ? ['Dependencies', b.dependencies] : null,
        ['Owner / effort', (b.owner || 'Unassigned') + (b.effort ? ' · ' + b.effort : '') + (b.target_date ? ' · target ' + U.fmtDate(b.target_date) : '')]])];
  }
  function insightBullets(sc) {
    return R.insights().filter(function (i) { return !i.dismissed && (i.kind === 'systemic' || i.kind === 'spare' || i.kind === 'conflict' || i.kind === 'naming'); })
      .map(function (i) { return i.title + ' — ' + i.detail; });
  }

  /* ------------------------------------------------------------------ report builders */
  const build = {};
  build.room = function (sc) {
    const audit = store.get('audits', sc.audit);
    if (!audit) throw new Error('Select an audit for this report.');
    const p = R.auditProgress(audit.id);
    const room = p.rooms[0] || {};
    const rep = base('room', 'Room Audit Report', sc, { meta: [['Audit date', U.fmtDate(audit.audit_date)], ['Auditor', audit.auditor || '—'], ['Audit ID', audit.code], ['Audit status', R.auditStatusLabel(audit)],
      ['Building', (store.get('buildings', audit.building_id) || {}).name || '—'], ['Floor', floorNo(audit.floor_id)]] });
    const tests = U.sortBy(store.by('functional_tests', 'audit_id', audit.id), function (t) { return t.sort_order || 0; });
    const devs = R.auditDevices(audit);
    const flagged = tests.filter(function (t) { return t.result === 'fail' || t.result === 'investigate'; });
    const findings = store.by('findings', 'audit_id', audit.id).filter(function (f) { return f.status !== 'dismissed'; });
    const checks = U.sortBy(store.by('network_checks', 'audit_id', audit.id), function (c) { return c.sort_order || 0; });
    const notes = U.sortBy(store.by('audit_notes', 'audit_id', audit.id), function (n) { return n.created_at; });
    const photos = EV.photos.forAudit(audit.id);
    rep.blocks.push(B.h1('Executive summary'),
      B.p(R.auditTitle(audit) + ' was audited on ' + U.fmtDate(audit.audit_date) + ' by ' + (audit.auditor || 'the auditor') + '. Current operational status: ' + (audit.operational_status || 'not recorded') + '. ' +
        p.tests.done + ' of ' + p.tests.total + ' functional tests have a result: ' + p.tests.pass + ' passed, ' + p.tests.fail + ' failed, ' + p.tests.investigate + ' need investigation and ' + p.tests.na + ' are not applicable. ' +
        p.devices.total + ' devices are inventoried, of which ' + p.devices.verified + ' are fully verified' + (p.devices.incomplete ? ' and ' + p.devices.incomplete + ' have incomplete identification' : '') + '. ' +
        U.plural(p.findings, 'finding') + ' recorded; network validation is ' + p.network.pct + '% complete.'),
      B.stats([{ label: 'Audit progress', value: p.overall + '%' }, { label: 'Tests failed', value: String(p.tests.fail), tone: p.tests.fail ? 'danger' : 'ok' }, { label: 'To investigate', value: String(p.tests.investigate), tone: p.tests.investigate ? 'warn' : null },
        { label: 'Devices verified', value: p.devices.verified + ' / ' + p.devices.total, tone: p.devices.total && p.devices.verified < p.devices.total ? 'warn' : null }, { label: 'Findings', value: String(p.findings) }, { label: 'Network validation', value: p.network.pct + '%' },
        { label: 'Photographs', value: String(p.photos) }, { label: 'Status', value: R.auditStatusLabel(audit), tone: R.auditLapsed(audit) ? 'danger' : null }]),
      B.h1('Space summary'));
    if (p.isConfig) {
      const cfg = store.get('room_configurations', audit.configuration_id) || {};
      rep.blocks.push(B.kv([['Configuration', cfg.name], ['Member spaces', p.rooms.map(R.roomLabel).join(' + ')], ['Combined capacity', cfg.capacity], ['How the spaces combine', cfg.description]]));
    } else {
      rep.blocks.push(B.kv([['Room', R.roomLabel(room)], ['Room identifier', room.code], ['Room type', room.room_type], ['Capacity', room.capacity], ['Area', (store.get('areas', room.area_id) || {}).name],
        ['Primary conferencing platform', room.conferencing_platform], ['AV control platform', room.control_platform], ['DSP platform', room.dsp_platform], ['Display configuration', room.display_config],
        ['Camera configuration', room.camera_config], ['Microphone configuration', room.microphone_config], ['Room scheduling platform', room.scheduling_platform], ['Current operational status', audit.operational_status]]));
    }
    rep.blocks.push(B.h1('Functional testing'));
    rep.blocks.push(B.table('Results by category', ['Category', 'Pass', 'Fail', 'Needs investigation', 'Not applicable', 'Not tested'], S.TEST_CATEGORIES.map(function (c) {
      const l = tests.filter(function (t) { return t.category === c; });
      const n = function (r) { return l.filter(function (t) { return (t.result || 'not_tested') === r; }).length; };
      return [c, n('pass'), n('fail'), n('investigate'), n('na'), n('not_tested')];
    }), { sheet: 'Test summary' }));
    if (flagged.length) rep.blocks.push(B.table('Failed and investigated tests', ['Category', 'Test', 'Result', 'Observation', 'Finding'], flagged.map(function (t) {
      const f = R.testFinding(t);
      const b = f && f.backlog_item_id ? store.get('backlog_items', f.backlog_item_id) : null;
      return [t.category, t.test_name, S.label(S.TEST_RESULTS, t.result), t.comment || '',
        f ? f.code + (b ? ' → ' + b.code + ' (' + (b.priority || 'unprioritized') + ')' : f.status === 'dismissed' ? ' (finding dismissed)' : f.status === 'duplicate' ? ' (duplicate)' : ' (awaiting triage)')
          : (t.suggestion_state === 'dismissed' ? 'Dismissed' : 'Not yet recorded')];
    }), { toneCols: [2], sheet: 'Flagged tests' }));
    rep.blocks.push(B.table('All test results', ['Category', 'Test', 'Result', 'Comment'], tests.map(function (t) { return [t.category, t.test_name, S.label(S.TEST_RESULTS, t.result || 'not_tested'), t.comment || '']; }), { toneCols: [2], sheet: 'All tests' }));
    rep.blocks.push(B.h1('Device inventory'));
    if (devs.length) rep.blocks.push(B.table('Devices in this space', ['ID', 'Type', 'Manufacturer / model', 'Hostname', 'IP address', 'MAC address', 'Serial number', 'Switch / port', 'Firmware', 'Status'], devs.map(function (d) {
      return [d.code, R.deviceType(d), [d.manufacturer, d.model].filter(Boolean).join(' '), d.hostname || '', idCell(d, R.ID_FIELDS[0]), idCell(d, R.ID_FIELDS[1]), idCell(d, R.ID_FIELDS[2]),
        [d.connected_switch, d.switch_port].filter(Boolean).join(' ') || (R.isNetworked(d) ? 'Undocumented' : 'N/A'), d.firmware_version || (R.isNetworked(d) ? 'Undocumented' : ''), idState(d)];
    }), { toneCols: [4, 5, 6, 7, 9], sheet: 'Devices' }));
    else rep.blocks.push(B.p(p.devices.na ? 'The auditor confirmed that this space has no AV devices to inventory.' : 'No devices have been recorded for this space.'));
    rep.blocks.push(B.h1('Network validation'), B.table('Network validation checklist', ['Check', 'Status', 'Comment'], checks.map(function (c) { return [c.check_name, S.label(S.NETWORK_CHECK_STATUS, c.status || 'not_checked'), c.comment || '']; }), { toneCols: [1], sheet: 'Network validation' }));
    rep.blocks.push(B.h1('Findings'));
    if (findings.length) rep.blocks.push(B.table('Findings recorded in this audit', ['ID', 'Category', 'Finding', 'Observed evidence', 'Record type', 'Backlog'], findings.map(function (f) {
      const b = f.backlog_item_id ? store.get('backlog_items', f.backlog_item_id) : null;
      return [f.code, f.category, f.title, f.observation || '', S.label(S.CLASSIFICATION, f.classification), b ? b.code + ' · ' + (b.priority || 'Unprioritized') + ' · ' + b.status : 'Awaiting triage'];
    }), { sheet: 'Findings' }));
    else rep.blocks.push(B.p('No findings were recorded in this audit.'));
    if (notes.length || audit.general_notes) {
      rep.blocks.push(B.h1('Audit notes'));
      if (notes.length) rep.blocks.push(B.table('Notes by type', ['Type', 'Note', 'Recorded'], notes.map(function (n) { return [S.label(S.NOTE_TYPES, n.note_type), n.text, U.fmtDateTime(n.created_at)]; }), { sheet: 'Notes' }));
      if (audit.general_notes) rep.blocks.push(B.p(audit.general_notes));
    }
    if (photos.length) {
      rep.blocks.push(B.h1('Evidence photographs'));
      if (photos.length > 24) rep.blocks.push(B.p('This audit has ' + photos.length + ' photographs. The 24 most recent are reproduced here; all of them are in the application and in the daily export package (photo_index.csv).'));
      rep.blocks.push(B.photos(photos.slice(0, 24).map(function (ph) { return { id: ph.id, caption: (ph.code ? ph.code + ' · ' : '') + ph.category + (ph.description ? ' — ' + ph.description : '') }; })));
    }
    rep.blocks.push(B.h1('Outstanding items and next steps'));
    if (R.auditLapsed(audit)) rep.blocks.push(B.callout('warn', 'This audit was marked fully verified on ' + U.fmtDate(audit.verified_at) + ', but mandatory information has since become incomplete. Its verification has lapsed until the items below are resolved.'));
    rep.blocks.push(B.bullets(p.blockers.length ? p.blockers : ['All mandatory information for this audit is complete.']));
    return rep;
  };
  build.floor = function (sc) {
    const f = store.get('floors', sc.floor);
    if (!f) throw new Error('Select a floor for this report.');
    sc = { floor: f.id, building: f.building_id };
    const rep = base('floor', 'Floor Audit Summary', sc);
    const s = summaryStats(sc);
    const fp = R.floorProgress(f.id);
    rep.blocks.push(B.h1('Executive summary'), B.p(narrative(sc, s)), statBlock(s),
      B.kv([['Floor designation', f.designation], ['Audit status', f.audit_status_override || fp.label], ['Spaces', EV.floorCounts(fp)], f.infrastructure_notes ? ['Floor infrastructure notes', f.infrastructure_notes] : null]),
      B.h1('Spaces'), roomsTable(sortRooms(s.rooms)));
    const inc = s.devs.filter(function (d) { return !R.device(d).identified; });
    rep.blocks.push(B.h1('Device documentation'), B.p(s.devs.length + ' devices on this floor; ' + (s.devs.length - s.inc) + ' have complete identification.'));
    if (inc.length) rep.blocks.push(B.table('Devices with incomplete identification', ['ID', 'Room', 'Device', 'Missing', 'Awaiting'], inc.map(function (d) {
      const r = R.device(d);
      const who = U.uniq(R.ID_FIELDS.filter(function (x) { return r.states[x.k] === 'missing'; }).map(function (x) { return d[x.s] === 'awaiting_it' ? 'Client IT' : d[x.s] === 'awaiting_vendor' ? 'Vendor' : 'Onsite check'; })).join(', ');
      return [d.code, roomNo(d.room_id), R.deviceLabel(d), r.missing.join(', '), who];
    }), { sheet: 'Incomplete devices' }));
    rep.blocks.push(B.h1('Findings and backlog'));
    if (s.ob.length) rep.blocks.push(backlogTable(s.ob, 'Open backlog items')); else rep.blocks.push(B.p('No open backlog items for this floor.'));
    rep.blocks.push(B.h1('Next steps'), B.bullets(Rep.nextSteps(sc)));
    return rep;
  };
  build.building = function (sc) {
    const b = store.get('buildings', sc.building);
    if (!b) throw new Error('Select a building for this report.');
    sc = { building: b.id };
    const rep = base('building', 'Building Audit Summary', sc);
    const s = summaryStats(sc);
    rep.blocks.push(B.h1('Executive summary'), B.p(narrative(sc, s)), statBlock(s),
      B.kv([['Address', b.address], ['Building identifier', b.identifier], ['Site contact', b.site_contact], b.notes ? ['Notes', b.notes] : null]),
      B.h1('Audit progress by floor'), B.table('Progress', ['Building', 'Floor', 'Designation', 'Spaces', 'Audited', 'Partially audited', 'Not started', 'Complete'], progressRows(sc), { sheet: 'Progress' }),
      B.h1('Spaces'), roomsTable(sortRooms(s.rooms)));
    if (s.p1.length) { rep.blocks.push(B.h1('P1 — High priority items')); s.p1.forEach(function (x) { backlogDetail(x).forEach(function (bl) { rep.blocks.push(bl); }); }); }
    rep.blocks.push(B.h1('Open backlog'));
    if (s.ob.length) rep.blocks.push(backlogTable(s.ob, 'Open backlog items')); else rep.blocks.push(B.p('No open backlog items.'));
    rep.blocks.push(B.h1('Next steps'), B.bullets(Rep.nextSteps(sc)));
    return rep;
  };
  build.executive = function (sc) {
    const rep = base('executive', 'Executive Summary', sc);
    const s = summaryStats(sc);
    const alerts = R.alerts();
    rep.blocks.push(B.h1('Where the audit stands'), B.p(narrative(sc, s)), statBlock(s),
      B.table('Audit progress', ['Building', 'Floor', 'Designation', 'Spaces', 'Audited', 'Partially audited', 'Not started', 'Complete'], progressRows(sc), { sheet: 'Progress' }));
    rep.blocks.push(B.h1('Critical findings (P1)'));
    if (s.p1.length) rep.blocks.push(B.table('P1 — High', ['ID', 'Location', 'Issue', 'Status', 'Recommendation', 'Owner'], s.p1.map(function (b) { return [b.code, R.where(b) || '—', b.title, b.status, b.recommendation || '—', b.owner || 'Unassigned']; }), { toneCols: [3], sheet: 'P1' }));
    else rep.blocks.push(B.p('No P1 items are open.'));
    rep.blocks.push(B.h1('Risks and patterns'));
    const risks = alerts.map(function (a) { return a.title + ': ' + a.detail + '.'; }).concat(insightBullets(sc));
    rep.blocks.push(B.bullets(risks.length ? risks : ['No risks are flagged by the current records.']));
    rep.blocks.push(B.callout('info', 'Patterns are derived from recorded results. They indicate where to look; they are not confirmed root causes.'));
    /* s.it holds only requests that have been submitted; a draft is not "outstanding with" anyone yet */
    const it = s.it.filter(function (x) { return x.requested_from === 'Client IT'; }), pd = s.it.filter(function (x) { return x.requested_from === 'PepperDash'; });
    rep.blocks.push(B.h1('Dependencies'), B.bullets([
      U.plural(it.length, 'request') + ' outstanding with Client IT' + (it.length ? ': ' + it.slice(0, 5).map(function (x) { return x.topic; }).join('; ') : '') + '.',
      U.plural(pd.length, 'request') + ' outstanding with PepperDash engineering' + (pd.length ? ': ' + pd.slice(0, 5).map(function (x) { return x.topic; }).join('; ') : '') + '.',
      U.plural(s.it.length - it.length - pd.length, 'request') + ' outstanding with vendors or facilities.'].concat(
      s.drafts.length ? [U.plural(s.drafts.length, 'request') + ' drafted but not yet submitted: ' + s.drafts.slice(0, 5).map(function (x) { return x.topic + ' (' + x.requested_from + ')'; }).join('; ') + '.'] : [])));
    rep.blocks.push(B.h1('Recommended next steps'), B.bullets(Rep.nextSteps(sc)));
    return rep;
  };
  build.environment = function (sc) {
    const rep = base('environment', 'Environment Assessment', sc);
    const s = summaryStats(sc);
    const ds = R.deviceStats();
    rep.blocks.push(B.h1('Executive summary'), B.p(narrative(sc, s)), statBlock(s),
      B.h1('Audit progress'), B.table('Progress by floor', ['Building', 'Floor', 'Designation', 'Spaces', 'Audited', 'Partially audited', 'Not started', 'Complete'], progressRows(sc), { sheet: 'Progress' }),
      roomsTable(sortRooms(s.rooms), 'All spaces'));
    const patterns = insightBullets(sc);
    rep.blocks.push(B.h1('Recurring and systemic observations'), B.bullets(patterns.length ? patterns : ['No recurring patterns detected in the recorded results.']),
      B.callout('info', 'These are patterns in recorded data — hypotheses to investigate, not confirmed common causes.'));
    rep.blocks.push(B.h1('Device documentation completeness'),
      B.table('Identification by field', ['Identifier', 'Verified', 'Recorded, unverified', 'Missing', 'Not applicable'], R.ID_FIELDS.map(function (f) { const c = ds.byField[f.k]; return [f.label, c.verified, c.recorded, c.missing, c.na]; }), { sheet: 'ID completeness' }),
      B.p(ds.total + ' devices, ' + ds.networked + ' network-connected. ' + ds.verified + ' fully verified; ' + ds.incomplete + ' incomplete; ' + ds.noPort + ' without a documented switch port; ' + ds.noFirmware + ' with undocumented firmware.'));
    const infra = store.all('infra_assets').filter(function (a) { return !a.archived; });
    const await_ = infra.filter(function (a) { return !a.validation_status || a.validation_status === 'awaiting_it' || a.validation_status === 'unknown'; });
    rep.blocks.push(B.h1('Network and infrastructure'),
      B.p(infra.length + ' infrastructure records are documented (' + infra.filter(function (a) { return a.asset_type === 'switch'; }).length + ' switches). ' + await_.length + ' await Client IT validation. Values were recorded by observation or from information supplied by IT; no network discovery was performed.'));
    if (infra.length) rep.blocks.push(B.table('Infrastructure records', ['Type', 'Name', 'Identifier', 'Detail', 'Validation'], U.sortBy(infra, function (a) { return a.asset_type + a.name; }).map(function (a) {
      return [S.label(S.INFRA_TYPES, a.asset_type), a.name, a.identifier || a.ip_address || a.management_ip || '', [a.model, a.subnet, a.vlan && a.asset_type !== 'vlan' ? 'VLAN ' + a.vlan : '', a.description].filter(Boolean).join(' · '), S.label(S.VALIDATION_STATUS, a.validation_status || 'unknown')];
    }), { toneCols: [4], sheet: 'Infrastructure' }));
    rep.blocks.push(B.h1('Prioritized improvement backlog'));
    if (s.p1.length) s.p1.forEach(function (x) { backlogDetail(x).forEach(function (bl) { rep.blocks.push(bl); }); });
    if (s.ob.length) rep.blocks.push(backlogTable(s.ob, 'All open items')); else rep.blocks.push(B.p('No open backlog items.'));
    if (s.it.length || s.drafts.length) rep.blocks.push(B.h1('Coordination and dependencies'), requestsTable(s.it.concat(s.drafts), 'Open coordination requests (drafts have not been submitted)'));
    const sp = R.liveSpares();
    rep.blocks.push(B.h1('Spare equipment'), B.p(sp.length + ' stock lines. ' + R.spareStats().zero + ' at zero stock, ' + R.spareStats().low + ' below minimum, ' + R.spareCoverage().length + ' critical rooms without spare coverage.'));
    rep.blocks.push(B.h1('Recommendations and next steps'), B.bullets(Rep.nextSteps(sc)));
    return rep;
  };
  build.devices = function (sc) {
    const rep = base('devices', 'Device Inventory', sc, { landscape: true });
    const devs = devicesIn(sc);
    const inc = devs.filter(function (d) { return !R.device(d).identified; }).length;
    rep.blocks.push(B.p(devs.length + ' devices in scope. ' + (devs.length - inc) + ' have complete identification; ' + inc + ' are incomplete. “MISSING” marks a value that has not been recorded; nothing is assumed.'), devicesTable(devs));
    return rep;
  };
  build.network = function (sc) {
    const rep = base('network', 'Network-Connected Asset Register', sc, { landscape: true });
    const devs = devicesIn(sc).filter(R.isNetworked);
    rep.blocks.push(B.callout('info', 'Documentation record only. Values were observed onsite or supplied by Client IT; items marked unverified or awaiting IT must not be treated as confirmed.'),
      B.table('Network-connected devices', ['ID', 'Room', 'Hostname', 'Type', 'IP address', 'IP status', 'MAC address', 'MAC status', 'VLAN', 'Subnet', 'Assignment', 'Switch', 'Port', 'PoE', 'Firmware'],
        devs.map(function (d) {
          /* "N/A" for an identifier marked not applicable; "MISSING" only for one that should exist and is not recorded */
          return [d.code, roomNo(d.room_id), d.hostname || '', R.deviceType(d), idCell(d, R.ID_FIELDS[0]), S.label(S.ID_STATUS, d.ip_status || 'unknown'), idCell(d, R.ID_FIELDS[1]), S.label(S.ID_STATUS, d.mac_status || 'unknown'),
            d.vlan || '', d.subnet || '', d.ip_assignment || '', d.connected_switch || '', d.switch_port || 'Undocumented', d.poe_required || '', d.firmware_version || 'Undocumented'];
        }), { toneCols: [4, 5, 6, 7, 12, 14], primary: true, sheet: 'Network assets' }));
    const ports = [];
    store.all('infra_assets').filter(function (a) { return a.asset_type === 'switch' && !a.archived; }).forEach(function (sw) {
      U.sortBy(store.by('switch_ports', 'switch_asset_id', sw.id), function (p) { return p.port; }).forEach(function (p) {
        const d = store.get('devices', p.device_id);
        ports.push([sw.name, p.port, p.description || '', S.label(S.PORT_MODES, p.mode || 'unknown'), p.vlan || p.untagged_vlan || '', p.tagged_vlans || '', S.label(S.POE_STATUS, p.poe_status || 'unknown'), d ? (d.hostname || R.deviceType(d)) : '', S.label(S.VALIDATION_STATUS, p.validation_status || 'unknown')]);
      });
    });
    if (ports.length) rep.blocks.push(B.table('Switch port register', ['Switch', 'Port', 'Description', 'Mode', 'VLAN', 'Tagged VLANs', 'PoE', 'Connected device', 'Validation'], ports, { toneCols: [8], sheet: 'Switch ports' }));
    const infra = U.sortBy(store.all('infra_assets').filter(function (a) { return !a.archived; }), function (a) { return a.asset_type + a.name; });
    if (infra.length) rep.blocks.push(B.table('Infrastructure records', ['ID', 'Type', 'Name', 'Identifier', 'IP address', 'VLAN', 'Subnet', 'Description', 'Validation', 'Source'], infra.map(function (a) {
      return [a.code, S.label(S.INFRA_TYPES, a.asset_type), a.name, a.identifier || '', a.ip_address || a.management_ip || '', a.vlan || '', a.subnet || '', a.description || '', S.label(S.VALIDATION_STATUS, a.validation_status || 'unknown'), a.source || ''];
    }), { toneCols: [8], sheet: 'Infrastructure' }));
    const dl = store.all('network_links').filter(function (l) { return l.kind === 'dependency'; });
    if (dl.length) rep.blocks.push(B.table('Infrastructure dependencies', ['Device', 'Room', 'Depends on', 'Documented record', 'Status', 'Description'], dl.map(function (l) {
      const d = store.get('devices', l.from_id), t = store.get('infra_assets', l.to_id);
      return [d ? (d.hostname || R.deviceType(d)) : '—', d ? roomNo(d.room_id) : '—', l.dep_type || '', t ? t.name : '', S.label(S.DEP_STATUS, l.status || 'unknown'), l.description || ''];
    }), { toneCols: [4], sheet: 'Dependencies' }));
    return rep;
  };
  build.tests = function (sc) {
    const rep = base('tests', 'Functional Test Results', sc);
    const audits = latestAudits(sc);
    const rows = [];
    audits.forEach(function (a) { store.by('functional_tests', 'audit_id', a.id).forEach(function (t) { rows.push({ a: a, t: t }); }); });
    const count = function (cat, r) { return rows.filter(function (x) { return x.t.category === cat && (x.t.result || 'not_tested') === r; }).length; };
    rep.blocks.push(B.p('Latest audit of each space in scope: ' + U.plural(audits.length, 'audit') + ', ' + rows.length + ' test records.'),
      B.table('Results by category', ['Category', 'Pass', 'Fail', 'Needs investigation', 'Not applicable', 'Not tested'], S.TEST_CATEGORIES.map(function (c) { return [c, count(c, 'pass'), count(c, 'fail'), count(c, 'investigate'), count(c, 'na'), count(c, 'not_tested')]; }), { sheet: 'By category' }));
    const flagged = rows.filter(function (x) { return x.t.result === 'fail' || x.t.result === 'investigate'; });
    if (flagged.length) rep.blocks.push(B.table('Failed and investigated tests', ['Space', 'Audit', 'Category', 'Test', 'Result', 'Observation'], flagged.map(function (x) {
      return [R.auditTitle(x.a), x.a.code, x.t.category, x.t.test_name, S.label(S.TEST_RESULTS, x.t.result), x.t.comment || ''];
    }), { toneCols: [4], sheet: 'Flagged' }));
    rep.blocks.push(B.table('All results', ['Space', 'Audit', 'Audit date', 'Category', 'Test', 'Result', 'Comment'], U.sortBy(rows, function (x) { return R.auditTitle(x.a) + U.pad(x.t.sort_order || 0, 4); }).map(function (x) {
      return [R.auditTitle(x.a), x.a.code, x.a.audit_date, x.t.category, x.t.test_name, S.label(S.TEST_RESULTS, x.t.result || 'not_tested'), x.t.comment || ''];
    }), { toneCols: [5], primary: true, sheet: 'All results' }));
    return rep;
  };
  build.backlog = function (sc) {
    const rep = base('backlog', 'Findings and Prioritized Improvement Backlog', sc, { landscape: true });
    const s = summaryStats(sc);
    const all = sortBacklog(store.all('backlog_items').filter(function (b) { return inScopeLoose(b, sc); }));
    const closed = all.filter(function (b) { return S.BACKLOG_CLOSED.indexOf(b.status) >= 0; });
    const triage = store.all('findings').filter(function (f) { return f.status === 'open' && inScopeLoose(f, sc); });
    rep.blocks.push(B.h1('Summary'), B.p(U.plural(s.ob.length, 'open item') + ': ' + priorityBreakdown(s) + '. ' + closed.length + ' closed (completed, deferred or rejected). ' + U.plural(triage.length, 'field finding') + (triage.length === 1 ? ' awaits' : ' await') + ' triage.'),
      B.kv(S.PRIORITIES.map(function (p) { return [p[1], p[2]]; })),
      B.p('Priority is a judgement across business impact, frequency, user friction, operational risk and implementation effort; it is not a single score. Suspected causes are labelled as unverified hypotheses until confirmed.'));
    if (s.p1.length) { rep.blocks.push(B.h1('P1 — High')); s.p1.forEach(function (x) { backlogDetail(x).forEach(function (bl) { rep.blocks.push(bl); }); }); }
    rep.blocks.push(B.h1('Backlog register'), B.table('All items', ['ID', 'Priority', 'Status', 'Category', 'Location', 'Title', 'Problem statement', 'Observed evidence', 'Recommendation', 'Owner', 'Effort', 'Systemic'],
      all.map(function (b) { return [b.code, b.priority || 'Unprioritized', b.status, b.category, R.where(b) || '—', b.title, b.problem_statement || '', b.observed_evidence || '', b.recommendation || '', b.owner || 'Unassigned', (b.effort || '').split(' (')[0], b.systemic ? 'Yes' : '']; }),
      { toneCols: [1, 2], primary: true, sheet: 'Backlog' }));
    if (triage.length) rep.blocks.push(B.h1('Findings awaiting triage'), B.table('Field findings not yet in the backlog', ['ID', 'Location', 'Category', 'Finding', 'Observed evidence', 'Record type'], triage.map(function (f) {
      return [f.code, R.where(f) || '—', f.category, f.title, f.observation || '', S.label(S.CLASSIFICATION, f.classification)];
    }), { sheet: 'Awaiting triage' }));
    return rep;
  };
  build.coordination = function (sc) {
    const rep = base('coordination', 'IT Coordination Register', sc, { landscape: true });
    const all = U.sortBy(store.all('it_requests'), function (x) { return x.code; });
    const open = all.filter(function (x) { return S.IT_CLOSED.indexOf(x.status) < 0; });
    rep.blocks.push(B.p(U.plural(open.length, 'open request') + ' of ' + all.length + ': ' + S.IT_PARTIES.map(function (p) { return open.filter(function (x) { return x.requested_from === p; }).length + ' ' + p; }).join(', ') + '.'),
      requestsTable(all, 'All requests'));
    rep.blocks[rep.blocks.length - 1].primary = true;
    const links = store.all('backlog_it_links');
    if (links.length) rep.blocks.push(B.table('Requests linked to backlog items', ['Request', 'Topic', 'Backlog item', 'Backlog title', 'Priority'], links.map(function (l) {
      const x = store.get('it_requests', l.it_request_id), b = store.get('backlog_items', l.backlog_item_id);
      return x && b ? [x.code, x.topic, b.code, b.title, b.priority || 'Unprioritized'] : null;
    }).filter(Boolean), { toneCols: [4], sheet: 'Links' }));
    return rep;
  };
  build.spares = function (sc) {
    const rep = base('spares', 'Spare Equipment Assessment', sc);
    const ss = R.spareStats();
    const cov = R.spareCoverage();
    rep.blocks.push(B.h1('Summary'), B.stats([{ label: 'Stock lines', value: String(ss.total) }, { label: 'Units on hand', value: String(ss.units) }, { label: 'Zero available', value: String(ss.zero), tone: ss.zero ? 'danger' : 'ok' },
      { label: 'Below minimum', value: String(ss.low), tone: ss.low ? 'warn' : 'ok' }, { label: 'Unidentified', value: String(ss.unidentified), tone: ss.unidentified ? 'warn' : null }, { label: 'Approaching end of life', value: String(ss.eol), tone: ss.eol ? 'warn' : null },
      { label: 'Critical rooms uncovered', value: String(cov.length), tone: cov.length ? 'danger' : 'ok' }]));
    if (cov.length) rep.blocks.push(B.h1('Critical rooms without spare coverage'), B.table('Coverage gaps', ['Room', 'Device type', 'Manufacturer / model'], [].concat.apply([], cov.map(function (g) {
      return g.devices.map(function (d) { return [R.roomLabel(g.room), R.deviceType(d), [d.manufacturer, d.model].filter(Boolean).join(' ') || 'Not recorded']; });
    })), { sheet: 'Coverage gaps' }));
    rep.blocks.push(B.h1('Inventory'), B.table('Spare equipment', ['ID', 'Equipment', 'Manufacturer', 'Model', 'Part number', 'Serial number', 'Quantity', 'Minimum', 'Storage location', 'Floor', 'Condition', 'Lifecycle', 'Flags'],
      U.sortBy(R.liveSpares(), function (s) { return s.name; }).map(function (s) {
        return [s.code, s.name, s.manufacturer || '', s.model || '', s.part_number || '', s.serial_number || '', Number(s.quantity) || 0, Number(s.min_stock) || 0, s.storage_location || '', floorNo(s.floor_id), s.condition || '',
          S.label(S.SPARE_LIFECYCLE, s.lifecycle || 'unknown'), R.spare(s).map(function (f) { return f.label; }).join(', ')];
      }), { toneCols: [12], primary: true, sheet: 'Spares' }));
    return rep;
  };
  Rep.build = function (type, sc) {
    if (!build[type]) throw new Error('Unknown report type: ' + type);
    return build[type](sc || {});
  };

  /* ------------------------------------------------------------------ renderer: on-screen preview */
  const TONE_RE = [[/^(P1|Fail|MISSING|Missing|Out of service|Overdue|Zero available|Incomplete|Issue found|Blocked|Verification lapsed)/, 'danger'],
    [/(^P2|Needs investigation|unverified|Unverified|^Awaiting|awaiting|Requires IT|Below minimum|Degraded|Operational with issues|^In progress|Undocumented|Details missing|Check format|Not tested|Not checked|^Pending|Under Investigation|Unprioritized|Assumed|Approaching|Unidentified|Draft)/, 'warn'],
    [/^(Pass|Verified|Completed|Complete|Fully|Audited|Confirmed|Validated|Answered|Closed|Approved)/, 'ok']];
  function toneOf(v) {
    const s = String(v == null ? '' : v);
    if (!s || s.length > 60) return null;
    for (let i = 0; i < TONE_RE.length; i++) if (TONE_RE[i][0].test(s)) return TONE_RE[i][1];
    return null;
  }
  Rep.toneOf = toneOf;
  Rep.view = function (rep) {
    return h('article.paper', null,
      h('div.paper-brand', null, store.kvGet('org_name') ? h('span.paper-brand-name', null, String(store.kvGet('org_name')).toUpperCase()) : null, h('span.paper-brand-prod', null, 'AV ENVIRONMENT INTELLIGENCE')),
      h('h1.paper-title', null, rep.title),
      h('div.paper-sub', null, rep.subtitle),
      h('div.paper-meta', null, rep.meta.map(function (m, i) { return h('div', { key: 'm' + i }, h('span.paper-meta-k', null, m[0]), h('span.paper-meta-v', null, m[1] == null || m[1] === '' ? '—' : String(m[1]))); })),
      rep.demo ? h('div.paper-callout.paper-warn', null, 'DEMO DATA — this report contains synthetic records created for evaluation. It does not describe a real environment.') : null,
      rep.blocks.map(function (b, bi) {
        const k = 'b' + bi;
        switch (b.t) {
          case 'h1': return h('h2.paper-h1', { key: k }, b.text);
          case 'h2': return h('h3.paper-h2', { key: k }, b.text);
          case 'p': return h('p.paper-p', { key: k }, b.text);
          case 'bullets': return h('ul.paper-ul', { key: k }, b.items.map(function (it, i) { return h('li', { key: 'i' + i }, it); }));
          case 'kv': return h('dl.paper-kv', { key: k }, b.items.map(function (it, i) { return h('div', { key: 'i' + i }, h('dt', null, it[0]), h('dd', null, it[1] == null || it[1] === '' ? '—' : String(it[1]))); }));
          case 'stats': return h('div.paper-stats', { key: k }, b.items.map(function (it, i) { return h('div', { key: 'i' + i, 'class': 'paper-stat' + (it.tone ? ' paper-' + it.tone : '') }, h('span.paper-stat-v', null, it.value), h('span.paper-stat-l', null, it.label)); }));
          case 'callout': return h('div', { key: k, 'class': 'paper-callout paper-' + b.tone }, b.text);
          case 'photos': return h('div.paper-photos', { key: k }, b.items.map(function (it) {
            const ph = store.get('photos', it.id);
            return h('figure', { key: it.id }, ph && ph.thumb ? h('img', { src: ph.thumb, alt: it.caption }) : h('div.paper-nophoto', null, 'Image unavailable'), h('figcaption', null, it.caption));
          }));
          case 'table': return h('div.paper-table-block', { key: k },
            b.title ? h('div.paper-table-title', null, b.title, h('span', null, ' · ' + b.rows.length + (b.rows.length === 1 ? ' row' : ' rows'))) : null,
            b.rows.length ? h('div.paper-table-wrap', null, h('table.paper-table', null,
              h('thead', null, h('tr', null, b.columns.map(function (c, i) { return h('th', { key: 'c' + i }, c); }))),
              h('tbody', null, b.rows.slice(0, 400).map(function (r, ri) {
                return h('tr', { key: 'r' + ri }, r.map(function (v, ci) {
                  const tone = b.toneCols && b.toneCols.indexOf(ci) >= 0 ? toneOf(v) : null;
                  return h('td', { key: 'c' + ci, 'class': tone ? 'paper-t-' + tone : null }, v == null ? '' : String(v));
                }));
              })))) : h('p.paper-p.paper-muted', null, 'No records.'),
            b.rows.length > 400 ? h('p.paper-p.paper-muted', null, 'Preview shows the first 400 rows; exports contain all ' + b.rows.length + '.') : null);
          default: return null;
        }
      }),
      h('div.paper-foot', null, 'Generated ' + U.fmtDateTime(rep.generated_at) + ' · AV Environment Intelligence · Confidential — contains infrastructure information'));
  };

  /* ------------------------------------------------------------------ renderer: PDF */
  Rep.pdf = async function (rep) {
    const doc = EV.pdf.create({ title: rep.title + ' — ' + rep.subtitle, author: (EV.auth.profile().name || ''), landscape: !!rep.landscape });
    const PW = doc.width, PH = doc.height, ML = 44, MR = 44, MT = 54, MB = 48, W = PW - ML - MR;
    const INK = [17, 24, 39], MUTED = [107, 114, 128], ACCENT = [47, 111, 235], LINE = [208, 213, 221], NAVY = [15, 21, 34], BAND = [246, 248, 251];
    const TONE = { danger: [185, 28, 28], warn: [154, 92, 6], ok: [21, 128, 61] };
    const TINT = { danger: [254, 242, 242], warn: [255, 251, 235], ok: [240, 253, 244], info: [239, 246, 255] };
    const org = String(store.kvGet('org_name') || '').trim();   /* empty when no organization has been set */
    let y = 0;
    /* preload photographs */
    const imgs = new Map();
    for (const b of rep.blocks) {
      if (b.t !== 'photos') continue;
      for (const it of b.items) {
        const ph = store.get('photos', it.id);
        if (!ph) continue;
        try { const j = await EV.photos.jpegFor(ph, 1000); if (j) imgs.set(it.id, j); } catch (e) { /* skipped */ }
      }
    }
    function newPage() {
      doc.page();
      y = MT;
      if (doc.pageCount() > 1) {
        doc.text(rep.title, ML, 32, { size: 8, color: MUTED });
        doc.text((org ? org + ' · ' : '') + 'AV Environment Intelligence', PW - MR, 32, { size: 8, color: MUTED, align: 'right' });
        doc.line(ML, 38, PW - MR, 38, { color: LINE });
      }
    }
    function ensure(hh) { if (y + hh > PH - MB) newPage(); }
    function para(text, o) {
      o = o || {};
      const size = o.size || 9.5, lh = size * 1.4;
      doc.wrap(text, o.font, size, o.width || W).forEach(function (line) { ensure(lh); doc.text(line, o.x || ML, y + size, { font: o.font, size: size, color: o.color || INK }); y += lh; });
      y += o.after == null ? 6 : o.after;
    }
    /* cover */
    newPage();
    doc.rect(0, 0, PW, 7, { fill: ACCENT });
    if (org) {
      doc.text(org.toUpperCase(), ML, 40, { font: 'bold', size: 11, color: NAVY });
      doc.text('AV ENVIRONMENT INTELLIGENCE', ML + doc.textWidth(org.toUpperCase(), 'bold', 11) + 10, 40, { size: 7.5, color: MUTED });
    } else doc.text('AV ENVIRONMENT INTELLIGENCE', ML, 40, { font: 'bold', size: 11, color: NAVY });
    y = 62;
    doc.wrap(rep.title, 'bold', 21, W).forEach(function (l) { doc.text(l, ML, y + 21, { font: 'bold', size: 21, color: NAVY }); y += 26; });
    para(rep.subtitle, { size: 11.5, color: MUTED, after: 10 });
    const half = W / 2, rowsN = Math.ceil(rep.meta.length / 2);
    doc.rect(ML, y, W, rowsN * 17 + 10, { fill: BAND, stroke: LINE });
    rep.meta.forEach(function (m, i) {
      const cx = ML + 10 + (i % 2) * half, cy = y + 16 + Math.floor(i / 2) * 17;
      doc.text(m[0], cx, cy, { size: 8, color: MUTED });
      doc.text(doc.wrap(String(m[1] == null || m[1] === '' ? '—' : m[1]), 'bold', 8.5, half - 110)[0], cx + 92, cy, { font: 'bold', size: 8.5, color: INK });
    });
    y += rowsN * 17 + 22;
    if (rep.demo) { doc.rect(ML, y, W, 22, { fill: TINT.warn, stroke: [245, 208, 138] }); doc.text('DEMO DATA — synthetic records created for evaluation. This report does not describe a real environment.', ML + 8, y + 14, { font: 'bold', size: 8, color: TONE.warn }); y += 32; }

    function table(tb) {
      const size = 7.6, lh = 10, pad = 4;
      if (tb.title) { ensure(30); doc.text(tb.title + '  (' + tb.rows.length + (tb.rows.length === 1 ? ' row)' : ' rows)'), ML, y + 9, { font: 'bold', size: 9, color: INK }); y += 15; }
      if (!tb.rows.length) { para('No records.', { color: MUTED, size: 8.5 }); return; }
      const n = tb.columns.length;
      /* natural width = widest cell (capped); minimum width = widest single word, so words are not split mid-column */
      const nat = [], min = [];
      tb.columns.forEach(function (c, i) {
        let w = doc.textWidth(String(c), 'bold', size) + pad * 2 + 2, mw = 0;
        String(c).split(/\s+/).forEach(function (word) { mw = Math.max(mw, doc.textWidth(word, 'bold', size)); });
        tb.rows.slice(0, 60).forEach(function (r) {
          const s = String(r[i] == null ? '' : r[i]);
          w = Math.max(w, Math.min(doc.textWidth(s, 'regular', size) + pad * 2 + 2, 180));
          s.split(/\s+/).slice(0, 40).forEach(function (word) { mw = Math.max(mw, Math.min(doc.textWidth(word, 'bold', size), 120)); });
        });
        min.push(Math.max(mw + pad * 2 + 2, 28)); nat.push(Math.max(w, min[i]));
      });
      const sum = nat.reduce(function (a, b) { return a + b; }, 0), minSum = min.reduce(function (a, b) { return a + b; }, 0);
      let cw;
      if (sum <= W) cw = nat.map(function (w) { return w * W / sum; });
      else if (minSum >= W) cw = min.map(function (w) { return w * W / minSum; });
      else { const k = (W - minSum) / (sum - minSum); cw = nat.map(function (w, i) { return min[i] + (w - min[i]) * k; }); }
      const header = function () {
        const lines = tb.columns.map(function (c, i) { return doc.wrap(String(c), 'bold', size, cw[i] - pad * 2); });
        const hh = Math.max.apply(null, lines.map(function (l) { return l.length; })) * lh + 7;
        doc.rect(ML, y, W, hh, { fill: NAVY });
        let x = ML;
        lines.forEach(function (ls, i) { ls.forEach(function (l, li) { doc.text(l, x + pad, y + 9 + li * lh, { font: 'bold', size: size, color: [255, 255, 255] }); }); x += cw[i]; });
        y += hh;
      };
      ensure(40);
      header();
      tb.rows.forEach(function (r, ri) {
        const cells = [];
        let maxLines = 1;
        for (let i = 0; i < n; i++) {
          let ls = doc.wrap(String(r[i] == null ? '' : r[i]), 'regular', size, cw[i] - pad * 2);
          if (ls.length > 16) { ls = ls.slice(0, 16); ls[15] = ls[15].slice(0, Math.max(0, ls[15].length - 1)) + '…'; }
          cells.push(ls);
          maxLines = Math.max(maxLines, ls.length);
        }
        const rh = maxLines * lh + 6;
        if (y + rh > PH - MB) { newPage(); header(); }
        if (ri % 2 === 1) doc.rect(ML, y, W, rh, { fill: BAND });
        let x = ML;
        cells.forEach(function (ls, i) {
          const tone = tb.toneCols && tb.toneCols.indexOf(i) >= 0 ? toneOf(r[i]) : null;
          ls.forEach(function (l, li) { doc.text(l, x + pad, y + 9 + li * lh, { size: size, color: tone ? TONE[tone] : INK, font: tone ? 'bold' : 'regular' }); });
          x += cw[i];
        });
        y += rh;
        doc.line(ML, y, ML + W, y, { color: LINE, width: 0.4 });
      });
      y += 12;
    }
    for (const b of rep.blocks) {
      if (b.t === 'h1') { ensure(120); y += 6; doc.text(b.text, ML, y + 13, { font: 'bold', size: 13, color: NAVY }); y += 19; doc.line(ML, y, ML + W, y, { color: ACCENT, width: 1 }); y += 10; }
      else if (b.t === 'h2') { ensure(70); y += 2; para(b.text, { font: 'bold', size: 10.5, color: NAVY, after: 4 }); }
      else if (b.t === 'p') para(b.text);
      else if (b.t === 'bullets') { b.items.forEach(function (it) { const lines = doc.wrap(it, 'regular', 9.5, W - 14); lines.forEach(function (l, li) { ensure(13.3); if (li === 0) doc.text('•', ML + 2, y + 9.5, { size: 9.5, color: ACCENT }); doc.text(l, ML + 14, y + 9.5, { size: 9.5, color: INK }); y += 13.3; }); y += 2; }); y += 6; }
      else if (b.t === 'kv') {
        const kw = Math.min(170, W * 0.32);
        b.items.forEach(function (it) {
          const ls = doc.wrap(String(it[1] == null || it[1] === '' ? '—' : it[1]), 'regular', 9, W - kw - 8);
          const kl = doc.wrap(String(it[0]), 'regular', 8.5, kw - 6);
          const n = Math.max(ls.length, kl.length);
          /* a short row is kept together; a long value (many lines of evidence or notes) flows on to the next page
             line by line instead of running past the bottom margin */
          ensure(Math.min(n, 6) * 12.4 + 5);
          for (let li = 0; li < n; li++) {
            if (li >= 6) ensure(12.4);
            if (kl[li]) doc.text(kl[li], ML, y + 10, { size: 8.5, color: MUTED });
            if (ls[li]) doc.text(ls[li], ML + kw, y + 10, { size: 9, color: INK });
            y += 12.4;
          }
          y += 5;
          doc.line(ML, y, ML + W, y, { color: LINE, width: 0.4 });
        });
        y += 12;
      }
      else if (b.t === 'stats') {
        const per = rep.landscape ? 8 : 4, gap = 8, bw = (W - gap * (per - 1)) / per, bh = 44;
        b.items.forEach(function (it, i) {
          const col = i % per;
          if (col === 0) ensure(bh + 8);
          const x = ML + col * (bw + gap);
          doc.rect(x, y, bw, bh, { fill: BAND, stroke: LINE });
          doc.text(String(it.value), x + 8, y + 21, { font: 'bold', size: 14, color: it.tone ? TONE[it.tone] || NAVY : NAVY });
          doc.text(doc.wrap(String(it.label).toUpperCase(), 'regular', 6.6, bw - 14)[0], x + 8, y + 35, { size: 6.6, color: MUTED });
          if (col === per - 1 || i === b.items.length - 1) y += bh + 8;
        });
        y += 6;
      }
      else if (b.t === 'callout') {
        const ls = doc.wrap(b.text, 'regular', 9, W - 20);
        const bh = ls.length * 12.6 + 12;
        ensure(bh + 8);
        doc.rect(ML, y, W, bh, { fill: TINT[b.tone] || TINT.info, stroke: LINE });
        ls.forEach(function (l, li) { doc.text(l, ML + 10, y + 14 + li * 12.6, { size: 9, color: INK }); });
        y += bh + 12;
      }
      else if (b.t === 'photos') {
        const per = rep.landscape ? 4 : 3, gap = 10, cwid = (W - gap * (per - 1)) / per, ih = cwid * 0.72, ch = ih + 26;
        b.items.forEach(function (it, i) {
          const col = i % per;
          if (col === 0) ensure(ch + 6);
          const x = ML + col * (cwid + gap);
          doc.rect(x, y, cwid, ih, { fill: [238, 241, 245], stroke: LINE });
          const im = imgs.get(it.id);
          if (im) {
            const sc = Math.min(cwid / im.width, ih / im.height);
            const dw = im.width * sc, dh = im.height * sc;
            doc.image(im.bytes, im.width, im.height, x + (cwid - dw) / 2, y + (ih - dh) / 2, dw, dh);
          } else doc.text('Image not available on this device', x + 8, y + ih / 2, { size: 7.5, color: MUTED });
          doc.wrap(it.caption, 'regular', 7.2, cwid).slice(0, 2).forEach(function (l, li) { doc.text(l, x, y + ih + 10 + li * 9, { size: 7.2, color: MUTED }); });
          if (col === per - 1 || i === b.items.length - 1) y += ch + 6;
        });
        y += 6;
      }
      else if (b.t === 'table') table(b);
    }
    const total = doc.pageCount();
    for (let i = 0; i < total; i++) {
      doc.setPage(i);
      doc.line(ML, PH - 34, PW - MR, PH - 34, { color: LINE });
      doc.text((org ? org + ' ' : '') + 'AV Environment Intelligence · Confidential — contains infrastructure information', ML, PH - 22, { size: 7, color: MUTED });
      if (rep.demo) doc.text('DEMO DATA', PW / 2 + 90, PH - 22, { font: 'bold', size: 7, color: TONE.warn, align: 'center' });
      doc.text('Page ' + (i + 1) + ' of ' + total, PW - MR, PH - 22, { size: 7, color: MUTED, align: 'right' });
    }
    return doc.finish();
  };

  /* ------------------------------------------------------------------ renderers: CSV and Excel */
  function tablesOf(rep) { return rep.blocks.filter(function (b) { return b.t === 'table'; }); }
  Rep.csv = function (rep) {
    const tables = tablesOf(rep);
    const primary = tables.find(function (t) { return t.primary; });
    const rows = [];
    if (primary) { rows.push(primary.columns); primary.rows.forEach(function (r) { rows.push(r); }); }
    else {
      rows.push([rep.title]); rows.push([rep.subtitle]); rep.meta.forEach(function (m) { rows.push([m[0], m[1]]); });
      if (rep.demo) rows.push(['DEMO DATA — synthetic records']);
      tables.forEach(function (t) { rows.push([]); rows.push([t.title || 'Table']); rows.push(t.columns); t.rows.forEach(function (r) { rows.push(r); }); });
    }
    return EV.csv.encode(rows, { bom: true, guard: true });
  };
  Rep.xlsx = function (rep) {
    const cells = [];
    const add = function (v, s, height) { cells.push({ height: height, cells: [{ c: 0, v: v, s: s }] }); };
    add(rep.title, 3, 30); add(rep.subtitle, 4);
    if (rep.demo) add('DEMO DATA — synthetic records created for evaluation.', 11);
    cells.push({ cells: [] });
    rep.meta.forEach(function (m) { cells.push({ cells: [{ c: 0, v: m[0], s: 5 }, { c: 1, v: m[1] == null ? '' : String(m[1]), s: 2 }] }); });
    rep.blocks.forEach(function (b) {
      if (b.t === 'h1') { cells.push({ cells: [] }); cells.push({ height: 22, cells: [{ c: 0, v: b.text, s: 8 }, { c: 1, v: '', s: 8 }] }); }
      else if (b.t === 'h2') add(b.text, 11);
      else if (b.t === 'p' || b.t === 'callout') cells.push({ cells: [{ c: 0, v: '', s: 0 }, { c: 1, v: b.text, s: 2 }] });
      else if (b.t === 'bullets') b.items.forEach(function (it) { cells.push({ cells: [{ c: 0, v: '•', s: 0 }, { c: 1, v: it, s: 2 }] }); });
      else if (b.t === 'kv') b.items.forEach(function (it) { cells.push({ cells: [{ c: 0, v: it[0], s: 5 }, { c: 1, v: it[1] == null ? '' : String(it[1]), s: 2 }] }); });
      else if (b.t === 'stats') b.items.forEach(function (it) { cells.push({ cells: [{ c: 0, v: it.label, s: 5 }, { c: 1, v: it.value, s: 11 }] }); });
      else if (b.t === 'table') cells.push({ cells: [{ c: 0, v: 'Table', s: 5 }, { c: 1, v: (b.title || 'Table') + ' — see sheet “' + (b.sheet || b.title) + '” (' + b.rows.length + ' rows)', s: 2 }] });
    });
    const sheets = [{ name: 'Summary', grid: true, widths: [34, 110], tabColor: 'FF3D8BFF', rows: cells }];
    const used = new Set(['summary']);
    tablesOf(rep).forEach(function (t, i) {
      let name = String(t.sheet || t.title || 'Table ' + (i + 1)).replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 28);
      let n = 2; const b0 = name;
      while (used.has(name.toLowerCase())) name = b0.slice(0, 25) + ' ' + (n++);
      used.add(name.toLowerCase());
      sheets.push({ name: name, table: 'tbl_' + (i + 1), columns: t.columns.map(function (c, ci) {
        const longest = Math.max(String(c).length, Math.max.apply(null, [0].concat(t.rows.slice(0, 150).map(function (r) { return String(r[ci] == null ? '' : r[ci]).length; }))));
        /* short status words are matched exactly, so a serial number or hostname that merely contains "P1" or "Pass" is not coloured */
        const cond = t.toneCols && t.toneCols.indexOf(ci) >= 0 ? [{ eq: 'P1', dxf: 0 }, { eq: 'Fail', dxf: 0 }, { contains: 'MISSING', dxf: 0 }, { eq: 'Incomplete', dxf: 0 }, { contains: 'lapsed', dxf: 0 }, { eq: 'P2', dxf: 1 },
          { contains: 'investigation', dxf: 1 }, { contains: 'unverified', dxf: 1 }, { contains: 'Awaiting', dxf: 1 }, { contains: 'Undocumented', dxf: 1 }, { eq: 'Check format', dxf: 1 }, { eq: 'Unverified', dxf: 1 },
          { eq: 'Pass', dxf: 2 }, { eq: 'Verified', dxf: 2 }, { eq: 'Completed', dxf: 2 }] : null;
        return { header: c, width: Math.min(64, Math.max(11, longest + 3)), wrap: longest > 44, cond: cond };
      }), rows: t.rows });
    });
    return EV.xlsx.build({ title: rep.title + ' — ' + rep.subtitle, creator: EV.auth.profile().name, sheets: sheets });
  };
  Rep.download = async function (rep, format) {
    let blob, ext, mime;
    if (format === 'pdf') { blob = await Rep.pdf(rep); ext = 'pdf'; mime = 'application/pdf'; }
    else if (format === 'xlsx') { blob = await Rep.xlsx(rep); ext = 'xlsx'; mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; }
    else { blob = new Blob([Rep.csv(rep)], { type: 'text/csv' }); ext = 'csv'; mime = 'text/csv'; }
    const res = await EV.saveFile(blob, rep.filename + '.' + ext, mime);
    if (res.ok) { EV.toast(ext.toUpperCase() + ' ready: ' + rep.filename + '.' + ext, 'ok', 3600); store.log({ action: 'exported', entity_type: 'reports', summary: rep.title + ' exported as ' + ext.toUpperCase() + ' — ' + rep.subtitle }); }
    else EV.toast(res.message || 'The file could not be saved here.', 'warn', 5000);
    return res;
  };
  /* CSV of whatever list is on screen (devices, backlog, requests, spares, infrastructure). */
  Rep.quickCsv = async function (table, records) {
    const X = EV.exporter;
    const cols = X.columns(table);
    const rows = [cols].concat(records.map(function (r) { return X.row(table, r); }));
    const name = U.fileSafe(store.orgCode() + '_' + table + '_' + U.localDate()) + '.csv';
    const res = await EV.saveFile(new Blob([EV.csv.encode(rows, { bom: true, guard: true })], { type: 'text/csv' }), name, 'text/csv');
    if (res.ok) EV.toast(records.length + ' records exported to ' + name, 'ok', 3600); else EV.toast(res.message || 'The file could not be saved here.', 'warn', 5000);
    return res;
  };
})();
