/* pages/environment.js — Organization → Building → Floor → Area → Room / Space → Rack hierarchy. */
(function () {
  'use strict';
  const EV = window.EV, h = EV.h, U = EV.U, S = EV.S, store = EV.store, ui = EV.ui, icon = EV.icon, R = EV.rules, A = EV.act;
  const st = { archived: false };

  /* ------------------------------------------------------------------ editors */
  function archiveToggle(table, rec, label) {
    return h('div.form-group', { key: 'arch' },
      h('div.form-group-title', null, 'Lifecycle'),
      ui.field(rec.archived ? 'Archived — hidden from active lists' : 'Active', ui.toggle(!rec.archived, { onchange: function (on) { store.update(table, rec.id, { archived: !on }); } }),
        { div: true, cls: 'field-toggle', hint: 'Archiving keeps the ' + label + ' and its history but removes it from active lists and progress counts.' }));
  }
  EV.editors.building = function (id, isNew) {
    return ui.openEditor({ table: 'buildings', id: id, isNew: isNew, fields: S.F.building, title: isNew ? 'New building' : 'Edit building',
      canDelete: !store.by('floors', 'building_id', id).length, after: function (r) { return isNew ? null : archiveToggle('buildings', r, 'building'); } });
  };
  EV.editors.newBuilding = function () {
    const b = store.create('buildings', { name: '', address: '', identifier: '', floors_count: null, site_contact: '', notes: '', archived: false });
    return EV.editors.building(b.id, true);
  };
  /* a floor is listed in the order of its number; a non-numeric designation ("Mezzanine") goes after the numbered ones */
  function floorOrder(r, k, v, patch) {
    if (k !== 'number') return;
    const num = parseFloat(v);
    patch.sort_order = isNaN(num) ? 1000 + store.by('floors', 'building_id', r.building_id).length : num;
  }
  EV.editors.floor = function (id, isNew) {
    /* a floor can be deleted only while nothing is recorded on it; otherwise it is archived */
    const empty = !store.by('rooms', 'floor_id', id).length && !store.by('devices', 'floor_id', id).length && !store.by('audits', 'floor_id', id).length;
    return ui.openEditor({ table: 'floors', id: id, isNew: isNew, fields: S.F.floor, title: isNew ? 'New floor' : 'Edit floor', onSet: floorOrder,
      canDelete: empty, onDeleted: function () { EV.go('/environment', { replace: true }); },
      after: function (r) { return isNew ? null : [archiveToggle('floors', r, 'floor'), empty ? null : h('p.muted', { key: 'why' }, 'This floor has rooms, devices or audits recorded and can be archived but not deleted.')]; } });
  };
  EV.editors.newFloor = function (building) {
    const f = store.create('floors', { building_id: building.id, number: '', designation: '', infrastructure_notes: '', audit_status_override: '', sort_order: null, archived: false, is_demo: false });
    return ui.openEditor({ table: 'floors', id: f.id, isNew: true, fields: S.F.floor, title: 'New floor — ' + building.name, onSet: floorOrder });
  };
  EV.editors.area = function (id, isNew) {
    return ui.openEditor({ table: 'areas', id: id, isNew: isNew, fields: S.F.area, title: isNew ? 'New area' : 'Edit area', size: 'auto',
      after: function (r) {
        if (isNew) return null;
        const n = store.by('rooms', 'area_id', r.id).length;
        return [archiveToggle('areas', r, 'area'), n ? h('p.muted', { key: 'n' }, U.plural(n, 'room') + ' in this area. If the area is deleted they stay on the floor, with no area assigned.') : null];
      },
      /* the rooms of a deleted area stay on the floor, simply without an area */
      onDeleted: function () { store.by('rooms', 'area_id', id).forEach(function (r) { store.update('rooms', r.id, { area_id: null }, { silent: true }); }); } });
  };
  EV.editors.room = function (id, isNew) {
    return ui.openEditor({ table: 'rooms', id: id, isNew: isNew, fields: S.F.room, title: isNew ? 'New room / space' : 'Edit room',
      sub: function (r) { return r ? r.code + ' — permanent identifier' : ''; },
      canDelete: (function () { const d = A.roomDependents(id); return !d.audits && !d.devices && !d.photos && !d.findings; })(),
      onDeleted: function () { EV.back('/environment'); },
      after: function (r) {
        if (isNew) return null;
        const d = A.roomDependents(r.id);
        return [archiveToggle('rooms', r, 'room'),
          (d.audits || d.devices || d.photos || d.findings) ? h('p.muted', { key: 'why' }, 'This room has ' + [d.audits ? U.plural(d.audits, 'audit') : '', d.devices ? U.plural(d.devices, 'device') : '',
            d.photos ? U.plural(d.photos, 'photograph') : '', d.findings ? U.plural(d.findings, 'finding') : ''].filter(Boolean).join(', ') + ' and can be archived but not deleted.') : null];
      } });
  };
  EV.editors.newRoom = function (floor) {
    const r = A.addRoom(floor);
    return EV.editors.room(r.id, true);
  };
  EV.editors.rack = function (id, isNew) {
    return ui.openEditor({ table: 'racks', id: id, isNew: isNew, fields: S.F.rack, title: isNew ? 'New rack' : 'Edit rack', size: 'auto',
      after: function (r) { return isNew ? null : archiveToggle('racks', r, 'rack'); },
      /* devices that were in a deleted rack stay in the room, with no rack recorded */
      onDeleted: function () { store.by('devices', 'rack_id', id).forEach(function (d) { store.update('devices', d.id, { rack_id: null }, { silent: true }); }); } });
  };
  EV.editors.configuration = function (id, isNew) {
    const audited = store.by('audits', 'configuration_id', id).length;
    return ui.openEditor({ table: 'room_configurations', id: id, isNew: isNew, fields: S.F.configuration, title: isNew ? 'New combined configuration' : 'Edit combined configuration',
      canDelete: !audited,
      after: function (c) {
        const members = store.by('room_configuration_members', 'configuration_id', c.id);
        const rooms = R.floorRooms(c.floor_id).filter(R.isConference);
        return [isNew ? null : archiveToggle('room_configurations', c, 'configuration'),
          audited && !isNew ? h('p.muted', { key: 'why' }, 'This configuration has ' + U.plural(audited, 'audit') + ' and can be archived but not deleted.') : null,
          h('div.form-group', { key: 'members' },
          h('div.form-group-title', null, 'Member spaces'),
          h('p.muted', null, 'Each member space stays auditable on its own; this configuration is audited as the combined room.'),
          h('div.list', null, rooms.map(function (r) {
            const m = members.find(function (x) { return x.room_id === r.id; });
            return h('div.row', { key: r.id },
              h('span.row-main', null, h('span.row-title', null, R.roomLabel(r)), h('span.row-sub', null, r.room_type)),
              ui.toggle(!!m, { onchange: function (on) {
                if (on && !m) store.create('room_configuration_members', { id: U.keyId('config-member', c.id + ':' + r.id), configuration_id: c.id, room_id: r.id, is_demo: !!c.is_demo });
                if (!on && m) store.remove('room_configuration_members', m.id);
              } }));
          })))];
      } });
  };

  /* ------------------------------------------------------------------ Buildings & Floors */
  EV.pages.environment = function () {
    const all = U.sortBy(store.all('buildings'), function (b) { return b.name; });
    const buildings = all.filter(function (b) { return st.archived || !b.archived; });
    /* everything archived on this screen (buildings and floors) must be revealable, or it could never be restored */
    const hiddenBuildings = all.filter(function (b) { return b.archived; }).length;
    const hiddenFloors = store.all('floors').filter(function (f) { return f.archived; }).length;
    const hiddenCount = hiddenBuildings + hiddenFloors;
    return [
      ui.head({ eyebrow: (store.kvGet('org_name') || 'Organization') + ' · environment', title: 'Buildings & Floors', sub: 'Organization → building → floor → area → room → rack → device',
        actions: [ui.btn('Import room list', { key: 'i', icon: 'upload', id: 'room-import-open', onclick: function () { EV.roomImport.open(); } }),
          ui.btn('Add building', { key: 'a', kind: 'primary', icon: 'plus', onclick: EV.editors.newBuilding })] }),
      !buildings.length ? ui.empty({ icon: 'building', title: 'No buildings yet', text: 'Create the first building, then add its floors and rooms — or import a room list (CSV) to create them all at once.' }) : null,
      buildings.map(function (b) {
        const floors = U.sortBy(store.by('floors', 'building_id', b.id).filter(function (f) { return st.archived || !f.archived; }), function (f) { return f.sort_order != null ? U.pad(f.sort_order, 6) : f.number; });
        let total = 0, audited = 0;
        floors.forEach(function (f) { const fp = R.floorProgress(f.id); total += fp.total; audited += fp.audited; });
        return h('section.card.card-pad', { key: b.id },
          h('div.card-head', null,
            h('div.stack', { style: 'gap:3px' },
              h('h2.h2', null, b.name || 'Unnamed building', ui.demo(b), b.archived ? ui.chip('Archived', 'muted') : null),
              h('div.page-sub', null, [b.address, b.identifier].filter(Boolean).join(' · ') || 'No address recorded')),
            ui.iconBtn('edit', { title: 'Edit building', onclick: function () { EV.editors.building(b.id); } })),
          h('div.meta-line', null,
            h('span', null, icon('layers', 14), ' ', U.plural(floors.length, 'floor') + (b.floors_count ? ' recorded of ' + b.floors_count : '')),
            h('span', null, icon('grid', 14), ' ', audited + ' of ' + U.plural(total, 'space') + ' audited'),
            b.site_contact ? h('span', null, icon('user', 14), ' ', b.site_contact) : null),
          b.notes ? h('p.muted', null, b.notes) : null,
          floors.length ? h('div.list', null, floors.map(function (f) {
            const fp = R.floorProgress(f.id);
            return ui.row({ key: f.id, title: ['Floor ' + f.number, f.archived ? ui.chip('Archived', 'muted') : null], sub: [f.designation, EV.floorCounts(fp)].filter(Boolean).join(' — '),
              below: EV.floorBar(fp), right: ui.chip(f.audit_status_override || fp.label, fp.label === 'Complete' ? 'ok' : fp.label === 'In progress' ? 'warn' : 'muted'),
              onclick: function () { EV.go('/floor/' + f.id); } });
          })) : h('p.muted', null, 'No floors yet.'),
          h('div.btn-row', null, ui.btn('Add floor', { sm: true, icon: 'plus', onclick: function () { EV.editors.newFloor(b); } })));
      }),
      hiddenCount || st.archived ? h('div.btn-row', null, ui.btn(st.archived ? 'Hide archived' : 'Show archived (' + [hiddenBuildings ? U.plural(hiddenBuildings, 'building') : '', hiddenFloors ? U.plural(hiddenFloors, 'floor') : ''].filter(Boolean).join(', ') + ')',
        { kind: 'ghost', sm: true, icon: 'archive', onclick: function () { st.archived = !st.archived; } })) : null
    ];
  };

  /* ------------------------------------------------------------------ Floor */
  EV.pages.floor = function (r) {
    const f = store.get('floors', r.id);
    if (!f) return [ui.head({ title: 'Floor not found', back: '/environment' }), ui.empty({ icon: 'layers', title: 'This floor no longer exists.' })];
    const b = store.get('buildings', f.building_id) || {};
    const fp = R.floorProgress(f.id);
    const rooms = U.sortBy(store.by('rooms', 'floor_id', f.id).filter(function (x) { return st.archived || !x.archived; }), function (x) { return x.number || x.name; });
    const areas = U.sortBy(store.by('areas', 'floor_id', f.id).filter(function (a) { return st.archived || !a.archived; }), function (a) { return a.name; });
    const configs = store.by('room_configurations', 'floor_id', f.id).filter(function (c) { return st.archived || !c.archived; });
    /* a room whose area is archived, deleted or otherwise not listed is shown under "no area", never dropped */
    const areaIds = new Set(areas.map(function (a) { return a.id; }));
    const groups = U.groupBy(rooms, function (x) { return areaIds.has(x.area_id) ? x.area_id : ''; });
    const order = areas.map(function (a) { return a.id; }).filter(function (id) { return groups.has(id); });
    if (groups.has('')) order.push('');
    const archivedHere = store.by('rooms', 'floor_id', f.id).filter(function (x) { return x.archived; }).length +
      store.by('areas', 'floor_id', f.id).filter(function (x) { return x.archived; }).length + store.by('room_configurations', 'floor_id', f.id).filter(function (x) { return x.archived; }).length;
    return [
      ui.head({ back: '/environment', eyebrow: b.name, title: ['Floor ' + f.number, ui.demo(f), f.archived ? ui.chip('Archived', 'muted') : null], sub: f.designation,
        actions: [ui.btn('Edit', { sm: true, icon: 'edit', key: 'e', onclick: function () { EV.editors.floor(f.id); } }),
          ui.btn('Add room', { kind: 'primary', sm: true, icon: 'plus', key: 'a', onclick: function () { EV.editors.newRoom(f); } })] }),
      ui.card({ key: 'prog' },
        h('div.card-head', null, h('div.card-title', null, 'Audit status'), ui.chip(f.audit_status_override || fp.label, fp.label === 'Complete' ? 'ok' : fp.label === 'In progress' ? 'warn' : 'muted')),
        EV.floorBar(fp),
        h('div.floor-counts', null, EV.floorCounts(fp))),
      f.infrastructure_notes ? ui.card({ key: 'infra', title: 'Floor-level infrastructure notes' }, h('p.prose', null, f.infrastructure_notes)) : null,
      h('section.stack', null,
        ui.label('Spaces', h('span.count', null, String(rooms.length))),
        rooms.length ? order.map(function (aid) {
          const area = store.get('areas', aid);
          return h('div.stack', { key: 'area' + aid, style: 'gap:6px' },
            h('div.subhead', null, area ? area.name : (areas.length ? 'No area assigned' : 'All spaces'), area && area.description ? h('span.muted', null, ' — ' + area.description) : null),
            h('div.list', null, groups.get(aid).map(function (x) {
              const rs = R.roomState(x.id);
              const devs = R.roomDevices(x.id);
              return ui.row({ key: x.id, title: [R.roomLabel(x), ui.demo(x), x.archived ? ui.chip('Archived', 'muted') : null],
                sub: [x.room_type, x.capacity ? x.capacity + ' seats' : '', U.plural(devs.length, 'device')].filter(Boolean).join(' · '),
                right: ui.auditChip(rs.state), onclick: function () { EV.go('/room/' + x.id); } });
            })));
        }) : ui.empty({ icon: 'grid', title: 'No rooms on this floor yet', text: 'Add conference rooms, rack rooms and support areas.',
          action: ui.btn('Add room', { kind: 'primary', icon: 'plus', onclick: function () { EV.editors.newRoom(f); } }) })),
      h('section.stack', null,
        ui.label('Combined configurations (divisible rooms)', ui.btn('Add', { sm: true, kind: 'ghost', icon: 'plus', onclick: function () {
          const c = store.create('room_configurations', { building_id: f.building_id, floor_id: f.id, name: '', description: '', capacity: null, notes: '', archived: false });
          EV.editors.configuration(c.id, true);
        } })),
        configs.length ? h('div.list', null, configs.map(function (c) {
          const members = store.by('room_configuration_members', 'configuration_id', c.id).map(function (m) { return store.get('rooms', m.room_id); }).filter(Boolean);
          const cs = R.configState(c.id);
          return h('div.row', { key: c.id },
            h('span.row-left', null, icon('layers', 18)),
            h('span.row-main', null, h('span.row-title', null, c.name || 'Unnamed configuration', ui.demo(c), c.archived ? ui.chip('Archived', 'muted') : null),
              h('span.row-sub', null, members.length ? members.map(function (m) { return m.number || m.name; }).join(' + ') : 'No member spaces selected'), ui.auditChip(cs.state)),
            h('span.row-right', null,
              ui.btn(cs.state === 'in_progress' ? 'Resume' : 'Audit', { sm: true, onclick: function () { const a = A.resumeOrStart({ config: c }); EV.go('/audit/' + a.id); }, disabled: members.length < 2 || !!c.archived }),
              ui.iconBtn('edit', { title: 'Edit configuration', onclick: function () { EV.editors.configuration(c.id); } })));
        })) : h('p.muted', null, 'None. Add one when two or more rooms can be combined; each room stays auditable on its own.')),
      h('section.stack', null,
        ui.label('Areas', ui.btn('Add', { sm: true, kind: 'ghost', icon: 'plus', onclick: function () {
          const a = store.create('areas', { building_id: f.building_id, floor_id: f.id, name: '', description: '', archived: false });
          EV.editors.area(a.id, true);
        } })),
        areas.length ? h('div.list', null, areas.map(function (a) {
          return ui.row({ key: a.id, title: [a.name, a.archived ? ui.chip('Archived', 'muted') : null], sub: a.description, right: h('span.count', null, U.plural((groups.get(a.id) || []).length, 'space')), onclick: function () { EV.editors.area(a.id); } });
        })) : h('p.muted', null, 'No areas defined. Areas group rooms within a floor (for example “East wing”).')),
      archivedHere || st.archived ? h('div.btn-row', null, ui.btn(st.archived ? 'Hide archived' : 'Show archived on this floor (' + archivedHere + ')', { kind: 'ghost', sm: true, icon: 'archive', onclick: function () { st.archived = !st.archived; } })) : null
    ];
  };

  /* ------------------------------------------------------------------ Room */
  EV.pages.room = function (r) {
    const room = store.get('rooms', r.id);
    if (!room) return [ui.head({ title: 'Room not found', back: '/environment' }), ui.empty({ icon: 'grid', title: 'This room no longer exists.' })];
    const f = store.get('floors', room.floor_id) || {};
    const b = store.get('buildings', room.building_id) || {};
    const area = store.get('areas', room.area_id);
    const rs = R.roomState(room.id);
    const audits = U.sortBy(store.by('audits', 'room_id', room.id), function (a) { return a.started_at || a.created_at; }, true);
    const devs = U.sortBy(R.roomDevices(room.id), function (d) { return d.category + ' ' + d.hostname; });
    const racks = store.by('racks', 'room_id', room.id).filter(function (k) { return st.archived || !k.archived; });
    const photos = EV.photos.forRoom(room.id);
    /* what is listed is what is counted: findings still awaiting triage, and every backlog item that affects this room
       (directly, or through a finding recorded here) */
    const findings = store.by('findings', 'room_id', room.id).filter(function (x) { return x.status === 'open'; });
    const backlog = store.all('backlog_items').filter(function (x) { return R.backlogRooms(x).some(function (rm) { return rm.id === room.id; }); });
    const configs = store.by('room_configuration_members', 'room_id', room.id).map(function (m) { return store.get('room_configurations', m.configuration_id); }).filter(Boolean);
    const crit = R.criticality(room);
    const open = rs.state === 'in_progress' ? rs.audit : null;
    return [
      ui.head({ back: '/floor/' + room.floor_id, eyebrow: [b.name, f.number ? 'Floor ' + f.number : '', area ? area.name : ''].filter(Boolean).join(' · '),
        title: [R.roomLabel(room), ui.demo(room)], sub: h('span', null, h('span.mono', null, room.code), ' · ', room.room_type, room.capacity ? ' · ' + room.capacity + ' seats' : ''),
        actions: [ui.btn('Edit', { sm: true, icon: 'edit', key: 'e', onclick: function () { EV.editors.room(room.id); } })] }),
      h('div.btn-row.wrap', null,
        ui.btn(open ? 'Resume audit' : audits.length ? 'Start a new audit' : 'Start audit', { kind: 'primary', lg: true, icon: open ? 'play' : 'clipboard', cls: 'grow',
          onclick: function () { const a = A.resumeOrStart({ room: room }); EV.go('/audit/' + a.id); } })),
      h('div.chips', null, ui.auditChip(rs.state), ui.chip(room.operational_status || 'Status not recorded', ui.tone.op(room.operational_status)),
        crit === 'critical' ? ui.chip('Executive / critical', 'danger') : crit === 'high' ? ui.chip('High visibility', 'warn') : null,
        room.archived ? ui.chip('Archived', 'muted') : null,
        configs.map(function (c) { return ui.chip('Part of ' + c.name, 'accent', { key: c.id, icon: 'layers' }); })),
      h('div.split', null,
        h('div.stack.stack-lg', null,
          h('section.stack', null,
            ui.label('Space summary'),
            h('div.kv-list', null,
              ui.kv('Primary conferencing platform', room.conferencing_platform), ui.kv('AV control platform', room.control_platform), ui.kv('DSP platform', room.dsp_platform),
              ui.kv('Display configuration', room.display_config), ui.kv('Camera configuration', room.camera_config), ui.kv('Microphone configuration', room.microphone_config),
              ui.kv('Room scheduling platform', room.scheduling_platform), room.notes ? ui.kv('Notes', room.notes) : null)),
          h('section.stack', null,
            ui.label('Devices', h('span.label-actions', null, h('span.count', null, String(devs.length)), ui.btn('Add', { sm: true, kind: 'ghost', icon: 'plus', onclick: function () { EV.editors.newDevice({ room: room, audit: open }); } }))),
            devs.length ? h('div.list', null, devs.map(function (d) { return EV.deviceRow(d); })) : h('p.muted', null, 'No devices recorded for this room.')),
          h('section.stack', null,
            ui.label('Photographs', h('span.label-actions', null, h('span.count', null, String(photos.length)),
              EV.photos.captureButton({ key: 'room-cam-' + room.id, sm: true, kind: 'ghost', label: 'Camera', ctx: function () { return { room: room, audit: open, category: 'Room overview' }; } }),
              EV.photos.captureButton({ key: 'room-lib-' + room.id, sm: true, kind: 'ghost', label: 'Upload', library: true, ctx: function () { return { room: room, audit: open, category: 'Other' }; } }))),
            EV.photos.gallery(st.allPhotos === room.id ? photos : photos.slice(0, 21), { emptyTitle: 'No photographs for this room yet' }),
            photos.length > 21 ? h('div.btn-row', null, ui.btn(st.allPhotos === room.id ? 'Show fewer' : 'Show all ' + photos.length + ' photographs', { sm: true, kind: 'ghost', onclick: function () { st.allPhotos = st.allPhotos === room.id ? null : room.id; } })) : null)),
        h('div.stack.stack-lg', null,
          h('section.stack', null,
            ui.label('Audit history', h('span.count', null, String(audits.length))),
            audits.length ? h('div.list', null, audits.map(function (a) {
              const p = R.auditProgress(a.id);
              return ui.row({ key: a.id, title: [U.fmtDate(a.audit_date), h('span.mono.muted', null, a.code)], sub: (a.auditor || 'Auditor') + ' · ' + p.overall + '% · ' + p.tests.fail + ' failed, ' + p.tests.investigate + ' to investigate',
                right: R.auditLapsed(a) ? ui.chip('Verification lapsed', 'danger') : ui.chip(S.label(S.AUDIT_STATUS, a.status), a.status === 'verified' ? 'accent' : a.status === 'complete' ? 'ok' : 'warn'), onclick: function () { EV.go('/audit/' + a.id); } });
            })) : h('p.muted', null, 'This room has not been audited yet.')),
          h('section.stack', null,
            ui.label('Findings and backlog', h('span.count', null, String(findings.length + backlog.length))),
            backlog.length || findings.length ? h('div.list', null,
              backlog.map(function (x) { return EV.backlogRow(x); }),
              findings.map(function (x) { return EV.findingRow(x); })) : h('p.muted', null, 'Nothing recorded for this room.')),
          h('section.stack', null,
            ui.label('Racks', ui.btn('Add', { sm: true, kind: 'ghost', icon: 'plus', onclick: function () {
              const k = store.create('racks', { building_id: room.building_id, floor_id: room.floor_id, room_id: room.id, name: '', location: '', height_ru: null, notes: '', archived: false });
              EV.editors.rack(k.id, true);
            } })),
            racks.length ? h('div.list', null, racks.map(function (k) {
              const n = store.by('devices', 'rack_id', k.id).length;
              return ui.row({ key: k.id, left: icon('server', 18), title: k.name, sub: [k.location, k.height_ru ? k.height_ru + ' RU' : '', U.plural(n, 'device')].filter(Boolean).join(' · '), onclick: function () { EV.editors.rack(k.id); } });
            })) : h('p.muted', null, 'No racks recorded.'))))
    ];
  };
})();
