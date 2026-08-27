// TERRITORY: B — register 324 (E's diagnosis, my fix)
/* "THE ADVICE FLIPS, NOT JUST THE NUMBER." liveOptimizeFor() (src/routes/
 * member.js) used to switch its opponent-strength estimate to the LIVE
 * matchup.opp.points the moment it went above zero -- a PARTIAL mid-game
 * score, not a final one. E measured this on a real Sunday, same roster and
 * projections throughout: pre-kick "protect, coin flip" ($44.77) -> mid-
 * Sunday, the opponent's early score substituted whole, "start your studs,
 * no chase" ($113.69) -> every game finished, "protect" again ($43.10). The
 * headline advice flipped and flipped back, driven entirely by the clock.
 *
 * The fix: never trust matchup.opp.points as the opponent's total for this
 * tool -- always hold the pre-kick typicalTeamScore() estimate, the same
 * rule the matchup card's win-odds line already applies (refuse a live
 * number that cannot be trusted yet rather than substitute it).
 *
 * This drives the REAL /lineup route three times against the SAME roster
 * and projections, moving only the opponent's live points field across
 * pre-kick / mid-game partial / full-final -- and checks the opponent
 * estimate (and therefore the posture) does not move either.
 *
 * Run: node draft/tests/lineup_posture_ignores_partial_opponent.test.js
 */
'use strict';
const os = require('os');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lineup-posture-'));

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

  const LID = 'POSTURELEAGUE';
  const cfg = await store.get('config');
  cfg.sleeper_league_id = LID;
  cfg.sleeper_map = { 1: cory.id, 2: opp.id };
  await store.set('config', cfg);

  const PLAYERS = {
    p1: { name: 'QB One', pos: 'QB', team: 'KC' }, p2: { name: 'RB One', pos: 'RB', team: 'SF' },
    p3: { name: 'RB Two', pos: 'RB', team: 'DAL' }, p4: { name: 'WR One', pos: 'WR', team: 'MIA' },
    p5: { name: 'WR Two', pos: 'WR', team: 'BUF' }, p6: { name: 'TE One', pos: 'TE', team: 'DET' },
    p7: { name: 'FLEX Guy', pos: 'WR', team: 'CIN' }, p8: { name: 'K One', pos: 'K', team: 'PHI' },
    p9: { name: 'DEF One', pos: 'DEF', team: 'BAL' },
  };
  await store.set('players-cache', {
    fetched_at: Date.now(), data: { players: PLAYERS, count: Object.keys(PLAYERS).length },
  });
  // Last week's real points, so the optimizer has a non-zero mean without
  // needing season-stats/gp too (the projPending guard only needs ONE fallback).
  await store.set('stats-cache:2026:2', {
    fetched_at: Date.now(),
    data: { p1: { pts_half_ppr: 22 }, p2: { pts_half_ppr: 14 }, p3: { pts_half_ppr: 11 },
      p4: { pts_half_ppr: 16 }, p5: { pts_half_ppr: 9 }, p6: { pts_half_ppr: 8 },
      p7: { pts_half_ppr: 12 }, p8: { pts_half_ppr: 7 }, p9: { pts_half_ppr: 6 } },
  });

  const starters = Object.keys(PLAYERS);
  async function seedWeek(oppPoints) {
    await store.set('sleeper-cache', {
      league_id: LID, fetched_at: Date.now(),
      data: {
        state: { week: 3, season: '2026' },
        league: { name: 'PostureLeague', season: '2026', total_rosters: 10,
          roster_positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN'] },
        users: [{ user_id: 'u0', display_name: cory.name }, { user_id: 'u1', display_name: opp.name }],
        rosters: [
          { roster_id: 1, owner_id: 'u0', players: starters, starters,
            settings: { wins: 1, losses: 1, fpts: 100 } },
          { roster_id: 2, owner_id: 'u1', players: [], starters: [],
            settings: { wins: 1, losses: 1, fpts: 100 } },
        ],
        matchups: [
          { roster_id: 1, matchup_id: 1, points: 40, starters },
          { roster_id: 2, matchup_id: 1, points: oppPoints, starters: [] },
        ],
        week: 3,
      },
    });
  }

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

  const oppModelledText = html => (html.match(/typical team score \((\d+)\)/) || [])[1];

  // ── 1. PRE-KICK: opponent has zero points, tool models a typical team. ──
  await seedWeek(0);
  const preKick = await get('/lineup', cookie);
  ck('pre-kick: page renders clean', preKick.status === 200);
  const preKickOppMean = oppModelledText(preKick.body);
  ck('pre-kick: opponent is modelled as a typical team (not yet known)', !!preKickOppMean, preKick.body.slice(0, 0));

  // ── 2. MID-GAME: opponent has a PARTIAL live score (one early score). ──
  await seedWeek(6);
  const midGame = await get('/lineup', cookie);
  const midGameOppMean = oppModelledText(midGame.body);
  ck('mid-game (partial opponent score): STILL modelled as typical, not substituted',
    !!midGameOppMean, midGame.body.match(/Opponent[^<]*/));
  ck('mid-game: the modelled number did not move — this is the register-324 regression check',
    midGameOppMean === preKickOppMean, { preKick: preKickOppMean, midGame: midGameOppMean });

  // ── 3. FULL FINAL: every game is over, opponent's real total posted. ────
  await seedWeek(118);
  const final = await get('/lineup', cookie);
  const finalOppMean = oppModelledText(final.body);
  ck('full-final: STILL held at the pre-kick estimate (a "known" score is never actionable here)',
    finalOppMean === preKickOppMean, { preKick: preKickOppMean, final: finalOppMean });

  srv.close();
  console.log(`\n${pass}/${pass + fail} lineup-posture-ignores-partial-opponent checks passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
