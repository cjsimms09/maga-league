// TERRITORY: A (extends src/forecast_grade.js, same lane as inseason_decisions.test.js)
// THE MISSING RESOLVER — closing the loop for lineup_call, for real.
//
// inseason_decisions.test.js proved the GRADE side is ready. It also said
// plainly what wasn't: "WHAT IT DOES NOT: capture anything... Until it is,
// this grades an empty set." Capture was wired later the same day
// (src/routes/member.js's /lineup/log), but that alone doesn't close the
// loop — a captured decision still needs an outcome joined to it before
// gradeDecisions() can score it, and nothing ever produced that outcome.
// Two real, separate defects were hiding behind "capture isn't wired":
//
//   1. gradeDecisions() read payload.chosen, but /lineup/log writes
//      payload.recommended — a real lineup_call always graded chosen: null.
//   2. Nothing built the forecast_resolution entries a decision needs to
//      actually score, even once #1 is fixed.
//
// This file proves both are fixed, and proves #2 against REAL historical
// data (league_history.json), not only a synthetic fixture — the same
// leak-free-backtest discipline as draft/tools/lineup_edge_backtest.js,
// because a resolver that only works on hand-built numbers is not proven to
// work on the shape real weekly data will actually have.
//
// Run: node draft/tests/inseason_resolution.test.js
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { gradeDecisions, buildInseasonResolutions } = require(path.join(ROOT, 'src', 'forecast_grade.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

// ── 1. THE FIELD-NAME BUG, REPRODUCED THEN PROVEN FIXED ─────────────────────
{
  // Exactly the shape /lineup/log actually writes (views/lineup.ejs's hidden
  // fields), not the flat {chosen: 'Nabers'} fixture inseason_decisions.test.js
  // uses — that fixture never would have caught this, which is why it didn't.
  const realShaped = [{
    kind: 'lineup_call', decision_at: 't1',
    payload: {
      key: 'w1', week: 3,
      recommended: [{ id: '111', name: 'Player A', pos: 'RB', proj: 14.2 }],
      counterfactual: [{ id: '222', name: 'Player B', pos: 'RB', proj: 11.0 }],
    },
  }];
  const before = gradeDecisions(realShaped).inseason.rows[0];
  ck('a real-shaped lineup_call now resolves chosen (was permanently null before the fix)',
    Array.isArray(before.chosen) && before.chosen[0].id === '111', before.chosen);
  ck('counterfactual still resolves the same way it always did',
    Array.isArray(before.counterfactual) && before.counterfactual[0].id === '222', before.counterfactual);
}

// ── 2. buildInseasonResolutions: SYNTHETIC MECHANICS ────────────────────────
{
  const entries = [{
    kind: 'lineup_call', decision_at: 't1',
    payload: {
      key: 'w1', week: 3,
      recommended: [{ id: 'a' }, { id: 'b' }],
      counterfactual: [{ id: 'c' }, { id: 'd' }],
    },
  }];
  const weeklyPoints = { 3: { a: 12.5, b: 8.0, c: 5.5, d: 6.5 } };
  const res = buildInseasonResolutions(entries, weeklyPoints);
  ck('produces exactly one resolution', res.length === 1, res.length);
  ck('realized_chosen sums the RECOMMENDED lineup\'s real points (12.5+8.0=20.5)',
    res[0].payload.realized_chosen === 20.5, res[0].payload);
  ck('realized_counterfactual sums the COUNTERFACTUAL lineup\'s real points (5.5+6.5=12.0)',
    res[0].payload.realized_counterfactual === 12.0, res[0].payload);
  ck('forecast_key matches the decision\'s own key, so gradeDecisions can join it',
    res[0].payload.forecast_key === 'w1', res[0].payload);
}
{
  // A week with no real data yet (season hasn't happened) is UNRESOLVED, not
  // a zero — the same discipline gradeDecisions itself already uses for
  // missing outcomes.
  const entries = [{ kind: 'lineup_call', decision_at: 't1',
    payload: { key: 'w1', week: 3, recommended: [{ id: 'a' }], counterfactual: [{ id: 'b' }] } }];
  const res = buildInseasonResolutions(entries, {});
  ck('no resolution emitted for a week with no realized data — absent, not zero',
    res.length === 0, res);
}
{
  // A player with no scored row that week (bye/inactive/missing) contributes
  // 0 rather than throwing or silently dropping the whole lineup's total.
  const entries = [{ kind: 'lineup_call', decision_at: 't1',
    payload: { key: 'w1', week: 3, recommended: [{ id: 'a' }, { id: 'ghost' }], counterfactual: [{ id: 'b' }] } }];
  const res = buildInseasonResolutions(entries, { 3: { a: 10, b: 7 } });
  ck('an unscored player in the lineup contributes 0, not a thrown error or a dropped row',
    res.length === 1 && res[0].payload.realized_chosen === 10, res);
}
{
  // A PRE-FIX inseason_override (recommended duplicated into counterfactual,
  // no `actual`) is not resolved — there is nothing honest to sum. Since
  // 2026-08-15 the routes capture payload.actual and THOSE entries do resolve:
  // waiver_stream_resolution.test.js §5 proves both arms.
  const entries = [{ kind: 'inseason_override', decision_at: 't1',
    payload: { key: 'w1', week: 3, recommended: [{ id: 'a' }], counterfactual: [{ id: 'a' }] } }];
  const res = buildInseasonResolutions(entries, { 3: { a: 10 } });
  ck('a pre-fix inseason_override (no captured actual) is not resolved — nothing honest to sum',
    res.length === 0, res);
}

// ── 3. THE FULL LOOP, END TO END: capture-shape -> gradeDecisions -> ────────
//       buildInseasonResolutions -> gradeDecisions AGAIN, now scored ────────
{
  const decision = {
    kind: 'lineup_call', decision_at: 't1',
    payload: {
      key: 'w1', week: 3,
      recommended: [{ id: 'a', name: 'A', pos: 'RB' }, { id: 'b', name: 'B', pos: 'WR' }],
      counterfactual: [{ id: 'c', name: 'C', pos: 'RB' }, { id: 'd', name: 'D', pos: 'WR' }],
    },
  };
  const beforeResolution = gradeDecisions([decision]).inseason.rows[0];
  ck('before any outcome exists, the row is present but genuinely UNSCORED',
    beforeResolution.edge === undefined && !beforeResolution.counterfactual_missing, beforeResolution);

  const weeklyPoints = { 3: { a: 15, b: 9, c: 10, d: 11 } };
  const resolutions = buildInseasonResolutions([decision], weeklyPoints);
  const afterResolution = gradeDecisions([decision, ...resolutions]).inseason.rows[0];
  ck('once the resolution joins by key, gradeDecisions scores it: chosen 24 vs cf 21, edge +3',
    afterResolution.realized_chosen === 24 && afterResolution.realized_counterfactual === 21
      && afterResolution.edge === 3, afterResolution);
  ck('and the tool_won/counterfactual_won tally reflects it',
    gradeDecisions([decision, ...resolutions]).inseason.tool_won === 1, null);
}

// ── 4. PROVEN AGAINST REAL HISTORY, NOT ONLY HAND-BUILT NUMBERS ─────────────
// Same discipline as draft/tools/lineup_edge_backtest.js: a resolver that only
// works on numbers I invented is not proven to work on the shape real weekly
// data will actually have. Build a lineup_call decision from a REAL 2023-25
// team-week (recommended = the real starters, counterfactual = a different
// real roster subset), resolve it against the REAL players_points for that
// week, and check the arithmetic against an independent hand-sum.
{
  const fs = require('fs');
  const hist = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'league_history.json'), 'utf8'));
  const season = (hist.seasons || []).find(s => String(s.season) === '2023');
  const wk3 = (season.weeks || {})['3'] || [];
  const entry = wk3.find(e => e.roster_id === 3);   // the same real row this session's earlier
                                                     // investigation (the infer_positions bug) used
  ck('CONTROL — the real fixture row exists, so this proves something', !!entry, !!entry);
  if (entry) {
    const allIds = Object.keys(entry.players_points || {});
    const half = Math.ceil(allIds.length / 2);
    const recommendedIds = entry.starters.slice(0, 5);           // a real 5-player subset
    const counterfactualIds = allIds.filter(id => !recommendedIds.includes(id)).slice(0, 5);
    const decision = {
      kind: 'lineup_call', decision_at: 't1',
      payload: {
        key: 'real1', week: 3,
        recommended: recommendedIds.map(id => ({ id })),
        counterfactual: counterfactualIds.map(id => ({ id })),
      },
    };
    const weeklyPoints = { 3: entry.players_points };
    const res = buildInseasonResolutions([decision], weeklyPoints);
    const handSum = ids => ids.reduce((s, id) => s + Number(entry.players_points[id] || 0), 0);
    const expectedChosen = Math.round(handSum(recommendedIds) * 100) / 100;
    const expectedCf = Math.round(handSum(counterfactualIds) * 100) / 100;
    ck('resolver\'s realized_chosen matches an independent hand-sum over REAL 2023 box-score points',
      res[0].payload.realized_chosen === expectedChosen,
      { got: res[0].payload.realized_chosen, expected: expectedChosen });
    ck('resolver\'s realized_counterfactual matches an independent hand-sum, same real data',
      res[0].payload.realized_counterfactual === expectedCf,
      { got: res[0].payload.realized_counterfactual, expected: expectedCf });
  }
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: a real /lineup/log capture now resolves `chosen`');
console.log('correctly (was permanently null), and once real weekly points exist for a');
console.log('decision\'s week, buildInseasonResolutions() correctly sums each named');
console.log('player\'s realized points for both the recommended and counterfactual lineup');
console.log('and gradeDecisions() scores the edge between them — proven against both hand-');
console.log('built numbers and a real historical team-week, not assumed from the shape.');
console.log('WHAT IT DOES NOT: supply real 2026 weekly data (does not exist yet — season');
console.log('has not started). The other three kinds are no longer this file\'s open item:');
console.log('waiver_claim/stream_call/inseason_override resolvers landed 2026-08-15 and are');
console.log('proven in waiver_stream_resolution.test.js; the full capture->resolve->grade->');
console.log('read loop is driven end-to-end in loop_closure_live.test.js.');
