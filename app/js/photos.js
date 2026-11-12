/* photos.js — photograph capture, storage, gallery, viewer, rotation and annotation.
 * The original file is stored untouched; rotation/annotation produce a separate edited rendition.
 * No OCR or automatic reading of photographs is performed or implied. */
(function () {
  'use strict';
  const EV = window.EV, h = EV.h, U = EV.U, S = EV.S, store = EV.store, ui = EV.ui, icon = EV.icon, R = EV.rules;
  const P = (EV.photos = { nextCategory: {}, justAdded: null });
  const THUMB_EDGE = 300;

  /* ------------------------------------------------------------------ image helpers */
  function loadImage(blob) {
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = function () { resolve({ img: img, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('This image format cannot be decoded by this browser.')); };
      img.src = url;
    });
  }
  function drawScaled(img, maxEdge, quarterTurns) {
    const w = img.naturalWidth || img.width, hgt = img.naturalHeight || img.height;
    const scale = Math.min(1, maxEdge / Math.max(w, hgt));
    const dw = Math.max(1, Math.round(w * scale)), dh = Math.max(1, Math.round(hgt * scale));
    const turns = ((quarterTurns || 0) % 4 + 4) % 4;
    const c = document.createElement('canvas');
    c.width = turns % 2 ? dh : dw; c.height = turns % 2 ? dw : dh;
    const ctx = c.getContext('2d');
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate(turns * Math.PI / 2);
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    return c;
  }
  function canvasBlob(canvas, type, q) {
    return new Promise(function (resolve, reject) {
      if (canvas.toBlob) canvas.toBlob(function (b) { if (b) resolve(b); else reject(new Error('Image encoding failed')); }, type || 'image/jpeg', q == null ? 0.9 : q);
      else reject(new Error('Image encoding is not supported in this browser'));
    });
  }
  function readBuffer(blob) {
    if (blob.arrayBuffer) return blob.arrayBuffer();
    return new Promise(function (resolve, reject) {
      const fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(fr.error || new Error('File could not be read')); };
      fr.readAsArrayBuffer(blob);
    });
  }
  P.makeThumb = async function (blob) {
    const li = await loadImage(blob);
    try {
      const c = drawScaled(li.img, THUMB_EDGE, 0);
      return { thumb: c.toDataURL('image/jpeg', 0.68), width: li.img.naturalWidth, height: li.img.naturalHeight };
    } finally { URL.revokeObjectURL(li.url); }
  };

  /* ------------------------------------------------------------------ ingest */
  P.add = async function (file, ctx) {
    ctx = ctx || {};
    const data = await readBuffer(file);
    if (!data || !data.byteLength) throw new Error('The selected file is empty.');
    const mime = file.type || 'image/jpeg';
    let meta = { thumb: '', width: null, height: null };
    try { meta = await P.makeThumb(file); } catch (e) { /* stored without preview; original is still kept */ }
    const room = ctx.room || (ctx.audit ? R.auditRooms(ctx.audit)[0] : null) || null;
    const id = U.uid();
    try { await store.blobPut(id, data, mime); }
    catch (e) { throw new Error('The photograph could not be stored on this device' + (e && e.message ? ' (' + e.message + ')' : '') + '. Free up storage or export and remove older photographs.'); }
    const lm = file.lastModified && file.lastModified <= Date.now() + 60000 ? new Date(file.lastModified).toISOString() : U.now();
    const rec = store.create('photos', {
      id: id, building_id: room ? room.building_id : (ctx.building_id || null), floor_id: room ? room.floor_id : (ctx.floor_id || null), room_id: room ? room.id : null,
      audit_id: ctx.audit ? ctx.audit.id : (ctx.audit_id || null), device_id: ctx.device_id || null, finding_id: ctx.finding_id || null, test_id: ctx.test_id || null,
      backlog_item_id: ctx.backlog_item_id || null, it_request_id: ctx.it_request_id || null, spare_item_id: ctx.spare_item_id || null,
      category: ctx.category || 'Other', description: ctx.description || '', taken_at: ctx.taken_at || lm, original_filename: file.name || '', mime: mime,
      size_bytes: data.byteLength, width: meta.width, height: meta.height, has_edit: false, thumb: meta.thumb, remote_ref: '', remote_edit_ref: '', is_demo: !!ctx.demo
    }, { silent: true });   /* its history entry is the "Photograph added" line below */
    if (!ctx.silent) store.log({ action: 'photo_added', table: 'photos', rec: rec, summary: 'Photograph added — ' + rec.category + (room ? ' · ' + (room.number || room.name) : '') });
    return rec;
  };
  P.ingest = async function (files, ctx) {
    const out = [];
    for (const f of files) {
      if (f.type && f.type.indexOf('image/') !== 0) { EV.toast('"' + f.name + '" is not an image and was skipped.', 'warn'); continue; }
      try { out.push(await P.add(f, ctx)); }
      catch (e) { EV.reportError(e, 'Photograph not saved'); }
    }
    if (out.length) {
      P.justAdded = out[out.length - 1].id;
      EV.toast(out.length === 1 ? 'Photograph saved · ' + out[0].category : out.length + ' photographs saved', 'ok');
    }
    EV.redraw();
    return out;
  };
  P.remove = async function (photo) {
    /* the record stays as history (and is reported once as deleted in the next export); the thumbnail and the image
       files are removed from this device by store.remove */
    store.remove('photos', photo.id, { silent: true });
    store.log({ action: 'photo_removed', table: 'photos', rec: photo, summary: 'Photograph removed — ' + (photo.code || '') + ' ' + (photo.category || '') });
    P.releaseUrls();
  };

  /* ------------------------------------------------------------------ binaries */
  const urls = new Map();
  P.getBlob = async function (photo, original) {
    const wantEdit = !!photo.has_edit && !original;
    let rec = await store.blobGet(wantEdit ? photo.id + ':edit' : photo.id);
    /* not on this device: fetch the wanted rendition from the workspace before settling for anything else */
    if (!rec && EV.sync && EV.sync.fetchPhoto) rec = await EV.sync.fetchPhoto(photo, !wantEdit);
    if (!rec && wantEdit) rec = await store.blobGet(photo.id);
    if (!rec) return null;
    return new Blob([rec.data], { type: rec.mime || photo.mime || 'image/jpeg' });
  };
  P.objectUrl = async function (photo, original) {
    const key = photo.id + (photo.has_edit && !original ? ':edit:' + photo.updated_at : '');
    if (urls.has(key)) return urls.get(key);
    const blob = await P.getBlob(photo, original);
    if (!blob) throw new Error('The image file for this photograph is not on this device.');
    const url = URL.createObjectURL(blob);
    urls.set(key, url);
    return url;
  };
  P.releaseUrls = function () { urls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) { /* ignore */ } }); urls.clear(); };
  async function saveEdit(photo, canvas) {
    const blob = await canvasBlob(canvas, 'image/jpeg', 0.9);
    const data = await readBuffer(blob);
    await store.blobPut(photo.id + ':edit', data, 'image/jpeg');
    const tc = drawScaled(canvas, THUMB_EDGE, 0);
    /* remote_edit_ref is cleared so the next synchronisation uploads this rendition, not just the first one ever made */
    store.update('photos', photo.id, { has_edit: true, thumb: tc.toDataURL('image/jpeg', 0.68), remote_edit_ref: '' });
  }
  P.rotate = async function (photo) {
    const blob = await P.getBlob(photo, false);
    if (!blob) throw new Error('Image file not available on this device.');
    const li = await loadImage(blob);
    try { await saveEdit(photo, drawScaled(li.img, 3000, 1)); } finally { URL.revokeObjectURL(li.url); }
  };
  P.revert = async function (photo) {
    await store.blobDelete(photo.id + ':edit');
    const blob = await P.getBlob(Object.assign({}, photo, { has_edit: false }), true);
    let thumb = photo.thumb;
    if (blob) { try { thumb = (await P.makeThumb(blob)).thumb; } catch (e) { /* keep */ } }
    store.update('photos', photo.id, { has_edit: false, thumb: thumb, remote_edit_ref: '' });
  };
  /* Bytes for export. mode: 'original' | 'optimized' (max 2048 px JPEG). Returns {bytes: Uint8Array, ext, mime} or null. */
  P.exportBytes = async function (photo, mode, edited) {
    const blob = await P.getBlob(photo, !edited);
    if (!blob) return null;
    if (mode === 'optimized') {
      try {
        const li = await loadImage(blob);
        try {
          const out = await canvasBlob(drawScaled(li.img, 2048, 0), 'image/jpeg', 0.85);
          return { bytes: new Uint8Array(await readBuffer(out)), ext: 'jpg', mime: 'image/jpeg' };
        } finally { URL.revokeObjectURL(li.url); }
      } catch (e) { /* fall through to the stored bytes */ }
    }
    const mime = blob.type || photo.mime || 'image/jpeg';
    const ext = mime.indexOf('png') >= 0 ? 'png' : mime.indexOf('webp') >= 0 ? 'webp' : mime.indexOf('heic') >= 0 ? 'heic' : mime.indexOf('gif') >= 0 ? 'gif' : 'jpg';
    return { bytes: new Uint8Array(await readBuffer(blob)), ext: ext, mime: mime };
  };
  /* JPEG rendition for PDF embedding (max edge px). Returns {bytes, width, height} or null. */
  P.jpegFor = async function (photo, maxEdge) {
    const blob = await P.getBlob(photo, false);
    if (!blob) return null;
    try {
      const li = await loadImage(blob);
      try {
        const c = drawScaled(li.img, maxEdge || 1100, 0);
        /* flatten onto white so transparent PNGs do not render black */
        const flat = document.createElement('canvas'); flat.width = c.width; flat.height = c.height;
        const ctx = flat.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, flat.width, flat.height); ctx.drawImage(c, 0, 0);
        const out = await canvasBlob(flat, 'image/jpeg', 0.8);
        return { bytes: new Uint8Array(await readBuffer(out)), width: flat.width, height: flat.height };
      } finally { URL.revokeObjectURL(li.url); }
    } catch (e) { return null; }
  };

  /* ------------------------------------------------------------------ queries */
  function newest(list) { return U.sortBy(list, function (p) { return p.taken_at || p.created_at; }, true); }
  P.forAudit = function (auditId) { return newest(store.by('photos', 'audit_id', auditId)); };
  P.forRoom = function (roomId) { return newest(store.by('photos', 'room_id', roomId)); };
  P.forDevice = function (deviceId) { return newest(store.by('photos', 'device_id', deviceId)); };
  P.forTest = function (testId) { return newest(store.by('photos', 'test_id', testId)); };
  P.forFinding = function (findingId) { return newest(store.by('photos', 'finding_id', findingId)); };

  /* ------------------------------------------------------------------ capture controls */
  /* A <label> bound to a hidden file input: one tap opens the phone camera natively (no scripted click needed). */
  P.captureLabel = function (o, children) {
    const id = 'cap-' + o.key;
    return h('label', { 'class': U.cx(o.cls, 'capture'), 'for': id, key: o.key, role: 'button', title: o.title },
      children,
      h('input', { id: id, type: 'file', accept: 'image/*', capture: o.library ? null : 'environment', multiple: !!o.library, 'class': 'file-input', tabindex: '-1',
        onchange: function (e) {
          const files = Array.prototype.slice.call(e.target.files || []);
          e.target.value = '';
          if (!files.length) return undefined;
          const ctx = typeof o.ctx === 'function' ? o.ctx() : (o.ctx || {});
          return P.ingest(files, ctx).then(function (recs) { if (o.after) o.after(recs); });
        } }));
  };
  P.captureButton = function (o) {
    return P.captureLabel(Object.assign({}, o, { cls: U.cx('btn', 'btn-' + (o.kind || 'primary'), o.block && 'btn-block', o.lg && 'btn-lg', o.sm && 'btn-sm', o.cls) }),
      [icon(o.icon || (o.library ? 'image' : 'camera'), o.sm ? 15 : 18), o.label ? h('span', null, o.label) : null]);
  };
  /* Stand-alone capture panel used from the quick-action button when no audit screen is open. */
  P.captureSheet = function (ctx) {
    const key = ctx.audit ? ctx.audit.id : ctx.room.id;
    const added = [];
    const getCtx = function () { return { audit: ctx.audit, room: ctx.room, category: P.nextCategory[key] || 'Room overview' }; };
    const after = function (recs) { recs.forEach(function (r) { added.push(r.id); }); };
    const sheet = ui.openSheet({
      title: 'Take photos', sub: R.roomLabel(ctx.room) + (ctx.audit ? ' · audit ' + ctx.audit.code : ''), size: 'auto',
      render: function () {
        const list = added.map(function (id) { return store.get('photos', id); }).filter(Boolean);
        return [
          ui.label('Category for the next photo'),
          P.categoryPicker(key, { dflt: 'Room overview' }),
          h('div.btn-row', null,
            P.captureButton({ key: 'cs-cam-' + key, label: 'Open camera', lg: true, cls: 'grow', ctx: getCtx, after: after }),
            P.captureButton({ key: 'cs-lib-' + key, label: 'Library', library: true, kind: 'secondary', lg: true, ctx: getCtx, after: after })),
          list.length ? P.gallery(list) : h('p.muted', null, 'Photographs are saved to this room' + (ctx.audit ? ' and its open audit.' : '.'))
        ];
      },
      footer: function () { return [h('span.grow', { key: 'g' }), ui.btn('Done', { kind: 'primary', key: 'd', onclick: function () { ui.closeSheet(sheet); } })]; }
    });
    return sheet;
  };
  P.categoryPicker = function (key, o) {
    o = o || {};
    const cur = P.nextCategory[key] || o.dflt || S.PHOTO_CATEGORIES[0];
    return h('div.chip-scroll', { role: 'group', 'aria-label': 'Photo category' }, S.PHOTO_CATEGORIES.map(function (c) {
      return h('button', { type: 'button', key: c, 'class': U.cx('pill', c === cur && 'on'), onclick: function () { P.nextCategory[key] = c; } }, c);
    }));
  };

  /* ------------------------------------------------------------------ gallery */
  P.thumb = function (p, list, o) {
    o = o || {};
    return h('button', { type: 'button', 'class': U.cx('thumb', p.id === P.justAdded && 'thumb-new'), key: p.id, title: p.description || p.category,
      onclick: function () { P.openViewer(p.id, (list || [p]).map(function (x) { return x.id; })); } },
      p.thumb ? h('img', { src: p.thumb, alt: p.description || p.category, loading: 'lazy' }) : h('span.thumb-none', null, icon('image', 22)),
      o.caption !== false ? h('span.thumb-cap', null, p.category) : null,
      p.has_edit ? h('span.thumb-flag', { title: 'Annotated / rotated' }, icon('edit', 11)) : null,
      p.device_id ? h('span.thumb-flag.thumb-flag-l', { title: 'Linked to a device' }, icon('cpu', 11)) : null);
  };
  P.gallery = function (photos, o) {
    o = o || {};
    if (!photos.length) return o.empty === false ? null : ui.empty({ icon: 'camera', title: o.emptyTitle || 'No photographs yet', text: o.emptyText });
    if (o.group) {
      const groups = U.groupBy(photos, function (p) { return p.category || 'Other'; });
      const order = S.PHOTO_CATEGORIES.filter(function (c) { return groups.has(c); }).concat(Array.from(groups.keys()).filter(function (c) { return S.PHOTO_CATEGORIES.indexOf(c) < 0; }));
      return h('div.gallery-groups', null, order.map(function (c) {
        const list = groups.get(c);
        return h('div.gallery-group', { key: c }, h('div.gallery-title', null, c, h('span.count', null, String(list.length))),
          h('div.gallery', null, list.map(function (p) { return P.thumb(p, photos, { caption: false }); })));
      }));
    }
    return h('div.gallery', null, photos.map(function (p) { return P.thumb(p, photos, o); }));
  };
  /* Compact strip used inside test rows, device editors and backlog items. */
  P.strip = function (photos) {
    return photos.length ? h('div.photo-strip', null, photos.map(function (p) { return P.thumb(p, photos, { caption: false }); })) : null;
  };

  /* ------------------------------------------------------------------ viewer (metadata, rotate, annotate) */
  P.openViewer = function (photoId, ids) {
    const st = { id: photoId, url: null, loading: true, err: null, busy: false, annot: null };
    ids = ids && ids.length ? ids : [photoId];
    function photo() { return store.get('photos', st.id); }
    /* Every asynchronous result is applied only if the viewer is still on the photograph it was started for. */
    function load() {
      const p = photo(), id = st.id;
      st.loading = true; st.url = null; st.err = null;
      if (!p) { st.loading = false; return; }
      P.objectUrl(p).then(function (u) { if (st.id !== id) return; st.url = u; st.loading = false; EV.redraw(); },
        function (e) { if (st.id !== id) return; st.err = e.message; st.loading = false; EV.redraw(); });
    }
    function go(delta) {
      if (st.busy || st.annot) return;
      const i = ids.indexOf(st.id);
      const n = ids[(i + delta + ids.length) % ids.length];
      if (n && n !== st.id) {
        P.releaseUrls();   /* keep only the photograph on screen in memory while paging through a gallery */
        st.id = n; load();
      }
    }
    function busy(promise, okMsg) {
      st.busy = true;
      return promise.then(function () { st.busy = false; if (okMsg) EV.toast(okMsg, 'ok'); load(); }, function (e) { st.busy = false; EV.reportError(e); EV.redraw(); });
    }
    /* --- annotation --- */
    function startAnnot() {
      const p = photo(), id = st.id;
      if (st.busy) return;
      st.busy = true;
      P.getBlob(p, false).then(function (b) { if (!b) throw new Error('The image file for this photograph is not on this device.'); return loadImage(b); }).then(function (li) {
        st.busy = false;
        if (st.id !== id || ui.sheets.indexOf(sheet) < 0) { try { URL.revokeObjectURL(li.url); } catch (e) { /* ignore */ } EV.redraw(); return; }
        st.annot = { photoId: id, img: li.img, url: li.url, strokes: [], color: '#FF3B30', drawing: null, canvas: null, base: null };
        EV.redraw();
      }, function (e) { st.busy = false; EV.reportError(e); EV.redraw(); });
    }
    function paint() {
      const a = st.annot; if (!a || !a.canvas) return;
      const c = a.canvas, ctx = c.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      /* the photograph is scaled to the canvas once; each stroke update then only copies that bitmap */
      if (!a.base) { a.base = document.createElement('canvas'); a.base.width = c.width; a.base.height = c.height; a.base.getContext('2d').drawImage(a.img, 0, 0, c.width, c.height); }
      ctx.drawImage(a.base, 0, 0);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      a.strokes.concat(a.drawing ? [a.drawing] : []).forEach(function (s) {
        ctx.strokeStyle = s.color; ctx.lineWidth = Math.max(3, c.width / 180);
        ctx.beginPath();
        s.pts.forEach(function (pt, i) { if (i) ctx.lineTo(pt[0] * c.width, pt[1] * c.height); else ctx.moveTo(pt[0] * c.width, pt[1] * c.height); });
        if (s.pts.length === 1) ctx.lineTo(s.pts[0][0] * c.width + 0.1, s.pts[0][1] * c.height + 0.1);
        ctx.stroke();
      });
    }
    function initCanvas(el) {
      const a = st.annot; if (!a) return;
      const w = a.img.naturalWidth, hgt = a.img.naturalHeight;
      const scale = Math.min(1, 2048 / Math.max(w, hgt));
      el.width = Math.round(w * scale); el.height = Math.round(hgt * scale);
      a.canvas = el;
      paint();
    }
    function pt(e) {
      const r = st.annot.canvas.getBoundingClientRect();
      return [U.clamp((e.clientX - r.left) / r.width, 0, 1), U.clamp((e.clientY - r.top) / r.height, 0, 1)];
    }
    function endAnnot(save) {
      const a = st.annot; if (!a) return;
      if (save && a.strokes.length) {
        /* saved onto the photograph the annotation was started for, whatever is on screen now */
        const p = store.get('photos', a.photoId);
        if (!p) { URL.revokeObjectURL(a.url); st.annot = null; return; }
        busy(saveEdit(p, a.canvas).then(function () { URL.revokeObjectURL(a.url); st.annot = null; }), 'Annotation saved (original kept)');
      } else { URL.revokeObjectURL(a.url); st.annot = null; }
    }
    load();
    const sheet = ui.openSheet({
      size: 'full',
      title: function () { const p = photo(); return p ? 'Photograph ' + (p.code || '') : 'Photograph'; },
      sub: function () { const p = photo(); return p ? U.fmtDateTime(p.taken_at) + (R.where(p) ? ' · ' + R.where(p) : '') : ''; },
      render: function () {
        const p = photo();
        if (!p) return ui.empty({ icon: 'image', title: 'This photograph was removed.' });
        const room = store.get('rooms', p.room_id);
        const devices = room ? R.roomDevices(room.id) : [];
        if (st.annot) {
          const a = st.annot;
          return h('div.annot', { key: 'annot' },
            h('div.annot-bar', null,
              h('span.label', null, 'Draw on the photo'),
              ['#FF3B30', '#FFD60A', '#3D8BFF', '#FFFFFF'].map(function (c) {
                return h('button', { type: 'button', key: c, 'class': U.cx('swatch', a.color === c && 'on'), style: 'background:' + c, 'aria-label': 'Pen colour ' + c, onclick: function () { a.color = c; } });
              }),
              ui.btn('Undo', { sm: true, kind: 'ghost', icon: 'undo', disabled: !a.strokes.length, onclick: function () { a.strokes.pop(); paint(); } })),
            h('div.annot-stage', null, h('canvas', { key: 'annot-canvas', 'class': 'annot-canvas', ref: initCanvas, skipChildren: true,
              onpointerdown: function (e) { e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } a.drawing = { color: a.color, pts: [pt(e)] }; paint(); },
              onpointermove: function (e) { if (!a.drawing) return; a.drawing.pts.push(pt(e)); paint(); },
              onpointerup: function () { if (a.drawing) { a.strokes.push(a.drawing); a.drawing = null; paint(); } },
              onpointercancel: function () { a.drawing = null; paint(); } })),
            h('div.btn-row', null,
              ui.btn('Cancel', { kind: 'ghost', onclick: function () { endAnnot(false); } }),
              h('span.grow'),
              ui.btn('Save annotation', { kind: 'primary', icon: 'check', disabled: !a.strokes.length || st.busy, onclick: function () { endAnnot(true); } })));
        }
        const finding = p.finding_id ? store.get('findings', p.finding_id) : null;
        return h('div.viewer', { key: 'view' },
          h('div.viewer-stage', null,
            st.loading ? h('div.viewer-wait', null, 'Loading image…')
              : st.err ? ui.note('warn', st.err)
                : h('img.viewer-img', { src: st.url, alt: p.description || p.category }),
            ids.length > 1 ? ui.iconBtn('chev-left', { cls: 'viewer-nav viewer-prev', title: 'Previous photograph', disabled: st.busy, onclick: function () { go(-1); } }) : null,
            ids.length > 1 ? ui.iconBtn('chev-right', { cls: 'viewer-nav viewer-next', title: 'Next photograph', disabled: st.busy, onclick: function () { go(1); } }) : null),
          h('div.btn-row.wrap', null,
            ui.btn('Rotate', { sm: true, icon: 'rotate', disabled: st.busy || !!st.err, onclick: function () { busy(P.rotate(p), 'Rotated (original kept)'); } }),
            ui.btn('Annotate', { sm: true, icon: 'edit', disabled: st.busy || !!st.err, onclick: startAnnot }),
            p.has_edit ? ui.btn('Revert to original', { sm: true, kind: 'ghost', icon: 'undo', disabled: st.busy, onclick: function () { busy(P.revert(p), 'Reverted to the original image'); } }) : null,
            ui.btn('Save file', { sm: true, kind: 'ghost', icon: 'download', disabled: st.busy || !!st.err, onclick: function () {
              return P.exportBytes(p, 'original', p.has_edit).then(function (b) {
                if (!b) { EV.toast('Image file is not on this device.', 'warn'); return; }
                return EV.saveFile(new Blob([b.bytes], { type: b.mime }), (p.code || 'photo') + '.' + b.ext, b.mime).then(function (r) { if (!r.ok) EV.toast(r.message || 'File could not be saved here.', 'warn'); });
              });
            } })),
          h('div.form-grid', null,
            ui.field('Category', ui.select(p.category, S.PHOTO_CATEGORIES, { empty: false, onchange: function (v) { store.update('photos', p.id, { category: v }); } }), { half: true }),
            /* a device this photograph is already linked to stays selectable even when it is archived or in another room */
            ui.field('Linked device', ui.select(p.device_id, (function () {
              const opts = devices.map(function (d) { return [d.id, R.deviceLabel(d)]; });
              const cur = p.device_id && !devices.some(function (d) { return d.id === p.device_id; }) ? store.getAny('devices', p.device_id) : null;
              if (p.device_id && !devices.some(function (d) { return d.id === p.device_id; })) opts.unshift([p.device_id, cur ? R.deviceLabel(cur) + (cur.deleted_at ? ' (deleted)' : cur.archived ? ' (archived)' : ' (another room)') : 'Device no longer recorded']);
              return opts;
            })(), { placeholder: 'Not linked to a device',
              onchange: function (v) { store.update('photos', p.id, { device_id: v || null }); } }), { half: true }),
            ui.field('Description (optional)', ui.textarea(p.description, { rows: 2, ph: 'What this photograph shows', oninput: function (v) { store.update('photos', p.id, { description: v }); } }))),
          h('div.kv-list', null,
            ui.kv('Captured', U.fmtDateTime(p.taken_at)),
            ui.kv('Location', [((store.get('buildings', p.building_id) || {}).name), R.where(p)].filter(Boolean).join(' · ')),
            ui.kv('Audit', (store.get('audits', p.audit_id) || {}).code, { mono: true }),
            finding ? ui.kv('Finding', finding.code + ' — ' + finding.title) : null,
            ui.kv('Original file', (p.original_filename || '—') + ' · ' + U.bytes(p.size_bytes) + (p.width ? ' · ' + p.width + '×' + p.height : '')),
            p.has_edit ? ui.kv('Edits', 'Edited rendition shown; original preserved') : null));
      },
      footer: function () {
        const p = photo();
        if (!p || st.annot) return null;
        return [
          ui.btn('Delete', { kind: 'ghost-danger', icon: 'trash', key: 'del', disabled: st.busy, onclick: function () {
            ui.confirm({ title: 'Delete this photograph?', message: 'The image is deleted from this device and left out of future exports. This cannot be undone.', confirm: 'Delete', danger: true }).then(function (ok) {
              if (!ok) return;
              const i = ids.indexOf(p.id);
              P.remove(p);
              ids.splice(i, 1);
              if (ids.length) { st.id = ids[Math.min(i, ids.length - 1)]; load(); } else ui.closeSheet(sheet);
            });
          } }),
          h('span.grow', { key: 'g' }),
          ui.btn('Done', { kind: 'primary', key: 'done', onclick: function () { ui.closeSheet(sheet); } })
        ];
      },
      onClose: function () { if (st.annot) { try { URL.revokeObjectURL(st.annot.url); } catch (e) { /* ignore */ } } P.releaseUrls(); if (P.justAdded === st.id) P.justAdded = null; }
    });
    return sheet;
  };

  /* ------------------------------------------------------------------ synthetic demo imagery (clearly labelled) */
  P.demoBlob = function (title, subtitle, hue) {
    const c = document.createElement('canvas');
    c.width = 1280; c.height = 960;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 1280, 960);
    g.addColorStop(0, 'hsl(' + hue + ',32%,20%)'); g.addColorStop(1, 'hsl(' + ((hue + 40) % 360) + ',38%,10%)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 1280, 960);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
    for (let x = 0; x < 1280; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 960); ctx.stroke(); }
    for (let y = 0; y < 960; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1280, y); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    for (let i = 0; i < 6; i++) ctx.fillRect(180 + i * 160, 380 + ((i * 53) % 90), 110, 300 - ((i * 37) % 120));
    ctx.fillStyle = 'rgba(240,179,76,0.95)'; ctx.fillRect(0, 0, 1280, 74);
    ctx.fillStyle = '#10141c'; ctx.font = '600 34px -apple-system, Segoe UI, Arial, sans-serif'; ctx.textBaseline = 'middle';
    ctx.fillText('DEMO DATA — SYNTHETIC IMAGE, NOT A PHOTOGRAPH OF A REAL SPACE', 32, 38);
    ctx.fillStyle = '#fff'; ctx.font = '700 64px -apple-system, Segoe UI, Arial, sans-serif'; ctx.fillText(title, 64, 190);
    ctx.fillStyle = 'rgba(255,255,255,0.72)'; ctx.font = '400 36px -apple-system, Segoe UI, Arial, sans-serif'; ctx.fillText(subtitle || '', 64, 262);
    return canvasBlob(c, 'image/jpeg', 0.82);
  };
})();
