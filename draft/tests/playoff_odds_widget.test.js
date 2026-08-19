// TERRITORY: A owns the feed (season_forward_inseason.py) · B owns the surface
// THE PLAYOFF-ODDS / RISK-POSTURE WIDGET — A dispatch, 2026-08-19; P103
// graded TRUE (beats the constant-odds baseline on all three hindcast
// seasons). The feed does not exist until week 1 has a realized result
// (write_live() refuses loudly pre-season, on purpose), so the widget's
// FIRST job is degrading cleanly to "not available" — that is the normal
// state through the entire draft, not an edge case.
//
// Run: node draft/tests/playoff_odds_widget.test.js
'use strict';
const P = require('../../src/playoffOdds');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

// ── availability contract: never throws, degrades cleanly ───────────────────
ck('null feed (the entire pre-season/pre-draft state) -> not available, no throw',
  P.playoffOddsWidget(null, '1').available === false);
ck('missing per_seat -> not available', P.playoffOddsWidget({}, '1').available === false);
ck('no roster id resolved -> not available',
  P.playoffOddsWidget({ per_seat: { 1: { p_playoffs: 0.5 } } }, null).available === false);
ck('roster id not present in the feed -> not available (not a crash, not a guess)',
  P.playoffOddsWidget({ per_seat: { 1: { p_playoffs: 0.5 } } }, '99').available === false);
ck('a cell with no p_playoffs -> not available',
  P.playoffOddsWidget({ per_seat: { 1: { E_total: 400 } } }, '1').available === false);

// ── the real shape, from A's write_live() (season_forward_inseason.py) ─────
{
  const feed = {
    season: 2026, as_of_week: 8, n_worlds: 4000,
    per_seat: { '3': { p_playoffs: 0.72, E_total: 460.19, p5: 200, p95: 950 } },
  };
  const w = P.playoffOddsWidget(feed, '3');
  ck('available:true with a real cell', w.available === true);
  ck('as_of_week carried through (the widget must say WHICH week this is)', w.asOfWeek === 8);
  ck('pPlayoffsPct is a rounded whole percent, not a raw fraction on screen', w.pPlayoffsPct === 72);
  ck('the $ band (p5/p95) is carried through untouched', w.p5 === 200 && w.p95 === 950);
  ck('E_total carried through', w.eTotal === 460.19);
  ck('week-over-week move is explicitly null (the feed overwrites, does not append — '
    + 'flagged B -> A, ROUTES.md 2026-08-18)', w.weekOverWeek === null);
}

// ── posture: the thresholds, and that copy always matches the classification ──
{
  ck('posture: >=65% is comfortable', P.posture(0.65) === 'comfortable' && P.posture(0.9) === 'comfortable');
  ck('posture: 25-64% is bubble', P.posture(0.25) === 'bubble' && P.posture(0.64) === 'bubble');
  ck('posture: <25% is chasing', P.posture(0.24) === 'chasing' && P.posture(0) === 'chasing');
  ck('posture: null input -> null, not a throw or a guessed default', P.posture(null) === null);

  for (const p of [0.9, 0.5, 0.1]) {
    const w = P.playoffOddsWidget({ as_of_week: 1, per_seat: { 1: { p_playoffs: p, E_total: 0, p5: 0, p95: 0 } } }, '1');
    ck('  posture ' + w.posture + ' (p=' + p + ') carries copy text, not a bare label',
      typeof w.postureCopy === 'string' && w.postureCopy.length > 10);
    ck('  ...and postureCopy matches P.POSTURE_COPY[posture] exactly (no drift between the two)',
      w.postureCopy === P.POSTURE_COPY[w.posture]);
  }
}

// ── myRosterId: the sleeper_map inverse lookup ──────────────────────────────
{
  const map = { '1': '501', '2': '502', '3': '503' };
  ck('myRosterId: finds the roster whose mapped owner matches', P.myRosterId(map, 502) === '2');
  ck('myRosterId: type-tolerant (owner id as number vs string in the map)', P.myRosterId(map, '502') === '2');
  ck('myRosterId: unmapped owner -> null, not a throw', P.myRosterId(map, 999) === null);
  ck('myRosterId: empty/missing map -> null', P.myRosterId({}, 502) === null && P.myRosterId(null, 502) === null);
  ck('myRosterId: null owner id -> null', P.myRosterId(map, null) === null);
}

// ── WIRING: the route actually reads the feed and calls the widget ─────────
{
  const fs = require('fs');
  const path = require('path');
  const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'routes', 'member.js'), 'utf8');
  ck('member.js reads season_forward_live.json', /season_forward_live\.json/.test(SRC));
  ck('...wrapped in try/catch (a missing pre-season file must not break the home page)',
    /catch \(e\) \{ \/\* pre-season/.test(SRC));
  ck('...and calls playoffOddsWidget with the resolved roster id', /PLOFF\.playoffOddsWidget\(feed, rid\)/.test(SRC));
  ck('...and the result reaches the render call', /playoffOdds,/.test(SRC));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
