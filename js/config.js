/* ── API Base URL ──
   Local dev (Express):   leave as ''  (same-origin)
   Local dev (Wrangler):  'http://localhost:8787'
   Production (Workers):  update this after running: wrangler deploy
*/
window.API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? ''
  : 'https://red-raider-loyalty.thestoneage.workers.dev';
