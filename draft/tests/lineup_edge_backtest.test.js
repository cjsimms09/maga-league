'use strict';
// TERRITORY: A
// THE LINEUP EDGE BACKTEST'S OWN MECHANICS, tested directly — not just the
// headline numbers it prints, which can drift as league_history.json or the
// bye-week data does. Built 2026-08-15 answering Cory's direct question:
// "Have we retested our lineup optimizer to prove they're working and giving
// an edge or at least not hurting?"
//
// Run: node draft/tests/lineup_edge_backtest.test.js
const path = require('path');
const backtestMod = require(path.join(__dirname, '..', 'tools', 'lineup_edge_backtest.js'));
const { backtest, summarize } = backtestMod;

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 300) : ''))); };

// ── summarize(): pure aggregation logic, no data dependency ────────────────
{
  const rows = [
    { actual: 100, tool: 110, optimal: 130 },  // tool beats actual, captures 1/3 of the ceiling
    { actual: 100, tool: 90, optimal: 130 },   // tool loses, moves AWAY from optimal
    { actual: 100, tool: 100, optimal: 130 },  // exact tie
  ];
  const s = summarize(rows);
  ck('n counts every row', s.n === 3);
  ck('beats/ties/loses partition exactly, no row double-counted or dropped',
    s.beatsActual + s.tiesActual + s.losesToActual === s.n,
    { beats: s.beatsActual, ties: s.tiesActual, loses: s.losesToActual });
  ck('beatsActual is exactly the row where tool > actual', s.beatsActual === 1);
  ck('avgActual/avgTool/avgOptimal are plain means', s.avgActual === 100 && s.avgTool === 100 && s.avgOptimal === 130);
  ck('edgeVsActual is avgTool - avgActual, signed correctly (here: net zero)', s.edgeVsActual === 0, s.edgeVsActual);
}
{
  // A tool that always MATCHES the true optimal should show 100% ceiling
  // capture — the metric's own calibration point.
  const rows = [{ actual: 100, tool: 130, optimal: 130 }, { actual: 90, tool: 120, optimal: 120 }];
  const s = summarize(rows);
  ck('a tool matching the optimal every time shows exactly 100% ceiling capture',
    s.ceilingCapturePct === 100, s.ceilingCapturePct);
}
{
  // A tool that never beats what was actually played (tool == actual always)
  // should show exactly 0% ceiling capture — closes none of the available gap.
  const rows = [{ actual: 100, tool: 100, optimal: 130 }, { actual: 90, tool: 90, optimal: 120 }];
  const s = summarize(rows);
  ck('a tool that never improves on actual shows exactly 0% ceiling capture',
    s.ceilingCapturePct === 0, s.ceilingCapturePct);
}

// ── backtest(): against the real data — pinning structural properties that
// must hold regardless of exactly which numbers land, so this test survives
// league_history.json being extended with a new season. ────────────────────
{
  const { rows, skippedNoHistory, seasons, byeExclusions } = backtest();
  ck('produces real rows against the actual history data', rows.length > 300, rows.length);
  ck('every row has all three comparison points', rows.every(r =>
    typeof r.actual === 'number' && typeof r.tool === 'number' && typeof r.optimal === 'number'));
  ck('optimal is never less than actual — hindsight can only match or beat what was played, never lose to it',
    rows.every(r => r.optimal >= r.actual - 0.01), // float slop
    rows.filter(r => r.optimal < r.actual - 0.01).slice(0, 3));
  ck('week-1-of-season team-weeks are skipped, not given a bogus zero-history projection',
    skippedNoHistory.length > 0, skippedNoHistory.length);
  ck('bye exclusions were actually applied for 2023 and 2024 (the years real schedule data exists for)',
    (byeExclusions['2023'] || 0) > 0 && (byeExclusions['2024'] || 0) > 0, byeExclusions);
  ck('2025 gets NO bye exclusions — no pretending to a correction the data cannot support',
    !byeExclusions['2025'], byeExclusions);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
