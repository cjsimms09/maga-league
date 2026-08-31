/* TERRITORY: A
 *
 * THE ROSTER BUILDER MODEL MUST NOT NAME A PLAYER WHO IS ALREADY GONE.
 *
 * Cory, 2026-08-20, from a rehearsal: "Roster builder model is recommending
 * players that are already gone."
 *
 * Reproduced immediately: `RosterBuilderMLV.recommend()` iterated whatever array
 * it was handed and had NO concept of a drafted player. Every caller passed
 * `state.board`, which the app does prune on each pick — so the module's
 * correctness rested entirely on every present and future caller having pruned
 * first. app.js's own comment beside this panel says the opposite: "no model
 * here can name an illegal pick". A player already taken is an illegal pick.
 *
 * The guard now lives in the module, where a caller cannot bypass it, and it
 * COUNTS what it drops rather than filtering silently — silence would fix the
 * symptom and bury the cause.
 *
 * Run: node draft/tests/mlv_never_recommends_a_taken_player.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
global.window = global;
const MLV = require(path.join(ROOT, 'public', 'js', 'draft', 'mlv.js'));
const APP = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');

let pass = 0;
const fails = [];
const check = (n, ok, d) => {
  if (ok) { pass++; return; }
  fails.push(n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 240) : ''));
};

const D = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const board = D.players.filter(p => p.position && p.proj_mean != null);
/* ⚠️ FILTERED TO CORY'S SEAT — the same league-wide-slate correction as
 * apply_slot_load_path / seat_pick_order / slot_schedule (A, 2026-08-24,
 * register 300). Post-lock (08-23) `kept_players` holds all 23 of the league's
 * keepers, and this file feeds `roster` to MLV.recommend as MY roster — so it
 * was telling the recommender Cory owns twenty-three players including nine
 * other managers' keepers. The suite says so itself four checks down: "a
 * player already on Cory's OWN roster". Wrong on the merits, not just for the
 * assertion: a 23-man roster fills every starter seat, so `need` reads zero
 * everywhere and the recommendations under test were never the real ones. */
const MY_SLOT = String((D.league || {}).my_draft_slot);
const roster = (D.kept_players || [])
  .filter(k => String(k.team_slot) === MY_SLOT)
  .map(k => ({
    player_id: k.player_id, name: k.name, position: k.position, proj_mean: k.proj_mean }));
const LEAGUE = D.league;

check('CONTROL — a real board and a real roster to work from',
  board.length > 300 && roster.length === 3,
  { board: board.length, roster: roster.length,
    league_wide_keepers: (D.kept_players || []).length, my_slot: MY_SLOT });

/* ── 1. THE BASELINE: with nothing taken, it recommends normally ─────────── */

const baseline = MLV.recommend(board, roster, { league: LEAGUE, topN: 5 });
check('with nothing taken it still returns a full list',
  baseline.length === 5, baseline.length);
check('and drops nothing', baseline._taken_filtered === 0, baseline._taken_filtered);

/* ── 2. THE DEFECT CORY SAW ──────────────────────────────────────────────── */

const topIds = baseline.map(r => String(r.player.player_id));
const topNames = baseline.map(r => r.player.name);

{
  /* Take the exact players it just recommended and ask again, WITHOUT pruning
   * the board — which is precisely the situation Cory hit. */
  const taken = new Set(topIds.slice(0, 3));
  const after = MLV.recommend(board, roster, { league: LEAGUE, topN: 5, taken: taken });
  const named = after.map(r => String(r.player.player_id));
  check('THE FIX: a taken player is never recommended, even when the board '
    + 'handed in still contains him',
    named.every(id => !taken.has(id)),
    after.filter(r => taken.has(String(r.player.player_id))).map(r => r.player.name));
  check('and the list is still full — it backfills rather than shrinking',
    after.length === 5, after.length);
  check('the drop is COUNTED, so an upstream staleness cannot hide behind the fix',
    after._taken_filtered === 3, after._taken_filtered);
  check('and the dropped players are NAMED',
    (after._taken_names || []).length === 3
    && after._taken_names.every(n => topNames.indexOf(n) >= 0),
    after._taken_names);
}

/* KNOWN NEGATIVE: without the guard the same call returns them. This is the
 * defect itself, reproduced, so the check above cannot be vacuous. */
{
  const after = MLV.recommend(board, roster, { league: LEAGUE, topN: 5 });
  check('KNOWN NEGATIVE: with no `taken` passed, the module still returns those '
    + 'same players — which is exactly what Cory saw',
    after.map(r => String(r.player.player_id)).slice(0, 3).join() === topIds.slice(0, 3).join());
}

