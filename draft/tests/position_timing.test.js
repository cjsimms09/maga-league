// TERRITORY: A
// THE MODEL'S TIMING VIEW, SIMULATED ACROSS A WHOLE DRAFT.
//
// Cory: "record these thoughts also so that we can test and continue improving.
// Probably something we can test with simulations?" Yes — and this is the test.
//
// `positionTiming` is the panel that says what the model is thinking about WHEN
// to take a position. It is extracted from the shipped app.js and driven across
// all fifteen picks against the real board, so the assertions are about
// behaviour over a draft rather than one hand-built fixture.
//
// The properties that must hold are the ones that have gone wrong before:
//
//   · a drop you CANNOT COLLECT is never a reason to spend a pick — the Josh
//     Allen defect, worth 59.6;
//   · a field of zeros is NOT a recommendation — the tie that sank the third
//     slot-aware attempt, where 1331 players shared VONA 0 and quarterbacks won
//     on array order;
//   · the market caution never overrides the drop — "expensive" and "scarce" are
//     different facts and a position can be both.
//
// Run: node draft/tests/position_timing.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
global.document = { getElementById: () => null, querySelector: () => null, addEventListener: () => {} };

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const PLAN = require(path.join(ROOT, 'draft', 'tools', 'draft_plan.js'));
const SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');

// THE SHIPPED FUNCTION, extracted — a re-implementation would agree with itself.
function extract(sig) {
  const start = SRC.indexOf(sig);
  if (start < 0) return '';
  let d = 0;
  for (let i = SRC.indexOf('{', start); i < SRC.length; i++) {
    if (SRC[i] === '{') d++;
    else if (SRC[i] === '}') { d--; if (d === 0) return SRC.slice(start, i + 1); }
  }
  return '';
}
const src = extract('  function positionTiming(ctx, scored) {');
ck('positionTiming exists in the shipped app.js', src.length > 200);
if (!src) { console.log('\nFAILED'); process.exit(1); }
/* positionTiming now consults the seat plan to declare a conflict with the
 * global assignment, so the shared lookup is extracted too — and the REAL
 * seat_plan.json is loaded, or the conflict branch would never be exercised and
 * the check on it would pass vacuously. */
const lookSrc = extract('  function seatForCurrentPick() {');
ck('the shared seat lookup was extracted too', lookSrc.length > 40);
const SEATPLAN = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'seat_plan.json'), 'utf8'));
const state = { data: DATA, seatPlan: SEATPLAN };
let CURRENT_PICK = null;
const pickCoordinate = () => ({ current: CURRENT_PICK });
// eslint-disable-next-line no-new-func
const positionTiming = new Function('E', 'state', 'pickCoordinate',
  lookSrc + '\n' + src + '; return positionTiming;')(E, state, pickCoordinate);

// ── DRIVE A WHOLE DRAFT ───────────────────────────────────────────────────
const pool = DATA.players.filter(p => p.position && (p.proj_mean || 0) > 0);
const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));
const byAdp = pool.slice().sort((a, b) => adpOf(a) - adpOf(b));
const SCHED = PLAN.SCHED;
const taken = new Set(PLAN.keep.map(k => String(k.player_id)));
const roster = PLAN.keep.map(k => Object.assign({}, k));
const seen = [];

SCHED.forEach((pk, i) => {
  let adv = (pk - 1) - (taken.size - PLAN.keep.length);
  for (let j = 0; j < byAdp.length && adv > 0; j++) {
    const p = byAdp[j];
    if (taken.has(String(p.player_id))) continue;
    taken.add(String(p.player_id)); adv--;
  }
  const board = pool.filter(p => !taken.has(String(p.player_id)));
  const ctx = { board: board, roster: roster.slice(), nextPick: SCHED[i + 1] || null,
    currentPick: pk, league: DATA.league };
  const scored = board.slice().sort((a, b) => b.proj_mean - a.proj_mean)
    .slice(0, 40).map(p => ({ player: p }));
  CURRENT_PICK = pk;
  seen.push({ pick: pk, t: positionTiming(ctx, scored), roster: roster.slice() });
  const planRow = PLAN.plan[i];
  if (planRow && planRow.p) { taken.add(String(planRow.p.player_id)); roster.push(planRow.p); }
});

ck('it produced a view at every pick', seen.length === SCHED.length && seen.every(s => s.t && s.t.rows),
  seen.length);
ck('and it covers all six draftable positions, onesies included',
  seen[0].t.rows.length === 6, seen[0].t.rows.map(r => r.position));

// ── 0b. K AND DEF ARE GOVERNED BY THE ROSTER RULE, NOT BY DROP-OFF ───────
// Measured: best-to-replacement is 10 pts at K (ranks 8-12 are IDENTICAL at 97)
// and 18 at DEF, both inside the noise on one skill player (~79). So on this
// board they must never out-rank a real position.
const onesieRows = seen.flatMap(s => s.t.rows.filter(r => ['K', 'DEF'].indexOf(r.position) >= 0));
ck('K and DEF never say TAKE NOW on this board', !onesieRows.some(r => r.verdict === 'TAKE NOW'),
  onesieRows.filter(r => r.verdict === 'TAKE NOW').map(r => r.position));
