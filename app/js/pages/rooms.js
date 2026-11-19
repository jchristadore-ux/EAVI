/* pages/rooms.js — Room Inventory: building → floor → room → devices. A room's inventory is complete when the person
 * doing it says so; no audit, test or questionnaire is part of it. */
(function () {
  'use strict';
  const EV = window.EV, h = EV.h, U = EV.U, S = EV.S, store = EV.store, ui = EV.ui, icon = EV.icon, R = EV.rules, P = EV.photos, I = EV.inv, ID = EV.identify;
  const st = { q: '', show: 'all' };

  function statusChip(s) { return ui.chip(I.roomStatusLabel(s), I.ROOM_TONE[s]); }
  function roomRow(r, o) {
    o = o || {};
    const s = I.roomStatus(r), n = I.roomAssets(r.id).length, pend = I.roomPending(r.id).length, lst = I.roomListed(r.id).length;
    const f = o.where ? store.get('floors', r.floor_id) : null, b = o.where ? store.get('buildings', r.building_id) : null;
    return ui.row({ key: r.id, left: icon('grid', 17), title: [R.roomLabel(r) || 'Unnamed room', ui.demo(r)],
      sub: [o.where ? [b && b.name, f && 'Floor ' + f.number].filter(Boolean).join(' · ') : '', r.department, U.plural(n, 'device'), lst ? lst + ' listed, not yet seen' : '', pend ? pend + ' awaiting review' : ''].filter(Boolean).join(' · '),
      right: statusChip(s), onclick: function () { EV.go('/rooms/room/' + r.id); } });
  }
  EV.inventoryRoomRow = roomRow;

  /* ------------------------------------------------------------------ all buildings and floors */
  EV.pages.rooms = function () {
    const buildings = U.sortBy(store.all('buildings').filter(function (b) { return !b.archived; }), function (b) { return b.name; });
    const q = st.q.trim().toLowerCase();
    const found = q ? U.sortBy(I.liveRooms().filter(function (r) { return [r.number, r.name, r.department, r.code].some(function (v) { return v && String(v).toLowerCase().indexOf(q) >= 0; }); }), function (r) { return r.number || r.name; }) : null;
    return [
      ui.head({ title: 'Room Inventory', sub: 'Choose a floor, then a room, and photograph each device',
        actions: [ui.btn('Import room list', { key: 'i', icon: 'upload', id: 'rooms-import', onclick: function () { EV.roomImport.open(); } }),
          ui.btn('List equipment from room details', { key: 'l', icon: 'list', id: 'rooms-list-all', onclick: function () { EV.inventoryListAll(); } }),
          ui.btn('Photograph device', { key: 'p', kind: 'primary', icon: 'camera', onclick: function () { ID.startAnywhere(); } })] }),
      buildings.length ? ui.search(st.q, function (v) { st.q = v; }, 'Find a room: number, name or department') : null,
      found ? (found.length ? h('div.list', null, found.slice(0, 80).map(function (r) { return roomRow(r, { where: true }); })) : ui.empty({ icon: 'search', title: 'No room matches “' + st.q.trim() + '”' })) : null,
      !found && !buildings.length ? ui.empty({ icon: 'building', title: 'No buildings yet', text: 'Import the room list (CSV) to create the buildings, floors and rooms, or add them under the Legacy Command Center’s Buildings & Floors.',
        action: h('div.btn-row.wrap', null, ui.btn('Import room list', { kind: 'primary', icon: 'upload', onclick: function () { EV.roomImport.open(); } }), ui.btn('Add a building', { icon: 'plus', onclick: function () { EV.editors.newBuilding(); } })) }) : null,
      found ? null : buildings.map(function (b) {
        const floors = R.buildingFloors(b.id);
        const all = I.liveRooms().filter(function (r) { return r.building_id === b.id; });
        const t = I.tally(all);
        return h('section.card.card-pad', { key: b.id },
          h('div.card-head', null, h('div.stack', { style: 'gap:3px' }, h('h2.h2', null, b.name || 'Unnamed building', ui.demo(b)), h('div.page-sub', null, EV.inventoryCounts(t))), h('span.count', null, t.pct + '%')),
          EV.inventoryBar(t),
          floors.length ? h('div.list', null, floors.map(function (f) {
            const ft = I.tally(R.floorRooms(f.id));
            return ui.row({ key: f.id, title: 'Floor ' + f.number, sub: [f.designation, EV.inventoryCounts(ft)].filter(Boolean).join(' — '), below: EV.inventoryBar(ft),
              right: ui.chip(ft.total && ft.complete === ft.total ? 'Complete' : ft.complete || ft.in_progress ? 'In progress' : 'Not started', ft.total && ft.complete === ft.total ? 'ok' : ft.complete || ft.in_progress ? 'warn' : 'muted'),
              onclick: function () { EV.go('/rooms/floor/' + f.id); } });
          })) : h('p.muted', null, 'No floors recorded for this building.'));
      })
    ];
  };

  /* ------------------------------------------------------------------ one floor */
  EV.pages.roomsFloor = function (r) {
    const f = store.get('floors', r.id);
    if (!f) return [ui.head({ title: 'Floor not found', back: '/rooms' }), ui.empty({ icon: 'layers', title: 'This floor no longer exists.' })];
    const b = store.get('buildings', f.building_id) || {};
    const rooms = R.floorRooms(f.id);
    const t = I.tally(rooms);
    const shown = rooms.filter(function (x) { const s = I.roomStatus(x); return st.show === 'all' || (st.show === 'not_started' ? s === '' : s === st.show); });
    return [
      ui.head({ back: '/rooms', eyebrow: b.name, title: 'Floor ' + f.number, sub: f.designation }),
      ui.card({ key: 'prog' }, EV.inventoryBar(t), h('div.floor-counts', null, EV.inventoryCounts(t))),
      ui.seg(st.show, [['all', 'All (' + rooms.length + ')'], ['not_started', 'Not started (' + t.not_started + ')'], ['in_progress', 'In progress (' + t.in_progress + ')'], ['complete', 'Complete (' + t.complete + ')']],
        { wrap: true, onchange: function (v) { st.show = v; } }),
      shown.length ? h('div.list', null, shown.map(function (x) { return roomRow(x); }))
        : ui.empty({ icon: 'grid', title: rooms.length ? 'No room in this state' : 'No rooms on this floor yet', text: rooms.length ? '' : 'Rooms come from the room list import, or are added under Buildings & Floors.' })
    ];
  };

  /* ------------------------------------------------------------------ one room: the inventory workspace */
  function nextRoom(room) {
    const list = R.floorRooms(room.floor_id);
    const i = list.findIndex(function (x) { return x.id === room.id; });
    for (let k = 1; k <= list.length; k++) { const x = list[(i + k) % list.length]; if (x.id !== room.id && I.roomStatus(x) !== 'complete') return x; }
    return null;
  }
  function firstPhoto(d) { return P.forDevice(d.id).slice(-1)[0] || null; }
  function idText(d, a, f) {
    const s = a.states[f.k];
    if (s === 'verified' || s === 'captured') return h('span.mono', null, d[f.k]);
    return h('span', { 'class': s === 'not_captured' ? 'cell-missing' : 'muted' }, I.ID_STATE_LABEL[s]);
  }
  /* a device as listed in a room and in the registry: picture, identity, identifiers and status */
  EV.assetRow = function (d, o) {
    o = o || {};
    const a = I.asset(d), ph = firstPhoto(d), room = o.showRoom ? store.get('rooms', d.room_id) : null;
    return h('button', { type: 'button', key: d.id, 'class': 'asset-row', onclick: function () { EV.assets.open(d.id); } },
      h('span.asset-thumb', null, ph && ph.thumb ? h('img', { src: ph.thumb, alt: '', loading: 'lazy' }) : icon('cpu', 22)),
      h('span.asset-main', null,
        h('span.asset-title', null, [d.manufacturer, d.model].filter(Boolean).join(' ') || h('span.muted', null, 'Not identified'), ui.demo(d)),
        h('span.asset-sub', null, [h('span.mono', { key: 'c' }, d.code), ' · ' + R.deviceType(d), room ? ' · ' + R.roomLabel(room) : '']),
        h('span.asset-ids', null, I.ID_FIELDS.slice().reverse().map(function (f) { return h('span', { key: f.k, 'class': 'asset-id' }, h('span.asset-id-k', null, f.short), idText(d, a, f)); }))),
      h('span.asset-right', null, ui.chip(I.statusLabel(a.status), I.STATUS_TONE[a.status]), a.exportState !== 'never' ? ui.chip(I.EXPORT_LABEL[a.exportState], a.exportState === 'current' ? 'accent' : 'warn') : null));
  };
  /* photographs of the room itself (not of a device, not part of a device capture), part of the room details */
  function roomPhotoBlock(room, where) {
    const photos = P.forRoom(room.id).filter(function (ph) { return !ph.device_id && !ph.identification_id; });
    const ctx = function () { return { room: store.get('rooms', room.id), category: 'Room overview', description: R.roomLabel(store.get('rooms', room.id) || room) }; };
    const started = function () { const cur = store.get('rooms', room.id); if (cur && !cur.inventory_status) store.update('rooms', cur.id, { inventory_status: 'in_progress' }, { silent: true }); };
    const sfx = where === 'sheet' ? '-sheet' : '';
    return h('div.stack', { key: 'room-photos' + sfx, style: 'gap:8px' },
      h('div.label-row', null, h('span.label', null, 'Room photographs'), h('span.count', null, String(photos.length))),
      store.readOnly ? null : h('div.btn-row.wrap', null,
        P.captureButton({ key: 'room-photo' + sfx + '-' + room.id, label: 'Photograph the room', kind: 'secondary', id: 'room-photo' + sfx, ctx: ctx, after: started }),
        P.captureButton({ key: 'room-photo-lib' + sfx + '-' + room.id, label: 'Upload', kind: 'ghost', library: true, ctx: ctx, after: started })),
      photos.length ? P.gallery(photos, { caption: false }) : h('p.muted', null, 'No photographs of the room yet. A wide view from the door and one of the table and display wall are usually enough.'));
  }
  function editRoom(room) {
    return ui.openEditor({ table: 'rooms', id: room.id, fields: S.F.inventoryRoom, title: 'Room details', sub: room.code, strict: false, size: 'auto', canDelete: false,
      after: function (r) { return h('div.form-group', { key: 'photos' }, roomPhotoBlock(r, 'sheet')); } });
  }
  /* every room's listed equipment (display, camera and microphone details) becomes listed assets, after a preview */
  EV.inventoryListAll = function () {
    const rooms = I.liveRooms();
    const plans = rooms.map(function (r) { return { room: r, items: I.listingPlan(r) }; }).filter(function (x) { return x.items.length; });
    const total = U.sum(plans, function (x) { return U.sum(x.items, function (i) { return i.create; }); });
    const already = U.sum(plans, function (x) { return U.sum(x.items, function (i) { return Math.min(i.existing, i.qty); }); });
    const sheet = ui.openSheet({
      size: 'full', title: 'List equipment from room details', sub: 'Display, camera and microphone configuration of ' + U.plural(plans.length, 'room'),
      render: function () {
        return [
          ui.note('info', 'Each item named in a room\'s details becomes an asset marked “Listed — not yet seen”, with the text exactly as recorded. The manufacturer is taken only when the text starts with a known name; the rest is kept as the model. Nothing else is filled in: in the room, each one is confirmed by photographing it, or marked as not found.', { key: 'n' }),
          h('div.tiles.tiles-3', { key: 't' }, ui.stat({ key: 'a', label: 'Devices to list', value: total, tone: total ? 'ok' : null }), ui.stat({ key: 'b', label: 'Already listed', value: already }), ui.stat({ key: 'c', label: 'Rooms with details', value: plans.length })),
          plans.length ? h('div.list', { key: 'l' }, plans.slice(0, 150).map(function (x) {
            return h('div.row', { key: x.room.id }, h('span.row-main', null, h('span.row-title', null, R.roomLabel(x.room)),
              x.items.map(function (i, k) { return h('span.row-sub', { key: 'i' + k }, (i.create ? (i.qty > 1 ? i.create + ' × ' : '') : 'Already listed: ') + i.category + ' — ' + i.text); })));
          })) : ui.empty({ key: 'e', icon: 'list', title: 'No room has equipment in its details' })
        ];
      },
      footer: function () {
        return [h('span.grow', { key: 'g' }), ui.btn('Cancel', { kind: 'ghost', key: 'c', onclick: function () { ui.closeSheet(sheet); } }),
          ui.btn('List ' + U.plural(total, 'device'), { kind: 'primary', key: 'go', icon: 'check', id: 'list-all-go', disabled: !total || store.readOnly, onclick: function () {
            let made = 0;
            plans.forEach(function (x) { made += I.createListed(x.room); });
            store.log({ action: 'imported', entity_type: 'devices', summary: 'Listed ' + U.plural(made, 'device') + ' from the room details of ' + U.plural(plans.length, 'room') });
            ui.closeSheet(sheet); EV.toast(U.plural(made, 'device') + ' listed', 'ok');
          } })];
      }
    });
    return sheet;
  };
  function listedRow(room, d) {
    return h('div.row.listed-row', { key: d.id },
      h('span.row-left', null, icon('list', 17)),
      h('span.row-main', null, h('span.row-title', null, [d.manufacturer, d.model].filter(Boolean).join(' ') || d.listed_text || d.code),
        h('span.row-sub', null, [R.deviceType(d), d.code, d.listed_text].filter(Boolean).join(' · ')),
        store.readOnly ? null : h('span.btn-row.wrap', null,
          ID.captureButton({ key: 'found-' + d.id, sm: true, label: 'Found — photograph', room: function () { return store.get('rooms', room.id); }, target: function () { return store.get('devices', d.id); },
            after: function (cap) { ID.open({ capture: cap.id }); } }),
          ui.btn('Confirm without photo', { sm: true, kind: 'ghost', onclick: function () { ID.open({ capture: ID.newCapture(room, d).id }); } }),
          ui.btn('Not in this room', { sm: true, kind: 'ghost', onclick: function () {
            return ui.confirm({ title: 'Not in this room?', message: d.code + ' (' + (d.listed_text || R.deviceLabel(d)) + ') is recorded as listed but not found, and leaves the active inventory. Its record and history are kept.', confirm: 'Not found' })
              .then(function (ok) { if (ok) { I.markNotFound(store.get('devices', d.id)); EV.toast('Recorded as not found'); } });
          } }))));
  }
  EV.pages.roomsRoom = function (r) {
    const room = store.get('rooms', r.id);
    if (!room) return [ui.head({ title: 'Room not found', back: '/rooms' }), ui.empty({ icon: 'grid', title: 'This room no longer exists.' })];
    if (store.kvGet('last_inventory_room') !== room.id) store.kvSet('last_inventory_room', room.id);
    const f = store.get('floors', room.floor_id) || {}, b = store.get('buildings', room.building_id) || {};
    const s = I.roomStatus(room);
    const devs = U.sortBy(I.roomAssets(room.id), function (d) { return d.created_at; });
    const pend = I.roomPending(room.id);
    const listed = I.roomListed(room.id);
    const toList = I.listingPlan(room).filter(function (i) { return i.create; });
    const nx = nextRoom(room);
    const last = I.roomLastDate(room);
    return [
      ui.head({ back: '/rooms/floor/' + room.floor_id, eyebrow: [b.name, f.number ? 'Floor ' + f.number : ''].filter(Boolean).join(' · '), title: [R.roomLabel(room) || 'Unnamed room', ui.demo(room)],
        sub: [room.department, room.code].filter(Boolean).join(' · '), chips: statusChip(s),
        actions: [ui.btn('Room details', { sm: true, icon: 'edit', key: 'e', onclick: function () { editRoom(room); } })] }),
      h('section.add-device', null,
        ID.captureButton({ key: 'room-add-' + room.id, lg: true, block: true, label: '+ ADD DEVICE — photograph it', id: 'room-add-device',
          room: function () { return store.get('rooms', room.id); }, after: function (cap) { ID.open({ capture: cap.id }); } }),
        h('div.btn-row.wrap', null,
          ID.captureButton({ key: 'room-up-' + room.id, library: true, kind: 'secondary', label: 'Upload photographs', room: function () { return store.get('rooms', room.id); }, after: function (cap) { ID.open({ capture: cap.id }); } }),
          ui.btn('Enter manually', { icon: 'edit', id: 'room-manual', onclick: function () { ID.open({ room: room }); } }))),
      toList.length && !store.readOnly ? ui.note('info', 'The room details name equipment that is not in the inventory yet: ' + toList.map(function (i) { return (i.create > 1 ? i.create + ' × ' : '') + i.text; }).join('; ') + '.',
        { key: 'tolist', title: 'Listed in the room details', action: h('div.btn-row', null, ui.btn('Add as listed devices', { sm: true, kind: 'primary', icon: 'list', id: 'room-list-go', onclick: function () { const n = I.createListed(room); EV.toast(U.plural(n, 'device') + ' listed', 'ok'); } })) }) : null,
      listed.length ? h('section.stack', null,
        ui.label('Listed — not yet seen', h('span.count', null, String(listed.length))),
        h('p.muted', null, 'Known from the room details. Photograph each one to confirm it, or mark it as not in the room.'),
        h('div.list', null, listed.map(function (d) { return listedRow(room, d); }))) : null,
      pend.length ? h('section.stack', null,
        ui.label('Awaiting review', h('span.count', null, String(pend.length))),
        h('div.list', null, pend.map(function (c) { return EV.captureRow(c); }))) : null,
      h('section.stack', null,
        ui.label('Devices in this room', h('span.count', null, String(devs.length))),
        devs.length ? h('div.asset-list', null, devs.map(function (d) { return EV.assetRow(d); }))
          : ui.empty({ icon: 'camera', title: 'No devices recorded yet', text: 'Tap “Add device” and photograph the first one: front, then its label.' })),
      h('section.stack', { id: 'room-details' },
        ui.label('Room details', ui.btn('Edit', { sm: true, kind: 'ghost', icon: 'edit', onclick: function () { editRoom(room); } })),
        h('div.kv-list', null,
          ui.kv('Building', b.name), ui.kv('Floor', f.number ? 'Floor ' + f.number + (f.designation ? ' — ' + f.designation : '') : ''),
          ui.kv('Room number', room.number), ui.kv('Room name', room.name), ui.kv('Department / business unit', room.department),
          room.notes ? ui.kv('Notes', room.notes) : null,
          ui.kv('Inventory status', I.roomStatusLabel(s)),
          ui.kv('Last inventory activity', last ? U.fmtDateTime(last) : ''),
          room.inventory_completed_at ? ui.kv('Marked complete', U.fmtDateTime(room.inventory_completed_at) + (room.inventory_completed_by ? ' · ' + room.inventory_completed_by : '')) : null),
        roomPhotoBlock(room, 'page')),
      h('div.room-actions', null,
        s === 'complete'
          ? ui.btn('Reopen room inventory', { icon: 'undo', id: 'room-reopen', onclick: function () { store.update('rooms', room.id, { inventory_status: 'in_progress', inventory_completed_at: null, inventory_completed_by: '' }); } })
          : ui.btn('Mark room inventory complete', { kind: 'primary', icon: 'check', id: 'room-complete', onclick: function () {
            const open = [pend.length ? U.plural(pend.length, 'capture') + ' not yet confirmed (they stay under Identify Devices)' : '', listed.length ? U.plural(listed.length, 'listed device') + ' neither seen nor marked not found' : ''].filter(Boolean);
            const ask = open.length ? ui.confirm({ title: 'Mark complete with work still open?', message: 'This room has ' + open.join(' and ') + '.', confirm: 'Mark complete' }) : Promise.resolve(true);
            return ask.then(function (ok) {
              if (!ok) return;
              store.update('rooms', room.id, { inventory_status: 'complete', inventory_completed_at: U.now(), inventory_completed_by: store.actor() });
              EV.toast(R.roomLabel(room) + ' inventory complete', 'ok');
            });
          } }),
        nx ? ui.btn('Next room: ' + R.roomLabel(nx), { iconRight: 'arrow-right', kind: s === 'complete' ? 'primary' : 'secondary', id: 'room-next', onclick: function () { EV.go('/rooms/room/' + nx.id); } }) : null)
    ];
  };
})();
