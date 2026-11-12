/* main.js — entry point (kept separate so a strict Content-Security-Policy needs no inline script). */
(function () {
  'use strict';
  if (window.EV && window.EV.boot && !window.EV_NO_AUTOBOOT) window.EV.boot();
})();
