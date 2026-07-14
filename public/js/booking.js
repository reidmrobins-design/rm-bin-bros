(function () {
  let services = [];
  let selectedTime = null;

  const el = {
    serviceId: document.getElementById('serviceId'),
    date: document.getElementById('date'),
    slotGrid: document.getElementById('slotGrid'),
    time: document.getElementById('time'),
    bins: document.getElementById('bins'),
    form: document.getElementById('bookingForm'),
    alert: document.getElementById('formAlert'),
    submitBtn: document.getElementById('submitBtn'),
    sumPlan: document.getElementById('sumPlan'),
    sumPrice: document.getElementById('sumPrice'),
    sumDate: document.getElementById('sumDate'),
    sumTime: document.getElementById('sumTime'),
    sumBins: document.getElementById('sumBins'),
    subscriptionNotice: document.getElementById('subscriptionNotice'),
    summarySubscriptionNotice: document.getElementById('summarySubscriptionNotice'),
    modal: document.getElementById('bookingModal'),
    modalMessage: document.getElementById('modalMessage'),
    modalCloseBtn: document.getElementById('modalCloseBtn'),
    modalOkBtn: document.getElementById('modalOkBtn'),
  };

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function maxDateISO() {
    const d = new Date();
    d.setDate(d.getDate() + 45);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function showAlert(message, type) {
    el.alert.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
    el.alert.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function clearAlert() {
    el.alert.innerHTML = '';
  }

  function showBookingModal(message) {
    el.modalMessage.innerHTML = message;
    el.modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function hideBookingModal() {
    el.modal.hidden = true;
    document.body.style.overflow = '';
  }

  function formatTimeLabel(t) {
    const [h, m] = t.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
  }

  function subscriptionNoticeHTML(service) {
    if (!service || (service.key !== 'monthly' && service.key !== 'biweekly')) return '';
    const oneTime = services.find((s) => s.key === 'one-time');
    const oneTimePrice = oneTime ? formatPrice(oneTime.price_cents) : 'our one-time rate';
    return `<div class="alert alert-warning" style="margin-top:10px; margin-bottom:0;">
      <strong>2-visit minimum:</strong> ${service.name} pricing requires at least 2 visits.
      If you cancel after just 1 visit, that visit is billed at ${oneTimePrice} (our standard one-time rate) instead of the discounted subscription price.
    </div>`;
  }

  function updateSummary() {
    const service = services.find((s) => String(s.id) === el.serviceId.value);
    el.sumPlan.textContent = service ? service.name : '—';
    el.sumPrice.textContent = service ? `${formatPrice(service.price_cents)} / visit` : '—';
    el.sumDate.textContent = el.date.value || '—';
    el.sumTime.textContent = selectedTime ? formatTimeLabel(selectedTime) : '—';
    el.sumBins.textContent = el.bins.value || '2';

    const noticeHTML = subscriptionNoticeHTML(service);
    el.subscriptionNotice.innerHTML = noticeHTML;
    el.summarySubscriptionNotice.innerHTML = noticeHTML;
  }

  async function loadServices() {
    try {
      const res = await fetch('/api/services');
      services = await res.json();
      const params = new URLSearchParams(window.location.search);
      const preselect = params.get('service');
      el.serviceId.innerHTML = services
        .map((s) => `<option value="${s.id}">${s.name} — ${formatPrice(s.price_cents)}</option>`)
        .join('');
      if (preselect && services.some((s) => String(s.id) === preselect)) {
        el.serviceId.value = preselect;
      }
      updateSummary();
    } catch (e) {
      el.serviceId.innerHTML = '<option value="">Could not load plans</option>';
    }
  }

  async function loadAvailability(date) {
    selectedTime = null;
    el.time.value = '';
    el.slotGrid.innerHTML = '<div class="slot-loading">Loading times…</div>';
    updateSummary();

    try {
      const res = await fetch(`/api/availability?date=${encodeURIComponent(date)}`);
      const data = await res.json();

      if (data.closed) {
        el.slotGrid.innerHTML = `<div class="slot-empty">${data.reason || 'No times available that day.'}</div>`;
        return;
      }

      if (!data.slots || data.slots.length === 0) {
        el.slotGrid.innerHTML = '<div class="slot-empty">No time slots configured.</div>';
        return;
      }

      el.slotGrid.innerHTML = data.slots
        .map(
          (s) =>
            `<button type="button" class="slot-btn" data-time="${s.time}" ${s.available ? '' : 'disabled'}>${formatTimeLabel(s.time)}</button>`
        )
        .join('');

      el.slotGrid.querySelectorAll('.slot-btn:not(:disabled)').forEach((btn) => {
        btn.addEventListener('click', () => {
          el.slotGrid.querySelectorAll('.slot-btn').forEach((b) => b.classList.remove('selected'));
          btn.classList.add('selected');
          selectedTime = btn.dataset.time;
          el.time.value = selectedTime;
          updateSummary();
        });
      });
    } catch (e) {
      el.slotGrid.innerHTML = '<div class="slot-empty">Could not load times. Please try again.</div>';
    }
  }

  async function handleSubmit(evt) {
    evt.preventDefault();
    clearAlert();

    if (!el.time.value) {
      showAlert('Please choose a time slot.', 'error');
      return;
    }

    const payload = {
      name: document.getElementById('name').value,
      email: document.getElementById('email').value,
      phone: document.getElementById('phone').value,
      address: document.getElementById('address').value,
      serviceId: Number(el.serviceId.value),
      date: el.date.value,
      time: el.time.value,
      bins: Number(el.bins.value),
      notes: document.getElementById('notes').value,
    };

    el.submitBtn.disabled = true;
    el.submitBtn.textContent = 'Booking…';

    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        showAlert((data.errors || ['Something went wrong. Please try again.']).join('<br>'), 'error');
        if (res.status === 409) {
          await loadAvailability(el.date.value);
        }
        return;
      }

      const a = data.appointment;
      showBookingModal(
        `Confirmation #${a.id} for ${a.appt_date} at ${formatTimeLabel(a.appt_time)}. You can view or cancel it anytime on the <a href="my-appointments.html">My Appointments</a> page.`
      );
      el.form.reset();
      selectedTime = null;
      el.slotGrid.innerHTML = '<div class="slot-empty">Pick a date to see open times.</div>';
      updateSummary();
    } catch (e) {
      showAlert('Network error — please try again.', 'error');
    } finally {
      el.submitBtn.disabled = false;
      el.submitBtn.textContent = 'Confirm Booking';
    }
  }

  el.date.min = todayISO();
  el.date.max = maxDateISO();
  el.date.addEventListener('change', () => loadAvailability(el.date.value));
  el.serviceId.addEventListener('change', updateSummary);
  el.bins.addEventListener('input', updateSummary);
  el.form.addEventListener('submit', handleSubmit);

  el.modalCloseBtn.addEventListener('click', hideBookingModal);
  el.modalOkBtn.addEventListener('click', hideBookingModal);
  el.modal.addEventListener('click', (evt) => {
    if (evt.target === el.modal) hideBookingModal();
  });
  document.addEventListener('keydown', (evt) => {
    if (evt.key === 'Escape' && !el.modal.hidden) hideBookingModal();
  });

  loadServices();
})();
