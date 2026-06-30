/* ── Red Raider Loyalty — Student SPA ── */

let me = null;
let events = [];
let activity = null;
let currentTab = 'home';

function studentLogout() {
  localStorage.removeItem('rr_token');
  window.location.href = 'login.html';
}

/* ─── Boot ─── */
(async () => {
  me = await requireLogin();
  if (!me) return;
  document.getElementById('hdrPts').textContent = me.seasonPoints.toLocaleString();
  lucide.createIcons();
  await loadEvents();
  renderTab('home');
})();

/* ─── Tab switching ─── */
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  renderTab(tab);
}

async function renderTab(tab) {
  const body = document.getElementById('appBody');
  body.innerHTML = '<div class="spinner"></div>';
  try {
    if (tab === 'home')     { await loadEvents(); body.innerHTML = renderHome(); }
    if (tab === 'reserve')  { await loadEvents(); body.innerHTML = renderReserve(); }
    if (tab === 'tickets')  { await loadEvents(); body.innerHTML = renderTickets(); }
    if (tab === 'activity') { await loadActivity(); body.innerHTML = renderActivity(); }
  } catch (e) {
    body.innerHTML = `<div class="empty">Failed to load. Please try again.</div>`;
  }
  lucide.createIcons();
}

async function loadEvents()   { events   = await API.student.events(); }
async function loadActivity() { activity = await API.student.activity(); }

/* ─── HOME ─── */
function renderHome() {
  const R = 51, circ = 2 * Math.PI * R;
  const frac  = Math.min(me.seasonPoints / 2000, 1);

  const upcoming = events.find(e =>
    ['reserved','selected','confirmed'].includes(e.userStatus) &&
    new Date(e.datetime) > new Date()
  );

  const earnEvents = events.filter(e => !e.userStatus && new Date(e.datetime) > new Date());

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = me.name.split(' ')[0];

  const upcomingBlock = upcoming ? `
    <div class="card" style="margin-top:14px;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;color:#CC0000;">YOUR RESERVATION</div>
        ${statusPill(upcoming)}
      </div>
      <div style="font-size:19px;font-weight:700;letter-spacing:-0.015em;margin-top:13px;">${upcoming.name}</div>
      <div style="font-size:13px;color:#6B6B72;font-weight:500;margin-top:4px;">${dayTime(upcoming.datetime)}</div>
      ${progressSteps(upcoming)}
      ${claimActionRow(upcoming)}
    </div>` : '';

  const earnChips = earnEvents.slice(0, 6).map(e => `
    <div class="event-chip${e.highImpact ? ' high' : ''}">
      <div class="chip-sport">${e.sport.toUpperCase()}</div>
      <div class="chip-name">${shortName(e.name)}</div>
      <div class="chip-date">${dayTime(e.datetime)}</div>
      <div class="chip-pts">
        <span class="num">+${e.attendPoints}</span>
        <span class="lbl">pts</span>
      </div>
    </div>`).join('');

  return `<div style="animation:rrfade 0.4s ease both;">
    <div style="padding:0 2px 2px;">
      <div style="font-size:13px;color:#9A9AA2;font-weight:600;">${greeting},</div>
      <div style="font-size:24px;font-weight:800;letter-spacing:-0.02em;margin-top:1px;">${firstName}</div>
    </div>

    <div class="ring-card" style="margin-top:16px;">
      <div class="ring-row">
        <div class="ring-wrap">
          <svg width="118" height="118" viewBox="0 0 118 118">
            <circle cx="59" cy="59" r="${R}" fill="none" stroke="#E6E6EA" stroke-width="10"></circle>
            <circle id="ringArc" cx="59" cy="59" r="${R}" fill="none" stroke="#CC0000" stroke-width="10"
              stroke-linecap="round" stroke-dasharray="${(2*Math.PI*R).toFixed(2)}"
              stroke-dashoffset="${(2*Math.PI*R).toFixed(2)}" transform="rotate(-90 59 59)"></circle>
          </svg>
          <div class="ring-inner">
            <div class="ring-pts" id="ringPts">0</div>
            <div class="ring-lbl">POINTS</div>
          </div>
        </div>
        <div class="ring-info">
          <div class="standing-lbl">SEASON STANDING</div>
          <div class="standing-rank">#${me.rank.toLocaleString()}</div>
          <div class="standing-sub">of ${me.totalStudents.toLocaleString()} students</div>
          <div class="last-game-chip">
            <i data-lucide="arrow-up" width="13" height="13" stroke-width="3"></i>
            ${me.seasonPoints.toLocaleString()} pts this season
          </div>
        </div>
      </div>
    </div>

    ${upcomingBlock}

    <div class="section-hd">
      <h2>Upcoming events</h2>
      <a onclick="switchTab('reserve')">See all</a>
    </div>
    ${earnChips.length
      ? `<div class="events-scroll">${earnChips}</div>`
      : '<div class="empty" style="padding:20px 0;">No upcoming events right now.</div>'}

    <div class="svc-card">
      <div class="svc-eyebrow">STUDENT VICTORY CLUB</div>
      <div class="svc-title">Guaranteed claims.<br>Every home game.</div>
      <div class="svc-sub">$500 / yr · capped at 2,000 members · renewal rebate for low no-shows</div>
      <button class="svc-btn">Learn more <i data-lucide="arrow-right" width="16" height="16" stroke-width="2.25"></i></button>
    </div>
  </div>`;
}

