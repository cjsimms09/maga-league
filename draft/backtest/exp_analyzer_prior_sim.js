// TERRITORY: A
/* EXP-ANALYZER-PRIOR — the backtest runner. Implements
 * draft/backtest/EXP-ANALYZER-PRIOR-PREREG.md (commit a0c70705, which precedes
 * this file and any result).
 *
 * Cory's hypothesis: the analyzer's record projections should use projected
 * points for each team's actual matchups. The schedule half already ships
 * (projectStandings simulates the real weekly pairs). This tests the scores
 * half: ARM A = shipped league-mean shrink prior, ARM B = shrink toward a
 * projection-derived team mean (0.7/0.3 recency-blend best-lineup sum over the
 * opening roster, centered on the through-week league mean), same K=4 weight
 * schedule, same sd, same seeds — the shrink TARGET is the only difference.
 *
 * WHY THE SIM IS MIRRORED HERE instead of calling projectStandings with
 * opts.projMeans: that hook is a COMMENT in src/routes/standings.js — nothing
 * in the function reads opts.projMeans (recorded in the prereg before results).
 * src/routes/** is another agent's lane tonight, so the sim body is copied
 * verbatim with the mean injectable, and a PARITY GATE proves the copy: for
 * every cell, ARM A must reproduce the shipped projectStandings output
 * bit-for-bit (same seed, same draws) or the whole run refuses with
 * parity_failed rather than reporting numbers from a divergent simulator.
 *
 * Run: node draft/backtest/exp_analyzer_prior_sim.js
 * Reads exp_analyzer_prior_means.json (built by exp_analyzer_prior_means.py).
 * Writes draft/backtest/exp_analyzer_prior.json. Offline, deterministic.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ST = require(path.join(__dirname, '..', '..', 'src', 'routes', 'standings.js'));
const LO = require(path.join(__dirname, '..', '..', 'src', 'routes', 'lineup.js'));

const MEANS = JSON.parse(fs.readFileSync(path.join(__dirname, 'exp_analyzer_prior_means.json'), 'utf8'));
const OUT = path.join(__dirname, 'exp_analyzer_prior.json');

// ── preregistered constants ──────────────────────────────────────────────────
const SEASONS = [2023, 2024, 2025];
const CHECKPOINTS = Array.from({ length: 12 }, (_, i) => i + 1);   // W = 1..12
const SIMS = 3000;
const SEED_BASE = 999;          // seed = SEED_BASE + W (the shipped validator's)
const SPOTS = 4;
const K = 4;                    // the shipped shrink schedule, unchanged
const PERM_RESAMPLES = 20000;
const PERM_SEED = 20260815;
const EARLY_WINDOW = [1, 2, 3, 4];   // preregistered secondary subgroup

// ── mulberry32 + Box-Muller, verbatim from src/routes/standings.js ──────────
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rand, mean, sd) {
  const u = Math.max(1e-12, rand()), v = rand();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* The projectStandings body, verbatim except the drawn-mean lookup goes
 * through meanFor(rid, week, strength) — everything else (RNG stream, orders,
 * locked-week accounting, seeding, sort) is the shipped code path. */
