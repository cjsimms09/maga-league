// TERRITORY: A
// THE WIRE IS THE DENOMINATOR OF EVERY BENCH NUMBER, SO IT GETS ITS OWN SUITE.
//
// `emit_seat_plan.js` shipped WIRE = {QB 20.9, RB 5.3, WR 13.3, TE 6.3} with
// n = {5, 46, 39, 6} and prose saying "764 measured acquisitions". Reproduced on
// 2026-08-13, the value, the n and the prose are three different quantities:
//
//   VALUE  median of the per-(position, week) CELL MEDIANS, over only the cells
//          that cleared C's `min_n = 5` reporting floor.
//   n      the pooled ACQUISITION count of those cells — a different estimator's
//          n. RB's 5.3 is a median of SIX medians, printed as 46.
//   PROSE  764 is the number of adds in the log. 420 score. NINETY-SIX survive.
//
// The median per-season (position, week) cell in a ten-team league holds TWO
// adds, so `min_n = 5` keeps 6% of quarterback adds and 7% of tight end adds —
// each of those positions is ONE WEEK. And the filter selects on the measured
// variable: a cell reaches five adds only when the position is churning, and
// churn weeks are panic weeks. RB reads 5.3 through the filter and 7.8 without.
//
// `min_n = 5` IS CORRECT WHERE IT LIVES. C wrote it so a per-cell REPORT cannot
// print a median of one. Nothing in `waiver_replacement.py` is wrong. The defect
// is on A's side: pooling the survivors of a reporting filter and calling the
// result a league-wide level.
//
// Run: node draft/tests/wire_level.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const W = require(path.join(ROOT, 'draft', 'tools', 'wire_level.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

const M = W.measure();
const L = M.ledger;

// ── 1. EVERY ACQUISITION IS PLACED SOMEWHERE ─────────────────────────────
// A coverage number that does not add up is unreadable, and worse than that, it
// hides. When my own probe mis-keyed the join, 100% of rows missed and the miss
// surfaced under `unscored` — a field that is legitimately non-zero, so nothing
// looked wrong. The ledger below has to RECONCILE, not merely report.
ck('there are acquisitions to measure at all', L.acquisitions > 700, L.acquisitions);
const placed = L.scored + L.def_or_k_unscorable + L.no_row_that_week + L.unpositioned;
ck('every acquisition is accounted for, with none silently dropped',
  placed === L.acquisitions, { placed: placed, total: L.acquisitions });
ck('all three seasons contributed', L.seasons.length === 3 && !L.missing_store.length,
  { seasons: L.seasons.map(s => s.season), missing: L.missing_store });
ck('every season scored a nontrivial share', L.seasons.every(s => s.scored > 30),
  L.seasons);

// ── 2. THE WEEK KEY, AND A NEGATIVE I READ WRONG ────────────────────────
// I spent an hour reporting a silent join failure between C's acquisitions
// (int weeks) and the nflverse store. There is none: the store writes week as a
// NUMBER and the two already agree. My probe built the points table with
// `str(week)` as the key, every row missed, and the miss landed in `unscored` —
// a legitimate, expected, non-zero field. It read exactly like a finding about
// the pipeline and was a fact about my own harness.
//
// So what is checked here is what is TRUE: both sides are numeric, the boundary
// coerces anyway, and a stringified key really would miss everything. The last
// clause is the fail arm and it is built from a DELIBERATELY BROKEN COPY, not
// from the store — asserting the store is broken when it is not would put a
// bug that never existed into the record.
{
  const acq = W.acquisitions(JSON.parse(fs.readFileSync(
    path.join(ROOT, 'draft', 'data', 'league_history.json'), 'utf8')), '2024');
  ck('acquisitions() dates every row with a NUMBER',
    acq.length > 0 && acq.every(a => typeof a.week === 'number'), acq.slice(0, 2));
  const store = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'backtest',
    'nflverse_weekly_points_2024.json'), 'utf8'));
  ck('and the store on disk ALSO holds a number, so the two already agree',
    (store.weeks || []).length > 0 && typeof store.weeks[0].week === 'number',
    typeof (store.weeks || [{}])[0].week);
  const wp = W.weeklyPoints('2024');
  ck('weeklyPoints() coerces at the boundary regardless', Object.keys(wp).length > 0
    && Object.keys(wp).every(k => Number.isFinite(+k)), Object.keys(wp).slice(0, 4));
  const anyWeek = Math.min.apply(null, Object.keys(wp).map(Number));
  ck('CONTROL — the numeric key finds a real week of scores',
    wp[anyWeek] && Object.keys(wp[anyWeek]).length > 100,
    Object.keys(wp[anyWeek] || {}).length);
  // A stringified table, built here, to show the failure mode is real without
  // claiming it happens.
  const broken = {};
  Object.keys(wp).forEach(k => { broken[String(k) + ' '] = wp[k]; });
  const hits = acq.filter(a => (broken[a.week] || {})[a.player_id] != null).length;
  ck('FAIL ARM — a mis-keyed table joins ZERO of ' + acq.length + ' rows, and the '
    + 'miss looks like coverage rather than an error', hits === 0, hits);
  const realHits = acq.filter(a => (wp[a.week] || {})[a.player_id] != null).length;
  ck('CONTROL — the real table joins a substantial share', realHits > 100, realHits);
}

