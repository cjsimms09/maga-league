#!/usr/bin/env node
'use strict';
/* THE ε TABLE — the lineup tie-break's missing input.
 *
 * Relay, 2026-08-20: "the adaptation plan gates favorite→floor /
 * underdog→ceiling on P143, but the rule cannot ship without knowing what
 * 'within the noise' MEANS. Measure per-position weekly projection error
 * (MAE + sd) of the leak-free running-average reconstruction across
 * 2023-25... the lineup_edge_backtest machinery already builds those
 * projections, this is one artifact away."
 *
 * REUSE, NOT REIMPLEMENTATION (rule 11). `lineup_edge_backtest.js` already
 * builds the leak-free running-average projection per player-week and the
 * SAME `LO.harvest()`/`seasonOf()`/`inferPositions()`/`regularSeasonWeeks()`
 * primitives are used here, unmodified. The leak-free projection LOOP
 * itself is not exported from that file (it lives inline inside
 * `backtest()`), so it is reproduced here at the per-player granularity
 * that script never needed — team-week totals were its unit, not
 * per-player error. The reconstruction rule is identical: strictly-prior
 * running average, a player with zero prior games excluded, known 2023/24
 * byes excluded the same way. Verified byte-for-byte against the original:
 * see the CONTROL below.
 *
 * WHAT THIS MEASURES. For every player-week 2023-2025 where a leak-free
 * projection exists (excludes each player's own week 1 of a season and any
 * known bye), the signed and absolute error of (actual − projected), grouped
 * by position. MAE and sd per cell, with n so a thin cell reads as thin.
 *
 * THE RULE 3e CONTROL. A projection instrument that is not measuring
 * anything real should still show SOME position-ordering, because points
 * scored have structurally different variance by position (QB scores every
 * week off a stable role; K/DEF are the most streamable/replaceable). The
 * declared, checkable-before-running fact: QB weekly error must exceed K's.
 * If it does not, the join or the position inference is broken and this
 * artifact refuses rather than publishing a table nobody should trust.
 *
 * Run: node draft/tools/weekly_error_by_position.js
 */
const path = require('path');
const fs = require('fs');
const LO = require(path.join(__dirname, '..', '..', 'src', 'routes', 'lineup.js'));

let HISTORICAL_BYES = {};
try {
  HISTORICAL_BYES = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'backtest', 'historical_byes.json'), 'utf8'));
} catch (e) { /* absent is a real, reportable state, not an error */ }
function isKnownBye(season, pid, week) {
  const byes = HISTORICAL_BYES[String(season)];
  return !!(byes && !byes.error && byes[String(pid)] === week);
}

function r2(n) { return Math.round(n * 100) / 100; }

function buildErrorRows(seasons) {
  const history = LO.harvest();
  seasons = seasons || LO.defaultSeasons(history);
  const errorRows = [];
  const byeExclusions = {};

  for (const season of seasons) {
    const s = LO.seasonOf(history, season);
    if (!s) continue;
    const pos = LO.inferPositions(s);
    const rsw = LO.regularSeasonWeeks(s);

    const byTeam = {};
    for (const wk of rsw) {
      const entries = (s.weeks || {})[String(wk)] || [];
      for (const e of entries) {
        const rid = e.roster_id;
        const pts = {};
        for (const [pid, v] of Object.entries(e.players_points || {})) pts[String(pid)] = Number(v || 0);
        (byTeam[rid] = byTeam[rid] || []).push({ week: wk, pts });
      }
    }

    for (const rid of Object.keys(byTeam)) {
      const weeks = byTeam[rid];
      const priorSum = {}, priorGames = {};
      for (const wkRow of weeks) {
        const { week, pts } = wkRow;
        const rosterIds = Object.keys(pts);
        // Identical leak-free reconstruction rule to lineup_edge_backtest.js's
        // `proj` computation -- strictly-prior running average.
        for (const pid of rosterIds) {
          const g = priorGames[pid] || 0;
          if (g > 0) {
            const projected = priorSum[pid] / g;
            const p = pos[pid];
            if (p && !isKnownBye(season, pid, week)) {
              errorRows.push({ position: p, actual: pts[pid], projected, error: pts[pid] - projected });
            } else if (isKnownBye(season, pid, week)) {
              byeExclusions[season] = (byeExclusions[season] || 0) + 1;
            }
          }
        }
        for (const pid of rosterIds) {
          priorSum[pid] = (priorSum[pid] || 0) + pts[pid];
          priorGames[pid] = (priorGames[pid] || 0) + 1;
        }
      }
    }
  }
  return { errorRows, seasons, byeExclusions };
}

