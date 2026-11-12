/* pages/spares.js — spare equipment inventory and risk dashboard. */
(function () {
  'use strict';
  const EV = window.EV, h = EV.h, U = EV.U, S = EV.S, store = EV.store, ui = EV.ui, icon = EV.icon, R = EV.rules, P = EV.photos;
  const st = { q: '', filter: 'all', floor: '' };

  function installed(s) {
    const model = String(s.model || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!model) return [];
    return R.liveDevices().filter(function (d) { return String(d.model || '').toLowerCase().replace(/[^a-z0-9]/g, '') === model; });
  }
  EV.editors.spare = function (id, isNew) {
    return ui.openEditor({
      table: 'spare_items', id: id, isNew: isNew, fields: S.F.spare,
      title: function (s) { return s ? (isNew ? 'New spare equipment' : s.code + ' · ' + (s.name || 'Spare item')) : 'Spare equipment'; },
      before: function (s) {
        const flags = R.spare(s);
        return flags.length && !isNew ? h('div.chips', { key: 'flags' }, flags.map(function (f) { return ui.chip(f.label, f.tone, { key: f.key }); })) : null;
      },
      after: function (s) {
        const devs = installed(s);
        const photos = store.by('photos', 'spare_item_id', s.id);
        const rooms = U.uniq(devs.map(function (d) { const r = store.get('rooms', d.room_id); return r ? (r.number || r.name) : null; }).filter(Boolean));
        return [
          h('div.form-group', { key: 'use' }, h('div.form-group-title', null, 'Installed base for this model'),
            devs.length ? h('span.field-hint', null, U.plural(devs.length, 'installed device') + ' of this model in: ' + rooms.join(', ') + '.') : h('span.field-hint', null, s.model ? 'No installed device in the inventory matches this model.' : 'Record the model to match this spare against installed devices.')),
          h('div.form-group', { key: 'photos' }, h('div.form-group-title', null, 'Photographs'), P.strip(photos),
            h('div.btn-row.wrap', null, P.captureButton({ key: 'sp-cam-' + s.id, sm: true, label: 'Photo', ctx: function () { return { spare_item_id: s.id, building_id: s.building_id, floor_id: s.floor_id, category: 'Equipment labels', description: s.name }; } }))),
          h('div.form-group', { key: 'arch' }, h('div.form-group-title', null, 'Lifecycle'),
            ui.field(s.archived ? 'Archived' : 'Active stock line', ui.toggle(!s.archived, { onchange: function (on) { store.update('spare_items', s.id, { archived: !on }); } }), { div: true, cls: 'field-toggle' }))
        ];
      }
    });
  };
  EV.editors.newSpare = function (prefill) {
    /* a new stock line starts with nothing assumed: quantity, minimum, condition and lifecycle are recorded, not defaulted */
    const s = store.create('spare_items', Object.assign({ name: '', manufacturer: '', model: '', part_number: '', serial_number: '', quantity: null, min_stock: null, storage_location: '', building_id: null,
      floor_id: null, compatibility: '', condition: '', warranty: '', lifecycle: '', eol_date: null, notes: '', archived: false }, prefill || {}));
    return EV.editors.spare(s.id, true);
  };

  EV.pages.spares = function () {
    const ss = R.spareStats();
    const cov = R.spareCoverage();
    const q = st.q.trim().toLowerCase();
    /* archived stock lines are out of the figures, but must stay reachable so they can be reviewed or restored */
    const archived = st.filter === 'archived';
    const list = U.sortBy((archived ? store.all('spare_items').filter(function (s) { return s.archived; }) : R.liveSpares()).filter(function (s) {
      const flags = archived ? [] : R.spare(s).map(function (f) { return f.key; });
      if (st.filter === 'risk' && !flags.length) return false;
      if (['zero', 'low', 'uncounted', 'unidentified', 'eol'].indexOf(st.filter) >= 0 && flags.indexOf(st.filter) < 0) return false;
      if (st.floor && s.floor_id !== st.floor) return false;
      if (!q) return true;
      return [s.code, s.name, s.manufacturer, s.model, s.part_number, s.serial_number, s.storage_location, s.compatibility].some(function (v) { return v && String(v).toLowerCase().indexOf(q) >= 0; });
    }), function (s) { return (R.spare(s).length ? '0' : '1') + (s.name || ''); });
    const floors = [];
    store.all('buildings').forEach(function (b) { R.buildingFloors(b.id).forEach(function (f) { floors.push([f.id, 'Floor ' + f.number]); }); });
    return [
      ui.head({ title: 'Spare Equipment', sub: 'Replacement inventory and operational risk',
        actions: [ui.btn('Add spare', { kind: 'primary', icon: 'plus', key: 'n', onclick: function () { EV.editors.newSpare(); } }),
          ui.btn('CSV', { icon: 'download', key: 'c', title: 'Export the listed items as CSV', onclick: function () { return EV.reports.quickCsv('spare_items', list); } })] }),
      h('section.stack', null,
        ui.label('Risk dashboard'),
        h('div.tiles.tiles-6', null,
          ui.stat({ key: 't', label: 'Stock lines', value: ss.total, sub: ss.units + ' units on hand' + (ss.uncounted ? ' · ' + ss.uncounted + ' not counted' : ''), onclick: function () { st.filter = ss.uncounted ? 'uncounted' : 'all'; } }),
          ui.stat({ key: 'z', label: 'Zero available', value: ss.zero, tone: ss.zero ? 'danger' : 'ok', onclick: function () { st.filter = 'zero'; } }),
          ui.stat({ key: 'l', label: 'Below minimum', value: ss.low, tone: ss.low ? 'warn' : 'ok', onclick: function () { st.filter = 'low'; } }),
          ui.stat({ key: 'u', label: 'Unidentified stock', value: ss.unidentified, tone: ss.unidentified ? 'warn' : null, onclick: function () { st.filter = 'unidentified'; } }),
          ui.stat({ key: 'e', label: 'Approaching end of life', value: ss.eol, tone: ss.eol ? 'warn' : null, onclick: function () { st.filter = 'eol'; } }),
          ui.stat({ key: 'c', label: 'Critical rooms uncovered', value: cov.length, tone: cov.length ? 'danger' : 'ok', sub: 'No in-stock spare for a room-critical device' }))),
      cov.length ? h('section.stack', null,
        ui.label('Critical rooms without spare coverage'),
        h('div.list', null, cov.map(function (g) {
          const ins = R.insights().find(function (i) { return i.key === 'spare:' + g.room.id; });
          return h('div.row', { key: g.room.id },
            h('span.row-left', null, h('span.alert-ic.alert-danger', null, icon('alert', 16))),
            h('span.row-main', null, h('span.row-title', null, R.roomLabel(g.room), ui.demo(g.room)),
              h('span.row-sub', null, 'No in-stock spare for: ' + g.devices.map(function (d) { return R.deviceType(d) + ' (' + ([d.manufacturer, d.model].filter(Boolean).join(' ') || 'model not recorded') + ')'; }).join('; '))),
            ins && ins.tracked ? ui.btn(ins.tracked.code, { sm: true, kind: 'ghost', icon: 'link', onclick: function () { EV.openEntity(ins.tracked.table, ins.tracked.id); } })
              : ins ? ui.btn('Record risk', { sm: true, onclick: function () { EV.runInsight(ins); } }) : null);
        }))) : null,
      h('div.toolbar', null,
        ui.search(st.q, function (v) { st.q = v; }, 'Name, model, part number, location'),
        ui.select(st.filter, [['all', 'All stock'], ['risk', 'Any risk flag'], ['zero', 'Zero available'], ['low', 'Below minimum'], ['uncounted', 'Quantity not recorded'], ['unidentified', 'Unidentified'], ['eol', 'Approaching end of life'],
          ['archived', 'Archived (' + store.all('spare_items').filter(function (s) { return s.archived; }).length + ')']], { empty: false, aria: 'Filter', onchange: function (v) { st.filter = v; } }),
        ui.select(st.floor, floors, { placeholder: 'All floors', aria: 'Floor', onchange: function (v) { st.floor = v; } })),
      list.length ? h('div.list', null, list.map(function (s) {
        const flags = R.spare(s);
        const f = store.get('floors', s.floor_id);
        const counted = !U.blank(s.quantity), qty = Number(s.quantity) || 0;
        return h('div.row.spare', { key: s.id },
          h('button.spare-main', { type: 'button', onclick: function () { EV.editors.spare(s.id); } },
            h('span.row-title', null, s.name || 'Unnamed item', ui.demo(s), s.archived ? ui.chip('Archived', 'muted') : null),
            h('span.row-sub', null, [s.code, [s.manufacturer, s.model].filter(Boolean).join(' ') || 'Model not identified', s.part_number, s.storage_location, f ? 'Floor ' + f.number : ''].filter(Boolean).join(' · ')),
            flags.length ? h('span.chips', null, flags.map(function (x) { return ui.chip(x.label, x.tone, { key: x.key }); })) : null),
          h('div.stepper', { role: 'group', 'aria-label': 'Quantity on hand for ' + (s.name || 'item') },
            ui.iconBtn('minus', { size: 16, title: 'Remove one', disabled: qty <= 0, onclick: function () { store.update('spare_items', s.id, { quantity: Math.max(0, qty - 1) }); } }),
            h('span.stepper-val', null, h('span.stepper-n', { title: counted ? null : 'Quantity not recorded' }, counted ? String(qty) : '—'), h('span.stepper-min', null, 'min ' + (U.blank(s.min_stock) ? '—' : Number(s.min_stock) || 0))),
            ui.iconBtn('plus', { size: 16, title: 'Add one', onclick: function () { store.update('spare_items', s.id, { quantity: qty + 1 }); } })));
      })) : ui.empty({ icon: 'package', title: R.liveSpares().length ? 'No stock lines match these filters' : 'No spare equipment recorded', text: 'Record replacement units with their minimum stock level and storage location.' })
    ];
  };
})();
