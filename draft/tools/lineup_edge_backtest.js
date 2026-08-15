#!/usr/bin/env node
'use strict';
/* LINEUP OPTIMIZER — DOES IT ACTUALLY HELP? Tested against real history,
 * not assumed from "the assignment math is provably optimal."
 *
 * Built 2026-08-15, prompted directly by Cory: "Have we retested our lineup
 * optimizer to prove they're working and giving an edge or at least not
 * hurting?" The honest answer before this script: no. What existed
 * (ceilingLeak/replayEfficiency in src/routes/lineup.js) measures the GAP
 * between what was actually played and the TRUE OPTIMAL with full hindsight
 * — a real, useful number, but it says nothing about whether the TOOL's
 * actual recommendation engine, fed only information available BEFORE a
 * week's games, would have closed any of that gap. lineup_skill.test.js
 * separately proves bestLineup()'s ASSIGNMENT logic is exhaustively optimal
 * given a set of projected points — but optimal assignment over bad
 * projections is still a bad recommendation. Nothing tied those two proofs
 * together into "would following this tool, week to week, have beaten what
 * actually happened."
 *
 * THIS DOES. For every real team-week in 2023-2025 (after each team's own
 * week 1, which has no prior in-season data to project from), it:
 *   1. Builds a LEAK-FREE weekly projection per rostered player — the
 *      running average of points/game from STRICTLY PRIOR weeks THIS
 *      SEASON. This is the honest reconstruction of the tool's own
 *      "season-avg" fallback path (liveOptimizeFor in src/routes/member.js)
 *      — Sleeper's own live weekly projections aren't retrievable
 *      retroactively, so this backtests the fallback the tool actually
 *      falls back to, not a number we can't reproduce.
 *   2. Runs the SAME bestLineup() solver the live tool uses on those
 *      projections -> "what the tool would have recommended."
 *   3. Looks up what those exact players ACTUALLY scored that week (already
 *      known — this is history) -> "what following the tool would have
 *      scored."
 *   4. Compares against what was ACTUALLY played (the human's real lineup)
 *      and the TRUE OPTIMAL (perfect hindsight, same solver on real
 *      results) — the same ceiling ceilingLeak() already computes.
 *
 * Run: node draft/tools/lineup_edge_backtest.js
 */
const path = require('path');
const fs = require('fs');
const LO = require(path.join(__dirname, '..', '..', 'src', 'routes', 'lineup.js'));

// Real NFL bye weeks, by our own player_id, for 2023/2024 only — built by
// draft/backtest/build_historical_byes.py from nflverse's actual weekly
// team-presence data (2025 isn't published there yet, same constraint
// own_projections.py's own fix hit). Loaded once; a run without this file
// present still works, just without the bye correction — reported, not
// silently assumed.
let HISTORICAL_BYES = {};
try {
  HISTORICAL_BYES = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'backtest', 'historical_byes.json'), 'utf8'));
} catch (e) { /* absent is a real, reportable state, not an error */ }
function isKnownBye(season, pid, week) {
  const byes = HISTORICAL_BYES[String(season)];
  return !!(byes && !byes.error && byes[String(pid)] === week);
}

function slotCount(slots) {
  return Object.values(slots).reduce((a, b) => a + b, 0);
}

function backtest(seasons) {
  const history = LO.harvest();
  seasons = seasons || LO.defaultSeasons(history);
  const rows = [];
  const skippedNoHistory = [];
  const byeExclusions = {};

  for (const season of seasons) {
    const s = LO.seasonOf(history, season);
    if (!s) continue;
    const pos = LO.inferPositions(s);
    const rsw = LO.regularSeasonWeeks(s);
    const template = s.roster_positions || [];
    const slots = template.length ? LO.slotsFromTemplate(template) : LO.DEFAULT_SLOTS;
    const need = slotCount(slots);

    // Group real weekly entries by roster, in chronological order.
    const byTeam = {};
    for (const wk of rsw) {
      const entries = (s.weeks || {})[String(wk)] || [];
      for (const e of entries) {
        const rid = e.roster_id;
        const pts = {};
        for (const [pid, v] of Object.entries(e.players_points || {})) pts[String(pid)] = Number(v || 0);
        (byTeam[rid] = byTeam[rid] || []).push({ week: wk, pts, actualScore: Number(e.points || 0) });
      }
    }

    for (const rid of Object.keys(byTeam)) {
      const weeks = byTeam[rid];
      const priorSum = {}, priorGames = {};
      for (const wkRow of weeks) {
        const { week, pts, actualScore } = wkRow;
        const rosterIds = Object.keys(pts);
        // Leak-free projection: strictly-prior running average. A player with
        // zero prior games this season (week 1, or just added) has no
        // reconstructable projection and is excluded from the tool's pool —
        // exactly what "projPending"/the zero-fallback does live.
        const proj = {};
        for (const pid of rosterIds) {
          const g = priorGames[pid] || 0;
          if (g > 0) proj[pid] = priorSum[pid] / g;
        }
        // Known-bye exclusion (2023/2024 only — see HISTORICAL_BYES above):
        // a real player is unplayable this week regardless of how good his
        // running average looks, exactly like the live tool's isInactive()
        // guard. This is the ONE piece of "current-week context" this
        // backtest can fairly reconstruct without leaking performance data —
        // real bye schedules are public knowledge before the season starts.
        const projectedIds = rosterIds.filter(pid => {
          if (proj[pid] == null) return false;
          if (isKnownBye(season, pid, week)) {
            byeExclusions[season] = (byeExclusions[season] || 0) + 1;
            return false;
          }
          return true;
        });
        if (projectedIds.length < need) {
          skippedNoHistory.push({ season, roster_id: rid, week });
        } else {
          const toolLineup = LO.bestLineup(proj, pos, projectedIds, slots);
          const toolRealized = toolLineup.starters.reduce((a, st) => a + (pts[st.pid] || 0), 0);
          const optimal = LO.bestLineup(pts, pos, rosterIds, slots).points;
          rows.push({
            season, roster_id: rid, week,
            actual: actualScore, tool: Math.round(toolRealized * 100) / 100, optimal,
          });
        }
        // Update running totals AFTER this week, so it never leaks into its
        // own projection.
        for (const pid of rosterIds) {
          priorSum[pid] = (priorSum[pid] || 0) + pts[pid];
          priorGames[pid] = (priorGames[pid] || 0) + 1;
        }
      }
    }
  }
  return { rows, skippedNoHistory, seasons, byeExclusions };
}

