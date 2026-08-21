#!/usr/bin/env node
'use strict';
// TERRITORY: D
/* P143 — DOES A LEAK-FREE *BLENDED* WEEKLY PROJECTION FLIP THE TOOL'S EDGE?
 *
 * `lineup_edge_backtest.js` measures the live lineup optimizer against real
 * history using a flat running-average leak-free projection and finds the
 * tool LOSES ~14.5 pts/week to what owners actually played. P143 asks: does
 * replacing that flat average with "your blend's leak-free weekly
 * projections" flip the edge to positive in at least 2 of 3 seasons?
 *
 * ── WHAT "YOUR BLEND" MEANS HERE — DECLARED BEFORE RUNNING (no p-hacking) ──
 *
 * 1. CHECKED: historical WEEKLY external-source (Sleeper/FantasyPros)
 *    projections for 2023-2025 are NOT available for this backtest.
 *    - `draft/backtest/sleeper_hist_proj.json` / SLEEPER-HIST-PROJ-PREREG.md
 *      probed Sleeper's SEASON-total preseason endpoint
 *      (`/projections/nfl/regular/{season}`) — NOT weekly. Verdict: 2023 and
 *      2024 are `leaked_markers` (the "projection" already knows who busted
 *      — REFUSED, not usable), only 2025 is clean.
 *    - `draft/data/weekly_projection_archive/` (the WEEKLY archive) holds
 *      exactly one file, `weekly_projection_archive_2026_w1.json` — capture
 *      only just started, forward-looking, nothing for 2023-2025.
 *    - So even where a Sleeper number exists at all for a past season, it is
 *      (a) season-total not weekly, and (b) leaked/refused for 2 of the 3
 *      backtested seasons. `lineup_edge_backtest.js`'s header claim
 *      ("Sleeper's own live weekly projections aren't retrievable
 *      retroactively") is CONFIRMED for the weekly, in-season case this
 *      backtest needs — verified against the API-probe evidence in this
 *      repo, not assumed from the comment. A literal multi-EXTERNAL-source
 *      week-by-week blend for 2023-2025 is not constructible. Full detail in
 *      the audit doc.
 *
 * 2. SO: apply `multisource_blend.py`'s actual COMBINING RULE — an
 *    unweighted arithmetic MEAN across independently-reasoned "opinions"
 *    (see MEAN_EXCLUDED_POSITIONS / MIN_OPINIONS / the `st.mean(vals)` call
 *    in that file: it is a plain mean of source projections, not a
 *    weighted, regressed, or IRLS combiner) — to multiple leak-free INTERNAL
 *    signals computed from strictly-prior in-season data, instead of one
 *    naive flat average. Two signals, individually justified, then averaged:
 *
 *    SIGNAL A — RECENCY-WEIGHTED AVERAGE (RW). Role/usage drifts within a
 *    season (a rookie's week-2 role is not his week-6 role); the flat
 *    average weighs a stale week-1 game exactly as heavily as last week.
 *    Exponential weights, half-life H = 3 prior games (most recent prior
 *    game weight 1, the one before it 0.5^(1/3), etc.) — 3 games is stated
 *    a priori as "role changes surface over a few games, not one" and is
 *    NOT swept against the outcome below.
 *
 *    SIGNAL B — SHRINKAGE TO POSITION BASELINE (SH). A 1-2 game average is
 *    dominated by single-game noise (weekly_error_by_position.json: sd of
 *    6-12 pts depending on position, larger than most weekly baselines
 *    themselves). Classic empirical-Bayes shrinkage:
 *        SH = (n * playerAvg + K_pos * posBaseline) / (n + K_pos)
 *    where `posBaseline` = pooled avg pts/game at that position (fixed
 *    constant, computed once from all 2023-2025 player-weeks — a population
 *    prior, not a leak of any individual player's own future score), and
 *        K_pos = sigma_within_pos^2 / tau_between_pos^2
 *    is the shrinkage strength in "pseudo-games": sigma_within is
 *    `weekly_error_by_position.json`'s own per-position sd (within-player,
 *    week-to-week noise, already committed this session for a related
 *    purpose per Rule 11 reuse) and tau_between is the between-player sd of
 *    each position's players' own season-pooled per-game averages (genuine
 *    talent spread), computed once below directly from LO.harvest(). Both
 *    are FIXED population constants, computed the same way for every
 *    player-week — never a specific player's own future result read back
 *    into his own current projection.
 *
 *    BLENDED = mean(RW, SH) — the same unweighted-mean combining step
 *    `multisource_blend.py` applies to its own qualifying opinions.
 *
 * Declared BEFORE this script's numbers were looked at. See
 * draft/audit/p143_lineup_edge_leakfree_blend_2026-08-20.md for the full
 * writeup and the grading verdict.
 *
 * Run: node draft/tools/lineup_edge_backtest_blend.js
 */
