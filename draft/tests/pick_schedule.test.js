// TERRITORY: A
// MY PICKS COME FROM THE ARTIFACT. THEY WERE HARDCODED, AND WRONG.
//
// The worst defect of the build, found on 2026-08-13 while checking a claim in
// Cory's research message. `draft_plan.js` carried
//
//     const SCHED = [8, 13, 28, 33, 48, 53, 68, 73, 88, 93, 108, 113, 128, 133, 148];
//
// which is the artifact's `pick_order.my_picks_before_keepers` — the picks Cory
// would have had IF HE KEPT NOBODY. He keeps three, and this league's cost model
// is `top_picks_flat`: keeping N forfeits rounds 1..N. Henry costs round 1,
// Chase round 2, Walker round 3.
//
// The authoritative list is `pick_order.my_picks`: TWELVE picks, first at 30 —
// which the artifact resolves to ROUND 4, SLOT 8. (Not R3.10: forfeited picks
// are REMOVED from the sequence, so the overall numbering is compressed and
// round 4 begins at 28. I wrote R3.10 here from computed arithmetic and the test
// below caught it, which is the second round-label error in two days and the
// reason every label is now READ.) So every seat schedule, card, panel and
// simulation built on the old constant
// constant assigned seats at picks that DO NOT EXIST — a FLEX at 8, a tight-end
// cliff at 13, a receiver at 28 — and priced fifteen picks where there are
// twelve.
//
// ── WHY IT SURVIVED, WHICH IS THE PART WORTH GUARDING ─────────────────────
//
// The wrong list was PLAUSIBLE. It was a real snake from Cory's slot, it had the
// right shape, every downstream tool inherited it without comment, and the right
// answer was sitting in the NEXT FIELD of the same object. Nothing compared
// them, because nothing was asked to. A constant that looks like data is worse
// than a missing one: a missing one fails on the first run.
//
// Run: node draft/tests/pick_schedule.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

const po = DATA.pick_order || {};
ck('the artifact declares my picks', Array.isArray(po.my_picks) && po.my_picks.length > 0,
  po.my_picks);
ck('and declares what they would have been WITHOUT keepers',
  Array.isArray(po.my_picks_before_keepers), po.my_picks_before_keepers);

// ── 1. THE PLAN USES THE AUTHORITATIVE LIST ──────────────────────────────
const PLAN = require(path.join(ROOT, 'draft', 'tools', 'draft_plan.js'));
const want = (po.my_picks || []).slice().sort((a, b) => a - b);
ck('draft_plan.SCHED EQUALS pick_order.my_picks, exactly',
  PLAN.SCHED.length === want.length && PLAN.SCHED.every((v, i) => v === want[i]),
  { plan: PLAN.SCHED, artifact: want });

// ── 2. AND IS NOT THE PRE-KEEPER LIST ────────────────────────────────────
// The specific wrong answer, named. A generic "matches the artifact" check
// would pass if someone pointed it at the other field.
const before = (po.my_picks_before_keepers || []).slice().sort((a, b) => a - b);
ck('CONTROL — the two lists genuinely DIFFER (or this test proves nothing)',
  before.length !== want.length || before.some((v, i) => v !== want[i]),
  { before: before.length, after: want.length });
ck('draft_plan.SCHED is NOT my_picks_before_keepers',
  !(PLAN.SCHED.length === before.length && PLAN.SCHED.every((v, i) => v === before[i])),
  PLAN.SCHED);

// ── 3. THE FORFEIT ARITHMETIC RECONCILES ─────────────────────────────────
// Keeping N forfeits rounds 1..N, so the counts and the missing rounds must
// agree with the keeper list. Three facts that can each be wrong separately.
const forfeited = po.forfeited || [];
const keeperCount = ((DATA.league || {}).keeper_rules || {}).count;
ck('the number of forfeited picks equals the number of keepers',
  forfeited.length === (PLAN.keep || []).length,
  { forfeited: forfeited.length, keepers: (PLAN.keep || []).length });
ck('and equals my pick shortfall against the pre-keeper list',
  before.length - want.length === forfeited.length,
  { shortfall: before.length - want.length, forfeited: forfeited.length });
ck('the forfeited rounds are the TOP N, as top_picks_flat requires',
  forfeited.map(f => f.cost_round).sort((a, b) => a - b)
    .every((r, i) => r === i + 1),
  forfeited.map(f => f.name + ':R' + f.cost_round));
ck('and the league declares that cost model, rather than it being assumed',
  ((DATA.league || {}).keeper_rules || {}).cost_model === 'top_picks_flat',
  (DATA.league || {}).keeper_rules);

// ── 4. NO PICK I DO NOT OWN APPEARS ANYWHERE DOWNSTREAM ─────────────────
const mine = new Set(want);
const bogus = PLAN.plan.filter(x => !mine.has(x.pick)).map(x => x.pick);
ck('every row of the plan sits on a pick I actually own', bogus.length === 0, bogus);
/* ROUND IS READ, NOT COMPUTED. `ceil(overall / teams)` is WRONG here and my
 * first version of this check failed because of it: three forfeited picks are
 * REMOVED from the sequence, so the overall numbering is COMPRESSED and round 4
 * starts at overall 28, not 31. Computed, pick 30 reads "R3.10"; the artifact
 * says round 4, slot 8 — which is the truth and also confirms the forfeit rule.
 * Every round label anywhere must come from `pick_order.picks`. */
