/* shell.js — application frame: navigation, top bar, save/sync indicator, quick actions, routing table, boot. */
(function () {
  'use strict';
  const EV = window.EV, h = EV.h, U = EV.U, store = EV.store, ui = EV.ui, icon = EV.icon, R = EV.rules, A = EV.act;
  EV.pages = EV.pages || {};
  EV.editors = EV.editors || {};

  const NAV = (EV.NAV = [
    { path: '/', label: 'Command Center', icon: 'home' },
    { path: '/environment', label: 'Buildings & Floors', icon: 'building' },
    { path: '/audits', label: 'Room Audits', icon: 'clipboard' },
    { path: '/devices', label: 'Device Inventory', icon: 'cpu' },
    { path: '/infrastructure', label: 'Infrastructure', icon: 'network' },
    { path: '/backlog', label: 'Findings & Backlog', icon: 'flag' },
    { path: '/coordination', label: 'IT Coordination', icon: 'message' },
    { path: '/spares', label: 'Spare Equipment', icon: 'package' },
    { path: '/reports', label: 'Reports', icon: 'file' },
    { path: '/export', label: 'Daily Export & Data Handoff', icon: 'share' },
    { path: '/settings', label: 'Settings', icon: 'sliders' }
  ]);

  function resolve() {
    const p = EV.router.parts;
    switch (p[0] || '') {
      case '': return { page: 'command', nav: '/' };
      case 'environment': return { page: 'environment', nav: '/environment' };
      case 'floor': return { page: 'floor', nav: '/environment', id: p[1] };
      case 'room': return { page: 'room', nav: '/environment', id: p[1] };
      case 'audits': return { page: 'audits', nav: '/audits' };
      case 'audit': return { page: 'audit', nav: '/audits', id: p[1] };
      case 'devices': return { page: 'devices', nav: '/devices' };
      case 'infrastructure': return { page: 'infrastructure', nav: '/infrastructure' };
      case 'backlog': return p[1] ? { page: 'backlogItem', nav: '/backlog', id: p[1] } : { page: 'backlog', nav: '/backlog' };
      case 'coordination': return { page: 'coordination', nav: '/coordination' };
      case 'spares': return { page: 'spares', nav: '/spares' };
      case 'reports': return p[1] ? { page: 'reportView', nav: '/reports', id: p[1] } : { page: 'reports', nav: '/reports' };
      case 'export': return { page: 'exportCenter', nav: '/export' };
      case 'settings': return { page: 'settings', nav: '/settings' };
      default: return { page: 'notFound', nav: '' };
    }
  }
  /* Where the auditor currently "is": used to pre-fill new devices, photographs and findings. */
  EV.context = function () {
    const p = EV.router.parts;
    if (p[0] === 'audit') { const a = store.get('audits', p[1]); if (a) return { audit: a, room: R.auditRooms(a)[0] || null }; }
    if (p[0] === 'room') { const r = store.get('rooms', p[1]); if (r) return { room: r, audit: A.openAudit({ room: r }) }; }
    return {};
  };
  EV.onRoute = function () {
    ui.closeAll();
    const ctx = EV.context();
    if (ctx.room && store.kvGet('last_room') !== ctx.room.id) store.kvSet('last_room', ctx.room.id);
  };

  /* ------------------------------------------------------------------ save / sync indicator */
  function saveState() {
    const s = store.save;
    if (s.memoryOnly) return { tone: 'danger', text: 'Not persisted', ic: 'alert' };
    if (s.error) return { tone: 'danger', text: 'Save problem', ic: 'alert' };
    if (s.pending > 0) return { tone: 'muted', text: 'Saving…', ic: 'refresh' };
    const sync = EV.sync && EV.sync.status ? EV.sync.status() : null;
    if (sync && sync.enabled) {
      if (sync.error) return { tone: 'warn', text: 'Saved · sync issue', ic: 'cloud-off' };
      if (!navigator.onLine) return { tone: 'warn', text: 'Saved · offline', ic: 'cloud-off' };
      if (sync.pending > 0) return { tone: 'muted', text: 'Saved · ' + sync.pending + ' to sync', ic: 'cloud' };
      return { tone: 'ok', text: 'Saved · synced', ic: 'cloud' };
    }
    return { tone: 'ok', text: s.lastSavedAt ? 'Saved ' + U.fmtTime(s.lastSavedAt) : 'Saved on device', ic: 'check' };
  }
  function saveIndicator() {
    const st = saveState();
    return h('button', { type: 'button', 'class': 'save-pill save-' + st.tone, onclick: openStatus, title: 'Data status', id: 'save-indicator' }, icon(st.ic, 14), h('span', null, st.text));
  }
  function openStatus() {
    const info = { est: null };
    store.estimate().then(function (e) { info.est = e; EV.redraw(); });
    const sheet = ui.openSheet({
      title: 'Data status', size: 'auto',
      render: function () {
        const s = store.save;
        const sync = EV.sync && EV.sync.status ? EV.sync.status() : { enabled: false };
        const last = store.all('exports').filter(function (e) { return e.status === 'success'; }).sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; })[0];
        return [
          s.memoryOnly ? ui.note('danger', s.error) : s.error ? ui.note('danger', s.error) : ui.note('ok', 'Every change is written to this device as you work. Closing or refreshing the app does not lose audit data.'),
          h('div.kv-list', null,
            ui.kv('Storage', s.memoryOnly ? 'Memory only (not persistent)' : 'On this device (IndexedDB)'),
            ui.kv('Last write confirmed', s.lastSavedAt ? U.fmtDateTime(s.lastSavedAt) + ' · ' + U.fmtTime(s.lastSavedAt) : 'No changes yet this session'),
            ui.kv('Writes waiting', String(s.pending)),
            ui.kv('Protected from automatic clearing', s.persisted === true ? 'Yes' : s.persisted === false ? 'Not granted by the browser' : 'Unknown'),
            info.est && info.est.usage != null ? ui.kv('Space used', U.bytes(info.est.usage) + (info.est.quota ? ' of ' + U.bytes(info.est.quota) + ' available' : '')) : null,
            ui.kv('Cloud sync', sync.enabled ? (sync.label + (sync.error ? ' — ' + sync.error : sync.pending ? ' — ' + sync.pending + ' changes queued' : ' — up to date') + (sync.lastSyncAt ? ' · ' + U.ago(sync.lastSyncAt) : '')) : 'Off — records stay on this device'),
            ui.kv('Last export', last ? last.code + ' · ' + U.fmtDateTime(last.created_at) : 'None yet')),
          h('div.btn-row.wrap', null,
            s.persisted === false ? ui.btn('Request protected storage', { sm: true, onclick: function () { return store.requestPersistence().then(function (ok) { EV.toast(ok ? 'Storage is now protected' : 'The browser did not grant protected storage. Installing to the home screen usually enables it.', ok ? 'ok' : 'warn', 5000); }); } }) : null,
            sync.enabled ? ui.btn('Sync now', { sm: true, icon: 'refresh', onclick: function () { return EV.sync.run(); } }) : null,
            ui.btn('Open Daily Export', { sm: true, kind: 'ghost', icon: 'share', onclick: function () { ui.closeSheet(sheet); EV.go('/export'); } }))
        ];
      }
    });
  }

  /* ------------------------------------------------------------------ quick actions (NEW) */
  function action(ic, label, hint, fn, key) {
    return h('button', { type: 'button', 'class': 'action', key: key || label, onclick: fn },
      h('span.action-ic', null, icon(ic, 20)),
      h('span.action-text', null, h('span.action-label', null, label), hint ? h('span.action-hint', null, hint) : null),
      icon('chev-right', 16, 'row-chev'));
  }
  EV.startAuditFlow = function () {
    return ui.pickRoom({ title: 'Start or resume a room audit', sub: 'Pick a floor, then the room', configs: true }).then(function (sel) {
      if (!sel) return;
      const audit = A.resumeOrStart(sel);
      EV.go('/audit/' + audit.id);
    });
  };
  function openNew() {
    const ctx = EV.context();
    const sheet = ui.openSheet({
      title: 'New', sub: ctx.room ? 'Current space: ' + R.roomLabel(ctx.room) : 'Quick actions', size: 'auto',
      render: function () {
        const close = function () { ui.closeSheet(sheet); };
        return h('div.action-list', null,
          action('clipboard', 'New Room Audit', 'Pick a floor and room — start in seconds', function () { close(); EV.startAuditFlow(); }),
          action('cpu', 'Add Device', ctx.room ? 'To ' + R.roomLabel(ctx.room) : 'Choose the room, then the device type', function () {
            close();
            if (ctx.room) { EV.editors.newDevice({ room: ctx.room, audit: ctx.audit }); return; }
            ui.pickRoom({ title: 'Add a device to…' }).then(function (sel) { if (sel && sel.room) EV.editors.newDevice({ room: sel.room, audit: A.openAudit({ room: sel.room }) }); });
          }),
          ctx.room
            ? EV.photos.captureLabel({ key: 'new-photo', cls: 'action', ctx: function () { return { audit: ctx.audit, room: ctx.room, category: EV.photos.nextCategory[ctx.audit ? ctx.audit.id : ctx.room.id] || 'Room overview' }; }, after: close },
              [h('span.action-ic', null, icon('camera', 20)),
                h('span.action-text', null, h('span.action-label', null, 'Take Photo'), h('span.action-hint', null, 'Opens the camera — saved to ' + R.roomLabel(ctx.room))),
                icon('chev-right', 16, 'row-chev')])
            : action('camera', 'Take Photo', 'Choose the room, then the camera opens', function () {
              close();
              ui.pickRoom({ title: 'Photograph which room?' }).then(function (sel) { if (sel && sel.room) EV.photos.captureSheet({ room: sel.room, audit: A.openAudit({ room: sel.room }) }); });
            }),
          action('flag', 'Record Finding', 'Observation with evidence; add to the backlog when confirmed', function () { close(); EV.editors.newFinding(ctx); }),
          action('message', 'Create IT Request', 'Client IT, PepperDash, vendor or facilities', function () { close(); EV.editors.newRequest(ctx); }),
          action('package', 'Add Spare Equipment', 'Replacement inventory item', function () { close(); EV.editors.newSpare(); }));
      }
    });
  }
  EV.openNew = openNew;
  function openMore(r) {
    const sheet = ui.openSheet({
      title: 'All sections', size: 'auto',
      render: function () {
        return h('div.action-list', null, NAV.map(function (n) {
          return h('button', { type: 'button', key: n.path, 'class': U.cx('action', r.nav === n.path && 'action-on'), onclick: function () { ui.closeSheet(sheet); EV.go(n.path); } },
            h('span.action-ic', null, icon(n.icon, 20)), h('span.action-text', null, h('span.action-label', null, n.label)), icon('chev-right', 16, 'row-chev'));
        }));
      }
    });
  }

  /* ------------------------------------------------------------------ frame */
  function badges() {
    const m = R.metrics();
    return { '/devices': m.devicesIncomplete, '/backlog': m.p1, '/coordination': m.requestsOpen, '/audits': m.roomsInProgress };
  }
  function sidebar(r) {
    const bd = badges();
    const prof = EV.auth.profile();
    return h('aside.sidebar', null,
      h('div.sidebar-brand', null, EV.brand({ stack: true })),
      ui.btn('New', { kind: 'primary', icon: 'plus', block: true, cls: 'sidebar-new', onclick: openNew }),
      h('nav.nav', { 'aria-label': 'Sections' }, NAV.map(function (n) {
        return h('a', { key: n.path, href: '#' + n.path, 'class': U.cx('nav-item', r.nav === n.path && 'on'), 'aria-current': r.nav === n.path ? 'page' : null,
          onclick: function (e) { e.preventDefault(); EV.go(n.path); } },
          icon(n.icon, 18), h('span.nav-label', null, n.label), bd[n.path] ? h('span.nav-badge', null, String(bd[n.path])) : null);
      })),
      h('div.sidebar-foot', null,
        h('div.who', null, h('span.who-avatar', null, icon('user', 15)), h('span.who-text', null, h('span.who-name', null, prof.name || 'Auditor'), h('span.who-role', null, EV.S.label(EV.S.ROLES, prof.role || 'lead_auditor')))),
        h('div.sidebar-meta', null, 'v' + EV.APP.version + ' · ' + (store.isMemoryOnly() ? 'memory only' : 'device storage'))));
  }
  function topbar(r) {
    const cur = NAV.find(function (n) { return n.path === r.nav; });
    return h('div.topbar', null,
      h('button.topbar-brand', { type: 'button', 'aria-label': 'Command Center', onclick: function () { EV.go('/'); } }, EV.brand({ compact: true, size: 24 })),
      h('div.topbar-section', null, cur ? cur.label : ''),
      h('span.grow'),
      navigator.onLine === false ? ui.chip('Offline', 'warn', { icon: 'cloud-off', title: 'No network connection — the app keeps working and saving on this device' }) : null,
      saveIndicator(),
      EV.auth.hasLock() ? ui.iconBtn('lock', { title: 'Lock now', size: 18, onclick: function () { EV.auth.lock(); } }) : null);
  }
  function bottomNav(r) {
    function tab(path, label, ic) {
      return h('button', { type: 'button', 'class': U.cx('bn-item', r.nav === path && 'on'), 'aria-current': r.nav === path ? 'page' : null, onclick: function () { EV.go(path); } }, icon(ic, 21), h('span', null, label));
    }
    const main = ['/', '/audits', '/backlog'];
    return h('nav.bottomnav', { 'aria-label': 'Primary' },
      tab('/', 'Home', 'home'), tab('/audits', 'Audits', 'clipboard'),
      h('button.fab', { type: 'button', 'aria-label': 'New — quick actions', id: 'fab-new', onclick: openNew }, icon('plus', 20), h('span', null, 'NEW')),
      tab('/backlog', 'Backlog', 'flag'),
      h('button', { type: 'button', 'class': U.cx('bn-item', main.indexOf(r.nav) < 0 && 'on'), id: 'bn-more', onclick: function () { openMore(r); } }, icon('menu', 21), h('span', null, 'More')));
  }
  function crashPanel(err) {
    return h('div.crash', null,
      ui.note('danger', 'This screen could not be displayed. Your saved data is not affected.', { title: 'Something went wrong' }),
      h('pre.crash-detail', null, String((err && err.message) || err)),
      h('div.btn-row', null, ui.btn('Command Center', { kind: 'primary', onclick: function () { EV.go('/', { replace: true }); } }), ui.btn('Reload', { onclick: function () { location.reload(); } })));
  }
  EV.renderCrash = crashPanel;
  EV.pages.notFound = function () {
    return [ui.head({ title: 'Page not found' }), ui.empty({ icon: 'help', title: 'That screen does not exist', action: ui.btn('Command Center', { kind: 'primary', onclick: function () { EV.go('/', { replace: true }); } }) })];
  };
  function view() {
    const gate = EV.auth.gate();
    if (gate) return [gate, h('div.overlays', null, ui.renderOverlays({ gated: true }))];
    const r = resolve();
    const pageFn = EV.pages[r.page] || EV.pages.notFound;
    let content;
    try { content = pageFn(r); } catch (e) { console.error('[page ' + r.page + ']', e); content = crashPanel(e); }
    return [
      h('div.shell', null,
        sidebar(r),
        h('div.content', null,
          topbar(r),
          /* the copy hosted on claude.ai says what it is on every screen, whatever data it holds */
          EV.env.hosted ? h('div.demo-banner.demo-banner-hosted', null, h('strong', null, 'DEMONSTRATION COPY'),
            h('span', null, 'Hosted for evaluation with synthetic data. Not an approved deployment: do not enter real client information.'),
            h('button.link', { type: 'button', onclick: function () { EV.go('/settings'); } }, 'About'))
          : store.hasDemo() ? h('div.demo-banner', null, h('strong', null, 'DEMO DATA'), h('span', null, 'Synthetic records for evaluation. Not a real environment.'),
            h('button.link', { type: 'button', onclick: function () { EV.go('/settings'); } }, 'Manage')) : null,
          store.save.error ? h('div.status-banner', null, icon('alert', 15), h('span', null, store.save.error)) : null,
          h('main.main', { id: 'main-scroll' }, h('div', { 'class': 'page page-' + r.page, key: r.page + ':' + (r.id || '') }, content)),
          bottomNav(r))),
      h('div.overlays', null, ui.renderOverlays())
    ];
  }

  /* ------------------------------------------------------------------ boot */
  EV.boot = async function () {
    const root = document.getElementById('app');
    try {
      if (!store.ready) await store.init();
      EV.auth.init();
      if (EV.sync && EV.sync.init) await EV.sync.init();
      if (EV.env.hosted && EV.seed && !store.kvGet('onboarded')) await EV.auth.startHostedDemo();
      if (store.kvGet('onboarded')) R.reconcileFollowups();
    } catch (e) {
      console.error(e);
      root.textContent = 'The application could not start: ' + (e && e.message || e);
      return;
    }
    EV.router.start();
    EV.mount(root, view);
    window.addEventListener('online', function () { EV.redraw(); if (EV.sync && EV.sync.run) EV.sync.run(); });
    window.addEventListener('offline', function () { EV.redraw(); });
    setInterval(function () { EV.redraw(); }, 30000); /* keeps relative times and the save indicator current */
    const dev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!EV.env.embedded && !EV.env.hosted && 'serviceWorker' in navigator && EV.env.secure && (!dev || /[?&]sw=1/.test(location.search))) {
      navigator.serviceWorker.register('./sw.js').catch(function (e) { console.warn('[sw] registration failed', e); });
    }
  };
})();
