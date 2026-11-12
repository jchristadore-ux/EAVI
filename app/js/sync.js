/* sync.js — optional cloud synchronisation (off by default).
 * The device database is always the working copy. When a workspace is connected, changes are queued in an outbox,
 * pushed when online, and remote changes are pulled with keyset pagination. Conflicting edits are never merged
 * silently: the newer record wins and the displaced local version is kept for review.
 * Adapter: Supabase (PostgreSQL + Auth + Storage) over its REST API — no SDK, no third-party code.
 * Demo data never leaves the device. */
(function () {
  'use strict';
  const EV = window.EV, U = EV.U, S = EV.S, store = EV.store;
  const SKIP = { organizations: 1, profiles: 1 };
  const TABLES = S.TABLES.filter(function (t) { return !SKIP[t]; });
  const BUCKET = 'audit-photos';
  const sync = (EV.sync = { running: false, error: null, adapter: null, lastSyncAt: null, timer: 0 });

  function cfg() { return store.kvGet('sync') || { mode: 'off' }; }
  function saveCfg(patch) { const c = Object.assign({}, cfg(), patch); store.kvSet('sync', c); return c; }
  sync.config = cfg;
  /* store.syncEnabled = "queue every change for the workspace" (on from the first sign-in, also while signed out);
     enabled() = "synchronisation can run now" (additionally needs a signed-in session for a real workspace). */
  sync.enabled = function () { return !!sync.adapter && store.syncEnabled && (sync.adapter.label !== 'Supabase workspace' || !!cfg().session); };
  sync.needsSignIn = function () { const c = cfg(); return c.mode === 'supabase' && !c.session; };
  sync.conflicts = function () { return store.kvGet('sync_conflicts') || []; };
  sync.status = function () {
    const c = cfg();
    return { enabled: sync.enabled(), label: c.mode === 'supabase' ? 'Supabase workspace' : sync.adapter ? (sync.adapter.label || 'Workspace') : 'Off', pending: sync.pendingCount(), error: sync.error,
      lastSyncAt: sync.lastSyncAt || c.lastSyncAt || null, running: sync.running, conflicts: sync.conflicts().length, user: c.session && c.session.user ? c.session.user.email : null };
  };
  sync.pendingCount = function () {
    if (store.readOnly) return 0;   /* a read-only account has nothing of its own to send */
    let n = 0;
    store.outbox.list().forEach(function (e) { const r = store.getAny(e.table, e.rid); if (r && !r.is_demo && !SKIP[e.table]) n++; });
    return n;
  };

  /* ------------------------------------------------------------------ Supabase REST adapter */
  function supabaseAdapter() {
    const base = function () { return String(cfg().supabase.url).replace(/\/+$/, ''); };
    const key = function () { return cfg().supabase.anonKey; };
    async function fail(res) {
      let msg = res.status + ' ' + res.statusText;
      try { const j = await res.json(); msg = j.message || j.msg || j.error_description || j.error || msg; } catch (e) { /* not JSON */ }
      const err = new Error(msg); err.status = res.status;
      throw err;
    }
    async function refresh() {
      const s = cfg().session;
      if (!s || !s.refresh_token) throw new Error('Not signed in.');
      const res = await fetch(base() + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: key(), 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh_token }) });
      if (!res.ok) { if (res.status === 400 || res.status === 401) saveCfg({ session: null }); await fail(res); }
      const j = await res.json();
      saveCfg({ session: { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (j.expires_in || 3600), user: { id: j.user.id, email: j.user.email } } });
    }
    async function token() {
      const s = cfg().session;
      if (!s) throw new Error('Not signed in.');
      if (s.expires_at - 90 < Date.now() / 1000) await refresh();
      return cfg().session.access_token;
    }
    async function call(path, opts) {
      opts = opts || {};
      const headers = Object.assign({ apikey: key(), Authorization: 'Bearer ' + (await token()) }, opts.headers || {});
      if (opts.json !== undefined) headers['Content-Type'] = 'application/json';
      const res = await fetch(base() + path, { method: opts.method || 'GET', headers: headers, body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.body });
      if (!res.ok) await fail(res);
      return res;
    }
    return {
      label: 'Supabase workspace',
      signIn: async function (email, password) {
        const res = await fetch(base() + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: key(), 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email, password: password }) });
        if (!res.ok) await fail(res);
        const j = await res.json();
        saveCfg({ session: { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (j.expires_in || 3600), user: { id: j.user.id, email: j.user.email } } });
        return j.user;
      },
      /* scope=local: only this device is signed out; the same account stays signed in on its other devices */
      signOut: async function () { try { await call('/auth/v1/logout?scope=local', { method: 'POST' }); } catch (e) { /* local sign-out proceeds regardless */ } },
      membership: async function () {
        const uid = cfg().session.user.id;
        const res = await call('/rest/v1/org_members?select=org_id,role,full_name,created_at,organizations(name,short_code)&user_id=eq.' + encodeURIComponent(uid) + '&order=created_at.asc,org_id.asc');
        return res.json();
      },
      /* Returns the ids the database actually wrote. A row the database declined (it already holds a later version of
         it) is absent from the answer, which is how the caller tells "sent" from "applied". */
      upsert: async function (table, rows) {
        const applied = [];
        for (let i = 0; i < rows.length; i += 200) {
          const res = await call('/rest/v1/' + table + '?on_conflict=id&select=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, json: rows.slice(i, i + 200) });
          const back = await res.json();
          (Array.isArray(back) ? back : []).forEach(function (r) { applied.push(r.id); });
        }
        return applied;
      },
      /* keyset pagination on (server_updated_at, id) so rows sharing a timestamp are never skipped; always limited to
         the one organization this device belongs to */
      fetchSince: async function (table, cursor, limit) {
        const ts = encodeURIComponent(cursor.ts), id = cursor.id || '00000000-0000-0000-0000-000000000000';
        const res = await call('/rest/v1/' + table + '?select=*&org_id=eq.' + encodeURIComponent(cfg().org_id) + '&or=(server_updated_at.gt.' + ts + ',and(server_updated_at.eq.' + ts + ',id.gt.' + id + '))&order=server_updated_at.asc,id.asc&limit=' + limit);
        return res.json();
      },
      fetchByIds: async function (table, ids) {
        const out = [];
        for (let i = 0; i < ids.length; i += 60) {
          const res = await call('/rest/v1/' + table + '?select=*&org_id=eq.' + encodeURIComponent(cfg().org_id) + '&id=in.(' + ids.slice(i, i + 60).map(encodeURIComponent).join(',') + ')');
          (await res.json()).forEach(function (r) { out.push(r); });
        }
        return out;
      },
      uploadPhoto: async function (path, bytes, mime) {
        await call('/storage/v1/object/' + BUCKET + '/' + path, { method: 'POST', headers: { 'x-upsert': 'true', 'Content-Type': mime || 'image/jpeg' }, body: bytes });
        return path;
      },
      downloadPhoto: async function (path) {
        const res = await call('/storage/v1/object/authenticated/' + BUCKET + '/' + path);
        return res.blob();
      },
      probe: async function (url, anonKey) {
        const res = await fetch(String(url).replace(/\/+$/, '') + '/auth/v1/settings', { headers: { apikey: anonKey } });
        if (!res.ok) await fail(res);
        return true;
      }
    };
  }

  /* ------------------------------------------------------------------ what this build is allowed to reach
   * The page's Content-Security-Policy decides which outside origins the browser will talk to. A device-only build
   * allows none (connect-src 'self'); a sync-enabled build names exactly one workspace origin, added at build time by
   * tools/build.ps1 -SyncOrigin. The application reads that policy so it can say so plainly instead of failing. */
  sync.parsePolicy = function (content) {
    if (content == null) return { known: false, any: false, origins: [] };   /* set by the host (HTTP header) or absent */
    const m = /(?:^|;)\s*connect-src\s+([^;]*)/i.exec(String(content));
    const src = m ? m[1].trim().split(/\s+/) : [];
    return { known: true, any: src.indexOf('https:') >= 0 || src.indexOf('*') >= 0,
      origins: src.filter(function (s) { return /^https:\/\/[^*\s]+$/.test(s); }).map(function (s) { return s.replace(/\/+$/, ''); }) };
  };
  sync.policy = function () {
    let content = null;
    try { const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]'); content = meta ? meta.getAttribute('content') : null; } catch (e) { content = null; }
    return sync.parsePolicy(content);
  };
  sync.deviceOnlyBuild = function (policy) { const p = policy || sync.policy(); return p.known && !p.any && !p.origins.length; };
  sync.buildAllows = function (url, policy) {
    const p = policy || sync.policy();
    if (!p.known || p.any) return true;
    try { return p.origins.indexOf(new URL(url).origin) >= 0; } catch (e) { return false; }
  };
  /* Legacy Supabase keys are JWTs whose payload names the role; newer keys are prefixed sb_publishable_ / sb_secret_. */
  sync.keyRole = function (k) {
    k = String(k || '');
    if (/^sb_secret_/i.test(k) || /service_role/i.test(k)) return 'service_role';
    const parts = k.split('.');
    if (parts.length === 3) {
      try { return String(JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))).role || ''); } catch (e) { return ''; }
    }
    return '';
  };

  /* ------------------------------------------------------------------ connection management */
  sync.connectSupabase = async function (url, anonKey) {
    url = String(url || '').trim().replace(/\/+$/, ''); anonKey = String(anonKey || '').trim();
    if (!/^https:\/\/[^\s/]+$/.test(url)) throw new Error('Enter the workspace address only, starting with https:// (for example https://project.supabase.co).');
    if (anonKey.length < 20) throw new Error('Enter the workspace publishable (anon) key.');
    if (sync.keyRole(anonKey) === 'service_role') throw new Error('That is a secret (service-role) key. It bypasses every access rule and must never be entered in a browser — use the publishable (anon) key.');
    if (!sync.buildAllows(url)) {
      const allowed = sync.policy().origins;
      throw new Error(allowed.length
        ? 'This build is restricted to the approved workspace ' + allowed.join(', ') + '. Enter that address, or have the site rebuilt for a different approved workspace.'
        : 'This build is device-only: its security policy blocks every outside connection, so no workspace can be connected. An administrator enables sync by rebuilding the site for the approved workspace (docs/DEPLOYMENT.md).');
    }
    if (store.hasDemo()) throw new Error('Remove the demo data first (Settings → Demo data). Demo records are never synchronised, and real records must not depend on them.');
    let blocked = false;
    const onViolation = function (e) { if (/connect-src/.test((e && (e.effectiveDirective || e.violatedDirective)) || '')) blocked = true; };
    document.addEventListener('securitypolicyviolation', onViolation);
    try { await supabaseAdapter().probe.call(null, url, anonKey); }
    catch (e) {
      if (blocked) throw new Error('The security policy of this site blocked the connection to that address. Sync must be enabled for an approved workspace when the site is built (docs/DEPLOYMENT.md).');
      if (e && e.status) throw new Error('The workspace refused the key (' + (e.message || e.status) + '). Check the address and the publishable key.');
      throw new Error('The workspace could not be reached. Check the address and the connection.');
    }
    finally { document.removeEventListener('securitypolicyviolation', onViolation); }
    saveCfg({ mode: 'supabase', supabase: { url: url, anonKey: anonKey }, session: null, cursors: {}, org_id: null, role: null });
    sync.adapter = supabaseAdapter();
    store.syncEnabled = false;
    EV.redraw();
  };
  sync.disconnect = async function () {
    if (sync.adapter && sync.adapter.signOut && cfg().session) await sync.adapter.signOut();
    saveCfg({ mode: 'off', session: null });
    sync.adapter = null; store.syncEnabled = false; sync.error = null;
    EV.redraw();
  };
  sync.signIn = async function (email, password) {
    if (!email || !password) throw new Error('Enter your email and password.');
    const a = sync.adapter || (sync.adapter = supabaseAdapter());
    const user = await a.signIn(email, password);
    /* The session counts only once membership of a workspace organization is confirmed: any failure here signs out again. */
    let rows;
    try { rows = await a.membership(); } catch (e) { saveCfg({ session: null }); throw e; }
    if (!rows || !rows.length) { saveCfg({ session: null }); throw new Error('This account is not a member of an audit workspace. Ask the workspace administrator to add you.'); }
    /* A device belongs to one organization. Once it holds that organization's records it stays with it, whichever
       account signs in; an account with several memberships starts with its earliest one. */
    const adopted = cfg().org_id;
    const m = adopted ? rows.find(function (r) { return r.org_id === adopted; }) : rows[0];
    if (!m) { saveCfg({ session: null }); throw new Error('This device holds the records of another organization in this workspace. Sign in with an account that belongs to it, or erase this device first (Settings).'); }
    saveCfg({ org_id: m.org_id, role: m.role });
    if (!adopted) sync.adoptOrg(m.org_id);
    if (m.organizations && m.organizations.name) store.kvSet('org_name', m.organizations.name);
    if (m.organizations && m.organizations.short_code) store.kvSet('org_code', m.organizations.short_code);
    EV.auth.setProfile({ name: m.full_name || EV.auth.profile().name || user.email, email: user.email, role: m.role || 'auditor' });
    if (!store.kvGet('onboarded')) store.kvSet('onboarded', true);
    store.syncEnabled = true;
    /* Only the first sign-in after connecting sends what was already on the device. A later sign-in must not: records
       that came from the workspace would be sent back unchanged, and every one edited elsewhere meanwhile would be
       mistaken for a conflict. A viewer sends nothing at all. */
    if (!adopted && m.role !== 'viewer') store.outbox.markAll();
    sync.run();
    return user;
  };
  sync.signOut = async function () {
    if (sync.adapter && sync.adapter.signOut) await sync.adapter.signOut();
    saveCfg({ session: null });
    EV.redraw();   /* changes keep being queued (store.syncEnabled stays on) and are sent after the next sign-in */
  };
  /* Records created before the first sign-in carry this device's own provisional organization id: they move to the
     workspace organization. A record that already belongs to an organization is never relabelled. */
  sync.adoptOrg = function (orgId) {
    const old = store.orgId();
    if (old === orgId) return;
    store.kvSet('org_id', orgId);
    TABLES.forEach(function (t) { store.raw(t).forEach(function (r) { if (!r.org_id || r.org_id === old) store.applyRemote(t, Object.assign({}, r, { org_id: orgId })); }); });
  };
  /* Test hook: run the engine against any object implementing upsert / fetchSince / uploadPhoto / downloadPhoto. */
  sync.useAdapter = function (adapter) { sync.adapter = adapter; store.syncEnabled = !!adapter; if (adapter) store.outbox.markAll(); };

  /* ------------------------------------------------------------------ engine */
  /* Local records are schemaless objects; the database columns are typed. Only lossless conversions are made here
     (an unset flag is false, a numeric string is a number, an empty non-text value is null). Anything else is sent
     as it is, so the database rejects it and the error is shown instead of a value being altered silently. */
  function toColumn(c, v) {
    if (c.type === 'bool') return v === true || v === 'true';
    if (v === undefined || v === null) return null;
    if (c.type === 'text') return typeof v === 'string' ? v : (typeof v === 'object' ? JSON.stringify(v) : String(v));
    if (v === '') return null;
    if ((c.type === 'int' || c.type === 'num') && typeof v === 'string' && v.trim() !== '' && isFinite(Number(v))) return Number(v);
    return v;
  }
  function toRemote(table, r) {
    const out = {};
    S.COMMON_COLS.forEach(function (k) { out[k] = r[k] == null ? null : r[k]; });
    S.T[table].columns.forEach(function (c) { out[c.name] = toColumn(c, r[c.name]); });
    out.is_demo = false;
    return out;
  }
  sync.toRemote = toRemote;
  /* PostgreSQL answers a timestamp as "2026-11-12T10:05:00.123+00:00" (and drops trailing zeros); records on the device
     hold Date#toISOString, "2026-11-12T10:05:00.123Z". Versions are compared as text, so every timestamp that arrives
     is first brought to the device's own form. (The pull position keeps the server's exact text: see pull().) */
  function tsMs(v) { return typeof v === 'string' ? Date.parse(v.replace(/(\.\d{3})\d+/, '$1')) : NaN; }
  function isoZ(v) { const t = tsMs(v); return isNaN(t) ? v : new Date(t).toISOString(); }
  const TS_COMMON = { created_at: 1, updated_at: 1, deleted_at: 1 };
  function fromRemote(table, row) {
    const out = {};
    S.COMMON_COLS.forEach(function (k) { out[k] = TS_COMMON[k] && row[k] != null ? isoZ(row[k]) : row[k]; });
    S.T[table].columns.forEach(function (c) {
      const v = row[c.name];
      out[c.name] = v == null ? (c.type === 'text' ? '' : null) : (c.type === 'ts' ? isoZ(v) : v);
    });
    store.renameLegacy(table, out);   /* a row written by an earlier version */
    return out;
  }
  sync.fromRemote = fromRemote;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  /* The storage path of a photograph is always derived from the record's own ids, never read from a stored value. */
  function photoPath(photo, variant) { return photo.org_id + '/' + photo.id + '/' + (variant || 'original'); }
  /* Uploads whatever image files the workspace does not have yet. The upload can take a while, so the reference is
     merged into the record as it is afterwards: it may have been described, re-linked, edited or deleted meanwhile. */
  async function uploadPhotoFiles(a, r) {
    let again = false;
    if (!r.remote_ref) {
      const b = await store.blobGet(r.id);
      if (b) {
        const ref = await a.uploadPhoto(photoPath(r, 'original'), b.data, b.mime);
        r = Object.assign({}, store.getAny('photos', r.id) || r, { remote_ref: ref });
        store.applyRemote('photos', r);
      }
    }
    if (r.has_edit && !r.remote_edit_ref && !r.deleted_at) {
      const version = r.updated_at;
      const b2 = await store.blobGet(r.id + ':edit');
      if (b2) {
        const ref2 = await a.uploadPhoto(photoPath(r, 'edited'), b2.data, b2.mime);
        const cur = store.getAny('photos', r.id) || r;
        /* rotated or annotated again during the upload: that newer rendition still has to be sent, so the record gets
           no reference yet and stays queued for the next run */
        if (cur.updated_at === version) { r = Object.assign({}, cur, { remote_edit_ref: ref2 }); store.applyRemote('photos', r); }
        else { r = cur; again = !!cur.has_edit && !cur.deleted_at; }
      }
    }
    return { rec: r, again: again };
  }
  async function push() {
    const a = sync.adapter;
    /* A read-only account sends nothing. What is queued on the device stays queued (it may be the unsent work of an
       auditor who shares the device, or of this account before its role changed) and goes out with the next sign-in
       that is allowed to write. */
    if (store.readOnly) return;
    const byTable = U.groupBy(store.outbox.list(), function (e) { return e.table; });
    for (const table of TABLES) {
      const list = byTable.get(table);
      if (!list || !list.length) continue;
      const rows = [], sent = [];
      for (const e of list) {
        let r = store.getAny(table, e.rid);
        if (!r || r.is_demo) { store.outbox.remove(e.id); continue; }
        if (table === 'photos' && a.uploadPhoto && !r.deleted_at) {
          const up = await uploadPhotoFiles(a, r);
          /* edited again while its image was uploading: the row goes out with the next run, complete with the
             reference to the rendition it then has (a row is never sent ahead of the image it describes) */
          if (up.again) continue;
          r = up.rec;
        }
        rows.push(toRemote(table, r));
        sent.push({ entry: store.outbox.get(e.id) || e, version: r.updated_at });
      }
      if (!rows.length) continue;
      const applied = await a.upsert(table, rows);
      const written = Array.isArray(applied) ? new Set(applied) : null;   /* null: this adapter cannot tell, so "sent" is taken as "applied" */
      const declined = [];
      sent.forEach(function (s) {
        if (written && !written.has(s.entry.rid)) { declined.push(s.entry.rid); return; }
        const cur = store.outbox.get(s.entry.id);
        if (!cur) return;
        /* cleared only if the record was not changed again while the request was in flight; otherwise that newer
           change stays queued, and it is now based on the version that was just sent */
        if (cur.at === s.entry.at) store.outbox.remove(cur.id); else store.outbox.rebase(cur.id, s.version);
      });
      /* The workspace declined these rows because it holds a later version. Fetch what it holds and handle it like any
         other incoming change, so the local edit is kept for review instead of being counted as sent. */
      if (declined.length && a.fetchByIds) (await a.fetchByIds(table, declined)).forEach(function (row) { reconcile(table, row); });
    }
  }
  /* Displaced local versions wait here until the auditor restores or dismisses them. The list is bounded; if it ever
     fills up, the oldest version makes room — and that is written to the change history, never done silently. */
  const MAX_CONFLICTS = 500;
  function keepConflict(table, local, remote) {
    let list = sync.conflicts();
    while (list.length >= MAX_CONFLICTS) {
      const old = list[0];
      store.log({ action: 'conflict_discarded', entity_type: old.table, entity_id: old.record_id, entity_code: (old.local && old.local.code) || '',
        summary: 'An unreviewed sync conflict from ' + String(old.at || '').slice(0, 10) + ' was discarded: more than ' + MAX_CONFLICTS + ' displaced versions were waiting for review' });
      list = list.slice(1);
    }
    list = list.concat([{ id: U.uid(), table: table, record_id: local.id, at: U.now(), local: local, remote_updated_at: remote.updated_at, remote_updated_by: remote.updated_by }]);
    store.kvSet('sync_conflicts', list);
  }
  /* the same content apart from who saved it and when */
  function sameContent(table, a, b) {
    if (!!a.deleted_at !== !!b.deleted_at) return false;
    const norm = function (v) { return v == null || v === '' || v === false ? '' : JSON.stringify(v); };
    return S.T[table].columns.every(function (c) { return norm(a[c.name]) === norm(b[c.name]); });
  }
  /* Rows a device regenerates by rule, or only ever appends: the later version stands and there is nothing to review. */
  const NO_REVIEW = { followups: 1, insight_states: 1, activity_log: 1 };
  /* Human-readable record IDs are issued per device, so two devices working offline can issue the same one. The
     permanent key is the UUID; when the clash is discovered, the record the workspace has never received gets the
     next free ID, and the change is logged. */
  function resolveCodeClash(table, remote) {
    if (!S.T[table].code || !remote.code || remote.deleted_at) return;
    store.raw(table).forEach(function (r) {
      if (r.id === remote.id || r.code !== remote.code || r.deleted_at) return;
      const e = store.outbox.get(table + ':' + r.id);
      if (!e || e.base != null) return;
      const next = store.nextCode(table);
      const rec = store.update(table, r.id, { code: next }, { silent: true });
      store.log({ action: 'renumbered', table: table, rec: rec, changes: [{ f: 'code', from: remote.code, to: next }],
        summary: 'Record ID changed from ' + remote.code + ' to ' + next + ' — ' + remote.code + ' had already been issued on another device' });
    });
  }
  /* A photograph changed on another device: the rotated / annotated rendition cached here is out of date. Drop it;
     the current one is fetched from the workspace the next time the photograph is opened. The original never changes. */
  function dropStaleEdit(table, local, remote) {
    /* only when the rendition itself changed (every edit and every revert produces a new thumbnail) — not when the
       other device merely changed the description or a link */
    if (table === 'photos' && (local.thumb !== remote.thumb || !!local.has_edit !== !!remote.has_edit)) store.blobDelete(remote.id + ':edit').catch(function () { /* nothing cached */ });
    /* deleted on another device: its image files go from this device too */
    if (table === 'photos' && remote.deleted_at && !local.deleted_at) store.dropPhotoFiles(remote.id);
  }
  /* One row arriving from the workspace. Which version stands is decided by what each side's change was BASED ON,
   * never by comparing device clocks:
   *   - nothing unsent here                          -> the workspace version is taken;
   *   - unsent change, workspace still on its base   -> the local change stands and will be sent;
   *   - unsent change, workspace has moved on        -> both were changed. The workspace version is applied and the
   *                                                     local one is kept under "Sync conflicts" for the auditor to
   *                                                     review or restore. Nothing is merged or dropped silently. */
  function reconcile(table, row) {
    const remote = fromRemote(table, row);
    const local = store.getAny(table, remote.id);
    if (!local) { store.applyRemote(table, remote); resolveCodeClash(table, remote); return 'new'; }
    const key = table + ':' + remote.id;
    const entry = store.outbox.get(key);
    if (local.updated_at === remote.updated_at) { if (entry) store.outbox.remove(key); return 'same'; }   /* the workspace holds exactly this version */
    if (!entry) {
      if (remote.updated_at < local.updated_at) {
        /* should not happen (every local change is queued); never lose it — queue it now, based on what the workspace holds */
        store.outbox.mark(table, remote.id, remote.updated_at);
        return 'kept-local';
      }
      dropStaleEdit(table, local, remote);
      store.applyRemote(table, remote);
      return 'updated';
    }
    if (entry.base != null && entry.base === remote.updated_at) return 'kept-local';
    const equal = sameContent(table, local, remote);
    if (!equal && NO_REVIEW[table] && local.updated_at > remote.updated_at) { store.outbox.rebase(key, remote.updated_at); return 'kept-local'; }
    if (!equal && !NO_REVIEW[table]) keepConflict(table, local, remote);
    dropStaleEdit(table, local, remote);
    store.applyRemote(table, remote);
    store.outbox.remove(key);
    return equal || NO_REVIEW[table] ? 'updated' : 'conflict';
  }
  /* A row is stamped by the server when it is written but only becomes visible when its transaction commits, so a
     row with an earlier stamp can appear after a later one has been read. A pull therefore re-reads a short window
     before its saved position (applying a row twice changes nothing) — until a pull that began at least that long
     after the position last moved finds nothing new there. From then on the position is settled and pulls continue
     exactly from it, so the same rows (photograph rows carry their thumbnails) are not downloaded again on every run. */
  sync.rereadMs = 15000;
  async function pull() {
    const a = sync.adapter;
    const cursors = Object.assign({}, cfg().cursors || {});
    let changed = 0;
    for (const table of TABLES) {
      const saved = cursors[table] || null;
      const t0 = saved ? tsMs(saved.ts) : NaN;
      const began = Date.now();
      let cur;
      if (!saved || isNaN(t0)) cur = { ts: '1970-01-01T00:00:00Z', id: null };
      else if (saved.settled) cur = { ts: saved.ts, id: saved.id };
      else cur = { ts: new Date(t0 - sync.rereadMs).toISOString(), id: null };
      let high = saved;
      for (;;) {
        const rows = await a.fetchSince(table, cur, 500);
        if (!rows || !rows.length) break;
        rows.forEach(function (row) { const res = reconcile(table, row); if (res === 'new' || res === 'updated' || res === 'conflict') changed++; });
        const last = rows[rows.length - 1];
        cur = { ts: last.server_updated_at || last.updated_at, id: last.id };   /* the server's exact text: it is sent back as the position */
        high = cur;
        if (rows.length < 500) break;
      }
      if (!high) continue;
      if (saved && high.ts === saved.ts && high.id === saved.id) {
        const at = saved.at || began;
        cursors[table] = { ts: saved.ts, id: saved.id, at: at, settled: !!saved.settled || began - at >= sync.rereadMs };
      } else cursors[table] = { ts: high.ts, id: high.id, at: Date.now(), settled: false };
    }
    saveCfg({ cursors: cursors });
    return changed;
  }
  sync.run = async function () {
    if (sync.running || !sync.enabled()) return false;
    if (navigator.onLine === false) return false;
    sync.running = true; EV.redraw();
    try {
      /* Pull first: a newer remote version must be seen (and any displaced local edit preserved for review)
         before local changes are sent, so an older offline edit can never silently overwrite newer work. */
      const n = await pull();
      await push();
      sync.error = null;
      sync.lastSyncAt = U.now();
      saveCfg({ lastSyncAt: sync.lastSyncAt });
      if (n) EV.rules.reconcileFollowups();
    } catch (e) {
      console.warn('[sync]', e);
      sync.error = e.status === 401 || e.status === 403 ? 'Access was refused by the workspace (' + (e.message || e.status) + ').' : (e.message || String(e));
    }
    sync.running = false; EV.redraw();
    return !sync.error;
  };
  /* Fetch a photograph binary that exists in the workspace but not on this device. */
  sync.fetchPhoto = async function (photo, original) {
    if (!sync.enabled() || !sync.adapter.downloadPhoto) return null;
    /* remote_ref / remote_edit_ref only say whether the workspace has the file. The path requested is derived from
       the record's own ids, so a value stored in a synchronised row can never steer the request anywhere else. */
    const edited = !original && !!photo.has_edit && !!photo.remote_edit_ref;
    if (!edited && !photo.remote_ref) return null;
    if (!UUID.test(String(photo.org_id)) || !UUID.test(String(photo.id))) return null;
    try {
      const blob = await sync.adapter.downloadPhoto(photoPath(photo, edited ? 'edited' : 'original'));
      const data = await blob.arrayBuffer();
      const key = edited ? photo.id + ':edit' : photo.id;
      await store.blobPut(key, data, blob.type || photo.mime);
      return { id: key, data: data, mime: blob.type || photo.mime };
    } catch (e) { console.warn('[sync] photograph download failed', e); return null; }
  };
  sync.restoreConflict = function (id) {
    const list = sync.conflicts();
    const c = list.find(function (x) { return x.id === id; });
    if (!c) return;
    const patch = Object.assign({}, c.local);
    S.COMMON_COLS.forEach(function (k) { delete patch[k]; });
    store.update(c.table, c.record_id, patch);
    store.kvSet('sync_conflicts', list.filter(function (x) { return x.id !== id; }));
  };
  sync.dismissConflict = function (id) { store.kvSet('sync_conflicts', sync.conflicts().filter(function (x) { return x.id !== id; })); };

  sync.init = async function () {
    const c = cfg();
    if (c.mode === 'supabase' && c.supabase) {
      sync.adapter = supabaseAdapter();
      store.syncEnabled = !!c.org_id;   /* once this device belongs to a workspace organization, every change is queued for it */
      if (c.role) store.readOnly = c.role === 'viewer';
    }
    const kick = U.debounce(function () { sync.run(); }, 2500);
    store.on(function (table, id, kind) {
      /* "Erase all local data" also removes the workspace connection and session: stop the engine with them. */
      if (kind === 'wipe' && sync.adapter && sync.adapter.label === 'Supabase workspace' && cfg().mode !== 'supabase') { sync.adapter = null; store.syncEnabled = false; sync.error = null; return; }
      if (sync.enabled()) kick();
    });
    setInterval(function () { if (sync.enabled() && !document.hidden) sync.run(); }, 120000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && sync.enabled()) sync.run(); });
    if (sync.enabled()) setTimeout(function () { sync.run(); }, 1500);
  };
})();
