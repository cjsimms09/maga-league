// TERRITORY: A
/* ROSTER -> SEASON OUTCOME DISTRIBUTION — the pure functions behind the
 * archetype comparison's season scoring.
 *
 * WHAT IS REAL AND WHAT IS MODEL, stated up front (rule: never present a
 * simulated outcome as a measurement):
 *
 *   REAL   the board's proj_mean / bye per player (the priced projection
 *          inputs — own_v6's column is display-only and is NOT read here),
 *          the league's starters (QB1 RB2 WR2 TE1 FLEX1 K1 DEF1), the
 *          15-week regular season (playoff_week_start 16), and the measured
 *          league weekly-score sd (champodds CFG.WEEKLY_SD = 21.3, measured
 *          over 30 team-seasons 2023-25).
 *   MODEL  everything else. Weekly player points are proj_mean spread flat
 *          over non-bye weeks; team weekly scores are Normal draws; matchups
 *          are random pairings (preseason — no schedule exists). These are
 *          model outcomes, not measurements.
 *
 * WEEKLY MEANS. A player with a known bye contributes proj_mean/16 in each
 * of his 16 possible game-weeks and 0 on his bye (conserves the season
 * total across the 17-week NFL season). A player with NO bye on the board is
 * spread proj_mean/17 flat — absent is not zero, and inventing a bye would
 * coerce an unknown into a value; the caller receives `unknown_bye` as a
 * COUNT so the gap is visible, never silently absorbed.
 *
 * WEEKLY LINEUP. Optimal legal lineup per week by that week's means (greedy
 * per dedicated position + best remaining flex — exact for one FLEX with
 * nested eligibility; same fill roster_room_audit.js and slot_schedule.js's
 * brute-force-verified DP produce). This is a CEILING lineup (perfect
 * start/sit); it isolates roster quality from weekly manager error, the same
 * denominator roster_sim.py argues for.
 *
 * STANDINGS MC. Seeded mulberry32 + Box-Muller (the same generators
 * standings.js/champodds.js use). Each sim: 15 weeks, every team draws
 * Normal(week mean, sd), random pairings each week, standings by
 * (wins, points-for). Playoff = top 4 (the league's real cut), bust =
 * bottom 3. Championship probability is NOT computed here — the driver gets
 * it from src/routes/champodds.js `simulate` (the bracket pinned to the
 * league's real playoff format), and archetype_season.test.js holds this
 * module's playoff_prob against champodds' on the same strengths (rule 11:
 * consistency across derivation paths).
 *
 * Exact identities held by test with float epsilon only (rule 10b): in every
 * sim exactly 4 teams make the playoff and exactly 3 finish bottom-3, so
 * sum(playoff_prob) = 4 and sum(bottom3_prob) = 3 exactly.
 */
'use strict';

const STARTERS = { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DEF: 1 }; // + 1 FLEX
const FLEX_ELIG = ['RB', 'WR', 'TE'];
const REGULAR_SEASON_WEEKS = 15;   // playoff_week_start 16 — 2023-25 pinned
const NFL_WEEKS = 17;              // one bye -> 16 possible games

