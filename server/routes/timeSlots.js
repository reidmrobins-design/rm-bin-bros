const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const requireAdmin = require('../adminAuth');

const router = express.Router();

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again in a few minutes.' },
});

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

router.use(adminLimiter, requireAdmin);

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT id, time, sort_order FROM time_slots ORDER BY sort_order ASC, time ASC').all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const time = String(req.body.time || '').trim();

  if (!TIME_RE.test(time)) {
    return res.status(400).json({ error: 'Please provide a valid time in HH:MM (24-hour) format.' });
  }

  const maxSort = db.prepare('SELECT MAX(sort_order) AS m FROM time_slots').get().m;

  try {
    db.prepare('INSERT INTO time_slots (time, sort_order) VALUES (?, ?)').run(time, (maxSort ?? -1) + 1);
  } catch (e) {
    return res.status(409).json({ error: 'That time slot already exists.' });
  }
  res.status(201).json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const result = db.prepare('DELETE FROM time_slots WHERE id = ?').run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found.' });
  res.json({ ok: true });
});

module.exports = router;
