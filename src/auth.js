const crypto = require('crypto');

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64, SCRYPT_PARAMS).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored).split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64, SCRYPT_PARAMS);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

// Requires a logged-in owner; funnels first-time logins to the password screen.
function requireLogin(req, res, next) {
  if (!req.owner) return res.redirect('/login');
  if (req.owner.must_change_password && req.path !== '/password' && req.path !== '/logout') {
    return res.redirect('/password');
  }
  next();
}

function requireCommissioner(req, res, next) {
  if (!req.owner) return res.redirect('/login');
  if (!req.owner.is_commissioner) {
    return res.status(403).render('error', { title: 'Restricted', message: 'Commissioner access only. Nice try.', owner: req.owner });
  }
  next();
}

// Express 4 swallows async errors; every async handler goes through this.
const aw = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { hashPassword, verifyPassword, requireLogin, requireCommissioner, aw };
