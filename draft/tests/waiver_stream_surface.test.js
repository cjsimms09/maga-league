'use strict';
// TERRITORY: A
// THE STREAMING CARD, ACTUALLY RENDERED — not just "the page doesn't 500."
//
// waiver_surface.test.js exercises GET /waivers thoroughly, but its fixtures
// (MINE + GOOD_WIRE/DEAD_WIRE) never give a wire K/DEF a higher projection than
// the one already rostered — GOOD_WIRE's "Wire Kicker" is 110 vs MINE's rostered
// Butker at 130, so streamClaims (member.js's `net_value > 0` filter) is empty in
// every case that test seeds. The whole "🔁 Streaming (K/DEF)" card, its exact
// copy, and the two forms under it (`/stream/log`, `/stream/override`) were
// checked this session by an ad-hoc ejs.compile() run against hand-built data,
// never pinned down as a permanent test — same class of gap as the four capture
// routes and consensus.js, closed the same way here.
//
// THE DEEPER CHECK: rather than constructing the POST body by hand (already done
// in inseason_capture_routes.test.js), this test PARSES the hidden field values
// out of the real rendered HTML and submits exactly those — so a bug in the
// `JSON.stringify(...).replace(/"/g, '&quot;')` escaping the view uses would
// actually be caught here, not just assumed safe.
//
// Run: node draft/tests/waiver_stream_surface.test.js
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'wss-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const predledger = require(path.join(ROOT, 'src', 'predledger'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const H = require(path.join(ROOT, 'src', 'helpers'));
const { createApp } = require(path.join(ROOT, 'server-app'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 300) : ''))); };

