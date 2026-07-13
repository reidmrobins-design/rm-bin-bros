const TIME_SLOTS = ['08:00', '09:30', '11:00', '12:30', '14:00', '15:30'];

const SLOTS_PER_BOOKING = 1; // one crew per slot
const MAX_BOOKINGS_PER_SLOT = 1;
const CLOSED_WEEKDAYS = [0]; // Sunday closed
const MAX_ADVANCE_DAYS = 45;

function isClosedDate(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return true;
  return CLOSED_WEEKDAYS.includes(d.getDay());
}

function parseDate(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) return null;
  const [y, m, day] = dateStr.split('-').map(Number);
  const d = new Date(y, m - 1, day);
  if (d.getFullYear() !== y || d.getMonth() !== m - 1 || d.getDate() !== day) return null;
  return d;
}

function todayStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function isPastDate(dateStr) {
  return dateStr < todayStr();
}

function isTooFarOut(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return true;
  const max = new Date();
  max.setDate(max.getDate() + MAX_ADVANCE_DAYS);
  return d > max;
}

module.exports = {
  TIME_SLOTS,
  MAX_BOOKINGS_PER_SLOT,
  isClosedDate,
  parseDate,
  todayStr,
  isPastDate,
  isTooFarOut,
};
