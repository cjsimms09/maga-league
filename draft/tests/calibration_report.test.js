// TERRITORY: A
// THE SCORECARD'S ARITHMETIC, SUMMED BY HAND — synthetic snapshots, no store,
// no I/O (the CLI's artifact write is exercised at the end through a tmp path).
//
// Every Brier, bin count, observed rate and verdict below was computed on
// paper first and the code is held to it — the test cannot inherit a mistake
// from the module it is testing.
//
// Run: node draft/tests/calibration_report.test.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const CR = require(path.join(__dirname, '..', 'tools', 'calibration_report.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 400) : ''))); };

const prob = (key, p, o) => ({ key, ftype: 'probability', value: p, outcome: o });
const snap = (graded, inseasonRows) => ({
  graded_at: '2026-10-01T12:00:00Z',
  rules_era: { season: 2026 },
  forecasts: { graded },
  decisions: { inseason: { rows: inseasonRows || [] } },
});

/* ── surface routing: every declared key shape reaches its own bucket ─────── */
{
  const cases = [
    ['wk|2026|3|matchup|own1|own2', 'matchup_winprob'],
    ['wk|2026|3|weekly_high', 'weekly_high'],
    ['an|2026|wk5|playoff|4', 'champodds'],
    ['an|2026|wk5|exp_wins|4', 'exp_wins'],
    ['survival:4881@pick48', 'survival'],
    ['room_seat:r1p4', 'room_seat'],
    ['wk|2026|3|player|4881|own_v6', 'player_projection'],
    ['sidebet:42', 'sidebet_advisor'],
    ['completely|new|shape', null],
  ];
  for (const [k, want] of cases) {
    const got = CR.surfaceOf({ key: k });
    ck('surfaceOf(' + k + ') = ' + JSON.stringify(want), got === want, got);
  }
}

/* ── Brier + curve BY HAND ────────────────────────────────────────────────────
 * Four matchup claims at p=0.8; three happened, one did not.
 *   Brier = (3·(0.8−1)² + (0.8−0)²) / 4 = (3·0.04 + 0.64)/4 = 0.76/4 = 0.19
 *   Curve bin 80–90%: n=4, observed 3/4 = 0.75, mid 0.85, error −0.1. */
{
  const rows = [
    prob('wk|2026|3|matchup|a|b', 0.8, 1),
    prob('wk|2026|3|matchup|c|d', 0.8, 1),
    prob('wk|2026|4|matchup|a|c', 0.8, 1),
    prob('wk|2026|4|matchup|b|d', 0.8, 0),
  ];
  const s = CR.buildReport(snap(rows)).surfaces.matchup_winprob;
  ck('hand Brier: 4 claims at 0.8, 3 hits -> 0.19', s.brier === 0.19, s.brier);
  ck('hand mean_predicted 0.8 / observed 0.75', s.mean_predicted === 0.8 && s.observed_rate === 0.75, s);
  const bin = s.curve.find(b => b.bucket === '80-90%');
  ck('hand curve bin 80-90%: n=4, observed 0.75, error -0.1',
    bin && bin.n === 4 && bin.observed_rate === 0.75 && bin.error === -0.1, bin);
  ck('all other bins are empty with observed_rate null',
    s.curve.filter(b => b.bucket !== '80-90%').every(b => b.n === 0 && b.observed_rate === null),
    s.curve);
  ck('n=4 < 10 -> insufficient-sample verdict, never a confident one',
    /insufficient sample \(n=4\)/.test(s.verdict), s.verdict);
}

/* ── bin edges: 0.05 -> first bin, 0.95 and 1.0 -> LAST bin (clamped) ──────── */
{
  const rows = [
    prob('survival:a@pick10', 0.05, 0),
    prob('survival:b@pick10', 0.95, 1),
    prob('survival:c@pick10', 1.0, 1),   // p=1.0 must clamp into 90-100%, not fall off
  ];
  const s = CR.buildReport(snap(rows)).surfaces.survival;
  const lo = s.curve.find(b => b.bucket === '0-10%');
  const hi = s.curve.find(b => b.bucket === '90-100%');
  ck('0.05 lands in 0-10% (n=1, observed 0)', lo.n === 1 && lo.observed_rate === 0, lo);
  ck('0.95 and 1.0 both land in 90-100% (n=2, observed 1)', hi.n === 2 && hi.observed_rate === 1, hi);
  // Brier by hand: (0.05² + 0.05² + 0²)/3 = 0.005/3 = 0.0016666… -> r4 0.0017
  ck('hand Brier over the three: 0.0017', s.brier === 0.0017, s.brier);
}

