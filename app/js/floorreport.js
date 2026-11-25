/* floorreport.js — the floor audit report: one shareable document per floor that tells what was recorded there, room by
 * room — the room and its photographs, every device with every value recorded about it and its own photographs, the
 * room's punch list — then the whole floor's punch list. Built only from the records on this device.
 * Nothing is inferred: a value that was not recorded is shown as "Not recorded"; a field the application does not have is
 * named in the report notes; a photograph whose image file cannot be loaded is named, never replaced by another one.
 * One model (FR.build), three renderers: the on-screen preview (FR.view), a PDF (FR.pdf) and a self-contained web page
 * (FR.html). The preview and the web page share one body (FR.body) written against an h()-style builder. */
(function () {
  'use strict';
  const EV = window.EV, h = EV.h, U = EV.U, S = EV.S, store = EV.store, R = EV.rules, P = EV.photos;
  const FR = (EV.floorReport = {});
  const NR = (FR.NOT_RECORDED = 'Not recorded');
  FR.TITLE = 'AV Environment Audit';
  FR.PRODUCT = 'AV Environment Intelligence (EAVI)';
  FR.POC = 'Proof of Concept';
  FR.NO_PUNCH = 'No punchlist items currently recorded for this room.';
  /* image renditions: the long edge in pixels and the JPEG quality. Standard keeps a whole floor small enough to e-mail;
     high keeps more detail for zooming in. Originals are never changed. */
  FR.QUALITY = { standard: { edge: 1280, q: 0.8, label: 'Standard (smaller file)' }, high: { edge: 2048, q: 0.86, label: 'High (larger file)' } };
  FR.WHAT = 'Each room on the floor was visited and its AV equipment photographed and recorded in EAVI: device category, ' +
    'manufacturer and model, serial number, MAC address, IP address and switch port, each with how it was verified, together ' +
    'with photographs of the room and of each device, and a punch list of what needs to be put right in the room and who is ' +
    'to resolve it. This report is generated directly from those records. Nothing in it is inferred: a value that was not ' +
    'recorded is shown as “Not recorded”.';

  /* ------------------------------------------------------------------ device fields
   * Every column of a device record, in the order and the words the report uses. core: always shown, as "Not recorded"
   * when empty. status: the column holding the value's verification status. ref: another record, shown by its name.
   * Columns listed in DEVICE_STRUCTURAL place the record (its building, floor and room are the report's sections) or
   * are shown together with another field. Any other column — one added after this was written — is still shown,
   * under "Other recorded fields", so no stored value is ever left out. */
  FR.DEVICE_GROUPS = [
    ['Identification', [
      { k: 'code', label: 'Asset ID', core: true, mono: true },
      { k: 'category', label: 'Device category / type', core: true },
      { k: 'custom_category', label: 'Custom device type' },
      { k: 'role', label: 'Role in the room' },
      { k: 'manufacturer', label: 'Manufacturer', core: true },
      { k: 'make', label: 'Make' },
      { k: 'model', label: 'Model number', core: true },
      { k: 'product_family', label: 'Product family' },
      { k: 'serial_number', label: 'Serial number', core: true, mono: true, status: 'serial_status' },
      { k: 'asset_tag', label: 'Asset tag', core: true, mono: true }
    ]],
    ['Network', [
      { k: 'hostname', label: 'Hostname', core: true, mono: true },
      { k: 'ip_address', label: 'IP address', core: true, mono: true, status: 'ip_status' },
      { k: 'mac_address', label: 'MAC address', core: true, mono: true, status: 'mac_status' },
      { k: 'vlan', label: 'Network / VLAN', core: true },
      { k: 'subnet', label: 'Subnet', mono: true },
      { k: 'ip_assignment', label: 'Address assignment' },
      { k: 'dns_name', label: 'DNS name', mono: true },
      { k: 'switch_asset_id', label: 'Connected switch (infrastructure record)', ref: 'infra_assets' },
      { k: 'connected_switch', label: 'Connected switch' },
      { k: 'switch_port', label: 'Switch port ID', core: true, mono: true, status: 'port_status' },
      { k: 'connection_type', label: 'Connection type', core: true },
      { k: 'management_url', label: 'Management URL', mono: true },
      { k: 'monitoring_portal', label: 'Monitoring portal' }
    ]],
    ['Location', [
      { k: 'rack_id', label: 'Rack', ref: 'racks' },
      { k: 'rack_location', label: 'Location in the room / rack position', core: true }
    ]],
    ['Power', [
      { k: 'poe_required', label: 'PoE required' },
      { k: 'poe_class', label: 'PoE class' },
      { k: 'power_source', label: 'Power source' }
    ]],
    ['Configuration', [
      { k: 'firmware_version', label: 'Firmware version', core: true, mono: true },
      { k: 'app_version', label: 'Application version', mono: true }
    ]],
    ['Lifecycle', [
      { k: 'warranty_info', label: 'Warranty' },
      { k: 'support_expiration', label: 'Support expiration' }
    ]],
    ['Record', [
      { k: 'presence', label: 'Presence', always: true },
      { k: 'listed_text', label: 'Listed in the room details as' },
      { k: 'identity_confirmed_at', label: 'Identity confirmed', by: 'identity_confirmed_by' },
      { k: 'last_verified_at', label: 'Last verified' },
      { k: 'manual_review', label: 'Flagged for manual review' },
      { k: 'field_sources', label: 'Where the values came from' },
      { k: 'ai_identification_id', label: 'AI identification record', ref: 'asset_identifications' },
      { k: 'audit_id', label: 'Recorded during audit', ref: 'audits' },
      { k: 'main_photo_id', label: 'Room list picture', ref: 'photos' },
      { k: 'merged_into', label: 'Merged into', ref: 'devices' },
      { k: 'distinct_from', label: 'Confirmed as a different device from' },
      { k: 'exported_at', label: 'Last exported' },
      { k: 'export_code', label: 'Export ID', mono: true },
      { k: 'created_at', label: 'Recorded', by: 'created_by' },
      { k: 'updated_at', label: 'Last changed', by: 'updated_by' }
    ]],
    ['Notes', [
      { k: 'notes', label: 'Notes', core: true, long: true }
    ]]
  ];
  FR.DEVICE_STRUCTURAL = ['id', 'org_id', 'building_id', 'floor_id', 'room_id', 'deleted_at', 'archived', 'is_demo', 'export_sig',
    'ip_status', 'mac_status', 'serial_status', 'port_status', 'identity_confirmed_by', 'created_by', 'updated_by'];
  FR.ROOM_FIELDS = [
    { k: 'number', label: 'Room number', core: true, mono: true },
    { k: 'name', label: 'Room name', core: true },
    { k: 'code', label: 'Room ID', mono: true },
    { k: 'room_type', label: 'Room type', core: true },
    { k: 'capacity', label: 'Capacity' },
    { k: 'criticality', label: 'Business criticality', list: S.CRITICALITY },
    { k: 'area_id', label: 'Area', ref: 'areas' },
    { k: 'department', label: 'Department / business unit' },
    { k: 'conferencing_platform', label: 'Conferencing platform' },
    { k: 'control_platform', label: 'Control platform' },
    { k: 'dsp_platform', label: 'DSP platform' },
    { k: 'scheduling_platform', label: 'Scheduling platform' },
    { k: 'display_config', label: 'Display configuration', long: true },
    { k: 'camera_config', label: 'Camera configuration', long: true },
    { k: 'microphone_config', label: 'Microphone configuration', long: true },
    { k: 'operational_status', label: 'Operational status' },
    { k: 'inventory_status', label: 'Inventory status', always: true },
    { k: 'inventory_completed_at', label: 'Inventory completed', by: 'inventory_completed_by', event: true },
    { k: 'created_at', label: 'Room record created', by: 'created_by' },
    { k: 'updated_at', label: 'Room record last changed', by: 'updated_by' },
    { k: 'notes', label: 'Room notes', core: true, long: true }
  ];
  FR.ROOM_STRUCTURAL = ['id', 'org_id', 'building_id', 'floor_id', 'deleted_at', 'archived', 'is_demo', 'inventory_completed_by', 'created_by', 'updated_by'];

  /* ------------------------------------------------------------------ value formatting */
  function colOf(table, k) { return S.T[table].columns.find(function (c) { return c.name === k; }) || { name: k, type: /_at$/.test(k) ? 'ts' : 'text' }; }
  function humanize(k) { const s = String(k).replace(/_id$/, '').replace(/_/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1); }
  function refText(table, id) {
    const r = store.getAny(table, id);
    if (!r) return 'Referenced record not found';
    if (r.deleted_at) return (r.code || S.title(table, r)) + ' (deleted)';
    switch (table) {
      case 'devices': return r.code + ' — ' + R.deviceLabel(r);
      case 'racks': return [r.name || 'Rack', r.code].filter(Boolean).join(' · ') + (r.location ? ' · ' + r.location : '');
      case 'infra_assets': return [S.title('infra_assets', r), r.identifier && r.identifier !== r.name ? r.identifier : '', r.code].filter(Boolean).join(' · ');
      case 'audits': return [r.code, r.audit_date ? U.fmtDate(r.audit_date) : '', r.auditor].filter(Boolean).join(' · ');
      case 'asset_identifications': return [S.label(S.IDENTIFICATION_STATUS, r.status), r.provider ? 'by ' + r.provider : '', r.completed_at || r.requested_at ? U.fmtDateTime(r.completed_at || r.requested_at) : ''].filter(Boolean).join(' · ');
      case 'photos': return r.code || 'Photograph';
      default: return S.title(table, r);
    }
  }
  function byText(rec, by) { const who = by ? String(rec[by] || '').trim() : ''; return who ? ' by ' + who : ''; }
  /* label → { value, note, recorded } for one field of one record */
  function fieldValue(table, rec, f) {
    const v = rec[f.k];
    const col = colOf(table, f.k);
    if (table === 'devices' && f.k === 'presence') return { value: S.label(S.PRESENCE, v || ''), recorded: true };
    if (table === 'rooms' && f.k === 'inventory_status') return { value: EV.inv.roomStatusLabel(EV.inv.roomStatus(rec)), recorded: true };
    if (f.status) {
      const st = rec[f.status] || 'unknown';
      if (U.blank(v)) {
        if (st === 'unavailable' || st === 'not_applicable') return { value: S.label(S.ID_STATUS, st), recorded: true, stated: true };
        return { value: NR, recorded: false };
      }
      return { value: String(v).trim(), note: st === 'unknown' ? 'Captured — not verified' : S.label(S.ID_STATUS, st), recorded: true, verified: st === 'verified_onsite' || st === 'verified_mgmt' };
    }
    if (f.k === 'category' && table === 'devices') return U.blank(v) ? { value: NR, recorded: false } : { value: String(v), recorded: true };
    if (f.ref) return U.blank(v) ? { value: NR, recorded: false } : { value: refText(f.ref, v), recorded: true };
    if (f.list) return U.blank(v) ? { value: NR, recorded: false } : { value: S.label(f.list, v), recorded: true };
    if (f.k === 'field_sources') {
      const src = v && typeof v === 'object' ? v : {};
      const keys = Object.keys(src).filter(function (k) { return src[k]; });
      if (!keys.length) return { value: NR, recorded: false };
      return { value: keys.map(function (k) { return labelOfDeviceField(k) + ': ' + S.label(S.FIELD_SOURCES, src[k]); }).join('; '), recorded: true };
    }
    if (f.k === 'distinct_from') {
      const ids = Array.isArray(v) ? v.filter(Boolean) : [];
      if (!ids.length) return { value: NR, recorded: false };
      return { value: ids.map(function (id) { const d = store.getAny('devices', id); return d ? d.code : 'a record not on this device'; }).join(', '), recorded: true };
    }
    if (col.type === 'bool') return v === true ? { value: 'Yes', recorded: true } : { value: NR, recorded: false, flagOff: true };
    if (v == null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && !v.length)) return { value: NR, recorded: false };
    if (col.type === 'ts') return { value: U.fmtDateTime(v) + byText(rec, f.by), recorded: true };
    if (col.type === 'date') return { value: U.fmtDate(v), recorded: true };
    if (col.type === 'json') { let s = ''; try { s = JSON.stringify(v); } catch (e) { s = String(v); } return { value: s, recorded: true }; }
    return { value: String(v).trim(), recorded: true };
  }
  const deviceLabels = {};
  FR.DEVICE_GROUPS.forEach(function (g) { g[1].forEach(function (f) { deviceLabels[f.k] = f.label; }); });
  function labelOfDeviceField(k) { return deviceLabels[k] || humanize(k); }
  /* the columns of a table that the report shows as fields: the catalogue plus any column it does not know */
  function catalogue(table, groups, structural) {
    const known = {};
    groups.forEach(function (g) { g[1].forEach(function (f) { known[f.k] = 1; if (f.status) known[f.status] = 1; if (f.by) known[f.by] = 1; }); });
    structural.forEach(function (k) { known[k] = 1; });
    const extra = S.T[table].colNames.concat(S.COMMON_COLS).filter(function (k, i, a) { return !known[k] && a.indexOf(k) === i; })
      .map(function (k) { const c = colOf(table, k); return { k: k, label: humanize(k), ref: c.ref || null }; });
    return extra.length ? groups.concat([['Other recorded fields', extra]]) : groups;
  }
  FR.deviceCatalogue = function () { return catalogue('devices', FR.DEVICE_GROUPS, FR.DEVICE_STRUCTURAL); };
  /* The fields of a device as the report shows them: every recorded value and every core field (as "Not recorded");
     the other fields with no value are named in `missing`. */
  FR.deviceFields = function (d) {
    const shown = [], missing = [];
    FR.deviceCatalogue().forEach(function (g) {
      g[1].forEach(function (f) {
        const fv = fieldValue('devices', d, f);
        if (fv.recorded || f.core) shown.push({ group: g[0], k: f.k, label: f.label, value: fv.value, note: fv.note || '', recorded: fv.recorded, verified: !!fv.verified, mono: !!f.mono && fv.recorded && !fv.stated, long: !!f.long });
        /* the record group is the record's history (confirmed, merged, exported…): an event that has not happened is not a gap */
        else if (!fv.flagOff && g[0] !== 'Record') missing.push(f.label);
      });
    });
    const a = EV.inv.asset(d);
    let at = -1;
    shown.forEach(function (f, i) { if (f.group === 'Record') at = i; });
    shown.splice(at + 1, 0, { group: 'Record', k: '_status', label: 'Verification status (derived by EAVI)', value: EV.inv.statusLabel(a.status), recorded: true, derived: true });
    return { fields: shown, missing: missing };
  };
  FR.roomFields = function (room) {
    const shown = [], missing = [];
    catalogue('rooms', [['Room', FR.ROOM_FIELDS]], FR.ROOM_STRUCTURAL).forEach(function (g) {
      g[1].forEach(function (f) {
        const fv = fieldValue('rooms', room, f);
        if (fv.recorded || f.core || f.always) shown.push({ k: f.k, label: f.label, value: fv.value, recorded: fv.recorded, mono: !!f.mono && fv.recorded, long: !!f.long });
        else if (!fv.flagOff && !f.event) missing.push(f.label);
      });
    });
    return { fields: shown, missing: missing };
  };

  /* ------------------------------------------------------------------ the model */
  const CAT_ORDER = {};
  S.DEVICE_CATEGORIES.forEach(function (c, i) { CAT_ORDER[c] = i; });
  function photoEntry(p, o) {
    o = o || {};
    const cat = p.category || '';
    const desc = String(p.description || '').trim();
    return { id: p.id, code: p.code || '', category: cat, description: desc, caption: [cat, desc && desc !== cat ? desc : ''].filter(Boolean).join(' — ') || 'Photograph',
      taken: p.taken_at || p.created_at || '', main: !!o.main, owner: o.owner || '', width: p.width || 0, height: p.height || 0, demo: !!p.is_demo };
  }
  function oldestFirst(list) { return U.sortBy(list, function (p) { return (p.taken_at || p.created_at || '') + p.id; }); }
  function devicePhotos(d) {
    const list = P.forDevice(d.id);
    const main = P.mainFor(d);
    const rest = oldestFirst(list.filter(function (p) { return !main || p.id !== main.id; }));
    return (main ? [main] : []).concat(rest).map(function (p, i) { return photoEntry(p, { main: i === 0, owner: d.code }); });
  }
  function punchEntry(p, room) {
    const d = p.device_id ? store.getAny('devices', p.device_id) : null;
    return { id: p.id, code: p.code || '', text: p.text || '', open: p.status !== 'resolved', status: S.label(S.PUNCH_STATUS, p.status === 'resolved' ? 'resolved' : 'open'),
      resolver: p.resolver || '', party: EV.punch.partyLabel(p.resolver), device: d ? d.code + ' — ' + R.deviceLabel(d) : '', deviceCode: d ? d.code : '', deviceId: d ? d.id : '',
      notes: String(p.notes || '').trim(), added: p.created_at || '', addedBy: p.created_by || '', resolvedAt: p.resolved_at || '', resolvedBy: p.resolved_by || '',
      roomId: room.id, roomNumber: room.number || '', roomName: room.name || '', roomLabel: R.roomLabel(room) || 'Unnamed room' };
  }
  function idStats(devs) {
    let slots = 0, stated = 0, verified = 0;
    devs.forEach(function (d) {
      const a = EV.inv.asset(d);
      const keys = EV.inv.ID_FIELDS.map(function (f) { return f.k; }).concat(EV.inv.portRequired(d) ? ['switch_port'] : []);
      keys.forEach(function (k) { slots++; if (a.states[k] !== 'not_captured') stated++; if (a.states[k] === 'verified') verified++; });
    });
    return { slots: slots, stated: stated, verified: verified, pct: U.pct(stated, slots) };
  }
  function statusCounts(devs) {
    const out = { verified: 0, partial: 0, ai_review: 0, needs_identification: 0, listed: 0 };
    devs.forEach(function (d) { const s = EV.inv.asset(d).status; out[s] = (out[s] || 0) + 1; });
    return out;
  }
  function deviceOrder(a, b) {
    const ca = CAT_ORDER[a.category] != null ? CAT_ORDER[a.category] : 999, cb = CAT_ORDER[b.category] != null ? CAT_ORDER[b.category] : 999;
    return ca - cb || U.natCmp(R.deviceType(a), R.deviceType(b)) || U.natCmp(a.code, b.code);
  }
  function roomOrder(a, b) { return U.natCmp(a.number || a.name, b.number || b.name) || U.natCmp(a.name, b.name) || String(a.id).localeCompare(String(b.id)); }

  FR.build = function (floorId) {
    const floor = store.get('floors', floorId);
    if (!floor) throw new Error('This floor no longer exists.');
    const building = store.get('buildings', floor.building_id) || null;
    const rooms = R.floorRooms(floor.id).slice().sort(roomOrder);
    const shownPhotos = new Set();
    const keep = function (list) { list.forEach(function (e) { shownPhotos.add(e.id); }); return list; };
    const openIdent = {};
    EV.inv.pending().forEach(function (x) { openIdent[x.id] = x; });
    const prof = EV.auth && EV.auth.profile ? EV.auth.profile() : {};
    const allPunch = [];
    const roomModels = rooms.map(function (room, idx) {
      const assets = R.roomAssets(room.id);
      const seen = assets.filter(function (d) { return !d.presence; }).sort(deviceOrder);
      const listed = assets.filter(function (d) { return !!d.presence; }).sort(deviceOrder);
      const roomPhotoList = P.forRoom(room.id).filter(function (p) { return !p.device_id && !(p.identification_id && openIdent[p.identification_id]); });
      const current = EV.roomPhoto ? EV.roomPhoto(room.id) : null;
      const orderedRoomPhotos = (current ? [current] : []).concat(roomPhotoList.filter(function (p) { return !current || p.id !== current.id; }));
      const devices = seen.map(function (d) {
        const ff = FR.deviceFields(d);
        const a = EV.inv.asset(d);
        return { id: d.id, code: d.code || '', type: R.deviceType(d), title: [d.manufacturer, d.model].filter(Boolean).join(' ') || 'Not identified', manufacturer: d.manufacturer || '',
          model: d.model || '', status: a.status, statusLabel: EV.inv.statusLabel(a.status), fields: ff.fields, missing: ff.missing, photos: keep(devicePhotos(d)),
          serial: d.serial_number || '', ip: d.ip_address || '', mac: d.mac_address || '', port: d.switch_port || '', demo: !!d.is_demo };
      });
      const listedModels = listed.map(function (d) {
        return { id: d.id, code: d.code || '', type: R.deviceType(d), presence: S.label(S.PRESENCE, d.presence), listedText: d.listed_text || '', manufacturer: d.manufacturer || '', model: d.model || '',
          fields: FR.deviceFields(d).fields.filter(function (f) { return f.recorded; }), photos: keep(devicePhotos(d)) };
      });
      const pending = EV.inv.roomPending(room.id).map(function (x) {
        return { id: x.id, status: S.label(S.IDENTIFICATION_STATUS, x.status), started: x.created_at || '', photos: keep(oldestFirst(P.forIdentification(x.id).filter(function (p) { return !p.device_id; })).map(function (p) { return photoEntry(p, { owner: 'capture' }); })) };
      });
      const punch = EV.punch.forRoom(room.id).map(function (p) { return punchEntry(p, room); });
      punch.forEach(function (p) { allPunch.push(p); });
      const rf = FR.roomFields(room);
      const audits = U.sortBy(store.by('audits', 'room_id', room.id), function (a) { return a.started_at || a.audit_date || a.created_at; })
        .map(function (a) { return [a.code, a.audit_date ? U.fmtDate(a.audit_date) : '', a.auditor ? 'auditor ' + a.auditor : '', R.auditStatusLabel(a), a.operational_status ? 'room ' + a.operational_status.toLowerCase() : ''].filter(Boolean).join(' · '); });
      const last = EV.inv.roomLastDate(room);
      const ids = idStats(seen);
      return {
        id: room.id, index: idx, number: room.number || '', name: room.name || '', label: R.roomLabel(room) || 'Unnamed room', code: room.code || '', type: room.room_type || '',
        anchor: 'room-' + (idx + 1), invStatus: EV.inv.roomStatus(room), invLabel: EV.inv.roomStatusLabel(EV.inv.roomStatus(room)),
        fields: rf.fields, missing: rf.missing, audits: audits, lastActivity: last || '',
        photos: keep(orderedRoomPhotos.map(function (p, i) { return photoEntry(p, { main: i === 0, owner: 'room' }); })),
        devices: devices, listed: listedModels, pending: pending, punch: punch,
        stats: { devices: devices.length, listed: listedModels.length, pending: pending.length,
          photos: orderedRoomPhotos.length + U.sum(devices, function (d) { return d.photos.length; }) + U.sum(listedModels, function (d) { return d.photos.length; }) + U.sum(pending, function (c) { return c.photos.length; }),
          roomPhotos: orderedRoomPhotos.length, punchOpen: punch.filter(function (p) { return p.open; }).length, punchTotal: punch.length, ids: ids,
          statuses: statusCounts(seen), withPhoto: devices.filter(function (d) { return d.photos.length; }).length },
        demo: !!room.is_demo
      };
    });
    /* photographs of the floor itself (not of a room or a device) */
    const floorPhotos = keep(oldestFirst(store.by('photos', 'floor_id', floor.id).filter(function (p) { return !p.room_id && !p.device_id && !(p.identification_id && openIdent[p.identification_id]); }))
      .map(function (p) { return photoEntry(p, { owner: 'floor' }); }));
    /* what is on the floor but not in the report, named so that nothing is left out silently */
    const roomIds = new Set(rooms.map(function (r) { return r.id; }));
    const archivedRooms = store.by('rooms', 'floor_id', floor.id).filter(function (r) { return r.archived; });
    const archivedDevices = store.all('devices').filter(function (d) { return d.archived && (d.floor_id === floor.id || roomIds.has(d.room_id)); })
      .sort(function (a, b) { return U.natCmp(a.code, b.code); })
      .map(function (d) { const rm = store.getAny('rooms', d.room_id); return { code: d.code, title: R.deviceLabel(d), room: rm ? R.roomLabel(rm) : '', photos: P.forDevice(d.id).map(function (p) { return p.code; }) }; });
    const archivedIds = new Set(store.all('devices').filter(function (d) { return d.archived; }).map(function (d) { return d.id; }));
    const otherPhotos = store.by('photos', 'floor_id', floor.id).filter(function (p) { return !shownPhotos.has(p.id) && !(p.device_id && archivedIds.has(p.device_id) && (store.getAny('devices', p.device_id).floor_id === floor.id || roomIds.has(store.getAny('devices', p.device_id).room_id))); }).map(function (p) {
      const d = p.device_id ? store.getAny('devices', p.device_id) : null;
      const why = d && d.archived ? 'photograph of archived device record ' + d.code : d && d.deleted_at ? 'photograph of deleted device record ' + d.code
        : d ? 'photograph of ' + d.code + ', which is not in a room on this floor' : p.room_id && !roomIds.has(p.room_id) ? 'photograph of a room that is archived or on another floor' : 'not linked to a room or device on this floor';
      return { code: p.code, reason: why };
    });
    const seenAll = [].concat.apply([], roomModels.map(function (r) { return r.devices; }));
    const seenRecs = seenAll.map(function (d) { return store.get('devices', d.id); }).filter(Boolean);
    /* per core field: how many devices have a value, how many have the auditor's statement that there is none to read
       (not accessible / not applicable), and how many have nothing */
    const fieldUse = FR.deviceCatalogue().reduce(function (acc, g) { return acc.concat(g[1].filter(function (f) { return f.core && f.k !== 'code'; })); }, []).map(function (f) {
      const applies = f.k === 'switch_port' ? seenRecs.filter(EV.inv.portRequired) : seenRecs;
      const vals = applies.map(function (d) { return fieldValue('devices', d, f); });
      const value = vals.filter(function (v) { return v.recorded && !v.stated; }).length, stated = vals.filter(function (v) { return v.stated; }).length;
      return { label: f.label, value: value, stated: stated, none: applies.length - value - stated, of: applies.length, note: f.k === 'switch_port' ? 'devices with an IP address' : '' };
    });
    const punchAll = allPunch;
    const sumStat = function (fn) { return U.sum(roomModels, fn); };
    const totals = {
      rooms: roomModels.length,
      roomsByStatus: { complete: roomModels.filter(function (r) { return r.invStatus === 'complete'; }).length, in_progress: roomModels.filter(function (r) { return r.invStatus === 'in_progress'; }).length,
        not_started: roomModels.filter(function (r) { return !r.invStatus; }).length },
      devices: seenAll.length, listed: sumStat(function (r) { return r.listed.length; }), pending: sumStat(function (r) { return r.pending.length; }),
      photos: { room: sumStat(function (r) { return r.photos.length; }), device: sumStat(function (r) { return U.sum(r.devices, function (d) { return d.photos.length; }) + U.sum(r.listed, function (d) { return d.photos.length; }); }),
        capture: sumStat(function (r) { return U.sum(r.pending, function (c) { return c.photos.length; }); }), floor: floorPhotos.length },
      punch: { total: punchAll.length, open: punchAll.filter(function (p) { return p.open; }).length, resolved: punchAll.filter(function (p) { return !p.open; }).length,
        internal: punchAll.filter(function (p) { return p.resolver === 'internal'; }).length, integrator: punchAll.filter(function (p) { return p.resolver === 'integrator'; }).length,
        unassigned: punchAll.filter(function (p) { return !p.resolver; }).length },
      ids: idStats(seenRecs), statuses: statusCounts(seenRecs), withPhoto: seenAll.filter(function (d) { return d.photos.length; }).length
    };
    totals.photos.total = totals.photos.room + totals.photos.device + totals.photos.capture + totals.photos.floor;
    const where = [building && building.name, 'Floor ' + floor.number].filter(Boolean).join(' · ');
    const sync = EV.sync && EV.sync.status ? EV.sync.status() : null;
    const generatedAt = U.now();
    return {
      floorId: floor.id, floorNumber: floor.number || '', floorLabel: 'Floor ' + (floor.number || '?'), designation: floor.designation || '', building: building ? building.name || '' : '',
      buildingAddress: building ? building.address || '' : '', title: 'Floor ' + (floor.number || '?') + ' — ' + FR.TITLE, where: where,
      org: String(store.kvGet('org_name') || '').trim(), preparedBy: prof.name || store.actor() || '', generatedAt: generatedAt,
      dataAsOf: sync && sync.enabled && sync.lastSyncAt ? sync.lastSyncAt : '', syncLabel: sync && sync.enabled ? sync.label : 'This device only',
      appVersion: (EV.APP.version || '') + (EV.APP.build ? ' (' + EV.APP.build + ')' : ''),
      rooms: roomModels, punch: punchAll, floorPhotos: floorPhotos, totals: totals, fieldUse: fieldUse,
      excluded: { archivedRooms: archivedRooms.map(function (r) { return R.roomLabel(r); }), archivedDevices: archivedDevices, otherPhotos: otherPhotos },
      unavailable: FR.unavailable(), demo: roomModels.some(function (r) { return r.demo; }) || seenAll.some(function (d) { return d.demo; }),
      filename: U.fileSafe([store.orgCode() || 'AVEI', 'Floor', floor.number, 'AV_Environment_Audit', building ? building.name : '', U.localDate(generatedAt)].filter(Boolean).join('_'))
    };
  };

  /* What the report is asked to show that the application does not record, decided from the data model itself: when a
     field is added later, its note disappears by itself. */
  FR.unavailable = function () {
    const pc = S.T.punch_items.colNames, dc = S.T.devices.colNames, phc = S.T.photos.colNames;
    const has = function (cols, names) { return names.some(function (n) { return cols.indexOf(n) >= 0; }); };
    const out = [];
    if (!has(pc, ['priority', 'severity'])) out.push(['Punch list priority / severity', 'Punch list items have no priority or severity field. No priority is shown, and the report assigns none.']);
    if (!has(pc, ['category'])) out.push(['Punch list category', 'Punch list items have no category field.']);
    if (!has(pc, ['corrective_action', 'action', 'recommendation'])) out.push(['Required corrective action', 'Each punch list item is one text saying what needs to be put right; it is shown as the item\'s description. There is no separate corrective-action field.']);
    if (!has(pc, ['owner', 'assigned_to', 'assignee'])) out.push(['Assigned owner', 'Punch list items record the party that is to resolve them (Internal AV support, AV integrator, or not yet decided), not a named person. That party is shown as the owner.']);
    if (!has(phc, ['punch_item_id'])) out.push(['Punch list photographs', 'Photographs cannot be linked to a punch list item. The photographs of each room and its devices are shown in the room\'s section.']);
    if (!has(dc, ['condition', 'device_condition'])) out.push(['Device status or condition', 'Devices have no condition field. The verification status shown is derived by EAVI from the recorded values (identity confirmed, identifiers verified); it does not say whether a device works.']);
    if (!has(dc, ['configuration', 'config_notes'])) out.push(['Configuration details', 'Devices have no general configuration field; the firmware and application versions are the configuration values recorded. Anything else is in the device notes, when it was written there.']);
    return out;
  };

  /* Plain-language facts for the executive overview: counts only, no judgement. */
  FR.summary = function (m) {
    const t = m.totals, out = [];
    out.push('This report covers ' + U.plural(t.rooms, 'room') + ' on ' + m.floorLabel + (m.building ? ' of ' + m.building : '') + ', as recorded in EAVI at the time it was generated.');
    const rs = [t.roomsByStatus.complete ? t.roomsByStatus.complete + ' marked inventory complete' : '', t.roomsByStatus.in_progress ? t.roomsByStatus.in_progress + ' in progress' : '',
      t.roomsByStatus.not_started ? t.roomsByStatus.not_started + ' not started' : ''].filter(Boolean);
    if (rs.length) out.push('Room inventory: ' + rs.join(', ') + '.');
    out.push(U.plural(t.devices, 'AV device') + (t.devices === 1 ? ' is' : ' are') + ' recorded as seen in these rooms' + (t.listed ? '; ' + U.plural(t.listed, 'further item') + ' named in the room details ' + (t.listed === 1 ? 'has' : 'have') + ' not yet been seen' : '') +
      (t.pending ? '; ' + U.plural(t.pending, 'device capture') + ' await review' : '') + '.');
    const vs = [t.statuses.verified ? t.statuses.verified + ' manually verified' : '', t.statuses.partial ? t.statuses.partial + ' partially verified' : '',
      t.statuses.ai_review ? t.statuses.ai_review + ' identified by AI and awaiting review' : '', t.statuses.needs_identification ? t.statuses.needs_identification + ' needing identification' : ''].filter(Boolean);
    if (t.devices) out.push('Verification of the recorded devices: ' + vs.join(', ') + '.');
    if (t.ids.slots) out.push('Device identifiers (serial number, MAC address, IP address, and the switch port of devices with an IP address): ' + t.ids.stated + ' of ' + t.ids.slots +
      ' are recorded or stated as not accessible or not applicable (' + t.ids.pct + '%); ' + t.ids.verified + ' of the recorded values are marked verified; ' + (t.ids.slots - t.ids.stated) + ' are not captured yet.');
    out.push(U.plural(t.photos.total, 'photograph') + ' in this report: ' + [t.photos.room + ' of rooms', t.photos.device + ' of devices', t.photos.capture ? t.photos.capture + ' of captures awaiting review' : '',
      t.photos.floor ? t.photos.floor + ' of the floor' : ''].filter(Boolean).join(', ') + '. ' + t.withPhoto + ' of ' + t.devices + ' recorded devices have at least one photograph.');
    out.push(U.plural(t.punch.total, 'punch list item') + ': ' + t.punch.open + ' open, ' + t.punch.resolved + ' resolved' +
      (t.punch.total ? '; to be resolved by Internal AV support ' + t.punch.internal + ', by the AV integrator ' + t.punch.integrator + ', not yet assigned ' + t.punch.unassigned : '') + '.');
    const empty = m.rooms.filter(function (r) { return !r.devices.length; }).map(function (r) { return r.label; });
    if (empty.length) out.push('No devices are recorded yet in: ' + empty.join(', ') + '.');
    const noPhoto = m.rooms.filter(function (r) { return !r.photos.length; }).map(function (r) { return r.label; });
    if (noPhoto.length) out.push('No photograph of the room itself is recorded for: ' + noPhoto.join(', ') + '.');
    return out;
  };

  /* ------------------------------------------------------------------ image renditions */
  FR.photoIds = function (m) {
    const ids = [];
    const add = function (list) { list.forEach(function (e) { if (ids.indexOf(e.id) < 0) ids.push(e.id); }); };
    m.rooms.forEach(function (r) { add(r.photos); r.devices.forEach(function (d) { add(d.photos); }); r.listed.forEach(function (d) { add(d.photos); }); r.pending.forEach(function (c) { add(c.photos); }); });
    add(m.floorPhotos);
    return ids;
  };
  /* JPEG renditions of every photograph in the report (fetched from the workspace when not on this device). Returns
     { images: Map(id → {bytes, width, height}), missing: [{ code, id }] }. Three at a time; onProgress(done, total). */
  FR.loadImages = async function (m, quality, onProgress) {
    const qq = FR.QUALITY[quality] || FR.QUALITY.standard;
    const ids = FR.photoIds(m), images = new Map(), missing = [];
    let next = 0, done = 0;
    async function worker() {
      while (next < ids.length) {
        const id = ids[next++];
        const ph = store.get('photos', id);
        let j = null;
        try { j = ph ? await P.jpegFor(ph, qq.edge, qq.q) : null; } catch (e) { j = null; }
        if (j) images.set(id, j); else missing.push({ id: id, code: ph ? ph.code : '' });
        done++;
        if (onProgress) { try { onProgress(done, ids.length); } catch (e) { /* ignore */ } }
      }
    }
    await Promise.all([worker(), worker(), worker()]);
    missing.sort(function (a, b) { return U.natCmp(a.code, b.code); });
    return { images: images, missing: missing };
  };
  function b64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  /* ------------------------------------------------------------------ the body (preview and web report)
   * H(sel, props, ...children) builds one element; X carries what differs between the two:
   *   X.img(entry, size) → the picture element (size: 'lg' | 'md' | 'sm'), X.roomLink(room) → props of a link to a room,
   *   X.live: true in the application (no in-page anchors). */
  function dt(v) { return v ? U.fmtDateTime(v) : ''; }
  function d1(v) { return v ? U.fmtDate(v) : ''; }
  const TONE = { verified: 'ok', partial: 'warn', ai_review: 'violet', needs_identification: 'danger', listed: 'muted', complete: 'ok', in_progress: 'warn', '': 'muted' };
  FR.body = function (m, H, X) {
    const t = m.totals;
    const pill = function (text, tone) { return H('span', { 'class': 'fr-pill fr-' + (tone || 'muted') }, text); };
    const stat = function (value, label, tone, sub) { return H('div', { 'class': 'fr-stat' + (tone ? ' fr-stat-' + tone : '') }, H('span.fr-stat-v', null, String(value)), H('span.fr-stat-l', null, label), sub ? H('span.fr-stat-s', null, sub) : null); };
    const nr = function (f) { return f.recorded ? null : 'fr-nr'; };
    const fig = function (e, size) {
      return H('figure', { 'class': 'fr-fig fr-fig-' + size },
        X.img(e, size),
        H('figcaption', null, H('b', null, e.code), e.caption ? ' · ' + e.caption : '', e.taken ? H('span.fr-when', null, ' · ' + d1(e.taken)) : null));
    };
    const gallery = function (list, size) { return H('div', { 'class': 'fr-gallery fr-gallery-' + size }, list.map(function (e) { return fig(e, size); })); };
    const notRecordedLine = function (list) { return list.length ? H('p.fr-also', null, H('b', null, 'Also not recorded: '), list.join(', ') + '.') : null; };
    const punchCard = function (p, withRoom) {
      return H('div', { 'class': 'fr-punch' + (p.open ? '' : ' fr-punch-done'), id: (X.idp || '') + 'punch-' + p.code },
        H('div.fr-punch-head', null, pill(p.status, p.open ? 'warn' : 'ok'), H('span.fr-mono', null, p.code), withRoom ? H('span.fr-punch-room', null, p.roomLabel) : null),
        H('div.fr-punch-text', null, p.text),
        H('dl.fr-punch-meta', null,
          H('div', null, H('dt', null, 'To be resolved by'), H('dd', null, p.party)),
          H('div', null, H('dt', null, 'Related device'), H('dd', { 'class': p.device ? null : 'fr-nr' }, p.device || 'None recorded')),
          H('div', null, H('dt', null, 'Date identified'), H('dd', null, dt(p.added) + (p.addedBy ? ' · ' + p.addedBy : ''))),
          H('div', null, H('dt', null, 'Resolved'), H('dd', { 'class': p.open ? 'fr-nr' : null }, p.open ? 'Open' : (dt(p.resolvedAt) || 'Resolved') + (p.resolvedBy ? ' · ' + p.resolvedBy : ''))),
          p.notes ? H('div.fr-wide', null, H('dt', null, 'Notes'), H('dd', null, p.notes)) : null));
    };
    const punchTable = function (list) {
      return H('div.fr-table-wrap', null, H('table.fr-table', null,
        H('thead', null, H('tr', null, ['Room', 'Item', 'What needs to be put right', 'Related device', 'Status', 'To be resolved by', 'Date identified'].map(function (c, i) { return H('th', { key: 'h' + i }, c); }))),
        H('tbody', null, list.map(function (p) {
          return H('tr', { key: p.id },
            H('td', null, H('a', X.roomLink(m.rooms.find(function (r) { return r.id === p.roomId; })), p.roomLabel)),
            H('td.fr-mono', null, p.code), H('td', null, p.text), H('td', { 'class': p.device ? null : 'fr-nr' }, p.device || '—'),
            H('td', null, pill(p.status, p.open ? 'warn' : 'ok')), H('td', null, p.party), H('td', null, d1(p.added)));
        }))));
    };
    const deviceCard = function (d) {
      const groups = [];
      d.fields.forEach(function (f) { let g = groups.find(function (x) { return x.name === f.group; }); if (!g) groups.push(g = { name: f.group, fields: [] }); g.fields.push(f); });
      return H('article', { 'class': 'fr-device', id: (X.idp || '') + 'device-' + d.code },
        H('header.fr-device-head', null,
          H('div', null, H('div.fr-device-title', null, d.title), H('div.fr-device-sub', null, H('span.fr-mono', null, d.code), ' · ' + d.type)),
          pill(d.statusLabel, TONE[d.status])),
        H('div.fr-device-body', null,
          H('div.fr-device-fields', null,
            groups.map(function (g) {
              return H('div.fr-fgroup', { key: g.name }, H('div.fr-fgroup-name', null, g.name),
                H('dl.fr-kv', null, g.fields.map(function (f) {
                  return H('div', { key: f.k, 'class': f.long ? 'fr-wide' : null }, H('dt', null, f.label),
                    H('dd', { 'class': U.cx(nr(f), f.mono && 'fr-mono') }, f.value, f.note ? H('span', { 'class': 'fr-note' + (f.verified ? ' fr-note-ok' : '') }, f.note) : null));
                })));
            }),
            notRecordedLine(d.missing)),
          H('div.fr-device-photos', null,
            d.photos.length ? [fig(d.photos[0], 'md'), d.photos.length > 1 ? gallery(d.photos.slice(1), 'sm') : null]
              : H('div.fr-nophoto', null, 'No photograph captured for this device'))));
    };
    const roomSection = function (r) {
      return H('section', { 'class': 'fr-room', id: (X.idp || '') + r.anchor, key: r.id },
        H('header.fr-room-head', null,
          H('div', null, H('div.fr-room-kicker', null, 'Room ' + (r.index + 1) + ' of ' + m.rooms.length + ' · ' + m.where), H('h2.fr-room-title', null, r.label), r.type ? H('div.fr-room-sub', null, r.type + (r.code ? ' · ' + r.code : '')) : null),
          pill('Inventory ' + r.invLabel.toLowerCase(), TONE[r.invStatus])),
        H('div.fr-stats.fr-stats-5', null,
          stat(r.stats.devices, 'Devices recorded'), stat(r.stats.photos, 'Photographs'), stat(r.stats.ids.slots ? r.stats.ids.pct + '%' : '—', 'Identifier fields completed', null, r.stats.ids.slots ? r.stats.ids.stated + ' of ' + r.stats.ids.slots + ' · ' + r.stats.ids.verified + ' verified' : ''),
          stat(r.stats.punchOpen, 'Punch items open', r.stats.punchOpen ? 'warn' : null), stat(r.stats.punchTotal - r.stats.punchOpen, 'Punch items resolved')),
        H('h3.fr-h3', null, 'Room details'),
        H('dl.fr-kv.fr-kv-2', null, r.fields.map(function (f) {
          return H('div', { key: f.k, 'class': f.long ? 'fr-wide' : null }, H('dt', null, f.label), H('dd', { 'class': U.cx(nr(f), f.mono && 'fr-mono') }, f.value));
        }), H('div', null, H('dt', null, 'Last device activity'), H('dd', { 'class': r.lastActivity ? null : 'fr-nr' }, r.lastActivity ? dt(r.lastActivity) : NR)),
        r.audits.length ? H('div.fr-wide', null, H('dt', null, 'Audit records'), H('dd', null, r.audits.join('\n'))) : null),
        notRecordedLine(r.missing),
        H('h3.fr-h3', null, 'Room photographs', H('span.fr-count', null, String(r.photos.length))),
        r.photos.length ? gallery(r.photos, r.photos.length > 4 ? 'md' : 'lg') : H('p.fr-callout', null, 'No photographs of the room itself were captured.'),
        H('h3.fr-h3', null, 'AV device inventory', H('span.fr-count', null, String(r.devices.length))),
        r.devices.length ? [
          H('div.fr-table-wrap', { key: 'inv' }, H('table.fr-table', null,
            H('thead', null, H('tr', null, ['Asset ID', 'Category', 'Manufacturer / model', 'Serial number', 'IP address', 'MAC address', 'Status'].map(function (c, i) { return H('th', { key: 'h' + i }, c); }))),
            H('tbody', null, r.devices.map(function (d) {
              return H('tr', { key: d.id }, H('td.fr-mono', null, X.live ? d.code : H('a', { href: '#device-' + d.code }, d.code)), H('td', null, d.type), H('td', null, d.title),
                H('td', { 'class': U.cx(!d.serial && 'fr-nr', d.serial && 'fr-mono') }, d.serial || NR), H('td', { 'class': U.cx(!d.ip && 'fr-nr', d.ip && 'fr-mono') }, d.ip || NR),
                H('td', { 'class': U.cx(!d.mac && 'fr-nr', d.mac && 'fr-mono') }, d.mac || NR), H('td', null, pill(d.statusLabel, TONE[d.status])));
            })))),
          r.devices.map(deviceCard)
        ] : H('p.fr-callout', null, 'No devices are recorded in this room.'),
        r.listed.length ? [H('h3.fr-h3', { key: 'lh' }, 'Equipment named in the room details — not yet seen', H('span.fr-count', null, String(r.listed.length))),
          H('p.fr-muted', { key: 'lp' }, 'Created from the room\'s display, camera and microphone details. Not yet confirmed in the room.'),
          H('div.fr-table-wrap', { key: 'lt' }, H('table.fr-table', null,
            H('thead', null, H('tr', null, ['Asset ID', 'Category', 'Listed as', 'Manufacturer', 'Model', 'Presence'].map(function (c, i) { return H('th', { key: 'h' + i }, c); }))),
            H('tbody', null, r.listed.map(function (d) { return H('tr', { key: d.id }, H('td.fr-mono', null, d.code), H('td', null, d.type), H('td', null, d.listedText || '—'), H('td', null, d.manufacturer || '—'), H('td', null, d.model || '—'), H('td', null, d.presence)); })))),
          r.listed.some(function (d) { return d.photos.length; }) ? gallery([].concat.apply([], r.listed.map(function (d) { return d.photos; })), 'sm') : null] : null,
        r.pending.length ? [H('h3.fr-h3', { key: 'ph' }, 'Device captures awaiting review', H('span.fr-count', null, String(r.pending.length))),
          H('p.fr-muted', { key: 'pp' }, 'Photographs of a device taken in this room that has not yet been confirmed as an asset.'),
          r.pending.map(function (c) { return H('div.fr-capture', { key: c.id }, H('div.fr-capture-head', null, c.status + (c.started ? ' · started ' + dt(c.started) : '')), c.photos.length ? gallery(c.photos, 'sm') : H('p.fr-muted', null, 'No photographs in this capture.')); })] : null,
        H('h3.fr-h3', null, 'Room punch list', H('span.fr-count', null, r.punch.length ? r.stats.punchOpen + ' open · ' + (r.punch.length - r.stats.punchOpen) + ' resolved' : '0')),
        r.punch.length ? H('div.fr-punch-list', null, r.punch.map(function (p) { return punchCard(p, false); })) : H('p.fr-callout', null, FR.NO_PUNCH));
    };
    const open = m.punch.filter(function (p) { return p.open; }), done = m.punch.filter(function (p) { return !p.open; });
    return H('div.fr-doc', null,
      /* cover */
      H('header.fr-cover', null,
        H('div.fr-brand', null, m.org ? H('span.fr-org', null, m.org.toUpperCase()) : null, H('span', null, 'EAVI · AV ENVIRONMENT INTELLIGENCE')),
        H('span.fr-poc', null, FR.POC.toUpperCase()),
        H('h1.fr-title', null, m.floorLabel + ' — ', H('span', null, FR.TITLE)),
        H('div.fr-cover-sub', null, [m.building, m.designation].filter(Boolean).join(' · ') || m.floorLabel),
        H('dl.fr-meta', null,
          [['Report generated', dt(m.generatedAt)], ['Prepared by', m.preparedBy || NR], ['Building', m.building || NR], ['Floor', m.floorNumber + (m.designation ? ' — ' + m.designation : '')],
            ['Rooms audited', String(t.rooms)], ['Data as of', m.dataAsOf ? 'Last synchronised ' + dt(m.dataAsOf) : 'Records on the generating device'], m.org ? ['Organization', m.org] : null]
            .filter(Boolean).map(function (x, i) { return H('div', { key: 'm' + i }, H('dt', null, x[0]), H('dd', null, x[1])); }))),
      m.demo ? H('p.fr-callout.fr-callout-warn', null, 'DEMO DATA — this report contains synthetic records created for evaluation. It does not describe a real environment.') : null,
      /* executive overview */
      H('section.fr-section', { id: (X.idp || '') + 'overview' },
        H('h2.fr-h2', null, 'Executive overview'),
        H('p.fr-lead', null, FR.WHAT),
        H('div.fr-stats', null,
          stat(t.rooms, 'Rooms audited', null, t.roomsByStatus.complete + ' marked complete'), stat(t.devices, 'AV devices identified', null, t.listed ? t.listed + ' more listed, not yet seen' : ''),
          stat(t.photos.total, 'Photographs captured'), stat(t.punch.total, 'Punch list items', t.punch.open ? 'warn' : null, t.punch.open + ' open · ' + t.punch.resolved + ' resolved')),
        H('h3.fr-h3', null, 'Condition and completeness of the collected information'),
        H('ul.fr-ul', null, FR.summary(m).map(function (s, i) { return H('li', { key: 'f' + i }, s); })),
        H('div.fr-two', null,
          H('div', null, H('h3.fr-h3', null, 'Punch list by status'),
            H('table.fr-table.fr-table-mini', null, H('tbody', null, [['Open', t.punch.open], ['Resolved', t.punch.resolved], ['Total', t.punch.total]].map(function (x) { return H('tr', { key: x[0] }, H('td', null, x[0]), H('td.fr-num', null, String(x[1]))); })))),
          H('div', null, H('h3.fr-h3', null, 'Punch list by who resolves it'),
            H('table.fr-table.fr-table-mini', null, H('tbody', null, [['Internal AV support', t.punch.internal], ['AV integrator', t.punch.integrator], ['Not yet assigned', t.punch.unassigned]].map(function (x) { return H('tr', { key: x[0] }, H('td', null, x[0]), H('td.fr-num', null, String(x[1]))); }))))),
        H('h3.fr-h3', null, 'Information recorded per device'),
        H('div.fr-table-wrap', null, H('table.fr-table', null,
          H('thead', null, H('tr', null, H('th', null, 'Field'), H('th.fr-num', null, 'Value recorded'), H('th.fr-num', null, 'Stated not applicable / not accessible'), H('th.fr-num', null, 'Not recorded'), H('th.fr-num', null, 'Devices'))),
          H('tbody', null, m.fieldUse.map(function (f) { return H('tr', { key: f.label }, H('td', null, f.label + (f.note ? ' (' + f.note + ')' : '')), H('td.fr-num', null, String(f.value)), H('td.fr-num', null, String(f.stated)), H('td.fr-num', null, String(f.none)), H('td.fr-num', null, String(f.of))); }))))),
      /* floor summary */
      H('section.fr-section', { id: (X.idp || '') + 'floor' },
        H('h2.fr-h2', null, 'Floor summary'),
        H('div.fr-table-wrap', null, H('table.fr-table', null,
          H('thead', null, H('tr', null, ['Room', 'Room name', 'Type', 'Inventory', 'Devices', 'Photos', 'Identifier fields completed', 'Punch items'].map(function (c, i) { return H('th', { key: 'h' + i }, c); }))),
          H('tbody', null, m.rooms.map(function (r) {
            return H('tr', { key: r.id },
              H('td', null, H('a', X.roomLink(r), r.number || r.label)), H('td', { 'class': r.name ? null : 'fr-nr' }, r.name || NR), H('td', null, r.type || NR), H('td', null, pill(r.invLabel, TONE[r.invStatus])),
              H('td.fr-num', null, String(r.devices.length) + (r.listed.length ? ' + ' + r.listed.length + ' listed' : '')), H('td.fr-num', null, String(r.stats.photos)),
              H('td.fr-num', null, r.stats.ids.slots ? r.stats.ids.stated + ' / ' + r.stats.ids.slots + ' (' + r.stats.ids.pct + '%)' : '—'),
              H('td.fr-num', null, r.punch.length ? r.stats.punchOpen + ' open / ' + r.punch.length : '0'));
          })))),
        H('h3.fr-h3', null, 'Room photographs'),
        m.rooms.some(function (r) { return r.photos.length; })
          ? H('div.fr-gallery.fr-gallery-md', null, m.rooms.filter(function (r) { return r.photos.length; }).map(function (r) {
            return H('figure', { 'class': 'fr-fig fr-fig-md', key: r.id }, X.img(r.photos[0], 'md'), H('figcaption', null, H('b', null, r.label), ' · ' + r.photos[0].code));
          })) : H('p.fr-callout', null, 'No room photographs were captured on this floor.'),
        m.floorPhotos.length ? [H('h3.fr-h3', { key: 'fp' }, 'Photographs of the floor', H('span.fr-count', null, String(m.floorPhotos.length))), gallery(m.floorPhotos, 'md')] : null),
      /* rooms */
      m.rooms.map(roomSection),
      /* consolidated punch list */
      H('section.fr-section', { id: (X.idp || '') + 'punchlist' },
        H('h2.fr-h2', null, 'Consolidated ' + m.floorLabel + ' punch list'),
        H('div.fr-stats', null, stat(t.punch.total, 'Total items'), stat(t.punch.open, 'Open', t.punch.open ? 'warn' : null), stat(t.punch.resolved, 'Resolved', t.punch.resolved ? 'ok' : null),
          stat(t.punch.internal + ' / ' + t.punch.integrator + ' / ' + t.punch.unassigned, 'Internal / Integrator / Unassigned')),
        H('p.fr-muted', null, 'Priority is not recorded for punch list items in EAVI, so none is shown. “To be resolved by” is the party that owns the item.'),
        H('h3.fr-h3', null, 'Open items', H('span.fr-count', null, String(open.length))),
        open.length ? punchTable(open) : H('p.fr-callout', null, 'No open punch list items are recorded on this floor.'),
        H('h3.fr-h3', null, 'Resolved items', H('span.fr-count', null, String(done.length))),
        done.length ? punchTable(done) : H('p.fr-muted', null, 'No resolved punch list items are recorded on this floor.')),
      /* notes */
      H('section.fr-section', { id: (X.idp || '') + 'notes' },
        H('h2.fr-h2', null, 'Report notes'),
        H('h3.fr-h3', null, 'Source'),
        H('ul.fr-ul', null,
          H('li', null, 'Generated by ' + FR.PRODUCT + ' ' + m.appVersion + ' on ' + dt(m.generatedAt) + (m.preparedBy ? ' by ' + m.preparedBy : '') + '.'),
          H('li', null, 'Source of the records: ' + m.syncLabel + (m.dataAsOf ? ', last synchronised ' + dt(m.dataAsOf) : '') + '. The report shows the records as they were at that time.'),
          H('li', null, '“Not recorded” means no value was entered in EAVI. “Not accessible / unavailable” and “Not applicable” are statements recorded by the auditor.')),
        H('h3.fr-h3', null, 'Fields EAVI does not record'),
        H('ul.fr-ul', null, m.unavailable.map(function (u) { return H('li', { key: u[0] }, H('b', null, u[0] + ': '), u[1]); })),
        H('h3.fr-h3', null, 'Records on this floor that are not shown'),
        (m.excluded.archivedRooms.length || m.excluded.archivedDevices.length || m.excluded.otherPhotos.length) ? H('ul.fr-ul', null,
          m.excluded.archivedRooms.length ? H('li', null, 'Archived rooms: ' + m.excluded.archivedRooms.join(', ') + '.') : null,
          m.excluded.archivedDevices.length ? H('li', null, U.plural(m.excluded.archivedDevices.length, 'archived device record') + ' (taken out of the inventory by the auditor): ' +
            m.excluded.archivedDevices.map(function (d) { return d.code + (d.room ? ' in ' + d.room : '') + (d.photos.length ? ' (' + U.plural(d.photos.length, 'photograph') + ')' : ''); }).join('; ') + '.') : null,
          m.excluded.otherPhotos.length ? H('li', null, U.plural(m.excluded.otherPhotos.length, 'photograph') + ' recorded on this floor and not shown: ' +
            m.excluded.otherPhotos.map(function (p) { return p.code + ' (' + p.reason + ')'; }).join('; ') + '.') : null)
          : H('p.fr-muted', null, 'None: every room, device and photograph recorded on this floor is in the report.'),
        X.missingNote ? X.missingNote() : null),
      H('footer.fr-foot', null, FR.PRODUCT + ' · ' + m.title + ' · ' + FR.POC + ' · Generated ' + dt(m.generatedAt) + ' · Confidential — contains infrastructure information'));
  };

  /* ------------------------------------------------------------------ renderer: in the application (preview) */
  FR.view = function (m) {
    const X = {
      live: true, idp: 'frv-',   /* ids of their own, so nothing here can collide with the application's */
      img: function (e, size) {
        const ph = store.get('photos', e.id);
        return h('button', { type: 'button', 'class': 'fr-imgbtn fr-img-' + size, title: 'Open ' + e.code + ' full size', onclick: function () { if (ph) P.openViewer(ph.id, [ph.id]); } },
          ph && ph.thumb ? h('img', { src: ph.thumb, alt: e.caption, loading: 'lazy' }) : h('span.fr-noimg', null, 'Image not available'));
      },
      roomLink: function (r) { return { href: null, role: 'button', tabindex: '0', 'class': 'link fr-link', onclick: function () { const el = document.getElementById('frv-' + (r ? r.anchor : '')); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }; }
    };
    return h('article.fr-paper', null, FR.body(m, h, X));
  };

  /* ------------------------------------------------------------------ renderer: self-contained web page
   * A string builder with the same call shape as h(): every text is escaped, every attribute value is escaped and only
   * plain values are written (functions are dropped), so record content can never become markup in the file either. */
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  const RAW = {};
  function raw(s) { return { _raw: RAW, s: s }; }
  const VOID = { img: 1, br: 1, meta: 1, link: 1, input: 1, hr: 1 };
  function flat(list, out) {
    list.forEach(function (c) {
      if (c == null || c === false || c === true) return;
      if (Array.isArray(c)) flat(c, out);
      else if (typeof c === 'object' && c._raw === RAW) out.push(c.s);
      else out.push(esc(typeof c === 'object' ? JSON.stringify(c) : c));
    });
    return out;
  }
  function hs(sel, props) {
    let start = 2;
    if (props == null || typeof props !== 'object' || Array.isArray(props) || props._raw === RAW) { start = 1; props = null; }
    const kids = Array.prototype.slice.call(arguments, start);
    const m = /^([a-z0-9]+)?((?:[.#][A-Za-z0-9_-]+)*)$/.exec(sel) || [];
    const tag = m[1] || 'div';
    const cls = [], idm = /#([A-Za-z0-9_-]+)/.exec(m[2] || '');
    (m[2] || '').replace(/\.([A-Za-z0-9_-]+)/g, function (x, c) { cls.push(c); return x; });
    let attrs = '';
    const p = Object.assign({}, props || {});
    if (p['class']) cls.push(p['class']);
    delete p['class']; delete p.key; delete p.ref;
    if (cls.length) attrs += ' class="' + esc(cls.join(' ')) + '"';
    if (idm && p.id == null) p.id = idm[1];
    Object.keys(p).forEach(function (k) {
      const v = p[k];
      if (v == null || v === false || typeof v === 'function' || !/^[a-z][a-z0-9-]*$/i.test(k) || /^on/i.test(k)) return;
      if ((k === 'href' || k === 'src') && /^\s*(javascript|vbscript)\s*:/i.test(String(v))) return;
      attrs += ' ' + k + (v === true ? '' : '="' + esc(v) + '"');
    });
    return raw('<' + tag + attrs + '>' + (VOID[tag] ? '' : flat(kids, []).join('') + '</' + tag + '>'));
  }
  FR.htmlEscape = esc;
  FR.WEB_CSS = [
    ':root{--navy:#0f1522;--accent:#2f6feb;--ink:#111827;--muted:#6b7280;--line:#d0d5dd;--band:#f6f8fb;--ok:#15803d;--warn:#9a5c06;--danger:#b91c1c;--violet:#5b4fd6}',
    '*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:64px}body{margin:0;background:#eef1f5;color:var(--ink);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%}',
    'a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}',
    '.top{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:12px;padding:10px 18px;background:var(--navy);color:#fff}',
    '.top b{font-size:13px;letter-spacing:.04em;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.top .poc{font-size:10px;font-weight:700;letter-spacing:.12em;background:var(--accent);padding:3px 7px;border-radius:3px}.top .grow{flex:1}',
    '.top select{max-width:46vw;font:inherit;font-size:13px;padding:6px 8px;border-radius:6px;border:1px solid #2a3650;background:#141b2b;color:#fff}',
    '.wrap{display:grid;grid-template-columns:240px minmax(0,1fr);gap:22px;max-width:1320px;margin:0 auto;padding:22px 18px 60px}',
    '.side{position:sticky;top:66px;align-self:start;max-height:calc(100vh - 86px);overflow:auto;background:#fff;border:1px solid var(--line);border-radius:10px;padding:12px}',
    '.side h4{margin:4px 6px 6px;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}.side a{display:block;padding:6px 8px;border-radius:6px;color:var(--ink);font-size:13px}',
    '.side a:hover{background:var(--band);text-decoration:none}.side a small{display:block;color:var(--muted);font-size:11px}',
    'main{min-width:0}@media(max-width:900px){.wrap{grid-template-columns:minmax(0,1fr);padding:12px 10px 40px}.side{display:none}.top{padding:9px 10px;gap:8px}.top .poc{display:none}}@media(min-width:901px){.top select{display:none}}',
    '.fr-doc{background:#fff;border:1px solid var(--line);border-radius:10px;padding:0 0 18px;overflow:hidden;min-width:0}',
    '.fr-doc>*:not(.fr-cover){margin-left:28px;margin-right:28px}@media(max-width:600px){.fr-doc>*:not(.fr-cover){margin-left:14px;margin-right:14px}}',
    '.fr-cover{background:var(--navy);color:#fff;padding:30px 28px 24px;border-bottom:4px solid var(--accent)}.fr-brand{display:flex;gap:10px;flex-wrap:wrap;font-size:11px;letter-spacing:.14em;color:#93bbff;font-weight:700}',
    '.fr-org{color:#fff}.fr-poc{display:inline-block;margin-top:14px;background:var(--accent);color:#fff;font-weight:800;font-size:11px;letter-spacing:.14em;padding:5px 10px;border-radius:3px}',
    '.fr-title{font-size:34px;line-height:1.15;margin:14px 0 6px;font-weight:800;overflow-wrap:anywhere}@media(max-width:600px){.fr-title{font-size:26px}.fr-cover{padding:22px 16px 18px}}.fr-title span{font-weight:500}.fr-cover-sub{color:#c6d0e2;font-size:15px}',
    '.fr-meta{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px 18px;margin:20px 0 0;padding:14px;background:rgba(255,255,255,.06);border:1px solid #2a3650;border-radius:8px}',
    '.fr-meta dt{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:#93a3c0}.fr-meta dd{margin:2px 0 0;font-weight:650;overflow-wrap:anywhere}',
    '.fr-section,.fr-room{padding-top:22px}.fr-room{border-top:6px solid #eef1f5;margin-top:26px}',
    '.fr-h2{font-size:21px;color:var(--navy);margin:6px 0 12px;padding-bottom:6px;border-bottom:2px solid var(--accent)}',
    '.fr-h3{font-size:14.5px;color:var(--navy);margin:20px 0 8px;display:flex;align-items:center;gap:8px}.fr-count{font-size:11px;font-weight:700;color:var(--muted);background:var(--band);border:1px solid var(--line);border-radius:10px;padding:1px 8px}',
    '.fr-lead{max-width:90ch;color:#374151}.fr-muted{color:var(--muted);font-size:13px}.fr-ul{margin:0;padding-left:20px}.fr-ul li{margin:4px 0;max-width:100ch}',
    '.fr-callout{background:var(--band);border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:6px;padding:10px 12px;margin:6px 0}.fr-callout-warn{background:#fffbeb;border-color:#f5d08a;color:#7a4a05;font-weight:650}',
    '.fr-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:14px 0}.fr-stats-5{grid-template-columns:repeat(5,minmax(0,1fr))}@media(max-width:760px){.fr-stats,.fr-stats-5{grid-template-columns:repeat(2,minmax(0,1fr))}}',
    '.fr-stat{display:flex;flex-direction:column;gap:2px;padding:12px;background:var(--band);border:1px solid var(--line);border-left:4px solid var(--navy);border-radius:6px}.fr-stat-v{font-size:22px;font-weight:800;color:var(--navy)}',
    '.fr-stat-l{font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--muted)}.fr-stat-s{font-size:11.5px;color:#4b5563}.fr-stat-warn{border-left-color:#d9930d}.fr-stat-warn .fr-stat-v{color:var(--warn)}.fr-stat-ok{border-left-color:#22a05a}.fr-stat-ok .fr-stat-v{color:var(--ok)}',
    '.fr-pill{display:inline-block;font-size:10.5px;font-weight:750;letter-spacing:.04em;text-transform:uppercase;padding:3px 8px;border-radius:3px;white-space:nowrap;background:#eef1f5;color:#4b5563}',
    '.fr-ok{background:#e8f6ee;color:var(--ok)}.fr-warn{background:#fdf3de;color:var(--warn)}.fr-danger{background:#fdecec;color:var(--danger)}.fr-violet{background:#efedff;color:var(--violet)}',
    '.fr-table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:8px;margin:6px 0 10px}.fr-table{width:100%;border-collapse:collapse;font-size:13px}',
    '.fr-table th{background:var(--navy);color:#fff;text-align:left;padding:8px 10px;font-weight:650;white-space:nowrap}.fr-table td{padding:7px 10px;border-top:1px solid #e5e7eb;vertical-align:top;overflow-wrap:anywhere}',
    '.fr-table td.fr-mono{white-space:nowrap}.fr-table tbody tr:nth-child(even) td{background:var(--band)}.fr-num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.fr-table-mini{max-width:360px;border:1px solid var(--line)}',
    '.fr-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}@media(max-width:700px){.fr-two{grid-template-columns:1fr}}',
    '.fr-mono{font-family:ui-monospace,"SF Mono",Consolas,Menlo,monospace;font-size:.95em}.fr-nr{color:#9aa3b2;font-style:italic}',
    '.fr-kv{margin:0;display:grid;grid-template-columns:1fr;gap:0}.fr-kv>div{display:grid;grid-template-columns:minmax(120px,38%) minmax(0,1fr);gap:10px;padding:5px 0;border-bottom:1px solid #eef0f3}',
    '.fr-kv dt{color:var(--muted);font-size:12.5px}.fr-kv dd{margin:0;overflow-wrap:anywhere;white-space:pre-line}.fr-kv-2{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:26px}.fr-kv-2 .fr-wide{grid-column:1/-1}',
    '.fr-kv-2>div{grid-template-columns:170px minmax(0,1fr)}@media(max-width:700px){.fr-kv-2{grid-template-columns:1fr}.fr-kv-2>div{grid-template-columns:minmax(110px,38%) minmax(0,1fr)}}.fr-note{display:block;font-size:11px;color:var(--warn);font-style:normal;font-family:inherit}.fr-note-ok{color:var(--ok)}',
    '.fr-also{font-size:12px;color:var(--muted);margin:8px 0 0}',
    '.fr-room-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;background:var(--navy);color:#fff;padding:16px 18px;border-radius:8px}.fr-room-kicker{font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:#93bbff;font-weight:700}',
    '@media(max-width:600px){.fr-room-head{flex-direction:column}}.fr-room-title{margin:4px 0 2px;font-size:23px;overflow-wrap:anywhere}.fr-room-sub{color:#c6d0e2;font-size:13px}',
    '.fr-gallery{display:grid;gap:12px;margin:6px 0 10px}.fr-gallery-lg{grid-template-columns:repeat(2,minmax(0,1fr))}.fr-gallery-md{grid-template-columns:repeat(3,minmax(0,1fr))}.fr-gallery-sm{grid-template-columns:repeat(3,minmax(0,1fr))}',
    '@media(max-width:700px){.fr-gallery-lg,.fr-gallery-md{grid-template-columns:1fr}.fr-gallery-sm{grid-template-columns:repeat(2,minmax(0,1fr))}}',
    '.fr-fig{margin:0;display:flex;flex-direction:column;gap:5px}.fr-fig img{width:100%;aspect-ratio:4/3;object-fit:contain;background:#eef1f5;border:1px solid var(--line);border-radius:6px;cursor:zoom-in;display:block}',
    '.fr-fig-lg img{aspect-ratio:4/3}.fr-fig figcaption{font-size:11.5px;color:#4b5563;overflow-wrap:anywhere}.fr-when{color:var(--muted)}',
    '.fr-nophoto{min-height:90px}.fr-noimg{aspect-ratio:4/3}.fr-noimg,.fr-nophoto{display:flex;align-items:center;justify-content:center;background:#f3f4f6;border:1px dashed #c3c9d3;border-radius:6px;color:var(--muted);font-size:12px;text-align:center;padding:10px}',
    '.fr-device{border:1px solid var(--line);border-radius:10px;margin:14px 0;overflow:hidden;break-inside:avoid}.fr-device-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;background:var(--band);border-bottom:1px solid var(--line);padding:10px 14px}',
    '.fr-device-title{font-weight:750;font-size:15.5px;color:var(--navy)}.fr-device-sub{font-size:12px;color:var(--muted)}',
    '.fr-device-body{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:18px;padding:12px 14px}@media(max-width:800px){.fr-device-body{grid-template-columns:1fr}}',
    '.fr-fgroup{margin-bottom:8px}.fr-fgroup-name{font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);margin:6px 0 2px}',
    '.fr-device-photos .fr-gallery-sm{grid-template-columns:repeat(2,minmax(0,1fr));margin-top:10px}',
    '.fr-punch-list{display:flex;flex-direction:column;gap:10px}.fr-punch{border:1px solid var(--line);border-left:4px solid #d9930d;border-radius:8px;padding:10px 12px}.fr-punch-done{border-left-color:#22a05a}',
    '.fr-punch-head{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:12px;color:var(--muted)}.fr-punch-room{font-weight:650;color:var(--ink)}.fr-punch-text{font-size:15px;font-weight:600;margin:6px 0}',
    '.fr-punch-meta{margin:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 18px;font-size:12.5px}.fr-punch-meta dt{color:var(--muted);font-size:11px}.fr-punch-meta dd{margin:0;overflow-wrap:anywhere;white-space:pre-line}.fr-punch-meta .fr-wide{grid-column:1/-1}',
    '@media(max-width:600px){.fr-punch-meta{grid-template-columns:1fr}}.fr-capture{border:1px dashed var(--line);border-radius:8px;padding:8px 10px;margin:8px 0}.fr-capture-head{font-size:12.5px;font-weight:650}',
    '.fr-foot{margin-top:26px;padding-top:12px;border-top:1px solid var(--line);font-size:11.5px;color:var(--muted)}',
    '.lb{position:fixed;inset:0;z-index:50;background:rgba(9,13,21,.94);display:none;flex-direction:column;align-items:center;justify-content:center;padding:14px}.lb.on{display:flex}',
    '.lb img{max-width:100%;max-height:calc(100vh - 90px);object-fit:contain}.lb p{color:#e5e7eb;font-size:13px;margin:10px 0 0;text-align:center;max-width:900px}',
    '.lb button{position:absolute;background:rgba(255,255,255,.12);color:#fff;border:0;border-radius:8px;font-size:22px;width:44px;height:44px;cursor:pointer}.lb .x{top:12px;right:12px}.lb .pv{left:12px;top:50%}.lb .nx{right:12px;top:50%}',
    '@media print{.top,.side,.lb{display:none!important}.wrap{display:block;padding:0}.fr-doc{border:0}.fr-room{break-before:page}body{background:#fff}}'
  ].join('\n');
  /* viewer and navigation: open a picture full size, step through the pictures of its section, close with Esc */
  FR.WEB_JS = [
    '(function(){',
    'var lb=document.getElementById("lb"),im=lb.querySelector("img"),cap=lb.querySelector("p"),list=[],at=0;',
    'function show(i){at=(i+list.length)%list.length;var f=list[at];im.src=f.querySelector("img").src;im.alt=f.querySelector("img").alt;cap.textContent=f.querySelector("figcaption")?f.querySelector("figcaption").textContent:"";}',
    'document.addEventListener("click",function(e){var t=e.target;if(t.tagName==="IMG"&&t.closest(".fr-fig")){var sec=t.closest(".fr-device,.fr-room,.fr-section")||document;list=Array.prototype.slice.call(sec.querySelectorAll(".fr-fig"));show(list.indexOf(t.closest(".fr-fig")));lb.classList.add("on");}});',
    'lb.querySelector(".x").onclick=function(){lb.classList.remove("on");};lb.querySelector(".pv").onclick=function(e){e.stopPropagation();show(at-1);};lb.querySelector(".nx").onclick=function(e){e.stopPropagation();show(at+1);};',
    'lb.addEventListener("click",function(e){if(e.target===lb)lb.classList.remove("on");});',
    'document.addEventListener("keydown",function(e){if(!lb.classList.contains("on"))return;if(e.key==="Escape")lb.classList.remove("on");if(e.key==="ArrowLeft")show(at-1);if(e.key==="ArrowRight")show(at+1);});',
    'var sel=document.getElementById("jump");if(sel)sel.onchange=function(){if(sel.value)location.hash=sel.value;};',
    '})();'
  ].join('\n');
  /* The web report as one HTML file: styles, script and every picture inside it. Its own Content-Security-Policy lets it
     load nothing and connect nowhere. Returns { blob, missing, images }. */
  FR.html = async function (m, o) {
    o = o || {};
    const loaded = o.loaded || await FR.loadImages(m, o.quality || 'standard', o.onProgress);
    const uri = new Map();
    loaded.images.forEach(function (j, id) { uri.set(id, 'data:image/jpeg;base64,' + b64(j.bytes)); });
    const X = {
      live: false,
      img: function (e) {
        const u = uri.get(e.id);
        return u ? hs('img', { src: u, alt: e.code + ' — ' + e.caption, loading: 'lazy', width: loaded.images.get(e.id).width, height: loaded.images.get(e.id).height })
          : hs('div.fr-noimg', null, 'Image file not available — ' + e.code);
      },
      roomLink: function (r) { return r ? { href: '#' + r.anchor } : {}; },
      missingNote: function () {
        return [hs('h3.fr-h3', null, 'Photographs'), hs('p.fr-muted', null, loaded.missing.length
          ? U.plural(loaded.missing.length, 'photograph') + ' could not be loaded when this report was generated and ' + (loaded.missing.length === 1 ? 'is' : 'are') + ' shown as “Image file not available”: ' + loaded.missing.map(function (x) { return x.code; }).join(', ') + '.'
          : 'All ' + U.plural(FR.photoIds(m).length, 'photograph') + ' are included.')];
      }
    };
    const body = FR.body(m, hs, X).s;
    const nav = hs('nav.side', null, hs('h4', null, 'Report'),
      [['overview', 'Executive overview'], ['floor', 'Floor summary']].map(function (x) { return hs('a', { href: '#' + x[0] }, x[1]); }),
      hs('h4', null, 'Rooms'),
      m.rooms.map(function (r) { return hs('a', { href: '#' + r.anchor }, r.label, hs('small', null, U.plural(r.devices.length, 'device') + ' · ' + (r.punch.length ? r.stats.punchOpen + ' open punch' : 'no punch items'))); }),
      hs('h4', null, 'Floor'), hs('a', { href: '#punchlist' }, 'Consolidated punch list'), hs('a', { href: '#notes' }, 'Report notes')).s;
    const jump = hs('select', { id: 'jump', 'aria-label': 'Go to' }, hs('option', { value: '' }, 'Go to…'),
      [['overview', 'Executive overview'], ['floor', 'Floor summary']].map(function (x) { return hs('option', { value: x[0] }, x[1]); }),
      m.rooms.map(function (r) { return hs('option', { value: r.anchor }, r.label); }), hs('option', { value: 'punchlist' }, 'Consolidated punch list'), hs('option', { value: 'notes' }, 'Report notes')).s;
    const doc = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'">\n' +
      '<meta name="robots" content="noindex, nofollow">\n<meta name="referrer" content="no-referrer">\n<title>' + esc(m.title + ' · ' + (m.building || '') + ' · ' + FR.POC) + '</title>\n' +
      '<style>\n' + FR.WEB_CSS + '\n</style>\n</head>\n<body>\n' +
      '<div class="top"><b>' + esc(m.title) + '</b><span class="poc">' + esc(FR.POC.toUpperCase()) + '</span><span class="grow"></span>' + jump + '</div>\n' +
      '<div class="wrap">' + nav + '<main>' + body + '</main></div>\n' +
      '<div class="lb" id="lb" role="dialog" aria-label="Photograph"><button class="x" type="button" aria-label="Close">×</button><button class="pv" type="button" aria-label="Previous">‹</button><button class="nx" type="button" aria-label="Next">›</button><img alt=""><p></p></div>\n' +
      '<script>\n' + FR.WEB_JS + '\n<' + '/script>\n</body>\n</html>\n';   /* written in two parts: this file is also inlined into a page */
    return { blob: new Blob([doc], { type: 'text/html' }), missing: loaded.missing, images: loaded.images.size, text: o.keepText ? doc : undefined };
  };
  /* ------------------------------------------------------------------ renderer: PDF
   * Letter, portrait. Each room starts on a new page. A device profile (its fields beside its photographs) is kept on one
   * page whenever it fits on one; a heading is never left alone at the bottom of a page; tables repeat their header row
   * after a page break. Returns { blob, manifest, missing, pages }: the manifest says on which page each room, device,
   * photograph and punch list item was placed, so the result can be checked against the records. */
  const C = { navy: [15, 21, 34], accent: [47, 111, 235], accentSoft: [147, 187, 255], ink: [17, 24, 39], ink2: [55, 65, 81], muted: [107, 114, 128],
    faint: [150, 158, 172], line: [208, 213, 221], hair: [229, 231, 235], band: [246, 248, 251], photoBg: [238, 241, 245], white: [255, 255, 255], sub: [198, 208, 226] };
  const TONES = { ok: { fg: [21, 128, 61], bg: [232, 246, 238] }, warn: { fg: [154, 92, 6], bg: [253, 243, 222] }, danger: { fg: [185, 28, 28], bg: [253, 236, 236] },
    violet: { fg: [91, 79, 214], bg: [239, 237, 255] }, muted: { fg: [75, 85, 99], bg: [238, 241, 245] }, accent: { fg: [47, 111, 235], bg: [234, 241, 254] } };
  FR.pdf = async function (m, o) {
    o = o || {};
    const loaded = o.loaded || await FR.loadImages(m, o.quality || 'standard', o.onProgress);
    const imgs = loaded.images;
    const doc = EV.pdf.create({ title: m.title + ' — ' + m.where, author: m.preparedBy });
    const PW = doc.width, PH = doc.height, ML = 42, W = PW - ML * 2, TOP = 60, BOTTOM = PH - 52;
    const man = { pages: [], rooms: {}, devices: {}, photos: {}, punch: {}, consolidated: {} };
    const info = [];
    let y = 0, section = '';
    const pg = function () { return doc.pageCount() - 1; };
    const T = function (str, x, yy, o2) { doc.text(str, x, yy, o2); };
    const wrap = function (str, font, size, w) { return doc.wrap(String(str == null ? '' : str), font, size, w); };
    function newPage() { doc.page(); info.push({ section: section }); man.pages.push({ rooms: [], devices: [], photos: [], punch: [] }); y = TOP; }
    function ensure(hh) { if (y + hh > BOTTOM) { newPage(); return true; } return false; }
    function para(str, o2) {
      o2 = o2 || {};
      const size = o2.size || 9.2, lh = o2.lh || size * 1.42, x = o2.x || ML, w = o2.w || W;
      wrap(str, o2.font, size, w).forEach(function (l) { ensure(lh); T(l, x, y + size, { font: o2.font, size: size, color: o2.color || C.ink }); y += lh; });
      y += o2.after == null ? 5 : o2.after;
    }
    function h1(text) {
      ensure(90);
      T(text, ML, y + 18, { font: 'bold', size: 19, color: C.navy }); y += 27;
      doc.rect(ML, y, 42, 3, { fill: C.accent }); doc.line(ML + 42, y + 1.5, ML + W, y + 1.5, { color: C.line, width: 0.6 }); y += 16;
    }
    function h3(text, right, keep) {
      ensure(30 + (keep || 40));
      T(text, ML, y + 11, { font: 'bold', size: 11.5, color: C.navy });
      if (right) T(right, ML + W, y + 11, { size: 8.3, color: C.muted, align: 'right' });
      y += 17; doc.line(ML, y, ML + W, y, { color: C.line, width: 0.6 }); y += 8;
    }
    function pillWidth(text, size) { return doc.textWidth(String(text).toUpperCase(), 'bold', size || 6.8) + 12; }
    function pill(text, x, yy, tone, o2) {
      o2 = o2 || {};
      const tn = TONES[tone] || TONES.muted, str = String(text).toUpperCase(), size = o2.size || 6.8;
      const w = pillWidth(text, size), hh = size + 6.5, lx = o2.right ? x - w : x;
      doc.rect(lx, yy, w, hh, { fill: o2.solid ? tn.fg : tn.bg });
      T(str, lx + 6, yy + size + 1.9, { font: 'bold', size: size, color: o2.solid ? C.white : tn.fg });
      return w;
    }
    function callout(text, tone) {
      const ls = wrap(text, 'regular', 8.8, W - 26), bh = ls.length * 11.8 + 14;
      ensure(bh + 6);
      doc.rect(ML, y, W, bh, { fill: C.band, stroke: C.line, lineWidth: 0.5 });
      doc.rect(ML, y, 3, bh, { fill: tone ? TONES[tone].fg : C.accent });
      ls.forEach(function (l, i) { T(l, ML + 13, y + 7 + 8.8 + i * 11.8, { size: 8.8, color: C.ink2 }); });
      y += bh + 10;
    }
    function bullets(list) {
      list.forEach(function (item) {
        const parts = Array.isArray(item) ? item : [null, item];
        const text = (parts[0] ? parts[0] + ': ' : '') + parts[1];
        const ls = wrap(text, 'regular', 8.9, W - 14);
        ensure(Math.min(ls.length, 3) * 12.4);
        ls.forEach(function (l, i) {
          ensure(12.4);
          if (i === 0) doc.rect(ML + 2, y + 4.6, 3.2, 3.2, { fill: C.accent });
          T(l, ML + 13, y + 8.9, { size: 8.9, color: C.ink });
          y += 12.4;
        });
        y += 3;
      });
      y += 4;
    }
    function tiles(items, per) {
      per = per || items.length;
      const gap = 8, bw = (W - gap * (per - 1)) / per, bh = 52;
      for (let i = 0; i < items.length; i += per) {
        ensure(bh + 8);
        items.slice(i, i + per).forEach(function (it, j) {
          const x = ML + j * (bw + gap), tn = it.tone ? TONES[it.tone] : null;
          doc.rect(x, y, bw, bh, { fill: C.band, stroke: C.line, lineWidth: 0.5 });
          doc.rect(x, y, 3, bh, { fill: tn ? tn.fg : C.navy });
          T(String(it.v), x + 11, y + 21, { font: 'bold', size: 16, color: tn ? tn.fg : C.navy });
          T(wrap(String(it.l).toUpperCase(), 'bold', 6.2, bw - 16)[0], x + 11, y + 33, { font: 'bold', size: 6.2, color: C.muted });
          if (it.s) T(wrap(it.s, 'regular', 6.9, bw - 16)[0], x + 11, y + 44, { size: 6.9, color: C.ink2 });
        });
        y += bh + 8;
      }
      y += 4;
    }
    /* cols: [{ l, w (share), mono, right }]; a cell is a string or { t, tone, nr, bold, onDraw(x, y, page) } */
    function table(cols, rows, o2) {
      o2 = o2 || {};
      const size = o2.size || 7.8, lh = size * 1.32, pad = 4.5;
      const tot = U.sum(cols, function (c) { return c.w; }), cw = cols.map(function (c) { return c.w / tot * W; });
      const header = function () {
        const ls = cols.map(function (c, i) { return wrap(c.l, 'bold', size, cw[i] - pad * 2); });
        const hh = Math.max.apply(null, ls.map(function (l) { return l.length; })) * lh + 8;
        doc.rect(ML, y, W, hh, { fill: C.navy });
        let x = ML;
        ls.forEach(function (l, i) { l.forEach(function (str, k) { T(str, cols[i].right ? x + cw[i] - pad : x + pad, y + 4.5 + size + k * lh, { font: 'bold', size: size, color: C.white, align: cols[i].right ? 'right' : undefined }); }); x += cw[i]; });
        y += hh;
      };
      ensure(48); header();
      rows.forEach(function (r, ri) {
        const cells = r.map(function (v, i) {
          const c = v && typeof v === 'object' ? Object.assign({}, v) : { t: v == null ? '' : String(v) };
          c.font = c.nr ? 'italic' : cols[i].mono ? 'mono' : c.bold ? 'bold' : 'regular';
          c.size = cols[i].mono && !c.nr ? size - 0.5 : size;
          c.asPill = !!c.tone && pillWidth(c.t, 6.2) <= cw[i] - pad * 2;
          c.lines = c.asPill ? [c.t] : wrap(c.t, c.tone ? 'bold' : c.font, c.size, cw[i] - pad * 2);
          return c;
        });
        const rh = Math.max.apply(null, cells.map(function (c) { return c.lines.length; })) * lh + 7;
        if (y + rh > BOTTOM) { newPage(); header(); }
        if (ri % 2 === 1) doc.rect(ML, y, W, rh, { fill: C.band });
        let x = ML;
        cells.forEach(function (c, i) {
          if (c.asPill) pill(c.t, x + pad, y + 3.6, c.tone, { size: 6.2 });
          else c.lines.forEach(function (str, k) {
            T(str, cols[i].right ? x + cw[i] - pad : x + pad, y + 4 + size + k * lh, { font: c.tone ? 'bold' : c.font, size: c.size,
              color: c.tone ? (TONES[c.tone] || TONES.muted).fg : c.nr ? C.faint : C.ink, align: cols[i].right ? 'right' : undefined });
          });
          if (c.onDraw) c.onDraw(cols[i].right ? x + cw[i] - pad : x + pad, y + 4 + size, pg());
          x += cw[i];
        });
        y += rh; doc.line(ML, y, ML + W, y, { color: C.hair, width: 0.5 });
      });
      y += 10;
    }
    function photo(e, x, yy, w, hh) {
      doc.rect(x, yy, w, hh, { fill: C.photoBg });
      const im = imgs.get(e.id);
      if (im) {
        const sc = Math.min(w / im.width, hh / im.height), dw = im.width * sc, dh = im.height * sc;
        doc.image(im.bytes, im.width, im.height, x + (w - dw) / 2, yy + (hh - dh) / 2, dw, dh);
      } else {
        T('Image file not available', x + w / 2, yy + hh / 2 - 2, { size: 7.4, color: C.muted, align: 'center' });
        T(e.code, x + w / 2, yy + hh / 2 + 9, { font: 'bold', size: 7.4, color: C.muted, align: 'center' });
      }
      doc.rect(x, yy, w, hh, { stroke: C.line, lineWidth: 0.5 });
      (man.photos[e.id] = man.photos[e.id] || []).push(pg());
      man.pages[pg()].photos.push(e.code);
    }
    function capLines(e, w, max) { return wrap(e.caption, 'regular', 6.8, w).slice(0, max || 2); }
    function capHeight(e, w, max) { return 9 + capLines(e, w, max).length * 8.4 + 2; }
    function caption(e, x, yy, w, max) {
      T(e.code, x, yy + 8, { font: 'bold', size: 6.9, color: C.ink });
      if (e.taken) T(d1(e.taken), x + w, yy + 8, { size: 6.6, color: C.muted, align: 'right' });
      capLines(e, w, max).forEach(function (l, i) { T(l, x, yy + 16.6 + i * 8.4, { size: 6.8, color: C.ink2 }); });
      return capHeight(e, w, max);
    }
    function gallery(list, per, o2) {
      o2 = o2 || {};
      const gap = 10, cw = (W - gap * (per - 1)) / per, ih = cw * (o2.ratio || 0.75);
      for (let i = 0; i < list.length; i += per) {
        const row = list.slice(i, i + per);
        const ch = Math.max.apply(null, row.map(function (e) { return capHeight(e, cw); }));
        ensure(ih + ch + 8);
        row.forEach(function (e, j) {
          const x = ML + j * (cw + gap);
          photo(e, x, y, cw, ih);
          if (o2.label) { T(wrap(o2.label(e), 'bold', 7.2, cw)[0], x, y + ih + 9, { font: 'bold', size: 7.2, color: C.navy }); T(e.code, x, y + ih + 18, { size: 6.8, color: C.muted }); }
          else caption(e, x, y + ih + 1, cw);
        });
        y += ih + (o2.label ? 22 : ch) + 10;
      }
    }
    /* two columns of label-above-value cells; a long field takes the full width */
    function facts(list) {
      const gap = 22, cw = (W - gap) / 2;
      const cell = function (f, w) { return { f: f, lines: wrap(f.value, f.recorded ? (f.mono ? 'mono' : 'regular') : 'italic', f.mono && f.recorded ? 8.1 : 8.6, w) }; };
      let i = 0;
      while (i < list.length) {
        const a = list[i];
        const pair = !a.long && list[i + 1] && !list[i + 1].long ? [a, list[i + 1]] : [a];
        const cells = pair.map(function (f) { return cell(f, pair.length === 2 ? cw : W); });
        const rh = 11 + Math.max.apply(null, cells.map(function (c) { return c.lines.length; })) * 11 + 6;
        ensure(rh);
        cells.forEach(function (c, k) {
          const x = ML + k * (cw + gap);
          T(c.f.label.toUpperCase(), x, y + 8, { font: 'bold', size: 6.2, color: C.muted });
          c.lines.forEach(function (l, li) { T(l, x, y + 19 + li * 11, { font: c.f.recorded ? (c.f.mono ? 'mono' : 'regular') : 'italic', size: c.f.mono && c.f.recorded ? 8.1 : 8.6, color: c.f.recorded ? C.ink : C.faint }); });
        });
        y += rh;
        doc.line(ML, y - 3, ML + W, y - 3, { color: C.hair, width: 0.4 });
        i += pair.length;
      }
      y += 4;
    }
    function alsoNot(list, w) {
      if (!list.length) return;
      wrap('Also not recorded: ' + list.join(', ') + '.', 'italic', 7, w || W).forEach(function (l) { ensure(9); T(l, ML, y + 7, { font: 'italic', size: 7, color: C.muted }); y += 9; });
      y += 6;
    }
    function deviceBlock(d, r) {
      const gap = 16, RW = 206, LW = W - RW - gap, KW = 104, VW = LW - KW - 8, fsz = 7.9, flh = 10.2;
      const rows = [];
      let g0 = null;
      d.fields.forEach(function (f) {
        if (f.group !== g0) { rows.push({ g: f.group, h: 15 }); g0 = f.group; }
        const font = !f.recorded ? 'italic' : f.mono ? 'mono' : 'regular', size = f.mono && f.recorded ? fsz - 0.4 : fsz;
        const vl = wrap(f.value, font, size, VW), kl = wrap(f.label, 'regular', 7.1, KW), nl = f.note ? wrap(f.note, 'regular', 6.5, VW) : [];
        rows.push({ f: f, font: font, size: size, vl: vl, kl: kl, nl: nl, h: Math.max(kl.length * 8.8, vl.length * flh + nl.length * 8.2) + 4.5 });
      });
      const miss = d.missing.length ? wrap('Also not recorded: ' + d.missing.join(', ') + '.', 'italic', 6.8, LW) : [];
      const leftH = U.sum(rows, function (x) { return x.h; }) + (miss.length ? miss.length * 8.6 + 8 : 0);
      const MAIN_H = RW * 0.75, SW = (RW - 8) / 2, SH = SW * 0.75;
      const main = d.photos[0], inline = d.photos.slice(1, 7), overflow = d.photos.slice(7);
      const smallRows = [];
      for (let i = 0; i < inline.length; i += 2) smallRows.push(inline.slice(i, i + 2));
      const smallH = smallRows.map(function (row) { return SH + Math.max.apply(null, row.map(function (e) { return capHeight(e, SW, 1); })) + 6; });
      const rightH = main ? MAIN_H + capHeight(main, RW, 3) + 8 + U.sum(smallH, function (v) { return v; }) : 70;
      const HEAD = 36, total = HEAD + 10 + Math.max(leftH, rightH) + 14;
      ensure(total <= BOTTOM - TOP ? total : HEAD + 10 + rightH);
      man.devices[d.code] = { page: pg(), room: r.id, photoPages: [] };
      man.pages[pg()].devices.push(d.code);
      doc.rect(ML, y, W, HEAD, { fill: C.band }); doc.rect(ML, y, 3, HEAD, { fill: C.accent });
      const sw = pillWidth(d.statusLabel, 6.6);
      T(wrap(d.title, 'bold', 11.2, W - sw - 40)[0], ML + 12, y + 15, { font: 'bold', size: 11.2, color: C.navy });
      T(d.code, ML + 12, y + 28, { font: 'mono', size: 7.6, color: C.ink2 });
      T('·  ' + d.type, ML + 12 + doc.textWidth(d.code, 'mono', 7.6) + 6, y + 28, { size: 7.6, color: C.muted });
      pill(d.statusLabel, ML + W - 10, y + 11, TONE[d.status], { right: true, size: 6.6 });
      y += HEAD + 10;
      const startPage = pg(), rx = ML + LW + gap;
      let ry = y;
      if (main) {
        photo(main, rx, ry, RW, MAIN_H); man.devices[d.code].photoPages.push(pg());
        ry += MAIN_H + 1; ry += caption(main, rx, ry, RW, 3) + 6;
        smallRows.forEach(function (row, ri) {
          row.forEach(function (e, j) { const x = rx + j * (SW + 8); photo(e, x, ry, SW, SH); man.devices[d.code].photoPages.push(pg()); caption(e, x, ry + SH + 1, SW, 1); });
          ry += smallH[ri];
        });
      } else {
        doc.rect(rx, ry, RW, 62, { fill: C.band, stroke: C.line, lineWidth: 0.5 });
        T('No photograph captured', rx + RW / 2, ry + 28, { font: 'bold', size: 8, color: C.muted, align: 'center' });
        T('for this device', rx + RW / 2, ry + 39, { size: 7.5, color: C.muted, align: 'center' });
        ry += 70;
      }
      rows.forEach(function (x, i) {
        const nextH = x.g && rows[i + 1] ? rows[i + 1].h : 0;
        if (y + x.h + nextH > BOTTOM) newPage();
        if (x.g) { T(x.g.toUpperCase(), ML, y + 10, { font: 'bold', size: 6.5, color: C.accent }); y += x.h; return; }
        x.kl.forEach(function (l, k) { T(l, ML, y + 8 + k * 8.8, { size: 7.1, color: C.muted }); });
        x.vl.forEach(function (l, k) { T(l, ML + KW + 8, y + 8 + k * flh, { font: x.font, size: x.size, color: x.f.recorded ? C.ink : C.faint }); });
        x.nl.forEach(function (l, k) { T(l, ML + KW + 8, y + 7.4 + x.vl.length * flh + k * 8.2, { size: 6.5, color: x.f.verified ? TONES.ok.fg : TONES.warn.fg }); });
        y += x.h;
        doc.line(ML, y - 2, ML + LW, y - 2, { color: C.hair, width: 0.4 });
      });
      if (miss.length) { y += 4; miss.forEach(function (l) { ensure(9); T(l, ML, y + 7, { font: 'italic', size: 6.8, color: C.muted }); y += 8.6; }); }
      if (pg() === startPage) y = Math.max(y, ry);
      y += 6; doc.line(ML, y, ML + W, y, { color: C.line, width: 0.8 }); y += 14;
      if (overflow.length) {
        ensure(30 + W / 4);
        T('More photographs of ' + d.code + ' (' + overflow.length + ')', ML, y + 9, { font: 'bold', size: 8.5, color: C.navy }); y += 15;
        gallery(overflow, 4);
        overflow.forEach(function (e) { man.devices[d.code].photoPages.push(man.photos[e.id][man.photos[e.id].length - 1]); });
      }
    }
    function punchCard(p) {
      const tw = W - 26, colW = (tw - 18) / 2;
      const tl = wrap(p.text, 'bold', 9.6, tw - 150);
      const meta = [['To be resolved by', p.party, false], ['Related device', p.device || 'None recorded', !p.device],
        ['Date identified', dt(p.added) + (p.addedBy ? ' · ' + p.addedBy : ''), false], ['Resolved', p.open ? 'Open' : (dt(p.resolvedAt) || 'Resolved') + (p.resolvedBy ? ' · ' + p.resolvedBy : ''), p.open]];
      const ml = meta.map(function (x) { return wrap(x[1], x[2] ? 'italic' : 'regular', 7.9, colW); });
      const rowH = [0, 2].map(function (i) { return 8 + Math.max(ml[i].length, ml[i + 1].length) * 10; });
      const nl = p.notes ? wrap(p.notes, 'regular', 7.9, tw) : [];
      const hh = 10 + tl.length * 12.4 + 6 + rowH[0] + rowH[1] + (nl.length ? 9 + nl.length * 10 : 0) + 8;
      ensure(hh + 8);
      const tone = p.open ? TONES.warn : TONES.ok;
      doc.rect(ML, y, W, hh, { stroke: C.line, lineWidth: 0.5 }); doc.rect(ML, y, 3.5, hh, { fill: tone.fg });
      pill(p.status, ML + W - 10, y + 8, p.open ? 'warn' : 'ok', { right: true, size: 6.6 });
      T(p.code, ML + W - 18 - pillWidth(p.status, 6.6), y + 15.5, { font: 'mono', size: 7.4, color: C.muted, align: 'right' });
      let yy = y + 10;
      tl.forEach(function (l, i) { T(l, ML + 14, yy + 9.6 + i * 12.4, { font: 'bold', size: 9.6, color: C.ink }); });
      yy += tl.length * 12.4 + 6;
      [0, 2].forEach(function (i, ri) {
        [i, i + 1].forEach(function (k, c) {
          const x = ML + 14 + c * (colW + 18);
          T(meta[k][0].toUpperCase(), x, yy + 6, { font: 'bold', size: 6, color: C.muted });
          ml[k].forEach(function (l, li) { T(l, x, yy + 16 + li * 10, { font: meta[k][2] ? 'italic' : 'regular', size: 7.9, color: meta[k][2] ? C.faint : C.ink }); });
        });
        yy += rowH[ri];
      });
      if (nl.length) { T('NOTES', ML + 14, yy + 6, { font: 'bold', size: 6, color: C.muted }); nl.forEach(function (l, li) { T(l, ML + 14, yy + 16 + li * 10, { size: 7.9, color: C.ink }); }); }
      man.punch[p.code] = pg(); man.pages[pg()].punch.push(p.code);
      y += hh + 8;
    }
    const t = m.totals;
    /* ---- cover */
    newPage();
    const band = 338;
    doc.rect(0, 0, PW, band, { fill: C.navy }); doc.rect(0, band, PW, 5, { fill: C.accent });
    let cy = 62;
    if (m.org) { T(m.org.toUpperCase(), ML, cy, { font: 'bold', size: 10, color: C.white }); cy += 16; }
    T('EAVI  ·  AV ENVIRONMENT INTELLIGENCE', ML, cy, { font: 'bold', size: 8.5, color: C.accentSoft }); cy += 22;
    pill(FR.POC, ML, cy, 'accent', { solid: true, size: 8 }); cy += 70;
    T(m.floorLabel, ML, cy, { font: 'bold', size: 46, color: C.white }); cy += 38;
    T(FR.TITLE, ML, cy, { size: 28, color: C.white }); cy += 28;
    wrap([m.building, m.designation].filter(Boolean).join('  ·  ') || m.floorLabel, 'regular', 12.5, W).forEach(function (l) { T(l, ML, cy, { size: 12.5, color: C.sub }); cy += 16; });
    T('Generated ' + dt(m.generatedAt) + (m.preparedBy ? '  ·  Prepared by ' + m.preparedBy : ''), ML, band - 24, { size: 9, color: C.sub });
    doc.bookmark('Cover', { y: 0 });
    y = band + 28;
    const meta = [['Building', m.building || NR], ['Floor', m.floorNumber + (m.designation ? ' — ' + m.designation : '')], ['Rooms audited', String(t.rooms)],
      ['Report type', FR.POC + ' — generated from EAVI records'], ['Data as of', m.dataAsOf ? 'Last synchronised ' + dt(m.dataAsOf) : 'Records on the generating device'],
      ['Application', FR.PRODUCT + ' ' + m.appVersion]].concat(m.buildingAddress ? [['Address', m.buildingAddress]] : []).concat(m.org ? [['Organization', m.org]] : []);
    const mh = Math.ceil(meta.length / 2) * 26 + 14, mw = (W - 30) / 2;
    doc.rect(ML, y, W, mh, { fill: C.band, stroke: C.line, lineWidth: 0.5 });
    meta.forEach(function (x, i) {
      const mx = ML + 14 + (i % 2) * (mw + 14), my = y + 10 + Math.floor(i / 2) * 26;
      T(x[0].toUpperCase(), mx, my + 7, { font: 'bold', size: 6.2, color: C.muted });
      T(wrap(x[1], 'bold', 8.8, mw - 4)[0], mx, my + 18.5, { font: 'bold', size: 8.8, color: C.ink });
    });
    y += mh + 16;
    tiles([{ v: t.rooms, l: 'Rooms audited', s: t.roomsByStatus.complete + ' marked complete' }, { v: t.devices, l: 'AV devices identified', s: t.listed ? t.listed + ' more listed, not yet seen' : U.plural(t.withPhoto, 'device') + ' photographed' },
      { v: t.photos.total, l: 'Photographs captured', s: t.photos.room + ' room · ' + t.photos.device + ' device' }, { v: t.punch.total, l: 'Punch list items', s: t.punch.open + ' open · ' + t.punch.resolved + ' resolved', tone: t.punch.open ? 'warn' : null }], 4);
    if (m.demo) callout('DEMO DATA — this report contains synthetic records created for evaluation. It does not describe a real environment.', 'warn');
    y = Math.max(y, BOTTOM - 74);
    callout('Confidential. This report contains infrastructure information such as device network addresses and identifiers. Share it only with people who need it. ' +
      'Every value comes from the EAVI records; “Not recorded” means no value was entered.');
    /* ---- executive overview */
    section = 'Executive overview'; newPage(); doc.bookmark('Executive overview', { y: y });
    h1('Executive overview');
    para(FR.WHAT, { size: 9.3, color: C.ink2, after: 10 });
    tiles([{ v: t.rooms, l: 'Rooms audited', s: t.roomsByStatus.complete + ' of ' + t.rooms + ' marked complete' }, { v: t.devices, l: 'AV devices identified', s: t.statuses.verified + ' manually verified' },
      { v: t.ids.slots ? t.ids.pct + '%' : '—', l: 'Identifier fields completed', s: t.ids.stated + ' of ' + t.ids.slots + ' · ' + t.ids.verified + ' verified' }, { v: t.photos.total, l: 'Photographs captured', s: t.photos.room + ' room · ' + t.photos.device + ' device' }], 4);
    h3('Condition and completeness of the collected information');
    bullets(FR.summary(m));
    h3('Punch list', null, 70);
    {
      const half = (W - 20) / 2, rowsA = [['Open', t.punch.open], ['Resolved', t.punch.resolved], ['Total', t.punch.total]],
        rowsB = [['Internal AV support', t.punch.internal], ['AV integrator', t.punch.integrator], ['Not yet assigned', t.punch.unassigned]];
      ensure(4 * 17 + 10);
      [[rowsA, 'By status'], [rowsB, 'By who resolves it']].forEach(function (blk, b) {
        const x = ML + b * (half + 20);
        doc.rect(x, y, half, 17, { fill: C.navy }); T(blk[1], x + 8, y + 11.5, { font: 'bold', size: 7.8, color: C.white });
        blk[0].forEach(function (rw, i) {
          const yy = y + 17 + i * 17;
          if (i % 2 === 1) doc.rect(x, yy, half, 17, { fill: C.band });
          T(rw[0], x + 8, yy + 11.5, { size: 8.2, font: i === 2 && b === 0 ? 'bold' : 'regular', color: C.ink });
          T(String(rw[1]), x + half - 8, yy + 11.5, { font: 'bold', size: 8.2, color: C.navy, align: 'right' });
          doc.line(x, yy + 17, x + half, yy + 17, { color: C.hair, width: 0.5 });
        });
      });
      y += 4 * 17 + 14;
    }
    h3('Information recorded per device', null, 80);
    table([{ l: 'Field', w: 3.2 }, { l: 'Value recorded', w: 1.1, right: true }, { l: 'Stated not applicable / not accessible', w: 1.7, right: true }, { l: 'Not recorded', w: 1.1, right: true }, { l: 'Devices', w: 0.9, right: true }],
      m.fieldUse.map(function (f) { return [f.label + (f.note ? ' (' + f.note + ')' : ''), String(f.value), String(f.stated), String(f.none), String(f.of)]; }), { size: 7.6 });
    /* ---- floor summary */
    section = 'Floor summary'; newPage(); doc.bookmark('Floor summary', { y: y });
    h1('Floor summary');
    const pageCells = {};
    table([{ l: 'Room', w: 2.2 }, { l: 'Room name', w: 1.3 }, { l: 'Type', w: 1.6 }, { l: 'Inventory', w: 1.25 }, { l: 'Devices', w: 0.85, right: true }, { l: 'Photos', w: 0.8, right: true },
      { l: 'Identifier fields completed', w: 1.3, right: true }, { l: 'Punch items', w: 1.15, right: true }, { l: 'Page', w: 0.6, right: true }],
      m.rooms.map(function (r) {
        return [{ t: r.number || r.label, bold: true }, r.name ? r.name : { t: NR, nr: true }, r.type || { t: NR, nr: true }, { t: r.invLabel, tone: TONE[r.invStatus] },
          String(r.devices.length) + (r.listed.length ? ' + ' + r.listed.length : ''), String(r.stats.photos), r.stats.ids.slots ? r.stats.ids.stated + '/' + r.stats.ids.slots + ' (' + r.stats.ids.pct + '%)' : '—',
          r.punch.length ? r.stats.punchOpen + ' open / ' + r.punch.length : '0', { t: '', onDraw: function (x, yy, page) { pageCells[r.id] = { x: x, y: yy, page: page }; } }];
      }));
    h3('Room photographs', m.rooms.filter(function (r) { return r.photos.length; }).length + ' of ' + m.rooms.length + ' rooms photographed', W / 3);
    const withPhoto = m.rooms.filter(function (r) { return r.photos.length; });
    if (withPhoto.length) gallery(withPhoto.map(function (r) { return Object.assign({}, r.photos[0], { _room: r.label }); }), 3, { label: function (e) { return e._room; } });
    const without = m.rooms.filter(function (r) { return !r.photos.length; }).map(function (r) { return r.label; });
    if (without.length) callout('No photograph of the room itself was captured for: ' + without.join(', ') + '.');
    if (m.floorPhotos.length) { h3('Photographs of the floor', String(m.floorPhotos.length), W / 3); gallery(m.floorPhotos, 3); }
    /* ---- rooms */
    let roomsMark = null;
    m.rooms.forEach(function (r) {
      section = r.label; newPage();
      if (roomsMark == null) roomsMark = doc.bookmark('Rooms', { y: y });
      doc.bookmark(r.label, { parent: roomsMark, y: y });
      man.rooms[r.id] = { page: pg() }; man.pages[pg()].rooms.push(r.label);
      const tl = wrap(r.label, 'bold', 20, W - 170);
      const sub = [r.type, r.code].filter(Boolean).join('  ·  ');
      const bh = 32 + tl.length * 23 + (sub ? 14 : 0);
      doc.rect(ML, y, W, bh, { fill: C.navy }); doc.rect(ML, y + bh, W, 3, { fill: C.accent });
      T(('Room ' + (r.index + 1) + ' of ' + m.rooms.length + '  ·  ' + m.where).toUpperCase(), ML + 16, y + 17, { font: 'bold', size: 6.8, color: C.accentSoft });
      tl.forEach(function (l, i) { T(l, ML + 16, y + 40 + i * 23, { font: 'bold', size: 20, color: C.white }); });
      if (sub) T(sub, ML + 16, y + 40 + (tl.length - 1) * 23 + 15, { size: 8.5, color: C.sub });
      pill('Inventory ' + r.invLabel, ML + W - 14, y + 12, TONE[r.invStatus], { right: true, solid: true, size: 6.8 });
      y += bh + 15;
      tiles([{ v: r.stats.devices, l: 'Devices recorded', s: r.listed.length ? r.listed.length + ' listed, not yet seen' : r.stats.withPhoto + ' photographed' }, { v: r.stats.photos, l: 'Photographs', s: r.stats.roomPhotos + ' of the room' },
        { v: r.stats.ids.slots ? r.stats.ids.pct + '%' : '—', l: 'Identifier fields completed', s: r.stats.ids.slots ? r.stats.ids.stated + ' of ' + r.stats.ids.slots + ' · ' + r.stats.ids.verified + ' verified' : '' },
        { v: r.stats.punchOpen, l: 'Punch items open', tone: r.stats.punchOpen ? 'warn' : null }, { v: r.punch.length - r.stats.punchOpen, l: 'Punch items resolved', tone: r.punch.length - r.stats.punchOpen ? 'ok' : null }], 5);
      h3('Room details');
      facts(r.fields.concat([{ k: '_last', label: 'Last device activity', value: r.lastActivity ? dt(r.lastActivity) : NR, recorded: !!r.lastActivity }])
        .concat(r.audits.length ? [{ k: '_audits', label: 'Audit records', value: r.audits.join('\n'), recorded: true, long: true }] : []));
      alsoNot(r.missing);
      h3('Room photographs', String(r.photos.length), r.photos.length ? 190 : 40);
      if (r.photos.length) gallery(r.photos, r.photos.length > 4 ? 3 : 2);
      else callout('No photographs of the room itself were captured.');
      h3('AV device inventory', U.plural(r.devices.length, 'device'), 60);
      if (r.devices.length) {
        table([{ l: 'Asset ID', w: 1.35, mono: true }, { l: 'Category', w: 1.5 }, { l: 'Manufacturer / model', w: 2.2 }, { l: 'Serial number', w: 1.55, mono: true }, { l: 'IP address', w: 1.25, mono: true },
          { l: 'MAC address', w: 1.6, mono: true }, { l: 'Status', w: 1.45 }],
          r.devices.map(function (d) {
            return [d.code, d.type, d.title, d.serial || { t: NR, nr: true }, d.ip || { t: NR, nr: true }, d.mac || { t: NR, nr: true }, { t: d.statusLabel, tone: TONE[d.status] }];
          }), { size: 7.4 });
        r.devices.forEach(function (d) { deviceBlock(d, r); });
      } else callout('No devices are recorded in this room.');
      if (r.listed.length) {
        h3('Equipment named in the room details — not yet seen', String(r.listed.length));
        para('Created from the room\'s display, camera and microphone details. Not yet confirmed in the room.', { size: 8, color: C.muted });
        table([{ l: 'Asset ID', w: 1.3, mono: true }, { l: 'Category', w: 1.4 }, { l: 'Listed as', w: 2.6 }, { l: 'Manufacturer', w: 1.3 }, { l: 'Model', w: 1.5 }, { l: 'Presence', w: 1.5 }],
          r.listed.map(function (d) { return [d.code, d.type, d.listedText || '—', d.manufacturer || '—', d.model || '—', d.presence]; }));
        const lp = [].concat.apply([], r.listed.map(function (d) { return d.photos; }));
        if (lp.length) gallery(lp, 4);
      }
      if (r.pending.length) {
        h3('Device captures awaiting review', String(r.pending.length));
        para('Photographs of a device taken in this room that has not yet been confirmed as an asset.', { size: 8, color: C.muted });
        r.pending.forEach(function (c) {
          ensure(40); T(c.status + (c.started ? ' · started ' + dt(c.started) : ''), ML, y + 9, { font: 'bold', size: 8.2, color: C.ink }); y += 15;
          if (c.photos.length) gallery(c.photos, 4); else para('No photographs in this capture.', { size: 8, color: C.muted });
        });
      }
      h3('Room punch list', r.punch.length ? r.stats.punchOpen + ' open · ' + (r.punch.length - r.stats.punchOpen) + ' resolved' : 'none', 70);
      if (r.punch.length) r.punch.forEach(punchCard); else callout(FR.NO_PUNCH);
    });
    /* ---- consolidated punch list */
    section = 'Consolidated punch list'; newPage(); doc.bookmark('Consolidated punch list', { y: y });
    h1('Consolidated ' + m.floorLabel + ' punch list');
    tiles([{ v: t.punch.total, l: 'Total items' }, { v: t.punch.open, l: 'Open', tone: t.punch.open ? 'warn' : null }, { v: t.punch.resolved, l: 'Resolved', tone: t.punch.resolved ? 'ok' : null },
      { v: t.punch.internal, l: 'Internal AV support' }, { v: t.punch.integrator, l: 'AV integrator' }, { v: t.punch.unassigned, l: 'Not yet assigned' }], 6);
    para('Priority is not recorded for punch list items in EAVI, so none is shown. “To be resolved by” is the party that owns the item.', { size: 8.2, color: C.muted, after: 8 });
    const pcols = [{ l: 'Room', w: 1.6 }, { l: 'Item', w: 1.55, mono: true }, { l: 'What needs to be put right', w: 3.3 }, { l: 'Related device', w: 1.65 }, { l: 'Status', w: 1.0 },
      { l: 'To be resolved by', w: 1.3 }, { l: 'Date identified', w: 1.1 }];
    const prow = function (p) { man.consolidated[p.code] = pg(); return [{ t: p.roomLabel, bold: true }, p.code, p.text, p.device || { t: '—', nr: true }, { t: p.status, tone: p.open ? 'warn' : 'ok' }, p.party, d1(p.added)]; };
    const openP = m.punch.filter(function (p) { return p.open; }), doneP = m.punch.filter(function (p) { return !p.open; });
    h3('Open items', String(openP.length), 60);
    if (openP.length) table(pcols, openP.map(function (p) { const row = prow(p); return row; }), { size: 7.4 }); else callout('No open punch list items are recorded on this floor.');
    if (doneP.length) { h3('Resolved items', String(doneP.length), 60); table(pcols, doneP.map(prow), { size: 7.4 }); }
    else para('Resolved items: none are recorded on this floor.', { size: 8.5, color: C.muted });
    /* ---- notes */
    section = 'Report notes'; newPage(); doc.bookmark('Report notes', { y: y });
    h1('Report notes');
    h3('Source');
    bullets(['Generated by ' + FR.PRODUCT + ' ' + m.appVersion + ' on ' + dt(m.generatedAt) + (m.preparedBy ? ' by ' + m.preparedBy : '') + '.',
      'Source of the records: ' + m.syncLabel + (m.dataAsOf ? ', last synchronised ' + dt(m.dataAsOf) : '') + '. The report shows the records as they were at that time. Generating it changed no room, device, photograph or punch list record.',
      '“Not recorded” means no value was entered in EAVI. “Not accessible / unavailable” and “Not applicable” are statements recorded by the auditor. Verification statuses are derived by EAVI from the recorded values.']);
    h3('Fields EAVI does not record');
    bullets(m.unavailable);
    h3('Records on this floor that are not shown');
    const ex = m.excluded, exList = [];
    if (ex.archivedRooms.length) exList.push(['Archived rooms', ex.archivedRooms.join(', ')]);
    if (ex.archivedDevices.length) exList.push([U.plural(ex.archivedDevices.length, 'archived device record'), 'taken out of the inventory by the auditor: ' +
      ex.archivedDevices.map(function (d) { return d.code + (d.room ? ' in ' + d.room : '') + (d.photos.length ? ' (' + U.plural(d.photos.length, 'photograph') + ': ' + d.photos.join(', ') + ')' : ''); }).join('; ')]);
    if (ex.otherPhotos.length) exList.push([U.plural(ex.otherPhotos.length, 'other photograph'), ex.otherPhotos.map(function (p) { return p.code + ' (' + p.reason + ')'; }).join('; ')]);
    if (exList.length) bullets(exList); else para('None: every room, device and photograph recorded on this floor is in the report.', { size: 8.9 });
    h3('Photographs');
    para(loaded.missing.length ? U.plural(loaded.missing.length, 'photograph') + ' could not be loaded when this report was generated and ' + (loaded.missing.length === 1 ? 'is' : 'are') +
      ' shown as “Image file not available”: ' + loaded.missing.map(function (x) { return x.code; }).join(', ') + '.' : 'All ' + U.plural(FR.photoIds(m).length, 'photograph') + ' are included, each with its own record ID.', { size: 8.9 });
    /* ---- page numbers in the floor summary, headers and footers */
    m.rooms.forEach(function (r) { const c = pageCells[r.id]; if (c && man.rooms[r.id]) { doc.setPage(c.page); T(String(man.rooms[r.id].page + 1), c.x, c.y, { font: 'bold', size: 7.8, color: C.accent, align: 'right' }); } });
    const total = doc.pageCount();
    for (let i = 0; i < total; i++) {
      doc.setPage(i);
      if (i > 0) {
        T(m.title, ML, 33, { font: 'bold', size: 7.6, color: C.navy });
        T('·  ' + FR.POC.toUpperCase(), ML + doc.textWidth(m.title, 'bold', 7.6) + 6, 33, { font: 'bold', size: 6.4, color: C.accent });
        if (info[i].section) T(U.trunc(info[i].section, 64), ML + W, 33, { size: 7.6, color: C.muted, align: 'right' });
        doc.line(ML, 40, ML + W, 40, { color: C.line, width: 0.6 });
      }
      doc.line(ML, PH - 38, ML + W, PH - 38, { color: C.line, width: 0.6 });
      T(FR.PRODUCT + '  ·  ' + m.where + '  ·  Generated ' + d1(m.generatedAt), ML, PH - 26, { size: 6.8, color: C.muted });
      T('Confidential — contains infrastructure information' + (m.demo ? '  ·  DEMO DATA' : ''), ML, PH - 17, { size: 6.8, color: m.demo ? TONES.warn.fg : C.muted });
      T('Page ' + (i + 1) + ' of ' + total, ML + W, PH - 26, { font: 'bold', size: 7.4, color: C.navy, align: 'right' });
    }
    return { blob: doc.finish(), manifest: man, missing: loaded.missing, pages: total, images: imgs.size };
  };

  /* Generates and saves one export: 'pdf' or 'html'. o: { quality, onProgress }. Records the export in the activity log
     (as every other report does); no other record is touched. */
  FR.download = async function (m, format, o) {
    o = o || {};
    const loaded = await FR.loadImages(m, o.quality || 'standard', o.onProgress);
    const out = format === 'html' ? await FR.html(m, { loaded: loaded }) : await FR.pdf(m, { loaded: loaded });
    const ext = format === 'html' ? 'html' : 'pdf', mime = format === 'html' ? 'text/html' : 'application/pdf';
    const name = m.filename + (format === 'html' ? '_web' : '') + '.' + ext;
    const res = await EV.saveFile(out.blob, name, mime);
    if (res.ok) {
      try { store.log({ action: 'exported', entity_type: 'reports', floor_id: m.floorId, summary: m.title + ' (' + FR.POC.toLowerCase() + ') exported as ' + (format === 'html' ? 'web report' : 'PDF') + ' — ' + m.where }); } catch (e) { /* read-only account: nothing to log */ }
    }
    return Object.assign({ filename: name, size: out.blob.size }, res, { missing: out.missing, pages: out.pages });
  };
})();
