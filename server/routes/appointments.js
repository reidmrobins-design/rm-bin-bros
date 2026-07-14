const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { TIME_SLOTS, MAX_BOOKINGS_PER_SLOT, isClosedDate, isPastDate, isTooFarOut } = require('../schedule');
const requireAdmin = require('../adminAuth');
const { sendCompletionEmail } = require('../email');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { errors: ['Too many booking attempts. Please try again in a few minutes.'] },
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again in a few minutes.' },
});

const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { errors: ['Too many attempts. Please try again in a few minutes.'] },
});

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

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

router.post('/', bookingLimiter, (req, res) => {
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

router.post('/lookup', lookupLimiter, (req, res) => {
  const email = normalizeEmail(req.body.email);
  const phone = normalizePhone(req.body.phone);

  if (!EMAIL_RE.test(email) || phone.length < 7) {
    return res.status(400).json({ errors: ['Please enter the email and phone number used when booking.'] });
  }

  const rows = db
    .prepare(
      `SELECT a.id, a.phone, a.appt_date, a.appt_time, a.status, a.bins_count,
              s.name AS service_name, s.price_cents, s.cadence,
              EXISTS(SELECT 1 FROM reviews r WHERE r.appointment_id = a.id) AS has_review
       FROM appointments a JOIN services s ON s.id = a.service_id
       WHERE lower(a.email) = ?
       ORDER BY a.appt_date DESC, a.appt_time DESC`
    )
    .all(email);

  const appointments = rows
    .filter((a) => normalizePhone(a.phone) === phone)
    .map(({ phone: _phone, has_review, ...rest }) => ({ ...rest, has_review: !!has_review }));

  res.json({ appointments });
});

router.post('/:id/cancel-self', lookupLimiter, (req, res) => {
  const id = Number(req.params.id);
  const email = normalizeEmail(req.body.email);
  const phone = normalizePhone(req.body.phone);

  const appt = db.prepare('SELECT id, email, phone, status, appt_date FROM appointments WHERE id = ?').get(id);

  if (!appt || normalizeEmail(appt.email) !== email || normalizePhone(appt.phone) !== phone) {
    return res.status(404).json({ errors: ['Appointment not found.'] });
  }
  if (appt.status === 'cancelled') {
    return res.status(400).json({ errors: ['That appointment is already cancelled.'] });
  }
  if (isPastDate(appt.appt_date)) {
    return res.status(400).json({ errors: ['That appointment has already passed and can no longer be cancelled.'] });
  }

  db.prepare(`UPDATE appointments SET status = 'cancelled' WHERE id = ?`).run(id);
  res.json({ ok: true });
});

router.get('/', adminLimiter, requireAdmin, (req, res) => {
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

router.post('/:id/cancel', adminLimiter, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const result = db.prepare(`UPDATE appointments SET status = 'cancelled' WHERE id = ?`).run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'Appointment not found.' });
  res.json({ ok: true });
});

router.post('/:id/complete', adminLimiter, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const appt = db.prepare('SELECT id, status, customer_name, email, phone FROM appointments WHERE id = ?').get(id);
  if (!appt) return res.status(404).json({ error: 'Appointment not found.' });
  if (appt.status === 'cancelled') {
    return res.status(400).json({ error: 'Cannot mark a cancelled appointment as completed.' });
  }
  db.prepare(`UPDATE appointments SET status = 'completed' WHERE id = ?`).run(id);
  sendCompletionEmail(appt);
  res.json({ ok: true });
});

module.exports = router;
