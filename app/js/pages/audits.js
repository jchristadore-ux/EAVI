/* pages/audits.js — room audit list and the mobile room-audit workspace (the core field workflow). */
(function () {
  'use strict';
  const EV = window.EV, h = EV.h, U = EV.U, S = EV.S, store = EV.store, ui = EV.ui, icon = EV.icon, R = EV.rules, A = EV.act, P = EV.photos;
  const view = { noteOpen: {}, drafts: {}, tried: {}, cat: {} };
  /* For a combined-configuration audit, ask which member space a new record belongs to (never guess the first one).
     allowNone adds "the combined configuration itself", for a finding that is about the combined mode. */
  function whichSpace(p, title, allowNone) {
    if (!p.isConfig || p.rooms.length < 2) return Promise.resolve({ room: p.rooms[0] || null });
    const opts = p.rooms.map(function (r) { return { label: R.roomLabel(r), value: r.id, icon: 'grid' }; });
    if (allowNone) opts.push({ label: 'The combined configuration', hint: 'Not specific to one member space', value: '__none', icon: 'layers' });
    return ui.choose({ title: title, options: opts }).then(function (id) { return id == null ? null : { room: id === '__none' ? null : store.get('rooms', id) }; });
  }
  /* read-only rendering of form fields, for a locked (fully verified) audit */
  function readOnly(fields, rec) {
    return h('div.kv-list', null, fields.map(function (f) {
      const v = rec[f.k];
      const opt = f.opts && Array.isArray(f.opts[0]) ? S.label(f.opts, v) : v;
      return ui.kv(f.label, f.type === 'date' ? U.fmtDate(v) : (opt == null || opt === '' ? '' : String(opt)), { key: f.k });
    }));
  }

  function allFloors() {
    const out = [];
    U.sortBy(store.all('buildings').filter(function (b) { return !b.archived; }), function (b) { return b.name; }).forEach(function (b) { R.buildingFloors(b.id).forEach(function (f) { out.push(f); }); });
    return out;
  }
  function statusChip(a) { return R.auditLapsed(a) ? ui.chip('Verification lapsed', 'danger') : ui.chip(S.label(S.AUDIT_STATUS, a.status), a.status === 'verified' ? 'accent' : a.status === 'complete' ? 'ok' : 'warn'); }
  function openTarget(target) {
    const st = target.room ? R.roomState(target.room.id) : R.configState(target.config.id);
    if (st.state === 'not_started') { const a = A.startAudit(target); EV.go('/audit/' + a.id); return; }
    EV.go('/audit/' + st.audit.id);
  }

  /* ------------------------------------------------------------------ list */
  EV.pages.audits = function () {
    const floors = allFloors();
    const multi = store.all('buildings').filter(function (b) { return !b.archived; }).length > 1;
    const saved = store.kvGet('last_floor');
    const floor = floors.find(function (f) { return f.id === saved; }) || floors[0];
    const recent = U.sortBy(store.all('audits'), function (a) { return a.started_at || a.created_at; }, true).slice(0, 8);
    if (!floors.length) {
      return [ui.head({ title: 'Room Audits' }), ui.empty({ icon: 'clipboard', title: 'No floors to audit yet', text: 'Add a building, its floors and rooms first.',
        action: ui.btn('Buildings & Floors', { kind: 'primary', onclick: function () { EV.go('/environment'); } }) })];
    }
    const fp = R.floorProgress(floor.id);
    const rooms = R.floorRooms(floor.id);
    const configs = store.by('room_configurations', 'floor_id', floor.id).filter(function (c) { return !c.archived; });
    return [
      ui.head({ title: 'Room Audits', sub: 'Select a floor, tap a room, begin.' }),
      h('div.chip-scroll', { role: 'tablist', 'aria-label': 'Floor' }, floors.map(function (f) {
        const b = store.get('buildings', f.building_id);
        return h('button', { type: 'button', key: f.id, 'class': U.cx('pill', f.id === floor.id && 'on'), onclick: function () { store.kvSet('last_floor', f.id); } }, (multi && b ? b.name + ' · ' : '') + 'Floor ' + f.number);
      })),
      ui.card({ key: 'fp' }, h('div.card-head', null, h('div.card-title', null, 'Floor ' + floor.number + ' progress'), h('span.count', null, fp.pct + '%')), EV.floorBar(fp), h('div.floor-counts', null, EV.floorCounts(fp))),
      rooms.length ? h('div.list', null, rooms.map(function (r) {
        const rs = R.roomState(r.id);
        const p = rs.audit ? R.auditProgress(rs.audit.id) : null;
        let sub = r.room_type + (r.capacity ? ' · ' + r.capacity + ' seats' : '');
        if (rs.state === 'in_progress') sub = p.overall + '% · tests ' + p.tests.done + '/' + p.tests.total + ' · devices ' + p.devices.verified + '/' + p.devices.total + ' verified';
        else if (rs.audit) sub = 'Audited ' + U.fmtDate(rs.audit.audit_date) + ' · ' + p.tests.fail + ' failed · ' + p.findings + ' findings';
        return ui.row({ key: r.id, title: [R.roomLabel(r), ui.demo(r)], sub: sub, below: rs.state === 'in_progress' ? ui.progress(p.overall) : null,
          right: [ui.auditChip(rs.state), rs.state === 'not_started' ? h('span.go-start', { key: 's' }, 'Start') : null], onclick: function () { openTarget({ room: r }); } });
      })) : ui.empty({ icon: 'grid', title: 'No rooms on this floor', action: ui.btn('Add rooms', { onclick: function () { EV.go('/floor/' + floor.id); } }) }),
      configs.length ? h('section.stack', null, ui.label('Combined configurations'),
        h('div.list', null, configs.map(function (c) {
          const cs = R.configState(c.id);
          const members = R.auditRooms({ configuration_id: c.id });
          return ui.row({ key: c.id, left: icon('layers', 18), title: [c.name, ui.demo(c)], sub: members.map(function (m) { return m.number || m.name; }).join(' + ') || 'No member spaces',
            right: ui.auditChip(cs.state), onclick: members.length >= 2 ? function () { openTarget({ config: c }); } : null });
        }))) : null,
      recent.length ? h('section.stack', null, ui.label('Recent audits'),
        h('div.list', null, recent.map(function (a) {
          const p = R.auditProgress(a.id);
          return ui.row({ key: a.id, title: [R.auditTitle(a), h('span.mono.muted', { key: 'c' }, a.code)], sub: U.fmtDate(a.audit_date) + ' · ' + (a.auditor || 'Auditor') + ' · ' + p.overall + '%', right: statusChip(a),
            onclick: function () { EV.go('/audit/' + a.id); } });
        }))) : null
    ];
  };

  /* ------------------------------------------------------------------ workspace sections */
  const TEST_OPTS = [['pass', 'Pass', 'ok'], ['fail', 'Fail', 'danger'], ['investigate', 'Investigate', 'warn'], ['na', 'N/A', 'muted']];
  const CHECK_OPTS = [['verified', 'Verified', 'ok'], ['issue', 'Issue', 'danger'], ['awaiting_it', 'Awaiting IT', 'warn'], ['na', 'N/A', 'muted']];
  const SUMMARY_KEYS = ['room_type', 'capacity', 'conferencing_platform', 'control_platform', 'dsp_platform', 'display_config', 'camera_config', 'microphone_config', 'scheduling_platform'];

  function secSummary(audit, p, locked) {
    const tried = view.tried[audit.id];
    const auditFields = [
      { k: 'audit_date', label: 'Audit date', type: 'date', req: true, half: true },
      { k: 'auditor', label: 'Auditor', req: true, half: true },
      { k: 'operational_status', label: 'Current operational status', type: 'select', opts: S.OP_STATUS, req: true }
    ];
    const setAudit = function (k, v) { if (!locked) store.update('audits', audit.id, (function () { const o = {}; o[k] = v; return o; })()); };
    const roomFields = S.F.room.filter(function (x) { return SUMMARY_KEYS.indexOf(x.k) >= 0; }).map(function (x) { return Object.assign({}, x, { req: true, group: '' }); });
    const b = store.get('buildings', audit.building_id) || {}, f = store.get('floors', audit.floor_id) || {};
    if (p.isConfig) {
      const cfg = store.get('room_configurations', audit.configuration_id) || {};
      const cfgFields = [{ k: 'capacity', label: 'Combined capacity', type: 'number', req: true, half: true }, { k: 'description', label: 'How the spaces combine', type: 'textarea', req: true }];
      return [
        h('div.kv-list', { key: 'where' }, ui.kv('Building', b.name), ui.kv('Floor', f.number), ui.kv('Configuration', cfg.name), ui.kv('Member spaces', p.rooms.map(R.roomLabel).join(' + '))),
        locked ? readOnly(cfgFields, cfg) : ui.form(cfgFields, cfg,
          function (k, v) { store.update('room_configurations', cfg.id, (function () { const o = {}; o[k] = v; return o; })()); }, { showMissing: tried, idPrefix: 'cfg-' }),
        locked ? readOnly(auditFields, audit) : ui.form(auditFields, audit, setAudit, { showMissing: tried, idPrefix: 'au-' }),
        /* the platforms and configurations of a combined room are those of its member spaces: shown here, edited on each room */
        h('div.stack', { key: 'members' }, p.rooms.map(function (m) {
          const area = store.get('areas', m.area_id);
          return h('div.stack', { key: m.id, style: 'gap:6px' },
            h('div.subhead', null, R.roomLabel(m), h('span.muted', null, ' — member space'),
              ui.btn('Edit', { sm: true, kind: 'ghost', icon: 'edit', onclick: function () { EV.editors.room(m.id); } })),
            h('div.kv-list', null, ui.kv('Area', area ? area.name : 'Not assigned'), ui.kv('Room identifier', m.code, { mono: true }),
              roomFields.map(function (x) { return ui.kv(x.label, m[x.k] == null ? '' : String(m[x.k]), { key: x.k }); }), ui.kv('Operational status', m.operational_status)));
        }))
      ];
    }
    const room = p.rooms[0];
    if (!room) return ui.note('warn', 'The room for this audit no longer exists.');
    const area = store.get('areas', room.area_id);
    return [
      h('div.kv-list', { key: 'where' }, ui.kv('Building', b.name), ui.kv('Floor', f.number), ui.kv('Area', area ? area.name : 'Not assigned'), ui.kv('Room', R.roomLabel(room)), ui.kv('Room identifier', room.code, { mono: true })),
      locked ? null : h('div.btn-row', { key: 'edit' }, ui.btn('Edit room name, area or criticality', { sm: true, kind: 'ghost', icon: 'edit', onclick: function () { EV.editors.room(room.id); } })),
      /* a fully verified audit is locked: its summary is shown, not editable, until the audit is reopened */
      locked ? readOnly(roomFields, room) : ui.form(roomFields, room, function (k, v) { store.update('rooms', room.id, (function () { const o = {}; o[k] = v; return o; })()); }, { showMissing: tried, idPrefix: 'rm-' }),
      locked ? readOnly(auditFields, audit) : ui.form(auditFields, audit, setAudit, { showMissing: tried, idPrefix: 'au-' })
    ];
  }

  function secPhotos(audit, p) {
    const photos = P.forAudit(audit.id);
    const have = new Set(photos.map(function (x) { return x.category; }));
    const missing = S.PHOTO_CATEGORIES.filter(function (c) { return c !== 'Other' && !have.has(c); });
    const getCtx = function () { return { audit: audit, room: p.rooms[0], category: P.nextCategory[audit.id] || 'Room overview' }; };
    return [
      ui.label('Category for the next photo'),
      P.categoryPicker(audit.id, { dflt: 'Room overview' }),
      h('div.btn-row', null,
        P.captureButton({ key: 'aud-cam-' + audit.id, label: 'Take photo', lg: true, cls: 'grow', ctx: getCtx }),
        P.captureButton({ key: 'aud-lib-' + audit.id, label: 'Upload', library: true, kind: 'secondary', lg: true, ctx: getCtx })),
      P.gallery(photos, { group: true, emptyTitle: 'No photographs captured yet', emptyText: 'Tap “Take photo” — the camera opens directly and the picture is saved to this audit.' }),
      photos.length && missing.length ? h('p.muted', null, 'Not yet captured: ' + missing.join(', ') + '.') : null,
      h('p.muted', null, 'Tap a photograph to add a description, link it to a device, rotate or annotate it. Values are never read from photographs automatically.')
    ];
  }

  function secDevices(audit, p, locked) {
    const devs = U.sortBy(R.auditDevices(audit), function (d) { return d.category + ' ' + (d.hostname || ''); });
    const room = p.rooms[0];
    return [
      devs.length ? h('div.list', null, devs.map(function (d) { return EV.deviceRow(d, { showRoom: p.isConfig }); })) : ui.empty({ icon: 'cpu', title: 'No devices recorded yet', text: 'Add each network-connected AV device in this space.' }),
      h('div.btn-row.wrap', null,
        ui.btn('Add device', { kind: 'primary', icon: 'plus', cls: 'grow', onclick: function () { return newDevice(audit, p); } })),
      !devs.length ? ui.field('This space has no AV devices to inventory', ui.toggle(p.devices.na, { disabled: locked, onchange: function (on) { A.setSection(audit.id, 'devices', { state: on ? 'na' : 'auto' }); } }),
        { div: true, cls: 'field-toggle', hint: 'Confirm only after checking the room, the table and any rack.' }) : null,
      devs.length && p.devices.incomplete ? ui.note('warn', U.plural(p.devices.incomplete, 'device') + ' missing IP, MAC or serial. They stay in the inventory, are flagged incomplete, and follow-up tasks are tracked automatically.') : null
    ];
  }

  function suggestion(t, audit, locked) {
    const f = t.finding_id ? store.get('findings', t.finding_id) : null;
    if (f) {
      const b = f.backlog_item_id ? store.get('backlog_items', f.backlog_item_id) : null;
      return h('div.suggest.suggest-done', null, icon('flag', 15), h('div.suggest-body', null,
        h('div', null, 'Finding recorded: ', h('button.link', { type: 'button', onclick: function () { EV.editors.finding(f.id); } }, f.code)),
        b ? h('div', null, 'Backlog: ', h('button.link', { type: 'button', onclick: function () { EV.go('/backlog/' + b.id); } }, b.code + ' · ' + b.status))
          : h('div.btn-row', null, ui.btn('Add to backlog', { sm: true, onclick: function () { EV.promoteFlow(f.id); } }))));
    }
    if (t.suggestion_state === 'dismissed') {
      return h('div.suggest-dismissed', null, 'Suggested finding dismissed. ', h('button.link', { type: 'button', onclick: function () { store.update('functional_tests', t.id, { suggestion_state: 'pending' }); } }, 'Undo'));
    }
    const s = R.suggestFindingFromTest(t, audit);
    return h('div.suggest', null, icon('zap', 15), h('div.suggest-body', null,
      h('div.suggest-title', null, 'Suggested finding'),
      h('div', null, s.title + ' · ' + s.category),
      h('div.muted', null, 'Recorded only when you confirm. It is not added to the backlog until you promote it.'),
      h('div.btn-row.wrap', null,
        ui.btn('Record finding', { sm: true, kind: 'primary', disabled: locked, onclick: function () { const x = A.confirmTestFinding(t.id); if (x) EV.toast('Finding ' + x.code + ' recorded', 'ok'); } }),
        ui.btn('Dismiss', { sm: true, kind: 'ghost', disabled: locked, onclick: function () { A.dismissTestSuggestion(t.id); } }))));
  }
  function testRow(t, audit, locked) {
    const flagged = t.result === 'fail' || t.result === 'investigate';
    const showNote = flagged || !!t.comment || view.noteOpen[t.id];
    const photos = flagged || showNote ? P.forTest(t.id) : [];
    return h('div', { 'class': U.cx('test', flagged && 'test-flag'), key: t.id },
      h('div.test-head', null,
        h('span.test-name', null, t.test_name, t.is_custom ? ui.chip('Custom', 'muted') : null),
        !showNote ? ui.iconBtn('edit', { size: 16, title: 'Add a comment to ' + t.test_name, onclick: function () { view.noteOpen[t.id] = true; } }) : null),
      ui.seg(t.result, TEST_OPTS, { disabled: locked, cls: 'seg-test', onchange: function (v, wasOn) { A.setTest(t.id, wasOn ? 'not_tested' : v); } }),
      showNote ? h('div.test-extra', null,
        ui.textarea(t.comment, { rows: 2, disabled: locked, ph: flagged ? 'What did you observe? Facts only — causes belong in the finding.' : 'Comment',
          /* once opened, the box stays for this session even when its text is cleared (it must not vanish mid-edit) */
          oninput: function (v) { view.noteOpen[t.id] = true; store.update('functional_tests', t.id, { comment: v }); } }),
        h('div.btn-row.wrap', null,
          P.captureButton({ key: 'test-cam-' + t.id, sm: true, kind: 'secondary', label: 'Photo',
            ctx: function () { return { audit: audit, test_id: t.id, finding_id: t.finding_id || null, category: 'Other', description: t.test_name }; } }),
          P.strip(photos)),
        flagged ? suggestion(t, audit, locked) : null) : null);
  }
  function secTesting(audit, p, locked) {
    const tests = U.sortBy(store.by('functional_tests', 'audit_id', audit.id), function (t) { return t.sort_order || 0; });
    const byCat = U.groupBy(tests, function (t) { return t.category; });
    const cats = S.TEST_CATEGORIES.filter(function (c) { return byCat.has(c); });
    /* The category that opens by default (the first with an untested item) is chosen once per audit. After that only a
       tap on a header changes it, so the category being worked on never closes itself when its last test is answered. */
    if (view.cat[audit.id] === undefined) view.cat[audit.id] = cats.find(function (c) { return byCat.get(c).some(function (t) { return !t.result || t.result === 'not_tested'; }); }) || null;
    const openCat = view.cat[audit.id];
    return cats.map(function (c) {
      const list = byCat.get(c);
      const done = list.filter(function (t) { return t.result && t.result !== 'not_tested'; }).length;
      const fail = list.filter(function (t) { return t.result === 'fail'; }).length;
      const inv = list.filter(function (t) { return t.result === 'investigate'; }).length;
      const isOpen = openCat === c;
      return h('div', { 'class': U.cx('cat', isOpen && 'open'), key: c },
        h('button.cat-head', { type: 'button', 'aria-expanded': isOpen ? 'true' : 'false', onclick: function () { view.cat[audit.id] = isOpen ? null : c; } },
          h('span.cat-name', null, c),
          h('span', { 'class': U.cx('cat-count', done === list.length && 'cat-done') }, done + '/' + list.length),
          icon(isOpen ? 'chev-up' : 'chev-down', 16, 'sect-chev'),
          fail || inv ? h('span.cat-flags', null, fail ? ui.chip(fail + ' fail', 'danger') : null, inv ? ui.chip(inv + ' to investigate', 'warn') : null) : null),
        isOpen ? h('div.cat-body', null,
          done < list.length && !locked ? h('div.btn-row.wrap', null,
            ui.btn('Pass all untested', { sm: true, icon: 'check', onclick: function () { const n = A.setTestsBulk(audit.id, c, 'pass'); EV.toast(n + ' tests marked Pass — change any that did not pass', 'ok', 3600); } }),
            ui.btn('N/A all untested', { sm: true, kind: 'ghost', onclick: function () { const n = A.setTestsBulk(audit.id, c, 'na'); EV.toast(n + ' tests marked Not applicable'); } })) : null,
          list.map(function (t) { return testRow(t, audit, locked); }),
          !locked ? h('div.btn-row', null, ui.btn('Add a test to ' + c.toLowerCase(), { sm: true, kind: 'ghost', icon: 'plus', onclick: function () {
            ui.prompt({ title: 'Add a functional test', label: 'Test name', ph: 'e.g. Hearing-assist system', confirm: 'Add test' }).then(function (name) { if (name) A.addCustomTest(audit, c, name); });
          } })) : null) : null);
    });
  }

  function checkEvidence(key, devs) {
    const net = devs.filter(R.isNetworked);
    if (!net.length) return '';
    const n = function (fn) { return net.filter(fn).length + ' of ' + net.length + ' networked devices'; };
    switch (key) {
      case 'addressing': return 'Recorded: ' + n(function (d) { return R.device(d).states.ip_address === 'verified'; }) + ' have a verified IP address';
      case 'mac': return 'Recorded: ' + n(function (d) { return R.device(d).states.mac_address === 'verified'; }) + ' have a verified MAC address';
      case 'vlan': return 'Recorded: ' + n(function (d) { return !U.blank(d.vlan); }) + ' have a VLAN documented';
      case 'switch_port': return 'Recorded: ' + n(function (d) { return !U.blank(d.switch_port); }) + ' have a switch port documented';
      case 'dhcp_static': return 'Recorded: ' + n(function (d) { return !U.blank(d.ip_assignment) && d.ip_assignment !== 'Unknown'; }) + ' have an assignment type documented';
      case 'firmware': return 'Recorded: ' + n(function (d) { return !U.blank(d.firmware_version); }) + ' have firmware documented';
      case 'monitoring': return 'Recorded: ' + n(function (d) { return !U.blank(d.monitoring_portal); }) + ' list a monitoring portal';
      default: return '';
    }
  }
  function secNetwork(audit, p, locked) {
    const checks = U.sortBy(store.by('network_checks', 'audit_id', audit.id), function (c) { return c.sort_order || 0; });
    const devs = R.auditDevices(audit);
    const open = checks.filter(function (c) { return !c.status || c.status === 'not_checked'; }).length;
    return [
      ui.note('info', 'Documentation only: record what you observed or what Client IT confirmed. This tool never scans the network or changes device configuration.'),
      open && !locked ? h('div.btn-row', null, ui.btn('N/A all unchecked', { sm: true, kind: 'ghost', onclick: function () {
        checks.forEach(function (c) { if (!c.status || c.status === 'not_checked') A.setCheck(c.id, 'na'); });
      } })) : null,
      checks.map(function (c) {
        const ev = checkEvidence(c.check_key, devs);
        const flagged = c.status === 'issue' || c.status === 'awaiting_it';
        return h('div', { 'class': U.cx('test', flagged && 'test-flag'), key: c.id },
          h('div.test-head', null, h('span.test-name', null, c.check_name)),
          ev ? h('div.test-evidence', null, ev) : null,
          ui.seg(c.status, CHECK_OPTS, { disabled: locked, cls: 'seg-check', onchange: function (v, wasOn) { A.setCheck(c.id, wasOn ? 'not_checked' : v); } }),
          flagged || c.comment || view.noteOpen[c.id] ? ui.textarea(c.comment, { rows: 2, disabled: locked, ph: c.status === 'awaiting_it' ? 'What is needed from Client IT?' : 'What did you find?',
            oninput: function (v) { view.noteOpen[c.id] = true; store.update('network_checks', c.id, { comment: v }); } }) : null,
          c.status === 'awaiting_it' ? (function () {
            /* one request per check: once drafted, the button opens that request instead of drafting another */
            const key = 'check:' + c.id;
            const ex = store.all('it_requests').find(function (x) { return x.source_key === key && S.IT_CLOSED.indexOf(x.status) < 0; });
            return h('div.btn-row', null, ex
              ? ui.btn(ex.code + ' · ' + ex.status, { sm: true, kind: 'ghost', icon: 'link', onclick: function () { EV.editors.request(ex.id); } })
              : ui.btn('Draft IT request', { sm: true, icon: 'message', onclick: function () {
                const room = p.isConfig ? null : (p.rooms[0] || null);
                EV.editors.newRequest({ room: room, audit: audit }, { topic: c.check_name.replace(/ (verified|confirmed|approved)$/i, '') + ' — ' + R.auditTitle(audit), requested_from: 'Client IT',
                  building_id: audit.building_id, floor_id: audit.floor_id, source_key: key,
                  description: (c.comment || c.check_name) + '\nAudit: ' + audit.code, needed_for: 'Network validation — ' + R.auditTitle(audit), reason: 'Network validation check is awaiting IT confirmation.' });
              } }));
          })() : null);
      })
    ];
  }

  function secFindings(audit, p) {
    const list = U.sortBy(store.by('findings', 'audit_id', audit.id).filter(function (f) { return f.status !== 'dismissed'; }), function (f) { return f.created_at; }, true);
    return [
      p.tests.pendingSuggestion ? ui.note('warn', U.plural(p.tests.pendingSuggestion, 'failed or investigated test') + ' ' + (p.tests.pendingSuggestion === 1 ? 'has' : 'have') + ' a suggested finding awaiting your decision in Functional Testing.') : null,
      list.length ? h('div.list', null, list.map(function (f) { return EV.findingRow(f); })) : ui.empty({ icon: 'flag', title: 'No findings recorded for this audit' }),
      h('div.btn-row', null, ui.btn('Record finding', { kind: 'primary', icon: 'plus', cls: 'grow', onclick: function () { return newFinding(audit, p); } }))
    ];
  }
  function newFinding(audit, p) {
    return whichSpace(p, 'Which space is the finding about?', true).then(function (sel) {
      if (sel) EV.editors.newFinding({ audit: audit, room: sel.room }, sel.room ? null : { building_id: audit.building_id, floor_id: audit.floor_id });
    });
  }
  function newDevice(audit, p) {
    return whichSpace(p, 'Which space holds the device?').then(function (sel) { if (sel && sel.room) EV.editors.newDevice({ room: sel.room, audit: audit }); });
  }

  function secNotes(audit, p, locked) {
    const notes = U.sortBy(store.by('audit_notes', 'audit_id', audit.id), function (n) { return n.created_at; }, true);
    const d = view.drafts[audit.id] || (view.drafts[audit.id] = { type: 'observed_fact', text: '' });   /* an unsaved note belongs to this audit only */
    const tone = { observed_fact: 'accent', auditor_interpretation: 'violet', unverified_hypothesis: 'warn', recommended_action: 'ok' };
    return [
      h('p.muted', null, 'Label each note so observed facts are never mixed with interpretation or unverified hypotheses.'),
      ui.seg(d.type, S.NOTE_TYPES.map(function (n) { return [n[0], n[1]]; }), { wrap: true, onchange: function (v) { d.type = v; } }),
      ui.textarea(d.text, { rows: 3, id: 'note-draft', ph: d.type === 'observed_fact' ? 'What you saw, heard or measured' : d.type === 'unverified_hypothesis' ? 'Suspected cause — not confirmed' : d.type === 'recommended_action' ? 'What should be done' : 'Your reading of the situation',
        oninput: function (v) { d.text = v; } }),
      h('div.btn-row', null, ui.btn('Add note', { kind: 'primary', icon: 'plus', disabled: !d.text.trim(), onclick: function () {
        store.create('audit_notes', { audit_id: audit.id, room_id: audit.room_id, section_key: 'notes', note_type: d.type, text: d.text.trim(), is_demo: false });
        d.text = '';
        const el = document.getElementById('note-draft'); if (el) el.value = '';
      } })),
      notes.length ? h('div.list', null, notes.map(function (n) {
        return h('div.row.note-item', { key: n.id },
          h('span.row-main', null, h('span.row-title', null, ui.chip(S.label(S.NOTE_TYPES, n.note_type), tone[n.note_type])), h('span.note-text', null, n.text), h('span.row-sub', null, U.fmtDateTime(n.created_at) + ' · ' + (n.created_by || ''))),
          !locked ? ui.iconBtn('trash', { size: 16, title: 'Delete note', onclick: function () { store.remove('audit_notes', n.id); } }) : null);
      })) : null,
      ui.field('General audit notes', ui.textarea(audit.general_notes, { rows: 3, disabled: locked, ph: 'Access constraints, people met, anything to remember for the next visit', oninput: function (v) { store.update('audits', audit.id, { general_notes: v }); } }))
    ];
  }

  function completion(audit, p) {
    if (audit.status === 'verified') {
      return ui.card({ key: 'done', cls: 'completion' },
        p.blockers.length
          ? ui.note('danger', h('div', null, 'Marked fully verified on ' + U.fmtDateTime(audit.verified_at) + ', but mandatory information is no longer complete:',
            h('ul.plain.bullets', null, p.blockers.map(function (b, i) { return h('li', { key: 'b' + i }, b); })),
            'Until this is resolved the audit is reported and exported as “verification lapsed”, not as fully verified.'), { title: 'Verification has lapsed' })
          : ui.note('ok', 'Fully verified on ' + U.fmtDateTime(audit.verified_at) + '. Tests and checks are locked; reopen the audit to change them.', { title: 'Audit fully verified' }),
        h('div.btn-row.wrap', null, ui.btn('Reopen audit', { icon: 'undo', onclick: function () { A.reopenAudit(audit); EV.toast('Audit reopened'); } }),
          ui.btn('Room audit report', { kind: 'ghost', icon: 'file', onclick: function () { EV.go('/reports/room?audit=' + audit.id); } })));
    }
    return ui.card({ key: 'done', cls: 'completion', title: 'Finish this audit' },
      audit.status === 'complete' ? ui.note('ok', 'Marked complete ' + U.fmtDateTime(audit.completed_at) + '. You can keep editing; changes are tracked.') : null,
      p.blockers.length ? h('div.blockers', null,
        h('div.label', null, p.canVerify ? '' : 'Outstanding before it can be fully verified'),
        h('ul.plain', null, p.blockers.map(function (b, i) { return h('li', { key: 'b' + i }, icon('alert-circle', 14), h('span', null, b)); }))) : ui.note('ok', 'All mandatory information is complete.'),
      h('div.btn-row.wrap', null,
        audit.status === 'in_progress' ? ui.btn('Mark audit complete', { kind: 'primary', lg: true, icon: 'check', cls: 'grow', onclick: function () {
          A.completeAudit(audit); EV.toast(p.blockers.length ? 'Audit marked complete with open follow-ups' : 'Audit marked complete', 'ok');
        } }) : ui.btn('Reopen', { icon: 'undo', onclick: function () { A.reopenAudit(audit); } }),
        ui.btn('Mark fully verified', { lg: true, icon: 'shield', disabled: !p.canVerify, cls: 'grow', title: p.canVerify ? '' : 'Mandatory information is incomplete', onclick: function () {
          try { A.verifyAudit(audit); EV.toast('Audit fully verified', 'ok'); } catch (e) { view.tried[audit.id] = true; EV.toast(e.message, 'warn', 5000); }
        } })),
      !p.canVerify ? h('button.link', { type: 'button', onclick: function () {
        /* open the first section that still has something outstanding, and bring it into view */
        view.tried[audit.id] = true;
        const key = !p.summary.complete ? 'summary' : !p.devices.complete ? 'devices' : (!p.tests.complete || p.tests.pendingSuggestion) ? 'testing' : !p.photos ? 'photos' : !p.network.complete ? 'network' : 'summary';
        ['summary', 'devices', 'testing', 'photos', 'findings', 'network', 'notes'].forEach(function (k) { ui.open['aud:' + audit.id + ':' + k] = k === key; });
        if (key === 'testing') {
          const t = U.sortBy(store.by('functional_tests', 'audit_id', audit.id), function (x) { return x.sort_order || 0; })
            .find(function (x) { return !x.result || x.result === 'not_tested' || ((x.result === 'fail' || x.result === 'investigate') && !R.testFinding(x) && x.suggestion_state !== 'dismissed'); });
          if (t) view.cat[audit.id] = t.category;
        }
        EV.afterRender(function () { const el = document.getElementById('sec-' + key); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start' }); });
      } }, 'Show what is still outstanding') : null);
  }

  /* ------------------------------------------------------------------ workspace page */
  EV.pages.audit = function (r) {
    const audit = store.get('audits', r.id);
    if (!audit) return [ui.head({ title: 'Audit not found', back: '/audits' }), ui.empty({ icon: 'clipboard', title: 'This audit no longer exists.', action: ui.btn('Room Audits', { onclick: function () { EV.go('/audits', { replace: true }); } }) })];
    const p = R.auditProgress(audit.id);
    const locked = audit.status === 'verified';
    const b = store.get('buildings', audit.building_id) || {}, f = store.get('floors', audit.floor_id) || {};
    const prefix = 'aud:' + audit.id + ':';
    const room = p.rooms[0];
    function sec(key, name, ic, status, tone, body) {
      return ui.section({ key: prefix + key, id: 'sec-' + key, title: name, icon: ic, status: { text: status, tone: tone }, exclusive: prefix,
        onToggle: function (open) { if (open) EV.afterRender(function () { const el = document.getElementById('sec-' + key); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start' }); }); } },
        ui.open[prefix + key] ? body() : null);
    }
    const tone3 = function (complete, started) { return complete ? 'ok' : started ? 'warn' : 'muted'; };
    return [
      ui.head({ back: '/audits', eyebrow: [b.name, f.number ? 'Floor ' + f.number : ''].filter(Boolean).join(' · '), title: [R.auditTitle(audit), ui.demo(audit)],
        sub: h('span', null, h('span.mono', null, audit.code), ' · ', U.fmtDate(audit.audit_date), ' · ', audit.auditor || 'Auditor'),
        actions: [statusChip(audit), ui.iconBtn('more', { key: 'm', title: 'Audit actions', onclick: function () {
          ui.choose({ title: 'Audit ' + audit.code, options: [
            room && !p.isConfig ? { label: 'Open room page', value: 'room', icon: 'grid' } : null,
            { label: 'Room audit report', value: 'report', icon: 'file', hint: 'Preview, PDF, CSV or Excel' },
            audit.status !== 'in_progress' ? { label: 'Reopen audit', value: 'reopen', icon: 'undo' } : null,
            { label: 'Start another audit of this space', value: 'new', icon: 'plus', hint: 'Keeps this audit in the history' },
            { label: 'Delete this audit', value: 'delete', icon: 'trash', tone: 'danger', hint: 'Photographs, devices and findings are kept' }
          ].filter(Boolean) }).then(function (v) {
            if (v === 'room') EV.go('/room/' + room.id);
            else if (v === 'report') EV.go('/reports/room?audit=' + audit.id);
            else if (v === 'reopen') A.reopenAudit(audit);
            else if (v === 'new') { const a = A.startAudit(p.isConfig ? { config: store.get('room_configurations', audit.configuration_id) } : { room: room }); EV.go('/audit/' + a.id); }
            else if (v === 'delete') ui.confirm({ title: 'Delete audit ' + audit.code + '?', message: 'Its test results, network checks and notes are removed. Photographs, devices and findings stay with the room.', confirm: 'Delete audit', danger: true })
              .then(function (ok) { if (ok) { A.deleteAudit(audit); EV.go('/audits', { replace: true }); EV.toast('Audit deleted'); } });
          });
        } })] }),
      h('div.audit-progress', null, h('div.audit-pct', null, h('span.audit-pct-n', null, p.overall + '%'), h('span.muted', null, 'audit progress')), ui.progress(p.overall, p.overall === 100 ? 'ok' : null)),
      locked ? (p.blockers.length ? ui.note('danger', 'This audit was marked fully verified, but ' + p.blockers[0].charAt(0).toLowerCase() + p.blockers[0].slice(1) + (p.blockers.length > 1 ? ' (and ' + (p.blockers.length - 1) + ' more)' : '') +
        '. It is reported as “verification lapsed” until that is resolved.', { title: 'Verification has lapsed' }) : ui.note('ok', 'This audit is fully verified and locked. Reopen it to make changes.')) : null,
      h('div.sect-stack', null,
      sec('summary', 'Space Summary', 'grid', p.summary.complete ? 'Complete' : p.summary.done + '/' + p.summary.total + ' fields', tone3(p.summary.complete, p.summary.done > 3), function () { return secSummary(audit, p, locked); }),
      sec('devices', 'Device Inventory', 'cpu', p.devices.total ? p.devices.verified + '/' + p.devices.total + ' verified' : p.devices.na ? 'None in this space' : 'None recorded', tone3(p.devices.complete, p.devices.total > 0), function () { return secDevices(audit, p, locked); }),
      sec('testing', 'Functional Testing', 'check-circle', p.tests.done + '/' + p.tests.total + ' complete' + (p.tests.fail ? ' · ' + p.tests.fail + ' fail' : ''), p.tests.fail ? 'danger' : tone3(p.tests.complete, p.tests.done > 0), function () { return secTesting(audit, p, locked); }),
      sec('photos', 'Photos', 'camera', p.photos + ' captured', p.photos ? 'ok' : 'muted', function () { return secPhotos(audit, p); }),
      sec('findings', 'Findings', 'flag', p.findings + ' identified' + (p.tests.pendingSuggestion ? ' · ' + p.tests.pendingSuggestion + ' suggested' : ''), p.tests.pendingSuggestion ? 'warn' : p.findings ? 'accent' : 'muted', function () { return secFindings(audit, p); }),
      sec('network', 'Network Validation', 'network', p.network.pct + '%' + (p.network.issue ? ' · ' + p.network.issue + ' issue' + (p.network.issue > 1 ? 's' : '') : ''), p.network.issue ? 'danger' : tone3(p.network.complete, p.network.done > 0), function () { return secNetwork(audit, p, locked); }),
      sec('notes', 'Audit Notes', 'edit', p.notes ? U.plural(p.notes, 'note') : 'None', p.notes ? 'accent' : 'muted', function () { return secNotes(audit, p, locked); })),
      completion(audit, p),
      h('div.audit-bar', { role: 'toolbar', 'aria-label': 'Quick capture' },
        P.captureButton({ key: 'bar-cam-' + audit.id, label: 'Photo', kind: 'primary', cls: 'grow', ctx: function () { return { audit: audit, room: room, category: P.nextCategory[audit.id] || 'Room overview' }; } }),
        ui.btn('Device', { icon: 'cpu', cls: 'grow', onclick: function () { return newDevice(audit, p); } }),
        ui.btn('Finding', { icon: 'flag', cls: 'grow', onclick: function () { return newFinding(audit, p); } }))
    ];
  };
})();
