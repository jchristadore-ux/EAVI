/* pages/command.js — Command Center dashboard. Every figure is computed from stored records. */
(function () {
  'use strict';
  const EV = window.EV, h = EV.h, U = EV.U, store = EV.store, ui = EV.ui, icon = EV.icon, R = EV.rules;

  EV.openEntity = function (type, id) {
    const rec = EV.S.T[type] ? store.get(type, id) : null;
    if (!rec) { EV.toast('That record is no longer available.', 'warn'); return; }
    switch (type) {
      case 'rooms': EV.go('/room/' + id); break;
      case 'floors': EV.go('/floor/' + id); break;
      case 'buildings': EV.go('/environment'); break;
      case 'audits': EV.go('/audit/' + id); break;
      case 'devices': EV.editors.device(id); break;
      case 'backlog_items': EV.go('/backlog/' + id); break;
      case 'findings': EV.editors.finding(id); break;
      case 'it_requests': EV.editors.request(id); break;
      case 'spare_items': EV.editors.spare(id); break;
      case 'infra_assets': EV.editors.infra(id); break;
      case 'photos': EV.photos.openViewer(id); break;
      case 'exports': EV.go('/export'); break;
      default: EV.toast('Nothing to open for this entry.');
    }
  };

  /* ------------------------------------------------------------------ insights */
  const KIND = { systemic: 'Systemic pattern', naming: 'Naming standard', spare: 'Spare coverage', ports: 'IT coordination', firmware: 'Lifecycle', conflict: 'Data conflict', owner: 'Ownership' };
  EV.runInsight = function (i) {
    const a = i.action;
    if (!a) return;
    if (a.type === 'navigate') EV.go(a.path);
    else if (a.type === 'finding') EV.editors.newFinding({}, a.prefill);
    else if (a.type === 'it_request') EV.editors.newRequest({}, a.prefill);
  };
  EV.insightCard = function (i) {
    const tone = i.severity === 'high' ? 'danger' : i.severity === 'medium' ? 'warn' : 'accent';
    return h('div', { 'class': 'insight', key: i.key },
      h('div.insight-head', null, ui.chip(KIND[i.kind] || 'Insight', tone), i.dismissed ? ui.chip('Dismissed', 'muted') : null),
      h('div.insight-title', null, i.title),
      h('div.insight-detail', null, i.detail),
      h('div.btn-row.wrap', null,
        i.tracked ? ui.btn('Tracked as ' + i.tracked.code, { sm: true, kind: 'ghost', icon: 'link', onclick: function () { EV.openEntity(i.tracked.table, i.tracked.id); } })
          : (i.action ? ui.btn(i.action.label, { sm: true, onclick: function () { EV.runInsight(i); } }) : null),
        i.dismissed ? ui.btn('Restore', { sm: true, kind: 'ghost', onclick: function () { R.restoreInsight(i.key); } })
          : (!i.tracked ? ui.btn('Dismiss', { sm: true, kind: 'ghost', onclick: function () { R.dismissInsight(i.key); EV.toast('Dismissed. Restore it from the full insight list.'); } }) : null)));
  };
  EV.openInsights = function () {
    ui.openSheet({
      title: 'Intelligence', sub: 'Patterns and gaps derived from recorded data. Nothing is added to the backlog without your confirmation.', size: 'full',
      render: function () {
        const all = R.insights();
        if (!all.length) return ui.empty({ icon: 'zap', title: 'No patterns or gaps detected', text: 'Insights appear as audits, devices and findings are recorded.' });
        return h('div.stack', null, all.map(EV.insightCard));
      }
    });
  };

  /* ------------------------------------------------------------------ activity */
  const ACT_ICON = { created: 'plus', updated: 'edit', deleted: 'trash', status_changed: 'refresh', photo_added: 'camera', photo_removed: 'trash', testing_updated: 'check-circle',
    network_validation_updated: 'network', exported: 'share', restored: 'upload' };
  /* the feed shows the headline entries; fine-grained "detail" entries (each test result, port, link) are in the exported change history */
  const recentActivity = R.memo(function () { return U.sortBy(store.all('activity_log').filter(function (a) { return !a.detail; }), function (a) { return a.at; }, true).slice(0, 14); });
  EV.activityList = function (entries) {
    if (!entries.length) return ui.empty({ icon: 'activity', title: 'No activity yet', text: 'Audits, photographs, devices, findings and status changes appear here as they happen.' });
    return h('div.list', null, entries.map(function (a) {
      const can = !!(a.entity_type && a.entity_id && EV.S.T[a.entity_type] && store.get(a.entity_type, a.entity_id));
      return ui.row({ key: a.id, left: h('span.act-ic', null, icon(ACT_ICON[a.action] || 'activity', 15)), title: a.summary,
        sub: U.ago(a.at) + ' · ' + (a.actor || 'Auditor') + (R.where(a) ? ' · ' + R.where(a) : ''), cls: 'row-compact', chev: can,
        onclick: can ? function () { EV.openEntity(a.entity_type, a.entity_id); } : null });
    }));
  };
  EV.floorCounts = function (fp) {
    return U.plural(fp.total, 'total space') + ' · ' + fp.audited + ' audited · ' + fp.partial + ' partially audited · ' + fp.notStarted + ' not started';
  };
  EV.floorBar = function (fp) {
    return ui.stackbar([{ n: fp.audited, tone: 'ok', label: 'audited' }, { n: fp.partial, tone: 'warn', label: 'partially audited' }, { n: fp.notStarted, tone: 'muted', label: 'not started' }]);
  };

  /* ------------------------------------------------------------------ page */
  EV.pages.command = function () {
    const m = R.metrics();
    const buildings = U.sortBy(store.all('buildings').filter(function (b) { return !b.archived; }), function (b) { return b.name; });
    const prof = EV.auth.profile();
    const open = U.sortBy(store.all('audits').filter(function (a) { return a.status === 'in_progress'; }), function (a) { return a.started_at; }, true);
    const alerts = R.alerts();
    const insights = R.activeInsights();
    const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

    if (!buildings.length) {
      return [
        ui.head({ eyebrow: today, title: 'Command Center', sub: EV.APP.tagline }),
        ui.empty({ icon: 'building', title: 'No environment yet', text: EV.seed ? 'Add the first building and its floors, or load the synthetic demo environment to explore the workflow.' : 'Add the first building and its floors, or import a room list (Buildings & Floors).',
          action: h('div.btn-row.wrap', null,
            ui.btn('Add a building', { kind: 'primary', icon: 'plus', onclick: function () { EV.go('/environment'); EV.editors.newBuilding(); } }),
            /* never offered while a cloud workspace is connected: demo records are not synchronised and real records must not depend on them */
            EV.seed && !store.kvGet('demo_loaded') && EV.sync.config().mode !== 'supabase' ? ui.btn('Load demo data', { onclick: function () { return EV.seed.load().then(function () { EV.toast('Demo environment loaded', 'ok'); }); } }) : null) })
      ];
    }
    return [
      ui.head({ eyebrow: today + ' · ' + (prof.name || 'Auditor'), title: 'Command Center', sub: buildings.length === 1 ? buildings[0].name : buildings.length + ' buildings',
        actions: ui.btn(open.length ? 'New audit' : 'Start a room audit', { kind: open.length ? 'secondary' : 'primary', icon: 'clipboard', onclick: EV.startAuditFlow }) }),

      open.length ? h('div.stack', null, open.slice(0, 3).map(function (a) {
        const p = R.auditProgress(a.id);
        return h('button.resume', { type: 'button', key: a.id, onclick: function () { EV.go('/audit/' + a.id); } },
          h('span.resume-ic', null, icon('play', 16)),
          h('span.resume-main', null,
            h('span.resume-label', null, 'Resume audit'),
            h('span.resume-title', null, R.auditTitle(a)),
            ui.progress(p.overall),
            h('span.resume-sub', null, p.overall + '% · tests ' + p.tests.done + '/' + p.tests.total + ' · devices ' + p.devices.verified + '/' + p.devices.total + ' verified · started ' + U.ago(a.started_at))),
          icon('chev-right', 18, 'row-chev'));
      })) : null,

      h('section.stack', null,
        ui.label('Environment overview'),
        h('div.tiles.tiles-6', null,
          ui.stat({ key: 'b', label: 'Buildings audited', value: m.buildingsAudited, unit: '/ ' + m.buildings, onclick: function () { EV.go('/environment'); } }),
          ui.stat({ key: 'f', label: 'Floors audited', value: m.floorsAudited, unit: '/ ' + m.floors, onclick: function () { EV.go('/environment'); } }),
          ui.stat({ key: 'cs', label: 'Conference spaces', value: m.conferenceSpaces, sub: m.spaces - m.conferenceSpaces ? (m.spaces - m.conferenceSpaces) + ' support spaces' : 'All spaces', onclick: function () { EV.go('/audits'); } }),
          ui.stat({ key: 'rc', label: 'Rooms completed', value: m.roomsCompleted, unit: '/ ' + m.spaces, tone: m.roomsCompleted ? 'ok' : null, onclick: function () { EV.go('/audits'); } }),
          ui.stat({ key: 'ra', label: 'Rooms awaiting audit', value: m.roomsAwaiting, sub: m.roomsInProgress ? m.roomsInProgress + ' in progress' : 'None in progress', onclick: function () { EV.go('/audits'); } }),
          ui.stat({ key: 'nd', label: 'Network-connected devices', value: m.networkDevices, sub: m.devices + ' devices in total', onclick: function () { EV.go('/devices'); } }),
          ui.stat({ key: 'di', label: 'Incomplete identification', value: m.devicesIncomplete, tone: m.devicesIncomplete ? 'warn' : 'ok', sub: 'Missing IP, MAC or serial', onclick: function () { EV.go('/devices?filter=incomplete'); } }),
          ui.stat({ key: 'of', label: 'Open findings', value: m.openFindings, sub: m.openBacklog + ' in backlog · ' + m.untriaged + ' awaiting triage', onclick: function () { EV.go('/backlog'); } }),
          ui.stat({ key: 'p1', label: 'P1 critical findings', value: m.p1, tone: m.p1 ? 'danger' : 'ok', sub: m.p2 + ' P2 · ' + m.p3 + ' P3 open', onclick: function () { EV.go('/backlog?priority=P1'); } }),
          ui.stat({ key: 'it', label: 'Outstanding IT dependencies', value: m.itOutstanding, tone: m.itOutstanding ? 'warn' : null, sub: m.pdOutstanding + ' with PepperDash', onclick: function () { EV.go('/coordination'); } }),
          ui.stat({ key: 'bc', label: 'Backlog completion', value: m.backlogPct, unit: '%', sub: m.backlogDone + ' of ' + m.backlogTotal + ' items completed', onclick: function () { EV.go('/backlog'); } }),
          ui.stat({ key: 'ph', label: 'Photographs', value: m.photos, sub: 'Linked to rooms and devices', onclick: function () { EV.go('/audits'); } }))),

      h('div.split', null,
        h('div.stack.stack-lg', null,
          h('section.stack', null,
            ui.label('Audit progress'),
            buildings.map(function (b) {
              const floors = R.buildingFloors(b.id);
              return ui.card({ key: b.id, title: b.name, right: ui.demo(b) },
                floors.length ? h('div.floor-list', null, floors.map(function (f) {
                  const fp = R.floorProgress(f.id);
                  return h('button.floor-row', { type: 'button', key: f.id, onclick: function () { EV.go('/floor/' + f.id); } },
                    h('span.floor-top', null, h('span.floor-name', null, 'Floor ' + f.number), f.designation ? h('span.floor-des', null, f.designation) : null, h('span.grow'),
                      ui.chip(f.audit_status_override || fp.label, fp.label === 'Complete' ? 'ok' : fp.label === 'In progress' ? 'warn' : 'muted')),
                    EV.floorBar(fp),
                    h('span.floor-counts', null, EV.floorCounts(fp)));
                })) : h('p.muted', null, 'No floors recorded for this building.'));
            })),
          h('section.stack', null,
            ui.label('Recent activity'),
            EV.activityList(recentActivity()))),
        h('div.stack.stack-lg', null,
          h('section.stack', null,
            ui.label('Priority alerts'),
            alerts.length ? h('div.list', null, alerts.map(function (a, i) {
              return ui.row({ key: 'al' + i, left: h('span', { 'class': 'alert-ic alert-' + a.tone }, icon(a.icon, 17)), title: a.title, sub: a.detail,
                right: h('span', { 'class': 'alert-count alert-' + a.tone }, String(a.count)), onclick: function () { EV.go(a.path); } });
            })) : ui.note('ok', 'No priority alerts from the current records.')),
          h('section.stack', null,
            ui.label('Intelligence', insights.length ? h('button.link', { type: 'button', onclick: EV.openInsights }, 'View all (' + R.insights().length + ')') : null),
            insights.length ? insights.slice(0, 4).map(EV.insightCard) : ui.note('info', 'No patterns or gaps need attention right now.'))))
    ];
  };
})();