const path = require('path');
const fs = require('fs');
const LO = require(path.join(__dirname, '..', '..', 'src', 'routes', 'lineup.js'));
const LEB = require(path.join(__dirname, 'lineup_edge_backtest.js'));

const WEEKLY_ERROR_BY_POSITION = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'data', 'weekly_error_by_position.json'), 'utf8'));

const HALF_LIFE_GAMES = 3; // declared a priori — see file header SIGNAL A

// ── Fixed population constants: posBaseline + K_pos per position ───────────
// Computed ONCE from the full 2023-2025 harvest, pooling ALL player-weeks —
// exactly the same population `weekly_error_by_position.json` was built from.
// Not tuned, not looked up per player, not derived from any individual
// player's own future weeks in a way that feeds back into his own row.
function computePositionConstants() {
  const history = LO.harvest();
  const seasons = LO.defaultSeasons(history);
  const perPlayer = {}; // pid -> { position, sum, games }
  const posByPidBySeason = {};
  for (const season of seasons) {
    const s = LO.seasonOf(history, season);
    if (!s) continue;
    const pos = LO.inferPositions(s);
    posByPidBySeason[season] = pos;
    const rsw = LO.regularSeasonWeeks(s);
    for (const wk of rsw) {
      const entries = (s.weeks || {})[String(wk)] || [];
      for (const e of entries) {
        for (const [pid, v] of Object.entries(e.players_points || {})) {
          const p = pos[pid];
          if (!p) continue;
          const pts = Number(v || 0);
          perPlayer[pid] = perPlayer[pid] || { position: p, sum: 0, games: 0 };
          perPlayer[pid].sum += pts;
          perPlayer[pid].games += 1;
        }
      }
    }
  }
  const byPos = {};
  for (const d of Object.values(perPlayer)) (byPos[d.position] = byPos[d.position] || []).push(d);

  const constants = {};
  for (const [pos, arr] of Object.entries(byPos)) {
    let totalSum = 0, totalGames = 0;
    for (const d of arr) { totalSum += d.sum; totalGames += d.games; }
    const posBaseline = totalSum / totalGames;
    // between-player variance of season-pooled per-game averages, players
    // with >=4 games only (keeps the variance estimate itself from being
    // dominated by 1-game small-sample noise)
    const avgs = arr.filter(d => d.games >= 4).map(d => d.sum / d.games);
    const n = avgs.length;
    const mean = avgs.reduce((a, b) => a + b, 0) / n;
    const tauVar = avgs.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    const sigmaWithin = (WEEKLY_ERROR_BY_POSITION.by_position[pos] || {}).sd;
    const kPos = (sigmaWithin != null && tauVar > 0) ? (sigmaWithin * sigmaWithin) / tauVar : 3;
    constants[pos] = { posBaseline, tauVar, sigmaWithin, kPos, n_players_ge4g: n };
  }
  return { constants, posByPidBySeason, seasons };
}

const { constants: POS_CONST, posByPidBySeason } = computePositionConstants();

function recencyWeightedAvg(priorWeeksData) {
  // priorWeeksData: chronological array of {week, pts}, strictly-prior only.
  const n = priorWeeksData.length;
  let wsum = 0, psum = 0;
  for (let i = 0; i < n; i++) {
    const distanceFromMostRecent = (n - 1) - i; // 0 = most recent prior game
    const w = Math.pow(0.5, distanceFromMostRecent / HALF_LIFE_GAMES);
    wsum += w;
    psum += w * priorWeeksData[i].pts;
  }
  return wsum > 0 ? psum / wsum : null;
}

function shrinkageToPosition(priorWeeksData, position) {
  const n = priorWeeksData.length;
  if (!n) return null;
  const playerAvg = priorWeeksData.reduce((a, r) => a + r.pts, 0) / n;
  const pc = POS_CONST[position];
  if (!pc) return playerAvg; // unknown position: no baseline to shrink toward
  const { posBaseline, kPos } = pc;
  return (n * playerAvg + kPos * posBaseline) / (n + kPos);
}

