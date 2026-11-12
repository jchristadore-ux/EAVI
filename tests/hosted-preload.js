/* Simulates the page host of the published demonstration copy (a claude.ai artifact viewer) for the test suite.
 * Like the real host, `window.claude` carries only `use(name)`, which answers later with a frozen namespace or null.
 *   ?downloads=ok        the host's save function accepts (and records) what the page asks to save
 *   ?downloads=declined  the viewer says no to every save
 *   ?downloads=none      the save function is not available in this view
 *   ?report=<token>      the page reports its state to the parent with postMessage (for a frame the test cannot read,
 *                        such as one whose storage is blocked) */
(function () {
  /* parameters come from the address, or from window.EV_HOSTED_TEST when this file is inlined into a frame that has no
     address of its own (the built single-file page loaded through srcdoc) */
  const q = new URLSearchParams(window.EV_HOSTED_TEST || location.search);
  window.EV_DB_NAME = q.get('db') || 'av_environment_intelligence_test_hosted';
  window.__saves = [];
  const mode = q.get('downloads') || 'ok';
  const ALLOWED = /\.(gif|png|jpe?g|webp|mp4|webm|mov|txt|json|md|docx|pptx|epub|csv|ttf|html|svg|pdf|xlsx|zip|fig)$/i;
  const downloads = Object.freeze({
    save: function (req) {
      const d = req && req.data;
      window.__saves.push({ filename: req && req.filename, kind: d instanceof Blob ? 'Blob' : typeof d, size: d ? (d.size != null ? d.size : d.byteLength != null ? d.byteLength : d.length) : 0 });
      if (!req || typeof req.filename !== 'string' || !d) return Promise.reject({ code: 'bad_request', message: 'bad request' });
      if (!ALLOWED.test(req.filename)) return Promise.reject({ code: 'rejected_extension', message: 'extension not allowed' });
      if (mode === 'declined') return Promise.reject({ code: 'declined', message: 'the viewer declined' });
      return Promise.resolve({ status: 'saved' });
    }
  });
  window.claude = Object.freeze({
    use: function (name) {
      return new Promise(function (resolve) { setTimeout(function () { resolve(name === 'downloads' && mode !== 'none' ? downloads : null); }, 30); });
    }
  });
  const token = q.get('report');
  if (token) {
    /* a frame the test cannot read also says that it started, and passes on any script error */
    const tell = function (kind, detail) { try { parent.postMessage({ evHostedNote: { token: token, kind: kind, detail: detail } }, '*'); } catch (e) { /* no parent */ } };
    tell('started', '');
    window.addEventListener('error', function (e) { tell('error', String(e.message) + ' @ ' + String(e.filename || '').split('/').pop() + ':' + e.lineno); });
    window.addEventListener('unhandledrejection', function (e) { tell('rejection', String((e.reason && e.reason.message) || e.reason)); });
    const t0 = Date.now();
    const timer = setInterval(function () {
      const EV = window.EV;
      const shell = !!document.querySelector('.shell');
      if (!shell && Date.now() - t0 < 20000) return;
      clearInterval(timer);
      const text = function (sel) { const el = document.querySelector(sel); return el ? el.textContent : ''; };
      let rooms = -1; try { rooms = EV.store.all('rooms').length; } catch (e) { /* not started */ }
      parent.postMessage({ evHostedReport: { token: token, shell: shell, crash: !!document.querySelector('.crash'), gate: !!document.querySelector('.gate'),
        memoryOnly: !!(EV && EV.store && EV.store.save.memoryOnly), rooms: rooms, banner: text('.demo-banner-hosted'), statusBanner: text('.status-banner'), boot: text('#app').slice(0, 160) } }, '*');
    }, 100);
  }
})();
