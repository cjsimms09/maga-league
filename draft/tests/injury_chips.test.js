/* SITEWIDE INJURY CHIPS (redesign catalog 16, 2026-08-24) — one leveled
 * ladder (matchup.js's injuryFlag), now on the team roster and the wire.
 * Positive and negative arms on the real renders.
 */
'use strict';
process.env.DATA_DIR = require('fs').mkdtempSync(
  require('path').join(require('os').tmpdir(), 'injchips-'));

const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { createApp } = require(path.join(ROOT, 'server-app'));
const data = require(path.join(ROOT, 'src', 'data'));
const store = require(path.join(ROOT, 'src', 'store'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const W = require(path.join(ROOT, 'src', 'routes', 'waivers'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + '  -> ' + JSON.stringify(d))); };

// ── the claim shape carries the designation through the evaluator ───────────
{
  const fas = [{ player_id: 'x1', name: 'Wire Target', position: 'RB',
    proj_mean: 180, vorp: 40, injury_status: 'Questionable' }];
  const mine = [{ player_id: 'm1', name: 'My RB', position: 'RB', proj_mean: 90, vorp: 2 },
                { player_id: 'm2', name: 'My WR', position: 'WR', proj_mean: 120, vorp: 10 }];
  const league = { teams: 10, starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 } };
  const res = W.evaluateClaims(fas, mine, league, {
    band: { median: 148, sd: 12 }, lineupMean: 110, lineupSd: 20, oppMean: 110, leagueRosters: {} });
  const claim = res.claims.find(c => c.name === 'Wire Target');
  /* ⚠️ THE VALUE IS NORMALISED, AND THIS EXPECTED THE RAW SLEEPER CASING.
   * Register 321 added ONE normalisation (`injuryTag`, waivers.js:171 —
   * uppercase, non-letters stripped) so the ranking and the display panel could
   * not read the tag two ways. `'Questionable'` therefore arrives as
   * `'QUESTIONABLE'`, and this arm reported it as the field being missing.
   *
   * Checked as the CONTRACT rather than as a literal: the claim must carry the
   * designation, normalised through the exported function, so the test agrees
   * with the normalisation by construction instead of restating its output.
   * Register 353. */
  ck('evaluateClaims carries injury_status onto the claim, normalised through '
    + 'the one exported tag function (register 321)',
    claim && claim.injury_status === W.injuryTag(fas[0])
      && claim.injury_status === 'QUESTIONABLE',
    claim && { got: claim.injury_status, expected: W.injuryTag(fas[0]),
      keys: Object.keys(claim) });
}

// ── the team page renders the leveled ladder ────────────────────────────────
(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  for (const o of owners) { o.password_hash = hashPassword('pw'); o.must_change_password = false; }
  await store.set('owners', owners);

  const smap = {}; owners.forEach((o, i) => { smap[String(i + 1)] = o.id; });
  const cfg = (await store.get('config')) || {};
  cfg.sleeper_league_id = 'INJTEST'; cfg.sleeper_map = smap;
  await store.set('config', cfg);
  await store.set('players-cache', { fetched_at: Date.now(), data: { players: {
    p1: { name: 'On Ice', pos: 'RB', team: 'DET', rank: 10, inj: 'IR' },
    p2: { name: 'Maybe Man', pos: 'WR', team: 'KC', rank: 11, inj: 'Questionable' },
    p3: { name: 'Iron Horse', pos: 'QB', team: 'BUF', rank: 3, inj: null },
  }, count: 3 } });
  const rosters = owners.map((o, i) => ({ roster_id: i + 1, owner_id: 'u' + o.id,
    players: i === 0 ? ['p1', 'p2', 'p3'] : [], starters: i === 0 ? ['p3', 'p1', 'p2'] : [],
    settings: { wins: 1, losses: 1, fpts: 100, fpts_decimal: 0 } }));
  const users = owners.map(o => ({ user_id: 'u' + o.id, display_name: o.name, metadata: {} }));
  await store.set('sleeper-cache', { league_id: 'INJTEST', fetched_at: Date.now(),
    data: { week: 3, state: { week: 3, season: '2026', season_type: 'regular' },
      league: { total_rosters: owners.length, roster_positions: ['QB', 'RB', 'WR'], settings: {} },
      users, rosters, matchups: [] } });

  const server = createApp().listen(0);
  await new Promise(r => server.once('listening', r));
  const b = `http://127.0.0.1:${server.address().port}`;
  const cookieFrom = r => r.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
  const cc = cookieFrom(await fetch(b + '/login', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'username=cory&password=pw', redirect: 'manual' }));

  const page = await (await fetch(b + '/team', { headers: { Cookie: cc } })).text();
  ck('the team page renders', /On Ice/.test(page), 'roster missing');
  ck('IR renders as the red cannot-score chip', /class="mu-flag out">IR</.test(page), 'no red IR chip');
  ck('Questionable renders as the amber maybe chip', /class="mu-flag q">Q</.test(page), 'no amber Q chip');
  /* SPLIT 2026-08-26. This was one `&&` reporting one message, so when it went
   * red the detail said "chip on healthy player" — and that was not what had
   * happened. Two different claims, two checks, two messages. Register 353. */
  ck('NEGATIVE ARM: a healthy player never wears a chip',
    !/Iron Horse[^<]*<span class="mu-flag/.test(page), 'chip on healthy player');
  /* ⚠️ AND THE SECOND HALF WAS ASSERTING THE DEFECT. It required the word
   * "healthy" on the page; `views/team.ejs:311` records that the old Status
   * column "called a bye-week player 'healthy', which is a different (wrong)
   * answer to the same question the chip already answers correctly", and
   * catalog item 16 removed it deliberately. So the check went red because B
   * shipped the fix this file's own subject line is about.
   *
   * INVERTED rather than deleted: the absence is now the assertion, so if the
   * word ever comes back — with the bye-week bug behind it — this goes red for
   * the right reason. A healthy player reads healthy by wearing NO chip, which
   * is the arm directly above. */
  ck('...and it does NOT print the word "healthy", because doing so is what '
    + 'mislabelled bye-week players (team.ejs:311, catalog item 16)',
    !/healthy/i.test(page), 'the page is printing a healthy label again');
  ck('the flat old badge is gone from the injury column', !/badge owes">IR</.test(page), 'old badge remains');

  server.close();
  console.log(`\n${pass}/${pass + fail} injury-chip checks passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
