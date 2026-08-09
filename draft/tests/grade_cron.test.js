'use strict';
// WEEKLY GRADING LOOP — the JS grader port + decision grading + evidence-weight consume +
// rules-era stamp + the runGrade core. Proves all three retention fixes execute on a thin
// ledger (the "exercise it before you call it done" rule), matching forecast_grade.py.
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const FG = require(path.join(ROOT, 'src', 'forecast_grade'));
const EW = require(path.join(ROOT, 'src', 'evidence_weight'));
const ERA = require(path.join(ROOT, 'src', 'rules_era'));
const { runGrade } = require(path.join(ROOT, 'netlify', 'functions', 'grade-cron'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

// --- forward guarantee + Brier (mirrors forecast_grade.py) ------------------
(function () {
  const entries = [
    { kind: 'forecast', decision_at: '2026-08-01T00:00:00Z', method: 'm', payload: { key: 'k1', ftype: 'probability', value: 0.8, claim: 'survives', resolution_rule: 'r' } },
    { kind: 'forecast_resolution', decision_at: '2026-09-01T00:00:00Z', payload: { forecast_key: 'k1', outcome: 1 } },
    // backdated "forecast" AFTER its resolution -> DISQUALIFIED, never inflates the score
    { kind: 'forecast', decision_at: '2026-09-02T00:00:00Z', method: 'm', payload: { key: 'k2', ftype: 'probability', value: 0.9, claim: 'x', resolution_rule: 'r' } },
    { kind: 'forecast_resolution', decision_at: '2026-09-01T00:00:00Z', payload: { forecast_key: 'k2', outcome: 0 } },
  ];
  const g = FG.gradeForecasts(entries);
  ck('grades the forward forecast', g.n_graded === 1, `n_graded=${g.n_graded}`);
  ck('disqualifies the backdated one', g.n_disqualified === 1, `dq=${g.n_disqualified}`);
  ck('Brier of p=0.8, outcome=1 is 0.04', g.probability.brier === 0.04, `brier=${g.probability.brier}`);
  ck('reliability table has 10 buckets', g.probability.reliability.length === 10);
})();

// --- pending vs resolved ----------------------------------------------------
(function () {
  const g = FG.gradeForecasts([
    { kind: 'forecast', decision_at: '2026-08-01T00:00:00Z', payload: { key: 'p1', ftype: 'point', value: 10, resolution_rule: 'r' } },
  ]);
  ck('an unresolved forecast is pending, not graded', g.n_pending === 1 && g.n_graded === 0);
})();

// --- #6 decision grading: override detection + who won ----------------------
(function () {
  const entries = [
    { kind: 'recommendation', decision_at: '2026-08-22T01:00:00Z', payload: { key: 'pick34', value: 'PlayerA' } },
    { kind: 'pick', decision_at: '2026-08-22T01:01:00Z', payload: { key: 'pick34', value: 'PlayerB' } }, // overrode
    { kind: 'forecast_resolution', payload: { forecast_key: 'pick34', realized_taken: 180, realized_recommended: 120 } }, // Cory's pick won
    { kind: 'recommendation', decision_at: '2026-08-22T01:02:00Z', payload: { key: 'pick41', value: 'PlayerC' } },
    { kind: 'pick', decision_at: '2026-08-22T01:03:00Z', payload: { key: 'pick41', value: 'PlayerC' } }, // followed
  ];
  const d = FG.gradeDecisions(entries);
  ck('counts one override and one followed', d.overridden === 1 && d.followed === 1, JSON.stringify({ o: d.overridden, f: d.followed }));
  ck('scores where Cory beat the model', d.cory_beat_model === 1, `cbm=${d.cory_beat_model}`);
  ck('override_rate = 0.5', d.override_rate === 0.5, `${d.override_rate}`);
})();

// --- #5 evidence-weight consume: league weight RISES as graded n grows ------
(function () {
  const thin = [{ forecasts: { n_graded: 5, probability: { brier: 0.2 } } }];
  const thick = [{ forecasts: { n_graded: 500, probability: { brier: 0.2 } } }];
  const ext = { estimate: 1.0, se: 0.2, n: 5000 };
  const a = EW.consumeCalibration(thin, ext);
  const b = EW.consumeCalibration(thick, ext);
  ck('more graded decisions -> tighter league se', b.league_se < a.league_se, `${a.league_se} -> ${b.league_se}`);
  ck('more graded decisions -> more league weight', b.combined.weights.league > a.combined.weights.league,
    `${a.combined.weights.league} -> ${b.combined.weights.league}`);
})();

// --- rules-era stamp: same rules same signature; a payout change flips it ----
(function () {
  const r1 = { payouts: { reg: [0.1, 0.05] }, scoring: { pass_td: 6 }, teams: 10 };
  const r2 = { payouts: { reg: [0.15, 0.05] }, scoring: { pass_td: 6 }, teams: 10 }; // weekly-high share moved
  ck('same rules -> same era', ERA.eraSignature(r1) === ERA.eraSignature(r1));
  ck('a payout change flips the era', ERA.eraSignature(r1) !== ERA.eraSignature(r2));
  const f = ERA.stamp({ verdict: 'x' }, r1, 2026);
  ck('stamp carries era + season', !!f.rules_era && f.rules_era_season === '2026');
  ck('isCurrent false after rules change', ERA.isCurrent(f, r2) === false);
})();

// --- runGrade core: the whole loop on a thin ledger (the exercise) ----------
(function () {
  const entries = [
    { kind: 'forecast', decision_at: '2026-08-01T00:00:00Z', method: 'm', payload: { key: 'k1', ftype: 'probability', value: 0.7, resolution_rule: 'r' } },
    { kind: 'forecast_resolution', decision_at: '2026-09-01T00:00:00Z', payload: { forecast_key: 'k1', outcome: 1 } },
    { kind: 'recommendation', decision_at: '2026-08-22T01:00:00Z', payload: { key: 'pick34', value: 'A' } },
    { kind: 'pick', decision_at: '2026-08-22T01:01:00Z', payload: { key: 'pick34', value: 'B' } },
  ];
  const rules = { payouts: { reg: [0.1] }, scoring: { pass_td: 6 }, teams: 10, season: 2026 };
  const out = runGrade(entries, rules, [], '2026-09-08T12:00:00Z');
  ck('runGrade produces a stamped snapshot', out.snapshot.rules_era && out.snapshot.forecasts.n_graded === 1);
  ck('runGrade grades decisions too', out.snapshot.decisions.overridden === 1);
  ck('runGrade consumes into weights', out.weights.graded_n >= 1 && out.weights.combined.weights);
})();

console.log(`\n${pass}/${pass + fail} grading-loop checks passed`);
process.exit(fail ? 1 : 0);
