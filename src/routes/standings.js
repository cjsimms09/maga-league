/* THE ROSTER ANALYZER — league projected standings (tool 4, SYSTEM-BUILD-PLAN #1).
 *
 * Projects every team's rest-of-season outcome from their roster: who makes the
 * playoffs (top 4 of 10), who is mathematically chasing only the weekly high, who
 * is desperate and will overpay in a trade. This is the piece that makes the other
 * three tools smarter — today each of them reasons about my roster in isolation.
 *   - Waiver: who ELSE will claim the player I want (which teams are short there).
 *   - Draft: what the room needs.
 *   - Lineup: how strong my opponent actually is this week (not a flat variance).
 *
 * HOW IT PROJECTS
 * A team's weekly score ~ Normal(mean, sd). Live, mean comes from the roster's
 * projections through the shared valuation's best-lineup; for the HISTORICAL
 * VALIDATION here it comes from the team's OWN past weeks (weeks 1..throughWeek),
 * which is the honest forward test — predict the rest of the season from what was
 * known so far, never from the weeks being predicted. Locked (already-played)
 * weeks keep their real results; remaining weeks are simulated on the ACTUAL
 * schedule many times to build each team's win distribution, playoff odds and
 * seed distribution.
 *
 * ⚠️ THIS SENTENCE USED TO END "...seed distribution and expected payoff", AND
 * NOTHING HERE COMPUTES A PAYOFF. `payoff` appeared exactly once in this file:
 * in that sentence. A comment describing an implementation reads exactly like
 * the implementation (rule 11e), and this one was read as a feature for weeks.
 * Expected dollars would need a CHAMPIONSHIP probability first — the playoff pot
 * is 53% of the money — and this simulation stops at the SEED. It counts who
 * finishes in the top `spots` and never plays the bracket, so there is no
 * championship probability here either. Both absences are recorded as data in
 * `src/analyzer_claims.js` NOT_EMITTED, with what each would need.
 *
 * DONE STANDARD: this runs over the real 2023-25 seasons (draft/tests/
 * standings.test.js), and is graded two ways — did the predicted top-4 match the
 * actual playoff teams, and were the probabilities calibrated (teams given 70%
 * made it ~70% of the time). A guessed number says so.
 *
 * Deterministic: no Date/Math.random at module scope; the simulator takes an
 * explicit integer seed so a run reproduces.
 */
'use strict';
const LO = require('./lineup');
const PO = require('./playoffs');   // the one definition of the playoff cut

// HOW MANY MAKE THE PLAYOFFS — the DEFAULT only, and it comes from the one
// definition the rest of the site uses (routes/playoffs.playoffCut). This file
// kept its own 4, which is right for the 2023-25 seasons the validator grades
// but wrong the day the league changes playoff_teams: /matchup, the standings
// column and the recap would all move and the analyzer would still say four.
// projectStandings takes the real cut per call and REPORTS the one it used, so
// the page draws its cut line from the number the simulation actually ran with
// rather than from a constant beside it.
const PLAYOFF_SPOTS = PO.playoffCut({});

// --- a tiny seeded RNG so simulation is reproducible (mulberry32) --------------
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
  // Box-Muller
  const u = Math.max(1e-12, rand()), v = rand();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// --- actual regular-season standings from H2H results --------------------------
function actualStandings(season) {
  const fws = LO.fieldWeeklyScores(season);
  const wm = LO.weeklyMatchups(season);
  const weeks = LO.regularSeasonWeeks(season);
  const rec = {};
  const ensure = r => (rec[r] = rec[r] || { rid: Number(r), wins: 0, losses: 0, ties: 0, pf: 0 });
  for (const w of weeks) {
    const scores = fws[w] || {}, pairs = wm[w] || {};
    const seen = new Set();
    for (const rid of Object.keys(scores)) {
      const me = ensure(rid); me.pf += Number(scores[rid] || 0);
      const opp = pairs[rid];
      if (opp == null || seen.has(rid)) continue;
      seen.add(rid); seen.add(String(opp));
      const a = Number(scores[rid] || 0), b = Number(scores[opp] || 0);
      ensure(opp);
      if (a > b) { rec[rid].wins++; rec[opp].losses++; }
      else if (b > a) { rec[opp].wins++; rec[rid].losses++; }
      else { rec[rid].ties++; rec[opp].ties++; }
    }
  }
  return rec;
}