/* ─── RESERVE ─── */
function renderReserve() {
  const reservable    = events.filter(e => e.mode === 'reservation_required');
  const myRes         = reservable.filter(e => e.userStatus && e.userStatus !== 'dropped');
  const openToReserve = reservable.filter(e => !e.userStatus && e.windowStatus === 'reservation_open');
  const comingSoon    = reservable.filter(e => !e.userStatus && e.windowStatus === 'pre_reservation');

  let html = '<div style="animation:rrfade 0.4s ease both;">';

  /* My active reservations */
  if (myRes.length) {
    html += `<div class="section-hd" style="margin-top:0;"><h2>My Reservations</h2></div>`;
    myRes.forEach((ev, i) => {
      const expanded = `ev-tl-${ev.id}`;
      html += `
        <div class="card" style="${i > 0 ? 'margin-top:12px;' : ''}">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            ${statusPill(ev)}
            <div class="event-step">Step ${windowStep(ev.windowStatus)} of 5</div>
          </div>
          <div class="event-name-lg">${ev.name}</div>
          <div class="event-meta">${dayTime(ev.datetime)}</div>
          ${progressSteps(ev)}
          ${waitlistInfo(ev)}
          ${claimActionRow(ev)}
          <div style="margin-top:10px;">
            <button class="btn btn-ghost btn-sm" style="font-size:11px;padding:6px 10px;"
              onclick="toggleTimeline('${expanded}')">
              <i data-lucide="calendar" width="13" height="13" stroke-width="2"></i>
              Game week timeline
            </button>
            ${ev.windowStatus !== 'locked' ? `<button class="withdraw-btn" style="float:right;" onclick="doAction('drop',${ev.id})">Withdraw</button>` : ''}
          </div>
          <div id="${expanded}" style="display:none;margin-top:12px;">
            ${eventTimeline(ev)}
          </div>
        </div>`;
    });
  }

  /* Open to reserve */
  if (openToReserve.length) {
    html += `<div class="section-hd"><h2>Open Now</h2></div>`;
    openToReserve.forEach(ev => {
      html += `
        <div class="card" style="margin-top:12px;">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div class="status-pill pill-open">Reservation open</div>
            <div class="event-step">Step 1 of 5</div>
          </div>
          <div class="event-name-lg">${ev.name}</div>
          <div class="event-meta">${dayTime(ev.datetime)}</div>
          <div class="window-note">Window closes ${fmtDateTime(ev.windows.reservationCloses)} · priority by point standing</div>
          <button class="reserve-btn" onclick="doAction('reserve',${ev.id})">Reserve my spot</button>
        </div>`;
    });
  }

  /* Coming soon */
  if (comingSoon.length) {
    html += `<div class="section-hd"><h2>Coming Soon</h2></div>`;
    comingSoon.forEach(ev => {
      html += `
        <div class="card" style="margin-top:12px;opacity:0.7;">
          <div class="status-pill" style="background:#F0F0F3;color:#9A9AA2;">Coming soon</div>
          <div class="event-name-lg">${ev.name}</div>
          <div class="event-meta">${dayTime(ev.datetime)}</div>
          <div class="window-note">Reservation opens ${fmtDateTime(ev.windows.reservationOpens)}</div>
        </div>`;
    });
  }

  if (!myRes.length && !openToReserve.length && !comingSoon.length) {
    html += '<div class="empty">No upcoming reservation windows right now.</div>';
  }

  html += '</div>';
  return html;
}

