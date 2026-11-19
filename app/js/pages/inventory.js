/* pages/inventory.js — Inventory Dashboard: the landing screen. Every figure is counted from the asset records. */
(function () {
  'use strict';
  const EV = window.EV, h = EV.h, U = EV.U, S = EV.S, store = EV.store, ui = EV.ui, icon = EV.icon, R = EV.rules, I = EV.inv;
  const st = { tab: 'building' };

  function shortcut(ic, label, hint, fn, o) {
    o = o || {};
    return h('button', { type: 'button', key: label, 'class': U.cx('shortcut', o.primary && 'shortcut-primary'), onclick: fn, id: o.id },
      h('span.shortcut-ic', null, icon(ic, 22)), h('span.shortcut-label', null, label), hint ? h('span.shortcut-hint', null, hint) : null);
  }
  EV.inventoryBar = function (t) {
    return ui.stackbar([{ n: t.complete, tone: 'ok', label: 'complete' }, { n: t.in_progress, tone: 'warn', label: 'in progress' }, { n: t.not_started, tone: 'muted', label: 'not started' }]);
  };
  EV.inventoryCounts = function (t) { return t.complete + ' of ' + U.plural(t.total, 'room') + ' complete · ' + t.in_progress + ' in progress · ' + U.plural(t.devices, 'device'); };
  function idBar(label, c, key) {
    return h('button', { type: 'button', key: key, 'class': 'idbar idbar-click', onclick: function () { EV.go('/assets?filter=' + key); } },
      h('div.idbar-top', null, h('span.idbar-label', null, label),
        h('span.muted', null, c.verified + ' verified · ' + c.captured + ' captured · ' + c.unavailable + ' not accessible · ' + c.na + ' n/a · ' + c.not_captured + ' not captured')),
      ui.stackbar([{ n: c.verified, tone: 'ok', label: 'verified' }, { n: c.captured, tone: 'warn', label: 'captured, not verified' }, { n: c.unavailable, tone: 'violet', label: 'not accessible' },
        { n: c.na, tone: 'muted', label: 'not applicable' }, { n: c.not_captured, tone: 'danger', label: 'not captured' }]));
  }
  function qualityRow(key, label, n, sub, path, tone) {
    return ui.row({ key: key, left: h('span', { 'class': 'alert-ic alert-' + (n ? tone : 'ok') }, icon(n ? 'alert-circle' : 'check', 16)), title: label, sub: sub,
      right: h('span', { 'class': 'alert-count alert-' + (n ? tone : 'ok') }, String(n)), onclick: function () { EV.go(path); } });
  }

  EV.pages.inventory = function () {
    const m = I.metrics();
    const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    const prof = EV.auth.profile();
    const head = ui.head({ eyebrow: today + (prof.name ? ' · ' + prof.name : ''), title: 'Inventory Dashboard', sub: 'Identify, document, verify and export every AV device in the environment' });
    const shortcuts = h('div.shortcuts', null,
      shortcut('grid', 'Start Room Inventory', 'Building → floor → room', function () { EV.inventoryStart(); }, { primary: true, id: 'sc-start' }),
      shortcut('camera', 'Photograph Device', 'Camera first, then identify', function () { EV.identify.startAnywhere(); }, { id: 'sc-photo' }),
      shortcut('zap', 'Review Unidentified', m.awaiting ? m.awaiting + ' waiting' : 'Nothing waiting', function () { EV.go('/identify'); }, { id: 'sc-review' }),
      shortcut('database', 'View All Assets', U.plural(m.captured, 'asset') + (m.listed ? ' · ' + m.listed + ' listed' : ''), function () { EV.go('/assets'); }, { id: 'sc-assets' }),
      shortcut('share', 'Export Inventory', m.ready ? m.ready + ' ready' : 'CSV · Excel · JSON', function () { EV.go('/integration'); }, { id: 'sc-export' }));
    if (!m.buildings) {
      return [head, shortcuts,
        ui.empty({ icon: 'building', title: 'No rooms to inventory yet', text: 'Load the room list (CSV) to create buildings, floors and rooms in one step, or add a building by hand.',
          action: h('div.btn-row.wrap', null,
            ui.btn('Import room list', { kind: 'primary', icon: 'upload', id: 'dash-import', onclick: function () { EV.roomImport.open(); } }),
            ui.btn('Add a building', { icon: 'plus', onclick: function () { EV.editors.newBuilding(); } })) })];
    }
    const pr = I.progress();
    const rows = st.tab === 'building' ? pr.byBuilding : st.tab === 'floor' ? pr.byFloor : st.tab === 'department' ? pr.byDepartment : null;
    const recent = U.sortBy(I.assets(), function (d) { return d.created_at; }, true).slice(0, 6);
    return [
      head, shortcuts,
      h('section.stack', null,
        ui.label('Enterprise inventory'),
        h('div.tiles.tiles-5', null,
          ui.stat({ key: 'b', label: 'Buildings', value: m.buildings, sub: U.plural(m.floors, 'floor'), onclick: function () { EV.go('/rooms'); } }),
          ui.stat({ key: 'r', label: 'Rooms identified', value: m.rooms, sub: m.roomsInProgress + ' in progress', onclick: function () { EV.go('/rooms'); } }),
          ui.stat({ key: 'ri', label: 'Rooms inventoried', value: m.roomsComplete, unit: '/ ' + m.rooms, tone: m.rooms && m.roomsComplete === m.rooms ? 'ok' : null, onclick: function () { EV.go('/rooms'); } }),
          ui.stat({ key: 'u', label: 'Unique devices', value: m.unique, sub: m.duplicates ? m.duplicates + ' duplicate groups to resolve' : 'No shared identifiers', onclick: function () { EV.go('/assets'); } }),
          ui.stat({ key: 'c', label: 'Devices captured', value: m.captured, sub: (m.listed ? m.listed + ' listed, not yet seen' : 'Nothing listed waiting') + (m.pending ? ' · ' + m.pending + ' captures to confirm' : ''), onclick: function () { EV.go(m.listed ? '/assets?filter=listed' : '/assets'); } }),
          ui.stat({ key: 'a', label: 'Awaiting identification', value: m.awaiting, tone: m.awaiting ? 'warn' : 'ok', sub: m.pending + ' captures · ' + m.needsId + ' assets', onclick: function () { EV.go('/identify'); } }),
          ui.stat({ key: 'i', label: 'Incomplete information', value: m.incomplete, tone: m.incomplete ? 'warn' : null, sub: 'Something not yet captured', onclick: function () { EV.go('/assets?filter=incomplete'); } }),
          ui.stat({ key: 'v', label: 'Manually verified', value: m.verified, unit: '/ ' + m.captured, tone: m.captured && m.verified === m.captured ? 'ok' : null, onclick: function () { EV.go('/assets?filter=verified'); } }),
          ui.stat({ key: 'e', label: 'Ready for export', value: m.ready, sub: 'Verified, not yet exported as they are', onclick: function () { EV.go('/integration'); } }),
          ui.stat({ key: 'x', label: 'Already exported', value: m.exported, sub: m.changed ? m.changed + ' changed since export' : 'None changed since', onclick: function () { EV.go('/assets?filter=exported'); } }))),
      h('div.split', null,
        h('div.stack.stack-lg', null,
          h('section.stack', null,
            ui.label('Inventory progress'),
            ui.tabs([{ k: 'building', label: 'Building' }, { k: 'floor', label: 'Floor' }, { k: 'department', label: 'Department' }, { k: 'category', label: 'Device category' }], st.tab, function (k) { st.tab = k; }),
            rows ? (rows.length ? h('div.list', null, rows.map(function (x) {
              return ui.row({ key: x.id || 'none', title: x.label, sub: EV.inventoryCounts(x.t), below: EV.inventoryBar(x.t), right: h('span.count', null, x.t.pct + '%'),
                onclick: st.tab === 'floor' ? function () { EV.go('/rooms/floor/' + x.id); } : st.tab === 'building' ? function () { EV.go('/rooms'); } : function () { EV.go('/assets?department=' + encodeURIComponent(x.id)); } });
            })) : ui.empty({ icon: 'grid', title: 'Nothing recorded yet' }))
              : (pr.byCategory.length ? h('div.list', null, pr.byCategory.map(function (x) {
                return ui.row({ key: x.id, title: x.label, sub: x.verified + ' verified · ' + x.review + ' need review', below: ui.stackbar([{ n: x.verified, tone: 'ok', label: 'verified' }, { n: x.review, tone: 'danger', label: 'need review' }, { n: x.total - x.verified - x.review, tone: 'warn', label: 'partially verified' }]),
                  right: h('span.count', null, String(x.total)), onclick: function () { EV.go('/assets?category=' + encodeURIComponent(x.id)); } });
              })) : ui.empty({ icon: 'cpu', title: 'No devices captured yet', text: 'Open a room and photograph its first device.' }))),
          h('section.stack', null,
            ui.label('Recently captured', h('button.link', { type: 'button', onclick: function () { EV.go('/assets'); } }, 'All assets')),
            recent.length ? h('div.list', null, recent.map(function (d) { return EV.assetRow(d, { showRoom: true }); })) : h('p.muted', null, 'No devices captured yet.'))),
        h('div.stack.stack-lg', null,
          h('section.stack', null,
            ui.label('Inventory quality'),
            h('div.list', null,
              qualityRow('ser', 'Serial number not captured', m.missing.serial_number, 'Not counted: marked not accessible or not applicable', '/assets?filter=missing_serial', 'warn'),
              qualityRow('mac', 'MAC address not captured', m.missing.mac_address, 'Not counted: marked not accessible or not applicable', '/assets?filter=missing_mac', 'warn'),
              qualityRow('ip', 'IP address not captured', m.missing.ip_address, 'Not counted: marked not accessible or not applicable', '/assets?filter=missing_ip', 'warn'),
              qualityRow('mm', 'Manufacturer or model missing', m.missing.identity, 'Listed as needing identification', '/assets?filter=missing_identity', 'danger'),
              qualityRow('dup', 'Potential duplicate assets', m.duplicates, 'Same serial number, MAC address or asset tag' + (m.possible ? ' · ' + m.possible + ' weaker matches to check' : ''), '/assets?tab=duplicates', 'danger'),
              qualityRow('ai', 'AI identifications not yet verified', m.aiReview + m.pending, m.pending + ' captures awaiting review · ' + m.aiReview + ' assets', '/identify', 'warn'),
              qualityRow('rev', 'Devices requiring manual review', m.needsId, 'Flagged, or manufacturer / model not identified', '/assets?filter=needs_identification', 'danger'))),
          m.assets ? h('section.stack', null,
            ui.label('Identifiers'),
            ui.card({ key: 'ids' },
              idBar('Serial number', m.byField.serial_number, 'missing_serial'), idBar('MAC address', m.byField.mac_address, 'missing_mac'), idBar('IP address', m.byField.ip_address, 'missing_ip'),
              h('p.muted', null, 'Not every device exposes every identifier. “Not accessible” and “Not applicable” are recorded answers, not gaps; only “not captured” is still open.'))) : null))
    ];
  };
  /* "Start Room Inventory": straight into the last room worked on, or choose one */
  EV.inventoryStart = function () {
    return ui.pickRoom({ title: 'Start room inventory', sub: 'Choose the floor, then the room',
      rowSub: function (r) { return [r.department, U.plural(I.roomAssets(r.id).length, 'device')].filter(Boolean).join(' · '); },
      right: function (r) { const s = I.roomStatus(r); return ui.chip(I.roomStatusLabel(s), I.ROOM_TONE[s]); } }).then(function (sel) { if (sel && sel.room) EV.go('/rooms/room/' + sel.room.id); });
  };
})();
