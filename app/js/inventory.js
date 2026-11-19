/* inventory.js — the asset inventory model: what an asset record is, how complete and how verified it is, where each of
 * its values came from, which records may be the same physical device, and the figures the inventory screens show.
 * An asset is a row of the devices table (its code, e.g. AVEI-DV-0012, is the asset ID). Nothing here invents a value:
 * a value is either recorded (with its source), stated as not accessible, stated as not applicable, or not captured yet. */
(function () {
  'use strict';
  const EV = window.EV, U = EV.U, S = EV.S, store = EV.store, R = EV.rules;
  const I = (EV.inv = {});

  /* ------------------------------------------------------------------ taxonomy (built-in + administrator's own) */
  function taxonomy(kind) { return store.all('asset_taxonomy').filter(function (t) { return t.kind === kind; }); }
  /* [[group, [names]]] — built-in categories not hidden by an administrator, then the administrator's own */
  I.categoryGroups = R.memo(function () {
    const rows = taxonomy('category');
    const hidden = new Set(rows.filter(function (t) { return t.archived; }).map(function (t) { return t.name; }));
    const custom = rows.filter(function (t) { return !t.archived && S.DEVICE_CATEGORIES.indexOf(t.name) < 0 && !U.blank(t.name); });
    const groups = S.CATEGORY_GROUPS.map(function (g) {
      const own = U.sortBy(custom.filter(function (t) { return (t.group_name || 'Other') === g[0]; }), function (t) { return t.name; }).map(function (t) { return t.name; });
      return [g[0], g[1].filter(function (n) { return !hidden.has(n); }).concat(own)];
    });
    const extra = U.groupBy(custom.filter(function (t) { return !S.CATEGORY_GROUPS.some(function (g) { return g[0] === (t.group_name || 'Other'); }); }), function (t) { return t.group_name; });
    extra.forEach(function (list, name) { groups.push([name, U.sortBy(list, function (t) { return t.name; }).map(function (t) { return t.name; })]); });
    return groups.filter(function (g) { return g[1].length; });
  });
  I.categories = function () { return [].concat.apply([], I.categoryGroups().map(function (g) { return g[1]; })); };
  /* the list offered in a form: the active categories, plus the record's own value if it has since been hidden */
  I.categoryOptions = function (current) {
    const list = I.categories();
    return current && list.indexOf(current) < 0 ? [current].concat(list) : list;
  };
  I.manufacturers = R.memo(function () {
    const rows = taxonomy('manufacturer');
    const hidden = new Set(rows.filter(function (t) { return t.archived; }).map(function (t) { return t.name.toLowerCase(); }));
    const names = S.MANUFACTURERS.concat(rows.filter(function (t) { return !t.archived; }).map(function (t) { return t.name; }));
    return U.uniq(names.filter(function (n) { return n && !hidden.has(n.toLowerCase()); })).sort(U.natCmp);
  });
  /* A category typed by hand: the existing entry when the name is already listed (whatever its capitals), otherwise
     a new entry in the shared list (group Other), so the next room offers it. Returns the name to store. */
  I.ensureCategory = function (name) {
    const n = String(name == null ? '' : name).replace(/\s+/g, ' ').trim();
    if (!n) return '';
    const hit = I.categories().find(function (c) { return c.toLowerCase() === n.toLowerCase(); });
    if (hit) return hit;
    const row = store.all('asset_taxonomy').find(function (t) { return t.kind === 'category' && String(t.name).toLowerCase() === n.toLowerCase(); });
    if (row) { if (!store.readOnly) store.update('asset_taxonomy', row.id, { archived: false }); return row.name; }
    const builtIn = S.DEVICE_CATEGORIES.find(function (c) { return c.toLowerCase() === n.toLowerCase(); });
    if (builtIn) return builtIn;
    if (!store.readOnly) store.create('asset_taxonomy', { kind: 'category', name: n, group_name: 'Other', archived: false, sort_order: null, notes: 'Added when a device was recorded' });
    return n;
  };
  /* who may change the shared lists: anyone on a device-only installation; the workspace administrator otherwise */
  I.canAdmin = function () {
    if (store.readOnly) return false;
    const sync = EV.sync && EV.sync.config ? EV.sync.config() : { mode: 'off' };
    if (sync.mode !== 'supabase') return true;
    return (EV.auth.profile().role || '') === 'admin';
  };

  /* ------------------------------------------------------------------ fields and their states */
  /* identifiers: value + status column (verified, not accessible, not applicable…) */
  I.ID_FIELDS = R.ID_FIELDS;
  /* the switch port a networked device is connected to: required once the device has an IP address */
  I.PORT = { k: 'switch_port', s: 'port_status', label: 'Switch port ID', short: 'Port' };
  I.IDS = I.ID_FIELDS.concat([I.PORT]);
  I.portRequired = function (d) { return !U.blank(d.ip_address); };
  I.ID_STATE_LABEL = { verified: 'Verified', captured: 'Captured — not verified', unavailable: 'Not accessible', na: 'Not applicable', not_captured: 'Not captured yet' };
  I.ID_STATE_TONE = { verified: 'ok', captured: 'warn', unavailable: 'muted', na: 'muted', not_captured: 'danger' };
  I.idState = function (d, f) {
    const st = d[f.s] || 'unknown';
    if (st === 'not_applicable') return 'na';
    if (!U.blank(d[f.k])) return st === 'verified_onsite' || st === 'verified_mgmt' ? 'verified' : 'captured';
    return st === 'unavailable' ? 'unavailable' : 'not_captured';
  };
  /* The fields an asset record is made of, in the order the screens show them. */
  I.FIELDS = [
    { k: 'category', label: 'Device category' }, { k: 'manufacturer', label: 'Manufacturer' }, { k: 'model', label: 'Model' },
    { k: 'serial_number', label: 'Serial number', id: true }, { k: 'mac_address', label: 'MAC address', id: true }, { k: 'ip_address', label: 'IP address', id: true }, { k: 'switch_port', label: 'Switch port ID', id: true },
    { k: 'notes', label: 'Notes' }
  ];
  I.SOURCED = I.FIELDS.map(function (f) { return f.k; });
  /* where each value came from; a value recorded before the inventory existed is an "existing record" */
  I.sources = function (d) {
    const own = d.field_sources && typeof d.field_sources === 'object' ? d.field_sources : {};
    const out = {};
    I.SOURCED.forEach(function (k) { if (!U.blank(d[k])) out[k] = own[k] || 'existing'; });
    return out;
  };
  I.sourceLabel = function (s) { return S.label(S.FIELD_SOURCES, s); };

  /* ------------------------------------------------------------------ verification and export status */
  const devCache = new WeakMap();
  I.asset = function (d) {
    /* cached per stored version: the result also depends on the room, floor, building and photographs */
    let r = devCache.get(d);
    if (r && r.v === store.version) return r;
    const states = {}, notCaptured = [], unverified = [];
    I.ID_FIELDS.forEach(function (f) {
      const s = I.idState(d, f);
      states[f.k] = s;
      if (s === 'not_captured') notCaptured.push(f.label);
      if (s === 'captured') unverified.push(f.label);
    });
    /* a device with an IP address must also have its switch port recorded (or stated as not accessible / not applicable) */
    if (I.portRequired(d)) {
      const ps = I.idState(d, I.PORT);
      states.switch_port = ps;
      if (ps === 'not_captured') notCaptured.push(I.PORT.label);
      if (ps === 'captured') unverified.push(I.PORT.label);
    } else states.switch_port = 'not_required';
    const invalid = [];
    if (!U.blank(d.ip_address) && !R.ipValid(d.ip_address)) invalid.push('IP address format');
    if (!U.blank(d.mac_address) && !R.macValid(d.mac_address)) invalid.push('MAC address format');
    const missingIdentity = [];
    if (U.blank(d.category)) missingIdentity.push('Category');
    if (U.blank(d.manufacturer)) missingIdentity.push('Manufacturer');
    if (U.blank(d.model)) missingIdentity.push('Model');
    const src = I.sources(d);
    let status;
    if (d.presence === 'listed' || d.presence === 'not_found') status = 'listed';
    else if (d.manual_review || missingIdentity.length) status = 'needs_identification';
    else if (!d.identity_confirmed_at) status = src.manufacturer === 'ai' || src.model === 'ai' ? 'ai_review' : 'partial';
    else if (!unverified.length && !notCaptured.length && !invalid.length) status = 'verified';
    else status = 'partial';
    const sig = I.signature(d);
    const exportState = !d.export_sig ? 'never' : d.export_sig === sig ? 'current' : 'changed';
    r = { states: states, notCaptured: notCaptured, unverified: unverified, invalid: invalid, missingIdentity: missingIdentity, status: status,
      incomplete: notCaptured.length > 0 || missingIdentity.length > 0, exportState: exportState, sources: src, signature: sig,
      aiUnverified: !d.identity_confirmed_at && (src.manufacturer === 'ai' || src.model === 'ai'), v: store.version };
    devCache.set(d, r);
    return r;
  };
  I.STATUS_TONE = { listed: 'muted', ai_review: 'violet', verified: 'ok', partial: 'warn', needs_identification: 'danger', exported: 'accent' };
  I.statusLabel = function (s) { return S.label(S.VERIFICATION, s); };
  I.EXPORT_LABEL = { never: 'Not exported', current: 'Exported', changed: 'Changed since export' };

  /* A short signature of everything an export can contain about an asset: when it differs from the one stored at the
     last export, the asset has changed since. (FNV-1a, two seeds; not a security measure.) */
  function fnv(s, seed) { let h = seed >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return ('0000000' + h.toString(16)).slice(-8); }
  I.hash = function (s) { s = String(s); return fnv(s, 2166136261) + fnv(s, 3141592653); };
  I.signature = function (d) {
    const room = store.getAny('rooms', d.room_id), floor = store.getAny('floors', d.floor_id), b = store.getAny('buildings', d.building_id);
    /* everything an export column can be made of (pages/integration.js, XA.SOURCES) */
    const photos = store.by('photos', 'device_id', d.id);
    const parts = I.SOURCED.map(function (k) { return d[k] == null ? '' : String(d[k]); })
      .concat([d.custom_category, d.firmware_version, d.ip_status, d.mac_status, d.serial_status, d.port_status || '', d.room_id, d.floor_id, d.building_id,
        room ? room.code + '|' + room.number + '|' + room.name + '|' + (room.department || '') : '',
        floor ? floor.number : '', b ? b.name + '|' + (b.identifier || '') + '|' + (b.address || '') : '', d.identity_confirmed_at || '', d.identity_confirmed_by || '',
        d.last_verified_at || '', JSON.stringify(d.field_sources || {}), d.manual_review ? '1' : '', d.archived ? '1' : '', d.presence || '',
        photos.length + '|' + photos.map(function (p) { return p.code; }).sort().join(',')]);
    return I.hash(parts.join('\u0001'));
  };

  /* ------------------------------------------------------------------ the assets */
  I.assets = R.liveAssets;
  /* seen in the room (captured or confirmed) */
  I.isListed = function (d) { return d.presence === 'listed' || d.presence === 'not_found'; };
  I.roomAssets = function (roomId) { return R.roomDevices(roomId); };
  /* known from the room's details, not yet seen */
  I.roomListed = function (roomId) { return U.sortBy(R.roomAssets(roomId).filter(function (d) { return d.presence === 'listed'; }), function (d) { return d.listed_text + ' ' + d.code; }); };
  /* identifications photographed but not yet confirmed or discarded */
  I.OPEN_IDENT = { draft: 1, analyzing: 1, ready: 1, failed: 1 };
  I.pending = R.memo(function () { return U.sortBy(store.all('asset_identifications').filter(function (x) { return I.OPEN_IDENT[x.status]; }), function (x) { return x.created_at; }, true); });
  I.roomPending = function (roomId) { return I.pending().filter(function (x) { return x.room_id === roomId; }); };

  /* ------------------------------------------------------------------ rooms */
  I.roomStatus = function (room) {
    if (room.inventory_status === 'complete') return 'complete';
    if (room.inventory_status === 'in_progress' || I.roomAssets(room.id).length || I.roomPending(room.id).length) return 'in_progress';
    return '';
  };
  I.ROOM_TONE = { '': 'muted', in_progress: 'warn', complete: 'ok' };
  I.roomStatusLabel = function (s) { return S.label(S.ROOM_INVENTORY, s); };
  I.roomLastDate = function (room) {
    let last = room.inventory_completed_at || '';
    I.roomAssets(room.id).forEach(function (d) { if (d.updated_at > last) last = d.updated_at; });
    return last || null;
  };
  I.liveRooms = function () { return R.liveRooms(); };
  function tally(rooms) {
    const t = { total: rooms.length, complete: 0, in_progress: 0, not_started: 0, devices: 0 };
    rooms.forEach(function (r) { const s = I.roomStatus(r); if (s === 'complete') t.complete++; else if (s === 'in_progress') t.in_progress++; else t.not_started++; t.devices += I.roomAssets(r.id).length; });
    t.pct = U.pct(t.complete, t.total);
    return t;
  }
  I.tally = tally;

  /* ------------------------------------------------------------------ dashboard figures */
  I.metrics = R.memo(function () {
    const assets = I.assets(), rooms = I.liveRooms();
    const buildings = store.all('buildings').filter(function (b) { return !b.archived; });
    const floors = store.all('floors').filter(function (f) { return !f.archived && buildings.some(function (b) { return b.id === f.building_id; }); });
    const m = { buildings: buildings.length, floors: floors.length, rooms: rooms.length, roomsComplete: 0, roomsInProgress: 0, assets: assets.length, listed: 0,
      pending: I.pending().length, needsId: 0, aiReview: 0, incomplete: 0, verified: 0, partial: 0, ready: 0, exported: 0, changed: 0,
      missing: { serial_number: 0, mac_address: 0, ip_address: 0, switch_port: 0, identity: 0 }, byField: {}, duplicates: 0, possible: 0 };
    I.ID_FIELDS.forEach(function (f) { m.byField[f.k] = { verified: 0, captured: 0, unavailable: 0, na: 0, not_captured: 0 }; });
    rooms.forEach(function (r) { const s = I.roomStatus(r); if (s === 'complete') m.roomsComplete++; else if (s === 'in_progress') m.roomsInProgress++; });
    assets.forEach(function (d) {
      const a = I.asset(d);
      if (a.status === 'listed') { m.listed++; return; }   /* not yet seen: counted on its own, not in the quality figures */
      if (a.status === 'needs_identification') m.needsId++;
      if (a.status === 'ai_review') m.aiReview++;
      if (a.status === 'verified') m.verified++;
      if (a.status === 'partial') m.partial++;
      if (a.incomplete) m.incomplete++;
      if (a.exportState === 'current') m.exported++;
      if (a.exportState === 'changed') m.changed++;
      if (a.status === 'verified' && a.exportState !== 'current') m.ready++;
      I.ID_FIELDS.forEach(function (f) { m.byField[f.k][a.states[f.k]]++; if (a.states[f.k] === 'not_captured') m.missing[f.k]++; });
      if (a.states.switch_port === 'not_captured') m.missing.switch_port++;
      if (a.missingIdentity.indexOf('Manufacturer') >= 0 || a.missingIdentity.indexOf('Model') >= 0) m.missing.identity++;
    });
    const dup = I.duplicates();
    m.duplicates = dup.strong.length;
    m.possible = dup.possible.length + dup.photo.length;
    /* "unique" = captured records less the extra records in each group that shares a serial number or MAC address */
    const extra = new Set();
    dup.strong.forEach(function (g) { g.devices.slice(1).forEach(function (d) { extra.add(d.id); }); });
    m.unique = assets.length - m.listed - extra.size;
    m.captured = assets.length - m.listed;
    m.awaiting = m.pending + m.needsId;
    return m;
  });
  /* progress tables: by building, floor, department, and devices by category */
  I.progress = R.memo(function () {
    const rooms = I.liveRooms();
    const byBuilding = [], byFloor = [];
    U.sortBy(store.all('buildings').filter(function (b) { return !b.archived; }), function (b) { return b.name; }).forEach(function (b) {
      const bRooms = rooms.filter(function (r) { return r.building_id === b.id; });
      byBuilding.push({ id: b.id, label: b.name || 'Unnamed building', t: tally(bRooms) });
      R.buildingFloors(b.id).forEach(function (f) {
        byFloor.push({ id: f.id, building: b.name, label: (b.name ? b.name + ' · ' : '') + 'Floor ' + f.number, t: tally(bRooms.filter(function (r) { return r.floor_id === f.id; })) });
      });
    });
    const depts = U.groupBy(rooms, function (r) { return (r.department || '').trim(); });
    const byDepartment = U.sortBy(Array.from(depts.keys()), function (k) { return k || '￿'; }).map(function (k) { return { id: k, label: k || 'No department recorded', t: tally(depts.get(k)) }; });
    const cats = U.groupBy(I.assets(), function (d) { return R.deviceType(d); });
    const byCategory = U.sortBy(Array.from(cats.keys()).map(function (k) {
      const list = cats.get(k);
      return { id: k, label: k, total: list.length, verified: list.filter(function (d) { return I.asset(d).status === 'verified'; }).length,
        review: list.filter(function (d) { const s = I.asset(d).status; return s === 'needs_identification' || s === 'ai_review'; }).length };
    }), function (x) { return x.total; }, true);
    return { byBuilding: byBuilding, byFloor: byFloor, byDepartment: byDepartment, byCategory: byCategory };
  });

  /* ------------------------------------------------------------------ duplicates */
  I.norm = {
    serial_number: function (v) { return String(v || '').replace(/\s+/g, '').toUpperCase(); },
    mac_address: function (v) { const m = R.macFormat(v); return R.macValid(m) ? m : ''; },
    asset_tag: function (v) { return String(v || '').replace(/\s+/g, '').toUpperCase(); },
    code: function (v) { return String(v || '').trim().toUpperCase(); }
  };
  const STRONG = [['serial_number', 'Serial number'], ['mac_address', 'MAC address']];
  function distinct(a, b) {
    return (Array.isArray(a.distinct_from) && a.distinct_from.indexOf(b.id) >= 0) || (Array.isArray(b.distinct_from) && b.distinct_from.indexOf(a.id) >= 0);
  }
  I.distinct = distinct;
  /* a group still needs a decision while two of its records have not been declared different devices */
  function open(list) { for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (!distinct(list[i], list[j])) return true; return false; }
  function hamming(a, b) {
    let n = 0;
    for (let i = 0; i < a.length; i++) { let x = parseInt(a[i], 16) ^ parseInt(b[i], 16); while (x) { n += x & 1; x >>= 1; } }
    return n;
  }
  I.hamming = hamming;
  I.duplicates = R.memo(function () {
    const assets = I.assets();
    const strong = [], possible = [], photo = [];
    STRONG.forEach(function (p) {
      const groups = U.groupBy(assets.filter(function (d) { return I.norm[p[0]](d[p[0]]); }), function (d) { return I.norm[p[0]](d[p[0]]); });
      groups.forEach(function (list, value) { if (list.length > 1 && open(list)) strong.push({ key: p[0] + ':' + value, field: p[0], label: p[1], value: list[0][p[0]], devices: U.sortBy(list, function (d) { return d.code; }) }); });
    });
    /* the same manufacturer and model in the same room: often several identical devices, so only a question, never merged by itself */
    U.groupBy(assets.filter(function (d) { return d.room_id && !U.blank(d.manufacturer) && !U.blank(d.model); }), function (d) {
      return d.room_id + '|' + String(d.manufacturer).trim().toLowerCase() + '|' + String(d.model).trim().toLowerCase();
    }).forEach(function (list, key) {
      /* several identical items listed for one room are simply several devices */
      if (list.length > 1 && open(list) && !list.every(I.isListed)) possible.push({ key: 'model:' + key, field: 'model', label: 'Same manufacturer and model in the same room', value: list[0].manufacturer + ' ' + list[0].model, devices: U.sortBy(list, function (d) { return d.code; }) });
    });
    /* photographs that are (nearly) the same picture, linked to different assets: a secondary indicator only */
    const ph = store.all('photos').filter(function (p) { return p.phash && p.device_id; });
    const byDevice = new Map(assets.map(function (d) { return [d.id, d]; }));
    const bands = new Map();
    ph.forEach(function (p) { for (let b = 0; b < 4; b++) { const k = b + ':' + p.phash.substr(b * 4, 4); if (!bands.has(k)) bands.set(k, []); bands.get(k).push(p); } });
    const pairSeen = new Set();
    bands.forEach(function (list) {
      if (list.length < 2 || list.length > 200) return;
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.device_id === b.device_id) continue;
        const da = byDevice.get(a.device_id), db = byDevice.get(b.device_id);
        if (!da || !db || distinct(da, db)) continue;
        const key = [da.id, db.id].sort().join('|');
        if (pairSeen.has(key) || hamming(a.phash, b.phash) > 4) continue;
        pairSeen.add(key);
        photo.push({ key: 'photo:' + key, field: 'photo', label: 'Nearly identical photographs', value: (a.code || '') + ' / ' + (b.code || ''), devices: [da, db] });
      }
    });
    /* a group already reported on a strong key is not repeated as a weaker one */
    const strongPairs = new Set();
    strong.forEach(function (g) { g.devices.forEach(function (a) { g.devices.forEach(function (b) { if (a.id !== b.id) strongPairs.add(a.id + '|' + b.id); }); }); });
    return { strong: strong, possible: possible, photo: photo.filter(function (g) { return !strongPairs.has(g.devices[0].id + '|' + g.devices[1].id); }) };
  });
  I.duplicateIds = R.memo(function () {
    const s = new Set();
    I.duplicates().strong.forEach(function (g) { g.devices.forEach(function (d) { s.add(d.id); }); });
    return s;
  });
  I.groupsFor = function (id) {
    const d = I.duplicates();
    return d.strong.concat(d.possible, d.photo).filter(function (g) { return g.devices.some(function (x) { return x.id === id; }); });
  };
  /* records that may be the device being captured now: values = the fields as entered so far */
  I.candidatesFor = function (values, roomId, excludeId) {
    const out = new Map();
    const add = function (d, label, strong) {
      if (d.id === excludeId) return;
      const e = out.get(d.id) || { device: d, reasons: [], strong: false };
      e.reasons.push(label); if (strong) e.strong = true;
      out.set(d.id, e);
    };
    const assets = I.assets();
    STRONG.forEach(function (p) {
      const v = I.norm[p[0]](values[p[0]]);
      if (!v) return;
      assets.forEach(function (d) { if (I.norm[p[0]](d[p[0]]) === v) add(d, 'Same ' + p[1].toLowerCase() + ' (' + values[p[0]] + ')', true); });
    });
    if (roomId && !U.blank(values.manufacturer) && !U.blank(values.model)) {
      const mf = String(values.manufacturer).trim().toLowerCase(), md = String(values.model).trim().toLowerCase();
      assets.forEach(function (d) { if (d.room_id === roomId && String(d.manufacturer || '').trim().toLowerCase() === mf && String(d.model || '').trim().toLowerCase() === md) add(d, 'Same manufacturer and model in this room', false); });
    }
    return U.sortBy(Array.from(out.values()), function (e) { return (e.strong ? '0' : '1') + e.device.code; });
  };

  /* ------------------------------------------------------------------ changes */
  function setSources(d, patch, source) {
    const own = Object.assign({}, I.sources(d), d.field_sources || {});
    Object.keys(patch).forEach(function (k) { if (I.SOURCED.indexOf(k) < 0) return; if (U.blank(patch[k])) delete own[k]; else own[k] = source; });
    return own;
  }
  /* Edit asset fields; every changed value records where it came from (default: entered manually). */
  I.update = function (d, patch, source) {
    const p = Object.assign({}, patch);
    const changed = Object.keys(p).filter(function (k) { return String(d[k] == null ? '' : d[k]) !== String(p[k] == null ? '' : p[k]); });
    if (!changed.length) return d;
    const sub = {}; changed.forEach(function (k) { sub[k] = p[k]; });
    const out = Object.assign({}, sub);
    out.field_sources = setSources(d, sub, source || 'manual');
    /* a value typed into an identifier that was marked "not accessible" is no longer not accessible */
    /* ...and a changed value is not the value someone verified */
    I.IDS.forEach(function (f) {
      if (!(f.k in sub)) return;
      if (!U.blank(sub[f.k]) && (d[f.s] === 'unavailable' || d[f.s] === 'not_applicable')) out[f.s] = 'unknown';
      else if ((d[f.s] === 'verified_onsite' || d[f.s] === 'verified_mgmt') && String(sub[f.k] || '').trim() !== String(d[f.k] || '').trim()) out[f.s] = 'unknown';
    });
    /* a changed identity is no longer the identity someone confirmed */
    if (d.identity_confirmed_at && ['manufacturer', 'model', 'category'].some(function (k) { return k in sub; })) { out.identity_confirmed_at = null; out.identity_confirmed_by = ''; }
    return store.update('devices', d.id, out);
  };
  I.setIdStatus = function (d, f, status) {
    const patch = {}; patch[f.s] = status;
    if (status === 'not_applicable' || status === 'unavailable') { patch[f.k] = ''; patch.field_sources = setSources(d, patch, 'manual'); }
    if (status === 'verified_onsite' || status === 'verified_mgmt') patch.last_verified_at = U.now();
    return store.update('devices', d.id, patch);
  };
  I.confirmIdentity = function (d) {
    return store.update('devices', d.id, { identity_confirmed_at: U.now(), identity_confirmed_by: store.actor(), last_verified_at: U.now(), manual_review: false });
  };
  /* Create an asset from what a person confirmed. values: asset fields; sources: { field: source } */
  I.create = function (room, values, sources, opts) {
    opts = opts || {};
    /* the same empty record the legacy device editor starts from, so both screens keep working on every asset */
    const rec = {
      building_id: room.building_id, floor_id: room.floor_id, room_id: room.id, rack_id: null, audit_id: null, category: '', custom_category: '', role: '',
      manufacturer: '', model: '', hostname: '', ip_address: '', ip_status: 'unknown', mac_address: '', mac_status: 'unknown', serial_number: '', serial_status: 'unknown', port_status: 'unknown',
      subnet: '', vlan: '', ip_assignment: '', dns_name: '', firmware_version: '', app_version: '', switch_asset_id: null, connected_switch: '', switch_port: '',
      connection_type: '', poe_required: '', poe_class: '', power_source: '', rack_location: '', monitoring_portal: '', management_url: '', warranty_info: '',
      support_expiration: null, notes: '', archived: false, make: '', product_family: '', asset_tag: '', distinct_from: [], presence: '', listed_text: ''
    };
    Object.keys(values).forEach(function (k) { if (values[k] !== undefined) rec[k] = values[k]; });
    const fs = {};
    I.SOURCED.forEach(function (k) { if (!U.blank(rec[k])) fs[k] = (sources && sources[k]) || 'manual'; });
    rec.field_sources = fs;
    if (opts.confirm) { rec.identity_confirmed_at = U.now(); rec.identity_confirmed_by = store.actor(); rec.last_verified_at = U.now(); }
    if (I.IDS.some(function (f) { return rec[f.s] === 'verified_onsite' || rec[f.s] === 'verified_mgmt'; })) rec.last_verified_at = U.now();
    if (opts.identification) rec.ai_identification_id = opts.identification.id;
    rec.manual_review = !!opts.manualReview;
    const d = store.create('devices', rec, opts.silent ? { silent: true } : undefined);
    if (room && !room.inventory_status && !I.isListed(rec)) store.update('rooms', room.id, { inventory_status: 'in_progress' }, { silent: true });
    return d;
  };
  /* Two records are different physical devices: they are no longer offered as duplicates of each other. */
  I.markDistinct = function (devices) {
    devices.forEach(function (d) {
      const others = devices.filter(function (x) { return x.id !== d.id; }).map(function (x) { return x.id; });
      const cur = store.get('devices', d.id);
      if (!cur) return;
      store.update('devices', d.id, { distinct_from: U.uniq((Array.isArray(cur.distinct_from) ? cur.distinct_from : []).concat(others)) }, { silent: true });
    });
    store.log({ action: 'updated', entity_type: 'devices', summary: 'Kept as separate devices: ' + devices.map(function (d) { return d.code; }).join(', '), room_id: devices[0].room_id || '' });
  };
  /* Which of the merged record's values may replace the kept record's: a verified value is never replaced by one
     that is not verified. Returns { field: reason } for the values that may not be taken. */
  I.mergeBlocks = function (keep, drop) {
    const out = {};
    I.IDS.forEach(function (f) {
      if (I.idState(keep, f) === 'verified' && I.idState(drop, f) !== 'verified' && !U.blank(drop[f.k]) && drop[f.k] !== keep[f.k]) out[f.k] = 'The kept value is verified; the other is not.';
    });
    if (keep.identity_confirmed_at && !drop.identity_confirmed_at) ['manufacturer', 'model', 'category'].forEach(function (k) {
      if (!U.blank(drop[k]) && drop[k] !== keep[k]) out[k] = 'The kept identity is confirmed; the other is not.';
    });
    return out;
  };
  /* columns that describe the record itself, its place or its bookkeeping: never copied from one record to another */
  const NOT_MERGED = { code: 1, building_id: 1, floor_id: 1, room_id: 1, audit_id: 1, rack_id: 1, identity_confirmed_at: 1, identity_confirmed_by: 1, field_sources: 1,
    manual_review: 1, last_verified_at: 1, ai_identification_id: 1, merged_into: 1, distinct_from: 1, exported_at: 1, export_code: 1, export_sig: 1, archived: 1,
    ip_status: 1, mac_status: 1, serial_status: 1, port_status: 1, custom_category: 1 };
  const ID_RANK = { verified_onsite: 4, verified_mgmt: 4, not_applicable: 3, unavailable: 2, awaiting_it: 1, awaiting_vendor: 1, unknown: 0 };
  const same = function (a, b) { return String(a == null ? '' : a).trim().toLowerCase() === String(b == null ? '' : b).trim().toLowerCase(); };
  /* the other columns (firmware, switch port, VLAN, warranty…) that the kept record lacks and the merged one has */
  I.mergeFills = function (keep, drop) {
    return S.T.devices.colNames.filter(function (c) {
      if (NOT_MERGED[c] || I.SOURCED.indexOf(c) >= 0) return false;
      return U.blank(keep[c]) && !U.blank(drop[c]);
    });
  };
  /* The changes a merge makes to the kept record. take: { field: true | false } — the person's choice per field. */
  I.mergePatch = function (keep, drop, take) {
    const blocked = I.mergeBlocks(keep, drop);
    const patch = {}, fs = Object.assign({}, I.sources(keep), keep.field_sources || {}), dropSrc = I.sources(drop);
    I.SOURCED.forEach(function (k) {
      const useDrop = take && take[k] && !blocked[k] && !U.blank(drop[k]);
      const fill = U.blank(keep[k]) && !U.blank(drop[k]) && !(take && take[k] === false);
      if (useDrop || fill) { patch[k] = drop[k]; fs[k] = dropSrc[k] || 'existing'; }
    });
    if ('category' in patch) patch.custom_category = drop.custom_category || '';
    I.IDS.forEach(function (f) {
      const ks = keep[f.s] || 'unknown', ds = drop[f.s] || 'unknown';
      if (f.k in patch) patch[f.s] = ds;
      /* the same value on both: it is as verified as the better of the two says */
      else if (!U.blank(keep[f.k]) && same(keep[f.k], drop[f.k])) { if ((ID_RANK[ds] || 0) > (ID_RANK[ks] || 0)) patch[f.s] = ds; }
      else if (U.blank(keep[f.k]) && U.blank(drop[f.k]) && ks === 'unknown' && ds !== 'unknown') patch[f.s] = ds;
    });
    I.mergeFills(keep, drop).forEach(function (c) { patch[c] = drop[c]; });
    if (drop.rack_id && !keep.rack_id && drop.room_id === keep.room_id) patch.rack_id = drop.rack_id;
    patch.field_sources = fs;
    patch.distinct_from = U.uniq((Array.isArray(keep.distinct_from) ? keep.distinct_from : []).concat(Array.isArray(drop.distinct_from) ? drop.distinct_from : [])).filter(function (x) { return x !== keep.id && x !== drop.id; });
    /* identity after the merge: confirmed if the identity that results is one a person confirmed */
    const after = function (k) { return k in patch ? patch[k] : keep[k]; };
    const keepSame = ['manufacturer', 'model', 'category'].every(function (k) { return same(after(k), keep[k]); });
    const dropSame = ['manufacturer', 'model', 'category'].every(function (k) { return same(after(k), drop[k]); });
    if (!(keepSame && keep.identity_confirmed_at)) {
      if (dropSame && drop.identity_confirmed_at) { patch.identity_confirmed_at = drop.identity_confirmed_at; patch.identity_confirmed_by = drop.identity_confirmed_by || ''; }
      else if (keep.identity_confirmed_at) { patch.identity_confirmed_at = null; patch.identity_confirmed_by = ''; }
    }
    if (drop.last_verified_at && (!keep.last_verified_at || drop.last_verified_at > keep.last_verified_at)) patch.last_verified_at = drop.last_verified_at;
    return patch;
  };
  /* Merge drop into keep. take: { field: true } = use drop's value for that field. Photographs, identifications and
     every reference to the merged record move to the kept one; the merged record is deleted (kept as history). */
  I.merge = function (keepId, dropId, take) {
    const keep = store.get('devices', keepId), drop = store.get('devices', dropId);
    if (!keep || !drop || keep.id === drop.id) throw new Error('Choose two different records to merge.');
    const blocked = I.mergeBlocks(keep, drop);
    const patch = I.mergePatch(keep, drop, take);
    store.update('devices', keep.id, patch, { silent: true });
    /* every reference to the merged record now points at the kept one */
    S.TABLES.forEach(function (t) {
      if (t === 'activity_log') return;
      S.T[t].columns.forEach(function (c) {
        if (c.ref !== 'devices' || c.name === 'merged_into') return;
        store.by(t, c.name, drop.id).forEach(function (r) { const p = {}; p[c.name] = keep.id; store.update(t, r.id, p, { silent: true }); });
      });
    });
    store.all('network_links').forEach(function (l) {
      const p = {};
      if (l.from_type === 'device' && l.from_id === drop.id) p.from_id = keep.id;
      if (l.to_type === 'device' && l.to_id === drop.id) p.to_id = keep.id;
      if (Object.keys(p).length) store.update('network_links', l.id, p, { silent: true });
    });
    store.update('devices', drop.id, { merged_into: keep.id }, { silent: true });
    store.remove('devices', drop.id, { silent: true });
    store.log({ action: 'updated', table: 'devices', rec: store.get('devices', keep.id), summary: 'Merged ' + drop.code + ' into ' + keep.code + ' (' + R.deviceLabel(keep) + ')',
      changes: Object.keys(patch).filter(function (k) { return k !== 'field_sources' && k !== 'distinct_from'; }).map(function (k) { return { f: k, from: keep[k] == null ? '' : String(keep[k]), to: patch[k] == null ? '' : String(patch[k]) }; }) });
    return { kept: store.get('devices', keep.id), blocked: blocked };
  };

  /* ------------------------------------------------------------------ equipment listed in the room details */
  /* "Samsung QM55R (LH55QMRE)", "Shure Ceiling X4", "1Beyond Cams (x2) (6512862)", "5x 1Beyond", "N/A" ->
     { text, name, qty, manufacturer, model } or null. Nothing is corrected or guessed: the manufacturer is taken only when
     the text starts with a known name, and the rest is kept, as written, as the model. */
  I.parseListing = function (text) {
    const raw = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    if (!raw || /^(n\/?a|none|no|-+|tbd|tbc|unknown|\?+)$/i.test(raw)) return null;
    let t = raw, qty = 1, m;
    if ((m = /\(\s*x\s*(\d{1,2})\s*\)/i.exec(t))) { qty = parseInt(m[1], 10); t = (t.slice(0, m.index) + t.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim(); }
    else if ((m = /(?:^|\s)x\s?(\d{1,2})$/i.exec(t))) { qty = parseInt(m[1], 10); t = t.slice(0, m.index).trim(); }
    else if ((m = /^(\d{1,2})\s*x\s+/i.exec(t))) { qty = parseInt(m[1], 10); t = t.slice(m[0].length).trim(); }
    qty = Math.max(1, Math.min(qty || 1, 24));
    const names = I.manufacturers().slice().sort(function (a, b) { return b.length - a.length; });
    let manufacturer = '', model = t;
    for (let i = 0; i < names.length; i++) {
      const n = names[i];
      if (t.toLowerCase().indexOf(n.toLowerCase()) === 0 && (t.length === n.length || /[^A-Za-z]/.test(t.charAt(n.length)))) {
        manufacturer = n; model = t.slice(n.length).replace(/^[\s,:\-]+/, '').trim(); break;
      }
    }
    return { text: raw, name: t, qty: qty, manufacturer: manufacturer, model: model };
  };
  const compact = function (s) { return String(s || '').toLowerCase().replace(/\s+/g, ''); };
  /* the equipment a room's details name: [{ listed_text, category, manufacturer, model, qty }] */
  I.listing = function (room) {
    const items = [], byText = new Map();
    S.LISTING_FIELDS.forEach(function (f) {
      const p = I.parseListing(room[f[0]]);
      if (!p) return;
      const k = compact(p.name);
      const ex = byText.get(k);
      /* the same equipment named for the camera and the microphones (a video bar) is one device */
      if (ex && ((ex.fields.indexOf('camera_config') >= 0 && f[0] === 'microphone_config') || (ex.fields.indexOf('microphone_config') >= 0 && f[0] === 'camera_config'))) {
        ex.fields.push(f[0]); ex.category = 'Room collaboration system'; ex.listed_text = 'Camera and microphone configuration: ' + ex.text; ex.qty = Math.max(ex.qty, p.qty); return;
      }
      const it = { fields: [f[0]], text: p.text, listed_text: f[1] + ': ' + p.text, category: f[2], manufacturer: p.manufacturer, model: p.model, qty: p.qty };
      items.push(it); byText.set(k, it);
    });
    return items;
  };
  /* what would be created for a room: each listed item, less those already listed (including any since deleted, merged or not found) */
  I.listingPlan = function (room) {
    const have = store.raw('devices').filter(function (d) { return d.room_id === room.id && d.listed_text; });
    return I.listing(room).map(function (it) {
      const n = have.filter(function (d) { return compact(d.listed_text) === compact(it.listed_text); }).length;
      return Object.assign({}, it, { existing: n, create: Math.max(0, it.qty - n) });
    });
  };
  I.createListed = function (room) {
    let made = 0;
    I.listingPlan(room).forEach(function (it) {
      for (let i = 0; i < it.create; i++) {
        const values = { category: it.category, manufacturer: it.manufacturer, model: it.model, presence: 'listed', listed_text: it.listed_text };
        const src = { category: 'import' }; if (it.manufacturer) src.manufacturer = 'import'; if (it.model) src.model = 'import';
        I.create(room, values, src, { silent: true });
        made++;
      }
    });
    return made;
  };
  /* listed, looked for, not in the room: kept as history, out of the active inventory */
  I.markNotFound = function (d, note) {
    const text = 'Listed (' + (d.listed_text || 'room details') + ') but not found in the room on ' + U.fmtDate(U.now()) + (note ? ': ' + note : '') + '.';
    store.update('devices', d.id, { presence: 'not_found', archived: true, notes: [d.notes, text].filter(Boolean).join('\n') });
  };

  /* ------------------------------------------------------------------ change history of one asset */
  I.history = function (d) {
    return U.sortBy(store.all('activity_log').filter(function (a) { return a.entity_id === d.id || (a.entity_type === 'devices' && a.summary && a.summary.indexOf(d.code) >= 0); }), function (a) { return a.at; }, true);
  };
})();
