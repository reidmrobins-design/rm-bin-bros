(function () {
  const el = {
    form: document.getElementById('lookupForm'),
    email: document.getElementById('lookupEmail'),
    phone: document.getElementById('lookupPhone'),
    lookupBtn: document.getElementById('lookupBtn'),
    lookupAlert: document.getElementById('lookupAlert'),
    resultsAlert: document.getElementById('resultsAlert'),
    apptList: document.getElementById('apptList'),
  };

  function showAlert(target, message, type) {
    target.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
  }

  function clearAlert(target) {
    target.innerHTML = '';
  }

  function formatTimeLabel(t) {
    const [h, m] = t.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
  }

  function formatDateLabel(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function renderAppointments(appointments) {
    if (appointments.length === 0) {
      showAlert(
        el.resultsAlert,
        "We couldn't find any appointments matching that email and phone number.",
        'error'
      );
      el.apptList.innerHTML = '';
      return;
    }

    clearAlert(el.resultsAlert);

    el.apptList.innerHTML = appointments
      .map((a) => {
        const isCancelled = a.status === 'cancelled';
        const isPast = a.appt_date < todayISO();
        const canCancel = !isCancelled && !isPast;
        const statusLabel = isCancelled ? 'Cancelled' : isPast ? 'Completed' : 'Confirmed';
        const statusClass = isCancelled ? 'status-cancelled' : 'status-confirmed';

        return `
      <div class="card appt-card" data-id="${a.id}">
        <div>
          <h4>${a.service_name} — Confirmation #${a.id}</h4>
          <div class="appt-meta">
            ${formatDateLabel(a.appt_date)} at ${formatTimeLabel(a.appt_time)}<br>
            ${a.bins_count} bin${a.bins_count === 1 ? '' : 's'} &middot; ${formatPrice(a.price_cents)} / visit
          </div>
        </div>
        <div class="appt-actions">
          <span class="status-pill ${statusClass}">${statusLabel}</span>
          ${canCancel ? `<button type="button" class="btn btn-ghost cancel-btn" data-id="${a.id}">Cancel Appointment</button>` : ''}
        </div>
      </div>
    `;
      })
      .join('');

    el.apptList.querySelectorAll('.cancel-btn').forEach((btn) => {
      btn.addEventListener('click', () => cancelAppointment(btn.dataset.id));
    });
  }

  async function lookup() {
    clearAlert(el.lookupAlert);
    clearAlert(el.resultsAlert);
    el.apptList.innerHTML = '';
    el.lookupBtn.disabled = true;
    el.lookupBtn.textContent = 'Searching…';

    try {
      const res = await fetch('/api/appointments/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: el.email.value, phone: el.phone.value }),
      });
      const data = await res.json();

      if (!res.ok) {
        showAlert(el.lookupAlert, (data.errors || ['Something went wrong. Please try again.']).join('<br>'), 'error');
        return;
      }

      renderAppointments(data.appointments);
    } catch (e) {
      showAlert(el.lookupAlert, 'Network error — please try again.', 'error');
    } finally {
      el.lookupBtn.disabled = false;
      el.lookupBtn.textContent = 'Find My Appointments';
    }
  }

  async function cancelAppointment(id) {
    if (!confirm('Cancel this appointment? This cannot be undone.')) return;

    try {
      const res = await fetch(`/api/appointments/${id}/cancel-self`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: el.email.value, phone: el.phone.value }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        showAlert(el.resultsAlert, (data.errors || ['Could not cancel that appointment.']).join('<br>'), 'error');
        return;
      }

      await lookup();
      showAlert(el.resultsAlert, 'Your appointment has been cancelled.', 'success');
    } catch (e) {
      showAlert(el.resultsAlert, 'Network error while cancelling. Please try again.', 'error');
    }
  }

  el.form.addEventListener('submit', (evt) => {
    evt.preventDefault();
    lookup();
  });
})();
