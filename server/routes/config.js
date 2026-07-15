const express = require('express');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ locationIqApiKey: process.env.LOCATIONIQ_API_KEY || null });
});

module.exports = router;
