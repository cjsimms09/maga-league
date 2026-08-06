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
  // Static require so the function bundler always packages ejs (express's own
  // view-engine loading uses a dynamic require that bundlers can miss).
  app.engine('ejs', require('ejs').__express);
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
      .then(async world => {
        req.world = world;
        req.owner = req.session.ownerId
          ? world.owners.find(o => o.id === req.session.ownerId && o.active) || null
          : null;
        res.locals.owner = req.owner;
        res.locals.money = helpers.money;
        res.locals.alerts = req.owner ? helpers.activeAlerts(world.alerts) : [];
        res.locals.currentPath = req.path;
        res.locals.quip = helpers.pickRandom(helpers.QUIPS);
        res.locals.chatUnread = 0;
        if (req.owner && req.path !== '/chat') {
          try { res.locals.chatUnread = await helpers.chatUnread(req.owner.id); } catch (e) { /* badge is cosmetic */ }
        }
        // Live draft-order alert: whoever is on the clock gets told, loudly.
        const season = helpers.currentSeason(world.seasons);
        if (!req.owner || !season || !season.draft_open) return next();
        helpers.draftState(season.year, helpers.activeOwners(world.owners))
          .then(draft => {
            if (draft.current) {
              const mine = draft.current.owner_id === req.owner.id;
              res.locals.alerts = [{
                level: mine ? 'urgent' : 'info',
                message: mine
                  ? `It's your turn to choose your ${season.year} draft spot. No timer — but everyone picks after you.`
                  : `Draft spots are being chosen: waiting on ${draft.current.name} (turn ${draft.current.pos} of ${draft.picks.length}).`,
                href: '/draft', linkText: mine ? 'Choose your spot →' : 'See the board →',
              }, ...res.locals.alerts];
            }
            next();
          })
          .catch(next);
      })
      .catch(next);
  });

  app.use('/', require('./src/routes/member'));
  app.use('/admin', requireLogin, require('./src/routes/admin'));

  app.use((req, res) => res.status(404).render('error', { title: 'Not Found', message: 'That page has gone missing. Sad!' }));
  app.use((err, req, res, next) => {
    console.error(err);
    // Show the underlying reason — it's a private league site and a readable
    // error beats a blind "something broke" when the commissioner reports it.
    res.status(500).render('error', {
      title: 'Error',
      message: `Something went wrong: ${err && err.message ? err.message : 'unknown error'}`,
    });
  });

  return app;
}

module.exports = { createApp };