/* ── verdicts at n ≥ 10, gaps summed by hand ──────────────────────────────────
 * OVER-confident: 10 claims at 0.7, 3 happened. gap = 0.7 − 0.3 = +0.4.
 * Brier = (3·0.09 + 7·0.49)/10 = (0.27+3.43)/10 = 0.37. */
{
  const rows = [];
  for (let i = 0; i < 10; i++) {
    rows.push(prob('an|2026|wk5|playoff|' + i, 0.7, i < 3 ? 1 : 0));
  }
  const s = CR.buildReport(snap(rows)).surfaces.champodds;
  ck('hand Brier 0.37 at n=10', s.brier === 0.37, s.brier);
  ck('gap +0.4 -> OVER-confident verdict naming 40pp',
    s.confidence_gap === 0.4 && /over-confident/.test(s.verdict) && /40pp/.test(s.verdict),
    s.verdict);
}
{
  // UNDER-confident: 10 claims at 0.2, 8 happened. gap = 0.2 − 0.8 = −0.6.
  const rows = [];
  for (let i = 0; i < 10; i++) {
    rows.push(prob('an|2026|wk5|playoff|' + i, 0.2, i < 8 ? 1 : 0));
  }
  const s = CR.buildReport(snap(rows)).surfaces.champodds;
  ck('gap -0.6 -> UNDER-confident verdict naming 60pp',
    s.confidence_gap === -0.6 && /under-confident/.test(s.verdict) && /60pp/.test(s.verdict),
    s.verdict);
}
{
  // CALIBRATED: 10 claims at 0.6, 6 happened. gap = 0. Brier = (6·0.16+4·0.36)/10 = 0.24.
  const rows = [];
  for (let i = 0; i < 10; i++) {
    rows.push(prob('wk|2026|5|matchup|x' + i + '|y' + i, 0.6, i < 6 ? 1 : 0));
  }
  const s = CR.buildReport(snap(rows)).surfaces.matchup_winprob;
  ck('gap 0 at n=10 -> well-calibrated, Brier 0.24 by hand',
    s.brier === 0.24 && /well-calibrated/.test(s.verdict), s);
}

/* ── point + categorical surfaces score in their own vocabulary ────────────── */
{
  const rows = [
    { key: 'an|2026|wk5|exp_wins|1', ftype: 'point', value: 8, outcome: 6 },   // err +2
    { key: 'an|2026|wk5|exp_wins|2', ftype: 'point', value: 5, outcome: 8 },   // err −3
    { key: 'wk|2026|3|weekly_high', ftype: 'categorical', value: 'own1', outcome: 'own1', hit: true },
    { key: 'wk|2026|4|weekly_high', ftype: 'categorical', value: 'own2', outcome: 'own3', hit: false },
  ];
  const r = CR.buildReport(snap(rows));
  // Bias by hand: (2 + −3)/2 = −0.5; MAE (2+3)/2 = 2.5.
  ck('point surface: bias -0.5, mae 2.5, no probability language',
    r.surfaces.exp_wins.bias === -0.5 && r.surfaces.exp_wins.mae === 2.5
      && /point surface/.test(r.surfaces.exp_wins.verdict), r.surfaces.exp_wins);
  ck('categorical surface: accuracy 0.5 over n=2',
    r.surfaces.weekly_high.accuracy === 0.5 && r.surfaces.weekly_high.n === 2,
    r.surfaces.weekly_high);
}

