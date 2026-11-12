/* ui.js — interface kit: toasts, sheets, dialogs, controls, schema-driven forms and the generic record editor. */
(function () {
  'use strict';
  const EV = window.EV, h = EV.h, U = EV.U, S = EV.S, store = EV.store, icon = EV.icon, R = EV.rules;
  const ui = (EV.ui = { sheets: [], toasts: [], dialog: null, open: {}, seq: 0 });

  /* ------------------------------------------------------------------ toasts */
  EV.toast = function (msg, tone, ms) {
    const t = { id: ++ui.seq, msg: String(msg), tone: tone || 'info' };
    ui.toasts.push(t);
    if (ui.toasts.length > 3) ui.toasts.shift();
    EV.redraw();
    setTimeout(function () { const i = ui.toasts.indexOf(t); if (i >= 0) { ui.toasts.splice(i, 1); EV.redraw(); } }, ms || (tone === 'danger' ? 6500 : 2800));
  };

  /* ------------------------------------------------------------------ basic controls */
  ui.btn = function (label, o) {
    o = o || {};
    return h('button', {
      type: 'button', 'class': U.cx('btn', 'btn-' + (o.kind || 'secondary'), o.sm && 'btn-sm', o.lg && 'btn-lg', o.block && 'btn-block', o.cls),
      disabled: !!o.disabled, onclick: o.onclick, title: o.title, key: o.key, 'aria-label': o.aria, id: o.id
    }, o.icon ? icon(o.icon, o.sm ? 15 : 17) : null, label != null && label !== '' ? h('span', null, label) : null, o.iconRight ? icon(o.iconRight, 15) : null);
  };
  ui.iconBtn = function (name, o) {
    o = o || {};
    return h('button', { type: 'button', 'class': U.cx('icon-btn', o.cls), onclick: o.onclick, title: o.title, 'aria-label': o.title || name, disabled: !!o.disabled, key: o.key },
      icon(name, o.size || 20));
  };
  ui.chip = function (text, tone, o) {
    o = o || {};
    return h('span', { 'class': U.cx('chip', tone && 'chip-' + tone, o.cls), title: o.title, key: o.key }, o.icon ? icon(o.icon, 12) : null, text);
  };
  ui.demo = function (rec) { return rec && rec.is_demo ? ui.chip('DEMO', 'demo', { title: 'Synthetic demo data' }) : null; };
  ui.tone = {
    audit: { not_started: 'muted', in_progress: 'warn', audited: 'ok', verified: 'accent', complete: 'ok' },
    priority: { P1: 'danger', P2: 'warn', P3: 'muted' },
    test: { pass: 'ok', fail: 'danger', investigate: 'warn', na: 'muted', not_tested: '' },
    id: { verified: 'ok', recorded: 'warn', missing: 'danger', na: 'muted' },
    net: { verified: 'ok', issue: 'danger', awaiting_it: 'warn', na: 'muted', not_checked: '' },
    validation: { observed: 'accent', from_docs: 'accent', it_validated: 'ok', awaiting_it: 'warn', unknown: 'muted' },
    dep: { confirmed: 'ok', awaiting_it: 'warn', assumed: 'warn', unknown: 'muted' },
    backlog: function (s) {
      if (s === 'Completed') return 'ok';
      if (s === 'Blocked') return 'danger';
      if (s === 'Rejected' || s === 'Deferred') return 'muted';
      if (s === 'New Discovery') return 'accent';
      if (s === 'Under Investigation') return 'violet';
      if (s && s.indexOf('Pending') === 0) return 'warn';
      return 'accent';
    },
    it: function (s) {
      if (s === 'Answered' || s === 'Closed') return 'ok';
      if (s === 'Cancelled' || s === 'Draft') return 'muted';
      if (s === 'Awaiting Response') return 'warn';
      return 'accent';
    },
    op: function (s) { return s === 'Fully operational' ? 'ok' : s === 'Out of service' ? 'danger' : s === 'Unknown' || !s ? 'muted' : 'warn'; }
  };
  ui.priority = function (p) { return p ? ui.chip(p, ui.tone.priority[p] || 'muted', { cls: 'chip-strong' }) : ui.chip('Unprioritized', 'muted'); };
  ui.auditChip = function (state) { return ui.chip(R.STATE_LABEL[state] || state, ui.tone.audit[state]); };

  ui.input = function (value, o) {
    o = o || {};
    return h('input', {
      'class': U.cx('input', o.mono && 'mono', o.cls), type: o.type || 'text', value: value == null ? '' : value, placeholder: o.ph || '',
      inputmode: o.inputmode, autocomplete: 'off', autocapitalize: o.mono ? 'off' : (o.caps || 'sentences'), autocorrect: 'off', spellcheck: 'false',
      id: o.id, list: o.list, min: o.min, max: o.max, step: o.step, disabled: !!o.disabled, enterkeyhint: 'done',
      oninput: o.oninput ? function (e) { o.oninput(e.target.value, e); } : undefined,
      onchange: o.onchange ? function (e) { o.onchange(e.target.value, e); } : undefined,
      onkeydown: o.onkeydown
    });
  };
  ui.textarea = function (value, o) {
    o = o || {};
    return h('textarea', {
      'class': U.cx('input', 'textarea', o.cls), rows: o.rows || 3, value: value == null ? '' : value, placeholder: o.ph || '', id: o.id, disabled: !!o.disabled,
      oninput: o.oninput ? function (e) { o.oninput(e.target.value, e); } : undefined
    });
  };
  ui.select = function (value, options, o) {
    o = o || {};
    const v = value == null ? '' : String(value);
    const opts = (options || []).map(function (op) { return Array.isArray(op) ? op : [op, op]; });
    const kids = [];
    if (o.empty !== false && !opts.some(function (op) { return op[0] === ''; })) kids.push(h('option', { value: '' }, o.placeholder || '—'));
    if (v && !opts.some(function (op) { return String(op[0]) === v; })) kids.push(h('option', { value: v }, o.unknownLabel || v));
    opts.forEach(function (op) { kids.push(h('option', { value: String(op[0]) }, op[1])); });
    return h('select', { 'class': U.cx('input', 'select', o.cls), value: v, disabled: !!o.disabled, id: o.id, 'aria-label': o.aria,
      onchange: function (e) { if (o.onchange) o.onchange(e.target.value, e); } }, kids);
  };
  ui.toggle = function (value, o) {
    o = o || {};
    return h('button', { type: 'button', 'class': U.cx('toggle', value && 'on'), role: 'switch', 'aria-checked': value ? 'true' : 'false', disabled: !!o.disabled, id: o.id,
      onclick: function () { if (o.onchange) o.onchange(!value); } }, h('span.toggle-knob'));
  };
  ui.seg = function (value, options, o) {
    o = o || {};
    return h('div', { 'class': U.cx('seg', o.wrap && 'seg-wrap', o.cls), role: 'group' }, options.map(function (op) {
      const a = Array.isArray(op) ? op : [op, op];
      const on = a[0] === value;
      return h('button', { type: 'button', key: String(a[0]), 'class': U.cx('seg-btn', on && 'on', on && a[2] && 'tone-' + a[2]), 'aria-pressed': on ? 'true' : 'false',
        disabled: !!o.disabled, onclick: function () { if (o.onchange) o.onchange(a[0], on); } }, a[1]);
    }));
  };
  ui.field = function (label, control, o) {
    o = o || {};
    return h(o.div ? 'div' : 'label', { 'class': U.cx('field', o.half && 'half', o.missing && 'is-missing', o.cls), key: o.key },
      h('span.field-label', null, label, o.req ? h('span.req', { title: 'Required' }, ' *') : null),
      control,
      o.error ? h('span.field-error', null, o.error) : (o.hint ? h('span.field-hint', null, o.hint) : null));
  };

  /* ------------------------------------------------------------------ layout pieces */
  ui.card = function (o) {
    const kids = Array.prototype.slice.call(arguments, 1);
    o = o || {};
    return h('div', { 'class': U.cx('card', o.pad !== false && 'card-pad', o.cls), key: o.key, id: o.id },
      o.title ? h('div.card-head', null, h('div.card-title', null, o.title), o.right || null) : null, kids);
  };
  ui.section = function (o) {
    const body = Array.prototype.slice.call(arguments, 1);
    const k = o.key;
    const open = ui.open[k] != null ? ui.open[k] : !!o.defaultOpen;
    return h('section', { 'class': U.cx('sect', open && 'open', o.cls), key: k, id: o.id },
      h('button.sect-head', { type: 'button', 'aria-expanded': open ? 'true' : 'false', onclick: function () {
        ui.open[k] = !open;
        if (o.exclusive && !open) Object.keys(ui.open).forEach(function (x) { if (x !== k && x.indexOf(o.exclusive) === 0) ui.open[x] = false; });
        if (o.onToggle) o.onToggle(!open);
      } },
        o.icon ? h('span.sect-ic', null, icon(o.icon, 18)) : null,
        h('span.sect-titles', null, h('span.sect-name', null, o.title), o.sub ? h('span.sect-sub', null, o.sub) : null),
        o.status ? ui.chip(o.status.text, o.status.tone) : null,
        icon(open ? 'chev-up' : 'chev-down', 18, 'sect-chev')),
      open ? h('div.sect-body', null, body) : null);
  };
  ui.row = function (o) {
    return h(o.onclick ? 'button' : 'div', { 'class': U.cx('row', o.onclick && 'row-click', o.cls), key: o.key, type: o.onclick ? 'button' : undefined, onclick: o.onclick },
      o.left ? h('span.row-left', null, o.left) : null,
      h('span.row-main', null,
        h('span.row-title', null, o.title, o.badge || null),
        o.sub ? h('span.row-sub', null, o.sub) : null,
        o.below || null),
      o.right ? h('span.row-right', null, o.right) : null,
      o.onclick && o.chev !== false ? icon('chev-right', 16, 'row-chev') : null);
  };
  ui.stat = function (o) {
    return h(o.onclick ? 'button' : 'div', { 'class': U.cx('stat', o.tone && 'stat-' + o.tone, o.onclick && 'stat-click'), key: o.key, type: o.onclick ? 'button' : undefined, onclick: o.onclick },
      h('span.stat-label', null, o.label),
      h('span.stat-value', null, String(o.value), o.unit ? h('span.stat-unit', null, o.unit) : null),
      o.sub ? h('span.stat-sub', null, o.sub) : null);
  };
  ui.progress = function (pct, tone) {
    const p = U.clamp(Math.round(pct || 0), 0, 100);
    return h('div', { 'class': U.cx('progress', tone && 'progress-' + tone), role: 'progressbar', 'aria-valuenow': p, 'aria-valuemin': '0', 'aria-valuemax': '100' },
      h('div.progress-bar', { style: 'width:' + p + '%' }));
  };
  /* parts: [{n, tone, label}] */
  ui.stackbar = function (parts) {
    const total = U.sum(parts, function (p) { return p.n; });
    return h('div.stackbar', { role: 'img', 'aria-label': parts.map(function (p) { return p.n + ' ' + p.label; }).join(', ') },
      total ? parts.filter(function (p) { return p.n > 0; }).map(function (p) { return h('span', { key: p.label, 'class': 'stack-' + p.tone, style: 'flex:' + p.n, title: p.n + ' ' + p.label }); }) : h('span.stack-muted', { style: 'flex:1' }));
  };
  ui.tabs = function (items, active, onchange) {
    return h('div.tabs', { role: 'tablist' }, items.map(function (it) {
      return h('button', { type: 'button', key: it.k, role: 'tab', 'class': U.cx('tab', it.k === active && 'on'), 'aria-selected': it.k === active ? 'true' : 'false',
        onclick: function () { onchange(it.k); } }, it.label, it.count != null ? h('span.tab-count', null, String(it.count)) : null);
    }));
  };
  ui.empty = function (o) {
    return h('div.empty', { key: o.key }, o.icon ? h('div.empty-ic', null, icon(o.icon, 24)) : null, h('div.empty-title', null, o.title),
      o.text ? h('div.empty-text', null, o.text) : null, o.action || null);
  };
  ui.search = function (value, oninput, ph) {
    return h('div.search', null, icon('search', 16),
      h('input', { 'class': 'search-input', type: 'search', value: value || '', placeholder: ph || 'Search', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off',
        spellcheck: 'false', 'aria-label': ph || 'Search', oninput: function (e) { oninput(e.target.value); } }),
      value ? ui.iconBtn('x', { size: 16, title: 'Clear search', onclick: function () { oninput(''); } }) : null);
  };
  ui.head = function (o) {
    return h('header.page-head', null,
      h('div.page-head-main', null,
        o.back != null ? ui.iconBtn('chev-left', { cls: 'back-btn', title: 'Back', onclick: function () { EV.back(o.back || '/'); } }) : null,
        h('div.page-titles', null,
          o.eyebrow ? h('div.eyebrow', null, o.eyebrow) : null,
          h('h1.page-title', null, o.title, o.chips || null),
          o.sub ? h('div.page-sub', null, o.sub) : null)),
      o.actions ? h('div.page-actions', null, o.actions) : null);
  };
  ui.kv = function (label, value, o) {
    o = o || {};
    return h('div', { 'class': U.cx('kv', o.mono && 'kv-mono'), key: o.key }, h('span.kv-k', null, label), h('span.kv-v', null, value == null || value === '' ? '—' : value));
  };
  ui.note = function (tone, body, o) {
    o = o || {};
    const ic = tone === 'danger' ? 'alert' : tone === 'warn' ? 'alert-circle' : tone === 'ok' ? 'check-circle' : 'info';
    return h('div', { 'class': U.cx('note', 'note-' + tone, o.cls), key: o.key }, icon(o.icon || ic, 17), h('div.note-body', null, o.title ? h('div.note-title', null, o.title) : null, body, o.action || null));
  };
  ui.label = function (text, right) { return h('div.label-row', null, h('span.label', null, text), right || null); };

  /* ------------------------------------------------------------------ overlays: sheets, dialogs, toasts */
  ui.openSheet = function (o) {
    const s = Object.assign({ id: 's' + (++ui.seq) }, o);
    ui.sheets.push(s);
    EV.redraw();
    return s;
  };
  ui.closeSheet = function (s) {
    const i = s ? ui.sheets.indexOf(s) : ui.sheets.length - 1;
    if (i < 0) return;
    const sh = ui.sheets[i];
    ui.sheets.splice(i, 1);
    if (sh.onClose) { try { sh.onClose(); } catch (e) { console.error(e); } }
    EV.redraw();
  };
  /* The screen is changing underneath the open sheets: let each one finish properly (release what it holds, apply or
     abandon an unfinished new record) instead of just dropping it. */
  ui.closeAll = function () {
    while (ui.sheets.length) {
      const sh = ui.sheets.pop();
      if (sh.onRouteClose) { try { sh.onRouteClose(); } catch (e) { console.error(e); } }
      if (sh.onClose) { try { sh.onClose(); } catch (e) { console.error(e); } }
    }
    if (ui.dialog) { const d = ui.dialog; ui.dialog = null; try { d.resolve(d.buttons.length > 1 ? d.buttons[0].value : true); } catch (e) { console.error(e); } }
  };
  ui.requestClose = function (s) {
    if (s.beforeClose) {
      Promise.resolve(s.beforeClose()).then(function (ok) { if (ok !== false) ui.closeSheet(s); });
      return;
    }
    ui.closeSheet(s);
  };
  /* gate: the question was asked by the lock or sign-in screen itself. Any other question that is still open when the
     device locks stays hidden — and unanswered — until the gate is passed (see ui.shownDialog). */
  function setDialog(d) {
    /* one question at a time: one that is still open is answered with its cancel button, never left pending for ever */
    const old = ui.dialog;
    if (old) { try { old.resolve(old.buttons.length > 1 ? old.buttons[0].value : true); } catch (e) { console.error(e); } }
    d.gate = !!ui.gated;
    ui.dialog = d;
    EV.redraw();
  }
  ui.confirm = function (o) {
    return new Promise(function (resolve) {
      setDialog({ title: o.title, message: o.message, buttons: [{ label: o.cancel || 'Cancel', kind: 'ghost', value: false }, { label: o.confirm || 'Confirm', kind: o.danger ? 'danger' : 'primary', value: true }], resolve: resolve });
    });
  };
  ui.alert = function (o) {
    return new Promise(function (resolve) {
      setDialog({ title: o.title, message: o.message, body: o.body, buttons: [{ label: o.ok || 'OK', kind: 'primary', value: true }], resolve: resolve });
    });
  };
  ui.prompt = function (o) {
    return new Promise(function (resolve) {
      setDialog({ title: o.title, message: o.message, input: { value: o.value || '', ph: o.ph || '', label: o.label, mono: o.mono, type: o.type },
        buttons: [{ label: 'Cancel', kind: 'ghost', value: null }, { label: o.confirm || 'Save', kind: 'primary', value: '__input' }], resolve: resolve });
      EV.afterRender(function () { const el = document.getElementById('dialog-input'); if (el) el.focus(); });
    });
  };
  /* options: [{label, value, icon, hint, tone}] → resolves value or null */
  ui.choose = function (o) {
    return new Promise(function (resolve) {
      let done = false;
      const sheet = ui.openSheet({
        title: o.title, sub: o.sub, size: 'auto',
        render: function () {
          return h('div.action-list', null, o.options.map(function (op, i) {
            return h('button', { type: 'button', key: 'o' + i, 'class': U.cx('action', op.tone && 'action-' + op.tone), disabled: !!op.disabled, onclick: function () { done = true; ui.closeSheet(sheet); resolve(op.value); } },
              op.icon ? h('span.action-ic', null, icon(op.icon, 20)) : null,
              h('span.action-text', null, h('span.action-label', null, op.label), op.hint ? h('span.action-hint', null, op.hint) : null),
              icon('chev-right', 16, 'row-chev'));
          }));
        },
        onClose: function () { if (!done) resolve(null); }
      });
    });
  };
  function closeDialog(value) {
    const d = ui.dialog;
    if (!d) return;
    ui.dialog = null;
    d.resolve(value === '__input' ? String(d.input.value || '').trim() : value);
    EV.redraw();
  }
  function renderDialog(d) {
    /* the backdrop closes it only when the press both started and ended on the backdrop (not a text selection dragged out of the panel) */
    return h('div.dialog-wrap', { key: 'dialog', onpointerdown: function (e) { d._downOnWrap = e.target === e.currentTarget; },
      onclick: function (e) { if (e.target === e.currentTarget && d._downOnWrap !== false && d.buttons.length > 1) closeDialog(d.buttons[0].value); d._downOnWrap = undefined; } },
      h('div.dialog', { role: 'alertdialog', 'aria-modal': 'true' },
        h('div.dialog-title', null, d.title),
        d.message ? h('div.dialog-msg', null, d.message) : null,
        d.body || null,
        d.input ? h('div.dialog-input', null, d.input.label ? h('span.field-label', null, d.input.label) : null,
          ui.input(d.input.value, { id: 'dialog-input', ph: d.input.ph, mono: d.input.mono, type: d.input.type,
            oninput: function (v) { d.input.value = v; }, onkeydown: function (e) { if (e.key === 'Enter') closeDialog('__input'); } })) : null,
        h('div.dialog-actions', null, d.buttons.map(function (b, i) { return ui.btn(b.label, { kind: b.kind, key: 'b' + i, onclick: function () { closeDialog(b.value); } }); }))));
  }
  /* o.gated: the lock or sign-in screen is showing. Open sheets are neither drawn nor reachable until it is passed
     (they are kept, so work in progress is still there afterwards); dialogs and messages remain for the gate's own use. */
  ui.renderOverlays = function (o) {
    const out = [];
    ui.gated = !!(o && o.gated);
    (ui.gated ? [] : ui.sheets).forEach(function (s) {
      const title = typeof s.title === 'function' ? s.title() : s.title;
      const sub = typeof s.sub === 'function' ? s.sub() : s.sub;
      let body;
      try { body = s.render(); } catch (e) { console.error(e); body = ui.note('danger', 'This panel could not be displayed: ' + (e && e.message || e)); }
      out.push(h('div', { 'class': U.cx('sheet-wrap', 'sheet-' + (s.size || 'full')), key: s.id, onpointerdown: function (e) { s._downOnWrap = e.target === e.currentTarget; },
        onclick: function (e) { if (e.target === e.currentTarget && s._downOnWrap !== false) ui.requestClose(s); s._downOnWrap = undefined; } },
        h('div.sheet', { role: 'dialog', 'aria-modal': 'true', 'aria-label': String(title || '') },
          h('div.sheet-head', null,
            h('div.sheet-titles', null, h('div.sheet-title', null, title), sub ? h('div.sheet-sub', null, sub) : null),
            s.headRight ? s.headRight() : null,
            ui.iconBtn('x', { title: 'Close', onclick: function () { ui.requestClose(s); } })),
          h('div.sheet-body', { id: 'sheet-body-' + s.id }, body),
          s.footer ? h('div.sheet-foot', null, s.footer()) : null)));
    });
    /* a question asked before the lock stays hidden, and pending, until the gate is passed */
    if (ui.shownDialog()) out.push(renderDialog(ui.dialog));
    out.push(h('div.toasts', { key: 'toasts', 'aria-live': 'polite' }, ui.toasts.map(function (t) { return h('div', { 'class': 'toast toast-' + t.tone, key: t.id }, t.msg); })));
    return out;
  };
  /* The dialog the user can see right now (none while the lock or sign-in screen covers one that was already open). */
  ui.shownDialog = function () { return ui.dialog && (!ui.gated || ui.dialog.gate) ? ui.dialog : null; };
  /* Something is open underneath the lock or sign-in screen and must be neither closed nor answered from there. */
  ui.heldByGate = function () { return !!ui.gated && (ui.sheets.length > 0 || (!!ui.dialog && !ui.dialog.gate)); };
  /* Escape / the back gesture: answer a question with its cancel button; a plain notice stays until acknowledged. */
  ui.dismissDialog = function () { const d = ui.shownDialog(); if (d && d.buttons.length > 1) closeDialog(d.buttons[0].value); };
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (ui.shownDialog()) ui.dismissDialog();
    else if (ui.sheets.length && !ui.gated) ui.requestClose(ui.sheets[ui.sheets.length - 1]);
  });

  /* ------------------------------------------------------------------ reference pickers and cascades */
  const REF_TYPES = { building: 1, floor: 1, area: 1, room: 1, rack: 1, device: 1, 'switch': 1 };
  const WHOLE_NUMBER_FIELDS = { capacity: 1, floors_count: 1, height_ru: 1, quantity: 1, min_stock: 1 };
  ui.refOptions = function (type, rec) {
    const multi = store.all('buildings').length > 1;
    switch (type) {
      case 'building': return U.sortBy(store.all('buildings').filter(function (b) { return !b.archived || b.id === rec.building_id; }), function (b) { return b.name; }).map(function (b) { return [b.id, b.name]; });
      case 'floor': {
        const list = rec.building_id ? R.buildingFloors(rec.building_id) : U.sortBy(store.all('floors').filter(function (f) { return !f.archived; }), function (f) { return f.number; });
        return list.map(function (f) { const b = store.get('buildings', f.building_id); return [f.id, (multi && !rec.building_id && b ? b.name + ' · ' : '') + 'Floor ' + f.number]; });
      }
      case 'area': return rec.floor_id ? U.sortBy(store.by('areas', 'floor_id', rec.floor_id).filter(function (a) { return !a.archived; }), function (a) { return a.name; }).map(function (a) { return [a.id, a.name]; }) : [];
      case 'room': {
        let list;
        if (rec.floor_id) list = R.floorRooms(rec.floor_id);
        else list = U.sortBy(R.liveRooms().filter(function (r) { return !rec.building_id || r.building_id === rec.building_id; }), function (r) { return r.number || r.name; });
        return list.map(function (r) { return [r.id, R.roomLabel(r)]; });
      }
      case 'rack': return rec.room_id ? store.by('racks', 'room_id', rec.room_id).filter(function (k) { return !k.archived; }).map(function (k) { return [k.id, k.name]; }) : [];
      case 'device': {
        let list = R.liveDevices();
        if (rec.room_id) list = list.filter(function (d) { return d.room_id === rec.room_id; });
        else if (rec.floor_id) list = list.filter(function (d) { return d.floor_id === rec.floor_id; });
        return U.sortBy(list, function (d) { return R.deviceLabel(d); }).map(function (d) { return [d.id, R.deviceLabel(d)]; });
      }
      case 'switch': return U.sortBy(store.all('infra_assets').filter(function (a) { return a.asset_type === 'switch' && !a.archived; }), function (a) { return a.name; })
        .map(function (a) { return [a.id, a.name || a.hostname || 'Switch']; }).concat([['__new', '＋ Add a switch…']]);
      default: return [];
    }
  };
  /* Keeps building / floor / room / device references mutually consistent when one of them changes. */
  ui.cascade = function (rec, k, v) {
    const p = {};
    p[k] = v === '' ? null : v;
    if (k === 'building_id') {
      const f = store.get('floors', rec.floor_id);
      if (f && f.building_id !== v) { p.floor_id = null; if ('room_id' in rec) p.room_id = null; if ('device_id' in rec) p.device_id = null; }
    } else if (k === 'floor_id') {
      const f = store.get('floors', v);
      if (f) p.building_id = f.building_id;
      const r = store.get('rooms', rec.room_id);
      if (r && r.floor_id !== v) { p.room_id = null; if ('device_id' in rec) p.device_id = null; if ('rack_id' in rec) p.rack_id = null; }
      if ('area_id' in rec) { const a = store.get('areas', rec.area_id); if (a && a.floor_id !== v) p.area_id = null; }
    } else if (k === 'room_id') {
      const r = store.get('rooms', v);
      if (r) { p.floor_id = r.floor_id; p.building_id = r.building_id; }
      if ('device_id' in rec && rec.device_id) { const d = store.get('devices', rec.device_id); if (d && d.room_id !== v) p.device_id = null; }
      if ('rack_id' in rec && rec.rack_id) { const k2 = store.get('racks', rec.rack_id); if (k2 && k2.room_id !== v) p.rack_id = null; }
    } else if (k === 'device_id') {
      const d = store.get('devices', v);
      /* only for records that carry a location of their own (a switch-port row, for example, does not) */
      if (d) { if ('room_id' in rec && d.room_id) p.room_id = d.room_id; if ('floor_id' in rec && d.floor_id) p.floor_id = d.floor_id; if ('building_id' in rec && d.building_id) p.building_id = d.building_id; }
    }
    return p;
  };

  /* ------------------------------------------------------------------ schema-driven forms */
  const ID_LABEL = { verified: 'Verified', recorded: 'Recorded — not verified', missing: 'Missing', na: 'Not applicable' };
  function identField(f, rec, onSet, o) {
    const idf = R.ID_FIELDS.find(function (x) { return x.k === f.k; });
    const state = R.idState(rec, idf);
    const status = rec[f.statusKey] || 'unknown';
    const val = rec[f.k] || '';
    let err = '';
    if (f.k === 'ip_address' && val && !R.ipValid(val)) err = 'This does not look like a valid IP address.';
    if (f.k === 'mac_address' && val && !R.macValid(val)) err = 'A MAC address has 12 hexadecimal digits.';
    const na = status === 'not_applicable';
    return h('div', { 'class': U.cx('field', 'ident', 'ident-' + state), key: f.k },
      h('div.ident-head', null,
        h('span.field-label', null, f.label, h('span.req', null, ' *')),
        ui.chip(ID_LABEL[state], ui.tone.id[state])),
      h('div.ident-row', null,
        ui.input(val, { mono: true, id: 'f-' + (o.idPrefix || '') + f.k, inputmode: f.inputmode, disabled: na,
          ph: na ? 'Not applicable to this device' : (f.k === 'mac_address' ? '00:00:00:00:00:00' : f.k === 'ip_address' ? '0.0.0.0' : 'As printed on the device'),
          oninput: function (v) { onSet(f.k, f.k === 'mac_address' ? R.macFormat(v) : v.trim()); } }),
        ui.select(status, S.ID_STATUS, { empty: false, cls: 'ident-status', aria: f.label + ' verification status', onchange: function (v) { onSet(f.statusKey, v); } })),
      err ? h('span.field-error', null, err)
        : state === 'missing' ? h('span.field-hint.hint-danger', null, 'Missing. The device stays in the inventory, is flagged incomplete, and a follow-up task is tracked. Values are never assumed.')
          : state === 'recorded' ? h('span.field-hint.hint-warn', null, 'Value recorded but not verified. Set how it was verified, or who must confirm it.')
            : (f.hint ? h('span.field-hint', null, f.hint) : null));
  }
  ui.formField = function (f, rec, onSet, o) {
    o = o || {};
    if (f.type === 'ident') return identField(f, rec, onSet, o);
    const v = rec[f.k];
    const missing = !!(o.showMissing && f.req && U.blank(v));
    const fo = { req: f.req, half: f.half, hint: f.hint, key: f.k, missing: missing, error: missing ? 'Required' : null };
    const id = 'f-' + (o.idPrefix || '') + f.k;
    let control;
    const type = f.type || 'text';
    if (type === 'textarea') {
      control = ui.textarea(v, { id: id, rows: f.rows || 3, ph: f.ph, oninput: function (val) { onSet(f.k, val); } });
    } else if (type === 'number') {
      /* counts are whole, non-negative numbers (they are integer columns in the database); other figures may be decimal */
      const whole = !!WHOLE_NUMBER_FIELDS[f.k];
      control = ui.input(v == null ? '' : v, { id: id, type: 'number', inputmode: whole ? 'numeric' : 'decimal', min: 0, step: whole ? 1 : 'any', ph: f.ph, mono: true, oninput: function (val) {
        const n = val === '' ? null : Number(val);
        onSet(f.k, n == null || !isFinite(n) ? null : whole ? Math.max(0, Math.round(n)) : Math.max(0, n));
      } });
    } else if (type === 'date') {
      control = ui.input(v || '', { id: id, type: 'date', oninput: function (val) { onSet(f.k, val || null); }, onchange: function (val) { onSet(f.k, val || null); } });
    } else if (type === 'select') {
      const opts = typeof f.opts === 'function' ? f.opts(rec) : f.opts;
      control = ui.select(v, opts, { id: id, onchange: function (val) { onSet(f.k, val); } });
    } else if (type === 'combo') {
      const lid = 'dl-' + (o.idPrefix || '') + f.k;
      fo.div = true;
      control = h('div.combo', null,
        ui.input(v, { id: id, list: lid, ph: f.ph, oninput: function (val) { onSet(f.k, val); } }),
        h('datalist', { id: lid }, (typeof f.opts === 'function' ? f.opts(rec) : f.opts).map(function (x) { return h('option', { value: x }); })));
    } else if (type === 'toggle') {
      fo.div = true; fo.cls = 'field-toggle';
      control = ui.toggle(!!v, { id: id, onchange: function (val) { onSet(f.k, val); } });
    } else if (REF_TYPES[type]) {
      const opts = ui.refOptions(type, rec);
      control = ui.select(v, opts, { id: id, placeholder: type === 'switch' ? 'Not documented' : 'Not set', unknownLabel: '(archived or removed)',
        onchange: function (val) {
          if (type === 'switch' && val === '__new') {
            ui.prompt({ title: 'Add a network switch', label: 'Switch hostname as labelled or reported', ph: 'e.g. SITE-22-SW01', mono: true, confirm: 'Add switch' }).then(function (name) {
              if (!name) { EV.redraw(); return; }
              const a = store.create('infra_assets', { asset_type: 'switch', name: name, hostname: name, validation_status: 'observed', source: 'Recorded during device inventory',
                building_id: rec.building_id || null, floor_id: rec.floor_id || null });
              onSet(f.k, a.id);
            });
            return;
          }
          onSet(f.k, val);
        } });
    } else {
      control = ui.input(v, { id: id, ph: f.ph, mono: f.mono, inputmode: f.inputmode, oninput: function (val) { onSet(f.k, val); } });
    }
    return ui.field(f.label, control, fo);
  };
  ui.form = function (fields, rec, onSet, o) {
    const groups = [];
    let cur = null;
    fields.forEach(function (f) {
      if (f.show && !f.show(rec)) return;
      const g = f.group || '';
      if (!cur || cur.name !== g) { cur = { name: g, items: [] }; groups.push(cur); }
      cur.items.push(f);
    });
    /* The key includes the form's own prefix: two forms rendered side by side must never share a key, or the second
       one is rebuilt on every redraw and the field being typed in loses focus. */
    const kp = 'fg:' + ((o && (o.idPrefix || o.key)) || '') + ':';
    return groups.map(function (g, gi) {
      return h('div.form-group', { key: kp + gi + g.name },
        g.name ? h('div.form-group-title', null, g.name) : null,
        h('div.form-grid', null, g.items.map(function (f) { return ui.formField(f, rec, onSet, o); })));
    });
  };
  ui.missingRequired = function (fields, rec) {
    return fields.filter(function (f) { return f.req && f.type !== 'ident' && (!f.show || f.show(rec)) && U.blank(rec[f.k]); });
  };

  /* ------------------------------------------------------------------ generic record editor (autosaving sheet)
   * o: { table, id, title, sub, fields | fn(rec), isNew, strict, before(rec), after(rec), onSet(rec,k,v,patch), onDone(rec), canDelete, deleteLabel, onDeleted, size } */
  ui.openEditor = function (o) {
    const state = { tried: false };
    function rec() { return store.get(o.table, o.id); }
    function fieldsOf(r) { return typeof o.fields === 'function' ? o.fields(r) : o.fields; }
    function set(k, v) {
      const r = rec();
      if (!r) return;
      const def = fieldsOf(r).find(function (f) { return f.k === k; });
      const patch = def && REF_TYPES[def.type] ? ui.cascade(r, k, v) : {};
      if (!(k in patch)) patch[k] = v;
      if (o.onSet) o.onSet(r, k, v, patch);
      store.update(o.table, o.id, patch);
    }
    function finish() {
      const r = rec();
      if (r && o.strict !== false) {
        const miss = ui.missingRequired(fieldsOf(r), r);
        if (miss.length) {
          state.tried = true;
          EV.toast('Complete the required fields: ' + miss.map(function (f) { return f.label; }).join(', '), 'warn', 4200);
          return false;
        }
      }
      return true;
    }
    const sheet = ui.openSheet({
      size: o.size || 'full',
      title: function () { const r = rec(); return typeof o.title === 'function' ? o.title(r) : o.title; },
      sub: function () { const r = rec(); return typeof o.sub === 'function' ? o.sub(r) : o.sub; },
      render: function () {
        const r = rec();
        if (!r) return ui.empty({ icon: 'alert-circle', title: 'This record no longer exists.' });
        return [
          o.before ? o.before(r) : null,
          ui.form(fieldsOf(r), r, set, { showMissing: state.tried, idPrefix: sheet ? sheet.id + '-' : '' }),
          o.after ? o.after(r) : null
        ];
      },
      footer: function () {
        const r = rec();
        return [
          o.isNew ? ui.btn('Discard', { kind: 'ghost', key: 'discard', onclick: function () { EV.act.discard(o.table, o.id); sheet.discarded = true; ui.closeSheet(sheet); EV.toast('Discarded'); } })
            : (o.canDelete !== false && r ? ui.btn(o.deleteLabel || 'Delete', { kind: 'ghost-danger', icon: 'trash', key: 'delete', onclick: function () {
              ui.confirm({ title: (o.deleteLabel || 'Delete') + ' this record?', message: 'It is removed from active lists. History and previous exports keep their record of it.', confirm: o.deleteLabel || 'Delete', danger: true })
                .then(function (ok) { if (!ok) return; EV.act.remove(o.table, o.id); sheet.discarded = true; ui.closeSheet(sheet); if (o.onDeleted) o.onDeleted(); EV.toast('Removed'); });
            } }) : null),
          h('span.grow', { key: 'grow' }),
          h('span.saved-hint', { key: 'hint' }, 'Changes save automatically'),
          ui.btn('Done', { kind: 'primary', key: 'done', onclick: function () { if (finish()) ui.closeSheet(sheet); } })
        ];
      },
      beforeClose: function () {
        const r = rec();
        if (!r || sheet.discarded) return true;
        if (o.strict === false) return true;
        const miss = ui.missingRequired(fieldsOf(r), r);
        if (!miss.length) return true;
        if (o.isNew) {
          return ui.confirm({ title: 'Discard this new record?', message: 'Required fields are still empty: ' + miss.map(function (f) { return f.label; }).join(', ') + '.', confirm: 'Discard', cancel: 'Keep editing', danger: true })
            .then(function (ok) { if (ok) { EV.act.discard(o.table, o.id); sheet.discarded = true; } return ok; });
        }
        state.tried = true;
        EV.toast('Complete the required fields: ' + miss.map(function (f) { return f.label; }).join(', '), 'warn', 4200);
        return false;
      },
      onClose: function () { const r = rec(); if (r && o.onDone && !sheet.discarded) o.onDone(r); },
      /* The screen changed underneath the sheet (a link inside it was followed). A new record that still lacks its
         required fields is abandoned, exactly as if "Discard" had been confirmed; anything else is simply kept. */
      onRouteClose: function () {
        const r = rec();
        if (r && o.isNew && !sheet.discarded && o.strict !== false && ui.missingRequired(fieldsOf(r), r).length) { EV.act.discard(o.table, o.id); sheet.discarded = true; }
      }
    });
    return sheet;
  };

  /* ------------------------------------------------------------------ room picker (floor → room in two taps) */
  ui.pickRoom = function (o) {
    o = o || {};
    return new Promise(function (resolve) {
      let done = false;
      const floors = [];
      store.all('buildings').filter(function (b) { return !b.archived; }).forEach(function (b) { R.buildingFloors(b.id).forEach(function (f) { floors.push(f); }); });
      const last = store.kvGet('last_floor');
      const st = { floor: (floors.find(function (f) { return f.id === last; }) || floors[0] || {}).id };
      const sheet = ui.openSheet({
        title: o.title || 'Select a room', sub: o.sub, size: 'full',
        render: function () {
          if (!floors.length) return ui.empty({ icon: 'building', title: 'No floors yet', text: 'Add a building and floor under Buildings & Floors first.' });
          const rooms = R.floorRooms(st.floor);
          const configs = o.configs ? store.by('room_configurations', 'floor_id', st.floor).filter(function (c) { return !c.archived; }) : [];
          return [
            h('div.chip-scroll', null, floors.map(function (f) {
              return h('button', { type: 'button', key: f.id, 'class': U.cx('pill', f.id === st.floor && 'on'), onclick: function () { st.floor = f.id; } }, 'Floor ' + f.number);
            })),
            h('div.list', null,
              rooms.length ? rooms.map(function (r) {
                const rs = R.roomState(r.id);
                return ui.row({ key: r.id, title: R.roomLabel(r), sub: r.room_type + (r.capacity ? ' · ' + r.capacity + ' seats' : ''), right: ui.auditChip(rs.state),
                  onclick: function () { done = true; store.kvSet('last_floor', st.floor); ui.closeSheet(sheet); resolve({ room: r }); } });
              }) : ui.empty({ icon: 'grid', title: 'No rooms on this floor yet' }),
              configs.map(function (c) {
                const cs = R.configState(c.id);
                return ui.row({ key: c.id, title: c.name, sub: 'Combined configuration', left: icon('layers', 18), right: ui.auditChip(cs.state),
                  onclick: function () { done = true; ui.closeSheet(sheet); resolve({ config: c }); } });
              }))
          ];
        },
        onClose: function () { if (!done) resolve(null); }
      });
    });
  };
})();
