/* pages/assets.js — Enterprise Asset Registry, the asset record, duplicate review and merging, and the Identify Devices
 * queue. An asset's values each carry their source; a verified value is never replaced by one that is not. */
(function () {
  'use strict';
  const EV = window.EV, h = EV.h, U = EV.U, S = EV.S, store = EV.store, ui = EV.ui, icon = EV.icon, R = EV.rules, P = EV.photos, I = EV.inv, ID = EV.identify;
  const AS = (EV.assets = {});
  const st = { q: '', filter: 'all', building: '', floor: '', category: '', department: '', exp: '', tab: 'all', limit: 80, applied: '', select: false, picked: new Set() };

  /* ------------------------------------------------------------------ filters */
  const FILTERS = [['all', 'All assets'], ['listed', 'Listed — not yet seen'], ['seen', 'Seen (captured or confirmed)'], ['verified', 'Manually verified'], ['partial', 'Partially verified'], ['ai_review', 'AI identified — awaiting review'],
    ['needs_identification', 'Needs identification'], ['incomplete', 'Incomplete information'], ['missing_serial', 'Serial number not captured'],
    ['missing_mac', 'MAC address not captured'], ['missing_ip', 'IP address not captured'], ['missing_port', 'Switch port ID not captured (has an IP address)'], ['missing_identity', 'Manufacturer or model missing'],
    ['duplicates', 'Shares an identifier with another asset'], ['ready', 'Ready for export'], ['exported', 'Exported'], ['changed', 'Changed since export'], ['archived', 'Archived']];
  AS.FILTERS = FILTERS;
  AS.matches = function (d, f) {
    const a = I.asset(d);
    /* a device not yet seen is not a gap in the captured inventory */
    if (a.status === 'listed' && ['all', 'listed', 'duplicates', 'changed', 'exported'].indexOf(f) < 0) return false;
    switch (f) {
      case 'listed': case 'verified': case 'partial': case 'ai_review': case 'needs_identification': return a.status === f;
      case 'seen': return a.status !== 'listed';
      case 'incomplete': return a.incomplete;
      case 'missing_serial': return a.states.serial_number === 'not_captured';
      case 'missing_mac': return a.states.mac_address === 'not_captured';
      case 'missing_ip': return a.states.ip_address === 'not_captured';
      case 'missing_port': return a.states.switch_port === 'not_captured';
      case 'missing_identity': return a.missingIdentity.indexOf('Manufacturer') >= 0 || a.missingIdentity.indexOf('Model') >= 0;
      case 'duplicates': return I.duplicateIds().has(d.id);
      case 'ready': return a.status === 'verified' && a.exportState !== 'current';
      case 'exported': return a.exportState === 'current';
      case 'changed': return a.exportState === 'changed';
      default: return true;
    }
  };
  function list() {
    const source = st.filter === 'archived' ? store.all('devices').filter(function (d) { return d.archived; }) : I.assets();
    const q = st.q.trim().toLowerCase();
    return U.sortBy(source.filter(function (d) {
      if (st.building && d.building_id !== st.building) return false;
      if (st.floor && d.floor_id !== st.floor) return false;
      if (st.category && R.deviceType(d) !== st.category) return false;
      if (st.department) { const r = store.get('rooms', d.room_id); if (!r || (r.department || '').trim() !== st.department) return false; }
      if (st.exp && I.asset(d).exportState !== st.exp) return false;
      if (st.filter !== 'archived' && !AS.matches(d, st.filter)) return false;
      if (!q) return true;
      const room = store.get('rooms', d.room_id);
      return [d.code, d.manufacturer, d.model, d.serial_number, d.mac_address, d.ip_address, R.deviceType(d),
        room ? room.number + ' ' + room.name + ' ' + (room.department || '') : ''].some(function (v) { return v && String(v).toLowerCase().indexOf(q) >= 0; });
    }), function (d) { const r = store.get('rooms', d.room_id), f = store.get('floors', d.floor_id); return (f ? U.pad(f.sort_order != null ? f.sort_order : 999, 6) : 'zzz') + ' ' + (r ? r.number : 'zzz') + ' ' + d.code; });
  }
  AS.list = list;

  /* ------------------------------------------------------------------ registry page */
  EV.pages.assets = function () {
    if (st.applied !== EV.router.full) {
      st.applied = EV.router.full;
      const q = EV.router.query;
      /* a link shows exactly what it names: nothing is left over from an earlier visit */
      st.filter = q.filter || 'all'; st.category = q.category || ''; st.department = q.department || ''; st.tab = q.tab || 'all';
      st.q = ''; st.building = ''; st.floor = ''; st.exp = '';
      st.limit = 80; st.select = false; st.picked.clear();
    }
    const dup = I.duplicates();
    const pend = I.pending();
    const tabs = ui.tabs([{ k: 'all', label: 'Assets', count: I.assets().length }, { k: 'review', label: 'Awaiting review', count: pend.length },
      { k: 'duplicates', label: 'Duplicates', count: dup.strong.length + dup.possible.length + dup.photo.length }], st.tab, function (k) { st.tab = k; st.select = false; st.picked.clear(); });
    const head = ui.head({ title: 'Asset Registry', sub: 'Every confirmed device across every building, floor and room',
      actions: [ui.btn('Photograph device', { key: 'p', icon: 'camera', onclick: function () { ID.startAnywhere(); } }),
        ui.btn('Export', { key: 'x', kind: 'primary', icon: 'share', onclick: function () { EV.go('/integration'); } })] });
    if (st.tab === 'review') return [head, tabs, reviewList(pend)];
    if (st.tab === 'duplicates') return [head, tabs, duplicatesView(dup)];
    const rows = list();
    const buildings = U.sortBy(store.all('buildings').filter(function (b) { return !b.archived; }), function (b) { return b.name; }).map(function (b) { return [b.id, b.name || 'Unnamed building']; });
    const floors = [];
    store.all('buildings').filter(function (b) { return !b.archived && (!st.building || b.id === st.building); }).forEach(function (b) { R.buildingFloors(b.id).forEach(function (f) { floors.push([f.id, (buildings.length > 1 ? (b.name || '') + ' · ' : '') + 'Floor ' + f.number]); }); });
    const cats = U.uniq(I.assets().map(function (d) { return R.deviceType(d); })).sort(U.natCmp);
    const depts = U.uniq(I.liveRooms().map(function (r) { return (r.department || '').trim(); }).filter(Boolean)).sort(U.natCmp);
    const wide = window.innerWidth >= 1100;
    const filtered = st.filter !== 'all' || st.q || st.building || st.floor || st.category || st.department || st.exp;
    const shown = rows.slice(0, st.limit);
    return [
      head, tabs,
      h('div.toolbar', { onchange: function () { st.picked.clear(); }, oninput: function () { st.picked.clear(); } },
        ui.search(st.q, function (v) { st.q = v; st.limit = 80; }, 'Asset ID, model, serial, MAC, IP, room'),
        ui.select(st.filter, FILTERS, { empty: false, aria: 'Status', onchange: function (v) { st.filter = v; st.limit = 80; } }),
        buildings.length > 1 ? ui.select(st.building, buildings, { placeholder: 'All buildings', aria: 'Building', onchange: function (v) { st.building = v; st.floor = ''; } }) : null,
        ui.select(st.floor, floors, { placeholder: 'All floors', aria: 'Floor', onchange: function (v) { st.floor = v; } }),
        ui.select(st.category, cats, { placeholder: 'All categories', aria: 'Category', onchange: function (v) { st.category = v; } }),
        depts.length ? ui.select(st.department, depts, { placeholder: 'All departments', aria: 'Department', onchange: function (v) { st.department = v; } }) : null,
        ui.select(st.exp, [['never', 'Not exported'], ['current', 'Exported'], ['changed', 'Changed since export']], { placeholder: 'Any export status', aria: 'Export status', onchange: function (v) { st.exp = v; } })),
      h('div.label-row', null,
        h('span.label', null, U.plural(rows.length, 'asset') + (st.filter !== 'all' ? ' · ' + S.label(FILTERS, st.filter) : '')),
        h('span.label-actions', null,
          filtered ? h('button.link', { type: 'button', onclick: function () { st.filter = 'all'; st.q = ''; st.building = ''; st.floor = ''; st.category = ''; st.department = ''; st.exp = ''; } }, 'Clear filters') : null,
          rows.length && !store.readOnly ? h('button.link', { type: 'button', id: 'assets-select', onclick: function () { st.select = !st.select; st.picked.clear(); } }, st.select ? 'Cancel selection' : 'Select') : null)),
      st.select ? bulkBar(rows) : null,
      !rows.length ? ui.empty({ icon: 'database', title: I.assets().length ? 'No asset matches these filters' : 'No assets yet', text: I.assets().length ? '' : 'Open a room under Room Inventory and photograph its first device.' })
        : wide && !st.select ? table(shown) : h('div.asset-list', null, shown.map(function (d) {
          if (!st.select) return EV.assetRow(d, { showRoom: true });
          const on = st.picked.has(d.id);
          return h('div', { key: d.id, 'class': U.cx('pick-row', on && 'on') },
            h('button', { type: 'button', 'class': U.cx('pick-box', on && 'on'), 'aria-pressed': on ? 'true' : 'false', 'aria-label': 'Select ' + d.code, onclick: function () { if (on) st.picked.delete(d.id); else st.picked.add(d.id); EV.redraw(); } }, on ? icon('check', 15) : null),
            EV.assetRow(d, { showRoom: true }));
        })),
      rows.length > st.limit ? ui.btn('Show more (' + (rows.length - st.limit) + ' remaining)', { block: true, onclick: function () { st.limit += 200; } }) : null
    ];
  };
  function table(rows) {
    return h('div.table-wrap', null, h('table.table', null,
      h('thead', null, h('tr', null, ['Asset ID', 'Device', 'Location', 'Serial number', 'MAC address', 'IP address', 'Status'].map(function (c) { return h('th', { key: c }, c); }))),
      h('tbody', null, rows.map(function (d) {
        const a = I.asset(d), room = store.get('rooms', d.room_id), f = store.get('floors', d.floor_id), b = store.get('buildings', d.building_id);
        const cell = function (fk) {
          const s = a.states[fk];
          return h('td', { key: fk }, s === 'verified' || s === 'captured' ? [h('span.mono', { key: 'v' }, d[fk]), s === 'captured' ? h('span.cell-unv', { key: 'u' }, ' unverified') : null]
            : h('span', { 'class': s === 'not_captured' ? 'cell-missing' : 'muted' }, I.ID_STATE_LABEL[s]));
        };
        return h('tr.click', { key: d.id, onclick: function () { AS.open(d.id); } },
          h('td', null, h('span.mono', null, d.code), ui.demo(d)),
          h('td', null, h('div.cell-main', null, [d.manufacturer, d.model].filter(Boolean).join(' ') || h('span.cell-missing', null, 'Not identified')), h('div.muted', null, R.deviceType(d))),
          h('td', null, h('div.cell-main', null, room ? R.roomLabel(room) : '—'), h('div.muted', null, [b && b.name, f && 'Floor ' + f.number, room && room.department].filter(Boolean).join(' · '))),
          cell('serial_number'), cell('mac_address'), cell('ip_address'),
          h('td', null, ui.chip(I.statusLabel(a.status), I.STATUS_TONE[a.status]), a.exportState !== 'never' ? ui.chip(I.EXPORT_LABEL[a.exportState], a.exportState === 'current' ? 'accent' : 'warn') : null));
      }))));
  }
  function bulkBar(rows) {
    const picked = function () { return rows.filter(function (d) { return st.picked.has(d.id); }); };
    const n = picked().length;
    return h('div.bulk-bar', null,
      h('span.bulk-count', null, n + ' selected'),
      h('button.link', { type: 'button', onclick: function () { if (n === rows.length) st.picked.clear(); else { st.picked.clear(); rows.forEach(function (d) { st.picked.add(d.id); }); } EV.redraw(); } }, n === rows.length ? 'Select none' : 'Select all ' + rows.length),
      h('span.grow'),
      ui.btn('Set category', { sm: true, disabled: !n, onclick: function () {
        return ui.choose({ title: 'Category for ' + U.plural(n, 'asset'), options: I.categories().map(function (c) { return { label: c, value: c }; }) }).then(function (c) {
          if (!c) return;
          const list = picked().filter(function (d) { return d.category !== c; });
          const confirmed = list.filter(function (d) { return d.identity_confirmed_at; }).length;
          const ask = confirmed ? ui.confirm({ title: 'Change the category of ' + U.plural(list.length, 'asset') + '?', message: U.plural(confirmed, 'asset') + ' have a confirmed identity. A new category is a changed identity: each will need to be confirmed again.', confirm: 'Change category' }) : Promise.resolve(true);
          return ask.then(function (ok) {
            if (!ok) return;
            list.forEach(function (d) { I.update(d, { category: c }); });
            EV.toast('Category set on ' + U.plural(list.length, 'asset') + (confirmed ? ' · ' + confirmed + ' to confirm again' : ''), 'ok', 4000);
          });
        });
      } }),
      ui.btn('Export selected', { sm: true, kind: 'primary', icon: 'share', disabled: !n, onclick: function () { EV.integration.selectIds(picked().map(function (d) { return d.id; })); EV.go('/integration'); } }),
      ui.btn('Archive', { sm: true, kind: 'ghost', icon: 'archive', disabled: !n, onclick: function () {
        return ui.confirm({ title: 'Archive ' + U.plural(n, 'asset') + '?', message: 'Archived assets leave the active inventory and its counts. Their records and history are kept and can be restored.', confirm: 'Archive' }).then(function (ok) {
          if (!ok) return;
          picked().forEach(function (d) { store.update('devices', d.id, { archived: true }); });
          st.picked.clear(); st.select = false;
        });
      } }));
  }

  /* ------------------------------------------------------------------ captures awaiting review */
  EV.captureRow = function (c) {
    const photos = P.forIdentification(c.id), room = store.get('rooms', c.room_id);
    const res = c.result, dev = res && res.devices && res.devices[c.selected_index || 0];
    const name = [(c.draft && c.draft.values.manufacturer) || (dev && dev.manufacturer.value), (c.draft && c.draft.values.model) || (dev && dev.model.value)].filter(Boolean).join(' ');
    return h('button', { type: 'button', key: c.id, 'class': 'asset-row', onclick: function () { ID.open({ capture: c.id }); } },
      h('span.asset-thumb', null, photos[0] && photos[0].thumb ? h('img', { src: photos[0].thumb, alt: '', loading: 'lazy' }) : icon('camera', 22)),
      h('span.asset-main', null,
        h('span.asset-title', null, name || h('span.muted', null, 'Not identified yet')),
        h('span.asset-sub', null, [room ? R.roomLabel(room) : 'Room removed', U.plural(photos.length, 'photograph'), U.ago(c.created_at)].join(' · '))),
      h('span.asset-right', null, ui.chip(S.label(S.IDENTIFICATION_STATUS, c.status), c.status === 'ready' ? 'violet' : c.status === 'failed' ? 'danger' : 'muted')));
  };
  function reviewList(pend) {
    return h('section.stack', null,
      h('p.muted', null, 'Photographed devices that are not in the inventory yet. Open one to identify it, check the values and confirm.'),
      pend.length ? h('div.asset-list', null, pend.map(EV.captureRow)) : ui.empty({ icon: 'check-circle', title: 'Nothing awaiting review' }));
  }
  /* Identify Devices: everything still to be identified or checked, and the state of AI identification */
  EV.pages.identify = function () {
    const pend = I.pending();
    const needs = I.assets().filter(function (d) { return I.asset(d).status === 'needs_identification'; });
    const aiUnv = I.assets().filter(function (d) { return I.asset(d).status === 'ai_review'; });
    const av = EV.ai.availability();
    return [
      ui.head({ title: 'Identify Devices', sub: 'Photograph, identify, review, confirm',
        actions: [ui.btn('Photograph a device', { key: 'p', kind: 'primary', icon: 'camera', id: 'identify-start', onclick: function () { ID.startAnywhere(); } })] }),
      av.ok ? ui.note('ok', 'AI identification is available' + (av.provider ? ' (' + av.provider + (av.model ? ' · ' + av.model : '') + ')' : '') + '. Photographs are sent only when you tap “Identify with AI”, and every value is reviewed before it is saved.', { title: 'AI identification' })
        : ui.note('info', av.message, { title: 'AI identification unavailable', action: av.canCheck ? h('div.btn-row', null, ui.btn(EV.ai.checking ? 'Checking…' : 'Check again', { sm: true, disabled: EV.ai.checking, onclick: function () { return EV.ai.check(); } })) : null }),
      h('section.stack', null, ui.label('Captures awaiting review', h('span.count', null, String(pend.length))),
        pend.length ? h('div.asset-list', null, pend.map(EV.captureRow)) : h('p.muted', null, 'No capture is waiting.')),
      h('section.stack', null, ui.label('Assets needing identification', h('span.count', null, String(needs.length))),
        needs.length ? h('div.asset-list', null, needs.slice(0, 100).map(function (d) { return EV.assetRow(d, { showRoom: true }); })) : h('p.muted', null, 'Every asset has a manufacturer and model.')),
      aiUnv.length ? h('section.stack', null, ui.label('AI values not yet confirmed', h('span.count', null, String(aiUnv.length))),
        h('div.asset-list', null, aiUnv.slice(0, 100).map(function (d) { return EV.assetRow(d, { showRoom: true }); }))) : null
    ];
  };

  /* ------------------------------------------------------------------ duplicates */
  function groupCard(g, kind) {
    return ui.card({ key: g.key, title: g.label + ': ' + g.value, right: ui.chip(kind === 'strong' ? 'Likely the same device' : kind === 'photo' ? 'Similar photographs' : 'Check', kind === 'strong' ? 'danger' : 'warn') },
      h('div.asset-list', null, g.devices.map(function (d) { return EV.assetRow(d, { showRoom: true }); })),
      h('div.btn-row.wrap', null,
        g.devices.length === 2 ? ui.btn('Compare and merge', { sm: true, kind: 'primary', icon: 'copy', onclick: function () { AS.mergeSheet(g.devices[0].id, g.devices[1].id); } })
          : g.devices.slice(1).map(function (d) { return ui.btn('Merge ' + d.code + ' into ' + g.devices[0].code, { sm: true, key: d.id, icon: 'copy', onclick: function () { AS.mergeSheet(g.devices[0].id, d.id); } }); }),
        ui.btn(g.devices.length === 2 ? 'They are different devices' : 'They are ' + g.devices.length + ' different devices', { sm: true, kind: 'ghost', onclick: function () { I.markDistinct(g.devices); EV.toast('Kept as separate devices', 'ok'); } })));
  }
  function duplicatesView(dup) {
    return h('section.stack.stack-lg', null,
      h('p.muted', null, 'Nothing is merged automatically. Records that share a serial number or MAC address are most likely the same device photographed twice; the same model in the same room is often several identical devices.'),
      dup.strong.length ? h('div.stack', null, ui.label('Same identifier', h('span.count', null, String(dup.strong.length))), dup.strong.map(function (g) { return groupCard(g, 'strong'); })) : null,
      dup.photo.length ? h('div.stack', null, ui.label('Nearly identical photographs', h('span.count', null, String(dup.photo.length))), dup.photo.map(function (g) { return groupCard(g, 'photo'); })) : null,
      dup.possible.length ? h('div.stack', null, ui.label('Same model in the same room', h('span.count', null, String(dup.possible.length))), dup.possible.map(function (g) { return groupCard(g, 'possible'); })) : null,
      !dup.strong.length && !dup.photo.length && !dup.possible.length ? ui.empty({ icon: 'check-circle', title: 'No potential duplicates' }) : null);
  }
  /* Compare two records and decide: merge (field by field) or keep them as separate devices. */
  AS.mergeSheet = function (keepId, dropId, o) {
    o = o || {};
    const s = { keep: keepId, drop: dropId, take: {} };
    const sheet = ui.openSheet({
      size: 'full', title: o.fromCapture ? 'Same identifier as an existing asset' : 'Compare and merge',
      sub: o.reasons ? o.reasons.join(' · ') : 'Choose the value to keep for each field',
      render: function () {
        const a = store.get('devices', s.keep), b = store.get('devices', s.drop);
        if (!a || !b) return ui.empty({ icon: 'check-circle', title: 'One of these records no longer exists.' });
        const blocked = I.mergeBlocks(a, b);
        const fields = I.FIELDS.filter(function (f) { return !U.blank(a[f.k]) || !U.blank(b[f.k]); });
        const where = function (d) { const r = store.get('rooms', d.room_id); return r ? R.roomLabel(r) : '—'; };
        return [
          o.fromCapture ? ui.note('warn', 'The device you just saved (' + b.code + ') shares an identifier with ' + a.code + '. If it is the same physical device, merge them; if they really are two devices, keep both.', { key: 'n' }) : null,
          h('div.merge-head', { key: 'h' },
            h('div.merge-col', null, h('span.label', null, 'Keep'), h('span.mono', null, a.code), h('span.muted', null, where(a) + ' · ' + U.fmtDate(a.created_at))),
            ui.iconBtn('refresh', { title: 'Swap which record is kept', onclick: function () { const t = s.keep; s.keep = s.drop; s.drop = t; s.take = {}; } }),
            h('div.merge-col', null, h('span.label', null, 'Merge in'), h('span.mono', null, b.code), h('span.muted', null, where(b) + ' · ' + U.fmtDate(b.created_at)))),
          h('div.merge-list', { key: 'f' }, fields.map(function (f) {
            const av = a[f.k], bv = b[f.k], same = String(av || '') === String(bv || '');
            const useB = !same && !blocked[f.k] && (s.take[f.k] === true || (U.blank(av) && s.take[f.k] !== false));
            return h('div.merge-row', { key: f.k },
              h('span.merge-label', null, f.label),
              h('button', { type: 'button', 'class': U.cx('merge-val', !useB && 'on'), disabled: same, onclick: function () { s.take[f.k] = false; } }, U.blank(av) ? h('span.muted', null, '—') : h('span', { 'class': f.id ? 'mono' : '' }, String(av))),
              h('button', { type: 'button', 'class': U.cx('merge-val', useB && 'on'), disabled: same || !!blocked[f.k] || U.blank(bv), title: blocked[f.k] || '', onclick: function () { s.take[f.k] = true; } },
                U.blank(bv) ? h('span.muted', null, '—') : h('span', { 'class': f.id ? 'mono' : '' }, String(bv))),
              blocked[f.k] ? h('span.field-hint.hint-warn', null, blocked[f.k]) : null);
          })),
          (function () { const fills = I.mergeFills(a, b); return fills.length ? h('p.muted', { key: 'fill' }, 'Also taken from ' + b.code + ', where ' + a.code + ' has nothing recorded: ' + fills.map(function (c) { const fd = S.F.device.find(function (x) { return x.k === c; }); return fd ? fd.label : c; }).join(', ') + '.') : null; })(),
          h('p.muted', { key: 'p' }, 'Photographs, AI results and every reference move to ' + a.code + '. ' + b.code + ' is deleted and stays in the history as merged.')
        ];
      },
      footer: function () {
        return [ui.btn('Keep as separate devices', { kind: 'ghost', key: 'sep', onclick: function () {
          const a = store.get('devices', s.keep), b = store.get('devices', s.drop);
          if (a && b) I.markDistinct([a, b]);
          ui.closeSheet(sheet); EV.toast('Kept as separate devices', 'ok');
        } }), h('span.grow', { key: 'g' }),
        ui.btn('Merge', { kind: 'primary', key: 'm', icon: 'copy', id: 'merge-go', onclick: function () {
          try {
            const res = I.merge(s.keep, s.drop, s.take);
            ui.closeSheet(sheet);
            EV.toast('Merged into ' + res.kept.code, 'ok');
          } catch (e) { EV.reportError(e, 'Merge'); }
        } })];
      }
    });
    return sheet;
  };

  /* ------------------------------------------------------------------ the asset record */
  function srcChip(d, k) {
    const s = I.sources(d)[k];
    return s ? ui.chip(I.sourceLabel(s), s === 'ai' ? 'violet' : s === 'label' ? 'accent' : 'muted') : null;
  }
  function textRow(d, k, label, o) {
    o = o || {};
    return ui.field(h('span', null, label, ' ', srcChip(d, k)), o.list
      ? h('div.combo', null, ui.input(d[k] || '', { id: 'as-' + k, list: 'dl-as-' + k, mono: o.mono, disabled: store.readOnly, oninput: function (v) { I.update(store.get('devices', d.id), set(k, v)); } }),
        h('datalist', { id: 'dl-as-' + k }, o.list.map(function (x) { return h('option', { key: x, value: x }); })))
      : ui.input(d[k] || '', { id: 'as-' + k, mono: o.mono, disabled: store.readOnly, oninput: function (v) { I.update(store.get('devices', d.id), set(k, v)); } }), { key: k, half: o.half, div: true });
  }
  function set(k, v) { const p = {}; p[k] = k === 'mac_address' ? R.macFormat(v) : v; return p; }
  function idRow(d, f) {
    const a = I.asset(d), s = a.states[f.k], status = d[f.s] || 'unknown';
    const off = status === 'unavailable' || status === 'not_applicable';
    return h('div.field.ident', { key: f.k },
      h('div.ident-head', null, h('span.field-label', null, f.label, ' ', srcChip(d, f.k)), ui.chip(I.ID_STATE_LABEL[s], I.ID_STATE_TONE[s])),
      h('div.ident-row', null,
        ui.input(d[f.k] || '', { id: 'as-' + f.k, mono: true, disabled: off || store.readOnly, ph: off ? S.label(S.ID_STATUS, status) : '',
          oninput: function (v) { I.update(store.get('devices', d.id), set(f.k, f.k === 'ip_address' ? v.trim() : v)); },
          onchange: function (v) { if (v !== v.trim()) I.update(store.get('devices', d.id), set(f.k, v.trim())); } }),
        ui.select(status, S.ID_STATUS, { empty: false, cls: 'ident-status', disabled: store.readOnly, aria: f.label + ' status', onchange: function (v) { I.setIdStatus(store.get('devices', d.id), f, v); } })),
      a.invalid.some(function (x) { return x.indexOf(f.label.split(' ')[0]) === 0; }) ? h('span.field-error', null, f.k === 'mac_address' ? 'A MAC address has 12 hexadecimal digits.' : 'This is not a valid IP address.') : null);
  }
  function aiCard(d) {
    const cap = d.ai_identification_id ? store.getAny('asset_identifications', d.ai_identification_id) : null;
    if (!cap) return null;
    const res = cap.result, dev = res && res.devices && res.devices[cap.selected_index || 0];
    return ui.section({ key: 'ai-' + d.id, title: 'Original identification', sub: res ? (res.model || res.provider || 'AI') + ' · ' + U.fmtDateTime(cap.completed_at) : 'Entered without AI · ' + U.fmtDateTime(cap.created_at), icon: 'zap' },
      !res ? h('p.muted', null, 'No AI identification was run for this capture; the values were entered by a person.')
        : !dev ? h('p.muted', null, 'The AI did not identify a device in the photographs.')
          : h('div.kv-list', null,
            [['Manufacturer', dev.manufacturer], ['Model', dev.model], ['Category', dev.category]].map(function (x) {
              return ui.kv(x[0], x[1].value ? x[1].value + ' (' + (x[1].confidence || '') + ', ' + String(x[1].evidence || '').replace('_', ' ') + ')' : '', { key: x[0] });
            }),
            [['Serial number', dev.serial_number], ['MAC address', dev.mac_address], ['IP address', dev.ip_address]].map(function (x) { return ui.kv(x[0], x[1].value || 'Not visible', { mono: true, key: x[0] }); }),
            dev.model.alternatives.length ? ui.kv('Similar models', dev.model.alternatives.join(', ')) : null,
            dev.review_reasons.length ? ui.kv('Review notes', dev.review_reasons.join(' ')) : null),
      h('p.field-hint', null, 'Kept exactly as returned. What the asset holds now is what a person confirmed or changed.'));
  }
  function historyCard(d) {
    const items = I.history(d).slice(0, 40);
    return ui.section({ key: 'hist-' + d.id, title: 'History', sub: U.plural(items.length, 'entry', 'entries'), icon: 'clock' },
      items.length ? h('div.list', null, items.map(function (e) {
        return h('div.row.row-compact', { key: e.id }, h('span.row-main', null, h('span.row-title', null, e.summary), h('span.row-sub', null, U.fmtDateTime(e.at) + ' · ' + (e.actor || '')),
          (e.changes || []).length ? h('span.row-sub.mono', null, e.changes.map(function (c) { return c.f + ': ' + (c.from || '—') + ' → ' + (c.to || '—'); }).join('; ')) : null));
      })) : h('p.muted', null, 'No changes recorded.'));
  }
  /* ------------------------------------------------------------------ reading a label in photographs already taken */
  const LABEL_FIRST = { 'Equipment labels': 0, 'Network port labels': 1, 'Device rear panels': 2 };
  AS.labelPhotos = function (deviceId) {
    return U.sortBy(P.forDevice(deviceId), function (p) { return (LABEL_FIRST[p.category] != null ? LABEL_FIRST[p.category] : 9) + (p.taken_at || ''); });
  };
  /* Sends the device's photographs (labels first) to the identification service; returns what it read, unchanged. */
  AS.readLabel = function (deviceId) {
    const photos = AS.labelPhotos(deviceId);
    if (!photos.length) return Promise.reject(new Error('This device has no photographs. Add a photograph of its label first.'));
    return EV.ai.identify(photos);
  };
  /* Adds one value read from a photograph to the device. A value already recorded and verified is never replaced by one
     read from a photograph; the same value adds nothing. Returns a message saying what happened. */
  AS.applyRead = function (deviceId, k, value, source) {
    const d = store.get('devices', deviceId);
    if (!d) return 'This device no longer exists.';
    const f = I.ID_FIELDS.find(function (x) { return x.k === k; });
    const v = k === 'mac_address' ? R.macFormat(value) : String(value || '').trim();
    if (!v) return 'Nothing to add.';
    const same = String(d[k] || '').trim().toLowerCase() === v.toLowerCase();
    if (same) return (f ? f.label : k) + ' is already recorded as ' + d[k] + '.';
    if (f && I.idState(d, f) === 'verified') return 'The recorded ' + f.label.toLowerCase() + ' (' + d[k] + ') is verified and is not replaced. Change it yourself if the label shows otherwise.';
    const p = {}; p[k] = v;
    I.update(d, p, source || 'ai');
    return (f ? f.label : k) + ' added: ' + v + '.';
  };
  function labelReader(d, rd) {
    if (store.readOnly) return null;
    const av = EV.ai.availability(), photos = AS.labelPhotos(d.id);
    const parts = [];
    const add = function (k, v, src, key) {
      return ui.btn('Add to device', { sm: true, kind: 'primary', key: key, onclick: function () { const msg = AS.applyRead(d.id, k, v, src); EV.toast(msg, /added/.test(msg) ? 'ok' : 'warn', 4500); } });
    };
    if (av.ok) parts.push(ui.btn(rd.busy ? 'Reading…' : 'Read label from photographs', { sm: true, icon: 'zap', key: 'read', id: 'asset-read-label', disabled: rd.busy || !photos.length, onclick: function () {
      rd.busy = true; rd.err = ''; rd.res = null; EV.redraw();
      return AS.readLabel(d.id).then(function (res) { rd.busy = false; rd.res = res; EV.redraw(); }, function (e) { rd.busy = false; rd.err = (e && e.message) || String(e); EV.redraw(); });
    } }));
    if (EV.identify.barcodeSupported() && photos.length) parts.push(ui.btn(rd.codesBusy ? 'Reading barcodes…' : 'Read barcodes', { sm: true, kind: 'ghost', icon: 'list', key: 'bc', disabled: rd.codesBusy, onclick: function () {
      rd.codesBusy = true; rd.codes = null; EV.redraw();
      const run = photos.slice(0, 6).reduce(function (pr, ph) { return pr.then(function (acc) { return EV.identify.readBarcodes(ph).then(function (v) { return acc.concat(v); }, function () { return acc; }); }); }, Promise.resolve([]));
      return run.then(function (all) { rd.codesBusy = false; rd.codes = U.uniq(all); EV.redraw(); });
    } }));
    const out = [];
    if (parts.length) out.push(h('div.btn-row.wrap', { key: 'rb' }, parts));
    if (!av.ok && photos.length) out.push(h('p.field-hint', { key: 'na' }, 'Reading a label automatically needs AI identification, which is unavailable here: ' + av.message + (EV.identify.barcodeSupported() ? ' Barcodes on the label can still be read.' : '')));
    if (rd.err) out.push(ui.note('danger', rd.err, { key: 'err', title: 'Label not read' }));
    if (rd.res) {
      const rows = [];
      (rd.res.devices || []).forEach(function (x, i) {
        [['serial_number', 'Serial number'], ['mac_address', 'MAC address'], ['ip_address', 'IP address']].forEach(function (p) {
          const v = x[p[0]] && x[p[0]].value;
          if (v) rows.push(h('div.row', { key: i + p[0] }, h('span.row-main', null, h('span.row-title.mono', null, v), h('span.row-sub', null, p[1] + ' — read from a label')), h('span.row-right', null, add(p[0], v, 'ai', 'a' + i + p[0]))));
          else if (x[p[0]] && x[p[0]].raw_text) rows.push(h('div.row', { key: i + p[0] + 'r' }, h('span.row-main', null, h('span.row-title.mono', null, x[p[0]].raw_text), h('span.row-sub', null, p[1] + ' — text seen but not complete or not valid: not used'))));
        });
      });
      out.push(rows.length ? ui.card({ key: 'res', title: 'Read from the photographs' }, h('div.list', null, rows), h('p.field-hint', null, 'Nothing is added until you tap it. A verified value is never replaced.'))
        : ui.note('info', 'No serial number, MAC address or IP address could be read in these photographs. A closer, sharper photograph of the label usually helps.', { key: 'none' }));
    }
    if (rd.codes) {
      out.push(rd.codes.length ? ui.card({ key: 'codes', title: 'Barcodes in the photographs' }, h('div.list', null, rd.codes.map(function (v) {
        const mac = R.macFormat(v);
        return h('div.row', { key: v }, h('span.row-main', null, h('span.row-title.mono', null, v)), h('span.row-right.btn-row.wrap', null,
          ui.btn('Serial', { sm: true, kind: 'ghost', onclick: function () { const msg = AS.applyRead(d.id, 'serial_number', v, 'label'); EV.toast(msg, /added/.test(msg) ? 'ok' : 'warn', 4500); } }),
          R.macValid(mac) ? ui.btn('MAC', { sm: true, kind: 'ghost', onclick: function () { const msg = AS.applyRead(d.id, 'mac_address', mac, 'label'); EV.toast(msg, /added/.test(msg) ? 'ok' : 'warn', 4500); } }) : null));
      })), h('p.field-hint', null, 'Choose where each value belongs.')) : ui.note('info', 'No barcode was found in the photographs.', { key: 'nocodes' }));
    }
    return out.length ? h('div.stack', { key: 'reader', style: 'gap:8px' }, out) : null;
  }
  AS.open = function (id) {
    const rd = { busy: false, err: '', res: null, codes: null, codesBusy: false };
    const sheet = ui.openSheet({
      size: 'full',
      title: function () { const d = store.get('devices', id); return d ? ([d.manufacturer, d.model].filter(Boolean).join(' ') || R.deviceType(d)) : 'Asset'; },
      sub: function () { const d = store.get('devices', id); if (!d) return ''; const r = store.get('rooms', d.room_id), f = store.get('floors', d.floor_id), b = store.get('buildings', d.building_id); return [d.code, b && b.name, f && 'Floor ' + f.number, r && R.roomLabel(r)].filter(Boolean).join(' · '); },
      render: function () {
        const d = store.get('devices', id);
        if (!d) { const g = store.getAny('devices', id); return ui.empty({ icon: 'alert-circle', title: g && g.merged_into ? 'This asset was merged into ' + ((store.getAny('devices', g.merged_into) || {}).code || 'another record') + '.' : 'This asset no longer exists.',
          action: g && g.merged_into && store.get('devices', g.merged_into) ? ui.btn('Open it', { kind: 'primary', onclick: function () { ui.closeSheet(sheet); AS.open(g.merged_into); } }) : null }); }
        const a = I.asset(d), photos = P.forDevice(d.id), room = store.get('rooms', d.room_id), groups = I.groupsFor(d.id);
        return h('div.stack.stack-lg', { key: d.id },
          h('div.chips', null, ui.chip(I.statusLabel(a.status), I.STATUS_TONE[a.status]), ui.chip(I.EXPORT_LABEL[a.exportState], a.exportState === 'current' ? 'accent' : a.exportState === 'changed' ? 'warn' : 'muted'),
            d.archived ? ui.chip('Archived', 'muted') : null, ui.demo(d)),
          a.status === 'needs_identification' ? ui.note('danger', (a.missingIdentity.length ? 'Not identified: ' + a.missingIdentity.join(', ') + '. Record what the label shows.' : '') + (d.manual_review ? ' Flagged for manual review.' : ''), { title: 'Needs identification',
            action: !a.missingIdentity.length && !store.readOnly ? h('div.btn-row', null, ui.btn('Reviewed: confirm identity', { sm: true, kind: 'primary', icon: 'check', id: 'asset-confirm', onclick: function () { I.confirmIdentity(d); EV.toast('Identity confirmed', 'ok'); } })) : null })
            : !d.identity_confirmed_at ? ui.note(a.aiUnverified ? 'warn' : 'info', (a.aiUnverified ? 'The manufacturer or model came from AI image recognition and has not been confirmed by a person.' : 'This identity was recorded before the inventory review and has not been confirmed.'),
              { title: 'Identity not confirmed', action: store.readOnly ? null : h('div.btn-row', null, ui.btn('Confirm identity', { sm: true, kind: 'primary', icon: 'check', id: 'asset-confirm', onclick: function () { I.confirmIdentity(d); EV.toast('Identity confirmed', 'ok'); } })) })
              : a.status === 'partial' ? ui.note('warn', [a.notCaptured.length ? 'Not captured: ' + a.notCaptured.join(', ') + '.' : '', a.unverified.length ? 'Captured, not verified: ' + a.unverified.join(', ') + '.' : '', a.invalid.length ? 'Check the ' + a.invalid.join(' and ') + '.' : ''].filter(Boolean).join(' '), { title: 'Identity confirmed — identifiers still open' })
                : ui.note('ok', 'Identity confirmed' + (d.identity_confirmed_by ? ' by ' + d.identity_confirmed_by : '') + (d.identity_confirmed_at ? ' on ' + U.fmtDate(d.identity_confirmed_at) : '') + '; every identifier is verified, not accessible, or not applicable.', { title: 'Manually verified' }),
          groups.length ? ui.note('danger', groups.map(function (g) { return g.label + ' ' + g.value + ' — also ' + g.devices.filter(function (x) { return x.id !== d.id; }).map(function (x) { return x.code; }).join(', '); }).join('. ') + '.',
            { title: 'Possible duplicate', action: h('div.btn-row.wrap', null, groups[0].devices.filter(function (x) { return x.id !== d.id; }).slice(0, 3).map(function (x) {
              return ui.btn('Compare with ' + x.code, { sm: true, key: x.id, onclick: function () { AS.mergeSheet(d.id, x.id); } });
            })) }) : null,
          h('div.form-group', null,
            h('div.form-group-title', null, 'Photographs'),
            photos.length ? P.strip(photos) : h('p.muted', null, 'No photographs.'),
            store.readOnly ? null : h('div.btn-row.wrap', null,
              P.captureButton({ key: 'as-cam-' + d.id, sm: true, label: 'Add photograph', ctx: function () { return { room: room, device_id: d.id, category: 'Equipment labels', description: d.code }; } }),
              P.captureButton({ key: 'as-lib-' + d.id, sm: true, kind: 'ghost', label: 'Upload', library: true, ctx: function () { return { room: room, device_id: d.id, category: 'Equipment labels', description: d.code }; } })),
            labelReader(d, rd)),
          h('div.form-group', null,
            h('div.form-group-title', null, 'Identity'),
            h('div.form-grid', null,
              ui.field(h('span', null, 'Device category', ' ', srcChip(d, 'category')), EV.identify.categoryPicker('asset-' + d.id, d.category || '', { id: 'as-category', disabled: store.readOnly,
                onpick: function (v) { const cur = store.get('devices', d.id); if (cur && v !== (cur.category || '')) I.update(cur, { category: v }); } }), { key: 'category', div: true }),
              textRow(d, 'manufacturer', 'Manufacturer', { half: true, list: I.manufacturers() }), textRow(d, 'model', 'Model', { half: true, mono: true }),
              ui.field('Needs manual review', ui.toggle(!!d.manual_review, { disabled: store.readOnly, onchange: function (on) { store.update('devices', d.id, { manual_review: on }); } }), { div: true, cls: 'field-toggle', key: 'mr', hint: 'Keeps the asset listed as needing identification, whatever has been recorded.' }))),
          h('div.form-group', null,
            h('div.form-group-title', null, 'Identifiers'),
            h('div.form-grid', null, ['serial_number', 'mac_address', 'ip_address'].map(function (k) { return idRow(d, I.ID_FIELDS.find(function (f) { return f.k === k; })); }))),
          h('div.form-group', null,
            h('div.form-group-title', null, 'Location and notes'),
            h('div.kv-list', null, ui.kv('Room', room ? R.roomLabel(room) + (room.department ? ' · ' + room.department : '') : 'No room'), ui.kv('Captured', U.fmtDateTime(d.created_at) + (d.created_by ? ' · ' + d.created_by : '')),
              ui.kv('Last verified', d.last_verified_at ? U.fmtDateTime(d.last_verified_at) : 'Not yet'), d.exported_at ? ui.kv('Last exported', U.fmtDateTime(d.exported_at) + ' · ' + (d.export_code || '')) : null),
            store.readOnly ? null : h('div.btn-row.wrap', null, ui.btn('Move to another room', { sm: true, icon: 'arrow-right', onclick: function () {
              return ui.pickRoom({ title: 'Move ' + d.code + ' to…' }).then(function (sel) {
                if (!sel || !sel.room) return;
                const cur = store.get('devices', d.id);
                store.update('devices', d.id, { room_id: sel.room.id, floor_id: sel.room.floor_id, building_id: sel.room.building_id, rack_id: null });
                store.log({ action: 'updated', table: 'devices', rec: store.get('devices', d.id), summary: d.code + ' moved from ' + (room ? R.roomLabel(room) : 'no room') + ' to ' + R.roomLabel(sel.room),
                  changes: [{ f: 'room', from: room ? R.roomLabel(room) : '', to: R.roomLabel(sel.room) }] });
                P.forDevice(cur.id).forEach(function (p) { if (p.room_id !== sel.room.id) store.update('photos', p.id, { room_id: sel.room.id, floor_id: sel.room.floor_id, building_id: sel.room.building_id }, { silent: true }); });
              });
            } })),
            ui.field('Notes', ui.textarea(d.notes || '', { rows: 2, id: 'as-notes', disabled: store.readOnly, oninput: function (v) { I.update(store.get('devices', d.id), { notes: v }); } }), { key: 'notes' })),
          aiCard(d), historyCard(d));
      },
      footer: function () {
        const d = store.get('devices', id);
        if (!d) return [h('span.grow', { key: 'g' }), ui.btn('Close', { key: 'c', onclick: function () { ui.closeSheet(sheet); } })];
        return [
          store.readOnly ? null : ui.btn(d.archived ? 'Restore' : 'Archive', { kind: 'ghost', key: 'arch', icon: 'archive', onclick: function () { store.update('devices', d.id, { archived: !d.archived }); } }),
          ui.btn('Technical record', { kind: 'ghost', key: 'tech', icon: 'tool', title: 'Network, power and lifecycle details (Legacy Command Center)', onclick: function () { EV.editors.device(d.id); } }),
          h('span.grow', { key: 'g' }),
          ui.btn('Done', { kind: 'primary', key: 'done', onclick: function () { ui.closeSheet(sheet); } })
        ];
      }
    });
    return sheet;
  };
})();
