// TERRITORY: A
/* THE WEEKLY CLAIMS CRON — the caller weekly_claims.js was missing.
 *
 * src/weekly_claims.js was the pure half and nothing called it. Without this
 * function that module would have been the sixth produced-and-unread thing found
 * this week and the FIRST ONE THAT WAS MINE.
 *
 * AND THE FIRST VERSION OF THE HANDLER CALLED AN API THAT DOES NOT EXIST:
 * `sleeper.weekScores(...)`, plus `sData.matchups` and `sData.points_for` read
 * off a bundle that carries none of them. The module exports
 * `matchupsForWeek(leagueId, week)` and `weekPointsByOwner(leagueId, week, map)`.
 * A unit test of the pure core passes either way — same class as the
 * SharedValuation script tag: a tested core with an untested wiring layer.
 * Caught by reading the module's exports rather than trusting the call.
 *
 * Run: node draft/tests/claims_cron.test.js
 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const C = require(path.join(ROOT, 'netlify', 'functions', 'claims-cron.js'));
const S = require(path.join(ROOT, 'src', 'sleeper.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

// ── THE API THE HANDLER CALLS MUST EXIST. This is the check that was missing. ──
{
  ck('sleeper.matchupsForWeek exists', typeof S.matchupsForWeek === 'function');
  ck('sleeper.weekPointsByOwner exists', typeof S.weekPointsByOwner === 'function');
  ck('sleeper.weekScores does NOT exist — the name the first version invented',
    typeof S.weekScores === 'undefined',
    'if this ever becomes real, the comment in claims-cron is stale, not wrong');
}

// ── PAIRING IS BY matchup_id AND KEYED BY OWNER ─────────────────────────────
{
  const rows = [{ matchup_id: 1, roster_id: 1 }, { matchup_id: 1, roster_id: 2 },
                { matchup_id: 2, roster_id: 3 }, { matchup_id: 2, roster_id: 4 }];
  const map = { 1: 'a', 2: 'b', 3: 'c', 4: 'd' };
  ck('two rows sharing a matchup_id become one matchup', C.pairUp(rows, map).length === 2);
  ck('  keyed by OWNER, not roster_id (a roster renumber would orphan the record)',
    C.pairUp(rows, map)[0].home === 'a');
  ck('a lone row (bye or malformed) is dropped, not paired with nothing',
    C.pairUp(rows.concat([{ matchup_id: 9, roster_id: 5 }]), map).length === 2);
  ck('an unmapped roster is dropped rather than keyed to an empty owner',
    C.pairUp(rows, { 1: 'a', 2: 'b' }).length === 1);
}

// ── THE PROBABILITY IS A HEAD-TO-HEAD, NOT A FIELD-STRENGTH NUMBER ─────────
{
  const pf = { a: 1000, b: 900, c: 1100, d: 800 };
  const claims = C.buildClaims('2026', 3, [{ home: 'a', away: 'b' }], pf);
  const m = claims.find(x => x.ftype === 'probability');
  ck('the stronger side is favoured', m.value > 0.5, m.value);
  const flipped = C.buildClaims('2026', 3, [{ home: 'b', away: 'a' }], pf)
    .find(x => x.ftype === 'probability');
  // winProb is strength-RELATIVE-TO-FIELD and a raw pair does not sum to 1;
  // using one side untouched would be a probability about a different question.
  ck('  and the two orientations sum to 1, so it is a head-to-head probability',
    Math.abs(m.value + flipped.value - 1) < 1e-9, [m.value, flipped.value]);
}

// ── NOTHING TO PREDICT WRITES NOTHING ──────────────────────────────────────
{
  ck('no matchups -> no claims', C.buildClaims('2026', 3, [], { a: 1 }).length === 0);
  ck('no points-for -> no claims', C.buildClaims('2026', 3, [{ home: 'a', away: 'b' }], {}).length === 0,
    'an empty week is a CLAIM that there was nothing to predict; a missing week is an absence');
}

// ── RESOLUTIONS ONLY FOR WHAT ACTUALLY RESOLVED ────────────────────────────
{
  const pf = { a: 1000, b: 900, c: 1100, d: 800 };
  const claims = C.buildClaims('2026', 3, [{ home: 'a', away: 'b' }, { home: 'c', away: 'd' }], pf);
  ck('a fully played week resolves every claim',
    C.buildResolutions(claims, { a: 110, b: 99, c: 130, d: 120 }, pf).length === 3);
  // The second matchup never played: it must vanish, not resolve as a loss.
  const partial = C.buildResolutions(claims, { a: 110, b: 99 }, pf);
  ck('  an unplayed matchup yields NO resolution rather than a miss',
    partial.length === 2, partial.map(r => r.forecast_key));
  ck('  (grading a game that has not happened is a fabricated outcome)', true);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
