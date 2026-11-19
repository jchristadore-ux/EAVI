/* pages/integration.js — Export & Integration: asset records written for another system (the monitoring portal).
 * A mapping (export profile) lists the receiving system's columns in order and where each value comes from; nothing
 * about that system's schema is assumed. Every export is previewed and validated first, is recorded in the export
 * history, and marks the exported assets so that later changes can be exported again. */
(function () {
  'use strict';
  const EV = window.EV, h = EV.h, U = EV.U, S = EV.S, store = EV.store, ui = EV.ui, icon = EV.icon, R = EV.rules, P = EV.photos, I = EV.inv;
  const XA = (EV.assetExport = {});
  const st = { scope: 'all', scopeId: '', ids: null, which: 'all', include: 'verified', profile: 'standard', format: 'csv', busy: false, tab: 'export', editing: null };
  EV.integration = { selectIds: function (ids) { st.scope = 'selected'; st.ids = ids.slice(); st.tab = 'export'; st.include = 'all'; } };

  /* ------------------------------------------------------------------ source fields */
  function rm(d) { return store.getAny('rooms', d.room_id) || {}; }
  function fl(d) { return store.getAny('floors', d.floor_id) || {}; }
  function bd(d) { return store.getAny('buildings', d.building_id) || {}; }
  function stLabel(v) { return v ? S.label(S.ID_STATUS, v) : ''; }
  XA.SOURCES = [
    ['asset_id', 'Asset ID', function (d) { return d.code; }],
    ['record_id', 'Record ID (UUID)', function (d) { return d.id; }],
    ['building', 'Building', function (d) { return bd(d).name; }],
    ['building_identifier', 'Building identifier', function (d) { return bd(d).identifier; }],
    ['building_address', 'Building address', function (d) { return bd(d).address; }],
    ['floor', 'Floor', function (d) { return fl(d).number; }],
    ['room_number', 'Room number', function (d) { return rm(d).number; }],
    ['room_name', 'Room name', function (d) { return rm(d).name; }],
    ['location', 'Room (number and name)', function (d) { return R.roomLabel(store.getAny('rooms', d.room_id)); }],
    ['room_id', 'Room ID', function (d) { return rm(d).code; }],
    ['department', 'Department / business unit', function (d) { return rm(d).department; }],
    ['category', 'Device category', function (d) { return R.deviceType(d); }],
    ['manufacturer', 'Manufacturer', function (d) { return d.manufacturer; }],
    ['model', 'Model', function (d) { return d.model; }],
    ['serial_number', 'Serial number', function (d) { return d.serial_number; }],
    ['serial_status', 'Serial number status', function (d) { return stLabel(d.serial_status); }],
    ['mac_address', 'MAC address', function (d) { return d.mac_address; }],
    ['mac_status', 'MAC address status', function (d) { return stLabel(d.mac_status); }],
    ['ip_address', 'IP address', function (d) { return d.ip_address; }],
    ['ip_status', 'IP address status', function (d) { return stLabel(d.ip_status); }],
    ['firmware_version', 'Firmware version', function (d) { return d.firmware_version; }],
    ['primary_photo', 'Primary photograph (photo ID)', function (d) { const p = P.forDevice(d.id); return p.length ? p[p.length - 1].code : ''; }],
    ['photo_count', 'Number of photographs', function (d) { return P.forDevice(d.id).length; }],
    ['identification_source', 'Identification source', function (d) {
      const s = I.sources(d);
      return U.uniq(['manufacturer', 'model', 'serial_number', 'mac_address', 'ip_address'].map(function (k) { return s[k]; }).filter(Boolean)).map(I.sourceLabel).join('; ');
    }],
    ['verification_status', 'Verification status', function (d) { return I.statusLabel(I.asset(d).status); }],
    ['identity_confirmed_by', 'Identity confirmed by', function (d) { return d.identity_confirmed_by; }],
    ['date_captured', 'Date captured', function (d) { return d.created_at; }],
    ['last_verified', 'Last verified', function (d) { return d.last_verified_at; }],
    ['last_updated', 'Last updated', function (d) { return d.updated_at; }],
    ['notes', 'Notes', function (d) { return d.notes; }]
  ];
  const SRC = new Map(XA.SOURCES.map(function (s) { return [s[0], s]; }));
  XA.value = function (m, d) {
    if (m.source === '__const') return m.value || '';
    const s = SRC.get(m.source);
    if (!s) return '';
    const v = s[2](d);
    return v == null ? '' : v;
  };

  /* ------------------------------------------------------------------ mappings */
  const STANDARD = ['asset_id', 'building', 'floor', 'room_number', 'room_name', 'department', 'category', 'manufacturer', 'model', 'serial_number',
    'mac_address', 'ip_address', 'primary_photo', 'identification_source', 'verification_status', 'date_captured', 'last_verified', 'notes'];
  XA.standard = function () {
    return { id: 'standard', name: 'Standard asset export', target_system: 'Any system (this application\'s own field names)', format: 'csv', builtIn: true,
      mapping: STANDARD.map(function (k) { return { target: SRC.get(k)[1], source: k, required: k === 'asset_id' || k === 'building' || k === 'category' }; }), options: {} };
  };
  XA.profiles = function () { return [XA.standard()].concat(U.sortBy(store.all('export_profiles').filter(function (p) { return !p.archived; }), function (p) { return p.name; })); };
  XA.profile = function (id) { return id === 'standard' || !id ? XA.standard() : (store.get('export_profiles', id) || XA.standard()); };
  /* names a receiving system commonly uses for each value: used only to suggest a source for a pasted column name */
  const HINTS = [
    ['asset_id', ['asset id', 'device id', 'assetid', 'deviceid', 'asset number', 'asset']], ['record_id', ['uuid', 'record id', 'guid']],
    ['building', ['site', 'building', 'building name', 'site name', 'campus']], ['building_identifier', ['site id', 'site code', 'building id', 'building code']],
    ['building_address', ['address']], ['floor', ['floor', 'level']], ['room_number', ['room number', 'room no', 'room #', 'room']], ['room_name', ['room name', 'space name', 'space']],
    ['location', ['location', 'room location']], ['department', ['department', 'business unit', 'division', 'bu']],
    ['category', ['device type', 'type', 'category', 'device category', 'class', 'asset type']], ['manufacturer', ['manufacturer', 'vendor', 'mfr', 'mfg', 'oem']],
    ['model', ['model', 'product model', 'model number', 'part number', 'product']],
    ['serial_number', ['serial', 'serial number', 'serial no', 'sn', 's/n']],
    ['mac_address', ['mac', 'mac address', 'hardware address', 'ethernet address']], ['ip_address', ['ip', 'ip address', 'management ip', 'mgmt ip', 'address ip', 'ipv4']],
    
    ['firmware_version', ['firmware', 'firmware version', 'version']], ['notes', ['notes', 'comments', 'remarks']], ['date_captured', ['date captured', 'created', 'discovered', 'install date']],
    ['last_verified', ['last verified', 'verified on', 'last seen']], ['verification_status', ['status', 'verification', 'verification status']]
  ];
  const norm = function (s) { return String(s || '').toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim(); };
  XA.suggest = function (target) {
    const n = norm(target);
    if (!n) return '';
    const exact = HINTS.find(function (x) { return x[1].indexOf(n) >= 0; });
    if (exact) return exact[0];
    const src = XA.SOURCES.find(function (s) { return norm(s[1]) === n || s[0].replace(/_/g, ' ') === n; });
    return src ? src[0] : '';
  };
  /* a pasted header line (from the portal's import template) becomes the target columns, each with a suggested source */
  XA.fromHeader = function (text) {
    const first = String(text || '').replace(/^﻿/, '').split(/\r\n|\n|\r/).find(function (l) { return l.trim(); }) || '';
    const cells = EV.csv.parse ? (EV.csv.parse(first)[0] || []) : first.split(',');
    return cells.map(function (c) { return String(c).trim(); }).filter(Boolean).map(function (t) { return { target: t, source: XA.suggest(t), required: false, suggested: true }; });
  };

  /* ------------------------------------------------------------------ what is exported */
  XA.scopeOptions = function () {
    const out = [['all', 'Entire enterprise']];
    if (store.all('buildings').length) out.push(['building', 'One building']);
    out.push(['floor', 'One floor'], ['department', 'One department'], ['room', 'One room'], ['category', 'One device category']);
    if (st.ids && st.ids.length) out.push(['selected', 'Selected assets (' + st.ids.length + ')']);
    return out;
  };
  XA.collect = function (o) {
    let list = I.assets();
    if (o.scope === 'building') list = list.filter(function (d) { return d.building_id === o.scopeId; });
    if (o.scope === 'floor') list = list.filter(function (d) { return d.floor_id === o.scopeId; });
    if (o.scope === 'room') list = list.filter(function (d) { return d.room_id === o.scopeId; });
    if (o.scope === 'department') list = list.filter(function (d) { return (rm(d).department || '').trim() === o.scopeId; });
    if (o.scope === 'category') list = list.filter(function (d) { return R.deviceType(d) === o.scopeId; });
    if (o.scope === 'selected') { const s = new Set(o.ids || []); list = list.filter(function (d) { return s.has(d.id); }); }
    if ((o.scope !== 'all' && o.scope !== 'selected') && !o.scopeId) list = [];
    if (o.which === 'never') list = list.filter(function (d) { return I.asset(d).exportState === 'never'; });
    if (o.which === 'changed') list = list.filter(function (d) { return I.asset(d).exportState === 'changed'; });
    if (o.which === 'new_or_changed') list = list.filter(function (d) { return I.asset(d).exportState !== 'current'; });
    const inScope = list.length;
    const excluded = [];
    list = list.filter(function (d) {
      const s = I.asset(d).status;
      const ok = o.include === 'all' || s === 'verified' || (o.include === 'verified_partial' && s === 'partial');
      if (!ok) excluded.push(d);
      return ok;
    });
    return { assets: U.sortBy(list, function (d) { const f = fl(d); return (bd(d).name || '') + '|' + U.pad(f.sort_order != null ? f.sort_order : 999, 6) + '|' + (rm(d).number || '') + '|' + d.code; }), inScope: inScope, excluded: excluded };
  };
  XA.rows = function (profile, assets) {
    return assets.map(function (d) { return profile.mapping.map(function (m) { return XA.value(m, d); }); });
  };
  /* the validation report: nothing here blocks an export; it says exactly what the file will and will not contain */
  XA.validate = function (profile, col) {
    const v = { rows: col.assets.length, excluded: col.excluded.length, required: [], blank: [], invalid: [], duplicates: [], unverified: 0, mapping: [] };
    const targets = profile.mapping.map(function (m) { return m.target; });
    U.uniq(targets.filter(function (t, i) { return targets.indexOf(t) !== i; })).forEach(function (t) { v.mapping.push('Column “' + t + '” appears more than once.'); });
    profile.mapping.forEach(function (m) { if (!U.blank(m.target) && !m.source) v.mapping.push('Column “' + m.target + '” has no source: it will be empty.'); if (U.blank(m.target)) v.mapping.push('A column has no name.'); });
    profile.mapping.forEach(function (m) {
      const empty = col.assets.filter(function (d) { return U.blank(XA.value(m, d)); });
      if (!empty.length) return;
      const e = { target: m.target, count: empty.length, codes: empty.slice(0, 12).map(function (d) { return d.code; }) };
      (m.required ? v.required : v.blank).push(e);
    });
    col.assets.forEach(function (d) {
      if (!U.blank(d.mac_address) && !R.macValid(d.mac_address)) v.invalid.push(d.code + ': MAC address “' + d.mac_address + '”');
      if (!U.blank(d.ip_address) && !R.ipValid(d.ip_address)) v.invalid.push(d.code + ': IP address “' + d.ip_address + '”');
      if (I.asset(d).status !== 'verified') v.unverified++;
    });
    [['serial_number', 'serial number'], ['mac_address', 'MAC address']].forEach(function (p) {
      U.groupBy(col.assets.filter(function (d) { return I.norm[p[0]](d[p[0]]); }), function (d) { return I.norm[p[0]](d[p[0]]); }).forEach(function (list, val) {
        if (list.length > 1) v.duplicates.push('Same ' + p[1] + ' ' + val + ': ' + list.map(function (d) { return d.code; }).join(', '));
      });
    });
    v.ok = !v.required.length && !v.invalid.length && !v.duplicates.length && !v.mapping.length;
    return v;
  };
  XA.peekCode = function () {
    let n = store.kvGet('seq:asset_exports') || 0;
    store.raw('asset_exports').forEach(function (r) { const m = /-(\d+)$/.exec(r.code || ''); if (m) n = Math.max(n, parseInt(m[1], 10)); });
    return store.orgCode() + '-AX-' + U.pad(n + 1, 4);
  };
  XA.scopeLabel = function (o) {
    if (o.scope === 'all') return 'Entire enterprise';
    if (o.scope === 'selected') return U.plural((o.ids || []).length, 'selected asset');
    if (o.scope === 'building') return (store.getAny('buildings', o.scopeId) || {}).name || 'Building';
    if (o.scope === 'floor') { const f = store.getAny('floors', o.scopeId); return f ? ((store.getAny('buildings', f.building_id) || {}).name || '') + ' Floor ' + f.number : 'Floor'; }
    if (o.scope === 'room') return R.roomLabel(store.getAny('rooms', o.scopeId));
    return o.scopeId || '';
  };
  /* Builds the file. Returns { blob, filename, mime, code, rows, validation } */
  XA.build = async function (o) {
    const profile = XA.profile(o.profile);
    const col = XA.collect(o);
    const validation = XA.validate(profile, col);
    const code = XA.peekCode();
    const rows = XA.rows(profile, col.assets);
    const headers = profile.mapping.map(function (m) { return m.target; });
    const day = U.localDate();
    const base = 'asset-export_' + U.fileSafe(XA.scopeLabel(o)).toLowerCase() + '_' + day + '_' + code;
    let blob, ext, mime;
    if (o.format === 'json') {
      const doc = { export: { id: code, generated_at: U.now(), exported_by: store.actor(), mapping: profile.name, target_system: profile.target_system || '', scope: XA.scopeLabel(o),
        record_count: rows.length, columns: headers },
        records: rows.map(function (r) { const x = {}; headers.forEach(function (h0, i) { x[h0] = r[i]; }); return x; }) };
      blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }); ext = 'json'; mime = 'application/json';
    } else if (o.format === 'xlsx') {
      const val = [['Records', rows.length], ['Left out by the status rule', validation.excluded], ['Not manually verified', validation.unverified]]
        .concat(validation.required.map(function (e) { return ['Required column empty: ' + e.target, e.count]; }))
        .concat(validation.blank.map(function (e) { return ['Empty: ' + e.target, e.count]; }))
        .concat(validation.invalid.map(function (x) { return ['Invalid value: ' + x, 1]; }))
        .concat(validation.duplicates.map(function (x) { return ['Duplicate: ' + x, 1]; }));
      blob = await EV.xlsx.simple('Asset export ' + code, [{ name: 'Assets', columns: headers, rows: rows },
        { name: 'Export', columns: ['Item', 'Value'], rows: [['Export ID', code], ['Generated', U.now()], ['Exported by', store.actor()], ['Mapping', profile.name], ['Scope', XA.scopeLabel(o)]].concat(val) }]);
      ext = 'xlsx'; mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else {
      blob = new Blob([EV.csv.encode([headers].concat(rows), { bom: true, guard: true })], { type: 'text/csv' }); ext = 'csv'; mime = 'text/csv';
    }
    /* the signatures of the records as they were written: a change made while the file is being saved is not marked as exported */
    const sigs = {}; col.assets.forEach(function (d) { sigs[d.id] = I.signature(d); });
    return { blob: blob, filename: base + '.' + ext, mime: mime, code: code, rows: rows, assets: col.assets, sigs: sigs, validation: validation, profile: profile };
  };
  /* After the file was saved: the export is recorded and each exported asset remembers what was exported. */
  XA.record = function (o, built) {
    const now = U.now();
    const rec = store.create('asset_exports', { code: built.code, profile_id: built.profile.builtIn ? null : built.profile.id, profile_name: built.profile.name, format: o.format,
      scope: { scope: o.scope, id: o.scopeId || null, ids: o.scope === 'selected' ? o.ids : null, label: XA.scopeLabel(o), which: o.which, include: o.include },
      record_count: built.rows.length, counts: { excluded: built.validation.excluded, unverified: built.validation.unverified },
      validation: { required: built.validation.required, invalid: built.validation.invalid.length, duplicates: built.validation.duplicates.length },
      filename: built.filename, exported_by: store.actor(), status: 'success' }, { silent: true });
    store.kvSet('seq:asset_exports', Math.max(store.kvGet('seq:asset_exports') || 0, parseInt(/-(\d+)$/.exec(built.code)[1], 10)));
    built.assets.forEach(function (d) {
      const cur = store.get('devices', d.id);
      if (cur) store.update('devices', d.id, { exported_at: now, export_code: built.code, export_sig: built.sigs ? built.sigs[d.id] : I.signature(d) }, { silent: true });
    });
    store.log({ action: 'exported', entity_type: 'asset_exports', entity_id: rec.id, entity_code: rec.code, summary: 'Asset export ' + rec.code + ': ' + U.plural(built.rows.length, 'asset') + ' — ' + built.filename });
    return rec;
  };
  XA.run = async function (o) {
    const built = await XA.build(o);
    const res = await EV.saveFile(built.blob, built.filename, built.mime);
    if (!res || !res.ok) return { ok: false, message: (res && res.message) || 'The file was not saved.', built: built };
    return { ok: true, record: XA.record(o, built), built: built };
  };

  /* ------------------------------------------------------------------ page */
  function scopePicker() {
    let opts = [];
    if (st.scope === 'building') opts = U.sortBy(store.all('buildings').filter(function (b) { return !b.archived; }), function (b) { return b.name; }).map(function (b) { return [b.id, b.name || 'Unnamed building']; });
    if (st.scope === 'floor') store.all('buildings').filter(function (b) { return !b.archived; }).forEach(function (b) { R.buildingFloors(b.id).forEach(function (f) { opts.push([f.id, (b.name ? b.name + ' · ' : '') + 'Floor ' + f.number]); }); });
    if (st.scope === 'department') opts = U.uniq(I.liveRooms().map(function (r) { return (r.department || '').trim(); }).filter(Boolean)).sort(U.natCmp);
    if (st.scope === 'room') opts = U.sortBy(I.liveRooms(), function (r) { const f = store.get('floors', r.floor_id); return (f ? U.pad(f.sort_order || 0, 6) : '') + (r.number || r.name); }).map(function (r) { const f = store.get('floors', r.floor_id); return [r.id, (f ? 'Floor ' + f.number + ' · ' : '') + R.roomLabel(r)]; });
    if (st.scope === 'category') opts = U.uniq(I.assets().map(function (d) { return R.deviceType(d); })).sort(U.natCmp);
    if (st.scope === 'all' || st.scope === 'selected') return null;
    return ui.field(S.label(XA.scopeOptions(), st.scope), ui.select(st.scopeId, opts, { id: 'exp-scope-id', placeholder: 'Choose…', onchange: function (v) { st.scopeId = v; } }), { half: true, key: 'sid' });
  }
  function opts() { return { scope: st.scope, scopeId: st.scopeId, ids: st.ids, which: st.which, include: st.include, profile: st.profile, format: st.format }; }
  function report(v) {
    const lines = [];
    if (v.mapping.length) lines.push(ui.note('danger', v.mapping.join(' '), { key: 'map', title: 'Mapping' }));
    if (v.required.length) lines.push(ui.note('danger', v.required.map(function (e) { return '“' + e.target + '” is empty for ' + U.plural(e.count, 'asset') + ' (' + e.codes.join(', ') + (e.count > e.codes.length ? '…' : '') + ')'; }).join('. ') + '.', { key: 'req', title: 'Required columns missing values' }));
    if (v.invalid.length) lines.push(ui.note('danger', v.invalid.slice(0, 10).join('; ') + (v.invalid.length > 10 ? '; …' : '') + '.', { key: 'inv', title: U.plural(v.invalid.length, 'invalid value') }));
    if (v.duplicates.length) lines.push(ui.note('warn', v.duplicates.slice(0, 8).join('. ') + '.', { key: 'dup', title: 'Duplicate identifiers in this export' }));
    if (v.unverified) lines.push(ui.note('warn', U.plural(v.unverified, 'asset') + ' in this export are not manually verified.', { key: 'unv' }));
    if (v.blank.length) lines.push(ui.note('info', v.blank.map(function (e) { return e.target + ': ' + e.count; }).join(' · '), { key: 'blank', title: 'Empty values (optional columns)' }));
    if (v.excluded) lines.push(ui.note('info', U.plural(v.excluded, 'asset') + ' in this scope are left out because of their verification status.', { key: 'exc' }));
    if (!lines.length && v.rows) lines.push(ui.note('ok', 'Every required column has a value, no identifier is invalid or repeated, and every asset is manually verified.', { key: 'ok' }));
    return lines;
  }
  function exportTab() {
    const profile = XA.profile(st.profile);
    const col = XA.collect(opts());
    const v = XA.validate(profile, col);
    const rows = XA.rows(profile, col.assets.slice(0, 25));
    return [
      ui.card({ key: 'set', title: 'What to export' },
        h('div.form-grid', null,
          ui.field('Scope', ui.select(st.scope, XA.scopeOptions(), { empty: false, id: 'exp-scope', onchange: function (x) { st.scope = x; st.scopeId = ''; } }), { half: true }),
          scopePicker(),
          ui.field('Records', ui.select(st.which, [['all', 'All in scope'], ['new_or_changed', 'Not yet exported, or changed since'], ['never', 'Never exported'], ['changed', 'Changed since last export']], { empty: false, id: 'exp-which', onchange: function (x) { st.which = x; } }), { half: true }),
          ui.field('Verification', ui.select(st.include, [['verified', 'Manually verified only'], ['verified_partial', 'Verified and partially verified'], ['all', 'All confirmed assets']], { empty: false, id: 'exp-include', onchange: function (x) { st.include = x; } }), { half: true }),
          ui.field('Mapping', ui.select(st.profile, XA.profiles().map(function (p) { return [p.id, p.name]; }), { empty: false, id: 'exp-profile', onchange: function (x) { st.profile = x; const p = XA.profile(x); if (p.format) st.format = p.format; } }), { half: true }),
          ui.field('Format', ui.seg(st.format, S.EXPORT_FORMATS, { onchange: function (x) { st.format = x; } }), { half: true, div: true }))),
      h('section.stack', { key: 'val' }, ui.label('Validation', h('span.count', null, U.plural(v.rows, 'record'))), report(v)),
      h('section.stack', { key: 'prev' }, ui.label('Preview', rows.length ? h('span.count', null, rows.length < col.assets.length ? 'first ' + rows.length + ' of ' + col.assets.length : String(rows.length)) : null),
        rows.length ? h('div.table-wrap', null, h('table.table.table-compact', null,
          h('thead', null, h('tr', null, profile.mapping.map(function (m, i) { return h('th', { key: 'h' + i }, m.target, m.required ? h('span.req', null, ' *') : null); }))),
          h('tbody', null, rows.map(function (r, i) { return h('tr', { key: 'r' + i }, r.map(function (c, k) { return h('td', { key: 'c' + k, 'class': U.blank(c) && profile.mapping[k].required ? 'cell-missing' : '' }, U.trunc(c, 60)); })); }))))
          : ui.empty({ icon: 'database', title: 'Nothing to export with these settings', text: st.scope !== 'all' && st.scope !== 'selected' && !st.scopeId ? 'Choose the ' + S.label(XA.scopeOptions(), st.scope).replace(/^One /, '').toLowerCase() + '.' : 'Change the scope, the records or the verification rule.' })),
      h('div.btn-row.wrap', { key: 'go' },
        h('span.grow'),
        ui.btn(st.busy ? 'Exporting…' : 'Export ' + U.plural(v.rows, 'asset') + ' as ' + S.label(S.EXPORT_FORMATS, st.format), { kind: 'primary', lg: true, icon: 'download', id: 'exp-go', disabled: st.busy || !v.rows, onclick: function () {
          if (st.busy) return undefined;
          st.busy = true; EV.redraw();
          const ask = v.ok ? Promise.resolve(true) : ui.confirm({ title: 'Export with validation issues?', message: 'The validation report lists problems in this export. The file is written as it is shown; nothing is filled in or corrected.', confirm: 'Export anyway' });
          return ask.then(function (ok) {
            if (!ok) { st.busy = false; EV.redraw(); return; }
            return XA.run(opts()).then(function (r) {
              st.busy = false;
              if (r.ok) EV.toast('Exported ' + U.plural(r.built.rows.length, 'asset') + ' · ' + r.record.code, 'ok', 4000);
              else EV.toast(r.message + ' Nothing was marked as exported.', 'warn', 5000);
            }, function (e) { st.busy = false; EV.reportError(e, 'Export'); });
          });
        } })),
      h('p.muted', { key: 'api' }, 'Direct delivery to the portal’s API is not built. The mapping and the export records are kept so that a connector can send the same mapped records later without changing the asset data.')
    ];
  }

  /* ------------------------------------------------------------------ mapping editor */
  function editMapping(id) {
    const src = id && id !== 'standard' ? store.get('export_profiles', id) : null;
    const base = src || XA.standard();
    const draft = { id: src ? src.id : null, name: src ? src.name : '', target_system: src ? src.target_system : '', format: base.format || 'csv', notes: src ? src.notes : '',
      mapping: base.mapping.map(function (m) { return Object.assign({}, m); }), paste: '' };
    const sheet = ui.openSheet({
      size: 'full', title: src ? 'Edit mapping' : 'New mapping', sub: 'The receiving system’s columns, in order, and where each value comes from',
      render: function () {
        const sources = [['', '— leave empty —']].concat(XA.SOURCES.map(function (s) { return [s[0], s[1]]; })).concat([['__const', 'Fixed value…']]);
        return [
          h('div.form-grid', { key: 'meta' },
            ui.field('Mapping name', ui.input(draft.name, { id: 'map-name', ph: 'e.g. Monitoring portal import', oninput: function (v) { draft.name = v; } }), { half: true, req: true }),
            ui.field('Receiving system', ui.input(draft.target_system, { ph: 'e.g. the monitoring portal', oninput: function (v) { draft.target_system = v; } }), { half: true }),
            ui.field('Default format', ui.seg(draft.format, S.EXPORT_FORMATS, { onchange: function (v) { draft.format = v; } }), { div: true }),
            ui.field('Notes', ui.textarea(draft.notes, { rows: 2, ph: 'Where the import template came from, its version…', oninput: function (v) { draft.notes = v; } }))),
          ui.card({ key: 'paste', title: 'Start from the portal’s import template' },
            h('p.muted', null, 'Paste the first line of the portal’s import file (its column names). Each becomes a column here with a suggested source — check every suggestion before saving.'),
            ui.textarea(draft.paste, { rows: 2, id: 'map-paste', ph: 'Device ID,Vendor,Product Model,Serial,MAC,Management IP,Site,Location,Device Type', oninput: function (v) { draft.paste = v; } }),
            h('div.btn-row', null, ui.btn('Use these columns', { sm: true, disabled: !draft.paste.trim(), id: 'map-paste-go', onclick: function () {
              const cols = XA.fromHeader(draft.paste);
              if (!cols.length) { EV.toast('No column names were found in that line.', 'warn'); return; }
              draft.mapping = cols; draft.paste = '';
              EV.toast(U.plural(cols.length, 'column') + ' added · ' + cols.filter(function (c) { return c.source; }).length + ' with a suggested source', 'ok', 4000);
            } }))),
          h('div.label-row', { key: 'l' }, h('span.label', null, 'Columns', h('span.count', null, ' ' + draft.mapping.length)), ui.btn('Add column', { sm: true, kind: 'ghost', icon: 'plus', onclick: function () { draft.mapping.push({ target: '', source: '', required: false }); } })),
          h('div.map-list', { key: 'cols' }, draft.mapping.map(function (m, i) {
            return h('div.map-row', { key: 'm' + i },
              h('span.map-n', null, String(i + 1)),
              ui.input(m.target, { ph: 'Column name in the portal', cls: 'map-target', oninput: function (v) { m.target = v; m.suggested = false; } }),
              ui.select(m.source, sources, { empty: false, cls: 'map-source', aria: 'Source for ' + (m.target || 'column'), onchange: function (v) { m.source = v; m.suggested = false; } }),
              m.source === '__const' ? ui.input(m.value || '', { ph: 'Fixed value', cls: 'map-const', oninput: function (v) { m.value = v; } }) : null,
              h('span.map-req', null, ui.toggle(!!m.required, { onchange: function (on) { m.required = on; } }), h('span', null, 'Required')),
              m.suggested && m.source ? ui.chip('Suggested', 'violet', { title: 'Matched by name — check it' }) : m.suggested ? ui.chip('No match', 'warn') : null,
              h('span.map-tools', null,
                ui.iconBtn('chev-up', { size: 16, title: 'Move up', disabled: i === 0, onclick: function () { const x = draft.mapping.splice(i, 1)[0]; draft.mapping.splice(i - 1, 0, x); } }),
                ui.iconBtn('chev-down', { size: 16, title: 'Move down', disabled: i === draft.mapping.length - 1, onclick: function () { const x = draft.mapping.splice(i, 1)[0]; draft.mapping.splice(i + 1, 0, x); } }),
                ui.iconBtn('trash', { size: 16, title: 'Remove column', onclick: function () { draft.mapping.splice(i, 1); } })));
          }))
        ];
      },
      footer: function () {
        return [src ? ui.btn('Archive mapping', { kind: 'ghost', key: 'a', icon: 'archive', onclick: function () { store.update('export_profiles', src.id, { archived: true }); if (st.profile === src.id) st.profile = 'standard'; ui.closeSheet(sheet); } }) : null,
          h('span.grow', { key: 'g' }),
          ui.btn('Cancel', { kind: 'ghost', key: 'c', onclick: function () { ui.closeSheet(sheet); } }),
          ui.btn('Save mapping', { kind: 'primary', key: 's', icon: 'check', id: 'map-save', onclick: function () {
            if (!draft.name.trim()) { EV.toast('Give the mapping a name.', 'warn'); return; }
            if (!draft.mapping.length || draft.mapping.some(function (m) { return U.blank(m.target); })) { EV.toast('Every column needs a name.', 'warn'); return; }
            const mapping = draft.mapping.map(function (m) { const x = { target: m.target.trim(), source: m.source || '', required: !!m.required }; if (m.source === '__const') x.value = m.value || ''; return x; });
            const data = { name: draft.name.trim(), target_system: draft.target_system.trim(), format: draft.format, mapping: mapping, options: {}, notes: draft.notes, archived: false };
            const rec = draft.id ? store.update('export_profiles', draft.id, data) : store.create('export_profiles', data);
            st.profile = rec.id; st.format = rec.format || st.format;
            ui.closeSheet(sheet); EV.toast('Mapping saved', 'ok');
          } })];
      }
    });
    return sheet;
  }
  XA.editMapping = editMapping;
  function mappingsTab() {
    return [
      h('p.muted', { key: 'p' }, 'A mapping says which columns the receiving system expects and which asset field fills each one. Set it up once the portal’s import requirements are known; the standard mapping uses this application’s own field names.'),
      h('div.btn-row', { key: 'b' }, ui.btn('New mapping', { kind: 'primary', icon: 'plus', id: 'map-new', disabled: store.readOnly, onclick: function () { editMapping(null); } })),
      h('div.list', { key: 'l' }, XA.profiles().map(function (p) {
        return ui.row({ key: p.id, left: icon('list', 17), title: [p.name, p.builtIn ? ui.chip('Built in', 'muted') : null], sub: [p.target_system, U.plural(p.mapping.length, 'column'), S.label(S.EXPORT_FORMATS, p.format)].filter(Boolean).join(' · '),
          onclick: function () { if (p.builtIn) { if (!store.readOnly) editMapping('standard'); } else editMapping(p.id); } });
      })),
      h('p.field-hint', { key: 'h' }, 'Opening the built-in mapping creates an editable copy; the built-in one never changes.')
    ];
  }
  function historyTab() {
    const list = U.sortBy(store.all('asset_exports'), function (x) { return x.created_at; }, true);
    return list.length ? h('div.list', { key: 'h' }, list.map(function (x) {
      return ui.row({ key: x.id, left: icon('share', 16), title: [h('span.mono', { key: 'c' }, x.code), ' · ' + U.plural(x.record_count || 0, 'asset') + ' · ' + S.label(S.EXPORT_FORMATS, x.format)],
        sub: [U.fmtDateTime(x.created_at), x.exported_by, x.profile_name, x.scope && x.scope.label, x.filename].filter(Boolean).join(' · '),
        right: (x.validation && (x.validation.invalid || x.validation.duplicates || (x.validation.required || []).length)) ? ui.chip('Had validation issues', 'warn') : ui.chip('Clean', 'ok'),
        onclick: function () {
          const s = x.scope || {};
          st.scope = s.scope || 'all'; st.scopeId = s.id || ''; st.ids = s.ids || st.ids; st.which = s.which || 'all'; st.include = s.include || 'verified';
          st.profile = x.profile_id && store.get('export_profiles', x.profile_id) ? x.profile_id : 'standard'; st.format = x.format || 'csv'; st.tab = 'export';
          EV.toast('Settings of ' + x.code + ' loaded. Export again to send the current values.');
        } });
    })) : ui.empty({ icon: 'share', title: 'No exports yet', key: 'none' });
  }
  EV.pages.integration = function () {
    const n = store.all('asset_exports').length;
    return [
      ui.head({ title: 'Export & Integration', sub: 'Asset records for the monitoring portal: CSV, Excel or JSON, mapped to its columns' }),
      ui.tabs([{ k: 'export', label: 'Export' }, { k: 'mappings', label: 'Field mapping', count: XA.profiles().length }, { k: 'history', label: 'Export history', count: n }], st.tab, function (k) { st.tab = k; }),
      st.tab === 'export' ? exportTab() : st.tab === 'mappings' ? mappingsTab() : historyTab()
    ];
  };
})();
