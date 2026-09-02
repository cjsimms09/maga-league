// TERRITORY: A (extends src/forecast_grade.js's in-season resolver)
/* THE TOOL'S TUESDAY CLAIM vs WHAT CORY ACTUALLY CLAIMED — graded every week,
 * with no button (register 466 ①, the waiver twin of tool_vs_actual_lineup).
 *
 * Arms: the positive with window sums BY HAND; he held => his side is 0 and
 * `held` is true; he claimed the tool's player => outcome 0, disagreement 0;
 * a MANUAL waiver_claim is not graded this way; no transactions map => no row
 * (old behaviour intact); an incomplete window => no row; the pure helper that
 * reads Sleeper's transactions keeps only HIS completed waiver/free-agent adds
 * in the order made; the summary pools waivers under their own key and leaves
 * the lineup summary byte-for-byte as it was. */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const FG = require(path.join(ROOT, 'src', 'forecast_grade'));
const CC = require(path.join(ROOT, 'netlify', 'functions', 'claims-cron'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 400) : ''))); };

const autoClaim = (week, pid, method = 'waiver-auto-v1') => ({
  kind: 'waiver_claim', method, decision_at: 't',
  payload: { key: `waiver_auto|2026|w${week}|7|${pid}`, owner_id: 7, week,
    chosen: { player_id: pid, position: 'RB' }, counterfactual: 'hold priority', drop: null, auto: true },
});
// three-week window w3..w5: tool's X = 10+12+8 = 30; human's Y = 5+20+0 = 25
const pts = { '3': { X: 10, Y: 5, Z: 1 }, '4': { X: 12, Y: 20, Z: 1 }, '5': { X: 8, Z: 1 } };
const wire = { per_week: { RB: 4 }, ongoing_per_week: { RB: 3 } };

