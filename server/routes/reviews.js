const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const db = require('../db');
const requireAdmin = require('../adminAuth');

const router = express.Router();

const uploadsDir = path.join(db.dataDir, 'uploads', 'reviews');
fs.mkdirSync(uploadsDir, { recursive: true });

const ALLOWED_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${ALLOWED_TYPES[file.mimetype] || ''}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 4 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_TYPES[file.mimetype]) {
      cb(null, true);
    } else {
      cb(new Error('Photos must be JPG, PNG, or WEBP images.'));
    }
  },
});

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

function parsePhotos(photosJSON) {
  if (!photosJSON) return [];
  try {
    return JSON.parse(photosJSON);
  } catch (e) {
    return [];
  }
}

function deletePhotoFiles(photos) {
  for (const filename of photos) {
    fs.unlink(path.join(uploadsDir, filename), () => {});
  }
}

router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, customer_name, rating, comment, photos, created_at
       FROM reviews
       WHERE status = 'approved'
       ORDER BY created_at DESC`
    )
    .all();
  const reviews = rows.map((r) => ({ ...r, photos: parsePhotos(r.photos).map((f) => `/uploads/reviews/${f}`) }));
  res.json({ reviews });
});

router.post('/', reviewLimiter, (req, res, next) => {
  upload.array('photos', 4)(req, res, (err) => {
    if (err) {
      return res.status(400).json({ errors: [err.message || 'Could not upload photos.'] });
    }
    next();
  });
}, (req, res) => {
  const appointmentId = Number(req.body.appointmentId);
  const email = normalizeEmail(req.body.email);
  const phone = normalizePhone(req.body.phone);
  const rating = Number(req.body.rating);
  const comment = String(req.body.comment || '').trim().slice(0, 1000);
  const uploadedFiles = req.files || [];

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    deletePhotoFiles(uploadedFiles.map((f) => f.filename));
    return res.status(400).json({ errors: ['Please choose a rating from 1 to 5 stars.'] });
  }

  const appt = db
    .prepare('SELECT id, email, phone, status, customer_name FROM appointments WHERE id = ?')
    .get(appointmentId);

  if (!appt || normalizeEmail(appt.email) !== email || normalizePhone(appt.phone) !== phone) {
    deletePhotoFiles(uploadedFiles.map((f) => f.filename));
    return res.status(404).json({ errors: ['Appointment not found.'] });
  }
  if (appt.status !== 'completed') {
    deletePhotoFiles(uploadedFiles.map((f) => f.filename));
    return res.status(400).json({ errors: ['You can only review a visit our crew has completed.'] });
  }

  const existing = db.prepare('SELECT id FROM reviews WHERE appointment_id = ?').get(appointmentId);
  if (existing) {
    deletePhotoFiles(uploadedFiles.map((f) => f.filename));
    return res.status(409).json({ errors: ['You already left a review for this appointment.'] });
  }

  const photosJSON = uploadedFiles.length ? JSON.stringify(uploadedFiles.map((f) => f.filename)) : null;

  db.prepare(
    `INSERT INTO reviews (appointment_id, customer_name, rating, comment, photos)
     VALUES (?, ?, ?, ?, ?)`
  ).run(appointmentId, appt.customer_name, rating, comment || null, photosJSON);

  res.status(201).json({ ok: true });
});

router.get('/admin', adminLimiter, requireAdmin, (req, res) => {
  const rows = db
    .prepare(
      `SELECT r.id, r.appointment_id, r.customer_name, r.rating, r.comment, r.photos, r.status, r.created_at,
              a.appt_date, s.name AS service_name
       FROM reviews r
       JOIN appointments a ON a.id = r.appointment_id
       JOIN services s ON s.id = a.service_id
       ORDER BY r.created_at DESC`
    )
    .all();
  const reviews = rows.map((r) => ({ ...r, photos: parsePhotos(r.photos).map((f) => `/uploads/reviews/${f}`) }));
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
  const row = db.prepare('SELECT photos FROM reviews WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Review not found.' });
  deletePhotoFiles(parsePhotos(row.photos));
  db.prepare('DELETE FROM reviews WHERE id = ?').run(id);
  res.json({ ok: true });
});

module.exports = router;
