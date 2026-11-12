/* store.js — local-first persistence.
 * All records live in memory for synchronous rendering and are written through to IndexedDB on every change
 * (coalesced, with real completion tracking, retry with back-off, and a sync outbox). Photograph binaries are
 * stored separately and never loaded into memory wholesale. If IndexedDB is unavailable the app keeps working
 * in memory and says so prominently — it never reports a save that did not happen. */
(function () {
  'use strict';
  const EV = window.EV, U = EV.U, S = EV.S;
  const DB_NAME = window.EV_DB_NAME || 'av_environment_intelligence'; /* the test suite uses its own database */
  const DB_VERSION = 1;
  const BACKUP_FORMAT = 'av-environment-intelligence-backup';
  /* Legacy names. Earlier versions of the application carried their first client's name in the database name, the
     backup format tag, the organization name they filled in by themselves, and four party / status values. They are
     kept here only so that a device updated from an earlier version keeps its records: the old database is moved
     into DB_NAME and then deleted, stored values are renamed once, and an old backup file still restores. */
  const LEGACY_DB_NAME = window.EV_DB_NAME ? (window.EV_LEGACY_DB_NAME || '') : 'evercore_av_intelligence';
  const LEGACY_BACKUP_FORMAT = 'evercore-av-intelligence-backup';
  const LEGACY_ORG_NAME = 'Evercore';
  const LEGACY_VALUES = { 'Evercore IT': 'Client IT', 'Evercore AV Operations': 'Client AV Operations',
    'Pending Evercore IT': 'Pending Client IT', 'Pending Evercore Approval': 'Pending Client Approval' };
  const MOVED_KEY = 'legacy_db_moved', RENAMED_KEY = 'legacy_values_renamed';
  /* Not part of the change history: the log itself, export bookkeeping, per-device view state and derived follow-up tasks. */
  const NO_LOG = { activity_log: 1, exports: 1, insight_states: 1, followups: 1, profiles: 1, organizations: 1 };
  /* Recorded as DETAIL entries: every change is in the exported change history with who, when and from → to, but the
     activity feed shows one rolling line per audit instead of one line per tap. */
  const DETAIL = { functional_tests: 1, network_checks: 1, audit_notes: 1, audit_sections: 1, switch_ports: 1, network_links: 1, backlog_it_links: 1,
    room_configuration_members: 1, photos: 1 };
  /* bookkeeping fields that are not a change anyone made */
  const UNLOGGED_FIELDS = { thumb: 1, remote_ref: 1, remote_edit_ref: 1, sort_order: 1, tested_at: 1, checked_at: 1, status_changed_at: 1 };
  const STATUS_TABLES = { backlog_items: 1, it_requests: 1, audits: 1 };
  const EMPTY = Object.freeze([]);

  const mem = {};
  const listCache = {};
  const idxCache = {};
  const kv = new Map();
  const outbox = new Map();
  const memBlobs = new Map();
  const listeners = [];
  let idb = null;
  let memoryOnly = false;
  let channel = null;

  const store = (EV.store = {
    version: 0,
    ready: false,
    readOnly: false,
    syncEnabled: false,
    save: { pending: 0, lastSavedAt: null, error: null, memoryOnly: false, persisted: null }
  });

  /* ------------------------------------------------------------------ IndexedDB plumbing */
  function openDb() {
    return new Promise(function (resolve, reject) {
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { reject(e); return; }
      req.onupgradeneeded = function () {
        const db = req.result;
        S.TABLES.concat(['photo_blobs', 'outbox']).forEach(function (name) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
        });
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'k' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('IndexedDB could not be opened')); };
      req.onblocked = function () { reject(new Error('IndexedDB is blocked by another tab')); };
    });
  }
  function getAll(name) {
    return new Promise(function (resolve, reject) {
      const tx = idb.transaction(name, 'readonly');
      const rq = tx.objectStore(name).getAll();
      rq.onsuccess = function () { resolve(rq.result || []); };
      rq.onerror = function () { reject(rq.error); };
    });
  }
  function getOne(name, id) {
    return new Promise(function (resolve, reject) {
      const tx = idb.transaction(name, 'readonly');
      const rq = tx.objectStore(name).get(id);
      rq.onsuccess = function () { resolve(rq.result || null); };
      rq.onerror = function () { reject(rq.error); };
    });
  }

  /* ------------------------------------------------------------------ moving an earlier version's database */
  /* Opens a database only if it already exists: a new one is never created just by looking. */
  function openExisting(name) {
    return new Promise(function (resolve) {
      let rq;
      try { rq = indexedDB.open(name); } catch (e) { resolve(null); return; }
      rq.onupgradeneeded = function (ev) { if (ev.oldVersion === 0) { try { rq.transaction.abort(); } catch (e) { /* ignore */ } } };
      rq.onsuccess = function () { resolve(rq.result); };
      rq.onerror = function (ev) { if (ev && ev.preventDefault) ev.preventDefault(); resolve(null); };
      rq.onblocked = function () { resolve(null); };
    });
  }
  function putKvRaw(k, v) {
    return new Promise(function (resolve, reject) {
      const tx = idb.transaction('kv', 'readwrite');
      tx.objectStore('kv').put({ k: k, v: v });
      tx.oncomplete = function () { resolve(); };
      tx.onerror = tx.onabort = function () { reject(tx.error || new Error('IndexedDB write error')); };
    });
  }
  /* Copies one object store in chunks (photographs can be large). A record already in the new database is never
     overwritten, so a move that was interrupted can simply run again. */
  async function copyMissing(src, name) {
    let after, keyPath = null;
    for (;;) {
      const batch = await new Promise(function (resolve, reject) {
        const os = src.transaction(name, 'readonly').objectStore(name);
        keyPath = os.keyPath;
        const rq = os.getAll(after === undefined ? null : IDBKeyRange.lowerBound(after, true), 50);
        rq.onsuccess = function () { resolve(rq.result || []); };
        rq.onerror = function () { reject(rq.error); };
      });
      if (!batch.length) return;
      await new Promise(function (resolve, reject) {
        const tx = idb.transaction(name, 'readwrite'), os = tx.objectStore(name);
        batch.forEach(function (r) { const g = os.get(r[keyPath]); g.onsuccess = function () { if (g.result === undefined) os.put(r); }; });
        tx.oncomplete = function () { resolve(); };
        tx.onerror = tx.onabort = function () { reject(tx.error || new Error('IndexedDB write error')); };
      });
      after = batch[batch.length - 1][keyPath];
    }
  }
  async function moveLegacyDb() {
    if (!LEGACY_DB_NAME || LEGACY_DB_NAME === DB_NAME) return;
    const mark = await getOne('kv', MOVED_KEY);
    if (mark && mark.v === 'done') return;
    const old = await openExisting(LEGACY_DB_NAME);
    if (!old) { await putKvRaw(MOVED_KEY, 'done'); return; }
    try {
      await putKvRaw(MOVED_KEY, 'started');
      const names = Array.prototype.filter.call(old.objectStoreNames, function (n) { return idb.objectStoreNames.contains(n); });
      for (const n of names) await copyMissing(old, n);
      await putKvRaw(MOVED_KEY, 'done');
    } finally { try { old.close(); } catch (e) { /* ignore */ } }
    /* only after every record is in the new database */
    await new Promise(function (resolve) {
      let d;
      try { d = indexedDB.deleteDatabase(LEGACY_DB_NAME); } catch (e) { resolve(); return; }
      d.onsuccess = d.onerror = d.onblocked = function () { resolve(); };
    });
  }
  /* Renames the earlier party / status values in one record (exact values only). The change history is left as it
     was recorded. Returns true when something changed. */
  function renameLegacy(table, r) {
    if (!r || typeof r !== 'object' || table === 'activity_log') return false;
    let changed = false;
    Object.keys(r).forEach(function (k) {
      const v = r[k];
      if (typeof v === 'string' && Object.prototype.hasOwnProperty.call(LEGACY_VALUES, v)) { r[k] = LEGACY_VALUES[v]; changed = true; }
    });
    return changed;
  }
  store.renameLegacy = renameLegacy;

  store.init = async function () {
    S.TABLES.forEach(function (t) { mem[t] = new Map(); });
    try {
      idb = await openDb();
      idb.onversionchange = function () { try { idb.close(); } catch (e) { /* ignore */ } };
      let moveError = null;
      try { await moveLegacyDb(); } catch (e) { moveError = e; console.warn('[store] moving the earlier database did not finish', e); }
      const results = await Promise.all(S.TABLES.map(getAll));
      S.TABLES.forEach(function (t, i) { results[i].forEach(function (r) { mem[t].set(r.id, r); }); });
      (await getAll('kv')).forEach(function (r) { kv.set(r.k, r.v); });
      (await getAll('outbox')).forEach(function (r) { outbox.set(r.id, r); });
      if (moveError) store.save.error = 'Records saved by the earlier version of this application could not all be moved yet. They are kept where they were, and the move is tried again at the next start.';
    } catch (e) {
      console.warn('[store] IndexedDB unavailable — memory only', e);
      idb = null; memoryOnly = true;
      store.save.memoryOnly = true;
      store.save.error = 'Device storage is unavailable in this browser session. Records will not survive a reload — export before closing.';
    }
    if (!kv.get(RENAMED_KEY)) {
      S.TABLES.forEach(function (t) { let any = false; mem[t].forEach(function (r) { if (renameLegacy(t, r)) { enqueue(t, r.id, r); any = true; } }); if (any) touch(t); });
      if (kv.get('org_name') === LEGACY_ORG_NAME) store.kvDel('org_name');   /* filled in by earlier versions, not by a person */
      store.kvSet(RENAMED_KEY, true);
    }
    try { if (navigator.storage && navigator.storage.persisted) store.save.persisted = await navigator.storage.persisted(); } catch (e) { /* ignore */ }
    if (!kv.get('org_id')) store.kvSet('org_id', U.uid());
    try {
      if (window.BroadcastChannel && !memoryOnly) {
        channel = new BroadcastChannel(DB_NAME);   /* one channel per database: tabs on another database are not told about these records */
        channel.onmessage = function (ev) {
          /* another tab erased the device: this tab must not keep (and write back) the erased records or session */
          if (ev.data && ev.data.wiped) { queue.clear(); clearTimeout(flushTimer); try { location.reload(); } catch (e) { /* ignore */ } return; }
          onPeerWrite(ev.data);
        };
      }
    } catch (e) { channel = null; }
    document.addEventListener('visibilitychange', function () { if (document.hidden) store.flush(); });
    window.addEventListener('pagehide', function () { store.flush(); });
    store.ready = true;
  };
  store.requestPersistence = async function () {
    try { if (navigator.storage && navigator.storage.persist) store.save.persisted = await navigator.storage.persist(); } catch (e) { /* ignore */ }
    return store.save.persisted;
  };
  store.estimate = async function () {
    try { if (navigator.storage && navigator.storage.estimate) return await navigator.storage.estimate(); } catch (e) { /* ignore */ }
    return null;
  };

  /* ------------------------------------------------------------------ write-through queue */
  const queue = new Map();
  let flushTimer = 0, flushing = null, retryDelay = 500;
  function enqueue(storeName, id, value) {
    if (memoryOnly) return;
    queue.set(storeName + '\u0000' + id, { s: storeName, id: id, v: value });
    store.save.pending = queue.size;
    if (!flushTimer) flushTimer = setTimeout(function () { store.flush(); }, 160);
  }
  store.flush = function () {
    clearTimeout(flushTimer); flushTimer = 0;
    if (memoryOnly || !idb) return Promise.resolve();
    if (flushing) return flushing.then(function () { return queue.size ? store.flush() : undefined; });
    if (!queue.size) return Promise.resolve();
    const batch = Array.from(queue.values());
    queue.clear();
    flushing = new Promise(function (resolve) {
      let settled = false;
      function done() { flushing = null; resolve(); EV.redraw(); }
      function fail(err) {
        if (settled) return; settled = true;
        console.error('[store] write failed', err);
        batch.forEach(function (b) { const k = b.s + '\u0000' + b.id; if (!queue.has(k)) queue.set(k, b); });
        store.save.pending = queue.size;
        const quota = err && (err.name === 'QuotaExceededError' || /quota/i.test(String(err.message)));
        store.save.error = quota ? 'Device storage is full. Export the audit package and free space — changes are held in memory.'
          : 'Could not write to device storage — retrying automatically.';
        retryDelay = Math.min(retryDelay * 2, 15000);
        clearTimeout(flushTimer);
        flushTimer = setTimeout(function () { store.flush(); }, retryDelay);
        done();
      }
      let tx;
      try { tx = idb.transaction(U.uniq(batch.map(function (b) { return b.s; })), 'readwrite'); }
      catch (e) { fail(e); return; }
      tx.oncomplete = function () {
        if (settled) return; settled = true;
        store.save.lastSavedAt = U.now(); store.save.error = null; store.save.pending = queue.size; retryDelay = 500;
        if (channel) { try { channel.postMessage(batch.filter(function (b) { return b.s !== 'outbox'; }).map(function (b) { return { s: b.s, id: b.id }; })); } catch (e) { /* ignore */ } }
        done();
      };
      tx.onerror = function () { fail(tx.error || new Error('IndexedDB write error')); };
      tx.onabort = function () { fail(tx.error || new Error('IndexedDB write aborted')); };
      try {
        batch.forEach(function (b) {
          const os = tx.objectStore(b.s);
          if (b.v == null) os.delete(b.id); else os.put(b.v);
        });
      } catch (e) { try { tx.abort(); } catch (e2) { /* ignore */ } fail(e); }
    });
    return flushing;
  };
  async function onPeerWrite(items) {
    if (!Array.isArray(items) || !idb) return;
    for (const it of items) {
      try {
        if (it.s === 'kv') { const r = await getOne('kv', it.id); if (r) kv.set(r.k, r.v); else kv.delete(it.id); store.version++; }
        else if (mem[it.s]) { const r = await getOne(it.s, it.id); if (r) mem[it.s].set(r.id, r); else mem[it.s].delete(it.id); touch(it.s); }
      } catch (e) { /* ignore */ }
    }
    EV.redraw();
  }

  /* ------------------------------------------------------------------ key/value settings */
  store.kvGet = function (k, dflt) { return kv.has(k) ? kv.get(k) : dflt; };
  store.kvSet = function (k, v) { kv.set(k, v); enqueue('kv', k, { k: k, v: v }); store.version++; };
  store.kvDel = function (k) { kv.delete(k); enqueue('kv', k, null); store.version++; };
  store.kvAll = function () { const o = {}; kv.forEach(function (v, k) { o[k] = v; }); return o; };
  /* Settings that may leave the device in a backup file: record-code counters and the organization label only.
     The passcode verifier, the workspace session (access / refresh tokens) and the auditor profile never do. */
  store.backupSettings = function () { const o = {}; kv.forEach(function (v, k) { if (k.indexOf('seq:') === 0 || k === 'org_name' || k === 'org_code') o[k] = v; }); return o; };
  store.orgId = function () { return kv.get('org_id'); };
  store.orgCode = function () { return kv.get('org_code') || 'AVEI'; };
  store.actor = function () {
    const p = kv.get('profile');
    return (p && (p.name || p.email)) || 'Auditor';
  };

  /* ------------------------------------------------------------------ reads */
  function touch(table) { delete listCache[table]; delete idxCache[table]; store.version++; }
  store.get = function (table, id) { if (!id) return null; const r = mem[table].get(id); return r && !r.deleted_at ? r : null; };
  store.getAny = function (table, id) { return (id && mem[table].get(id)) || null; };
  store.all = function (table) {
    return listCache[table] || (listCache[table] = Array.from(mem[table].values()).filter(function (r) { return !r.deleted_at; }));
  };
  store.raw = function (table) { return Array.from(mem[table].values()); };
  store.by = function (table, field, value) {
    const ix = idxCache[table] || (idxCache[table] = {});
    const m = ix[field] || (ix[field] = U.groupBy(store.all(table), function (r) { return r[field]; }));
    return m.get(value) || EMPTY;
  };
  store.find = function (table, pred) { return store.all(table).filter(pred); };
  store.count = function (table) { return store.all(table).length; };
  store.on = function (fn) { listeners.push(fn); };
  function notify(table, id, kind) {
    for (let i = 0; i < listeners.length; i++) { try { listeners[i](table, id, kind); } catch (e) { console.error(e); } }
    EV.redraw();
  }

  /* ------------------------------------------------------------------ writes */
  function guard() { if (store.readOnly) throw new Error('This account has read-only access.'); }
  function sameVal(a, b) {
    if (a == null) a = ''; if (b == null) b = '';
    if (typeof a === 'object' || typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
    return a === b;
  }
  /* A record's updated_at never goes backwards, whatever the device clock says: an edit is always later than the
     version it was made on. (A device with a slow clock would otherwise produce "older" edits of newer records.) */
  function stamp(old) {
    const now = U.now();
    return old && old.updated_at && old.updated_at >= now ? new Date(Date.parse(old.updated_at) + 1).toISOString() : now;
  }
  /* Outbox entry = "this record has changes the workspace has not received".
     base = updated_at of the version the workspace was last known to hold when the first unsent change was made
     (null: the workspace has never held this record). Synchronisation uses it to tell "the workspace still has the
     version I edited" from "someone else changed it meanwhile", without trusting clocks. */
  function markOutbox(table, id, base) {
    if (!store.syncEnabled) return;
    const key = table + ':' + id;
    const prev = outbox.get(key);
    const e = { id: key, table: table, rid: id, at: Date.now(), base: prev ? prev.base : (base === undefined ? null : base) };
    outbox.set(key, e);
    enqueue('outbox', key, e);
  }
  store.outbox = {
    list: function () { return Array.from(outbox.values()); },
    get: function (key) { return outbox.get(key) || null; },
    mark: function (table, id, base) { markOutbox(table, id, base); },
    size: function () { return outbox.size; },
    remove: function (key) { if (outbox.delete(key)) enqueue('outbox', key, null); },
    /* the workspace now holds this version; later changes are based on it */
    rebase: function (key, base) { const e = outbox.get(key); if (e) { const n = Object.assign({}, e, { base: base }); outbox.set(key, n); enqueue('outbox', key, n); } },
    /* first connection of a device that already holds records: everything is unsent, and the workspace has none of it */
    markAll: function () {
      S.TABLES.forEach(function (t) { mem[t].forEach(function (r) { const key = t + ':' + r.id; if (outbox.has(key)) return; const e = { id: key, table: t, rid: r.id, at: Date.now(), base: null }; outbox.set(key, e); enqueue('outbox', key, e); }); });
    }
  };
  store.nextCode = function (table) {
    const def = S.T[table].code;
    const key = 'seq:' + table;
    let n = kv.get(key) || 0;
    mem[table].forEach(function (r) { const m = /-(\d+)$/.exec(r.code || ''); if (m) n = Math.max(n, parseInt(m[1], 10)); });
    n += 1;
    store.kvSet(key, n);
    return store.orgCode() + '-' + def[0] + '-' + U.pad(n, def[1]);
  };
  store.create = function (table, data, opts) {
    guard();
    opts = opts || {};
    const t = S.T[table];
    const now = U.now();
    const rec = Object.assign({}, data);
    rec.id = rec.id || U.uid();
    rec.org_id = rec.org_id || store.orgId();
    rec.created_at = rec.created_at || now;
    rec.updated_at = rec.updated_at || rec.created_at;
    rec.created_by = rec.created_by || store.actor();
    rec.updated_by = rec.updated_by || rec.created_by;
    rec.deleted_at = rec.deleted_at || null;
    rec.is_demo = !!rec.is_demo;
    if (t.code && !rec.code) rec.code = store.nextCode(table);
    /* a record whose id is derived from what it links (see U.keyId) can be created again over its own deleted
       version: it is then a change to that version, not a brand-new row */
    const prior = mem[table].get(rec.id);
    if (prior) { rec.created_at = prior.created_at || rec.created_at; if (rec.updated_at <= prior.updated_at) rec.updated_at = stamp(prior); }
    mem[table].set(rec.id, rec);
    touch(table);
    enqueue(table, rec.id, rec);
    markOutbox(table, rec.id, prior ? prior.updated_at : null);
    if (!opts.silent && !NO_LOG[table]) {
      const entry = store.log({ action: 'created', table: table, rec: rec, summary: opts.summary, detail: !!DETAIL[table] });
      if (!opts.summary) createdLog.set(table + ':' + rec.id, { logId: entry.id, t: Date.now() });
    }
    notify(table, rec.id, 'create');
    return rec;
  };
  store.update = function (table, id, patch, opts) {
    guard();
    opts = opts || {};
    const old = mem[table].get(id);
    if (!old) return null;
    const changes = [];
    for (const k in patch) { if (!sameVal(old[k], patch[k])) changes.push({ f: k, from: old[k], to: patch[k] }); }
    if (!changes.length) return old;
    const rec = Object.assign({}, old, patch);
    rec.updated_at = stamp(old);
    rec.updated_by = store.actor();
    mem[table].set(id, rec);
    touch(table);
    enqueue(table, id, rec);
    markOutbox(table, id, old.updated_at);
    if (!opts.silent && !NO_LOG[table]) logUpdate(table, rec, changes);
    notify(table, id, 'update');
    return rec;
  };
  /* Soft delete: the record is kept (deleted_at set) so history, exports and sync stay consistent. */
  store.remove = function (table, id, opts) {
    guard();
    opts = opts || {};
    const old = mem[table].get(id);
    if (!old || old.deleted_at) return;
    const now = stamp(old);
    const rec = Object.assign({}, old, { deleted_at: now, updated_at: now, updated_by: store.actor() });
    /* A deleted photograph keeps its record (history, exports, synchronisation) but not its picture: the thumbnail is
       cleared and the image files are removed from this device, so nothing of it lingers in storage or in a backup. */
    if (table === 'photos') { rec.thumb = ''; store.dropPhotoFiles(id); }
    mem[table].set(id, rec);
    touch(table);
    enqueue(table, id, rec);
    markOutbox(table, id, old.updated_at);
    if (!opts.silent && !NO_LOG[table]) store.log({ action: 'deleted', table: table, rec: rec, detail: !!DETAIL[table] });
    notify(table, id, 'remove');
  };
  /* Hard delete — only for discarding a draft that was never exported or synced, and for wiping demo data. */
  store.purge = function (table, id) {
    guard();
    if (!mem[table].has(id)) return;
    mem[table].delete(id);
    touch(table);
    enqueue(table, id, null);
    store.outbox.remove(table + ':' + id);
    notify(table, id, 'purge');
  };
  /* Low-level: purge one record and its activity entries. Pages never call this directly — EV.act.discard removes a
     record together with whatever depends on it, and falls back to a recorded delete when a workspace is connected. */
  store.discard = function (table, id) {
    store.purge(table, id);
    store.raw('activity_log').forEach(function (a) { if (a.entity_id === id) store.purge('activity_log', a.id); });
  };
  /* Apply a record received from a sync remote: no activity entry, no outbox entry. */
  store.applyRemote = function (table, rec) {
    mem[table].set(rec.id, rec);
    touch(table);
    enqueue(table, rec.id, rec);
  };

  /* ------------------------------------------------------------------ activity log / change history */
  const lastUpdateLog = new Map();
  const createdLog = new Map();
  function short(v) {
    if (v == null) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return s.length > 160 ? s.slice(0, 159) + '…' : s;
  }
  function describe(action, table, rec) {
    const t = S.T[table];
    /* a test result, check, note or section is identified by the audit it belongs to */
    const audit = rec.audit_id && table !== 'audits' && mem.audits ? mem.audits.get(rec.audit_id) : null;
    return (t ? t.label : table) + ' ' + action + ': ' + (rec.code ? rec.code + ' · ' : '') + S.title(table, rec) + (audit && DETAIL[table] ? ' — audit ' + audit.code : '');
  }
  store.log = function (e) {
    const rec = e.rec || {};
    const now = U.now();
    const actor = store.actor();
    const entry = {
      id: U.uid(), org_id: store.orgId(), at: e.at || now, actor: e.actor || actor, action: e.action,
      entity_type: e.table || e.entity_type || '', entity_id: rec.id || e.entity_id || '', entity_code: rec.code || e.entity_code || '',
      summary: e.summary || describe(e.action, e.table, rec),
      building_id: e.building_id || rec.building_id || (e.table === 'buildings' ? rec.id : '') || '',
      floor_id: e.floor_id || rec.floor_id || (e.table === 'floors' ? rec.id : '') || '',
      room_id: e.room_id || rec.room_id || (e.table === 'rooms' ? rec.id : '') || '',
      changes: e.changes || null, detail: !!e.detail,
      created_at: now, updated_at: now, created_by: actor, updated_by: actor, deleted_at: null, is_demo: !!(e.is_demo || rec.is_demo)
    };
    mem.activity_log.set(entry.id, entry);
    touch('activity_log');
    enqueue('activity_log', entry.id, entry);
    markOutbox('activity_log', entry.id);
    return entry;
  };
  function logUpdate(table, rec, changes) {
    const list = changes.filter(function (c) { return !UNLOGGED_FIELDS[c.f]; }).map(function (c) { return { f: c.f, from: short(c.from), to: short(c.to) }; });
    if (!list.length) return;
    const detail = !!DETAIL[table];
    const statusChange = STATUS_TABLES[table] ? list.find(function (c) { return c.f === 'status'; }) : null;
    if (statusChange) {
      store.log({ action: 'status_changed', table: table, rec: rec, changes: [statusChange],
        summary: (rec.code || S.title(table, rec)) + ' status: ' + (statusChange.from || '—') + ' → ' + (statusChange.to || '—') });
    }
    const rest = list.filter(function (c) { return c !== statusChange; });
    if (!rest.length) return;
    const key = table + ':' + rec.id;
    /* A record that is still being filled in right after creation keeps one "created" entry, named as it now reads. */
    const cl = createdLog.get(key);
    const born = cl && Date.now() - cl.t < 600000 ? mem.activity_log.get(cl.logId) : null;
    if (born) {
      const kept = (born.changes || []).slice();
      rest.forEach(function (c) { const ex = kept.find(function (m) { return m.f === c.f; }); if (ex) ex.to = c.to; else kept.push(c); });
      const fresh = Object.assign({}, born, { summary: describe('created', table, rec), entity_code: rec.code || born.entity_code, building_id: rec.building_id || born.building_id,
        floor_id: rec.floor_id || born.floor_id, room_id: rec.room_id || born.room_id, changes: kept, updated_at: stamp(born) });
      mem.activity_log.set(fresh.id, fresh);
      touch('activity_log');
      enqueue('activity_log', fresh.id, fresh);
      markOutbox('activity_log', fresh.id);
      return;
    }
    const last = lastUpdateLog.get(key);
    const prev = last && Date.now() - last.t < 120000 ? mem.activity_log.get(last.logId) : null;
    if (prev) {
      const merged = (prev.changes || []).slice();
      rest.forEach(function (c) {
        const ex = merged.find(function (m) { return m.f === c.f; });
        if (ex) ex.to = c.to; else merged.push(c);
      });
      const upd = Object.assign({}, prev, { at: U.now(), updated_at: stamp(prev), changes: merged, summary: describe('updated', table, rec) });
      mem.activity_log.set(upd.id, upd);
      touch('activity_log');
      enqueue('activity_log', upd.id, upd);
      markOutbox('activity_log', upd.id);
      last.t = Date.now();
    } else {
      const entry = store.log({ action: 'updated', table: table, rec: rec, changes: rest, detail: detail });
      lastUpdateLog.set(key, { logId: entry.id, t: Date.now() });
    }
  }
  /* One rolling entry per key (e.g. "functional testing updated in 22B") instead of one entry per tap. */
  const rolling = new Map();
  store.logRolling = function (key, e) {
    const last = rolling.get(key);
    const prev = last && Date.now() - last.t < 600000 ? mem.activity_log.get(last.logId) : null;
    if (prev) {
      const upd = Object.assign({}, prev, { at: U.now(), updated_at: stamp(prev), summary: e.summary });
      mem.activity_log.set(upd.id, upd);
      touch('activity_log');
      enqueue('activity_log', upd.id, upd);
      markOutbox('activity_log', upd.id);
      last.t = Date.now();
      return upd;
    }
    const entry = store.log(e);
    rolling.set(key, { logId: entry.id, t: Date.now() });
    return entry;
  };

  /* ------------------------------------------------------------------ photograph binaries */
  function blobTx(mode, fn) {
    return new Promise(function (resolve, reject) {
      let tx;
      try { tx = idb.transaction('photo_blobs', mode); } catch (e) { reject(e); return; }
      let result;
      tx.oncomplete = function () { resolve(result); };
      tx.onerror = function () { reject(tx.error || new Error('Photo storage error')); };
      tx.onabort = function () { reject(tx.error || new Error('Photo storage aborted (device storage may be full)')); };
      const rq = fn(tx.objectStore('photo_blobs'));
      if (rq) rq.onsuccess = function () { result = rq.result; };
    });
  }
  store.blobPut = function (id, data, mime) {
    const rec = { id: id, data: data, mime: mime || 'image/jpeg', size: data.byteLength };
    if (memoryOnly || !idb) { memBlobs.set(id, rec); return Promise.resolve(); }
    return blobTx('readwrite', function (os) { os.put(rec); return null; });
  };
  store.blobGet = function (id) {
    if (memoryOnly || !idb) return Promise.resolve(memBlobs.get(id) || null);
    return blobTx('readonly', function (os) { return os.get(id); }).then(function (r) { return r || null; });
  };
  store.blobDelete = function (id) {
    if (memoryOnly || !idb) { memBlobs.delete(id); return Promise.resolve(); }
    return blobTx('readwrite', function (os) { os.delete(id); return null; });
  };
  /* the original and the edited rendition of one photograph */
  store.dropPhotoFiles = function (id) {
    [id, id + ':edit'].forEach(function (k) { try { store.blobDelete(k).catch(function () { /* not on this device */ }); } catch (e) { /* storage not open yet */ } });
  };
  store.blobKeys = function () {
    if (memoryOnly || !idb) return Promise.resolve(Array.from(memBlobs.keys()));
    return blobTx('readonly', function (os) { return os.getAllKeys(); }).then(function (r) { return r || []; });
  };

  /* ------------------------------------------------------------------ backup / restore / wipe */
  store.dump = function () {
    const out = { format: BACKUP_FORMAT, version: 1, exported_at: U.now(), app_version: EV.APP.version, kv: store.backupSettings(), tables: {} };
    S.TABLES.forEach(function (t) { out.tables[t] = store.raw(t); });
    return out;
  };
  /* A backup file is outside data: every row is rebuilt from the schema, column by column, with the type the column
     has. Unknown properties are dropped; a row without a valid id is skipped. */
  const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
  function typed(c, v) {
    if (c.type === 'bool') return v === true;
    if (v == null) return c.type === 'text' ? '' : null;
    switch (c.type) {
      case 'text': return typeof v === 'string' ? v : (typeof v === 'number' || typeof v === 'boolean') ? String(v) : '';
      case 'int': case 'num': { const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN); return isFinite(n) ? n : null; }
      case 'uuid': return typeof v === 'string' && ID_RE.test(v) ? v : null;
      case 'date': return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
      case 'ts': return typeof v === 'string' && TS_RE.test(v) ? v : null;
      case 'json': return typeof v === 'object' ? v : null;
      default: return null;
    }
  }
  function sanitize(table, r) {
    if (!r || typeof r !== 'object' || Array.isArray(r) || typeof r.id !== 'string' || !ID_RE.test(r.id)) return null;
    const now = U.now();
    const text = function (v) { return typeof v === 'string' ? v : ''; };
    const out = { id: r.id, org_id: store.orgId(),   /* a restored record belongs to this device's organization */
      created_at: typeof r.created_at === 'string' && TS_RE.test(r.created_at) ? r.created_at : now, updated_at: typeof r.updated_at === 'string' && TS_RE.test(r.updated_at) ? r.updated_at : now,
      created_by: text(r.created_by), updated_by: text(r.updated_by), deleted_at: typeof r.deleted_at === 'string' && TS_RE.test(r.deleted_at) ? r.deleted_at : null, is_demo: r.is_demo === true };
    if (out.updated_at < out.created_at) out.updated_at = out.created_at;
    S.T[table].columns.forEach(function (c) { out[c.name] = typed(c, r[c.name]); });
    renameLegacy(table, out);   /* a backup made by an earlier version */
    return out;
  }
  store.checkBackup = function (dump) {
    if (!dump || typeof dump !== 'object' || (dump.format !== BACKUP_FORMAT && dump.format !== LEGACY_BACKUP_FORMAT) || !dump.tables || typeof dump.tables !== 'object') throw new Error('This file is not an AV Environment Intelligence backup.');
    return true;
  };
  store.restore = function (dump) {
    store.checkBackup(dump);
    guard();   /* restoring writes records: a read-only account cannot */
    let n = 0;
    const clashes = [];
    S.TABLES.forEach(function (t) {
      const rows = Array.isArray(dump.tables[t]) ? dump.tables[t] : [];
      /* record IDs already in use on this device */
      const inUse = new Set();
      if (S.T[t].code) mem[t].forEach(function (x) { if (x.code && !x.deleted_at) inUse.add(x.code); });
      rows.forEach(function (raw) {
        const r = sanitize(t, raw);
        if (!r) return;
        const cur = mem[t].get(r.id);
        /* Never replace a newer local record with an older one from the backup. */
        if (cur && cur.updated_at && cur.updated_at >= r.updated_at) return;
        if (!cur && S.T[t].code && r.code && !r.deleted_at) { if (inUse.has(r.code)) clashes.push({ t: t, id: r.id }); else inUse.add(r.code); }
        mem[t].set(r.id, r); enqueue(t, r.id, r); markOutbox(t, r.id, cur ? cur.updated_at : null); n++;
      });
      touch(t);
    });
    if (dump.kv) {
      Object.keys(dump.kv).forEach(function (k) { const v = dump.kv[k]; if (k.indexOf('seq:') === 0 && typeof v === 'number' && isFinite(v) && v > (kv.get(k) || 0)) store.kvSet(k, Math.floor(v)); });
    }
    /* A backup made on another device can carry record IDs this device has already issued to other records. The UUID
       is the permanent key; the record that has just arrived gets the next free ID (issued after the merge and the
       counters, so it is above every ID of both devices) and the change is logged. */
    if (!store.readOnly) clashes.forEach(function (c) {
      const from = mem[c.t].get(c.id).code, next = store.nextCode(c.t);
      const rec = store.update(c.t, c.id, { code: next }, { silent: true });
      store.log({ action: 'renumbered', table: c.t, rec: rec, changes: [{ f: 'code', from: from, to: next }],
        summary: 'Record ID changed from ' + from + ' to ' + next + ' — ' + from + ' was already in use on this device' });
    });
    notify('*', null, 'restore');
    return n;
  };
  /* Removing the demo environment is a domain operation (it must also take the auditor's own records that live inside
     the demo building, and clear references to it): see EV.act.removeDemo in actions.js. */
  store.wipeAll = async function () {
    S.TABLES.forEach(function (t) { mem[t].clear(); touch(t); });
    outbox.clear(); queue.clear(); memBlobs.clear();
    const keep = { org_id: kv.get('org_id'), org_code: kv.get('org_code'), profile: kv.get('profile'), lock: kv.get('lock'), onboarded: kv.get('onboarded') };
    kv.clear();
    if (idb) {
      await new Promise(function (resolve, reject) {
        const names = S.TABLES.concat(['photo_blobs', 'outbox', 'kv']);
        const tx = idb.transaction(names, 'readwrite');
        names.forEach(function (n) { tx.objectStore(n).clear(); });
        tx.oncomplete = function () { resolve(); };
        tx.onerror = tx.onabort = function () { reject(tx.error || new Error('Could not clear device storage')); };
      });
      if (channel) { try { channel.postMessage({ wiped: true }); } catch (e) { /* ignore */ } }
    }
    Object.keys(keep).forEach(function (k) { if (keep[k] !== undefined) store.kvSet(k, keep[k]); });
    notify('*', null, 'wipe');
    await store.flush();
  };
  store.isMemoryOnly = function () { return memoryOnly; };
  store.hasDemo = function () {
    for (const t of ['buildings', 'rooms', 'devices', 'backlog_items', 'spare_items', 'it_requests', 'infra_assets']) {
      if (store.all(t).some(function (r) { return r.is_demo; })) return true;
    }
    return false;
  };
})();
