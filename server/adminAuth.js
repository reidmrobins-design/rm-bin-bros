const ADMIN_KEY = process.env.ADMIN_KEY || 'change-me';

function requireAdmin(req, res, next) {
  const key = req.get('x-admin-key');
  if (!key || key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  next();
}

module.exports = requireAdmin;