// ── the positive, by hand ───────────────────────────────────────────────────
{
  const res = FG.buildInseasonResolutions([autoClaim(3, 'X')], pts,
    { finalWeek: 18, wire, actualAdds: { '3': [{ player_id: 'Y', type: 'waiver', created: 1 }] } });
  const primary = res.find(r => r.payload.forecast_key === 'waiver_auto|2026|w3|7|X');
  const va = res.find(r => r.payload.forecast_key === 'waiver_auto|2026|w3|7|X|vs_actual');
  ck('the existing claim-vs-wire resolution still lands, unchanged (30 vs 4+3+3 = 10)',
    !!primary && primary.payload.realized_chosen === 30 && primary.payload.realized_counterfactual === 10, primary);
  ck('a SECOND row lands: tool claim vs the player the human actually added', !!va, res.map(r => r.payload.forecast_key));
  ck('  tool X = 30, human Y = 25 over the same window, outcome = +5, decision_kind waiver_claim',
    va && va.payload.realized_chosen === 30 && va.payload.realized_counterfactual === 25
      && va.payload.outcome === 5 && va.payload.decision_kind === 'waiver_claim', va && va.payload);
  ck('  disagreement NAMED: tool_only X, human_only Y, n = 1, held false',
    va && va.payload.disagreement.n === 1 && va.payload.disagreement.tool_only.join() === 'X'
      && va.payload.disagreement.human_only.join() === 'Y' && va.payload.held === false, va && va.payload.disagreement);
  ck('  carries the vs-actual method so the read side finds it without a join',
    va && va.method === 'inseason-resolution-vs-actual-v1');
}
// ── he held ─────────────────────────────────────────────────────────────────
{
  const res = FG.buildInseasonResolutions([autoClaim(3, 'X')], pts, { finalWeek: 18, wire, actualAdds: { '3': [] } });
  const va = res.find(r => /vs_actual/.test(r.payload.forecast_key));
  ck('an EMPTY adds list is a real answer: he held, his side is 0, outcome = +30, held true',
    va && va.payload.realized_counterfactual === 0 && va.payload.outcome === 30 && va.payload.held === true
      && va.payload.human_add === null, va && va.payload);
}
// ── he claimed the tool's player ────────────────────────────────────────────
{
  const res = FG.buildInseasonResolutions([autoClaim(3, 'X')], pts,
    { finalWeek: 18, wire, actualAdds: { '3': [{ player_id: 'Z', created: 2 }, { player_id: 'X', created: 5 }] } });
  const va = res.find(r => /vs_actual/.test(r.payload.forecast_key));
  ck('agreement anywhere in his adds that week => disagreement n = 0; his FIRST add (Z) is the paired side',
    va && va.payload.disagreement.n === 0 && va.payload.human_add === 'Z'
      && va.payload.realized_counterfactual === 3 && va.payload.human_adds_that_week.join() === 'Z,X', va && va.payload);
}
// ── controls ────────────────────────────────────────────────────────────────
{
  const res = FG.buildInseasonResolutions([autoClaim(3, 'X')], pts, { finalWeek: 18, wire });
  ck('CONTROL — with no transactions map supplied, NO vs_actual row appears (old behaviour intact)',
    res.length === 1 && !res.some(r => /vs_actual/.test(r.payload.forecast_key)), res.map(r => r.payload.forecast_key));
}
{
  const res = FG.buildInseasonResolutions([autoClaim(3, 'X', 'waiver-v1')], pts,
    { finalWeek: 18, wire, actualAdds: { '3': [{ player_id: 'Y' }] } });
  ck('CONTROL — a MANUAL waiver_claim is not graded against his adds (it IS his add)',
    !res.some(r => /vs_actual/.test(r.payload.forecast_key)), res.map(r => r.payload.forecast_key));
}
{
  const res = FG.buildInseasonResolutions([autoClaim(4, 'X')], pts,
    { finalWeek: 18, wire, actualAdds: { '4': [{ player_id: 'Y' }] } });
  ck('CONTROL — an incomplete window (w4-w6, week 6 unplayed) => no row of either kind, not a zero',
    res.length === 0, res.map(r => r.payload.forecast_key));
}
{
  const res = FG.buildInseasonResolutions([autoClaim(3, 'X')], pts,
    { finalWeek: 18, wire, actualAdds: { '3': [{ player_id: 'Y' }] } });
  const already = CC.alreadyResolvedKeys(res);
  ck('the cron dedupe sees the vs_actual key once it is in the ledger',
    already.has('waiver_auto|2026|w3|7|X|vs_actual'));
}
// ── register 473: the wire fallback reads the AUTO capture's field too ──────
{
  const manualShape = autoClaim(3, 'X'); manualShape.payload.chosen = { player_id: 'X', pos: 'RB' };
  const r1 = FG.buildInseasonResolutions([autoClaim(3, 'X')], pts, { finalWeek: 18, wire });
  const r2 = FG.buildInseasonResolutions([manualShape], pts, { finalWeek: 18, wire });
  ck('an auto claim (`position`) with no drop resolves against the wire — before 473 it pended forever',
    r1.length === 1 && r1[0].payload.realized_counterfactual === 10, r1);
  ck('  and the manual spelling (`pos`) still resolves identically', r2.length === 1 && r2[0].payload.realized_counterfactual === 10, r2);
}
// ── the pure transactions reader ────────────────────────────────────────────
{
  const txs = [
    { status: 'complete', type: 'waiver', created: 20, adds: { Y: 1 }, drops: { Q: 1 } },
    { status: 'complete', type: 'free_agent', created: 10, adds: { Z: 1 } },
    { status: 'complete', type: 'waiver', created: 5, adds: { W: 2 } },          // another roster
    { status: 'failed', type: 'waiver', created: 1, adds: { V: 1 } },            // not completed
    { status: 'complete', type: 'trade', created: 30, adds: { T: 1 }, roster_ids: [1, 3] },  // a trade
  ];
  const mine = CC.myAddsByWeek(txs, 1);
  ck('myAddsByWeek: HIS completed waiver/free-agent adds only, in the order made, drops carried',
    mine && mine.map(a => a.player_id).join() === 'Z,Y' && mine[1].drops.join() === 'Q' && mine[0].type === 'free_agent', mine);
  ck('  an unavailable feed is null (no row); a week with no adds is [] (he held)',
    CC.myAddsByWeek(null, 1) === null && CC.myAddsByWeek([], 1).length === 0 && CC.myAddsByWeek(txs, 9).length === 0);
}
// ── the summary splits by decision kind; the lineup summary is untouched ────
{
  const lineupRow = (w, outcome) => ({ kind: 'forecast_resolution', method: 'inseason-resolution-vs-actual-v1',
    payload: { forecast_key: `lineup_auto|2026|w${w}|7|vs_actual`, week: w, outcome, disagreement: { n: 1 } } });
  const waiverRow = (w, outcome, held) => ({ kind: 'forecast_resolution', method: 'inseason-resolution-vs-actual-v1',
    payload: { forecast_key: `waiver_auto|2026|w${w}|7|P|vs_actual`, week: w, decision_kind: 'waiver_claim',
      outcome, held, disagreement: { n: held ? 1 : 0 } } });
  const onlyLineup = FG.toolVsActualSummary([lineupRow(2, -5), lineupRow(3, 7)]);
  const both = FG.toolVsActualSummary([lineupRow(2, -5), lineupRow(3, 7), waiverRow(2, 30, true), waiverRow(3, -4, false)]);
  ck('lineup summary is unchanged by waiver rows (weeks 2, mean +1, no waiver key when none)',
    onlyLineup.weeks === 2 && onlyLineup.tool_minus_human_per_week === 1 && !('waiver' in onlyLineup)
      && both.weeks === 2 && both.tool_minus_human_per_week === 1, { onlyLineup, both });
  ck('waiver summary pooled under its own key: 2 weeks, +13/wk, 1 held week',
    both.waiver && both.waiver.weeks === 2 && both.waiver.tool_minus_human_per_week === 13
      && both.waiver.weeks_human_held === 1, both.waiver);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
