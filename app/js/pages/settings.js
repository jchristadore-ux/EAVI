/* pages/settings.js — profile, security, device data (backup / restore / demo / erase), cloud sync, about. */
(function () {
  'use strict';
  const EV = window.EV, h = EV.h, U = EV.U, S = EV.S, store = EV.store, ui = EV.ui, icon = EV.icon, R = EV.rules;
  const st = { cur: '', pass: '', pass2: '', busy: '', est: null, estAt: 0, url: '', key: '', err: '', code: null };

  async function fullBackup() {
    const zip = EV.zip.create();
    await zip.add('backup.json', JSON.stringify(store.dump()));
    const keys = await store.blobKeys();
    let n = 0;
    for (const k of keys) {
      const b = await store.blobGet(k);
      if (!b) continue;
      await zip.add('blobs/' + k.replace(':', '__') + '.bin', b.data, { compress: false });
      await zip.add('blobs/' + k.replace(':', '__') + '.mime', b.mime || 'image/jpeg', { compress: false });
      n++;
    }
    const name = store.orgCode() + '_AV_Intelligence_Backup_' + U.localDate() + '.zip';
    const res = await EV.saveFile(zip.finish(), name, 'application/zip');
    EV.toast(res.ok ? 'Backup saved: ' + name + ' (' + n + ' image files)' : (res.message || 'The backup could not be saved here.'), res.ok ? 'ok' : 'warn', 5000);
  }
  async function restoreFrom(file) {
    let dump, entries = [];
    if (/\.json$/i.test(file.name)) dump = JSON.parse(await file.text());
    else {
      entries = await EV.zip.read(file);
      const main = entries.find(function (e) { return e.path === 'backup.json'; });
      if (!main) throw new Error('This ZIP is not an application backup (backup.json is missing). Daily export packages cannot be restored; use a backup file.');
      dump = JSON.parse(new TextDecoder().decode(await main.read()));
    }
    /* nothing is written until the file has been recognised as a backup; the records come first, then their images */
    store.checkBackup(dump);
    /* demo records are never synchronised and real records must not depend on them (the same rule as loading the demo) */
    if (EV.sync.config().mode === 'supabase' && S.TABLES.some(function (t) { return Array.isArray(dump.tables[t]) && dump.tables[t].some(function (r) { return r && r.is_demo === true; }); }))
      throw new Error('This backup contains the demo environment, which cannot be restored while a cloud workspace is connected. Remove the demo data on the device the backup came from and save a new backup.');
    const n = store.restore(dump);
    await store.flush();
    let images = 0;
    for (const e of entries.filter(function (x) { return /^blobs\/[0-9a-f-]{36}(__edit)?\.bin$/i.test(x.path); })) {
      const key = e.path.slice(6, -4).replace('__', ':');
      if (!store.getAny('photos', key.split(':')[0])) continue;   /* an image with no photograph record is not kept */
      if (await store.blobGet(key)) continue;                     /* an image already on this device (possibly edited since) is not replaced */
      const mimeEntry = entries.find(function (x) { return x.path === e.path.slice(0, -4) + '.mime'; });
      const mime = mimeEntry ? new TextDecoder().decode(await mimeEntry.read()) : 'image/jpeg';
      const bytes = await e.read();
      await store.blobPut(key, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), /^image\/[a-z0-9.+-]+$/i.test(mime) ? mime : 'image/jpeg');
      images++;
    }
    R.reconcileFollowups();
    store.log({ action: 'restored', entity_type: 'backup', summary: 'Backup restored: ' + n + ' records, ' + images + ' image files' });
    return { records: n, blobs: images };
  }
  function busy(name, promise, okMsg) {
    st.busy = name; EV.redraw();
    return Promise.resolve(promise).then(function (r) { st.busy = ''; if (okMsg) EV.toast(typeof okMsg === 'function' ? okMsg(r) : okMsg, 'ok', 4200); EV.redraw(); return r; },
      function (e) { st.busy = ''; EV.reportError(e); EV.redraw(); });
  }

  EV.pages.settings = function () {
    const prof = EV.auth.profile();
    const lock = store.kvGet('lock');
    const sv = store.save;
    const sy = EV.sync.status();
    const cfg = EV.sync.config();
    const conflicts = EV.sync.conflicts();
    const dismissed = store.all('insight_states').filter(function (i) { return i.state === 'dismissed'; });
    if (Date.now() - st.estAt > 15000) { st.estAt = Date.now(); store.estimate().then(function (e) { st.est = e; EV.redraw(); }); }
    const counts = ['buildings', 'rooms', 'audits', 'devices', 'photos', 'findings', 'backlog_items', 'it_requests', 'infra_assets', 'spare_items'].map(function (t) { return S.T[t].label + 's: ' + store.count(t); }).join(' · ');
    return [
      ui.head({ title: 'Settings', sub: 'Profile, security, data on this device and cloud sync' }),
      h('div.split.split-even', null,
        h('div.stack.stack-lg', null,
          ui.card({ key: 'prof', title: 'Auditor profile' },
            h('div.form-grid', null,
              ui.field('Auditor name', ui.input(prof.name, { id: 'set-name', caps: 'words', oninput: function (v) { EV.auth.setProfile({ name: v }); } }), { hint: 'Recorded on audits, reports and exports.' }),
              ui.field('Email', ui.input(prof.email, { id: 'set-email', type: 'email', mono: true, oninput: function (v) { EV.auth.setProfile({ email: v }); } }), { half: true }),
              ui.field('Role', h('div.readonly', null, S.label(S.ROLES, prof.role || 'lead_auditor')), { half: true, div: true, hint: sy.enabled ? 'Assigned by the workspace administrator.' : 'Single-user device mode.' }),
              ui.field('Organization name', ui.input(store.kvGet('org_name') || '', { id: 'set-org', oninput: function (v) { store.kvSet('org_name', v); } }), { half: true }),
              /* what is typed is kept as typed while the field is being edited (it may be cleared to type a new prefix);
                 the stored prefix changes only when the text is a valid one */
              ui.field('Record ID prefix', ui.input(st.code == null ? store.orgCode() : st.code, { id: 'set-code', mono: true, oninput: function (v) {
                st.code = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
                if (st.code.length >= 2) store.kvSet('org_code', st.code);
              }, onchange: function () { st.code = null; } }),
                { half: true, hint: 'Used for new record IDs, e.g. ' + store.orgCode() + '-BL-001. Changing the prefix does not rename existing IDs.' }))),

          ui.card({ key: 'sec', title: 'Security' },
            !EV.auth.canLock() ? ui.note('warn', 'A passcode lock needs a secure (HTTPS) connection. It is unavailable on this address.') : [
              h('p.muted', { key: 'p' }, lock ? 'A passcode protects this app. It locks after ' + (lock.autoLockMin || 15) + ' minutes of inactivity.' : 'No passcode is set. Anyone who can unlock this device can open the app.'),
              h('div.form-grid', { key: 'g' },
                lock ? ui.field('Current passcode', ui.input(st.cur, { id: 'set-cur', type: 'password', mono: true, ph: 'Needed to change or remove it', oninput: function (v) { st.cur = v; } })) : null,
                ui.field(lock ? 'New passcode' : 'Passcode', ui.input(st.pass, { id: 'set-pass', type: 'password', mono: true, ph: 'At least 6 characters', oninput: function (v) { st.pass = v; } }), { half: true }),
                ui.field('Repeat passcode', ui.input(st.pass2, { id: 'set-pass2', type: 'password', mono: true, oninput: function (v) { st.pass2 = v; } }), { half: true }),
                lock ? ui.field('Lock after inactivity', ui.select(String(lock.autoLockMin || 15), [['2', '2 minutes'], ['5', '5 minutes'], ['15', '15 minutes'], ['30', '30 minutes'], ['60', '1 hour']], { empty: false, onchange: function (v) { EV.auth.setAutoLock(Number(v)); } }), { half: true }) : null),
              h('div.btn-row.wrap', { key: 'b' },
                ui.btn(lock ? 'Change passcode' : 'Set passcode', { kind: 'primary', icon: 'lock', disabled: !st.pass || st.busy === 'pass', onclick: function () {
                  if (st.pass !== st.pass2) { EV.toast('The two passcode entries do not match.', 'warn'); return; }
                  return busy('pass', EV.auth.setPasscode(st.pass, st.cur).then(function () { st.pass = st.pass2 = st.cur = ''; }), 'Passcode saved');
                } }),
                lock ? ui.btn('Lock now', { icon: 'lock', onclick: function () { EV.auth.lock(); } }) : null,
                lock ? ui.btn('Remove passcode', { kind: 'ghost-danger', disabled: !st.cur, title: st.cur ? '' : 'Enter the current passcode first', onclick: function () {
                  return ui.confirm({ title: 'Remove the passcode?', message: 'The app will open without a passcode on this device.', confirm: 'Remove', danger: true })
                    .then(function (ok) { if (ok) return busy('pass', EV.auth.clearPasscode(st.cur).then(function () { st.cur = st.pass = st.pass2 = ''; }), 'Passcode removed'); });
                } }) : null),
              h('p.field-hint', { key: 'n' }, 'The passcode is an app lock. Data protection at rest relies on the device\'s own encryption — keep the device passcode enabled.')
            ]),

          ui.card({ key: 'sync', title: 'Cloud sync' },
            sy.enabled || cfg.mode === 'supabase' ? [
              h('div.kv-list', { key: 'k' }, ui.kv('Workspace', (cfg.supabase || {}).url, { mono: true }), ui.kv('Signed in as', sy.user || 'Not signed in'), ui.kv('Status', sy.running ? 'Synchronising…' : sy.error ? 'Error: ' + sy.error : sy.pending ? sy.pending + ' changes queued' : 'Up to date'),
                ui.kv('Last synchronised', sy.lastSyncAt ? U.fmtDateTime(sy.lastSyncAt) : 'Never'), ui.kv('Conflicts held for review', String(conflicts.length))),
              h('div.btn-row.wrap', { key: 'b' }, ui.btn('Sync now', { icon: 'refresh', disabled: sy.running || !sy.enabled, onclick: function () { return EV.sync.run(); } }),
                sy.user ? ui.btn('Sign out', { kind: 'ghost', icon: 'log-out', onclick: function () { return EV.sync.signOut(); } }) : null,
                ui.btn('Disconnect workspace', { kind: 'ghost-danger', onclick: function () {
                  ui.confirm({ title: 'Disconnect the cloud workspace?', message: 'Records stay on this device. Queued changes are kept and will be sent if you reconnect.', confirm: 'Disconnect', danger: true }).then(function (ok) { if (ok) return EV.sync.disconnect(); });
                } })),
              h('p.field-hint', { key: 'd' }, 'Demo data is never synchronised.')
            ] : EV.env.hosted ? [
              h('p.muted', { key: 'p' }, 'Not available in this hosted demonstration copy. Records stay in this browser and leave it only in a file that you save yourself.'),
              ui.note('info', 'Shared synchronisation exists only in a site built for one approved workspace. See docs/DEPLOYMENT.md and docs/SECURITY.md in the source package.', { key: 'n' })
            ] : EV.sync.deviceOnlyBuild() ? [
              h('p.muted', { key: 'p' }, 'Off. Records are stored on this device only and leave it only through an export or a backup that you save yourself.'),
              ui.note('ok', 'This is a device-only build. Its security policy makes the browser refuse every connection to any other server, so nothing can be transmitted from it.', { key: 'n', title: 'No outside connections' }),
              h('p.field-hint', { key: 'h' }, 'To share a workspace between auditors, an administrator rebuilds the site for one approved Supabase project (PostgreSQL with row-level security and a private photograph bucket). See docs/DEPLOYMENT.md and docs/SECURITY.md in the source package.')
            ] : [
              h('p.muted', { key: 'p' }, 'Off. Records are stored on this device only and leave it only through an export. This build may connect to ' + (EV.sync.policy().origins.join(', ') || 'an approved Supabase workspace') + ' (PostgreSQL with row-level security and a private photograph bucket).'),
              h('div.form-grid', { key: 'g' },
                ui.field('Workspace URL', ui.input(st.url || (st.url = EV.sync.policy().origins[0] || ''), { id: 'sync-url', mono: true, ph: 'https://<project>.supabase.co', oninput: function (v) { st.url = v; } })),
                ui.field('Publishable (anon) key', ui.input(st.key, { id: 'sync-key', mono: true, ph: 'Public key — never a service-role key', oninput: function (v) { st.key = v; } }))),
              st.err ? ui.note('danger', st.err, { key: 'e' }) : null,
              h('div.btn-row', { key: 'b' }, ui.btn(st.busy === 'connect' ? 'Checking…' : 'Connect workspace', { icon: 'cloud', disabled: !st.url || !st.key || st.busy === 'connect', onclick: function () {
                st.err = ''; st.busy = 'connect';
                return EV.sync.connectSupabase(st.url, st.key).then(function () { st.busy = ''; st.key = ''; EV.toast('Workspace connected — sign in to start synchronising', 'ok'); }, function (e) { st.busy = ''; st.err = e.message || String(e); });
              } })),
              ui.note('info', 'Connect a workspace only after the hosting and the database have been approved through the client\'s security review. See docs/SECURITY.md and docs/DEPLOYMENT.md in the source package.', { key: 'n' })
            ]),
          conflicts.length ? ui.card({ key: 'conf', title: 'Sync conflicts held for review' },
            h('p.muted', null, 'Another device saved a newer version of these records. The newer version was applied; your displaced version is kept here.'),
            h('div.list', null, conflicts.map(function (c) {
              return h('div.row', { key: c.id }, h('span.row-main', null, h('span.row-title', null, (S.T[c.table] || {}).label + ' ' + (c.local.code || '') + ' ' + S.title(c.table, c.local)),
                h('span.row-sub', null, 'Your version ' + U.fmtDateTime(c.local.updated_at) + ' · replaced by ' + (c.remote_updated_by || 'another auditor') + ' ' + U.fmtDateTime(c.remote_updated_at))),
                h('span.row-right', null, ui.btn('Restore mine', { sm: true, onclick: function () { EV.sync.restoreConflict(c.id); EV.toast('Your version was restored and queued for sync'); } }), ui.btn('Dismiss', { sm: true, kind: 'ghost', onclick: function () { EV.sync.dismissConflict(c.id); } })));
            }))) : null),

        h('div.stack.stack-lg', null,
          ui.card({ key: 'data', title: 'Data on this device' },
            sv.memoryOnly ? ui.note('danger', sv.error) : null,
            h('div.kv-list', null,
              ui.kv('Storage', sv.memoryOnly ? 'Memory only — not persistent' : 'IndexedDB on this device'),
              ui.kv('Last write confirmed', sv.lastSavedAt ? U.fmtDateTime(sv.lastSavedAt) : 'No changes this session'),
              ui.kv('Protected from automatic clearing', sv.persisted === true ? 'Yes' : sv.persisted === false ? 'Not granted' : 'Unknown'),
              st.est && st.est.usage != null ? ui.kv('Space used', U.bytes(st.est.usage) + (st.est.quota ? ' of ' + U.bytes(st.est.quota) : '')) : null,
              ui.kv('Records', counts)),
            sv.persisted === false ? ui.note('warn', 'The browser may clear this site\'s data if the device runs low on space or the site is unused for a long time. Install the app to the home screen, request protected storage, and export daily.',
              { action: h('div.btn-row', null, ui.btn('Request protected storage', { sm: true, onclick: function () { return store.requestPersistence().then(function (ok) { EV.toast(ok ? 'Storage is now protected' : 'Not granted. Installing to the home screen usually enables it.', ok ? 'ok' : 'warn', 5000); }); } })) }) : null,
            h('div.btn-row.wrap', null,
              ui.btn(st.busy === 'backup' ? 'Building backup…' : 'Download full backup (.zip)', { icon: 'download', disabled: !!st.busy, onclick: function () { return busy('backup', fullBackup()); } }),
              h('label.btn.btn-secondary.capture', { 'for': 'restore-file', role: 'button' }, icon('upload', 17), h('span', null, st.busy === 'restore' ? 'Restoring…' : 'Restore from backup'),
                h('input', { id: 'restore-file', type: 'file', accept: '.zip,.json,application/zip,application/json', 'class': 'file-input', tabindex: '-1', onchange: function (e) {
                  const f = e.target.files && e.target.files[0]; e.target.value = '';
                  if (!f) return undefined;
                  return busy('restore', restoreFrom(f), function (r) { return 'Restored ' + r.records + ' records and ' + r.blobs + ' image files. Newer local records were kept.'; });
                } }))),
            h('p.field-hint', null, 'A full backup contains every record and every photograph, for moving to another device or as a safety copy. It is not the daily export package.')),

          !EV.seed && !store.hasDemo() ? null : ui.card({ key: 'demo', title: 'Demo data' },
            store.hasDemo() ? [h('p.muted', { key: 'p' }, 'The synthetic demo environment is loaded. Every demo record is labelled and uses documentation-reserved addresses and “DEMO-” identifiers.'),
              h('div.btn-row', { key: 'b' }, ui.btn(st.busy === 'demo' ? 'Removing…' : 'Remove all demo data', { kind: 'danger', icon: 'trash', disabled: !!st.busy, onclick: function () {
                /* Anything of the auditor's own that was created inside the demo building (an audit of a demo room, a
                   device added to one, its photographs) cannot exist without it, so it is listed and removed too. */
                const plan = EV.act.demoRemovalPlan();
                const own = {};
                plan.own.forEach(function (x) { const l = (S.T[x.table] || {}).label || x.table; own[l] = (own[l] || 0) + 1; });
                const ownText = Object.keys(own).map(function (l) { return own[l] + ' × ' + l.toLowerCase(); }).join(', ');
                ui.confirm({ title: 'Remove all demo data?', confirm: 'Remove demo data', danger: true,
                  message: 'Every record labelled DEMO, including its photographs, is permanently removed from this device.' + (plan.own.length
                    ? ' ' + U.plural(plan.own.length, 'record') + ' of your own that were created inside the demo environment cannot exist without it and will be removed too (' + ownText + '). Everything else you created is kept.'
                    : ' Records you created yourself are not affected.') })
                  .then(function (ok) { if (ok) return busy('demo', EV.act.removeDemo(), function (r) { return r.demo + ' demo records removed' + (r.own ? ', plus ' + r.own + ' of your own inside the demo environment' : ''); }); });
              } }))]
              : [h('p.muted', { key: 'p' }, 'No demo data is loaded.'),
                !EV.seed ? null : cfg.mode === 'supabase' ? h('p.field-hint', { key: 'h' }, 'The demo environment cannot be loaded while a cloud workspace is connected: demo records are never synchronised, and real records must not depend on them.')
                  : h('div.btn-row', { key: 'b' }, ui.btn(st.busy === 'demo' ? 'Loading…' : 'Load demo environment', { icon: 'plus', disabled: !!st.busy, onclick: function () {
                    store.kvSet('demo_loaded', false);
                    return busy('demo', EV.seed.load(), 'Demo environment loaded');
                  } }))]),

          dismissed.length ? ui.card({ key: 'ins', title: 'Dismissed suggestions' },
            h('p.muted', null, U.plural(dismissed.length, 'suggestion') + ' dismissed.'),
            h('div.btn-row', null, ui.btn('Restore all', { onclick: function () { dismissed.forEach(function (d) { store.update('insight_states', d.id, { state: 'active' }); }); EV.toast('Suggestions restored'); } }))) : null,

          ui.card({ key: 'install', title: 'Use on iPhone' },
            h('ol.plain.numbered', null, ['Open this address in Safari.', 'Tap Share, then “Add to Home Screen”.',
              'Always open the app from the home-screen icon. It runs full screen and, once it has been opened there with a connection, opens without one. The installed app keeps its own records, separate from the Safari tab — set it up and work only there.',
              'Under “Data on this device”, check that storage is protected from automatic clearing; if it is not, tap “Request protected storage”. Export every day regardless.',
              'Allow camera access when first taking a photograph.'].map(function (s, i) { return h('li', { key: 'i' + i }, s); })),
            h('p.field-hint', null, EV.env.hosted ? 'This is the hosted demonstration copy. The steps above apply to the application served from its own approved web address: offline use and home-screen installation are not available here.'
              : EV.env.embedded ? 'This copy is running inside a hosted frame: offline use and home-screen installation are available only from a dedicated web address.' : EV.env.standalone ? 'Running as an installed app.' : 'Running in a browser tab.')),

          ui.card({ key: 'about', title: 'About and approvals' },
            h('div.kv-list', null, ui.kv('Application', EV.APP.short), ui.kv('Version', EV.APP.version + ' (' + EV.APP.build + ')'), ui.kv('Export package format', EV.APP.exportFormat),
              ui.kv('Third-party code', 'None — no external libraries, fonts or requests')),
            EV.env.hosted ? ui.note('info', 'This copy is published as a private page on claude.ai so that the application can be tried with its synthetic demo data. It is an evaluation build prepared for an AV audit engagement: it is not a client system, it has not been approved by any client, and it is not the deployment described in the documentation. What you enter here is stored in this browser only; other people who open the page do not see it.', { title: 'Demonstration copy' }) : null,
            ui.note('warn', 'Real client infrastructure information may be entered only after this application and its hosting have been approved through the client\'s security review.', { title: 'Approval required before production use' }),
            h('ul.plain.bullets', null, ['Documentation and audit tool only: it performs no network discovery, scanning or device configuration.', 'Nothing is read from photographs automatically; there is no OCR.',
              'No data is sent to any AI service. Uploading an export to Claude is a separate, deliberate step that needs the client\'s authorisation.'].concat(EV.seed || store.hasDemo() ? ['Seeded records are synthetic and labelled DEMO DATA.'] : [])
              .map(function (s, i) { return h('li', { key: 'i' + i }, s); }))),

          ui.card({ key: 'danger', title: 'Erase this device' },
            h('p.muted', null, 'Permanently deletes every record and photograph stored by this app in this browser. Export or back up first.'),
            h('div.btn-row', null, ui.btn('Erase all local data…', { kind: 'ghost-danger', icon: 'trash', onclick: function () {
              ui.prompt({ title: 'Erase all local data?', message: 'This cannot be undone. Type ERASE to confirm.', ph: 'ERASE', confirm: 'Erase everything', mono: true }).then(function (v) {
                if (v !== 'ERASE') { if (v != null) EV.toast('Nothing was erased.'); return; }
                /* the app restarts afterwards, so nothing held in memory (a generated export package, an open record)
                   outlives the erase; other open tabs are told to restart as well */
                return busy('erase', store.wipeAll().then(function () { return store.flush(); }).then(function () { EV.restart(); }));
              });
            } }))))),
    ];
  };
})();
