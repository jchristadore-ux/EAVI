/* pages/backlog.js — field findings, the prioritized improvement backlog, and the finding → backlog conversion. */
(function () {
  'use strict';
  const EV = window.EV, h = EV.h, U = EV.U, S = EV.S, store = EV.store, ui = EV.ui, icon = EV.icon, R = EV.rules, A = EV.act, P = EV.photos;
  const st = { tab: 'backlog', q: '', priority: '', status: 'open', category: '', floor: '', owner: '', group: 'priority', sort: 'priority', applied: '', fq: '' };
  const P_ORDER = { P1: 0, P2: 1, P3: 2, '': 3 };

  /* ------------------------------------------------------------------ rows */
  EV.backlogRow = function (b) {
    return ui.row({ key: b.id, left: ui.priority(b.priority),
      title: [b.title || 'Untitled item', b.systemic ? ui.chip('Systemic', 'violet') : null, ui.demo(b)],
      sub: [b.code, b.category, R.where(b), b.owner].filter(Boolean).join(' · '),
      right: ui.chip(b.status, ui.tone.backlog(b.status)), onclick: function () { EV.go('/backlog/' + b.id); } });
  };
  EV.findingRow = function (f) {
    const b = f.backlog_item_id ? store.get('backlog_items', f.backlog_item_id) : null;
    return ui.row({ key: f.id, left: icon('flag', 17),
      title: [f.title || 'Untitled finding', ui.demo(f)],
      sub: [f.code, f.category, R.where(f), S.label(S.CLASSIFICATION, f.classification)].filter(Boolean).join(' · '),
      right: b ? ui.chip(b.code, 'accent', { icon: 'link' }) : ui.chip(S.label(S.FINDING_STATUS, f.status), f.status === 'open' ? 'warn' : 'muted'),
      onclick: function () { EV.editors.finding(f.id); } });
  };

  /* ------------------------------------------------------------------ finding → backlog */
  EV.promoteFlow = function (fid) {
    const f = store.get('findings', fid);
    if (!f) return;
    const done = function (b, linked) {
      EV.toast(linked ? 'Linked to existing item ' + b.code + ' — no duplicate created' : 'Backlog item ' + b.code + ' created', 'ok', 3600);
      EV.go('/backlog/' + b.id);
    };
    const sims = R.similarBacklog(f);
    if (!sims.length) { done(A.promoteFinding(fid), false); return; }
    const sheet = ui.openSheet({
      title: 'Add to backlog', sub: 'This finding may already be tracked. Link it rather than creating a duplicate.', size: 'auto',
      render: function () {
        return [
          h('div.list', null, sims.map(function (s) {
            return h('div.row', { key: s.item.id },
              h('span.row-left', null, ui.priority(s.item.priority)),
              h('span.row-main', null, h('span.row-title', null, s.item.title), h('span.row-sub', null, s.item.code + ' · ' + s.item.status + ' · matches: ' + s.why.join(', '))),
              ui.btn('Link', { sm: true, kind: 'primary', onclick: function () { ui.closeSheet(sheet); done(A.promoteFinding(fid, s.item.id), true); } }));
          })),
          ui.btn('None of these — create a new backlog item', { block: true, icon: 'plus', onclick: function () { ui.closeSheet(sheet); done(A.promoteFinding(fid), false); } })
        ];
      }
    });
  };

  /* ------------------------------------------------------------------ finding editor */
  EV.editors.finding = function (id, isNew) {
    return ui.openEditor({
      table: 'findings', id: id, isNew: isNew, fields: S.F.finding,
      title: function (f) { return f ? (isNew ? 'New finding' : 'Finding ' + f.code) : 'Finding'; },
      sub: function (f) { return f ? R.where(f) : ''; },
      before: function (f) {
        const b = f.backlog_item_id ? store.get('backlog_items', f.backlog_item_id) : null;
        const sims = isNew || b ? [] : R.similarFindings(f);
        return h('div.stack', { key: 'state' },
          b ? ui.note('ok', h('span', null, 'In the backlog as ', h('button.link', { type: 'button', onclick: function () { EV.go('/backlog/' + b.id); } }, b.code + ' — ' + b.title), '.'),
            { action: h('div.btn-row', null, ui.btn('Unlink', { sm: true, kind: 'ghost', onclick: function () { A.unlinkFinding(f.id); } })) })
            : f.status === 'dismissed' ? ui.note('info', 'This finding was dismissed.', { action: h('div.btn-row', null, ui.btn('Restore', { sm: true, onclick: function () { store.update('findings', f.id, { status: 'open' }); } })) })
              : isNew ? null : ui.note('info', 'Field finding — not yet in the formal backlog.', { action: h('div.btn-row.wrap', null,
                ui.btn('Add to backlog', { sm: true, kind: 'primary', icon: 'arrow-right', onclick: function () { EV.promoteFlow(f.id); } }),
                ui.btn('Dismiss', { sm: true, kind: 'ghost', onclick: function () { store.update('findings', f.id, { status: 'dismissed' }); } })) }),
          sims.length ? ui.note('warn', 'Similar finding already recorded for this room: ' + sims.map(function (x) { return x.code + ' “' + x.title + '”'; }).join('; ') + '. Avoid documenting the same issue twice.') : null);
      },
      after: function (f) {
        const photos = P.forFinding(f.id).concat(f.test_id ? P.forTest(f.test_id).filter(function (p) { return p.finding_id !== f.id; }) : []);
        const room = store.get('rooms', f.room_id);
        const audit = f.audit_id ? store.get('audits', f.audit_id) : (room ? A.openAudit({ room: room }) : null);
        const test = f.test_id ? store.get('functional_tests', f.test_id) : null;
        const ctx = function () { return { room: room, audit: audit, finding_id: f.id, device_id: f.device_id || null, category: 'Other', description: f.title }; };
        return [
          test ? h('div.form-group', { key: 'test' }, h('div.form-group-title', null, 'Related audit test'),
            h('div.kv-list', null, ui.kv(test.category + ' — ' + test.test_name, S.label(S.TEST_RESULTS, test.result)), audit ? ui.kv('Audit', audit.code + ' · ' + U.fmtDate(audit.audit_date)) : null)) : null,
          h('div.form-group', { key: 'photos' }, h('div.form-group-title', null, 'Supporting photographs'), P.strip(photos),
            h('div.btn-row.wrap', null, P.captureButton({ key: 'fn-cam-' + f.id, sm: true, label: 'Photo', ctx: ctx }), P.captureButton({ key: 'fn-lib-' + f.id, sm: true, kind: 'secondary', label: 'Upload', library: true, ctx: ctx })))
        ];
      },
      onDone: function (f) { if (isNew) EV.toast('Finding ' + f.code + ' recorded. Add it to the backlog when confirmed.', 'ok', 3800); }
    });
  };
  EV.editors.newFinding = function (ctx, prefill) {
    ctx = ctx || {};
    const room = ctx.room || null;
    const f = A.createFinding(Object.assign({
      building_id: room ? room.building_id : null, floor_id: room ? room.floor_id : null, room_id: room ? room.id : null, audit_id: ctx.audit ? ctx.audit.id : null
    }, prefill || {}));
    return EV.editors.finding(f.id, true);
  };

  /* ------------------------------------------------------------------ backlog list page */
  function isOpen(b) { return S.BACKLOG_CLOSED.indexOf(b.status) < 0; }
  function sortList(list) {
    const by = st.sort;
    if (by === 'updated') return U.sortBy(list, function (b) { return b.updated_at; }, true);
    if (by === 'created') return U.sortBy(list, function (b) { return b.created_at; }, true);
    if (by === 'target') return U.sortBy(list, function (b) { return b.target_date || '9999'; });
    if (by === 'code') return U.sortBy(list, function (b) { return b.code; });
    return list.slice().sort(function (a, b) { return (P_ORDER[a.priority || ''] - P_ORDER[b.priority || '']) || (a.updated_at < b.updated_at ? 1 : -1); });
  }
  function groupKey(b) {
    switch (st.group) {
      case 'status': return b.status || 'No status';
      case 'priority': return b.priority ? S.label(S.PRIORITIES, b.priority) : 'Unprioritized';
      case 'category': return b.category || 'Uncategorized';
      case 'floor': { const f = store.get('floors', b.floor_id); return f ? 'Floor ' + f.number : 'No floor'; }
      case 'room': { const r = store.get('rooms', b.room_id); return r ? R.roomLabel(r) : 'No room'; }
      case 'owner': return b.owner || 'Unassigned';
      default: return '';
    }
  }
  function groupOrder(keys) {
    if (st.group === 'status') return S.BACKLOG_STATUSES.filter(function (s) { return keys.indexOf(s) >= 0; }).concat(keys.filter(function (k) { return S.BACKLOG_STATUSES.indexOf(k) < 0; }));
    if (st.group === 'priority') { const o = S.PRIORITIES.map(function (p) { return p[1]; }).concat(['Unprioritized']); return o.filter(function (k) { return keys.indexOf(k) >= 0; }); }
    return keys.slice().sort(U.natCmp);
  }
  EV.pages.backlog = function () {
    /* filters carried by a link (a dashboard tile, an alert) are applied once per arrival, every time the link is followed */
    if (st.applied !== EV.router.nav) {
      st.applied = EV.router.nav;
      const q = EV.router.query;
      if (q.priority) { st.priority = q.priority; st.tab = 'backlog'; st.status = 'open'; }
      if (q.tab) st.tab = q.tab;
    }
    const all = store.all('backlog_items');
    const findings = store.all('findings');
    const untriaged = findings.filter(function (f) { return f.status === 'open'; });
    const insights = R.activeInsights();
    const m = R.metrics();
    const q = st.q.trim().toLowerCase();
    const list = sortList(all.filter(function (b) {
      if (st.status === 'open' && !isOpen(b)) return false;
      if (st.status !== 'open' && st.status !== 'all' && b.status !== st.status) return false;
      if (st.priority && (st.priority === 'none' ? !!b.priority : b.priority !== st.priority)) return false;
      if (st.category && b.category !== st.category) return false;
      if (st.floor && b.floor_id !== st.floor) return false;
      if (st.owner && (b.owner || '') !== st.owner) return false;
      if (!q) return true;
      return [b.code, b.title, b.problem_statement, b.observed_evidence, b.recommendation, b.owner, b.category].some(function (v) { return v && String(v).toLowerCase().indexOf(q) >= 0; });
    }));
    const floors = [];
    store.all('buildings').forEach(function (b) { R.buildingFloors(b.id).forEach(function (f) { floors.push([f.id, 'Floor ' + f.number]); }); });
    const owners = U.uniq(all.map(function (b) { return b.owner; }).filter(Boolean)).sort();
    let body;
    if (st.tab === 'backlog') {
      const groups = st.group === 'none' ? null : U.groupBy(list, groupKey);
      body = [
        h('div.tiles.tiles-6', null,
          ui.stat({ key: 'o', label: 'Open items', value: m.openBacklog, onclick: function () { st.status = 'open'; st.priority = ''; } }),
          ui.stat({ key: 'p1', label: 'P1 — High', value: m.p1, tone: m.p1 ? 'danger' : null, onclick: function () { st.status = 'open'; st.priority = 'P1'; } }),
          ui.stat({ key: 'p2', label: 'P2 — Medium', value: m.p2, tone: m.p2 ? 'warn' : null, onclick: function () { st.status = 'open'; st.priority = 'P2'; } }),
          ui.stat({ key: 'p3', label: 'P3 — Low', value: m.p3, onclick: function () { st.status = 'open'; st.priority = 'P3'; } }),
          ui.stat({ key: 'c', label: 'Completion', value: m.backlogPct, unit: '%', sub: m.backlogDone + ' of ' + m.backlogTotal, onclick: function () { st.status = 'Completed'; st.priority = ''; } }),
          ui.stat({ key: 's', label: 'Systemic', value: all.filter(function (b) { return b.systemic && isOpen(b); }).length, sub: 'Affect more than one space' })),
        h('div.toolbar', null,
          ui.search(st.q, function (v) { st.q = v; }, 'Search ID, title, evidence, owner'),
          ui.select(st.status, [['open', 'All open'], ['all', 'All, including closed']].concat(S.BACKLOG_STATUSES.map(function (s) { return [s, s]; })), { empty: false, aria: 'Status', onchange: function (v) { st.status = v; } }),
          ui.select(st.priority, [['P1', 'P1 — High'], ['P2', 'P2 — Medium'], ['P3', 'P3 — Low'], ['none', 'Unprioritized']], { placeholder: 'All priorities', aria: 'Priority', onchange: function (v) { st.priority = v; } }),
          ui.select(st.category, S.FINDING_CATEGORIES, { placeholder: 'All categories', aria: 'Category', onchange: function (v) { st.category = v; } }),
          ui.select(st.floor, floors, { placeholder: 'All floors', aria: 'Floor', onchange: function (v) { st.floor = v; } }),
          owners.length ? ui.select(st.owner, owners, { placeholder: 'All owners', aria: 'Owner', onchange: function (v) { st.owner = v; } }) : null,
          ui.select(st.group, [['priority', 'Group: priority'], ['status', 'Group: status'], ['category', 'Group: category'], ['floor', 'Group: floor'], ['room', 'Group: room'], ['owner', 'Group: owner'], ['none', 'No grouping']],
            { empty: false, aria: 'Group by', onchange: function (v) { st.group = v; } }),
          ui.select(st.sort, [['priority', 'Sort: priority'], ['updated', 'Sort: recently updated'], ['created', 'Sort: newest'], ['target', 'Sort: target date'], ['code', 'Sort: ID']],
            { empty: false, aria: 'Sort by', onchange: function (v) { st.sort = v; } })),
        h('div.label-row', null, h('span.label', null, U.plural(list.length, 'item')),
          st.q || st.priority || st.category || st.floor || st.owner || st.status !== 'open' ? h('button.link', { type: 'button', onclick: function () { st.q = ''; st.priority = ''; st.category = ''; st.floor = ''; st.owner = ''; st.status = 'open'; } }, 'Clear filters') : null),
        !list.length ? ui.empty({ icon: 'flag', title: all.length ? 'No backlog items match these filters' : 'The backlog is empty', text: all.length ? '' : 'Confirm findings from a room audit, or add an item directly.' })
          : groups ? groupOrder(Array.from(groups.keys())).map(function (k) {
            return h('div.stack', { key: 'g' + k, style: 'gap:6px' }, h('div.subhead', null, k, h('span.count', null, String(groups.get(k).length))), h('div.list', null, groups.get(k).map(EV.backlogRow)));
          }) : h('div.list', null, list.map(EV.backlogRow))
      ];
    } else if (st.tab === 'triage' || st.tab === 'findings') {
      const fq = st.fq.trim().toLowerCase();
      const src = U.sortBy((st.tab === 'triage' ? untriaged : findings).filter(function (f) {
        return !fq || [f.code, f.title, f.observation, f.category].some(function (v) { return v && String(v).toLowerCase().indexOf(fq) >= 0; });
      }), function (f) { return f.created_at; }, true);
      body = [
        st.tab === 'triage' ? ui.note('info', 'Findings recorded in the field that are not yet in the formal backlog. Add each to the backlog, link it to an existing item, or dismiss it.') : null,
        h('div.toolbar', null, ui.search(st.fq, function (v) { st.fq = v; }, 'Search findings')),
        src.length ? h('div.list', null, src.map(EV.findingRow)) : ui.empty({ icon: 'check-circle', title: st.tab === 'triage' ? 'Nothing awaiting triage' : 'No findings recorded' })
      ];
    } else {
      body = [
        ui.note('info', 'Patterns and gaps derived from the recorded data. They are suggestions: each needs your confirmation before it becomes a finding or a request.'),
        insights.length ? h('div.stack', null, insights.map(EV.insightCard)) : ui.empty({ icon: 'zap', title: 'No suggestions right now' }),
        R.insights().length > insights.length ? h('button.link', { type: 'button', onclick: EV.openInsights }, 'Show tracked and dismissed suggestions') : null
      ];
    }
    return [
      ui.head({ title: 'Findings & Backlog', sub: 'Prioritized, defensible improvement backlog',
        /* an item exists only once it has a title, so abandoning the dialog leaves nothing behind */
        actions: [ui.btn('New item', { kind: 'primary', icon: 'plus', key: 'n', onclick: function () {
          return ui.prompt({ title: 'New backlog item', label: 'Title', ph: 'What needs to improve, in a few words', confirm: 'Create' }).then(function (t) {
            if (!t) return;
            const b = A.createBacklog({ title: t });
            EV.go('/backlog/' + b.id);
          });
        } }),
          ui.btn('CSV', { icon: 'download', key: 'c', title: 'Export the listed items as CSV', onclick: function () { return EV.reports.quickCsv('backlog_items', list); } })] }),
      ui.tabs([{ k: 'backlog', label: 'Backlog', count: m.openBacklog }, { k: 'triage', label: 'Awaiting triage', count: untriaged.length }, { k: 'findings', label: 'All findings', count: findings.length },
        { k: 'suggest', label: 'Suggestions', count: insights.length }], st.tab, function (k) { st.tab = k; }),
      body
    ];
  };

  /* ------------------------------------------------------------------ backlog item page */
  EV.pages.backlogItem = function (r) {
    const b = store.get('backlog_items', r.id);
    if (!b) return [ui.head({ title: 'Item not found', back: '/backlog' }), ui.empty({ icon: 'flag', title: 'This backlog item no longer exists.' })];
    const findings = store.by('findings', 'backlog_item_id', b.id);
    const photos = A.backlogPhotos(b);
    const requests = A.requestsFor(b.id);
    const rooms = R.backlogRooms(b);
    const sug = R.suggestPriority(b);
    const tests = findings.map(function (f) { return f.test_id ? store.getAny('functional_tests', f.test_id) : null; }).filter(Boolean);
    const history = U.sortBy(store.by('activity_log', 'entity_id', b.id), function (a) { return a.at; }, true).slice(0, 12);
    const set = function (k, v) {
      const def = S.F.backlog.find(function (f) { return f.k === k; });
      let patch = def && ['building', 'floor', 'room', 'device'].indexOf(def.type) >= 0 ? ui.cascade(b, k, v) : {};
      if (!(k in patch)) patch[k] = v;
      if (k === 'status') { A.setBacklogStatus(b.id, v); return; }
      if (k === 'root_cause_confidence' && v !== 'confirmed') {
        /* downgrade: a previously confirmed cause becomes a hypothesis again — never the other way round.
           The confirmation basis belongs to a confirmed cause only, so it goes with it. */
        patch.root_cause_basis = '';
        if (b.root_cause) { patch.root_cause = ''; if (U.blank(b.suspected_cause)) patch.suspected_cause = b.root_cause; }
      }
      store.update('backlog_items', b.id, patch);
    };
    const pdef = S.PRIORITIES.find(function (p) { return p[0] === b.priority; });
    const room = store.get('rooms', b.room_id);
    const photoCtx = function () { return { room: room, backlog_item_id: b.id, device_id: b.device_id || null, category: 'Other', description: b.title, building_id: b.building_id, floor_id: b.floor_id }; };
    const fields = S.F.backlog.filter(function (f) { return f.k !== 'status'; });
    return [
      ui.head({ back: '/backlog', eyebrow: h('span', null, h('span.mono', null, b.code), ' · ', b.category || 'Uncategorized'), title: [b.title || 'New backlog item', ui.demo(b)],
        sub: [R.where(b), b.owner ? 'Owner: ' + b.owner : 'No owner'].filter(Boolean).join(' · '),
        actions: [b.systemic ? ui.chip('Systemic', 'violet', { key: 's' }) : null, ui.iconBtn('trash', { key: 'd', title: 'Delete item', onclick: function () {
          ui.confirm({ title: 'Delete ' + b.code + '?', message: 'Linked findings are kept and return to “awaiting triage”. Its links to coordination requests are removed; the requests themselves are kept. History and previous exports keep their record of the item.', confirm: 'Delete', danger: true }).then(function (ok) {
            if (!ok) return;
            findings.forEach(function (f) { A.unlinkFinding(f.id); });
            /* always a recorded delete (so exports and other devices learn of it), together with its request links */
            A.remove('backlog_items', b.id);
            EV.go('/backlog', { replace: true }); EV.toast('Backlog item removed');
          });
        } })] }),
      h('div.split', null,
        h('div.stack.stack-lg', null,
          ui.card({ key: 'wf', title: 'Workflow' },
            ui.field('Status', ui.select(b.status, S.BACKLOG_STATUSES, { empty: false, id: 'bl-status', onchange: function (v) { set('status', v); } }),
              { hint: 'Changed ' + U.ago(b.status_changed_at || b.updated_at) }),
            ui.field('Priority', ui.seg(b.priority, [['P1', 'P1 — High', 'danger'], ['P2', 'P2 — Medium', 'warn'], ['P3', 'P3 — Low', 'muted']], { onchange: function (v, on) { set('priority', on ? '' : v); } }),
              { div: true, hint: pdef ? pdef[2] : 'Not prioritized yet. Weigh business impact, frequency, user friction, operational risk and implementation effort.' }),
            sug.priority ? h('div.guidance', null, icon('target', 15), h('div.note-body', null,
              h('div', null, h('strong', null, 'Guidance: ' + sug.priority), ' — ' + sug.reasons.join('; ') + '.'),
              sug.note ? h('div.muted', null, sug.note) : null,
              h('div.muted', null, 'Advisory only: several factors are weighed, and the decision is yours.'),
              sug.priority !== b.priority ? h('div.btn-row', null, ui.btn('Apply ' + sug.priority, { sm: true, onclick: function () {
                store.update('backlog_items', b.id, { priority: sug.priority, priority_rationale: b.priority_rationale || sug.reasons.join('; ') + '.' });
              } })) : null)) : h('p.muted', null, sug.note),
            ui.field('Priority rationale', ui.textarea(b.priority_rationale, { rows: 2, ph: 'Why this priority — in words leadership can read', oninput: function (v) { set('priority_rationale', v); } }))),
          h('div.card.card-pad', { key: 'form' }, ui.form(fields, b, set, { showMissing: true, idPrefix: 'bl-' }))),
        h('div.stack.stack-lg', null,
          h('section.stack', null,
            ui.label('Linked findings', h('span.count', null, String(findings.length))),
            findings.length ? h('div.list', null, findings.map(EV.findingRow)) : h('p.muted', null, 'No field findings linked. Items created directly have no audit evidence trail.'),
            rooms.length > 1 ? h('div.chips', null, h('span.muted', null, 'Affects: '), rooms.map(function (x) { return ui.chip(x.number || x.name, 'violet', { key: x.id }); })) : null),
          tests.length ? h('section.stack', null, ui.label('Related audit tests'),
            h('div.kv-list', null, tests.map(function (t) {
              const a = store.getAny('audits', t.audit_id);
              return ui.kv(t.category + ' — ' + t.test_name, S.label(S.TEST_RESULTS, t.result) + (a ? ' · ' + R.auditTitle(a) + ' · ' + a.code : ''), { key: t.id });
            }))) : null,
          h('section.stack', null,
            ui.label('Supporting photographs', h('span.count', null, String(photos.length))),
            P.gallery(photos, { empty: false }),
            h('div.btn-row.wrap', null, P.captureButton({ key: 'bl-cam-' + b.id, sm: true, label: 'Photo', ctx: photoCtx }), P.captureButton({ key: 'bl-lib-' + b.id, sm: true, kind: 'secondary', label: 'Upload', library: true, ctx: photoCtx }))),
          h('section.stack', null,
            ui.label('Related coordination requests', h('span.count', null, String(requests.length))),
            requests.length ? h('div.list', null, requests.map(function (x) { return EV.requestRow(x); })) : h('p.muted', null, 'None linked.'),
            h('div.btn-row.wrap', null,
              ui.btn('New request', { sm: true, icon: 'plus', onclick: function () {
                EV.editors.newRequest({ room: room }, { topic: b.title, description: b.problem_statement || b.title, reason: 'Required to progress backlog item ' + b.code + '.', needed_for: b.code,
                  building_id: b.building_id, floor_id: b.floor_id, room_id: b.room_id, device_id: b.device_id, priority: b.priority || 'P2' }, b.id);
              } }),
              ui.btn('Link existing', { sm: true, kind: 'ghost', icon: 'link', onclick: function () {
                const linked = new Set(requests.map(function (x) { return x.id; }));
                const opts = U.sortBy(store.all('it_requests').filter(function (x) { return !linked.has(x.id); }), function (x) { return x.code; }).map(function (x) { return { label: x.code + ' — ' + x.topic, hint: x.requested_from + ' · ' + x.status, value: x.id, icon: 'message' }; });
                if (!opts.length) { EV.toast('No other requests to link.'); return; }
                ui.choose({ title: 'Link a coordination request', options: opts }).then(function (id) { if (id) A.linkRequest(b.id, id); });
              } }))),
          h('section.stack', null, ui.label('History'), EV.activityList(history)),
          h('div.kv-list', null, ui.kv('Created', U.fmtDateTime(b.created_at) + ' · ' + (b.created_by || '')), ui.kv('Last updated', U.fmtDateTime(b.updated_at) + ' · ' + (b.updated_by || '')),
            b.completed_at ? ui.kv('Completed', U.fmtDateTime(b.completed_at)) : null)))
    ];
  };
})();
