/* SHADOWS MUST NOT DRAFT GHOSTS.
 *
 * Reported from a rehearsal: shadow rosters contained players already taken,
 * which makes the counterfactual fictional — Phase H only means something if
 * the shadow team COULD have been drafted.
 *
 * Diagnosis: shadows.js itself was correct. Handed a properly filtered board it
 * produced 0 duplicates and 0 unavailable picks across 42 picks and 7
 * strategies. The fault was upstream — `state.board` rebuilds from
 * `state.drafted`, and seatless "✕" marks never entered that set, so a rebuild
 * resurrected every hand-marked opponent pick. Fixed in attribution.markLocal.
 *
 * These are the assertions that keep it fixed, plus the availability gate that
 * makes shadows answer "is he available?" from the SAME drafted set the board
 * does rather than a private copy.
 *
 * Run: node draft/tests/shadow-availability.test.js
 */
'use strict';
const S = require('../../public/js/draft/shadows.js');

let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d ? '  -> ' + d : '')); } };

const POS = ['RB', 'WR', 'QB', 'TE', 'K', 'DEF'];
const mk = (id, pos, v) => ({ player_id: String(id), name: 'P' + id, position: pos,
  vorp: v, proj_mean: 100 + v, adjusted_adp: 200 - v, raw_adp: 200 - v,
  adp_sd: 5, adp_source: 'ffc', proj_ceiling: 120 + v, proj_floor: 80, proj_sd: 20 });
const fullBoard = () => Array.from({ length: 120 }, (_, i) =>
  mk(i + 1, POS[(i + 1) % 6], 120 - (i + 1) * 0.7));
const league = { teams: 10, starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 } };
const ctxAt = pick => ({ league, currentPick: pick, nextPick: pick + 13, roster: [],
  totalPicks: 150, roundsLeft: 14, intervening: [], format: {} });

/** Run six of my picks, with the room taking 9 more between each. */
function playDraft(opts) {
  const o = opts || {};
  const board = fullBoard();
  const sh = S.create({ rehearsal: true, rounds: 15, built_at: '2026-08-08T00:00:00Z' });
  const drafted = new Set();
  const picks = [];
  const boardsSeen = [];
  for (let r = 1; r <= 6; r++) {
    const live = board.filter(p => !drafted.has(String(p.player_id)));
    // THE CORRUPTION UNDER TEST: a caller handing over a STALE pool — exactly
    // what a resurrected board looked like before markLocal was fixed.
    const handed = o.handStaleBoard ? board.slice() : live.slice();
    boardsSeen.push(new Set(live.map(p => String(p.player_id))));
    const got = S.onMyPick(sh, handed, ctxAt(r * 10), r,
                           o.withoutDraftedSet ? null : drafted);
    got.forEach(g => picks.push(Object.assign({ round: r }, g)));
    live.slice(0, 10).forEach(p => drafted.add(String(p.player_id)));
  }
  return { sh, picks, boardsSeen };
}

// --- the happy path, and a NON-VACUITY check on the fixture ------------------
{
  const { sh, picks, boardsSeen } = playDraft();
  check('the fixture actually exercised the shadows (non-vacuity)',
    picks.length >= 30, 'picks=' + picks.length);

  const byStrat = {};
  picks.forEach(p => { (byStrat[p.strategy] = byStrat[p.strategy] || []).push(p); });
  check('every shadow drafted (non-vacuity: more than one strategy ran)',
    Object.keys(byStrat).length >= 5, Object.keys(byStrat).join(','));

  // ASSERTION 1 — distinct players within each roster
  const dupes = Object.keys(byStrat).filter(k => {
    const ids = byStrat[k].map(p => p.player_id);
    return new Set(ids).size !== ids.length;
  });
  check('every shadow roster contains DISTINCT players',
    !dupes.length, dupes.join(','));

  // ASSERTION 2 — nobody picked a player already gone at that pick
  const ghosts = picks.filter(p => !boardsSeen[p.round - 1].has(p.player_id));
  check('no shadow drafted a player already taken at or before that pick',
    !ghosts.length, ghosts.slice(0, 4).map(g => g.strategy + ':' + g.name).join(' '));

  // ASSERTION 3 — the right number of slots
  Object.keys(byStrat).forEach(k => {
    if (byStrat[k].length !== 6) {
      check('shadow ' + k + ' filled exactly one slot per my-pick', false,
        byStrat[k].length + ' picks for 6 of my picks');
    }
  });
  check('every shadow filled exactly one slot per pick of mine',
    Object.keys(byStrat).every(k => byStrat[k].length === 6),
    JSON.stringify(Object.fromEntries(Object.keys(byStrat).map(k => [k, byStrat[k].length]))));

  check('a clean board rejects nothing (the gate is not firing spuriously)',
    !sh.rejected, 'rejected=' + sh.rejected);
}

// --- THE GATE BITES: hand it the corrupted board the bug actually produced ---
{
  const { sh, picks, boardsSeen } = playDraft({ handStaleBoard: true });
  const ghosts = picks.filter(p => !boardsSeen[p.round - 1].has(p.player_id));
  check('handed a RESURRECTED board, the gate still keeps shadows off ghosts',
    !ghosts.length, ghosts.slice(0, 4).map(g => g.strategy + ':' + g.name).join(' '));
  check('...and it COUNTS what it rejected rather than silently repairing',
    sh.rejected > 0, 'rejected=' + sh.rejected);
}

// --- NON-VACUITY OF THE GATE ITSELF -----------------------------------------
// Without the drafted set, a stale board DOES produce ghosts. If this stops
// failing, the fixture has stopped reproducing the bug and the test above
// proves nothing.
{
  const { picks, boardsSeen } = playDraft({ handStaleBoard: true, withoutDraftedSet: true });
  const ghosts = picks.filter(p => !boardsSeen[p.round - 1].has(p.player_id));
  check('NON-VACUITY: without the drafted set, the stale board DOES yield ghosts',
    ghosts.length > 0,
    'the fixture no longer reproduces the bug — the gate test above is vacuous');
}

console.log(`\n${pass}/${pass + fail} shadow-availability checks passed`);
process.exit(fail ? 1 : 0);
