const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL;
const SITE_URL = (process.env.SITE_URL || 'https://rm-bin-bros.onrender.com').replace(/\/$/, '');

async function sendCompletionEmail(appt) {
  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    console.warn('RESEND_API_KEY / RESEND_FROM_EMAIL not set — skipping completion email.');
    return;
  }

  const reviewLink = `${SITE_URL}/my-appointments.html?email=${encodeURIComponent(appt.email)}&phone=${encodeURIComponent(appt.phone)}`;
  const firstName = String(appt.customer_name || '').trim().split(/\s+/)[0] || 'there';

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #1c2b2e;">
      <h2 style="color: #0e7c86;">Your bins are sparkling clean! 🧼</h2>
      <p>Hi ${escapeHtml(firstName)},</p>
      <p>Our crew just finished cleaning your bins (Confirmation #${appt.id}). Thanks for choosing RM Bin Bros!</p>
      <p>Mind leaving a quick review? It helps us out a lot and only takes a minute.</p>
      <p style="text-align: center; margin: 28px 0;">
        <a href="${reviewLink}" style="background: #8bc34a; color: #1c2b2e; font-weight: 700; text-decoration: none; padding: 12px 24px; border-radius: 8px; display: inline-block;">Leave a Review</a>
      </p>
      <p style="color: #667; font-size: 0.85rem;">— The RM Bin Bros Team</p>
    </div>
  `;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: RESEND_FROM_EMAIL,
        to: appt.email,
        subject: 'Your RM Bin Bros cleaning is complete — how did we do?',
        html,
      }),
    });
    if (!res.ok) {
      console.error('Resend email failed:', res.status, await res.text());
    }
  } catch (e) {
    console.error('Resend email error:', e);
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = { sendCompletionEmail };