ck('and their verdicts quote the bar they failed to clear',
  onesieRows.filter(r => r.verdict === 'WAIT').every(r => /bar/.test(r.why || '')));
ck('CONTROL — their drops really are tiny, so the rule is not hiding a real signal',
  onesieRows.every(r => r.Dstar <= 8), onesieRows.map(r => r.position + ':' + r.Dstar).slice(0, 6));

// ── 1. A DROP YOU CANNOT COLLECT IS NEVER A REASON ───────────────────────
let collectViolations = [], starViolations = [];
seen.forEach(s => s.t.rows.forEach(r => {
  if (!r.seat && r.Dstar !== 0) starViolations.push({ pick: s.pick, r: r.position, Dstar: r.Dstar });
  if (!r.seat && r.verdict === 'TAKE NOW') collectViolations.push({ pick: s.pick, pos: r.position });
}));
ck('a position with NO SEAT always has D* = 0', starViolations.length === 0, starViolations);
ck('and is NEVER told to TAKE NOW — the Josh Allen defect',
  collectViolations.length === 0, collectViolations);
// The control: seats DO exist early, or the check above passes for the wrong reason.
const withSeat = seen.filter(s => s.t.rows.some(r => r.seat));
ck('CONTROL — some picks genuinely have an open seat', withSeat.length >= 3, withSeat.length);

// ── 2. A FIELD OF ZEROS IS NOT A RECOMMENDATION ──────────────────────────
const allZero = seen.filter(s => s.t.rows.every(r => r.Dstar === 0));
ck('CONTROL — the all-slots-filled case actually occurs in this draft',
  allZero.length > 0, allZero.length);
ck('when every D* is zero, NOTHING is told to TAKE NOW',
  allZero.every(s => !s.t.rows.some(r => r.verdict === 'TAKE NOW')),
  allZero.filter(s => s.t.rows.some(r => r.verdict === 'TAKE NOW')).map(s => s.pick));
ck('and the view says so explicitly rather than going quiet',
  allZero.every(s => s.t.anySeat === false));

// ── 3. TAKE NOW IS THE LARGEST COLLECTABLE DROP, NOT THE LARGEST DROP ────
let leadWrong = [];
seen.forEach(s => {
  const take = s.t.rows.filter(r => r.verdict === 'TAKE NOW');
  if (take.length > 1) leadWrong.push({ pick: s.pick, n: take.length });
  if (take.length === 1) {
    const max = Math.max.apply(null, s.t.rows.map(r => r.Dstar));
    if (take[0].Dstar !== max) leadWrong.push({ pick: s.pick, took: take[0].position });
  }
});
ck('at most ONE position is TAKE NOW, and it is the largest D*',
  leadWrong.length === 0, leadWrong);
// The finding that makes this worth having: raw D and collectable D* disagree.
const disagree = seen.filter(s => {
  const rawMax = s.t.rows.slice().sort((a, b) => b.D - a.D)[0];
  const starMax = s.t.rows.filter(r => r.Dstar > 0).sort((a, b) => b.Dstar - a.Dstar)[0];
  return starMax && rawMax && rawMax.position !== starMax.position;
});
ck('CONTROL — raw drop and collectable drop DO disagree somewhere (or the'
  + ' correction is doing nothing)', disagree.length > 0,
  disagree.map(s => s.pick));

// ── 4. EVERY VERDICT CARRIES A REASON WITH A NUMBER IN IT ────────────────
const noWhy = [];
seen.forEach(s => s.t.rows.forEach(r => {
  if (!r.why || r.why.length < 20) noWhy.push({ pick: s.pick, pos: r.position, why: r.why });
  else if (!/\d/.test(r.why)) noWhy.push({ pick: s.pick, pos: r.position, why: r.why });
}));
ck('every verdict explains itself AND quotes a number', noWhy.length === 0, noWhy.slice(0, 4));

// ── 5. THE MARKET LEG ADDS A CAUTION, NEVER OVERRIDES THE DROP ───────────
let overridden = [];
seen.forEach(s => s.t.rows.forEach(r => {
  if (r.market && r.verdict === 'NO SEAT') overridden.push({ pick: s.pick, pos: r.position });
}));
ck('a market caution never appears on a seatless position (it would be noise)',
  overridden.length === 0, overridden);
ck('and the market note never changes the verdict field itself',
  seen.every(s => s.t.rows.every(r =>
    ['TAKE NOW', 'WAIT', 'BEHIND', 'NO SEAT'].indexOf(r.verdict) >= 0)));

