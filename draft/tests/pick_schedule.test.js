// TERRITORY: A
// MY PICKS ARE THE SNAKE. THE ARTIFACT COMPRESSES AND SLEEPER DOES NOT.
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

// ── 1. THE SCHEDULE IS THE SNAKE, AND SLEEPER'S LOG IS THE AUTHORITY ─────
// Cory, 2026-08-13: "I am in slot 8 ... since my first pick is in round 4 I am
// the 3rd pick in that round since it snakes back." Round 4 is EVEN, the snake
// reverses, slot 10 goes first: 31, 32, THIRTY-THREE.
const PLAN = require(path.join(ROOT, 'draft', 'tools', 'draft_plan.js'));
const L = DATA.league || {};

// Sleeper's own completed drafts for this league — the only authority on how
// this room numbers picks. Every one is rounds x teams, keepers or not.
const HIST = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data',
  'league_history.json'), 'utf8'));
const drafts = (HIST.seasons || []).map(s => {
  const d = Array.isArray(s.drafts) ? s.drafts[0] : s.drafts;
  const picks = ((d || {}).picks) || [];
  if (!picks.length) return null;
  const r4 = picks.filter(p => p.round === 4).map(p => p.pick_no).sort((a, b) => a - b);
  return { season: String(s.season), n: picks.length, r4_start: r4[0],
    keepers: picks.filter(p => p.is_keeper).length };
}).filter(Boolean);
ck('CONTROL — there are completed Sleeper drafts to check against',
  drafts.length === 3, drafts);
ck('SLEEPER DOES NOT COMPRESS — every completed draft is rounds x teams, '
  + 'whatever the keeper count',
  drafts.every(d => d.n === (+L.rounds) * (+L.teams)),
  drafts.map(d => d.season + ': ' + d.n + ' picks, ' + d.keepers + ' keepers'));
ck('and round 4 begins at the same overall every year, keepers or not',
  new Set(drafts.map(d => d.r4_start)).size === 1
  && drafts[0].r4_start === 3 * (+L.teams) + 1,
  drafts.map(d => d.season + ': R4 starts ' + d.r4_start));
ck('FAIL ARM — the keeper counts genuinely DIFFER across those seasons, so the '
  + 'invariance above is not three copies of one case',
  new Set(drafts.map(d => d.keepers)).size >= 2, drafts.map(d => d.keepers));

// ── 2. THE DERIVED SCHEDULE MATCHES THE ARITHMETIC CORY DID BY HAND ──────
const teams = +L.teams, mySlot = +L.my_draft_slot;
const forfeitedCount = () => (po.forfeited || []).length;
const forfeited = po.forfeited || [];
const firstLiveRound = forfeited.length + 1;
// Round r, slot s: odd rounds run 1..teams, even rounds run teams..1.
const overallOf = (r, s) => (r - 1) * teams
  + ((r % 2 === 1) ? s : (teams - s + 1));
ck('my first live round is the one after the last forfeited',
  firstLiveRound === 4, { forfeited: forfeited.length, first: firstLiveRound });
ck('in an EVEN round the snake reverses, so slot ' + mySlot + ' is pick '
  + (teams - mySlot + 1) + ' of the round',
  (teams - mySlot + 1) === 3, { slot: mySlot, nth: teams - mySlot + 1 });
ck('so my first pick is overall 33, not 30',
  PLAN.SCHED[0] === overallOf(firstLiveRound, mySlot) && PLAN.SCHED[0] === 33,
  { plan: PLAN.SCHED[0], derived: overallOf(firstLiveRound, mySlot) });
ck('and every pick I own is my slot in a round I did not forfeit',
  PLAN.SCHED.length === (+L.rounds) - forfeited.length
  && PLAN.SCHED.every((v, i) => v === overallOf(firstLiveRound + i, mySlot)),
  PLAN.SCHED);

// ── 3. AND THE ARTIFACT NOW AGREES, HAVING BEEN FIXED AT SOURCE ─────────
// `keepers.build_true_pick_order` deleted forfeited picks and renumbered the
// survivors 1..N; `pick_order.my_picks` was [30, 45, 50, ...] and this file
// asserted the artifact was KNOWN-DIVERGENT. Both implementations (Python and
// the JS twin in public/js/draft/keepers.js) now leave the numbering alone, so
// the derivation and the artifact must MATCH — and if they ever part again, the
// derivation is the one to trust and this goes red.
const artifactPicks = (po.my_picks || []).slice().sort((a, b) => a - b);
ck('pick_order.my_picks matches the snake derivation exactly',
  artifactPicks.length === PLAN.SCHED.length
  && artifactPicks.every((v, i) => v === PLAN.SCHED[i]),
  { artifact: artifactPicks, derived: PLAN.SCHED });
