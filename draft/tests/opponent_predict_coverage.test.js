// TERRITORY: A
/* LAYER 2 — THE OPPONENT EXPERIMENT HAD NO DENOMINATOR.
 *
 * `OpponentPredict.summarize` accounts for its exclusions carefully. It reports
 * `n_excluded_no_profile`, says why, names the clustering unit and states the
 * reading rule before any result. It is the most disciplined summary in this
 * repository. AND IT CAN ONLY ACCOUNT FOR ROWS THAT EXIST.
 *
 * A pick that was never predicted produces no forecast, therefore no
 * resolution, therefore no row, and disappears from the accounting entirely. So
 * `n_compared: 60` reads identically whether we predicted 60 of 60 or 60 of 138.
 *
 * ── WHY THE MISSING PICKS ARE NOT A RANDOM SUBSET ──────────────────────────
 *
 * `state.opponentPredictOff` latches: the budget blowing ONCE turns prediction
 * off for the rest of the draft. The budget is likeliest to blow when the board
 * is large, which is early, which is exactly where a profile arm differs most
 * from the ADP baseline. So the lost picks are biased toward the picks that
 * carry the signal, and a summary computed over the survivors would understate
 * the difference while looking complete.
 *
 * Two more silent paths: an exception inside `emitOpponentPredictions` is caught
 * and console-logged, and a window never emitted because sync was dead across
 * it. All three leave no trace in the evidence.
 *
 * ── WHAT THIS ADDS, AND WHAT IT DELIBERATELY DOES NOT ──────────────────────
 *
 * `opponentPredictCoverage()` DERIVES the denominator from `pick_order` — the
 * same authoritative artifact `interveningPicks` reads — and carries the CAUSE
 * of any gap. It changes no prediction, blocks nothing, and enforces nothing.
 * It makes "was this sample complete" answerable instead of assumed.
 *
 * ── THE EMIT ORDER IS LOAD-BEARING ─────────────────────────────────────────
 *
 * My first cut emitted coverage at the END of resolveOpponentPredictions, below
 * `if (!fc.length) return`. That is the exact case coverage exists for — the
 * predictor failing from pick one and producing no forecasts at all — and it
 * would have emitted nothing. Zero rows and zero coverage rows look the same. A
 * coverage row that only appears when there is something to cover is a
 * decoration. EMIT_PRECEDES_EARLY_RETURN below pins it.
 *
 * Run: node draft/tests/opponent_predict_coverage.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

// ── LIFT THE REAL FUNCTION. A reimplementation would pass while the shipped
//    one was wrong, which is the whole failure class this file is about. ─────
const i = SRC.indexOf('  function opponentPredictCoverage()');
const end = SRC.indexOf('\n  function ', i + 10);
ck('CONTROL: opponentPredictCoverage is locatable', i > 0 && end > i, { i, end });
const BODY = SRC.slice(i, end);

function run(state, cur) {
  const fn = new Function('state', 'currentPick', 'return ' + BODY.trim())(state, () => cur);
  return fn();
}

// Cory's real shape: 150 slots, 10 teams, keepers at 8/13/28, my picks after.
const MY = [33, 48, 53, 68, 73, 88, 93, 108, 113, 128, 133, 148];
const KEEP = new Set([8, 13, 28]);
const PICKS = [];
for (let n = 1; n <= 150; n++) {
  PICKS.push({ overall: n, round: Math.ceil(n / 10), slot: ((n - 1) % 10) + 1,
    keeper_slot: KEEP.has(n) });
}
const baseState = (predicted, extra) => Object.assign({
  data: { pick_order: { picks: PICKS, my_picks: MY } },
  opponentPredicted: predicted || {},
  opponentForecasts: [],
}, extra || {});

// ── THE DENOMINATOR EXCLUDES WHAT IS NOT PREDICTABLE ───────────────────────
{
  const r = run(baseState({}), 34);
  // Picks 1..33: minus 3 keeper slots (8,13,28) and minus my pick at 33 = 29.
  ck('keeper slots and my own picks are OUT of the denominator — neither is an '
    + 'opponent decision anybody makes', r.opponent_picks_due === 29, r);
  ck('nothing predicted yet reads as coverage 0, not as null or absent',
    r.opponent_picks_predicted === 0 && r.coverage === 0, r);
}

// ── COVERAGE IS DERIVED, NOT ASSERTED ──────────────────────────────────────
{
  const predicted = {};
  for (let n = 1; n <= 20; n++) if (!KEEP.has(n)) predicted[n] = true;
  const r = run(baseState(predicted), 34);
  // 1..33 predictable = 29; predicted among them = 1..20 minus keepers 8,13 = 18.
  ck('CONTROL: the fixture predicts a strict subset, so a ratio means something',
    r.opponent_picks_predicted === 18 && r.opponent_picks_due === 29, r);
  /* COMPARED AT THE FIELD'S OWN PRECISION. The value is rounded to 3dp on
   * purpose, so an exact-equality assertion against 18/29 fails on a correct
   * implementation — which is what my first cut did. A test that demands more
   * precision than the field carries reports a defect that is its own. */
  ck('coverage is the ratio actually computed from those two counts, at the '
    + 'precision the field is stored in',
    r.coverage === Math.round((18 / 29) * 1000) / 1000, r.coverage);
  ck('...and it is genuinely rounded, not silently truncated to an integer',
    r.coverage > 0.62 && r.coverage < 0.622, r.coverage);
  ck('...and it is NOT 1.0, which is what a row-only summary would have implied',
    r.coverage < 1, r.coverage);
}