// ── 6. IT ANSWERS THE QUESTION AS ASKED ──────────────────────────────────
const qbMoment = seen.filter(s => (s.t.rows.find(r => r.position === 'QB') || {}).verdict === 'TAKE NOW');
const teMoment = seen.filter(s => (s.t.rows.find(r => r.position === 'TE') || {}).verdict === 'TAKE NOW');
console.log('        QB moment at pick(s): ' + (qbMoment.map(s => s.pick).join(', ') || 'none'));
console.log('        TE moment at pick(s): ' + (teMoment.map(s => s.pick).join(', ') || 'none'));
/* I FIRST ASSERTED "the QB moment is at ONE pick", WHICH IS AN ASSERTION ABOUT
 * THE ANSWER, NOT A PROPERTY OF THE CODE. It went red at picks 8, 28 and 33 —
 * and the red was informative rather than wrong: D measures the drop to the NEXT
 * pick, which over-rates a position whose seat could still be filled far later.
 * That is precisely the greedy-vs-global gap worth 59.6, and it is why this
 * panel can say TAKE QB at 8 while the plan says FLEX.
 *
 * A test may not paper that over by demanding the answer it prefers. The
 * property that matters is that the conflict is DECLARED. */
ck('a TAKE NOW that fights the seat plan is FLAGGED, not printed as agreement',
  seen.every(function (s) {
    const lead = s.t.rows.filter(r => r.verdict === 'TAKE NOW')[0];
    if (!lead || !s.t.plan_seat) return true;
    const want = s.t.plan_seat === 'FLEX' ? ['RB', 'WR', 'TE'] : [s.t.plan_seat];
    return want.indexOf(lead.position) >= 0 ? !lead.plan_conflict : !!lead.plan_conflict;
  }),
  seen.filter(function (s) {
    const lead = s.t.rows.filter(r => r.verdict === 'TAKE NOW')[0];
    if (!lead || !s.t.plan_seat) return false;
    const want = s.t.plan_seat === 'FLEX' ? ['RB', 'WR', 'TE'] : [s.t.plan_seat];
    return want.indexOf(lead.position) >= 0 ? !!lead.plan_conflict : !lead.plan_conflict;
  }).map(s => s.pick));
ck('and the flag names the 59.6 rather than hand-waving at "the plan"',
  seen.every(s => s.t.rows.every(r => !r.plan_conflict || /59\.6/.test(r.plan_conflict))));

// ── 7. THE ROSTER GUARANTEE — the case the real plan never reaches ───────
// The plan fills K and DEF at 108/113, so FORCED never fires in the simulation
// above. That is the plan's choice, not evidence the rule works, and an
// untriggered rule is an untested one.
{
  const skill = [];
  ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'RB'].forEach(p =>
    skill.push({ position: p, proj_mean: 200, player_id: 'x' + skill.length }));
  const board = pool.slice(0, 400);
  CURRENT_PICK = 133;
  // TWO picks left, K and DEF both unfilled: every remaining pick is spoken for.
  const t = positionTiming({ board: board, roster: skill, nextPick: 148, currentPick: 133,
    league: DATA.league, myPicksLeft: 2 }, []);
  const k = t.rows.find(r => r.position === 'K'), d = t.rows.find(r => r.position === 'DEF');
  ck('ROSTER GUARANTEE — with 2 picks left and K+DEF unfilled, both are FORCED',
    k && d && k.verdict === 'FORCED' && d.verdict === 'FORCED',
    t.rows.map(r => r.position + ':' + r.verdict));
  ck('and every other position is LOCKED OUT, not merely ranked lower',
    t.rows.filter(r => ['K', 'DEF'].indexOf(r.position) < 0)
      .every(r => r.verdict === 'LOCKED OUT'),
    t.rows.map(r => r.position + ':' + r.verdict));
  ck('the FORCED reason states the arithmetic rather than "it is late"',
    /2 pick\(s\) left and 2 mandatory/.test(k.why || ''), k && k.why);

  // AND IT MUST NOT FIRE EARLY. One more pick of slack and optimisation resumes.
  const t3 = positionTiming({ board: board, roster: skill, nextPick: 148, currentPick: 128,
    league: DATA.league, myPicksLeft: 3 }, []);
  ck('CONTROL — with 3 picks left and 2 slots it does NOT force',
    !t3.rows.some(r => r.verdict === 'FORCED' || r.verdict === 'LOCKED OUT'),
    t3.rows.map(r => r.position + ':' + r.verdict));

  // And with the onesies already filled it must never force at all.
  const done = skill.concat([{ position: 'K', proj_mean: 100, player_id: 'k1' },
    { position: 'DEF', proj_mean: 100, player_id: 'd1' }]);
  const t4 = positionTiming({ board: board, roster: done, nextPick: 148, currentPick: 133,
    league: DATA.league, myPicksLeft: 1 }, []);
  ck('CONTROL — with the mandatory slots already filled, nothing is forced',
    !t4.rows.some(r => r.verdict === 'FORCED' || r.verdict === 'LOCKED OUT'),
    t4.rows.map(r => r.position + ':' + r.verdict));
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed  (' + seen.length + ' picks simulated)');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: across a whole simulated draft the timing view never');
console.log('recommends a drop it cannot collect, never names a winner from a field of');
console.log('zeros, always explains itself with a number, and keeps the market caution');
console.log('separate from the scarcity claim.');
console.log('WHAT IT DOES NOT: judge whether the TIMING IS CORRECT. That needs outcomes,');
console.log('and the timing view is now recorded on the recommendation row so January can');
console.log('ask it — which is the point of recording it rather than only rendering it.');
