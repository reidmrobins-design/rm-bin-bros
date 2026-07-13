const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const services = db
    .prepare('SELECT id, key, name, description, price_cents, cadence FROM services ORDER BY sort_order ASC')
    .all();
  res.json(services);
});

module.exports = router;
