// TERRITORY: A
'use strict';
/* THE LOAD PATH DID THE THING THE OTHER TEST FORBIDS.
 *
 * `seat_pick_order.test.js` pins this exact defect for `setSlot` — it even says
 * it in prose: "a naive filter is WRONG at MY seat — it hands back the three
 * keeper slots as if they were picks I get to make." It then guards `setSlot`
 * and only `setSlot`.
 *
 * `applySlot` is a SECOND function, called from `bootFrom` on the normal load
 * path, doing the forbidden filter verbatim:
 *
 *     picks.filter(p => Number(p.slot) === slot).map(p => p.overall)
 *
 * The guard was written around the function that got fixed instead of around the
 * DEFECT, so the same expression survived one scroll away from a test file
 * describing why it is wrong.
 *
 * ── WHAT IT COST, MEASURED ON THE SHIPPED ARTIFACT (2026-08-14) ─────────────
 *
 *     pipeline my_picks   33,48,53,68,73,88,93,108,113,128,133,148   (12)
 *     applySlot derived    8,13,28,33,48,53,68,73,88,93,108,113,...  (15)
 *
 * The two disagree, so applySlot overwrote the correct list with the wrong one.
 * `currentPick()` anchors the pre-draft board on `my_picks[0]`, so the board
 * clocked pick 8 instead of 33 — every survival window TWENTY-FIVE SLOTS EARLY.
 * Josh Allen to my first pick: 89.6% computed against 1.5% true.
 *
 * Reported by B. The line number and the figures in that report were both wrong;
 * the mechanism and the missing predicate were exactly right.
 *
 * ── HOW THIS TESTS ─────────────────────────────────────────────────────────
 *
 * app.js is a browser IIFE, so `seat_pick_order` could only assert the truth
 * from the keeper module plus a source grep. That is what let this through: a
 * grep scoped to one function name cannot see a second copy.
 *
 * So this EXECUTES the shipped `applySlot` text — sliced out of app.js and given
 * its two closure dependencies (`state`, `console`) as parameters. It is the
 * real code, not a mirror of it. Mirroring the logic here would be the
 * two-places disease that put the bug in.
 */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'public', 'js', 'draft', 'app.js');
