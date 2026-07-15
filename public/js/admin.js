const keyInput = document.getElementById('adminKey');
const body = document.getElementById('apptBody');
const alertBox = document.getElementById('alertBox');

const savedKey = localStorage.getItem('rmBinBrosAdminKey');
if (savedKey) keyInput.value = savedKey;

function showAlert(msg, type) {
  alertBox.innerHTML = `<div class="alert alert-${type}">${msg}</div>`;
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

async function loadAppointments() {
  const key = keyInput.value.trim();
  if (!key) {
    showAlert('Enter your admin key first.', 'error');
    return;
  }
  localStorage.setItem('rmBinBrosAdminKey', key);
  alertBox.innerHTML = '';
  body.innerHTML = '<tr><td colspan="13">Loading…</td></tr>';

  try {
    const res = await fetch('/api/appointments', { headers: { 'x-admin-key': key } });
    if (res.status === 401) {
      showAlert('Invalid admin key.', 'error');
      body.innerHTML = '<tr><td colspan="13">—</td></tr>';
      return;
    }
    const appts = await res.json();
    if (appts.length === 0) {
      body.innerHTML = '<tr><td colspan="13">No appointments yet.</td></tr>';
      return;
    }
    body.innerHTML = appts
      .map((a) => {
        const isSubscription = a.service_key === 'monthly' || a.service_key === 'quarterly';
        const onlyOneVisitEver = a.customer_visit_count === 1;
        const needsOneTimeRate = isSubscription && onlyOneVisitEver && a.status !== 'cancelled';
        const serviceName = escapeHtml(a.service_name);
        const planCell = needsOneTimeRate
          ? `${serviceName}<br><span style="color:var(--color-danger); font-size:0.78rem; font-weight:700;">⚠ Bill as one-time ($40) — only visit</span>`
          : serviceName;
        return `
      <tr>
        <td data-label="ID">${a.id}</td>
        <td data-label="Date">${escapeHtml(a.appt_date)}</td>
        <td data-label="Time">${formatTimeLabel(a.appt_time)}</td>
        <td data-label="Customer">${escapeHtml(a.customer_name)}</td>
        <td data-label="Contact">${escapeHtml(a.email)}<br>${escapeHtml(a.phone)}</td>
        <td data-label="Address">${escapeHtml(a.address)}</td>
        <td data-label="Plan">${planCell}</td>
        <td data-label="Visits">${a.customer_visit_count}</td>
        <td data-label="Bins">${a.bins_count}</td>
        <td data-label="Discount">${a.discount_cents > 0 ? `<span style="color:var(--color-primary-dark); font-weight:700;">$${(a.discount_cents / 100).toFixed(2)} off</span>` : '—'}</td>
        <td data-label="Status"><span class="status-pill status-${escapeHtml(a.status)}">${escapeHtml(a.status)}</span></td>
        <td data-label="Notes">${escapeHtml(a.notes || '') || '—'}</td>
        <td data-label="Actions">
          ${
            a.status === 'confirmed'
              ? `<button class="btn btn-secondary complete-btn" data-id="${a.id}" style="margin-bottom:6px;">Mark Completed</button><br><button class="btn btn-ghost cancel-btn" data-id="${a.id}" style="margin-bottom:6px;">Cancel</button><br>`
              : ''
          }
          <button class="btn btn-ghost delete-appt-btn" data-id="${a.id}" style="color:var(--color-danger); border-color:var(--color-danger);">Delete</button>
        </td>
      </tr>
    `;
      })
      .join('');

    body.querySelectorAll('.cancel-btn').forEach((btn) => {
      btn.addEventListener('click', () => cancelAppt(btn.dataset.id));
    });
    body.querySelectorAll('.complete-btn').forEach((btn) => {
      btn.addEventListener('click', () => completeAppt(btn.dataset.id));
    });
    body.querySelectorAll('.delete-appt-btn').forEach((btn) => {
      btn.addEventListener('click', () => deleteAppt(btn.dataset.id));
    });
  } catch (e) {
    showAlert('Could not load appointments.', 'error');
  }
}

async function cancelAppt(id) {
  const key = keyInput.value.trim();
  if (!confirm('Cancel this appointment?')) return;
  try {
    const res = await fetch(`/api/appointments/${id}/cancel`, {
      method: 'POST',
      headers: { 'x-admin-key': key },
    });
    if (!res.ok) {
      showAlert('Could not cancel appointment.', 'error');
      return;
    }
    loadAppointments();
  } catch (e) {
    showAlert('Network error while cancelling.', 'error');
  }
}

async function completeAppt(id) {
  const key = keyInput.value.trim();
  if (!confirm('Mark this appointment as completed? This confirms you visited and cleaned the bins, and lets the customer leave a review.')) return;
  try {
    const res = await fetch(`/api/appointments/${id}/complete`, {
      method: 'POST',
      headers: { 'x-admin-key': key },
    });
    if (!res.ok) {
      showAlert('Could not mark appointment as completed.', 'error');
      return;
    }
    loadAppointments();
  } catch (e) {
    showAlert('Network error while updating appointment.', 'error');
  }
}

async function deleteAppt(id) {
  const key = keyInput.value.trim();
  if (!confirm('Permanently delete this appointment? This cannot be undone. Any review the customer left will stay on the site.')) return;
  try {
    const res = await fetch(`/api/appointments/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-key': key },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showAlert(data.error || 'Could not delete appointment.', 'error');
      return;
    }
    loadAppointments();
  } catch (e) {
    showAlert('Network error while deleting appointment.', 'error');
  }
}

document.getElementById('loadBtn').addEventListener('click', loadAppointments);
document.getElementById('refreshBtn').addEventListener('click', loadAppointments);
if (savedKey) loadAppointments();

// --- Reviews moderation ---

const reviewsBody = document.getElementById('reviewsBody');
const reviewsAlertBox = document.getElementById('reviewsAlertBox');

function showReviewsAlert(msg, type) {
  reviewsAlertBox.innerHTML = `<div class="alert alert-${type}">${msg}</div>`;
}

async function loadReviews() {
  const key = keyInput.value.trim();
  if (!key) {
    showReviewsAlert('Enter your admin key first.', 'error');
    return;
  }
  reviewsAlertBox.innerHTML = '';
  reviewsBody.innerHTML = '<tr><td colspan="8">Loading…</td></tr>';

  try {
    const res = await fetch('/api/reviews/admin', { headers: { 'x-admin-key': key } });
    if (res.status === 401) {
      showReviewsAlert('Invalid admin key.', 'error');
      reviewsBody.innerHTML = '<tr><td colspan="8">—</td></tr>';
      return;
    }
    const reviews = await res.json();
    if (reviews.length === 0) {
      reviewsBody.innerHTML = '<tr><td colspan="8">No reviews yet.</td></tr>';
      return;
    }
    reviewsBody.innerHTML = reviews
      .map(
        (r) => `
      <tr>
        <td data-label="Date">${escapeHtml(r.appt_date) || '—'}</td>
        <td data-label="Customer">${escapeHtml(r.customer_name)}</td>
        <td data-label="Plan">${escapeHtml(r.service_name) || '<em>Booking deleted</em>'}</td>
        <td data-label="Rating">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</td>
        <td data-label="Comment">${escapeHtml(r.comment || '') || '—'}</td>
        <td data-label="Photos">${
          (r.photos || []).length
            ? r.photos
                .map(
                  (src) =>
                    `<a href="${escapeHtml(src)}" target="_blank" rel="noopener"><img src="${escapeHtml(src)}" alt="Review photo" style="width:44px; height:44px; object-fit:cover; border-radius:6px; margin:2px;" /></a>`
                )
                .join('')
            : '—'
        }</td>
        <td data-label="Status">${escapeHtml(r.status)}</td>
        <td data-label="Actions">
          ${r.status !== 'approved' ? `<button class="btn btn-secondary approve-review-btn" data-id="${r.id}" style="margin-bottom:6px;">Approve</button><br>` : ''}
          <button class="btn btn-ghost delete-review-btn" data-id="${r.id}">Delete</button>
        </td>
      </tr>
    `
      )
      .join('');

    reviewsBody.querySelectorAll('.approve-review-btn').forEach((btn) => {
      btn.addEventListener('click', () => approveReview(btn.dataset.id));
    });
    reviewsBody.querySelectorAll('.delete-review-btn').forEach((btn) => {
      btn.addEventListener('click', () => deleteReview(btn.dataset.id));
    });
  } catch (e) {
    showReviewsAlert('Could not load reviews.', 'error');
  }
}

async function approveReview(id) {
  const key = keyInput.value.trim();
  try {
    const res = await fetch(`/api/reviews/${id}/approve`, {
      method: 'POST',
      headers: { 'x-admin-key': key },
    });
    if (!res.ok) {
      showReviewsAlert('Could not approve review.', 'error');
      return;
    }
    loadReviews();
  } catch (e) {
    showReviewsAlert('Network error while approving review.', 'error');
  }
}

async function deleteReview(id) {
  const key = keyInput.value.trim();
  if (!confirm('Delete this review? This cannot be undone.')) return;
  try {
    const res = await fetch(`/api/reviews/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-key': key },
    });
    if (!res.ok) {
      showReviewsAlert('Could not delete review.', 'error');
      return;
    }
    loadReviews();
  } catch (e) {
    showReviewsAlert('Network error while deleting review.', 'error');
  }
}