// rank rids by (wins, pf) desc -> playoff seeds
function seedOrder(recArr) {
  return recArr.slice().sort((a, b) => (b.wins - a.wins) || (b.pf - a.pf)).map(r => r.rid);
}
function actualPlayoffTeams(season) {
  const rec = actualStandings(season);
  return seedOrder(Object.values(rec)).slice(0, PLAYOFF_SPOTS);
}

// --- team strength from weeks 1..throughWeek (the forward-test input) ----------
/* A fantasy team's week-to-week scoring spread, MEASURED on this league rather
 * than guessed: across 2023-25, 30 team-seasons, the within-team weekly sd is
 * median 21.3 / mean 20.7. Used only for a preseason projection, where there is
 * no sample to take an sd from. A season's own sd replaces it the moment games
 * are played (teamStrength). */
const DEFAULT_WEEKLY_SD = 21;

/* PROJECTED WEEKLY MEAN PER ROSTER, from the starters a season actually has.
 *
 * The preseason input `projectStandings` needs: for each roster, the sum of its
 * STARTERS' weekly projections. Uses the week's own starters (post-draft, real)
 * and proj_feed's pricing, so the analyzer's projection and the lineup tool's
 * numbers come from one source and cannot disagree on screen.
 *
 * REFUSES A ROSTER IT CANNOT PRICE rather than returning a smaller number: a
 * team summed over 7 of 9 starters is not a weaker team, it is a different
 * quantity, and on a playoff-odds table it is indistinguishable from a real one.
 * `matchupGap` in proj_feed takes the same position for the same reason.
 *
 * ⚠️ THE BOARD ALONE CANNOT PRICE A ROSTER, AND THE REASON IS STRUCTURAL.
 * `public/draft_data.json` is the AVAILABLE pool — drafted and kept players are
 * removed from it — so pricing rosters off the board means pricing them off the
 * one list guaranteed not to contain them. Measured 2026-09-06: 23 of the 90
 * week-1 starters were absent, and they were the league's best players (Gibbs,
 * Chase, Henry, Jeanty, A.J. Brown, Jonathan Taylor). Nine of ten rosters were
 * unpriceable; the tenth priced only because its whole lineup happened to still
 * sit in the pool.
 *
 * So `opts.weeklyById` — the week's own committed projection snapshot
 * (own_weekly_<season>_w<week>.json, which prices ROSTERED players) — takes
 * precedence, and the board is the fallback for what it does not carry (K and
 * DEF, which have no proj_ownmodel upstream). Board ∪ snapshot covered 90/90.
 */
function projMeansFromStarters(season, feed, opts) {
  const o = opts || {};
  const week = o.week || (LO.regularSeasonWeeks(season) || [1])[0];
  const entries = ((season.weeks || {})[String(week)]) || [];
  const PF = require('../proj_feed');
  const wk = o.weeklyById || {};
  const means = {}, unpriced = {}, sources = {};
  for (const e of entries) {
    if (!e || e.roster_id == null) continue;
    const starters = (e.starters || []).filter(id => id != null && id !== '0');
    if (!starters.length) { unpriced[e.roster_id] = ['no starters recorded']; continue; }
    // snapshot first, board second — and record which priced each starter so a
    // reader can tell a projected team from a half-projected one.
    const fromSnap = starters.filter(id => Number.isFinite(Number(wk[String(id)])));
    const rest = starters.filter(id => !Number.isFinite(Number(wk[String(id)])));
    const r = PF.rosterProjections(rest, feed);
    const bad = (r.missing || []).concat(
      (r.rows || []).filter(x => x.proj == null).map(x => x.id));
    if (bad.length) { unpriced[e.roster_id] = bad; continue; }
    means[e.roster_id] =
      fromSnap.reduce((s, id) => s + Number(wk[String(id)]), 0)
      + (r.rows || []).reduce((s, x) => s + Number(x.proj), 0);
    sources[e.roster_id] = { snapshot: fromSnap.length, board: (r.rows || []).length };
  }
  return { means, unpriced, sources };
}