// MY ROSTER — same shape as waiver_surface.test.js's MINE, so a reader of one
// understands the other; rostered K/DEF deliberately weak so a stream is real.
const MINE = [
  ['m1', 'Josh Allen', 'QB', 300], ['m2', 'Bijan Robinson', 'RB', 240],
  ['m3', 'Breece Hall', 'RB', 220], ['m4', "Ja'Marr Chase", 'WR', 230],
  ['m5', 'Puka Nacua', 'WR', 210], ['m6', 'Sam LaPorta', 'TE', 180],
  ['m7', 'Jahmyr Gibbs', 'RB', 175], ['m8', 'Weak Kicker', 'K', 60],
  ['m9', 'Weak D/ST', 'DEF', 55], ['m10', 'Bench Scrub', 'WR', 120],
];
// A genuine K upgrade on the wire; no RB/WR upgrade, so it isolates streamClaims
// from the priority-claims list above it on the page.
const STREAM_WIRE = [['f1', 'Streamer Kicker', 'K', 145], ['f2', 'Wire Scrub', 'WR', 90]];
const NO_STREAM_WIRE = [['f1', 'Weak Wire Kicker', 'K', 50], ['f2', 'Wire Scrub', 'WR', 90]];

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false; cory.is_commissioner = true;
  const active = owners.filter(o => o.active).slice(0, 10);
  active.forEach(o => { o.password_hash = hashPassword('pw'); o.must_change_password = false; });
  await store.set('owners', owners);
  const cfg = await store.get('config');
  const lid = cfg.sleeper_league_id || 'TESTLEAGUE';
  cfg.sleeper_league_id = lid;
  cfg.sleeper_map = {}; active.forEach((o, i) => { cfg.sleeper_map[String(i + 1)] = o.id; });
  await store.set('config', cfg);
  const myRid = Object.keys(cfg.sleeper_map).find(k => Number(cfg.sleeper_map[k]) === Number(cory.id));
  const SEASON = String(H.currentSeason(await store.get('seasons')).year);

  const artifactPath = path.join(ROOT, 'public', 'draft_data.json');
  const realArtifact = fs.readFileSync(artifactPath);
  const mkArt = wire => ({
    players: [...MINE, ...wire].map(([id, name, pos, proj]) => ({
      player_id: id, name, position: pos, proj_mean: proj, vorp: Math.round(proj * 0.4), bye: null })),
  });
  const seed = async wire => {
    fs.writeFileSync(artifactPath, JSON.stringify(mkArt(wire)));
    const slim = {};
    for (const [id, name, pos] of [...MINE, ...wire]) slim[id] = { name, pos, team: 'XXX', rank: 1, inj: null };
    await store.set('players-cache', { fetched_at: Date.now(), data: { players: slim, count: MINE.length + wire.length } });
    await store.set('sleeper-cache', {
      league_id: lid, fetched_at: Date.now(),
      data: { state: { week: 5, season: SEASON },
        league: { name: 'MFGA', season: SEASON, total_rosters: 10,
          roster_positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'BN'],
          settings: { playoff_week_start: 15 } },
        users: active.map((o, i) => ({ user_id: 'u' + i, display_name: o.name })),
        rosters: active.map((o, i) => ({ roster_id: i + 1, owner_id: 'u' + i,
          players: String(i + 1) === String(myRid) ? MINE.map(p => p[0]) : [...MINE.map(p => p[0])],
          settings: { wins: 4, losses: 3, fpts: 700 } })),
        matchups: [], week: 5 } });
  };

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const cookie = (await fetch(base + '/login', {
    method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `username=${cory.username}&password=pw`,
  }).then(r => r.headers.getSetCookie())).map(x => x.split(';')[0]).join('; ');
  const rawPage = async () => (await fetch(base + '/waivers', { headers: { cookie }, redirect: 'manual' })).text();

  try {
    // ── NO GENUINE K/DEF UPGRADE: the card must not appear at all ───────────
    await seed(NO_STREAM_WIRE);
    {
      const t = await rawPage();
      ck('with no real K/DEF upgrade on the wire, the streaming card is absent',
        !/Streaming \(/.test(t), (t.match(/.{0,60}Streaming.{0,60}/) || [''])[0]);
      ck('  and neither stream form renders', !/action="\/stream\/log"/.test(t) && !/action="\/stream\/override"/.test(t));
    }

    // ── A REAL K UPGRADE: the card, its exact copy, and both forms ──────────
    await seed(STREAM_WIRE);
    let html;
    {
      html = await rawPage();
      ck('a genuine K upgrade surfaces the streaming card', /🔁 Streaming \(K\)/.test(html), html.includes('Streaming') ? 'present but wrong pos' : 'absent');
      ck('  names the streamer by name', /Streamer Kicker/.test(html));
      ck('  is honestly labelled season-value, not matchup-tuned',
        /season-value ranking, not matchup-tuned/.test(html));
      ck('  states the free-swap distinction (no priority spent)',
        /costs no waiver\s*\n?\s*priority/.test(html.replace(/&#39;|&amp;/g, '')) || /costs no waiver/.test(html),
        (html.match(/.{0,40}costs no waiver.{0,60}/) || [''])[0]);
      ck('  both forms are present', /action="\/stream\/log"/.test(html) && /action="\/stream\/override"/.test(html));
    }

    // ── SUBMIT EXACTLY WHAT THE PAGE RENDERED, not a hand-built body ────────
    // THIS is what caught the real double-escape bug (fixed 2026-08-15, same
    // commit as this test): EJS's <%= already HTML-escapes (as numeric &#34;,
    // not &quot;), so a view that ALSO called .replace(/"/g,'&quot;') produced
    // &amp;quot; in the actual response — which a real browser decodes ONCE,
    // leaving the literal text "&quot;" in the submitted form value, not a
    // real quote. Decoding only &amp;/&#34;/&quot; here mirrors exactly what a
    // browser's own single-pass entity decoder does — no more, no less — so
    // this extraction is only as forgiving as a real browser would be.
    const hidden = (formHtml, name) => {
      const m = formHtml.match(new RegExp('name="' + name + '" value="([^"]*)"'));
      if (!m) return null;
      return m[1].replace(/&#34;/g, '"').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    };
    const logFormMatch = html.match(/<form method="post" action="\/stream\/log"[\s\S]*?<\/form>/);
    const ovFormMatch = html.match(/<form method="post" action="\/stream\/override"[\s\S]*?<\/form>/);
    ck('both forms were found in the raw HTML for field extraction', !!logFormMatch && !!ovFormMatch);

    if (logFormMatch) {
      const logForm = logFormMatch[0];
      const week = hidden(logForm, 'week'), dollars = hidden(logForm, 'dollars');
      const chosen = hidden(logForm, 'chosen'), counterfactual = hidden(logForm, 'counterfactual');
      ck('the rendered "chosen" hidden field is valid, parseable JSON naming the streamer',
        (() => { try { return JSON.parse(chosen).name === 'Streamer Kicker'; } catch (e) { return false; } })(),
        chosen);
      ck('the rendered "counterfactual" hidden field names who I already have, not "hold priority"',
        (() => { try { return JSON.parse(counterfactual).name === 'Weak Kicker'; } catch (e) { return false; } })(),
        counterfactual);

      const r = await fetch(base + '/stream/log', {
        method: 'POST', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ week, dollars, chosen, counterfactual }).toString(), redirect: 'manual',
      });
      ck('POSTing the page\'s own rendered values to /stream/log redirects cleanly', r.status === 302, r.status);

      const rows = await predledger.readAll(store, SEASON);
      const entry = rows.filter(e => e.kind === 'stream_call').sort((a, b) => b.seq - a.seq)[0];
      ck('a real, browser-shaped submission lands correctly in the ledger',
        !!entry && entry.payload.chosen.name === 'Streamer Kicker'
          && entry.payload.counterfactual.name === 'Weak Kicker', entry && entry.payload);
    }

    if (ovFormMatch) {
      const ovForm = ovFormMatch[0];
      const week = hidden(ovForm, 'week'), dollars = hidden(ovForm, 'dollars'), recommended = hidden(ovForm, 'recommended');
      const r = await fetch(base + '/stream/override', {
        method: 'POST', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ week, dollars, recommended, reason: 'kept current' }).toString(), redirect: 'manual',
      });
      ck('POSTing the page\'s own rendered "kept current" chip to /stream/override redirects cleanly', r.status === 302, r.status);
      const rows = await predledger.readAll(store, SEASON);
      const entry = rows.filter(e => e.kind === 'inseason_override' && e.method === 'stream-override-v1')[0];
      ck('the override entry\'s recommended matches what the page actually rendered',
        !!entry && entry.payload.recommended.name === 'Streamer Kicker', entry && entry.payload);
      ck('  reason chip is captured verbatim', !!entry && entry.payload.reason === 'kept current', entry && entry.payload);
    }
  } finally {
    fs.writeFileSync(artifactPath, realArtifact);
  }

  srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