document.getElementById('loadReviewsBtn').addEventListener('click', loadReviews);
if (savedKey) loadReviews();

// --- Blocked dates ---

const blockedDatesAlert = document.getElementById('blockedDatesAlert');
const blockedDatesList = document.getElementById('blockedDatesList');
const blockDateForm = document.getElementById('blockDateForm');

function showBlockedDatesAlert(msg, type) {
  blockedDatesAlert.innerHTML = `<div class="alert alert-${type}">${msg}</div>`;
}

function formatDateLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

async function loadBlockedDates() {
  const key = keyInput.value.trim();
  if (!key) return;
  blockedDatesList.innerHTML = '<li style="color:var(--color-ink-soft); font-size:0.9rem;">Loading…</li>';

  try {
    const res = await fetch('/api/blocked-dates', { headers: { 'x-admin-key': key } });
    if (!res.ok) {
      blockedDatesList.innerHTML = '<li style="color:var(--color-ink-soft); font-size:0.9rem;">—</li>';
      return;
    }
    const dates = await res.json();
    if (dates.length === 0) {
      blockedDatesList.innerHTML = '<li style="color:var(--color-ink-soft); font-size:0.9rem;">No blocked dates.</li>';
      return;
    }
    blockedDatesList.innerHTML = dates
      .map(
        (d) => `
      <li class="schedule-row">
        <span>${escapeHtml(formatDateLabel(d.blocked_date))}${d.reason ? ` — ${escapeHtml(d.reason)}` : ''}</span>
        <button type="button" class="schedule-row-remove" data-id="${d.id}">Remove</button>
      </li>
    `
      )
      .join('');
    blockedDatesList.querySelectorAll('.schedule-row-remove').forEach((btn) => {
      btn.addEventListener('click', () => removeBlockedDate(btn.dataset.id));
    });
  } catch (e) {
    blockedDatesList.innerHTML = '<li style="color:var(--color-ink-soft); font-size:0.9rem;">Could not load blocked dates.</li>';
  }
}