ck('the artifact declares which numbering it uses, rather than leaving it to be '
  + 'inferred', po.numbering === 'sleeper_uncompressed', po.numbering);
ck('and it carries the BOARD and the LIVE-SELECTION count as two named fields, '
  + 'because conflating them is what made ROSTERED 147',
  (po.picks || []).length === (+L.rounds) * (+L.teams)
  && po.live_picks === (po.picks || []).length - forfeitedCount(),
  { board: (po.picks || []).length, live: po.live_picks });
ck('every keeper-occupied slot on the board is FLAGGED, not deleted',
  (po.picks || []).filter(p => p.keeper_slot).length === forfeitedCount(),
  (po.picks || []).filter(p => p.keeper_slot).map(p => p.overall));
ck('and none of my own picks sits on a keeper slot',
  (po.picks || []).filter(p => p.keeper_slot)
    .every(p => PLAN.SCHED.indexOf(p.overall) < 0));
/* FAIL ARM — the specific wrong answer, still named. A future edit that
 * reintroduces renumbering produces exactly this and must be caught. */
{
  const compressed = PLAN.SCHED.map(v => v - forfeitedCount());
  ck('FAIL ARM — the compressed list would be REJECTED by the check above',
    !(compressed.length === PLAN.SCHED.length
      && compressed.every((v, i) => v === PLAN.SCHED[i])),
    compressed);
  ck('and it is exactly the old shipped value, so the arm targets the real bug',
    compressed[0] === 30, compressed[0]);
}

// ── 3b. THE PRE-KEEPER LIST WAS RIGHT ALL ALONG ──────────────────────────
// `my_picks_before_keepers` is the uncompressed snake. My picks are that list
// with the forfeited rounds removed — I had the two fields exactly backwards.
const before = (po.my_picks_before_keepers || []).slice().sort((a, b) => a - b);
ck('the pre-keeper list is the full uncompressed snake for my slot',
  before.length === (+L.rounds)
  && before.every((v, i) => v === overallOf(i + 1, mySlot)), before);
ck('and my schedule is its TAIL, after the forfeited rounds',
  PLAN.SCHED.every((v, i) => v === before[forfeited.length + i]),
  { mine: PLAN.SCHED, tail: before.slice(forfeited.length) });

// ── 4. THE FORFEIT ARITHMETIC RECONCILES ─────────────────────────────────
ck('the number of forfeited picks equals the number of keepers',
  forfeited.length === (PLAN.keep || []).length,
  { forfeited: forfeited.length, keepers: (PLAN.keep || []).length });
ck('the forfeited rounds are the TOP N, as top_picks_flat requires',
  forfeited.map(f => f.cost_round).sort((a, b) => a - b).every((r, i) => r === i + 1),
  forfeited.map(f => f.name + ':R' + f.cost_round));
ck('and the league declares that cost model, rather than it being assumed',
  ((DATA.league || {}).keeper_rules || {}).cost_model === 'top_picks_flat',
  (DATA.league || {}).keeper_rules);
const mine = new Set(PLAN.SCHED);
ck('every row of the plan sits on a pick I actually own',
  PLAN.plan.filter(x => !mine.has(x.pick)).length === 0,
  PLAN.plan.filter(x => !mine.has(x.pick)).map(x => x.pick));