function simProject(season, opts, meanFor) {
  opts = opts || {};
  const throughWeek = opts.throughWeek == null ? 0 : opts.throughWeek;
  const sims = opts.sims || 4000;
  const seed = opts.seed || 12345;
  const spots = Number(opts.spots) > 0 ? Number(opts.spots) : SPOTS;
  const weeks = LO.regularSeasonWeeks(season);
  const wm = LO.weeklyMatchups(season);
  const fws = LO.fieldWeeklyScores(season);
  const strength = ST.teamStrength(season, throughWeek > 0 ? throughWeek : weeks[weeks.length - 1]);
  const rids = Object.keys(strength).map(Number);
  const lockedWeeks = weeks.filter(w => w <= throughWeek);
  const futureWeeks = weeks.filter(w => w > throughWeek);

  const baseRec = {};
  rids.forEach(r => { baseRec[r] = { rid: r, wins: 0, pf: 0 }; });
  for (const w of lockedWeeks) {
    const scores = fws[w] || {}, pairs = wm[w] || {}, seen = new Set();
    for (const rid of rids) {
      baseRec[rid].pf += Number(scores[rid] || 0);
      const opp = pairs[rid];
      if (opp == null || seen.has(rid)) continue;
      seen.add(rid); seen.add(opp);
      const a = Number(scores[rid] || 0), b = Number(scores[opp] || 0);
      if (a > b) baseRec[rid].wins++; else if (b > a && baseRec[opp]) baseRec[opp].wins++;
    }
  }

  const rand = rng(seed);
  const madeCount = {}, winSum = {};
  rids.forEach(r => { madeCount[r] = 0; winSum[r] = 0; });

  for (let s = 0; s < sims; s++) {
    const rec = {};
    rids.forEach(r => { rec[r] = { rid: r, wins: baseRec[r].wins, pf: baseRec[r].pf }; });
    for (const w of futureWeeks) {
      const pairs = wm[w] || {}, seen = new Set();
      const drawn = {};
      rids.forEach(r => {
        const t = strength[r];
        drawn[r] = gauss(rand, meanFor(r, w, strength), t.sd);
      });
      for (const rid of rids) {
        rec[rid].pf += drawn[rid];
        const opp = pairs[rid];
        if (opp == null || seen.has(rid)) continue;
        seen.add(rid); seen.add(opp);
        if (drawn[rid] > drawn[opp]) rec[rid].wins++; else if (rec[opp]) rec[opp].wins++;
      }
    }
    const order = ST.seedOrder(Object.values(rec));
    order.forEach((rid, i) => {
      winSum[rid] += rec[rid].wins;
      if (i < spots) madeCount[rid]++;
    });
  }

  return rids.map(r => ({
    rid: r,
    exp_wins: winSum[r] / sims,
    playoff_prob: madeCount[r] / sims,
  })).sort((a, b) => b.playoff_prob - a.playoff_prob || b.exp_wins - a.exp_wins);
}

// naiveTop4 is not exported by standings.js — mirrored verbatim (control only).
function naiveTop4(season, throughWeek) {
  const fws = LO.fieldWeeklyScores(season);
  const wm = LO.weeklyMatchups(season);
  const weeks = LO.regularSeasonWeeks(season).filter(w => w <= throughWeek);
  const rec = {};
  const ensure = r => (rec[r] = rec[r] || { rid: Number(r), wins: 0, pf: 0 });
  for (const w of weeks) {
    const scores = fws[w] || {}, pairs = wm[w] || {}, seen = new Set();
    for (const rid of Object.keys(scores)) {
      ensure(rid).pf += Number(scores[rid] || 0);
      const opp = pairs[rid];
      if (opp == null || seen.has(rid)) continue;
      seen.add(rid); seen.add(String(opp));
      const a = Number(scores[rid] || 0), b = Number(scores[opp] || 0);
      ensure(opp);
      if (a > b) rec[rid].wins++; else if (b > a) rec[opp].wins++;
    }
  }
  return ST.seedOrder(Object.values(rec)).slice(0, SPOTS);
}

// ── metrics per prereg ───────────────────────────────────────────────────────
function scoreArm(proj, actualSet, actualWins) {
  const predTop = proj.slice(0, SPOTS).map(p => p.rid);
  const hits = predTop.filter(r => actualSet.has(Number(r))).length;
  let mae = 0, brier = 0;
  for (const p of proj) {
    mae += Math.abs(p.exp_wins - actualWins[p.rid]);
    const made = actualSet.has(Number(p.rid)) ? 1 : 0;
    brier += (p.playoff_prob - made) * (p.playoff_prob - made);
  }
  return { hits, mae: mae / proj.length, brier: brier / proj.length, predTop };
}

// paired two-sided sign-flip permutation on per-cell deltas (prereg)
function signFlipP(deltas, resamples, seed) {
  const n = deltas.length;
  if (!n) return { mean: null, p: null, n: 0 };
  const obs = deltas.reduce((a, b) => a + b, 0) / n;
  const rand = rng(seed);
  let ge = 0;
  for (let i = 0; i < resamples; i++) {
    let s = 0;
    for (const d of deltas) s += (rand() < 0.5 ? -d : d);
    if (Math.abs(s / n) >= Math.abs(obs) - 1e-12) ge++;
  }
  return { mean: obs, p: ge / resamples, n };
}

