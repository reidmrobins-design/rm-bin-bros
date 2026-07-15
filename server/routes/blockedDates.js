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

router.use(adminLimiter, requireAdmin);

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT id, blocked_date, reason FROM blocked_dates ORDER BY blocked_date ASC').all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const date = String(req.body.date || '').trim();
  const reason = req.body.reason ? String(req.body.reason).trim().slice(0, 200) : null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Please provide a valid date (YYYY-MM-DD).' });
  }

  try {
    db.prepare('INSERT INTO blocked_dates (blocked_date, reason) VALUES (?, ?)').run(date, reason);
  } catch (e) {
    return res.status(409).json({ error: 'That date is already blocked.' });
  }
  res.status(201).json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const result = db.prepare('DELETE FROM blocked_dates WHERE id = ?').run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found.' });
  res.json({ ok: true });
});

module.exports = router;