// ── 4b. THE BOARD IS 150 DEEP, AND I BROKE THAT THIS MORNING ────────────
// `ROSTERED` was rounds x teams. I changed it to count `pick_order.picks` (147)
// and wrote a commit claiming a 34.5-point quarterback error. The artifact
// compresses; Sleeper does not; 150 was right. The check is against the LOG.
{
  const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
    : (p.raw_adp != null ? +p.raw_adp : 9999));
  const pool = PLAN.pool.filter(p => +p.proj_mean > 0);
  const byAdp = pool.slice().sort((a, b) => adpOf(a) - adpOf(b));
  const at = (n, pos) => {
    const gone = new Set(byAdp.slice(0, n).map(p => String(p.player_id)));
    const best = pool.filter(p => !gone.has(String(p.player_id)) && p.position === pos)
      .sort((a, b) => b.proj_mean - a.proj_mean)[0];
    return best ? Math.round(best.proj_mean * 10) / 10 : 0;
  };
  const depth = drafts[0].n;                       // 150, from Sleeper's own log
  const live = po.live_picks;                      // 147 — SELECTIONS, not depth
  const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
  POS.forEach(pos => {
    ck('the ' + pos + ' waiver level is taken at the BOARD depth Sleeper drafts',
      Math.abs(PLAN.WAIVER[pos] - at(depth, pos)) < 0.6,
      { plan: PLAN.WAIVER[pos], at_board: at(depth, pos), at_live: at(live, pos) });
  });
  ck('CONTROL — the two counts genuinely differ, by exactly the keeper slots',
    depth - live === forfeitedCount() && depth !== live,
    { board: depth, live: live, keepers: forfeitedCount() });
  /* FAIL ARM — WHICH POSITION THE CONFUSION BITES IS BOARD-DEPENDENT, so the arm
   * asks whether it bites ANYWHERE rather than naming one. It cost 34.5 points
   * at QUARTERBACK on the 1,759-player board this morning; on today's 1,841-player
   * rebuild QB is flat across those three slots and it lands on TIGHT END
   * instead. Pinning the arm to QB would have gone quietly vacuous — passing
   * while proving nothing — which is the class of defect this suite exists for. */
  const differ = POS.filter(pos => Math.abs(at(depth, pos) - at(live, pos)) > 1);
  ck('FAIL ARM — taking it at the LIVE-SELECTION count changes the answer at some '
    + 'position, so the two depths are genuinely distinguishable',
    differ.length > 0,
    POS.map(pos => pos + ' ' + at(depth, pos) + '/' + at(live, pos)).join('  '));
  console.log('      (the depth error currently bites at: ' + differ.join(', ')
    + ' — it was QB this morning on a smaller board)');
}

// ── 5. THE SHIPPED SEAT PLAN AGREES ──────────────────────────────────────
// The artifact B renders from. If it lags the fix, the war room shows seats at
// picks that do not exist — which is what it did until today.
const spPath = path.join(ROOT, 'public', 'seat_plan.json');
if (fs.existsSync(spPath)) {
  const SP = JSON.parse(fs.readFileSync(spPath, 'utf8'));
  ck('seat_plan.json is built on the SAME picks',
    Array.isArray(SP.my_picks) && SP.my_picks.length === PLAN.SCHED.length
    && SP.my_picks.every((v, i) => v === PLAN.SCHED[i]),
    { seat_plan: SP.my_picks, artifact: PLAN.SCHED });
  ck('and every seat row sits on a pick I own',
    (SP.seats || []).every(s => mine.has(s.pick)),
    (SP.seats || []).filter(s => !mine.has(s.pick)).map(s => s.pick));
}

// ── 6. FAIL ARM ──────────────────────────────────────────────────────────
{
  const fake = before;                       // the exact wrong list
  ck('FAIL ARM — the pre-keeper list would be REJECTED by check 1',
    !(fake.length === PLAN.SCHED.length && fake.every((v, i) => v === PLAN.SCHED[i])));
  ck('FAIL ARM — and a plausible hand-rolled snake would be too',
    !([30, 45, 50, 65, 70, 85, 90, 105, 110, 125, 130, 146].every((v, i) => v === PLAN.SCHED[i])));
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed  (I own '
  + PLAN.SCHED.length + ' picks, first ' + PLAN.SCHED[0] + ' = round '
  + (forfeited.length + 1) + ', pick ' + (teams - mySlot + 1) + ' of that round)');
if (fail) { console.log('\nFAILED — the plan is built on picks that are not mine.'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: the pick schedule is READ from the artifact, is not the');
console.log('pre-keeper list, reconciles with the forfeit rules, and nothing downstream');
console.log('sits on a pick Cory does not own.');
console.log('WHAT IT DOES NOT: verify the artifact ITSELF is right. If the board build');
console.log('computes my_picks wrongly, this agrees with it — that check belongs at ingest.');
