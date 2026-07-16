const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

// DATA_DIR lets a persistent disk (e.g. a Render disk mount) survive redeploys;
// without it, data falls back to a local folder that resets on every deploy.
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'rmbinbros.db');
console.log(`[db] DATA_DIR env var: ${process.env.DATA_DIR || '(not set)'}`);
console.log(`[db] Using database file: ${dbPath}`);
const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL');
// Foreign keys are informational only here — deleting an appointment should
// never be blocked by (or cascade into) reviews/referrals/discount_codes
// that reference it, so those rows can outlive the appointment on purpose.
db.exec('PRAGMA foreign_keys = OFF');

db.exec(`
  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    price_cents INTEGER NOT NULL,
    cadence TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT NOT NULL,
    service_id INTEGER NOT NULL REFERENCES services(id),
    bins_count INTEGER NOT NULL DEFAULT 2,
    appt_date TEXT NOT NULL,
    appt_time TEXT NOT NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'confirmed',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_appt_date_time ON appointments(appt_date, appt_time);

  CREATE TABLE IF NOT EXISTS blocked_dates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    blocked_date TEXT UNIQUE NOT NULL,
    reason TEXT
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    appointment_id INTEGER NOT NULL UNIQUE REFERENCES appointments(id),
    customer_name TEXT NOT NULL,
    rating INTEGER NOT NULL,
    comment TEXT,
    photos TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS referral_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    owner_email TEXT NOT NULL,
    owner_phone TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS referrals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL REFERENCES referral_codes(code),
    referred_appointment_id INTEGER NOT NULL UNIQUE REFERENCES appointments(id),
    referred_email TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS discount_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    kind TEXT NOT NULL,
    owner_email TEXT NOT NULL,
    discount_cents INTEGER NOT NULL,
    redeemed_appointment_id INTEGER REFERENCES appointments(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS time_slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    time TEXT UNIQUE NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS canvass_marks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('accepted', 'declined', 'come_back')),
    address TEXT,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_canvass_marks_created ON canvass_marks(created_at);
`);

// Migration: the reviews table above may already exist (without `photos`)
// on an already-running database, since CREATE TABLE IF NOT EXISTS is a
// no-op once the table exists.
const reviewsColumns = db.prepare('PRAGMA table_info(reviews)').all().map((c) => c.name);
if (!reviewsColumns.includes('photos')) {
  db.exec('ALTER TABLE reviews ADD COLUMN photos TEXT');
}

// Migration: appointments may already exist without discount_cents.
const apptColumns = db.prepare('PRAGMA table_info(appointments)').all().map((c) => c.name);
if (!apptColumns.includes('discount_cents')) {
  db.exec('ALTER TABLE appointments ADD COLUMN discount_cents INTEGER NOT NULL DEFAULT 0');
}

const timeSlotCount = db.prepare('SELECT COUNT(*) AS c FROM time_slots').get().c;
if (timeSlotCount === 0) {
  const defaultSlots = ['08:00', '09:30', '11:00', '12:30', '14:00', '15:30'];
  const insertSlot = db.prepare('INSERT INTO time_slots (time, sort_order) VALUES (?, ?)');
  defaultSlots.forEach((time, i) => insertSlot.run(time, i));
}

const seedCount = db.prepare('SELECT COUNT(*) AS c FROM services').get().c;
if (seedCount === 0) {
  const insert = db.prepare(`
    INSERT INTO services (key, name, description, price_cents, cadence, sort_order)
    VALUES (@key, @name, @description, @price_cents, @cadence, @sort_order)
  `);
  const seed = [
    {
      key: 'one-time',
      name: 'One-Time Clean',
      description: 'A single deep clean for your trash and recycling bins. Great for move-ins, spring cleaning, or a one-off refresh.',
      price_cents: 4000,
      cadence: 'One-time',
      sort_order: 1,
    },
    {
      key: 'quarterly',
      name: 'Quarterly Subscription',
      description: 'We show up once a season to keep grime and odor from building up too much between cleans.',
      price_cents: 3500,
      cadence: 'Billed quarterly (1 clean every 3 months)',
      sort_order: 2,
    },
    {
      key: 'monthly',
      name: 'Monthly Subscription',
      description: 'Our most popular plan. We show up every month, right after your trash pickup, so your bins never build up grime or odor.',
      price_cents: 3000,
      cadence: 'Billed monthly',
      sort_order: 3,
    },
  ];
  db.exec('BEGIN');
  try {
    for (const row of seed) insert.run(row);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// One-time price bump (2026-07-14): $35/$25/$30 -> $40/$30/$35. The seed
// above only runs against an empty table, so an already-seeded database
// (e.g. the live one on Render) needs these applied directly.
const priceBump2026 = {
  'one-time': 4000,
  monthly: 3000,
  biweekly: 3500,
};
const bumpPrice = db.prepare(
  'UPDATE services SET price_cents = ? WHERE key = ? AND price_cents < ?'
);
for (const [key, cents] of Object.entries(priceBump2026)) {
  bumpPrice.run(cents, key, cents);
}

// Replace the old Bi-Weekly plan with Quarterly, and promote Monthly to the
// "most popular" slot (2026-07-14). The seed above only runs against an empty
// table, so an already-seeded database (e.g. the live one on Render) needs
// this applied directly.
db.prepare(
  `UPDATE services
   SET key = 'quarterly',
       name = 'Quarterly Subscription',
       description = 'We show up once a season to keep grime and odor from building up too much between cleans.',
       cadence = 'Billed quarterly (1 clean every 3 months)',
       sort_order = 2
   WHERE key = 'biweekly'`
).run();
db.prepare(
  `UPDATE services
   SET description = 'Our most popular plan. We show up every month, right after your trash pickup, so your bins never build up grime or odor.',
       sort_order = 3
   WHERE key = 'monthly'`
).run();

function transaction(fn) {
  return (...args) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };
}

module.exports = db;
module.exports.transaction = transaction;
module.exports.dataDir = dataDir;
