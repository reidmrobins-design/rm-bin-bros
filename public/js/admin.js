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

async function loadAppointments() {
  const key = keyInput.value.trim();
  if (!key) {
    showAlert('Enter your admin key first.', 'error');
    return;
  }
  localStorage.setItem('rmBinBrosAdminKey', key);
  alertBox.innerHTML = '';
  body.innerHTML = '<tr><td colspan="12">Loading…</td></tr>';

  try {
    const res = await fetch('/api/appointments', { headers: { 'x-admin-key': key } });
    if (res.status === 401) {
      showAlert('Invalid admin key.', 'error');
      body.innerHTML = '<tr><td colspan="12">—</td></tr>';
      return;
    }
    const appts = await res.json();
    if (appts.length === 0) {
      body.innerHTML = '<tr><td colspan="12">No appointments yet.</td></tr>';
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
        <td>${a.id}</td>
        <td>${escapeHtml(a.appt_date)}</td>
        <td>${escapeHtml(a.appt_time)}</td>
        <td>${escapeHtml(a.customer_name)}</td>
        <td>${escapeHtml(a.email)}<br>${escapeHtml(a.phone)}</td>
        <td>${escapeHtml(a.address)}</td>
        <td>${planCell}</td>
        <td>${a.customer_visit_count}</td>
        <td>${a.bins_count}</td>
        <td>${escapeHtml(a.status)}</td>
        <td>${escapeHtml(a.notes || '')}</td>
        <td>
          ${a.status === 'confirmed' ? `<button class="btn btn-secondary complete-btn" data-id="${a.id}" style="margin-bottom:6px;">Mark Completed</button><br>` : ''}
          ${a.status === 'confirmed' ? `<button class="btn btn-ghost cancel-btn" data-id="${a.id}">Cancel</button>` : ''}
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
        <td>${escapeHtml(r.appt_date)}</td>
        <td>${escapeHtml(r.customer_name)}</td>
        <td>${escapeHtml(r.service_name)}</td>
        <td>${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</td>
        <td>${escapeHtml(r.comment || '')}</td>
        <td>
          ${(r.photos || [])
            .map(
              (src) =>
                `<a href="${escapeHtml(src)}" target="_blank" rel="noopener"><img src="${escapeHtml(src)}" alt="Review photo" style="width:44px; height:44px; object-fit:cover; border-radius:6px; margin:2px;" /></a>`
            )
            .join('')}
        </td>
        <td>${escapeHtml(r.status)}</td>
        <td>
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
