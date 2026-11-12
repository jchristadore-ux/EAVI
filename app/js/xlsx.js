/* xlsx.js — dependency-free Excel (.xlsx / SpreadsheetML) writer.
 * Supports: multiple sheets, Excel tables with filters, frozen header rows, column widths, wrapped text, dropdown
 * validation lists (via a hidden "Lists" sheet), conditional formatting, formulas (recalculated by Excel on open)
 * and free-form dashboard sheets.
 *
 * build({ title, creator, sheets: [ tableSheet | gridSheet ] }) → Promise<Blob>
 *   tableSheet: { name, table: 'tblName', tabColor, columns: [{ header, width, wrap, list: [..], cond: [{eq|contains, dxf}] }], rows: [[..]] }
 *   gridSheet:  { name, grid: true, tabColor, widths: [..], merges: ['A1:F1'], rows: [{ height, cells: [{ c, v, f, s }] }] }
 * Style ids (s): 0 normal · 1 header · 2 wrapped · 3 title · 4 subtitle · 5 KPI label · 6 KPI value · 7 KPI percent · 8 section · 9 note · 10 integer · 11 bold
 * Conditional-format ids (dxf): 0 red · 1 amber · 2 green · 3 grey */
(function () {
  'use strict';
  const EV = window.EV;
  const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const NS_PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

  function esc(s) {
    return String(s).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F￾￿]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function colName(i) { let s = ''; i += 1; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  function sheetRef(name) { return "'" + String(name).replace(/'/g, "''") + "'"; }
  function safeSheetName(n) { return String(n).replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31); }

  const STYLES = HEAD + '<styleSheet xmlns="' + NS + '">' +
    '<fonts count="8">' +
    '<font><sz val="11"/><color rgb="FF1F2937"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><b/><sz val="18"/><color rgb="FF0F1522"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><sz val="10"/><color rgb="FF6B7280"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><b/><sz val="10"/><color rgb="FF6B7280"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><b/><sz val="20"/><color rgb="FF0F1522"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><b/><sz val="12"/><color rgb="FF0F1522"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FF1F2937"/><name val="Calibri"/><family val="2"/></font>' +
    '</fonts>' +
    '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF0F1522"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF3F5F9"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border><left style="thin"><color rgb="FFD0D5DD"/></left><right style="thin"><color rgb="FFD0D5DD"/></right><top style="thin"><color rgb="FFD0D5DD"/></top><bottom style="thin"><color rgb="FFD0D5DD"/></bottom><diagonal/></border>' +
    '<border><left/><right/><top/><bottom style="medium"><color rgb="FF3D8BFF"/></bottom><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="12">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top"/></xf>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="5" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>' +
    '<xf numFmtId="9" fontId="5" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>' +
    '<xf numFmtId="0" fontId="6" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
    '<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment vertical="top"/></xf>' +
    '<xf numFmtId="0" fontId="7" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '<dxfs count="4">' +
    '<dxf><font><color rgb="FF9C0006"/></font><fill><patternFill><bgColor rgb="FFFFC7CE"/></patternFill></fill></dxf>' +
    '<dxf><font><color rgb="FF9C5700"/></font><fill><patternFill><bgColor rgb="FFFFEB9C"/></patternFill></fill></dxf>' +
    '<dxf><font><color rgb="FF006100"/></font><fill><patternFill><bgColor rgb="FFC6EFCE"/></patternFill></fill></dxf>' +
    '<dxf><font><color rgb="FF6B7280"/></font></dxf>' +
    '</dxfs>' +
    '<tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>' +
    '</styleSheet>';

  function cellXml(ref, v, s, sst) {
    const st = s ? ' s="' + s + '"' : '';
    if (v == null || v === '') return s ? '<c r="' + ref + '"' + st + '/>' : '';
    if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"' + st + '><v>' + v + '</v></c>';
    if (typeof v === 'boolean') return '<c r="' + ref + '"' + st + ' t="b"><v>' + (v ? 1 : 0) + '</v></c>';
    let str = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (str.length > 32000) str = str.slice(0, 32000) + '…';
    return '<c r="' + ref + '"' + st + ' t="s"><v>' + sst(str) + '</v></c>';
  }

  async function build(spec) {
    const strings = [];
    const sIndex = new Map();
    const sst = function (s) { let i = sIndex.get(s); if (i === undefined) { i = strings.length; strings.push(s); sIndex.set(s, i); } return i; };
    const sheets = spec.sheets.map(function (s) { return Object.assign({}, s, { name: safeSheetName(s.name) }); });

    /* validation lists live on a hidden sheet so list values may contain commas and exceed 255 characters */
    const lists = [];
    const listKey = new Map();
    function listRef(values) {
      const key = values.join('\u0001');
      if (!listKey.has(key)) { listKey.set(key, lists.length); lists.push(values); }
      const i = listKey.get(key);
      return 'Lists!$' + colName(i) + '$2:$' + colName(i) + '$' + (values.length + 1);
    }

    const files = [];
    const tables = [];
    const usedNames = new Set();
    sheets.forEach(function (sh, si) {
      let xml = HEAD + '<worksheet xmlns="' + NS + '" xmlns:r="' + NS_R + '">';
      if (sh.tabColor) xml += '<sheetPr><tabColor rgb="' + sh.tabColor + '"/></sheetPr>';
      let after = '';
      let tableRel = '';
      if (sh.grid) {
        const maxC = Math.max.apply(null, [1].concat(sh.rows.map(function (r) { return Math.max.apply(null, [0].concat(r.cells.map(function (c) { return c.c + 1; }))); })));
        xml += '<dimension ref="A1:' + colName(maxC - 1) + Math.max(1, sh.rows.length) + '"/>';
        xml += '<sheetViews><sheetView showGridLines="0" workbookViewId="0"' + (si === 0 ? ' tabSelected="1"' : '') + '/></sheetViews><sheetFormatPr defaultRowHeight="15"/>';
        if (sh.widths) xml += '<cols>' + sh.widths.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join('') + '</cols>';
        xml += '<sheetData>';
        sh.rows.forEach(function (row, ri) {
          const cells = row.cells.slice().sort(function (a, b) { return a.c - b.c; });
          xml += '<row r="' + (ri + 1) + '"' + (row.height ? ' ht="' + row.height + '" customHeight="1"' : '') + '>';
          cells.forEach(function (c) {
            const ref = colName(c.c) + (ri + 1);
            if (c.f != null) xml += '<c r="' + ref + '"' + (c.s ? ' s="' + c.s + '"' : '') + '><f>' + esc(c.f) + '</f></c>';
            else xml += cellXml(ref, c.v, c.s, sst);
          });
          xml += '</row>';
        });
        xml += '</sheetData>';
        if (sh.merges && sh.merges.length) after += '<mergeCells count="' + sh.merges.length + '">' + sh.merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells>';
      } else {
        const cols = sh.columns;
        const seen = new Set();
        const headers = cols.map(function (c) { let hname = String(c.header || 'Column'); let n = 2; const base = hname; while (seen.has(hname.toLowerCase())) hname = base + ' ' + (n++); seen.add(hname.toLowerCase()); return hname; });
        const rows = sh.rows.length ? sh.rows : [cols.map(function () { return null; })];
        const lastCol = colName(cols.length - 1), lastRow = rows.length + 1;
        const range = 'A1:' + lastCol + lastRow;
        xml += '<dimension ref="' + range + '"/>';
        xml += '<sheetViews><sheetView workbookViewId="0"' + (si === 0 ? ' tabSelected="1"' : '') + '><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>';
        xml += '<sheetFormatPr defaultRowHeight="15"/>';
        xml += '<cols>' + cols.map(function (c, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (c.width || 16) + '" customWidth="1"/>'; }).join('') + '</cols>';
        xml += '<sheetData><row r="1" ht="30" customHeight="1">' + headers.map(function (hd, i) { return cellXml(colName(i) + '1', hd, 1, sst); }).join('') + '</row>';
        rows.forEach(function (row, ri) {
          xml += '<row r="' + (ri + 2) + '">';
          for (let ci = 0; ci < cols.length; ci++) xml += cellXml(colName(ci) + (ri + 2), row[ci], cols[ci].wrap ? 2 : 0, sst);
          xml += '</row>';
        });
        xml += '</sheetData>';
        const extent = Math.max(lastRow, 2000);
        let prio = 1;
        cols.forEach(function (c, ci) {
          if (!c.cond || !c.cond.length) return;
          const L = colName(ci);
          after += '<conditionalFormatting sqref="' + L + '2:' + L + extent + '">' + c.cond.map(function (r) {
            if (r.eq != null) return '<cfRule type="cellIs" dxfId="' + r.dxf + '" priority="' + (prio++) + '" operator="equal"><formula>"' + esc(String(r.eq).replace(/"/g, '""')) + '"</formula></cfRule>';
            return '<cfRule type="containsText" dxfId="' + r.dxf + '" priority="' + (prio++) + '" operator="containsText" text="' + esc(r.contains) + '"><formula>NOT(ISERROR(SEARCH("' + esc(String(r.contains).replace(/"/g, '""')) + '",' + L + '2)))</formula></cfRule>';
          }).join('') + '</conditionalFormatting>';
        });
        const dv = cols.map(function (c, ci) {
          if (!c.list || !c.list.length) return '';
          const L = colName(ci);
          return '<dataValidation type="list" errorStyle="warning" allowBlank="1" showInputMessage="1" showErrorMessage="1" errorTitle="Unlisted value" error="This value is not in the standard list. Keep it only if it is intentional." sqref="' + L + '2:' + L + extent + '"><formula1>' + esc(listRef(c.list.map(String))) + '</formula1></dataValidation>';
        }).filter(Boolean);
        if (dv.length) after += '<dataValidations count="' + dv.length + '">' + dv.join('') + '</dataValidations>';
        if (sh.table) {
          let tname = String(sh.table).replace(/[^A-Za-z0-9_]/g, '_');
          while (usedNames.has(tname.toLowerCase())) tname += '_';
          usedNames.add(tname.toLowerCase());
          const tid = tables.length + 1;
          tables.push({ id: tid, sheetIndex: si,
            xml: HEAD + '<table xmlns="' + NS + '" id="' + tid + '" name="' + tname + '" displayName="' + tname + '" ref="' + range + '" totalsRowShown="0"><autoFilter ref="' + range + '"/>' +
              '<tableColumns count="' + cols.length + '">' + headers.map(function (hd, i) { return '<tableColumn id="' + (i + 1) + '" name="' + esc(hd) + '"/>'; }).join('') + '</tableColumns>' +
              '<tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>' });
          tableRel = '<tableParts count="1"><tablePart r:id="rId1"/></tableParts>';
          files.push(['xl/worksheets/_rels/sheet' + (si + 1) + '.xml.rels', HEAD + '<Relationships xmlns="' + NS_PR + '"><Relationship Id="rId1" Type="' + NS_R + '/table" Target="../tables/table' + tid + '.xml"/></Relationships>']);
        }
      }
      xml += after + '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup orientation="landscape"/>' + tableRel + '</worksheet>';
      files.push(['xl/worksheets/sheet' + (si + 1) + '.xml', xml]);
    });

    /* hidden Lists sheet */
    let listsIndex = -1;
    if (lists.length) {
      listsIndex = sheets.length;
      const maxLen = Math.max.apply(null, lists.map(function (l) { return l.length; }));
      let xml = HEAD + '<worksheet xmlns="' + NS + '"><dimension ref="A1:' + colName(lists.length - 1) + (maxLen + 1) + '"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData>';
      for (let r = 0; r <= maxLen; r++) {
        xml += '<row r="' + (r + 1) + '">';
        lists.forEach(function (l, ci) { const v = r === 0 ? 'List ' + (ci + 1) : l[r - 1]; if (v != null) xml += cellXml(colName(ci) + (r + 1), v, r === 0 ? 11 : 0, sst); });
        xml += '</row>';
      }
      xml += '</sheetData></worksheet>';
      files.push(['xl/worksheets/sheet' + (listsIndex + 1) + '.xml', xml]);
    }
    const total = sheets.length + (lists.length ? 1 : 0);

    tables.forEach(function (t) { files.push(['xl/tables/table' + t.id + '.xml', t.xml]); });
    files.push(['xl/styles.xml', STYLES]);
    files.push(['xl/sharedStrings.xml', HEAD + '<sst xmlns="' + NS + '" count="' + strings.length + '" uniqueCount="' + strings.length + '">' +
      strings.map(function (s) { return '<si><t xml:space="preserve">' + esc(s) + '</t></si>'; }).join('') + '</sst>']);
    let wb = HEAD + '<workbook xmlns="' + NS + '" xmlns:r="' + NS_R + '"><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="28800" windowHeight="16000"/></bookViews><sheets>';
    sheets.forEach(function (s, i) { wb += '<sheet name="' + esc(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; });
    if (lists.length) wb += '<sheet name="Lists" sheetId="' + (listsIndex + 1) + '" state="hidden" r:id="rId' + (listsIndex + 1) + '"/>';
    wb += '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>';
    files.push(['xl/workbook.xml', wb]);
    let rels = HEAD + '<Relationships xmlns="' + NS_PR + '">';
    for (let i = 1; i <= total; i++) rels += '<Relationship Id="rId' + i + '" Type="' + NS_R + '/worksheet" Target="worksheets/sheet' + i + '.xml"/>';
    rels += '<Relationship Id="rId' + (total + 1) + '" Type="' + NS_R + '/styles" Target="styles.xml"/><Relationship Id="rId' + (total + 2) + '" Type="' + NS_R + '/sharedStrings" Target="sharedStrings.xml"/></Relationships>';
    files.push(['xl/_rels/workbook.xml.rels', rels]);
    files.push(['_rels/.rels', HEAD + '<Relationships xmlns="' + NS_PR + '"><Relationship Id="rId1" Type="' + NS_R + '/officeDocument" Target="xl/workbook.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="' + NS_R + '/extended-properties" Target="docProps/app.xml"/></Relationships>']);
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    files.push(['docProps/core.xml', HEAD + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>' + esc(spec.title || 'Workbook') + '</dc:title><dc:creator>' + esc(spec.creator || 'AV Environment Intelligence') + '</dc:creator>' +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + now + '</dcterms:modified></cp:coreProperties>']);
    files.push(['docProps/app.xml', HEAD + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>AV Environment Intelligence</Application></Properties>']);
    let ct = HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>';
    for (let i = 1; i <= total; i++) ct += '<Override PartName="/xl/worksheets/sheet' + i + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    tables.forEach(function (t) { ct += '<Override PartName="/xl/tables/table' + t.id + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>'; });
    ct += '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>';

    const zip = EV.zip.create();
    await zip.add('[Content_Types].xml', ct);
    for (const f of files) await zip.add(f[0], f[1]);
    return zip.finish('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  EV.xlsx = {
    build: build,
    colName: colName,
    sheetRef: sheetRef,
    /* Quick workbook from simple tables: [{ name, columns: ['A','B'], rows: [[..]] }] */
    simple: function (title, tables) {
      return build({ title: title, sheets: tables.map(function (t, i) {
        return { name: t.name || 'Sheet ' + (i + 1), table: 'tbl' + (i + 1), columns: t.columns.map(function (c, ci) {
          const longest = Math.max(String(c).length, Math.max.apply(null, [0].concat(t.rows.slice(0, 200).map(function (r) { return String(r[ci] == null ? '' : r[ci]).length; }))));
          return { header: c, width: Math.min(60, Math.max(10, longest + 2)), wrap: longest > 50 };
        }), rows: t.rows };
      }) });
    }
  };
})();