// ── 3. WHAT THE SHIPPED CONSTANT ACTUALLY IS ─────────────────────────────
// Not "the shipped number is wrong" — "the shipped number is a different
// estimator from the one its own n and prose describe". Named specifically so a
// future edit that re-pools the filtered cells fails here.
const SHIPPED = { QB: 20.9, RB: 5.3, WR: 13.3, TE: 6.3 };
const SHIPPED_N = { QB: 5, RB: 46, WR: 39, TE: 6 };
ck('CONTROL — the measured sample is far larger than the shipped n at every position',
  W.MEASURED_POSITIONS.every(p => M.summary[p].n > SHIPPED_N[p] * 1.5),
  W.MEASURED_POSITIONS.map(p => p + ': ' + M.summary[p].n + ' vs ' + SHIPPED_N[p]));
ck('and the two estimators DISAGREE by more than rounding somewhere',
  W.MEASURED_POSITIONS.some(p => Math.abs(M.summary[p].median - SHIPPED[p]) > 2),
  W.MEASURED_POSITIONS.map(p => p + ': ' + M.summary[p].median + ' vs ' + SHIPPED[p]));
ck('the largest disagreement is at TIGHT END, whose shipped figure rests on one week',
  W.MEASURED_POSITIONS.reduce((best, p) =>
    (Math.abs(M.summary[p].median - SHIPPED[p]) > Math.abs(M.summary[best].median - SHIPPED[best])
      ? p : best), 'QB') === 'TE',
  W.MEASURED_POSITIONS.map(p => p + ' ' + (M.summary[p].median - SHIPPED[p]).toFixed(2)));

// ── 4. IT IS A SAMPLE, NOT A SUMMARY ─────────────────────────────────────
// The simulator draws from it week by week. A median cannot produce convexity,
// which is the whole reason a bench player is worth anything.
W.MEASURED_POSITIONS.forEach(p => {
  ck(p + ': the raw sample is exported, sorted, with n matching the summary',
    Array.isArray(M.sample[p]) && M.sample[p].length === M.summary[p].n
    && M.sample[p].every((v, i, a) => i === 0 || a[i - 1] <= v),
    { n: (M.sample[p] || []).length, summary_n: M.summary[p].n });
});
ck('the wire has real spread at every position, or drawing from it is pointless',
  W.MEASURED_POSITIONS.every(p => M.summary[p].sd > 3),
  W.MEASURED_POSITIONS.map(p => p + ' sd ' + M.summary[p].sd));
ck('and it is right-skewed, which a median alone would hide',
  W.MEASURED_POSITIONS.some(p => M.summary[p].mean > M.summary[p].median + 0.5),
  W.MEASURED_POSITIONS.map(p => p + ' mean ' + M.summary[p].mean + ' med ' + M.summary[p].median));

// ── 5. K AND DEF REFUSE RATHER THAN DEFAULT ──────────────────────────────
// nflverse weekly is player-level OFFENCE. There is no realized K or DEF score
// to join to, so there is no sample — and a zero here would price a kicker as
// though the wire paid nothing, which is the `SCHED` lesson exactly.
ck('CONTROL — K and DEF adds really do happen and really are unscorable',
  L.def_or_k_unscorable > 200, L.def_or_k_unscorable);
ck('no K sample exists', !M.sample.K || !M.sample.K.length);
ck('no DEF sample exists', !M.sample.DEF || !M.sample.DEF.length);
['K', 'DEF'].forEach(pos => {
  let threw = null;
  try { W.requireSample(pos); } catch (e) { threw = e.message; }
  ck('requireSample("' + pos + '") THROWS instead of returning a default', !!threw
    && /REFUSING/.test(threw), threw);
});
ck('CONTROL — requireSample returns normally for a position that HAS a sample',
  W.requireSample('RB').length > 100);

// ── 6. THE EXCLUSIONS ARE THE ONES THAT WERE ARGUED FOR ─────────────────
// A failed claim is somebody who did NOT get the player. Counting one puts men
// nobody could have into the pool of what was gettable.
ck('only waiver and free-agent adds count; trades are not wire',
  W.ACQUIRING.length === 2 && W.ACQUIRING.indexOf('waiver') >= 0
  && W.ACQUIRING.indexOf('free_agent') >= 0 && W.ACQUIRING.indexOf('trade') < 0,
  W.ACQUIRING);
{
  const hist = { seasons: [{ season: '2099', transactions: {
    3: [{ type: 'waiver', status: 'failed', adds: { a: 1 } },
      { type: 'trade', status: 'complete', adds: { b: 1 } },
      { type: 'waiver', status: 'complete', adds: { c: 1, d: 2 } }] } }] };
  const got = W.acquisitions(hist, '2099');
  ck('FAIL ARM — a failed claim and a trade are both excluded, and a MULTI-ADD '
    + 'row yields both players', got.length === 2
    && got.map(g => g.player_id).sort().join(',') === 'c,d', got);
  ck('and the week rides along from the DICT KEY, since a row carries no week',
    got.every(g => g.week === 3), got);
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed  ('
  + L.acquisitions + ' adds, ' + L.scored + ' scored, '
  + W.MEASURED_POSITIONS.map(p => p + ' ' + M.summary[p].median).join('  ') + ')');
if (fail) { console.log('\nFAILED — the bench denominator is not trustworthy.'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: every acquisition in the log is accounted for, the');
console.log('week key cannot silently miss, the sample is exported whole rather than');
console.log('collapsed to a median, and K/DEF refuse instead of returning zero.');
console.log('WHAT IT DOES NOT: prove the realized-acquisition level is the RIGHT line for');
console.log('a bench decision. It is what managers here actually got; whether Cory can do');
console.log('better than the median manager on the wire is not measured anywhere yet.');
