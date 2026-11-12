/* pages/infrastructure.js — enterprise network and infrastructure documentation.
 * This module documents what was observed or confirmed by Client IT. It never scans, probes or configures anything. */
(function () {
  'use strict';
  const EV = window.EV, h = EV.h, U = EV.U, S = EV.S, store = EV.store, ui = EV.ui, icon = EV.icon, R = EV.rules, A = EV.act;
  const st = { tab: 'overview', applied: '', depFilter: 'all', q: '' };

  function assets(type) { return U.sortBy(store.all('infra_assets').filter(function (a) { return !a.archived && (!type || a.asset_type === type); }), function (a) { return a.name; }); }
  function vChip(v) { return ui.chip(S.label(S.VALIDATION_STATUS, v || 'unknown'), ui.tone.validation[v || 'unknown']); }
  function needsIt(a) { return !a.validation_status || a.validation_status === 'awaiting_it' || a.validation_status === 'unknown'; }
  function uplinks() { return store.all('network_links').filter(function (l) { return l.kind === 'uplink'; }); }
  function deps() { return store.all('network_links').filter(function (l) { return l.kind === 'dependency'; }); }

  /* the documented, in-service switch a device is mapped to, or null (also when that switch was deleted or archived) */
  function liveSwitch(id) { const a = id ? store.get('infra_assets', id) : null; return a && !a.archived && a.asset_type === 'switch' ? a : null; }

  /* ------------------------------------------------------------------ editors */
  EV.editors.infra = function (id, isNew) {
    /* a switch that still has documented ports or mapped devices cannot be deleted: that would leave those devices
       mapped to nothing and its port documentation unreachable */
    const rec = store.get('infra_assets', id);
    const inUse = rec && rec.asset_type === 'switch' ? { ports: store.by('switch_ports', 'switch_asset_id', id).length, devices: store.by('devices', 'switch_asset_id', id).length } : { ports: 0, devices: 0 };
    return ui.openEditor({
      table: 'infra_assets', id: id, isNew: isNew, fields: S.F.infra, canDelete: !inUse.ports && !inUse.devices,
      title: function (a) { return a ? (isNew ? 'New infrastructure record' : S.label(S.INFRA_TYPES, a.asset_type) + ' · ' + (a.name || '')) : 'Infrastructure record'; },
      sub: function (a) { return a ? a.code : ''; },
      before: function (a) {
        return needsIt(a) && !isNew ? ui.note('warn', 'This record has not been validated by Client IT. Treat its values as unverified.', { key: 'v',
          action: h('div.btn-row', null, ui.btn('Draft IT validation request', { sm: true, icon: 'message', onclick: function () {
            EV.editors.newRequest({}, { topic: 'Validate ' + S.label(S.INFRA_TYPES, a.asset_type).toLowerCase() + ' — ' + a.name, requested_from: 'Client IT',
              request_type: a.asset_type === 'vlan' ? 'VLAN details' : a.asset_type === 'dhcp_reservation' ? 'DHCP mappings' : a.asset_type === 'firewall_rule' ? 'Firewall requirements' : a.asset_type === 'multicast' ? 'Multicast' : a.asset_type === 'qos' ? 'QoS' : (a.asset_type === 'dns_server' || a.asset_type === 'ntp_server' || a.asset_type === 'dns_record') ? 'DNS/NTP' : a.asset_type === 'switch' ? 'Switch port information' : 'Other',
              description: 'Please confirm the following recorded value.\n' + a.name + (a.identifier ? ' — ' + a.identifier : '') + (a.description ? '\n' + a.description : ''),
              reason: 'Recorded during the AV audit and not yet validated.', needed_for: 'Infrastructure documentation', building_id: a.building_id, floor_id: a.floor_id, room_id: a.room_id, device_id: a.device_id });
          } })) }) : null;
      },
      after: function (a) {
        if (a.asset_type !== 'switch' || isNew) return null;
        const ports = store.by('switch_ports', 'switch_asset_id', a.id);
        return h('div.form-group', { key: 'ports' }, h('div.form-group-title', null, 'Ports documented'),
          h('span.field-hint', null, U.plural(ports.length, 'port') + ' recorded. Manage them on the Switches & ports tab.'),
          inUse.ports || inUse.devices ? h('p.muted', null, 'This switch has ' + [inUse.ports ? U.plural(inUse.ports, 'documented port') : '', inUse.devices ? U.plural(inUse.devices, 'mapped device') : ''].filter(Boolean).join(' and ') +
            ', so it cannot be deleted: those devices would be left mapped to nothing. Remove its port records and re-map its devices first.') : null);
      }
    });
  };
  EV.editors.newInfra = function (type, prefill) {
    const a = store.create('infra_assets', Object.assign({ asset_type: type || 'vlan', name: '', identifier: '', description: '', building_id: null, floor_id: null, room_id: null, device_id: null, model: '',
      /* how far a new record can be trusted is for the auditor to state; until then it is not validated */
      hostname: '', management_ip: '', ip_address: '', mac_address: '', vlan: '', subnet: '', gateway: '', assignment_type: '', poe_budget_w: null, poe_used_w: null, validation_status: 'unknown',
      source: '', notes: '', archived: false }, prefill || {}));
    return EV.editors.infra(a.id, true);
  };
  EV.editors.port = function (id, isNew) {
    const before = store.get('switch_ports', id) || {};
    const was = { device_id: before.device_id || null, port: before.port || '' };
    return ui.openEditor({
      table: 'switch_ports', id: id, isNew: isNew, fields: S.F.port,
      title: function (p) { const sw = p ? store.get('infra_assets', p.switch_asset_id) : null; return (sw ? sw.name + ' · ' : '') + (p && p.port ? 'port ' + p.port : 'New port'); },
      onDone: function (p) {
        /* Keep the device records in step with the port register, in both directions. */
        const sw = store.get('infra_assets', p.switch_asset_id);
        /* 1 — the device that was on this port before is no longer on it */
        if (was.device_id && was.device_id !== p.device_id) {
          const old = store.get('devices', was.device_id);
          if (old && old.switch_asset_id === p.switch_asset_id && (old.switch_port === was.port || old.switch_port === p.port)) store.update('devices', old.id, { switch_asset_id: null, switch_port: '', connected_switch: '' });
        }
        if (!p.device_id) return;
        /* 2 — the device now on this port is on no other port */
        store.by('switch_ports', 'device_id', p.device_id).forEach(function (o) { if (o.id !== p.id) store.update('switch_ports', o.id, { device_id: null }); });
        /* 3 — and its own record says so */
        const d = store.get('devices', p.device_id);
        if (d && (d.switch_asset_id !== p.switch_asset_id || d.switch_port !== p.port)) store.update('devices', d.id, { switch_asset_id: p.switch_asset_id, switch_port: p.port, connected_switch: sw ? sw.name : d.connected_switch });
      }
    });
  };
  function linkEditor(id, isNew, kind) {
    const devOpts = function () { return U.sortBy(R.liveDevices(), R.deviceLabel).map(function (d) { return [d.id, R.deviceLabel(d) + (R.where(d) ? ' (' + R.where(d) + ')' : '')]; }); };
    const assetOpts = function () { return assets().map(function (a) { return [a.id, S.label(S.INFRA_TYPES, a.asset_type) + ' · ' + a.name]; }); };
    const swOpts = function () { return assets('switch').map(function (a) { return [a.id, a.name]; }); };
    const fields = kind === 'uplink' ? [
      { k: 'from_id', label: 'Switch', type: 'select', opts: swOpts, req: true, half: true }, { k: 'from_port', label: 'Uplink port', half: true, mono: true, ph: 'e.g. 1/0/48' },
      { k: 'to_id', label: 'Upstream switch', type: 'select', opts: swOpts, req: true, half: true }, { k: 'to_port', label: 'Upstream port', half: true, mono: true },
      { k: 'description', label: 'Description', ph: 'Media, speed, LAG membership…' }, { k: 'status', label: 'Status', type: 'select', opts: S.DEP_STATUS, half: true }, { k: 'notes', label: 'Notes', type: 'textarea', rows: 2 }
    ] : [
      { k: 'from_id', label: 'Device', type: 'select', opts: devOpts, req: true }, { k: 'dep_type', label: 'Depends on', type: 'select', opts: S.DEP_TYPES, req: true, half: true },
      { k: 'status', label: 'Status', type: 'select', opts: S.DEP_STATUS, half: true }, { k: 'to_id', label: 'Documented record (optional)', type: 'select', opts: assetOpts },
      { k: 'description', label: 'Description', type: 'textarea', rows: 2, ph: 'What the device needs and why' }, { k: 'notes', label: 'Notes', type: 'textarea', rows: 2 }
    ];
    return ui.openEditor({ table: 'network_links', id: id, isNew: isNew, fields: fields, size: 'auto', title: kind === 'uplink' ? (isNew ? 'New uplink' : 'Uplink') : (isNew ? 'New dependency' : 'Dependency'),
      onSet: function (l, k, v, patch) { if (k === 'to_id') patch.to_type = v ? 'infra_asset' : ''; } });
  }
  EV.editors.dependency = function (id, isNew) { return linkEditor(id, isNew, (store.get('network_links', id) || {}).kind === 'uplink' ? 'uplink' : 'dependency'); };
  EV.editors.newDependency = function (device, prefill) {
    const l = store.create('network_links', Object.assign({ kind: 'dependency', from_type: 'device', from_id: device ? device.id : '', to_type: '', to_id: '', from_port: '', to_port: '', dep_type: '',
      description: '', status: 'unknown', notes: '' }, prefill || {}));
    return linkEditor(l.id, true, 'dependency');
  };
  EV.editors.newUplink = function (sw) {
    const l = store.create('network_links', { kind: 'uplink', from_type: 'infra_asset', from_id: sw ? sw.id : '', to_type: 'infra_asset', to_id: '', from_port: '', to_port: '', dep_type: '', description: '', status: 'unknown', notes: '' });
    return linkEditor(l.id, true, 'uplink');
  };

  /* ------------------------------------------------------------------ topology diagram */
  function topology() {
    const switches = assets('switch');
    if (!switches.length) return null;
    const parentOf = new Map();
    /* the same uplink recorded from both ends (A → B and B → A) is one connection: the second record is not drawn again */
    uplinks().forEach(function (l) {
      if (!l.from_id || !l.to_id || l.from_id === l.to_id) return;
      const back = parentOf.get(l.to_id);
      if (back && back.to_id === l.from_id) return;
      parentOf.set(l.from_id, l);
    });
    const kids = new Map();
    switches.forEach(function (s) {
      const l = parentOf.get(s.id);
      const pid = l && switches.some(function (x) { return x.id === l.to_id; }) ? l.to_id : 'root';
      if (!kids.has(pid)) kids.set(pid, []);
      kids.get(pid).push(s);
    });
    const devs = R.liveDevices();
    const out = []; const lines = [];
    const SW_W = 200, SW_H = 46, DV_W = 262, DV_H = 26, GAP = 8, LANE = 46;
    let y = 12, maxX = 0;
    const seen = new Set();
    function place(sw, level) {
      if (seen.has(sw.id)) return;
      seen.add(sw.id);
      const x = 12 + level * 30, top = y;
      const mapped = U.sortBy(devs.filter(function (d) { return d.switch_asset_id === sw.id; }), function (d) { return d.switch_port || 'zzz'; });
      const up = parentOf.get(sw.id);
      out.push(h('g', { key: 'sw' + sw.id, 'class': 'topo-node', onclick: function () { EV.editors.infra(sw.id); } },
        h('rect', { x: x, y: top, width: SW_W, height: SW_H, rx: 8, 'class': 'topo-sw' + (needsIt(sw) ? ' topo-unv' : '') }),
        h('text', { x: x + 12, y: top + 19, 'class': 'topo-t1' }, U.trunc(sw.name || 'Switch', 26)),
        h('text', { x: x + 12, y: top + 35, 'class': 'topo-t2' }, U.trunc([sw.model, sw.management_ip].filter(Boolean).join(' · ') || (needsIt(sw) ? 'Awaiting IT validation' : 'Switch'), 34)),
        up ? h('text', { x: x + SW_W - 8, y: top + 19, 'class': 'topo-t3', 'text-anchor': 'end' }, up.from_port ? '↑ ' + up.from_port : '↑') : null));
      mapped.forEach(function (d, i) {
        const dx = x + SW_W + LANE, dy = top + i * (DV_H + GAP);
        const room = store.get('rooms', d.room_id);
        const r = R.device(d);
        lines.push(h('path', { key: 'l' + d.id, 'class': 'topo-line', d: 'M' + (x + SW_W) + ' ' + (top + SW_H / 2) + ' H' + (x + SW_W + LANE / 2) + ' V' + (dy + DV_H / 2) + ' H' + dx }));
        out.push(h('g', { key: 'dv' + d.id, 'class': 'topo-node', onclick: function () { EV.editors.device(d.id); } },
          h('rect', { x: dx, y: dy, width: DV_W, height: DV_H, rx: 6, 'class': 'topo-dv' + (r.identified ? '' : ' topo-bad') }),
          h('text', { x: dx + 8, y: dy + 17, 'class': 'topo-port' }, U.trunc(d.switch_port || '?', 9)),
          h('text', { x: dx + 66, y: dy + 17, 'class': 'topo-t2b' }, U.trunc(d.hostname || R.deviceType(d), 22)),
          h('text', { x: dx + DV_W - 8, y: dy + 17, 'class': 'topo-t3', 'text-anchor': 'end' }, room ? U.trunc(room.number || room.name, 8) : '')));
      });
      const blockH = Math.max(SW_H, mapped.length * (DV_H + GAP) - GAP);
      maxX = Math.max(maxX, x + SW_W + (mapped.length ? LANE + DV_W : 0));
      y = top + blockH + 22;
      (kids.get(sw.id) || []).forEach(function (child) {
        const cy = y;
        const l = parentOf.get(child.id);
        lines.push(h('path', { key: 'u' + child.id, 'class': 'topo-line topo-uplink' + (l && l.status !== 'confirmed' ? ' topo-dash' : ''), d: 'M' + (x + 14) + ' ' + (top + SW_H) + ' V' + (cy + SW_H / 2) + ' H' + (x + 30 + 12) }));
        place(child, level + 1);
      });
    }
    (kids.get('root') || []).forEach(function (s) { place(s, 0); });
    switches.forEach(function (s) { place(s, 0); });
    const w = Math.max(maxX + 12, 340), hgt = y;
    return h('div.topo-wrap', null, h('svg', { 'class': 'topo', viewBox: '0 0 ' + w + ' ' + hgt, width: w, height: hgt, role: 'img', 'aria-label': 'Topology: switches, uplinks and the devices mapped to each port' }, lines, out));
  }

  /* ------------------------------------------------------------------ tabs */
  function overview() {
    const all = assets();
    const sw = assets('switch');
    const ds = R.deviceStats();
    const awaiting = all.filter(needsIt);
    const dl = deps();
    const unconf = dl.filter(function (l) { return l.status !== 'confirmed'; }).length;
    const budget = U.sum(sw, function (s) { return Number(s.poe_budget_w) || 0; }), used = U.sum(sw, function (s) { return Number(s.poe_used_w) || 0; });
    const mapped = R.liveDevices().filter(function (d) { return R.isNetworked(d) && !U.blank(d.switch_port); }).length;
    const unmapped = R.liveDevices().filter(function (d) { return R.isNetworked(d) && !liveSwitch(d.switch_asset_id); });
    return [
      ui.note('info', 'A documentation and audit record. Values are entered by the auditor from observation or from Client IT; the application performs no network discovery, scanning or configuration.', { title: 'Documentation only' }),
      h('div.tiles.tiles-6', null,
        ui.stat({ key: 's', label: 'Switches', value: sw.length, onclick: function () { st.tab = 'switches'; } }),
        ui.stat({ key: 'v', label: 'VLANs / subnets', value: all.filter(function (a) { return a.asset_type === 'vlan' || a.asset_type === 'subnet'; }).length, onclick: function () { st.tab = 'addressing'; } }),
        ui.stat({ key: 'a', label: 'Awaiting IT validation', value: awaiting.length, tone: awaiting.length ? 'warn' : 'ok', sub: 'of ' + all.length + ' records' }),
        ui.stat({ key: 'm', label: 'Devices mapped to a port', value: mapped, unit: '/ ' + ds.networked, tone: ds.networked && mapped === ds.networked ? 'ok' : null }),
        ui.stat({ key: 'd', label: 'Dependencies unconfirmed', value: unconf, unit: '/ ' + dl.length, tone: unconf ? 'warn' : null, onclick: function () { st.tab = 'dependencies'; } }),
        ui.stat({ key: 'p', label: 'PoE in use', value: budget ? Math.round(used) : '—', unit: budget ? '/ ' + Math.round(budget) + ' W' : '', sub: budget ? U.pct(used, budget) + '% of documented budget' : 'No PoE budget documented' })),
      h('section.stack', null, ui.label('Topology — device-to-switch relationships'),
        topology() || ui.empty({ icon: 'network', title: 'No switches documented yet', text: 'Add a switch, then record the port each device connects to.', action: ui.btn('Add switch', { kind: 'primary', icon: 'plus', onclick: function () { EV.editors.newInfra('switch'); } }) }),
        sw.length ? h('div.legend', null, h('span', null, h('i', { style: 'background:var(--accent)' }), 'Switch'), h('span', null, h('i', { style: 'background:var(--warn)' }), 'Not validated by IT'),
          h('span', null, h('i', { style: 'background:var(--danger)' }), 'Device identification incomplete'), h('span', null, 'Dashed line: uplink not confirmed')) : null,
        unmapped.length ? ui.note('warn', U.plural(unmapped.length, 'networked device') + ' not mapped to a documented switch: ' + unmapped.slice(0, 8).map(function (d) { return R.deviceLabel(d) + (d.connected_switch ? ' [' + d.connected_switch + ']' : ''); }).join('; ') + (unmapped.length > 8 ? '…' : '')) : null),
      awaiting.length ? h('section.stack', null, ui.label('Requires Client IT validation', h('span.count', null, String(awaiting.length))),
        h('div.list', null, awaiting.map(function (a) {
          return ui.row({ key: a.id, title: [a.name, ui.demo(a)], sub: [S.label(S.INFRA_TYPES, a.asset_type), a.identifier, a.description].filter(Boolean).join(' · '), right: vChip(a.validation_status), onclick: function () { EV.editors.infra(a.id); } });
        }))) : null
    ];
  }
  function switchesTab() {
    const sw = assets('switch');
    const named = U.groupBy(R.liveDevices().filter(function (d) { return !liveSwitch(d.switch_asset_id) && !U.blank(d.connected_switch); }), function (d) { return d.connected_switch; });
    return [
      h('div.btn-row', null, ui.btn('Add switch', { kind: 'primary', icon: 'plus', onclick: function () { EV.editors.newInfra('switch'); } })),
      !sw.length ? ui.empty({ icon: 'network', title: 'No switches documented' }) : null,
      sw.map(function (s) {
        const ports = U.sortBy(store.by('switch_ports', 'switch_asset_id', s.id), function (p) { return p.port; });
        const ups = uplinks().filter(function (l) { return l.from_id === s.id || l.to_id === s.id; });
        const b = Number(s.poe_budget_w) || 0, u = Number(s.poe_used_w) || 0;
        return h('section.card.card-pad', { key: s.id },
          h('div.card-head', null,
            h('div.stack', { style: 'gap:3px' }, h('h2.h2', null, h('span.mono', null, s.name), ui.demo(s)),
              h('div.page-sub', null, [s.model, s.management_ip ? 'mgmt ' + s.management_ip : '', R.where(s)].filter(Boolean).join(' · ') || 'Model and management address not recorded')),
            h('div.btn-row', null, vChip(s.validation_status), ui.iconBtn('edit', { title: 'Edit switch', onclick: function () { EV.editors.infra(s.id); } }))),
          b ? h('div.stack', { style: 'gap:5px' }, h('div.label-row', null, h('span.label', null, 'PoE budget'), h('span.muted', null, Math.round(u) + ' W of ' + Math.round(b) + ' W · ' + U.pct(u, b) + '%')), ui.progress(U.pct(u, b), U.pct(u, b) > 85 ? 'warn' : null)) : null,
          ups.length ? h('div.chips', null, ups.map(function (l) {
            const other = store.get('infra_assets', l.from_id === s.id ? l.to_id : l.from_id);
            return h('button', { type: 'button', key: l.id, 'class': 'chip chip-btn ' + (l.status === 'confirmed' ? 'chip-ok' : 'chip-warn'), onclick: function () { EV.editors.dependency(l.id); } },
              (l.from_id === s.id ? 'Uplink ' + (l.from_port || '') + ' → ' : 'Downlink ← ') + (other ? other.name : 'unknown') + ' · ' + S.label(S.DEP_STATUS, l.status));
          })) : null,
          ports.length ? h('div.table-wrap', null, h('table.table', null,
            h('thead', null, h('tr', null, ['Port', 'Description', 'Mode / VLAN', 'PoE', 'Connected device', 'Validation'].map(function (c) { return h('th', { key: c }, c); }))),
            h('tbody', null, ports.map(function (p) {
              const d = store.get('devices', p.device_id);
              const room = d ? store.get('rooms', d.room_id) : null;
              return h('tr.click', { key: p.id, onclick: function () { EV.editors.port(p.id); } },
                h('td', null, h('span.mono', null, p.port)),
                h('td', null, p.description || h('span.cell-unv', null, 'Blank')),
                h('td', null, S.label(S.PORT_MODES, p.mode || 'unknown').split(' ')[0] + (p.mode === 'trunk' ? (p.tagged_vlans ? ' · tagged ' + p.tagged_vlans : '') : (p.vlan ? ' · ' + p.vlan : ''))),
                h('td', null, S.label(S.POE_STATUS, p.poe_status || 'unknown')),
                h('td', null, d ? [h('span.mono', { key: 'h' }, d.hostname || R.deviceType(d)), room ? h('span.muted', { key: 'r' }, ' · ' + (room.number || room.name)) : null] : h('span.muted', null, '—')),
                h('td', null, vChip(p.validation_status)));
            })))) : h('p.muted', null, 'No ports documented for this switch.'),
          h('div.btn-row.wrap', null,
            ui.btn('Add port', { sm: true, icon: 'plus', onclick: function () {
              const p = store.create('switch_ports', { switch_asset_id: s.id, port: '', description: '', mode: 'unknown', vlan: '', tagged_vlans: '', untagged_vlan: '', poe_status: 'unknown', poe_class: '', link_speed: '',
                device_id: null, validation_status: 'observed', notes: '' });
              EV.editors.port(p.id, true);
            } }),
            ui.btn('Add uplink', { sm: true, kind: 'ghost', icon: 'link', onclick: function () { EV.editors.newUplink(s); } })));
      }),
      named.size ? h('section.stack', null, ui.label('Switches named on devices but not documented'),
        h('div.list', null, Array.from(named.keys()).map(function (name) {
          const list = named.get(name);
          return h('div.row', { key: name }, h('span.row-main', null, h('span.row-title', null, name), h('span.row-sub', null, U.plural(list.length, 'device') + ': ' + list.map(R.deviceLabel).join('; '))),
            ui.btn('Create record', { sm: true, onclick: function () {
              const a = store.create('infra_assets', { asset_type: 'switch', name: name, hostname: name, validation_status: 'awaiting_it', source: 'Named on device records', building_id: list[0].building_id, floor_id: list[0].floor_id,
                identifier: '', description: '', room_id: null, device_id: null, model: '', management_ip: '', ip_address: '', mac_address: '', vlan: '', subnet: '', gateway: '', assignment_type: '', poe_budget_w: null, poe_used_w: null, notes: '', archived: false });
              list.forEach(function (d) { store.update('devices', d.id, { switch_asset_id: a.id }); A.syncDevicePort(store.get('devices', d.id)); });
              EV.editors.infra(a.id);
            } }));
        }))) : null
    ];
  }
  function addressingTab() {
    const q = st.q.trim().toLowerCase();
    const types = S.INFRA_TYPES.filter(function (t) { return t[0] !== 'switch'; });
    return [
      h('div.toolbar', null, ui.search(st.q, function (v) { st.q = v; }, 'Name, VLAN, subnet, address'),
        ui.btn('Add record', { kind: 'primary', icon: 'plus', onclick: function () {
          ui.choose({ title: 'What are you documenting?', options: types.map(function (t) { return { label: t[1], value: t[0], icon: 'layers' }; }) }).then(function (t) { if (t) EV.editors.newInfra(t); });
        } })),
      types.map(function (t) {
        const list = assets(t[0]).filter(function (a) { return !q || [a.name, a.identifier, a.vlan, a.subnet, a.ip_address, a.hostname, a.description].some(function (v) { return v && String(v).toLowerCase().indexOf(q) >= 0; }); });
        if (!list.length) return null;
        return h('section.stack', { key: t[0], style: 'gap:6px' }, h('div.subhead', null, t[1], h('span.count', null, String(list.length))),
          h('div.list', null, list.map(function (a) {
            const bits = [a.identifier, a.subnet && a.asset_type === 'vlan' ? a.subnet : '', a.ip_address, a.mac_address, a.vlan && a.asset_type !== 'vlan' ? 'VLAN ' + a.vlan : '', a.hostname && a.hostname !== a.name ? a.hostname : ''].filter(Boolean);
            return ui.row({ key: a.id, title: [a.name || 'Unnamed', ui.demo(a)], sub: h('span', null, bits.length ? h('span.mono', null, bits.join(' · ')) : null, a.description ? (bits.length ? ' — ' : '') + a.description : ''),
              right: vChip(a.validation_status), onclick: function () { EV.editors.infra(a.id); } });
          })));
      }),
      !assets().some(function (a) { return a.asset_type !== 'switch'; }) ? ui.empty({ icon: 'layers', title: 'Nothing documented yet', text: 'Record VLANs, subnets, IP ranges, DHCP reservations, static assignments, DNS names, firewall, multicast and QoS dependencies, and monitoring systems.' }) : null
    ];
  }
  function dependenciesTab() {
    const dl = deps();
    const byDev = U.groupBy(dl.filter(function (l) { return l.from_type === 'device'; }), function (l) { return l.from_id; });
    const ids = Array.from(byDev.keys()).filter(function (id) { return store.get('devices', id); });
    const byType = U.groupBy(dl, function (l) { return l.dep_type || 'Unspecified'; });
    const without = R.liveDevices().filter(function (d) { return R.isNetworked(d) && !byDev.has(d.id); });
    return [
      h('div.toolbar', null,
        ui.select(st.depFilter, [['all', 'All dependencies'], ['open', 'Not yet confirmed']], { empty: false, aria: 'Filter', onchange: function (v) { st.depFilter = v; } }),
        ui.btn('Add dependency', { kind: 'primary', icon: 'plus', onclick: function () { EV.editors.newDependency(null); } })),
      byType.size ? h('section.stack', null, ui.label('Common dependencies'),
        h('div.table-wrap', null, h('table.table', null,
          h('thead', null, h('tr', null, ['Dependency', 'Devices', 'Confirmed', 'Awaiting IT', 'Assumed / unknown'].map(function (c, i) { return h('th', { key: c, 'class': i ? 'num' : '' }, c); }))),
          h('tbody', null, U.sortBy(Array.from(byType.keys()), function (k) { return -byType.get(k).length; }).map(function (k) {
            const list = byType.get(k);
            const n = function (s) { return list.filter(function (l) { return s.indexOf(l.status) >= 0; }).length; };
            return h('tr', { key: k }, h('td', null, k), h('td.num', null, String(list.length)), h('td.num', null, String(n(['confirmed']))), h('td.num', null, String(n(['awaiting_it']))), h('td.num', null, String(n(['assumed', 'unknown', '']))));
          }))))) : null,
      ids.length ? ids.map(function (id) {
        const d = store.get('devices', id);
        const list = byDev.get(id).filter(function (l) { return st.depFilter === 'all' || l.status !== 'confirmed'; });
        if (!list.length) return null;
        const room = store.get('rooms', d.room_id);
        return h('section.card.card-pad', { key: id },
          h('div.card-head', null, h('div.stack', { style: 'gap:2px' }, h('h2.h2', null, h('span.mono', null, d.hostname || R.deviceType(d)), ui.demo(d)), h('div.page-sub', null, [d.manufacturer, d.model].filter(Boolean).join(' ') || R.deviceType(d))),
            ui.iconBtn('external', { title: 'Open device', onclick: function () { EV.editors.device(d.id); } })),
          h('div.kv-list', null,
            ui.kv('Room', room ? R.roomLabel(room) : '—'), ui.kv('Switch', d.connected_switch || '—', { mono: true }), ui.kv('Port', d.switch_port || 'Undocumented', { mono: true }),
            ui.kv('VLAN', d.vlan || '—'), ui.kv('IP', d.ip_address || (d.ip_status === 'not_applicable' ? 'n/a' : 'Missing'), { mono: true })),
          h('div.stack', { style: 'gap:6px' }, ui.label('Dependencies'),
            h('div.list', null, list.map(function (l) {
              const target = l.to_id ? store.get('infra_assets', l.to_id) : null;
              return ui.row({ key: l.id, cls: 'row-compact', title: l.dep_type || 'Dependency', sub: [target ? target.name : '', l.description].filter(Boolean).join(' — '),
                right: ui.chip(S.label(S.DEP_STATUS, l.status), ui.tone.dep[l.status] || 'muted'), onclick: function () { EV.editors.dependency(l.id); } });
            }))),
          h('div.btn-row', null, ui.btn('Add dependency', { sm: true, kind: 'ghost', icon: 'plus', onclick: function () { EV.editors.newDependency(d); } })));
      }) : ui.empty({ icon: 'link', title: 'No dependencies documented', text: 'Record what each device relies on: DHCP reservation, DNS, NTP, firewall rules, multicast, QoS, monitoring and firmware management.' }),
      without.length ? ui.note('info', U.plural(without.length, 'networked device') + ' ' + (without.length === 1 ? 'has' : 'have') + ' no documented dependencies: ' + without.slice(0, 10).map(R.deviceLabel).join('; ') + (without.length > 10 ? '…' : '')) : null
    ];
  }
  function validationTab() {
    const audits = U.sortBy(store.all('audits'), function (a) { return a.started_at; }, true);
    const latest = new Map();
    audits.forEach(function (a) { const k = a.room_id || a.configuration_id; if (!latest.has(k)) latest.set(k, a); });
    const rows = Array.from(latest.values());
    const tally = S.NETWORK_CHECKS.map(function (c) {
      const t = { key: c[0], name: c[1], verified: 0, issue: 0, awaiting_it: 0, na: 0, not_checked: 0 };
      rows.forEach(function (a) { const row = store.by('network_checks', 'audit_id', a.id).find(function (x) { return x.check_key === c[0]; }); t[(row && row.status) || 'not_checked']++; });
      return t;
    });
    return [
      ui.note('info', 'Network validation is completed inside each room audit. This view summarises the latest audit of every space.'),
      rows.length ? h('div.table-wrap', null, h('table.table', null,
        h('thead', null, h('tr', null, ['Network validation check', 'Verified', 'Issue', 'Awaiting IT', 'N/A', 'Not checked'].map(function (c, i) { return h('th', { key: c, 'class': i ? 'num' : '' }, c); }))),
        h('tbody', null, tally.map(function (t) {
          return h('tr', { key: t.key }, h('td', null, t.name), h('td.num', null, String(t.verified)), h('td.num', null, t.issue ? h('span.cell-missing', null, String(t.issue)) : '0'),
            h('td.num', null, t.awaiting_it ? h('span.cell-unv', null, String(t.awaiting_it)) : '0'), h('td.num', null, String(t.na)), h('td.num', null, String(t.not_checked)));
        })))) : null,
      rows.length ? h('section.stack', null, ui.label('By space'),
        h('div.list', null, rows.map(function (a) {
          const p = R.auditProgress(a.id);
          return ui.row({ key: a.id, title: R.auditTitle(a), sub: a.code + ' · ' + U.fmtDate(a.audit_date) + ' · ' + p.network.issue + ' issues · ' + p.network.awaiting + ' awaiting IT', below: ui.progress(p.network.pct, p.network.pct === 100 ? 'ok' : null),
            right: h('span.alert-count', null, p.network.pct + '%'), onclick: function () { ui.open['aud:' + a.id + ':network'] = true; EV.go('/audit/' + a.id); } });
        }))) : ui.empty({ icon: 'shield', title: 'No audits yet', text: 'Start a room audit to complete its network validation checklist.' })
    ];
  }

  EV.pages.infrastructure = function () {
    if (st.applied !== EV.router.nav) { st.applied = EV.router.nav; if (EV.router.query.tab) st.tab = EV.router.query.tab; }
    const awaiting = assets().filter(needsIt).length;
    const unconf = deps().filter(function (l) { return l.status !== 'confirmed'; }).length;
    return [
      ui.head({ title: 'Infrastructure', sub: 'Network documentation, device-to-switch mapping and dependencies',
        actions: ui.btn('CSV', { icon: 'download', title: 'Export infrastructure records as CSV', onclick: function () { return EV.reports.quickCsv('infra_assets', assets()); } }) }),
      ui.tabs([{ k: 'overview', label: 'Overview', count: awaiting || null }, { k: 'switches', label: 'Switches & ports', count: assets('switch').length },
        { k: 'addressing', label: 'Addressing & services', count: assets().filter(function (a) { return a.asset_type !== 'switch'; }).length },
        { k: 'dependencies', label: 'Dependencies', count: unconf || null }, { k: 'validation', label: 'Validation' }], st.tab, function (k) { st.tab = k; }),
      h('div.stack.stack-lg', { key: st.tab }, st.tab === 'switches' ? switchesTab() : st.tab === 'addressing' ? addressingTab() : st.tab === 'dependencies' ? dependenciesTab() : st.tab === 'validation' ? validationTab() : overview())
    ];
  };
})();
