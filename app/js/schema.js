/* schema.js — single source of truth for the data model: vocabularies, table definitions (used by the
 * local database, CSV/Excel exports, export validation and the generated PostgreSQL schema) and form fields. */
(function () {
  'use strict';
  const EV = window.EV;
  const S = (EV.S = {});

  /* ------------------------------------------------------------------ vocabularies */
  S.ROOM_TYPES = ['Small conference room', 'Medium conference room', 'Large conference room', 'Executive conference room', 'Boardroom',
    'Divisible conference room', 'Multipurpose room', 'Town hall', 'Training room', 'Huddle room', 'Focus room', 'Rack room', 'Support area', 'Other'];
  S.NON_CONFERENCE_TYPES = ['Rack room', 'Support area'];
  S.CRITICAL_TYPES = ['Executive conference room', 'Boardroom', 'Town hall'];
  S.CRITICALITY = [['standard', 'Standard'], ['high', 'High visibility'], ['critical', 'Executive / critical']];
  S.OP_STATUS = ['Fully operational', 'Operational with issues', 'Degraded', 'Out of service', 'Unknown'];
  S.CONF_PLATFORMS = ['Zoom Rooms', 'Microsoft Teams Rooms', 'Cisco Webex', 'Google Meet', 'BYOD / USB', 'Dual platform', 'None', 'Other'];
  S.CONTROL_PLATFORMS = ['Crestron', 'Q-SYS', 'Extron', 'AMX', 'Native room controller', 'None', 'Other'];
  S.DSP_PLATFORMS = ['Q-SYS', 'Biamp Tesira', 'Shure IntelliMix', 'ClearOne', 'Crestron', 'Integrated (bar / codec)', 'None', 'Other'];
  S.SCHED_PLATFORMS = ['Zoom Rooms Scheduling Display', 'Microsoft Teams Panel', 'Crestron scheduling panel', 'Outlook / Exchange only', 'Robin', 'Evoko', 'None', 'Other'];

  S.DEVICE_CATEGORIES = ['AV processor', 'DSP', 'Video conferencing codec', 'Zoom Room appliance', 'Microsoft Teams Room appliance', 'Camera',
    'Microphone processor', 'Microphone endpoint', 'Loudspeaker amplifier', 'Network switch', 'Touch panel', 'Display', 'Video wall controller',
    'Video extender', 'HDMI transmitter', 'HDMI receiver', 'USB extender', 'Room scheduling panel', 'Wireless presentation system',
    'Digital signage player', 'Control processor', 'Power distribution unit', 'UPS', 'Other'];
  /* Categories whose loss takes a room out of service — used for spare-coverage risk. */
  S.ROOM_CRITICAL_CATEGORIES = ['AV processor', 'DSP', 'Video conferencing codec', 'Zoom Room appliance', 'Microsoft Teams Room appliance',
    'Control processor', 'Touch panel', 'Camera', 'Microphone processor'];
  S.MANUFACTURERS = ['QSC', 'Crestron', 'Extron', 'Biamp', 'Shure', 'Sennheiser', 'Poly', 'Logitech', 'Cisco', 'Zoom', 'Microsoft', 'Neat', 'Yealink',
    'Samsung', 'LG', 'Sony', 'Planar', 'Barco', 'Mersive', 'Lenovo', 'Dell', 'HP', 'AMX', 'Netgear', 'Aruba', 'APC', 'Middle Atlantic', 'Vaddio',
    'AVer', 'Panasonic', 'Epson', 'Atlona', 'Kramer', 'Lightware', 'BrightSign', 'Audinate', 'Yamaha', 'Bose', 'JBL'];
  S.ID_STATUS = [['verified_onsite', 'Verified onsite'], ['verified_mgmt', 'Verified from management system'], ['awaiting_it', 'Awaiting IT confirmation'],
    ['awaiting_vendor', 'Awaiting vendor confirmation'], ['unknown', 'Unknown'], ['not_applicable', 'Not applicable']];
  S.CONNECTION_TYPES = ['Wired — Ethernet', 'Wired — fiber', 'Wi-Fi', 'USB only', 'Serial / RS-232', 'HDBaseT', 'Not networked', 'Unknown'];
  S.YES_NO_UNKNOWN = ['Yes', 'No', 'Unknown'];
  S.POE_CLASSES = ['PoE (802.3af, class 0–3)', 'PoE+ (802.3at, class 4)', 'PoE++ (802.3bt, class 5–6)', 'PoE++ (802.3bt, class 7–8)', 'Not PoE', 'Unknown'];
  S.POWER_SOURCES = ['PoE', 'AC — wall outlet', 'AC — rack PDU', 'AC — UPS backed', 'External power supply', 'USB bus power', 'Unknown'];
  S.IP_ASSIGNMENT = ['DHCP reservation', 'Static', 'DHCP (dynamic)', 'Unknown', 'Not applicable'];

  S.TEST_RESULTS = [['pass', 'Pass'], ['fail', 'Fail'], ['investigate', 'Needs investigation'], ['na', 'Not applicable'], ['not_tested', 'Not tested']];
  /* [key, name, finding category] */
  S.TESTS = {
    'AUDIO': [
      ['local_microphone_pickup', 'Local microphone pickup', 'Audio'], ['far_end_intelligibility', 'Far-end intelligibility', 'Audio'],
      ['near_end_intelligibility', 'Near-end intelligibility', 'Audio'], ['aec_performance', 'AEC performance', 'Audio'],
      ['echo_cancellation', 'Echo cancellation', 'Audio'], ['loudspeaker_coverage', 'Loudspeaker coverage', 'Audio'],
      ['volume_consistency', 'Volume consistency', 'Audio'], ['background_noise', 'Background noise', 'Audio'],
      ['hum_interference', 'Hum or interference', 'Audio'], ['audio_routing', 'Audio routing', 'Audio'], ['dsp_functionality', 'DSP functionality', 'Audio']
    ],
    'VIDEO': [
      ['display_power', 'Display power and operation', 'Video'], ['display_sync', 'Display synchronization', 'Video'], ['resolution', 'Resolution', 'Video'],
      ['content_switching', 'Content switching', 'Video'], ['camera_operation', 'Camera operation', 'Video'], ['camera_presets', 'Camera presets', 'Video'],
      ['camera_framing', 'Camera framing', 'Video'], ['presenter_visibility', 'Presenter visibility', 'Video'],
      ['far_end_camera', 'Far-end camera experience', 'Video'], ['content_sharing', 'Content sharing', 'Video'],
      ['wireless_presentation', 'Wireless presentation', 'Video'], ['signal_stability', 'Video signal stability', 'Video']
    ],
    'CONTROL': [
      ['touch_panel_responsiveness', 'Touch panel responsiveness', 'Control & UX'], ['ui_consistency', 'UI consistency', 'Control & UX'],
      ['room_join', 'Room join functionality', 'Control & UX'], ['input_switching', 'Input switching', 'Control & UX'],
      ['volume_control', 'Volume control', 'Control & UX'], ['camera_controls', 'Camera controls', 'Control & UX'],
      ['room_combination', 'Room combination controls', 'Control & UX'], ['scheduling_integration', 'Scheduling integration', 'Control & UX'],
      ['feedback_accuracy', 'Feedback accuracy', 'Control & UX'], ['power_shutdown', 'Power and shutdown behavior', 'Control & UX']
    ],
    'INFRASTRUCTURE': [
      ['rack_condition', 'Rack condition', 'Infrastructure'], ['equipment_labeling', 'Equipment labeling', 'Documentation'],
      ['cable_management', 'Cable management', 'Infrastructure'], ['ventilation', 'Ventilation and airflow', 'Infrastructure'],
      ['power_distribution', 'Power distribution', 'Infrastructure'], ['ups_condition', 'UPS condition', 'Infrastructure'],
      ['poe_availability', 'PoE availability', 'Network & Security'], ['network_connectivity', 'Network connectivity', 'Network & Security'],
      ['table_connectivity', 'Table connectivity', 'Infrastructure'], ['patch_panel_documentation', 'Patch panel documentation', 'Documentation'],
      ['switch_port_identification', 'Switch port identification', 'Documentation']
    ],
    'USER EXPERIENCE': [
      ['ease_of_initiation', 'Ease of meeting initiation', 'Control & UX'], ['join_workflow', 'Join workflow', 'Control & UX'],
      ['content_sharing_workflow', 'Content sharing workflow', 'Control & UX'], ['presenter_confidence', 'Presenter confidence', 'Control & UX'],
      ['room_instructions', 'Room instructions', 'Documentation'], ['signage_accuracy', 'Signage accuracy', 'Documentation'],
      ['user_confusion', 'User confusion points', 'Training'], ['support_contact', 'Support contact visibility', 'Documentation']
    ]
  };
  S.TEST_CATEGORIES = Object.keys(S.TESTS);
  S.testMeta = function (key) {
    for (const cat of S.TEST_CATEGORIES) {
      for (const t of S.TESTS[cat]) { if (cat.toLowerCase().replace(/ /g, '_') + '.' + t[0] === key) return { category: cat, name: t[1], finding: t[2] }; }
    }
    return null;
  };
  S.testKey = function (cat, k) { return cat.toLowerCase().replace(/ /g, '_') + '.' + k; };

  S.NETWORK_CHECKS = [
    ['addressing', 'Device addressing verified'], ['mac', 'MAC address verified'], ['vlan', 'VLAN verified'], ['switch_port', 'Switch port verified'],
    ['port_description', 'Port description verified'], ['dhcp_static', 'DHCP/static assignment confirmed'], ['dns', 'DNS dependency confirmed'],
    ['ntp', 'NTP dependency confirmed'], ['firmware', 'Firmware approved'], ['monitoring', 'Monitoring portal access confirmed'],
    ['security_review', 'Security requirements reviewed with IT']
  ];
  S.NETWORK_CHECK_STATUS = [['verified', 'Verified'], ['issue', 'Issue found'], ['awaiting_it', 'Awaiting IT'], ['na', 'Not applicable'], ['not_checked', 'Not checked']];

  S.PHOTO_CATEGORIES = ['Room overview', 'Display(s)', 'Camera(s)', 'Microphone(s)', 'Touch panel', 'Table connectivity', 'Rack overview', 'Rack elevation',
    'Device rear panels', 'Equipment labels', 'Cable terminations', 'Network switches', 'Other'];

  S.FINDING_CATEGORIES = ['Audio', 'Video', 'Control & UX', 'Network & Security', 'Documentation', 'Training', 'Spare Parts', 'Infrastructure',
    'Preventive Maintenance', 'Other'];
  S.CLASSIFICATION = [['observed_fact', 'Observed fact'], ['auditor_interpretation', 'Auditor interpretation'], ['unverified_hypothesis', 'Unverified hypothesis']];
  S.NOTE_TYPES = [['observed_fact', 'Observed fact'], ['auditor_interpretation', 'Auditor interpretation'], ['unverified_hypothesis', 'Unverified hypothesis'],
    ['recommended_action', 'Recommended action']];
  S.FINDING_STATUS = [['open', 'Awaiting triage'], ['linked', 'Linked to backlog'], ['duplicate', 'Duplicate'], ['dismissed', 'Dismissed']];

  S.PRIORITIES = [
    ['P1', 'P1 — High', 'Meeting failure risk, executive visibility, repeated user disruption, safety concern, or material room availability risk.'],
    ['P2', 'P2 — Medium', 'Quality, consistency, supportability, documentation, or operational issues that create friction or avoidable support load.'],
    ['P3', 'P3 — Low', 'Optimization, polish, preventive cleanup, or standardization.']
  ];
  S.BACKLOG_STATUSES = ['New Discovery', 'Under Investigation', 'Pending PepperDash Review', 'Pending Client IT', 'Pending Client Approval', 'Approved',
    'Scheduled', 'In Progress', 'Blocked', 'Completed', 'Deferred', 'Rejected'];
  S.BACKLOG_CLOSED = ['Completed', 'Deferred', 'Rejected'];
  S.ROOT_CAUSE_CONFIDENCE = [['not_determined', 'Not determined'], ['hypothesis', 'Hypothesis — unverified'], ['probable', 'Probable — partially evidenced'],
    ['confirmed', 'Confirmed']];
  S.FREQUENCY = ['Constant', 'Frequent (weekly or more)', 'Intermittent', 'Rare', 'Single occurrence', 'Unknown'];
  S.LEVELS = ['High', 'Medium', 'Low', 'Unknown'];
  S.EFFORT = ['XS (under 1 hour)', 'S (half day)', 'M (1–2 days)', 'L (up to 1 week)', 'XL (multi-week)', 'Unknown'];
  S.STRATEGY = ['Repair', 'Replace', 'Reprogram / reconfigure', 'Standardize', 'Document', 'Train', 'Monitor', 'Escalate', 'Other'];
  S.MEETING_IMPACT = ['Meeting cannot proceed', 'Meeting degraded', 'Workaround required', 'Cosmetic / no impact', 'Unknown'];
  S.OWNERS = ['PepperDash', 'Client IT', 'Client AV Operations', 'Vendor', 'Facilities'];

  S.IT_PARTIES = ['Client IT', 'PepperDash', 'Vendor', 'Facilities'];
  S.IT_TYPES = {
    'Client IT': ['IP reservations', 'DHCP mappings', 'VLAN details', 'Switch port information', 'Firewall requirements', 'DNS/NTP', 'Multicast', 'QoS',
      'Firmware standards', 'Security policies', 'Device approval', 'Network exceptions', 'Other'],
    'PepperDash': ['Programming', 'DSP tuning', 'Control system issues', 'UI standardization', 'Firmware recommendations', 'System design',
      'Engineering changes', 'Commissioning support', 'Other'],
    'Vendor': ['Warranty', 'Hardware replacements', 'Firmware support', 'Product lifecycle', 'Technical assistance', 'Other'],
    'Facilities': ['Power', 'HVAC / ventilation', 'Furniture / millwork', 'Access / scheduling', 'Other']
  };
  S.IT_STATUSES = ['Draft', 'Submitted', 'Acknowledged', 'In Progress', 'Awaiting Response', 'Answered', 'Closed', 'Cancelled'];
  S.IT_CLOSED = ['Answered', 'Closed', 'Cancelled'];

  S.INFRA_TYPES = [['switch', 'Network switch'], ['vlan', 'VLAN'], ['subnet', 'Subnet'], ['ip_range', 'IP range'], ['dhcp_reservation', 'DHCP reservation'],
    ['static_ip', 'Static IP assignment'], ['dns_record', 'DNS name'], ['dns_server', 'DNS server'], ['ntp_server', 'NTP server'],
    ['firewall_rule', 'Firewall dependency'], ['multicast', 'Multicast dependency'], ['qos', 'QoS dependency'],
    ['monitoring', 'Management / monitoring system'], ['other', 'Other']];
  S.VALIDATION_STATUS = [['observed', 'Observed onsite'], ['from_docs', 'From provided documentation'], ['it_validated', 'Validated by Client IT'],
    ['awaiting_it', 'Requires IT validation'], ['unknown', 'Unknown']];
  S.PORT_MODES = [['access', 'Access (untagged)'], ['trunk', 'Trunk (tagged)'], ['unknown', 'Unknown']];
  S.POE_STATUS = [['delivering', 'Delivering power'], ['enabled', 'Enabled — no load'], ['disabled', 'Disabled'], ['unknown', 'Unknown']];
  S.DEP_TYPES = ['DHCP reservation', 'Static IP', 'DNS resolution', 'NTP', 'Firewall rule', 'Multicast', 'QoS', 'Monitoring platform',
    'Firmware management', 'Licensing / cloud service', '802.1X / NAC', 'Other'];
  S.DEP_STATUS = [['confirmed', 'Confirmed'], ['awaiting_it', 'Awaiting IT'], ['assumed', 'Assumed — unverified'], ['unknown', 'Unknown']];

  S.SPARE_CONDITION = ['New', 'Good', 'Fair', 'Poor', 'Faulty', 'Untested', 'Unknown'];
  S.SPARE_LIFECYCLE = [['active', 'Active'], ['approaching_eol', 'Approaching end of life'], ['eol', 'End of life'], ['unknown', 'Unknown']];

  S.AUDIT_STATUS = [['in_progress', 'In progress'], ['complete', 'Complete'], ['verified', 'Fully verified']];
  S.AUDIT_SECTIONS = [['summary', 'Space Summary'], ['photos', 'Room Photography'], ['devices', 'Device Inventory'], ['testing', 'Functional Testing'],
    ['network', 'Network Validation'], ['findings', 'Findings'], ['notes', 'Audit Notes']];
  S.ROLES = [['admin', 'Administrator'], ['lead_auditor', 'Lead auditor'], ['auditor', 'Auditor'], ['viewer', 'Viewer (read-only)']];

  S.label = function (list, v) {
    for (let i = 0; i < list.length; i++) { const it = list[i]; if (Array.isArray(it) ? it[0] === v : it === v) return Array.isArray(it) ? it[1] : it; }
    return v == null || v === '' ? '—' : String(v);
  };

  /* ------------------------------------------------------------------ tables
   * Column grammar:  name[:type]  |  name>table (required-less FK)  |  name!>table (NOT NULL FK)  |  name~table (soft reference, no SQL constraint)
   * types: text (default) | int | num | bool | date | ts | json
   * Every table also carries: id, org_id, created_at, updated_at, created_by, updated_by, deleted_at, is_demo. */
  const T = (S.T = {
    organizations: { label: 'Organization', cols: 'name short_code notes' },
    profiles: { label: 'Audit user', cols: 'full_name email role last_seen_at:ts' },
    buildings: { label: 'Building', cols: 'name address identifier floors_count:int site_contact notes archived:bool' },
    floors: { label: 'Floor', cols: 'building_id!>buildings number designation infrastructure_notes audit_status_override sort_order:num archived:bool' },
    areas: { label: 'Area', cols: 'building_id!>buildings floor_id!>floors name description archived:bool' },
    rooms: {
      label: 'Room', code: ['RM', 4],
      cols: 'building_id!>buildings floor_id!>floors area_id>areas code name number room_type capacity:int criticality conferencing_platform control_platform ' +
        'dsp_platform display_config camera_config microphone_config scheduling_platform operational_status notes archived:bool'
    },
    room_configurations: { label: 'Room configuration', code: ['RC', 3], cols: 'building_id!>buildings floor_id!>floors code name description capacity:int notes archived:bool' },
    room_configuration_members: { label: 'Configuration member', cols: 'configuration_id!>room_configurations room_id!>rooms' },
    racks: { label: 'Rack', code: ['RK', 3], cols: 'building_id!>buildings floor_id!>floors room_id!>rooms code name location height_ru:int notes archived:bool' },
    audits: {
      label: 'Room audit', code: ['AU', 4],
      cols: 'code building_id!>buildings floor_id!>floors room_id>rooms configuration_id>room_configurations audit_date:date auditor status operational_status ' +
        'started_at:ts completed_at:ts verified_at:ts summary_snapshot:json general_notes'
    },
    audit_sections: { label: 'Audit section', cols: 'audit_id!>audits section_key state notes' },
    audit_notes: { label: 'Audit note', cols: 'audit_id!>audits room_id>rooms section_key note_type text' },
    functional_tests: {
      label: 'Functional test',
      cols: 'audit_id!>audits room_id>rooms category test_key test_name result comment tested_at:ts finding_id~findings suggestion_state is_custom:bool sort_order:int'
    },
    network_checks: { label: 'Network validation check', cols: 'audit_id!>audits room_id>rooms check_key check_name status comment checked_at:ts sort_order:int' },
    infra_assets: {
      label: 'Infrastructure asset', code: ['NA', 4],
      cols: 'code asset_type name identifier description building_id>buildings floor_id>floors room_id>rooms device_id~devices model hostname management_ip ' +
        'ip_address mac_address vlan subnet gateway assignment_type poe_budget_w:num poe_used_w:num validation_status source notes archived:bool'
    },
    devices: {
      label: 'Device', code: ['DV', 4],
      cols: 'code building_id!>buildings floor_id!>floors room_id>rooms rack_id>racks audit_id~audits category custom_category role manufacturer model hostname ' +
        'ip_address ip_status mac_address mac_status serial_number serial_status subnet vlan ip_assignment dns_name firmware_version app_version ' +
        'switch_asset_id~infra_assets connected_switch switch_port connection_type poe_required poe_class power_source rack_location monitoring_portal ' +
        'management_url warranty_info support_expiration:date notes archived:bool'
    },
    switch_ports: {
      label: 'Switch port',
      cols: 'switch_asset_id!>infra_assets port description mode vlan tagged_vlans untagged_vlan poe_status poe_class link_speed device_id~devices validation_status notes'
    },
    network_links: { label: 'Network relationship', cols: 'kind from_type from_id to_type to_id from_port to_port dep_type description status notes' },
    backlog_items: {
      label: 'Backlog item', code: ['BL', 3],
      cols: 'code building_id>buildings floor_id>floors room_id>rooms device_id~devices category title problem_statement observed_evidence suspected_cause root_cause ' +
        'root_cause_confidence root_cause_basis recommendation strategy expected_outcome operational_risk meeting_impact frequency user_impact business_impact ' +
        'user_friction risk_level effort estimated_cost:num safety_concern:bool exec_visibility:bool dependencies owner requested_by priority priority_rationale ' +
        'status status_changed_at:ts target_date:date completed_at:ts systemic:bool'
    },
    findings: {
      label: 'Finding', code: ['FN', 4],
      cols: 'code building_id>buildings floor_id>floors room_id>rooms device_id~devices audit_id~audits test_id~functional_tests category title observation ' +
        'classification interpretation hypothesis recommended_action priority_hint status backlog_item_id~backlog_items source source_key'
    },
    it_requests: {
      label: 'Coordination request', code: ['IT', 3],
      cols: 'code topic description requested_from vendor_name request_type building_id>buildings floor_id>floors room_id>rooms device_id~devices reason needed_for ' +
        'priority date_requested:date target_date:date status response response_date:date documentation source_key'
    },
    backlog_it_links: { label: 'Backlog ↔ request link', cols: 'backlog_item_id!>backlog_items it_request_id!>it_requests' },
    spare_items: {
      label: 'Spare equipment', code: ['SP', 3],
      cols: 'code name manufacturer model part_number serial_number quantity:int min_stock:int storage_location building_id>buildings floor_id>floors compatibility ' +
        'condition warranty lifecycle eol_date:date notes archived:bool'
    },
    photos: {
      label: 'Photograph', code: ['PH', 5],
      cols: 'code building_id>buildings floor_id>floors room_id>rooms audit_id~audits device_id~devices finding_id~findings test_id~functional_tests ' +
        'backlog_item_id~backlog_items it_request_id~it_requests spare_item_id~spare_items category description taken_at:ts original_filename mime size_bytes:int ' +
        'width:int height:int has_edit:bool thumb remote_ref remote_edit_ref'
    },
    followups: { label: 'Follow-up task', cols: 'kind device_id~devices room_id~rooms title detail suggested_party status resolved_at:ts it_request_id~it_requests dedupe_key' },
    insight_states: { label: 'Insight state', cols: 'insight_key state note' },
    /* detail = a fine-grained change (one test result, one port, one link): in the exported history, not in the activity feed */
    activity_log: { label: 'Activity', cols: 'at:ts actor action entity_type entity_id entity_code summary building_id floor_id room_id changes:json detail:bool' },
    exports: {
      label: 'Export', cols: 'code mode window_start:ts window_end:ts baseline_export_id baseline_at:ts filters:json counts:json validation:json summary:json filename photo_mode status'
    }
  });
  S.COMMON_COLS = ['id', 'org_id', 'created_at', 'updated_at', 'created_by', 'updated_by', 'deleted_at', 'is_demo'];
  S.TABLES = Object.keys(T); /* declaration order is FK-dependency order (parents first) */
  S.parseCol = function (spec) {
    const m = /^([a-z_0-9]+)(?:(!?>|~)([a-z_]+))?(?::([a-z]+))?$/.exec(spec);
    if (!m) throw new Error('Bad column spec: ' + spec);
    return { name: m[1], type: m[4] || (m[2] ? 'uuid' : 'text'), ref: m[3] || null, soft: m[2] === '~', required: m[2] === '!>' };
  };
  for (const name of S.TABLES) {
    const t = T[name];
    t.name = name;
    t.columns = t.cols.split(/\s+/).filter(Boolean).map(S.parseCol);
    t.colNames = t.columns.map(function (c) { return c.name; });
  }

  /* Value constraints the cloud database enforces (CHECK constraints in supabase/schema.sql). '' = not yet recorded.
   * Defined here so the SQL generator and the conformance test share one definition with the forms above. */
  (function () {
    const opt = function (list) { const v = list.map(function (x) { return Array.isArray(x) ? x[0] : x; }); return v.indexOf('') < 0 ? v.concat(['']) : v; };
    const ID = opt(S.ID_STATUS);
    S.DB_CHECKS = {
      devices: [['ip_status', ID], ['mac_status', ID], ['serial_status', ID]],
      audits: [['status', opt(S.AUDIT_STATUS)]],
      functional_tests: [['result', opt(S.TEST_RESULTS)], ['suggestion_state', opt(['none', 'pending', 'accepted', 'dismissed'])]],
      network_checks: [['status', opt(S.NETWORK_CHECK_STATUS)]],
      findings: [['status', opt(S.FINDING_STATUS)], ['classification', opt(S.CLASSIFICATION)], ['priority_hint', ['', 'P1', 'P2', 'P3']]],
      backlog_items: [['priority', ['', 'P1', 'P2', 'P3']], ['status', opt(S.BACKLOG_STATUSES)], ['root_cause_confidence', opt(S.ROOT_CAUSE_CONFIDENCE)]],
      it_requests: [['status', opt(S.IT_STATUSES)], ['requested_from', opt(S.IT_PARTIES)]],
      infra_assets: [['asset_type', opt(S.INFRA_TYPES)], ['validation_status', opt(S.VALIDATION_STATUS)]],
      audit_notes: [['note_type', opt(S.NOTE_TYPES)]],
      network_links: [['kind', opt(['uplink', 'dependency'])]],
      followups: [['status', opt(['open', 'resolved', 'dismissed'])]],
      spare_items: [['lifecycle', opt(S.SPARE_LIFECYCLE)]]
    };
  })();

  /* Human title for any record (used in activity log, pickers, exports). */
  S.title = function (table, r) {
    if (!r) return '—';
    switch (table) {
      case 'buildings': return r.name || 'Building';
      case 'floors': return 'Floor ' + (r.number || '?');
      case 'areas': return r.name || 'Area';
      case 'rooms': return ((r.number || '') + ' ' + (r.name || '')).trim() || 'Room';
      case 'room_configurations': return r.name || 'Configuration';
      case 'racks': return r.name || 'Rack';
      case 'devices': return r.hostname || [r.manufacturer, r.model].filter(Boolean).join(' ') || (r.category === 'Other' && r.custom_category) || r.category || 'Device';
      case 'backlog_items': return r.title || r.problem_statement || 'Backlog item';
      case 'findings': return r.title || 'Finding';
      case 'it_requests': return r.topic || 'Request';
      case 'spare_items': return r.name || [r.manufacturer, r.model].filter(Boolean).join(' ') || 'Spare item';
      case 'infra_assets': return r.name || r.identifier || 'Infrastructure asset';
      case 'photos': return r.description || r.category || 'Photograph';
      case 'audits': return 'Audit ' + (r.code || '');
      case 'functional_tests': return r.test_name || 'Functional test';
      case 'network_checks': return r.check_name || 'Network validation check';
      case 'audit_notes': { const s = String(r.text || '').replace(/\s+/g, ' '); return s.length > 70 ? s.slice(0, 69) + '…' : (s || 'Audit note'); }
      case 'audit_sections': return 'section ' + (r.section_key || '');
      case 'switch_ports': return 'port ' + (r.port || '?');
      case 'network_links': return r.kind === 'uplink' ? 'switch uplink' : ('dependency' + (r.dep_type ? ' on ' + r.dep_type : ''));
      case 'backlog_it_links': return 'backlog item ↔ coordination request';
      case 'room_configuration_members': return 'member space of a combined configuration';
      default: return r.name || r.title || r.code || table;
    }
  };

  /* ------------------------------------------------------------------ form field definitions
   * { k, label, type, opts, req, half, group, ph, hint, mono, show(rec), rows }
   * types: text | textarea | number | date | select | combo | toggle | ident | building | floor | area | room | rack | device | switch */
  const F = (S.F = {});
  F.building = [
    { k: 'name', label: 'Building name', req: true, ph: 'Name or street address of the building' },
    { k: 'address', label: 'Street address' },
    { k: 'identifier', label: 'Building identifier', half: true, mono: true, ph: 'e.g. NYC-01' },
    { k: 'floors_count', label: 'Number of floors', type: 'number', half: true },
    { k: 'site_contact', label: 'Site contact' },
    { k: 'notes', label: 'General notes', type: 'textarea' }
  ];
  F.floor = [
    { k: 'number', label: 'Floor number / name', req: true, half: true, ph: 'e.g. 22' },
    { k: 'designation', label: 'Floor designation', half: true, ph: 'e.g. Executive conference level' },
    { k: 'infrastructure_notes', label: 'Floor-level infrastructure notes', type: 'textarea', ph: 'IDF locations, AV rack rooms, riser notes…' },
    { k: 'audit_status_override', label: 'Audit status', type: 'select', opts: [['', 'Automatic (from room audits)'], ['Not started', 'Not started'], ['In progress', 'In progress'], ['Complete', 'Complete'], ['On hold', 'On hold']] }
  ];
  F.area = [
    { k: 'name', label: 'Area name', req: true, ph: 'e.g. East wing' },
    { k: 'description', label: 'Description', type: 'textarea', rows: 2 }
  ];
  F.room = [
    { k: 'number', label: 'Room number', req: true, half: true, mono: true, ph: 'e.g. 22B' },
    { k: 'name', label: 'Room name', req: true, half: true, ph: 'e.g. Medium Conference Room' },
    { k: 'room_type', label: 'Room type', type: 'select', opts: S.ROOM_TYPES, req: true, half: true },
    { k: 'capacity', label: 'Capacity', type: 'number', half: true },
    { k: 'area_id', label: 'Area', type: 'area', half: true },
    { k: 'criticality', label: 'Business criticality', type: 'select', opts: S.CRITICALITY, half: true },
    { k: 'conferencing_platform', label: 'Primary conferencing platform', type: 'select', opts: S.CONF_PLATFORMS, half: true, group: 'Systems' },
    { k: 'control_platform', label: 'AV control platform', type: 'select', opts: S.CONTROL_PLATFORMS, half: true, group: 'Systems' },
    { k: 'dsp_platform', label: 'DSP platform', type: 'select', opts: S.DSP_PLATFORMS, half: true, group: 'Systems' },
    { k: 'scheduling_platform', label: 'Room scheduling platform', type: 'select', opts: S.SCHED_PLATFORMS, half: true, group: 'Systems' },
    { k: 'display_config', label: 'Display configuration', group: 'Systems', ph: 'e.g. Dual 85" flat panels' },
    { k: 'camera_config', label: 'Camera configuration', group: 'Systems', ph: 'e.g. Single PTZ, front of room' },
    { k: 'microphone_config', label: 'Microphone configuration', group: 'Systems', ph: 'e.g. Ceiling array ×2' },
    { k: 'operational_status', label: 'Current operational status', type: 'select', opts: S.OP_STATUS, group: 'Status' },
    { k: 'notes', label: 'Room notes', type: 'textarea', group: 'Status' }
  ];
  F.configuration = [
    { k: 'name', label: 'Configuration name', req: true, ph: 'e.g. 23A Combined (North + South)' },
    { k: 'capacity', label: 'Combined capacity', type: 'number', half: true },
    { k: 'description', label: 'Description', type: 'textarea', rows: 2, ph: 'How the spaces combine: airwall, shared DSP, combined control page…' },
    { k: 'notes', label: 'Notes', type: 'textarea', rows: 2 }
  ];
  F.rack = [
    { k: 'name', label: 'Rack name', req: true, half: true, ph: 'e.g. Credenza rack' },
    { k: 'height_ru', label: 'Height (RU)', type: 'number', half: true },
    { k: 'location', label: 'Location in room', ph: 'e.g. Under display, left door' },
    { k: 'notes', label: 'Notes', type: 'textarea', rows: 2 }
  ];
  F.device = [
    { k: 'category', label: 'Device role / type', type: 'select', opts: S.DEVICE_CATEGORIES, req: true, group: 'Device' },
    { k: 'custom_category', label: 'Custom device type', group: 'Device', show: function (r) { return r.category === 'Other'; }, ph: 'Describe the device type' },
    { k: 'role', label: 'Role in this room', group: 'Device', ph: 'e.g. Room DSP and control core' },
    { k: 'manufacturer', label: 'Manufacturer', type: 'combo', opts: S.MANUFACTURERS, req: true, half: true, group: 'Device' },
    { k: 'model', label: 'Model', req: true, half: true, group: 'Device' },
    { k: 'room_id', label: 'Room / space', type: 'room', group: 'Device' },
    { k: 'serial_number', label: 'Serial number', type: 'ident', statusKey: 'serial_status', mono: true, group: 'Physical identification',
      hint: 'From the device label or chassis. Physical identity is tracked separately from network identity.' },
    { k: 'rack_id', label: 'Rack', type: 'rack', half: true, group: 'Physical identification' },
    { k: 'rack_location', label: 'Physical location / RU', half: true, group: 'Physical identification', ph: 'e.g. RU 12, behind display' },
    { k: 'hostname', label: 'Hostname / device name', req: true, mono: true, group: 'Network identity', ph: 'As configured on the device' },
    { k: 'ip_address', label: 'IP address', type: 'ident', statusKey: 'ip_status', mono: true, inputmode: 'decimal', group: 'Network identity' },
    { k: 'mac_address', label: 'MAC address', type: 'ident', statusKey: 'mac_status', mono: true, group: 'Network identity' },
    { k: 'subnet', label: 'Subnet', half: true, mono: true, group: 'Network identity', ph: 'e.g. 192.0.2.0/26' },
    { k: 'vlan', label: 'VLAN', half: true, group: 'Network identity', ph: 'Name and/or ID' },
    { k: 'ip_assignment', label: 'Address assignment', type: 'select', opts: S.IP_ASSIGNMENT, half: true, group: 'Network identity' },
    { k: 'dns_name', label: 'DNS name', half: true, mono: true, group: 'Network identity' },
    { k: 'switch_asset_id', label: 'Connected switch', type: 'switch', half: true, group: 'Network identity' },
    { k: 'switch_port', label: 'Switch port', half: true, mono: true, group: 'Network identity', ph: 'e.g. 1/0/18' },
    { k: 'connection_type', label: 'Network connection type', type: 'select', opts: S.CONNECTION_TYPES, half: true, group: 'Network identity' },
    { k: 'poe_required', label: 'PoE required', type: 'select', opts: S.YES_NO_UNKNOWN, half: true, group: 'Power' },
    { k: 'poe_class', label: 'PoE class', type: 'select', opts: S.POE_CLASSES, half: true, group: 'Power' },
    { k: 'power_source', label: 'Power source', type: 'select', opts: S.POWER_SOURCES, half: true, group: 'Power' },
    { k: 'firmware_version', label: 'Firmware version', half: true, mono: true, group: 'Software' },
    { k: 'app_version', label: 'Application version', half: true, mono: true, group: 'Software' },
    { k: 'monitoring_portal', label: 'Monitoring portal', half: true, group: 'Management & lifecycle', ph: 'e.g. Q-SYS Reflect' },
    { k: 'management_url', label: 'Management URL', half: true, mono: true, group: 'Management & lifecycle' },
    { k: 'warranty_info', label: 'Warranty information', half: true, group: 'Management & lifecycle' },
    { k: 'support_expiration', label: 'Support expiration', type: 'date', half: true, group: 'Management & lifecycle' },
    { k: 'notes', label: 'Notes', type: 'textarea', group: 'Notes' }
  ];
  F.location = [
    { k: 'building_id', label: 'Building', type: 'building', half: true, group: 'Location' },
    { k: 'floor_id', label: 'Floor', type: 'floor', half: true, group: 'Location' },
    { k: 'room_id', label: 'Room', type: 'room', half: true, group: 'Location' },
    { k: 'device_id', label: 'Associated device', type: 'device', half: true, group: 'Location' }
  ];
  F.finding = [
    { k: 'title', label: 'Finding', req: true, ph: 'Short statement of what was found' },
    { k: 'category', label: 'Category', type: 'select', opts: S.FINDING_CATEGORIES, req: true, half: true },
    { k: 'priority_hint', label: 'Preliminary priority', type: 'select', opts: [['', 'Not assessed'], ['P1', 'P1 — High'], ['P2', 'P2 — Medium'], ['P3', 'P3 — Low']], half: true },
    { k: 'observation', label: 'Observed evidence (facts only)', type: 'textarea', req: true, ph: 'What you saw, heard or measured — no conclusions' },
    { k: 'classification', label: 'This record is primarily', type: 'select', opts: S.CLASSIFICATION },
    { k: 'interpretation', label: 'Auditor interpretation', type: 'textarea', rows: 2, ph: 'Your reading of the observation — clearly an opinion' },
    { k: 'hypothesis', label: 'Unverified hypothesis', type: 'textarea', rows: 2, ph: 'Suspected cause — NOT confirmed' },
    { k: 'recommended_action', label: 'Recommended action', type: 'textarea', rows: 2 }
  ].concat(F.location);
  F.backlog = [
    { k: 'title', label: 'Title', req: true, ph: 'Short, specific name for the improvement' },
    { k: 'category', label: 'Category', type: 'select', opts: S.FINDING_CATEGORIES, req: true, half: true },
    { k: 'status', label: 'Workflow status', type: 'select', opts: S.BACKLOG_STATUSES, half: true },
    { k: 'problem_statement', label: 'Problem statement', type: 'textarea', req: true, group: 'Evidence — observed facts' },
    { k: 'observed_evidence', label: 'Observed evidence', type: 'textarea', group: 'Evidence — observed facts', ph: 'Facts only: what was seen, heard or measured, and where' },
    { k: 'suspected_cause', label: 'Suspected cause — unverified hypothesis', type: 'textarea', rows: 2, group: 'Cause analysis',
      hint: 'Recorded as a hypothesis. It is never promoted to a confirmed root cause automatically.' },
    { k: 'root_cause_confidence', label: 'Root cause confidence', type: 'select', opts: S.ROOT_CAUSE_CONFIDENCE, group: 'Cause analysis' },
    { k: 'root_cause', label: 'Root cause (confirmed only)', type: 'textarea', rows: 2, group: 'Cause analysis',
      show: function (r) { return r.root_cause_confidence === 'confirmed'; } },
    { k: 'root_cause_basis', label: 'Confirmed by / basis of confirmation', group: 'Cause analysis', show: function (r) { return r.root_cause_confidence === 'confirmed'; },
      ph: 'Who confirmed it and how (test, vendor case, log evidence…)' },
    { k: 'recommendation', label: 'Recommendation', type: 'textarea', group: 'Recommended action' },
    { k: 'strategy', label: 'Strategy', type: 'select', opts: S.STRATEGY, half: true, group: 'Recommended action' },
    { k: 'effort', label: 'Estimated effort', type: 'select', opts: S.EFFORT, half: true, group: 'Recommended action' },
    { k: 'estimated_cost', label: 'Estimated cost (USD, optional)', type: 'number', half: true, group: 'Recommended action' },
    { k: 'target_date', label: 'Target date', type: 'date', half: true, group: 'Recommended action' },
    { k: 'expected_outcome', label: 'Expected business outcome', type: 'textarea', rows: 2, group: 'Recommended action' },
    { k: 'dependencies', label: 'Dependencies', type: 'textarea', rows: 2, group: 'Recommended action', ph: 'Client IT, PepperDash engineering, vendors, facilities…' },
    { k: 'business_impact', label: 'Business impact', type: 'select', opts: S.LEVELS, half: true, group: 'Impact & priority' },
    { k: 'frequency', label: 'Frequency', type: 'select', opts: S.FREQUENCY, half: true, group: 'Impact & priority' },
    { k: 'user_friction', label: 'User friction', type: 'select', opts: S.LEVELS, half: true, group: 'Impact & priority' },
    { k: 'risk_level', label: 'Operational risk level', type: 'select', opts: S.LEVELS, half: true, group: 'Impact & priority' },
    { k: 'meeting_impact', label: 'Meeting impact', type: 'select', opts: S.MEETING_IMPACT, half: true, group: 'Impact & priority' },
    { k: 'exec_visibility', label: 'Executive visibility', type: 'toggle', half: true, group: 'Impact & priority' },
    { k: 'safety_concern', label: 'Safety concern', type: 'toggle', half: true, group: 'Impact & priority' },
    { k: 'operational_risk', label: 'Operational risk (description)', type: 'textarea', rows: 2, group: 'Impact & priority' },
    { k: 'user_impact', label: 'User impact (description)', type: 'textarea', rows: 2, group: 'Impact & priority' },
    { k: 'owner', label: 'Owner', type: 'combo', opts: S.OWNERS, half: true, group: 'Ownership' },
    { k: 'requested_by', label: 'Requested by', half: true, group: 'Ownership' }
  ].concat(F.location);
  F.it = [
    { k: 'topic', label: 'Topic', req: true, ph: 'e.g. DHCP reservations for AV VLAN — Floor 22' },
    { k: 'requested_from', label: 'Requested from', type: 'select', opts: S.IT_PARTIES, req: true, half: true },
    { k: 'request_type', label: 'Request type', type: 'select', half: true, opts: function (r) { return S.IT_TYPES[r.requested_from] || S.IT_TYPES['Client IT']; } },
    { k: 'vendor_name', label: 'Vendor', show: function (r) { return r.requested_from === 'Vendor'; }, ph: 'Manufacturer or reseller' },
    { k: 'description', label: 'Description', type: 'textarea', req: true },
    { k: 'reason', label: 'Reason', type: 'textarea', rows: 2, ph: 'Why this information or action is needed' },
    { k: 'needed_for', label: 'Needed for', ph: 'e.g. Complete network validation for 22B' },
    { k: 'priority', label: 'Priority', type: 'select', opts: [['P1', 'P1 — High'], ['P2', 'P2 — Medium'], ['P3', 'P3 — Low']], half: true },
    { k: 'status', label: 'Status', type: 'select', opts: S.IT_STATUSES, half: true },
    { k: 'date_requested', label: 'Date requested', type: 'date', half: true },
    { k: 'target_date', label: 'Target date', type: 'date', half: true },
    { k: 'response', label: 'Response', type: 'textarea', group: 'Response' },
    { k: 'response_date', label: 'Response date', type: 'date', half: true, group: 'Response' },
    { k: 'documentation', label: 'Supporting documentation', type: 'textarea', rows: 2, group: 'Response', ph: 'Ticket numbers, document names, links' }
  ].concat(F.location);
  F.spare = [
    { k: 'name', label: 'Equipment name', req: true, ph: 'e.g. Touch panel, 10-inch' },
    { k: 'manufacturer', label: 'Manufacturer', type: 'combo', opts: S.MANUFACTURERS, half: true },
    { k: 'model', label: 'Model', half: true },
    { k: 'part_number', label: 'Part number', half: true, mono: true },
    { k: 'serial_number', label: 'Serial number', half: true, mono: true },
    { k: 'quantity', label: 'Quantity on hand', type: 'number', half: true },
    { k: 'min_stock', label: 'Minimum stock level', type: 'number', half: true },
    { k: 'storage_location', label: 'Storage location', ph: 'e.g. 22nd floor AV closet, shelf B' },
    { k: 'building_id', label: 'Building', type: 'building', half: true },
    { k: 'floor_id', label: 'Assigned floor', type: 'floor', half: true },
    { k: 'compatibility', label: 'Compatibility', type: 'textarea', rows: 2, ph: 'Rooms, systems or models this spare can replace' },
    { k: 'condition', label: 'Condition', type: 'select', opts: S.SPARE_CONDITION, half: true },
    { k: 'lifecycle', label: 'Lifecycle status', type: 'select', opts: S.SPARE_LIFECYCLE, half: true },
    { k: 'eol_date', label: 'End-of-life date', type: 'date', half: true },
    { k: 'warranty', label: 'Warranty', half: true },
    { k: 'notes', label: 'Notes', type: 'textarea', rows: 2 }
  ];
  F.infra = [
    { k: 'asset_type', label: 'Record type', type: 'select', opts: S.INFRA_TYPES, req: true, half: true },
    { k: 'validation_status', label: 'Validation', type: 'select', opts: S.VALIDATION_STATUS, half: true },
    { k: 'name', label: 'Name', req: true, ph: 'e.g. AV-CONTROL' },
    { k: 'identifier', label: 'Identifier / value', mono: true, ph: 'VLAN ID, CIDR, IP range, FQDN, rule reference…' },
    { k: 'description', label: 'Description', type: 'textarea', rows: 2 },
    { k: 'model', label: 'Switch model', half: true, show: function (r) { return r.asset_type === 'switch'; } },
    { k: 'hostname', label: 'Hostname', half: true, mono: true, show: function (r) { return ['switch', 'dns_server', 'ntp_server', 'monitoring'].indexOf(r.asset_type) >= 0; } },
    { k: 'management_ip', label: 'Management IP', half: true, mono: true, show: function (r) { return r.asset_type === 'switch'; } },
    { k: 'poe_budget_w', label: 'PoE budget (W)', type: 'number', half: true, show: function (r) { return r.asset_type === 'switch'; } },
    { k: 'poe_used_w', label: 'PoE in use (W)', type: 'number', half: true, show: function (r) { return r.asset_type === 'switch'; } },
    { k: 'ip_address', label: 'IP address', half: true, mono: true, show: function (r) { return ['dhcp_reservation', 'static_ip', 'dns_record', 'dns_server', 'ntp_server', 'monitoring'].indexOf(r.asset_type) >= 0; } },
    { k: 'mac_address', label: 'MAC address', half: true, mono: true, show: function (r) { return r.asset_type === 'dhcp_reservation'; } },
    { k: 'vlan', label: 'VLAN', half: true, show: function (r) { return ['subnet', 'ip_range', 'dhcp_reservation', 'static_ip', 'multicast', 'qos'].indexOf(r.asset_type) >= 0; } },
    { k: 'subnet', label: 'Subnet', half: true, mono: true, show: function (r) { return ['vlan', 'ip_range', 'dhcp_reservation', 'static_ip'].indexOf(r.asset_type) >= 0; } },
    { k: 'gateway', label: 'Gateway', half: true, mono: true, show: function (r) { return ['vlan', 'subnet'].indexOf(r.asset_type) >= 0; } },
    { k: 'source', label: 'Source of information', ph: 'e.g. Observed on switch label; IT spreadsheet 2026-11' },
    { k: 'building_id', label: 'Building', type: 'building', half: true, group: 'Location' },
    { k: 'floor_id', label: 'Floor', type: 'floor', half: true, group: 'Location' },
    { k: 'room_id', label: 'Room', type: 'room', half: true, group: 'Location' },
    { k: 'device_id', label: 'Inventoried device', type: 'device', half: true, group: 'Location' },
    { k: 'notes', label: 'Notes', type: 'textarea', rows: 2 }
  ];
  F.port = [
    { k: 'port', label: 'Port', req: true, half: true, mono: true, ph: 'e.g. 1/0/18' },
    { k: 'description', label: 'Port description', half: true, ph: 'As configured on the switch' },
    { k: 'mode', label: 'Mode', type: 'select', opts: S.PORT_MODES, half: true },
    { k: 'vlan', label: 'Access VLAN', half: true },
    { k: 'untagged_vlan', label: 'Untagged / native VLAN', half: true },
    { k: 'tagged_vlans', label: 'Tagged VLANs', half: true },
    { k: 'poe_status', label: 'PoE status', type: 'select', opts: S.POE_STATUS, half: true },
    { k: 'poe_class', label: 'PoE class', type: 'select', opts: S.POE_CLASSES, half: true },
    { k: 'link_speed', label: 'Link speed', half: true, ph: 'e.g. 1 Gbps' },
    { k: 'device_id', label: 'Connected device', type: 'device', half: true },
    { k: 'validation_status', label: 'Validation', type: 'select', opts: S.VALIDATION_STATUS },
    { k: 'notes', label: 'Notes', type: 'textarea', rows: 2 }
  ];
})();