function teamStrength(season, throughWeek) {
  const fws = LO.fieldWeeklyScores(season);
  const weeks = LO.regularSeasonWeeks(season).filter(w => w <= throughWeek);
  const acc = {};
  for (const w of weeks) {
    for (const rid of Object.keys(fws[w] || {})) {
      (acc[rid] = acc[rid] || []).push(Number(fws[w][rid] || 0));
    }
  }
  const out = {};
  const allMeans = [];
  for (const rid of Object.keys(acc)) {
    const a = acc[rid], n = a.length;
    const mean = a.reduce((x, y) => x + y, 0) / Math.max(1, n);
    const varc = n > 1 ? a.reduce((x, y) => x + (y - mean) * (y - mean), 0) / (n - 1) : 0;
    out[rid] = { rid: Number(rid), mean, sd: Math.sqrt(varc), gp: n };
    allMeans.push(mean);
  }
  // Shrink each team's mean toward the league mean by its sample size — with only
  // a few games played, a hot start is partly luck. Empirical-Bayes-lite: weight
  // = gp / (gp + K). K=4 is a DESIGNED-GUESS (about a month of regression);
  // sweeping it is future work, flagged.
  const leagueMean = allMeans.reduce((x, y) => x + y, 0) / Math.max(1, allMeans.length);
  const K = 4;
  const leagueSd = Math.sqrt(allMeans.reduce((x, m) => x + (m - leagueMean) * (m - leagueMean), 0)
    / Math.max(1, allMeans.length)) || 12;
  for (const rid of Object.keys(out)) {
    const t = out[rid], wgt = t.gp / (t.gp + K);
    t.mean_shrunk = wgt * t.mean + (1 - wgt) * leagueMean;
    if (!(t.sd > 0)) t.sd = leagueSd || 20;   // early weeks: fall back to league spread
  }
  return out;
}

