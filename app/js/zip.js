/* zip.js — dependency-free ZIP writer and reader (PKZIP 2.0: stored + deflate, UTF-8 names).
 * Text files are deflated with the browser's CompressionStream when available; photographs are stored as-is. */
(function () {
  'use strict';
  const EV = window.EV;
  const CRC = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); CRC[n] = c >>> 0; }
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function dosStamp(d) {
    return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: (Math.max(0, d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
  }
  async function pipe(bytes, stream) {
    const out = new Blob([bytes]).stream().pipeThrough(stream);
    return new Uint8Array(await new Response(out).arrayBuffer());
  }
  async function deflateRaw(bytes) {
    if (typeof CompressionStream === 'undefined') return null;
    try { return await pipe(bytes, new CompressionStream('deflate-raw')); } catch (e) { return null; }
  }
  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot read compressed archives.');
    return pipe(bytes, new DecompressionStream('deflate-raw'));
  }
  async function toBytes(data) {
    if (typeof data === 'string') return new TextEncoder().encode(data);
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (data && data.arrayBuffer) return new Uint8Array(await data.arrayBuffer());
    throw new Error('Unsupported archive content');
  }
  /* The archive is full. Callers must stop, not skip the entry: err.code === 'ZIP_LIMIT'. */
  function limit(message) { const e = new Error(message); e.code = 'ZIP_LIMIT'; return e; }

  EV.zip = {
    crc32: crc32,
    create: function () {
      const parts = [], central = [], names = new Set();
      const enc = new TextEncoder();
      let offset = 0, count = 0;
      return {
        count: function () { return count; },
        size: function () { return offset; },
        has: function (path) { return names.has(path); },
        add: async function (path, data, opts) {
          opts = opts || {};
          if (names.has(path)) throw new Error('Duplicate path in archive: ' + path);
          if (count >= 65535) throw limit('Too many files for one archive (limit 65,535). Narrow the export.');
          const bytes = await toBytes(data);
          const crc = crc32(bytes);
          let method = 0, body = bytes;
          if (opts.compress !== false && bytes.length > 64) {
            const def = await deflateRaw(bytes);
            if (def && def.length < bytes.length) { method = 8; body = def; }
          }
          if (offset + body.length > 0xFFFFFF00) throw limit('The archive would exceed 4 GB. Narrow the export or use optimized photographs.');
          names.add(path);
          const name = enc.encode(path);
          const ts = dosStamp(opts.date || new Date());
          const lh = new DataView(new ArrayBuffer(30));
          lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, method, true);
          lh.setUint16(10, ts.time, true); lh.setUint16(12, ts.date, true); lh.setUint32(14, crc, true); lh.setUint32(18, body.length, true);
          lh.setUint32(22, bytes.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
          parts.push(new Uint8Array(lh.buffer), name, body);
          const ch = new DataView(new ArrayBuffer(46));
          ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, method, true);
          ch.setUint16(12, ts.time, true); ch.setUint16(14, ts.date, true); ch.setUint32(16, crc, true); ch.setUint32(20, body.length, true); ch.setUint32(24, bytes.length, true);
          ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
          central.push(new Uint8Array(ch.buffer), name);
          offset += 30 + name.length + body.length;
          count++;
          return { path: path, size: bytes.length, crc32: crc };
        },
        finish: function (mime) {
          let cdSize = 0;
          for (let i = 0; i < central.length; i++) cdSize += central[i].length;
          const end = new DataView(new ArrayBuffer(22));
          end.setUint32(0, 0x06054b50, true); end.setUint16(8, count, true); end.setUint16(10, count, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
          return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: mime || 'application/zip' });
        }
      };
    },
    /* Returns [{path, size, read(): Promise<Uint8Array>}] */
    read: async function (blob) {
      const buf = new Uint8Array(await blob.arrayBuffer());
      const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      let eocd = -1;
      for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) { if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
      if (eocd < 0) throw new Error('This file is not a ZIP archive.');
      const n = dv.getUint16(eocd + 10, true);
      let p = dv.getUint32(eocd + 16, true);
      const dec = new TextDecoder();
      const out = [];
      for (let i = 0; i < n; i++) {
        if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('The ZIP directory is damaged.');
        const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
        const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
        const path = dec.decode(buf.subarray(p + 46, p + 46 + nl));
        const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
        const raw = buf.subarray(start, start + csize);
        out.push({ path: path, size: usize, read: (function (m, r) { return function () { return m === 8 ? inflateRaw(r) : m === 0 ? Promise.resolve(r) : Promise.reject(new Error('Unsupported compression method ' + m)); }; })(method, raw) });
        p += 46 + nl + el + cl;
      }
      return out;
    }
  };
})();
