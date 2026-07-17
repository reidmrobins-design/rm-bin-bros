const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const requireAdmin = require('../adminAuth');

const router = express.Router();

const STATUSES = ['accepted', 'declined', 'come_back', 'no_answer', 'no_soliciting'];

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again in a few minutes.' },
});

router.use(adminLimiter, requireAdmin);

function isValidLat(n) {
  return typeof n === 'number' && Number.isFinite(n) && n >= -90 && n <= 90;
}

function isValidLng(n) {
  return typeof n === 'number' && Number.isFinite(n) && n >= -180 && n <= 180;
}

router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT id, lat, lng, status, address, note, created_at, updated_at FROM canvass_marks ORDER BY created_at DESC')
    .all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const lat = Number(req.body.lat);
  const lng = Number(req.body.lng);
  const status = String(req.body.status || '');
  const address = req.body.address ? String(req.body.address).trim().slice(0, 300) : null;
  const note = req.body.note ? String(req.body.note).trim().slice(0, 500) : null;

  if (!isValidLat(lat) || !isValidLng(lng)) {
    return res.status(400).json({ error: 'Please provide a valid location.' });
  }
  if (!STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Status must be accepted, declined, come_back, no_answer, or no_soliciting.' });
  }

  const result = db
    .prepare('INSERT INTO canvass_marks (lat, lng, status, address, note) VALUES (?, ?, ?, ?, ?)')
    .run(lat, lng, status, address, note);
  const row = db.prepare('SELECT id, lat, lng, status, address, note, created_at, updated_at FROM canvass_marks WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(row);
});

router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM canvass_marks WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found.' });

  const updates = [];
  const params = [];

  if (req.body.status !== undefined) {
    const status = String(req.body.status);
    if (!STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Status must be accepted, declined, come_back, no_answer, or no_soliciting.' });
    }
    updates.push('status = ?');
    params.push(status);
  }
  if (req.body.note !== undefined) {
    updates.push('note = ?');
    params.push(req.body.note ? String(req.body.note).trim().slice(0, 500) : null);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'Nothing to update.' });
  }

  updates.push("updated_at = datetime('now')");
  params.push(id);
  db.prepare(`UPDATE canvass_marks SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const row = db.prepare('SELECT id, lat, lng, status, address, note, created_at, updated_at FROM canvass_marks WHERE id = ?').get(id);
  res.json(row);
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const result = db.prepare('DELETE FROM canvass_marks WHERE id = ?').run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found.' });
  res.json({ ok: true });
});

module.exports = router;
