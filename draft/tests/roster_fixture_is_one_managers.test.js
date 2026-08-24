// TERRITORY: A
/* NO SUITE MAY HAND THE ENGINE A ROSTER BIGGER THAN ONE MANAGER CAN HOLD.
 *
 * Register 303. `_empty_roster_fiction_precondition.js` exists to give every
 * suite ONE definition of "Cory's real roster", and after the 08-23 keeper lock
 * it was handing them all twenty-three players belonging to ten managers. The
 * damage was measured — the top-1 recommendation moves at 5 of Cory's 12 picks
 * between that fixture and his actual three — but the reason it survived for
 * days is the part this file exists for:
 *
 *     FOUR OF THE SIX SUITES USING IT WERE PASSING.
 *
 * A wrong roster does not go red. It quietly answers a different question, and
 * answers it consistently, so every run agrees with every other run. It was
 * found by a sweep, and a sweep is a thing a person remembers to do. Register
 * 300's whole lesson is that the mechanism is what survives; the human noticing
 * is what does not.
 *
 * WHAT THIS ASSERTS, and why it is cheap enough to keep: a keeper roster is
 * capped by `league.keeper_rules.count`, so any fixture that hands more than
 * that many KEPT players to a single `ctx.roster` is describing a manager who
 * cannot exist. That is a property of the artifact and the league rules, not of
 * any one suite, so it holds no matter how many suites come and go.
 *
 * ⚠️ IT DOES NOT CATCH EVERYTHING, AND SAYING SO IS THE POINT. It checks the
 * SHARED derivation and the artifact it reads. A suite that builds its own
 * unfiltered copy inline — which `mlv_never_recommends_a_taken_player` did, and
 * which is how this whole thread started — is caught only by the static sweep
 * below, which is a grep and can be fooled. The 33-suite classification in
 * register 303's action is still owed; this is the floor, not the ceiling.
 *
 * Run: node draft/tests/roster_fixture_is_one_managers.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const R = require('./_empty_roster_fiction_precondition.js');
const D = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else {
    fail++;
    console.log('FAIL  ' + n + (d !== undefined
      ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : ''));
  }
};

const CAP = +(((D.league || {}).keeper_rules || {}).count || 0);
const ALL = (D.kept_players || []);
const MY_SLOT = String((D.league || {}).my_draft_slot);

// ── CONTROLS FIRST: this file is worthless if the inputs are not what it thinks
ck('CONTROL — the league declares a keeper cap, or there is no bar to check '
  + 'against and every assertion below is vacuous', CAP > 0, { cap: CAP });
ck('CONTROL — the artifact carries MORE keepers than one manager may hold, so '
  + 'an unfiltered fixture is genuinely distinguishable from a filtered one. '
  + 'Before the 08-23 lock this control would have FAILED, correctly: the bug '
  + 'was undetectable then because the two sets were identical.',
ALL.length > CAP, { league_wide: ALL.length, cap: CAP });
ck('CONTROL — the board names my seat, or the filter has nothing to filter on',
  MY_SLOT && MY_SLOT !== 'undefined', { my_draft_slot: MY_SLOT });

// ── THE PROPERTY
const mine = R.realRoster();
ck('the SHARED fixture returns one manager\'s roster, not the league\'s',
  mine.length <= CAP && mine.length > 0,
  { returned: mine.length, cap: CAP, league_wide: ALL.length,
    who: mine.map(p => p.name) });
ck('...and it is MY seat\'s, not some other manager\'s — a filter on the wrong '
  + 'slot would also return three',
mine.every(p => {
  const src = ALL.find(k => String(k.player_id) === String(p.player_id));
  return src && String(src.team_slot) === MY_SLOT;
}), mine.map(p => {
  const src = ALL.find(k => String(k.player_id) === String(p.player_id));
  return p.name + '@' + (src ? src.team_slot : '?');
}));

// ── THE ESCAPE HATCH STILL WORKS, AND IS EXPLICIT
const all = R.realRoster({ allSeats: true });
ck('a caller that genuinely wants every manager\'s keepers must ASK for them, '
  + 'and gets them', all.length === ALL.length, { allSeats: all.length });

// ── FAIL ARM: the guard must be able to go red
/* A control that cannot fail converts an assumption into a number people then
 * trust — GRADING-POLICY §3, and the reason this arm exists. */
{
  const overCap = all.length > CAP;
  ck('FAIL ARM — feeding the league-wide set to this same bar DOES trip it, so '
    + 'the assertion above is load-bearing rather than decorative',
  overCap, { league_wide: all.length, cap: CAP });
}

// ── STATIC SWEEP: an inline copy of the unfiltered derivation
/* This is a grep and it can be fooled — a suite could build the roster in a way
 * this pattern does not match. Reported as a WARNING rather than a failure for
 * exactly that reason: a fuzzy check that reds the build teaches people to
 * silence it, and a silenced check is the inert class all over again. */
{
  const dir = path.join(ROOT, 'draft', 'tests');
  const suspects = [];
  fs.readdirSync(dir).filter(f => f.endsWith('.test.js')).forEach(f => {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    // a roster built straight off kept_players, with no seat filter anywhere
    if (/kept_players[^\n]*\.map\(/.test(src)
        && !/team_slot|my_draft_slot|MY_SLOT|MYSLOT|realRoster/.test(src)) {
      suspects.push(f);
    }
  });
  if (suspects.length) {
    console.log('      ⚠️ WARNING (not a failure — this pattern is fuzzy): '
      + suspects.length + ' suite(s) map kept_players with no seat filter and '
      + 'no realRoster() call. Classify each as LOOKUP (fine) or ROSTER '
      + '(needs the filter) — register 303: ' + suspects.join(', '));
  } else {
    console.log('      no suite maps kept_players without a seat filter '
      + '(pattern-based, see the caveat in this block)');
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('FAILED'); process.exit(1); }
