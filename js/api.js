/* ── API Utility ──
   Supports both:
   - Cookie auth (local Express server, same-origin)
   - JWT Bearer auth (Cloudflare Workers, cross-origin)
*/

const _base = () => (typeof window !== 'undefined' && window.API_BASE) || '';

async function api(method, path, body) {
  const token = localStorage.getItem('rr_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers, credentials: 'same-origin' };
  if (body) opts.body = JSON.stringify(body);

  const res  = await fetch(_base() + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status, data });
  return data;
}

const API = {
  get:  (path)        => api('GET',    path),
  post: (path, body)  => api('POST',   path, body),
  put:  (path, body)  => api('PUT',    path, body),
  del:  (path)        => api('DELETE', path),

  auth: {
    me:     ()         => API.get('/api/auth/me'),
    login:  (e, p)     => API.post('/api/auth/login',  { erider: e, password: p }),
    logout: ()         => API.post('/api/auth/logout').finally(() => localStorage.removeItem('rr_token')),
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
    events:         ()     => API.get('/api/admin/events'),
    createEvent:    (b)    => API.post('/api/admin/events', b),
    updateEvent:    (id,b) => API.put(`/api/admin/events/${id}`, b),
    dashboard:      (id)   => API.get(`/api/admin/events/${id}/dashboard`),
    runSelection:   (id)   => API.post(`/api/admin/events/${id}/run-selection`),
    noshowSweep:    (id)   => API.post(`/api/admin/events/${id}/noshow-sweep`),
    students:       (q)    => API.get(`/api/admin/students${q ? '?q='+encodeURIComponent(q) : ''}`),
    disputes:       (s)    => API.get(`/api/admin/disputes?status=${s||'pending'}`),
    clearDispute:   (id)   => API.post(`/api/admin/disputes/${id}/clear`),
    upholdDispute:  (id)   => API.post(`/api/admin/disputes/${id}/uphold`),
    checkin:        (b)    => API.post('/api/admin/checkin', b),
    rewards:        ()     => API.get('/api/admin/rewards'),
    createReward:   (b)    => API.post('/api/admin/rewards', b),
    updateReward:   (id,b) => API.put(`/api/admin/rewards/${id}`, b),
    config:         ()     => API.get('/api/admin/config'),
    saveConfig:     (b)    => API.put('/api/admin/config', b),
  },
};

/* Guard: redirect to login if not authenticated */
async function requireLogin(adminOnly = false) {
  try {
    const me = await API.auth.me();
    if (adminOnly && me.role !== 'admin') {
      window.location.href = _loginUrl();
      return null;
    }
    return me;
  } catch (e) {
    window.location.href = _loginUrl();
    return null;
  }
}

function _loginUrl() {
  /* Works on localhost AND GitHub Pages (/red-raider-loyalty/login.html) */
  const parts = location.pathname.split('/');
  const base  = parts.slice(0, parts.lastIndexOf(parts.find(p => p.endsWith('.html')) || '') || parts.length - 1).join('/');
  return (base || '') + '/login.html';
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