// The declared, preregistered projectFn passed into lineup_edge_backtest.js's
// backtest(). Signature exactly as specified: (priorWeeksData, pid, season, week).
function blendedProject(priorWeeksData, pid, season, week) {
  const pos = (posByPidBySeason[season] || {})[pid];
  const rw = recencyWeightedAvg(priorWeeksData);
  const sh = shrinkageToPosition(priorWeeksData, pos);
  if (sh == null) return rw;
  return (rw + sh) / 2;
}

function r2(n) { return n == null ? null : Math.round(n * 100) / 100; }

function main() {
  const seasons = LO.defaultSeasons(LO.harvest());

  const flat = LEB.backtest(seasons); // default projectFn (unchanged flat average)
  const blend = LEB.backtest(seasons, blendedProject);

  const flatOverall = LEB.summarize(flat.rows);
  const blendOverall = LEB.summarize(blend.rows);

  console.log('P143 — LEAK-FREE BLENDED PROJECTION vs FLAT AVERAGE, LINEUP EDGE BACKTEST');
  console.log(`  positions/constants (fixed, computed once from 2023-2025 harvest + weekly_error_by_position.json):`);
  for (const [pos, c] of Object.entries(POS_CONST)) {
    console.log(`    ${pos}: posBaseline=${r2(c.posBaseline)}  sigma_within(sd)=${c.sigmaWithin}  `
      + `tau_between_sd=${r2(Math.sqrt(c.tauVar))}  K_pos=${r2(c.kPos)}  (n players >=4g: ${c.n_players_ge4g})`);
  }
  console.log(`  half-life for recency weighting: ${HALF_LIFE_GAMES} games (declared a priori)`);

  console.log('\n  OVERALL (pooled 2023-2025):');
  console.log(`    FLAT AVERAGE   n=${flatOverall.n}  edge-vs-human=${flatOverall.edgeVsActual >= 0 ? '+' : ''}${flatOverall.edgeVsActual}  `
    + `optimal=${flatOverall.avgOptimal}  gap-to-optimal=${r2(flatOverall.avgOptimal - flatOverall.avgTool)}  ceiling-capture=${flatOverall.ceilingCapturePct}%`);
  console.log(`    BLENDED        n=${blendOverall.n}  edge-vs-human=${blendOverall.edgeVsActual >= 0 ? '+' : ''}${blendOverall.edgeVsActual}  `
    + `optimal=${blendOverall.avgOptimal}  gap-to-optimal=${r2(blendOverall.avgOptimal - blendOverall.avgTool)}  ceiling-capture=${blendOverall.ceilingCapturePct}%`);

  console.log('\n  PER SEASON:');
  let flippedCount = 0;
  const perSeason = [];
  for (const season of seasons) {
    const fr = flat.rows.filter(r => r.season === season);
    const br = blend.rows.filter(r => r.season === season);
    const fs_ = LEB.summarize(fr);
    const bs = LEB.summarize(br);
    const flipped = fs_.edgeVsActual < 0 && bs.edgeVsActual > 0;
    if (bs.edgeVsActual > 0) flippedCount++;
    perSeason.push({ season, flat: fs_, blend: bs, flippedToPositive: bs.edgeVsActual > 0 });
    console.log(`    ${season}: FLAT edge=${fs_.edgeVsActual >= 0 ? '+' : ''}${fs_.edgeVsActual}  `
      + `BLEND edge=${bs.edgeVsActual >= 0 ? '+' : ''}${bs.edgeVsActual}  `
      + `${bs.edgeVsActual > 0 ? '[POSITIVE]' : '[still negative]'}`);
  }

  const clears = perSeason.filter(s => s.flippedToPositive).length;
  console.log(`\n  P143 BAR: blended edge positive in >=2 of 3 seasons? `
    + `${clears}/3 seasons positive -> ${clears >= 2 ? 'PREDICTION TRUE' : 'PREDICTION FALSE'}`);

  return { seasons, flatOverall, blendOverall, perSeason, posConstants: POS_CONST, halfLife: HALF_LIFE_GAMES, clears };
}

if (require.main === module) {
  main();
}

module.exports = { blendedProject, recencyWeightedAvg, shrinkageToPosition, computePositionConstants, main, HALF_LIFE_GAMES };