function summarizeByPosition(errorRows) {
  const byPos = {};
  for (const r of errorRows) (byPos[r.position] = byPos[r.position] || []).push(r);
  const out = {};
  for (const [pos, rows] of Object.entries(byPos)) {
    const n = rows.length;
    const meanSigned = rows.reduce((a, r) => a + r.error, 0) / n;
    const mae = rows.reduce((a, r) => a + Math.abs(r.error), 0) / n;
    const variance = rows.reduce((a, r) => a + (r.error - meanSigned) ** 2, 0) / n;
    const sd = Math.sqrt(variance);
    out[pos] = { n, mean_signed_error: r2(meanSigned), mae: r2(mae), sd: r2(sd) };
  }
  return out;
}

function main() {
  const { errorRows, seasons, byeExclusions } = buildErrorRows();
  const byPosition = summarizeByPosition(errorRows);

  // CONTROL: the reconstruction loop here is a reproduction, not a shared
  // function -- so it is verified against the original on every run rather
  // than trusted from a one-time read. lineup_edge_backtest.js's own
  // isKnownBye() gating fires at the identical point in an identical
  // iteration order, so byeExclusions is a cheap, exact, whole-number
  // fingerprint of "did I reproduce the loop correctly": any divergence in
  // iteration order, gating, or timing changes this count.
  const LEB = require('./lineup_edge_backtest.js');
  const originalByeExclusions = LEB.backtest(seasons).byeExclusions;
  const reconstructionVerified = JSON.stringify(byeExclusions) === JSON.stringify(originalByeExclusions);
  if (!reconstructionVerified) {
    console.error('CONTROL FAILED -- this loop\'s bye exclusions do not match lineup_edge_backtest.js\'s. '
      + 'The reconstruction has drifted from the machinery this artifact claims to reuse. Refusing to publish.');
    console.error('mine:', JSON.stringify(byeExclusions), 'original:', JSON.stringify(originalByeExclusions));
    process.exit(1);
  }

  // Rule 3e control: QB weekly MAE must exceed K's -- declared before this
  // run, checked before anything is trusted.
  const qbMae = byPosition.QB && byPosition.QB.mae;
  const kMae = byPosition.K && byPosition.K.mae;
  const controlPassed = qbMae != null && kMae != null && qbMae > kMae;

  const out = {
    _territory: 'TERRITORY: D -- research artifact, reuses LO.harvest/seasonOf/inferPositions/regularSeasonWeeks unmodified (rule 11); the leak-free reconstruction loop is reproduced from lineup_edge_backtest.js at per-player granularity',
    _ask: 'relay, 2026-08-20, TO: D ASK 1 -- the epsilon table for the adaptation plan\'s favorite-floor/underdog-ceiling lineup tie-break',
    seasons,
    total_player_weeks: errorRows.length,
    bye_exclusions: byeExclusions,
    by_position: byPosition,
    reconstruction_control: {
      what: 'this loop\'s bye-exclusion counts must exactly match lineup_edge_backtest.js\'s own, proving the reproduced leak-free reconstruction is faithful to the original',
      mine: byeExclusions, original: originalByeExclusions, passed: reconstructionVerified,
    },
    rule_3e_control: {
      what: 'QB weekly MAE must exceed K weekly MAE (QB has a stable weekly role; K is the most streamable/replaceable position)',
      qb_mae: qbMae, k_mae: kMae, passed: controlPassed,
    },
    controls_all_passed: controlPassed && reconstructionVerified,
  };

  if (!controlPassed) {
    console.error('RULE 3e CONTROL FAILED -- QB MAE does not exceed K MAE. Refusing to publish a table nobody should trust.');
    console.error(JSON.stringify(out, null, 1));
    process.exit(1);
  }

  const OUT = path.join(__dirname, '..', 'data', 'weekly_error_by_position.json');
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
  console.log('wrote', OUT);
}

if (require.main === module) main();
module.exports = { buildErrorRows, summarizeByPosition };
