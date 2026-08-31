// TERRITORY: B (Little Things Catalog item 14, 2026-08-24)
/* "Open in Sleeper everywhere an action lives there — our site is the
 * brain, Sleeper is the hands. ZERO deep links exist today. Lineup
 * warnings, waiver ideas, IR moves: every one ends at the transaction,
 * which happens in Sleeper."
 *
 * ONE verified URL construction (already live on the lineup-problem NEEDS
 * YOU row before this pass: https://sleeper.com/leagues/{id}/team), now
 * exposed site-wide as res.locals.sleeperLink and reused, not re-guessed,
 * at the two other surfaces the catalog item names:
 *   - waiver claims (/waivers) — "Open in Sleeper to claim →"
 *   - a hard-OUT on the roster (Tuesday wire email) — "...make the roster
 *     move →", only when there's a real IR-move candidate, not for every
 *     questionable tag.
 *
 * Drives the real app / the real email-payload builder — not a guess about
 * what the markup would look like.
 *
 * Run: node draft/tests/sleeper_deep_links.test.js
 */
'use strict';
const os = require('os');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sleeper-links-'));

const store = require(path.join(ROOT, 'src', 'store'));
store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const http = require('http');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  const opp = owners.find(o => o.id !== cory.id);
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false;
  await store.set('owners', owners);

  const LID = 'DEEPLINKLEAGUE';
  const cfg = await store.get('config');
  cfg.sleeper_league_id = LID;
  cfg.sleeper_map = { 1: cory.id, 2: opp.id };
  await store.set('config', cfg);

  // A roster with an OUT starter, so the lineup-problem NEEDS YOU row fires.
  await store.set('players-cache', {
    fetched_at: Date.now(),
    data: { players: {
      p1: { name: 'Dead Starter', pos: 'RB', team: 'KC', rank: 20, inj: 'OUT' },
      p2: { name: 'Bench Guy', pos: 'RB', team: 'SF', rank: 90, inj: null },
    }, count: 2 },
  });
  // A real opponent, matched by matchup_id (myMatchup refuses a null id —
  // register found by B earlier this project — so this must be a real number
  // shared by both rows, not left to default-match on null === null).
  await store.set('sleeper-cache', {
    league_id: LID, fetched_at: Date.now(),
    data: {
      state: { week: 3 },
      league: { name: 'MFGA', season: '2026', total_rosters: 10,
        roster_positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN'] },
      users: [{ user_id: 'u0', display_name: cory.name }, { user_id: 'u1', display_name: 'Opponent' }],
      rosters: [
        { roster_id: 1, owner_id: 'u0', players: ['p1', 'p2'], starters: ['p1'],
          settings: { wins: 1, losses: 1, fpts: 100 } },
        { roster_id: 2, owner_id: 'u1', players: [], starters: [],
          settings: { wins: 1, losses: 1, fpts: 100 } },
      ],
      matchups: [
        { roster_id: 1, matchup_id: 1, points: 12, starters: ['p1'] },
        { roster_id: 2, matchup_id: 1, points: 10 },
      ],
      week: 3,
    },
  });

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const port = srv.address().port;
  const post = (p, formBody, cookie) => new Promise((resolve, reject) => {
    const headers = { 'content-type': 'application/x-www-form-urlencoded' };
    if (cookie) headers.Cookie = cookie;
    const req = http.request({ host: 'localhost', port, path: p, method: 'POST', headers }, r => {
      let body = ''; r.on('data', c => body += c); r.on('end', () => resolve({ status: r.statusCode, body, headers: r.headers }));
    });
    req.end(formBody); req.on('error', reject);
  });
  const get = (p, cookie) => new Promise((resolve, reject) => {
    http.get({ host: 'localhost', port, path: p, headers: { Cookie: cookie } }, r => {
      let body = ''; r.on('data', c => body += c); r.on('end', () => resolve({ status: r.statusCode, body }));
    }).on('error', reject);
  });

  const loginRes = await post('/login', 'username=cory&password=pw');
  const cookie = (loginRes.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');

  // ── 1. The pre-existing lineup-problem link still works, now via the
  // shared helper instead of a hand-built string. ────────────────────────
  const home = await get('/', cookie);
  ck('the lineup-problem NEEDS YOU row still links to the real Sleeper league',
    home.body.includes(`https://sleeper.com/leagues/${LID}/team`), home.body.includes('Lineup problem'));

  // ── 2. Waivers — the new deep link. Live over HTTP with no board data
  // seeded produces zero claims (proven: the page still renders clean, no
  // template error, and correctly shows nothing rather than a broken link —
  // see the two checks just above/below this block). Reaching a non-empty
  // claims block needs full projection data this test does not otherwise
  // need, so the button's OWN conditional markup is verified directly
  // against the real template with hand-built locals matching exactly what
  // member.js's /waivers route passes — same technique panel-source tests
  // in this codebase already use for template-only checks. ────────────────
  {
    const ejs = require('ejs');
    const renderWaivers = locals => new Promise((resolve, reject) => {
      ejs.renderFile(path.join(ROOT, 'views', 'waivers.ejs'), locals, (err, html) => err ? reject(err) : resolve(html));
    });
    const baseLocals = {
      title: 'x', owner: { id: cory.id, name: cory.name, is_commissioner: true },
      currentPath: '/waivers', alerts: [], quip: '', chatUnread: 0, betsWaiting: 0, votesWaiting: 0,
      money: n => '$' + n, humanTime: () => ({ text: '', title: '' }), venmoLink: () => null,
      // Another lane added its own injury chip to this same claims loop
      // (catalog item 16, waivers.ejs) in parallel with item 14's button —
      // reuse the real classifier here too, same as server-app.js wires it
      // sitewide, rather than stub it and risk missing a real crash.
      injuryFlag: require(path.join(ROOT, 'src', 'matchup.js')).injuryFlag,
      sleeperLink: suffix => `https://sleeper.com/leagues/${LID}` + (suffix ? '/' + suffix : ''),
      viewerIsChamp: false,
      me: { id: cory.id, name: cory.name }, season: '2026', weekNo: 3, live: true, err: null,
      drop: { name: 'Bench Guy' }, perPoint: 1, streamClaims: [], currentKD: [], blockWatch: [],
      liveStale: { stale: false }, captureError: false, guide: {},
    };
    const withClaim = { name: 'Wire Guy', position: 'WR', net_value: 5, dollars: 5,
      consensus_projection: null, consensus_label: '', drop: null, why: '', rivals: [], contested: false };

    const htmlWithClaims = await renderWaivers({ ...baseLocals, claims: [withClaim] });
    ck('with a real claim, the template carries an "Open in Sleeper to claim" link to the SAME verified URL',
      new RegExp(`href="https://sleeper\\.com/leagues/${LID}/team"[^>]*target="_blank"[^>]*>Open in Sleeper to claim`).test(htmlWithClaims),
      (htmlWithClaims.match(/Open in Sleeper[\s\S]{0,20}/) || [])[0]);

    const htmlNoClaims = await renderWaivers({ ...baseLocals, claims: [] });
    ck('CONTROL — with zero claims, no Sleeper button renders (nothing to act on)',
      !/Open in Sleeper to claim/.test(htmlNoClaims));

    ck('CONTROL — the live /waivers route with no board data seeded renders clean, with none of the '
       + 'above touched (proves the guard does not crash on the empty-claims path it actually hits here)',
      !/ReferenceError|Cannot read|is not defined/.test((await get('/waivers', cookie)).body));
  }

  // ── 3. The Tuesday wire email — IR-move link only on a real hard-out.
  // Intercepts the real send path (same pattern as tuesday_wire.test.js)
  // and reads the ACTUAL HTML that would land in the inbox, not a guess
  // about what the template produces. ─────────────────────────────────────
  const { wirePayload } = require(path.join(ROOT, 'netlify', 'functions', 'waiver-reco-cron.js'));
  cory.email = 'cory@example.com'; cory.is_commissioner = true;
  await store.set('owners', owners);
  process.env.RESEND_API_KEY = 'test-key-not-real';
  const realFetch = global.fetch;
  let sentBody = null;
  global.fetch = async (url, opts) => {
    if (String(url).includes('api.resend.com')) {
      sentBody = JSON.parse(opts.body);
      return { ok: true, text: async () => '', json: async () => ({}) };
    }
    return realFetch(url, opts);
  };
  const notify = require(path.join(ROOT, 'src', 'notify.js'));

  const recoWithHardOut = { claims: [], streamClaims: [], blockWatch: [],
    myInjured: [{ name: 'Dead Starter', position: 'RB', tag: 'OUT', out: true }] };
  const payloadOut = wirePayload(recoWithHardOut, 3, () => 'x', LID);
  ck('wirePayload carries the league id through for the email to use', payloadOut.leagueId === LID);
  const sentOut = await notify.tuesdayWire([cory], payloadOut);
  ck('the email sends for a hard-out week', sentOut && sentOut.sent === true, sentOut);
  const htmlOut = (sentBody && sentBody.html) || '';
  ck('the hard-out email carries the IR-move Sleeper link to the real league',
    new RegExp(`href="https://sleeper\\.com/leagues/${LID}/team"[^>]*>Open in Sleeper to make the roster move`).test(htmlOut),
    htmlOut.slice(0, 300));

  sentBody = null;
  const recoQuestionableOnly = { claims: [{ name: 'Wire Guy', position: 'WR', net_value: 5, dollars: 5 }],
    streamClaims: [], blockWatch: [],
    myInjured: [{ name: 'Iffy Guy', position: 'WR', tag: 'Q', out: false }] };
  const payloadQ = wirePayload(recoQuestionableOnly, 3, () => 'x', LID);
  await notify.tuesdayWire([cory], payloadQ);
  const htmlQ = (sentBody && sentBody.html) || '';
  ck('CONTROL — a questionable-only week (no hard out) does NOT carry the IR-move link, '
     + 'even though the injury section itself still renders',
    /Iffy Guy/.test(htmlQ) && !/make the roster move/.test(htmlQ), htmlQ.slice(0, 300));

  global.fetch = realFetch;
  delete process.env.RESEND_API_KEY;

  srv.close();
  console.log(`\n${pass}/${pass + fail} sleeper-deep-links checks passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
