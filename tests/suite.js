/* In-browser test suite. Runs against the real application code and a real (separate) IndexedDB database.
 * Open tests/tests.html through the dev server (tools/serve.ps1). Generated ZIP / XLSX / PDF files are posted to the
 * dev server (/__save) so they can be validated independently on disk (tools/validate-outputs.ps1). */
(function () {
  'use strict';
  const EV = window.EV, U = EV.U, S = EV.S, store = EV.store, R = EV.rules, A = EV.act, X = EV.exporter;
  const tests = [], results = [];
  const test = function (name, fn) { tests.push({ name: name, fn: fn }); };
  const assert = function (c, msg) { if (!c) throw new Error(msg || 'assertion failed'); };
  const eq = function (a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || 'values differ') + ' — got ' + JSON.stringify(a) + ', expected ' + JSON.stringify(b)); };
  const wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  const saved = [];
  async function save(name, blob) {
    try { const res = await fetch('/__save?name=' + encodeURIComponent(name), { method: 'POST', body: blob }); if (res.ok) saved.push(name); return res.ok; } catch (e) { return false; }
  }
  function rawGet(storeName, id) {
    return new Promise(function (resolve, reject) {
      const rq = indexedDB.open(window.EV_DB_NAME);
      rq.onsuccess = function () { const db = rq.result; const g = db.transaction(storeName, 'readonly').objectStore(storeName).get(id); g.onsuccess = function () { resolve(g.result); db.close(); }; g.onerror = function () { reject(g.error); db.close(); }; };
      rq.onerror = function () { reject(rq.error); };
    });
  }
  function rawAll(storeName) {
    return new Promise(function (resolve, reject) {
      const rq = indexedDB.open(window.EV_DB_NAME);
      rq.onsuccess = function () {
        const db = rq.result; let g;
        try { g = db.transaction(storeName, 'readonly').objectStore(storeName).getAll(); } catch (e) { db.close(); reject(e); return; }
        g.onsuccess = function () { resolve(g.result); db.close(); }; g.onerror = function () { reject(g.error); db.close(); };
      };
      rq.onerror = function () { reject(rq.error); };
    });
  }
  function csvParse(text) {
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }
  async function unzip(blob) {
    const entries = await EV.zip.read(blob);
    const map = new Map();
    for (const e of entries) map.set(e.path, e);
    return map;
  }
  const dec = new TextDecoder();
  async function textOf(map, path) { return dec.decode(await map.get(path).read()); }
  const ctx = {};

  /* ------------------------------------------------------------------ schema and helpers */
  test('schema: every table parses and every reference targets a real table', function () {
    assert(S.TABLES.length >= 28, 'expected at least 28 tables, got ' + S.TABLES.length);
    S.TABLES.forEach(function (t) { S.T[t].columns.forEach(function (c) { if (c.ref) assert(S.T[c.ref], t + '.' + c.name + ' references unknown table ' + c.ref); }); });
    let n = 0; S.TEST_CATEGORIES.forEach(function (c) { n += S.TESTS[c].length; });
    eq(n, 52, 'functional test catalogue size');
    eq(S.NETWORK_CHECKS.length, 11, 'network validation checklist size');
    eq(S.DEVICE_CATEGORIES.length, 24); eq(S.PHOTO_CATEGORIES.length, 13); eq(S.BACKLOG_STATUSES.length, 12); eq(S.FINDING_CATEGORIES.length, 10); eq(S.ROOM_TYPES.length, 14);
  });
  test('validation helpers: IP and MAC formats', function () {
    assert(R.ipValid('192.0.2.21')); assert(!R.ipValid('192.0.2.256')); assert(!R.ipValid('192.0.2')); assert(R.ipValid('2001:db8::1'));
    eq(R.macFormat('00005e005321'), '00:00:5E:00:53:21'); eq(R.macFormat('00-00-5e'), '00:00:5E'); eq(R.macFormat('0000.5e00.5321'), '00:00:5E:00:53:21');
    assert(R.macValid('00:00:5E:00:53:21')); assert(!R.macValid('00:00:5E:00:53'));
    /* text that is not just an address is never turned into a different, well-formed address: it stays as typed and is flagged */
    eq(R.macFormat('MAC: 00:00:5E:00:53:21'), 'MAC: 00:00:5E:00:53:21'); assert(!R.macValid(R.macFormat('MAC: 00:00:5E:00:53:21')));
    eq(R.macFormat('00:00:5E:00:53:21:FF'), '00:00:5E:00:53:21:FF'); assert(!R.macValid(R.macFormat('00:00:5E:00:53:21:FF')));
    eq(R.macFormat(''), '');
  });
  test('csv: quoting, embedded newlines and formula-injection guard', function () {
    const out = EV.csv.encode([['a', 'b,c', 'say "hi"', 'line1\nline2', true, null, 12]], {});
    eq(out, 'a,"b,c","say ""hi""","line1\nline2",true,,12\r\n');
    eq(EV.csv.cell('=SUM(A1)', true), "'=SUM(A1)"); eq(EV.csv.cell('-5', true), '-5'); eq(EV.csv.cell('+1 212', true), "'+1 212");
    eq(csvParse(out)[0], ['a', 'b,c', 'say "hi"', 'line1\nline2', 'true', '', '12']);
  });

  /* ------------------------------------------------------------------ environment + persistence */
  test('create building, floor and rooms; records persist to IndexedDB', async function () {
    const b = store.create('buildings', { name: 'Test Tower', address: '1 Test Way', identifier: 'TT-1', floors_count: 2, site_contact: '', notes: '', archived: false });
    const f = store.create('floors', { building_id: b.id, number: '5', designation: 'Test floor', infrastructure_notes: '', audit_status_override: '', sort_order: 5, archived: false });
    const r1 = A.addRoom(f, { number: '5A', name: 'Test Room A', room_type: 'Medium conference room', capacity: 8 });
    const r2 = A.addRoom(f, { number: '5B', name: 'Test Room B', room_type: 'Boardroom', capacity: 16 });
    Object.assign(ctx, { b: b, f: f, r1: r1, r2: r2 });
    assert(/^AVEI-RM-\d{4}$/.test(r1.code), 'room code format ' + r1.code);
    assert(r1.code !== r2.code, 'room codes are unique');
    await store.flush();
    const raw = await rawGet('rooms', r1.id);
    assert(raw && raw.number === '5A', 'room read back from a separate IndexedDB connection');
    assert(store.save.lastSavedAt, 'save confirmation timestamp set after the transaction completed');
    eq(store.save.pending, 0, 'no pending writes');
    eq(R.floorProgress(f.id).notStarted, 2);
  });
  test('update is persisted and logged with field-level change history', async function () {
    store.update('rooms', ctx.r1.id, { capacity: 10 });
    await store.flush();
    eq((await rawGet('rooms', ctx.r1.id)).capacity, 10);
    const log = store.by('activity_log', 'entity_id', ctx.r1.id).find(function (a) { return (a.changes || []).some(function (c) { return c.f === 'capacity'; }); });
    assert(log && log.changes.some(function (c) { return c.f === 'capacity' && c.from === '8' && c.to === '10'; }), 'change history records capacity 8 → 10');
    eq(store.by('activity_log', 'entity_id', ctx.r1.id).length, 1, 'edits made while a new record is being filled in stay on its single “created” entry');
  });

  /* ------------------------------------------------------------------ audit workflow */
  test('start audit: 52 tests and 11 network checks created; resume returns the same audit', function () {
    const a = A.startAudit({ room: ctx.r1 });
    ctx.a1 = a;
    assert(/^AVEI-AU-\d{4}$/.test(a.code));
    eq(store.by('functional_tests', 'audit_id', a.id).length, 52);
    eq(store.by('network_checks', 'audit_id', a.id).length, 11);
    eq(A.resumeOrStart({ room: ctx.r1 }).id, a.id, 'resume returns the open audit');
    eq(R.roomState(ctx.r1.id).state, 'in_progress');
    const p = R.auditProgress(a.id);
    eq(p.tests.done, 0); assert(!p.canVerify, 'a new audit cannot be verified');
  });
  test('failed test suggests a finding; nothing is created until the auditor confirms', function () {
    const t = store.by('functional_tests', 'audit_id', ctx.a1.id).find(function (x) { return x.test_key === 'audio.aec_performance'; });
    A.setTest(t.id, 'fail');
    eq(store.get('functional_tests', t.id).suggestion_state, 'pending');
    eq(store.by('findings', 'audit_id', ctx.a1.id).length, 0, 'no finding before confirmation');
    eq(R.auditProgress(ctx.a1.id).tests.pendingSuggestion, 1);
    const f = A.confirmTestFinding(t.id);
    ctx.f1 = f; ctx.t1 = t;
    assert(/^AVEI-FN-\d{4}$/.test(f.code)); eq(f.category, 'Audio'); eq(f.status, 'open'); eq(f.classification, 'observed_fact');
    eq(store.get('functional_tests', t.id).finding_id, f.id);
    eq(store.all('backlog_items').length, 0, 'confirming a finding does not create a backlog item');
  });
  test('finding converts to backlog item AVEI-BL-001; a hypothesis never becomes a confirmed root cause', function () {
    store.update('findings', ctx.f1.id, { hypothesis: 'AEC reference may be wrong' });
    const b = A.promoteFinding(ctx.f1.id);
    ctx.bl1 = b;
    eq(b.code, 'AVEI-BL-001'); eq(b.status, 'New Discovery');
    eq(b.suspected_cause, 'AEC reference may be wrong'); eq(b.root_cause, ''); eq(b.root_cause_confidence, 'hypothesis');
    eq(store.get('findings', ctx.f1.id).status, 'linked');
  });
  test('duplicate detection: the same issue in another room links to the existing item and marks it systemic', function () {
    const a2 = A.startAudit({ room: ctx.r2 });
    ctx.a2 = a2;
    const t = store.by('functional_tests', 'audit_id', a2.id).find(function (x) { return x.test_key === 'audio.aec_performance'; });
    A.setTest(t.id, 'fail');
    const f2 = A.confirmTestFinding(t.id);
    const sims = R.similarBacklog(f2);
    assert(sims.length === 1 && sims[0].item.id === ctx.bl1.id, 'existing backlog item suggested');
    const b = A.promoteFinding(f2.id, ctx.bl1.id);
    eq(b.id, ctx.bl1.id); eq(store.all('backlog_items').length, 1, 'no duplicate backlog item');
    assert(store.get('backlog_items', ctx.bl1.id).systemic, 'item marked systemic');
    assert(R.insights().some(function (i) { return i.kind === 'systemic' && i.key === 'systemic:audio.aec_performance'; }), 'systemic insight raised');
  });

  /* ------------------------------------------------------------------ devices */
  test('device identification: IP, MAC and serial have independent states; missing fields are named exactly', function () {
    const d = A.addDevice({ room: ctx.r1, audit: ctx.a1 }, 'DSP');
    ctx.d1 = d;
    let r = R.device(store.get('devices', d.id));
    eq(r.missing, ['IP address', 'MAC address', 'Serial number']); assert(!r.identified);
    store.update('devices', d.id, { manufacturer: 'QSC', model: 'Core Nano', hostname: 'T-5A-DSP01', ip_address: '192.0.2.99', ip_status: 'awaiting_it' });
    r = R.device(store.get('devices', d.id));
    eq(r.missing, ['MAC address', 'Serial number']); eq(r.unverified, ['IP address']); eq(r.states.ip_address, 'recorded');
    store.update('devices', d.id, { serial_status: 'not_applicable' });
    eq(R.device(store.get('devices', d.id)).missing, ['MAC address']);
    eq(R.deviceStats().incomplete >= 1, true);
  });
  test('follow-up tasks are created for missing identification and close themselves when resolved', function () {
    R.reconcileFollowups();
    const open = R.deviceFollowups(ctx.d1.id);
    assert(open.some(function (f) { return f.kind === 'missing_mac' && /IP address \(192\.0\.2\.99\) is recorded/.test(f.detail); }), 'MAC verification follow-up mentions the recorded IP');
    assert(open.some(function (f) { return f.kind === 'unknown_port'; }), 'switch-port follow-up');
    assert(open.some(function (f) { return f.kind === 'firmware_undocumented'; }), 'firmware follow-up');
    assert(!open.some(function (f) { return f.kind === 'missing_ip'; }), 'no IP follow-up once an IP is recorded');
    store.update('devices', ctx.d1.id, { mac_address: '00:00:5E:00:53:99', mac_status: 'verified_onsite', ip_status: 'verified_onsite', switch_port: '1/0/1', firmware_version: '9.1' });
    R.reconcileFollowups();
    eq(R.deviceFollowups(ctx.d1.id).length, 0, 'follow-ups resolved');
    assert(R.device(store.get('devices', ctx.d1.id)).verified, 'device now fully verified');
  });
  test('conflicting values are reported, never auto-resolved', function () {
    const d2 = A.addDevice({ room: ctx.r2 }, 'Camera');
    store.update('devices', d2.id, { manufacturer: 'Sony', model: 'X', hostname: 'T-5B-CAM', ip_address: '192.0.2.99', ip_status: 'verified_onsite', mac_status: 'not_applicable', serial_status: 'not_applicable' });
    ctx.d2 = d2;
    assert(R.duplicates().some(function (g) { return g.field === 'ip_address' && g.devices.length === 2; }), 'duplicate IP detected');
    eq(store.get('devices', ctx.d1.id).ip_address, '192.0.2.99'); eq(store.get('devices', d2.id).ip_address, '192.0.2.99');
    store.update('devices', d2.id, { ip_address: '192.0.2.98' });
  });
  test('audit cannot be marked fully verified until mandatory information is complete', function () {
    let threw = false;
    try { A.verifyAudit(store.get('audits', ctx.a1.id)); } catch (e) { threw = true; }
    assert(threw, 'verify must be refused');
    eq(store.get('audits', ctx.a1.id).status, 'in_progress');
    store.update('rooms', ctx.r1.id, { conferencing_platform: 'Zoom Rooms', control_platform: 'Q-SYS', dsp_platform: 'Q-SYS', display_config: 'x', camera_config: 'x', microphone_config: 'x', scheduling_platform: 'None' });
    store.update('audits', ctx.a1.id, { operational_status: 'Fully operational' });
    S.TEST_CATEGORIES.forEach(function (c) { A.setTestsBulk(ctx.a1.id, c, 'pass'); });
    store.by('network_checks', 'audit_id', ctx.a1.id).forEach(function (c) { A.setCheck(c.id, 'verified'); });
    let p = R.auditProgress(ctx.a1.id);
    eq(p.tests.done, 52); eq(p.tests.fail, 1); eq(p.network.pct, 100);
    eq(p.blockers, ['No photographs captured'], 'only the photograph requirement remains');
  });
  test('priority guidance weighs several factors and stays advisory', function () {
    eq(R.suggestPriority({}).priority, null);
    eq(R.suggestPriority({ business_impact: 'High', frequency: 'Frequent (weekly or more)' }).priority, 'P1');
    eq(R.suggestPriority({ business_impact: 'High' }).priority, 'P2');
    eq(R.suggestPriority({ business_impact: 'Low', frequency: 'Rare', user_friction: 'Low' }).priority, 'P3');
    eq(R.suggestPriority({ safety_concern: true }).priority, 'P1');
    eq(store.get('backlog_items', ctx.bl1.id).priority, '', 'priority is never set automatically');
  });

  /* ------------------------------------------------------------------ photographs */
  test('photograph: stored with original bytes, thumbnail, links; rotate keeps the original; revert works', async function () {
    const blob = await EV.photos.demoBlob('Test photo', 'unit test', 200);
    const file = new File([blob], 'IMG_0001.jpg', { type: 'image/jpeg' });
    const p = await EV.photos.add(file, { audit: store.get('audits', ctx.a1.id), room: ctx.r1, device_id: ctx.d1.id, category: 'Equipment labels', description: 'label' });
    ctx.p1 = p;
    assert(/^AVEI-PH-\d{5}$/.test(p.code)); eq(p.audit_id, ctx.a1.id); eq(p.room_id, ctx.r1.id); eq(p.device_id, ctx.d1.id); eq(p.floor_id, ctx.f.id); eq(p.building_id, ctx.b.id);
    assert(p.thumb.indexOf('data:image/jpeg') === 0, 'thumbnail created'); eq(p.width, 1280); eq(p.size_bytes, blob.size);
    const stored = await store.blobGet(p.id);
    eq(stored.data.byteLength, blob.size, 'original bytes stored unmodified');
    await EV.photos.rotate(store.get('photos', p.id));
    assert(store.get('photos', p.id).has_edit, 'edited rendition flagged');
    eq((await store.blobGet(p.id)).data.byteLength, blob.size, 'original untouched after rotation');
    assert(await store.blobGet(p.id + ':edit'), 'edited rendition stored separately');
    await EV.photos.revert(store.get('photos', p.id));
    assert(!store.get('photos', p.id).has_edit); assert(!(await store.blobGet(p.id + ':edit')));
    eq(R.auditProgress(ctx.a1.id).photos, 1);
    assert(R.auditProgress(ctx.a1.id).canVerify, 'audit can now be verified');
    A.verifyAudit(store.get('audits', ctx.a1.id));
    eq(store.get('audits', ctx.a1.id).status, 'verified'); eq(R.roomState(ctx.r1.id).state, 'verified');
    assert(store.get('audits', ctx.a1.id).summary_snapshot.progress.tests_total === 52, 'summary snapshot stored');
  });

  /* ------------------------------------------------------------------ file engines */
  test('zip: write and read back, stored and deflated entries, UTF-8 names', async function () {
    const z = EV.zip.create();
    const text = 'hello,world\r\n'.repeat(500);
    await z.add('data/a.csv', text);
    await z.add('photographs/Étage 5/x.bin', new Uint8Array([1, 2, 3, 250, 251]), { compress: false });
    const map = await unzip(z.finish());
    eq(await textOf(map, 'data/a.csv'), text);
    eq(Array.from(await map.get('photographs/Étage 5/x.bin').read()), [1, 2, 3, 250, 251]);
    eq(EV.zip.crc32(new TextEncoder().encode('123456789')), 0xCBF43926, 'CRC-32 check value');
  });
  test('xlsx: workbook parts are present and well-formed XML', async function () {
    const blob = await EV.xlsx.build({ title: 't', sheets: [
      { name: 'Dash', grid: true, widths: [20, 20], rows: [{ cells: [{ c: 0, v: 'Total', s: 5 }, { c: 1, f: "COUNTA('Data & More'!$A:$A)-1", s: 6 }] }] },
      { name: 'Data & More', table: 'tblData', columns: [{ header: 'ID', width: 10 }, { header: 'Priority', list: ['P1', 'P2', 'P3'], cond: [{ eq: 'P1', dxf: 0 }] }, { header: 'Note <&>', wrap: true }], rows: [['a', 'P1', 'x & y < z'], ['b', 'P2', 'line1\nline2']] },
      { name: 'Empty', table: 'tblEmpty', columns: [{ header: 'A' }, { header: 'B' }], rows: [] }] });
    const map = await unzip(blob);
    ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/sharedStrings.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet3.xml', 'xl/worksheets/sheet4.xml',
      'xl/tables/table1.xml', 'xl/tables/table2.xml', 'xl/worksheets/_rels/sheet2.xml.rels'].forEach(function (p) { assert(map.has(p), 'missing part ' + p); });
    for (const k of map.keys()) {
      const doc = new DOMParser().parseFromString(await textOf(map, k), 'application/xml');
      assert(!doc.getElementsByTagName('parsererror').length, 'XML not well-formed: ' + k);
    }
    const s2 = await textOf(map, 'xl/worksheets/sheet2.xml');
    assert(s2.indexOf('state="frozen"') > 0, 'frozen header'); assert(s2.indexOf('<dataValidation ') > 0, 'dropdown'); assert(s2.indexOf('<conditionalFormatting') > 0, 'conditional formatting');
    assert((await textOf(map, 'xl/tables/table2.xml')).indexOf('ref="A1:B2"') > 0, 'empty table keeps one blank row');
    ctx.xlsxSample = blob;
  });
  test('pdf: structure is valid (header, xref offsets, trailer) and embeds a JPEG', async function () {
    const doc = EV.pdf.create({ title: 'T' });
    doc.page(); doc.text('Hello — “quoted” • bullet', 50, 60, { size: 12 }); doc.rect(50, 80, 100, 20, { fill: [240, 240, 240], stroke: [0, 0, 0] });
    const j = await EV.photos.jpegFor(store.get('photos', ctx.p1.id), 400);
    doc.image(j.bytes, j.width, j.height, 50, 120, 200, 150);
    eq(doc.wrap('aaa bbb ccc', 'regular', 10, 30).length >= 2, true);
    const bytes = new Uint8Array(await doc.finish().arrayBuffer());
    const s = Array.from(bytes.subarray(0, 8)).map(function (c) { return String.fromCharCode(c); }).join('');
    eq(s, '%PDF-1.4');
    let tail = ''; for (let i = bytes.length - 200; i < bytes.length; i++) tail += String.fromCharCode(bytes[i]);
    const xrefPos = parseInt(/startxref\n(\d+)\n%%EOF/.exec(tail)[1], 10);
    let head = ''; for (let i = xrefPos; i < Math.min(bytes.length, xrefPos + 2000); i++) head += String.fromCharCode(bytes[i]);
    assert(head.indexOf('xref\n0 ') === 0, 'startxref points at the xref table');
    const lines = head.split('\n'); const count = parseInt(lines[1].split(' ')[1], 10);
    for (let i = 1; i < count; i++) {
      const off = parseInt(lines[2 + i].slice(0, 10), 10);
      let at = ''; for (let k = off; k < off + 12; k++) at += String.fromCharCode(bytes[k]);
      assert(at.indexOf(i + ' 0 obj') === 0, 'xref entry ' + i + ' points at its object (found "' + at + '")');
    }
  });

  /* ------------------------------------------------------------------ demo data, reports, exports */
  test('demo environment loads, is labelled DEMO and uses documentation-reserved identifiers only', async function () {
    eq(await EV.seed.load(), true);
    const demoRooms = store.all('rooms').filter(function (r) { return r.is_demo; });
    eq(demoRooms.length, 8);
    eq(store.all('buildings').find(function (b) { return b.is_demo; }).name, '1 Demonstration Plaza');
    eq(U.uniq(store.all('floors').filter(function (f) { return f.is_demo; }).map(function (f) { return f.number; })).sort(), ['21', '22', '23']);
    store.all('devices').filter(function (d) { return d.is_demo; }).forEach(function (d) {
      if (d.ip_address) assert(/^(192\.0\.2\.|198\.51\.100\.)/.test(d.ip_address), 'demo IP not from a documentation range: ' + d.ip_address);
      if (d.mac_address) assert(/^00:00:5E:00:53:/.test(d.mac_address), 'demo MAC not from the documentation range: ' + d.mac_address);
      if (d.serial_number) assert(/^DEMO-/.test(d.serial_number), 'demo serial not labelled: ' + d.serial_number);
    });
    assert(store.all('devices').some(function (d) { return d.is_demo && !R.device(d).identified; }), 'demo includes incomplete devices');
    eq(store.all('photos').filter(function (p) { return p.is_demo; }).length, 8, 'demo photographs');
    eq(await EV.seed.load(), false, 'seed is idempotent');
  });
  test('dashboard metrics are computed from records', function () {
    const m = R.metrics();
    eq(m.spaces, store.all('rooms').filter(function (r) { return !r.archived; }).length);
    eq(m.devices, store.all('devices').filter(function (d) { return !d.archived; }).length);
    const before = m.devicesIncomplete;
    const d = A.addDevice({ room: ctx.r2 }, 'Display');
    eq(R.metrics().devicesIncomplete, before + 1, 'metric follows the data');
    store.update('devices', d.id, { manufacturer: 'LG', model: 'Y', ip_status: 'not_applicable', mac_status: 'not_applicable', serial_status: 'not_applicable', connection_type: 'Not networked' });
    eq(R.metrics().devicesIncomplete, before);
    assert(R.alerts().length >= 5, 'priority alerts derived');
    assert(R.spareCoverage().length >= 1, 'critical rooms without spares flagged');
  });
  test('all eleven reports build and export to PDF, CSV and Excel', async function () {
    const demoB = store.all('buildings').find(function (b) { return b.is_demo; });
    const f22 = store.all('floors').find(function (f) { return f.is_demo && f.number === '22'; });
    const a22B = store.all('audits').find(function (a) { return a.is_demo && (store.get('rooms', a.room_id) || {}).number === '22B'; });
    const scope = { executive: { building: demoB.id }, environment: {}, building: { building: demoB.id }, floor: { floor: f22.id }, room: { audit: a22B.id }, devices: {}, network: {}, tests: {}, backlog: {}, coordination: {}, spares: {} };
    eq(EV.reports.TYPES.length, 11);
    for (const t of EV.reports.TYPES) {
      const rep = EV.reports.build(t.id, scope[t.id]);
      assert(rep.blocks.length > 0, t.id + ' has content'); assert(rep.demo, t.id + ' flagged as containing demo data');
      const pdf = await EV.reports.pdf(rep); assert(pdf.size > 1500, t.id + ' PDF size');
      const csv = EV.reports.csv(rep); assert(csv.length > 20, t.id + ' CSV');
      const xl = await EV.reports.xlsx(rep); assert(xl.size > 2000, t.id + ' XLSX size');
      assert(EV.reports.view(rep).tag === 'article', t.id + ' preview renders');
      if (t.id === 'room' || t.id === 'executive' || t.id === 'backlog') { await save('report_' + t.id + '.pdf', pdf); await save('report_' + t.id + '.xlsx', xl); }
    }
  });
  test('master workbook: fifteen tabs with tables, dashboard formulas, dropdowns and conditional formatting', async function () {
    const blob = await EV.handoff.masterWorkbook();
    const map = await unzip(blob);
    const wb = await textOf(map, 'xl/workbook.xml');
    ['Executive Dashboard', 'Buildings &amp; Floors', 'Room Register', 'Room Audit History', 'Device Inventory', 'Network Asset Register', 'Functional Test Results', 'Findings', 'Improvement Backlog', 'IT Coordination',
      'Infrastructure Dependencies', 'Spare Equipment', 'Photo Index', 'Data Quality &amp; Exceptions', 'Change History'].forEach(function (n) { assert(wb.indexOf('name="' + n + '"') > 0, 'tab missing: ' + n); });
    let tables = 0; for (const k of map.keys()) if (/^xl\/tables\//.test(k)) tables++;
    eq(tables, 14, 'one Excel table per data tab');
    const dash = await textOf(map, 'xl/worksheets/sheet1.xml');
    assert((dash.match(/<f>/g) || []).length >= 35, 'dashboard is formula-driven');
    let dropdowns = 0, conditional = 0, frozen = 0;
    for (const k of map.keys()) {
      const xml = await textOf(map, k);
      const doc = new DOMParser().parseFromString(xml, 'application/xml'); assert(!doc.getElementsByTagName('parsererror').length, 'XML not well-formed: ' + k);
      if (/^xl\/worksheets\/sheet\d+\.xml$/.test(k)) { if (xml.indexOf('<dataValidation ') > 0) dropdowns++; if (xml.indexOf('<conditionalFormatting') > 0) conditional++; if (xml.indexOf('state="frozen"') > 0) frozen++; }
    }
    assert(dropdowns >= 5 && conditional >= 5 && frozen >= 14, 'data tabs carry dropdown lists (' + dropdowns + '), conditional formatting (' + conditional + ') and frozen header rows (' + frozen + ')');
    await save('master_workbook.xlsx', blob);
  });
  test('daily export (full): every file present, IDs and relationships valid, counts match the manifest', async function () {
    const pkg = await X.build({ mode: 'full', photoMode: 'original' });
    ctx.pkg1 = pkg;
    const map = await unzip(pkg.blob);
    ['audit_manifest.json', 'buildings.csv', 'floors.csv', 'rooms.csv', 'room_audits.csv', 'devices.csv', 'functional_tests.csv', 'findings.csv', 'backlog.csv', 'it_coordination.csv', 'infrastructure.csv', 'spare_inventory.csv', 'audit_notes.csv',
      'activity_log.csv', 'claude_analysis_instructions.md', 'photo_index.csv', 'validation_report.json', 'data_dictionary.md', 'end_of_day_summary.md'].forEach(function (f) { assert(map.has(f), 'package is missing ' + f); });
    const m = JSON.parse(await textOf(map, 'audit_manifest.json'));
    eq(m.export_id, pkg.code); assert(/^AVEI-EXP-\d{8}-\d{2}$/.test(m.export_id)); assert(m.contains_demo_data === true);
    assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(m.generated_at), 'ISO 8601 timestamp');
    const ids = {};
    for (const f of m.files) {
      if (!f.columns) continue;
      const rows = csvParse(await textOf(map, f.path));
      eq(rows[0], f.columns, f.path + ' header matches the manifest');
      eq(rows.length - 1, f.record_count, f.path + ' row count matches the manifest');
      const idCol = rows[0].indexOf('id'), stCol = rows[0].indexOf('record_status');
      ids[f.path] = new Set();
      rows.slice(1).forEach(function (r) { assert(r[idCol], f.path + ' row without id'); assert(!ids[f.path].has(r[idCol]), f.path + ' duplicate id'); ids[f.path].add(r[idCol]); eq(r[stCol], 'new', f.path + ' first export marks every record new'); });
    }
    for (const f of m.files) {
      if (!f.columns) continue;
      const rows = csvParse(await textOf(map, f.path));
      f.foreign_keys.forEach(function (fk) {
        const c = rows[0].indexOf(fk.column), target = fk.references.split(':')[0];
        rows.slice(1).forEach(function (r) { if (r[c]) assert(ids[target] && ids[target].has(r[c]), f.path + '.' + fk.column + ' → ' + target + ' does not resolve: ' + r[c]); });
      });
    }
    const photos = csvParse(await textOf(map, 'photo_index.csv'));
    const pc = photos[0].indexOf('file_path');
    photos.slice(1).forEach(function (r) { assert(r[pc] && map.has(r[pc]), 'photograph file missing from package: ' + r[pc]); assert(/^photographs\/[^/]+\/Floor_[^/]+\/[^/]+\/[^/]+\/AVEI-PH-/.test(r[pc]), 'photo path layout ' + r[pc]); });
    eq(m.photographs.files_written, photos.length - 1);
    const orig = await store.blobGet(ctx.p1.id);
    const exported = await map.get(photos.slice(1).find(function (r) { return r[0] === ctx.p1.id; })[pc]).read();
    eq(exported.length, orig.data.byteLength, 'photograph exported at original quality, byte for byte');
    const val = JSON.parse(await textOf(map, 'validation_report.json'));
    eq(val.structural_errors, 0, 'no structural errors'); assert(val.checks.length >= 9);
    assert(val.checks.find(function (c) { return /Device identification/.test(c.name); }).count > 0, 'incomplete devices are reported, not blocked');
    const instr = await textOf(map, 'claude_analysis_instructions.md');
    assert(/Never overwrite verified information with unverified information/.test(instr)); assert(instr.indexOf(m.export_id) > 0);
    assert(JSON.stringify(m).indexOf('data:image') < 0, 'no images embedded in the manifest');
    await save('daily_export_full.zip', pkg.blob);
  });
  /* hand a package over the way the export screen does, with the browser download replaced by a stub */
  async function deliver(pkg, ok) {
    const orig = EV.saveFile;
    EV.saveFile = async function () { return ok === false ? { ok: false, via: 'download', message: 'cancelled' } : { ok: true, via: 'download' }; };
    try { return await X.deliver(pkg, false); } finally { EV.saveFile = orig; }
  }
  test('delivery ledger: record_status is decided row by row; only a delivered package counts; a derived change is “updated”', async function () {
    eq(Object.keys(X.ledger()).length, 0, 'a package that was built but not delivered leaves the ledger empty');
    eq(store.get('exports', ctx.pkg1.id).status, 'generated');
    eq((await deliver(ctx.pkg1, false)).ok, false); eq(store.get('exports', ctx.pkg1.id).status, 'generated', 'a failed save delivers nothing');
    assert((await deliver(ctx.pkg1)).ok); eq(store.get('exports', ctx.pkg1.id).status, 'success'); eq(X.lastExport().id, ctx.pkg1.id);
    assert(X.canVoid(ctx.pkg1.id), 'the latest delivery can be voided');
    await wait(15);
    const d = store.all('devices').find(function (x) { return x.hostname === 'DEMO-22B-TSC01'; });
    store.update('devices', d.id, { ip_address: '192.0.2.23', ip_status: 'verified_onsite' });
    const nd = A.addDevice({ room: ctx.r2 }, 'UPS');
    ctx.nd = nd;
    R.reconcileFollowups();
    const pkg = await X.build({ mode: 'since', photoMode: 'none' });
    const map = await unzip(pkg.blob);
    const m = JSON.parse(await textOf(map, 'audit_manifest.json'));
    eq(m.baseline.previous_export_id, ctx.pkg1.code); eq(m.baseline.method, 'delivery_ledger');
    const rows = csvParse(await textOf(map, 'devices.csv'));
    const idc = rows[0].indexOf('id'), sc = rows[0].indexOf('record_status'), inc = rows[0].indexOf('is_incomplete');
    const byId = {}; rows.slice(1).forEach(function (r) { byId[r[idc]] = r; });
    eq(byId[d.id][sc], 'updated'); eq(byId[nd.id][sc], 'new'); eq(byId[nd.id][inc], 'true');
    assert(rows.length - 1 < store.all('devices').length, 'incremental package is smaller than the inventory');
    const rooms = csvParse(await textOf(map, 'rooms.csv'));
    const rid = rooms[0].indexOf('id'), rst = rooms[0].indexOf('record_status');
    const roomSt = {}; rooms.slice(1).forEach(function (r) { roomSt[r[rid]] = r[rst]; });
    eq(roomSt[d.room_id], 'unchanged', 'the room of an edited device is included as an unchanged reference');
    eq(roomSt[ctx.r2.id], 'updated', 'a room whose derived device_count changed is “updated” although the room record itself was not edited');
    eq(JSON.parse(await textOf(map, 'validation_report.json')).structural_errors, 0);
    eq(m.photographs.included, false);
    eq(store.get('exports', pkg.id).status, 'generated');
    const col = X.collect(X.resolveScope({ mode: 'since' }));
    assert(col.tables.devices.some(function (x) { return x.id === nd.id; }) && col.status(store.get('devices', nd.id)) === 'new', 'a package that was built but not saved delivers nothing');
  });
  test('a partial export never hides other changes; the latest delivery can be voided exactly; deletions are reported once', async function () {
    const f22 = store.all('floors').find(function (f) { return f.is_demo && f.number === '22'; });
    const d = store.all('devices').find(function (x) { return x.hostname === 'DEMO-22B-TSC01'; });
    const pending = function (table, id) { const c = X.collect(X.resolveScope({ mode: 'since' })); return c.tables[table].some(function (x) { return x.id === id; }) ? c.status(store.getAny(table, id)) : null; };
    /* 1 — a package limited to floor 22 is delivered */
    const part = await X.build({ mode: 'full', floor_id: f22.id, photoMode: 'none' });
    assert((await deliver(part)).ok);
    eq(pending('devices', d.id), null, 'the floor-22 device was delivered and is no longer pending');
    eq(pending('devices', ctx.nd.id), 'new', 'a device on another floor is still pending after a floor-limited export');
    const demoPhoto = store.all('photos').find(function (p) { return p.is_demo && p.floor_id === f22.id; });
    eq(pending('photos', demoPhoto.id), null, 'an index-only package does not take back an image that was already delivered');
    /* 2 — void */
    assert(X.canVoid(part.id) && !X.canVoid(ctx.pkg1.id), 'only the most recent delivery can be voided');
    let threw = false; try { X.voidExport(ctx.pkg1.id); } catch (e) { threw = true; }
    assert(threw, 'voiding an older export is refused');
    X.voidExport(part.id);
    eq(store.get('exports', part.id).status, 'void');
    eq(pending('devices', d.id), 'updated', 'after the void the floor-22 change is pending again, exactly as before');
    /* 3 — everything pending is delivered; then nothing is pending */
    const all = await X.build({ mode: 'since', photoMode: 'none' });
    eq(all.summary.devices_documented, 2);
    assert((await deliver(all)).ok);
    const none = await X.build({ mode: 'since', photoMode: 'none' });
    eq(none.summary.devices_documented, 0, 'a second export with no changes carries no device changes');
    const dc = none.manifest.files.find(function (f) { return f.path === 'devices.csv'; }).status_counts;
    eq(dc['new'] + dc.updated + dc.deleted, 0);
    /* 4 — a photograph delivered as an index row only stays pending until a package carries its image */
    const blob = await EV.photos.demoBlob('Ledger photo', 'unit test', 200);
    const ph = await EV.photos.add(new File([blob], 'IMG_0002.jpg', { type: 'image/jpeg' }), { audit: store.get('audits', ctx.a1.id), room: ctx.r1, category: 'Other', description: 'ledger' });
    assert((await deliver(await X.build({ mode: 'since', photoMode: 'none' }))).ok);
    eq(pending('photos', ph.id), 'updated', 'index-only delivery leaves the image pending');
    const withImg = await X.build({ mode: 'since', photoMode: 'original' });
    const wm = await unzip(withImg.blob);
    const prow = csvParse(await textOf(wm, 'photo_index.csv'));
    const pr = prow.slice(1).find(function (r) { return r[0] === ph.id; });
    assert(pr && wm.has(pr[prow[0].indexOf('file_path')]), 'the image is packaged by the next export that includes images');
    assert((await deliver(withImg)).ok);
    eq(pending('photos', ph.id), null, 'once its image has been delivered the photograph is no longer pending');
    /* 5 — deletions */
    store.remove('devices', ctx.nd.id);
    R.reconcileFollowups();
    eq(pending('devices', ctx.nd.id), 'deleted');
    assert((await deliver(await X.build({ mode: 'since', photoMode: 'none' }))).ok);
    eq(pending('devices', ctx.nd.id), null, 'a deletion is reported once');
    const ghost = A.addDevice({ room: ctx.r2 }, 'UPS');
    store.remove('devices', ghost.id);
    assert(!X.collect(X.resolveScope({ mode: 'full' })).tables.devices.some(function (x) { return x.id === ghost.id; }), 'a record created and deleted between exports never appears');
    /* 6 — repeat */
    const re = await X.build({ reexportOf: ctx.pkg1.id, photoMode: 'none' });
    eq(re.manifest.scope.is_reexport, true); eq(re.manifest.scope.mode, 'full');
    eq(store.all('exports').filter(function (e) { return e.status === 'success'; }).length, 5, 'only delivered exports count');
  });
  test('a voided package that is saved after all is delivered after all', async function () {
    const pkg = await X.build({ mode: 'since', photoMode: 'none' });
    assert((await deliver(pkg)).ok); eq(store.get('exports', pkg.id).status, 'success');
    X.voidExport(pkg.id); eq(store.get('exports', pkg.id).status, 'void'); assert(!X.canVoid(pkg.id));
    assert((await deliver(pkg)).ok);
    eq(store.get('exports', pkg.id).status, 'success', 'saving it again commits it');
    assert(X.canVoid(pkg.id), 'and it is the latest delivery again');
  });
  test('export summary counts the audits that were worked on, not the ones whose derived figures merely moved', async function () {
    assert((await deliver(await X.build({ mode: 'since', photoMode: 'none' }))).ok);
    const quiet = await X.build({ mode: 'since', photoMode: 'none' });
    eq([quiet.summary.rooms_audited, quiet.summary.tests_completed, quiet.summary.audit_dates], [0, 0, []], 'nothing pending: nothing was audited');
    /* a room is renamed later: its audit, tests and checks are delivered again (they carry the room name) — but no audit took place */
    await wait(5);
    const name = store.get('rooms', ctx.r2.id).name;
    store.update('rooms', ctx.r2.id, { name: name + ' (renamed)' });
    const renamed = await X.build({ mode: 'since', photoMode: 'none' });
    const counts = function (pkg, path) { return pkg.manifest.files.find(function (f) { return f.path === path; }).status_counts; };
    assert(counts(renamed, 'room_audits.csv').updated + counts(renamed, 'functional_tests.csv').updated >= 1, 'rows that show the room name are delivered as updated');
    eq([renamed.summary.rooms_audited, renamed.summary.audits_completed, renamed.summary.tests_completed, renamed.summary.audit_dates], [0, 0, 0, []], 'a rename is not an audit');
    /* a device of an audited room is identified later: the audit row is re-signed (its device figures moved) — still not an audit */
    const dv = A.addDevice({ room: ctx.r2 }, 'Display');
    store.update('devices', dv.id, { manufacturer: 'Demo', model: 'Panel', ip_status: 'not_applicable', mac_status: 'not_applicable', serial_status: 'not_applicable', connection_type: 'Not networked' });
    const later = await X.build({ mode: 'since', photoMode: 'none' });
    eq([later.summary.rooms_audited, later.summary.devices_new], [0, 1], 'documenting a device afterwards is reported as a device, not as a room audited');
    /* the audit itself is completed: that is work on the audit, even though no test result changed */
    A.completeAudit(store.get('audits', ctx.a2.id));
    const done = await X.build({ mode: 'since', photoMode: 'none' });
    eq([done.summary.rooms_audited, done.summary.audits_completed, done.summary.audit_dates.length], [1, 1, 1], 'completing an audit counts');
    const today = await X.build({ mode: 'today', photoMode: 'none' });
    assert(today.summary.rooms_audited >= 1 && today.summary.audits_completed >= 1, 'and it is in the current-day export');
    /* a package with no demo rows is not labelled demo and takes no figure from the demo environment */
    const mine = await X.build({ mode: 'full', floor_id: ctx.f.id, photoMode: 'none' });
    eq(mine.manifest.contains_demo_data, false, 'a package limited to a real floor is not declared demo data');
    const realOpen = store.all('it_requests').filter(function (x) { return !x.is_demo && x.requested_from === 'Client IT' && S.IT_CLOSED.indexOf(x.status) < 0; }).length;
    eq(mine.summary.pending_it_dependencies, realOpen, 'outstanding requests exclude the demo requests');
    assert(store.all('it_requests').some(function (x) { return x.is_demo && x.requested_from === 'Client IT' && S.IT_CLOSED.indexOf(x.status) < 0; }), '(the demo does hold open requests)');
    assert(!/2[123][A-D]\b/.test(mine.manifest.end_of_day.next_visit_priorities.join(' ')), 'priorities do not name demo rooms: ' + mine.manifest.end_of_day.next_visit_priorities.join(' | '));
    assert(EV.reports.build('executive', { building: ctx.b.id }).demo, 'a report with device-wide sections stays labelled while demo data is on the device');
    assert(!EV.reports.build('floor', { floor: ctx.f.id }).demo, 'a report limited to a real floor is not labelled demo');
    A.reopenAudit(store.get('audits', ctx.a2.id));
    store.update('rooms', ctx.r2.id, { name: name });
    store.update('devices', dv.id, { archived: true });
    assert((await deliver(await X.build({ mode: 'since', photoMode: 'none' }))).ok);
  });
  test('discarding a new record takes its dependants with it; nothing is left pointing at a missing record', async function () {
    const before = {}; S.TABLES.forEach(function (t) { before[t] = store.raw(t).length; });
    const dangling = function () {
      const out = [];
      S.TABLES.forEach(function (t) { S.T[t].columns.forEach(function (c) { if (!c.ref) return; store.raw(t).forEach(function (r) { if (r[c.name] && !store.getAny(c.ref, r[c.name])) out.push(t + '.' + c.name); }); }); });
      return out;
    };
    eq(dangling(), [], 'no dangling reference before');
    /* a new device with follow-up tasks, a port mapping, a dependency and a photograph, then Discard */
    const dev = A.addDevice({ room: ctx.r1, audit: store.get('audits', ctx.a1.id) }, 'Camera');
    R.reconcileFollowups();
    assert(store.by('followups', 'device_id', dev.id).length >= 3, 'follow-up tasks were created for the new device');
    const sw = store.all('infra_assets').find(function (a) { return a.asset_type === 'switch'; });
    store.update('devices', dev.id, { switch_asset_id: sw.id, switch_port: '9/9/9' }); A.syncDevicePort(store.get('devices', dev.id));
    const port = store.by('switch_ports', 'device_id', dev.id)[0];
    assert(port, 'port row created');
    const link = store.create('network_links', { kind: 'dependency', from_type: 'device', from_id: dev.id, to_type: 'infra_asset', to_id: sw.id, dep_type: 'DHCP', description: '', status: 'unknown', notes: '' });
    const pb = await EV.photos.demoBlob('Draft', 'discard', 120);
    const onlyDevice = await EV.photos.add(new File([pb], 'a.jpg', { type: 'image/jpeg' }), { device_id: dev.id, category: 'Equipment labels' });
    const inAudit = await EV.photos.add(new File([pb], 'b.jpg', { type: 'image/jpeg' }), { audit: store.get('audits', ctx.a1.id), room: ctx.r1, device_id: dev.id, category: 'Equipment labels' });
    const plan = A.discard('devices', dev.id);
    assert(!store.getAny('devices', dev.id), 'device removed');
    eq(store.raw('followups').filter(function (f) { return f.device_id === dev.id; }).length, 0, 'its follow-up tasks went with it');
    assert(!store.getAny('network_links', link.id), 'its network relationship went with it');
    eq(store.get('switch_ports', port.id).device_id, null, 'the port row is kept and no longer names the device');
    assert(store.get('photos', inAudit.id) && store.get('photos', inAudit.id).device_id === null, 'a photograph that also belongs to the audit is kept, without the device link');
    assert(!store.getAny('photos', onlyDevice.id) && !(await store.blobGet(onlyDevice.id)), 'a photograph that belonged only to the device is removed with its image');
    assert(plan.remove.length >= 5);
    eq(dangling(), [], 'no dangling reference after discarding a device');
    /* a new finding confirmed from a failed test, then Discard: the suggestion is pending again */
    const t = store.by('functional_tests', 'audit_id', ctx.a2.id).find(function (x) { return x.test_key === 'video.display_power'; }) || store.by('functional_tests', 'audit_id', ctx.a2.id).find(function (x) { return !x.finding_id; });
    A.setTest(t.id, 'fail');
    const f = A.confirmTestFinding(t.id);
    A.discard('findings', f.id);
    eq([store.get('functional_tests', t.id).finding_id, store.get('functional_tests', t.id).suggestion_state], [null, 'pending']);
    /* a new request opened from a backlog item, then Discard: the link goes too */
    const rq = A.createRequest({ topic: '' }); A.linkRequest(ctx.bl1.id, rq.id);
    A.discard('it_requests', rq.id);
    eq(store.raw('backlog_it_links').filter(function (l) { return l.it_request_id === rq.id; }).length, 0);
    /* a new combined configuration with members, then Discard */
    const cfg = store.create('room_configurations', { building_id: ctx.b.id, floor_id: ctx.f.id, name: '', description: '', capacity: null, notes: '', archived: false });
    store.create('room_configuration_members', { id: U.keyId('config-member', cfg.id + ':' + ctx.r1.id), configuration_id: cfg.id, room_id: ctx.r1.id });
    A.discard('room_configurations', cfg.id);
    eq(store.raw('room_configuration_members').filter(function (x) { return x.configuration_id === cfg.id; }).length, 0);
    eq(dangling(), [], 'no dangling reference after any discard');
    const val = X.validate(X.collect(X.resolveScope({ mode: 'full' })), null, null);
    eq(val.structural_errors, 0, 'export validation has no structural error');
    A.setTest(t.id, 'pass');
    /* a reference to a record that no longer exists is an exception to report, never a reason to block the export */
    const orphan = store.create('followups', { kind: 'missing_ip', device_id: U.uid(), room_id: null, title: 'orphan', detail: '', suggested_party: '', status: 'resolved', resolved_at: U.now(), it_request_id: null, dedupe_key: 'dev:x:ip' });
    const val2 = X.validate(X.collect(X.resolveScope({ mode: 'full' })), null, null);
    eq(val2.structural_errors, 0); eq(val2.checks.find(function (c) { return /no longer exists/.test(c.name); }).count, 1);
    store.purge('followups', orphan.id);
  });
  test('export scope filters: floor and room selection', async function () {
    const f22 = store.all('floors').find(function (f) { return f.is_demo && f.number === '22'; });
    const col = X.collect(X.resolveScope({ mode: 'full', floor_id: f22.id }));
    assert(col.tables.rooms.every(function (r) { return r.floor_id === f22.id; }), 'only floor 22 rooms');
    assert(col.tables.devices.length > 0 && col.tables.devices.every(function (d) { return d.floor_id === f22.id; }));
    const r22B = store.all('rooms').find(function (r) { return r.is_demo && r.number === '22B'; });
    const col2 = X.collect(X.resolveScope({ mode: 'full', room_ids: [r22B.id] }));
    eq(col2.tables.audits.filter(function (a) { return a.room_id === r22B.id; }).length, 1, 'the selected room\'s audit is included');
    const own = col2.tables.audits.find(function (a) { return a.room_id === r22B.id; });
    eq(col2.tables.functional_tests.filter(function (t) { return t.audit_id === own.id; }).length, 52, 'the selected room\'s audit is exported in full');
    const refd = new Set(col2.tables.findings.map(function (f) { return f.test_id; }));
    assert(col2.tables.functional_tests.every(function (t) { return t.audit_id === own.id || refd.has(t.id); }), 'any other test row is present only because a finding in the package references it');
    assert(col2.tables.functional_tests.length < 60, 'other audits are not expanded');
    eq(X.validate(col2, null, null).structural_errors, 0, 'filtered package keeps valid relationships');
    /* date range: what was created or changed between two dates, and an audit dated in the range with everything that belongs to it */
    const day = U.localDate(new Date());
    const rng = X.collect(X.resolveScope({ mode: 'range', from: day, to: day }));
    assert(rng.tables.audits.length > 0 && rng.tables.functional_tests.length >= 52, 'today\'s range holds today\'s audits with their tests');
    eq(X.validate(rng, null, null).structural_errors, 0, 'a date-range package keeps valid relationships');
    const empty = X.collect(X.resolveScope({ mode: 'range', from: '2020-01-01', to: '2020-01-02' }));
    eq(U.sum(Object.keys(empty.tables), function (t) { return empty.tables[t].length; }), 0, 'a range in which nothing happened is empty');
    let needsStart = false; try { X.resolveScope({ mode: 'range' }); } catch (e) { needsStart = /start date/.test(e.message); }
    assert(needsStart, 'a date range needs a start date');
  });
  test('handoff documents are generated', function () {
    const p = EV.handoff.projectInstructions();
    assert(/AV Audit Data Analyst/.test(p) && /Merge on `id`/.test(p) && /Data Quality & Exceptions/.test(p));
    const dict = EV.handoff.dataDictionary(ctx.pkg1.manifest);
    assert(dict.indexOf('## devices.csv') > 0);
    assert(/\| `id` \| uuid \|/.test(dict) && /\| `record_status` \| text \|/.test(dict), 'the common columns have their real types');
    assert(dict.indexOf('separated by " \\| "') > 0 && dict.indexOf('separated by " / "') < 0, 'the dictionary names the separator the CSV files actually use');
    /* both instruction documents open with the rule that giving the data to an AI service needs the client\'s authorisation */
    const analysis = EV.handoff.analysisInstructions(ctx.pkg1.manifest);
    [p, analysis].forEach(function (doc) { assert(/Authorisation required/.test(doc.split('\n').slice(0, 4).join('\n')) && /only where the client has explicitly authorised/.test(doc), 'authorisation notice at the top'); });
  });

  /* ------------------------------------------------------------------ sync engine (mock remote) */
  test('sync: push, pull, photograph upload, demo data stays local, conflicts are kept for review', async function () {
    const tables = {}, blobs = new Map(); let clock = 0;
    const stamp = function () { return new Date(Date.UTC(2031, 0, 1) + (++clock) * 1000).toISOString(); };
    const mock = { label: 'Mock workspace',
      upsert: async function (t, rows) { tables[t] = tables[t] || new Map(); rows.forEach(function (r) { tables[t].set(r.id, Object.assign({}, r, { server_updated_at: stamp() })); }); },
      fetchSince: async function (t, cur, limit) {
        return Array.from((tables[t] || new Map()).values()).sort(function (a, b) { return a.server_updated_at < b.server_updated_at ? -1 : a.server_updated_at > b.server_updated_at ? 1 : (a.id < b.id ? -1 : 1); })
          .filter(function (r) { return r.server_updated_at > cur.ts || (r.server_updated_at === cur.ts && r.id > (cur.id || '')); }).slice(0, limit);
      },
      uploadPhoto: async function (path, bytes, mime) { blobs.set(path, { bytes: bytes, mime: mime }); return path; },
      downloadPhoto: async function (path) { const b = blobs.get(path); return new Blob([b.bytes], { type: b.mime }); } };
    EV.sync.useAdapter(mock);
    assert(await EV.sync.run(), 'sync run succeeded: ' + EV.sync.error);
    eq(EV.sync.pendingCount(), 0, 'outbox drained');
    assert(tables.devices.has(ctx.d1.id), 'device pushed');
    assert(!Array.from(tables.rooms.values()).some(function (r) { return /Divisible/.test(r.name); }), 'demo records are never synchronised');
    eq(tables.rooms.size, 2);
    assert(blobs.size >= 1 && store.get('photos', ctx.p1.id).remote_ref, 'photograph binary uploaded and referenced');
    /* remote change arrives */
    const remote = Object.assign({}, tables.devices.get(ctx.d1.id), { model: 'Core Nano v2', updated_at: new Date(Date.now() + 3600000).toISOString(), server_updated_at: stamp() });
    tables.devices.set(remote.id, remote);
    await EV.sync.run();
    eq(store.get('devices', ctx.d1.id).model, 'Core Nano v2', 'remote change applied locally');
    /* conflicting edits */
    store.update('devices', ctx.d2.id, { notes: 'local edit' });
    tables.devices.set(ctx.d2.id, Object.assign({}, tables.devices.get(ctx.d2.id), { notes: 'remote edit', updated_at: new Date(Date.now() + 7200000).toISOString(), server_updated_at: stamp() }));
    await EV.sync.run();
    eq(store.get('devices', ctx.d2.id).notes, 'remote edit', 'newer remote version wins');
    const c = EV.sync.conflicts();
    eq(c.length, 1); eq(c[0].local.notes, 'local edit', 'displaced local version kept for review');
    EV.sync.restoreConflict(c[0].id);
    eq(store.get('devices', ctx.d2.id).notes, 'local edit');
    await EV.sync.run();
    eq(tables.devices.get(ctx.d2.id).notes, 'local edit', 'restored version pushed'); eq(EV.sync.conflicts().length, 0);
    /* a device with no local copy of a photograph can fetch it */
    await store.blobDelete(ctx.p1.id);
    const got = await EV.photos.getBlob(store.get('photos', ctx.p1.id), true);
    assert(got && got.size > 1000, 'photograph fetched back from the workspace');
    EV.sync.useAdapter(null);
  });
  test('sync: a concurrent change is a conflict whichever clock is ahead; a declined write is never counted as sent; clashing record IDs are renumbered', async function () {
    const tables = {}, blobs = new Map(), declined = new Set(); let clock = 0, during = null;
    const stamp = function () { return new Date(Date.UTC(2032, 0, 1) + (++clock) * 1000).toISOString(); };
    const mock = { label: 'Mock workspace',
      /* like the real adapter, answers with the ids the workspace actually wrote */
      upsert: async function (t, rows) {
        tables[t] = tables[t] || new Map(); const ok = [];
        if (during) { const fn = during; during = null; fn(t); }
        rows.forEach(function (r) { if (declined.has(r.id)) return; tables[t].set(r.id, Object.assign({}, r, { server_updated_at: stamp() })); ok.push(r.id); });
        return ok;
      },
      fetchSince: async function (t, cur, limit) {
        return Array.from((tables[t] || new Map()).values()).sort(function (a, b) { return a.server_updated_at < b.server_updated_at ? -1 : a.server_updated_at > b.server_updated_at ? 1 : (a.id < b.id ? -1 : 1); })
          .filter(function (r) { return r.server_updated_at > cur.ts || (r.server_updated_at === cur.ts && r.id > (cur.id || '')); }).slice(0, limit);
      },
      fetchByIds: async function (t, ids) { return ids.map(function (id) { return (tables[t] || new Map()).get(id); }).filter(Boolean); },
      uploadPhoto: async function (path, bytes, mime) { if (mock.onUpload) { const fn = mock.onUpload; mock.onUpload = null; fn(path); } blobs.set(path, { bytes: bytes, mime: mime }); return path; },
      downloadPhoto: async function (path) { const b = blobs.get(path); return new Blob([b.bytes], { type: b.mime }); } };
    store.kvSet('sync_conflicts', []);
    EV.sync.useAdapter(mock);
    const devA = A.addDevice({ room: ctx.r2 }, 'Display'), devB = A.addDevice({ room: ctx.r2 }, 'Display');
    store.update('devices', devA.id, { manufacturer: 'Demo', model: 'A', hostname: 'T-5B-DISP-A' }); store.update('devices', devB.id, { manufacturer: 'Demo', model: 'B', hostname: 'T-5B-DISP-B' });
    assert(await EV.sync.run(), 'first run: ' + EV.sync.error); eq(EV.sync.pendingCount(), 0);
    /* 1 — another auditor changes the record; this device then edits its (stale) copy LATER by the clock */
    const base = store.get('devices', devA.id).updated_at;
    const remoteAt = new Date(Date.parse(base) + 1).toISOString();
    tables.devices.set(devA.id, Object.assign({}, tables.devices.get(devA.id), { serial_number: 'REMOTE-SN-1', serial_status: 'verified_onsite', updated_at: remoteAt, server_updated_at: stamp() }));
    await wait(25);
    store.update('devices', devA.id, { notes: 'typed on a device that had not synchronised' });
    assert(store.get('devices', devA.id).updated_at > remoteAt, 'the local edit carries the later timestamp');
    await EV.sync.run();
    eq(store.get('devices', devA.id).serial_number, 'REMOTE-SN-1', 'the other auditor\'s verified value is not overwritten');
    eq(tables.devices.get(devA.id).serial_number, 'REMOTE-SN-1', 'and it is still in the workspace');
    let conf = EV.sync.conflicts().filter(function (c) { return c.record_id === devA.id; });
    eq(conf.length, 1, 'the local edit is kept for review'); eq(conf[0].local.notes, 'typed on a device that had not synchronised');
    EV.sync.restoreConflict(conf[0].id);
    await EV.sync.run();
    eq(tables.devices.get(devA.id).notes, 'typed on a device that had not synchronised', 'a restored version is accepted because it is now based on the workspace version');
    /* 2 — the workspace declines a write (it holds a later version this device has not seen) */
    store.update('devices', devB.id, { notes: 'will be declined' });
    declined.add(devB.id);
    during = function (t) { if (t === 'devices') tables.devices.set(devB.id, Object.assign({}, tables.devices.get(devB.id), { notes: 'later version in the workspace', updated_at: new Date(Date.now() + 3600000).toISOString(), server_updated_at: stamp() })); };
    await EV.sync.run();
    declined.clear();
    eq(store.get('devices', devB.id).notes, 'later version in the workspace', 'the workspace version is fetched and applied');
    assert(EV.sync.conflicts().some(function (c) { return c.record_id === devB.id && c.local.notes === 'will be declined'; }), 'the declined edit is kept for review, not counted as sent');
    assert(!store.outbox.get('devices:' + devB.id), 'and it is no longer queued');
    /* 3 — a photograph described while its image is uploading keeps the description */
    const pb = await EV.photos.demoBlob('Sync', 'upload', 40);
    const ph = await EV.photos.add(new File([pb], 'u.jpg', { type: 'image/jpeg' }), { room: ctx.r2, category: 'Other' });
    mock.onUpload = function () { store.update('photos', ph.id, { description: 'typed while the image was uploading', category: 'Rack elevation' }); };
    await EV.sync.run();
    const after = store.get('photos', ph.id);
    eq([after.description, after.category], ['typed while the image was uploading', 'Rack elevation']); assert(after.remote_ref, 'the upload reference was merged into the current record');
    await EV.sync.run();
    eq(tables.photos.get(ph.id).description, 'typed while the image was uploading');
    /* a rotated rendition is uploaded again after it changes */
    await EV.photos.rotate(store.get('photos', ph.id)); await EV.sync.run();
    assert(store.get('photos', ph.id).remote_edit_ref && blobs.has(store.orgId() + '/' + ph.id + '/edited'), 'edited rendition uploaded');
    blobs.delete(store.orgId() + '/' + ph.id + '/edited');
    await EV.photos.rotate(store.get('photos', ph.id)); eq(store.get('photos', ph.id).remote_edit_ref, '', 'a new edit clears the old upload reference');
    await EV.sync.run();
    assert(blobs.has(store.orgId() + '/' + ph.id + '/edited'), 'the new rendition is uploaded too');
    /* the storage path is derived from the record, never taken from a stored value */
    store.applyRemote('photos', Object.assign({}, store.get('photos', ph.id), { remote_ref: '../../../../rest/v1/org_members?select=*' }));
    await store.blobDelete(ph.id);
    let asked = null; const dl = mock.downloadPhoto; mock.downloadPhoto = async function (path) { asked = path; return dl(path); };
    await EV.photos.getBlob(store.get('photos', ph.id), true);
    eq(asked, store.orgId() + '/' + ph.id + '/original', 'download path ignores the stored reference');
    mock.downloadPhoto = dl;
    /* 4 — two devices issued the same record ID offline */
    const mine = A.addDevice({ room: ctx.r2 }, 'UPS');
    const theirs = Object.assign(EV.sync.toRemote('devices', mine), { id: U.uid(), hostname: 'OTHER-DEVICE', server_updated_at: stamp() });
    tables.devices.set(theirs.id, theirs);
    await EV.sync.run();
    const renumbered = store.get('devices', mine.id);
    assert(renumbered.code !== theirs.code && /^AVEI-DV-\d{4}$/.test(renumbered.code), 'the record the workspace had never received gets the next free ID');
    eq(store.get('devices', theirs.id).code, theirs.code);
    assert(store.all('activity_log').some(function (a) { return a.action === 'renumbered' && a.entity_id === mine.id; }), 'the renumbering is logged');
    eq(store.all('devices').filter(function (d) { return d.code === theirs.code; }).length, 1);
    EV.sync.conflicts().forEach(function (c) { EV.sync.dismissConflict(c.id); });
    EV.sync.useAdapter(null);
  });
  test('sync with a server that answers in PostgreSQL\'s timestamp format: a pushed record is recognised when it comes back, nothing is sent twice, an edit after a push is not a conflict, a settled position is not read again', async function () {
    const tables = {}, counts = { sent: 0, fetched: 0 }; let tick = 0;
    /* server stamps have microseconds and an offset, as clock_timestamp() gives them through PostgREST */
    const serverStamp = function () { tick++; return new Date(Date.UTC(2033, 0, 1) + tick).toISOString().slice(0, 23) + ('000' + ((tick * 37) % 1000)).slice(-3) + '+00:00'; };
    const micros = function (ts) { const m = /^(.{19})(?:\.(\d+))?(Z|[+-]\d\d:\d\d)$/.exec(ts); const frac = ((m[2] || '') + '000000').slice(0, 6); return Date.parse(m[1] + '.' + frac.slice(0, 3) + m[3]) * 1000 + Number(frac.slice(3)); };
    /* a timestamptz as PostgREST returns it: offset form, trailing zeros of the fraction dropped */
    const pgTs = function (v) { return typeof v === 'string' && /^\d{4}-\d\d-\d\dT.*Z$/.test(v) ? v.replace(/Z$/, '').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') + '+00:00' : v; };
    eq([pgTs('2026-11-12T10:05:00.123Z'), pgTs('2026-11-12T10:05:00.120Z'), pgTs('2026-11-12T10:05:00.000Z')], ['2026-11-12T10:05:00.123+00:00', '2026-11-12T10:05:00.12+00:00', '2026-11-12T10:05:00+00:00']);
    const asServer = function (t, r) {
      const out = Object.assign({}, r);
      ['created_at', 'updated_at', 'deleted_at'].forEach(function (k) { if (out[k]) out[k] = pgTs(out[k]); });
      S.T[t].columns.forEach(function (c) { if (c.type === 'ts' && out[c.name]) out[c.name] = pgTs(out[c.name]); });
      return out;
    };
    const sorted = function (t) { return Array.from((tables[t] || new Map()).values()).sort(function (a, b) { const d = micros(a.server_updated_at) - micros(b.server_updated_at); return d || (a.id < b.id ? -1 : 1); }); };
    const mock = { label: 'Mock PostgreSQL workspace',
      upsert: async function (t, rows) { tables[t] = tables[t] || new Map(); counts.sent += rows.length; rows.forEach(function (r) { tables[t].set(r.id, Object.assign({}, r, { server_updated_at: serverStamp() })); }); return rows.map(function (r) { return r.id; }); },
      fetchSince: async function (t, cur, limit) {
        const c = micros(cur.ts);
        const out = sorted(t).filter(function (r) { const s = micros(r.server_updated_at); return s > c || (s === c && r.id > (cur.id || '')); }).slice(0, limit).map(function (r) { return asServer(t, r); });
        counts.fetched += out.length; return out;
      },
      fetchByIds: async function (t, ids) { return ids.map(function (id) { return (tables[t] || new Map()).get(id); }).filter(Boolean).map(function (r) { return asServer(t, r); }); } };
    const a1 = store.get('audits', ctx.a1.id), back = EV.sync.fromRemote('audits', asServer('audits', EV.sync.toRemote('audits', a1)));
    assert(a1.verified_at, 'the sample audit has a verification time');
    eq([back.updated_at, back.created_at, back.verified_at], [a1.updated_at, a1.created_at, a1.verified_at], 'a row that went to the server and came back has the timestamps it left with');
    store.kvSet('sync', Object.assign({}, store.kvGet('sync') || { mode: 'off' }, { cursors: {} }));
    store.kvSet('sync_conflicts', []);
    const wasReread = EV.sync.rereadMs;
    EV.sync.useAdapter(mock);
    try {
      assert(await EV.sync.run(), 'first run: ' + EV.sync.error);
      const first = counts.sent;
      assert(first > 300 && EV.sync.pendingCount() === 0, 'everything on the device was sent once (' + first + ' rows)');
      counts.sent = 0; counts.fetched = 0;
      assert(await EV.sync.run(), 'second run: ' + EV.sync.error);
      assert(counts.fetched >= first, 'the rows come back in the server\'s format (' + counts.fetched + ' of ' + first + ')');
      eq([counts.sent, EV.sync.pendingCount(), EV.sync.conflicts().length], [0, 0, 0], 'a record that comes back is recognised as the version this device sent: nothing is queued or sent again');
      assert(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(store.get('rooms', ctx.r2.id).updated_at), 'timestamps on the device stay in the device\'s form');
      /* an edit made after a push is based on the version the workspace holds: it is sent, not parked as a conflict */
      store.update('rooms', ctx.r2.id, { notes: 'edited after the push' });
      counts.sent = 0;
      await EV.sync.run();
      eq([tables.rooms.get(ctx.r2.id).notes, EV.sync.conflicts().length], ['edited after the push', 0]);
      assert(counts.sent >= 1 && counts.sent <= 3, 'only the edit and its history entry are sent (' + counts.sent + ' rows)');
      /* a change from another device arrives in the server's format and is stored in the device's */
      const otherAt = new Date(Date.parse(store.get('rooms', ctx.r2.id).updated_at) + 5000).toISOString().replace(/\d{3}Z$/, '500Z');
      tables.rooms.set(ctx.r2.id, Object.assign({}, tables.rooms.get(ctx.r2.id), { notes: 'changed on another device', updated_at: otherAt, updated_by: 'Another Auditor', server_updated_at: serverStamp() }));
      await EV.sync.run();
      const got = store.get('rooms', ctx.r2.id);
      eq([got.notes, got.updated_at, EV.sync.conflicts().length], ['changed on another device', otherAt, 0]);
      /* and this device can go on editing it without a false conflict */
      store.update('rooms', ctx.r2.id, { notes: 'edited again here' });
      await EV.sync.run();
      eq([tables.rooms.get(ctx.r2.id).notes, EV.sync.conflicts().length, EV.sync.pendingCount()], ['edited again here', 0, 0]);
      /* the pull position: read again while it is fresh (a row may have been committed late), then settled */
      EV.sync.rereadMs = 80;
      await EV.sync.run();
      counts.fetched = 0; await EV.sync.run();
      assert(counts.fetched >= 1, 'a fresh position is read again');
      await wait(160);
      await EV.sync.run();   /* began more than the window after the position last moved and found nothing new: settled */
      counts.fetched = 0; counts.sent = 0;
      await EV.sync.run(); await EV.sync.run();
      eq([counts.fetched, counts.sent], [0, 0], 'a settled position is not downloaded again on every run');
      tables.rooms.set(ctx.r2.id, Object.assign({}, tables.rooms.get(ctx.r2.id), { notes: 'second change elsewhere', updated_at: new Date(Date.parse(store.get('rooms', ctx.r2.id).updated_at) + 5000).toISOString(), server_updated_at: serverStamp() }));
      await EV.sync.run();
      eq(store.get('rooms', ctx.r2.id).notes, 'second change elsewhere', 'a row written after the position settled is still received');
    } finally {
      EV.sync.rereadMs = wasReread;
      EV.sync.conflicts().forEach(function (c) { EV.sync.dismissConflict(c.id); });
      EV.sync.useAdapter(null);
    }
  });
  test('workspace sign-in: only the first sign-in sends what was already on the device; no session without confirmed membership; a viewer sends nothing', async function () {
    const calls = { rows: 0 };
    const ORG = U.uid();
    let members = [], failMembership = false;
    const member = function (role, org) { return { org_id: org || ORG, role: role, full_name: 'Test Auditor', organizations: { name: 'Example Client', short_code: 'AVEI' } }; };
    const fake = { label: 'Supabase workspace',
      signIn: async function (email) { store.kvSet('sync', Object.assign({}, store.kvGet('sync'), { session: { access_token: 'test-access', refresh_token: 'test-refresh', expires_at: 4102444800, user: { id: U.uid(), email: email } } })); return { id: 'u', email: email }; },
      signOut: async function () {},
      membership: async function () { if (failMembership) throw new Error('connection lost'); return members; },
      upsert: async function (t, rows) { calls.rows += rows.length; calls[t] = (calls[t] || 0) + rows.length; return rows.map(function (r) { return r.id; }); },
      fetchSince: async function () { return []; } };
    const settle = async function () { await wait(30); for (let i = 0; i < 200 && EV.sync.running; i++) await wait(15); };
    const tryIn = async function () { try { await EV.sync.signIn('auditor@example.test', 'not-a-real-password'); await settle(); return null; } catch (e) { return e; } };
    const profile = EV.auth.profile();
    store.kvSet('sync', { mode: 'supabase', supabase: { url: 'https://abcd.supabase.co', anonKey: 'publishable' }, session: null, cursors: {}, org_id: null, role: null });
    EV.sync.adapter = fake;
    try {
      failMembership = true;
      assert(await tryIn(), 'sign-in fails when membership cannot be read');
      assert(!EV.sync.config().session && EV.sync.needsSignIn(), 'and the device stays signed out');
      failMembership = false;
      const e1 = await tryIn();
      assert(e1 && /not a member/.test(e1.message) && !EV.sync.config().session, 'an account without membership is refused and signed out again');
      members = [member('auditor')];
      eq(await tryIn(), null);
      eq(store.orgId(), ORG, 'the device adopts the workspace organization');
      assert(store.raw('rooms').filter(function (r) { return !r.is_demo; }).every(function (r) { return r.org_id === ORG; }), 'records created before sign-in move to it');
      assert(calls.rows > 60, 'the first sign-in sends the records that were already on the device (' + calls.rows + ' rows)');
      eq(EV.sync.pendingCount(), 0);
      await EV.sync.signOut();
      assert(EV.sync.needsSignIn() && !EV.sync.enabled(), 'signed out');
      store.update('rooms', ctx.r1.id, { notes: 'changed while signed out' });
      calls.rows = 0; calls.rooms = 0; calls.activity_log = 0;
      eq(await tryIn(), null);
      eq([calls.rows, calls.rooms, calls.activity_log], [2, 1, 1], 'a later sign-in sends only what changed — the room and its change-history entry — not the whole device again');
      await EV.sync.signOut();
      members = [member('auditor', U.uid())];
      const e2 = await tryIn();
      assert(e2 && /another organization/.test(e2.message) && !EV.sync.config().session, 'a device holding one organization\'s records does not switch to another');
      eq(store.orgId(), ORG);
      members = [member('viewer')];
      eq(await tryIn(), null);
      assert(store.readOnly, 'a viewer is read-only');
      let threw = false; try { store.update('rooms', ctx.r1.id, { notes: 'viewer edit' }); } catch (e) { threw = true; }
      assert(threw, 'writes are refused for a viewer');
      calls.rows = 0;
      store.log({ action: 'exported', entity_type: 'exports', summary: 'viewer export (local only)' });
      await EV.sync.run();
      eq([calls.rows, EV.sync.pendingCount()], [0, 0], 'a viewer sends nothing');
    } finally {
      store.readOnly = false;
      EV.sync.adapter = null; store.syncEnabled = false; store.kvDel('sync');
      EV.auth.setProfile({ name: profile.name || 'Test Auditor', email: profile.email || '', role: 'lead_auditor' });
      store.outbox.list().forEach(function (e) { store.outbox.remove(e.id); });
    }
    eq(EV.sync.config().mode, 'off');
  });

  /* The PostgreSQL schema cannot be executed in this environment, so every record the application has produced by
     this point (demo environment + everything created by the tests above) is checked against the same rules the
     database enforces: column types, NOT NULL, CHECK vocabularies, table constraints, unique indexes, push order. */
  test('cloud schema conformance: every record satisfies the database column types and constraints; tables push in foreign-key order', function () {
    const order = {}; S.TABLES.forEach(function (t, i) { order[t] = i; });
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/, DATE = /^\d{4}-\d{2}-\d{2}$/;
    const problems = []; let rows = 0;
    const unique = { room_configuration_members: function (r) { return r.configuration_id + '|' + r.room_id; }, backlog_it_links: function (r) { return r.backlog_item_id + '|' + r.it_request_id; }, followups: function (r) { return r.org_id + '|' + r.dedupe_key; } };
    S.TABLES.forEach(function (t) {
      if (t === 'organizations' || t === 'profiles') return;
      S.T[t].columns.forEach(function (c) { if (c.ref && !c.soft && order[c.ref] > order[t]) problems.push(t + '.' + c.name + ' references ' + c.ref + ', which is pushed later'); });
      const checks = {}; (S.DB_CHECKS[t] || []).forEach(function (ck) { checks[ck[0]] = ck[1]; assert(S.T[t].colNames.indexOf(ck[0]) >= 0, 'constraint on unknown column ' + t + '.' + ck[0]); });
      const seen = new Set();
      store.raw(t).forEach(function (r) {
        rows++;
        const row = EV.sync.toRemote(t, r), at = t + ' ' + (r.code || r.id) + ': ';
        if (!UUID.test(row.id) || !UUID.test(row.org_id)) problems.push(at + 'id / org_id is not a UUID');
        if (!ISO.test(row.created_at) || !ISO.test(row.updated_at) || row.updated_at < row.created_at) problems.push(at + 'created_at / updated_at ' + row.created_at + ' / ' + row.updated_at);
        if (row.deleted_at != null && !ISO.test(row.deleted_at)) problems.push(at + 'deleted_at ' + row.deleted_at);
        S.T[t].columns.forEach(function (c) {
          const v = row[c.name];
          if (v == null) { if (c.required || c.type === 'bool') problems.push(at + c.name + ' is null but the column is NOT NULL'); return; }
          const bad = c.type === 'uuid' ? !UUID.test(v) : c.type === 'int' ? !Number.isInteger(v) : c.type === 'num' ? (typeof v !== 'number' || !isFinite(v)) : c.type === 'bool' ? typeof v !== 'boolean'
            : c.type === 'date' ? !DATE.test(v) : c.type === 'ts' ? !ISO.test(v) : c.type === 'text' ? typeof v !== 'string' : false;
          if (bad) problems.push(at + c.name + ' = ' + JSON.stringify(v) + ' does not fit column type ' + c.type);
          if (checks[c.name] && checks[c.name].indexOf(v) < 0) problems.push(at + c.name + ' = ' + JSON.stringify(v) + ' is outside the allowed values');
          if (c.ref && !c.soft && !store.getAny(c.ref, v)) problems.push(at + c.name + ' references a ' + c.ref + ' record that does not exist');
        });
        if (t === 'backlog_items' && row.root_cause_confidence !== 'confirmed' && (row.root_cause || '') !== '') problems.push(at + 'root_cause recorded without confirmed confidence');
        if (t === 'audits' && !row.room_id && !row.configuration_id) problems.push(at + 'audit has neither a room nor a configuration');
        if (t === 'spare_items' && ((row.quantity || 0) < 0 || (row.min_stock || 0) < 0)) problems.push(at + 'negative quantity');
        if (unique[t] && !r.deleted_at) { const k = unique[t](r); if (seen.has(k)) problems.push(at + 'duplicates another live row (unique index)'); seen.add(k); }
      });
    });
    assert(rows > 400, 'expected a substantial data set to check, got ' + rows + ' rows');
    eq(problems.slice(0, 15), [], problems.length + ' conformance problem(s) in ' + rows + ' rows');
    /* natural-key records get the same id on every device, so two offline devices merge instead of colliding */
    eq(U.keyId('followup', 'dev:1:ip'), U.keyId('followup', 'dev:1:ip')); assert(UUID.test(U.keyId('followup', 'dev:1:ip')) && U.keyId('followup', 'dev:1:ip') !== U.keyId('followup', 'dev:1:mac') && U.keyId('followup', 'x') !== U.keyId('insight', 'x'));
    const ids = new Set(); for (let i = 0; i < 20000; i++) ids.add(U.keyId('k', 'dev:' + i + ':ip')); eq(ids.size, 20000, 'no collisions across 20,000 keys');
    const req = store.all('it_requests')[0], linksBefore = store.by('backlog_it_links', 'backlog_item_id', ctx.bl1.id).length;
    if (!A.requestsFor(ctx.bl1.id).some(function (r) { return r.id === req.id; })) {
      const link = A.linkRequest(ctx.bl1.id, req.id);
      eq(link.id, U.keyId('backlog-request', ctx.bl1.id + ':' + req.id), 'link id is derived from the two records it joins');
      A.unlinkRequest(ctx.bl1.id, req.id);
      eq(A.linkRequest(ctx.bl1.id, req.id).id, link.id, 're-linking revives the same row instead of adding a second one');
      eq(store.raw('backlog_it_links').filter(function (l) { return l.id === link.id; }).length, 1);
      A.unlinkRequest(ctx.bl1.id, req.id);
      eq(store.by('backlog_it_links', 'backlog_item_id', ctx.bl1.id).length, linksBefore);
    }
    const fus = store.all('followups');
    assert(fus.length > 0, 'follow-up tasks exist');
    fus.forEach(function (f) { eq(f.id, U.keyId('followup', f.dedupe_key), 'follow-up id is derived from its key'); });
  });
  test('the generated SQL file is in step with the application schema: every table and column exists with the matching type', async function () {
    const sql = await (await fetch('../supabase/schema.sql', { cache: 'no-store' })).text();
    const SQLTYPE = { text: 'text', uuid: 'uuid', int: 'integer', num: 'numeric', bool: 'boolean', date: 'date', ts: 'timestamptz', json: 'jsonb' };
    const missing = [];
    S.TABLES.forEach(function (t) {
      if (t === 'organizations' || t === 'profiles') return;
      const m = new RegExp('create table if not exists public\\.' + t + ' \\(\\n([\\s\\S]*?)\\n\\);').exec(sql);
      if (!m) { missing.push('table ' + t); return; }
      const cols = {}; m[1].split('\n').forEach(function (line) { const c = /^\s+([a-z_0-9]+)\s+([a-z]+)/.exec(line); if (c) cols[c[1]] = c[2]; });
      S.COMMON_COLS.concat(['server_updated_at']).forEach(function (k) { if (!cols[k]) missing.push(t + '.' + k); });
      S.T[t].columns.forEach(function (c) {
        /* a soft reference is stored as its id without a database foreign key; activity_log keeps location ids as text */
        const want = SQLTYPE[c.type];
        if (!cols[c.name]) missing.push(t + '.' + c.name);
        else if (cols[c.name] !== want) missing.push(t + '.' + c.name + ' is ' + cols[c.name] + ', the application expects ' + want);
      });
      assert(new RegExp('alter table public\\.' + t + ' enable row level security').test(sql), 'row-level security is not enabled on ' + t);
    });
    eq(missing, [], 'supabase/schema.sql is out of date — regenerate it with tools/gen-schema.html');
    assert(!/\bto\s+(anon|public)\b/i.test(sql.replace(/--[^\n]*/g, '')), 'nothing is granted to the anonymous or public role');
  });

  /* ------------------------------------------------------------------ security, backup, UI */
  test('passcode lock: PBKDF2 verification; the passcode is never stored; changing or removing it needs the current passcode', async function () {
    await EV.auth.setPasscode('correct horse 42');
    assert(await EV.auth.verify('correct horse 42')); assert(!(await EV.auth.verify('wrong')));
    const l = store.kvGet('lock');
    assert(l.hash && l.salt && l.iterations >= 100000 && JSON.stringify(l).indexOf('correct') < 0);
    const refused = async function (fn) { try { await fn(); } catch (e) { return /current passcode/.test(e.message); } return false; };
    assert(await refused(function () { return EV.auth.setPasscode('another pass 77'); }), 'changing the passcode without the current one is refused');
    assert(await refused(function () { return EV.auth.setPasscode('another pass 77', 'wrong'); }), 'changing it with a wrong current passcode is refused');
    assert(await refused(function () { return EV.auth.clearPasscode(); }), 'removing the lock without the current passcode is refused');
    assert(await refused(function () { return EV.auth.clearPasscode('wrong'); }), 'removing the lock with a wrong passcode is refused');
    eq(store.kvGet('lock').hash, l.hash, 'the lock is unchanged after the refused attempts');
    await EV.auth.setPasscode('another pass 77', 'correct horse 42');
    assert((await EV.auth.verify('another pass 77')) && !(await EV.auth.verify('correct horse 42')), 'changed with the current passcode');
    /* the first tap after the idle limit locks the device instead of renewing the session */
    EV.auth.init(); EV.auth.locked = false;
    EV.auth.lastActive = Date.now() - 16 * 60000;
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    assert(EV.auth.locked, 'idle limit reached: the tap locks');
    assert(EV.auth.lastActive < Date.now() - 15 * 60000, 'and does not count as activity');
    EV.auth.locked = false; EV.auth.lastActive = Date.now();
    await EV.auth.clearPasscode('another pass 77');
    assert(!EV.auth.hasLock() && !EV.auth.locked, 'lock removed with the current passcode');
  });
  test('cloud sync is off unless the build allows one workspace; secret keys are refused', async function () {
    const P = EV.sync.parsePolicy;
    const deviceOnly = P("default-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'");
    assert(deviceOnly.known && !deviceOnly.any && deviceOnly.origins.length === 0 && EV.sync.deviceOnlyBuild(deviceOnly), 'connect-src self is a device-only build');
    assert(!EV.sync.buildAllows('https://abcd.supabase.co', deviceOnly), 'device-only build allows no workspace');
    const one = P("default-src 'self'; connect-src 'self' https://abcd.supabase.co; img-src 'self' data:");
    eq(one.origins, ['https://abcd.supabase.co']); assert(!EV.sync.deviceOnlyBuild(one));
    assert(EV.sync.buildAllows('https://abcd.supabase.co', one) && !EV.sync.buildAllows('https://other.supabase.co', one) && !EV.sync.buildAllows('https://abcd.supabase.co.evil.example', one), 'only the named origin is allowed');
    assert(!P(null).known && EV.sync.buildAllows('https://x.example', P(null)), 'no page-level policy: the host decides');
    /* the shipped application page itself must be device-only */
    const html = await (await fetch('../app/index.html')).text();
    const meta = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html);
    assert(meta, 'application page declares a Content-Security-Policy');
    assert(EV.sync.deviceOnlyBuild(P(meta[1])), 'shipped application page is device-only by default');
    assert(/script-src 'self'/.test(meta[1]) && !/unsafe-inline|unsafe-eval/.test(meta[1]), 'no inline or eval script is permitted');
    /* key checks */
    const jwt = function (role) { return 'eyJhbGciOiJIUzI1NiJ9.' + btoa(JSON.stringify({ iss: 'supabase', role: role })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') + '.c2lnbmF0dXJl'; };
    eq(EV.sync.keyRole(jwt('service_role')), 'service_role'); eq(EV.sync.keyRole(jwt('anon')), 'anon');
    eq(EV.sync.keyRole('sb_secret_0123456789abcdefghij'), 'service_role'); eq(EV.sync.keyRole('sb_publishable_0123456789abcdefghij'), '');
    const refused = async function (url, key, re) { try { await EV.sync.connectSupabase(url, key); } catch (e) { return re.test(e.message); } return false; };
    assert(await refused('http://abcd.supabase.co', jwt('anon'), /https/), 'non-https workspace refused');
    assert(await refused('https://abcd.supabase.co/rest/v1', jwt('anon'), /address only/), 'address with a path refused');
    assert(await refused('https://abcd.supabase.co', jwt('service_role'), /secret/), 'service-role JWT refused');
    assert(await refused('https://abcd.supabase.co', 'sb_secret_0123456789abcdefghij', /secret/), 'secret key refused');
    assert(store.hasDemo() && await refused('https://abcd.supabase.co', jwt('anon'), /demo data/i), 'refused while demo data is loaded');
    eq(EV.sync.config().mode, 'off', 'nothing was connected');
  });
  test('backup and restore round-trip keeps every record; a backup carries no credentials', async function () {
    store.kvSet('sync', { mode: 'off', supabase: { url: 'https://abcd.supabase.co', anonKey: 'anon-key-ZZZ' }, session: { access_token: 'tok-AAA', refresh_token: 'tok-BBB', user: { email: 'auditor@example.test' } } });
    store.kvSet('lock', { salt: 'c2FsdA==', hash: 'aGFzaC1DQ0M=', iterations: 210000 });
    const dump = store.dump();
    store.kvDel('sync'); store.kvDel('lock');
    const flat = JSON.stringify(dump);
    assert(flat.indexOf('tok-AAA') < 0 && flat.indexOf('tok-BBB') < 0 && flat.indexOf('anon-key-ZZZ') < 0, 'workspace session and key are not in the backup');
    assert(flat.indexOf('aGFzaC1DQ0M=') < 0 && !dump.kv.lock && !dump.kv.profile && !dump.kv.sync, 'passcode verifier and profile are not in the backup');
    assert(Object.keys(dump.kv).every(function (k) { return k.indexOf('seq:') === 0 || k === 'org_name' || k === 'org_code'; }) && Object.keys(dump.kv).some(function (k) { return k.indexOf('seq:') === 0; }), 'only record counters and the organization label are kept');
    const before = {}; S.TABLES.forEach(function (t) { before[t] = store.raw(t).length; });
    const copy = JSON.parse(JSON.stringify(dump));
    store.purge('rooms', ctx.r2.id);
    eq(store.raw('rooms').length, before.rooms - 1);
    const n = store.restore(copy);
    assert(n >= 1); eq(store.raw('rooms').length, before.rooms, 'purged room restored');
    await store.flush();
  });
  test('a backup file is outside data: rows are rebuilt from the schema; settings, lock and organization are never taken from it; record content cannot become markup', async function () {
    const good = U.uid(), past = '2020-01-01T00:00:00.000Z';
    const nodeLike = { tag: 'img', props: { src: 'x', onerror: 'window.__evProbe = 1' }, children: [], _v: {} };
    const nameBefore = store.get('rooms', ctx.r1.id).name;
    const dump = { format: 'av-environment-intelligence-backup', version: 1,
      kv: { 'seq:devices': 1, sync: { mode: 'supabase', session: { access_token: 'x' } }, lock: { hash: 'x', salt: 'x', iterations: 1 }, profile: { name: 'Someone else', role: 'viewer' }, onboarded: false, org_id: U.uid() },
      tables: {
        devices: [
          { id: good, org_id: U.uid(), created_at: past, updated_at: past, code: 'AVEI-DV-9001', category: 'Display', building_id: ctx.b.id, floor_id: ctx.f.id, room_id: ctx.r2.id,
            manufacturer: nodeLike, model: 42, hostname: 'RESTORED-OK', notes: ['a', 'b'], rack_id: 'not-a-uuid', archived: 'true', support_expiration: '31/12/2031', is_demo: 'yes',
            extra: '<img src=x onerror=alert(1)>', constructor: 'x' },
          { id: '../../rest/v1/org_members', hostname: 'BAD-ID' }, { hostname: 'NO-ID' }, null, 'text', [1, 2]
        ],
        rooms: [Object.assign({}, store.get('rooms', ctx.r1.id), { name: 'OLDER COPY FROM A BACKUP', updated_at: past })],
        not_a_table: [{ id: U.uid(), anything: true }]
      } };
    const settings = function () { return JSON.stringify([store.kvGet('profile'), store.kvGet('lock') || null, store.kvGet('sync') || null, store.kvGet('onboarded') || null, store.orgId(), store.kvGet('seq:devices')]); };
    const before = settings(), rowsBefore = {}; S.TABLES.forEach(function (t) { rowsBefore[t] = store.raw(t).length; });
    eq(store.restore(JSON.parse(JSON.stringify(dump))), 1, 'only the one well-formed row is restored');
    const d = store.raw('devices').find(function (x) { return x.id === good; });
    eq([d.org_id, d.manufacturer, d.model, d.hostname, d.notes, d.rack_id, d.archived, d.support_expiration, d.is_demo], [store.orgId(), '', '42', 'RESTORED-OK', '', null, false, null, false],
      'each column is rebuilt with its own type; the record belongs to this device\'s organization');
    eq(Object.keys(d).sort(), S.COMMON_COLS.concat(S.T.devices.colNames).sort(), 'the restored row has exactly the columns of its table');
    S.TABLES.forEach(function (t) { eq(store.raw(t).length, rowsBefore[t] + (t === 'devices' ? 1 : 0), 'rows without a valid id, and unknown tables, are skipped (' + t + ')'); });
    eq(store.get('rooms', ctx.r1.id).name, nameBefore, 'a newer record on the device is never replaced by an older copy');
    eq(settings(), before, 'profile, lock, workspace connection, organization and counters are unchanged');
    ['x', null, {}, { format: 'av-environment-intelligence-backup' }, { format: 'other', tables: {} }].forEach(function (bad) {
      let threw = false; try { store.restore(bad); } catch (e) { threw = true; }
      assert(threw, 'refused as not being a backup: ' + JSON.stringify(bad));
    });
    store.purge('devices', good);
    /* restoring writes records, so a read-only account cannot do it */
    store.readOnly = true;
    try { let refused = false; try { store.restore(JSON.parse(JSON.stringify(dump))); } catch (e) { refused = /read-only/.test(e.message); } assert(refused && !store.getAny('devices', good), 'restore is refused for a read-only account'); }
    finally { store.readOnly = false; }
    /* a backup made on another device can carry a record ID this device has already issued to a different record */
    const arrivedId = U.uid(), mineCode = store.get('rooms', ctx.r1.id).code;
    const dump2 = { format: 'av-environment-intelligence-backup', version: 1, kv: {}, tables: { rooms: [Object.assign({}, store.get('rooms', ctx.r1.id), { id: arrivedId, name: 'Room from another device', number: '9Z' })] } };
    eq(store.restore(JSON.parse(JSON.stringify(dump2))), 1);
    const arrived = store.get('rooms', arrivedId);
    assert(arrived && arrived.code !== mineCode && /^AVEI-RM-\d{4}$/.test(arrived.code), 'the record that arrived gets the next free ID (' + (arrived && arrived.code) + ')');
    eq([store.get('rooms', ctx.r1.id).code, store.all('rooms').filter(function (r) { return r.code === mineCode; }).length], [mineCode, 1], 'the record already on the device keeps its ID; no two records share one');
    assert(store.all('activity_log').some(function (a) { return a.action === 'renumbered' && a.entity_id === arrivedId && a.changes[0].from === mineCode; }), 'the renumbering is in the change history');
    store.purge('rooms', arrivedId);
    /* the renderer: an object it did not create itself is shown as text, whatever it is shaped like */
    const host = document.createElement('div'); document.body.appendChild(host);
    window.__evProbe = 0;
    try {
      EV.mount(host, function () {
        return EV.h('div', { id: 'probe' }, 'before ', nodeLike, ' ', { text: '<b>bold</b>' }, EV.h('span', null, '<i>typed by an auditor</i>'), ' after',
          /* attribute values that came from data: a handler that is not a function is ignored, a script address is never set */
          EV.h('a', { id: 'probe-link', href: 'javascript:window.__evProbe = 2', onclick: 'window.__evProbe = 3', title: '"><img src=x onerror=1>' }, 'link'),
          EV.h('iframe', { id: 'probe-frame', srcdoc: '<script>parent.__evProbe = 4</script>', style: 'display:none' }));
      });
      await wait(40);
      eq(host.querySelectorAll('img, b, i, script').length, 0, 'no element is created from record content');
      assert(host.textContent.indexOf('"onerror"') > 0 && host.textContent.indexOf('<i>typed by an auditor</i>') > 0 && host.textContent.indexOf('<b>bold</b>') > 0, 'it is displayed as text: ' + host.textContent);
      const link = document.getElementById('probe-link');
      eq([link.getAttribute('href'), link.getAttribute('title'), document.getElementById('probe-frame').getAttribute('srcdoc')], [null, '"><img src=x onerror=1>', null], 'a script address is dropped; an ordinary attribute value stays text');
      link.click(); await wait(60);
      eq(window.__evProbe, 0, 'nothing was executed');
    } finally { EV.mount(host, function () { return EV.h('div'); }); host.remove(); delete window.__evProbe; }
  });
  test('change history: each test result and network check is a detail entry with from → to; the activity feed keeps one summary line per audit', function () {
    const room = A.addRoom(ctx.f, { number: '5H', name: 'History Room', room_type: 'Huddle room', capacity: 4 });
    const a = A.startAudit({ room: room });
    const t = store.by('functional_tests', 'audit_id', a.id)[0], c = store.by('network_checks', 'audit_id', a.id)[0];
    const entries = function (id) { return store.by('activity_log', 'entity_id', id); };
    eq(entries(t.id).length + entries(c.id).length, 0, 'creating the tests and checks of a new audit writes no entries of its own');
    A.setTest(t.id, 'pass'); A.setTest(t.id, 'fail');
    const te = entries(t.id);
    eq(te.length, 1, 'one entry for the test (changes in quick succession are merged)');
    eq([te[0].detail, te[0].action, te[0].entity_type, te[0].room_id, te[0].actor], [true, 'updated', 'functional_tests', room.id, store.actor()]);
    const ch = te[0].changes.find(function (x) { return x.f === 'result'; });
    eq([ch.from, ch.to], ['not_tested', 'fail'], 'from the first value to the last');
    assert(te[0].summary.indexOf(a.code) > 0, 'the entry names the audit it belongs to: ' + te[0].summary);
    A.setCheck(c.id, 'awaiting_it');
    const ce = entries(c.id);
    eq([ce.length, ce[0].detail, ce[0].changes.find(function (x) { return x.f === 'status'; }).to], [1, true, 'awaiting_it']);
    A.setSection(a.id, 'devices', { state: 'na', notes: 'No AV equipment in this room' });
    assert(store.all('activity_log').some(function (e) { return e.entity_type === 'audit_sections' && e.detail && /audit/.test(e.summary); }), 'a section marked not applicable is recorded');
    const feed = store.all('activity_log').filter(function (e) { return !e.detail && e.entity_id === a.id; });
    eq(feed.map(function (e) { return e.action; }).sort(), ['created', 'network_validation_updated', 'testing_updated'], 'the feed has the audit and one rolling line each for testing and network validation');
    /* status changes of backlog items and coordination requests are entries of their own */
    const b = A.createBacklog({ title: 'History check item', room_id: room.id, floor_id: room.floor_id, building_id: room.building_id });
    A.setBacklogStatus(b.id, 'Under Investigation'); A.setBacklogStatus(b.id, 'Completed');
    const bs = entries(b.id).filter(function (e) { return e.action === 'status_changed'; });
    eq(bs.map(function (e) { return e.changes[0].from + ' → ' + e.changes[0].to; }), ['New Discovery → Under Investigation', 'Under Investigation → Completed']);
    assert(bs.every(function (e) { return !e.detail && e.entity_code === b.code; }) && store.get('backlog_items', b.id).completed_at, 'shown in the feed; completion time stamped');
    A.setBacklogStatus(b.id, 'In Progress');
    eq(store.get('backlog_items', b.id).completed_at, null, 'reopening clears the completion time');
    ctx.hist = { room: room, audit: a, backlog: b };
  });
  test('a fully verified audit whose mandatory information later becomes incomplete reads as “verification lapsed”; the recorded status is not changed', async function () {
    const room = A.addRoom(ctx.f, { number: '5L', name: 'Lapse Room', room_type: 'Huddle room', capacity: 4, conferencing_platform: 'Zoom Rooms', control_platform: 'None', dsp_platform: 'None',
      display_config: 'x', camera_config: 'x', microphone_config: 'x', scheduling_platform: 'None' });
    const a = A.startAudit({ room: room });
    store.update('audits', a.id, { operational_status: 'Fully operational' });
    S.TEST_CATEGORIES.forEach(function (c) { A.setTestsBulk(a.id, c, 'pass'); });
    store.by('network_checks', 'audit_id', a.id).forEach(function (c) { A.setCheck(c.id, 'na'); });
    eq(R.auditProgress(a.id).blockers[0], 'No devices recorded — add devices or confirm that this space has no AV devices');
    A.setSection(a.id, 'devices', { state: 'na' });
    const pb = await EV.photos.demoBlob('Lapse', 'room', 30);
    await EV.photos.add(new File([pb], 'lapse.jpg', { type: 'image/jpeg' }), { audit: store.get('audits', a.id), room: room, category: 'Other' });
    eq(R.auditProgress(a.id).blockers, [], 'nothing outstanding');
    A.verifyAudit(store.get('audits', a.id));
    const get = function () { return store.get('audits', a.id); };
    eq([get().status, R.auditLapsed(get()), R.roomState(room.id).state, R.auditStatusLabel(get())], ['verified', false, 'verified', 'Fully verified']);
    eq(X.incomplete('audits', get()), [], 'a verified audit is complete in the export');
    /* a device is added afterwards, without its identification */
    const d = A.addDevice({ room: room }, 'Display');
    eq([get().status, R.auditLapsed(get()), R.roomState(room.id).state, R.auditStatusLabel(get())], ['verified', true, 'audited', 'Verification lapsed'], 'the stored status is untouched; what is shown follows the data');
    const reasons = X.incomplete('audits', get());
    assert(reasons[0] === 'verification lapsed' && reasons.some(function (r) { return /1 of 1 devices are not fully identified/.test(r); }), 'the export says why: ' + reasons.join(' | '));
    let threw = false; try { A.verifyAudit(get()); } catch (e) { threw = true; }
    assert(threw, 'it cannot simply be verified again');
    const col = X.collect(X.resolveScope({ mode: 'full' }));
    const check = X.validate(col, null, null).checks.find(function (c) { return c.key === 'room-audits-are-fully-verified'; });
    assert(check && check.records.some(function (r) { return r.record_id === a.id && /Verification lapsed/.test(r.detail); }), 'the validation report lists it');
    /* closing the gap restores the verified reading without anyone re-marking it */
    store.update('devices', d.id, { manufacturer: 'Demo', model: 'Panel', ip_status: 'not_applicable', mac_status: 'not_applicable', serial_status: 'not_applicable', connection_type: 'Not networked' });
    assert(R.device(store.get('devices', d.id)).verified, 'device fully identified');
    eq([get().status, R.auditLapsed(get()), R.roomState(room.id).state], ['verified', false, 'verified']);
    eq(X.incomplete('audits', get()), []);
  });
  test('coordination requests are drafts until submitted; spare equipment risk flags follow the record', function () {
    R.reconcileFollowups();
    const d = A.addDevice({ room: ctx.hist.room }, 'Camera');
    store.update('devices', d.id, { manufacturer: 'Demo', model: 'PTZ', hostname: 'T-5H-CAM01' });
    R.reconcileFollowups();
    const fu = R.deviceFollowups(d.id).find(function (f) { return f.kind === 'missing_ip'; });
    assert(fu, 'a follow-up exists for the missing IP address');
    const before = store.all('it_requests').length;
    const req = A.requestFromFollowup(fu);
    eq([req.status, req.date_requested, req.device_id, req.room_id, req.source_key], ['Draft', null, d.id, ctx.hist.room.id, fu.dedupe_key], 'a draft, addressed and linked, with no request date');
    assert(/^AVEI-IT-\d{3}$/.test(req.code) && store.all('it_requests').length === before + 1);
    eq(store.get('followups', fu.id).it_request_id, req.id, 'the follow-up points at its request');
    assert(req.requested_from && S.IT_PARTIES.indexOf(req.requested_from) >= 0, 'addressed to a known party');
    /* spare equipment */
    const flags = function (s) { return R.spare(s).map(function (f) { return f.key; }).sort(); };
    const base = { name: 'Spare', manufacturer: 'Demo', model: 'X1', quantity: 2, min_stock: 1, lifecycle: '', eol_date: null };
    eq(flags(base), []);
    eq(flags(Object.assign({}, base, { quantity: 0 })), ['zero']);
    eq(flags(Object.assign({}, base, { quantity: 1, min_stock: 2 })), ['low']);
    eq(flags(Object.assign({}, base, { model: '' })), ['unidentified']);
    eq(flags(Object.assign({}, base, { lifecycle: 'eol' })), ['eol']);
    eq(flags(Object.assign({}, base, { eol_date: U.localDate(new Date(Date.now() + 90 * 86400000)) })), ['eol'], 'end of life within a year');
    eq(flags(Object.assign({}, base, { eol_date: U.localDate(new Date(Date.now() + 800 * 86400000)) })), []);
    eq(flags({ name: '', manufacturer: '', model: '', quantity: 0, min_stock: 0, lifecycle: 'approaching_eol' }), ['eol', 'unidentified', 'zero']);
    eq([flags(Object.assign({}, base, { quantity: null })), flags(Object.assign({}, base, { quantity: '' }))], [['uncounted'], ['uncounted']], 'a quantity nobody recorded is unknown, not zero');
    /* nothing is pre-filled on a new record: a room has no type, a stock line no quantity, condition or lifecycle until someone records them */
    const nr = A.addRoom(ctx.f);
    eq([nr.room_type, nr.capacity, nr.name, nr.number, nr.criticality], ['', null, '', '', '']);
    assert(X.incomplete('rooms', nr).indexOf('room type missing') >= 0, 'and the export says the type is missing');
    A.discard('rooms', nr.id);
    const spareIds = new Set(store.all('spare_items').map(function (s) { return s.id; }));
    EV.editors.newSpare();
    const ns = store.all('spare_items').find(function (s) { return !spareIds.has(s.id); });
    eq([ns.quantity, ns.min_stock, ns.condition, ns.lifecycle, ns.manufacturer], [null, null, '', '', '']);
    eq([flags(ns), X.incomplete('spare_items', ns)], [['uncounted', 'unidentified'], ['manufacturer or model not identified', 'quantity not recorded']]);
    eq(R.spareStats().uncounted, 1);
    A.discard('spare_items', ns.id);
    EV.ui.sheets.length = 0;
    eq(R.spareStats().uncounted, 0);
  });
  test('everything in memory is on disk: each table read through a separate database connection matches record for record', async function () {
    await store.flush();
    let total = 0;
    for (const t of S.TABLES) {
      const disk = await rawAll(t), memRows = store.raw(t);
      eq(disk.length, memRows.length, t + ': rows on disk');
      const byId = new Map(disk.map(function (r) { return [r.id, r]; }));
      memRows.forEach(function (r) {
        const onDisk = byId.get(r.id);
        assert(onDisk, t + ': record missing on disk — ' + (r.code || r.id));
        if (JSON.stringify(onDisk) !== JSON.stringify(r)) throw new Error(t + ': record differs on disk — ' + (r.code || r.id));
      });
      total += disk.length;
    }
    assert(total > 600, 'compared ' + total + ' records');
    const keys = new Set(await store.blobKeys());
    store.all('photos').forEach(function (p) { assert(keys.has(p.id), 'image file missing for ' + p.code); if (p.has_edit) assert(keys.has(p.id + ':edit'), 'edited image missing for ' + p.code); });
    eq(store.save.pending, 0, 'nothing waiting to be written'); assert(!store.save.error, 'no save error: ' + store.save.error);
    const kvDisk = await rawAll('kv');
    eq(kvDisk.length, Object.keys(store.kvAll()).length, 'settings on disk');
  });
  test('application shell: every screen and editor renders without errors; the lock screen hides whatever was open', async function () {
    store.kvSet('onboarded', true); EV.auth.setProfile({ name: 'Test Auditor', role: 'lead_auditor' });
    const errs = []; const orig = console.error;
    console.error = function () { errs.push(Array.prototype.map.call(arguments, function (a) { return String(a && a.stack || a); }).join(' ')); orig.apply(console, arguments); };
    await EV.boot();
    const a22B = store.all('audits').find(function (a) { return a.is_demo && (store.get('rooms', a.room_id) || {}).number === '22B'; });
    const cfgA = store.all('audits').length;
    const routes = ['/', '/environment', '/floor/' + ctx.f.id, '/room/' + ctx.r1.id, '/audits', '/audit/' + a22B.id, '/audit/' + ctx.a1.id, '/devices', '/devices?filter=incomplete', '/infrastructure', '/infrastructure?tab=switches',
      '/infrastructure?tab=addressing', '/infrastructure?tab=dependencies', '/infrastructure?tab=validation', '/backlog', '/backlog?tab=triage', '/backlog/' + ctx.bl1.id, '/coordination', '/spares', '/reports', '/reports/executive',
      '/reports/room?audit=' + a22B.id, '/reports/devices', '/export', '/settings', '/unknown'];
    for (const r of routes) {
      EV.go(r); await wait(90);
      assert(!document.querySelector('.crash'), 'screen crashed: ' + r);
      assert(document.querySelector('.page') && document.querySelector('.page').childNodes.length > 0, 'screen is empty: ' + r);
    }
    ['summary', 'devices', 'testing', 'photos', 'findings', 'network', 'notes'].forEach(function (k) { EV.ui.open['aud:' + a22B.id + ':' + k] = true; });
    EV.go('/audit/' + a22B.id); await wait(150);
    assert(!document.querySelector('.crash'), 'audit sections crashed');
    assert(document.querySelectorAll('.test').length >= 11, 'test rows rendered');
    /* editors open and close */
    const dev = store.all('devices').find(function (d) { return d.hostname === 'DEMO-22B-CAM01'; });
    const sheets = [function () { return EV.editors.device(dev.id); }, function () { return EV.editors.finding(ctx.f1.id); }, function () { return EV.editors.request(store.all('it_requests')[0].id); },
      function () { return EV.editors.spare(store.all('spare_items')[0].id); }, function () { return EV.editors.infra(store.all('infra_assets')[0].id); }, function () { return EV.editors.room(ctx.r1.id); },
      function () { return EV.photos.openViewer(store.all('photos').find(function (p) { return p.is_demo; }).id); }, function () { return EV.openNew(); }];
    for (const open of sheets) { open(); await wait(110); assert(document.querySelector('.sheet'), 'editor did not open'); assert(!document.querySelector('.sheet .note-danger .note-body') || !/could not be displayed/.test(document.querySelector('.sheet').textContent), 'editor failed to render'); EV.ui.sheets.length = 0; EV.redraw(); await wait(40); }
    eq(store.all('audits').length, cfgA, 'navigation created no stray records');
    /* a route change closes whatever sheet was open */
    EV.editors.device(dev.id); await wait(110);
    assert(document.querySelector('.sheet'), 'sheet open');
    EV.go('/spares'); await wait(140);
    assert(!document.querySelector('.sheet') && EV.ui.sheets.length === 0, 'moving to another screen closes the open sheet');
    /* locking hides an open record: nothing of it stays in the page behind the lock screen */
    await EV.auth.setPasscode('lock screen 123');
    EV.editors.device(dev.id); await wait(110);
    assert(document.querySelector('.sheet') && document.body.textContent.indexOf('DEMO-22B-CAM01') >= 0, 'a device record is open');
    let answer = 'not answered';
    EV.ui.confirm({ title: 'Delete this device?', message: 'Asked just before the device locked.', confirm: 'Delete', danger: true }).then(function (v) { answer = v; });
    await wait(90);
    assert(document.querySelector('.dialog'), 'a question is open');
    EV.auth.lock(); await wait(140);
    assert(document.getElementById('lock-pass'), 'lock screen shown');
    assert(!document.querySelector('.sheet') && !document.querySelector('.shell') && !document.querySelector('.dialog'), 'no sheet, no question and no screen behind the lock');
    eq(document.getElementById('app').textContent.indexOf('DEMO-22B-CAM01'), -1, 'the open record is not in the page while locked');
    /* Back, Escape and the lock screen's own question leave what is underneath exactly as it was */
    const routeWas = EV.router.full;
    history.back(); await wait(220);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(60);
    eq([EV.router.full, EV.ui.sheets.length, answer], [routeWas, 1, 'not answered'], 'Back and Escape on the lock screen change nothing underneath');
    EV.auth.unlock.pass = 'not the passcode'; EV.redraw(); await wait(60);
    document.getElementById('lock-unlock').click(); await wait(700);
    assert(EV.auth.locked && /not correct/.test(document.getElementById('app').textContent), 'a wrong passcode does not unlock');
    EV.auth.unlock.pass = 'lock screen 123'; EV.redraw(); await wait(60);
    document.getElementById('lock-unlock').click();
    for (let i = 0; i < 60 && EV.auth.locked; i++) await wait(50);
    await wait(140);
    assert(!EV.auth.locked && document.querySelector('.shell'), 'the passcode unlocks');
    assert(document.querySelector('.sheet') && document.querySelector('.dialog') && answer === 'not answered', 'the editor and the question are back, still unanswered');
    EV.ui.dismissDialog(); await wait(60);
    eq(answer, false, 'the question is answered only by the person who can see it');
    await EV.auth.clearPasscode('lock screen 123');
    EV.ui.sheets.length = 0; EV.redraw(); await wait(60);
    console.error = orig;
    eq(errs, [], 'no console errors while rendering');
  });
  test('phone layout and restart: a second copy of the application reloads every record from the device, and every screen fits a 390 px wide viewport', async function () {
    R.reconcileFollowups();
    await store.flush();
    const frame = document.createElement('iframe');
    frame.setAttribute('title', 'Application at phone width');
    frame.style.cssText = 'position:fixed;left:0;top:0;width:390px;height:844px;border:0;z-index:2147483000;background:#000';
    const loaded = new Promise(function (res, rej) { frame.onload = res; setTimeout(function () { rej(new Error('the phone frame did not load')); }, 20000); });
    frame.src = 'frame.html?db=' + encodeURIComponent(window.EV_DB_NAME);
    document.body.appendChild(frame);
    const measured = [];
    try {
      await loaded;
      const w = frame.contentWindow, d = w.document;
      for (let i = 0; i < 300 && !d.querySelector('.shell'); i++) await wait(50);
      assert(d.querySelector('.shell'), 'the application did not start in the phone frame: ' + (d.body.textContent || '').slice(0, 160));
      eq([w.innerWidth, w.innerHeight], [390, 844], 'frame viewport');
      /* the frame is the application started again from what is stored on the device (reload / restore) */
      S.TABLES.forEach(function (t) { eq(w.EV.store.raw(t).length, store.raw(t).length, 'a restarted application reloads every record: ' + t); });
      const openAudit = store.all('audits').find(function (a) { return a.status === 'in_progress'; });
      assert(openAudit, 'there is an audit in progress to resume');
      eq([w.EV.rules.auditProgress(openAudit.id).tests.done, w.EV.rules.auditProgress(openAudit.id).overall], [R.auditProgress(openAudit.id).tests.done, R.auditProgress(openAudit.id).overall], 'an audit in progress resumes exactly where it was left');
      eq(w.EV.auth.profile().name, EV.auth.profile().name, 'the auditor profile is restored');
      const a22B = store.all('audits').find(function (a) { return a.is_demo && (store.get('rooms', a.room_id) || {}).number === '22B'; });
      const f22 = store.all('floors').find(function (f) { return f.is_demo && f.number === '22'; });
      const dev = store.all('devices').find(function (x) { return x.hostname === 'DEMO-22B-CAM01'; });
      const routes = ['/', '/environment', '/floor/' + f22.id, '/room/' + a22B.room_id, '/audits', '/audit/' + a22B.id, '/devices', '/devices?filter=incomplete', '/infrastructure', '/infrastructure?tab=switches',
        '/infrastructure?tab=addressing', '/infrastructure?tab=dependencies', '/infrastructure?tab=validation', '/backlog', '/backlog?tab=triage', '/backlog/' + ctx.bl1.id, '/coordination', '/spares', '/reports',
        '/reports/executive', '/reports/room?audit=' + a22B.id, '/reports/devices', '/reports/network', '/export', '/settings'];
      /* one-handed use: every control that is tapped is at least 44 px in both directions. A switch, a text link and a
         tappable chip keep their look and carry a 44 px touch area around them instead. */
      let controls = 0;
      const tapSizes = function (label) {
        const tiny = Array.prototype.filter.call(d.querySelectorAll('button, a[href], input:not([type=file]), select, textarea, label.btn, [role=button]'), function (el) {
          const b = el.getBoundingClientRect();
          if (b.width === 0 || b.height === 0) return false;
          controls++;
          if (el.classList.contains('toggle') || el.classList.contains('link') || el.classList.contains('chip-btn')) {
            const around = w.getComputedStyle(el, '::after');
            return !(parseFloat(around.minWidth) >= 44 && parseFloat(around.minHeight) >= 44);
          }
          return b.width < 43.5 || b.height < 43.5;
        });
        assert(tiny.length === 0, tiny.length + ' control(s) smaller than 44 px on ' + label + ': ' + tiny.slice(0, 4).map(function (el) { const b = el.getBoundingClientRect(); return el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0] + ' ' + Math.round(b.width) + '×' + Math.round(b.height); }).join(', '));
      };
      const fits = function (label) {
        tapSizes(label);
        const main = d.getElementById('main-scroll');
        assert(!d.querySelector('.crash'), 'screen crashed at phone width: ' + label);
        assert(d.documentElement.scrollWidth <= 391 && d.body.scrollWidth <= 391, 'the page is wider than the screen on ' + label + ' (' + d.documentElement.scrollWidth + ' px)');
        assert(main.scrollWidth <= main.clientWidth + 1, 'content spills sideways on ' + label + ' (' + main.scrollWidth + ' px in ' + main.clientWidth + ' px)');
        const nav = d.querySelector('.bottomnav'), nr = nav.getBoundingClientRect();
        assert(w.getComputedStyle(nav).display !== 'none' && nr.left >= 0 && nr.right <= 390.5 && nr.bottom <= 844.5 && nr.top > 700, 'the bottom navigation is not at the bottom of the screen on ' + label);
        /* nothing inside the page reaches past the right edge unless its own container scrolls sideways */
        const stray = Array.prototype.filter.call(main.querySelectorAll('*'), function (el) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.right <= 390.5) return false;
          for (let p = el.parentElement; p && p !== main; p = p.parentElement) { const ox = w.getComputedStyle(p).overflowX; if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return false; }
          return true;
        });
        assert(stray.length === 0, stray.length + ' element(s) reach past the right edge on ' + label + ': ' + stray.slice(0, 3).map(function (el) { return el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0]; }).join(', '));
        measured.push(label);
      };
      for (const r of routes) { w.EV.go(r); await wait(110); fits(r); }
      /* every audit section open at once (the longest screen in the application) */
      ['summary', 'devices', 'testing', 'photos', 'findings', 'network', 'notes'].forEach(function (k) { w.EV.ui.open['aud:' + a22B.id + ':' + k] = true; });
      w.EV.go('/audit/' + a22B.id); await wait(200); fits('audit with every section open');
      assert(d.querySelectorAll('.test').length >= 11, 'test rows rendered in the frame');
      /* thumb reach: the five bottom-navigation targets are at least 44 px in both directions */
      const targets = d.querySelectorAll('.bottomnav button');
      eq(targets.length, 5);
      Array.prototype.forEach.call(targets, function (b) { const r = b.getBoundingClientRect(); assert(r.width >= 44 && r.height >= 44, 'bottom navigation target is ' + Math.round(r.width) + '×' + Math.round(r.height) + ' px'); });
      /* editors are sheets that fit the screen */
      const sheets = [['device editor', function () { return w.EV.editors.device(dev.id); }], ['finding editor', function () { return w.EV.editors.finding(ctx.f1.id); }], ['room editor', function () { return w.EV.editors.room(a22B.room_id); }],
        ['quick actions', function () { return w.EV.openNew(); }], ['photograph viewer', function () { return w.EV.photos.openViewer(store.all('photos').find(function (p) { return p.is_demo; }).id); }]];
      for (const s of sheets) {
        s[1](); await wait(160);
        const el = d.querySelector('.sheet');
        assert(el, s[0] + ' did not open in the frame');
        const r = el.getBoundingClientRect();
        assert(r.left >= -0.5 && r.right <= 390.5 && r.bottom <= 844.5, s[0] + ' is not within the screen (' + Math.round(r.left) + '–' + Math.round(r.right) + ' px wide, bottom ' + Math.round(r.bottom) + ')');
        assert(el.scrollWidth <= el.clientWidth + 1, s[0] + ' content spills sideways (' + el.scrollWidth + ' px in ' + el.clientWidth + ' px)');
        tapSizes(s[0]);
        if (s[0] === 'photograph viewer') {
          /* the annotation tool: pen colours, undo and the drawing surface, opened from the viewer */
          const annotate = Array.prototype.find.call(el.querySelectorAll('button'), function (b) { return /Annotate/.test(b.textContent); });
          assert(annotate, 'the viewer offers Annotate');
          annotate.click();
          for (let i = 0; i < 60 && !d.querySelector('.annot-canvas'); i++) await wait(50);
          assert(d.querySelector('.annot-canvas') && d.querySelectorAll('.swatch').length === 4, 'the annotation tool opened with its four pen colours');
          const stage = d.querySelector('.annot-canvas').getBoundingClientRect();
          assert(stage.width > 200 && stage.right <= 390.5, 'the drawing surface fits the screen (' + Math.round(stage.width) + ' px wide)');
          tapSizes('annotation tool');
        }
        w.EV.ui.closeAll(); w.EV.redraw(); await wait(80);
      }
      eq(measured.length, routes.length + 1);
      assert(controls > 600, 'touch targets measured: ' + controls);
    } finally { frame.remove(); }
  });
  test('iPhone file delivery: the file is offered in a sheet, shared only on a tap, and a dismissed sheet is not a save', async function () {
    const env = EV.env, was = { ios: env.ios, embedded: env.embedded };
    let shared = null;
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: function (d) { return !!(d && d.files && d.files.length); } });
    Object.defineProperty(navigator, 'share', { configurable: true, value: function (d) { shared = d; return Promise.resolve(); } });
    env.ios = true; env.embedded = false;
    try {
      const p = EV.saveFile(new Blob(['hello'], { type: 'text/plain' }), 'note.txt', 'text/plain');
      await wait(140);
      const btn = document.getElementById('offer-share');
      assert(btn && document.getElementById('offer-download'), 'file-ready sheet shows Share and Download');
      assert(/note\.txt/.test(document.querySelector('.sheet').textContent), 'sheet names the file');
      eq(shared, null, 'nothing is shared before the tap');
      btn.click();
      const res = await p;
      eq([res.ok, res.via], [true, 'share']); assert(shared && shared.files.length === 1 && shared.files[0].name === 'note.txt', 'the file itself was handed to the share sheet');
      await wait(60);
      assert(!document.getElementById('offer-share'), 'sheet closed after sharing');
      const p2 = EV.saveFile(new Blob(['x']), 'x.bin');
      await wait(140);
      assert(document.getElementById('offer-share'), 'sheet opened again');
      EV.ui.closeSheet();
      const res2 = await p2;
      eq(res2.ok, false, 'a dismissed sheet is reported as not saved');
      /* a browser that cannot share this file type falls back to a plain download */
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: function () { return false; } });
      const clicks = []; const origClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () { clicks.push(this.download); };
      try { const res3 = await EV.saveFile(new Blob(['y']), 'y.zip', 'application/zip'); eq([res3.ok, res3.via], [true, 'download']); eq(clicks, ['y.zip']); }
      finally { HTMLAnchorElement.prototype.click = origClick; }
    } finally { env.ios = was.ios; env.embedded = was.embedded; delete navigator.share; delete navigator.canShare; EV.ui.sheets.length = 0; EV.redraw(); }
  });
  test('archiving a floor takes its devices out of the open follow-up tasks; restoring it brings them back', async function () {
    const f22 = store.all('floors').find(function (f) { return f.is_demo && f.number === '22'; });
    const onFloor = function () { return R.openFollowups().filter(function (f) { const d = store.get('devices', f.device_id); return d && d.floor_id === f22.id; }).length; };
    R.reconcileFollowups();
    const before = onFloor(), stats = R.deviceStats().incomplete;
    assert(before > 0, 'the demo floor has open follow-up tasks');
    store.update('floors', f22.id, { archived: true });
    await wait(700);   /* reconciliation is debounced */
    eq(onFloor(), 0, 'no open task is left for a device on an archived floor');
    assert(R.deviceStats().incomplete < stats, 'and its devices are no longer counted as incomplete');
    store.update('floors', f22.id, { archived: false });
    await wait(700);
    eq(onFloor(), before, 'the tasks are open again once the floor is restored');
  });
  test('offline shell: the service worker installs, and every file the application page loads is in its cache', async function () {
    assert('serviceWorker' in navigator && window.isSecureContext && window.caches, 'service workers are not available in this test browser');
    const version = /const VERSION = '([0-9a-f]+)'/.exec(await (await fetch('../app/sw.js', { cache: 'no-store' })).text());
    assert(version, 'app/sw.js carries a build version (run tools\\build.ps1)');
    const workerSource = await (await fetch('../app/sw.js', { cache: 'no-store' })).text();
    assert(/new Request\(f, \{ cache: 'reload' \}\)/.test(workerSource) && /cache\.addAll\(fresh\)/.test(workerSource),
      'a new version fetches its files from the server, never from the browser\'s HTTP cache');
    /* the cache is named after the folder the worker is served from, so another copy on this origin is not involved */
    const name = 'av-environment-intelligence-' + new URL('../app/', location.href).pathname + '-' + version[1];
    /* a cache left by an earlier version of this copy (under the name those versions used) */
    const oldCache = 'evcr-av-intelligence-' + new URL('../app/', location.href).pathname + '-0123456789ab';
    await (await caches.open(oldCache)).put(new URL('../app/old-file.txt', location.href).href, new Response('old'));
    const reg = await navigator.serviceWorker.register('../app/sw.js', { scope: '../app/' });
    try {
      const worker = reg.installing || reg.waiting || reg.active;
      for (let i = 0; i < 400 && worker.state !== 'activated' && worker.state !== 'redundant'; i++) await wait(50);
      eq(worker.state, 'activated', 'the service worker installed (one missing file in its list makes the whole installation fail)');
      assert((await caches.keys()).indexOf(name) >= 0, 'the application cache exists: ' + name);
      assert((await caches.keys()).indexOf(oldCache) < 0, 'the cache of an earlier version is removed');
      /* Settings shows the version the worker reports */
      const answer = new Promise(function (res) {
        const on = function (e) { if (e.data && e.data.type === 'version') { navigator.serviceWorker.removeEventListener('message', on); res(e.data.version); } };
        navigator.serviceWorker.addEventListener('message', on); setTimeout(function () { res(null); }, 3000);
      });
      reg.active.postMessage('version');
      eq(await answer, version[1], 'the worker answers with its own version');
      const cache = await caches.open(name);
      const html = await (await fetch('../app/index.html', { cache: 'no-store' })).text();
      const need = ['index.html'];
      html.replace(/<script src="([^"]+)"/g, function (x, s) { need.push(s); return x; });
      html.replace(/<link[^>]+href="([^"]+)"/g, function (x, s) { need.push(s); return x; });
      assert(need.length > 30, 'file list read from the application page (' + need.length + ')');
      for (const f of need) assert(await cache.match(new URL('../app/' + f, location.href).href), 'not available offline: ' + f);
      /* and nothing else is cached: no audit record or photograph ever goes into the page cache */
      const cached = (await cache.keys()).map(function (r) { return new URL(r.url).pathname; });
      assert(cached.every(function (p) { return /^\/app\/($|index\.html$|manifest\.webmanifest$|css\/|js\/|icons\/)/.test(p); }), 'only application files are cached: ' + cached.filter(function (p) { return !/^\/app\//.test(p); }).join(', '));
      /* the file list in the worker is the list of files that exist: every script on disk is named in the page */
      eq(cached.filter(function (p) { return /\.js$/.test(p); }).length, need.filter(function (f) { return /\.js$/.test(f); }).length, 'cached scripts = scripts the page loads');
    } finally {
      await reg.unregister();
      await caches.delete(name); await caches.delete(oldCache);
    }
  });

  test('a divisible room is audited as one combined configuration; a custom device type, a test comment and a test photograph are kept; a naming inconsistency is suggested, not recorded', async function () {
    const type = S.ROOM_TYPES.find(function (t) { return /divis|multi|train/i.test(t); }) || S.ROOM_TYPES[0];
    const north = A.addRoom(ctx.f, { number: '5N', name: 'Divisible North', room_type: type, capacity: 20 });
    const south = A.addRoom(ctx.f, { number: '5S', name: 'Divisible South', room_type: type, capacity: 20 });
    const cfg = store.create('room_configurations', { building_id: ctx.b.id, floor_id: ctx.f.id, name: '5N + 5S combined', description: 'Partition open', capacity: 40, notes: '', archived: false });
    [south, north].forEach(function (r) { store.create('room_configuration_members', { id: U.keyId('config-member', cfg.id + ':' + r.id), configuration_id: cfg.id, room_id: r.id }); });
    const a = A.startAudit({ config: cfg });
    eq([a.room_id, a.configuration_id, R.auditTitle(a), R.configState(cfg.id).state], [null, cfg.id, '5N + 5S combined', 'in_progress']);
    eq(R.auditRooms(a).map(function (r) { return r.number; }), ['5N', '5S'], 'member rooms, always in the same order');
    eq(A.resumeOrStart({ config: cfg }).id, a.id, 'the combined audit is resumed, not duplicated');
    eq([R.roomState(north.id).state, store.by('functional_tests', 'audit_id', a.id).length], ['not_started', 52], 'the member rooms keep their own audit state');
    /* devices of both member rooms belong to the combined audit; a type that is not in the list is recorded as typed */
    const d1 = A.addDevice({ room: north, audit: a }, 'Other'), d2 = A.addDevice({ room: south, audit: a }, 'Display');
    store.update('devices', d1.id, { custom_category: 'Partition sensor', manufacturer: 'Demo', model: 'PS-1', hostname: 'T-5N-PS01' });
    eq([R.deviceType(store.get('devices', d1.id)), R.auditDevices(a).length, R.auditProgress(a.id).devices.total, R.auditProgress(a.id).isConfig], ['Partition sensor', 2, 2, true]);
    const row = EV.exporter.row('devices', store.get('devices', d1.id)), cols = EV.exporter.columns('devices');
    assert(row.indexOf('Partition sensor') >= 0, 'the custom type is in the export row: ' + cols.filter(function (c, i) { return row[i] === 'Partition sensor'; }).join(', '));
    /* a comment and a photograph on one functional test */
    const t = store.by('functional_tests', 'audit_id', a.id)[3];
    A.setTest(t.id, 'investigate');
    store.update('functional_tests', t.id, { comment: 'Picture tears when the partition is open' });
    const pb = await EV.photos.demoBlob('Test', 'evidence', 60);
    const ph = await EV.photos.add(new File([pb], 't.jpg', { type: 'image/jpeg' }), { audit: a, room: north, test_id: t.id, category: 'Other' });
    eq([ph.test_id, ph.audit_id, ph.room_id, store.by('photos', 'test_id', t.id).length], [t.id, a.id, north.id, 1]);
    const f = A.confirmTestFinding(t.id);
    eq([store.get('functional_tests', t.id).comment, f.test_id, f.audit_id], ['Picture tears when the partition is open', t.id, a.id], 'the comment stays on the test, and the finding points at the test');
    assert(A.backlogPhotos(A.promoteFinding(f.id)).some(function (p) { return p.id === ph.id; }), 'the test photograph follows the finding into the backlog item');
    /* three hostnames that follow no single convention: an insight is offered; nothing is recorded until the auditor acts */
    store.update('devices', d2.id, { manufacturer: 'Demo', model: 'D-1', hostname: 'display_south' });
    const d3 = A.addDevice({ room: south, audit: a }, 'Camera'); store.update('devices', d3.id, { manufacturer: 'Demo', model: 'C-1', hostname: 'CAM-5S-01' });
    const d4 = A.addDevice({ room: south, audit: a }, 'DSP'); store.update('devices', d4.id, { manufacturer: 'Demo', model: 'P-1', hostname: '5s.dsp.main' });
    const findingsBefore = store.all('findings').length;
    const naming = R.insights().find(function (i) { return i.kind === 'naming' && i.room_id === south.id; });
    assert(naming && /do not follow one convention/.test(naming.detail) && !naming.tracked, 'naming inconsistency suggested for the room');
    eq(store.all('findings').length, findingsBefore, 'an insight creates no record by itself');
    /* deleting a photograph removes the picture itself, not just its place in the gallery */
    const pb2 = await EV.photos.demoBlob('Delete', 'me', 80);
    const gone = await EV.photos.add(new File([pb2], 'd.jpg', { type: 'image/jpeg' }), { audit: a, room: south, category: 'Other' });
    await EV.photos.rotate(store.get('photos', gone.id));
    assert((await store.blobGet(gone.id)) && (await store.blobGet(gone.id + ':edit')) && store.get('photos', gone.id).thumb, 'the photograph has an original, an edited rendition and a thumbnail');
    await EV.photos.remove(store.get('photos', gone.id)); await wait(80);
    const tomb = store.getAny('photos', gone.id);
    eq([!!tomb.deleted_at, tomb.thumb, await store.blobGet(gone.id), await store.blobGet(gone.id + ':edit'), !store.get('photos', gone.id)], [true, '', null, null, true],
      'the record stays as history; the thumbnail and both image files are gone from the device');
    assert((await store.blobKeys()).every(function (k) { return k.indexOf(gone.id) < 0; }), 'so it cannot reach a backup');
    /* completing the combined audit moves the configuration, not the individual rooms */
    A.completeAudit(store.get('audits', a.id));
    eq([R.configState(cfg.id).state, R.roomState(north.id).state], ['audited', 'not_started']);
  });
  test('a data-quality exception keeps the same exception ID from one package to the next, and loses it when it is resolved', function () {
    const ids = function () {
      const out = {};
      X.validate(X.collect(X.resolveScope({ mode: 'full' })), null, null).checks.forEach(function (c) { c.records.forEach(function (r) { out[c.key + '|' + (r.record_id || r.detail)] = r.exception_id; }); });
      return out;
    };
    const first = ids();
    const keys = Object.keys(first);
    assert(keys.length > 10, 'the data set has exceptions to follow (' + keys.length + ')');
    assert(keys.every(function (k) { return /^DQ-[0-9A-F]{12}$/.test(first[k]); }), 'ID format');
    eq(new Set(keys.map(function (k) { return first[k]; })).size, keys.length, 'one ID per check and record');
    /* unrelated work happens; the same exceptions keep their IDs */
    const other = A.addDevice({ room: ctx.r2 }, 'UPS');
    const second = ids();
    keys.forEach(function (k) { eq(second[k], first[k], 'unchanged exception ' + k); });
    const added = Object.keys(second).filter(function (k) { return !first[k]; });
    assert(added.length >= 1 && added.every(function (k) { return k.indexOf(other.id) >= 0; }), 'the new device brings its own exceptions and nothing else changes');
    /* resolving a record's problem removes exactly its exceptions */
    store.update('devices', other.id, { manufacturer: 'Demo', model: 'U-1', ip_status: 'not_applicable', mac_status: 'not_applicable', serial_status: 'not_applicable', connection_type: 'Not networked' });
    const third = ids();
    eq(Object.keys(third).filter(function (k) { return k.indexOf(other.id) >= 0; }), [], 'resolved exceptions are gone');
    keys.forEach(function (k) { eq(third[k], first[k]); });
    store.update('devices', other.id, { archived: true });
  });

  /* ------------------------------------------------------------------ hosted demonstration copy
   * tests/hosted-frame.html runs the application under a stand-in for the page host of the published demonstration
   * copy (tests/hosted-preload.js): window.claude.use() and its save function, as the host's type definitions give them. */
  test('hosted demonstration copy: opens in the labelled demo environment; a file leaves only through the host\'s save function; a save that did not happen is never reported as one; blocked storage does not stop the page', async function () {
    const dbs = [];
    const db = function (tag) { const n = window.EV_DB_NAME + '_hosted_' + tag; dbs.push(n); return n; };
    const open = async function (query, sandbox) {
      const frame = document.createElement('iframe');
      frame.setAttribute('title', 'Hosted demonstration copy');
      if (sandbox) frame.setAttribute('sandbox', sandbox);
      frame.style.cssText = 'position:fixed;left:0;top:0;width:390px;height:844px;border:0;z-index:2147483000;background:#000';
      const loaded = new Promise(function (res, rej) { frame.onload = res; setTimeout(function () { rej(new Error('the hosted frame did not load')); }, 20000); });
      frame.src = 'hosted-frame.html?' + query;
      document.body.appendChild(frame);
      await loaded;
      return frame;
    };
    const started = async function (frame) {
      const d = frame.contentWindow.document;
      for (let i = 0; i < 400 && !d.querySelector('.shell'); i++) await wait(50);
      assert(d.querySelector('.shell'), 'the hosted copy did not start: ' + (d.body.textContent || '').slice(0, 200));
      return frame.contentWindow;
    };
    /* 1 — the host offers its save function */
    let frame = await open('db=' + db('ok') + '&downloads=ok');
    try {
      const w = await started(frame), d = w.document;
      eq([w.EV.env.hosted, w.EV.env.embedded, w.EV.router.useHash, !!d.querySelector('.gate')], [true, true, false, false], 'hosted: in-memory routes and no set-up screen');
      eq([w.EV.auth.profile().name, w.EV.store.all('rooms').filter(function (r) { return r.is_demo; }).length, w.EV.store.all('rooms').filter(function (r) { return !r.is_demo; }).length], ['Demo Auditor', 8, 0],
        'it opens in the synthetic demo environment');
      const banner = d.querySelector('.demo-banner-hosted');
      assert(banner && /DEMONSTRATION COPY/.test(banner.textContent) && /do not enter real client information/.test(banner.textContent), 'the notice is on screen');
      const span = banner.querySelector('span');
      assert(span.scrollWidth <= span.clientWidth + 1 && banner.getBoundingClientRect().right <= 390.5, 'and it is not cut short at phone width');
      for (const r of ['/', '/audits', '/devices', '/backlog', '/export', '/settings']) {
        w.EV.go(r); await wait(130);
        const m = d.getElementById('main-scroll');
        assert(!d.querySelector('.crash') && d.querySelector('.demo-banner-hosted') && m.scrollWidth <= m.clientWidth + 1, 'the notice is on every screen and the screen fits: ' + r);
      }
      eq(w.location.hash, '', 'no "#/path" address is used');
      const settings = d.querySelector('.page').textContent;
      assert(/Not available in this hosted demonstration copy/.test(settings) && !d.getElementById('sync-url'), 'no workspace can be connected from the hosted copy');
      assert(/Demonstration copy/.test(settings) && /not a client system/.test(settings), 'Settings says what this copy is');
      assert(!w.navigator.serviceWorker || !(await w.navigator.serviceWorker.getRegistration('./')), 'no service worker is registered by the hosted copy');
      /* saving goes through the host, as a Blob with an allowed extension, and never through a download the page starts */
      const clicks = []; const origClick = w.HTMLAnchorElement.prototype.click; w.HTMLAnchorElement.prototype.click = function () { clicks.push(this.download); };
      try {
        const r1 = await w.EV.saveFile(new w.Blob(['a,b\r\n1,2\r\n'], { type: 'text/csv' }), 'list.csv', 'text/csv');
        eq([r1.ok, r1.via, w.__saves.length, w.__saves[0].filename, w.__saves[0].kind], [true, 'claude', 1, 'list.csv', 'Blob']);
        const pkg = await w.EV.exporter.build({ mode: 'full', photoMode: 'original' });
        const dres = await w.EV.exporter.deliver(pkg, false);
        const last = w.__saves[w.__saves.length - 1];
        eq([dres.ok, w.EV.store.get('exports', pkg.id).status, /^AVEI_AV_Audit_Export_.*\.zip$/.test(last.filename), last.size], [true, 'success', true, pkg.blob.size], 'a daily export is handed to the host whole');
        const r2 = await w.EV.saveFile(new w.Blob(['x']), 'IMG_0001.heic', 'image/heic');
        assert(!r2.ok && r2.code === 'rejected_extension' && /cannot be saved/.test(r2.message), 'a file type the host refuses is reported as not saved');
        eq(clicks, [], 'the page started no download of its own');
      } finally { w.HTMLAnchorElement.prototype.click = origClick; }
    } finally { frame.remove(); }
    /* 2 — the viewer declines, and 3 — the save function is not available: nothing is delivered, nothing is claimed */
    for (const mode of ['declined', 'none']) {
      frame = await open('db=' + db(mode) + '&downloads=' + mode);
      try {
        const w = await started(frame);
        const clicks = []; const origClick = w.HTMLAnchorElement.prototype.click; w.HTMLAnchorElement.prototype.click = function () { clicks.push(this.download); };
        try {
          const pkg = await w.EV.exporter.build({ mode: 'full', photoMode: 'none' });
          const res = await w.EV.exporter.deliver(pkg, false);
          eq([res.ok, res.code, w.EV.store.get('exports', pkg.id).status, Object.keys(w.EV.exporter.ledger()).length, clicks.length], [false, mode === 'declined' ? 'declined' : 'unavailable', 'generated', 0, 0],
            'save ' + mode + ': the package is not marked delivered, the ledger is untouched and no download is attempted');
          assert(res.message && res.message.length > 10, 'and the reason is given: ' + res.message);
        } finally { w.HTMLAnchorElement.prototype.click = origClick; }
      } finally { frame.remove(); }
    }
    /* 4 — the built single-file page itself, in a frame that allows scripts and nothing else: no storage of any kind
       (as in a private window or a preview). It must still open, in memory, and say that nothing will be kept. */
    const built = await fetch('../dist/artifact/av-environment-intelligence.html', { cache: 'no-store' });
    assert(built.ok, 'the single-file build is missing: run tools\\build.ps1');
    const page = await built.text();
    assert(!/<script[^>]+src=/i.test(page) && !/<link[^>]+href=/i.test(page) && page.indexOf('<title>AV Environment Intelligence</title>') === 0, 'the single-file page loads nothing from anywhere and starts with its title');
    const standIn = await (await fetch('hosted-preload.js', { cache: 'no-store' })).text();
    const token = 'r' + Date.now(), notes = [];
    const report = new Promise(function (resolve, reject) {
      const onMsg = function (ev) {
        const data = ev.data || {};
        if (data.evHostedNote && data.evHostedNote.token === token) notes.push(data.evHostedNote.kind + ': ' + data.evHostedNote.detail);
        if (data.evHostedReport && data.evHostedReport.token === token) { window.removeEventListener('message', onMsg); resolve(data.evHostedReport); }
      };
      window.addEventListener('message', onMsg);
      setTimeout(function () { window.removeEventListener('message', onMsg); reject(new Error('the storage-blocked page did not report (' + notes.join('; ') + ')')); }, 40000);
    });
    frame = document.createElement('iframe');
    frame.setAttribute('title', 'Single-file page without storage');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.style.cssText = 'position:fixed;left:0;top:0;width:390px;height:844px;border:0;z-index:2147483000;background:#000';
    frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' +
      '<script>window.EV_HOSTED_TEST = ' + JSON.stringify('downloads=ok&report=' + token) + ';<\/script><script>' + standIn + '<\/script>' + page + '</body></html>';
    document.body.appendChild(frame);
    try {
      const m = await report;
      eq([m.shell, m.crash, m.gate, m.memoryOnly, m.rooms], [true, false, false, true, 8], 'with storage blocked the demonstration still opens, held in memory (' + notes.join('; ') + ') ' + m.boot);
      assert(/DEMONSTRATION COPY/.test(m.banner) && /will not survive a reload|unavailable/i.test(m.statusBanner), 'and the page says so: ' + m.statusBanner);
      eq(notes.filter(function (n) { return n.indexOf('started') !== 0; }), [], 'no script error in the locked-down frame');
    } finally { frame.remove(); }
    dbs.forEach(function (n) { try { indexedDB.deleteDatabase(n); } catch (e) { /* ignore */ } });
  });

  /* ------------------------------------------------------------------ room list import, production build */
  test('room list import: a CSV becomes buildings, floors, areas and rooms; nothing is guessed, a value already set is not changed, and a second import adds nothing', function () {
    const RI = EV.roomImport;
    eq(EV.csv.parse('﻿a;b\r\n"x;1";"say ""hi"""\r\n\r\n"two\nlines";z\r\n'), [['a', 'b'], ['x;1', 'say "hi"'], ['two\nlines', 'z']], 'CSV reader: BOM, semicolons, quotes, line breaks, blank lines');
    eq(csvParse(RI.template().replace(/^﻿/, ''))[0].slice(0, 8), ['Building', 'Building ID', 'Address', 'Floor', 'Floor designation', 'Area', 'Room number', 'Room name'], 'template header');
    let refused = ''; try { RI.read('Room,Seats\r\nA,4\r\n'); } catch (e) { refused = e.message; }
    assert(/Needed: Building, Floor/.test(refused), 'a list without the needed columns is refused: ' + refused);
    const before = {}; ['buildings', 'floors', 'areas', 'rooms'].forEach(function (t) { before[t] = store.all(t).length; });
    const r1Before = JSON.stringify(store.get('rooms', ctx.r1.id));
    const csv = [
      'Site,Level,Zone,Room No,Space Name,Type,Seats,Criticality,VC Platform,Comments,Owner',
      'Import Tower,31,East,31A,Board Room,boardroom,18,Executive / critical,Zoom Rooms,"Glass wall, north",Facilities',
      'Import Tower,31,East,31B,Huddle,Phone booth,four,urgent,Skype,,',
      'Import Tower,31,,31A,Board Room again,Boardroom,18,,,,',
      'Import Tower,32,,,Lobby display,Support area,,,,,',
      'Import Tower,,,33A,No floor,,,,,,',
      ',40,,40A,No building,,,,,,',
      'Import Tower,32,,,,,,,,,',
      'Test Tower,5,,5A,Should not change,Boardroom,99,,,,'
    ].join('\r\n') + '\r\n';
    const parsed = RI.read(csv);
    eq([parsed.rows.length, parsed.unknown], [8, ['Owner']], 'eight lines read; the unused column is named');
    const plan = RI.plan(parsed); RI.needed(plan);
    eq(plan.rows.map(function (r) { return r.status; }), ['new', 'new', 'duplicate', 'new', 'error', 'error', 'error', 'exists']);
    eq(plan.counts, { rooms: 3, fill: 0, fields: 0, exists: 1, duplicate: 1, error: 3, buildings: 1, floors: 2, areas: 1, unfit: 1, noType: 1 });
    eq(['buildings', 'floors', 'areas', 'rooms'].map(function (t) { return store.all(t).length - before[t]; }), [0, 0, 0, 0], 'planning writes nothing');
    const createdBefore = store.all('activity_log').filter(function (l) { return l.action === 'created'; }).length;
    const done = RI.apply(plan, 'rooms.csv');
    eq(done, { rooms: 3, buildings: 1, floors: 2, areas: 1, filled: 0, fields: 0 });
    eq(['buildings', 'floors', 'areas', 'rooms'].map(function (t) { return store.all(t).length - before[t]; }), [1, 2, 1, 3]);
    const tower = store.all('buildings').find(function (b) { return b.name === 'Import Tower'; });
    const room = function (n) { return store.all('rooms').find(function (r) { return r.building_id === tower.id && (r.number === n || r.name === n); }); };
    const a = room('31A'), b = room('31B'), lobby = room('Lobby display');
    eq([a.name, a.room_type, a.capacity, a.criticality, a.conferencing_platform, a.notes, !!a.area_id, /^AVEI-RM-\d{4}$/.test(a.code), a.is_demo], ['Board Room', 'Boardroom', 18, 'critical', 'Zoom Rooms', 'Glass wall, north', true, true, false], 'values that fit are taken as written');
    eq([b.room_type, b.capacity, b.criticality, b.conferencing_platform], ['', null, '', ''], 'values that do not fit are left empty, never replaced by a guess');
    assert(/Room type in the source list: Phone booth/.test(b.notes) && /Capacity in the source list: four/.test(b.notes) && /Criticality in the source list: urgent/.test(b.notes) && /Skype/.test(b.notes), 'and the original text is kept in the notes: ' + b.notes);
    assert(X.incomplete('rooms', b).indexOf('room type missing') >= 0, 'such a room is flagged incomplete');
    eq([lobby.number, lobby.room_type, store.get('floors', lobby.floor_id).number, store.get('floors', lobby.floor_id).sort_order], ['', 'Support area', '32', 32], 'a room without a number is placed by its name');
    eq(JSON.stringify(store.get('rooms', ctx.r1.id)), r1Before, 'a room that already exists is not touched');
    assert(store.all('activity_log').some(function (l) { return l.action === 'imported' && /3 rooms, 2 floors, 1 building/.test(l.summary) && /5 lines not imported/.test(l.summary); }), 'the import is in the change history');
    const again = RI.plan(RI.read(csv)); RI.needed(again);
    eq(store.all('activity_log').filter(function (l) { return l.action === 'created'; }).length - createdBefore, 7, 'every created building, floor, area and room has its own entry in the change history');
    eq(RI.apply(plan, 'rooms.csv').rooms, 0, 'applying the same plan a second time writes nothing: the list is checked again against the records as they are');
    eq(store.all('rooms').length - before.rooms, 3);
    /* lines that cannot be placed with certainty are not imported */
    store.update('buildings', tower.id, { identifier: 'IT-1' }, { silent: true });
    const hard = RI.read('Building,Building ID,Floor,Room No.,Room,Name\r\n\r\nImport Tower,,40,10.1,x,Dot\r\nImport Tower,,40,10-1,x,Dash\r\nImport Tower,,40,40C,x,"a, b",stray\r\n"Import  tower ",,40,"multi\nline",x,Two\r\nImport Tower,ZZ-9,41,41A,x,Wrong id\r\n');
    eq([hard.unknown, hard.columns.indexOf('number') >= 0, hard.columns.indexOf('name') >= 0], [['Room'], true, true], 'a header with a full stop is recognised; a column name is used once');
    const hp = RI.plan(hard);
    eq(hp.rows.map(function (r) { return r.line; }), [3, 4, 5, 6, 8], 'line numbers are those of the file, counting blank lines and line breaks inside values');
    eq(hp.rows.map(function (r) { return r.status; }), ['new', 'new', 'error', 'new', 'error'], '10.1 and 10-1 are different rooms; a line with too many values and a conflicting Building ID are refused');
    assert(/more values than the header/.test(hp.rows[2].problems[0]) && /has the ID/.test(hp.rows[4].problems[0]), 'and each says why: ' + hp.rows[2].problems[0] + ' / ' + hp.rows[4].problems[0]);
    eq([hp.counts.buildings, hp.counts.floors], [0, 1], 'a building written with other spacing or case is the same building');
    store.update('buildings', tower.id, { archived: true }, { silent: true });
    const ap = RI.plan(hard);
    assert(ap.rows.every(function (r) { return r.status === 'error'; }) && /archived/.test(ap.rows[0].problems[0]), 'nothing is imported into an archived building');
    store.update('buildings', tower.id, { archived: false }, { silent: true });
    let ro = ''; store.readOnly = true; try { RI.apply(hp, 'x.csv'); } catch (e) { ro = e.message; } finally { store.readOnly = false; }
    assert(/read-only/.test(ro) && !store.all('rooms').some(function (r) { return r.number === '10.1'; }), 'a read-only account cannot import');
    let empty = ''; try { RI.read('Building,Floor,Room number\r\n'); } catch (e) { empty = e.message; }
    assert(/no rooms/.test(empty), 'a header-only file is refused with a clear message: ' + empty);
    eq([again.counts.rooms, again.counts.buildings, again.counts.floors, again.counts.areas, again.counts.exists], [0, 0, 0, 0, 5], 'importing the same list again adds nothing');
    eq(X.validate(X.collect(X.resolveScope({ mode: 'full' })), null, null).structural_errors, 0, 'imported records export cleanly');
  });
  test('room list import fills in existing rooms: only empty fields take the list\'s value, set values and notes are never changed, the space summary columns are read', function () {
    const RI = EV.roomImport;
    RI.apply(RI.read('Building,Floor,Room number\r\nFill Tower,7,7A\r\nFill Tower,7,7B\r\n'), 'first.csv');
    const tower = store.all('buildings').find(function (b) { return b.name === 'Fill Tower'; });
    const room = function (n) { return store.all('rooms').find(function (r) { return r.building_id === tower.id && r.number === n; }); };
    /* 7B was edited in the application after the first import */
    store.update('rooms', room('7B').id, { capacity: 6, display_config: 'Existing display', notes: 'Auditor note' });
    const b7Notes = room('7B').notes;
    const csv = [
      'Building,Floor,Room number,Room name,Room type,Capacity,DSP platform,Display configuration,Camera,Mic,Control platform,Scheduling platform,Operational status,Notes',
      'Fill Tower,7,7A,Room Seven A,huddle room,4,Biamp Tesira,Samsung 55,Neat Bar,Neat Bar,Crestron,,Fully operational,Full notes',
      'Fill Tower,7,7B,,Teleporter,10,Q-SYS,New display,,,,,,Should not be added',
      'Fill Tower,7,7A,,,9,,,,,,,,',
      'Fill Tower,7,7C,New room,Huddle room,,Q-SYS,,,,,Robin,Degraded,'
    ].join('\r\n') + '\r\n';
    const parsed = RI.read(csv);
    eq(parsed.unknown, [], 'every space summary column is recognised, Camera and Mic included');
    const plan = RI.plan(parsed);
    eq(plan.rows.map(function (r) { return r.status; }), ['fill', 'fill', 'duplicate', 'new'], 'existing rooms are filled in; a second line for the same room is used once');
    eq([plan.counts.fill, plan.counts.fields, plan.counts.rooms], [2, 11, 1], '7A takes 10 fields, 7B one');
    const b7 = plan.rows[1];
    assert(b7.attention && b7.notes.some(function (n) { return /Room type “Teleporter” does not fit: not filled in/.test(n); }) &&
      b7.notes.some(function (n) { return /Already set, left as it is: Capacity, Display configuration, Notes/.test(n); }), 'what is not filled is reported: ' + b7.notes.join(' | '));
    const done = RI.apply(plan, 'second.csv');
    eq([done.rooms, done.filled, done.fields], [1, 2, 11]);
    const a = room('7A'), b = room('7B'), c = room('7C');
    eq([a.name, a.room_type, a.capacity, a.dsp_platform, a.display_config, a.camera_config, a.microphone_config, a.control_platform, a.operational_status, a.notes],
      ['Room Seven A', 'Huddle room', 4, 'Biamp Tesira', 'Samsung 55', 'Neat Bar', 'Neat Bar', 'Crestron', 'Fully operational', 'Full notes'], 'empty fields are filled, list values written as the app stores them');
    eq([b.capacity, b.display_config, b.dsp_platform, b.room_type, b.notes], [6, 'Existing display', 'Q-SYS', '', b7Notes], 'set values, notes and values that do not fit are left as they were');
    eq([c.dsp_platform, c.scheduling_platform, c.operational_status], ['Q-SYS', 'Robin', 'Degraded'], 'a new room takes the new columns too');
    /* (the store folds a change made right after a record was created into its creation entry, so look at every entry of the room) */
    const history = JSON.stringify(store.all('activity_log').filter(function (l) { return l.entity_id === a.id; }).map(function (l) { return l.changes; }));
    assert(history.indexOf('"f":"dsp_platform","from":"","to":"Biamp Tesira"') >= 0, 'the filled fields are in the room\'s change history, from empty to the list\'s value');
    assert(store.all('activity_log').some(function (l) { return l.action === 'imported' && /2 existing rooms filled in \(11 fields\)/.test(l.summary); }), 'and the import summary says so');
    const again = RI.plan(RI.read(csv));
    eq([again.counts.fill, again.counts.rooms], [0, 0], 'the same list a second time fills nothing and adds nothing');
    eq(X.validate(X.collect(X.resolveScope({ mode: 'full' })), null, null).structural_errors, 0, 'filled records export cleanly');
  });
  test('the production site carries no demo data: no demo records, no seed file, no control that offers them', async function () {
    const page = await (await fetch('../app/index.html', { cache: 'no-store' })).text();
    assert(!/seed\.js/.test(page) && /js\/roomimport\.js/.test(page), 'the application page does not load the demo seed');
    const worker = await (await fetch('../app/sw.js', { cache: 'no-store' })).text();
    assert(!/seed\.js/.test(worker), 'and the offline cache does not hold it');
    const missing = await fetch('../dist/site/js/seed.js', { cache: 'no-store' });
    eq(missing.status, 404, 'the built site has no seed file');
    for (const f of ['core', 'schema', 'store', 'rules', 'actions', 'ui', 'auth', 'shell', 'pages/command', 'pages/settings', 'roomimport']) {
      const src = await (await fetch('../app/js/' + f + '.js', { cache: 'no-store' })).text();
      assert(!/Demonstration Plaza|DEMO-SN-|192\.0\.2\.\d+['"]/.test(src), 'no demo record text in app/js/' + f + '.js');
    }
    /* without the seed (the production site), nothing offers demo data */
    const seed = EV.seed; EV.seed = undefined;
    try {
      EV.go('/settings'); await wait(150);
      const text = document.querySelector('.page').textContent;
      assert(store.hasDemo() ? !/Load demo environment/.test(text) : !/Demo data/.test(text), 'Settings offers no demo environment');
      eq(typeof EV.auth.startHostedDemo, 'function');
    } finally { EV.seed = seed; EV.go('/'); await wait(60); }
  });

  /* ------------------------------------------------------------------ data saved by an earlier version */
  /* Earlier versions used another database name and four party / status values that carried the first client's name.
     These tests build such a database by hand and start the application on top of it in a frame. */
  const OLD_VALUES = { party: 'Evercore IT', ops: 'Evercore AV Operations', approval: 'Pending Evercore Approval' };
  function legacyRow(t, org, extra) {
    const at = '2025-06-01T10:00:00.000Z';
    const r = { id: U.uid(), org_id: org, created_at: at, updated_at: at, created_by: 'Earlier version', updated_by: 'Earlier version', deleted_at: null, is_demo: false };
    S.T[t].columns.forEach(function (c) { r[c.name] = c.type === 'bool' ? false : c.type === 'text' ? '' : null; });
    return Object.assign(r, extra || {});
  }
  function makeDb(name, fill) {
    return new Promise(function (resolve, reject) {
      const rq = indexedDB.open(name, 1);
      rq.onupgradeneeded = function () {
        const db = rq.result;
        S.TABLES.concat(['photo_blobs', 'outbox']).forEach(function (n) { db.createObjectStore(n, { keyPath: 'id' }); });
        db.createObjectStore('kv', { keyPath: 'k' });
      };
      rq.onsuccess = function () {
        const db = rq.result, names = Object.keys(fill);
        const tx = db.transaction(names, 'readwrite');
        names.forEach(function (n) { fill[n].forEach(function (r) { tx.objectStore(n).put(r); }); });
        tx.oncomplete = function () { db.close(); resolve(); };
        tx.onerror = tx.onabort = function () { db.close(); reject(tx.error); };
      };
      rq.onerror = function () { reject(rq.error); };
    });
  }
  function dbAll(name, storeName) {
    return new Promise(function (resolve, reject) {
      const rq = indexedDB.open(name);
      rq.onsuccess = function () { const db = rq.result; const g = db.transaction(storeName, 'readonly').objectStore(storeName).getAll(); g.onsuccess = function () { resolve(g.result); db.close(); }; g.onerror = function () { reject(g.error); db.close(); }; };
      rq.onerror = function () { reject(rq.error); };
    });
  }
  /* true when the database exists; looking never creates it */
  function dbExists(name) {
    return new Promise(function (resolve) {
      let made = false;
      const rq = indexedDB.open(name);
      rq.onupgradeneeded = function (ev) { if (ev.oldVersion === 0) { made = true; rq.transaction.abort(); } };
      rq.onsuccess = function () { rq.result.close(); resolve(true); };
      rq.onerror = function (ev) { ev.preventDefault(); resolve(!made); };
    });
  }
  function dropDb(name) { return new Promise(function (resolve) { const d = indexedDB.deleteDatabase(name); d.onsuccess = d.onerror = d.onblocked = function () { resolve(); }; }); }
  async function startOn(db, legacy) {
    const frame = document.createElement('iframe');
    frame.setAttribute('title', 'Application started on an earlier version\'s data');
    frame.style.cssText = 'position:fixed;left:0;top:0;width:390px;height:844px;border:0;z-index:2147483000;background:#000';
    const loaded = new Promise(function (res, rej) { frame.onload = res; setTimeout(function () { rej(new Error('the frame did not load')); }, 20000); });
    frame.src = 'frame.html?db=' + encodeURIComponent(db) + '&legacy=' + encodeURIComponent(legacy);
    document.body.appendChild(frame);
    await loaded;
    const w = frame.contentWindow;
    for (let i = 0; i < 300 && !(w.EV && w.EV.store && w.EV.store.ready); i++) await wait(50);
    assert(w.EV && w.EV.store.ready, 'the application did not start on the moved data');
    return { frame: frame, w: w };
  }

  test('an earlier version\'s database is moved: every record, setting and photograph arrives, party and status values are renamed, the change history is kept, the old database is deleted', async function () {
    const oldDb = window.EV_DB_NAME + '_legacy', newDb = window.EV_DB_NAME + '_moved', org = U.uid();
    const b = legacyRow('buildings', org, { name: 'Building from the earlier version' });
    const f = legacyRow('floors', org, { building_id: b.id, number: '7' });
    const rooms = []; for (let i = 0; i < 120; i++) rooms.push(legacyRow('rooms', org, { building_id: b.id, floor_id: f.id, code: 'OLD-RM-' + U.pad(i + 1, 4), number: 'L' + i }));   /* more than one chunk */
    const req = legacyRow('it_requests', org, { code: 'OLD-IT-001', topic: 'Switch port mapping', requested_from: OLD_VALUES.party, request_type: 'Switch port information', status: 'Submitted' });
    const item = legacyRow('backlog_items', org, { code: 'OLD-BL-001', title: 'Spare appliance', status: OLD_VALUES.approval, owner: OLD_VALUES.ops, priority: 'P2' });
    const log = legacyRow('activity_log', org, { at: '2025-06-01T10:00:00.000Z', actor: 'Earlier Auditor', action: 'update', entity_type: 'it_requests', entity_id: req.id, summary: OLD_VALUES.party });
    const blobId = U.uid();
    await makeDb(oldDb, { buildings: [b], floors: [f], rooms: rooms, it_requests: [req], backlog_items: [item], activity_log: [log],
      photo_blobs: [{ id: blobId, kind: 'original', blob: new Blob(['earlier photograph'], { type: 'image/jpeg' }) }],
      kv: [{ k: 'org_id', v: org }, { k: 'org_name', v: 'Evercore' }, { k: 'profile', v: { name: 'Earlier Auditor', role: 'lead_auditor' } }, { k: 'onboarded', v: true }, { k: 'seq:rooms', v: 120 }] });
    let run;
    try {
      run = await startOn(newDb, oldDb);
      const s = run.w.EV.store;
      eq([s.raw('buildings').length, s.raw('floors').length, s.raw('rooms').length], [1, 1, 120], 'every record arrives');
      eq([s.orgId(), s.kvGet('profile').name, s.kvGet('seq:rooms'), s.kvGet('onboarded')], [org, 'Earlier Auditor', 120, true], 'settings arrive: organization id, profile, counters');
      eq(s.kvGet('org_name'), undefined, 'the organization name earlier versions filled in by themselves is cleared');
      eq(s.get('it_requests', req.id).requested_from, 'Client IT', 'party renamed');
      eq([s.get('backlog_items', item.id).status, s.get('backlog_items', item.id).owner], ['Pending Client Approval', 'Client AV Operations'], 'status and owner renamed');
      eq([s.get('it_requests', req.id).updated_at, s.get('rooms', rooms[0].id).code], [req.updated_at, 'OLD-RM-0001'], 'renaming is not an edit; record IDs are kept');
      eq(s.raw('activity_log').find(function (x) { return x.id === log.id; }).summary, OLD_VALUES.party, 'the change history is left as it was recorded');
      await s.flush();
      eq((await dbAll(newDb, 'it_requests'))[0].requested_from, 'Client IT', 'the renamed value is on disk');
      const blobs = await dbAll(newDb, 'photo_blobs');
      eq([blobs.length, blobs[0].id, await blobs[0].blob.text()], [1, blobId, 'earlier photograph'], 'the photograph arrives byte for byte');
      eq((await dbAll(newDb, 'kv')).find(function (x) { return x.k === 'legacy_db_moved'; }).v, 'done', 'the move is recorded as finished');
    } finally { if (run) run.frame.remove(); }
    await wait(200);
    eq(await dbExists(oldDb), false, 'the old database is deleted after the move');
    await dropDb(newDb);
  });

  test('an interrupted move resumes: what is missing is copied, nothing already in the new database is overwritten', async function () {
    const oldDb = window.EV_DB_NAME + '_legacy2', newDb = window.EV_DB_NAME + '_moved2', org = U.uid();
    const b = legacyRow('buildings', org, { name: 'Building' });
    const f = legacyRow('floors', org, { building_id: b.id, number: '3' });
    const r1 = legacyRow('rooms', org, { building_id: b.id, floor_id: f.id, number: '301', name: 'Name in the old database' });
    const r2 = legacyRow('rooms', org, { building_id: b.id, floor_id: f.id, number: '302' });
    await makeDb(oldDb, { buildings: [b], floors: [f], rooms: [r1, r2], kv: [{ k: 'org_id', v: org }] });
    /* the first attempt had copied the building and the first room, and the room was edited afterwards */
    const edited = Object.assign({}, r1, { name: 'Edited after the move began', updated_at: '2026-01-01T00:00:00.000Z' });
    await makeDb(newDb, { buildings: [b], rooms: [edited], kv: [{ k: 'legacy_db_moved', v: 'started' }, { k: 'org_id', v: org }] });
    let run;
    try {
      run = await startOn(newDb, oldDb);
      const s = run.w.EV.store;
      eq([s.raw('floors').length, s.raw('rooms').length], [1, 2], 'the missing floor and room are copied');
      eq(s.get('rooms', r1.id).name, 'Edited after the move began', 'a record already moved is not overwritten by the old copy');
    } finally { if (run) run.frame.remove(); }
    await wait(200);
    eq(await dbExists(oldDb), false, 'the old database is deleted once the move has finished');
    await dropDb(newDb);
  });

  test('application updates: a new version loads by itself only when no editor or dialog is open, nothing is typed in and every change is saved; Load now works at once', async function () {
    const upd = EV.update, realReload = upd.reload, ui = EV.ui;
    let reloaded = 0;
    upd.reload = function () { reloaded++; };
    try {
      upd.ready = false; upd.applying = false;
      eq([upd.apply(), upd.banner()], [false, null], 'nothing happens while no update is ready');
      upd.ready = true;
      const s = ui.openSheet({ title: 'Open editor', render: function () { return EV.h('div', null, 'x'); } });
      assert(!upd.safe() && !upd.apply() && upd.banner(), 'an open editor holds the switch back, and the banner says an update is ready');
      ui.closeSheet(s);
      store.kvSet('update-test', 1);
      assert(!upd.safe(), 'so does a change that is not saved yet');
      await store.flush();
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      assert(upd.safe(), 'with nothing open and everything saved it is safe');
      assert(upd.apply(), 'and the new version loads');
      await wait(50);
      eq(reloaded, 1, 'the page reloads once');
      eq(upd.apply(), false, 'a second request does not reload again');
      let flag = null; try { flag = sessionStorage.getItem('ev.updated'); } catch (e) { flag = '1'; }
      eq(flag, '1', 'the reloaded page is told it was updated');
      upd.announce();
      assert(ui.toasts.some(function (t) { return /Updated to the latest version/.test(t.msg); }), 'and says so once');
      upd.applying = false;
      const s2 = ui.openSheet({ title: 'Open editor', render: function () { return EV.h('div', null, 'x'); } });
      assert(upd.apply(true), 'Load now does not wait');
      await wait(50);
      eq(reloaded, 2);
      ui.closeSheet(s2);
    } finally {
      upd.reload = realReload; upd.ready = false; upd.applying = false; clearInterval(upd.timer);
      store.kvDel('update-test');
      try { sessionStorage.removeItem('ev.updated'); } catch (e) { /* ignore */ }
    }
  });

  test('the application names no client: outside the legacy names the move needs, no file it loads mentions one', async function () {
    const page = await (await fetch('../app/index.html', { cache: 'no-store' })).text();
    const files = ['index.html', 'manifest.webmanifest', 'sw.js'];
    page.replace(/<script src="([^"]+)"/g, function (x, s) { files.push(s); return x; });
    page.replace(/<link[^>]+href="([^"]+)"/g, function (x, s) { files.push(s); return x; });
    assert(files.length > 30, 'file list read from the application page');
    const NAME = /evercore|evcr/i;
    for (const f of files) {
      let text = await (await fetch('../app/' + f, { cache: 'no-store' })).text();
      /* the one marked block of legacy names in store.js, and the old cache name in the worker */
      if (f === 'js/store.js') { const a = text.indexOf('/* Legacy names.'), b = text.indexOf('const MOVED_KEY'); assert(a > 0 && b > a, 'store.js keeps its legacy names in one block'); text = text.slice(0, a) + text.slice(b); }
      if (f === 'sw.js') text = text.split('\n').filter(function (l) { return l.indexOf('const LEGACY_PREFIX') < 0; }).join('\n');
      const hit = text.split('\n').find(function (l) { return NAME.test(l); });
      assert(!hit, 'app/' + f + ' mentions a client: ' + (hit || '').trim().slice(0, 120));
    }
  });

  test('a backup from an earlier version restores, with its party and status values renamed; new backups carry the new format tag', function () {
    eq(store.dump().format, 'av-environment-intelligence-backup');
    const r = legacyRow('it_requests', store.orgId(), { code: 'OLD-IT-900', topic: 'From an old backup', requested_from: OLD_VALUES.party, status: 'Draft' });
    const n = store.restore({ format: 'evercore-av-intelligence-backup', version: 1, kv: {}, tables: { it_requests: [r] } });
    eq(n, 1, 'the earlier format is accepted');
    eq(store.get('it_requests', r.id).requested_from, 'Client IT', 'and the value is renamed on the way in');
    store.purge('it_requests', r.id);
  });

  /* ------------------------------------------------------------------ runner */
  function render() {
    const ol = document.getElementById('results');
    ol.textContent = '';
    results.forEach(function (r) { const li = document.createElement('li'); li.className = r.ok ? 'pass' : 'fail'; li.textContent = (r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.ok ? '  (' + r.ms + ' ms)' : '\n      ' + r.error); ol.appendChild(li); });
    const failed = results.filter(function (r) { return !r.ok; }).length;
    const s = document.getElementById('summary');
    s.textContent = results.length + ' / ' + tests.length + ' run · ' + (results.length - failed) + ' passed · ' + failed + ' failed';
    s.className = failed ? 'bad' : results.length === tests.length ? 'ok' : '';
  }
  async function run() {
    /* remove databases left behind by earlier test runs (the current run keeps its own for inspection) */
    try {
      if (indexedDB.databases) (await indexedDB.databases()).forEach(function (d) {
        if (d.name && d.name.indexOf('av_environment_intelligence_test_') === 0 && d.name !== window.EV_DB_NAME) indexedDB.deleteDatabase(d.name);
      });
    } catch (e) { /* not supported in this browser */ }
    await store.init();
    store.kvSet('profile', { name: 'Test Auditor', role: 'lead_auditor' });
    for (const t of tests) {
      const t0 = performance.now();
      try { await t.fn(); results.push({ name: t.name, ok: true, ms: Math.round(performance.now() - t0) }); }
      catch (e) { results.push({ name: t.name, ok: false, error: String((e && e.message) || e) + (e && e.stack ? '\n      ' + String(e.stack).split('\n').slice(1, 3).join('\n      ') : '') }); }
      render();
    }
    const failed = results.filter(function (r) { return !r.ok; });
    window.TEST_RESULTS = { done: true, total: tests.length, passed: results.length - failed.length, failed: failed.length, failures: failed.map(function (f) { return f.name + ': ' + f.error; }), saved: saved, db: window.EV_DB_NAME };
    try { await store.flush(); } catch (e) { /* ignore */ }
  }
  run();
})();
