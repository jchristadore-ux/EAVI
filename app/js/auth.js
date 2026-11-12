/* auth.js — access gate.
 * Device-only mode: local auditor profile with an optional passcode lock (PBKDF2-SHA-256, 210k iterations, auto-lock).
 * Cloud mode: Supabase email/password sign-in (see sync.js); roles come from the server and are enforced by row-level security.
 * Claude-artifact hosting: access is the claude.ai sharing permission of the private artifact. */
(function () {
  'use strict';
  const EV = window.EV, h = EV.h, U = EV.U, store = EV.store, ui = EV.ui, icon = EV.icon;
  const auth = (EV.auth = {
    locked: false, lastActive: Date.now(),
    form: { name: '', email: '', demo: true, pass: '', pass2: '', busy: false, error: '' },
    unlock: { pass: '', error: '', busy: false },
    signin: { email: '', pass: '', error: '', busy: false }
  });

  function b64(buf) { let s = ''; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }
  function unb64(s) { const bin = atob(s); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
  async function derive(pass, salt, iterations) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt, iterations: iterations, hash: 'SHA-256' }, key, 256);
    return b64(bits);
  }
  auth.canLock = function () { return EV.env.subtle; };
  auth.hasLock = function () { return !!store.kvGet('lock'); };
  /* Changing or removing an existing passcode needs the current one: an unlocked device left unattended must not be
     enough to lock its owner out or to remove the lock. */
  auth.setPasscode = async function (pass, current) {
    if (!auth.canLock()) throw new Error('A passcode lock needs a secure (HTTPS) connection.');
    if (auth.hasLock() && !(await auth.verify(current || ''))) throw new Error('The current passcode is not correct.');
    if (!pass || pass.length < 6) throw new Error('Use at least 6 characters for the passcode.');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iterations = 210000;
    const hash = await derive(pass, salt, iterations);
    const prev = store.kvGet('lock') || {};
    store.kvSet('lock', { salt: b64(salt), hash: hash, iterations: iterations, autoLockMin: prev.autoLockMin || 15 });
    await store.flush();
  };
  auth.clearPasscode = async function (current) {
    if (auth.hasLock() && !(await auth.verify(current || ''))) throw new Error('The current passcode is not correct.');
    store.kvDel('lock'); auth.locked = false;
  };
  auth.setAutoLock = function (min) { const l = store.kvGet('lock'); if (l) store.kvSet('lock', Object.assign({}, l, { autoLockMin: min })); };
  auth.verify = async function (pass) {
    const l = store.kvGet('lock');
    if (!l) return true;
    return (await derive(pass, unb64(l.salt), l.iterations)) === l.hash;
  };
  auth.lock = function () { if (auth.hasLock()) { auth.locked = true; auth.unlock.pass = ''; auth.unlock.error = ''; EV.redraw(); } };
  auth.profile = function () { return store.kvGet('profile') || {}; };
  auth.setProfile = function (patch) {
    const p = Object.assign({}, auth.profile(), patch);
    store.kvSet('profile', p);
    store.readOnly = p.role === 'viewer';
  };
  function checkIdle() {
    const l = store.kvGet('lock');
    if (!l || auth.locked) return;
    if (Date.now() - auth.lastActive > (l.autoLockMin || 15) * 60000) { auth.locked = true; EV.redraw(); }
  }
  auth.init = function () {
    auth.locked = auth.hasLock();
    store.readOnly = auth.profile().role === 'viewer';
    /* the idle limit is checked before the clock is refreshed, so the first tap after a long pause locks instead of renewing */
    ['pointerdown', 'keydown'].forEach(function (ev) { document.addEventListener(ev, function () { checkIdle(); if (!auth.locked) auth.lastActive = Date.now(); }, true); });
    setInterval(checkIdle, 20000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) checkIdle(); });
  };

  /* The copy hosted as a page on claude.ai is a demonstration: it opens straight into the synthetic demo environment
     (clearly labelled) instead of asking a visitor to set up a device that will never hold real records. The auditor
     name can be changed in Settings. */
  auth.startHostedDemo = async function () {
    auth.setProfile({ name: 'Demo Auditor', email: '', role: 'lead_auditor' });
    if (EV.seed) await EV.seed.load();
    store.kvSet('onboarded', true);
    auth.locked = false;
    try { await store.flush(); } catch (e) { /* memory only: the demo still runs for this visit */ }
  };

  /* ------------------------------------------------------------------ brand */
  EV.brand = function (o) {
    o = o || {};
    /* the organization's name leads only when one has been set (Settings, or a connected workspace) */
    const org = store.kvGet('org_name') ? String(store.kvGet('org_name')).toUpperCase() : '';
    return h('div', { 'class': U.cx('brand', o.stack && 'brand-stack', o.cls) },
      h('svg', { 'class': 'brand-mark', width: o.size || 26, height: o.size || 26, viewBox: '0 0 32 32', 'aria-hidden': 'true' },
        h('rect', { x: 1.5, y: 1.5, width: 29, height: 29, rx: 7, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, opacity: 0.55 }),
        h('rect', { x: 8, y: 9, width: 16, height: 2.6, rx: 1.3, 'class': 'bm-accent' }),
        h('rect', { x: 8, y: 14.7, width: 11, height: 2.6, rx: 1.3, fill: 'currentColor' }),
        h('rect', { x: 8, y: 20.4, width: 14, height: 2.6, rx: 1.3, fill: 'currentColor', opacity: 0.55 })),
      h('div.brand-text', null,
        h('span.brand-name', null, org || 'AV ENVIRONMENT INTELLIGENCE'),
        o.compact || !org ? null : h('span.brand-sep', { 'aria-hidden': 'true' }),
        o.compact || !org ? null : h('span.brand-product', null, 'AV ENVIRONMENT INTELLIGENCE')));
  };

  /* ------------------------------------------------------------------ gate screens */
  function shellCard(children, wide) {
    return h('div.gate', { key: 'gate' }, h('div', { 'class': U.cx('gate-card', wide && 'gate-wide') },
      EV.brand({ stack: true, size: 34 }),
      h('p.gate-tag', null, EV.APP.tagline),
      children));
  }
  function onboarding() {
    const f = auth.form;
    async function start() {
      f.error = '';
      if (!f.name.trim()) { f.error = 'Enter the auditor name that should appear on audits and reports.'; return; }
      if (f.pass || f.pass2) {
        if (f.pass !== f.pass2) { f.error = 'The two passcode entries do not match.'; return; }
        if (f.pass.length < 6) { f.error = 'Use at least 6 characters for the passcode.'; return; }
      }
      f.busy = true; EV.redraw();
      try {
        auth.setProfile({ name: f.name.trim(), email: f.email.trim(), role: 'lead_auditor' });
        if (f.pass) await auth.setPasscode(f.pass);   /* first set-up: there is no current passcode yet */
        await store.requestPersistence();
        if (f.demo && EV.seed) await EV.seed.load();   /* the demo environment exists only in the demonstration build */
        store.kvSet('onboarded', true);
        await store.flush();
        f.pass = f.pass2 = '';
        auth.locked = false;
      } catch (e) { f.error = e.message || String(e); }
      f.busy = false; EV.redraw();
    }
    return shellCard([
      h('h1.gate-title', null, 'Set up this device'),
      h('p.gate-text', null, 'Audit records are stored on this device and saved automatically. Nothing is sent anywhere unless you export it or connect an approved sync service.'),
      h('div.form-grid', null,
        ui.field('Auditor name', ui.input(f.name, { id: 'ob-name', ph: 'Name shown on audits and reports', caps: 'words', oninput: function (v) { f.name = v; } }), { req: true }),
        ui.field('Email (optional)', ui.input(f.email, { id: 'ob-email', type: 'email', ph: 'For report attribution', mono: true, oninput: function (v) { f.email = v; } })),
        auth.canLock() ? ui.field('Passcode lock (optional)', ui.input(f.pass, { id: 'ob-pass', type: 'password', ph: '6+ characters', mono: true, oninput: function (v) { f.pass = v; } }), { half: true,
          hint: 'Locks the app after inactivity. It cannot be recovered if forgotten.' }) : null,
        auth.canLock() ? ui.field('Repeat passcode', ui.input(f.pass2, { id: 'ob-pass2', type: 'password', mono: true, oninput: function (v) { f.pass2 = v; } }), { half: true }) : null,
        !EV.seed ? null : ui.field('Load the demo environment', ui.toggle(f.demo, { id: 'ob-demo', onchange: function (v) { f.demo = v; } }), { div: true, cls: 'field-toggle',
          hint: 'Synthetic building, rooms, devices and findings, clearly labelled DEMO DATA. Remove it any time in Settings.' })),
      f.error ? ui.note('danger', f.error) : null,
      ui.note('info', 'Enter real client infrastructure information only after this application and its hosting have been approved through the client\'s security review.', { title: 'Approval required before production use' }),
      ui.btn(f.busy ? 'Preparing…' : 'Start', { kind: 'primary', lg: true, block: true, disabled: f.busy, id: 'ob-start', onclick: start })
    ], true);
  }
  function lockScreen() {
    const u = auth.unlock;
    async function tryUnlock() {
      if (!u.pass || u.busy) return;
      u.busy = true; u.error = ''; EV.redraw();
      try {
        if (await auth.verify(u.pass)) { auth.locked = false; auth.lastActive = Date.now(); u.pass = ''; }
        else u.error = 'That passcode is not correct.';
      } catch (e) { u.error = e.message || String(e); }
      u.busy = false; EV.redraw();
    }
    return shellCard([
      h('h1.gate-title', null, icon('lock', 18), ' Locked'),
      h('p.gate-text', null, 'Enter the passcode for ' + (auth.profile().name || 'this device') + '.'),
      ui.field('Passcode', ui.input(u.pass, { id: 'lock-pass', type: 'password', mono: true, oninput: function (v) { u.pass = v; }, onkeydown: function (e) { if (e.key === 'Enter') return tryUnlock(); } })),
      u.error ? ui.note('danger', u.error) : null,
      ui.btn(u.busy ? 'Checking…' : 'Unlock', { kind: 'primary', lg: true, block: true, disabled: u.busy, id: 'lock-unlock', onclick: tryUnlock }),
      h('p.gate-fine', null, 'A forgotten passcode cannot be recovered. The only reset is to erase this device\'s local data.'),
      ui.btn('Erase local data…', { kind: 'ghost-danger', sm: true, onclick: function () {
        ui.confirm({ title: 'Erase all data on this device?', message: 'Every audit record and photograph stored in this browser will be permanently deleted. Records already exported or synced are not affected.', confirm: 'Erase everything', danger: true })
          .then(function (ok) {
            if (!ok) return;
            /* the app is restarted afterwards, so nothing that was in memory (an export package, an open record) outlives the erase */
            return store.wipeAll().then(function () { store.kvDel('lock'); store.kvDel('onboarded'); store.kvDel('profile'); auth.locked = false; return store.flush(); }).then(function () { EV.restart(); });
          });
      } })
    ]);
  }
  function signIn() {
    const s = auth.signin;
    async function go() {
      if (s.busy) return;
      s.busy = true; s.error = ''; EV.redraw();
      try { await EV.sync.signIn(s.email.trim(), s.pass); s.pass = ''; }
      catch (e) { s.error = e.message || String(e); }
      s.busy = false; EV.redraw();
    }
    return shellCard([
      h('h1.gate-title', null, 'Sign in'),
      h('p.gate-text', null, 'This deployment uses a secured cloud workspace. Sign in with your audit account.'),
      ui.field('Email', ui.input(s.email, { id: 'si-email', type: 'email', mono: true, oninput: function (v) { s.email = v; } })),
      ui.field('Password', ui.input(s.pass, { id: 'si-pass', type: 'password', mono: true, oninput: function (v) { s.pass = v; }, onkeydown: function (e) { if (e.key === 'Enter') return go(); } })),
      s.error ? ui.note('danger', s.error) : null,
      ui.btn(s.busy ? 'Signing in…' : 'Sign in', { kind: 'primary', lg: true, block: true, disabled: s.busy, onclick: go }),
      h('p.gate-fine', null, 'Accounts are created by the workspace administrator. Records already on this device stay available offline after the first sign-in.'),
      /* Until someone has signed in on this device the connection can be cancelled, so a mistyped workspace or a
         missing account never locks the auditor out of the records already here. After the first sign-in it cannot. */
      !EV.sync.config().org_id ? ui.btn('Cancel the workspace connection', { kind: 'ghost', sm: true, onclick: function () {
        return ui.confirm({ title: 'Cancel the workspace connection?', message: 'This device goes back to device-only mode. Records already on it stay here; nothing is synchronised.', confirm: 'Cancel connection', cancel: 'Keep it' })
          .then(function (ok) { if (ok) return EV.sync.disconnect(); });
      } }) : null
    ]);
  }
  auth.gate = function () {
    if (EV.sync && EV.sync.needsSignIn && EV.sync.needsSignIn()) return signIn();
    if (!store.kvGet('onboarded')) return onboarding();
    if (auth.locked) return lockScreen();
    return null;
  };
})();
