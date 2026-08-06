const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieSession = require('cookie-session');

const { getDoc, ensureSeeded } = require('./src/data');
const { requireLogin } = require('./src/auth');
const helpers = require('./src/helpers');

// The EJS templates live outside the esbuild bundle; find them wherever the
// runtime put them (repo root locally, /var/task in a deployed function).
function findViews() {
  const candidates = [
    path.join(__dirname, 'views'),
    path.join(process.cwd(), 'views'),
    '/var/task/views',
    path.join(__dirname, '..', '..', 'views'),
  ];
  for (const c of candidates) { try { if (fs.existsSync(c)) return c; } catch (e) {} }
  return candidates[0];
}

function createApp() {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', findViews());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, 'public'))); // no-op on Netlify (CDN serves these), used by dev server
  app.set('trust proxy', 1);

  // Session middleware is created lazily: the signing secret lives in the data
  // store (generated on first boot), so there is zero env-var setup.
  let sessionMw = null;
  app.use((req, res, next) => {
    if (sessionMw) return sessionMw(req, res, next);
    ensureSeeded()
      .then(() => getDoc('config', {}))
      .then(cfg => {
        sessionMw = cookieSession({
          name: 'maga_league',
          keys: [cfg.secret || 'dev-secret'],
          maxAge: 30 * 24 * 60 * 60 * 1000,
          httpOnly: true,
          sameSite: 'lax',
        });
        sessionMw(req, res, next);
      })
      .catch(next);
  });

  // Attach the logged-in owner and template globals to every request.
  app.use((req, res, next) => {
    helpers.loadWorld()
      .then(world => {
        req.world = world;
        req.owner = req.session.ownerId
          ? world.owners.find(o => o.id === req.session.ownerId && o.active) || null
          : null;
        res.locals.owner = req.owner;
        res.locals.money = helpers.money;
        res.locals.alerts = req.owner ? helpers.activeAlerts(world.alerts) : [];
        res.locals.currentPath = req.path;
        res.locals.quip = helpers.pickRandom(helpers.QUIPS);
        next();
      })
      .catch(next);
  });

  app.use('/', require('./src/routes/member'));
  app.use('/admin', requireLogin, require('./src/routes/admin'));

  app.use((req, res) => res.status(404).render('error', { title: 'Not Found', message: 'That page has gone missing. Sad!' }));
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).render('error', { title: 'Error', message: 'Something went wrong. Tell the commissioner.' });
  });

  return app;
}

module.exports = { createApp };
