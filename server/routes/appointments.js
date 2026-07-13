const express = require('express');
const db = require('../db');
const { TIME_SLOTS, MAX_BOOKINGS_PER_SLOT, isClosedDate, isPastDate, isTooFarOut } = require('../schedule');
const requireAdmin = require('../adminAuth');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateBookingInput(body) {
  const errors = [];
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const phone = String(body.phone || '').trim();
  const address = String(body.address || '').trim();
  const serviceId = Number(body.serviceId);
  const date = String(body.date || '').trim();
  const time = String(body.time || '').trim();
  const bins = Number(body.bins || 2);
  const notes = body.notes ? String(body.notes).trim().slice(0, 1000) : null;

  if (name.length < 2) errors.push('Please enter your full name.');
  if (!EMAIL_RE.test(email)) errors.push('Please enter a valid email address.');
  if (phone.replace(/\D/g, '').length < 7) errors.push('Please enter a valid phone number.');
  if (address.length < 5) errors.push('Please enter your service address.');
  if (!Number.isInteger(serviceId) || serviceId <= 0) errors.push('Please choose a service plan.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push('Please choose a valid date.');
  if (!TIME_SLOTS.includes(time)) errors.push('Please choose a valid time slot.');
  if (!Number.isInteger(bins) || bins < 1 || bins > 12) errors.push('Bin count must be between 1 and 12.');

  if (!errors.length) {
    if (isPastDate(date)) errors.push('That date has already passed.');
    else if (isTooFarOut(date)) errors.push('That date is too far in the future to book yet.');
    else if (isClosedDate(date)) errors.push('We are closed on Sundays.');
  }

  return { errors, value: { name, email, phone, address, serviceId, date, time, bins, notes } };
}

router.post('/', (req, res) => {
  const { errors, value } = validateBookingInput(req.body || {});
  if (errors.length) {
    return res.status(400).json({ errors });
  }

  const service = db.prepare('SELECT id FROM services WHERE id = ?').get(value.serviceId);
  if (!service) {
    return res.status(400).json({ errors: ['Selected service plan does not exist.'] });
  }

  const book = db.transaction(() => {
    const existing = db
      .prepare(
        `SELECT COUNT(*) AS c FROM appointments
         WHERE appt_date = ? AND appt_time = ? AND status != 'cancelled'`
      )
      .get(value.date, value.time).c;

    if (existing >= MAX_BOOKINGS_PER_SLOT) {
      return { conflict: true };
    }

    const info = db
      .prepare(
        `INSERT INTO appointments
           (customer_name, email, phone, address, service_id, bins_count, appt_date, appt_time, notes)
         VALUES (@name, @email, @phone, @address, @serviceId, @bins, @date, @time, @notes)`
      )
      .run(value);

    return { conflict: false, id: info.lastInsertRowid };
  });

  const result = book();
  if (result.conflict) {
    return res.status(409).json({ errors: ['That time slot was just booked by someone else. Please pick another.'] });
  }

  const appt = db
    .prepare(
      `SELECT a.id, a.customer_name, a.email, a.phone, a.address, a.bins_count, a.appt_date, a.appt_time,
              a.notes, a.status, s.name AS service_name, s.price_cents, s.cadence
       FROM appointments a JOIN services s ON s.id = a.service_id
       WHERE a.id = ?`
    )
    .get(result.id);

  res.status(201).json({ appointment: appt });
});

router.get('/', requireAdmin, (req, res) => {
  const appts = db
    .prepare(
      `SELECT a.id, a.customer_name, a.email, a.phone, a.address, a.bins_count, a.appt_date, a.appt_time,
              a.notes, a.status, a.created_at, s.name AS service_name, s.key AS service_key,
              (SELECT COUNT(*) FROM appointments a2
                 WHERE a2.email = a.email AND a2.status != 'cancelled') AS customer_visit_count
       FROM appointments a JOIN services s ON s.id = a.service_id
       ORDER BY a.appt_date ASC, a.appt_time ASC`
    )
    .all();
  res.json(appts);
});

router.post('/:id/cancel', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const result = db.prepare(`UPDATE appointments SET status = 'cancelled' WHERE id = ?`).run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'Appointment not found.' });
  res.json({ ok: true });
});

module.exports = router;
