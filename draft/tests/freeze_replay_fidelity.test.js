// TERRITORY: A
/* THE FREEZE REPLAYED PERFECTLY UNDER THE SHIPPED WEIGHTS AND NOWHERE ELSE.
 *
 * EVIDENCE CLASS: CORRECTNESS of the capture contract. It establishes that a
 * board built from the frozen fields reproduces the live board's ranking
 * EXACTLY. It establishes nothing about whether the ranking is any good.
 *
 * ── WHAT WAS WRONG ─────────────────────────────────────────────────────────
 *
 * `freeze_pre_draft` captured a league key called `roster`. THE LIVE LEAGUE HAS
 * NO SUCH KEY — it carries `roster_slots` — so the field froze as null. And
 * `starters`, the lineup shape, was never requested at all.
 *
 * Measured by replaying the real freeze through the real engine:
 *
 *     MEASURED_WEIGHTS   top-25 identical 25/25,  score delta  0.0000
 *     DEFAULT_WEIGHTS    top-25 identical  1/25,  score delta 80.4327
 *
 * With no `starters`, starterSlotMarginal sees {} so EVERY player reads
 * fills:'bench', mandatoryGaps returns nothing, applyRosterLegality never fires,
 * and replacement levels cannot be recomputed.
 *
 * ── WHY IT WAS INVISIBLE: TWO DEFECTS COMPOSED ─────────────────────────────
 *
 * Under the shipped weights the starter/bench branch is ARITHMETICALLY INERT —
 * measured the same day, 164 of 174 fills-flips produce a byte-identical score,
 * because every term distinguishing the branches is weighted to zero. So the
 * missing lineup shape changed nothing anyone could see. The freeze looked
 * perfect precisely while it was unusable for the one question it exists for.
 *
 * That question is the payload's own claim: "any path consuming proj_mean,
 * replacement, adp, adp_sd — including ... paths not yet designed". A path that
 * reads the lineup shape — which is EVERY roster-aware valuation anyone would
 * try next, starting with re-weighting `need` — was not recomputable, and the
 * artifact said it was.
 *
 * ── WHY THIS TEST DOES NOT READ THE ARTIFACT ON DISK ───────────────────────
 *
 * The freeze is IMMUTABLE by design and the one on disk was written before the
 * fix. Asserting against it would either fail forever or force an overwrite of
 * the one file whose whole value is that it is never overwritten. So the test
 * asserts the CONTRACT — the field list freeze_pre_draft.py actually ships —
 * by building a freeze-shaped board from the live artifact and replaying it.
 * The contract is parsed from the Python source, so it cannot drift from what
 * the builder does. When the 20 August re-take lands, the artifact inherits it.
 *
 * ── DEFAULT_WEIGHTS IS THE LOAD-BEARING ARM ────────────────────────────────
 *
 * MEASURED passed while the freeze was broken. A capture test run only under
 * the weights that ship proves the capture works for the one valuation we
 * already have — which is the only valuation we will never need the freeze for.
 *
 * Run: node draft/tests/freeze_replay_fidelity.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const KEEP = require(path.join(ROOT, 'draft', 'tools', 'keepers_of.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

const PY = fs.readFileSync(path.join(ROOT, 'draft', 'freeze_pre_draft.py'), 'utf8');
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));

// ── THE CONTRACT, PARSED FROM THE BUILDER SO IT CANNOT DRIFT ───────────────
/* COMMENTS ARE STRIPPED BEFORE PARSING, AND THE PARENS ARE BALANCED.
 *
 * My first cut took `indexOf(')')` from the opening paren and searched for '('
 * from the START of the marker. Both are wrong here for the same reason: the
 * field tuples carry long explanatory comments containing parentheses, so the
 * scan stopped inside a comment and silently returned a TRUNCATED field list —
 * which failed exactly the assertions about the fields added at the end, i.e.
 * it reported the defect as unfixed while it was fixed. A parser that
 * under-reads looks identical to a contract that under-captures. */
