// TERRITORY: A (extends src/forecast_grade.js's in-season resolver)
/* THE TOOL vs WHAT CORY ACTUALLY STARTED — graded every week, with no button.
 *
 * Cory, 2026-09-01: "Do all of these!!" — item 5: where the tool and his gut
 * disagree, start the tool's lineup and LOG the disagreement as a graded
 * decision. The only existing capture of a disagreement is `inseason_override`,
 * which fires when he clicks override. A disagreement he never logs is a
 * decision nobody grades, which is the exact hole the mandate names.
 *
 * So the resolver now derives it from two things already fetched every Sunday:
 * the auto-captured tool lineup (lineup_call, method lineup-auto-v1) and his
 * real starters off the matchup rows. Same week's real points on both sides,
 * paired — the delta is the disagreement alone.
 *
 * Arms: the positive with sums and the disagreement set done BY HAND; no
 * starters => no row (existing behaviour untouched); a manual lineup_call is
 * not double-graded; agreement is a real 0, not a skip; the summary pools
 * weeks; the cron's dedupe refuses a key the ledger already holds.
 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const FG = require(path.join(ROOT, 'src', 'forecast_grade'));
const CC = require(path.join(ROOT, 'netlify', 'functions', 'claims-cron'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 400) : ''))); };

const auto = (week, rec, cf) => ({
  kind: 'lineup_call', method: 'lineup-auto-v1', decision_at: 't',
  payload: { key: `lineup_auto|2026|w${week}|7`, owner_id: 7, week,
    recommended: rec.map(id => ({ id })), counterfactual: cf.map(id => ({ id })) },
});
const pts = { '3': { a: 20, b: 10, c: 5, d: 15, e: 0 } };

// ── the positive, by hand ───────────────────────────────────────────────────
{
  const res = FG.buildInseasonResolutions([auto(3, ['a', 'b'], ['c', 'd'])], pts,
    { actualStarters: { '3': ['a', 'd'] } });
  const primary = res.find(r => r.payload.forecast_key === 'lineup_auto|2026|w3|7');
  const va = res.find(r => r.payload.forecast_key === 'lineup_auto|2026|w3|7|vs_actual');
  ck('the existing tool-vs-naive resolution still lands, unchanged', !!primary
    && primary.payload.realized_chosen === 30 && primary.payload.realized_counterfactual === 20, primary);
  ck('a SECOND row lands: tool vs what the human actually started', !!va, res.map(r => r.payload.forecast_key));
  ck('  tool lineup (a+b) = 30, human lineup (a+d) = 35, outcome = tool - human = -5',
    va && va.payload.realized_chosen === 30 && va.payload.realized_counterfactual === 35 && va.payload.outcome === -5, va && va.payload);
  ck('  the disagreement is NAMED: tool-only b, human-only d, n = 1',
    va && va.payload.disagreement.n === 1 && va.payload.disagreement.tool_only.join() === 'b'
      && va.payload.disagreement.human_only.join() === 'd', va && va.payload.disagreement);
  ck('  it carries its own method so the read side can find it without a join',
    va && va.method === 'inseason-resolution-vs-actual-v1', va && va.method);
}

// ── controls ────────────────────────────────────────────────────────────────
{
  const res = FG.buildInseasonResolutions([auto(3, ['a', 'b'], ['c', 'd'])], pts, {});
  ck('CONTROL — with no actual starters supplied, NO vs_actual row appears (old behaviour intact)',
    res.length === 1 && !res.some(r => /vs_actual/.test(r.payload.forecast_key)), res.map(r => r.payload.forecast_key));
}
{
  const manual = auto(3, ['a', 'b'], ['c', 'd']); manual.method = 'lineup-v1';
  const res = FG.buildInseasonResolutions([manual], pts, { actualStarters: { '3': ['a', 'd'] } });
  ck('CONTROL — a MANUAL lineup_call is not graded against actual starters (that path is inseason_override)',
    !res.some(r => /vs_actual/.test(r.payload.forecast_key)), res.map(r => r.payload.forecast_key));
}
{
  const res = FG.buildInseasonResolutions([auto(3, ['a', 'b'], ['c', 'd'])], pts,
    { actualStarters: { '3': ['b', 'a'] } });
  const va = res.find(r => /vs_actual/.test(r.payload.forecast_key));
  ck('agreement is a REAL ZERO, not a skip — outcome 0, disagreement 0 (order does not matter)',
    va && va.payload.outcome === 0 && va.payload.disagreement.n === 0, va && va.payload);
}
{
  const res = FG.buildInseasonResolutions([auto(4, ['a'], ['c'])], pts,
    { actualStarters: { '3': ['a'] } });
  ck('CONTROL — starters for a DIFFERENT week do not resolve this week (week not resolvable => nothing)',
    res.length === 0, res);
}

// ── the summary, pooled ─────────────────────────────────────────────────────
{
  const ledger = [
    ...FG.buildInseasonResolutions([auto(3, ['a', 'b'], ['c', 'd'])], pts, { actualStarters: { '3': ['a', 'd'] } }),
    ...FG.buildInseasonResolutions([auto(3, ['a', 'b'], ['c', 'd'])], pts, { actualStarters: { '3': ['a', 'd'] } }),  // duplicate week
    { kind: 'forecast_resolution', method: 'inseason-resolution-vs-actual-v1',
      payload: { forecast_key: 'lineup_auto|2026|w4|7|vs_actual', week: 4, outcome: 7, disagreement: { n: 2 } } },
  ];
  const sm = FG.toolVsActualSummary(ledger);
  ck('summary pools ONE row per week (the duplicate is ignored): 2 weeks, deltas -5 and +7',
    sm.weeks === 2 && sm.season_total === 2 && sm.tool_minus_human_per_week === 1, sm);
  ck('  and counts better/worse and the mean players disagreed', sm.weeks_tool_better === 1
    && sm.weeks_human_better === 1 && sm.mean_players_disagreed === 1.5, sm);
  ck('  an empty ledger says so rather than reporting zeros', FG.toolVsActualSummary([]).weeks === 0);
}

// ── the cron's dedupe ───────────────────────────────────────────────────────
{
  const held = CC.alreadyResolvedKeys([
    { kind: 'forecast_resolution', payload: { forecast_key: 'lineup_auto|2026|w3|7|vs_actual' } },
    { kind: 'lineup_call', payload: { key: 'lineup_auto|2026|w4|7' } },
  ]);
  ck('the cron refuses to append a vs_actual key the ledger already holds',
    held.has('lineup_auto|2026|w3|7|vs_actual') && !held.has('lineup_auto|2026|w4|7'), [...held]);
}

console.log('\n' + pass + '/' + (pass + fail) + ' tool-vs-actual arms passed');
process.exit(fail ? 1 : 0);
