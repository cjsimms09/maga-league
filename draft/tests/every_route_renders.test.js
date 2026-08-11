'use strict';
// EVERY PAGE THE SITE EXPOSES ACTUALLY RENDERS.
//
// Written after /analyzer turned out to reference an undeclared `world` on
// every call. That particular throw was caught and swallowed, so a sweep like
// this would not have found it — but it is the cheap broad guard the project
// did not have: 58 GET routes and nothing asserting they return a page at all.
// A view that throws on a local nobody passes, a partial renamed, a helper
// removed from a router's locals — all of it lands here as a 500.
//
// The route list is READ FROM THE SOURCE, so a route added tomorrow is covered
// without anybody remembering to add it. Routes needing parameters this file
// cannot invent are counted and reported rather than quietly skipped.
//
// Every non-200 is listed with the reason it is correct. A blanket "4xx is
// fine" would make this test agree with anything.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'err-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 400) : ''))); };

// Routes that answer something other than 200 BY DESIGN, each with its reason.
// Anything not on this list must render.
const EXPECTED = {
  '/api/weekly-recap': 'cron-only: refuses without the shared secret',
  '/api/sunday-alert': 'cron-only: refuses without the shared secret',
  '/reset': 'password reset needs a valid token in the query',
  '/rivalry': 'needs ?a= and ?b=; renders its own "pick two owners" page with a 404',
  '/admin/sleeper-proxy': 'a proxy: refuses a request with no path to proxy',
};
// /admin/status is a page ABOUT past defects — it quotes "threw a bare
// TypeError" as prose. Named here so the error-signature scan below cannot be
// fooled by it, and cannot be silently widened to cover a real one.
const QUOTES_ERRORS = new Set(['/admin/status']);

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false; cory.is_commissioner = true;
  await store.set('owners', owners);

  const routesFrom = f => [...fs.readFileSync(path.join(ROOT, 'src', 'routes', f), 'utf8')
    .matchAll(/router\.get\(\s*'([^']+)'/g)].map(m => m[1]);
  const subs = { ':year': '2025', ':name': 'Cory', ':id': '1', ':week': '1', ':season': '2025' };
  // THE DEFAULT STATE IS NOT THE INTERESTING STATE. A bare GET of /watch
  // renders the dormant "nothing on right now" panel and never reaches the row
  // template at all — a typo'd local in that template survived this sweep until
  // these variants were added. Each one lights up a branch a plain GET does not.
  const VARIANTS = [
    '/watch?preview=1',              // the rehearsal rows
    '/bank?section=sidebets',        // the other half of the money page
    '/history?section=owners',       // the owner cards
    '/history?section=money',        // the winnings grid
    '/matchup?opp=2',                // an opponent, so the h2h + bet panels render
    '/pickem',                       // the slate and the boards
    '/analyzer?week=3',              // an explicit checkpoint
  ];
  const all = [...new Set([...routesFrom('member.js'), ...routesFrom('admin.js').map(r => '/admin' + r),
    ...VARIANTS])];
  const resolved = [], skipped = [];
  for (const r of all) {
    let p = r;
    for (const [k, v] of Object.entries(subs)) p = p.split(k).join(v);
    (p.includes(':') ? skipped : resolved).push({ route: r, path: p });
  }

  ck('there are routes to drive', resolved.length >= 45, { driving: resolved.length, skipped: skipped.length });
  ck('  and the ones skipped for want of a parameter are named, not hidden',
    skipped.length <= 6, skipped.map(s => s.route));

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const login = await fetch(base + '/login', { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'username=cory&password=pw' });
  const cookie = (login.headers.getSetCookie() || []).map(x => x.split(';')[0]).join('; ');

  const broken = [], unexpected = [], errored = [];
  for (const { route, path: p } of resolved) {
    let res, body = '';
    try {
      res = await fetch(base + p, { headers: { cookie }, redirect: 'manual' });
      if (res.status === 200) body = await res.text();
    } catch (e) { errored.push({ route, error: e.message }); continue; }
    if (res.status >= 500) broken.push({ route, status: res.status });
    else if (res.status >= 400 && !EXPECTED[route]) unexpected.push({ route, status: res.status });
    // A page that renders but carries a stack-trace signature is not rendering.
    if (body && !QUOTES_ERRORS.has(route)
      && /ReferenceError|is not defined|Cannot read propert(y|ies) of (undefined|null)/.test(body)) {
      broken.push({ route, status: res.status, signature: (body.match(/.{0,60}(ReferenceError|is not defined|Cannot read propert)/) || [])[0] });
    }
  }

  ck('no route throws on the way to the client', errored.length === 0, errored);
  ck('no page 500s or renders a stack trace', broken.length === 0, broken);
  ck('  and every route that refuses does so for a reason named here',
    unexpected.length === 0, unexpected);
  // Not vacuous: the exceptions must still BE exceptional. If one starts
  // rendering, the entry is stale and should go rather than sit here forever.
  {
    const stale = [];
    for (const route of Object.keys(EXPECTED)) {
      const hit = resolved.find(x => x.route === route);
      if (!hit) { stale.push({ route, why: 'no longer a route' }); continue; }
      const r = await fetch(base + hit.path, { headers: { cookie }, redirect: 'manual' });
      if (r.status < 400) stale.push({ route, now: r.status });
    }
    ck('  every named exception is still refusing', stale.length === 0, stale);
  }

  srv.close();
  console.log(`\n${pass} passed, ${fail} failed   (${resolved.length} routes driven)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
