const express = require('express');
const db = require('../db');
const { getTimeSlots, MAX_BOOKINGS_PER_SLOT, isClosedDate, isPastDate, isTooFarOut } = require('../schedule');

const router = express.Router();

router.get('/', (req, res) => {
  const { date } = req.query;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Query param "date" is required in YYYY-MM-DD format.' });
  }
  if (isPastDate(date)) {
    return res.json({ date, closed: true, reason: 'That date has already passed.', slots: [] });
  }
  if (isTooFarOut(date)) {
    return res.json({ date, closed: true, reason: 'That date is too far in the future to book yet.', slots: [] });
  }
  if (isClosedDate(date)) {
    return res.json({ date, closed: true, reason: 'We are closed on Sundays.', slots: [] });
  }

  const blocked = db.prepare('SELECT 1 FROM blocked_dates WHERE blocked_date = ?').get(date);
  if (blocked) {
    return res.json({ date, closed: true, reason: 'We are fully booked/closed that day.', slots: [] });
  }

  const counts = db
    .prepare(
      `SELECT appt_time, COUNT(*) AS c FROM appointments
       WHERE appt_date = ? AND status != 'cancelled'
       GROUP BY appt_time`
    )
    .all(date);
  const countByTime = Object.fromEntries(counts.map((r) => [r.appt_time, r.c]));

  const slots = getTimeSlots().map((time) => ({
    time,
    available: (countByTime[time] || 0) < MAX_BOOKINGS_PER_SLOT,
  }));

  res.json({ date, closed: false, slots });
});

module.exports = router;
