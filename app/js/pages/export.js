/* pages/export.js — Daily Export & Data Handoff: scope, live summary, pre-export validation, package generation,
 * end-of-day summary, Claude handoff documents and export history. */
(function () {
  'use strict';
  const EV = window.EV, h = EV.h, U = EV.U, S = EV.S, store = EV.store, ui = EV.ui, icon = EV.icon, R = EV.rules, X = EV.exporter;
  const st = { mode: 'today', from: U.localDate(), to: U.localDate(), building: '', floor: '', rooms: [], photoMode: 'original', busy: null, result: null, error: null, openCheck: {}, wb: false };
  const memo = { key: '', col: null, sum: null, val: null, err: null };

  function opts() { return { mode: st.mode, from: st.from, to: st.to, building_id: st.building || null, floor_id: st.floor || null, room_ids: st.rooms, photoMode: st.photoMode }; }
  function preview() {
    const key = JSON.stringify(opts()) + '|' + store.version + '|' + U.localDate();
    if (memo.key === key) return memo;
    memo.key = key; memo.err = null; memo.col = memo.sum = memo.val = null;
    try {
      const col = X.collect(X.resolveScope(opts()));
      memo.col = col; memo.sum = X.summarize(col); memo.val = X.validate(col, null, null);
    } catch (e) { memo.err = e.message || String(e); }
    return memo;
  }
  function checkList(val, keyPrefix) {
    return h('div.list', null, val.checks.map(function (c, i) {
      const k = keyPrefix + i;
      const open = !!st.openCheck[k];
      const tone = c.status === 'pass' ? 'ok' : c.status === 'fail' ? 'danger' : 'warn';
      return h('div.check', { key: k },
        h('button.check-head', { type: 'button', disabled: !c.count, 'aria-expanded': open ? 'true' : 'false', onclick: function () { st.openCheck[k] = !open; } },
          h('span', { 'class': 'check-ic check-' + tone }, icon(c.status === 'pass' ? 'check' : c.status === 'fail' ? 'x' : 'alert-circle', 14)),
          h('span.check-main', null, h('span.check-name', null, c.name), h('span.check-detail', null, c.detail)),
          c.count ? h('span', { 'class': 'alert-count alert-' + (tone === 'ok' ? 'info' : tone) }, String(c.count)) : null,
          c.count ? icon(open ? 'chev-up' : 'chev-down', 15, 'sect-chev') : null),
        open ? h('ul.plain.check-items', null, c.items.slice(0, 60).map(function (it, j) { return h('li', { key: 'i' + j }, String(it)); }),
          c.count > 60 ? h('li', { key: 'more' }, '… and ' + (c.count - 60) + ' more (the complete list is in validation_report.json inside the package)') : null) : null);
    }));
  }
  async function generate(reexportOf) {
    if (st.busy) return;
    st.busy = { label: 'Preparing', done: 0, total: 1 }; st.error = null; st.result = null; EV.redraw();
    try {
      const pkg = await X.build(reexportOf ? { reexportOf: reexportOf, photoMode: st.photoMode } : opts(), function (p) { st.busy = p; EV.redraw(); });
      st.result = pkg;
      pkg.shareable = EV.canShareBlob(pkg.blob, pkg.filename, 'application/zip');
      const res = await X.deliver(pkg, false);
      pkg.saved = res.ok; pkg.saveMessage = res.ok ? '' : (res.message || 'The package could not be saved automatically.');
      if (res.ok) EV.toast('Audit package ' + pkg.code + ' exported', 'ok', 3600);
    } catch (e) { st.error = e.message || String(e); console.error(e); }
    st.busy = null; EV.redraw();
    EV.afterRender(function () { const el = document.getElementById('export-result'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start' }); });
  }
  function text(name, content) {
    return EV.saveFile(new Blob([content], { type: 'text/markdown' }), name, 'text/markdown').then(function (res) { EV.toast(res.ok ? name + ' ready' : (res.message || 'The file could not be saved here.'), res.ok ? 'ok' : 'warn'); });
  }

  EV.pages.exportCenter = function () {
    const bs = U.sortBy(store.all('buildings').filter(function (b) { return !b.archived; }), function (b) { return b.name; });
    const floors = [];
    bs.forEach(function (b) { if (!st.building || st.building === b.id) R.buildingFloors(b.id).forEach(function (f) { floors.push([f.id, (bs.length > 1 && !st.building ? b.name + ' · ' : '') + 'Floor ' + f.number]); }); });
    const last = X.lastExport();
    const pv = preview();
    const sum = pv.sum;
    const est = pv.col ? X.estimatePhotos(pv.col) : { count: 0, bytes: 0 };
    const history = X.history();
    const pkg = st.result;
    const heavy = st.photoMode === 'original' && est.bytes > 350 * 1024 * 1024;
    return [
      ui.head({ title: 'Daily Export & Data Handoff', sub: 'Package the collected audit records for analysis and the cumulative master workbook' }),

      ui.card({ key: 'scope', title: 'What to export' },
        ui.seg(st.mode, [['today', 'Current day'], ['since', 'Since last export'], ['range', 'Date range'], ['full', 'Full export']], { wrap: true, onchange: function (v) { st.mode = v; } }),
        st.mode === 'since' ? h('p.muted', null, last ? 'Every record that has not yet been delivered in its current form — whatever day it was changed. Last delivered package: ' + last.code + ' (' + U.fmtDateTime(last.created_at) + ').'
          : 'No package has been delivered from this device yet — this will include every record.') : null,
        st.mode === 'today' ? h('p.muted', null, 'Today’s audits with everything that belongs to them, and every record created or changed today. For a hand-off that must not miss earlier changes, use “Since last export”.') : null,
        st.mode === 'full' ? h('p.muted', null, 'Every record. Each row still states whether it is new, updated or unchanged compared with what was already delivered.') : null,
        h('div.form-grid', null,
          st.mode === 'range' ? ui.field('From', ui.input(st.from, { type: 'date', id: 'ex-from', oninput: function (v) { st.from = v; }, onchange: function (v) { st.from = v; } }), { half: true }) : null,
          st.mode === 'range' ? ui.field('To', ui.input(st.to, { type: 'date', id: 'ex-to', oninput: function (v) { st.to = v; }, onchange: function (v) { st.to = v; } }), { half: true }) : null,
          ui.field('Building', ui.select(st.building, bs.map(function (b) { return [b.id, b.name]; }), { placeholder: 'All buildings', id: 'ex-building', onchange: function (v) { st.building = v; st.floor = ''; st.rooms = []; } }), { half: true }),
          ui.field('Floor', ui.select(st.floor, floors, { placeholder: 'All floors', id: 'ex-floor', onchange: function (v) { st.floor = v; st.rooms = []; } }), { half: true }),
          ui.field('Rooms', ui.btn(st.rooms.length ? U.plural(st.rooms.length, 'room') + ' selected' : 'All rooms in scope', { block: true, icon: 'grid', onclick: function () {
            const pick = new Set(st.rooms);
            const list = U.sortBy(R.liveRooms().filter(function (r) { return (!st.building || r.building_id === st.building) && (!st.floor || r.floor_id === st.floor); }), function (r) { return r.number || r.name; });
            const sheet = ui.openSheet({ title: 'Specific rooms', sub: 'Leave everything off to include all rooms in scope', size: 'full',
              render: function () { return h('div.list', null, list.map(function (r) {
                return h('div.row', { key: r.id }, h('span.row-main', null, h('span.row-title', null, R.roomLabel(r)), h('span.row-sub', null, 'Floor ' + (store.get('floors', r.floor_id) || {}).number)),
                  ui.toggle(pick.has(r.id), { onchange: function (on) { if (on) pick.add(r.id); else pick['delete'](r.id); } }));
              })); },
              footer: function () { return [ui.btn('Clear', { kind: 'ghost', key: 'c', onclick: function () { pick.clear(); } }), h('span.grow', { key: 'g' }), ui.btn('Apply', { kind: 'primary', key: 'a', onclick: function () { st.rooms = Array.from(pick); ui.closeSheet(sheet); } })]; } });
          } }), { half: true, div: true }),
          ui.field('Photographs', ui.select(st.photoMode, [['original', 'Original quality'], ['optimized', 'Optimized (max 2048 px)'], ['none', 'Index only — no image files']], { empty: false, id: 'ex-photos', onchange: function (v) { st.photoMode = v; } }),
            { half: true, hint: est.count ? est.count + ' photographs · about ' + U.bytes(est.bytes) + ' at original quality' : 'No photographs in this scope' })),
        heavy ? ui.note('warn', 'This package would hold about ' + U.bytes(est.bytes) + ' of photographs, which can exceed what a phone browser can assemble in memory. Choose “Optimized”, narrow the scope, or export from a desktop browser.') : null),

      pv.err ? ui.note('warn', pv.err) : h('section.stack', null,
        ui.label('Export summary', h('span.count', null, sum.record_total + ' records')),
        h('div.tiles.tiles-6', null,
          ui.stat({ key: 'd', label: 'Audit date', value: sum.audit_dates.length === 1 ? U.fmtDate(sum.audit_dates[0]) : sum.audit_dates.length ? sum.audit_dates.length + ' days' : '—', sub: sum.audit_dates.length > 1 ? U.fmtDate(sum.audit_dates[0]) + ' – ' + U.fmtDate(sum.audit_dates[sum.audit_dates.length - 1]) : '' }),
          ui.stat({ key: 'b', label: 'Buildings visited', value: sum.buildings_visited }),
          ui.stat({ key: 'f', label: 'Floors visited', value: sum.floors_visited }),
          ui.stat({ key: 'r', label: 'Rooms audited', value: sum.rooms_audited, sub: sum.audits_in_progress ? sum.audits_in_progress + ' still in progress' : '' }),
          ui.stat({ key: 'dv', label: 'Devices documented', value: sum.devices_documented, sub: sum.devices_new + ' new' }),
          ui.stat({ key: 'p', label: 'Photographs captured', value: sum.photographs }),
          ui.stat({ key: 't', label: 'Functional tests completed', value: sum.tests_completed, sub: sum.tests_failed + ' failed · ' + sum.tests_to_investigate + ' to investigate' }),
          ui.stat({ key: 'fn', label: 'Findings created', value: sum.findings_created }),
          ui.stat({ key: 'bl', label: 'New backlog items', value: sum.backlog_new, sub: 'P1 ' + sum.backlog_new_p1 + ' · P2 ' + sum.backlog_new_p2 + ' · P3 ' + sum.backlog_new_p3 }),
          ui.stat({ key: 'oi', label: 'Outstanding identification fields', value: sum.outstanding_identification_fields, tone: sum.outstanding_identification_fields ? 'warn' : 'ok' }),
          ui.stat({ key: 'is', label: 'Incomplete audit sections', value: sum.incomplete_audit_sections, tone: sum.incomplete_audit_sections ? 'warn' : 'ok' }),
          ui.stat({ key: 'it', label: 'Pending IT dependencies', value: sum.pending_it_dependencies, tone: sum.pending_it_dependencies ? 'warn' : null }))),

      pv.val ? h('section.stack', null,
        ui.label('Export validation', ui.chip(pv.val.result === 'passed' ? 'Passed' : pv.val.result === 'failed' ? 'Structural errors' : 'Passed with warnings', pv.val.result === 'passed' ? 'ok' : pv.val.result === 'failed' ? 'danger' : 'warn')),
        h('p.muted', null, 'Incomplete records do not block the export. They are listed here and inside the package so nothing is silently assumed.'),
        checkList(pv.val, 'pre')) : null,

      h('div.export-action', null,
        ui.btn(st.busy ? st.busy.label + (st.busy.total > 1 ? ' ' + st.busy.done + ' / ' + st.busy.total : '…') : 'EXPORT DAILY AUDIT PACKAGE', { kind: 'primary', lg: true, block: true, icon: 'share', id: 'export-go', disabled: !!st.busy || !!pv.err || (pv.val && pv.val.result === 'failed'),
          onclick: function () { return generate(null); } }),
        st.busy ? ui.progress(U.pct(st.busy.done, st.busy.total || 1)) : null,
        pv.val && pv.val.result === 'failed' ? ui.note('danger', 'The package has structural errors and cannot be merged reliably. Resolve them, or contact support with the list above.') : null,
        st.error ? ui.note('danger', st.error, { title: 'The export could not be generated' }) : null),

      pkg ? h('section.stack.stack-lg', { id: 'export-result' },
        ui.card({ key: 'pkg', title: 'Package ready' },
          h('div.kv-list', null, ui.kv('Export ID', pkg.code, { mono: true }), ui.kv('File', pkg.filename, { mono: true }), ui.kv('Size', U.bytes(pkg.blob.size)),
            ui.kv('Contents', pkg.manifest.files.length + ' data and document files · ' + pkg.manifest.photographs.files_written + ' photographs'), ui.kv('Validation', pkg.validation.result.replace(/_/g, ' '))),
          pkg.saved ? ui.note('ok', 'Delivered. The rows in this package now count as exported, so “Since last export” will not send them again unless they change.', {
            action: X.canVoid(pkg.id) ? h('div.btn-row', null, ui.btn('The file did not arrive — void', { sm: true, kind: 'ghost', onclick: function () {
              return ui.confirm({ title: 'Void export ' + pkg.code + '?', message: 'Use this if the download was cancelled or blocked, or the file was lost before it was merged. Its records will be included in the next “Since last export”.', confirm: 'Void export' })
                .then(function (ok) { if (ok) { X.voidExport(pkg.id); pkg.saved = false; pkg.saveMessage = 'Voided.'; EV.toast('Export voided — its records will be sent again'); } });
            } })) : null })
            : ui.note('warn', (pkg.saveMessage || 'Not saved yet.') + ' Use the buttons below — the export only counts as delivered once it has been saved.'),
          h('div.btn-row.wrap', null,
            ui.btn(pkg.saved ? 'Save again' : 'Save package', { kind: pkg.saved ? 'secondary' : 'primary', icon: 'download', onclick: function () { return X.deliver(pkg, false).then(function (res) { pkg.saved = pkg.saved || res.ok; if (!res.ok) EV.toast(res.message || 'Could not save here.', 'warn'); }); } }),
            pkg.shareable ? ui.btn('Share / Save to Files', { icon: 'send', onclick: function () {
              return X.deliver(pkg, true).then(function (res) { pkg.saved = pkg.saved || res.ok; if (!res.ok && res.code !== 'AbortError') EV.toast('Sharing is not available for this file here. Use “Save package”.', 'warn', 5000); });
            } }) : null)),
        h('section.stack', null,
          ui.label('End-of-day summary'),
          h('div.tiles', null,
            ui.stat({ key: 'r', label: 'Rooms audited', value: pkg.eod.rooms_audited }), ui.stat({ key: 'd', label: 'New devices documented', value: pkg.eod.new_devices }),
            ui.stat({ key: 'f', label: 'Devices requiring follow-up', value: pkg.eod.devices_requiring_followup, tone: pkg.eod.devices_requiring_followup ? 'warn' : 'ok' }), ui.stat({ key: 'n', label: 'New findings', value: pkg.eod.new_findings }),
            ui.stat({ key: 'p', label: 'New P1 / P2 / P3', value: pkg.eod.new_p1 + ' / ' + pkg.eod.new_p2 + ' / ' + pkg.eod.new_p3, tone: pkg.eod.new_p1 ? 'danger' : null }),
            ui.stat({ key: 'i', label: 'Outstanding IT requests', value: pkg.eod.outstanding_it_requests, tone: pkg.eod.outstanding_it_requests ? 'warn' : null }),
            ui.stat({ key: 'pd', label: 'PepperDash dependencies', value: pkg.eod.outstanding_pepperdash_dependencies }), ui.stat({ key: 'q', label: 'Data quality exceptions', value: pkg.eod.data_quality_exceptions, tone: pkg.eod.data_quality_exceptions ? 'warn' : 'ok' })),
          ui.card({ key: 'next', title: 'Recommended priorities for the next onsite visit' }, h('ol.plain.numbered', null, pkg.eod.next_visit_priorities.map(function (s, i) { return h('li', { key: 'n' + i }, s); })),
            h('p.muted', null, 'Derived by rule from the recorded data — prompts for the auditor, not conclusions.'))),
        h('section.stack', null, ui.label('Validation report for this package'), checkList(pkg.validation, 'post'))) : null,

      ui.card({ key: 'handoff', title: 'Claude handoff' },
        h('ol.plain.numbered', null, ['Finish the day\'s room audits.', 'Open Daily Export & Data Handoff and review the export summary.', 'Tap EXPORT DAILY AUDIT PACKAGE and save the ZIP.',
          'In the designated Claude Project, upload the ZIP and the current master workbook.', 'Claude follows claude_analysis_instructions.md inside the package and returns the updated workbook and an executive summary.']
          .map(function (s, i) { return h('li', { key: 's' + i }, s); })),
        h('div.btn-row.wrap', null,
          ui.btn('Claude Project instructions (.md)', { icon: 'download', onclick: function () { return text('AV_Audit_Claude_Project_Instructions.md', EV.handoff.projectInstructions()); } }),
          ui.btn(st.wb ? 'Building…' : 'Master workbook (.xlsx)', { icon: 'download', disabled: st.wb, onclick: function () {
            st.wb = true; EV.redraw();
            return EV.handoff.masterWorkbook().then(function (blob) { return EV.saveFile(blob, EV.handoff.WORKBOOK_NAME, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); })
              .then(function (res) { st.wb = false; EV.toast(res.ok ? 'Master workbook ready' : (res.message || 'The file could not be saved here.'), res.ok ? 'ok' : 'warn'); }, function (e) { st.wb = false; EV.reportError(e, 'Workbook not generated'); });
          } })),
        ui.note('info', 'Upload audit data to Claude only once the client has authorised that use. The application itself sends nothing to any AI service.')),

      h('section.stack', null,
        ui.label('Export history', h('span.count', null, String(history.length))),
        history.length ? h('div.list', null, history.slice(0, 30).map(function (e) {
          const c = e.counts || {};
          return h('div.row', { key: e.id },
            h('span.row-main', null,
              h('span.row-title', null, h('span.mono', null, e.code), ui.chip(e.status === 'success' ? 'Delivered' : e.status === 'void' ? 'Void' : 'Not saved', e.status === 'success' ? 'ok' : e.status === 'void' ? 'muted' : 'warn')),
              h('span.row-sub', null, U.fmtDateTime(e.created_at) + ' · ' + ({ today: 'current day', since: 'since last export', range: 'date range', full: 'full export' }[e.mode] || e.mode) + ' · ' + (c.record_total || 0) + ' records · ' + (c.photographs || 0) + ' photographs' + (c.bytes ? ' · ' + U.bytes(c.bytes) : '')),
              e.window_start ? h('span.row-sub', null, U.fmtDateTime(e.window_start) + ' → ' + U.fmtDateTime(e.window_end)) : null),
            h('span.row-right', null,
              ui.btn('Repeat', { sm: true, kind: 'ghost', icon: 'refresh', disabled: !!st.busy, title: 'Re-export the same scope with the current state of the records', onclick: function () { return generate(e.id); } }),
              /* only the most recent delivery can be undone exactly; an older package is sent again with Repeat */
              e.status === 'success' && X.canVoid(e.id) ? ui.btn('Void', { sm: true, kind: 'ghost', title: 'Mark as not delivered so its records are included in the next “since last export”', onclick: function () {
                ui.confirm({ title: 'Void export ' + e.code + '?', message: 'Use this when the package was lost before it was merged. The next “Since last export” will include its records again.', confirm: 'Void export' })
                  .then(function (ok) { if (ok) { X.voidExport(e.id); if (st.result && st.result.id === e.id) { st.result.saved = false; st.result.saveMessage = 'Voided.'; } } });
              } }) : null));
        })) : h('p.muted', null, 'No exports yet. The first export treats every record as new.'))
    ];
  };
})();
