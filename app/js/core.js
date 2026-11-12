/* AV ENVIRONMENT INTELLIGENCE
 * core.js — runtime foundation: environment, utilities, virtual-DOM renderer, router, icons, file helpers.
 * Zero third-party dependencies by design (reviewable supply chain, no external requests). */
(function () {
  'use strict';
  const EV = (window.EV = window.EV || {});

  EV.APP = {
    name: 'AV ENVIRONMENT INTELLIGENCE',
    short: 'AV Environment Intelligence',
    tagline: 'See the environment. Understand the infrastructure. Improve the experience.',
    version: '1.0.0',
    build: '2026-11-12',
    exportFormat: '1.0'
  };

  /* Start the application again from nothing (after the device has been erased). */
  EV.restart = function () { try { localStorage.removeItem('ev.route'); } catch (e) { /* ignore */ } try { location.reload(); } catch (e) { /* ignore */ } };

  EV.pages = {};    /* route name → render function (registered by pages/*.js) */
  EV.editors = {};  /* record editors opened from anywhere (registered by pages/*.js) */

  /* ------------------------------------------------------------------ environment */
  let embedded = false;
  try { embedded = window.self !== window.top; } catch (e) { embedded = true; }
  const ua = navigator.userAgent || '';
  EV.env = {
    embedded: embedded,
    hasClaude: !!(window.claude && typeof window.claude.use === 'function'),
    ios: /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
    touch: ('ontouchstart' in window) || navigator.maxTouchPoints > 0,
    standalone: (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true,
    secure: !!window.isSecureContext,
    subtle: !!(window.crypto && window.crypto.subtle)
  };
  /* hosted = published as a page on claude.ai (a demonstration copy, never an approved deployment): the host provides
     `window.claude.use`, refuses downloads the page starts itself, and passes no "#/path" addresses */
  EV.env.hosted = EV.env.hasClaude;
  if (embedded || EV.env.hasClaude) { try { document.documentElement.classList.add('embedded'); } catch (e) { /* ignore */ } }

  /* Claude artifact runtime capabilities (only present when hosted as a Claude artifact). */
  const capCache = {};
  EV.cap = function (name) {
    if (!EV.env.hasClaude) return Promise.resolve(null);
    if (!capCache[name]) {
      try { capCache[name] = Promise.resolve(window.claude.use(name)).catch(function () { return null; }); }
      catch (e) { capCache[name] = Promise.resolve(null); }
    }
    return capCache[name];
  };

  /* ------------------------------------------------------------------ utilities */
  const U = (EV.U = {});
  U.uid = function () {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    const b = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const s = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return s.slice(0, 8) + '-' + s.slice(8, 12) + '-' + s.slice(12, 16) + '-' + s.slice(16, 20) + '-' + s.slice(20);
  };
  /* Deterministic UUID for a record whose identity is a natural key: a link between two records, a tracked follow-up,
   * a per-audit section state. Two devices that create the same link while offline produce the same id, so
   * synchronisation merges the rows instead of duplicating them. Stable and well spread (cyrb128); not random, not secret. */
  U.keyId = function (kind, key) {
    const str = kind + '|' + key;
    let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (let i = 0, k; i < str.length; i++) {
      k = str.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    h1 ^= (h2 ^ h3 ^ h4); h2 ^= h1; h3 ^= h1; h4 ^= h1;
    const x = [h1, h2, h3, h4].map(function (h) { return ('00000000' + (h >>> 0).toString(16)).slice(-8); }).join('');
    /* laid out as a version-8 (application-defined), variant-1 UUID */
    return x.slice(0, 8) + '-' + x.slice(8, 12) + '-8' + x.slice(13, 16) + '-' + ((parseInt(x.charAt(16), 16) & 3) | 8).toString(16) + x.slice(17, 20) + '-' + x.slice(20, 32);
  };
  U.pad = function (n, w) { return String(n).padStart(w, '0'); };
  U.now = function () { return new Date().toISOString(); };
  U.localDate = function (d) {
    d = d ? new Date(d) : new Date();
    return d.getFullYear() + '-' + U.pad(d.getMonth() + 1, 2) + '-' + U.pad(d.getDate(), 2);
  };
  U.asDate = function (v) {
    if (!v) return null;
    if (v instanceof Date) return v;
    const d = new Date(String(v).length === 10 ? v + 'T12:00:00' : v);
    return isNaN(d.getTime()) ? null : d;
  };
  U.fmtDate = function (v) {
    const d = U.asDate(v); if (!d) return '—';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };
  U.fmtDateTime = function (v) {
    const d = U.asDate(v); if (!d) return '—';
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  };
  U.fmtTime = function (v) {
    const d = U.asDate(v); if (!d) return '—';
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  };
  U.ago = function (v) {
    const d = U.asDate(v); if (!d) return '—';
    const s = (Date.now() - d.getTime()) / 1000;
    if (s < 45) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    if (s < 604800) return Math.round(s / 86400) + ' d ago';
    return U.fmtDate(d);
  };
  /* Local ISO 8601 with numeric UTC offset, e.g. 2026-11-11T17:14:03-05:00 */
  U.isoLocal = function (v) {
    const d = v ? new Date(v) : new Date();
    const off = -d.getTimezoneOffset();
    const sign = off >= 0 ? '+' : '-';
    const a = Math.abs(off);
    return d.getFullYear() + '-' + U.pad(d.getMonth() + 1, 2) + '-' + U.pad(d.getDate(), 2) + 'T' +
      U.pad(d.getHours(), 2) + ':' + U.pad(d.getMinutes(), 2) + ':' + U.pad(d.getSeconds(), 2) +
      sign + U.pad(Math.floor(a / 60), 2) + ':' + U.pad(a % 60, 2);
  };
  U.tz = function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local'; } catch (e) { return 'local'; } };
  U.debounce = function (fn, ms) {
    let t = 0;
    const d = function () { const a = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms); };
    d.cancel = function () { clearTimeout(t); };
    return d;
  };
  U.clone = function (o) { return o == null ? o : JSON.parse(JSON.stringify(o)); };
  U.groupBy = function (arr, fn) {
    const m = new Map();
    for (let i = 0; i < arr.length; i++) { const k = fn(arr[i]); const g = m.get(k); if (g) g.push(arr[i]); else m.set(k, [arr[i]]); }
    return m;
  };
  U.natCmp = function (a, b) { return String(a == null ? '' : a).localeCompare(String(b == null ? '' : b), undefined, { numeric: true, sensitivity: 'base' }); };
  U.sortBy = function (arr, fn, desc) {
    const out = arr.slice();
    out.sort(function (x, y) {
      const a = fn(x), b = fn(y);
      let r;
      if (typeof a === 'number' && typeof b === 'number') r = a - b; else r = U.natCmp(a, b);
      return desc ? -r : r;
    });
    return out;
  };
  U.uniq = function (arr) { return Array.from(new Set(arr)); };
  U.sum = function (arr, fn) { let s = 0; for (let i = 0; i < arr.length; i++) s += fn ? fn(arr[i]) : arr[i]; return s; };
  U.pct = function (n, d) { return d > 0 ? Math.round((n / d) * 100) : 0; };
  U.clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
  U.bytes = function (n) {
    if (!n) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB']; let i = 0; let v = n;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return (v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)) + ' ' + u[i];
  };
  U.slug = function (s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x'; };
  U.fileSafe = function (s) { return String(s == null ? '' : s).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'x'; };
  U.blank = function (v) { return v == null || (typeof v === 'string' && v.trim() === ''); };
  U.trunc = function (s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  U.plural = function (n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); };
  U.cx = function () {
    const out = [];
    for (let i = 0; i < arguments.length; i++) { const a = arguments[i]; if (a) out.push(a); }
    return out.join(' ');
  };
  U.sha256Hex = async function (data) {
    if (!EV.env.subtle) return null;
    let buf;
    if (typeof data === 'string') buf = new TextEncoder().encode(data);
    else if (data instanceof Blob) buf = await data.arrayBuffer();
    else buf = data;
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.prototype.map.call(new Uint8Array(digest), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  };

  /* ------------------------------------------------------------------ CSV */
  EV.csv = {
    cell: function (v, guard) {
      if (v == null) return '';
      let s;
      if (typeof v === 'boolean') s = v ? 'true' : 'false';
      else if (typeof v === 'object') s = JSON.stringify(v);
      else s = String(v);
      /* Spreadsheet formula-injection guard for human-facing CSV downloads. */
      if (guard && /^[=+\-@\t\r]/.test(s) && isNaN(Number(s))) s = "'" + s;
      return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    },
    encode: function (rows, opts) {
      opts = opts || {};
      const self = this;
      const body = rows.map(function (r) { return r.map(function (c) { return self.cell(c, opts.guard); }).join(','); }).join('\r\n') + '\r\n';
      return (opts.bom ? '﻿' : '') + body;
    }
  };

  /* ------------------------------------------------------------------ file save / share */
  EV.saveFile = async function (data, filename, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
    if (EV.env.hasClaude) {
      const dl = await EV.cap('downloads');
      if (dl) {
        try { await dl.save({ filename: filename, data: blob }); return { ok: true, via: 'claude' }; }
        catch (e) {
          const code = (e && e.code) || 'unavailable';
          const why = code === 'declined' ? 'Save was declined.'
            : code === 'rejected_extension' || code === 'extension_not_enabled' ? 'This type of file cannot be saved from the hosted demonstration copy.'
            : code === 'too_large' ? 'The file is too large to save from this view.'
            : code === 'rate_limited' ? 'Another save is still waiting for an answer. Try again in a moment.'
            : 'Save unavailable here (' + code + ').';
          return { ok: false, via: 'claude', code: code, message: why };
        }
      }
      /* Inside the host's frame a page cannot start a download itself: without the host's save function nothing would
         reach the device, so that is what is reported — never a save that did not happen. */
      if (EV.env.embedded) return { ok: false, via: 'claude', code: 'unavailable', message: 'Files cannot be saved from this view of the hosted demonstration copy.' };
    }
    /* iPhone / iPad: offer the file in a sheet (see offerFile). Everywhere else: a normal browser download. */
    if (EV.env.ios && EV.ui && EV.ui.openSheet) {
      const file = toFile(blob, filename, mime);
      if (file && EV.canShareFile(file)) return offerFile(blob, file);
    }
    return anchorDownload(blob, filename);
  };
  function toFile(blob, filename, mime) {
    try { return new File([blob], filename, { type: mime || blob.type || 'application/octet-stream' }); } catch (e) { return null; }
  }
  function anchorDownload(blob, filename) {
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.rel = 'noopener'; a.style.display = 'none';
      document.body.appendChild(a); a.click();
      setTimeout(function () { try { URL.revokeObjectURL(url); a.remove(); } catch (e) { /* ignore */ } }, 60000);
      return { ok: true, via: 'download' };
    } catch (e) { return { ok: false, via: 'download', message: String(e && e.message || e) }; }
  }
  /* On iOS a file generated in the page is not reliably downloadable from a home-screen web app, and the share sheet
   * ("Save to Files", AirDrop, Mail) may only be opened by a tap. Generating a report or package takes long enough
   * that the original tap no longer counts, so the finished file is offered in a sheet whose buttons are that tap.
   * Resolves when the person has shared, downloaded or dismissed. */
  function offerFile(blob, file) {
    return new Promise(function (resolve) {
      let result = null, note = '';
      const sheet = EV.ui.openSheet({
        title: 'File ready', sub: file.name + ' · ' + U.bytes(blob.size), size: 'auto',
        render: function () {
          return EV.h('div.stack', null,
            EV.h('p.muted', null, 'Choose where this file goes. “Save to Files” is in the share sheet.'),
            note ? EV.ui.note('warn', note) : null,
            EV.ui.btn('Share / Save to Files', { kind: 'primary', lg: true, block: true, icon: 'send', id: 'offer-share', onclick: function () {
              /* navigator.share is called synchronously inside the tap handler, as iOS requires */
              return navigator.share({ files: [file], title: file.name }).then(
                function () { result = { ok: true, via: 'share' }; EV.ui.closeSheet(sheet); },
                function (e) { note = e && e.name === 'AbortError' ? '' : 'Sharing is not available for this file here. Use Download instead.'; });
            } }),
            EV.ui.btn('Download', { lg: true, block: true, icon: 'download', id: 'offer-download', onclick: function () { result = anchorDownload(blob, file.name); EV.ui.closeSheet(sheet); } }));
        },
        onClose: function () { resolve(result || { ok: false, via: 'share', code: 'dismissed', message: 'The file was not saved.' }); }
      });
    });
  }
  /* True when this browser can hand this particular file to the system share sheet. */
  EV.canShareFile = function (file) {
    try { return !EV.env.embedded && !!navigator.share && !!navigator.canShare && !!file && navigator.canShare({ files: [file] }) === true; }
    catch (e) { return false; }
  };
  EV.canShareFiles = function () {
    try {
      if (EV.env.embedded || !navigator.share || !navigator.canShare) return false;
      return navigator.canShare({ files: [new File(['x'], 'x.txt', { type: 'text/plain' })] });
    } catch (e) { return false; }
  };
  EV.canShareBlob = function (blob, filename, mime) { return EV.canShareFile(toFile(blob, filename, mime)); };
  /* Must be called directly from a tap handler. code 'AbortError' means the person closed the share sheet. */
  EV.shareFile = async function (blob, filename, mime) {
    try {
      const file = new File([blob], filename, { type: mime || blob.type || 'application/octet-stream' });
      await navigator.share({ files: [file], title: filename });
      return { ok: true, via: 'share' };
    } catch (e) { return { ok: false, via: 'share', code: (e && e.name) || 'Error', message: String(e && e.message || e) }; }
  };

  /* ------------------------------------------------------------------ virtual DOM */
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const selCache = {};
  function parseSel(sel) {
    const parts = sel.split(/(?=[.#])/);
    let tag = 'div', cls = '', id = '';
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p[0] === '.') cls += (cls ? ' ' : '') + p.slice(1);
      else if (p[0] === '#') id = p.slice(1);
      else if (p) tag = p;
    }
    return { tag: tag, cls: cls, id: id };
  }
  /* Empty children keep their position as an empty text node, so a conditional sibling appearing or
   * disappearing never shifts (and therefore never re-targets) the inputs that follow it. */
  /* Every node the renderer will turn into an element carries this marker, which only h() can attach: it is an object
   * identity, so nothing that arrives as data (a restored backup, a synchronised row, a pasted value) can carry it.
   * Any other object used as content is shown as text. Record content can therefore never become markup. */
  const VN = Object.freeze({});
  const HOLE = { _v: VN, text: '' };
  function asText(c) { let s; try { s = JSON.stringify(c); } catch (e) { s = ''; } return { _v: VN, text: s == null ? String(c) : s }; }
  function flatKids(list, out) {
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c == null || c === false || c === true) { out.push(HOLE); continue; }
      if (Array.isArray(c)) flatKids(c, out);
      else if (typeof c === 'object') out.push(c._v === VN ? c : asText(c));
      else out.push({ _v: VN, text: String(c) });
    }
    return out;
  }
  function h(sel, props) {
    let start = 2;
    if (props == null || typeof props !== 'object' || Array.isArray(props) || props._v === VN) { start = 1; props = null; }
    const kids = [];
    for (let i = start; i < arguments.length; i++) kids.push(arguments[i]);
    if (typeof sel === 'function') return sel(props || {}, flatKids(kids, []));
    const ps = selCache[sel] || (selCache[sel] = parseSel(sel));
    const p = {};
    let cls = ps.cls;
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (k === 'class') { if (v) cls = cls ? cls + ' ' + v : v; }
        else if (v !== undefined) p[k] = v;
      }
    }
    if (cls) p['class'] = cls;
    if (ps.id) p.id = ps.id;
    return { _v: VN, tag: ps.tag, props: p, children: flatKids(kids, []), key: p.key };
  }
  EV.h = h;

  const PROP_KEYS = { value: 1, checked: 1, selected: 1, disabled: 1, indeterminate: 1, open: 1, muted: 1, readOnly: 1 };
  const NO_AUTO_REDRAW = { pointermove: 1, mousemove: 1, touchmove: 1, scroll: 1, wheel: 1 };
  function dispatch(e) {
    const fn = this._h && this._h[e.type];
    if (!fn) return undefined;
    let r;
    try { r = fn.call(this, e); } catch (err) { EV.reportError(err); }
    if (!NO_AUTO_REDRAW[e.type]) EV.redraw();
    if (r && typeof r.then === 'function') r.then(function () { EV.redraw(); }, function (err) { EV.reportError(err); EV.redraw(); });
    return undefined;
  }
  function styleStr(o) {
    let s = '';
    for (const k in o) { if (o[k] != null && o[k] !== false) s += k.replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase(); }) + ':' + o[k] + ';'; }
    return s;
  }
  function setProp(el, k, v, old, svg) {
    if (k === 'key' || k === 'ref' || k === 'skipChildren') return;
    if (k.charCodeAt(0) === 111 && k.charCodeAt(1) === 110) { /* "on…" */
      const type = k.slice(2);
      const hs = el._h || (el._h = {});
      if (!(type in hs)) {
        const passive = type === 'touchstart' || type === 'touchmove' || type === 'wheel';
        el.addEventListener(type, dispatch, passive ? { passive: false } : false);
      }
      hs[type] = typeof v === 'function' ? v : null;   /* a handler is code written here, never a value */
      return;
    }
    /* an address that would run script is never set, wherever the value came from */
    if ((k === 'href' || k === 'src' || k === 'action' || k === 'formaction' || k === 'srcdoc') && typeof v === 'string' && (k === 'srcdoc' || /^\s*(javascript|vbscript)\s*:/i.test(v))) { el.removeAttribute(k); return; }
    if (k === 'style') { el.style.cssText = v ? (typeof v === 'string' ? v : styleStr(v)) : ''; return; }
    if (!svg && PROP_KEYS[k]) {
      if (k === 'value') {
        if (el.type === 'file') return;
        const nv = v == null ? '' : String(v);
        if (el.value !== nv && (document.activeElement !== el || old !== v)) el.value = nv;
        return;
      }
      el[k] = !!v;
      return;
    }
    if (v == null || v === false) el.removeAttribute(k);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  function create(v, svg) {
    if (v.text != null) return document.createTextNode(v.text);
    svg = svg || v.tag === 'svg';
    const el = svg ? document.createElementNS(SVG_NS, v.tag) : document.createElement(v.tag);
    const p = v.props;
    for (const k in p) if (k !== 'value') setProp(el, k, p[k], undefined, svg);
    if (!p.skipChildren) for (let i = 0; i < v.children.length; i++) el.appendChild(create(v.children[i], svg));
    if ('value' in p) setProp(el, 'value', p.value, undefined, svg);
    if (p.ref) { try { p.ref(el); } catch (err) { EV.reportError(err); } }
    return el;
  }
  function sameNode(a, b) { return a.tag === b.tag && a.key === b.key && (a.text == null) === (b.text == null); }
  function patchNode(el, a, b, svg) {
    if (a === b) return el;
    if (!sameNode(a, b)) { const n = create(b, svg); el.parentNode.replaceChild(n, el); return n; }
    if (b.text != null) { if (a.text !== b.text) el.nodeValue = b.text; return el; }
    svg = svg || b.tag === 'svg';
    const ap = a.props, bp = b.props;
    for (const k in bp) { if (ap[k] !== bp[k] || k === 'value' || k === 'checked') setProp(el, k, bp[k], ap[k], svg); }
    for (const k in ap) { if (!(k in bp)) setProp(el, k, (PROP_KEYS[k] && k !== 'value') ? false : null, ap[k], svg); }
    if (!bp.skipChildren) patchChildren(el, a.children, b.children, svg);
    if (b.tag === 'select' && bp.value != null && el.value !== String(bp.value)) el.value = String(bp.value);
    return el;
  }
  function patchChildren(parent, as, bs, svg) {
    let keyed = false;
    for (let i = 0; i < bs.length && !keyed; i++) keyed = bs[i].key != null;
    for (let i = 0; i < as.length && !keyed; i++) keyed = as[i].key != null;
    const nodes = Array.prototype.slice.call(parent.childNodes);
    if (!keyed) {
      const common = Math.min(as.length, bs.length);
      for (let i = 0; i < common; i++) patchNode(nodes[i], as[i], bs[i], svg);
      for (let i = common; i < bs.length; i++) parent.appendChild(create(bs[i], svg));
      for (let i = as.length - 1; i >= common; i--) { if (nodes[i] && nodes[i].parentNode === parent) parent.removeChild(nodes[i]); }
      return;
    }
    /* Keyed children are matched by key; unkeyed ones (placeholders, static siblings) by their order. */
    const oldKeyed = new Map();
    const oldPlain = [];
    const stale = [];
    for (let i = 0; i < as.length; i++) {
      const k = as[i].key;
      if (k != null && !oldKeyed.has(k)) oldKeyed.set(k, { v: as[i], n: nodes[i] }); else oldPlain.push({ v: as[i], n: nodes[i] });
    }
    let pi = 0;
    const result = [];
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      let hit = null;
      if (b.key != null) { hit = oldKeyed.get(b.key) || null; if (hit) oldKeyed.delete(b.key); }
      else if (pi < oldPlain.length) { hit = oldPlain[pi++]; }
      if (hit && sameNode(hit.v, b)) result.push(patchNode(hit.n, hit.v, b, svg));
      else { if (hit) stale.push(hit.n); result.push(create(b, svg)); }
    }
    oldKeyed.forEach(function (o) { stale.push(o.n); });
    for (; pi < oldPlain.length; pi++) stale.push(oldPlain[pi].n);
    for (let i = 0; i < stale.length; i++) { if (stale[i] && stale[i].parentNode === parent) parent.removeChild(stale[i]); }
    for (let i = 0; i < result.length; i++) {
      const cur = parent.childNodes[i];
      if (cur !== result[i]) parent.insertBefore(result[i], cur || null);
    }
  }

  let rootEl = null, rootView = null, prevTree = null, scheduled = false, raf = 0, timer = 0, rendering = false;
  const afterRender = [];
  EV.afterRender = function (fn) { afterRender.push(fn); };
  EV.mount = function (el, view) { rootEl = el; rootView = view; el.textContent = ''; prevTree = null; run(); };
  EV.redraw = function () {
    if (scheduled || !rootEl) return;
    scheduled = true;
    raf = window.requestAnimationFrame ? requestAnimationFrame(run) : 0;
    timer = setTimeout(run, 60); /* rAF is paused in hidden tabs; the timer guarantees progress */
  };
  function run() {
    if (!rootEl) return;
    scheduled = false;
    if (raf) cancelAnimationFrame(raf);
    clearTimeout(timer);
    if (rendering) { EV.redraw(); return; }
    rendering = true;
    let next;
    try { next = h('div.app-root', null, rootView()); }
    catch (err) {
      console.error('[render]', err);
      next = h('div.app-root', null, EV.renderCrash ? EV.renderCrash(err) : h('pre', null, String((err && err.stack) || err)));
    }
    try {
      if (!prevTree) rootEl.appendChild(create(next, false));
      else patchNode(rootEl.firstChild, prevTree, next, false);
      prevTree = next;
    } catch (err) {
      console.error('[patch] rebuilding DOM', err);
      try { rootEl.textContent = ''; rootEl.appendChild(create(next, false)); prevTree = next; }
      catch (e2) { console.error(e2); prevTree = null; }
    }
    rendering = false;
    while (afterRender.length) { const fn = afterRender.shift(); try { fn(); } catch (e) { console.error(e); } }
  }

  /* ------------------------------------------------------------------ errors */
  EV.reportError = function (err, context) {
    console.error('[EV]', context || '', err);
    const msg = (err && (err.message || err.code)) || String(err);
    if (EV.toast) EV.toast((context ? context + ': ' : 'Something went wrong: ') + msg, 'danger');
  };
  window.addEventListener('error', function (e) { if (e && e.error) EV.reportError(e.error); });
  window.addEventListener('unhandledrejection', function (e) { if (e && e.reason) EV.reportError(e.reason); });

  /* ------------------------------------------------------------------ router
   * Standalone/hosted: hash routes (#/audits/…) so refresh and browser back work.
   * Embedded (Claude artifact frame): in-memory stack only; the last route is remembered locally. */
  /* in-memory routes when framed or hosted: only a plain "#name" passes through a host page, never "#/path" */
  const R = (EV.router = { full: '', path: '/', parts: [], query: {}, stack: [], scroll: {}, useHash: !embedded && !EV.env.hosted });
  function parseRoute(p) {
    p = p || '/';
    if (p[0] === '#') p = p.slice(1);
    if (p[0] !== '/') p = '/' + p;
    const qi = p.indexOf('?');
    const q = {};
    let path = p;
    if (qi >= 0) {
      path = p.slice(0, qi);
      p.slice(qi + 1).split('&').forEach(function (kv) {
        const i = kv.indexOf('=');
        const k = i < 0 ? kv : kv.slice(0, i);
        if (k) { try { q[decodeURIComponent(k)] = decodeURIComponent(i < 0 ? '' : kv.slice(i + 1)); } catch (e) { /* ignore */ } }
      });
    }
    return { full: p, path: path, parts: path.split('/').filter(Boolean), query: q };
  }
  function mainScroll() { return document.getElementById('main-scroll'); }
  function applyRoute(full, mode) {
    const ms = mainScroll();
    if (ms && R.full) R.scroll[R.full] = ms.scrollTop;
    const r = parseRoute(full);
    R.full = r.full; R.path = r.path; R.parts = r.parts; R.query = r.query;
    R.nav = (R.nav || 0) + 1;   /* identifies this arrival: a link followed twice is two arrivals, even to the same address */
    try { localStorage.setItem('ev.route', JSON.stringify({ p: r.full, t: Date.now() })); } catch (e) { /* ignore */ }
    if (EV.onRoute) { try { EV.onRoute(mode); } catch (e) { console.error(e); } }
    EV.afterRender(function () {
      const el = mainScroll();
      if (el) el.scrollTop = mode === 'pop' ? (R.scroll[r.full] || 0) : 0;
    });
    EV.redraw();
  }
  EV.go = function (path, opts) {
    opts = opts || {};
    const full = parseRoute(path).full;
    if (full === R.full) return;
    if (opts.replace && R.stack.length) R.stack[R.stack.length - 1] = full; else R.stack.push(full);
    if (R.stack.length > 60) R.stack.splice(0, R.stack.length - 60);
    if (R.useHash) {
      try {
        if (opts.replace) history.replaceState(history.state, '', location.pathname + location.search + '#' + full);
        else if (location.hash !== '#' + full) { R.ignoreHash = full; location.hash = full; R.depth++; markPushed(); }
      } catch (e) { /* ignore */ }
    }
    applyRoute(full, opts.replace ? 'replace' : 'push');
  };
  /* R.depth counts the browser-history entries this app has added. While there is one to return to, the in-app back
     arrow goes back through the real history (the hashchange handler then applies the route), so the phone's own
     Back button and the arrow always agree. Only at the entry the app was opened on is the address rewritten. */
  R.depth = 0;
  /* An entry this app pushed carries a mark in its own history state. Only from such an entry is an entry of this app
     certainly behind it — whatever the counter says after a reload, a Forward, or a jump through the history list — so
     the back arrow can never take the browser out of the application. */
  function markPushed() { try { history.replaceState({ evPushed: 1 }, ''); } catch (e) { /* stays unmarked: Back rewrites the address instead */ } }
  function wasPushed() { try { return !!(history.state && history.state.evPushed); } catch (e) { return false; } }
  EV.back = function (fallback) {
    if (R.stack.length > 1) {
      if (R.useHash && R.depth > 0 && wasPushed()) {
        R.stack.pop();
        const prev = R.stack[R.stack.length - 1];
        R.depth--;
        R.ignoreHash = prev;                     /* the hashchange that history.back() causes is this same move */
        try { history.back(); } catch (e) { R.ignoreHash = null; }
        applyRoute(prev, 'pop');
        return;
      }
      R.stack.pop();
      const full = R.stack[R.stack.length - 1];
      if (R.useHash) {
        try { history.replaceState(null, '', location.pathname + location.search + '#' + full); } catch (e) { /* ignore */ }
      }
      applyRoute(full, 'pop');
    } else {
      EV.go(fallback || '/', { replace: true });
    }
  };
  EV.router.start = function () {
    let initial = '';
    if (R.useHash && location.hash && location.hash.indexOf('#/') === 0) initial = location.hash.slice(1);
    if (!initial) {
      try {
        const saved = JSON.parse(localStorage.getItem('ev.route') || 'null');
        if (saved && saved.p && Date.now() - saved.t < 12 * 3600 * 1000) initial = saved.p;
      } catch (e) { /* ignore */ }
    }
    initial = parseRoute(initial || '/').full;
    R.stack = initial === '/' ? ['/'] : ['/', initial];
    if (R.useHash) {
      try { history.replaceState(null, '', location.pathname + location.search + '#' + initial); } catch (e) { /* ignore */ }
      window.addEventListener('hashchange', function () {
        const full = parseRoute(location.hash || '/').full;
        if (R.ignoreHash === full) { R.ignoreHash = null; return; }
        R.ignoreHash = null;
        if (full === R.full) return;
        /* browser back/forward or a manually edited hash */
        const ui = EV.ui, isBack = R.stack.length > 1 && R.stack[R.stack.length - 2] === full;
        const stay = function () { R.ignoreHash = R.full; try { location.hash = R.full; markPushed(); } catch (e) { R.ignoreHash = null; } };   /* one entry back, one added: R.depth is unchanged */
        /* The lock or sign-in screen is showing over open editors or a pending question: nothing moves underneath it,
           so they are neither closed nor discarded and are still there once the gate is passed. */
        if (ui && ui.heldByGate()) {
          stay();
          if (isBack && ui.shownDialog()) ui.dismissDialog();
          EV.redraw();
          return;
        }
        if (isBack) {
          /* Back while a sheet or dialog is open closes it (what a phone's back gesture is expected to do) and
             stays on the screen underneath, so an editor is never dropped without its close checks. */
          if (ui && (ui.shownDialog() || (ui.sheets.length && !ui.gated))) {
            stay();
            if (ui.shownDialog()) ui.dismissDialog(); else ui.requestClose(ui.sheets[ui.sheets.length - 1]);
            EV.redraw();
            return;
          }
          R.depth = Math.max(0, R.depth - 1);
          R.stack.pop(); applyRoute(full, 'pop');
        }
        else { R.depth++; R.stack.push(full); applyRoute(full, 'push'); }
      });
    }
    applyRoute(initial, 'replace');
  };

  /* ------------------------------------------------------------------ icons (hand-authored 24px stroke set) */
  const ICONS = {
    home: 'p:M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z|pl:9 22 9 12 15 12 15 22',
    grid: 'r:3 3 7 7 1|r:14 3 7 7 1|r:14 14 7 7 1|r:3 14 7 7 1',
    building: 'r:4 2 16 20 1.5|l:9 22 9 18|l:15 22 15 18|l:9 18 15 18|l:8 6.5 8.01 6.5|l:12 6.5 12.01 6.5|l:16 6.5 16.01 6.5|l:8 10.5 8.01 10.5|l:12 10.5 12.01 10.5|l:16 10.5 16.01 10.5|l:8 14.5 8.01 14.5|l:12 14.5 12.01 14.5|l:16 14.5 16.01 14.5',
    clipboard: 'p:M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2|r:8 2 8 4 1|pl:9 14 11 16 15 12',
    cpu: 'r:4 4 16 16 2|r:9 9 6 6 0.5|l:9 1 9 4|l:15 1 15 4|l:9 20 9 23|l:15 20 15 23|l:20 9 23 9|l:20 14 23 14|l:1 9 4 9|l:1 14 4 14',
    server: 'r:2 2 20 8 2|r:2 14 20 8 2|l:6 6 6.01 6|l:6 18 6.01 18',
    network: 'r:9 2 6 6 1|r:2 16 6 6 1|r:16 16 6 6 1|p:M5 16v-2a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2|l:12 12 12 8',
    flag: 'p:M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z|l:4 22 4 15',
    message: 'p:M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
    'package': 'l:16.5 9.4 7.5 4.21|p:M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z|pl:3.27 6.96 12 12.01 20.73 6.96|l:12 22.08 12 12',
    file: 'p:M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|pl:14 2 14 8 20 8|l:16 13 8 13|l:16 17 8 17|l:10 9 8 9',
    sliders: 'l:4 21 4 14|l:4 10 4 3|l:12 21 12 12|l:12 8 12 3|l:20 21 20 16|l:20 12 20 3|l:1 14 7 14|l:9 8 15 8|l:17 16 23 16',
    plus: 'l:12 5 12 19|l:5 12 19 12',
    minus: 'l:5 12 19 12',
    camera: 'p:M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z|c:12 13 4',
    'chev-right': 'pl:9 18 15 12 9 6',
    'chev-left': 'pl:15 18 9 12 15 6',
    'chev-down': 'pl:6 9 12 15 18 9',
    'chev-up': 'pl:18 15 12 9 6 15',
    check: 'pl:20 6 9 17 4 12',
    x: 'l:18 6 6 18|l:6 6 18 18',
    alert: 'p:M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z|l:12 9 12 13|l:12 17 12.01 17',
    'alert-circle': 'c:12 12 10|l:12 8 12 12|l:12 16 12.01 16',
    info: 'c:12 12 10|l:12 16 12 12|l:12 8 12.01 8',
    search: 'c:11 11 8|l:21 21 16.65 16.65',
    filter: 'pg:22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3',
    download: 'p:M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4|pl:7 10 12 15 17 10|l:12 15 12 3',
    upload: 'p:M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4|pl:17 8 12 3 7 8|l:12 3 12 15',
    trash: 'pl:3 6 5 6 21 6|p:M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2|l:10 11 10 17|l:14 11 14 17',
    edit: 'p:M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z',
    more: 'c:12 12 1|c:19 12 1|c:5 12 1',
    menu: 'l:3 12 21 12|l:3 6 21 6|l:3 18 21 18',
    cloud: 'p:M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z',
    'cloud-off': 'p:M22.61 16.95A5 5 0 0 0 18 10h-1.26a8 8 0 0 0-7.05-6M5 5a8 8 0 0 0 4 15h9a5 5 0 0 0 1.7-.3|l:1 1 23 23',
    lock: 'r:3 11 18 11 2|p:M7 11V7a5 5 0 0 1 10 0v4',
    rotate: 'pl:23 4 23 10 17 10|p:M20.49 15a9 9 0 1 1-2.12-9.36L23 10',
    refresh: 'pl:23 4 23 10 17 10|pl:1 20 1 14 7 14|p:M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
    link: 'p:M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71|p:M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
    image: 'r:3 3 18 18 2|c:8.5 8.5 1.5|pl:21 15 16 10 5 21',
    calendar: 'r:3 4 18 18 2|l:16 2 16 6|l:8 2 8 6|l:3 10 21 10',
    pin: 'p:M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z|c:12 10 3',
    layers: 'pg:12 2 2 7 12 12 22 7 12 2|pl:2 17 12 22 22 17|pl:2 12 12 17 22 12',
    shield: 'p:M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
    zap: 'pg:13 2 3 14 12 14 11 22 21 10 12 10 13 2',
    activity: 'pl:22 12 18 12 15 21 9 3 6 12 2 12',
    archive: 'pl:21 8 21 21 3 21 3 8|r:1 3 22 5 0|l:10 12 14 12',
    'check-circle': 'p:M22 11.08V12a10 10 0 1 1-5.93-9.14|pl:22 4 12 14.01 9 11.01',
    circle: 'c:12 12 10',
    copy: 'r:9 9 13 13 2|p:M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
    external: 'p:M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6|pl:15 3 21 3 21 9|l:10 14 21 3',
    eye: 'p:M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z|c:12 12 3',
    tool: 'p:M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
    drive: 'l:22 12 2 12|p:M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z|l:6 16 6.01 16|l:10 16 10.01 16',
    monitor: 'r:2 3 20 14 2|l:8 21 16 21|l:12 17 12 21',
    list: 'l:8 6 21 6|l:8 12 21 12|l:8 18 21 18|l:3 6 3.01 6|l:3 12 3.01 12|l:3 18 3.01 18',
    users: 'p:M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2|c:9 7 4|p:M23 21v-2a4 4 0 0 0-3-3.87|p:M16 3.13a4 4 0 0 1 0 7.75',
    user: 'p:M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2|c:12 7 4',
    send: 'l:22 2 11 13|pg:22 2 15 22 11 13 2 9 22 2',
    clock: 'c:12 12 10|pl:12 6 12 12 16 14',
    play: 'pg:5 3 19 12 5 21 5 3',
    database: 'e:12 5 9 3|p:M21 12c0 1.66-4 3-9 3s-9-1.34-9-3|p:M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5',
    share: 'p:M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8|pl:16 6 12 2 8 6|l:12 2 12 15',
    undo: 'pl:1 4 1 10 7 10|p:M3.51 15a9 9 0 1 0 2.13-9.36L1 10',
    target: 'c:12 12 10|c:12 12 6|c:12 12 2',
    'arrow-right': 'l:5 12 19 12|pl:12 5 19 12 12 19',
    box: 'p:M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z|pl:3.27 6.96 12 12.01 20.73 6.96|l:12 22.08 12 12',
    help: 'c:12 12 10|p:M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3|l:12 17 12.01 17',
    mic: 'p:M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z|p:M19 10v2a7 7 0 0 1-14 0v-2|l:12 19 12 23|l:8 23 16 23',
    video: 'pg:23 7 16 12 23 17 23 7|r:1 5 15 14 2',
    wifi: 'p:M5 12.55a11 11 0 0 1 14.08 0|p:M1.42 9a16 16 0 0 1 21.16 0|p:M8.53 16.11a6 6 0 0 1 6.95 0|l:12 20 12.01 20',
    'log-out': 'p:M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4|pl:16 17 21 12 16 7|l:21 12 9 12'
  };
  const iconKids = {};
  function buildIcon(spec) {
    return spec.split('|').map(function (part) {
      const i = part.indexOf(':');
      const kind = part.slice(0, i), a = part.slice(i + 1);
      if (kind === 'p') return h('path', { d: a });
      if (kind === 'pl') return h('polyline', { points: a });
      if (kind === 'pg') return h('polygon', { points: a });
      const n = a.split(' ');
      if (kind === 'l') return h('line', { x1: n[0], y1: n[1], x2: n[2], y2: n[3] });
      if (kind === 'c') return h('circle', { cx: n[0], cy: n[1], r: n[2] });
      if (kind === 'e') return h('ellipse', { cx: n[0], cy: n[1], rx: n[2], ry: n[3] });
      return h('rect', { x: n[0], y: n[1], width: n[2], height: n[3], rx: n[4] || 0 });
    });
  }
  EV.icon = function (name, size, cls) {
    const kids = iconKids[name] || (iconKids[name] = buildIcon(ICONS[name] || ICONS.circle));
    const s = size || 18;
    return h('svg', {
      'class': 'ic' + (cls ? ' ' + cls : ''), width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
      'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true'
    }, kids);
  };
})();