blockDateForm.addEventListener('submit', async (evt) => {
  evt.preventDefault();
  const key = keyInput.value.trim();
  if (!key) {
    showBlockedDatesAlert('Enter your admin key first.', 'error');
    return;
  }
  const date = document.getElementById('blockDateInput').value;
  const reason = document.getElementById('blockDateReason').value;

  try {
    const res = await fetch('/api/blocked-dates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': key },
      body: JSON.stringify({ date, reason }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showBlockedDatesAlert(data.error || 'Could not block that date.', 'error');
      return;
    }
    blockedDatesAlert.innerHTML = '';
    blockDateForm.reset();
    loadBlockedDates();
  } catch (e) {
    showBlockedDatesAlert('Network error while blocking date.', 'error');
  }
});

async function removeBlockedDate(id) {
  const key = keyInput.value.trim();
  if (!confirm('Unblock this date?')) return;
  try {
    const res = await fetch(`/api/blocked-dates/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-key': key },
    });
    if (!res.ok) {
      showBlockedDatesAlert('Could not remove that blocked date.', 'error');
      return;
    }
    loadBlockedDates();
  } catch (e) {
    showBlockedDatesAlert('Network error while removing blocked date.', 'error');
  }
}

if (savedKey) loadBlockedDates();

// --- Time slots ---

const timeSlotsAlert = document.getElementById('timeSlotsAlert');
const timeSlotsList = document.getElementById('timeSlotsList');
const addTimeSlotForm = document.getElementById('addTimeSlotForm');

function showTimeSlotsAlert(msg, type) {
  timeSlotsAlert.innerHTML = `<div class="alert alert-${type}">${msg}</div>`;
}

async function loadTimeSlots() {
  const key = keyInput.value.trim();
  if (!key) return;
  timeSlotsList.innerHTML = '<li style="color:var(--color-ink-soft); font-size:0.9rem;">Loading…</li>';

  try {
    const res = await fetch('/api/time-slots', { headers: { 'x-admin-key': key } });
    if (!res.ok) {
      timeSlotsList.innerHTML = '<li style="color:var(--color-ink-soft); font-size:0.9rem;">—</li>';
      return;
    }
    const slots = await res.json();
    if (slots.length === 0) {
      timeSlotsList.innerHTML = '<li style="color:var(--color-ink-soft); font-size:0.9rem;">No time slots configured — customers won\'t be able to book anything.</li>';
      return;
    }
    timeSlotsList.innerHTML = slots
      .map(
        (s) => `
      <li class="schedule-row">
        <span>${escapeHtml(formatTimeLabel(s.time))}</span>
        <button type="button" class="schedule-row-remove" data-id="${s.id}">Remove</button>
      </li>
    `
      )
      .join('');
    timeSlotsList.querySelectorAll('.schedule-row-remove').forEach((btn) => {
      btn.addEventListener('click', () => removeTimeSlot(btn.dataset.id));
    });
  } catch (e) {
    timeSlotsList.innerHTML = '<li style="color:var(--color-ink-soft); font-size:0.9rem;">Could not load time slots.</li>';
  }
}

addTimeSlotForm.addEventListener('submit', async (evt) => {
  evt.preventDefault();
  const key = keyInput.value.trim();
  if (!key) {
    showTimeSlotsAlert('Enter your admin key first.', 'error');
    return;
  }
  const time = document.getElementById('newTimeSlotInput').value;

  try {
    const res = await fetch('/api/time-slots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': key },
      body: JSON.stringify({ time }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showTimeSlotsAlert(data.error || 'Could not add that time slot.', 'error');
      return;
    }
    timeSlotsAlert.innerHTML = '';
    addTimeSlotForm.reset();
    loadTimeSlots();
  } catch (e) {
    showTimeSlotsAlert('Network error while adding time slot.', 'error');
  }
});

async function removeTimeSlot(id) {
  const key = keyInput.value.trim();
  if (!confirm('Remove this time slot? Customers will no longer be able to book this time going forward.')) return;
  try {
    const res = await fetch(`/api/time-slots/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-key': key },
    });
    if (!res.ok) {
      showTimeSlotsAlert('Could not remove that time slot.', 'error');
      return;
    }
    loadTimeSlots();
  } catch (e) {
    showTimeSlotsAlert('Network error while removing time slot.', 'error');
  }
}

if (savedKey) loadTimeSlots();
