/* pages/coordination.js — IT coordination tracker: Client IT, PepperDash, vendors, facilities. */
(function () {
  'use strict';
  const EV = window.EV, h = EV.h, U = EV.U, S = EV.S, store = EV.store, ui = EV.ui, icon = EV.icon, R = EV.rules, A = EV.act, P = EV.photos;
  const st = { party: 'all', status: 'open', q: '' };
  const PARTY_TONE = { 'Client IT': 'accent', 'PepperDash': 'ok', 'Vendor': 'violet', 'Facilities': 'warn' };

  function isOpen(x) { return S.IT_CLOSED.indexOf(x.status) < 0; }
  function overdue(x) { return isOpen(x) && x.target_date && x.target_date < U.localDate(); }
  EV.requestRow = function (x) {
    return ui.row({ key: x.id, left: icon('message', 17),
      title: [x.topic || 'Untitled request', ui.demo(x)],
      sub: [x.code, x.requested_from + (x.vendor_name ? ' (' + x.vendor_name + ')' : ''), x.request_type, R.where(x), x.target_date ? 'target ' + U.fmtDate(x.target_date) : ''].filter(Boolean).join(' · '),
      right: [overdue(x) ? ui.chip('Overdue', 'danger', { key: 'o' }) : null, ui.chip(x.status, ui.tone.it(x.status), { key: 's' })],
      onclick: function () { EV.editors.request(x.id); } });
  };

  EV.editors.request = function (id, isNew) {
    return ui.openEditor({
      table: 'it_requests', id: id, isNew: isNew, fields: S.F.it,
      title: function (x) { return x ? (isNew ? 'New coordination request' : x.code + ' · ' + x.requested_from) : 'Request'; },
      sub: function (x) { return x ? [x.status, R.where(x)].filter(Boolean).join(' · ') : ''; },
      onSet: function (x, k, v, patch) {
        if (k === 'requested_from') patch.request_type = '';
        if (k === 'status' && v === 'Submitted' && !x.date_requested) patch.date_requested = U.localDate();
        if (k === 'status' && v === 'Answered' && !x.response_date) patch.response_date = U.localDate();
      },
      before: function (x) {
        return h('div.stack', { key: 'state' },
          overdue(x) ? ui.note('warn', 'The target date (' + U.fmtDate(x.target_date) + ') has passed and this request is still open.') : null,
          x.status === 'Draft' && !isNew ? ui.note('info', 'Draft — recorded here for tracking. This tool does not send requests; raise it through the agreed channel and update the status.') : null);
      },
      after: function (x) {
        const linked = A.backlogFor(x.id);
        const photos = store.by('photos', 'it_request_id', x.id);
        const room = store.get('rooms', x.room_id);
        const ctx = function () { return { room: room, it_request_id: x.id, device_id: x.device_id || null, category: 'Other', description: x.topic, building_id: x.building_id, floor_id: x.floor_id }; };
        return [
          h('div.form-group', { key: 'bl' }, h('div.form-group-title', null, 'Related backlog items'),
            linked.length ? h('div.list', null, linked.map(function (b) {
              return h('div.row', { key: b.id }, h('span.row-left', null, ui.priority(b.priority)),
                h('span.row-main', null, h('span.row-title', null, b.title), h('span.row-sub', null, b.code + ' · ' + b.status)),
                ui.iconBtn('external', { size: 17, title: 'Open ' + b.code, onclick: function () { EV.go('/backlog/' + b.id); } }),
                ui.iconBtn('x', { size: 17, title: 'Unlink', onclick: function () { A.unlinkRequest(b.id, x.id); } }));
            })) : h('span.field-hint', null, 'Not linked to a backlog item.'),
            h('div.btn-row', null, ui.btn('Link backlog item', { sm: true, kind: 'ghost', icon: 'link', onclick: function () {
              const have = new Set(linked.map(function (b) { return b.id; }));
              const opts = U.sortBy(store.all('backlog_items').filter(function (b) { return !have.has(b.id); }), function (b) { return b.code; })
                .map(function (b) { return { label: b.code + ' — ' + b.title, hint: (b.priority || 'Unprioritized') + ' · ' + b.status, value: b.id, icon: 'flag' }; });
              if (!opts.length) { EV.toast('No backlog items available to link.'); return; }
              ui.choose({ title: 'Link a backlog item', options: opts }).then(function (bid) { if (bid) A.linkRequest(bid, x.id); });
            } }))),
          h('div.form-group', { key: 'docs' }, h('div.form-group-title', null, 'Supporting photographs'), P.strip(photos),
            h('div.btn-row.wrap', null, P.captureButton({ key: 'it-cam-' + x.id, sm: true, label: 'Photo', ctx: ctx }), P.captureButton({ key: 'it-lib-' + x.id, sm: true, kind: 'secondary', label: 'Upload', library: true, ctx: ctx })))
        ];
      }
    });
  };
  EV.editors.newRequest = function (ctx, prefill, linkBacklogId) {
    ctx = ctx || {};
    const room = ctx.room || null;
    const x = A.createRequest(Object.assign({ building_id: room ? room.building_id : null, floor_id: room ? room.floor_id : null, room_id: room ? room.id : null }, prefill || {}));
    if (linkBacklogId) A.linkRequest(linkBacklogId, x.id);
    return EV.editors.request(x.id, true);
  };

  EV.pages.coordination = function () {
    const all = store.all('it_requests');
    const open = all.filter(isOpen);
    const q = st.q.trim().toLowerCase();
    const list = all.filter(function (x) {
      if (st.party !== 'all' && x.requested_from !== st.party) return false;
      if (st.status === 'open' && !isOpen(x)) return false;
      if (st.status !== 'open' && st.status !== 'all' && x.status !== st.status) return false;
      if (!q) return true;
      return [x.code, x.topic, x.description, x.request_type, x.response, x.vendor_name].some(function (v) { return v && String(v).toLowerCase().indexOf(q) >= 0; });
    }).sort(function (a, b) {
      const oa = overdue(a) ? 0 : 1, ob = overdue(b) ? 0 : 1;
      return (oa - ob) || ((a.target_date || '9999') < (b.target_date || '9999') ? -1 : 1);
    });
    const count = function (p) { return open.filter(function (x) { return x.requested_from === p; }).length; };
    /* suggestions: undocumented switch ports (per room) and follow-ups that need another party */
    const insightSug = R.activeInsights().filter(function (i) { return i.action && i.action.type === 'it_request'; });
    const fuSug = R.openFollowups().filter(function (f) { return !f.it_request_id && S.IT_PARTIES.indexOf(f.suggested_party) >= 0; });
    return [
      ui.head({ title: 'IT Coordination', sub: 'Requests and dependencies with Client IT, PepperDash, vendors and facilities',
        actions: [ui.btn('New request', { kind: 'primary', icon: 'plus', key: 'n', onclick: function () { EV.editors.newRequest(EV.context(), st.party !== 'all' ? { requested_from: st.party } : null); } }),
          ui.btn('CSV', { icon: 'download', key: 'c', title: 'Export the listed requests as CSV', onclick: function () { return EV.reports.quickCsv('it_requests', list); } })] }),
      h('div.tiles.tiles-6', null,
        ui.stat({ key: 'o', label: 'Open requests', value: open.length, onclick: function () { st.party = 'all'; st.status = 'open'; } }),
        ui.stat({ key: 'e', label: 'Client IT', value: count('Client IT'), tone: count('Client IT') ? 'warn' : null, sub: 'Outstanding dependencies', onclick: function () { st.party = 'Client IT'; st.status = 'open'; } }),
        ui.stat({ key: 'p', label: 'PepperDash', value: count('PepperDash'), onclick: function () { st.party = 'PepperDash'; st.status = 'open'; } }),
        ui.stat({ key: 'v', label: 'Vendors', value: count('Vendor'), onclick: function () { st.party = 'Vendor'; st.status = 'open'; } }),
        ui.stat({ key: 'd', label: 'Overdue', value: open.filter(overdue).length, tone: open.filter(overdue).length ? 'danger' : null }),
        ui.stat({ key: 'a', label: 'Answered / closed', value: all.length - open.length })),
      insightSug.length || fuSug.length ? h('section.stack', null,
        ui.label('Suggested requests', h('span.count', null, String(insightSug.length + fuSug.length))),
        h('p.muted', null, 'Drafted from documentation gaps. Nothing is created until you choose to draft it, and nothing is ever sent from this tool.'),
        insightSug.map(EV.insightCard),
        fuSug.length ? h('div.list', null, fuSug.slice(0, 12).map(EV.followupRow)) : null) : null,
      ui.tabs([{ k: 'all', label: 'All', count: open.length }].concat(S.IT_PARTIES.map(function (p) { return { k: p, label: p, count: count(p) }; })), st.party, function (k) { st.party = k; }),
      h('div.toolbar', null,
        ui.search(st.q, function (v) { st.q = v; }, 'Search requests'),
        ui.select(st.status, [['open', 'Open'], ['all', 'All']].concat(S.IT_STATUSES.map(function (s) { return [s, s]; })), { empty: false, aria: 'Status', onchange: function (v) { st.status = v; } })),
      list.length ? h('div.list', null, list.map(EV.requestRow))
        : ui.empty({ icon: 'message', title: all.length ? 'No requests match these filters' : 'No coordination requests yet', text: 'Track IP reservations, switch-port information, firewall needs, programming changes, warranty questions and more.' }),
      h('div.legend', null, S.IT_PARTIES.map(function (p) { return h('span', { key: p }, ui.chip(p, PARTY_TONE[p]), ' ' + S.IT_TYPES[p].slice(0, 4).join(', ') + '…'); }))
    ];
  };
})();
