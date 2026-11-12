/* seed.js — synthetic demo environment. Every record is flagged is_demo and uses documentation-reserved
 * identifiers only: IPs from RFC 5737 ranges (192.0.2.0/24, 198.51.100.0/24), MACs from the RFC 7042
 * documentation range (00:00:5E:00:53:xx), "DEMO-" hostnames and serial numbers. Nothing here describes
 * a real client system. */
(function () {
  'use strict';
  const EV = window.EV, U = EV.U, S = EV.S, store = EV.store, R = EV.rules, A = EV.act;

  function ago(days, hour, min) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    d.setHours(hour == null ? 10 : hour, min || 0, 0, 0);
    return d.toISOString();
  }
  function ahead(days) { const d = new Date(); d.setDate(d.getDate() + days); return U.localDate(d); }

  EV.seed = {
    load: async function () {
      if (store.kvGet('demo_loaded')) return false;
      /* Demo records are never synchronised, so nothing real may come to depend on them once a workspace is connected. */
      if (EV.sync && EV.sync.config().mode === 'supabase') throw new Error('The demo environment cannot be loaded while a cloud workspace is connected.');
      const mk = function (t, d) { return store.create(t, Object.assign({}, d, { is_demo: true }), { silent: true }); };
      const log = function (at, action, table, rec, summary) { store.log({ at: at, action: action, table: table, rec: rec, summary: summary, is_demo: true, actor: 'Demo Auditor' }); };

      /* ---- environment ---- */
      const b = mk('buildings', { name: '1 Demonstration Plaza', address: '1 Demonstration Plaza, Example City', identifier: 'DEMO-BLDG-01', floors_count: 3,
        site_contact: 'Demo contact — AV Operations (fictional)', notes: 'DEMO DATA. Synthetic building record for evaluation; floors 21–23 only.', archived: false });
      const f21 = mk('floors', { building_id: b.id, number: '21', designation: 'Client conference level', sort_order: 21, archived: false, audit_status_override: '',
        infrastructure_notes: 'DEMO: AV devices patch to an IDF on the east side. No dedicated AV rack room on this floor.' });
      const f22 = mk('floors', { building_id: b.id, number: '22', designation: 'Executive conference level', sort_order: 22, archived: false, audit_status_override: '',
        infrastructure_notes: 'DEMO: AV rack room "22 IDF" houses the floor AV access switch DEMO-22-SW01.' });
      const f23 = mk('floors', { building_id: b.id, number: '23', designation: 'Multipurpose and training level', sort_order: 23, archived: false, audit_status_override: '',
        infrastructure_notes: 'DEMO: Divisible room 23A shares one DSP core across both halves.' });
      const aEast = mk('areas', { building_id: b.id, floor_id: f21.id, name: 'East wing', description: 'Client-facing conference rooms', archived: false });
      const aExec = mk('areas', { building_id: b.id, floor_id: f22.id, name: 'Executive suite', description: 'Executive and board spaces', archived: false });
      const aCore = mk('areas', { building_id: b.id, floor_id: f22.id, name: 'Core / support', description: 'IDF and AV support spaces', archived: false });
      const aConf = mk('areas', { building_id: b.id, floor_id: f23.id, name: 'Conference center', description: 'Divisible and multipurpose rooms', archived: false });
      function room(floor, area, number, name, type, cap, extra) {
        return mk('rooms', Object.assign({ building_id: b.id, floor_id: floor.id, area_id: area.id, number: number, name: name, room_type: type, capacity: cap, criticality: '',
          conferencing_platform: 'Zoom Rooms', control_platform: 'Q-SYS', dsp_platform: 'Q-SYS', display_config: '', camera_config: '', microphone_config: '',
          scheduling_platform: 'Zoom Rooms Scheduling Display', operational_status: 'Unknown', notes: '', archived: false }, extra || {}));
      }
      const r21A = room(f21, aEast, '21A', 'Small Conference Room', 'Small conference room', 6, { control_platform: 'Native room controller', dsp_platform: 'Integrated (bar / codec)',
        display_config: 'Single 65-inch flat panel', camera_config: 'Integrated video bar camera', microphone_config: 'Integrated video bar microphones', operational_status: 'Fully operational' });
      const r21B = room(f21, aEast, '21B', 'Medium Conference Room', 'Medium conference room', 10, { display_config: 'Single 75-inch flat panel', camera_config: 'Single PTZ camera',
        microphone_config: 'Ceiling microphone array ×1' });
      const r22A = room(f22, aExec, '22A', 'Executive Conference Room', 'Executive conference room', 12, { criticality: 'critical', display_config: 'Dual 85-inch flat panels',
        camera_config: 'Dual PTZ cameras (front and rear)', microphone_config: 'Ceiling microphone arrays ×2', operational_status: 'Operational with issues' });
      const r22B = room(f22, aExec, '22B', 'Medium Conference Room', 'Medium conference room', 10, { display_config: 'Single 85-inch flat panel', camera_config: 'Single PTZ camera',
        microphone_config: 'Ceiling microphone array ×1', operational_status: 'Operational with issues' });
      const r22C = room(f22, aExec, '22C', 'Boardroom', 'Boardroom', 22, { criticality: 'critical', display_config: 'Dual 98-inch flat panels with confidence monitor',
        camera_config: 'Three PTZ cameras', microphone_config: 'Table microphones ×12 with ceiling array backup' });
      const rIDF = room(f22, aCore, '22 IDF', 'AV Rack Room', 'Rack room', null, { conferencing_platform: 'None', control_platform: 'None', dsp_platform: 'None', scheduling_platform: 'None',
        display_config: 'None', camera_config: 'None', microphone_config: 'None', operational_status: 'Fully operational' });
      const r23N = room(f23, aConf, '23A-N', 'Divisible Conference Room (North)', 'Divisible conference room', 16, { display_config: 'Single 98-inch flat panel', camera_config: 'Single PTZ camera',
        microphone_config: 'Ceiling microphone arrays ×2' });
      const r23S = room(f23, aConf, '23A-S', 'Divisible Conference Room (South)', 'Divisible conference room', 16, { display_config: 'Single 98-inch flat panel', camera_config: 'Single PTZ camera',
        microphone_config: 'Ceiling microphone arrays ×2' });
      const cfg = mk('room_configurations', { building_id: b.id, floor_id: f23.id, name: '23A Combined (North + South)', capacity: 32, archived: false, notes: '',
        description: 'Airwall open. The shared Q-SYS core routes both microphone arrays and the control page switches to combined mode.' });
      mk('room_configuration_members', { configuration_id: cfg.id, room_id: r23N.id });
      mk('room_configuration_members', { configuration_id: cfg.id, room_id: r23S.id });
      const rk22B = mk('racks', { building_id: b.id, floor_id: f22.id, room_id: r22B.id, name: 'Credenza rack', location: 'Under the display, left door', height_ru: 12, notes: '', archived: false });
      const rkIDF = mk('racks', { building_id: b.id, floor_id: f22.id, room_id: rIDF.id, name: 'AV rack A', location: 'Left of door', height_ru: 42, notes: '', archived: false });

      /* ---- infrastructure ---- */
      function asset(type, name, extra) {
        return mk('infra_assets', Object.assign({ asset_type: type, name: name, identifier: '', description: '', building_id: b.id, floor_id: null, room_id: null, device_id: null, model: '',
          hostname: '', management_ip: '', ip_address: '', mac_address: '', vlan: '', subnet: '', gateway: '', assignment_type: '', poe_budget_w: null, poe_used_w: null,
          validation_status: 'unknown', source: '', notes: '', archived: false }, extra || {}));
      }
      const sw = asset('switch', 'DEMO-22-SW01', { hostname: 'DEMO-22-SW01', model: 'Cisco Catalyst 9300-48P', management_ip: '198.51.100.10', poe_budget_w: 740, poe_used_w: 412,
        floor_id: f22.id, room_id: rIDF.id, validation_status: 'observed', source: 'Chassis label and port LEDs observed onsite (DEMO)', description: 'Floor 22 AV access switch' });
      const core = asset('switch', 'DEMO-CORE-SW01', { hostname: 'DEMO-CORE-SW01', validation_status: 'awaiting_it', source: 'Named verbally by site contact — not verified (DEMO)',
        description: 'Upstream distribution switch' });
      asset('vlan', 'DEMO-AV-CONTROL', { identifier: '3120', subnet: '192.0.2.0/26', gateway: '192.0.2.1', validation_status: 'from_docs', source: 'Sample network sheet (DEMO)', description: 'AV control and management' });
      asset('vlan', 'DEMO-AV-MEDIA', { identifier: '3121', subnet: '192.0.2.64/26', gateway: '192.0.2.65', validation_status: 'awaiting_it', description: 'Q-LAN / AES67 media' });
      asset('vlan', 'DEMO-VC', { identifier: '3130', subnet: '192.0.2.128/26', gateway: '192.0.2.129', validation_status: 'observed', source: 'Port label (DEMO)', description: 'Video conferencing appliances' });
      asset('ip_range', 'AV static range', { identifier: '192.0.2.10 – 192.0.2.40', vlan: 'DEMO-AV-CONTROL', subnet: '192.0.2.0/26', validation_status: 'awaiting_it', description: 'Range understood to be excluded from DHCP' });
      const dnsSrv = asset('dns_server', 'DEMO-DNS-01', { hostname: 'DEMO-DNS-01', ip_address: '198.51.100.53', validation_status: 'from_docs', source: 'Sample network sheet (DEMO)' });
      const ntpSrv = asset('ntp_server', 'DEMO-NTP-01', { hostname: 'DEMO-NTP-01', ip_address: '198.51.100.123', validation_status: 'awaiting_it' });
      const fw = asset('firewall_rule', 'Zoom Rooms outbound media', { identifier: 'DEMO-FW-REQ-014', validation_status: 'awaiting_it',
        description: 'Outbound TCP 443 and UDP 8801–8810 from the DEMO-VC VLAN to the conferencing service.' });
      asset('multicast', 'Q-LAN / AES67 multicast', { vlan: 'DEMO-AV-MEDIA', validation_status: 'unknown', description: 'IGMP snooping and a querier are required on the media VLAN for Q-LAN audio.' });
      asset('qos', 'Q-LAN QoS marking', { vlan: 'DEMO-AV-MEDIA', identifier: 'DSCP EF / AF41', validation_status: 'awaiting_it', description: 'PTP and audio traffic prioritisation.' });
      const reflect = asset('monitoring', 'Q-SYS Reflect Enterprise Manager', { hostname: 'reflect.demo.example.net', validation_status: 'observed', description: 'Remote monitoring for Q-SYS cores and peripherals' });
      asset('monitoring', 'Zoom Device Management', { hostname: 'zdm.demo.example.net', validation_status: 'observed', description: 'Zoom Rooms appliance management portal' });

      /* ---- devices ---- */
      function dev(rm, category, mfr, model, extra) {
        return mk('devices', Object.assign({ building_id: b.id, floor_id: rm.floor_id, room_id: rm.id, rack_id: null, audit_id: null, category: category, custom_category: '', role: '',
          manufacturer: mfr, model: model, hostname: '', ip_address: '', ip_status: 'unknown', mac_address: '', mac_status: 'unknown', serial_number: '', serial_status: 'unknown',
          subnet: '', vlan: '', ip_assignment: '', dns_name: '', firmware_version: '', app_version: '', switch_asset_id: null, connected_switch: '', switch_port: '',
          connection_type: 'Wired — Ethernet', poe_required: 'No', poe_class: '', power_source: '', rack_location: '', monitoring_portal: '', management_url: '', warranty_info: '',
          support_expiration: null, notes: '', archived: false }, extra || {}));
      }
      const ctl = { subnet: '192.0.2.0/26', vlan: 'DEMO-AV-CONTROL (3120)', switch_asset_id: sw.id, connected_switch: 'DEMO-22-SW01' };
      const vc = { subnet: '192.0.2.128/26', vlan: 'DEMO-VC (3130)' };
      const V = 'verified_onsite', M = 'verified_mgmt';
      const core22B = dev(r22B, 'AV processor', 'QSC', 'Core 110f', Object.assign({}, ctl, { role: 'Room control and audio processing core', hostname: 'DEMO-22B-CORE01',
        ip_address: '192.0.2.21', ip_status: V, mac_address: '00:00:5E:00:53:21', mac_status: V, serial_number: 'DEMO-SN-110F-0421', serial_status: V,
        ip_assignment: 'DHCP reservation', dns_name: 'demo-22b-core01.av.example.net', firmware_version: '9.10.2', switch_port: '1/0/18', power_source: 'AC — rack PDU', rack_id: rk22B.id,
        rack_location: 'RU 4', monitoring_portal: 'Q-SYS Reflect', management_url: 'https://192.0.2.21', warranty_info: 'DEMO — 3-year manufacturer warranty', support_expiration: ahead(400) }));
      const zr22B = dev(r22B, 'Zoom Room appliance', 'Poly', 'Studio X70', Object.assign({}, vc, { role: 'Zoom Rooms compute and video bar', hostname: 'zoomroom-22b',
        ip_address: '192.0.2.140', ip_status: M, mac_address: '00:00:5E:00:53:8C', mac_status: M, serial_number: 'DEMO-SN-X70-2207', serial_status: V, app_version: 'Zoom Rooms 6.2.0 (DEMO)',
        power_source: 'AC — wall outlet', monitoring_portal: 'Zoom Device Management', notes: 'DEMO: firmware and switch port intentionally left undocumented.' }));
      const cam22B = dev(r22B, 'Camera', 'QSC', 'NC-12x80', Object.assign({}, ctl, { role: 'Front-of-room PTZ camera', hostname: 'DEMO-22B-CAM01', ip_address: '192.0.2.22', ip_status: 'awaiting_it',
        serial_number: 'DEMO-SN-NC12-0388', serial_status: V, firmware_version: '9.10.2', switch_port: '1/0/19', poe_required: 'Yes', poe_class: 'PoE+ (802.3at, class 4)', power_source: 'PoE',
        notes: 'DEMO: IP recorded from the touch panel UI; MAC label not accessible behind the mount.' }));
      const tsc22B = dev(r22B, 'Touch panel', 'QSC', 'TSC-101-G3', Object.assign({}, ctl, { role: 'Table touch controller', hostname: 'DEMO-22B-TSC01', ip_status: 'awaiting_it',
        mac_address: '00:00:5E:00:53:23', mac_status: V, firmware_version: '9.10.2', switch_port: '1/0/20', poe_required: 'Yes', poe_class: 'PoE (802.3af, class 0–3)', power_source: 'PoE' }));
      dev(r22B, 'Display', 'Samsung', 'QM85C', { role: 'Main display', ip_status: 'not_applicable', mac_status: 'not_applicable', serial_number: 'DEMO-SN-QM85-5521', serial_status: V,
        connection_type: 'Not networked', power_source: 'AC — wall outlet' });
      dev(r22B, 'Microphone processor', 'Shure', 'IntelliMix P300', Object.assign({}, ctl, { role: 'Ceiling array processing', hostname: 'DEMO-22B-P300', ip_address: '192.0.2.24', ip_status: V,
        mac_address: '00:00:5E:00:53:24', mac_status: V, serial_number: 'DEMO-SN-P300-1190', serial_status: V, firmware_version: '4.7.21', switch_port: '1/0/22', poe_required: 'Yes',
        poe_class: 'PoE+ (802.3at, class 4)', power_source: 'PoE', rack_id: rk22B.id, rack_location: 'RU 6' }));
      const dsp22A = dev(r22A, 'DSP', 'QSC', 'Core Nano', Object.assign({}, ctl, { role: 'Room DSP', hostname: 'DEMO-22A-DSP01', ip_address: '192.0.2.31', ip_status: M, mac_address: '00:00:5E:00:53:31',
        mac_status: M, serial_number: 'DEMO-SN-NANO-0731', serial_status: V, firmware_version: '9.10.2', switch_port: '1/0/21', power_source: 'AC — rack PDU', monitoring_portal: 'Q-SYS Reflect' }));
      dev(r22A, 'Touch panel', 'QSC', 'TSC-101-G3', Object.assign({}, ctl, { role: 'Table touch controller', hostname: 'DEMO-22A-TSC01', ip_address: '192.0.2.33', ip_status: V,
        mac_address: '00:00:5E:00:53:33', mac_status: V, serial_number: 'DEMO-SN-TSC-0912', serial_status: V, firmware_version: '9.9.1', switch_port: '1/0/23', poe_required: 'Yes',
        poe_class: 'PoE (802.3af, class 0–3)', power_source: 'PoE' }));
      dev(r22A, 'Zoom Room appliance', 'Poly', 'Studio X70', Object.assign({}, vc, { role: 'Zoom Rooms compute and video bar', hostname: 'DEMO-22A-ZR01', ip_address: '192.0.2.141', ip_status: M,
        mac_address: '00:00:5E:00:53:8D', mac_status: M, serial_number: 'DEMO-SN-X70-2208', serial_status: V, firmware_version: '4.1.0', app_version: 'Zoom Rooms 6.2.0 (DEMO)',
        switch_asset_id: sw.id, connected_switch: 'DEMO-22-SW01', switch_port: '1/0/24', power_source: 'AC — wall outlet', monitoring_portal: 'Zoom Device Management' }));
      dev(r22A, 'Camera', 'Sony', 'SRG-X400', Object.assign({}, ctl, { role: 'Rear PTZ camera', hostname: 'DEMO-22A-CAM01', ip_address: '192.0.2.34', ip_status: V, mac_address: '00:00:5E:00:53:34',
        mac_status: V, serial_number: 'DEMO-SN-SRG-4410', serial_status: V, firmware_version: '3.00', switch_port: '1/0/25', poe_required: 'Yes', poe_class: 'PoE++ (802.3bt, class 5–6)', power_source: 'PoE' }));
      dev(r21A, 'Zoom Room appliance', 'Neat', 'Neat Bar Pro', Object.assign({}, vc, { role: 'All-in-one video bar', hostname: 'DEMO-21A-NEAT01', ip_address: '192.0.2.150', ip_status: M,
        mac_address: '00:00:5E:00:53:96', mac_status: M, serial_number: 'DEMO-SN-NEAT-0150', serial_status: V, firmware_version: 'NFA1.20240612.0015', app_version: 'Zoom Rooms 6.2.0 (DEMO)',
        connected_switch: 'DEMO-21-SW02 (per port label)', switch_port: 'Gi1/0/7', power_source: 'AC — wall outlet', monitoring_portal: 'Zoom Device Management' }));
      dev(r21A, 'Room scheduling panel', 'Neat', 'Neat Pad', Object.assign({}, vc, { role: 'Door scheduling panel', hostname: 'DEMO-21A-PAD01', ip_address: '192.0.2.151', ip_status: M,
        mac_address: '00:00:5E:00:53:97', mac_status: M, serial_number: 'DEMO-SN-PAD-0151', serial_status: V, firmware_version: 'NFA1.20240612.0015', connected_switch: 'DEMO-21-SW02 (per port label)',
        switch_port: 'Gi1/0/8', poe_required: 'Yes', poe_class: 'PoE+ (802.3at, class 4)', power_source: 'PoE' }));
      dev(r21A, 'Display', 'Samsung', 'QM65C', { role: 'Main display', ip_status: 'not_applicable', mac_status: 'not_applicable', serial_number: 'DEMO-SN-QM65-3340', serial_status: V,
        connection_type: 'Not networked', power_source: 'AC — wall outlet' });
      const swDev = dev(rIDF, 'Network switch', 'Cisco', 'Catalyst 9300-48P', { role: 'Floor 22 AV access switch', hostname: 'DEMO-22-SW01', ip_address: '198.51.100.10', ip_status: 'awaiting_it',
        mac_address: '00:00:5E:00:53:0A', mac_status: V, serial_number: 'DEMO-SN-C9300-7781', serial_status: V, firmware_version: 'IOS-XE 17.9.4a (as displayed — awaiting IT confirmation)',
        rack_id: rkIDF.id, rack_location: 'RU 40', power_source: 'AC — UPS backed', connected_switch: 'DEMO-CORE-SW01 (uplink, unverified)', switch_port: 'Uplink' });
      store.update('infra_assets', sw.id, { device_id: swDev.id }, { silent: true });
      dev(r22C, 'AV processor', 'QSC', 'Core 510i', { role: 'Boardroom control and audio core', hostname: 'DEMO-22C-CORE01', notes: 'DEMO: listed from as-built drawings; not yet seen onsite.' });
      dev(r22C, 'Video conferencing codec', 'Poly', 'G7500', { role: 'Boardroom codec', hostname: 'DEMO-22C-CODEC01', ip_status: 'awaiting_it', mac_status: 'awaiting_it', serial_status: 'awaiting_vendor',
        notes: 'DEMO: identification requested from the vendor asset list.' });
      dev(r22C, 'Touch panel', 'QSC', 'TSC-101-G3', { role: 'Table touch controller', hostname: 'DEMO-22C-TSC01' });

      /* switch port register, uplink and dependencies */
      function port(p, desc, d, extra) {
        return mk('switch_ports', Object.assign({ switch_asset_id: sw.id, port: p, description: desc, mode: 'access', vlan: '3120', tagged_vlans: '', untagged_vlan: '', poe_status: 'disabled',
          poe_class: '', link_speed: '1 Gbps', device_id: d ? d.id : null, validation_status: 'observed', notes: '' }, extra || {}));
      }
      port('1/0/18', 'AV-22B-CORE', core22B);
      port('1/0/19', 'AV-22B-CAM', cam22B, { poe_status: 'delivering', poe_class: 'PoE+ (802.3at, class 4)' });
      port('1/0/20', 'AV-22B-TSC', tsc22B, { poe_status: 'delivering', poe_class: 'PoE (802.3af, class 0–3)' });
      port('1/0/21', 'AV-22A-DSP', dsp22A);
      port('1/0/22', '', store.all('devices').find(function (d) { return d.hostname === 'DEMO-22B-P300'; }), { poe_status: 'delivering', validation_status: 'awaiting_it', notes: 'Port description blank on the label sheet.' });
      port('1/0/23', 'AV-22A-TSC', store.all('devices').find(function (d) { return d.hostname === 'DEMO-22A-TSC01'; }), { poe_status: 'delivering' });
      port('1/0/24', 'VC-22A-ZR', store.all('devices').find(function (d) { return d.hostname === 'DEMO-22A-ZR01'; }), { vlan: '3130' });
      port('1/0/25', 'AV-22A-CAM', store.all('devices').find(function (d) { return d.hostname === 'DEMO-22A-CAM01'; }), { poe_status: 'delivering', poe_class: 'PoE++ (802.3bt, class 5–6)' });
      port('1/0/48', 'UPLINK-CORE', null, { mode: 'trunk', vlan: '', tagged_vlans: '3120, 3121, 3130', link_speed: '10 Gbps', validation_status: 'awaiting_it' });
      function link(d) { return mk('network_links', Object.assign({ kind: 'dependency', from_type: 'device', from_id: '', to_type: '', to_id: '', from_port: '', to_port: '', dep_type: '', description: '', status: 'unknown', notes: '' }, d)); }
      link({ kind: 'uplink', from_type: 'infra_asset', from_id: sw.id, to_type: 'infra_asset', to_id: core.id, from_port: '1/0/48', to_port: '', status: 'awaiting_it', description: '10 Gbps fiber uplink (as labelled)' });
      const res = asset('dhcp_reservation', 'DEMO-22B-CORE01 reservation', { ip_address: '192.0.2.21', mac_address: '00:00:5E:00:53:21', vlan: 'DEMO-AV-CONTROL', device_id: core22B.id,
        room_id: r22B.id, floor_id: f22.id, validation_status: 'awaiting_it', description: 'Reservation requested for the room core' });
      asset('dns_record', 'demo-22b-core01.av.example.net', { identifier: 'demo-22b-core01.av.example.net', ip_address: '192.0.2.21', device_id: core22B.id, room_id: r22B.id, floor_id: f22.id, validation_status: 'awaiting_it' });
      link({ from_id: core22B.id, to_type: 'infra_asset', to_id: res.id, dep_type: 'DHCP reservation', status: 'awaiting_it', description: 'Core must keep 192.0.2.21' });
      link({ from_id: core22B.id, to_type: 'infra_asset', to_id: dnsSrv.id, dep_type: 'DNS resolution', status: 'awaiting_it', description: 'Peripherals discover the core by name' });
      link({ from_id: core22B.id, to_type: 'infra_asset', to_id: ntpSrv.id, dep_type: 'NTP', status: 'awaiting_it', description: 'Time source for logs and scheduling' });
      link({ from_id: core22B.id, to_type: 'infra_asset', to_id: reflect.id, dep_type: 'Monitoring platform', status: 'confirmed', description: 'Core visible in Q-SYS Reflect during the audit' });
      link({ from_id: core22B.id, dep_type: 'Firmware management', status: 'assumed', description: 'Firmware assumed to be managed through Reflect — not confirmed' });
      link({ from_id: zr22B.id, to_type: 'infra_asset', to_id: fw.id, dep_type: 'Firewall rule', status: 'awaiting_it', description: 'Outbound media ports for Zoom Rooms' });
      link({ from_id: zr22B.id, dep_type: 'Licensing / cloud service', status: 'confirmed', description: 'Zoom Rooms licence active in the portal' });

      /* ---- audits ---- */
      function results(audit, map, dflt) {
        store.by('functional_tests', 'audit_id', audit.id).forEach(function (t) {
          const key = t.test_key;
          const v = key in map ? map[key] : dflt;
          if (!v) return;
          const res2 = Array.isArray(v) ? v : [v, ''];
          const patch = { result: res2[0], comment: res2[1] || '', tested_at: audit.started_at };
          if ((res2[0] === 'fail' || res2[0] === 'investigate')) patch.suggestion_state = 'pending';
          store.update('functional_tests', t.id, patch, { silent: true });
        });
      }
      function checks(audit, map, dflt) {
        store.by('network_checks', 'audit_id', audit.id).forEach(function (c) {
          const v = c.check_key in map ? map[c.check_key] : dflt;
          if (!v) return;
          const a2 = Array.isArray(v) ? v : [v, ''];
          store.update('network_checks', c.id, { status: a2[0], comment: a2[1] || '', checked_at: audit.started_at }, { silent: true });
        });
      }
      function testOf(audit, key) { return store.by('functional_tests', 'audit_id', audit.id).find(function (t) { return t.test_key === key; }); }
      const NA = 'na';
      /* 21A — complete and fully verified */
      const a21A = A.startAudit({ room: r21A }, { at: ago(2, 9, 30), silent: true, demo: true, data: { auditor: 'Demo Auditor', operational_status: 'Fully operational' } });
      results(a21A, { 'control.room_combination': NA, 'video.wireless_presentation': NA, 'infrastructure.ups_condition': NA, 'infrastructure.rack_condition': NA, 'audio.dsp_functionality': NA }, 'pass');
      checks(a21A, {}, 'verified');
      /* 22B — complete, with failures and open follow-ups */
      const a22B = A.startAudit({ room: r22B }, { at: ago(1, 14, 5), silent: true, demo: true, data: { auditor: 'Demo Auditor', operational_status: 'Operational with issues' } });
      results(a22B, {
        'audio.aec_performance': ['fail', 'Far-end participant heard their own voice returned for the whole of a 10-minute test call at normal programme volume.'],
        'control.ui_consistency': ['investigate', 'Home page layout differs from 22A: volume control position and the label on the share button.'],
        'infrastructure.equipment_labeling': ['fail', 'No labels on the rear of rack devices; two unlabelled HDMI runs at the table.'],
        'infrastructure.switch_port_identification': ['investigate', 'Zoom Rooms appliance patch not traceable to a switch port from the room.'],
        'control.room_combination': NA, 'infrastructure.ups_condition': NA,
        'user_experience.room_instructions': null, 'user_experience.signage_accuracy': null, 'user_experience.support_contact': null, 'user_experience.user_confusion': null
      }, 'pass');
      checks(a22B, { addressing: ['issue', 'Touch panel IP not confirmed; camera IP awaiting IT.'], mac: ['issue', 'Camera MAC not readable behind the mount.'], vlan: 'verified',
        switch_port: ['awaiting_it', 'Zoom appliance port unknown.'], port_description: 'awaiting_it', dhcp_static: 'awaiting_it', dns: 'awaiting_it', ntp: 'awaiting_it',
        firmware: ['issue', 'Zoom appliance firmware undocumented.'], monitoring: 'verified', security_review: null }, null);
      /* 22A — in progress */
      const a22A = A.startAudit({ room: r22A }, { at: ago(0, 8, 40), silent: true, demo: true, data: { auditor: 'Demo Auditor', operational_status: 'Operational with issues' } });
      const partial = {};
      S.TESTS.AUDIO.forEach(function (t) { partial[S.testKey('AUDIO', t[0])] = 'pass'; });
      S.TESTS.VIDEO.slice(0, 7).forEach(function (t) { partial[S.testKey('VIDEO', t[0])] = 'pass'; });
      partial['video.camera_presets'] = ['investigate', 'Rear camera preset 2 frames the door rather than the table.'];
      partial['control.touch_panel_responsiveness'] = 'pass';
      partial['control.ui_consistency'] = ['investigate', 'Layout differs from 22B; users describe the two rooms as "working differently".'];
      results(a22A, partial, null);
      checks(a22A, { addressing: 'verified', mac: 'verified', vlan: 'verified' }, null);

      /* ---- photographs (synthetic images) ---- */
      const shots = [
        [a22B, r22B, 'Room overview', '22B — room overview', 212, null], [a22B, r22B, 'Rack overview', '22B — credenza rack', 200, null],
        [a22B, r22B, 'Equipment labels', '22B — core serial label', 190, core22B.id], [a22B, r22B, 'Touch panel', '22B — touch panel home page', 225, tsc22B.id],
        [a22B, r22B, 'Cable terminations', '22B — unlabelled HDMI at table', 28, null], [a22A, r22A, 'Room overview', '22A — room overview', 236, null],
        [a22A, r22A, 'Camera(s)', '22A — rear camera preset 2', 262, null], [a21A, r21A, 'Room overview', '21A — room overview', 168, null]
      ];
      const photoRecs = [];
      for (const s of shots) {
        try {
          const blob = await EV.photos.demoBlob(s[3], 'Synthetic placeholder for the ' + s[2].toLowerCase() + ' category', s[4]);
          const rec = await EV.photos.add(new File([blob], 'DEMO_' + U.fileSafe(s[3]) + '.jpg', { type: 'image/jpeg' }), { audit: s[0], room: s[1], category: s[2], description: 'DEMO — ' + s[3],
            device_id: s[5], demo: true, silent: true, taken_at: s[0].started_at });
          photoRecs.push(rec);
        } catch (e) { console.warn('[seed] demo photograph skipped', e); }
      }

      /* ---- findings and backlog ---- */
      const tAec = testOf(a22B, 'audio.aec_performance'), tUi22B = testOf(a22B, 'control.ui_consistency'), tLabel = testOf(a22B, 'infrastructure.equipment_labeling');
      const tUi22A = testOf(a22A, 'control.ui_consistency'), tPreset = testOf(a22A, 'video.camera_presets');
      function finding(test, audit, rm, d) {
        const f = A.createFinding(Object.assign({ building_id: b.id, floor_id: rm.floor_id, room_id: rm.id, audit_id: audit.id, test_id: test ? test.id : null,
          source: test ? 'test_failure' : 'manual', source_key: test ? 'test:' + test.id : '', is_demo: true }, d), { silent: true });
        if (test) store.update('functional_tests', test.id, { finding_id: f.id, suggestion_state: 'accepted' }, { silent: true });
        return f;
      }
      const fn1 = finding(tAec, a22B, r22B, { category: 'Audio', title: 'AEC performance failed — 22B', observation: tAec.comment,
        hypothesis: 'The AEC reference may not include the programme audio return. The DSP design has not been reviewed.', priority_hint: 'P1' });
      const fn2 = finding(tUi22B, a22B, r22B, { category: 'Control & UX', title: 'UI consistency needs investigation — 22B', observation: tUi22B.comment });
      const fn3 = finding(tUi22A, a22A, r22A, { category: 'Control & UX', title: 'UI consistency needs investigation — 22A', observation: tUi22A.comment });
      const fn4 = finding(tLabel, a22B, r22B, { category: 'Documentation', title: 'Equipment labeling failed — 22B', observation: tLabel.comment });
      finding(tPreset, a22A, r22A, { category: 'Video', title: 'Camera presets need investigation — 22A', observation: tPreset.comment,
        interpretation: 'Preset appears to have been overwritten rather than drifted; other presets are accurate.' });
      const lbl = photoRecs.find(function (p) { return p.category === 'Cable terminations'; });
      if (lbl) store.update('photos', lbl.id, { finding_id: fn4.id, test_id: tLabel.id }, { silent: true });
      function backlog(d) { return A.createBacklog(Object.assign({ building_id: b.id, is_demo: true, requested_by: 'Demo Auditor' }, d), { silent: true }); }
      const bl1 = backlog({ floor_id: f22.id, room_id: r22B.id, device_id: core22B.id, category: 'Audio', title: 'Far-end echo during calls in 22B', priority: 'P1', status: 'Under Investigation',
        problem_statement: 'Far-end participants hear their own voice returned during Zoom calls from 22B.',
        observed_evidence: 'Reproduced on a 10-minute test call at normal programme volume. Echo was audible to the far end throughout and was not audible in the room.',
        suspected_cause: 'AEC reference routing in the Q-SYS design may not include the programme audio return. Not verified.', root_cause_confidence: 'hypothesis',
        recommendation: 'PepperDash to review AEC reference routing and gain structure in the room design, then re-test with a far-end participant.', strategy: 'Reprogram / reconfigure',
        expected_outcome: 'Far-end participants no longer hear echo; fewer interrupted meetings.', operational_risk: 'Hybrid meetings are disrupted; users abandon the room system for laptops.',
        meeting_impact: 'Meeting degraded', frequency: 'Frequent (weekly or more)', user_impact: 'Far-end participants on every call (DEMO).', business_impact: 'High', user_friction: 'High',
        risk_level: 'Medium', effort: 'S (half day)', dependencies: 'PepperDash programming; test call scheduled with Client AV Operations', owner: 'PepperDash',
        priority_rationale: 'High business impact and frequent disruption in a heavily used room.', target_date: ahead(10) });
      const bl2 = backlog({ floor_id: f22.id, room_id: r22B.id, category: 'Control & UX', title: 'Touch panel UI differs between 22A and 22B', priority: 'P2', status: 'Pending PepperDash Review', systemic: true,
        problem_statement: 'The touch panel home page is laid out differently in 22A and 22B.', observed_evidence: 'Volume control position and share-button label differ between the two rooms (photographs attached).',
        recommendation: 'Agree a single UI standard and apply it to both rooms.', strategy: 'Standardize', expected_outcome: 'Users operate every room the same way; fewer support calls.',
        meeting_impact: 'Workaround required', frequency: 'Intermittent', business_impact: 'Medium', user_friction: 'Medium', risk_level: 'Low', effort: 'M (1–2 days)', owner: 'PepperDash',
        priority_rationale: 'Creates avoidable friction and support load; no meeting failure observed.' });
      const bl3 = backlog({ floor_id: f22.id, room_id: r22B.id, category: 'Documentation', title: 'Rack and cable labelling missing in 22B', priority: 'P2', status: 'New Discovery',
        problem_statement: 'Rack devices and table cable runs in 22B are not labelled.', observed_evidence: 'No labels on the rear of rack devices; two unlabelled HDMI runs at the table.',
        recommendation: 'Label devices and cables to the agreed naming standard and update the rack elevation.', strategy: 'Document', effort: 'S (half day)', business_impact: 'Low',
        user_friction: 'Low', risk_level: 'Medium', frequency: 'Constant', meeting_impact: 'Cosmetic / no impact', expected_outcome: 'Faster fault isolation during support calls.' });
      const bl4 = backlog({ floor_id: f21.id, room_id: r21A.id, category: 'Infrastructure', title: 'Cable management cleanup under table — 21A', priority: 'P3', status: 'Approved',
        problem_statement: 'Excess cable is loose under the table.', observed_evidence: 'Loose HDMI and power cables visible at seated height.', recommendation: 'Dress and tie cables; fit a cable tray.',
        strategy: 'Repair', effort: 'XS (under 1 hour)', business_impact: 'Low', user_friction: 'Low', risk_level: 'Low', frequency: 'Constant', meeting_impact: 'Cosmetic / no impact', owner: 'Client AV Operations' });
      const bl5 = backlog({ floor_id: f22.id, category: 'Spare Parts', title: 'No in-stock spare Zoom Rooms appliance for executive rooms', priority: 'P1', status: 'Pending Client Approval',
        problem_statement: 'There is no in-stock spare for the Poly Studio X70 used in 22A and 22B.', observed_evidence: 'Spare inventory count for Poly Studio X70 is zero.',
        recommendation: 'Purchase one spare unit and store it on floor 22.', strategy: 'Replace', effort: 'S (half day)', estimated_cost: 4200, business_impact: 'High', risk_level: 'High',
        frequency: 'Rare', meeting_impact: 'Meeting cannot proceed', exec_visibility: true, expected_outcome: 'A failed appliance can be swapped the same day.', owner: 'Client AV Operations',
        priority_rationale: 'A single failure removes an executive room from service with no replacement path.' });
      const bl6 = backlog({ floor_id: f22.id, category: 'Network & Security', title: 'Document switch port assignments for floor 22 AV devices', priority: 'P2', status: 'Pending Client IT',
        problem_statement: 'Switch port assignments for several floor 22 AV devices are not documented.', observed_evidence: 'Zoom Rooms appliance in 22B has no recorded switch port; one port has a blank description.',
        recommendation: 'Obtain the port map from Client IT and record it against each device.', strategy: 'Document', effort: 'S (half day)', business_impact: 'Medium', risk_level: 'Medium',
        frequency: 'Constant', dependencies: 'Client IT network team', owner: 'Client IT' });
      backlog({ floor_id: f21.id, room_id: r21A.id, category: 'Documentation', title: 'Update the room instruction card in 21A', priority: 'P3', status: 'Completed', completed_at: ago(1, 16),
        problem_statement: 'The printed instruction card referred to a retired dial-in workflow.', observed_evidence: 'Card text did not match the current Zoom Rooms controller.',
        recommendation: 'Replace the card with the current one-page guide.', strategy: 'Document', effort: 'XS (under 1 hour)', owner: 'Client AV Operations' });
      [[fn1, bl1], [fn2, bl2], [fn3, bl2], [fn4, bl3]].forEach(function (p) { store.update('findings', p[0].id, { backlog_item_id: p[1].id, status: 'linked' }, { silent: true }); });

      /* ---- coordination requests ---- */
      function request(d) { return A.createRequest(Object.assign({ building_id: b.id, is_demo: true }, d), { silent: true }); }
      request({ topic: 'DHCP reservations for AV devices — floor 22', requested_from: 'Client IT', request_type: 'IP reservations', floor_id: f22.id, status: 'Submitted', priority: 'P2',
        description: 'Please confirm DHCP reservations for the floor 22 AV control devices, starting with DEMO-22B-CORE01 and DEMO-22B-TSC01.', reason: 'Device addressing must be stable and documented.',
        needed_for: 'Network validation for 22A and 22B', date_requested: U.localDate(ago(3)), target_date: ahead(4) });
      const it2 = request({ topic: 'Switch port mapping — DEMO-22-SW01', requested_from: 'Client IT', request_type: 'Switch port information', floor_id: f22.id, room_id: rIDF.id, status: 'Acknowledged',
        priority: 'P2', description: 'Please provide the port, description and VLAN for each AV device patched to DEMO-22-SW01.', reason: 'Port documentation is incomplete.',
        needed_for: 'Device-to-switch mapping', date_requested: U.localDate(ago(2)), target_date: ahead(5) });
      request({ topic: 'Q-SYS firmware baseline recommendation', requested_from: 'PepperDash', request_type: 'Firmware recommendations', status: 'In Progress', priority: 'P2',
        description: 'Recommend a firmware baseline for Q-SYS cores and peripherals on floors 21–23.', reason: 'Firmware versions differ between rooms.', needed_for: 'Firmware standardisation',
        date_requested: U.localDate(ago(2)), target_date: ahead(7) });
      request({ topic: 'Warranty status — Poly Studio X70 units', requested_from: 'Vendor', vendor_name: 'Poly (DEMO)', request_type: 'Warranty', status: 'Awaiting Response', priority: 'P3',
        description: 'Confirm warranty end dates for serials DEMO-SN-X70-2207 and DEMO-SN-X70-2208.', needed_for: 'Lifecycle planning', date_requested: U.localDate(ago(1)), target_date: ahead(10) });
      request({ topic: 'Firewall requirements for Zoom Rooms media', requested_from: 'Client IT', request_type: 'Firewall requirements', status: 'Answered', priority: 'P2',
        description: 'Confirm that the outbound media ports required by Zoom Rooms are permitted from the DEMO-VC VLAN.', needed_for: 'Zoom Rooms dependency validation',
        date_requested: U.localDate(ago(4)), response: 'DEMO response: rule DEMO-FW-REQ-014 is in place for the VC VLAN; no change required.', response_date: U.localDate(ago(1)) });
      const it6 = request({ topic: 'DSP tuning review — 22B AEC', requested_from: 'PepperDash', request_type: 'DSP tuning', floor_id: f22.id, room_id: r22B.id, device_id: core22B.id, status: 'Draft',
        priority: 'P1', description: 'Review AEC reference routing and gain structure in the 22B design.', reason: 'Far-end echo reproduced during the audit.', needed_for: bl1.code });
      A.linkRequest(bl6.id, it2.id);
      A.linkRequest(bl1.id, it6.id);

      /* ---- spare equipment ---- */
      function spare(d) { return mk('spare_items', Object.assign({ name: '', manufacturer: '', model: '', part_number: '', serial_number: '', quantity: 0, min_stock: 0, storage_location: '',
        building_id: b.id, floor_id: f22.id, compatibility: '', condition: 'New', warranty: '', lifecycle: 'active', eol_date: null, notes: '', archived: false }, d)); }
      spare({ name: 'Touch panel, 10-inch', manufacturer: 'QSC', model: 'TSC-101-G3', part_number: 'TSC-101-G3', quantity: 1, min_stock: 2, storage_location: 'Floor 22 AV closet, shelf B', compatibility: '22A, 22B and 22C touch panels' });
      spare({ name: 'Ceiling microphone array', manufacturer: 'Shure', model: 'MXA920', part_number: 'MXA920W-S', quantity: 0, min_stock: 1, storage_location: 'Floor 22 AV closet, shelf C', compatibility: 'Rooms with Shure ceiling arrays' });
      spare({ name: 'PTZ camera (unlabelled)', quantity: 1, min_stock: 0, storage_location: 'Floor 22 AV closet, floor', condition: 'Untested', lifecycle: 'unknown', notes: 'DEMO: found without box or model label.' });
      spare({ name: 'HDMI transmitter', manufacturer: 'Crestron', model: 'HD-TX-101-C-E', part_number: '6511512', quantity: 3, min_stock: 1, storage_location: 'Floor 21 IDF cabinet', floor_id: f21.id, lifecycle: 'approaching_eol', condition: 'Good' });
      spare({ name: '85-inch display', manufacturer: 'Samsung', model: 'QM85C', part_number: 'LH85QMCEBGCXZA', quantity: 2, min_stock: 1, storage_location: 'Basement storage B2-14', compatibility: '22B main display' });
      spare({ name: 'Zoom Rooms video bar', manufacturer: 'Poly', model: 'Studio X70', part_number: '2200-87300-001', quantity: 0, min_stock: 1, storage_location: 'Floor 22 AV closet', compatibility: '22A and 22B' });
      spare({ name: 'I/O expander', manufacturer: 'QSC', model: 'QIO-ML4i', part_number: 'QIO-ML4i', quantity: 1, min_stock: 1, storage_location: 'Floor 22 AV closet, shelf A', condition: 'Good' });

      /* ---- recent activity (dated to match the audits above) ---- */
      log(ago(2, 9, 30), 'created', 'audits', a21A, 'Audit started: 21A Small Conference Room');
      A.completeAudit(store.get('audits', a21A.id), { silent: true });
      store.update('audits', a21A.id, { status: 'verified', completed_at: ago(2, 10, 20), verified_at: ago(2, 10, 25) }, { silent: true });
      log(ago(2, 10, 25), 'status_changed', 'audits', store.get('audits', a21A.id), a21A.code + ' status: complete → verified');
      log(ago(1, 14, 5), 'created', 'audits', a22B, 'Audit started: 22B Medium Conference Room');
      log(ago(1, 14, 20), 'created', 'devices', core22B, 'Device created: ' + core22B.code + ' · DEMO-22B-CORE01');
      if (photoRecs[1]) log(ago(1, 14, 32), 'photo_added', 'photos', photoRecs[1], 'Photograph added — Rack overview · 22B');
      log(ago(1, 15, 2), 'created', 'findings', fn1, 'Finding created: ' + fn1.code + ' · ' + fn1.title);
      log(ago(1, 15, 10), 'created', 'backlog_items', bl1, 'Backlog item created: ' + bl1.code + ' · ' + bl1.title);
      A.completeAudit(store.get('audits', a22B.id), { silent: true });
      store.update('audits', a22B.id, { completed_at: ago(1, 15, 40) }, { silent: true });
      log(ago(1, 15, 40), 'status_changed', 'audits', store.get('audits', a22B.id), a22B.code + ' status: in_progress → complete');
      log(ago(1, 16, 5), 'status_changed', 'backlog_items', bl1, bl1.code + ' status: New Discovery → Under Investigation');
      log(ago(0, 8, 40), 'created', 'audits', a22A, 'Audit started: 22A Executive Conference Room');
      log(ago(0, 9, 5), 'testing_updated', 'audits', a22A, 'Functional testing updated — 22A Executive Conference Room (20/52 complete)');

      R.reconcileFollowups();
      store.kvSet('demo_loaded', true);
      await store.flush();
      return true;
    }
  };
})();
