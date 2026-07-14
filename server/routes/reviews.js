const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const requireAdmin = require('../adminAuth');

const router = express.Router();

const reviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { errors: ['Too many attempts. Please try again in a few minutes.'] },
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again in a few minutes.' },
});

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

router.get('/', (req, res) => {
  const reviews = db
    .prepare(
      `SELECT id, customer_name, rating, comment, created_at
       FROM reviews
       WHERE status = 'approved'
       ORDER BY created_at DESC`
    )
    .all();
  res.json({ reviews });
});

router.post('/', reviewLimiter, (req, res) => {
  const appointmentId = Number(req.body.appointmentId);
  const email = normalizeEmail(req.body.email);
  const phone = normalizePhone(req.body.phone);
  const rating = Number(req.body.rating);
  const comment = String(req.body.comment || '').trim().slice(0, 1000);

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ errors: ['Please choose a rating from 1 to 5 stars.'] });
  }

  const appt = db
    .prepare('SELECT id, email, phone, status, customer_name FROM appointments WHERE id = ?')
    .get(appointmentId);

  if (!appt || normalizeEmail(appt.email) !== email || normalizePhone(appt.phone) !== phone) {
    return res.status(404).json({ errors: ['Appointment not found.'] });
  }
  if (appt.status !== 'completed') {
    return res.status(400).json({ errors: ['You can only review a visit our crew has completed.'] });
  }

  const existing = db.prepare('SELECT id FROM reviews WHERE appointment_id = ?').get(appointmentId);
  if (existing) {
    return res.status(409).json({ errors: ['You already left a review for this appointment.'] });
  }

  db.prepare(
    `INSERT INTO reviews (appointment_id, customer_name, rating, comment)
     VALUES (?, ?, ?, ?)`
  ).run(appointmentId, appt.customer_name, rating, comment || null);

  res.status(201).json({ ok: true });
});

router.get('/admin', adminLimiter, requireAdmin, (req, res) => {
  const reviews = db
    .prepare(
      `SELECT r.id, r.appointment_id, r.customer_name, r.rating, r.comment, r.status, r.created_at,
              a.appt_date, s.name AS service_name
       FROM reviews r
       JOIN appointments a ON a.id = r.appointment_id
       JOIN services s ON s.id = a.service_id
       ORDER BY r.created_at DESC`
    )
    .all();
  res.json(reviews);
});

router.post('/:id/approve', adminLimiter, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const result = db.prepare(`UPDATE reviews SET status = 'approved' WHERE id = ?`).run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'Review not found.' });
  res.json({ ok: true });
});

router.delete('/:id', adminLimiter, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const result = db.prepare('DELETE FROM reviews WHERE id = ?').run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'Review not found.' });
  res.json({ ok: true });
});

module.exports = router;
