const crypto = require('node:crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');

const router = express.Router();

const REFERRALS_TO_REWARD = 5;
const REWARD_DISCOUNT_CENTS = 500;
const REFERRAL_FRIEND_DISCOUNT_CENTS = 500;

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { errors: ['Too many requests. Please try again in a few minutes.'] },
});

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function generateReferralCode(name) {
  const base = String(name || '')
    .trim()
    .split(/\s+/)[0]
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 8) || 'FRIEND';
  for (let i = 0; i < 10; i++) {
    const code = `${base}${Math.floor(1000 + Math.random() * 9000)}`;
    if (!db.prepare('SELECT 1 FROM referral_codes WHERE code = ?').get(code)) return code;
  }
  return `REF${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function generateRewardCode() {
  for (let i = 0; i < 10; i++) {
    const code = `REWARD${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    if (!db.prepare('SELECT 1 FROM discount_codes WHERE code = ?').get(code)) return code;
  }
  return `REWARD${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
}

router.get('/', limiter, (req, res) => {
  const email = normalizeEmail(req.query.email);
  const phone = normalizePhone(req.query.phone);
  if (!email || phone.length < 7) {
    return res.status(400).json({ errors: ['Missing email or phone.'] });
  }

  const rows = db.prepare('SELECT customer_name, phone, status FROM appointments WHERE lower(email) = ?').all(email);
  const matches = rows.filter((a) => normalizePhone(a.phone) === phone);
  const hasCompleted = matches.some((a) => a.status === 'completed');
  if (!hasCompleted) {
    return res.status(404).json({ errors: ['No completed appointment found for that email and phone.'] });
  }

  let referral = db.prepare('SELECT code FROM referral_codes WHERE owner_email = ?').get(email);
  if (!referral) {
    const code = generateReferralCode(matches[0].customer_name);
    db.prepare('INSERT INTO referral_codes (code, owner_email, owner_phone, owner_name) VALUES (?, ?, ?, ?)').run(
      code,
      email,
      phone,
      matches[0].customer_name
    );
    referral = { code };
  }

  const referralCount = db.prepare('SELECT COUNT(*) AS c FROM referrals WHERE code = ?').get(referral.code).c;
  const unredeemedRewards = db
    .prepare(
      `SELECT code, discount_cents FROM discount_codes
       WHERE owner_email = ? AND kind = 'referral_reward' AND redeemed_appointment_id IS NULL`
    )
    .all(email);

  const remainder = referralCount % REFERRALS_TO_REWARD;

  res.json({
    code: referral.code,
    referralCount,
    referralsToNextReward: remainder === 0 ? REFERRALS_TO_REWARD : REFERRALS_TO_REWARD - remainder,
    unredeemedRewards: unredeemedRewards.map((r) => ({ code: r.code, discountCents: r.discount_cents })),
  });
});

function applyCodeToBooking({ code, email }) {
  if (!code) return { discountCents: 0 };

  const upperCode = code.trim().toUpperCase();
  const normalizedEmail = normalizeEmail(email);

  const reward = db.prepare(`SELECT * FROM discount_codes WHERE code = ? AND kind = 'referral_reward'`).get(upperCode);
  if (reward) {
    if (reward.redeemed_appointment_id) {
      return { error: 'That reward code has already been used.' };
    }
    if (normalizeEmail(reward.owner_email) !== normalizedEmail) {
      return { error: 'That reward code belongs to a different account.' };
    }
    return { discountCents: reward.discount_cents, rewardCode: upperCode };
  }

  const referral = db.prepare('SELECT * FROM referral_codes WHERE code = ?').get(upperCode);
  if (referral) {
    if (normalizeEmail(referral.owner_email) === normalizedEmail) {
      return { error: "You can't use your own referral code." };
    }
    const alreadyUsedReferral = db.prepare('SELECT 1 FROM referrals WHERE referred_email = ?').get(normalizedEmail);
    if (alreadyUsedReferral) {
      return { error: "You've already used a referral discount." };
    }
    return { discountCents: REFERRAL_FRIEND_DISCOUNT_CENTS, referralCode: upperCode };
  }

  return { error: 'That code is not valid.' };
}

function recordBookingCode({ appointmentId, email, rewardCode, referralCode }) {
  if (rewardCode) {
    db.prepare('UPDATE discount_codes SET redeemed_appointment_id = ? WHERE code = ?').run(appointmentId, rewardCode);
  }
  if (referralCode) {
    db.prepare(
      'INSERT INTO referrals (code, referred_appointment_id, referred_email) VALUES (?, ?, ?)'
    ).run(referralCode, appointmentId, normalizeEmail(email));

    const count = db.prepare('SELECT COUNT(*) AS c FROM referrals WHERE code = ?').get(referralCode).c;
    if (count % REFERRALS_TO_REWARD === 0) {
      const owner = db.prepare('SELECT owner_email FROM referral_codes WHERE code = ?').get(referralCode);
      if (owner) {
        db.prepare(
          `INSERT INTO discount_codes (code, kind, owner_email, discount_cents) VALUES (?, 'referral_reward', ?, ?)`
        ).run(generateRewardCode(), owner.owner_email, REWARD_DISCOUNT_CENTS);
      }
    }
  }
}

module.exports = router;
module.exports.applyCodeToBooking = applyCodeToBooking;
module.exports.recordBookingCode = recordBookingCode;
