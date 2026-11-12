/* pages/devices.js — device inventory, documentation-completeness dashboard, device editor, follow-up tasks. */
(function () {
  'use strict';
  const EV = window.EV, h = EV.h, U = EV.U, S = EV.S, store = EV.store, ui = EV.ui, icon = EV.icon, R = EV.rules, A = EV.act, P = EV.photos;
  const st = { q: '', filter: 'all', floor: '', category: '', applied: '', limit: 60 };

  const CAT_ICON = { 'Display': 'monitor', 'Camera': 'video', 'Microphone processor': 'mic', 'Microphone endpoint': 'mic', 'Network switch': 'network', 'Touch panel': 'grid',
    'Room scheduling panel': 'calendar', 'Video conferencing codec': 'video', 'Zoom Room appliance': 'video', 'Microsoft Teams Room appliance': 'video', 'UPS': 'zap',
    'Power distribution unit': 'zap', 'Wireless presentation system': 'wifi', 'Digital signage player': 'monitor', 'Video wall controller': 'monitor', 'Loudspeaker amplifier': 'activity' };
  function catIcon(c) { return CAT_ICON[c] || 'cpu'; }
  const ID_SHORT = { verified: 'verified', recorded: 'unverified', missing: 'missing', na: 'n/a' };

  function idDots(d, r) {
    return h('span.id-dots', null, R.ID_FIELDS.map(function (f) {
      const s = r.states[f.k];
      return h('span', { key: f.k, 'class': 'id-dot id-' + s, title: f.label + ': ' + ID_SHORT[s] }, f.short);
    }));
  }
  function stateChip(r) {
    if (!r.identified) return ui.chip('Incomplete', 'danger');
    if (r.invalid.length) return ui.chip('Check format', 'warn');
    if (r.unverified.length) return ui.chip('Unverified', 'warn');
    if (r.missingRequired.length) return ui.chip('Details missing', 'warn');
    return ui.chip('Verified', 'ok');
  }
  EV.deviceRow = function (d, o) {
    o = o || {};
    const r = R.device(d);
    const room = store.get('rooms', d.room_id);
    const mm = [d.manufacturer, d.model].filter(Boolean).join(' ');
    return ui.row({ key: d.id, left: icon(catIcon(d.category), 18),
      title: [d.hostname ? h('span.mono', { key: 'h' }, d.hostname) : (mm || R.deviceType(d)), ui.demo(d), d.archived ? ui.chip('Archived', 'muted') : null],
      sub: [R.deviceType(d), d.hostname ? mm : '', o.showRoom && room ? (room.number || room.name) : ''].filter(Boolean).join(' · '),
      below: h('span.dev-below', null, idDots(d, r), r.missing.length ? h('span.dev-missing', null, 'Missing: ' + r.missing.join(', ')) : null),
      right: stateChip(r), onclick: function () { EV.editors.device(d.id); } });
  };

  /* ------------------------------------------------------------------ follow-ups */
  EV.followupRow = function (fu, o) {
    const d = o && o.inDevice ? null : store.get('devices', fu.device_id);
    const req = fu.it_request_id ? store.get('it_requests', fu.it_request_id) : null;
    return h('div.row.fu', { key: fu.id },
      h('span.row-main', null,
        h('span.row-title', null, fu.title, ui.demo(fu)),
        h('span.row-sub', null, fu.detail),
        h('span.btn-row.wrap', null,
          ui.chip(fu.suggested_party, fu.suggested_party === 'Client IT' ? 'accent' : fu.suggested_party === 'Vendor' ? 'violet' : 'muted'),
          req ? ui.btn(req.code + ' · ' + req.status, { sm: true, kind: 'ghost', icon: 'link', onclick: function () { EV.editors.request(req.id); } })
            : ui.btn('Draft request', { sm: true, kind: 'ghost', icon: 'message', onclick: function () { const x = A.requestFromFollowup(fu); EV.editors.request(x.id); } }),
          d ? ui.btn('Open device', { sm: true, kind: 'ghost', icon: 'cpu', onclick: function () { EV.editors.device(d.id); } }) : null,
          ui.btn('Dismiss', { sm: true, kind: 'ghost', onclick: function () { store.update('followups', fu.id, { status: 'dismissed' }); EV.toast('Follow-up dismissed. The device stays flagged as incomplete.'); } }))));
  };

  /* ------------------------------------------------------------------ device editor */
  function statusBanner(d) {
    const r = R.device(d);
    const dups = R.duplicates().filter(function (g) { return g.devices.some(function (x) { return x.id === d.id; }); });
    const fus = R.deviceFollowups(d.id);
    return h('div.stack', { key: 'banner' },
      !r.identified ? ui.note('danger', 'Missing: ' + r.missing.join(', ') + '. The device remains in the inventory and is counted as incomplete until each value is recorded or marked “Not applicable”.', { title: 'Identification incomplete' })
        : r.unverified.length ? ui.note('warn', 'Recorded but not verified: ' + r.unverified.join(', ') + '.', { title: 'Identified — verification outstanding' })
          : r.missingRequired.length ? ui.note('warn', 'Still needed: ' + r.missingRequired.join(', ') + '.', { title: 'Descriptive details missing' })
            : ui.note('ok', 'IP address, MAC address and serial number are each verified or not applicable.', { title: 'Identification complete' }),
      r.invalid.length ? ui.note('warn', r.invalid.join('. ') + '.') : null,
      dups.map(function (g) {
        return ui.note('danger', g.label + ' ' + g.value + ' is also recorded on: ' + g.devices.filter(function (x) { return x.id !== d.id; }).map(R.deviceLabel).join('; ') + '. Neither record is assumed correct — reconcile onsite or with IT.',
          { key: g.field, title: 'Conflicting value' });
      }),
      fus.length ? h('div.stack', { style: 'gap:6px' }, ui.label('Follow-up tasks', h('span.count', null, String(fus.length))), h('div.list', null, fus.map(function (f) { return EV.followupRow(f, { inDevice: true }); }))) : null);
  }
  function deviceExtras(d) {
    const photos = P.forDevice(d.id);
    const room = store.get('rooms', d.room_id);
    /* A photograph taken here belongs to the audit being worked on when that audit covers this device's room
       (including a completed audit, or a combined-configuration audit); otherwise to the room's open audit, if any. */
    const cx = EV.context ? EV.context() : {};
    const audit = cx.audit && R.auditRooms(cx.audit).some(function (r) { return r.id === d.room_id; }) ? cx.audit : (room ? A.openAudit({ room: room }) : null);
    const deps = store.all('network_links').filter(function (l) { return l.kind === 'dependency' && l.from_type === 'device' && l.from_id === d.id; });
    const spares = R.spareFor(d);
    const critical = room && R.criticality(room) === 'critical' && S.ROOM_CRITICAL_CATEGORIES.indexOf(d.category) >= 0;
    return [
      h('div.form-group', { key: 'photos' },
        h('div.form-group-title', null, 'Photographs of this device'),
        P.strip(photos),
        h('div.btn-row.wrap', null,
          P.captureButton({ key: 'dev-cam-' + d.id, sm: true, label: 'Photo of label', ctx: function () { return { room: room, audit: audit, device_id: d.id, category: 'Equipment labels', description: R.deviceLabel(d) }; } }),
          P.captureButton({ key: 'dev-rear-' + d.id, sm: true, kind: 'secondary', label: 'Rear panel', ctx: function () { return { room: room, audit: audit, device_id: d.id, category: 'Device rear panels', description: R.deviceLabel(d) }; } }),
          P.captureButton({ key: 'dev-lib-' + d.id, sm: true, kind: 'ghost', label: 'Upload', library: true, ctx: function () { return { room: room, audit: audit, device_id: d.id, category: 'Equipment labels' }; } })),
        h('span.field-hint', null, 'Photographs are evidence only. Type identification values yourself — they are never read from images automatically.')),
      h('div.form-group', { key: 'deps' },
        h('div.form-group-title', null, 'Infrastructure dependencies'),
        deps.length ? h('div.chips', null, deps.map(function (l) { return ui.chip(l.dep_type + ' — ' + S.label(S.DEP_STATUS, l.status), ui.tone.dep[l.status] || 'muted', { key: l.id }); })) : h('span.field-hint', null, 'None recorded.'),
        h('div.btn-row', null, ui.btn('Add dependency', { sm: true, kind: 'ghost', icon: 'plus', onclick: function () { EV.editors.newDependency(d); } }))),
      critical || spares.length ? h('div.form-group', { key: 'spares' },
        h('div.form-group-title', null, 'Spare coverage'),
        spares.length ? ui.note('ok', spares.map(function (s) { return s.code + ' ' + s.name + ' — ' + s.quantity + ' in stock (' + (s.storage_location || 'location not recorded') + ')'; }).join('; '))
          : ui.note('warn', 'No in-stock spare matches this model, and this is a room-critical device in an executive / critical room.')) : null,
      h('div.form-group', { key: 'arch' },
        h('div.form-group-title', null, 'Lifecycle'),
        ui.field(d.archived ? 'Archived — removed from service' : 'In service', ui.toggle(!d.archived, { onchange: function (on) { store.update('devices', d.id, { archived: !on }); } }),
          { div: true, cls: 'field-toggle', hint: 'Archive a device that has been removed or replaced. Its history is kept.' }))
    ];
  }
  EV.editors.device = function (id, isNew) {
    return ui.openEditor({
      table: 'devices', id: id, isNew: isNew, strict: false, fields: S.F.device,
      title: function (d) { return d ? (isNew ? 'New ' + R.deviceType(d).toLowerCase() : R.deviceLabel(d)) : 'Device'; },
      sub: function (d) { return d ? d.code + (R.where(d) ? ' · ' + R.where(d) : '') : ''; },
      before: statusBanner, after: deviceExtras,
      onSet: function (d, k, v, patch) {
        if (/_status$/.test(k) && v === 'not_applicable') { const f = R.ID_FIELDS.find(function (x) { return x.s === k; }); if (f) patch[f.k] = ''; }
        if (k === 'switch_asset_id') { const a = store.get('infra_assets', v); patch.connected_switch = a ? (a.name || a.hostname || '') : ''; }
      },
      onDone: function (d) {
        A.syncDevicePort(d);
        const r = R.device(d);
        if (isNew && !r.identified) EV.toast('Saved. Missing ' + r.missing.join(', ') + ' — flagged for follow-up.', 'warn', 4200);
      }
    });
  };
  EV.editors.newDevice = function (ctx) {
    const custom = U.uniq(store.all('devices').map(function (d) { return d.category === 'Other' ? d.custom_category : ''; }).filter(Boolean));
    const pick = { q: '' };
    const sheet = ui.openSheet({
      title: 'Add device', sub: ctx.room ? R.roomLabel(ctx.room) : 'No room selected', size: 'full',
      render: function () {
        const q = pick.q.trim().toLowerCase();
        const cats = S.DEVICE_CATEGORIES.filter(function (c) { return !q || c.toLowerCase().indexOf(q) >= 0; });
        const choose = function (c, customName) {
          ui.closeSheet(sheet);
          const d = A.addDevice(ctx, c);
          if (customName) store.update('devices', d.id, { custom_category: customName }, { silent: true });
          EV.editors.device(d.id, true);
        };
        return [
          ui.search(pick.q, function (v) { pick.q = v; }, 'Device type'),
          h('div.cat-grid', null, cats.map(function (c) {
            return h('button', { type: 'button', key: c, 'class': 'cat-tile', onclick: function () { choose(c); } }, icon(catIcon(c), 20), h('span', null, c));
          })),
          custom.length ? h('div.stack', { style: 'gap:6px' }, ui.label('Custom types used before'),
            h('div.chip-scroll', null, custom.map(function (c) { return h('button', { type: 'button', key: c, 'class': 'pill', onclick: function () { choose('Other', c); } }, c); }))) : null,
          q && !cats.length ? ui.btn('Add “' + pick.q.trim() + '” as a custom device type', { kind: 'primary', block: true, onclick: function () { choose('Other', pick.q.trim()); } }) : null
        ];
      }
    });
    return sheet;
  };

  /* ------------------------------------------------------------------ inventory page */
  const FILTERS = [['all', 'All devices'], ['incomplete', 'Incomplete identification'], ['ip', 'Missing IP address'], ['mac', 'Missing MAC address'], ['serial', 'Missing serial number'],
    ['unverified', 'Recorded, not verified'], ['port', 'Switch port undocumented'], ['firmware', 'Firmware undocumented'], ['conflict', 'Conflicting values'], ['verified', 'Fully verified'], ['archived', 'Archived']];
  function matches(d, f, dupIds) {
    const r = R.device(d);
    switch (f) {
      case 'incomplete': return !r.identified;
      case 'ip': return r.states.ip_address === 'missing';
      case 'mac': return r.states.mac_address === 'missing';
      case 'serial': return r.states.serial_number === 'missing';
      case 'unverified': return r.unverified.length > 0;
      case 'port': return r.networked && U.blank(d.switch_port);
      case 'firmware': return r.networked && U.blank(d.firmware_version) && d.category !== 'Display';
      case 'conflict': return dupIds.has(d.id);
      case 'verified': return r.verified;
      default: return true;
    }
  }
  function fieldBar(label, c) {
    return h('div.idbar', { key: label },
      h('div.idbar-top', null, h('span.idbar-label', null, label), h('span.muted', null, c.verified + ' verified · ' + c.recorded + ' unverified · ' + c.missing + ' missing · ' + c.na + ' n/a')),
      ui.stackbar([{ n: c.verified, tone: 'ok', label: 'verified' }, { n: c.recorded, tone: 'warn', label: 'unverified' }, { n: c.missing, tone: 'danger', label: 'missing' }, { n: c.na, tone: 'muted', label: 'not applicable' }]));
  }
  EV.pages.devices = function () {
    if (st.applied !== EV.router.nav) {
      st.applied = EV.router.nav;
      if (EV.router.query.filter) st.filter = EV.router.query.filter;
      st.limit = 60;
    }
    const ds = R.deviceStats();
    const dupIds = new Set();
    R.duplicates().forEach(function (g) { g.devices.forEach(function (d) { dupIds.add(d.id); }); });
    const source = st.filter === 'archived' ? store.all('devices').filter(function (d) { return d.archived; }) : R.liveDevices();
    const q = st.q.trim().toLowerCase();
    const list = U.sortBy(source.filter(function (d) {
      if (st.floor && d.floor_id !== st.floor) return false;
      if (st.category && d.category !== st.category) return false;
      if (st.filter !== 'archived' && !matches(d, st.filter, dupIds)) return false;
      if (!q) return true;
      const room = store.get('rooms', d.room_id);
      return [d.hostname, d.manufacturer, d.model, d.serial_number, d.ip_address, d.mac_address, d.code, d.category, d.custom_category, room ? room.number + ' ' + room.name : '']
        .some(function (v) { return v && String(v).toLowerCase().indexOf(q) >= 0; });
    }), function (d) { const room = store.get('rooms', d.room_id); return (room ? room.number : 'zzz') + ' ' + d.category + ' ' + (d.hostname || ''); });
    const floors = [];
    store.all('buildings').forEach(function (b) { R.buildingFloors(b.id).forEach(function (f) { floors.push([f.id, 'Floor ' + f.number]); }); });
    const cats = U.uniq(R.liveDevices().map(function (d) { return d.category; })).sort();
    const fus = R.openFollowups();
    const wide = window.innerWidth >= 1100;
    return [
      ui.head({ title: 'Device Inventory', sub: 'Network-connected AV devices and their identification status',
        actions: [ui.btn('Add device', { kind: 'primary', icon: 'plus', key: 'a', onclick: function () {
          ui.pickRoom({ title: 'Add a device to…' }).then(function (sel) { if (sel && sel.room) EV.editors.newDevice({ room: sel.room, audit: A.openAudit({ room: sel.room }) }); });
        } }), ui.btn('CSV', { icon: 'download', key: 'c', title: 'Export the listed devices as CSV', onclick: function () { return EV.reports.quickCsv('devices', list); } })] }),
      h('section.stack', null,
        ui.label('Documentation completeness'),
        h('div.tiles', null,
          ui.stat({ key: 't', label: 'Devices', value: ds.total, sub: ds.networked + ' network-connected', onclick: function () { st.filter = 'all'; } }),
          ui.stat({ key: 'v', label: 'Fully verified', value: ds.verified, unit: '/ ' + ds.total, tone: ds.total && ds.verified === ds.total ? 'ok' : null, onclick: function () { st.filter = 'verified'; } }),
          ui.stat({ key: 'i', label: 'Incomplete identification', value: ds.incomplete, tone: ds.incomplete ? 'danger' : 'ok', sub: 'Missing IP, MAC or serial', onclick: function () { st.filter = 'incomplete'; } }),
          ui.stat({ key: 'u', label: 'Recorded, unverified', value: ds.unverified, tone: ds.unverified ? 'warn' : null, onclick: function () { st.filter = 'unverified'; } }),
          ui.stat({ key: 'p', label: 'Switch port unknown', value: ds.noPort, tone: ds.noPort ? 'warn' : null, onclick: function () { st.filter = 'port'; } }),
          ui.stat({ key: 'f', label: 'Firmware undocumented', value: ds.noFirmware, tone: ds.noFirmware ? 'warn' : null, onclick: function () { st.filter = 'firmware'; } }),
          ui.stat({ key: 'c', label: 'Conflicting values', value: dupIds.size, tone: dupIds.size ? 'danger' : null, onclick: function () { st.filter = 'conflict'; } }),
          ui.stat({ key: 'fu', label: 'Open follow-up tasks', value: fus.length, tone: fus.length ? 'warn' : null })),
        ds.total ? ui.card({ key: 'bars' }, fieldBar('IP address', ds.byField.ip_address), fieldBar('MAC address', ds.byField.mac_address), fieldBar('Serial number', ds.byField.serial_number),
          h('p.muted', null, 'Each identifier has its own completion state. Physical identity (serial) and network identity (IP, MAC) are tracked separately.')) : null),
      h('div.toolbar', null,
        ui.search(st.q, function (v) { st.q = v; st.limit = 60; }, 'Hostname, model, serial, IP, MAC, room'),
        ui.select(st.filter, FILTERS, { empty: false, aria: 'Filter', onchange: function (v) { st.filter = v; st.limit = 60; } }),
        ui.select(st.floor, floors, { placeholder: 'All floors', aria: 'Floor', onchange: function (v) { st.floor = v; } }),
        ui.select(st.category, cats, { placeholder: 'All types', aria: 'Device type', onchange: function (v) { st.category = v; } })),
      h('div.label-row', null, h('span.label', null, U.plural(list.length, 'device') + (st.filter !== 'all' ? ' · ' + S.label(FILTERS, st.filter) : '')),
        st.filter !== 'all' || st.q || st.floor || st.category ? h('button.link', { type: 'button', onclick: function () { st.filter = 'all'; st.q = ''; st.floor = ''; st.category = ''; } }, 'Clear filters') : null),
      !list.length ? ui.empty({ icon: 'cpu', title: source.length ? 'No devices match these filters' : 'No devices recorded yet', text: source.length ? '' : 'Devices are added from a room audit or with the NEW button.' })
        : wide ? h('div.table-wrap', null, h('table.table', null,
          h('thead', null, h('tr', null, ['Device', 'Room', 'IP address', 'MAC address', 'Serial number', 'Switch / port', 'Firmware', 'Status'].map(function (c) { return h('th', { key: c }, c); }))),
          h('tbody', null, list.slice(0, st.limit).map(function (d) {
            const r = R.device(d); const room = store.get('rooms', d.room_id);
            const cell = function (f) {
              const s = r.states[f.k];
              return h('td', { key: f.k }, s === 'na' ? h('span.muted', null, 'n/a') : s === 'missing' ? h('span.cell-missing', null, 'Missing') : [h('span.mono', { key: 'v' }, d[f.k]), s === 'recorded' ? h('span.cell-unv', { key: 'u' }, ' unverified') : null]);
            };
            return h('tr.click', { key: d.id, onclick: function () { EV.editors.device(d.id); } },
              h('td', null, h('div.cell-main', null, d.hostname ? h('span.mono', null, d.hostname) : R.deviceType(d), ui.demo(d)), h('div.muted', null, [R.deviceType(d), d.manufacturer, d.model].filter(Boolean).join(' · '))),
              h('td', null, room ? (room.number || room.name) : '—'),
              R.ID_FIELDS.map(cell),
              h('td', null, U.blank(d.switch_port) ? (r.networked ? h('span.cell-unv', null, 'Undocumented') : h('span.muted', null, 'n/a')) : h('span.mono', null, (d.connected_switch ? d.connected_switch + ' ' : '') + d.switch_port)),
              h('td', null, d.firmware_version ? h('span.mono', null, U.trunc(d.firmware_version, 24)) : (r.networked && d.category !== 'Display' ? h('span.cell-unv', null, 'Undocumented') : h('span.muted', null, '—'))),
              h('td', null, stateChip(r)));
          }))))
          : h('div.list', null, list.slice(0, st.limit).map(function (d) { return EV.deviceRow(d, { showRoom: true }); })),
      list.length > st.limit ? ui.btn('Show more (' + (list.length - st.limit) + ' remaining)', { block: true, onclick: function () { st.limit += 120; } }) : null,
      fus.length ? h('section.stack', null,
        ui.label('Follow-up tasks', h('span.count', null, String(fus.length))),
        h('p.muted', null, 'Created automatically when a device is missing identification. They close themselves when the value is recorded or marked “Not applicable”.'),
        h('div.list', null, fus.slice(0, 40).map(EV.followupRow))) : null
    ];
  };
  window.addEventListener('resize', U.debounce(function () { EV.redraw(); }, 150));
})();
