/* PICK RECONCILE (feature A) — Sleeper-authoritative diff + last-mark revert.
 * Run: node draft/tests/pickreconcile.test.js
 */
'use strict';
const R = require('../../public/js/draft/pickreconcile.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

const pick = (id, slot) => ({ player_id: id, draft_slot: slot });

// My seat = slot 3. Sleeper says I took A and B. Keeper K.
const sleeper = [pick('A', 3), pick('B', 3), pick('X', 5), pick('Y', 7)];

// --- clean case: my marks match Sleeper -------------------------------------
{
  const r = R.reconcileMine(['A', 'B'], sleeper, 3, ['K']);
  check('a matching local state reconciles clean', r.clean && r.misMarks.length === 0 && r.missing.length === 0,
    JSON.stringify(r));
  check('authoritativeMine is what Sleeper says my seat took', r.authoritativeMine.sort().join() === 'A,B');
}

// --- mis-mark: I marked C (Sleeper never gave me C) -> remove -----------------
{
  const r = R.reconcileMine(['A', 'B', 'C'], sleeper, 3, ['K']);
  check('a mis-marked pick Sleeper does not confirm is a misMark', r.misMarks.join() === 'C', JSON.stringify(r));
  check('...and the state is not clean', !r.clean);
}

// --- missing: Sleeper gave me B but I never marked it -> add ------------------
{
  const r = R.reconcileMine(['A'], sleeper, 3, ['K']);
  check('a Sleeper pick I never marked is missing (to add)', r.missing.join() === 'B', JSON.stringify(r));
}

// --- keepers are never mis-marks and never re-added ---------------------------
{
  // I "marked" my keeper K locally; Sleeper's draft picks never include it.
  const r = R.reconcileMine(['A', 'B', 'K'], sleeper, 3, ['K']);
  check('a keeper marked locally is NOT flagged a mis-mark', r.misMarks.length === 0, JSON.stringify(r));
  check('a keeper is never in the missing/add set', r.missing.indexOf('K') < 0);
}

// --- last-mark revert: the most recent LOCAL mark ----------------------------
{
  const feed = [{ player_id: 'A' }, { player_id: 'X' }, { player_id: 'C' }];  // X is an opponent's
  check('lastMark returns the most recent of MY marks', R.lastMark(feed, ['A', 'C']) === 'C');
  check('lastMark skips opponent picks in the feed', R.lastMark([{ player_id: 'X' }], ['A', 'C']) === null);
  check('lastMark on an empty feed is null', R.lastMark([], ['A']) === null);
}

console.log(`\n${pass}/${pass + fail} pick-reconcile checks passed`);
process.exit(fail ? 1 : 0);
