const path = require('node:path');
const express = require('express');

require('./db'); // ensure DB + schema + seed run on boot

const servicesRouter = require('./routes/services');
const availabilityRouter = require('./routes/availability');
const appointmentsRouter = require('./routes/appointments');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/services', servicesRouter);
app.use('/api/availability', availabilityRouter);
app.use('/api/appointments', appointmentsRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our end. Please try again.' });
});

app.listen(PORT, () => {
  console.log(`RM Bin Bros site running at http://localhost:${PORT}`);
});
