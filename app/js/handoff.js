/* handoff.js — Claude-ready handoff: the master Excel workbook (15 tabs), per-package analysis instructions,
 * the data dictionary and the reusable Claude Project instruction document. */
(function () {
  'use strict';
  const EV = window.EV, U = EV.U, S = EV.S, store = EV.store, R = EV.rules, A = EV.act;
  const H = (EV.handoff = {});
  const WORKBOOK_NAME = 'AV_Audit_Master_Workbook.xlsx';
  H.WORKBOOK_NAME = WORKBOOK_NAME;

  /* ------------------------------------------------------------------ lookups */
  function name(table, id, fn) { const r = store.getAny(table, id); return r ? fn(r) : ''; }
  const bName = function (r) { return name('buildings', r.building_id, function (b) { return b.name; }); };
  const fNo = function (r) { return name('floors', r.floor_id, function (f) { return f.number; }); };
  const rCode = function (r) { return name('rooms', r.room_id, function (x) { return x.code; }); };
  const rLabel = function (r) { return name('rooms', r.room_id, function (x) { return R.roomLabel(x); }); };
  const dLabel = function (r) { return name('devices', r.device_id, function (d) { return (d.code + ' ' + (d.hostname || R.deviceType(d))).trim(); }); };
  const yes = function (v) { return v ? 'Yes' : 'No'; };
  const ID_STATE = { verified: 'Verified', recorded: 'Unverified', missing: 'Missing', na: 'N/A' };
  const idState = function (d, i) { return ID_STATE[R.idState(d, R.ID_FIELDS[i])]; };
  const AUDIT_STATE = { not_started: 'Not started', in_progress: 'In progress', audited: 'Audited', verified: 'Fully verified' };
  const RED = 0, AMBER = 1, GREEN = 2, GREY = 3;
  const condPriority = [{ eq: 'P1', dxf: RED }, { eq: 'P2', dxf: AMBER }, { eq: 'P3', dxf: GREY }];
  const condIdState = [{ eq: 'Missing', dxf: RED }, { eq: 'Unverified', dxf: AMBER }, { eq: 'Verified', dxf: GREEN }, { eq: 'N/A', dxf: GREY }];
  const condOpen = [{ eq: 'Open', dxf: AMBER }, { eq: 'Closed', dxf: GREEN }];

  /* ------------------------------------------------------------------ workbook tab definitions
   * columns: [header, getter, {width, wrap, list, cond}] — the first column of every tab is the permanent record ID (merge key). */
  H.TABS = [
    { name: 'Buildings & Floors', table: 'tblFloors', source: 'floors.csv (+ buildings.csv)', rows: function () { return store.all('floors'); }, columns: [
      ['Floor ID', function (f) { return f.id; }, { width: 38 }], ['Building ID', function (f) { return f.building_id; }, { width: 38 }], ['Building', bName, { width: 26 }],
      ['Address', function (f) { return name('buildings', f.building_id, function (b) { return b.address; }); }, { width: 34 }],
      ['Building Identifier', function (f) { return name('buildings', f.building_id, function (b) { return b.identifier; }); }, { width: 18 }],
      ['Floor', function (f) { return f.number; }, { width: 9 }], ['Designation', function (f) { return f.designation; }, { width: 28 }],
      ['Spaces', function (f) { return R.floorProgress(f.id).total; }, { width: 9 }], ['Audited', function (f) { return R.floorProgress(f.id).audited; }, { width: 9 }],
      ['Partially Audited', function (f) { return R.floorProgress(f.id).partial; }, { width: 11 }], ['Not Started', function (f) { return R.floorProgress(f.id).notStarted; }, { width: 11 }],
      ['Audit Status', function (f) { return f.audit_status_override || R.floorProgress(f.id).label; }, { width: 14, cond: [{ eq: 'Complete', dxf: GREEN }, { eq: 'In progress', dxf: AMBER }] }],
      ['Infrastructure Notes', function (f) { return f.infrastructure_notes; }, { width: 50, wrap: true }], ['Archived', function (f) { return yes(f.archived); }, { width: 10 }], ['Last Updated', function (f) { return f.updated_at; }, { width: 22 }]] },
    { name: 'Room Register', table: 'tblRooms', source: 'rooms.csv', rows: function () { return store.all('rooms'); }, columns: [
      ['Room ID', function (r) { return r.id; }, { width: 38 }], ['Room Code', function (r) { return r.code; }, { width: 16 }], ['Building', bName, { width: 24 }], ['Floor', fNo, { width: 8 }],
      ['Area', function (r) { return name('areas', r.area_id, function (a) { return a.name; }); }, { width: 18 }], ['Room Number', function (r) { return r.number; }, { width: 12 }], ['Room Name', function (r) { return r.name; }, { width: 34 }],
      ['Room Type', function (r) { return r.room_type; }, { width: 26, list: S.ROOM_TYPES }], ['Capacity', function (r) { return r.capacity; }, { width: 9 }],
      ['Criticality', function (r) { return S.label(S.CRITICALITY, R.criticality(r)); }, { width: 20 }], ['Conference Space', function (r) { return yes(R.isConference(r)); }, { width: 11 }],
      ['Conferencing Platform', function (r) { return r.conferencing_platform; }, { width: 22 }], ['Control Platform', function (r) { return r.control_platform; }, { width: 20 }], ['DSP Platform', function (r) { return r.dsp_platform; }, { width: 20 }],
      ['Display Configuration', function (r) { return r.display_config; }, { width: 30 }], ['Camera Configuration', function (r) { return r.camera_config; }, { width: 30 }], ['Microphone Configuration', function (r) { return r.microphone_config; }, { width: 30 }],
      ['Scheduling Platform', function (r) { return r.scheduling_platform; }, { width: 26 }],
      ['Operational Status', function (r) { return r.operational_status; }, { width: 22, list: S.OP_STATUS, cond: [{ eq: 'Out of service', dxf: RED }, { eq: 'Degraded', dxf: AMBER }, { eq: 'Operational with issues', dxf: AMBER }, { eq: 'Fully operational', dxf: GREEN }] }],
      ['Audit State', function (r) { return AUDIT_STATE[R.roomState(r.id).state]; }, { width: 15, cond: [{ eq: 'Fully verified', dxf: GREEN }, { eq: 'Audited', dxf: GREEN }, { eq: 'In progress', dxf: AMBER }, { eq: 'Not started', dxf: GREY }] }],
      ['Latest Audit', function (r) { const s = R.roomState(r.id); return s.audit ? s.audit.code : ''; }, { width: 15 }], ['Audit Count', function (r) { return R.roomState(r.id).count; }, { width: 9 }],
      ['Device Count', function (r) { return R.roomDevices(r.id).length; }, { width: 9 }], ['Archived', function (r) { return yes(r.archived); }, { width: 10 }], ['Notes', function (r) { return r.notes; }, { width: 40, wrap: true }],
      ['Last Updated', function (r) { return r.updated_at; }, { width: 22 }]] },
    { name: 'Room Audit History', table: 'tblAudits', source: 'room_audits.csv', rows: function () { return U.sortBy(store.all('audits'), function (a) { return a.started_at; }); }, columns: [
      ['Audit ID', function (a) { return a.id; }, { width: 38 }], ['Audit Code', function (a) { return a.code; }, { width: 15 }], ['Building', bName, { width: 24 }], ['Floor', fNo, { width: 8 }],
      ['Space', function (a) { return R.auditTitle(a); }, { width: 36 }], ['Room Code', rCode, { width: 15 }], ['Configuration', function (a) { return name('room_configurations', a.configuration_id, function (c) { return c.name; }); }, { width: 26 }],
      ['Audit Date', function (a) { return a.audit_date; }, { width: 12 }], ['Auditor', function (a) { return a.auditor; }, { width: 20 }],
      ['Status', function (a) { return R.auditStatusLabel(a); }, { width: 19, cond: [{ eq: 'Fully verified', dxf: GREEN }, { eq: 'Complete', dxf: GREEN }, { eq: 'In progress', dxf: AMBER }, { eq: 'Verification lapsed', dxf: RED }] }],
      ['Operational Status', function (a) { return a.operational_status; }, { width: 22 }], ['Overall %', function (a) { return (R.auditProgress(a.id) || {}).overall; }, { width: 9 }],
      ['Tests Done', function (a) { return R.auditProgress(a.id).tests.done; }, { width: 9 }], ['Tests Total', function (a) { return R.auditProgress(a.id).tests.total; }, { width: 9 }],
      ['Tests Failed', function (a) { return R.auditProgress(a.id).tests.fail; }, { width: 9 }], ['Tests To Investigate', function (a) { return R.auditProgress(a.id).tests.investigate; }, { width: 11 }],
      ['Devices Verified', function (a) { return R.auditProgress(a.id).devices.verified; }, { width: 10 }], ['Devices Total', function (a) { return R.auditProgress(a.id).devices.total; }, { width: 9 }],
      ['Network Validation %', function (a) { return R.auditProgress(a.id).network.pct; }, { width: 11 }], ['Photographs', function (a) { return R.auditProgress(a.id).photos; }, { width: 11 }],
      ['Findings', function (a) { return R.auditProgress(a.id).findings; }, { width: 9 }], ['Can Be Fully Verified', function (a) { return yes(R.auditProgress(a.id).canVerify); }, { width: 11 }],
      ['Outstanding', function (a) { return a.status === 'verified' && !R.auditLapsed(a) ? '' : R.auditProgress(a.id).blockers.join('; '); }, { width: 60, wrap: true }],
      ['Started At', function (a) { return a.started_at; }, { width: 22 }], ['Completed At', function (a) { return a.completed_at; }, { width: 22 }], ['Verified At', function (a) { return a.verified_at; }, { width: 22 }],
      ['Last Updated', function (a) { return a.updated_at; }, { width: 22 }]] },
    { name: 'Device Inventory', table: 'tblDevices', source: 'devices.csv', rows: function () { return U.sortBy(store.all('devices'), function (d) { return d.code; }); }, columns: [
      ['Device ID', function (d) { return d.id; }, { width: 38 }], ['Device Code', function (d) { return d.code; }, { width: 15 }], ['Building', bName, { width: 24 }], ['Floor', fNo, { width: 8 }], ['Room Code', rCode, { width: 15 }],
      ['Room', rLabel, { width: 30 }], ['Device Type', function (d) { return R.deviceType(d); }, { width: 24 }], ['Role', function (d) { return d.role; }, { width: 30 }], ['Manufacturer', function (d) { return d.manufacturer; }, { width: 16 }],
      ['Model', function (d) { return d.model; }, { width: 20 }], ['Hostname', function (d) { return d.hostname; }, { width: 22 }], ['Serial Number', function (d) { return d.serial_number; }, { width: 22 }],
      ['Serial State', function (d) { return idState(d, 2); }, { width: 12, cond: condIdState }], ['Serial Verification', function (d) { return S.label(S.ID_STATUS, d.serial_status || 'unknown'); }, { width: 28, list: S.ID_STATUS.map(function (x) { return x[1]; }) }],
      ['Identification Status', function (d) { return R.device(d).identified ? 'Complete' : 'Incomplete'; }, { width: 14, cond: [{ eq: 'Incomplete', dxf: RED }, { eq: 'Complete', dxf: GREEN }] }],
      ['Missing Fields', function (d) { return R.device(d).missing.join('; '); }, { width: 30, cond: [{ contains: 'address', dxf: RED }, { contains: 'Serial', dxf: RED }] }],
      ['Fully Verified', function (d) { return yes(R.device(d).verified); }, { width: 10 }], ['Rack / Location', function (d) { return [name('racks', d.rack_id, function (k) { return k.name; }), d.rack_location].filter(Boolean).join(' · '); }, { width: 24 }],
      ['Firmware', function (d) { return d.firmware_version; }, { width: 22 }], ['Application Version', function (d) { return d.app_version; }, { width: 22 }], ['Warranty', function (d) { return d.warranty_info; }, { width: 26 }],
      ['Support Expiration', function (d) { return d.support_expiration; }, { width: 13 }], ['Archived', function (d) { return yes(d.archived); }, { width: 10 }], ['Notes', function (d) { return d.notes; }, { width: 40, wrap: true }],
      ['Last Updated', function (d) { return d.updated_at; }, { width: 22 }]] },
    { name: 'Network Asset Register', table: 'tblNetwork', source: 'devices.csv (network_connected = true)', rows: function () { return U.sortBy(store.all('devices').filter(R.isNetworked), function (d) { return d.code; }); }, columns: [
      ['Device ID', function (d) { return d.id; }, { width: 38 }], ['Device Code', function (d) { return d.code; }, { width: 15 }], ['Room', rLabel, { width: 30 }], ['Hostname', function (d) { return d.hostname; }, { width: 22 }],
      ['Device Type', function (d) { return R.deviceType(d); }, { width: 24 }], ['IP Address', function (d) { return d.ip_address; }, { width: 16 }], ['IP State', function (d) { return idState(d, 0); }, { width: 12, cond: condIdState }],
      ['IP Verification', function (d) { return S.label(S.ID_STATUS, d.ip_status || 'unknown'); }, { width: 28, list: S.ID_STATUS.map(function (x) { return x[1]; }) }], ['MAC Address', function (d) { return d.mac_address; }, { width: 19 }],
      ['MAC State', function (d) { return idState(d, 1); }, { width: 12, cond: condIdState }], ['MAC Verification', function (d) { return S.label(S.ID_STATUS, d.mac_status || 'unknown'); }, { width: 28, list: S.ID_STATUS.map(function (x) { return x[1]; }) }],
      ['VLAN', function (d) { return d.vlan; }, { width: 24 }], ['Subnet', function (d) { return d.subnet; }, { width: 17 }], ['Address Assignment', function (d) { return d.ip_assignment; }, { width: 18 }], ['DNS Name', function (d) { return d.dns_name; }, { width: 30 }],
      ['Switch', function (d) { return d.connected_switch; }, { width: 22 }], ['Switch Port', function (d) { return d.switch_port; }, { width: 12 }], ['Connection Type', function (d) { return d.connection_type; }, { width: 18 }],
      ['PoE Required', function (d) { return d.poe_required; }, { width: 10 }], ['PoE Class', function (d) { return d.poe_class; }, { width: 24 }], ['Power Source', function (d) { return d.power_source; }, { width: 18 }],
      ['Firmware', function (d) { return d.firmware_version; }, { width: 22 }], ['Monitoring Portal', function (d) { return d.monitoring_portal; }, { width: 22 }], ['Management URL', function (d) { return d.management_url; }, { width: 26 }],
      ['Archived', function (d) { return yes(d.archived); }, { width: 10 }], ['Last Updated', function (d) { return d.updated_at; }, { width: 22 }]] },
    { name: 'Functional Test Results', table: 'tblTests', source: 'functional_tests.csv', rows: function () { return U.sortBy(store.all('functional_tests'), function (t) { return t.audit_id + U.pad(t.sort_order || 0, 4); }); }, columns: [
      ['Test ID', function (t) { return t.id; }, { width: 38 }], ['Audit Code', function (t) { return name('audits', t.audit_id, function (a) { return a.code; }); }, { width: 15 }],
      ['Audit Date', function (t) { return name('audits', t.audit_id, function (a) { return a.audit_date; }); }, { width: 12 }], ['Space', function (t) { return name('audits', t.audit_id, function (a) { return R.auditTitle(a); }); }, { width: 34 }],
      ['Category', function (t) { return t.category; }, { width: 17 }], ['Test', function (t) { return t.test_name; }, { width: 30 }],
      ['Result', function (t) { return S.label(S.TEST_RESULTS, t.result || 'not_tested'); }, { width: 19, list: S.TEST_RESULTS.map(function (x) { return x[1]; }), cond: [{ eq: 'Fail', dxf: RED }, { eq: 'Needs investigation', dxf: AMBER }, { eq: 'Pass', dxf: GREEN }, { eq: 'Not tested', dxf: GREY }] }],
      ['Comment', function (t) { return t.comment; }, { width: 60, wrap: true }], ['Finding', function (t) { return name('findings', t.finding_id, function (f) { return f.code; }); }, { width: 15 }], ['Tested At', function (t) { return t.tested_at; }, { width: 22 }]] },
    { name: 'Findings', table: 'tblFindings', source: 'findings.csv', rows: function () { return U.sortBy(store.all('findings'), function (f) { return f.code; }); }, columns: [
      ['Finding ID', function (f) { return f.id; }, { width: 38 }], ['Finding Code', function (f) { return f.code; }, { width: 15 }], ['Building', bName, { width: 24 }], ['Floor', fNo, { width: 8 }], ['Room', rLabel, { width: 30 }],
      ['Device', dLabel, { width: 26 }], ['Audit', function (f) { return name('audits', f.audit_id, function (a) { return a.code; }); }, { width: 15 }], ['Category', function (f) { return f.category; }, { width: 20, list: S.FINDING_CATEGORIES }],
      ['Finding', function (f) { return f.title; }, { width: 44, wrap: true }], ['Observed Evidence', function (f) { return f.observation; }, { width: 60, wrap: true }],
      ['Record Type', function (f) { return S.label(S.CLASSIFICATION, f.classification); }, { width: 22 }], ['Auditor Interpretation', function (f) { return f.interpretation; }, { width: 44, wrap: true }],
      ['Unverified Hypothesis', function (f) { return f.hypothesis; }, { width: 44, wrap: true }], ['Recommended Action', function (f) { return f.recommended_action; }, { width: 44, wrap: true }],
      ['Preliminary Priority', function (f) { return f.priority_hint; }, { width: 11, cond: condPriority }],
      ['Status', function (f) { return S.label(S.FINDING_STATUS, f.status); }, { width: 18, list: S.FINDING_STATUS.map(function (x) { return x[1]; }), cond: [{ eq: 'Awaiting triage', dxf: AMBER }, { eq: 'Linked to backlog', dxf: GREEN }] }],
      ['Backlog Item', function (f) { return name('backlog_items', f.backlog_item_id, function (b) { return b.code; }); }, { width: 15 }], ['Source', function (f) { return f.source; }, { width: 14 }],
      ['Created', function (f) { return f.created_at; }, { width: 22 }], ['Last Updated', function (f) { return f.updated_at; }, { width: 22 }]] },
    { name: 'Improvement Backlog', table: 'tblBacklog', source: 'backlog.csv', rows: function () { return U.sortBy(store.all('backlog_items'), function (b) { return b.code; }); }, columns: [
      ['Backlog ID', function (b) { return b.id; }, { width: 38 }], ['Backlog Code', function (b) { return b.code; }, { width: 14 }], ['Priority', function (b) { return b.priority; }, { width: 9, list: ['P1', 'P2', 'P3'], cond: condPriority }],
      ['Status', function (b) { return b.status; }, { width: 26, list: S.BACKLOG_STATUSES, cond: [{ eq: 'Blocked', dxf: RED }, { eq: 'Completed', dxf: GREEN }, { contains: 'Pending', dxf: AMBER }] }],
      ['Open/Closed', function (b) { return S.BACKLOG_CLOSED.indexOf(b.status) < 0 ? 'Open' : 'Closed'; }, { width: 11, cond: condOpen }], ['Category', function (b) { return b.category; }, { width: 20, list: S.FINDING_CATEGORIES }],
      ['Building', bName, { width: 24 }], ['Floor', fNo, { width: 8 }], ['Room', rLabel, { width: 28 }], ['Device', dLabel, { width: 26 }], ['Title', function (b) { return b.title; }, { width: 44, wrap: true }],
      ['Problem Statement', function (b) { return b.problem_statement; }, { width: 50, wrap: true }], ['Observed Evidence', function (b) { return b.observed_evidence; }, { width: 56, wrap: true }],
      ['Suspected Cause (Unverified)', function (b) { return b.suspected_cause; }, { width: 46, wrap: true }], ['Root Cause (Confirmed)', function (b) { return b.root_cause_confidence === 'confirmed' ? b.root_cause : ''; }, { width: 46, wrap: true }],
      ['Root Cause Confidence', function (b) { return S.label(S.ROOT_CAUSE_CONFIDENCE, b.root_cause_confidence || 'not_determined'); }, { width: 26, list: S.ROOT_CAUSE_CONFIDENCE.map(function (x) { return x[1]; }) }],
      ['Confirmation Basis', function (b) { return b.root_cause_basis; }, { width: 34, wrap: true }], ['Recommendation', function (b) { return b.recommendation; }, { width: 50, wrap: true }], ['Strategy', function (b) { return b.strategy; }, { width: 22 }],
      ['Expected Outcome', function (b) { return b.expected_outcome; }, { width: 44, wrap: true }], ['Operational Risk', function (b) { return b.operational_risk; }, { width: 44, wrap: true }], ['Meeting Impact', function (b) { return b.meeting_impact; }, { width: 22 }],
      ['Frequency', function (b) { return b.frequency; }, { width: 24 }], ['User Impact', function (b) { return b.user_impact; }, { width: 40, wrap: true }], ['Business Impact', function (b) { return b.business_impact; }, { width: 11 }],
      ['User Friction', function (b) { return b.user_friction; }, { width: 11 }], ['Risk Level', function (b) { return b.risk_level; }, { width: 11 }], ['Effort', function (b) { return b.effort; }, { width: 18 }],
      ['Estimated Cost', function (b) { return b.estimated_cost; }, { width: 12 }], ['Dependencies', function (b) { return b.dependencies; }, { width: 40, wrap: true }], ['Owner', function (b) { return b.owner; }, { width: 22 }],
      ['Requested By', function (b) { return b.requested_by; }, { width: 20 }], ['Priority Rationale', function (b) { return b.priority_rationale; }, { width: 46, wrap: true }], ['Systemic', function (b) { return yes(b.systemic); }, { width: 10 }],
      ['Linked Findings', function (b) { return store.by('findings', 'backlog_item_id', b.id).map(function (f) { return f.code; }).join('; '); }, { width: 28 }],
      ['Related Requests', function (b) { return A.requestsFor(b.id).map(function (x) { return x.code; }).join('; '); }, { width: 22 }], ['Target Date', function (b) { return b.target_date; }, { width: 12 }],
      ['Created', function (b) { return b.created_at; }, { width: 22 }], ['Last Updated', function (b) { return b.updated_at; }, { width: 22 }], ['Completed', function (b) { return b.completed_at; }, { width: 22 }]] },
    { name: 'IT Coordination', table: 'tblCoordination', source: 'it_coordination.csv', rows: function () { return U.sortBy(store.all('it_requests'), function (x) { return x.code; }); }, columns: [
      ['Request ID', function (x) { return x.id; }, { width: 38 }], ['Request Code', function (x) { return x.code; }, { width: 14 }], ['Requested From', function (x) { return x.requested_from; }, { width: 16, list: S.IT_PARTIES }],
      ['Vendor', function (x) { return x.vendor_name; }, { width: 18 }], ['Type', function (x) { return x.request_type; }, { width: 26 }], ['Topic', function (x) { return x.topic; }, { width: 44, wrap: true }],
      ['Description', function (x) { return x.description; }, { width: 60, wrap: true }], ['Building', bName, { width: 24 }], ['Floor', fNo, { width: 8 }], ['Room', rLabel, { width: 28 }], ['Device', dLabel, { width: 26 }],
      ['Reason', function (x) { return x.reason; }, { width: 40, wrap: true }], ['Needed For', function (x) { return x.needed_for; }, { width: 34, wrap: true }], ['Priority', function (x) { return x.priority; }, { width: 9, list: ['P1', 'P2', 'P3'], cond: condPriority }],
      ['Status', function (x) { return x.status; }, { width: 18, list: S.IT_STATUSES }], ['Open/Closed', function (x) { return S.IT_CLOSED.indexOf(x.status) < 0 ? 'Open' : 'Closed'; }, { width: 11, cond: condOpen }],
      ['Overdue', function (x) { return yes(S.IT_CLOSED.indexOf(x.status) < 0 && !!x.target_date && x.target_date < U.localDate()); }, { width: 10, cond: [{ eq: 'Yes', dxf: RED }] }],
      ['Date Requested', function (x) { return x.date_requested; }, { width: 13 }], ['Target Date', function (x) { return x.target_date; }, { width: 12 }], ['Response', function (x) { return x.response; }, { width: 54, wrap: true }],
      ['Response Date', function (x) { return x.response_date; }, { width: 13 }], ['Documentation', function (x) { return x.documentation; }, { width: 34, wrap: true }],
      ['Related Backlog', function (x) { return A.backlogFor(x.id).map(function (b) { return b.code; }).join('; '); }, { width: 22 }], ['Last Updated', function (x) { return x.updated_at; }, { width: 22 }]] },
    { name: 'Infrastructure Dependencies', table: 'tblInfrastructure', source: 'infrastructure.csv, switch_ports.csv, network_relationships.csv', rows: function () {
      const out = [];
      U.sortBy(store.all('infra_assets'), function (a) { return a.asset_type + a.name; }).forEach(function (a) {
        out.push([a.id, 'Infrastructure record', S.label(S.INFRA_TYPES, a.asset_type), a.name, a.identifier || '', rLabel(a), a.asset_type === 'switch' ? a.name : '', '', a.vlan || (a.asset_type === 'vlan' ? a.identifier : ''), a.ip_address || a.management_ip || '', '',
          S.label(S.VALIDATION_STATUS, a.validation_status || 'unknown'), [a.model, a.subnet, a.description].filter(Boolean).join(' · '), a.source || '', a.updated_at]);
      });
      store.all('switch_ports').forEach(function (p) {
        const sw = store.getAny('infra_assets', p.switch_asset_id), d = store.getAny('devices', p.device_id);
        out.push([p.id, 'Switch port', S.label(S.PORT_MODES, p.mode || 'unknown'), d ? (d.hostname || R.deviceType(d)) : '(no device recorded)', p.description || '', d ? rLabel(d) : '', sw ? sw.name : '', p.port, p.vlan || p.untagged_vlan || p.tagged_vlans || '', d ? d.ip_address || '' : '', '',
          S.label(S.VALIDATION_STATUS, p.validation_status || 'unknown'), 'PoE: ' + S.label(S.POE_STATUS, p.poe_status || 'unknown'), '', p.updated_at]);
      });
      store.all('network_links').forEach(function (l) {
        if (l.kind === 'uplink') {
          const a = store.getAny('infra_assets', l.from_id), b = store.getAny('infra_assets', l.to_id);
          out.push([l.id, 'Uplink', 'Switch uplink', a ? a.name : '', '', '', a ? a.name : '', l.from_port || '', '', '', b ? b.name + (l.to_port ? ' ' + l.to_port : '') : '', S.label(S.DEP_STATUS, l.status || 'unknown'), l.description || '', '', l.updated_at]);
        } else {
          const d = store.getAny('devices', l.from_id), t = store.getAny('infra_assets', l.to_id);
          out.push([l.id, 'Dependency', l.dep_type || '', d ? (d.hostname || R.deviceType(d)) : '', d ? d.code : '', d ? rLabel(d) : '', d ? d.connected_switch || '' : '', d ? d.switch_port || '' : '', d ? d.vlan || '' : '', d ? d.ip_address || '' : '',
            t ? t.name : (l.dep_type || ''), S.label(S.DEP_STATUS, l.status || 'unknown'), l.description || '', '', l.updated_at]);
        }
      });
      return out;
    }, raw: true, columns: [
      ['Record ID', null, { width: 38 }], ['Record Kind', null, { width: 20, list: ['Infrastructure record', 'Switch port', 'Uplink', 'Dependency'] }], ['Type', null, { width: 26 }], ['Name / Device', null, { width: 30 }],
      ['Identifier', null, { width: 24 }], ['Room', null, { width: 28 }], ['Switch', null, { width: 20 }], ['Port', null, { width: 11 }], ['VLAN', null, { width: 20 }], ['IP Address', null, { width: 16 }], ['Depends On', null, { width: 28 }],
      ['Status / Validation', null, { width: 26, cond: [{ contains: 'Requires IT', dxf: AMBER }, { contains: 'Awaiting', dxf: AMBER }, { contains: 'Assumed', dxf: AMBER }, { eq: 'Unknown', dxf: GREY }, { contains: 'Validated', dxf: GREEN }, { eq: 'Confirmed', dxf: GREEN }] }],
      ['Description', null, { width: 54, wrap: true }], ['Source', null, { width: 34, wrap: true }], ['Last Updated', null, { width: 22 }]] },
    { name: 'Spare Equipment', table: 'tblSpares', source: 'spare_inventory.csv', rows: function () { return U.sortBy(store.all('spare_items'), function (s) { return s.code; }); }, columns: [
      ['Spare ID', function (s) { return s.id; }, { width: 38 }], ['Spare Code', function (s) { return s.code; }, { width: 14 }], ['Equipment', function (s) { return s.name; }, { width: 30 }], ['Manufacturer', function (s) { return s.manufacturer; }, { width: 16 }],
      ['Model', function (s) { return s.model; }, { width: 20 }], ['Part Number', function (s) { return s.part_number; }, { width: 20 }], ['Serial Number', function (s) { return s.serial_number; }, { width: 20 }],
      ['Quantity', function (s) { return Number(s.quantity) || 0; }, { width: 9 }], ['Minimum Stock', function (s) { return Number(s.min_stock) || 0; }, { width: 10 }], ['Storage Location', function (s) { return s.storage_location; }, { width: 32 }],
      ['Floor', fNo, { width: 8 }], ['Compatibility', function (s) { return s.compatibility; }, { width: 36, wrap: true }], ['Condition', function (s) { return s.condition; }, { width: 12, list: S.SPARE_CONDITION }],
      ['Lifecycle', function (s) { return S.label(S.SPARE_LIFECYCLE, s.lifecycle || 'unknown'); }, { width: 22 }], ['End of Life', function (s) { return s.eol_date; }, { width: 12 }], ['Warranty', function (s) { return s.warranty; }, { width: 22 }],
      ['Risk Flags', function (s) { return R.spare(s).map(function (f) { return f.label; }).join('; '); }, { width: 34, cond: [{ contains: 'Zero', dxf: RED }, { contains: 'End of life', dxf: RED }, { contains: 'Below', dxf: AMBER }, { contains: 'not recorded', dxf: AMBER }, { contains: 'Unidentified', dxf: AMBER }, { contains: 'Approaching', dxf: AMBER }] }],
      ['Archived', function (s) { return yes(s.archived); }, { width: 10 }], ['Notes', function (s) { return s.notes; }, { width: 40, wrap: true }], ['Last Updated', function (s) { return s.updated_at; }, { width: 22 }]] },
    { name: 'Photo Index', table: 'tblPhotos', source: 'photo_index.csv', rows: function () { return U.sortBy(store.all('photos'), function (p) { return p.code; }); }, columns: [
      ['Photo ID', function (p) { return p.id; }, { width: 38 }], ['Photo Code', function (p) { return p.code; }, { width: 15 }],
      ['File Path', function (p) { const m = p.mime || ''; return EV.exporter.photoPath(p, m.indexOf('png') >= 0 ? 'png' : m.indexOf('webp') >= 0 ? 'webp' : m.indexOf('heic') >= 0 ? 'heic' : m.indexOf('gif') >= 0 ? 'gif' : 'jpg'); }, { width: 70 }], ['Building', bName, { width: 24 }], ['Floor', fNo, { width: 8 }], ['Room', rLabel, { width: 28 }],
      ['Device', dLabel, { width: 26 }], ['Category', function (p) { return p.category; }, { width: 20, list: S.PHOTO_CATEGORIES }], ['Description', function (p) { return p.description; }, { width: 44, wrap: true }],
      ['Captured At', function (p) { return p.taken_at; }, { width: 22 }], ['Audit', function (p) { return name('audits', p.audit_id, function (a) { return a.code; }); }, { width: 15 }],
      ['Finding', function (p) { return name('findings', p.finding_id, function (f) { return f.code; }); }, { width: 15 }], ['Original Filename', function (p) { return p.original_filename; }, { width: 30 }],
      ['Size (bytes)', function (p) { return p.size_bytes; }, { width: 12 }], ['Annotated', function (p) { return yes(p.has_edit); }, { width: 10 }]] },
    { name: 'Data Quality & Exceptions', table: 'tblExceptions', source: 'validation_report.json (+ analyst findings)', raw: true, rows: function () {
      const col = EV.exporter.collect(EV.exporter.resolveScope({ mode: 'full' }));
      const val = EV.exporter.validate(col, null, null);
      const out = [];
      let n = 0;
      val.checks.forEach(function (c) {
        if (c.status === 'pass') return;
        /* the exception id is stable for the same check on the same record, so it is the merge key of this tab */
        c.records.forEach(function (x) { n++; out.push([x.exception_id, 'Generated from application data ' + U.localDate(), c.status === 'fail' ? 'Structural error' : 'Warning', c.name, x.detail, c.detail, 'Open', '']); });
      });
      return out;
    }, columns: [
      ['Exception ID', null, { width: 14 }], ['Detected In', null, { width: 34 }], ['Severity', null, { width: 16, list: ['Structural error', 'Warning', 'Conflict', 'Information'], cond: [{ eq: 'Structural error', dxf: RED }, { eq: 'Conflict', dxf: RED }, { eq: 'Warning', dxf: AMBER }] }],
      ['Check', null, { width: 44, wrap: true }], ['Record / Detail', null, { width: 70, wrap: true }], ['Description', null, { width: 50, wrap: true }],
      ['Status', null, { width: 12, list: ['Open', 'Resolved', 'Accepted'], cond: [{ eq: 'Open', dxf: AMBER }, { eq: 'Resolved', dxf: GREEN }] }], ['Resolution Notes', null, { width: 50, wrap: true }]] },
    { name: 'Change History', table: 'tblChanges', source: 'activity_log.csv', rows: function () { return U.sortBy(store.all('activity_log'), function (a) { return a.at; }); }, columns: [
      ['Entry ID', function (a) { return a.id; }, { width: 38 }], ['Timestamp', function (a) { return a.at; }, { width: 22 }], ['Actor', function (a) { return a.actor; }, { width: 20 }], ['Action', function (a) { return a.action; }, { width: 22 }],
      ['Record Type', function (a) { return a.entity_type; }, { width: 18 }], ['Record Code', function (a) { return a.entity_code; }, { width: 16 }], ['Summary', function (a) { return a.summary; }, { width: 70, wrap: true }],
      ['Field Changes', function (a) { return (a.changes || []).map(function (c) { return c.f + ': "' + (c.from || '') + '" → "' + (c.to || '') + '"'; }).join('; '); }, { width: 70, wrap: true }]] }
  ];

  /* ------------------------------------------------------------------ master workbook */
  H.masterWorkbook = async function () {
    const X = EV.xlsx;
    const data = H.TABS.map(function (t) {
      const recs = t.rows();
      const rows = t.raw ? recs : recs.map(function (r) { return t.columns.map(function (c) { let v; try { v = c[1](r); } catch (e) { v = ''; } return v == null ? '' : v; }); });
      return { def: t, rows: rows };
    });
    const letter = function (tab, header) {
      const t = H.TABS.find(function (x) { return x.name === tab; });
      const i = t.columns.findIndex(function (c) { return c[0] === header; });
      if (i < 0) throw new Error('Workbook column not found: ' + tab + ' / ' + header);
      return X.colName(i);
    };
    const rng = function (tab, header) { const L = letter(tab, header); return X.sheetRef(tab) + '!$' + L + ':$' + L; };
    const countRows = function (tab, idHeader) { return 'COUNTA(' + rng(tab, idHeader) + ')-1'; };
    const countIf = function (tab, header, value) { return 'COUNTIF(' + rng(tab, header) + ',"' + value + '")'; };
    /* several conditions on one tab: [[header, value], ...] */
    const countIfs = function (tab, pairs) { return 'COUNTIFS(' + pairs.map(function (p) { return rng(tab, p[0]) + ',"' + p[1] + '"'; }).join(',') + ')'; };
    /* archived rows stay on their tab as history but are not part of the live figures (the application counts the same way) */
    const live = function (tab, header, value) { return countIfs(tab, [[header, value], ['Archived', 'No']]); };
    const rows = [];
    const at = {};
    const put = function (cells, height) { rows.push({ height: height, cells: cells }); return rows.length; };
    put([{ c: 0, v: (store.kvGet('org_name') ? String(store.kvGet('org_name')).toUpperCase() + ' | ' : '') + 'AV ENVIRONMENT INTELLIGENCE — Master Audit Workbook', s: 3 }], 32);
    put([{ c: 0, v: 'Every figure on this sheet is a formula over the data tabs. Maintain the data tabs; this dashboard follows. Workbook generated ' + U.isoLocal() + ' (' + U.tz() + ').', s: 4 }], 30);
    /* stated for what this workbook actually contains, not for whatever else is on the device */
    const demoRows = ['buildings', 'floors', 'rooms', 'audits', 'devices', 'findings', 'backlog_items', 'it_requests', 'infra_assets', 'spare_items', 'photos'].some(function (t) { return store.all(t).some(function (r) { return r.is_demo; }); });
    if (demoRows) put([{ c: 0, v: 'DEMO DATA — this workbook contains synthetic records created for evaluation (each is marked in the application). Do not merge it with a workbook of real audit data.', s: 11 }]);
    const section = function (title) { put([]); put([{ c: 0, v: title, s: 8 }, { c: 1, v: '', s: 8 }, { c: 2, v: '', s: 8 }], 22); };
    const kpi = function (key, label, formula, note, pct) { at[key] = put([{ c: 0, v: label, s: 5 }, { c: 1, f: formula, s: pct ? 7 : 6 }, { c: 2, v: note || '', s: 9 }], 26); };
    const cell = function (key) { return '$B$' + at[key]; };
    section('ENVIRONMENT');
    const bf = X.sheetRef('Buildings & Floors') + '!$' + letter('Buildings & Floors', 'Building ID') + '$2:$' + letter('Buildings & Floors', 'Building ID') + '$1000';
    kpi('buildings', 'Buildings', 'SUMPRODUCT((' + bf + '<>"")/COUNTIF(' + bf + ',' + bf + '&""))', 'Distinct buildings on the Buildings & Floors tab');
    kpi('floors', 'Floors', countIf('Buildings & Floors', 'Archived', 'No'), 'Archived floors are not counted');
    kpi('spaces', 'Spaces (all)', countIf('Room Register', 'Archived', 'No'), 'Conference rooms, rack rooms and support areas; archived spaces are not counted');
    kpi('conf', 'Conference spaces', live('Room Register', 'Conference Space', 'Yes'), '');
    kpi('audited', 'Rooms completed', live('Room Register', 'Audit State', 'Audited') + '+' + live('Room Register', 'Audit State', 'Fully verified'), 'Audited or fully verified');
    kpi('inprog', 'Rooms in progress', live('Room Register', 'Audit State', 'In progress'), '');
    kpi('waiting', 'Rooms awaiting audit', live('Room Register', 'Audit State', 'Not started'), '');
    kpi('auditpct', 'Audit completion', 'IF(' + cell('spaces') + '=0,0,' + cell('audited') + '/' + cell('spaces') + ')', 'Rooms completed ÷ all spaces', true);
    section('DEVICES AND NETWORK');
    kpi('devices', 'Devices inventoried', countIf('Device Inventory', 'Archived', 'No'), 'Archived devices are not counted');
    kpi('netdev', 'Network-connected devices', countIf('Network Asset Register', 'Archived', 'No'), '');
    kpi('incomplete', 'Devices with incomplete identification', live('Device Inventory', 'Identification Status', 'Incomplete'), 'Missing IP, MAC or serial');
    kpi('noip', 'Devices with unknown IP address', live('Network Asset Register', 'IP State', 'Missing'), '');
    kpi('nomac', 'Devices with missing MAC address', live('Network Asset Register', 'MAC State', 'Missing'), '');
    kpi('noserial', 'Devices with missing serial number', live('Device Inventory', 'Serial State', 'Missing'), '');
    kpi('noport', 'Switch port undocumented', live('Network Asset Register', 'Switch Port', ''), 'Network-connected devices with no port recorded');
    /* infrastructure records only (the tab also lists switch ports, uplinks and dependencies); "Unknown" has not been validated either */
    kpi('infrawait', 'Infrastructure records awaiting IT validation',
      countIfs('Infrastructure Dependencies', [['Record Kind', 'Infrastructure record'], ['Status / Validation', S.label(S.VALIDATION_STATUS, 'awaiting_it')]]) + '+' +
      countIfs('Infrastructure Dependencies', [['Record Kind', 'Infrastructure record'], ['Status / Validation', S.label(S.VALIDATION_STATUS, 'unknown')]]), 'Requires IT validation, or validation not yet recorded');
    section('FINDINGS AND BACKLOG');
    kpi('findings', 'Findings recorded', countRows('Findings', 'Finding ID'), '');
    kpi('triage', 'Findings awaiting triage', countIf('Findings', 'Status', 'Awaiting triage'), 'Not yet in the backlog');
    kpi('blopen', 'Open backlog items', countIf('Improvement Backlog', 'Open/Closed', 'Open'), '');
    ['P1', 'P2', 'P3'].forEach(function (p) {
      kpi(p, p + ' open', 'COUNTIFS(' + rng('Improvement Backlog', 'Priority') + ',"' + p + '",' + rng('Improvement Backlog', 'Open/Closed') + ',"Open")', S.PRIORITIES.find(function (x) { return x[0] === p; })[2]);
    });
    kpi('bldone', 'Backlog items completed', countIf('Improvement Backlog', 'Status', 'Completed'), '');
    kpi('blpct', 'Backlog completion', 'IF((' + countRows('Improvement Backlog', 'Backlog ID') + '-' + countIf('Improvement Backlog', 'Status', 'Rejected') + ')=0,0,' + cell('bldone') + '/(' + countRows('Improvement Backlog', 'Backlog ID') + '-' + countIf('Improvement Backlog', 'Status', 'Rejected') + '))', 'Completed ÷ all items except rejected', true);
    kpi('systemic', 'Systemic items', countIf('Improvement Backlog', 'Systemic', 'Yes'), 'Affect more than one space');
    section('FUNCTIONAL TESTING');
    kpi('tests', 'Test results recorded', countRows('Functional Test Results', 'Test ID') + '-' + countIf('Functional Test Results', 'Result', S.label(S.TEST_RESULTS, 'not_tested')), 'Checklist items with a result; “Not tested” rows are not counted');
    kpi('fails', 'Tests failed', countIf('Functional Test Results', 'Result', 'Fail'), '');
    kpi('invest', 'Tests needing investigation', countIf('Functional Test Results', 'Result', 'Needs investigation'), '');
    section('COORDINATION');
    kpi('reqopen', 'Open coordination requests', countIf('IT Coordination', 'Open/Closed', 'Open'), '');
    kpi('itopen', 'Outstanding Client IT dependencies', 'COUNTIFS(' + rng('IT Coordination', 'Requested From') + ',"Client IT",' + rng('IT Coordination', 'Open/Closed') + ',"Open")', '');
    kpi('pdopen', 'Outstanding PepperDash dependencies', 'COUNTIFS(' + rng('IT Coordination', 'Requested From') + ',"PepperDash",' + rng('IT Coordination', 'Open/Closed') + ',"Open")', '');
    kpi('overdue', 'Overdue requests', countIf('IT Coordination', 'Overdue', 'Yes'), '');
    section('SPARES, EVIDENCE AND DATA QUALITY');
    kpi('spares', 'Spare stock lines', countIf('Spare Equipment', 'Archived', 'No'), 'Archived lines are not counted');
    kpi('zero', 'Spare lines at zero stock', 'COUNTIFS(' + rng('Spare Equipment', 'Archived') + ',"No",' + rng('Spare Equipment', 'Quantity') + ',0)', '');
    kpi('flagged', 'Spare lines with a risk flag', live('Spare Equipment', 'Risk Flags', '?*'), 'Zero, below minimum, unidentified or approaching end of life');
    kpi('photos', 'Photographs indexed', countRows('Photo Index', 'Photo ID'), '');
    kpi('dq', 'Open data-quality exceptions', countIf('Data Quality & Exceptions', 'Status', 'Open'), '');
    kpi('changes', 'Change-history entries', countRows('Change History', 'Entry ID'), '');
    put([]);
    put([{ c: 0, v: 'How to maintain this workbook: each data tab is an Excel table whose first column is the permanent record ID. Merge daily export packages by that ID; never delete history. See claude_analysis_instructions.md in each export package.', s: 9 }], 44);
    const sheets = [{ name: 'Executive Dashboard', grid: true, tabColor: 'FF3D8BFF', widths: [46, 20, 78], merges: ['A1:C1', 'A2:C2'], rows: rows }];
    data.forEach(function (d) {
      sheets.push({ name: d.def.name, table: d.def.table, columns: d.def.columns.map(function (c) { const o = c[2] || {}; return { header: c[0], width: o.width, wrap: o.wrap, list: o.list, cond: o.cond }; }), rows: d.rows });
    });
    return X.build({ title: 'AV Audit — Master Workbook', creator: EV.auth.profile().name || 'Auditor', sheets: sheets });
  };

  /* ------------------------------------------------------------------ data dictionary */
  const COL_DESC = {
    id: 'Permanent record ID (UUID). Primary key and merge key.', code: 'Human-readable permanent identifier.', org_id: 'Organization the record belongs to.',
    record_status: 'new | updated | unchanged | deleted — compared with the version of this same row that was last delivered from the capturing device (see manifest.baseline and record_status_definitions).', is_incomplete: 'true when the record has outstanding mandatory information.',
    incomplete_reasons: 'Why the record is incomplete, separated by " | ".', created_at: 'When the record was created (ISO 8601, UTC).', updated_at: 'When the record last changed (ISO 8601, UTC).',
    created_by: 'Auditor who created the record.', updated_by: 'Auditor who last changed the record.', deleted_at: 'Set when the record was deleted in the application; empty otherwise.', is_demo: 'true for synthetic demo data.',
    ip_status: 'How the IP address was verified (verification_status enumeration).', mac_status: 'How the MAC address was verified (verification_status enumeration).', serial_status: 'How the serial number was verified (verification_status enumeration).',
    identification_status: 'complete when IP, MAC and serial are each recorded or marked not applicable; otherwise incomplete.', missing_fields: 'Identification fields with no value.',
    verification_lapsed: 'true when the audit is recorded as fully verified but its mandatory information is no longer complete (see outstanding). Show its status as “Verification lapsed”, never as “Fully verified”.',
    unverified_fields: 'Identification fields that have a value which has not been verified.', suspected_cause: 'UNVERIFIED HYPOTHESIS. Never treat as a confirmed root cause.',
    root_cause: 'Confirmed root cause. Populated only when root_cause_confidence = confirmed.', observation: 'Observed evidence — facts only.', observed_evidence: 'Observed evidence — facts only.',
    classification: 'Whether the record is an observed fact, an auditor interpretation or an unverified hypothesis.', validation_status: 'How far the value can be trusted (validation_status enumeration).',
    file_path: 'Path of the image file inside this package; empty when the package carries no image for this photograph. manifest.photographs states whether the files are originals or optimized renditions.', edited_file_path: 'Path of the rotated/annotated rendition, when one exists.', file_sha256: 'SHA-256 of the packaged image file.',
    summary_snapshot: 'JSON snapshot of the space summary and progress at the time the audit was completed.', changes: 'JSON list of field changes: [{f: field, from, to}].',
    outstanding: 'What still prevents the audit from being fully verified, separated by " | ".', source_key: 'Key of the rule or test that suggested this record (prevents duplicate suggestions).'
  };
  /* columns every file carries that are not columns of the table definition */
  const COMMON_TYPES = { id: 'uuid', org_id: 'uuid', created_by: 'text', updated_by: 'text', is_demo: 'boolean', is_incomplete: 'boolean', record_status: 'text', incomplete_reasons: 'text' };
  /* Shown at the top of both instruction documents: giving audit data to an AI service is a decision for the client. */
  const AUTH_NOTE = '> **Authorisation required.** This material contains the client\'s infrastructure information. Give it to Claude, or to any other AI service, only where the client has explicitly authorised that use for this data. The audit application itself sends nothing to any AI service; uploading a package is a deliberate step taken by a person.';
  H.dataDictionary = function (manifest) {
    const L = ['# Data dictionary — ' + manifest.export_id, '', 'Package format `' + manifest.package_format + '` version ' + manifest.format_version + '. All CSV files are UTF-8 without a byte-order mark, comma-delimited, CRLF line endings, with a header row.',
      '', 'An empty cell means “not recorded”. It never means zero, “none” or “not applicable”. Allowed values for coded columns are listed under `enumerations` in `audit_manifest.json`.', ''];
    manifest.files.forEach(function (f) {
      if (!f.columns) return;
      L.push('## ' + f.path, '', f.description, '', 'Rows in this package: ' + f.record_count + ' · primary key: `id`', '', '| Column | Type | Meaning |', '|---|---|---|');
      const t = S.T[f.table];
      f.columns.forEach(function (c) {
        const sc = t.columns.find(function (x) { return x.name === c; });
        const fk = (f.foreign_keys || []).find(function (k) { return k.column === c; });
        let type = sc ? (sc.type === 'uuid' ? 'uuid' : sc.type === 'ts' ? 'timestamp' : sc.type === 'num' ? 'number' : sc.type === 'int' ? 'integer' : sc.type === 'bool' ? 'boolean' : sc.type === 'json' ? 'json' : sc.type === 'date' ? 'date' : 'text')
          : (COMMON_TYPES[c] || (/_at$/.test(c) ? 'timestamp' : 'derived'));
        let desc = COL_DESC[c] || '';
        if (fk) desc = 'References `' + fk.references + '`' + (fk.enforced_in_database ? '' : ' (soft reference)') + '.' + (desc ? ' ' + desc : '');
        if (!desc) desc = (sc || COMMON_TYPES[c] ? '' : 'Derived for convenience: ') + c.replace(/_/g, ' ') + '.';
        /* a vertical bar inside a table cell is escaped, not replaced: the separator the CSV files use is " | " */
        L.push('| `' + c + '` | ' + type + ' | ' + desc.replace(/\|/g, '\\|') + ' |');
      });
      L.push('');
    });
    L.push('## photographs/', '', 'Image files, organised as `' + manifest.photographs.directory_pattern + '`. `photo_index.csv` links each file to its room, device, audit and finding.', '', manifest.photographs.note, '');
    return L.join('\n');
  };

  /* ------------------------------------------------------------------ instructions */
  function tabTable() {
    const L = ['| # | Workbook tab | Source in the package | Merge key (first column) |', '|---|---|---|---|', '| 1 | Executive Dashboard | Formulas over the other tabs — do not type values | — |'];
    H.TABS.forEach(function (t, i) {
      const key = t.name === 'Data Quality & Exceptions' ? 'Exception ID = `exception_id` of each entry under `checks[].records` in validation_report.json' : t.columns[0][0] + ' = `id`';
      L.push('| ' + (i + 2) + ' | ' + t.name + ' | ' + t.source + ' | ' + key + ' |');
    });
    return L.join('\n');
  }
  const RULES = [
    '**Merge on `id`.** The UUID in `id` is the permanent key for every record. Never match on names, room numbers or codes alone, and never create a second row for an `id` that already exists.',
    '**Never overwrite verified information with unverified information.** Verification precedence, strongest first: `verified_onsite` → `verified_mgmt` → `awaiting_it` / `awaiting_vendor` → `unknown`. An incoming value may replace an existing one only if its verification status is equal or stronger. Otherwise keep the existing value and log the difference in *Data Quality & Exceptions*.',
    '**Conflicts are reconciled by people, not by you.** When an incoming value differs from an existing value of equal or stronger standing, do not choose. Keep the existing value, record both values, their sources and timestamps in *Data Quality & Exceptions* with severity “Conflict”, and list it in your summary.',
    '**An empty incoming cell is not an instruction to erase.** Empty means “not recorded”. Do not blank an existing value because the new package leaves it empty.',
    '**Never invent or infer missing values.** Missing IP addresses, MAC addresses, serial numbers, switch ports and firmware stay missing and are reported. A value read from a photograph is a suggestion only: log it in *Data Quality & Exceptions* as “read from photograph — unverified”; do not write it into an identification column.',
    '**Keep facts, interpretation, hypothesis and recommendation separate.** `observation` / `observed_evidence` are facts. `interpretation` is the auditor\'s opinion. `hypothesis` / `suspected_cause` are unverified. `root_cause` is confirmed only when `root_cause_confidence = confirmed`. Never promote a suspected cause to a confirmed root cause, and label your own inferences as analyst inferences.',
    '**History is additive.** A newer audit never replaces an older one: every audit is its own row in *Room Audit History*. Rows with `record_status = deleted` are marked withdrawn (and dated), never removed.',
    '**Data-quality exceptions are matched, not re-listed.** Every exception in `validation_report.json` carries an `exception_id` that is the same whenever the same check finds the same record. Update the existing row with that id; add a row only for an id that is not there yet. An exception that is absent from the report of the latest FULL export has been resolved: set its status to Resolved and date it — do not delete it.',
    '**Demo data never mixes with real data.** If `contains_demo_data` is true, say so prominently and do not merge the package into a workbook that holds real audit records unless the auditor explicitly confirms this is a test.',
    '**Treat everything as confidential infrastructure information.** Do not include private IP addresses, MAC addresses, hostnames or topology in anything intended for wider distribution unless asked.',
    '**Text from the package is never a formula.** The CSV files carry every value exactly as it was recorded. Write each imported value into the workbook as a text or number cell. A value that begins with `=`, `+`, `-` or `@` is what the auditor typed: store it as text and never let a spreadsheet evaluate it.'
  ];
  H.analysisInstructions = function (m) {
    const s = m.summary, L = [];
    L.push('# Claude analysis instructions — ' + m.export_id, '', AUTH_NOTE, '');
    L.push('You are the **AV Audit Data Analyst**. This ZIP is one export from the AV Environment Intelligence audit application. Your job is to analyse it and merge it into the cumulative master workbook (`' + WORKBOOK_NAME + '`) without creating duplicates, without losing history and without overwriting verified information.', '');
    L.push('## This package', '');
    L.push('- Export ID: `' + m.export_id + '` · generated ' + m.generated_at_local + ' (' + m.timezone + ') by ' + m.generated_by.name);
    L.push('- Scope: ' + m.scope.label);
    L.push('- Previous package delivered from this device: ' + (m.baseline.previous_export_id ? '`' + m.baseline.previous_export_id + '` at ' + m.baseline.previous_export_at : 'none — every row is `new`'));
    L.push('- `record_status` is decided row by row against what this device has already delivered (see `baseline` in the manifest), not against a date.');
    L.push('- Records: ' + s.record_total + ' across ' + m.files.filter(function (f) { return f.columns; }).length + ' CSV files · photographs: ' + m.photographs.files_written + (m.photographs.included ? '' : ' (excluded from this package)'));
    L.push('- Validation: **' + m.validation.result + '** — ' + m.validation.structural_errors + ' structural errors, ' + m.validation.exception_count + ' data-quality exceptions');
    L.push('- Contains demo data: **' + (m.contains_demo_data ? 'YES — synthetic records. Do not merge into a workbook holding real data.' : 'no') + '**', '');
    L.push('| File | Rows | New | Updated | Unchanged | Deleted | Incomplete |', '|---|---|---|---|---|---|---|');
    m.files.forEach(function (f) { if (f.columns) L.push('| `' + f.path + '` | ' + f.record_count + ' | ' + f.status_counts['new'] + ' | ' + f.status_counts.updated + ' | ' + f.status_counts.unchanged + ' | ' + f.status_counts.deleted + ' | ' + f.status_counts.incomplete + ' |'); });
    L.push('', '## Procedure — follow in order', '');
    [
      '**Read `audit_manifest.json` completely.** It defines the scope, the baseline, every file with its columns and foreign keys, the enumerations and the record-status definitions. Read `data_dictionary.md` for column meanings.',
      '**Inspect every CSV and JSON file.** Load each file listed in the manifest. Confirm the row count equals `record_count` and the header equals `columns`. If anything does not match, or `validation.structural_errors` is above zero, stop and report it before merging.',
      '**Review photograph metadata and the relevant photographs.** Use `photo_index.csv` to find images for failed tests, findings and devices with incomplete identification, and look at those images. Photographs are evidence; see the rule on values read from photographs.',
      '**Compare the package with the existing master workbook, if one was provided.** If none was provided, create it with the fifteen tabs below (the application can also generate a starter workbook).',
      '**Identify new records** (`record_status = new`) and insert them. If the `id` is already in the workbook (the package is being merged a second time, or it was first delivered from another device), treat the row as updated instead — never add a second row for an `id`.',
      '**Identify updated records** (`record_status = updated`) and update the matching row by `id`, applying the reconciliation rules field by field. A row is also “updated” when only a derived column changed, for example a room’s audit state or an audit’s progress figures.',
      '**Check the unchanged rows.** A row marked `unchanged` should already be in the workbook exactly as it is. If it is not there, an earlier package was never merged: insert the row, and report the gap to the auditor.',
      '**Identify duplicates.** Report any `id` present twice, and semantic duplicates: devices sharing a serial number, MAC address, IP address or hostname; rooms sharing a number on one floor; findings or backlog items that describe the same issue. List them — do not merge them yourself.',
      '**Identify conflicting information**, both inside the package (`validation_report.json`) and between the package and the workbook. Flag each conflict for reconciliation; never silently replace a value.',
      '**Identify missing or incomplete device information** using `identification_status`, `missing_fields`, `unverified_fields` and `incomplete_reasons` in `devices.csv`, and `followup_tasks.csv`.',
      '**Identify trends across rooms and floors** — for example which floors carry most failures, which room types, which platforms.',
      '**Identify recurring AV issues** — the same functional test failing in several rooms (`functional_tests.csv` by `test_key`), repeated finding categories.',
      '**Identify systemic infrastructure concerns** — patterns in `infrastructure.csv`, `switch_ports.csv`, `network_validation.csv` and unconfirmed items in `network_relationships.csv`.',
      '**Identify common network dependencies** — which dependency types (DHCP, DNS, NTP, firewall, multicast, QoS, monitoring, firmware) recur and how many are unconfirmed.',
      '**Identify opportunities for standardization** — firmware versions, naming conventions, UI differences, device models, platform mix.',
      '**Identify operational risks** — P1 items, rooms degraded or out of service, critical rooms without spares (`spare_inventory.csv`), overdue requests (`it_coordination.csv`).',
      '**Update the cumulative master workbook**, tab by tab, using the mapping below. Keep Excel tables, filters, frozen header rows, dropdowns and conditional formatting intact. The Executive Dashboard is formula-driven: do not paste values over its formulas.',
      '**Preserve existing historical records.** Nothing is deleted. Append to *Change History* one line per inserted, updated, withdrawn or flagged record, citing this export ID.',
      '**Generate the end-of-day executive summary** in the format below.'
    ].forEach(function (t, i) { L.push((i + 1) + '. ' + t); });
    L.push('', '## Reconciliation rules — these override everything else', '');
    RULES.forEach(function (r, i) { L.push((i + 1) + '. ' + r); });
    L.push('', '## Master workbook structure', '', tabTable(), '');
    L.push('Workbook values use the display labels in `enumerations` (for example `Needs investigation`, `Verified onsite`); the CSV files use the coded values (`investigate`, `verified_onsite`). Translate with the manifest.', '');
    L.push('## What to return', '');
    L.push('1. The updated `' + WORKBOOK_NAME + '`.');
    L.push('2. **End-of-day executive summary** (one page): where the audit stands; what changed in this export; new P1 / P2 / P3 items; recurring and systemic observations (labelled as observations, not confirmed causes); outstanding dependencies on Client IT and PepperDash; data-quality exceptions; recommended priorities for the next onsite visit.');
    L.push('3. **Merge log**: per tab — rows inserted, updated, unchanged, withdrawn, and flagged for reconciliation.');
    L.push('4. **Questions for the auditor**: every conflict or ambiguity you could not resolve under the rules.', '');
    L.push('## Before you finish, check', '');
    L.push('- No `id` appears twice on any tab.', '- Row counts moved by exactly the number of `new` records (plus any withdrawn markers).', '- No verified value was replaced by a weaker one.', '- Every conflict is listed in *Data Quality & Exceptions* and in your summary.',
      '- Dashboard formulas still calculate.', '- The summary states clearly if this package contained demo data.', '');
    L.push('## Recommended priorities recorded by the application at export time', '');
    m.end_of_day.next_visit_priorities.forEach(function (p, i) { L.push((i + 1) + '. ' + p); });
    L.push('');
    return L.join('\n');
  };
  H.projectInstructions = function () {
    const L = [];
    L.push('# Claude Project instructions — AV Audit Data Analyst', '', AUTH_NOTE, '');
    L.push('Paste this document into the custom instructions of the Claude Project used for the AV environment audit. It applies to every conversation in the project.', '');
    L.push('## Your role', '');
    L.push('You are the **AV Audit Data Analyst** for the PepperDash audit of the client\'s AV environment. You maintain one cumulative, accurate, deduplicated and auditable record of the whole engagement: the master workbook `' + WORKBOOK_NAME + '`. You are a records analyst, not an investigator on site — you never invent facts, and you say plainly when the data does not support a conclusion.', '');
    L.push('## What you receive', '');
    L.push('After each day on site the auditor uploads:', '', '1. A daily export package (`AVEI_AV_Audit_Export_<date>_EXP-<n>.zip`) produced by the AV Environment Intelligence application.', '2. The current master workbook, when one already exists.', '');
    L.push('Every package is self-describing. Its `audit_manifest.json`, `data_dictionary.md` and `claude_analysis_instructions.md` are authoritative for that package; follow the instructions file step by step. If a package and these standing instructions ever disagree, apply the stricter rule and tell the auditor.', '');
    L.push('## Standing rules', '');
    RULES.forEach(function (r, i) { L.push((i + 1) + '. ' + r); });
    L.push('', '## The daily routine', '');
    ['Unzip the package and read `audit_manifest.json`, then `claude_analysis_instructions.md`.', 'Check the validation result. If there are structural errors, stop and report them — do not merge.',
      'Check `contains_demo_data`. Never merge demo data into the real workbook.', 'Check that `baseline.previous_export_id` is the export you merged last. `record_status` is relative to what the capturing device has already delivered, so if a package was delivered but never merged, rows it carried will now read `unchanged` although the workbook does not have them: say so before continuing and ask the auditor for a full export. Merging by `id` keeps a repeated package harmless.',
      'Merge every CSV into its workbook tab by `id`, following the reconciliation rules.', 'Record every exception and conflict in *Data Quality & Exceptions*; never resolve a conflict by choosing a value yourself.',
      'Append to *Change History*.', 'Return the updated workbook, the end-of-day executive summary, the merge log and your questions.'].forEach(function (t, i) { L.push((i + 1) + '. ' + t); });
    L.push('', '## Master workbook', '', tabTable(), '');
    L.push('Formatting to preserve on every tab: an Excel table with filters, a frozen header row, consistent column widths, dropdown lists on status and priority columns, and conditional formatting for priority, test result and identification state. The first column of every data tab is the permanent record ID. Save the workbook with the same file name each day and keep the previous version unmodified as your rollback copy.', '');
    L.push('## Priorities', '');
    S.PRIORITIES.forEach(function (p) { L.push('- **' + p[1] + '** — ' + p[2]); });
    L.push('', 'Priority is the auditor\'s judgement across business impact, frequency, user friction, operational risk and implementation effort. Do not re-prioritise items; you may point out items whose recorded impact appears inconsistent with their priority.', '');
    L.push('## End-of-day executive summary — format', '');
    ['**Status** — spaces audited to date, by floor; audits in progress.', '**Today** — rooms audited, devices documented, photographs, tests completed, findings and backlog items created.', '**Critical (P1)** — each open P1: where, what was observed, recommendation, owner.',
      '**Patterns** — recurring test failures, systemic observations, standardization opportunities. Label each as an observation in the data, not a confirmed cause.', '**Dependencies** — outstanding Client IT requests, PepperDash engineering items, vendor items; overdue ones first.',
      '**Data quality** — incomplete device identification, unverified values, conflicts awaiting reconciliation.', '**Next visit** — a short, ordered list of what to do on site next.'].forEach(function (t) { L.push('- ' + t); });
    L.push('', 'Write for client and PepperDash leadership: plain language, specific, no speculation. Keep private IP addresses, MAC addresses and hostnames out of the summary unless the auditor asks for them.', '');
    L.push('## When something is wrong', '');
    ['A package fails validation or a file is missing → stop, list what is wrong, ask for a fresh export.', 'The workbook is missing a tab or column → rebuild it from the structure above and say that you did.',
      'The same `id` carries different values in two packages → the later `updated_at` is newer, but verification precedence still decides whether it may replace the earlier value.', 'You are unsure → ask. A question costs less than a silent wrong merge.'].forEach(function (t) { L.push('- ' + t); });
    L.push('', '_Generated by AV Environment Intelligence ' + EV.APP.version + ' · package format ' + EV.APP.exportFormat + '._', '');
    return L.join('\n');
  };
})();