const K = require(path.join(ROOT, 'public', 'js', 'draft', 'keepers.js'));
const DATA = require(path.join(ROOT, 'public', 'draft_data.json'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

const src = fs.readFileSync(APP, 'utf8');

// ── Lift the REAL applySlot out of the IIFE ─────────────────────────────────
function loadApplySlot() {
  const i = src.indexOf('function applySlot(');
  if (i < 0) return null;
  const end = src.indexOf('\n  function ', i + 10);
  const raw = src.slice(i, end < 0 ? src.length : end);
  // `state` and `console` are the only closure bindings applySlot touches.
  return { fn: new Function('state', 'console', 'return ' + raw), raw: raw };
}
const loaded = loadApplySlot();
ck('applySlot exists and is liftable — if this fails the rest is vacuous',
  !!loaded && typeof loaded.fn === 'function');
if (!loaded) { console.log(`\n${pass} passed, ${fail} failed`); process.exit(1); }

const quiet = { warn: () => {}, log: () => {}, error: () => {} };
function run(data, stateStub) {
  const st = stateStub || {};
  loaded.fn(st, quiet)(data);
  return st;
}
// A fresh deep copy per call — these mutate `data`.
const clone = () => JSON.parse(JSON.stringify(DATA));

// ── THE TRUTH, from the shared module, for MY seat ──────────────────────────
const league = DATA.league;
const KEEPERS = (DATA.kept_players || []).length
  ? DATA.kept_players
  : ((DATA.pick_order || {}).forfeited || []);
const MYSLOT = Number(league.my_draft_slot);
const truth = K.buildTruePickOrder({
  teams: league.teams, rounds: league.rounds,
  draft_type: league.draft_type || 'snake', my_draft_slot: MYSLOT,
  keepers: Object.assign({}, league.keeper_rules),
}, { [MYSLOT]: KEEPERS.map(k => Object.assign({}, k, { team_slot: MYSLOT })) }).my_picks;

ck('CONTROL — the artifact and the keeper module agree on my picks, so `truth` '
  + 'is a real yardstick and not a restatement of the artifact',
  JSON.stringify(truth) === JSON.stringify(DATA.pick_order.my_picks),
  `module ${JSON.stringify(truth)} vs artifact ${JSON.stringify(DATA.pick_order.my_picks)}`);

ck('CONTROL — my seat actually forfeits rounds, or this board cannot '
  + 'discriminate a keeper-blind filter from a correct one',
  truth.length < league.rounds,
  `${truth.length} picks vs ${league.rounds} rounds — no forfeits to lose`);

// ── THE REGRESSION: applySlot must not change a correct list ────────────────
{
  const d = clone();
  const before = d.pick_order.my_picks.slice();
  const st = run(d);
  ck('applySlot LEAVES the pipeline pick list alone at the seat it was built for',
    JSON.stringify(d.pick_order.my_picks) === JSON.stringify(before),
    `${JSON.stringify(before)} -> ${JSON.stringify(d.pick_order.my_picks)}`);
  ck('and it did not mark the list as recomputed',
    !st.slotRecomputed, JSON.stringify(st.slotRecomputed));
  /* ⚠️ THIS ASSERTION IS THE ONE THAT DISCRIMINATES, AND IT WAS MISSING.
   *
   * The first cut of this file was run against a deliberately re-broken
   * applySlot (predicate removed) and every behavioural check above still
   * PASSED. Not because the filter was right — because the conservation guard
   * refused first and returned early, so `my_picks` was left alone by the
   * REFUSAL rather than by a correct derivation. The assertions were true for a
   * reason other than the one they claim, which is the same shape as every
   * defect this repo has been chasing, reproduced inside its own audit.
   *
   * Only the source grep went red. A behavioural suite that cannot see the
   * difference between "computed correctly" and "caught by the net behind it"
   * is measuring the net.
   *
   * At the seat the board was built for, the correct path is SILENT: no
   * recompute and no refusal. A refusal here means the filter disagreed with
   * the artifact, which is exactly the bug. */
  ck('and it did not REFUSE either — at the built-for seat the correct filter '
    + 'agrees with the artifact, so a refusal means the predicate is gone',
    !st.slotRecomputeRefused, JSON.stringify(st.slotRecomputeRefused));
  ck('THE BUG ITSELF: my first pick is not my forfeited round-1 slot',
    d.pick_order.my_picks[0] === truth[0],
    `first pick ${d.pick_order.my_picks[0]}, should be ${truth[0]}`);
  ck('and the forfeited overalls are absent from my picks entirely', (() => {
    const forfeited = (DATA.pick_order.picks || [])
      .filter(p => p.keeper_slot).map(p => p.overall);
    return forfeited.length > 0
      && forfeited.every(o => d.pick_order.my_picks.indexOf(o) === -1);
  })());
}

// ── FAIL ARM: the pre-predicate version must be caught by these assertions ──
// An audit that cannot disconfirm itself is not an audit. This rebuilds the OLD
// expression and checks the tests above would actually have gone red on it.
{
  const naive = (DATA.pick_order.picks || [])
    .filter(p => Number(p.slot) === MYSLOT).map(p => p.overall);
  ck('FAIL ARM — the old keeper-blind filter returns a DIFFERENT list, so the '
    + 'assertions above are load-bearing',
    JSON.stringify(naive) !== JSON.stringify(truth),
    `naive ${naive.length} picks vs truth ${truth.length}`);
  ck('FAIL ARM — and the difference is exactly the keeper slots',
    naive.length - truth.length === (DATA.pick_order.picks || [])
      .filter(p => p.keeper_slot).length);
  ck('FAIL ARM — the old first pick was 25 slots early, which is the reported '
    + 'survival-window error',
    truth[0] - naive[0] === 25, `${naive[0]} -> ${truth[0]}`);
}

// ── THE REFUSAL: a filter cannot re-seat a keeper, and must say so ──────────
// If the seat moves after the build, the `keeper_slot` flags still sit on the
// OLD seat's rows. The predicate alone then drops nothing and hands back a full
// 15 — three keepers silently un-forfeited. Only a rebuild can re-seat them.
{
  const other = MYSLOT === 1 ? 2 : 1;
  const d = clone();
  d.league.my_draft_slot = other;
  const before = d.pick_order.my_picks.slice();
  const st = run(d);
  ck('a seat change REFUSES rather than shipping a keeper-blind list',
    !!st.slotRecomputeRefused, JSON.stringify(st.slotRecomputed || null));
  ck('and it KEEPS the pipeline value rather than overwriting it with 15 picks',
    JSON.stringify(d.pick_order.my_picks) === JSON.stringify(before),
    JSON.stringify(d.pick_order.my_picks));
  ck('the refusal quotes both quantities it compared, so the next reader does '
    + 'not have to re-derive them',
    !!st.slotRecomputeRefused
      && /\d+ picks but \d+ rounds minus \d+ keeper/.test(st.slotRecomputeRefused.why),
    (st.slotRecomputeRefused || {}).why);
}

// ── CONTROL ON THE REFUSAL: it must not fire when there is nothing to forfeit ─
// A guard broad enough to refuse a legitimate seat change is its own outage.
{
  const d = clone();
  d.kept_players = [];
  d.pick_order.picks = (d.pick_order.picks || [])
    .map(p => Object.assign({}, p, { keeper_slot: false }));
  const other = MYSLOT === 1 ? 2 : 1;
  d.league.my_draft_slot = other;
  const st = run(d);
  ck('CONTROL — with no keepers anywhere, a seat change RECOMPUTES and does not '
    + 'refuse',
    !st.slotRecomputeRefused && !!st.slotRecomputed,
    JSON.stringify(st.slotRecomputeRefused || st.slotRecomputed || null));
  ck('CONTROL — and that recompute gives the new seat a full slate of rounds',
    d.pick_order.my_picks.length === league.rounds,
    `${d.pick_order.my_picks.length} vs ${league.rounds}`);
}

// ── SOURCE GUARD, WIDENED TO THE DEFECT RATHER THAN TO ONE FUNCTION NAME ────
// This is the lesson of the miss: `seat_pick_order` grepped `setSlot`, so a
// second copy of the same expression in `applySlot` was invisible to it. Assert
// over the WHOLE file that no seat filter anywhere is keeper-blind.
{
  const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const seatFilters = body.match(/\.filter\(\s*p\s*=>[^)]*Number\(p\.slot\)\s*===[^)]*\)/g) || [];
  ck('CONTROL — the grep finds seat filters at all, or it proves nothing',
    seatFilters.length > 0, `${seatFilters.length} found`);
  const blind = seatFilters.filter(f => !/keeper_slot/.test(f));
  // The one legitimate exception is changeSlot's documented fallback, which
  // cannot re-seat keepers either but SHOWS a "VERIFY THEM" banner instead of
  // failing closed. It is allowed to be keeper-blind because it announces it.
  ck('every seat filter in app.js is keeper-aware, except the one that warns',
    blind.length <= 1, `${blind.length} keeper-blind: ${JSON.stringify(blind)}`);
  ck('and if one is blind, the file still carries the VERIFY THEM warning that '
    + 'makes it legitimate',
    blind.length === 0 || /VERIFY THEM/.test(body), 'silent keeper-blind filter');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
