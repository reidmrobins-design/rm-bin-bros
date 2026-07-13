const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'rmbinbros.db');
const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL');

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
`);

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
      price_cents: 3500,
      cadence: 'One-time',
      sort_order: 1,
    },
    {
      key: 'monthly',
      name: 'Monthly Subscription',
      description: 'We show up every month, right after your trash pickup, so your bins never build up grime or odor.',
      price_cents: 2500,
      cadence: 'Billed monthly',
      sort_order: 2,
    },
    {
      key: 'biweekly',
      name: 'Bi-Weekly Subscription',
      description: 'Our most popular plan. Cleaned every two weeks for households that want consistently fresh bins.',
      price_cents: 3000,
      cadence: 'Billed monthly (2 cleans/mo)',
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
