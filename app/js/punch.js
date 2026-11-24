/* punch.js — the punch list: things in a room to be put right, typed in as they are seen while the room's hardware is
 * documented, each to be resolved by the internal AV support team or by an AV integrator.
 * Nothing is decided for the person typing: an item has a party only when one was chosen ("Decide later" leaves it
 * open), its text is kept as typed (one item per line; list markers in front of a line are dropped), and it is open
 * until someone marks it resolved. The punch list has its own export; it is not part of the legacy daily package. */
(function () {
  'use strict';
  const EV = window.EV, h = EV.h, U = EV.U, S = EV.S, store = EV.store, ui = EV.ui, icon = EV.icon, R = EV.rules;
  const PL = (EV.punch = {});
  PL.PARTY_TONE = { internal: 'accent', integrator: 'violet', '': 'muted' };
  PL.partyLabel = function (v) { return v ? S.label(S.PUNCH_PARTIES, v) : 'Not assigned'; };
  PL.isOpen = function (p) { return p.status !== 'resolved'; };

  /* ------------------------------------------------------------------ records */
  /* One item per line. A list marker typed or pasted in front of a line ("- ", "• ", "1. ", "2) ") is not part of the
     item; "1.5 m cable" keeps its number because no space follows the full stop. */
  PL.split = function (text) {
    return String(text == null ? '' : text).split(/\r\n|\r|\n/)
      .map(function (l) { return l.replace(/^\s*(?:[-*•▪◦–—]|\d{1,3}[.)])\s+/, '').replace(/\s+/g, ' ').trim(); })
      .filter(Boolean);
  };
  function byOrder(list) {
    return list.slice().sort(function (a, b) {
      return (PL.isOpen(a) ? 0 : 1) - (PL.isOpen(b) ? 0 : 1) || (a.sort_order || 0) - (b.sort_order || 0) || String(a.created_at).localeCompare(String(b.created_at));
    });
  }
  PL.forRoom = function (roomId) { return byOrder(store.by('punch_items', 'room_id', roomId)); };
  PL.openCount = function (roomId) { return store.by('punch_items', 'room_id', roomId).filter(PL.isOpen).length; };
  /* every item, in building → floor → room → list order (the order of the exports) */
  PL.all = function () {
    const rooms = {};
    const where = function (p) {
      if (!rooms[p.room_id]) {
        const r = store.getAny('rooms', p.room_id) || {}, f = store.getAny('floors', p.floor_id) || {}, b = store.getAny('buildings', p.building_id) || {};
        rooms[p.room_id] = { b: b.name || '', bid: p.building_id || '', f: f.sort_order != null ? f.sort_order : 1e6, fn: f.number || '', fid: p.floor_id || '', r: R.roomLabel(r) || '', rid: p.room_id || '' };
      }
      return rooms[p.room_id];
    };
    return store.all('punch_items').slice().sort(function (a, b) {
      const x = where(a), y = where(b);
      /* the ids keep two rooms (or floors, or buildings) that read the same apart, so each room's items stay together */
      return U.natCmp(x.b, y.b) || x.bid.localeCompare(y.bid) || (x.f - y.f) || U.natCmp(x.fn, y.fn) || x.fid.localeCompare(y.fid) || U.natCmp(x.r, y.r) || x.rid.localeCompare(y.rid) || (a.sort_order || 0) - (b.sort_order || 0) || String(a.created_at).localeCompare(String(b.created_at));
    });
  };
  /* Adds one item per line of `text` to the room. resolver: 'internal' | 'integrator' | '' (decide later). */
  PL.add = function (room, text, resolver) {
    const lines = PL.split(text);
    if (!lines.length) return [];
    if (!room || !room.building_id || !room.floor_id) throw new Error('This room has no building or floor recorded.');
    const party = resolver === 'internal' || resolver === 'integrator' ? resolver : '';
    let n = Math.max.apply(null, [0].concat(store.by('punch_items', 'room_id', room.id).map(function (p) { return p.sort_order || 0; })));
    const made = lines.map(function (t) {
      n += 1;
      return store.create('punch_items', { building_id: room.building_id, floor_id: room.floor_id, room_id: room.id, device_id: null, text: t, resolver: party,
        status: 'open', notes: '', resolved_at: null, resolved_by: '', sort_order: n });
    });
    /* typing a punch item means the room has been visited */
    const cur = store.get('rooms', room.id);
    if (cur && !cur.inventory_status) store.update('rooms', cur.id, { inventory_status: 'in_progress' }, { silent: true });
    return made;
  };
  PL.statusPatch = function (p, status) {
    if (status === 'resolved') return p.status === 'resolved' ? { status: status } : { status: status, resolved_at: U.now(), resolved_by: store.actor() };
    return { status: status, resolved_at: null, resolved_by: '' };
  };
  PL.setStatus = function (p, status) { const cur = store.get('punch_items', p.id); if (cur) store.update('punch_items', cur.id, PL.statusPatch(cur, status)); };

  /* ------------------------------------------------------------------ one item: row and edit sheet */
  function where(p) {
    const r = store.getAny('rooms', p.room_id), f = store.getAny('floors', p.floor_id), b = store.getAny('buildings', p.building_id);
    return [b && b.name, f && f.number ? 'Floor ' + f.number : '', r && R.roomLabel(r)].filter(Boolean).join(' · ');
  }
  function place(p) { const f = store.getAny('floors', p.floor_id), b = store.getAny('buildings', p.building_id); return [b && b.name, f && f.number ? 'Floor ' + f.number : ''].filter(Boolean).join(' · '); }
  PL.row = function (p, o) {
    o = o || {};
    const done = !PL.isOpen(p);
    const dev = p.device_id ? store.get('devices', p.device_id) : null;
    const when = done ? 'Resolved ' + (p.resolved_at ? U.fmtDate(p.resolved_at) : '') + (p.resolved_by ? ' by ' + p.resolved_by : '') : 'Added ' + U.fmtDate(p.created_at);
    return h('div', { key: p.id, 'class': U.cx('row', 'punch-row', done && 'punch-done') },
      h('button', { type: 'button', 'class': 'punch-check', id: 'punch-check-' + p.id, 'aria-pressed': done ? 'true' : 'false', disabled: store.readOnly,
        title: done ? 'Resolved — tap to reopen' : 'Open — tap when resolved', 'aria-label': done ? 'Reopen: ' + p.text : 'Mark resolved: ' + p.text,
        onclick: function () { PL.setStatus(p, done ? 'open' : 'resolved'); } }, icon(done ? 'check-circle' : 'circle', 22)),
      h('button', { type: 'button', 'class': 'punch-main', id: 'punch-open-' + p.id, onclick: function () { PL.edit(p.id); } },
        h('span.punch-text', null, p.text),
        h('span.row-sub', null, [p.code, o.where ? where(p) : '', dev ? R.deviceLabel(dev) : '', p.notes ? 'Has notes' : '', when].filter(Boolean).join(' · '))),
      h('span.row-right', null, ui.chip(PL.partyLabel(p.resolver), PL.PARTY_TONE[p.resolver || ''])));
  };
  PL.edit = function (id) {
    if (!store.get('punch_items', id)) return null;
    return ui.openEditor({
      table: 'punch_items', id: id, fields: S.F.punchItem, size: 'auto', deleteLabel: 'Delete item', canDelete: !store.readOnly,
      title: 'Punch list item', sub: function (r) { return r ? [r.code, where(r)].filter(Boolean).join(' · ') : ''; },
      onSet: function (r, k, v, patch) { if (k === 'status') Object.assign(patch, PL.statusPatch(r, v)); },
      after: function (r) {
        return h('p.muted', { key: 'when' }, 'Added ' + U.fmtDateTime(r.created_at) + (r.created_by ? ' by ' + r.created_by : '') +
          (r.status === 'resolved' && r.resolved_at ? ' · Resolved ' + U.fmtDateTime(r.resolved_at) + (r.resolved_by ? ' by ' + r.resolved_by : '') : ''));
      }
    });
  };

  /* ------------------------------------------------------------------ the room's punch list (room inventory page) */
  /* What is being typed belongs to its room only. The party chosen last is offered again in the next room (it is shown
     selected and can be changed); until one is chosen, nothing can be added. */
  const drafts = {};
  let lastParty = null;
  PL.draft = function (roomId) { return drafts[roomId] || (drafts[roomId] = { text: '', resolver: lastParty }); };
  PL.section = function (room) {
    const items = PL.forRoom(room.id);
    const open = items.filter(PL.isOpen).length;
    const d = PL.draft(room.id);
    const lines = PL.split(d.text);
    const add = function () {
      const now = PL.split(d.text);
      if (!now.length || d.resolver == null) return;
      const made = PL.add(store.get('rooms', room.id) || room, d.text, d.resolver);
      d.text = '';
      const el = document.getElementById('punch-draft'); if (el) el.value = '';
      EV.toast(U.plural(made.length, 'punch item') + ' added', 'ok');
    };
    return h('section.stack', { id: 'room-punch', key: 'punch' },
      ui.label('Punch list', h('span.count', null, items.length ? open + ' open' + (items.length > open ? ' · ' + (items.length - open) + ' resolved' : '') : '0')),
      store.readOnly ? null : h('div.punch-entry', null,
        ui.textarea(d.text, { id: 'punch-draft', rows: 3, ph: 'What needs to be put right — one item per line', oninput: function (v) { d.text = v; } }),
        h('div.punch-party', null,
          h('span.field-label', null, 'To be resolved by'),
          ui.seg(d.resolver, [['internal', 'Internal AV support'], ['integrator', 'AV integrator'], ['', 'Decide later', 'muted']],
            { wrap: true, cls: 'punch-seg', onchange: function (v) { d.resolver = v; lastParty = v; } })),
        h('div.btn-row.wrap', null,
          ui.btn(lines.length > 1 ? 'Add ' + lines.length + ' items' : 'Add item', { kind: 'primary', icon: 'plus', id: 'punch-add', disabled: !lines.length || d.resolver == null, onclick: add }),
          lines.length && d.resolver == null ? h('span.field-hint', { key: 'why' }, 'Choose who resolves it first, or “Decide later”.') : null)),
      items.length ? h('div.list.punch-list', null, items.map(function (p) { return PL.row(p); }))
        : h('p.muted', { key: 'none' }, store.readOnly ? 'No punch list items for this room.' : 'Nothing on the punch list for this room. Type each thing that needs to be put right on its own line.'));
  };

  /* ------------------------------------------------------------------ export */
  PL.COLUMNS = ['Item ID', 'Building', 'Floor', 'Room number', 'Room name', 'Room ID', 'What needs to be put right', 'To be resolved by', 'Status',
    'Related device', 'Notes', 'Added', 'Added by', 'Resolved', 'Resolved by'];
  PL.rowOf = function (p) {
    const r = store.getAny('rooms', p.room_id) || {}, f = store.getAny('floors', p.floor_id) || {}, b = store.getAny('buildings', p.building_id) || {};
    const d = p.device_id ? store.getAny('devices', p.device_id) : null;
    return [p.code || '', b.name || '', f.number || '', r.number || '', r.name || '', r.code || '', p.text || '', PL.partyLabel(p.resolver), S.label(S.PUNCH_STATUS, p.status || 'open'),
      d ? [d.code, R.deviceLabel(d)].filter(Boolean).join(' — ') : '', p.notes || '', p.created_at ? U.fmtDateTime(p.created_at) : '', p.created_by || '',
      p.status === 'resolved' && p.resolved_at ? U.fmtDateTime(p.resolved_at) : '', p.status === 'resolved' ? (p.resolved_by || '') : ''];
  };
  /* items: the records to write, already filtered; o: { format: 'xlsx' | 'csv', scope: text describing the selection } */
  PL.build = async function (items, o) {
    const rows = items.map(PL.rowOf);
    const scope = o.scope || 'All items';
    const base = 'punch-list_' + U.fileSafe(scope).toLowerCase() + '_' + U.localDate();
    if (o.format === 'csv') {
      return { blob: new Blob([EV.csv.encode([PL.COLUMNS].concat(rows), { bom: true, guard: true })], { type: 'text/csv' }), filename: base + '.csv', mime: 'text/csv', rows: rows };
    }
    const sheets = [{ name: 'Punch list', columns: PL.COLUMNS, rows: rows }];
    [['internal', 'Internal AV support'], ['integrator', 'AV integrator'], ['', 'Not assigned']].forEach(function (x) {
      const mine = items.filter(function (p) { return (p.resolver || '') === x[0]; });
      if (mine.length && mine.length < items.length) sheets.push({ name: x[1], columns: PL.COLUMNS, rows: mine.map(PL.rowOf) });
    });
    const count = function (party, open) { return items.filter(function (p) { return (party == null || (p.resolver || '') === party) && PL.isOpen(p) === open; }).length; };
    sheets.push({ name: 'Export', columns: ['Item', 'Value'], rows: [['Generated', U.fmtDateTime(U.now())], ['Exported by', store.actor()], ['Selection', scope], ['Items', items.length],
      ['Open', count(null, true)], ['Resolved', count(null, false)],
      ['Open — Internal AV support', count('internal', true)], ['Open — AV integrator', count('integrator', true)], ['Open — not assigned', count('', true)]] });
    const blob = await EV.xlsx.simple('Punch list', sheets);
    return { blob: blob, filename: base + '.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', rows: rows };
  };
  PL.run = async function (items, o) {
    const built = await PL.build(items, o);
    const res = await EV.saveFile(built.blob, built.filename, built.mime);
    if (!res || !res.ok) return { ok: false, message: (res && res.message) || 'The file was not saved.', built: built };
    store.log({ action: 'exported', entity_type: 'punch_items', summary: 'Punch list exported: ' + U.plural(items.length, 'item') + ' (' + (o.scope || 'all items') + ') — ' + built.filename });
    return { ok: true, built: built };
  };

  /* ------------------------------------------------------------------ the punch list page: every room */
  const st = { status: 'open', party: 'all', building: '', floor: '', q: '' };
  PL.filterState = st;
  PL.filtered = function () {
    const q = st.q.trim().toLowerCase();
    return PL.all().filter(function (p) {
      if (st.status === 'open' && !PL.isOpen(p)) return false;
      if (st.status === 'resolved' && PL.isOpen(p)) return false;
      if (st.party !== 'all' && (p.resolver || 'none') !== st.party) return false;
      if (st.building && p.building_id !== st.building) return false;
      if (st.floor && p.floor_id !== st.floor) return false;
      if (q) {
        const r = store.getAny('rooms', p.room_id) || {};
        if (![p.text, p.notes, p.code, r.number, r.name, r.code].some(function (v) { return v && String(v).toLowerCase().indexOf(q) >= 0; })) return false;
      }
      return true;
    });
  };
  PL.scopeLabel = function () {
    const b = st.building ? store.getAny('buildings', st.building) : null, f = st.floor ? store.getAny('floors', st.floor) : null;
    return [st.status === 'open' ? 'Open' : st.status === 'resolved' ? 'Resolved' : 'All',
      st.party === 'all' ? '' : st.party === 'none' ? 'Not assigned' : PL.partyLabel(st.party),
      b ? b.name : '', f ? 'Floor ' + f.number : '', st.q.trim() ? '“' + st.q.trim() + '”' : ''].filter(Boolean).join(' ') || 'All items';
  };
  function exportBtn(format, items) {
    return ui.btn(format === 'csv' ? 'CSV' : 'Excel', { key: format, icon: 'download', id: 'punch-export-' + format, kind: format === 'xlsx' ? 'primary' : 'secondary', disabled: !items.length,
      onclick: function () {
        return PL.run(items, { format: format, scope: PL.scopeLabel() }).then(function (res) {
          EV.toast(res.ok ? U.plural(items.length, 'item') + ' exported — ' + res.built.filename : res.message, res.ok ? 'ok' : 'warn');
        }).catch(function (e) { EV.toast('The export failed: ' + ((e && e.message) || e), 'danger'); });
      } });
  }
  EV.pages.punch = function () {
    const all = store.all('punch_items');
    const open = all.filter(PL.isOpen);
    const items = PL.filtered();
    const n = function (party) { return open.filter(function (p) { return (p.resolver || 'none') === party; }).length; };
    const buildings = U.sortBy(store.all('buildings').filter(function (b) { return !b.archived || all.some(function (p) { return p.building_id === b.id; }); }), function (b) { return b.name; });
    const floors = st.building ? R.buildingFloors(st.building) : [];
    const pick = function (status, party) { return function () { st.status = status; st.party = party; }; };
    /* grouped by room, in export order */
    const groups = [];
    items.slice(0, 500).forEach(function (p) { const g = groups[groups.length - 1]; if (g && g.room === p.room_id) g.items.push(p); else groups.push({ room: p.room_id, items: [p] }); });
    return [
      ui.head({ title: 'Punch List', sub: 'What needs to be put right, room by room, and who resolves it',
        actions: [exportBtn('xlsx', items), exportBtn('csv', items)] }),
      all.length ? h('div.tiles', { key: 'tiles' },
        ui.stat({ key: 'o', label: 'Open items', value: open.length, sub: U.plural(U.uniq(open.map(function (p) { return p.room_id; })).length, 'room'), onclick: pick('open', 'all') }),
        ui.stat({ key: 'i', label: 'Internal AV support', value: n('internal'), sub: 'Open', onclick: pick('open', 'internal') }),
        ui.stat({ key: 'g', label: 'AV integrator', value: n('integrator'), sub: 'Open', onclick: pick('open', 'integrator') }),
        ui.stat({ key: 'u', label: 'Not assigned', value: n('none'), tone: n('none') ? 'warn' : null, sub: 'Open, party not decided', onclick: pick('open', 'none') })) : null,
      all.length ? h('div.stack', { key: 'filters' },
        ui.seg(st.status, [['open', 'Open'], ['resolved', 'Resolved'], ['all', 'All']], { onchange: function (v) { st.status = v; } }),
        ui.seg(st.party, [['all', 'Everyone'], ['internal', 'Internal AV support'], ['integrator', 'AV integrator'], ['none', 'Not assigned']], { wrap: true, onchange: function (v) { st.party = v; } }),
        h('div.toolbar', null,
          ui.select(st.building, buildings.map(function (b) { return [b.id, b.name || 'Unnamed building']; }), { placeholder: 'All buildings', aria: 'Building', onchange: function (v) { st.building = v; st.floor = ''; } }),
          st.building ? ui.select(st.floor, floors.map(function (f) { return [f.id, 'Floor ' + f.number]; }), { placeholder: 'All floors', aria: 'Floor', onchange: function (v) { st.floor = v; } }) : null),
        ui.search(st.q, function (v) { st.q = v; }, 'Find: item text, notes, room number or name')) : null,
      !all.length ? ui.empty({ key: 'empty', icon: 'flag', title: 'No punch list items yet',
        text: 'Open a room in Room Inventory and type what needs to be put right, one item per line, choosing who resolves it: internal AV support or an AV integrator.',
        action: ui.btn('Start Room Inventory', { kind: 'primary', icon: 'grid', onclick: function () { EV.inventoryStart(); } }) })
        : !items.length ? ui.empty({ key: 'none', icon: 'search', title: 'No item matches this selection' })
          : h('div.stack', { key: 'groups' }, groups.map(function (g) {
            const r = store.getAny('rooms', g.room) || {};
            return h('section.card.card-pad.stack', { key: g.room },
              ui.row({ key: 'h', left: icon('grid', 17), title: R.roomLabel(r) || 'Room', sub: place(g.items[0]),
                right: h('span.count', null, String(g.items.length)), onclick: r.id && !r.deleted_at ? function () { EV.go('/rooms/room/' + r.id); } : null }),
              h('div.list.punch-list', null, g.items.map(function (p) { return PL.row(p); })));
          })),
      items.length > 500 ? h('p.muted', { key: 'more' }, 'Showing the first 500 of ' + items.length + ' items. The export holds all of them.') : null
    ];
  };
})();