// --- project final standings by simulating the remaining schedule --------------
function projectStandings(season, opts) {
  opts = opts || {};
  const throughWeek = opts.throughWeek == null ? 0 : opts.throughWeek;
  const sims = opts.sims || 4000;
  const seed = opts.seed || 12345;
  const spots = Number(opts.spots) > 0 ? Number(opts.spots) : PLAYOFF_SPOTS;
  const weeks = LO.regularSeasonWeeks(season);
  const wm = LO.weeklyMatchups(season);
  const fws = LO.fieldWeeklyScores(season);
  /* ── PRESEASON: PROJECTED MEANS, OR NOTHING ──────────────────────────────
   * `opts.projMeans {rid: mean}` was documented here on the line below and
   * READ NOWHERE — one comment, zero implementations (relay, 2026-09-06).
   * That is why THE ANALYZER SHOWED 2025 WEEK 9 four days before the 2026
   * opener: with no preseason path, the page could only offer a season that
   * had already been played.
   *
   * The failure mode if you simply point it at 2026 is worse than the bug.
   * A not-yet-played season is harvested with its real schedule and real
   * post-draft rosters but ALL-ZERO points, so teamStrength() returns ten
   * teams at mean 0, sd 0 — every game a coin flip, every probability
   * identical, drawn as a confident table. That is exactly the shape this
   * page's own banner warns about ("a table that looks confident and says
   * nothing"), and Rule 3d says a uniform result is a bug report.
   *
   * So preseason is served by projected means or it REFUSES. It never falls
   * back to strength computed over placeholder zeros. */
  let strength;
  if (throughWeek === 0) {
    const pm = opts.projMeans;
    if (!pm || !Object.keys(pm).length) {
      const e = new Error('preseason projection needs opts.projMeans '
        + '(no games played, so team strength cannot come from results)');
      e.code = 'NO_PROJ_MEANS';
      throw e;
    }
    // A projection is not a sample: there is nothing to shrink toward the
    // league mean, so mean_shrunk IS the mean. sd is the week-to-week spread
    // of a fantasy team's score — supplied by the caller when it has been
    // measured, else this league's own historical spread.
    const sd = Number(opts.projSd) > 0 ? Number(opts.projSd) : DEFAULT_WEEKLY_SD;
    strength = {};
    for (const rid of Object.keys(pm)) {
      const mean = Number(pm[rid]);
      if (!Number.isFinite(mean)) continue;
      strength[rid] = { rid: Number(rid), mean, mean_shrunk: mean, sd, gp: 0 };
    }
    if (!Object.keys(strength).length) {
      const e = new Error('preseason projection: opts.projMeans held no finite means');
      e.code = 'NO_PROJ_MEANS';
      throw e;
    }
  } else {
    strength = teamStrength(season, throughWeek);
  }
  const rids = Object.keys(strength).map(Number);
  const lockedWeeks = weeks.filter(w => w <= throughWeek);
  const futureWeeks = weeks.filter(w => w > throughWeek);

  // locked wins/pf from real results
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
  const madeCount = {}, seedCount = {}, winSum = {};
  rids.forEach(r => { madeCount[r] = 0; seedCount[r] = {}; winSum[r] = 0; });

  for (let s = 0; s < sims; s++) {
    const rec = {};
    rids.forEach(r => { rec[r] = { rid: r, wins: baseRec[r].wins, pf: baseRec[r].pf }; });
    for (const w of futureWeeks) {
      const pairs = wm[w] || {}, seen = new Set();
      const drawn = {};
      rids.forEach(r => {
        const t = strength[r];
        drawn[r] = gauss(rand, t.mean_shrunk != null ? t.mean_shrunk : t.mean, t.sd);
      });
      for (const rid of rids) {
        rec[rid].pf += drawn[rid];
        const opp = pairs[rid];
        if (opp == null || seen.has(rid)) continue;
        seen.add(rid); seen.add(opp);
        if (drawn[rid] > drawn[opp]) rec[rid].wins++; else if (rec[opp]) rec[opp].wins++;
      }
    }
    const order = seedOrder(Object.values(rec));
    order.forEach((rid, i) => {
      winSum[rid] += rec[rid].wins;
      if (i < spots) { madeCount[rid]++; seedCount[rid][i + 1] = (seedCount[rid][i + 1] || 0) + 1; }
    });
  }

  const proj = rids.map(r => {
    const seedDist = {};
    for (let k = 1; k <= spots; k++) seedDist[k] = (seedCount[r][k] || 0) / sims;
    return {
      rid: r,
      exp_wins: winSum[r] / sims,
      playoff_prob: madeCount[r] / sims,
      seed_dist: seedDist,
      strength_mean: strength[r].mean_shrunk != null ? strength[r].mean_shrunk : strength[r].mean,
      posture: null,   // filled below
    };
  }).sort((a, b) => b.playoff_prob - a.playoff_prob || b.exp_wins - a.exp_wins);

  // POSTURE — the classification the other tools consume.
  proj.forEach(p => {
    if (p.playoff_prob >= 0.85) p.posture = 'lock';              // playoffs ~secured
    else if (p.playoff_prob <= 0.10) p.posture = 'chasing_high'; // only live money is the weekly $100
    else if (p.playoff_prob <= 0.30) p.posture = 'desperate';    // long shot; will overpay to swing it
    else p.posture = 'contender';                                // fighting for a spot
  });
  return { season, throughWeek, spots, projections: proj };
}

