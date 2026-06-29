/* ─── Student App — Interactions ────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  setActiveNav();
  initDropModal();
  initClaimButtons();
});

/* Mark the current page's nav tab as active */
function setActiveNav() {
  const path = window.location.pathname;
  document.querySelectorAll('.student-nav .nav-item').forEach(link => {
    link.classList.remove('active');
    if (path.includes(link.dataset.page)) {
      link.classList.add('active');
    }
  });
}

/* ── Drop-My-Spot Confirmation Modal ── */
function initDropModal() {
  const dropBtns = document.querySelectorAll('[data-action="drop-spot"]');
  const modal    = document.getElementById('drop-modal');
  const cancelBtn = document.getElementById('drop-cancel');
  const confirmBtn = document.getElementById('drop-confirm');

  if (!modal) return;

  dropBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      modal.classList.add('open');
      modal.dataset.eventId = btn.dataset.eventId;
    });
  });

  cancelBtn?.addEventListener('click', () => modal.classList.remove('open'));

  confirmBtn?.addEventListener('click', () => {
    const eventId = modal.dataset.eventId;
    /* TODO: POST /api/drop-spot with eventId */
    const card = document.querySelector(`[data-event-id="${eventId}"]`);
    if (card) {
      card.closest('.event-item')?.remove();
    }
    modal.classList.remove('open');
    showToast('Your spot has been dropped. A waitlisted Raider will be notified.');
  });

  /* Close on backdrop click */
  modal.addEventListener('click', e => {
    if (e.target === modal) modal.classList.remove('open');
  });
}

/* ── Claim Your Spot ── */
function initClaimButtons() {
  document.querySelectorAll('[data-action="claim-spot"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const eventId   = btn.dataset.eventId;
      const eventName = btn.dataset.eventName;
      /* TODO: POST /api/claim-spot with eventId */
      btn.textContent = 'Claimed ✓';
      btn.disabled    = true;
      btn.classList.replace('btn-primary', 'btn-ghost');
      showToast(`You've claimed your spot for ${eventName}. Show your physical student ID at the gate.`);
    });
  });
}

/* ── Reserve Spot ── */
function reserveSpot(eventId, eventName) {
  /* TODO: POST /api/reserve with eventId */
  const btn = document.querySelector(`[data-action="reserve"][data-event-id="${eventId}"]`);
  if (btn) {
    btn.textContent = 'Reserved ✓';
    btn.disabled    = true;
    btn.classList.replace('btn-outline', 'btn-ghost');
  }
  showToast(`Reserved for ${eventName}. You'll get a push notification if you're selected.`);
}

/* ── Toast Notification ── */
function showToast(message) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.cssText = `
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
      background: #1A1A1A; color: #fff; padding: 12px 20px; border-radius: 10px;
      font-size: 13px; font-weight: 500; max-width: 320px; text-align: center;
      box-shadow: 0 4px 16px rgba(0,0,0,0.25); z-index: 9999;
      transition: opacity 0.3s; line-height: 1.5;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.opacity = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 4000);
}
