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
        const isSubscription = a.service_key === 'monthly' || a.service_key === 'biweekly';
        const onlyOneVisitEver = a.customer_visit_count === 1;
        const needsOneTimeRate = isSubscription && onlyOneVisitEver && a.status !== 'cancelled';
        const serviceName = escapeHtml(a.service_name);
        const planCell = needsOneTimeRate
          ? `${serviceName}<br><span style="color:var(--color-danger); font-size:0.78rem; font-weight:700;">⚠ Bill as one-time ($35) — only visit</span>`
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
        <td>${a.status !== 'cancelled' ? `<button class="btn btn-ghost cancel-btn" data-id="${a.id}">Cancel</button>` : ''}</td>
      </tr>
    `;
      })
      .join('');

    body.querySelectorAll('.cancel-btn').forEach((btn) => {
      btn.addEventListener('click', () => cancelAppt(btn.dataset.id));
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

document.getElementById('loadBtn').addEventListener('click', loadAppointments);
document.getElementById('refreshBtn').addEventListener('click', loadAppointments);
if (savedKey) loadAppointments();