function summarize(rows) {
  const n = rows.length;
  const sum = k => rows.reduce((a, r) => a + r[k], 0);
  const beatsActual = rows.filter(r => r.tool > r.actual).length;
  const tiesActual = rows.filter(r => r.tool === r.actual).length;
  const losesToActual = rows.filter(r => r.tool < r.actual).length;
  const avgActual = sum('actual') / n, avgTool = sum('tool') / n, avgOptimal = sum('optimal') / n;
  const toolCaptureOfCeiling = avg =>
    (avgOptimal - avgActual) > 0 ? (avg - avgActual) / (avgOptimal - avgActual) : null;
  return {
    n, avgActual: r2(avgActual), avgTool: r2(avgTool), avgOptimal: r2(avgOptimal),
    edgeVsActual: r2(avgTool - avgActual),
    beatsActual, tiesActual, losesToActual,
    beatsActualPct: r2(100 * beatsActual / n), losesToActualPct: r2(100 * losesToActual / n),
    // What fraction of the theoretically-available leak (optimal - actual)
    // the tool's own recommendation, using only pre-game info, actually
    // captures. 0% = no better than what was played; 100% = matches the
    // impossible perfect-hindsight ceiling.
    ceilingCapturePct: toolCaptureOfCeiling(avgTool) != null ? r2(100 * toolCaptureOfCeiling(avgTool)) : null,
  };
}
function r2(n) { return Math.round(n * 100) / 100; }

if (require.main === module) {
  const { rows, skippedNoHistory, seasons, byeExclusions } = backtest();
  const overall = summarize(rows);
  console.log(`LINEUP EDGE BACKTEST — ${seasons.join(', ')}`);
  console.log(`  known-bye exclusions applied (2023/2024 only, real nflverse schedule data): `
    + JSON.stringify(byeExclusions));
  const missingByeYears = seasons.filter(s => !(HISTORICAL_BYES[String(s)] && !HISTORICAL_BYES[String(s)].error));
  if (missingByeYears.length) {
    console.log(`  ⚠ NO bye correction for ${missingByeYears.join(', ')} — those seasons' numbers below `
      + `are the UNCORRECTED, structurally-pessimistic version (see file header).`);
  }
  console.log(`  team-weeks tested: ${overall.n} (${skippedNoHistory.length} skipped, insufficient prior-week history)`);
  console.log(`  avg actual (human) score:     ${overall.avgActual}`);
  console.log(`  avg TOOL-recommended score:   ${overall.avgTool}  (edge vs actual: ${overall.edgeVsActual >= 0 ? '+' : ''}${overall.edgeVsActual})`);
  console.log(`  avg TRUE OPTIMAL (hindsight): ${overall.avgOptimal}`);
  console.log(`  tool beats actual: ${overall.beatsActual}/${overall.n} (${overall.beatsActualPct}%)  `
    + `ties: ${overall.tiesActual}  loses: ${overall.losesToActual}/${overall.n} (${overall.losesToActualPct}%)`);
  console.log(`  of the ceiling that WAS available to close (optimal - actual), the tool captured: `
    + `${overall.ceilingCapturePct}%`);

  console.log('\n  PER SEASON:');
  for (const season of seasons) {
    const sr = rows.filter(r => r.season === season);
    if (!sr.length) continue;
    const s = summarize(sr);
    console.log(`    ${season}: n=${s.n}  edge=${s.edgeVsActual >= 0 ? '+' : ''}${s.edgeVsActual}  `
      + `beats=${s.beatsActualPct}%  ceiling-capture=${s.ceilingCapturePct}%`);
  }
}

module.exports = { backtest, summarize };
