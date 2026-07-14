const path = require('node:path');
const express = require('express');

const db = require('./db'); // ensure DB + schema + seed run on boot

const securityHeaders = require('./securityHeaders');
const servicesRouter = require('./routes/services');
const availabilityRouter = require('./routes/availability');
const appointmentsRouter = require('./routes/appointments');
const reviewsRouter = require('./routes/reviews');
const configRouter = require('./routes/config');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.set('trust proxy', 1); // Render sits behind a proxy; needed for accurate rate-limit IPs

app.use(securityHeaders);
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(path.join(db.dataDir, 'uploads')));

app.use('/api/services', servicesRouter);
app.use('/api/availability', availabilityRouter);
app.use('/api/appointments', appointmentsRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api/config', configRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our end. Please try again.' });
});

app.listen(PORT, () => {
  console.log(`RM Bin Bros site running at http://localhost:${PORT}`);
});
