/* ─── Admin Dashboard — Interactions ────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  setActiveSidebarLink();
  initEventModal();
  initStudentSearch();
  initNoShowActions();
  initKiosk();
  initRunSelection();
});

/* Highlight the active sidebar link based on current URL */
function setActiveSidebarLink() {
  const path = window.location.pathname;
  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.classList.remove('active');
    const href = link.getAttribute('href') || '';
    if (href && path.endsWith(href)) {
      link.classList.add('active');
    }
  });
}

/* ── New Event Modal ── */
function initEventModal() {
  const openBtn  = document.getElementById('new-event-btn');
  const modal    = document.getElementById('event-modal');
  const closeBtn = document.getElementById('event-modal-close');
  const form     = document.getElementById('event-form');

  if (!modal) return;

  openBtn?.addEventListener('click', () => {
    form?.reset();
    document.getElementById('event-modal-title').textContent = 'New Event';
    modal.classList.add('open');
  });

  closeBtn?.addEventListener('click', () => modal.classList.remove('open'));

  modal.addEventListener('click', e => {
    if (e.target === modal) modal.classList.remove('open');
  });

  form?.addEventListener('submit', e => {
    e.preventDefault();
    /* TODO: POST /api/admin/events */
    modal.classList.remove('open');
    showAdminToast('Event saved successfully.');
  });

  /* Entry mode toggle — show/hide reservation window fields */
  const modeSelect = document.getElementById('entry-mode');
  modeSelect?.addEventListener('change', () => {
    const reservationFields = document.getElementById('reservation-fields');
    if (reservationFields) {
      reservationFields.style.display =
        modeSelect.value === 'reservation_required' ? 'block' : 'none';
    }
  });
}

/* ── Student Search ── */
function initStudentSearch() {
  const input = document.getElementById('student-search');
  const tbody = document.getElementById('students-tbody');

  if (!input || !tbody) return;

  input.addEventListener('input', () => {
    const q = input.value.toLowerCase();
    tbody.querySelectorAll('tr').forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(q) ? '' : 'none';
    });
  });
}

/* ── No-Show Dispute Actions ── */
function initNoShowActions() {
  document.querySelectorAll('[data-action="clear-dispute"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.dispute-card');
      card.innerHTML = `
        <div class="empty-state" style="padding: 16px;">
          ✓ Flag cleared — no penalty applied.
        </div>`;
      showAdminToast('Dispute resolved. Flag cleared, points unchanged.');
    });
  });

  document.querySelectorAll('[data-action="uphold-dispute"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.dispute-card');
      card.innerHTML = `
        <div class="empty-state" style="padding: 16px; color: #991B1B;">
          ✗ Dispute denied — penalty applied.
        </div>`;
      showAdminToast('Dispute denied. Point penalty has been applied.');
    });
  });
}

/* ── Run Selection (Draw) ── */
function initRunSelection() {
  const runBtn = document.getElementById('run-selection-btn');
  if (!runBtn) return;

  runBtn.addEventListener('click', () => {
    if (!confirm('Run the weighted selection for this event? This will confirm spots for eligible students and notify them.')) return;
    runBtn.disabled    = true;
    runBtn.textContent = 'Running…';
    /* TODO: POST /api/admin/events/:id/run-selection */
    setTimeout(() => {
      runBtn.textContent = 'Selection Complete ✓';
      showAdminToast('Selection complete. Students have been notified.');
    }, 1500);
  });

  const noShowBtn = document.getElementById('run-noshow-btn');
  noShowBtn?.addEventListener('click', () => {
    if (!confirm('Run no-show sweep? Students who claimed a spot and did not scan in will be flagged.')) return;
    noShowBtn.disabled    = true;
    noShowBtn.textContent = 'Running…';
    /* TODO: POST /api/admin/events/:id/noshow-sweep */
    setTimeout(() => {
      noShowBtn.textContent = 'Sweep Complete ✓';
      showAdminToast('No-show sweep complete. Disputes are now available for review.');
    }, 1200);
  });

  const recomputeBtn = document.getElementById('recompute-btn');
  recomputeBtn?.addEventListener('click', () => {
    recomputeBtn.disabled    = true;
    recomputeBtn.textContent = 'Recomputing…';
    /* TODO: POST /api/admin/events/:id/recompute */
    setTimeout(() => {
      recomputeBtn.disabled    = false;
      recomputeBtn.textContent = 'Recompute stats';
      showAdminToast('Stats recomputed.');
    }, 800);
  });
}

/* ── Kiosk Check-In ── */
function initKiosk() {
  const form   = document.getElementById('kiosk-form');
  const input  = document.getElementById('kiosk-input');
  const result = document.getElementById('kiosk-result');

  if (!form) return;

  form.addEventListener('submit', e => {
    e.preventDefault();
    const id = input.value.trim().toUpperCase();
    if (!id) return;

    /* TODO: POST /api/admin/checkin with rNumber */
    /* Simulated result */
    const success = id !== 'TEST-FAIL';
    result.style.display = 'block';
    result.innerHTML = success
      ? `<div class="checkin-success">
           <div class="checkin-icon">✓</div>
           <div class="checkin-headline" style="color: #1B7A3B;">Entry Confirmed</div>
           <div class="checkin-sub">Points posted automatically.</div>
           <div style="margin-top:16px; text-align:left;">
             <div class="checkin-detail-row"><span class="checkin-detail-label">ID</span><span class="checkin-detail-value">${id}</span></div>
             <div class="checkin-detail-row"><span class="checkin-detail-label">Status</span><span class="checkin-detail-value" style="color:#1B7A3B;">Claimed — Confirmed</span></div>
           </div>
         </div>`
      : `<div class="checkin-fail">
           <div class="checkin-icon">✗</div>
           <div class="checkin-headline" style="color: #CC0000;">Entry Denied</div>
           <div class="checkin-sub">No confirmed claim found for <strong>${id}</strong>. Direct to waitlist area.</div>
         </div>`;

    input.value = '';
    input.focus();
  });
}

/* ── Admin Toast ── */
function showAdminToast(message) {
  let toast = document.getElementById('admin-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'admin-toast';
    toast.style.cssText = `
      position: fixed; bottom: 24px; right: 24px;
      background: #1A1A1A; color: #fff; padding: 12px 20px;
      border-radius: 10px; font-size: 13px; font-weight: 500;
      box-shadow: 0 4px 16px rgba(0,0,0,0.25); z-index: 9999;
      transition: opacity 0.3s; max-width: 340px; line-height: 1.5;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.opacity = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 4000);
}

/* ── Edit Event — populate modal ── */
function editEvent(eventId) {
  /* TODO: GET /api/admin/events/:id and fill form */
  const modal = document.getElementById('event-modal');
  if (modal) {
    document.getElementById('event-modal-title').textContent = 'Edit Event';
    modal.classList.add('open');
  }
}