// ── PICKS NOT YET REACHED ARE NOT COUNTED AS MISSES ────────────────────────
{
  const r = run(baseState({}), 5);
  ck('at pick 5 only 4 opponent picks are due — the future is not a failure',
    r.opponent_picks_due === 4, r);
  const r1 = run(baseState({}), 1);
  ck('at pick 1 nothing is due and coverage is null, not a divide-by-zero',
    r1.opponent_picks_due === 0 && r1.coverage === null, r1);
}

// ── THE CAUSE TRAVELS WITH THE GAP ─────────────────────────────────────────
{
  const r = run(baseState({}, { opponentPredictOff: true, opponentPredictOffAt: 12,
    opponentPredictOffWhy: 'over budget', opponentPredictErrors: 3,
    opponentPredictLastError: 'boom' }), 60);
  ck('a latched predictor is reported, with the pick it latched at',
    r.predictor_off === true && r.predictor_off_at === 12, r);
  ck('...and WHY, so a gap is diagnosable rather than merely visible',
    r.predictor_off_why === 'over budget', r.predictor_off_why);
  ck('caught exceptions are COUNTED — a console line is gone when the tab closes',
    r.emit_errors === 3 && r.last_error === 'boom', r);
}

// ── DEGRADATION ────────────────────────────────────────────────────────────
{
  ck('no pick_order -> null rather than a fabricated denominator',
    run({ data: {}, opponentPredicted: {} }, 40) === null);
  ck('no current pick -> null; "how many were due" is meaningless without a now',
    run(baseState({}), null) === null);
}

// ── THE EMIT ORDER, WHICH IS THE BUG I ALMOST SHIPPED ──────────────────────
{
  const fnStart = SRC.indexOf('  function resolveOpponentPredictions(');
  const fnEnd = SRC.indexOf('\n  function ', fnStart + 10);
  const fn = SRC.slice(fnStart, fnEnd);
  ck('CONTROL: resolveOpponentPredictions is locatable', fnStart > 0 && fnEnd > fnStart);
  const emit = fn.indexOf("PredLedger.capture('opponent_prediction_coverage'");
  const guard = fn.indexOf('if (!fc.length || !picks || !picks.length) return;');
  ck('CONTROL: both the emit and the early return are in this function',
    emit > 0 && guard > 0, { emit, guard });
  ck('EMIT_PRECEDES_EARLY_RETURN — the total-failure case (no forecasts at all) '
    + 'is the one coverage exists to record, and it must not be skipped',
    emit < guard, { emit, guard });
}

// ── ONE EMIT SITE, DEDUPED PER PICK ────────────────────────────────────────
{
  const n = (SRC.match(/opponent_prediction_coverage/g) || []).length;
  ck('exactly ONE emit site — two would double-count the same pick', n === 1, n);
  ck('deduped per pick, so a poll loop does not write a row every few seconds',
    /state\.opponentCoverageAt !== cov\.at_pick/.test(SRC));
}

// ── FAIL ARM ───────────────────────────────────────────────────────────────
{
  // Break the exclusion: count keeper slots and my own picks as predictable.
  const broken = new Function('state', 'currentPick',
    'return ' + BODY.trim().replace('|| r.keeper_slot || mine[no]', ''))(
    baseState({}), () => 34);
  const b = broken();
  ck('FAIL ARM: the scratch copy really is broken (counts all 33)',
    b.opponent_picks_due === 33, b);
  ck('FAIL ARM: ...and the shipped one disagrees with it',
    run(baseState({}), 34).opponent_picks_due !== b.opponent_picks_due);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
