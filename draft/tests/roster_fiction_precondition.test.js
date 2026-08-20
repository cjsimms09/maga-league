/* THE EMPTY-ROSTER FICTION IS RETIRED, AND THE GUARD THAT RETIRED IT.
 *
 * Register E31 admitted `roster: []` fixtures on ONE condition: that every
 * roster-reading term was weighted zero, so the fiction could not hide a live
 * signal. Register 160 moved `need` to 1.0. The condition failed.
 *
 * This suite used to assert "the shipped weights PASS the precondition". That
 * sentence is now false, and the honest move is to pin the new truth rather
 * than to relax the guard — so it asserts the guard FIRES, and then proves the
 * firing was warranted by showing the fiction changing a real recommendation.
 *
 * Cory, 2026-08-20: "I do feel like we need to rerun roster test and other
 * model test as previous runs would've been flawed."
 *
 * Run: node draft/tests/roster_fiction_precondition.test.js
 */
'use strict';
const G = require('./_empty_roster_fiction_precondition.js');
const { assertRosterFictionPrecondition, realRoster, fictionIsLegal } = G;

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 300) : ''))); };

global.window = global;
const E = require('../../public/js/draft/engine.js');

/* ── 1. THE CONDITION HAS FAILED, AND THE GUARD SAYS SO ───────────────────── */
{
  let threw = false, msg = '';
  try { assertRosterFictionPrecondition(E); } catch (e) { threw = true; msg = e.message; }
  ck('the shipped weights NO LONGER pass — the fiction is illegal and the guard '
    + 'is the thing that noticed', threw, { threw: threw });
  ck('and it names `need` as the reason, so the next reader does not have to '
    + 'go looking for which term moved', threw && /need=/.test(msg), msg.slice(0, 160));
  ck('the message tells a tripped suite what to DO (use realRoster) rather than '
    + 'only what is wrong', /realRoster/.test(msg), msg.slice(0, 240));
  ck('fictionIsLegal() reports the same verdict without throwing',
    fictionIsLegal(E) === false);
}

/* KNOWN POSITIVE — without this, check 1 passes on a guard that throws on
 * EVERYTHING, which would be indistinguishable from a guard that works. */
{
  const zeroed = Object.assign({}, E, { MEASURED_WEIGHTS:
    Object.assign({}, E.MEASURED_WEIGHTS, { need: 0, bye: 0, risk: 0 }) });
  let threw = false;
  try { assertRosterFictionPrecondition(zeroed); } catch (e) { threw = true; }
  ck('KNOWN POSITIVE: zero out need/bye/risk and the SAME guard passes — so the '
    + 'throw above is a verdict on the weights, not a guard that always throws',
  !threw && fictionIsLegal(zeroed) === true);
}

/* ── 2. FAIL ARMS: each roster-reading term is independently caught ───────── */
['need', 'bye', 'risk'].forEach(term => {
  const base = Object.assign({}, E.MEASURED_WEIGHTS, { need: 0, bye: 0, risk: 0 });
  base[term] = 1;
  const fake = Object.assign({}, E, { MEASURED_WEIGHTS: base });
  let threw = false, msg = '';
  try { assertRosterFictionPrecondition(fake); } catch (e) { threw = true; msg = e.message; }
  ck('FAIL ARM: ' + term + ' alone going non-zero is caught',
    threw && msg.indexOf(term) !== -1, msg.slice(0, 140));
});

{
  let threw = false;
  try { assertRosterFictionPrecondition({}); } catch (e) { threw = true; }
  ck('FAIL ARM: an engine with no MEASURED_WEIGHTS export throws rather than '
    + 'silently reporting safe', threw);
}

/* ── 3. THE KEEPER TERM IS STILL NOT CERTIFIED SAFE ───────────────────────── */
{
  const zeroed = Object.assign({}, E, { MEASURED_WEIGHTS:
    Object.assign({}, E.MEASURED_WEIGHTS, { need: 0, bye: 0, risk: 0 }) });
  const r = assertRosterFictionPrecondition(zeroed);
  ck('even on a vector that passes, the guard does not claim keeper is safe — '
    + 'it reports the measured ceiling instead of asserting a false zero',
  r.keeper_weight === 1 && typeof r.keeper_known_ceiling === 'number'
    && r.keeper_known_ceiling > 2.0, r);
}

