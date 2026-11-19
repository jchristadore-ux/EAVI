/* identify.js — device capture and identification.
 * Photograph a device (front, rear panel, label, port labels), optionally have the workspace's AI identification service
 * read the photographs, review every value, and confirm. Nothing becomes an asset until a person confirms it, every
 * value can be changed, and each one keeps its source (AI, label photograph, entered manually).
 *
 * AI identification runs server-side (supabase/functions/identify-device): no AI key is ever in the browser, and the
 * service answers only when the workspace operator has authorized it. When it is not available the same screen is used
 * to enter the details by hand, with the photographs alongside. The answers are checked again here: an identifier
 * (serial, MAC, IP) is accepted only when it was read from visible text and has a valid form; a model that cannot be
 * told apart from similar models by appearance is offered as a choice, never filled in. */
(function () {
  'use strict';
  const EV = window.EV, h = EV.h, U = EV.U, S = EV.S, store = EV.store, ui = EV.ui, icon = EV.icon, R = EV.rules, P = EV.photos, I = EV.inv;
  const ai = (EV.ai = { transport: null, checking: false });
  const ID = (EV.identify = {});

  /* ------------------------------------------------------------------ the device category picker
     The prepopulated list as a drop-down (grouped), with a last entry to type a category that is not in it. A typed
     name goes through I.ensureCategory: an existing name (any capitals) is reused, a new one joins the shared list so
     the next room offers it. `key` identifies the form so the typing state survives a redraw. */
  const typingCat = {};
  ID.NEW_CATEGORY = '__new__';
  ID.categoryPicker = function (key, value, o) {
    o = o || {};
    const pick = function (v) { delete typingCat[key]; EV.redraw(); if (o.onpick) o.onpick(v); };
    const addTyped = function () {
      const name = I.ensureCategory(typingCat[key] || '');
      if (!name) { EV.toast('Type the category name first.', 'warn'); return; }
      pick(name);
    };
    const groups = I.categoryGroups();
    const listed = I.categories();
    const kids = [h('option', { value: '' }, 'Choose a category')];
    if (value && listed.indexOf(value) < 0) kids.push(h('option', { value: value }, value));
    groups.forEach(function (g) { kids.push(h('optgroup', { label: g[0], key: 'g-' + g[0] }, g[1].map(function (n) { return h('option', { value: n, key: n }, n); }))); });
    kids.push(h('option', { value: ID.NEW_CATEGORY }, 'Other — type a new category…'));
    const typing = Object.prototype.hasOwnProperty.call(typingCat, key);
    return h('div.stack', { style: 'gap:6px' },
      h('select', { 'class': 'input select', id: o.id, disabled: !!o.disabled, value: typing ? ID.NEW_CATEGORY : (value || ''), 'aria-label': 'Device category',
        onchange: function (e) {
          const v = e.target.value;
          if (v === ID.NEW_CATEGORY) { typingCat[key] = ''; EV.redraw(); setTimeout(function () { const el = document.getElementById((o.id || 'cat') + '-new'); if (el) el.focus(); }, 30); return; }
          pick(v);
        } }, kids),
      typing && !o.disabled ? h('div.btn-row', null,
        ui.input(typingCat[key], { id: (o.id || 'cat') + '-new', ph: 'New category, e.g. PoE injector',
          oninput: function (v) { typingCat[key] = v; },
          onkeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); addTyped(); } } }),
        ui.btn('Add', { sm: true, kind: 'primary', id: (o.id || 'cat') + '-add', onclick: addTyped }),
        ui.btn('Cancel', { sm: true, kind: 'ghost', onclick: function () { delete typingCat[key]; EV.redraw(); } })) : null,
      typing && !o.disabled ? h('span.field-hint', null, 'Saved to the category list, so other rooms can choose it.') : null);
  };

  /* ------------------------------------------------------------------ the identification service */
  function callService(method, body) {
    if (ai.transport) return ai.transport(method, body);
    return EV.sync.invoke('identify-device', method === 'GET' ? {} : { method: 'POST', json: body });
  }
  /* Whether AI identification can be used from this device right now, and if not, why (stated, never hidden). */
  ai.availability = function () {
    if (store.readOnly) return { ok: false, reason: 'read_only', message: 'This account has read-only access.' };
    if (ai.transport) return { ok: true, provider: 'test service', model: 'stand-in' };
    const c = EV.sync && EV.sync.config ? EV.sync.config() : { mode: 'off' };
    if (c.mode !== 'supabase') return { ok: false, reason: 'no_workspace', message: 'AI identification runs in the cloud workspace, so no AI key is ever held in the browser. This installation is not connected to a workspace: enter the details from the photographs yourself.' };
    if (!c.session) return { ok: false, reason: 'signed_out', message: 'Sign in to the cloud workspace (Settings → Cloud sync) to use AI identification.' };
    if (navigator.onLine === false) return { ok: false, reason: 'offline', message: 'No connection. The photographs are saved with this capture; identify them when the device is online again, or enter the details yourself.' };
    const s = store.kvGet('ai_status');
    if (!s) return { ok: false, reason: 'unchecked', canCheck: true, message: 'AI identification has not been checked from this device yet.' };
    if (s.error) return { ok: false, reason: 'error', canCheck: true, message: 'The identification service could not be used when last checked: ' + s.error };
    if (!s.enabled) return { ok: false, reason: 'disabled', canCheck: true, message: 'AI identification has not been authorized for this workspace. It stays off until an administrator enables it on the server after the security review (docs/AI_IDENTIFICATION.md).' };
    if (!s.configured) return { ok: false, reason: 'not_configured', canCheck: true, message: 'AI identification is authorized, but no AI provider key is configured on the server.' };
    return { ok: true, provider: s.provider, model: s.model };
  };
  ai.check = async function () {
    ai.checking = true; EV.redraw();
    try {
      const j = await callService('GET');
      store.kvSet('ai_status', { enabled: !!j.enabled, configured: !!j.configured, provider: j.provider || '', model: j.model || '', max_images: j.max_images || 4, checked_at: U.now() });
    } catch (e) {
      store.kvSet('ai_status', { error: e && e.status === 404 ? 'the identify-device function is not deployed in this workspace.' : ((e && e.message) || String(e)), checked_at: U.now() });
    } finally { ai.checking = false; EV.redraw(); }
    return ai.availability();
  };
  const ERRORS = {
    disabled: 'AI identification has not been authorized for this workspace.',
    not_configured: 'No AI provider key is configured on the server.',
    not_signed_in: 'The workspace session has ended. Sign in again (Settings → Cloud sync).',
    not_member: 'This account is not a member of the workspace.',
    read_only: 'This account has read-only access.',
    too_large: 'The photographs are too large to send. Remove one, or crop to the device.',
    timeout: 'The AI provider did not answer in time. Try again.',
    provider_error: 'The AI provider returned an error. Try again, or enter the details yourself.'
  };
  function b64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function roleOf(p) { const r = S.PHOTO_ROLES.find(function (x) { return x[2] === p.category; }); return r ? r[0] : 'other'; }
  /* Sends the photographs (and only them, with the category list) and returns the checked answer. */
  ai.identify = async function (photos) {
    const max = (store.kvGet('ai_status') || {}).max_images || 4;
    const images = [];
    /* a crop is the clearest view of one device: crops first (newest first), then the other photographs */
    const ordered = photos.filter(function (p) { return p.crop_of; }).reverse().concat(photos.filter(function (p) { return !p.crop_of; }));
    for (const p of ordered.slice(0, max)) {
      const b = await P.exportBytes(p, 'optimized', !!p.has_edit);
      if (!b) throw new Error('The image file of photograph ' + (p.code || '') + ' is not on this device.');
      images.push({ media_type: b.mime, data: b64(b.bytes), role: roleOf(p) });
    }
    let raw;
    try { raw = await callService('POST', { images: images, categories: I.categories(), max_devices: 4 }); }
    catch (e) {
      if (e && (e.code === 'disabled' || e.code === 'not_configured')) { const s = store.kvGet('ai_status') || {}; store.kvSet('ai_status', Object.assign({}, s, e.code === 'disabled' ? { enabled: false } : { configured: false }, { error: '' })); }
      throw new Error((e && ERRORS[e.code]) || (e && e.message) || 'AI identification failed.');
    }
    return ai.normalize(raw, I.categories());
  };

  /* ------------------------------------------------------------------ checking an answer */
  const CONF = ['confirmed', 'probable', 'low'], EVID = ['label_text', 'logo', 'appearance', 'not_visible'];
  function str(v) { return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''; }
  function idx(v) { return Number.isInteger(v) && v >= 0 ? v : null; }
  function field(x) {
    x = x && typeof x === 'object' ? x : {};
    const v = str(x.value);
    if (!v) return { value: '', confidence: null, evidence: 'not_visible', image_index: null };
    let ev = EVID.indexOf(x.evidence) >= 0 && x.evidence !== 'not_visible' ? x.evidence : 'appearance';
    let conf = CONF.indexOf(x.confidence) >= 0 ? x.confidence : 'low';
    if (conf === 'confirmed' && ev !== 'label_text' && ev !== 'logo') conf = 'probable';
    return { value: v, confidence: conf, evidence: ev, image_index: idx(x.image_index) };
  }
  /* an identifier is kept only when it was read from visible text and has a valid form; anything else stays raw text, unused */
  function ident(x, kind) {
    x = x && typeof x === 'object' ? x : {};
    let v = str(x.value), raw = str(x.raw_text);
    if (x.evidence !== 'visible_text') { if (v && !raw) raw = v; v = ''; }
    if (v && kind === 'mac') { const m = R.macFormat(v); if (R.macValid(m)) v = m; else { raw = raw || v; v = ''; } }
    if (v && kind === 'ip' && !R.ipValid(v)) { raw = raw || v; v = ''; }
    if (v && kind === 'serial' && (v.length > 64 || /\s{2,}/.test(v))) { raw = raw || v; v = ''; }
    return { value: v, raw_text: raw && raw !== v ? raw : '', image_index: v ? idx(x.image_index) : null };
  }
  ai.normalize = function (raw, categories) {
    raw = raw && typeof raw === 'object' ? raw : {};
    const cats = categories || I.categories();
    const devices = (Array.isArray(raw.devices) ? raw.devices : []).slice(0, 6).map(function (d) {
      d = d && typeof d === 'object' ? d : {};
      const out = { manufacturer: field(d.manufacturer), make: field(d.make), model: field(d.model), product_family: field(d.product_family), category: field(d.category), function: field(d['function']),
        serial_number: ident(d.serial_number, 'serial'), mac_address: ident(d.mac_address, 'mac'), ip_address: ident(d.ip_address, 'ip'),
        other_identifiers: (Array.isArray(d.other_identifiers) ? d.other_identifiers : []).map(function (o) { return { label: str(o && o.label), value: str(o && o.value), image_index: idx(o && o.image_index) }; }).filter(function (o) { return o.value; }).slice(0, 10),
        location_in_image: str(d.location_in_image), review_reasons: (Array.isArray(d.review_reasons) ? d.review_reasons : []).map(str).filter(Boolean).slice(0, 8) };
      out.model.alternatives = U.uniq((d.model && Array.isArray(d.model.alternatives) ? d.model.alternatives : []).map(str).filter(function (a) { return a && a !== out.model.value; })).slice(0, 6);
      /* several models look alike: the appearance alone decides nothing */
      if (out.model.value && out.model.evidence === 'appearance' && out.model.alternatives.length && out.model.confidence !== 'low') {
        out.model.confidence = 'low'; out.review_reasons.push('Similar models look alike; the model was not read from a label.');
      }
      const cat = out.category.value ? cats.find(function (c) { return c.toLowerCase() === out.category.value.toLowerCase(); }) : null;
      if (out.category.value && !cat) { out.review_reasons.push('Suggested category “' + out.category.value + '” is not in the category list.'); out.category = field(null); }
      else if (cat) out.category.value = cat;
      out.needs_manual_review = !!d.needs_manual_review || !out.manufacturer.value || !out.model.value || out.manufacturer.confidence === 'low' || out.model.confidence === 'low';
      return out;
    });
    return { provider: str(raw.provider), model: str(raw.model), notes: str(raw.notes), devices: devices };
  };
  /* What an answer fills in. Only values the AI is reasonably sure of; low-confidence ones and look-alike models are
     offered as suggestions to tap, never entered by themselves. */
  ai.prefill = function (dev) {
    const values = {}, sources = {}, statuses = {}, suggest = {};
    const take = function (k, f) {
      if (!f || !f.value) return;
      if (f.confidence === 'confirmed' || f.confidence === 'probable') { values[k] = f.value; sources[k] = 'ai'; }
      else (suggest[k] = suggest[k] || []).push(f.value);
    };
    take('manufacturer', dev.manufacturer); take('category', dev.category);
    if (dev.model.value && (dev.model.confidence === 'confirmed' || (dev.model.confidence === 'probable' && !dev.model.alternatives.length))) { values.model = dev.model.value; sources.model = 'ai'; }
    else if (dev.model.value) suggest.model = [dev.model.value];
    if (dev.model.alternatives.length) suggest.model = U.uniq((suggest.model || []).concat(dev.model.alternatives));
    [['serial_number', 'serial_status'], ['mac_address', 'mac_status'], ['ip_address', 'ip_status']].forEach(function (p) {
      if (dev[p[0]].value) { values[p[0]] = dev[p[0]].value; sources[p[0]] = 'ai'; statuses[p[1]] = 'unknown'; }
    });
    return { values: values, sources: sources, statuses: statuses, suggest: suggest };
  };

  /* ------------------------------------------------------------------ photographs: fingerprint, crop, barcodes */
  function loadImage(blob) {
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(blob), img = new Image();
      img.onload = function () { resolve({ img: img, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('This image cannot be decoded by this browser.')); };
      img.src = url;
    });
  }
  /* 64-bit difference hash: nearly identical pictures have nearly identical hashes (used only as a duplicate hint) */
  ID.dhash = async function (blob) {
    const li = await loadImage(blob);
    try {
      const c = document.createElement('canvas'); c.width = 9; c.height = 8;
      const x = c.getContext('2d'); x.drawImage(li.img, 0, 0, 9, 8);
      const d = x.getImageData(0, 0, 9, 8).data;
      let hex = '', nib = 0, n = 0;
      for (let y = 0; y < 8; y++) for (let k = 0; k < 8; k++) {
        const i = (y * 9 + k) * 4, j = i + 4;
        const a = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114, b = d[j] * 0.299 + d[j + 1] * 0.587 + d[j + 2] * 0.114;
        nib = (nib << 1) | (a > b ? 1 : 0); n++;
        if (n === 4) { hex += nib.toString(16); nib = 0; n = 0; }
      }
      return hex;
    } finally { URL.revokeObjectURL(li.url); }
  };
  async function fingerprint(photo) {
    try { const blob = await P.getBlob(photo, true); if (blob) store.update('photos', photo.id, { phash: await ID.dhash(blob) }, { silent: true }); }
    catch (e) { /* a hint only */ }
  }
  ID.barcodeSupported = function () { return typeof window.BarcodeDetector === 'function'; };
  ID.readBarcodes = async function (photo) {
    const blob = await P.getBlob(photo, false);
    if (!blob) throw new Error('The image file is not on this device.');
    const li = await loadImage(blob);
    try {
      const found = await new window.BarcodeDetector().detect(li.img);
      return U.uniq((found || []).map(function (f) { return String(f.rawValue || '').trim(); }).filter(Boolean)).slice(0, 12);
    } finally { URL.revokeObjectURL(li.url); }
  };
  /* A cropped copy is a new photograph; the original is kept as it was. rect: fractions of the image {x, y, w, h}. */
  ID.cropPhoto = async function (photo, rect) {
    const blob = await P.getBlob(photo, false);
    if (!blob) throw new Error('The image file is not on this device.');
    const li = await loadImage(blob);
    try {
      const W = li.img.naturalWidth, H = li.img.naturalHeight;
      const sx = Math.round(rect.x * W), sy = Math.round(rect.y * H), sw = Math.max(8, Math.round(rect.w * W)), sh = Math.max(8, Math.round(rect.h * H));
      const c = document.createElement('canvas'); c.width = sw; c.height = sh;
      c.getContext('2d').drawImage(li.img, sx, sy, sw, sh, 0, 0, sw, sh);
      const out = await new Promise(function (res, rej) { c.toBlob(function (b) { if (b) res(b); else rej(new Error('Image encoding failed')); }, 'image/jpeg', 0.92); });
      const file = new File([out], (photo.code || 'photo') + '-crop.jpg', { type: 'image/jpeg' });
      const room = store.get('rooms', photo.room_id);
      const rec = await P.add(file, { room: room, identification_id: photo.identification_id, device_id: photo.device_id, category: photo.category, crop_of: photo.id,
        description: 'Cropped from ' + (photo.code || 'photograph') });
      fingerprint(rec);
      return rec;
    } finally { URL.revokeObjectURL(li.url); }
  };

  /* ------------------------------------------------------------------ captures */
  /* target: an asset already in the inventory (listed from the room details) that this capture confirms */
  function draftFrom(d) {
    const values = {}, sources = {}, statuses = {}, src = I.sources(d);
    I.SOURCED.forEach(function (k) { if (!U.blank(d[k])) { values[k] = d[k]; sources[k] = src[k] || 'existing'; } });
    I.IDS.forEach(function (f) { if (d[f.s] && d[f.s] !== 'unknown') statuses[f.s] = d[f.s]; });
    return { values: values, sources: sources, statuses: statuses, suggest: {}, picked: {} };
  }
  ID.newCapture = function (room, target) {
    return store.create('asset_identifications', { building_id: room.building_id, floor_id: room.floor_id, room_id: room.id, device_id: target ? target.id : null, status: 'draft',
      provider: '', model: '', requested_at: null, completed_at: null, result: null, error: '', selected_index: 0,
      draft: target ? draftFrom(target) : { values: {}, sources: {}, statuses: {} }, notes: '' });
  };
  /* "this is one of the listed devices": the capture now confirms it; what the capture already holds stays */
  ID.linkTarget = function (capId, deviceId) {
    const cap = store.get('asset_identifications', capId), d = store.get('devices', deviceId);
    if (!cap || !d) return;
    const cur = cap.draft || { values: {}, sources: {}, statuses: {} }, from = draftFrom(d);
    const next = { values: Object.assign({}, cur.values), sources: Object.assign({}, cur.sources), statuses: Object.assign({}, cur.statuses), suggest: cur.suggest || {}, picked: Object.assign({}, cur.picked || {}) };
    Object.keys(from.values).forEach(function (k) { if (U.blank(next.values[k])) { next.values[k] = from.values[k]; next.sources[k] = from.sources[k]; } });
    Object.keys(from.statuses).forEach(function (k) { if (!next.statuses[k]) next.statuses[k] = from.statuses[k]; });
    store.update('asset_identifications', capId, { device_id: d.id, draft: next });
  };
  ID.unlinkTarget = function (capId) { store.update('asset_identifications', capId, { device_id: null }); };
  ID.target = function (cap) { const d = cap && cap.device_id && cap.status !== 'confirmed' ? store.get('devices', cap.device_id) : null; return d || null; };
  ID.addPhotos = async function (cap, files, role) {
    const room = store.get('rooms', cap.room_id);
    const cat = (S.PHOTO_ROLES.find(function (r) { return r[0] === role; }) || S.PHOTO_ROLES[0])[2];
    const recs = await P.ingest(files, { room: room, identification_id: cap.id, category: cat });
    for (const r of recs) await fingerprint(r);
    if (room && !room.inventory_status) store.update('rooms', room.id, { inventory_status: 'in_progress' }, { silent: true });
    return recs;
  };
  /* runs the service on a capture's photographs and keeps its answer unchanged in the capture */
  ID.run = async function (capId) {
    const cap = store.get('asset_identifications', capId);
    const photos = P.forIdentification(capId);
    if (!cap || !photos.length) throw new Error('Take a photograph first.');
    store.update('asset_identifications', capId, { status: 'analyzing', requested_at: U.now(), error: '' });
    try {
      const res = await ai.identify(photos);
      const cur = store.get('asset_identifications', capId);
      /* the capture was confirmed, discarded or started again meanwhile: this answer changes nothing */
      if (!cur || cur.status !== 'analyzing') return null;
      const keep = cur.draft || { values: {}, sources: {}, statuses: {} };
      const fill = res.devices.length ? ai.prefill(res.devices[0]) : { values: {}, sources: {}, statuses: {}, suggest: {} };
      store.update('asset_identifications', capId, { status: 'ready', completed_at: U.now(), provider: res.provider, model: res.model, result: res, selected_index: 0,
        draft: res.devices.length ? ID.mergeDraft(keep, fill) : keep });
      return res;
    } catch (e) {
      const cur = store.get('asset_identifications', capId);
      if (cur && cur.status === 'analyzing') store.update('asset_identifications', capId, { status: 'failed', completed_at: U.now(), error: (e && e.message) || String(e) });
      throw e;
    }
  };
  /* An AI answer never replaces what a person typed: only empty fields and fields the AI filled before are set. */
  ID.mergeDraft = function (draft, fill) {
    const out = { values: Object.assign({}, draft.values), sources: Object.assign({}, draft.sources), statuses: Object.assign({}, draft.statuses), suggest: fill.suggest || {} };
    out.picked = Object.assign({}, draft.picked || {});
    /* an earlier AI value goes, unless the person chose it (tapped a suggestion or a label value) */
    Object.keys(out.values).forEach(function (k) { if (out.sources[k] === 'ai' && !out.picked[k]) { delete out.values[k]; delete out.sources[k]; } });
    Object.keys(fill.values).forEach(function (k) {
      /* a field that already holds something keeps it; a different reading is offered to tap */
      if (!U.blank(out.values[k])) {
        if (String(out.values[k]).trim().toLowerCase() !== String(fill.values[k]).trim().toLowerCase()) out.suggest = Object.assign({}, out.suggest, (function () { const o = {}; o[k] = U.uniq([fill.values[k]].concat(out.suggest[k] || [])); return o; })());
        return;
      }
      const f = I.IDS.find(function (x) { return x.k === k; });
      /* "not accessible" or "not applicable" was a person's answer */
      if (f && (out.statuses[f.s] === 'unavailable' || out.statuses[f.s] === 'not_applicable')) return;
      out.values[k] = fill.values[k]; out.sources[k] = 'ai';
      if (f && fill.statuses[f.s]) out.statuses[f.s] = fill.statuses[f.s];
    });
    return out;
  };
  ID.selectDevice = function (capId, i) {
    const cap = store.get('asset_identifications', capId);
    if (!cap || !cap.result || !cap.result.devices[i]) return;
    store.update('asset_identifications', capId, { selected_index: i, draft: ID.mergeDraft(cap.draft || { values: {}, sources: {}, statuses: {} }, ai.prefill(cap.result.devices[i])) });
  };
  ID.setValue = function (capId, k, v, source, picked) {
    const cap = store.get('asset_identifications', capId);
    if (!cap) return;
    const d = cap.draft || { values: {}, sources: {}, statuses: {} };
    const next = { values: Object.assign({}, d.values), sources: Object.assign({}, d.sources), statuses: Object.assign({}, d.statuses), suggest: d.suggest || {}, picked: Object.assign({}, d.picked || {}) };
    const was = d.values[k];
    next.values[k] = v;
    if (U.blank(v)) delete next.sources[k]; else next.sources[k] = source || 'manual';
    if (picked) next.picked[k] = true; else delete next.picked[k];
    const f = I.IDS.find(function (x) { return x.k === k; });
    if (f && !U.blank(v) && (next.statuses[f.s] === 'unavailable' || next.statuses[f.s] === 'not_applicable')) next.statuses[f.s] = 'unknown';
    if (f && (next.statuses[f.s] === 'verified_onsite' || next.statuses[f.s] === 'verified_mgmt') && String(v || '').trim() !== String(was || '').trim()) next.statuses[f.s] = 'unknown';
    store.update('asset_identifications', capId, { draft: next });
  };
  ID.setStatus = function (capId, statusKey, v) {
    const cap = store.get('asset_identifications', capId);
    if (!cap) return;
    const d = cap.draft || { values: {}, sources: {}, statuses: {} };
    const next = { values: Object.assign({}, d.values), sources: Object.assign({}, d.sources), statuses: Object.assign({}, d.statuses), suggest: d.suggest || {}, picked: Object.assign({}, d.picked || {}) };
    next.statuses[statusKey] = v;
    const f = I.IDS.find(function (x) { return x.s === statusKey; });
    if (f && (v === 'unavailable' || v === 'not_applicable')) { next.values[f.k] = ''; delete next.sources[f.k]; }
    store.update('asset_identifications', capId, { draft: next });
  };
  /* Confirm: the capture becomes an asset (or adds to an existing one through a merge, decided by a person). */
  ID.confirm = function (capId, opts) {
    opts = opts || {};
    const cap = store.get('asset_identifications', capId);
    if (!cap) throw new Error('This capture no longer exists.');
    /* a capture becomes one asset, once: a second tap, or a second open copy of the screen, adds nothing */
    if (!I.OPEN_IDENT[cap.status]) throw new Error(cap.status === 'confirmed' ? 'This capture was already saved as ' + ((store.getAny('devices', cap.device_id) || {}).code || 'an asset') + '.' : 'This capture was discarded.');
    const room = store.get('rooms', cap.room_id);
    if (!room) throw new Error('The room of this capture no longer exists.');
    const d = cap.draft || { values: {}, sources: {}, statuses: {} };
    const values = {};
    I.SOURCED.forEach(function (k) { if (!U.blank(d.values[k])) values[k] = String(d.values[k]).trim(); });
    if (values.category) values.category = I.ensureCategory(values.category);
    if (values.mac_address) values.mac_address = R.macFormat(values.mac_address);
    I.IDS.forEach(function (f) { values[f.s] = d.statuses[f.s] || 'unknown'; if (values[f.s] === 'unavailable' || values[f.s] === 'not_applicable') values[f.k] = ''; });
    /* a device with an IP address is saved only with its switch port, or with the port stated as not accessible / not applicable */
    if (ID.portMissing({ values: values, statuses: d.statuses })) throw new Error('Enter the switch port ID for this device (it has an IP address), or mark the port as not accessible.');
    /* identity is confirmed only when there is one to confirm; a missing manufacturer or model already lists the asset
       as needing identification, and it stops doing so as soon as both are recorded */
    const identified = !U.blank(values.manufacturer) && !U.blank(values.model) && !U.blank(values.category);
    const target = ID.target(cap);
    if (target) {
      /* confirming an asset already in the inventory: it is now seen; each changed value keeps its source */
      const bySrc = {};
      I.SOURCED.forEach(function (k) {
        const v = d.values[k] == null ? '' : String(d.values[k]).trim();
        if (v !== String(target[k] == null ? '' : target[k])) { const s = d.sources[k] || 'manual'; (bySrc[s] = bySrc[s] || {})[k] = k === 'mac_address' ? R.macFormat(v) : v; }
      });
      let cur = target;
      Object.keys(bySrc).forEach(function (s) { cur = I.update(cur, bySrc[s], s) || cur; });
      const st2 = { presence: '', ai_identification_id: cap.id, manual_review: !!opts.manualReview };
      I.IDS.forEach(function (f) { if (values[f.s] !== (cur[f.s] || 'unknown')) st2[f.s] = values[f.s]; if ((values[f.s] === 'verified_onsite' || values[f.s] === 'verified_mgmt')) st2.last_verified_at = U.now(); });
      if (identified && !opts.manualReview) { st2.identity_confirmed_at = U.now(); st2.identity_confirmed_by = store.actor(); st2.last_verified_at = U.now(); }
      cur = store.update('devices', cur.id, st2);
      store.log({ action: 'updated', table: 'devices', rec: cur, summary: cur.code + ' seen in the room and confirmed' + (cur.listed_text ? ' (' + cur.listed_text + ')' : '') });
      P.forIdentification(capId).forEach(function (p) { if (!p.device_id) store.update('photos', p.id, { device_id: cur.id }, { silent: true }); });
      if (!room.inventory_status) store.update('rooms', room.id, { inventory_status: 'in_progress' }, { silent: true });
      store.update('asset_identifications', capId, { status: 'confirmed', device_id: cur.id });
      return cur;
    }
    const dev = I.create(room, values, d.sources, { confirm: identified && !opts.manualReview, identification: cap, manualReview: !!opts.manualReview });
    P.forIdentification(capId).forEach(function (p) { if (!p.device_id) store.update('photos', p.id, { device_id: dev.id }, { silent: true }); });
    store.update('asset_identifications', capId, { status: 'confirmed', device_id: dev.id });
    return dev;
  };
  ID.discard = function (capId) {
    const cap = store.get('asset_identifications', capId);
    if (!cap) return;
    P.forIdentification(capId).forEach(function (p) { if (!p.device_id) P.remove(p); });
    store.update('asset_identifications', capId, { status: 'discarded' });
  };
  ID.portMissing = function (d) {
    const v = d.values || {}, s = d.statuses || {};
    return !U.blank(v.ip_address) && s.ip_status !== 'unavailable' && s.ip_status !== 'not_applicable' && U.blank(v.switch_port) && s.port_status !== 'unavailable' && s.port_status !== 'not_applicable';
  };
  ID.validation = function (d) {
    const v = d.values || {}, out = [];
    if (!U.blank(v.mac_address) && !R.macValid(R.macFormat(v.mac_address))) out.push('The MAC address does not have 12 hexadecimal digits.');
    if (!U.blank(v.ip_address) && !R.ipValid(v.ip_address)) out.push('The IP address is not a valid address.');
    return out;
  };

  /* ------------------------------------------------------------------ capture buttons */
  /* A <label> bound to a file input: one tap opens the camera. The capture is created when the first photograph arrives. */
  ID.captureButton = function (o) {
    const id = 'idcap-' + o.key;
    return h('label', { 'class': U.cx('btn', 'btn-' + (o.kind || 'primary'), o.lg && 'btn-lg', o.sm && 'btn-sm', o.block && 'btn-block', 'capture', o.cls), 'for': id, key: o.key, role: 'button', id: o.id },
      icon(o.library ? 'image' : 'camera', o.sm ? 15 : 18), h('span', null, o.label || (o.library ? 'Upload' : 'Photograph')),
      h('input', { id: id, type: 'file', accept: 'image/*', capture: o.library ? null : 'environment', multiple: !!o.library, 'class': 'file-input', tabindex: '-1',
        onchange: function (e) {
          const files = Array.prototype.slice.call(e.target.files || []);
          e.target.value = '';
          if (!files.length) return undefined;
          let cap = o.capture ? o.capture() : null;
          if (!cap) { const room = o.room(); if (!room) return undefined; cap = ID.newCapture(room, o.target ? o.target() : null); }
          if (o.started) o.started(cap);
          return ID.addPhotos(cap, files, o.role ? o.role() : 'front').then(function () { if (o.after) o.after(cap); });
        } }));
  };
  /* From anywhere: choose the room (the last one used is offered first), then the capture screen opens. */
  ID.startAnywhere = function () {
    const last = store.get('rooms', store.kvGet('last_inventory_room'));
    if (last) store.kvSet('last_floor', last.floor_id);
    return ui.pickRoom({ title: 'Photograph a device in…', sub: 'Choose the floor, then the room',
      rowSub: function (r) { return [r.department, U.plural(I.roomAssets(r.id).length, 'device')].filter(Boolean).join(' · '); },
      right: function (r) { const s = I.roomStatus(r); return ui.chip(I.roomStatusLabel(s), I.ROOM_TONE[s]); } }).then(function (sel) {
      if (sel && sel.room) ID.open({ room: sel.room });
    });
  };

  /* ------------------------------------------------------------------ the capture screen */
  /* o: { room } for a new capture, or { capture: id } to continue one */
  ID.open = function (o) {
    const st = { capId: o.capture || null, roomId: o.room ? o.room.id : null, role: 'front', busy: false, error: '', codes: null, codesFor: null, done: null, n: 0 };
    if (st.capId) { const c = store.get('asset_identifications', st.capId); if (c) st.roomId = c.room_id; }
    if (st.roomId && store.kvGet('last_inventory_room') !== st.roomId) store.kvSet('last_inventory_room', st.roomId);
    const cap = function () { return st.capId ? store.get('asset_identifications', st.capId) : null; };
    const room = function () { return store.get('rooms', st.roomId); };
    const ensure = function () { if (!cap()) { const c = ID.newCapture(room()); st.capId = c.id; } return cap(); };
    const draft = function () { const c = cap(); return (c && c.draft) || { values: {}, sources: {}, statuses: {}, suggest: {} }; };
    const set = function (k, v, source, picked) { ensure(); ID.setValue(st.capId, k, v, source, picked); };
    const runAi = function () {
      if (st.busy) return undefined;
      st.busy = true; st.error = '';
      return ID.run(st.capId).then(function (res) {
        st.busy = false;
        if (res && !res.devices.length) st.error = 'No device could be identified in these photographs. Add a clearer photograph of the label, or enter the details yourself.';
        EV.redraw();
      }, function (e) { st.busy = false; st.error = (e && e.message) || String(e); EV.redraw(); });
    };
    const started = function (c) { st.capId = c.id; st.done = null; EV.redraw(); };
    const afterPhotos = function (c) {
      st.capId = c.id; st.done = null;
      if (store.kvGet('ai_auto') === true && ai.availability().ok && c.status === 'draft' && !st.busy) runAi();
      EV.redraw();
    };
    const next = function () { st.capId = null; st.done = null; st.error = ''; st.codes = null; st.role = 'front'; st.n++; };
    const confirm = function () {
      const c = cap();
      const d = draft();
      if (!c) { EV.toast('Take a photograph or enter the device details first.', 'warn'); return undefined; }
      if (U.blank(d.values.category)) { EV.toast('Choose the device category.', 'warn', 3600); return undefined; }
      const problems = ID.validation(d);
      if (problems.length) { EV.toast(problems.join(' '), 'warn', 4200); return undefined; }
      if (ID.portMissing(d)) { EV.toast('This device has an IP address: enter its switch port ID, or mark the port as not accessible.', 'warn', 5000); const el = document.getElementById('ident-switch_port'); if (el) el.focus(); return undefined; }
      const missing = ['manufacturer', 'model'].filter(function (k) { return U.blank(d.values[k]); });
      const ask = missing.length ? ui.confirm({ title: 'Save without ' + missing.join(' and ') + '?', message: 'The device is saved to this room and listed as needing identification until the ' + missing.join(' and ') + ' are recorded.', confirm: 'Save' }) : Promise.resolve(true);
      return ask.then(function (ok) {
        if (!ok) return;
        const cands = I.candidatesFor(d.values, st.roomId, c.device_id);
        let dev;
        try { dev = ID.confirm(st.capId); } catch (e) { EV.reportError(e, 'Not saved'); return; }
        st.done = dev.id;
        EV.toast('Saved ' + dev.code + ' · ' + R.deviceLabel(dev), 'ok');
        const strong = cands.filter(function (e) { return e.strong; });
        if (strong.length) EV.assets.mergeSheet(strong[0].device.id, dev.id, { fromCapture: true, reasons: strong[0].reasons });
      });
    };
    const sheet = ui.openSheet({
      size: 'full',
      title: function () { return st.done ? 'Device saved' : ID.target(cap()) ? 'Confirm listed device' : 'Identify device'; },
      sub: function () { const r = room(); return r ? [R.roomLabel(r), (store.get('floors', r.floor_id) ? 'Floor ' + store.get('floors', r.floor_id).number : ''), (store.get('buildings', r.building_id) || {}).name].filter(Boolean).join(' · ') : ''; },
      render: function () {
        const r = room();
        if (!r) return ui.empty({ icon: 'grid', title: 'The room of this capture no longer exists.', text: 'Nothing can be saved to it. Discard the capture, or keep it until the room is restored.' });
        if (st.done) return doneView(r);
        const c = cap();
        if (c && !I.OPEN_IDENT[c.status]) return ui.empty({ icon: 'check-circle', title: c.status === 'confirmed' ? 'This capture was confirmed.' : 'This capture was discarded.',
          action: c.device_id ? ui.btn('Open the asset', { kind: 'primary', onclick: function () { ui.closeSheet(sheet); EV.assets.open(c.device_id); } }) : null });
        return h('div.stack.stack-lg.ident', { key: 'cap' + st.n }, listedSection(c), photoSection(c), aiSection(c), fieldsSection(c), dupSection(c));
      },
      footer: function () {
        const c = cap();
        if (!room() && c && I.OPEN_IDENT[c.status]) return [ui.btn('Discard capture', { kind: 'ghost-danger', key: 'del', icon: 'trash', onclick: function () { ID.discard(c.id); ui.closeSheet(sheet); EV.toast('Capture discarded'); } }),
          h('span.grow', { key: 'g' }), ui.btn('Close', { key: 'x', onclick: function () { ui.closeSheet(sheet); } })];
        if (st.done || !room()) return [h('span.grow', { key: 'g' }), ui.btn('Done', { kind: 'primary', key: 'd', onclick: function () { ui.closeSheet(sheet); } })];
        if (c && !I.OPEN_IDENT[c.status]) return [h('span.grow', { key: 'g' }), ui.btn('Close', { key: 'x', onclick: function () { ui.closeSheet(sheet); } })];
        return [
          c ? ui.btn('Discard', { kind: 'ghost-danger', key: 'del', icon: 'trash', disabled: st.busy, onclick: function () {
            const n = P.forIdentification(c.id).length;
            ui.confirm({ title: 'Discard this capture?', message: n ? 'Its ' + U.plural(n, 'photograph') + ' are deleted from this device. Nothing is added to the inventory.' : 'Nothing is added to the inventory.', confirm: 'Discard', danger: true })
              .then(function (ok) { if (ok) { ID.discard(c.id); ui.closeSheet(sheet); EV.toast('Capture discarded'); } });
          } }) : null,
          h('span.grow', { key: 'g' }),
          c ? ui.btn('Save for later', { kind: 'ghost', key: 'later', onclick: function () { ui.closeSheet(sheet); EV.toast('Kept under Identify Devices — awaiting review'); } }) : null,
          ui.btn('Confirm & save', { kind: 'primary', key: 'ok', icon: 'check', id: 'ident-confirm', disabled: st.busy, onclick: confirm })
        ];
      },
      onClose: function () { const c = cap(); if (c && c.status === 'draft' && !P.forIdentification(c.id).length && !Object.keys((c.draft || {}).values || {}).some(function (k) { return !U.blank(c.draft.values[k]); })) store.update('asset_identifications', c.id, { status: 'discarded' }); }
    });

    function doneView(r) {
      const d = store.get('devices', st.done);
      return h('div.stack.stack-lg', { key: 'done' },
        d ? ui.note('ok', [h('span.mono', { key: 'c' }, d.code), ' · ' + R.deviceLabel(d) + ' — saved to ' + R.roomLabel(r) + '.'], { title: 'Added to the inventory' }) : null,
        ID.captureButton({ key: 'next-' + st.n, lg: true, block: true, label: 'Photograph next device', id: 'ident-next',
          room: room, capture: function () { next(); return null; }, started: started, after: afterPhotos }),
        h('div.btn-row.wrap', null,
          ui.btn('Enter next device manually', { icon: 'edit', onclick: function () { next(); } }),
          d ? ui.btn('Open ' + d.code, { kind: 'ghost', onclick: function () { ui.closeSheet(sheet); EV.assets.open(d.id); } }) : null));
    }

    function photoSection(c) {
      const photos = c ? P.forIdentification(c.id) : [];
      return h('section.stack', { key: 'photos' },
        ui.label('Photographs', h('span.count', null, String(photos.length))),
        photos.length ? h('div.ident-photos', null, photos.map(function (p) {
          return h('div.ident-photo', { key: p.id },
            P.thumb(p, photos, { caption: false }),
            h('div.ident-photo-meta', null,
              h('span.ident-photo-role', null, (S.PHOTO_ROLES.find(function (x) { return x[2] === p.category; }) || [0, p.category])[1]),
              p.crop_of ? h('span.muted', null, ' · cropped') : null),
            h('div.btn-row.wrap', null,
              ui.btn('Crop', { sm: true, kind: 'ghost', icon: 'target', onclick: function () { ID.cropSheet(p); } }),
              ID.barcodeSupported() ? ui.btn('Read barcode', { sm: true, kind: 'ghost', icon: 'list', onclick: function () {
                st.codesFor = p.id; st.codes = 'reading';
                ID.readBarcodes(p).then(function (v) { st.codes = v; EV.redraw(); }, function (e) { st.codes = []; EV.reportError(e, 'Barcode'); EV.redraw(); });
              } }) : null,
              ui.btn('Remove', { sm: true, kind: 'ghost', icon: 'trash', onclick: function () {
                ui.confirm({ title: 'Remove this photograph?', message: 'It is deleted from this device.', confirm: 'Remove', danger: true }).then(function (ok) { if (ok) P.remove(p); });
              } })));
        })) : h('p.muted', null, 'Photograph the front of the device, then its label (serial number, MAC address) and rear panel. The original photographs are kept with the asset.'),
        h('div.stack', { style: 'gap:6px' },
          h('span.field-label', null, photos.length ? 'Next photograph' : 'First photograph'),
          ui.seg(st.role, S.PHOTO_ROLES.map(function (x) { return [x[0], x[1]]; }), { wrap: true, onchange: function (v) { st.role = v; } })),
        h('div.btn-row.wrap', null,
          ID.captureButton({ key: 'cam-' + st.n, lg: !photos.length, cls: 'grow', label: photos.length ? 'Add photograph' : 'Photograph device', id: 'ident-camera',
            room: room, capture: cap, role: function () { return st.role; }, started: started, after: afterPhotos }),
          ID.captureButton({ key: 'lib-' + st.n, library: true, kind: 'secondary', lg: !photos.length, label: 'Upload', room: room, capture: cap, role: function () { return st.role; }, started: started, after: afterPhotos })),
        st.codes ? barcodeResults() : null);
    }
    function barcodeResults() {
      if (st.codes === 'reading') return ui.note('info', 'Reading barcodes…', { key: 'bc' });
      if (!st.codes.length) return ui.note('info', 'No barcode or QR code was found in that photograph.', { key: 'bc' });
      return ui.card({ key: 'bc', title: 'Barcodes read from the photograph' },
        h('p.muted', null, 'Choose where each value belongs. Nothing is entered until you choose.'),
        h('div.list', null, st.codes.map(function (v) {
          const mac = R.macFormat(v);
          return h('div.row', { key: v }, h('span.row-main', null, h('span.row-title.mono', null, v)),
            h('span.row-right.btn-row.wrap', null,
              ui.btn('Serial', { sm: true, kind: 'ghost', onclick: function () { set('serial_number', v, 'label'); } }),
              R.macValid(mac) ? ui.btn('MAC', { sm: true, kind: 'ghost', onclick: function () { set('mac_address', mac, 'label'); } }) : null,
              null));
        })),
        ui.btn('Close', { sm: true, kind: 'ghost', onclick: function () { st.codes = null; } }));
    }
    function aiSection(c) {
      const av = ai.availability();
      const photos = c ? P.forIdentification(c.id) : [];
      const res = c && c.result;
      const parts = [];
      if (c && c.status === 'analyzing' && st.busy) parts.push(ui.note('info', 'Identifying the device from ' + U.plural(Math.min(photos.length, 4), 'photograph') + '…', { key: 'busy', icon: 'refresh' }));
      else if (c && c.status === 'analyzing') parts.push(ui.note('warn', 'An identification was started but did not finish (the screen was closed or the connection dropped).', { key: 'stale' }));
      if (st.error || (c && c.status === 'failed' && c.error)) parts.push(ui.note('danger', st.error || c.error, { key: 'err', title: 'Not identified' }));
      if (!av.ok) {
        parts.push(ui.note(av.reason === 'disabled' || av.reason === 'not_configured' || av.reason === 'error' ? 'warn' : 'info', av.message, { key: 'av', title: 'AI identification unavailable',
          action: av.canCheck ? h('div.btn-row', null, ui.btn(ai.checking ? 'Checking…' : 'Check again', { sm: true, disabled: ai.checking, onclick: function () { return ai.check(); } })) : null }));
      } else if (photos.length && !st.busy) {
        parts.push(h('div.stack', { key: 'go', style: 'gap:6px' },
          ui.btn(res ? 'Identify again' : 'Identify with AI', { kind: res ? 'secondary' : 'primary', lg: !res, block: true, icon: 'zap', id: 'ident-run', onclick: runAi }),
          h('span.field-hint', null, 'Sends ' + U.plural(Math.min(photos.length, (store.kvGet('ai_status') || {}).max_images || 4), 'photograph') + ' (crops first) and the category list — no room, building, user or network details — to ' + (av.provider || 'the workspace\'s AI provider') + '. You review every value before anything is saved.')));
      }
      if (res) parts.push(resultCard(c, res));
      return parts.length ? h('section.stack', { key: 'ai' }, ui.label('AI identification'), parts) : null;
    }
    function confChip(f) {
      if (!f || !f.value) return null;
      return ui.chip(f.confidence === 'confirmed' ? 'Read from ' + (f.evidence === 'logo' ? 'logo' : 'label') : f.confidence === 'probable' ? 'Probable' : 'Low confidence', f.confidence === 'confirmed' ? 'ok' : f.confidence === 'probable' ? 'warn' : 'danger');
    }
    function resultCard(c, res) {
      const i = c.selected_index || 0, dev = res.devices[i];
      return ui.card({ key: 'res', title: res.devices.length ? (res.devices.length === 1 ? 'Identified' : res.devices.length + ' devices found in the photographs') : 'Nothing identified', right: ui.chip(res.model || res.provider || 'AI', 'violet') },
        res.devices.length > 1 ? h('div.chip-scroll', null, res.devices.map(function (x, k) {
          return h('button', { type: 'button', key: 'd' + k, 'class': U.cx('pill', k === i && 'on'), onclick: function () { ID.selectDevice(c.id, k); } },
            (k + 1) + '. ' + ([x.manufacturer.value, x.model.value].filter(Boolean).join(' ') || x.category.value || 'Unidentified') + (x.location_in_image ? ' — ' + x.location_in_image : ''));
        })) : null,
        res.devices.length > 1 ? h('p.muted', null, 'Each device is saved on its own: confirm this one, then “Photograph next device” — or crop a photograph to one device and identify again.') : null,
        dev ? h('div.kv-list', null,
          [['Manufacturer', dev.manufacturer], ['Model', dev.model], ['Category', dev.category]].map(function (x) {
            return h('div.kv', { key: x[0] }, h('span.kv-k', null, x[0]), h('span.kv-v', null, x[1].value || h('span.muted', null, 'Not identified'), ' ', confChip(x[1])));
          }),
          [['Serial number', dev.serial_number], ['MAC address', dev.mac_address], ['IP address', dev.ip_address]].map(function (x) {
            return h('div.kv', { key: x[0] }, h('span.kv-k', null, x[0]), h('span.kv-v', null, x[1].value ? h('span.mono', null, x[1].value) : h('span.muted', null, 'Not visible'),
              x[1].value ? ui.chip(x[1].image_index != null ? 'Read from photograph ' + (x[1].image_index + 1) : 'Read from a label', 'ok') : null,
              x[1].raw_text ? h('span.field-hint.hint-warn', null, ' Unreadable or invalid text seen: “' + x[1].raw_text + '” — not used') : null));
          })) : null,
        dev && dev.model.alternatives.length ? ui.note('warn', 'Similar models: ' + [dev.model.value].concat(dev.model.alternatives).filter(Boolean).join(', ') + '. Check the label and choose the model below.', { title: 'Model not certain' }) : null,
        dev && dev.other_identifiers.length ? h('div.stack', { style: 'gap:6px' }, h('span.field-label', null, 'Other text on the labels'),
          h('div.list', null, dev.other_identifiers.map(function (x, k) {
            return h('div.row', { key: 'o' + k }, h('span.row-main', null, h('span.row-title', null, h('span.mono', null, x.value)), h('span.row-sub', null, x.label || 'Label text')));
          }))) : null,
        dev && (dev.needs_manual_review || dev.review_reasons.length) ? ui.note('warn', dev.review_reasons.length ? dev.review_reasons.join(' ') : 'The AI is not certain of this identification.', { title: 'Check before confirming' }) : null,
        res.notes ? h('p.muted', null, res.notes) : null,
        h('p.field-hint', null, 'The original answer is kept with the asset. Values marked “Probable” or “Low confidence” must be checked.'));
    }
    function srcChip(k) {
      const s = draft().sources[k];
      return s ? ui.chip(s === 'ai' ? 'AI' : s === 'label' ? 'Label' : 'Manual', s === 'ai' ? 'violet' : s === 'label' ? 'accent' : 'muted', { title: I.sourceLabel(s) }) : null;
    }
    function textField(k, label, o) {
      o = o || {};
      const d = draft(), sug = (d.suggest || {})[k] || [];
      const lid = 'dl-ident-' + k;
      return ui.field(h('span', null, label, ' ', srcChip(k)), h('div.stack', { style: 'gap:6px' },
        ui.input(d.values[k] || '', { id: 'ident-' + k, mono: o.mono, ph: o.ph, list: o.list ? lid : undefined, inputmode: o.inputmode,
          oninput: function (v) { set(k, k === 'mac_address' ? R.macFormat(v) : v); } }),
        o.list ? h('datalist', { id: lid }, o.list.map(function (x) { return h('option', { key: x, value: x }); })) : null,
        sug.length ? h('div.chip-scroll', null, h('span.field-hint', null, 'Suggestions:'), sug.map(function (s) {
          return h('button', { type: 'button', key: s, 'class': U.cx('pill', d.values[k] === s && 'on'), onclick: function () { set(k, s, 'ai', true); } }, s);
        })) : null), { half: o.half, key: k, div: true, hint: o.hint });
    }
    function idField(f) {
      const d = draft(), st2 = d.statuses[f.s] || 'unknown';
      const off = st2 === 'unavailable' || st2 === 'not_applicable';
      return h('div.field.ident', { key: f.k },
        h('div.ident-head', null, h('span.field-label', null, f.label, ' ', srcChip(f.k))),
        h('div.ident-row', null,
          ui.input(d.values[f.k] || '', { id: 'ident-' + f.k, mono: true, disabled: off, inputmode: f.k === 'ip_address' ? 'decimal' : undefined,
            ph: off ? S.label(S.ID_STATUS, st2) : f.k === 'mac_address' ? '00:00:00:00:00:00' : f.k === 'ip_address' ? '0.0.0.0' : f.k === 'switch_port' ? 'e.g. Gi1/0/12 or 1/0/18' : 'As printed on the label',
            oninput: function (v) { set(f.k, f.k === 'mac_address' ? R.macFormat(v) : f.k === 'ip_address' ? v.trim() : v); } }),
          ui.select(st2, S.ID_STATUS, { empty: false, cls: 'ident-status', aria: f.label + ' status', onchange: function (v) { ensure(); ID.setStatus(st.capId, f.s, v); } })),
        h('span', { 'class': U.cx('field-hint', f.k === 'switch_port' && !off && U.blank(d.values[f.k]) && 'hint-warn') },
          off ? 'Recorded as ' + S.label(S.ID_STATUS, st2).toLowerCase() + '. The asset is not counted as missing it.'
            : f.k === 'switch_port' && U.blank(d.values[f.k]) ? 'Required for a device with an IP address: the switch port it is patched to. If it cannot be traced, choose “Not accessible”.'
              : U.blank(d.values[f.k]) ? 'Leave empty if not visible, or choose “Not accessible” or “Not applicable”.' : 'Captured. Set a “Verified” status once checked.'));
    }
    function fieldsSection(c) {
      const d = draft();
      const problems = ID.validation(d);
      return h('section.stack', { key: 'fields' },
        ui.label('Device details'),
        h('div.form-grid', null,
          ui.field(h('span', null, 'Device category', h('span.req', null, ' *'), ' ', srcChip('category')),
            h('div.stack', { style: 'gap:6px' },
              ID.categoryPicker('ident-' + (c ? c.id : 'new'),d.values.category || '', { id: 'ident-category', onpick: function (v) { set('category', v); } }),
              ((d.suggest || {}).category || []).length ? h('div.chip-scroll', null, d.suggest.category.map(function (s) { return h('button', { type: 'button', key: s, 'class': 'pill', onclick: function () { set('category', s, 'ai', true); } }, s); })) : null),
            { key: 'category', div: true }),
          textField('manufacturer', 'Manufacturer', { half: true, list: I.manufacturers() }),
          textField('model', 'Model', { half: true, mono: true }),
          null),
        h('div.form-grid', null, I.ID_FIELDS.slice().sort(function (a, b) { return ['serial_number', 'mac_address', 'ip_address'].indexOf(a.k) - ['serial_number', 'mac_address', 'ip_address'].indexOf(b.k); }).map(idField),
          /* the switch port is asked for once there is an IP address */
          !U.blank(d.values.ip_address) ? idField(I.PORT) : null),
        problems.length ? ui.note('warn', problems.join(' ')) : null,
        h('div.form-grid', null,
          ui.field('Notes', ui.textarea(d.values.notes || '', { rows: 2, id: 'ident-notes', oninput: function (v) { set('notes', v); } }), { key: 'notes' })));
    }
    /* the room's listed devices: this capture may be one of them */
    function listedSection(c) {
      const t = ID.target(c);
      if (t) return ui.note('info', [h('span.mono', { key: 'c' }, t.code), ' · ' + (t.listed_text || R.deviceLabel(t))], { key: 'tgt', title: 'Confirming a listed device',
        action: h('div.btn-row', null, ui.btn('Not this one', { sm: true, kind: 'ghost', onclick: function () { ID.unlinkTarget(c.id); } })) });
      const listed = I.roomListed(st.roomId);
      if (!listed.length) return null;
      return h('section.stack', { key: 'listed' }, ui.label('Is it one of the listed devices?', h('span.count', null, String(listed.length))),
        h('div.chip-scroll', null, listed.slice(0, 30).map(function (x) {
          return h('button', { type: 'button', key: x.id, 'class': 'pill', onclick: function () { ensure(); ID.linkTarget(st.capId, x.id); } }, [x.manufacturer, x.model].filter(Boolean).join(' ') || x.listed_text || x.code);
        })),
        h('span.field-hint', null, 'Choosing one confirms that asset instead of adding a new one.'));
    }
    function dupSection(c) {
      const d = draft();
      const cands = I.candidatesFor(d.values, st.roomId, c && c.device_id);
      if (!cands.length) return null;
      const strong = cands.filter(function (e) { return e.strong; });
      return h('section.stack', { key: 'dup' }, ui.label('Possible duplicates', h('span.count', null, String(cands.length))),
        ui.note(strong.length ? 'danger' : 'info', strong.length ? 'A record with the same identifier already exists. When you confirm, you choose whether to merge the two or keep them as separate devices — nothing is merged by itself.'
          : 'This room already has a device of the same manufacturer and model. That is often correct (identical devices); make sure this is a different one.'),
        h('div.list', null, cands.slice(0, 6).map(function (e) {
          const x = e.device, rm = store.get('rooms', x.room_id);
          return ui.row({ key: x.id, left: icon('copy', 16), title: [h('span.mono', { key: 'c' }, x.code), ' ' + R.deviceLabel(x)], sub: e.reasons.join(' · ') + (rm ? ' · ' + R.roomLabel(rm) : ''),
            right: ui.chip(e.strong ? 'Same identifier' : 'Same model', e.strong ? 'danger' : 'warn'), onclick: function () { EV.assets.open(x.id); } });
        })));
    }
    return sheet;
  };

  /* ------------------------------------------------------------------ crop */
  ID.cropSheet = function (photo) {
    const st = { url: null, err: '', rect: null, start: null, busy: false };
    P.objectUrl(photo).then(function (u) { st.url = u; EV.redraw(); }, function (e) { st.err = e.message; EV.redraw(); });
    const pos = function (e) { const r = e.currentTarget.getBoundingClientRect(); return [U.clamp((e.clientX - r.left) / r.width, 0, 1), U.clamp((e.clientY - r.top) / r.height, 0, 1)]; };
    const sheet = ui.openSheet({
      size: 'full', title: 'Crop to one device', sub: 'Drag across the device. A cropped copy is added; the original photograph is kept.',
      render: function () {
        if (st.err) return ui.note('warn', st.err);
        if (!st.url) return h('div.viewer-wait', null, 'Loading image…');
        const r = st.rect;
        return h('div.crop-stage', { key: 'stage' },
          h('div.crop-box', { onpointerdown: function (e) { e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } st.start = pos(e); st.rect = { x: st.start[0], y: st.start[1], w: 0, h: 0 }; },
            onpointermove: function (e) { if (!st.start) return; const p = pos(e); st.rect = { x: Math.min(st.start[0], p[0]), y: Math.min(st.start[1], p[1]), w: Math.abs(p[0] - st.start[0]), h: Math.abs(p[1] - st.start[1]) }; EV.redraw(); },
            onpointerup: function () { st.start = null; }, onpointercancel: function () { st.start = null; } },
            h('img.crop-img', { src: st.url, alt: 'Photograph to crop', draggable: 'false' }),
            r && r.w > 0 ? h('div.crop-rect', { style: 'left:' + (r.x * 100) + '%;top:' + (r.y * 100) + '%;width:' + (r.w * 100) + '%;height:' + (r.h * 100) + '%' }) : null));
      },
      footer: function () {
        const ok = st.rect && st.rect.w > 0.03 && st.rect.h > 0.03;
        return [ui.btn('Cancel', { kind: 'ghost', key: 'c', onclick: function () { ui.closeSheet(sheet); } }), h('span.grow', { key: 'g' }),
          ui.btn(st.busy ? 'Saving…' : 'Use this crop', { kind: 'primary', key: 'ok', icon: 'check', disabled: !ok || st.busy, onclick: function () {
            st.busy = true;
            return ID.cropPhoto(photo, st.rect).then(function () { st.busy = false; ui.closeSheet(sheet); EV.toast('Cropped copy added (original kept)', 'ok'); }, function (e) { st.busy = false; EV.reportError(e, 'Crop'); });
          } })];
      },
      onClose: function () { P.releaseUrls(); }
    });
    return sheet;
  };
})();