function toggleTimeline(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

/* Per-event timeline from real window data */
function eventTimeline(ev) {
  const w = ev.windows;
  const now = new Date().toISOString();
  const steps = [
    { label: 'Reservation opens',  val: w.reservationOpens },
    { label: 'Draw runs',          val: w.drawAt },
    { label: 'Reservation closes', val: w.reservationCloses },
    { label: 'Claim window opens', val: w.claimOpens },
    { label: 'Claim window closes',val: w.claimCloses },
    { label: 'Waitlist cascade',   val: w.waitlistCascade },
    { label: 'Open claim begins',  val: w.openClaimStart },
    { label: 'Drop window closes', val: w.dropCloses },
  ].filter(s => s.val).sort((a, b) => a.val > b.val ? 1 : -1);

  if (!steps.length) return '<p style="font-size:12px;color:#9A9AA2;">No schedule set.</p>';

  return `<div style="padding:4px 0 8px;">` + steps.map((s, i) => {
    const done   = now > s.val;
    const isLast = i === steps.length - 1;
    const dt     = new Date(s.val).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
    return `<div class="tl-row">
      <div class="tl-left">
        <div class="tl-dot" style="background:${done ? '#141417' : '#E6E6EA'};border:${done ? 'none' : '2px solid #DDDDE2'};"></div>
        ${!isLast ? `<div class="tl-line" style="background:${done ? '#141417' : '#EFEFF2'};"></div>` : ''}
      </div>
      <div class="tl-content">
        <div class="tl-time" style="color:${done ? '#CC0000' : '#9A9AA2'};">${dt}</div>
        <div class="tl-title" style="color:${done ? '#141417' : '#6B6B72'};">${s.label}</div>
      </div>
    </div>`;
  }).join('') + `</div>`;
}

/* ─── TICKETS ─── */
function renderTickets() {
  /* Only games the student is confirmed to get into */
  const confirmed = events.filter(e =>
    e.userStatus === 'claimed' || e.checkedIn ||
    (e.userStatus === 'selected' || e.userStatus === 'confirmed')
  );

  const initials = me.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
  const rNum     = me.erider ? me.erider.toUpperCase() : '—';
  const year     = new Date().getFullYear();

  let html = `<div style="animation:rrfade 0.4s ease both;">
    <div class="pass-card">
      <div class="pass-ring-1"></div>
      <div class="pass-ring-2"></div>
      <div class="pass-top">
        <div class="pass-eyebrow">STUDENT ATHLETIC PASS</div>
        <div class="pass-year">${year}–${(year+1).toString().slice(2)}</div>
      </div>
      <div class="pass-id-row">
        <div class="pass-avatar">${initials}</div>
        <div>
          <div class="pass-name">${me.name}</div>
          <div class="pass-sub">${rNum} · ${me.class || 'Student'}</div>
        </div>
      </div>
      <div class="pass-footer">
        <div class="pass-card-label">RAIDERCARD</div>
        <i data-lucide="scan-line" width="22" height="22" stroke-width="1.75" style="color:rgba(255,255,255,0.85);"></i>
      </div>
    </div>`;

  /* Ready to claim — still need to tap claim */
  const readyToClaim = confirmed.filter(e =>
    (e.userStatus === 'selected' || e.userStatus === 'confirmed') &&
    (e.windowStatus === 'claim_open' || e.windowStatus === 'open_claim')
  );

  if (readyToClaim.length) {
    html += `<div class="section-label red">CLAIM YOUR SPOT</div>`;
    readyToClaim.forEach(ev => {
      html += `
        <div class="claim-card" style="margin-bottom:12px;">
          <div class="claim-selected">
            <i data-lucide="party-popper" width="17" height="17" stroke-width="2"></i>
            You've been selected!
          </div>
          <div class="event-name-lg">${ev.name}</div>
          <div class="event-meta">${dayTime(ev.datetime)}</div>
          <div class="action-row">
            <div style="font-size:12.5px;font-weight:700;color:#141417;">Claim by ${fmtDateTime(ev.windows.claimCloses)}</div>
            <button class="claim-btn" onclick="doAction('claim',${ev.id})">Claim spot</button>
          </div>
        </div>`;
    });
  }

  /* Claimed / checked in */
  const claimed = confirmed.filter(e => e.userStatus === 'claimed' || e.checkedIn);
  if (claimed.length) {
    html += `<div class="section-label">YOUR TICKETS</div>`;
    claimed.forEach(ev => {
      html += `
        <div class="card" style="margin-bottom:12px;">
          <div style="display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:700;color:#141417;">
            <span class="confirmed-check"><i data-lucide="check" width="12" height="12" stroke-width="3"></i></span>
            Spot confirmed
          </div>
          <div class="event-name-lg">${ev.name}</div>
          <div class="event-meta">${dayTime(ev.datetime)}</div>
          <div class="action-row">
            <div style="font-size:12.5px;font-weight:700;color:#CC0000;">+${ev.attendPoints} pts on gate entry</div>
            ${ev.checkedIn
              ? `<div style="font-size:12px;font-weight:700;color:#2E7D32;">✓ Checked in</div>`
              : (ev.windowStatus !== 'locked'
                ? `<button class="drop-btn" onclick="doAction('drop',${ev.id})"><i data-lucide="x" width="14" height="14" stroke-width="2.5"></i> Drop</button>`
                : '')}
          </div>
        </div>`;
    });
  }

  if (!readyToClaim.length && !claimed.length) {
    html += `<div class="empty" style="padding:32px 0;">No confirmed tickets yet.<br><span style="font-size:13px;color:#9A9AA2;">Reserve a spot — when selected, your ticket appears here.</span></div>`;
  }

  html += `
    <div class="gate-info">
      <i data-lucide="info" width="19" height="19" stroke-width="2" style="color:#CC0000;flex:0 0 auto;margin-top:1px;"></i>
      <div class="gate-text">Present your physical RaiderCard at the gate. Questions? <strong style="color:#141417;">Fan Engagement · (806) 742-3355</strong></div>
    </div>
  </div>`;

  return html;
}

/* ─── ACTIVITY ─── */
function renderActivity() {
  if (!activity) return '<div class="empty">No activity yet.</div>';
  const { history, stats } = activity;
  const season = new Date().getFullYear() + '–' + (new Date().getFullYear()+1).toString().slice(2);

  const rows = history.map(h => {
    const positive = h.amount > 0;
    const icon = h.type === 'attendance'  ? 'check-circle'
               : h.type === 'penalty'     ? 'alert-triangle'
               : h.type === 'claim_bonus' ? 'zap'
               : 'star';
    return `
      <div class="activity-row">
        <div class="act-icon"><i data-lucide="${icon}" width="18" height="18" stroke-width="2"></i></div>
        <div class="act-body">
          <div class="act-title">${h.description || h.eventName || 'Points'}</div>
          <div class="act-meta">${fmtDate(h.created_at)}${h.sport ? ' · ' + h.sport : ''}</div>
        </div>
        <div class="act-pts" style="color:${positive ? '#141417' : '#CC0000'};">${positive ? '+' : ''}${h.amount}</div>
      </div>`;
  }).join('');

  return `<div style="animation:rrfade 0.4s ease both;">
    <div style="padding:0 2px 2px;font-size:12.5px;font-weight:600;color:#9A9AA2;">Season ${season}</div>
    <div class="stat-grid">
      <div class="stat-box">
        <div class="stat-num">${stats.eventsAttended}</div>
        <div class="stat-lbl">Events</div>
      </div>
      <div class="stat-box">
        <div class="stat-num red">${me.seasonPoints.toLocaleString()}</div>
        <div class="stat-lbl">Season pts</div>
      </div>
      <div class="stat-box">
        <div class="stat-num">${stats.noShows}</div>
        <div class="stat-lbl">No-shows</div>
      </div>
    </div>
    <div class="rebate-strip">
      <i data-lucide="shield-check" width="16" height="16" stroke-width="2.25" style="color:#CC0000;flex:0 0 auto;"></i>
      <div class="rebate-text">2 no-shows or fewer = renewal rebate eligible</div>
    </div>
    ${rows.length ? `<div class="activity-list">${rows}</div>` : '<div class="empty">No point history yet.</div>'}
  </div>`;
}

/* ─── Actions ─── */
async function doAction(action, eventId) {
  try {
    let result;
    if (action === 'reserve') result = await API.student.reserve(eventId);
    if (action === 'claim')   result = await API.student.claim(eventId);
    if (action === 'drop')    result = await API.student.drop(eventId);
    toast(result.message || 'Done!');
    me = await API.auth.me();
    document.getElementById('hdrPts').textContent = me.seasonPoints.toLocaleString();
    await renderTab(currentTab);
  } catch (e) {
    toast(e.data?.error || e.message || 'Something went wrong.', 'error');
  }
}

/* ─── Helpers ─── */
function shortName(name) {
  return name.replace(/^(Football|Men's Basketball|Women's Basketball|Soccer|Baseball|Volleyball|Tennis)\s(vs\.?\s)/i, 'vs. ').slice(0, 26);
}

function statusPill(ev) {
  const s = ev.userStatus;
  if (s === 'reserved')   return `<div class="status-pill pill-reserved"><span class="pill-dot" style="background:#CC0000;"></span>Reserved</div>`;
  if (s === 'waitlisted') return `<div class="status-pill pill-waitlist">Waitlisted</div>`;
  if (s === 'selected')   return `<div class="status-pill pill-selected"><span class="pill-dot" style="background:#CC0000;"></span>Selected</div>`;
  if (s === 'confirmed')  return `<div class="status-pill pill-selected"><span class="pill-dot" style="background:#CC0000;"></span>Confirmed</div>`;
  if (s === 'claimed')    return `<div class="status-pill pill-claimed"><span class="pill-dot" style="background:#2E7D32;"></span>Claimed</div>`;
  return '';
}

function progressSteps(ev) {
  const step = windowStep(ev.windowStatus);
  const colors = Array.from({length:5}, (_,i) => {
    if (i < step - 1) return '#141417';
    if (i === step - 1) return '#CC0000';
    return '#E6E6EA';
  });
  return `<div class="progress-steps">${colors.map(c=>`<div class="step-seg" style="background:${c};"></div>`).join('')}</div>`;
}

function windowStep(ws) {
  const map = { pre_reservation:1, reservation_open:1, pre_claim:2, claim_open:3, waitlist_cascade:3, open_claim:4, locked:5, closed:5 };
  return map[ws] || 1;
}

/* Claim action row — shown in both Home card and Reserve tab */
function claimActionRow(ev) {
  const ws = ev.windowStatus;
  const canClaim = (ws === 'claim_open' || ws === 'open_claim') &&
    (ev.userStatus === 'selected' || ev.userStatus === 'confirmed');

  if (canClaim) {
    return `<div class="action-row" style="margin-top:10px;">
      <div style="font-size:12.5px;font-weight:700;color:#CC0000;">Claim window open now!</div>
      <button class="claim-btn" onclick="doAction('claim',${ev.id})">Claim spot</button>
    </div>`;
  }
  if (ws === 'pre_claim' && ev.windows.claimOpens) {
    return `<div class="alert-banner" style="margin-top:12px;">
      <i data-lucide="clock" width="16" height="16" stroke-width="2.25" style="color:#CC0000;flex:0 0 auto;"></i>
      <div class="alert-text">Claim window opens ${fmtDateTime(ev.windows.claimOpens)}</div>
    </div>`;
  }
  return '';
}

function waitlistInfo(ev) {
  if (ev.userStatus !== 'waitlisted') return '';
  return `<div class="waitlist-chip">
    <i data-lucide="trending-up" width="15" height="15" stroke-width="2.25" style="color:#CC0000;"></i>
    On waitlist — you'll be notified if a spot opens
  </div>`;
}

/* ─── Ring animation ─── */
function animateRing(target) {
  const arc   = document.getElementById('ringArc');
  const ptsEl = document.getElementById('ringPts');
  if (!arc) return;
  const R = 51, circ = 2 * Math.PI * R;
  const dur = 1300, start = performance.now();
  const step = (now) => {
    const raw  = Math.min(1, (now - start) / dur);
    const ease = 1 - Math.pow(1 - raw, 3);
    const cur  = Math.round(target * ease);
    arc.style.strokeDashoffset = (circ * (1 - Math.min(cur / 2000, 1))).toFixed(2);
    if (ptsEl) ptsEl.textContent = cur.toLocaleString();
    if (raw < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* Animate ring + re-run lucide after any tab render */
const observer = new MutationObserver(() => {
  if (currentTab === 'home' && document.getElementById('ringArc') && me) animateRing(me.seasonPoints);
  lucide.createIcons();
});
observer.observe(document.getElementById('appBody'), { childList: true });
