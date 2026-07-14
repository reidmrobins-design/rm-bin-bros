const express = require('express');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ radarPublishableKey: process.env.RADAR_PUBLISHABLE_KEY || null });
});

module.exports = router;