/* ── 4. THE REPLACEMENT FIXTURE ───────────────────────────────────────────── */
{
  const roster = realRoster();
  ck('realRoster() returns Cory\'s actual keepers', roster.length === 3,
    roster.map(r => r.name));
  ck('...with the fields the engine actually reads — a roster of names scores '
    + 'nothing', roster.every(r => r.player_id && r.position && r.proj_mean != null),
  roster);
  ck('...and marked as keepers, which the keeper term reads',
    roster.every(r => r.is_keeper === true));
}

/* THE REFUSAL IS THE POINT. A fixture helper that quietly returns [] when the
 * board is missing would put the fiction back in the one file written to
 * remove it, and every suite would go green on it. */
{
  const G2 = require('./_empty_roster_fiction_precondition.js');
  let threw = false, msg = '';
  const real = require('fs').readFileSync;
  require('fs').readFileSync = function (p) {
    if (String(p).indexOf('draft_data.json') >= 0) throw new Error('gone');
    return real.apply(this, arguments);
  };
  try { delete require.cache[require.resolve('./_empty_roster_fiction_precondition.js')];
    require('./_empty_roster_fiction_precondition.js').realRoster();
  } catch (e) { threw = true; msg = e.message; }
  require('fs').readFileSync = real;
  ck('KNOWN NEGATIVE: with the board unreadable, realRoster() REFUSES rather '
    + 'than handing back the fiction', threw && /roster: \[\]/.test(msg),
  msg.slice(0, 200));
  void G2;
}

/* ── 5. THE FIRING WAS WARRANTED — the fiction really does change a pick ──── */
/* Doctrine is not evidence. This runs the production scorer both ways and
 * requires the difference to be visible, so nobody can retire this guard on
 * the grounds that it was theoretical. */
{
  const fs = require('fs'), path = require('path');
  const D = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', '..', 'public', 'draft_data.json'), 'utf8'));
  const board = D.players.filter(p => p.position && p.proj_mean != null);
  const mk = r => ({ board: board, roster: r, league: D.league, currentPick: 33,
    nextPick: 48, totalPicks: 150, myPicksLeft: 12, roundsLeft: 12,
    runMultipliers: {}, intervening: [] });
  const fiction = E.recommend(mk([]));
  const truth = E.recommend(mk(realRoster()));
  const fName = fiction && fiction[0] && fiction[0].player.name;
  const tName = truth && truth[0] && truth[0].player.name;
  ck('CONTROL: both arms actually produced a recommendation',
    !!fName && !!tName, { fiction: fName, truth: tName });
  ck('THE FICTION CHANGES THE ANSWER at pick 33 — this is why the guard throws',
    fName !== tName, { 'roster: []': fName, 'real keepers': tName });

  const byId = {};
  truth.forEach(r => { byId[String(r.player.player_id)] = r.score; });
  let maxd = 0;
  fiction.slice(0, 20).forEach(r => {
    const o = byId[String(r.player.player_id)];
    if (typeof o === 'number') maxd = Math.max(maxd, Math.abs(o - r.score));
  });
  ck('and it moves scores by more than deviation.js\'s MATERIAL bar of 2.0, so '
    + 'the change is not a rounding artefact', maxd > 2.0, { maxScoreDelta: +maxd.toFixed(2) });
  console.log('\n    pick 33 under the fiction : ' + fName);
  console.log('    pick 33 on the real roster: ' + tName);
  console.log('    max score delta in top 20 : ' + maxd.toFixed(2));
}

/* ── 6. THE OPPONENT-SIDE FICTION IS SCOPED, NOT ASSUMED ──────────────────── */
/* `intervening: [{ roster: [] }]` is STILL used, deliberately. It survives on a
 * measurement, and the measurement is carried as data so a reader can check it
 * rather than trust a comment. */
{
  const O = G.OPPONENT_ROSTER_FICTION;
  ck('the opponent-roster fiction carries its own measurement', !!O && O.observations > 0);
  ck('...and the measurement says it is inert for RB and WR — which is every '
    + 'decision Cory makes before round 13',
    O.by_position.RB[0] === 0 && O.by_position.WR[0] === 0, O.by_position);
  ck('...and material only for the onesies, where it OVER-states survival',
    O.by_position.K[0] > 0 && O.by_position.DEF[0] > 0
    && /OVER-states/.test(O.direction), O.direction);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