/* ── 3. A PLAYER ALREADY ON HIS OWN ROSTER IS TAKEN TOO ──────────────────── */
{
  const mine = roster.concat([{ player_id: baseline[0].player.player_id,
    name: baseline[0].player.name, position: baseline[0].position,
    proj_mean: baseline[0].player.proj_mean }]);
  const after = MLV.recommend(board, mine, { league: LEAGUE, topN: 5 });
  check('a player already on Cory\'s OWN roster is never recommended to him '
    + 'again — the roster is right there and needs no caller to remember',
    after.every(r => String(r.player.player_id) !== String(baseline[0].player.player_id)),
    after.map(r => r.player.name));
}

/* ── 4. THE SHAPES A CALLER MIGHT ACTUALLY HOLD ──────────────────────────── */
{
  const id = topIds[0];
  const shapes = {
    'Set (what state.drafted is)': new Set([id]),
    'Array': [id],
    'object map': (function () { const o = {}; o[id] = true; return o; }()),
    'Set of numbers': new Set([Number(id)].filter(n => !isNaN(n))),
  };
  Object.keys(shapes).forEach(label => {
    const t = shapes[label];
    if (label === 'Set of numbers' && !t.size) return;   // non-numeric ids
    const after = MLV.recommend(board, roster, { league: LEAGUE, topN: 5, taken: t });
    check('taken accepts a ' + label + ' — refusing a shape just invites a '
      + 'caller to convert it wrongly',
      after.every(r => String(r.player.player_id) !== id), label);
  });
}

/* ── 5. IT DEGRADES SAFELY ───────────────────────────────────────────────── */
check('no `taken` at all behaves exactly as before (every existing caller safe)',
  MLV.recommend(board, roster, { league: LEAGUE, topN: 3 }).length === 3);
check('an empty Set changes nothing',
  MLV.recommend(board, roster, { league: LEAGUE, topN: 3, taken: new Set() })
    ._taken_filtered === 0);
check('a null taken does not throw',
  MLV.recommend(board, roster, { league: LEAGUE, topN: 3, taken: null }).length === 3);

/* ── 6. THE CALLERS ACTUALLY PASS IT ─────────────────────────────────────── */

/* ⚠️ COUNTED AGAINST THE CALL SITES, NOT AGAINST A LITERAL. This asserted
 * `=== 2` and went red the moment a third caller was added — by me, hours
 * later, WITH the guard correctly passed. A test that fails when someone does
 * the right thing teaches people to edit the test, which is how the next real
 * failure gets edited away too. The invariant is "every call site passes it". */
check('EVERY app.js caller passes state.drafted — a guard nobody invokes is not '
  + 'a guard',
(APP.match(/taken: state\.drafted/g) || []).length
  === (APP.match(/RosterBuilderMLV\.recommend\(/g) || []).length,
{ withTaken: (APP.match(/taken: state\.drafted/g) || []).length,
  callSites: (APP.match(/RosterBuilderMLV\.recommend\(/g) || []).length });
check('every RosterBuilderMLV.recommend call site passes `taken`',
  (APP.match(/RosterBuilderMLV\.recommend\(/g) || []).length
  === (APP.match(/taken: state\.drafted/g) || []).length,
{ calls: (APP.match(/RosterBuilderMLV\.recommend\(/g) || []).length });

/* ⚠️ THE PANEL THAT USED TO SURFACE THIS IS RETIRED, 2026-08-21 — Cory:
 * "I'm also very confused at parts below that show roster builder model,
 * remove that from site." renderRosterBuilderPanel() (the "Roster builder
 * model says" panel, the only place `_taken_filtered` ever reached a
 * screen) is gone along with it. The SAFETY PROPERTY this file exists to
 * guard — mlv.js itself never returns an already-taken player, and counts
 * what it drops — is still fully covered above (checks against MLV.recommend
 * directly, lines 41-124) and by model-compare-card's own MLV row, which
 * still passes `taken: state.drafted` (checks 135-144 above). What is gone
 * is only the ON-SCREEN warning for the case that count is non-zero — there
 * being no screen left to warn on. */
check('EVERY remaining RosterBuilderMLV.recommend call site (model-compare-'
  + 'card, now the only one) still passes taken — the property this whole '
  + 'file protects did not quietly stop being asked for when the panel that '
  + 'used to print the warning was removed',
  (APP.match(/RosterBuilderMLV\.recommend\(/g) || []).length >= 1
  && (APP.match(/taken: state\.drafted/g) || []).length >= 1);

console.log('\n  THE ROSTER BUILDER CANNOT NAME A PLAYER WHO IS GONE\n');
console.log('    baseline top 3: ' + topNames.slice(0, 3).join(', '));
console.log('    take them, re-ask, and it returns: '
  + MLV.recommend(board, roster, { league: LEAGUE, topN: 3,
    taken: new Set(topIds.slice(0, 3)) }).map(r => r.player.name).join(', ') + '\n');
if (fails.length) {
  fails.forEach(f => console.log('  FAILED  ' + f));
  console.log('\n  ' + pass + ' passed, ' + fails.length + ' FAILED\n');
  process.exit(1);
}
console.log('  ' + pass + ' checks passed\n');
