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

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
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

  function starRatingHTML(apptId) {
    const stars = [5, 4, 3, 2, 1]
      .map(
        (n) => `
      <input type="radio" id="star${n}-${apptId}" name="rating-${apptId}" value="${n}" required />
      <label for="star${n}-${apptId}">★</label>`
      )
      .join('');
    return `<div class="star-rating">${stars}</div>`;
  }

  function reviewSectionHTML(a) {
    if (a.status !== 'completed') return '';
    if (a.has_review) {
      return `<div class="appt-meta" style="color:var(--color-primary-dark); font-weight:600;">✓ You left a review for this visit. Thanks!</div>`;
    }
    return `
      <div>
        <button type="button" class="btn btn-ghost review-toggle-btn" data-id="${a.id}">Leave a Review</button>
        <form class="review-form" data-id="${a.id}" style="display:none;">
          <label style="display:block; font-weight:700; font-size:0.9rem; margin-bottom:6px;">How did we do?</label>
          ${starRatingHTML(a.id)}
          <textarea rows="3" placeholder="Tell us about your experience (optional)" maxlength="1000"></textarea>
          <button type="submit" class="btn btn-primary" style="margin-top:10px;">Submit Review</button>
        </form>
      </div>
    `;
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
        const canCancel = a.status === 'confirmed';
        const statusLabel = a.status === 'cancelled' ? 'Cancelled' : a.status === 'completed' ? 'Completed' : 'Confirmed';
        const statusClass = `status-${a.status}`;

        return `
      <div class="card appt-card" data-id="${a.id}">
        <div class="appt-card-row">
          <div>
            <h4>${escapeHtml(a.service_name)} — Confirmation #${a.id}</h4>
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
        ${reviewSectionHTML(a)}
      </div>
    `;
      })
      .join('');

    el.apptList.querySelectorAll('.cancel-btn').forEach((btn) => {
      btn.addEventListener('click', () => cancelAppointment(btn.dataset.id));
    });
    el.apptList.querySelectorAll('.review-toggle-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const form = el.apptList.querySelector(`.review-form[data-id="${btn.dataset.id}"]`);
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
      });
    });
    el.apptList.querySelectorAll('.review-form').forEach((form) => {
      form.addEventListener('submit', (evt) => submitReview(evt, form));
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

  async function submitReview(evt, form) {
    evt.preventDefault();
    const id = form.dataset.id;
    const ratingInput = form.querySelector('input[type="radio"]:checked');
    const comment = form.querySelector('textarea').value;
    const submitBtn = form.querySelector('button[type="submit"]');

    if (!ratingInput) {
      showAlert(el.resultsAlert, 'Please choose a star rating.', 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';

    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId: Number(id),
          email: el.email.value,
          phone: el.phone.value,
          rating: Number(ratingInput.value),
          comment,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        showAlert(el.resultsAlert, (data.errors || ['Could not submit your review.']).join('<br>'), 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Review';
        return;
      }

      await lookup();
      showAlert(el.resultsAlert, 'Thanks for your review! It will appear on the site once approved.', 'success');
    } catch (e) {
      showAlert(el.resultsAlert, 'Network error while submitting your review. Please try again.', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Review';
    }
  }

  el.form.addEventListener('submit', (evt) => {
    evt.preventDefault();
    lookup();
  });
})();
