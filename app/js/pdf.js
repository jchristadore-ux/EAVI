/* pdf.js — dependency-free PDF 1.4 writer.
 * Standard Type 1 fonts (Helvetica family, Courier) with WinAnsi encoding and real AFM advance widths for wrapping,
 * vector rules and fills, JPEG (DCTDecode) images and an optional outline (bookmarks). Coordinates are in points with a
 * top-left origin. */
(function () {
  'use strict';
  const EV = window.EV;
  /* Helvetica and Helvetica-Bold advance widths for character codes 32–126 (1/1000 em). */
  const W_REG = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015,
    667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333,
    556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
  const W_BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975,
    722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333,
    556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];
  const W_HIGH = { 133: 1000, 145: 222, 146: 222, 147: 333, 148: 333, 149: 350, 150: 556, 151: 1000, 153: 1000, 160: 278, 169: 737, 174: 737, 176: 400, 177: 584, 183: 278, 215: 584 };
  const WIN = { 0x20AC: 128, 0x201A: 130, 0x0192: 131, 0x201E: 132, 0x2026: 133, 0x2020: 134, 0x2021: 135, 0x02C6: 136, 0x2030: 137, 0x0160: 138, 0x2039: 139, 0x0152: 140, 0x017D: 142,
    0x2018: 145, 0x2019: 146, 0x201C: 147, 0x201D: 148, 0x2022: 149, 0x2013: 150, 0x2014: 151, 0x02DC: 152, 0x2122: 153, 0x0161: 154, 0x203A: 155, 0x0153: 156, 0x017E: 158, 0x0178: 159 };
  const SUBST = { 0x2192: '->', 0x2190: '<-', 0x2265: '>=', 0x2264: '<=', 0x2212: '-', 0x2713: 'v', 0x2714: 'v', 0x2011: '-', 0x2009: ' ', 0x200A: ' ', 0x202F: ' ', 0x2002: ' ', 0x2003: ' ', 0x2191: '^', 0x2193: 'v', 0xFF0B: '+' };
  const FONT_ID = { regular: 'F1', bold: 'F2', italic: 'F3', mono: 'F4' };

  /* Unicode → WinAnsi byte string (each JS char code is one byte, 0–255). */
  function encode(str) {
    let out = '';
    str = String(str == null ? '' : str);
    for (let i = 0; i < str.length; i++) {
      const cp = str.charCodeAt(i);
      if (cp === 9) out += '    ';
      else if (cp < 32) out += ' ';
      else if (cp < 127) out += str[i];
      else if (cp >= 160 && cp <= 255) out += str[i];
      else if (WIN[cp]) out += String.fromCharCode(WIN[cp]);
      else if (SUBST[cp]) out += SUBST[cp];
      else if (cp >= 0xD800 && cp <= 0xDFFF) { /* skip surrogate halves (emoji etc.) */ }
      else out += '?';
    }
    return out;
  }
  function widthOf(enc, font, size) {
    if (font === 'mono') return enc.length * 0.6 * size;
    const T = font === 'bold' ? W_BOLD : W_REG;
    let w = 0;
    for (let i = 0; i < enc.length; i++) {
      const c = enc.charCodeAt(i);
      w += (c >= 32 && c <= 126) ? T[c - 32] : (W_HIGH[c] || (c >= 192 && c <= 222 ? 667 : 556));
    }
    return w * size / 1000;
  }
  function pdfString(enc) {
    let out = '(';
    for (let i = 0; i < enc.length; i++) {
      const c = enc.charCodeAt(i);
      if (c === 40 || c === 41 || c === 92) out += '\\' + enc[i];
      else if (c < 32 || c > 126) out += '\\' + ('00' + c.toString(8)).slice(-3);
      else out += enc[i];
    }
    return out + ')';
  }
  /* Document-information text (title, author) is not page content: readers decode it as PDFDocEncoding or UTF-16.
     Written as UTF-16BE hex with a byte-order mark, every character (dashes, quotes, accents) comes out right. */
  function pdfText(s) {
    s = String(s == null ? '' : s);
    let hex = 'FEFF';
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); hex += ('000' + (c < 32 ? 32 : c).toString(16)).slice(-4).toUpperCase(); }
    return '<' + hex + '>';
  }
  function num(n) { return (Math.round(n * 100) / 100).toString(); }
  function rgb(c) { return num(c[0] / 255) + ' ' + num(c[1] / 255) + ' ' + num(c[2] / 255); }
  function bytes(s) { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 0xFF; return u; }

  EV.pdf = {
    encode: encode,
    create: function (opts) {
      opts = opts || {};
      const PW = opts.landscape ? 792 : 612, PH = opts.landscape ? 612 : 792;
      const pages = [];
      const images = [];
      const marks = [];   /* outline entries: { title, page, y, parent } (parent: index of another entry, or -1) */
      let cur = null;
      const doc = {
        width: PW, height: PH,
        page: function () { cur = { ops: [], images: new Set() }; pages.push(cur); return pages.length - 1; },
        pageCount: function () { return pages.length; },
        setPage: function (i) { cur = pages[i]; },
        /* An outline entry (bookmark) pointing at y on the current page; o.parent nests it under an earlier entry.
           Returns its index. */
        bookmark: function (title, o) {
          o = o || {};
          if (!pages.length) doc.page();
          marks.push({ title: String(title == null ? '' : title), page: pages.indexOf(cur), y: o.y || 0, parent: o.parent == null ? -1 : o.parent });
          return marks.length - 1;
        },
        textWidth: function (str, font, size) { return widthOf(encode(str), font || 'regular', size || 10); },
        /* Greedy word wrap; returns an array of lines (unencoded strings). */
        wrap: function (str, font, size, maxW) {
          font = font || 'regular';
          const out = [];
          String(str == null ? '' : str).split(/\r?\n/).forEach(function (para) {
            const words = para.split(/[ \t]+/).filter(function (w) { return w.length; });
            if (!words.length) { out.push(''); return; }
            let line = '';
            words.forEach(function (word) {
              const trial = line ? line + ' ' + word : word;
              if (widthOf(encode(trial), font, size) <= maxW) { line = trial; return; }
              if (line) out.push(line);
              /* a single word wider than the column is broken by characters */
              while (widthOf(encode(word), font, size) > maxW && word.length > 1) {
                let n = word.length - 1;
                while (n > 1 && widthOf(encode(word.slice(0, n)), font, size) > maxW) n--;
                out.push(word.slice(0, n));
                word = word.slice(n);
              }
              line = word;
            });
            if (line) out.push(line);
          });
          return out.length ? out : [''];
        },
        text: function (str, x, y, o) {
          o = o || {};
          const font = o.font || 'regular', size = o.size || 10;
          const enc = encode(str);
          if (!enc) return;
          let tx = x;
          if (o.align === 'right') tx = x - widthOf(enc, font, size);
          else if (o.align === 'center') tx = x - widthOf(enc, font, size) / 2;
          cur.ops.push('BT /' + FONT_ID[font] + ' ' + num(size) + ' Tf ' + rgb(o.color || [31, 41, 55]) + ' rg 1 0 0 1 ' + num(tx) + ' ' + num(PH - y) + ' Tm ' + pdfString(enc) + ' Tj ET');
        },
        rect: function (x, y, w, hgt, o) {
          o = o || {};
          let s = '';
          if (o.fill) s += rgb(o.fill) + ' rg ';
          if (o.stroke) s += rgb(o.stroke) + ' RG ' + num(o.lineWidth || 0.5) + ' w ';
          s += num(x) + ' ' + num(PH - y - hgt) + ' ' + num(w) + ' ' + num(hgt) + ' re ' + (o.fill && o.stroke ? 'B' : o.fill ? 'f' : 'S');
          cur.ops.push(s);
        },
        line: function (x1, y1, x2, y2, o) {
          o = o || {};
          cur.ops.push(rgb(o.color || [208, 213, 221]) + ' RG ' + num(o.width || 0.5) + ' w ' + num(x1) + ' ' + num(PH - y1) + ' m ' + num(x2) + ' ' + num(PH - y2) + ' l S');
        },
        /* jpeg: Uint8Array of a baseline/progressive RGB JPEG; pw/ph: its pixel size; x,y,w,h: placement in points. */
        image: function (jpeg, pw, ph, x, y, w, hgt) {
          let idx = images.findIndex(function (im) { return im.data === jpeg; });
          if (idx < 0) { images.push({ data: jpeg, w: pw, h: ph }); idx = images.length - 1; }
          cur.images.add(idx);
          cur.ops.push('q ' + num(w) + ' 0 0 ' + num(hgt) + ' ' + num(x) + ' ' + num(PH - y - hgt) + ' cm /Im' + idx + ' Do Q');
        },
        finish: function () {
          if (!pages.length) doc.page();
          const chunks = [];
          let offset = 0;
          const xref = [];
          const push = function (u) { chunks.push(u); offset += u.length; };
          const pushS = function (s) { push(bytes(s)); };
          const nPages = pages.length;
          /* object ids: 1 catalog · 2 pages · 3–6 fonts · then images · then (page, content) pairs · info · outline root and entries */
          const firstImage = 7;
          const firstPage = firstImage + images.length;
          const infoId = firstPage + nPages * 2;
          const outlineId = marks.length ? infoId + 1 : 0;
          const total = infoId + (marks.length ? 1 + marks.length : 0);
          const begin = function (id) { xref[id] = offset; pushS(id + ' 0 obj\n'); };
          const end = function () { pushS('\nendobj\n'); };
          pushS('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
          begin(1); pushS('<< /Type /Catalog /Pages 2 0 R' + (outlineId ? ' /Outlines ' + outlineId + ' 0 R /PageMode /UseOutlines' : '') + ' >>'); end();
          const kids = [];
          for (let i = 0; i < nPages; i++) kids.push((firstPage + i * 2) + ' 0 R');
          begin(2); pushS('<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + nPages + ' >>'); end();
          ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Courier'].forEach(function (name, i) {
            begin(3 + i); pushS('<< /Type /Font /Subtype /Type1 /BaseFont /' + name + ' /Encoding /WinAnsiEncoding >>'); end();
          });
          images.forEach(function (im, i) {
            begin(firstImage + i);
            pushS('<< /Type /XObject /Subtype /Image /Width ' + im.w + ' /Height ' + im.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + im.data.length + ' >>\nstream\n');
            push(im.data);
            pushS('\nendstream'); end();
          });
          pages.forEach(function (pg, i) {
            const pid = firstPage + i * 2, cid = pid + 1;
            let xo = '';
            pg.images.forEach(function (idx) { xo += '/Im' + idx + ' ' + (firstImage + idx) + ' 0 R '; });
            begin(pid);
            pushS('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PW + ' ' + PH + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R >>' +
              (xo ? ' /XObject << ' + xo + '>>' : '') + ' >> /Contents ' + cid + ' 0 R >>');
            end();
            const content = bytes(pg.ops.join('\n'));
            begin(cid); pushS('<< /Length ' + content.length + ' >>\nstream\n'); push(content); pushS('\nendstream'); end();
          });
          const d = new Date();
          const stamp = 'D:' + d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2) + ('0' + d.getHours()).slice(-2) + ('0' + d.getMinutes()).slice(-2) + ('0' + d.getSeconds()).slice(-2);
          begin(infoId);
          pushS('<< /Title ' + pdfText(opts.title || 'Report') + ' /Author ' + pdfText(opts.author || '') + ' /Creator ' + pdfString(encode('AV Environment Intelligence')) +
            ' /Producer ' + pdfString(encode('AV Environment Intelligence ' + EV.APP.version)) + ' /CreationDate (' + stamp + ') >>');
          end();
          if (outlineId) {
            /* every entry is shown open: an entry's /Count is the number of entries below it */
            const kidsOf = function (p) { const out = []; marks.forEach(function (m, i) { if (m.parent === p) out.push(i); }); return out; };
            const below = function (i) { return kidsOf(i).reduce(function (n, k) { return n + 1 + below(k); }, 0); };
            const top = kidsOf(-1);
            begin(outlineId); pushS('<< /Type /Outlines /First ' + (outlineId + 1 + top[0]) + ' 0 R /Last ' + (outlineId + 1 + top[top.length - 1]) + ' 0 R /Count ' + marks.length + ' >>'); end();
            marks.forEach(function (m, i) {
              const sib = kidsOf(m.parent), at = sib.indexOf(i), kids = kidsOf(i);
              const pg = Math.max(0, Math.min(nPages - 1, m.page));
              let d = '<< /Title ' + pdfText(m.title) + ' /Parent ' + (m.parent < 0 ? outlineId : outlineId + 1 + m.parent) + ' 0 R';
              if (at > 0) d += ' /Prev ' + (outlineId + 1 + sib[at - 1]) + ' 0 R';
              if (at < sib.length - 1) d += ' /Next ' + (outlineId + 1 + sib[at + 1]) + ' 0 R';
              if (kids.length) d += ' /First ' + (outlineId + 1 + kids[0]) + ' 0 R /Last ' + (outlineId + 1 + kids[kids.length - 1]) + ' 0 R /Count ' + below(i);
              d += ' /Dest [' + (firstPage + pg * 2) + ' 0 R /XYZ 0 ' + num(PH - m.y) + ' 0] >>';
              begin(outlineId + 1 + i); pushS(d); end();
            });
          }
          const xrefPos = offset;
          let x = 'xref\n0 ' + (total + 1) + '\n0000000000 65535 f \n';
          for (let i = 1; i <= total; i++) x += ('0000000000' + xref[i]).slice(-10) + ' 00000 n \n';
          pushS(x + 'trailer\n<< /Size ' + (total + 1) + ' /Root 1 0 R /Info ' + infoId + ' 0 R >>\nstartxref\n' + xrefPos + '\n%%EOF\n');
          return new Blob(chunks, { type: 'application/pdf' });
        }
      };
      return doc;
    }
  };
})();
