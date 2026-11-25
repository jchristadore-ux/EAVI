/* pages/floorreport.js — Floor Reports: choose a floor, preview its audit report, and save it as a PDF or as a
 * self-contained web report. Read-only: nothing on these pages changes a record. */
(function () {
  'use strict';
  const EV = window.EV, h = EV.h, U = EV.U, store = EV.store, ui = EV.ui, icon = EV.icon, R = EV.rules, I = EV.inv, FR = EV.floorReport;
  const st = { busy: '', progress: '', quality: 'standard', result: null };
  const cache = { key: '', model: null, err: null };

  function floorCounts(f) {
    const rooms = R.floorRooms(f.id);
    const devices = U.sum(rooms, function (r) { return I.roomAssets(r.id).length; });
    const punch = U.sum(rooms, function (r) { return EV.punch.forRoom(r.id).length; });
    return { rooms: rooms.length, devices: devices, punch: punch };
  }
  EV.floorReportLink = function (floorId) { return location.href.split('#')[0] + '#/floor-report/' + floorId; };

  /* ------------------------------------------------------------------ choose a floor */
  EV.pages.floorReports = function () {
    const buildings = U.sortBy(store.all('buildings').filter(function (b) { return !b.archived; }), function (b) { return b.name; });
    return [
      ui.head({ title: 'Floor Reports', sub: 'A shareable audit report for one floor, built from the recorded rooms, devices, photographs and punch list', chips: ui.chip(FR.POC, 'accent') }),
      ui.note('info', 'Choose a floor to preview its report. From the preview, save it as a PDF or as a web report: a single file that opens in any browser without signing in to EAVI. Both contain the floor\'s device addresses and identifiers — share them only with people who need them.', { key: 'n' }),
      buildings.length ? buildings.map(function (b) {
        const floors = R.buildingFloors(b.id);
        return ui.card({ key: b.id, title: b.name || 'Unnamed building' },
          floors.length ? h('div.list', null, floors.map(function (f) {
            const c = floorCounts(f);
            return ui.row({ key: f.id, left: icon('file', 17), title: 'Floor ' + f.number, sub: [f.designation, U.plural(c.rooms, 'room'), U.plural(c.devices, 'device'), U.plural(c.punch, 'punch item')].filter(Boolean).join(' · '),
              onclick: function () { EV.go('/floor-report/' + f.id); } });
          })) : h('p.muted', null, 'No floors recorded for this building.'));
      }) : ui.empty({ icon: 'building', title: 'No buildings yet', text: 'Import the room list under Room Inventory first.' })
    ];
  };

  /* ------------------------------------------------------------------ one floor: preview and export */
  async function run(m, format) {
    if (st.busy) return;
    st.busy = format; st.progress = 'Preparing photographs…'; st.result = null; EV.redraw();
    let last = 0;
    try {
      const res = await FR.download(m, format, { quality: st.quality, onProgress: function (done, total) {
        st.progress = 'Preparing photographs ' + done + ' of ' + total;
        const now = Date.now(); if (now - last > 250 || done === total) { last = now; EV.redraw(); }
      } });
      st.result = res;
      if (res.ok) EV.toast((format === 'html' ? 'Web report' : 'PDF') + ' ready: ' + res.filename + ' (' + U.bytes(res.size) + ')', 'ok', 4200);
      else EV.toast(res.message || 'The file could not be saved here.', 'warn', 5000);
    } catch (e) { EV.reportError(e, 'Report not generated'); }
    st.busy = ''; st.progress = ''; EV.redraw();
  }
  function copyLink(id) {
    const url = EV.floorReportLink(id);
    const done = function () { EV.toast('Link copied. It opens this report for people signed in to this EAVI workspace.', 'ok', 4200); };
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(url).then(done, function () { ui.alert({ title: 'Link to this report', message: url }); });
    return ui.alert({ title: 'Link to this report', message: url });
  }
  EV.pages.floorReport = function (r) {
    const f = store.get('floors', r.id);
    if (!f) return [ui.head({ title: 'Floor not found', back: '/floor-report' }), ui.empty({ icon: 'layers', title: 'This floor no longer exists.' })];
    const key = f.id + '|' + store.version;
    if (cache.key !== key) {
      cache.key = key; cache.err = null; cache.model = null;
      try { cache.model = FR.build(f.id); } catch (e) { cache.err = e.message || String(e); }
    }
    const m = cache.model;
    const busy = !!st.busy;
    const actions = m ? [
      ui.btn(st.busy === 'pdf' ? 'Generating…' : 'Download PDF', { key: 'pdf', kind: 'primary', icon: 'download', id: 'fr-pdf', disabled: busy, onclick: function () { return run(m, 'pdf'); } }),
      ui.btn(st.busy === 'html' ? 'Generating…' : 'Download web report', { key: 'html', icon: 'download', id: 'fr-html', disabled: busy, onclick: function () { return run(m, 'html'); } }),
      ui.btn('Copy link', { key: 'link', kind: 'ghost', icon: 'share', id: 'fr-link', onclick: function () { return copyLink(f.id); } })
    ] : null;
    return [
      ui.head({ back: '/floor-report', eyebrow: m ? m.building : '', title: m ? m.title : 'Floor report', chips: ui.chip(FR.POC, 'accent'), sub: m ? U.plural(m.totals.rooms, 'room') + ' · ' + U.plural(m.totals.devices, 'device') + ' · ' + U.plural(m.totals.photos.total, 'photograph') + ' · ' + U.plural(m.totals.punch.total, 'punch item') : '', actions: actions }),
      m ? ui.card({ key: 'share', cls: 'fr-share' },
        h('div.fr-share-row', null,
          ui.field('Photograph quality in the exported files', ui.seg(st.quality, Object.keys(FR.QUALITY).map(function (k) { return [k, FR.QUALITY[k].label]; }), { wrap: true, onchange: function (v) { st.quality = v; } }), { div: true }),
          busy ? h('div.fr-progress', { role: 'status' }, icon('refresh', 15), h('span', null, st.progress)) : null),
        h('p.muted.fr-share-note', null, 'The PDF and the web report are complete, self-contained files: everything below, with every photograph, readable without EAVI. ',
          'The link opens this read-only page for people signed in to this EAVI workspace; it shows the records as they are when it is opened.'),
        st.result && st.result.ok && st.result.missing && st.result.missing.length ? ui.note('warn', U.plural(st.result.missing.length, 'photograph') + ' could not be loaded and ' + (st.result.missing.length === 1 ? 'is' : 'are') + ' named in the report as “Image file not available”: ' +
          st.result.missing.map(function (x) { return x.code; }).join(', ') + '. Check the connection to the workspace and generate it again.', { key: 'miss' }) : null) : null,
      cache.err ? ui.note('warn', cache.err) : FR.view(m)
    ];
  };
})();