function mulberry32(seed) {
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

/** Per-player expected points in week w (1-based). */
function playerWeekMean(p, w) {
  const season = Number(p.proj_mean) || 0;
  const bye = p.bye == null ? null : Number(p.bye);
  if (bye == null) return season / NFL_WEEKS;      // unknown bye: flat spread
  if (w === bye) return 0;
  return season / (NFL_WEEKS - 1);
}

/** Optimal legal lineup points for one week's per-player means. Exact for
 *  dedicated slots + one FLEX. `weekPts` maps player_id -> points. */
function lineupPointsForWeek(roster, weekPts) {
  const byPos = {};
  roster.forEach(p => {
    if (!p || !p.position) return;
    (byPos[p.position] || (byPos[p.position] = [])).push(p);
  });
  const pts = p => weekPts[String(p.player_id)] || 0;
  Object.keys(byPos).forEach(pos => byPos[pos].sort((a, b) => pts(b) - pts(a)));
  let total = 0;
  Object.keys(STARTERS).forEach(pos => {
    const have = byPos[pos] || [];
    for (let i = 0; i < STARTERS[pos]; i++) if (have[i]) total += pts(have[i]);
  });
  let flexBest = 0;
  FLEX_ELIG.forEach(pos => {
    const extra = (byPos[pos] || [])[STARTERS[pos]];
    if (extra && pts(extra) > flexBest) flexBest = pts(extra);
  });
  return total + flexBest;
}

/**
 * Roster -> weekly expected starting-lineup series over the regular season.
 * Returns { series: number[15], mean_weekly, unknown_bye }.
 */
function weeklyTeamMeans(roster, weeks = REGULAR_SEASON_WEEKS) {
  const clean = (roster || []).filter(p => p && p.position);
  const unknownBye = clean.filter(p => p.bye == null && (Number(p.proj_mean) || 0) > 0).length;
  const series = [];
  for (let w = 1; w <= weeks; w++) {
    const weekPts = {};
    clean.forEach(p => { weekPts[String(p.player_id)] = playerWeekMean(p, w); });
    series.push(lineupPointsForWeek(clean, weekPts));
  }
  const mean = series.length ? series.reduce((s, x) => s + x, 0) / series.length : 0;
  return { series, mean_weekly: mean, unknown_bye: unknownBye };
}

/**
 * Regular-season standings Monte Carlo.
 * @param teams  { id: number[] } weekly mean series per team (equal lengths)
 * @param opts   { sd, sims, seed, playoffCut = 4, bottomN = 3 }
 * @returns { [id]: { playoff_prob, bottom3_prob, exp_wins, mean_weekly } }
 */
function standingsMC(teams, opts) {
  const o = opts || {};
  const sd = o.sd;
  if (!(sd > 0)) throw new Error('standingsMC: sd required and > 0 — pass the measured league sd, do not default silently');
  const sims = o.sims || 2000;
  const seed = o.seed == null ? 1 : o.seed;
  const cut = o.playoffCut == null ? 4 : o.playoffCut;
  const bottomN = o.bottomN == null ? 3 : o.bottomN;
  const ids = Object.keys(teams);
  if (ids.length < 2) throw new Error('standingsMC: need >= 2 teams');
  const weeks = teams[ids[0]].length;
  ids.forEach(id => {
    if (teams[id].length !== weeks) throw new Error('standingsMC: unequal week series');
  });
  const rand = mulberry32(seed);
  const made = {}, bottom = {}, winSum = {};
  ids.forEach(id => { made[id] = 0; bottom[id] = 0; winSum[id] = 0; });

  for (let s = 0; s < sims; s++) {
    const rec = {};
    ids.forEach(id => { rec[id] = { id, wins: 0, pf: 0 }; });
    for (let w = 0; w < weeks; w++) {
      // Draw every team's score, then pair randomly (preseason: no schedule).
      const drawn = {};
      ids.forEach(id => { drawn[id] = gauss(rand, teams[id][w], sd); });
      const order = ids.slice();
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      for (let i = 0; i + 1 < order.length; i += 2) {
        const a = order[i], b = order[i + 1];
        rec[a].pf += drawn[a]; rec[b].pf += drawn[b];
        if (drawn[a] > drawn[b]) rec[a].wins++;
        else if (drawn[b] > drawn[a]) rec[b].wins++;
      }
      // Odd team out (never happens at 10 teams; kept honest anyway).
      if (order.length % 2) rec[order[order.length - 1]].pf += drawn[order[order.length - 1]];
    }
    const table = ids.map(id => rec[id])
      .sort((a, b) => (b.wins - a.wins) || (b.pf - a.pf));
    for (let i = 0; i < cut; i++) made[table[i].id]++;
    for (let i = table.length - bottomN; i < table.length; i++) bottom[table[i].id]++;
    ids.forEach(id => { winSum[id] += rec[id].wins; });
  }

  const out = {};
  ids.forEach(id => {
    out[id] = {
      playoff_prob: made[id] / sims,
      bottom3_prob: bottom[id] / sims,
      exp_wins: winSum[id] / sims,
      mean_weekly: teams[id].reduce((s, x) => s + x, 0) / weeks,
    };
  });
  return out;
}

module.exports = { STARTERS, FLEX_ELIG, REGULAR_SEASON_WEEKS, NFL_WEEKS,
  mulberry32, gauss, playerWeekMean, lineupPointsForWeek, weeklyTeamMeans,
  standingsMC };