/* ── a surface emitting a foreign ftype is COUNTED, not blended or dropped ── */
{
  const rows = [
    prob('wk|2026|3|matchup|a|b', 0.8, 1),
    { key: 'wk|2026|4|matchup|c|d', ftype: 'point', value: 3, outcome: 1 },
  ];
  const s = CR.buildReport(snap(rows)).surfaces.matchup_winprob;
  ck('foreign ftype: scored n stays 1, anomaly named',
    s.n === 1 && s.other_ftypes_received === '1 point', s);
}

/* ── decision surfaces: edge vocabulary, counted per kind ─────────────────── */
{
  const inseason = [
    { kind: 'lineup_call', key: 'k1', edge: 4.5 },
    { kind: 'lineup_call', key: 'k2', edge: -2.5 },
    { kind: 'lineup_call', key: 'k3', edge: null },     // captured, unresolved
    { kind: 'waiver_claim', key: 'k4', edge: 1.0 },
  ];
  const r = CR.buildReport(snap([], inseason));
  const lc = r.surfaces.lineup_call;
  // Mean edge by hand: (4.5 − 2.5)/2 = 1.0 over the two SCORED rows.
  ck('lineup_call: n=3, scored=2, tool 1 - 1 cf, mean edge 1.0',
    lc.n === 3 && lc.scored === 2 && lc.tool_won === 1 && lc.counterfactual_won === 1
      && lc.mean_edge === 1, lc);
  ck('decision verdict says edge-graded, not probability',
    /realized edge/.test(lc.verdict) && /not probability/.test(lc.verdict), lc.verdict);
  ck('waiver_claim counted apart from lineup_call',
    r.surfaces.waiver_claim.n === 1 && r.surfaces.stream_call.n === 0, r.surfaces.waiver_claim);
}

/* ── the honest pre-season empty state ────────────────────────────────────── */
{
  const r = CR.buildReport(null);
  ck('null snapshot -> empty_state true with the ~Sep 15 note',
    r.empty_state === true && /Sep 15/.test(r.empty_note), r.empty_note);
  const ids = Object.keys(r.surfaces);
  ck('every declared surface is present even with zero rows',
    CR.SURFACES.every(s => ids.includes(s.id)), ids);
  ck('every empty surface verdict is the empty note, never a score',
    ids.every(id => /no resolved forecasts yet/.test(r.surfaces[id].verdict)),
    r.surfaces);
  ck('sidebet_advisor carries its no-emitter-yet pending reason',
    /no capture emits side-bet forecasts/.test(r.surfaces.sidebet_advisor.pending),
    r.surfaces.sidebet_advisor);
  ck('empty curves are empty arrays, not fabricated bins',
    r.surfaces.matchup_winprob.curve.length === 0, r.surfaces.matchup_winprob);
}

/* ── unregistered rows are visible, never dropped ─────────────────────────── */
{
  const r = CR.buildReport(snap([prob('brand|new|surface', 0.5, 1)]));
  ck('an unroutable key is counted and listed',
    r.totals.unregistered_rows === 1 && r.unregistered_keys[0] === 'brand|new|surface', r.totals);
}

/* ── the CLI writes the artifact with _territory FIRST ────────────────────── */
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'calrep-'));
  const out = path.join(tmp, 'calibration_report.json');
  const cp = require('child_process');
  const res = cp.spawnSync('node',
    [path.join(__dirname, '..', 'tools', 'calibration_report.js'), '--out', out],
    { encoding: 'utf8' });
  ck('CLI exits 0 and reports its output path', res.status === 0
    && JSON.parse(res.stdout.trim()).ok === true, res.stderr);
  const raw = fs.readFileSync(out, 'utf8');
  ck('_territory is the artifact\'s FIRST key (the artifact convention)',
    /^\{\n "_territory":/.test(raw), raw.slice(0, 60));
  const doc = JSON.parse(raw);
  ck('pre-season artifact is the empty state with all surfaces declared',
    doc.empty_state === true && Object.keys(doc.surfaces).length === CR.SURFACES.length,
    doc.totals);
}

console.log('\n%d passed, %d failed', pass, fail);
process.exitCode = fail ? 1 : 0;