// Naive baseline: predict the playoff teams as whoever leads in wins RIGHT NOW
// (through throughWeek), no simulation. If the simulator can't beat this, it isn't
// earning its complexity.
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
  return seedOrder(Object.values(rec)).slice(0, PLAYOFF_SPOTS);
}

// --- VALIDATION over the real seasons ------------------------------------------
// Grades the projector two ways: predicted top-4 vs actual, and calibration.
function validateStandings(seasonYears, checkpoints) {
  const history = LO.harvest();
  seasonYears = seasonYears || LO.defaultSeasons(history);
  checkpoints = checkpoints || [4, 7, 10];
  const calib = {};   // bucket -> {made, total}
  const bucket = p => Math.min(9, Math.floor(p * 10));   // 0..9 deciles
  const rows = [];
  for (const year of seasonYears) {
    // Resolve the year to the season OBJECT the primitives expect — passing the
    // bare string returns empty everywhere and silently scores 0/4.
    const season = LO.seasonOf(history, year);
    if (!season) continue;
    const actual = new Set(actualPlayoffTeams(season).map(Number));
    for (const cw of checkpoints) {
      const proj = projectStandings(season, { throughWeek: cw, sims: 3000, seed: 999 + cw });
      const predTop = proj.projections.slice(0, PLAYOFF_SPOTS).map(p => p.rid);
      const hit = predTop.filter(r => actual.has(Number(r))).length;
      const naiveHit = naiveTop4(season, cw).filter(r => actual.has(Number(r))).length;
      rows.push({ season: year, throughWeek: cw, hit, naiveHit, of: PLAYOFF_SPOTS,
        predicted: predTop, actual: [...actual] });
      for (const p of proj.projections) {
        const b = bucket(p.playoff_prob);
        calib[b] = calib[b] || { made: 0, total: 0 };
        calib[b].total++;
        if (actual.has(Number(p.rid))) calib[b].made++;
      }
    }
  }
  const totalHit = rows.reduce((s, r) => s + r.hit, 0);
  const totalNaive = rows.reduce((s, r) => s + r.naiveHit, 0);
  const totalPoss = rows.length * PLAYOFF_SPOTS;
  const calibRows = Object.keys(calib).map(Number).sort((a, b) => a - b).map(b => ({
    bucket: (b * 10) + '-' + (b * 10 + 10) + '%',
    predicted_mid: (b * 10 + 5) / 100,
    actual_rate: calib[b].made / calib[b].total,
    n: calib[b].total,
  }));
  return { rows, top4_hit: totalHit, top4_possible: totalPoss,
    top4_accuracy: totalHit / totalPoss,
    naive_hit: totalNaive, naive_accuracy: totalNaive / totalPoss,
    calibration: calibRows };
}

module.exports = {
  actualStandings, actualPlayoffTeams, teamStrength, projectStandings,
  validateStandings, seedOrder, PLAYOFF_SPOTS,
  projMeansFromStarters, DEFAULT_WEEKLY_SD,
};

// Run directly for a readout: node src/routes/standings.js
if (require.main === module) {
  const v = validateStandings();
  console.log('ROSTER ANALYZER — historical validation (2023-25, forward test)\n');
  v.rows.forEach(r => console.log(
    `  ${r.season} @wk${r.throughWeek}: predicted top-4 got ${r.hit}/${r.of} actual playoff teams`));
  console.log(`\n  TOP-4 ACCURACY: ${v.top4_hit}/${v.top4_possible} = ${(v.top4_accuracy * 100).toFixed(0)}%`
    + `   (naive current-standings baseline: ${(v.naive_accuracy * 100).toFixed(0)}%)`);
  console.log('\n  CALIBRATION (predicted playoff prob vs actual rate):');
  v.calibration.forEach(c => console.log(
    `    ${c.bucket.padEnd(8)} predicted~${(c.predicted_mid * 100).toFixed(0)}%  actual ${(c.actual_rate * 100).toFixed(0)}%  (n=${c.n})`));
}
