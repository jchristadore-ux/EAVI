/* pages/reports.js — report catalogue and on-screen preview with PDF / CSV / Excel export. */
(function () {
  'use strict';
  const EV = window.EV, h = EV.h, U = EV.U, S = EV.S, store = EV.store, ui = EV.ui, icon = EV.icon, R = EV.rules, Rep = EV.reports;
  const st = { building: '', floor: '', audit: '', busy: '' };
  const cache = { key: '', doc: null, err: null };

  function buildings() { return U.sortBy(store.all('buildings').filter(function (b) { return !b.archived; }), function (b) { return b.name; }); }
  function scopeFor(type) {
    const bs = buildings();
    const b = st.building || (bs.length === 1 ? bs[0].id : '');
    const def = Rep.TYPES.find(function (t) { return t.id === type; });
    if (def.scope === 'audit') return { audit: st.audit };
    if (def.scope === 'none') return {};
    if (def.scope === 'floor') return { building: b, floor: st.floor };
    return { building: b };
  }
  function ready(def) {
    const sc = scopeFor(def.id);
    if (!def.required) return '';
    if (def.scope === 'audit' && !sc.audit) return 'Select an audit above.';
    if (def.scope === 'floor' && !sc.floor) return 'Select a floor above.';
    if (def.scope === 'building' && !sc.building) return 'Select a building above.';
    return '';
  }
  function query(sc) {
    return Object.keys(sc).filter(function (k) { return sc[k]; }).map(function (k) { return k + '=' + encodeURIComponent(sc[k]); }).join('&');
  }
  async function run(type, sc, format) {
    st.busy = type + ':' + format; EV.redraw();
    try { await Rep.download(Rep.build(type, sc), format); }
    catch (e) { EV.reportError(e, 'Report not generated'); }
    st.busy = ''; EV.redraw();
  }
  function formatButtons(type, sc, disabled) {
    return ['pdf', 'csv', 'xlsx'].map(function (f) {
      const busy = st.busy === type + ':' + f;
      return ui.btn(busy ? 'Working…' : (f === 'xlsx' ? 'Excel' : f.toUpperCase()), { sm: true, key: f, icon: 'download', disabled: disabled || !!st.busy, onclick: function () { return run(type, sc, f); } });
    });
  }

  EV.pages.reports = function () {
    const bs = buildings();
    const floors = [];
    bs.forEach(function (b) { if (!st.building || st.building === b.id) R.buildingFloors(b.id).forEach(function (f) { floors.push([f.id, (bs.length > 1 && !st.building ? b.name + ' · ' : '') + 'Floor ' + f.number]); }); });
    const audits = U.sortBy(store.all('audits').filter(function (a) { return (!st.building || a.building_id === st.building) && (!st.floor || a.floor_id === st.floor); }), function (a) { return a.started_at; }, true)
      .map(function (a) { return [a.id, R.auditTitle(a) + ' · ' + a.code + ' · ' + U.fmtDate(a.audit_date)]; });
    return [
      ui.head({ title: 'Reports', sub: 'Executive-ready summaries and technical registers, generated from the recorded data' }),
      ui.card({ key: 'scope', title: 'Report scope' },
        h('div.form-grid', null,
          ui.field('Building', ui.select(st.building, bs.map(function (b) { return [b.id, b.name]; }), { placeholder: bs.length === 1 ? bs[0].name : 'All buildings', id: 'rep-building', onchange: function (v) { st.building = v; st.floor = ''; st.audit = ''; } }), { half: true }),
          ui.field('Floor', ui.select(st.floor, floors, { placeholder: 'All floors', id: 'rep-floor', onchange: function (v) { st.floor = v; st.audit = ''; } }), { half: true }),
          ui.field('Audit (for the individual room report)', ui.select(st.audit, audits, { placeholder: audits.length ? 'Select an audit' : 'No audits in this scope', id: 'rep-audit', onchange: function (v) { st.audit = v; } })))),
      h('div.report-list', null, Rep.TYPES.map(function (def) {
        const sc = scopeFor(def.id);
        const need = ready(def);
        return h('div.report-card', { key: def.id },
          h('div.report-main', null,
            h('div.report-name', null, icon(def.id === 'executive' ? 'target' : def.scope === 'audit' ? 'clipboard' : 'file', 16), def.name),
            h('div.report-desc', null, def.desc),
            need ? h('div.field-hint.hint-warn', null, need) : null),
          h('div.btn-row.wrap', null,
            ui.btn('Preview', { sm: true, kind: 'primary', icon: 'eye', key: 'p', disabled: !!need, onclick: function () { EV.go('/reports/' + def.id + (query(sc) ? '?' + query(sc) : '')); } }),
            formatButtons(def.id, sc, !!need)));
      })),
      ui.card({ key: 'wb', title: 'Master workbook' },
        h('p.muted', null, 'A fifteen-tab Excel workbook built from every record on this device: formula-driven dashboard, filterable tables, frozen headers, dropdown lists and conditional formatting. Use it as the starting master workbook for the Claude handoff.'),
        h('div.btn-row.wrap', null,
          ui.btn(st.busy === 'wb' ? 'Building…' : 'Generate master workbook (.xlsx)', { icon: 'download', disabled: !!st.busy, onclick: function () {
            st.busy = 'wb'; EV.redraw();
            return EV.handoff.masterWorkbook().then(function (blob) { return EV.saveFile(blob, EV.handoff.WORKBOOK_NAME, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); })
              .then(function (res) { st.busy = ''; EV.toast(res.ok ? 'Master workbook ready' : (res.message || 'The file could not be saved here.'), res.ok ? 'ok' : 'warn'); }, function (e) { st.busy = ''; EV.reportError(e, 'Workbook not generated'); });
          } }),
          ui.btn('Daily Export & Data Handoff', { kind: 'ghost', icon: 'share', onclick: function () { EV.go('/export'); } })))
    ];
  };

  EV.pages.reportView = function (r) {
    const def = Rep.TYPES.find(function (t) { return t.id === r.id; });
    if (!def) return EV.pages.notFound();
    const q = EV.router.query;
    const sc = { building: q.building || '', floor: q.floor || '', audit: q.audit || '' };
    const key = r.id + '|' + JSON.stringify(sc) + '|' + store.version;
    if (cache.key !== key) {
      cache.key = key; cache.err = null; cache.doc = null;
      try { cache.doc = Rep.build(r.id, sc); } catch (e) { cache.err = e.message || String(e); }
    }
    return [
      ui.head({ back: '/reports', eyebrow: 'Report preview', title: def.name, sub: cache.doc ? cache.doc.subtitle : '', actions: cache.doc ? formatButtons(r.id, sc, false) : null }),
      cache.err ? ui.note('warn', cache.err, { action: h('div.btn-row', null, ui.btn('Back to reports', { sm: true, onclick: function () { EV.go('/reports'); } })) }) : Rep.view(cache.doc)
    ];
  };
})();