const PY_NC = PY.split('\n').map(l => {
  const q = l.indexOf('#');
  if (q < 0) return l;
  // Only strip a '#' that is not inside a string literal.
  const before = l.slice(0, q);
  const quotes = (before.match(/"/g) || []).length;
  return quotes % 2 === 0 ? before : l;
}).join('\n');

function tupleAfter(marker) {
  const i = PY_NC.indexOf(marker);
  if (i < 0) return null;
  let open = PY_NC.indexOf('(', i + marker.length);
  if (open < 0) return null;
  let depth = 0, close = -1;
  for (let j = open; j < PY_NC.length; j++) {
    if (PY_NC[j] === '(') depth++;
    else if (PY_NC[j] === ')') { depth--; if (depth === 0) { close = j; break; } }
  }
  if (close < 0) return null;
  return (PY_NC.slice(open + 1, close).match(/"([^"]+)"/g) || [])
    .map(s => s.slice(1, -1));
}
const PLAYER_FIELDS = tupleAfter("PLAYER_FIELDS =");
const LEAGUE_FIELDS = tupleAfter("\"league\": {k: league.get(k) for k in");

ck('CONTROL: the player-field contract was parsed from freeze_pre_draft.py',
  PLAYER_FIELDS && PLAYER_FIELDS.length > 20, PLAYER_FIELDS && PLAYER_FIELDS.length);
ck('CONTROL: the league-field contract was parsed too',
  LEAGUE_FIELDS && LEAGUE_FIELDS.length >= 5, LEAGUE_FIELDS);

// ── THE FIELD THAT WAS MISSING, BY NAME ───────────────────────────────────
ck('the freeze captures league.starters — without it every player replays as '
  + 'BENCH and roster legality never fires',
  LEAGUE_FIELDS.indexOf('starters') >= 0, LEAGUE_FIELDS);
ck('...and `roster` is gone: it is not a key the live league has, so it froze '
  + 'as null and read like a captured field',
  LEAGUE_FIELDS.indexOf('roster') < 0, LEAGUE_FIELDS);
ck('roster_slots — the key that DOES exist — is captured',
  LEAGUE_FIELDS.indexOf('roster_slots') >= 0, LEAGUE_FIELDS);
['depth_chart_order', 'variance', 'consensus_rank', 'pool_rank'].forEach(f => {
  ck('player field `' + f + '` is frozen — the engine or a valuation module '
    + 'reads it, and "inert under the current weights" cannot justify dropping '
    + 'a field from an artifact that exists to replay OTHER weights',
    PLAYER_FIELDS.indexOf(f) >= 0);
});
ck('CONTROL: every captured league field actually exists on the live league, '
  + 'so none of them freeze as a silent null the way `roster` did',
  LEAGUE_FIELDS.every(k => k in D.league),
  LEAGUE_FIELDS.filter(k => !(k in D.league)));

// ── THE REPLAY ITSELF, UNDER BOTH WEIGHT VECTORS ──────────────────────────
const keep = KEEP.keepersFrom(D);
const keepIds = new Set(keep.map(p => String(p.player_id)));
const live = D.players.filter(p => p.position && p.proj_mean != null && p.vorp != null);
const PICK = ((D.pick_order || {}).my_picks || [33])[0];

// A freeze-shaped board: exactly the fields the builder keeps, nothing else.
const frozenPlayers = live.map(p => {
  const q = {}; PLAYER_FIELDS.forEach(k => { q[k] = p[k]; }); return q;
});
const frozenLeague = {};
LEAGUE_FIELDS.forEach(k => { frozenLeague[k] = D.league[k]; });

function run(players, league, w) {
  const roster = players.filter(p => keepIds.has(String(p.player_id)));
  const board = players.filter(p => !keepIds.has(String(p.player_id)));
  return E.recommend({ board: board, roster: roster, league: league,
    currentPick: PICK, nextPick: PICK + 15, totalPicks: 150,
    myPicksLeft: 12, roundsLeft: 12, runMultipliers: {}, intervening: [],
    weights: w }).filter(x => E.scoreable(x));
}

[['MEASURED', E.MEASURED_WEIGHTS], ['DEFAULT', E.DEFAULT_WEIGHTS]].forEach(([nm, w]) => {
  const a = run(frozenPlayers, frozenLeague, w);
  const b = run(live, D.league, w);
  const an = a.slice(0, 25).map(x => x.player.name);
  const bn = b.slice(0, 25).map(x => x.player.name);
  let same = 0;
  for (let i = 0; i < 25; i++) if (an[i] === bn[i]) same++;
  const delta = Math.abs(a[0].score - b[0].score);
  ck('REPLAY under ' + nm + ' — the frozen fields reproduce the live top-25 '
    + 'EXACTLY', same === 25 && delta < 1e-9,
    { identical: same + '/25', top_score_delta: delta,
      first_divergence: an.find((n, i) => n !== bn[i]) || null });
});

// ── THE ARM THAT WOULD HAVE CAUGHT IT. Break the contract, require a red. ──
{
  const noStarters = {};
  LEAGUE_FIELDS.forEach(k => { if (k !== 'starters') noStarters[k] = D.league[k]; });
  const a = run(frozenPlayers, noStarters, E.DEFAULT_WEIGHTS);
  const b = run(live, D.league, E.DEFAULT_WEIGHTS);
  const an = a.slice(0, 25).map(x => x.player.name);
  const bn = b.slice(0, 25).map(x => x.player.name);
  let same = 0;
  for (let i = 0; i < 25; i++) if (an[i] === bn[i]) same++;
  ck('FAIL ARM: dropping `starters` DESTROYS the replay under DEFAULT weights — '
    + 'this is the state the shipped freeze was in', same < 25, same + '/25');

  /* ...AND WAS INVISIBLE UNDER THE WEIGHTS THAT SHIPPED AT THE TIME. The whole
   * reason it survived: every term that reads the lineup shape was multiplied
   * by zero. RE-PINNED 2026-08-17 EVENING — the ceiling ruling (0.45, Cory,
   * record at MEASURED_WEIGHTS) put a lineup-shape reader back into the
   * shipped vector: upsideBonus's bench branch keys off the starters-filled
   * condition, so the SAME broken freeze now shows through MEASURED too
   * (measured here: 6/25). The lesson this arm exists for is unchanged and is
   * now pinned on the vector that actually demonstrates it: a weight set that
   * zeroes the roster-reading terms is BLIND to this breakage, which is why a
   * capture test must never run under only one weight set. */
  const blind = Object.assign({}, E.MEASURED_WEIGHTS, { ceiling: 0 });
  const c = run(frozenPlayers, noStarters, blind);
  const d = run(live, D.league, blind);
  const cn = c.slice(0, 25).map(x => x.player.name);
  const dn = d.slice(0, 25).map(x => x.player.name);
  let same2 = 0;
  for (let i = 0; i < 25; i++) if (cn[i] === dn[i]) same2++;
  ck('FAIL ARM: ...and under the pre-ruling shipped vector (ceiling 0 — the '
    + 'historical MEASURED) the SAME broken freeze looks PERFECT — a '
    + 'roster-blind weight set cannot see it, which is why a capture test must '
    + 'not run only under the weights that ship', same2 === 25, same2 + '/25');

  // And the CURRENT shipped vector is no longer roster-blind: the live ceiling
  // term reads the lineup shape, so the breakage now shows under MEASURED too.
  const e2 = run(frozenPlayers, noStarters, E.MEASURED_WEIGHTS);
  const f2 = run(live, D.league, E.MEASURED_WEIGHTS);
  let same3 = 0;
  for (let i = 0; i < 25; i++) {
    if (e2[i] && f2[i] && e2[i].player.name === f2[i].player.name) same3++;
  }
  ck('CONTROL: under the CURRENT shipped MEASURED (ceiling 0.45, ruled '
    + '2026-08-17) the broken freeze is VISIBLE — the blind spot this arm '
    + 'documents belongs to the ceiling-0 era, not to today\'s config',
  same3 < 25, same3 + '/25');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
