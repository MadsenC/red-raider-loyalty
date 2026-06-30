/* ── API Utility ──
   Supports both:
   - Cookie auth (local Express server, same-origin)
   - JWT Bearer auth (Cloudflare Workers, cross-origin)
*/

const _base = () => (typeof window !== 'undefined' && window.API_BASE) || '';

/* Student uses 'rr_token', admin uses 'rr_admin_token' — independent sessions */
function _tokenKey(adminScope) {
  return adminScope ? 'rr_admin_token' : 'rr_token';
}

async function api(method, path, body, adminScope = false) {
  const token = localStorage.getItem(_tokenKey(adminScope));
  /* Fall back to student token if no admin token (e.g. cookie-based local dev) */
  const fallback = !adminScope ? null : localStorage.getItem('rr_token');
  const activeToken = token || fallback || null;

  const headers = { 'Content-Type': 'application/json' };
  if (activeToken) headers['Authorization'] = `Bearer ${activeToken}`;

  const opts = { method, headers, credentials: 'same-origin' };
  if (body) opts.body = JSON.stringify(body);

  const res  = await fetch(_base() + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status, data });
  return data;
}

const API = {
  get:  (path, admin)        => api('GET',    path, null,  admin),
  post: (path, body, admin)  => api('POST',   path, body,  admin),
  put:  (path, body, admin)  => api('PUT',    path, body,  admin),
  del:  (path, admin)        => api('DELETE', path, null,  admin),

  auth: {
    me:          ()    => api('GET',  '/api/auth/me',     null,  false),
    meAdmin:     ()    => api('GET',  '/api/auth/me',     null,  true),
    login:       (e,p) => API.post('/api/auth/login',  { erider: e, password: p }),
    logout:      ()    => API.post('/api/auth/logout').finally(() => localStorage.removeItem('rr_token')),
    logoutAdmin: ()    => API.post('/api/auth/logout').finally(() => localStorage.removeItem('rr_admin_token')),
  },
  student: {
    events:   ()       => API.get('/api/student/events'),
    activity: ()       => API.get('/api/student/activity'),
    rewards:  ()       => API.get('/api/student/rewards'),
    reserve:  (id)     => API.post(`/api/student/reserve/${id}`),
    claim:    (id)     => API.post(`/api/student/claim/${id}`),
    drop:     (id)     => API.post(`/api/student/drop/${id}`),
    redeem:   (id)     => API.post(`/api/student/redeem/${id}`),
  },
  admin: {
    events:         ()     => api('GET',  '/api/admin/events',                        null, true),
    createEvent:    (b)    => api('POST', '/api/admin/events',                        b,    true),
    updateEvent:    (id,b) => api('PUT',  `/api/admin/events/${id}`,                  b,    true),
    dashboard:      (id)   => api('GET',  `/api/admin/events/${id}/dashboard`,         null, true),
    runSelection:   (id)   => api('POST', `/api/admin/events/${id}/run-selection`,     null, true),
    allotTickets:   (id)   => api('POST', `/api/admin/events/${id}/allot-tickets`,     null, true),
    noshowSweep:    (id)   => api('POST', `/api/admin/events/${id}/noshow-sweep`,      null, true),
    students:       (q)    => api('GET',  `/api/admin/students${q ? '?q='+encodeURIComponent(q) : ''}`, null, true),
    disputes:       (s)    => api('GET',  `/api/admin/disputes?status=${s||'pending'}`,null, true),
    clearDispute:   (id)   => api('POST', `/api/admin/disputes/${id}/clear`,           null, true),
    upholdDispute:  (id)   => api('POST', `/api/admin/disputes/${id}/uphold`,          null, true),
    checkin:        (b)    => api('POST', '/api/admin/checkin',                        b,    true),
    rewards:        ()     => api('GET',  '/api/admin/rewards',                        null, true),
    createReward:   (b)    => api('POST', '/api/admin/rewards',                        b,    true),
    updateReward:   (id,b) => api('PUT',  `/api/admin/rewards/${id}`,                  b,    true),
    config:         ()     => api('GET',  '/api/admin/config',                         null, true),
    saveConfig:     (b)    => api('PUT',  '/api/admin/config',                         b,    true),
  },
};

/* Guard: redirect to login if not authenticated */
async function requireLogin(adminOnly = false) {
  try {
    const me = adminOnly ? await API.auth.meAdmin() : await API.auth.me();
    if (adminOnly && me.role !== 'admin') {
      window.location.href = _adminLoginUrl();
      return null;
    }
    return me;
  } catch (e) {
    window.location.href = adminOnly ? _adminLoginUrl() : _loginUrl();
    return null;
  }
}

function _loginUrl() {
  const parts = location.pathname.split('/');
  const htmlIdx = parts.findIndex(p => p.endsWith('.html'));
  const base = htmlIdx > 0 ? parts.slice(0, htmlIdx).join('/') : '';
  /* Student login is always at root of the site */
  const root = base.replace(/\/Admin$/, '');
  return (root || '') + '/login.html';
}

function _adminLoginUrl() {
  const parts = location.pathname.split('/');
  const htmlIdx = parts.findIndex(p => p.endsWith('.html'));
  const base = htmlIdx > 0 ? parts.slice(0, htmlIdx).join('/') : '';
  const root = base.replace(/\/Admin$/, '');
  return (root || '') + '/Admin/login.html';
}

function toast(msg, type = 'default') {
  let el = document.getElementById('_toast');
  if (!el) {
    el = document.createElement('div');
    el.id = '_toast';
    el.style.cssText = `
      position:fixed;bottom:32px;left:50%;transform:translateX(-50%);
      padding:12px 20px;border-radius:14px;font-size:13px;font-weight:600;
      max-width:320px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.2);
      z-index:9999;transition:opacity 0.3s;line-height:1.5;
      font-family:'Hanken Grotesk',sans-serif;
    `;
    document.body.appendChild(el);
  }
  el.style.background = type === 'error' ? '#CC0000' : '#141417';
  el.style.color = '#fff';
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, 4000);
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + ' · ' +
    d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) + ' CT';
}

function dayTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US',{weekday:'short'}) + ' · ' +
    d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
}