// ── run ──────────────────────────────────────────────────────────────────────
function main() {
  const history = LO.harvest();
  const art = {
    _territory: 'TERRITORY: A — produced by draft/backtest/exp_analyzer_prior_sim.js',
    _prereg: 'draft/backtest/EXP-ANALYZER-PRIOR-PREREG.md (commit a0c70705)',
    params: { sims: SIMS, seed_base: SEED_BASE, spots: SPOTS, K, checkpoints: CHECKPOINTS,
      perm_resamples: PERM_RESAMPLES, perm_seed: PERM_SEED, early_window: EARLY_WINDOW },
    parity: { checked: 0, failed: 0 },
    season_status: MEANS.status,
    cells: [],
    pooled: {}, per_week: {}, crossover: {}, controls: {},
  };

  for (const year of SEASONS) {
    const season = LO.seasonOf(history, String(year));
    if (!season) throw new Error('season missing: ' + year);
    const actualSet = new Set(ST.actualPlayoffTeams(season).map(Number));
    const rec = ST.actualStandings(season);
    const actualWins = {};
    Object.values(rec).forEach(r => { actualWins[r.rid] = r.wins; });

    const priors = (MEANS.team_prior[String(year)]) || null;       // {rid: weekly prior}
    const priorsByWeek = (MEANS.team_prior_by_week[String(year)]) || null;

    for (const W of CHECKPOINTS) {
      const opts = { throughWeek: W, sims: SIMS, seed: SEED_BASE + W, spots: SPOTS };

      // PARITY GATE: arm A (mean_shrunk) must equal the shipped function exactly.
      const armA = simProject(season, opts, (r, w, st) =>
        st[r].mean_shrunk != null ? st[r].mean_shrunk : st[r].mean);
      const shipped = ST.projectStandings(season, opts).projections;
      art.parity.checked++;
      const shipMap = {};
      shipped.forEach(p => { shipMap[p.rid] = p; });
      for (const p of armA) {
        const q = shipMap[p.rid];
        if (!q || q.exp_wins !== p.exp_wins || q.playoff_prob !== p.playoff_prob) {
          art.parity.failed++;
          art.verdict = 'parity_failed';
          fs.writeFileSync(OUT, JSON.stringify(art, null, 1) + '\n');
          console.error('PARITY FAILED at', year, 'W' + W, 'rid', p.rid);
          process.exit(1);
        }
      }

      // shared quantities for the prior arms
      const strength = ST.teamStrength(season, W);
      const rids = Object.keys(strength).map(Number);
      const leagueMeanW = rids.reduce((s, r) => s + strength[r].mean, 0) / rids.length;
      const wgt = {};
      rids.forEach(r => { wgt[r] = strength[r].gp / (strength[r].gp + K); });

      const cell = { season: year, throughWeek: W };
      cell.A = scoreArm(armA, actualSet, actualWins);
      cell.naive_hits = naiveTop4(season, W).filter(r => actualSet.has(Number(r))).length;

      if (priors) {
        const pMean = rids.reduce((s, r) => s + priors[String(r)], 0) / rids.length;
        const target = {};   // ARM B: centered offset anchored to leagueMean_W
        rids.forEach(r => { target[r] = leagueMeanW + (priors[String(r)] - pMean); });
        const armB = simProject(season, opts, (r) =>
          wgt[r] * strength[r].mean + (1 - wgt[r]) * target[r]);
        cell.B = scoreArm(armB, actualSet, actualWins);

        const armBraw = simProject(season, opts, (r) =>
          wgt[r] * strength[r].mean + (1 - wgt[r]) * priors[String(r)]);
        cell.B_raw = scoreArm(armBraw, actualSet, actualWins);

        if (priorsByWeek) {   // ARM C — ADMITTED LEAK, diagnostic ceiling only
          const tgtByWeek = {};
          for (const [w, m] of Object.entries(priorsByWeek)) {
            const mm = rids.reduce((s, r) => s + m[String(r)], 0) / rids.length;
            tgtByWeek[w] = {};
            rids.forEach(r => { tgtByWeek[w][r] = leagueMeanW + (m[String(r)] - mm); });
          }
          const armC = simProject(season, opts, (r, w) => {
            const t = (tgtByWeek[String(w)] || {})[r];
            return t == null ? (wgt[r] * strength[r].mean + (1 - wgt[r]) * target[r])
              : wgt[r] * strength[r].mean + (1 - wgt[r]) * t;
          });
          cell.C = scoreArm(armC, actualSet, actualWins);
        }
      }
      art.cells.push(cell);
      console.log(`${year} W${String(W).padStart(2)}  A hits=${cell.A.hits} mae=${cell.A.mae.toFixed(2)} brier=${cell.A.brier.toFixed(3)}`
        + (cell.B ? `  B hits=${cell.B.hits} mae=${cell.B.mae.toFixed(2)} brier=${cell.B.brier.toFixed(3)}` : '  B n/a')
        + (cell.C ? `  C hits=${cell.C.hits} mae=${cell.C.mae.toFixed(2)} brier=${cell.C.brier.toFixed(3)}` : '')
        + `  naive=${cell.naive_hits}`);
    }
  }

  // ── pooled comparisons (prereg decision rule) ─────────────────────────────
  const bCells = art.cells.filter(c => c.B);
  const metricDelta = (cells, arm, metric) => cells.map(c => c[arm][metric] - c.A[metric]);
  const comparisons = {};
  for (const arm of ['B', 'B_raw', 'C']) {
    const cs = bCells.filter(c => c[arm]);
    if (!cs.length) continue;
    comparisons[arm] = {};
    for (const [metric, better] of [['hits', 'higher'], ['mae', 'lower'], ['brier', 'lower']]) {
      const all = signFlipP(metricDelta(cs, arm, metric), PERM_RESAMPLES, PERM_SEED);
      const early = signFlipP(
        metricDelta(cs.filter(c => EARLY_WINDOW.includes(c.throughWeek)), arm, metric),
        PERM_RESAMPLES, PERM_SEED);
      const favorsArm = better === 'higher' ? all.mean > 0 : all.mean < 0;
      comparisons[arm][metric] = {
        better_direction: better,
        pooled_delta_vs_A: all.mean, p_two_sided: all.p, n_cells: all.n,
        early_window_delta: early.mean, early_window_p: early.p, early_n: early.n,
        wins: arm === 'B' ? (favorsArm && all.p < 0.05) : undefined,
        direction_favors_arm: favorsArm,
      };
    }
  }
  art.pooled = comparisons;

  // per-week pooled deltas + crossover (descriptive, prereg)
  for (const arm of ['B', 'C']) {
    const perW = {};
    for (const W of CHECKPOINTS) {
      const cs = bCells.filter(c => c.throughWeek === W && c[arm]);
      if (!cs.length) continue;
      perW[W] = {
        d_hits: cs.reduce((s, c) => s + c[arm].hits - c.A.hits, 0) / cs.length,
        d_mae: cs.reduce((s, c) => s + c[arm].mae - c.A.mae, 0) / cs.length,
        d_brier: cs.reduce((s, c) => s + c[arm].brier - c.A.brier, 0) / cs.length,
      };
    }
    art.per_week[arm] = perW;
    // benefit orientation: hits up is good, mae/brier down is good
    const benefit = { hits: W => perW[W].d_hits, mae: W => -perW[W].d_mae, brier: W => -perW[W].d_brier };
    art.crossover[arm] = {};
    for (const m of ['hits', 'mae', 'brier']) {
      let cross = null;
      const Ws = Object.keys(perW).map(Number).sort((a, b) => a - b);
      for (const W of Ws) {
        if (Ws.filter(x => x >= W).every(x => benefit[m](x) <= 1e-12)) { cross = W; break; }
      }
      art.crossover[arm][m] = cross;   // null = benefit persists through W12
    }
  }

  // controls
  art.controls = {
    naive_hits_mean_all_cells: art.cells.reduce((s, c) => s + c.naive_hits, 0) / art.cells.length,
    random_set_expected_hits: SPOTS * SPOTS / 10,
    constant_p_brier: (() => { const p = SPOTS / 10; return p * (1 - p); })(),  // 0.4·0.6 = 0.24
  };

  // per-season pooled (descriptive)
  art.per_season = {};
  for (const year of SEASONS) {
    const cs = art.cells.filter(c => c.season === year);
    const agg = arm => cs[0][arm] == null ? null : {
      hits: cs.reduce((s, c) => s + c[arm].hits, 0) / cs.length,
      mae: cs.reduce((s, c) => s + c[arm].mae, 0) / cs.length,
      brier: cs.reduce((s, c) => s + c[arm].brier, 0) / cs.length,
    };
    art.per_season[year] = { A: agg('A'), B: agg('B'), B_raw: agg('B_raw'), C: agg('C'),
      naive_hits: cs.reduce((s, c) => s + c.naive_hits, 0) / cs.length };
  }

  art.verdict = (() => {
    const b = comparisons.B || {};
    const won = Object.entries(b).filter(([, v]) => v.wins).map(([m]) => m);
    if (won.length) return 'B_wins: ' + won.join(',');
    const dir = Object.entries(b).filter(([, v]) => v.direction_favors_arm).map(([m]) => m);
    return dir.length ? 'no_detectable_improvement (direction favors B on: ' + dir.join(',') + ')'
      : 'no_detectable_improvement';
  })();

  fs.writeFileSync(OUT, JSON.stringify(art, null, 1) + '\n');
  console.log('\nparity:', JSON.stringify(art.parity));
  console.log('pooled:', JSON.stringify(art.pooled, null, 1));
  console.log('crossover:', JSON.stringify(art.crossover));
  console.log('verdict:', art.verdict);
  console.log('wrote', OUT);
}

main();