const rowOf = n => (po.picks || []).find(r => r.overall === n) || null;
const lab = n => { const r = rowOf(n); return r ? 'R' + r.round + '.' + r.slot : '?'; };
ck('every one of my picks resolves to a row with a round and slot',
  want.every(n => rowOf(n) && rowOf(n).round && rowOf(n).slot),
  want.filter(n => !rowOf(n)));
ck('my first pick is in the round AFTER the last forfeited one',
  rowOf(want[0]) && rowOf(want[0]).round === forfeited.length + 1,
  { first: want[0] + ' = ' + lab(want[0]), forfeited: forfeited.length });
ck('and all of my picks are at ONE slot, as a snake requires',
  new Set(want.map(n => (rowOf(n) || {}).slot)).size === 1,
  [...new Set(want.map(n => (rowOf(n) || {}).slot))]);

// ── 4b. THE DRAFT'S DEPTH IS COUNTED, NOT MULTIPLIED ─────────────────────
// The third constant-shaped-like-data found on 2026-08-13. `ROSTERED` was
// `DRAFT_ROUNDS * TEAMS` = 150 against a real 147: a forfeited pick is REMOVED
// from the sequence, not reassigned. The error was 34.5 points and ALL OF IT
// was at quarterback — three players deeper moves the best available QB a full
// tier (268.2 against a true 302.7) while every other position is untouched at
// that depth. A waiver level set too LOW makes every rostered player look better
// than he is, which inflated the case for carrying a QB specifically.
const rowCount = (po.picks || []).length;
ck('the artifact says how many picks actually happen', rowCount > 0, rowCount);
ck('CONTROL — that count DIFFERS from rounds x teams (or this proves nothing)',
  rowCount !== (((DATA.league || {}).rounds || 0) * ((DATA.league || {}).teams || 0)),
  { counted: rowCount, product: ((DATA.league || {}).rounds || 0) * ((DATA.league || {}).teams || 0) });
ck('and the shortfall is exactly the forfeited picks',
  (((DATA.league || {}).rounds || 0) * ((DATA.league || {}).teams || 0)) - rowCount
    === forfeited.length,
  { shortfall: (((DATA.league || {}).rounds || 0) * ((DATA.league || {}).teams || 0)) - rowCount,
    forfeited: forfeited.length });
// The waiver level must be taken at the counted depth. Recomputed here from the
// same pool, so this checks the NUMBER rather than the intention.
{
  const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
    : (p.raw_adp != null ? +p.raw_adp : 9999));
  const pool = PLAN.pool.filter(p => +p.proj_mean > 0);
  const byAdp = pool.slice().sort((a, b) => adpOf(a) - adpOf(b));
  const at = n => {
    const gone = new Set(byAdp.slice(0, n).map(p => String(p.player_id)));
    const best = pool.filter(p => !gone.has(String(p.player_id)) && p.position === 'QB')
      .sort((a, b) => b.proj_mean - a.proj_mean)[0];
    return best ? Math.round(best.proj_mean * 10) / 10 : 0;
  };
  ck('the QB waiver level matches the COUNTED depth, not the product',
    Math.abs(PLAN.WAIVER.QB - at(rowCount)) < 0.6,
    { plan: PLAN.WAIVER.QB, at_counted: at(rowCount), at_product: at(150) });
  ck('FAIL ARM — the two depths give genuinely different answers at QB',
    Math.abs(at(rowCount) - at(150)) > 1,
    { counted: at(rowCount), product: at(150) });
}

// ── 5. THE SHIPPED SEAT PLAN AGREES ──────────────────────────────────────
// The artifact B renders from. If it lags the fix, the war room shows seats at
// picks that do not exist — which is what it did until today.
const spPath = path.join(ROOT, 'public', 'seat_plan.json');
if (fs.existsSync(spPath)) {
  const SP = JSON.parse(fs.readFileSync(spPath, 'utf8'));
  ck('seat_plan.json is built on the SAME picks',
    Array.isArray(SP.my_picks) && SP.my_picks.length === want.length
    && SP.my_picks.every((v, i) => v === want[i]),
    { seat_plan: SP.my_picks, artifact: want });
  ck('and every seat row sits on a pick I own',
    (SP.seats || []).every(s => mine.has(s.pick)),
    (SP.seats || []).filter(s => !mine.has(s.pick)).map(s => s.pick));
}

// ── 6. FAIL ARM ──────────────────────────────────────────────────────────
{
  const fake = before;                       // the exact wrong list
  ck('FAIL ARM — the pre-keeper list would be REJECTED by check 1',
    !(fake.length === want.length && fake.every((v, i) => v === want[i])));
  ck('FAIL ARM — and a plausible hand-rolled snake would be too',
    !([30, 45, 50, 65, 70, 85, 90, 105, 110, 125, 130, 146].every((v, i) => v === want[i])));
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed  (I own '
  + want.length + ' picks, first ' + want[0] + ' = ' + lab(want[0]) + ')');
if (fail) { console.log('\nFAILED — the plan is built on picks that are not mine.'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: the pick schedule is READ from the artifact, is not the');
console.log('pre-keeper list, reconciles with the forfeit rules, and nothing downstream');
console.log('sits on a pick Cory does not own.');
console.log('WHAT IT DOES NOT: verify the artifact ITSELF is right. If the board build');
console.log('computes my_picks wrongly, this agrees with it — that check belongs at ingest.');
