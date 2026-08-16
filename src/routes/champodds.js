// TERRITORY: A
/* CHAMPIONSHIP ODDS — the measured champProb model the pool advisor waits for.
 *
 * WHY THIS EXISTS. The franchise-pool advisor (routes/pooladvisor.js) has the
 * VONA-for-franchises math ready but renders PENDING, because Cory's standing
 * ruling (2026-08-09) forbids manufactured odds: "better it says 'odds pending'
 * than shows a number nobody measured." This module is the measurement. It is
 * the same class of machine as routes/standings.js's projectStandings — a
 * seeded Monte-Carlo forward-test-validated against the real 2023-25 seasons —
 * extended one honest step further: projectStandings stops at the SEED (its own
 * header says so, and analyzer_claims.js records the absence); this plays the
 * bracket.
 *
 * THE BRACKET IS PINNED TO DATA, NOT ASSUMED. All three completed seasons in
 * league_history.json run the same playoff: top 4 by (wins, points-for), semis
 * 1v4 and 2v3 in playoff_week_start (16), winners meet the following week.
 * draft/tests/champodds.test.js recomputes the seed pairings from the raw
 * bracket records each run, so if the league ever changes format this model's
 * assumption fails a test instead of quietly mispricing every pool bet.
 *
 * HOW A PLAYOFF GAME IS DECIDED. The same way projectStandings decides a
 * regular-season game: each team's weekly score ~ Normal(mean, sd), higher draw
 * wins. No home field, no "playoff experience" — nothing exists in fantasy to
 * justify either, and inventing a bracket-only adjustment would be exactly the
 * manufactured number this module exists to replace.
 *
 * THREE ENTRY POINTS, one simulator:
 *   projectChampionship(season, opts)  — history seasons, real schedule, the
 *                                        validation path (throughWeek >= 1).
 *   champProbLive(rows, opts)          — live standings rows (wins/losses/pf),
 *                                        zero extra network calls; the wiring
 *                                        member.js's advisor block consumes.
 *   preseasonFromMeans(opts)           — explicit projected means in, odds out.
 *                                        Nothing on the site calls this; it is
 *                                        for hand-run analysis (the Richard
 *                                        pool memo) and the post-draft rerun,
 *                                        where the caller must say where the
 *                                        means came from.
 *
 * WHAT THE LIVE PATH APPROXIMATES, measured. Live rows carry season totals, not
 * week-by-week scores, so per-team sd is not computable from them. We use the
 * league-wide per-team weekly sd measured over 2023-25 (30 team-seasons):
 * median 21.3, range 12.9-26.5. The validation harness runs the full model AND
 * this constant-sd approximation side by side on history and reports how much
 * champion-prediction quality the approximation costs (see CLI below), so the
 * shortcut's price is a printed number rather than a hope. Schedule: the live
 * path pairs future weeks RANDOMLY each sim — rows don't carry the schedule.
 * projectStandings' own validation shows actual-schedule sims; for CHAMPION
 * odds the schedule's effect passes through the seed distribution, and the
 * validation table quantifies the whole live path against the schedule-true
 * model.
 *
 * LIMITS, stated: once playoff_week_start arrives the regular season is a fact
 * (handled: gamesLeft 0 seeds exactly) but a HALF-PLAYED bracket is not
 * modelled — mid-playoff the honest source is the bracket itself, not this.
 */
'use strict';
const LO = require('./lineup');
const ST = require('./standings');
const PO = require('./playoffs');

const CFG = {
  SIMS: 4000,              // matches projectStandings; ±~1.5% MC error at p≈0.25
  SEED: 20260815,          // deterministic default; callers may override
  // Per-team weekly score sd, MEASURED over 2023-25 regular seasons (30
  // team-seasons, 15 weeks each): median 21.3, mean 20.7, range 12.9-26.5.
  // Used only where per-team sd is not computable (live rows / preseason).
  WEEKLY_SD: 21.3,
  // Empirical-Bayes shrink for live means — the SAME K=4 teamStrength uses, on
  // purpose: two shrinks disagreeing about week 3 would be two different
  // answers to "how good is this team".
  SHRINK_K: 4,
};

// mulberry32 + Box-Muller, same generators standings.js uses. Copied rather
// than imported: standings.js does not export them, and adding exports to a
// file outside this branch's documented crossing set is not worth two lines.
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

/** One playoff among the top-4 seed ids: 1v4, 2v3, winners meet. Each game is a
 *  fresh pair of Normal draws — a semifinal performance says nothing about the
 *  final's. Returns { champ, finalists } — the finalists exist because a
 *  "finishes top 2" bet is priced off reaching the final, and deriving that
 *  anywhere else would be a second bracket that could disagree with this one.
 *  Draw order is game(1v4), game(2v3), final — the same sequence the original
 *  champion-only version used, so seeded results did not move when finalists
 *  were added. */
function playBracket(seeds, strengths, rand) {
  const game = (a, b) => {
    const sa = strengths[a], sb = strengths[b];
    return gauss(rand, sa.mean, sa.sd) > gauss(rand, sb.mean, sb.sd) ? a : b;
  };
  const f1 = game(seeds[0], seeds[3]);
  const f2 = game(seeds[1], seeds[2]);
  return { champ: game(f1, f2), finalists: [f1, f2] };
}

/** Fisher-Yates on a copy, driven by the sim's own rng so runs reproduce. */
function shuffled(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * THE ONE SIMULATOR every entry point funnels into.
 *
 * @param strengths   { id: { mean, sd } }  mean already shrunk by the caller
 * @param baseRec     { id: { wins, pf } }  locked (already-played) results
 * @param futureWeeks number of regular-season weeks still to play
 * @param schedule    [{ id: oppId }] per future week, or null → random pairings
 *                    drawn fresh each sim (each entry keyed both directions)
 * @param cut         playoff spots (the bracket is 4; validated below)
 * @returns { [id]: { champ_prob, playoff_prob, exp_wins } }
 */
function simulate({ strengths, baseRec, futureWeeks, schedule = null, cut = 4,
                    sims = CFG.SIMS, seed = CFG.SEED }) {
  // The bracket is four teams whatever `cut` says — pinned to the league's
  // actual format (verified from the raw bracket records by the test file). A
  // cut other than 4 would need a different bracket shape, and pretending
  // otherwise would misprice silently; refuse instead.
  if (cut !== 4) throw new Error(`bracket model is pinned to a 4-team playoff; got cut=${cut}`);
  const ids = Object.keys(strengths).map(Number);
  const rand = rng(seed);
  const champ = {}, made = {}, winSum = {}, finals = {}, last = {};
  ids.forEach(id => { champ[id] = 0; made[id] = 0; winSum[id] = 0; finals[id] = 0; last[id] = 0; });

  for (let s = 0; s < sims; s++) {
    const rec = {};
    ids.forEach(id => {
      const b = (baseRec && baseRec[id]) || { wins: 0, pf: 0 };
      rec[id] = { id, wins: b.wins, pf: b.pf };
    });
    for (let w = 0; w < futureWeeks; w++) {
      const drawn = {};
      ids.forEach(id => { drawn[id] = gauss(rand, strengths[id].mean, strengths[id].sd); });
      const pairs = schedule && schedule[w] ? schedule[w] : null;
      const order = pairs ? null : shuffled(ids, rand);
      const seen = new Set();
      for (let i = 0; i < ids.length; i++) {
        const a = pairs ? ids[i] : order[i];
        if (seen.has(a)) continue;
        const b = pairs ? pairs[a] : order[i + 1];
        if (b == null || seen.has(b) || !rec[b]) { if (pairs) { rec[a].pf += drawn[a]; seen.add(a); } continue; }
        seen.add(a); seen.add(b);
        rec[a].pf += drawn[a]; rec[b].pf += drawn[b];
        if (drawn[a] > drawn[b]) rec[a].wins++; else if (drawn[b] > drawn[a]) rec[b].wins++;
      }
    }
    const order = Object.values(rec).sort((a, b) => (b.wins - a.wins) || (b.pf - a.pf)).map(r => r.id);
    ids.forEach(id => { winSum[id] += rec[id].wins; });
    const seeds = order.slice(0, cut);
    seeds.forEach(id => { made[id]++; });
    last[order[order.length - 1]]++;
    const br = playBracket(seeds, strengths, rand);
    champ[br.champ]++;
    br.finalists.forEach(id => { finals[id]++; });
  }

  const out = {};
  ids.forEach(id => {
    out[id] = {
      champ_prob: champ[id] / sims,
      playoff_prob: made[id] / sims,
      // Reaching the final ("top 2") and finishing dead last — priced here, in
      // the same sims as the title, so a top-2 bet and a champion bet can never
      // disagree about which bracket they were priced on.
      final_prob: finals[id] / sims,
      last_prob: last[id] / sims,
      exp_wins: winSum[id] / sims,
    };
  });
  return out;
}

/**
 * History-season forward test: strengths from weeks 1..throughWeek ONLY (the
 * same teamStrength projectStandings validates with), real remaining schedule,
 * locked results kept. throughWeek must be >= 1 — there is deliberately no
 * "preseason over history" mode here, because teamStrength at week 0 would
 * need a projected-means source and that caller should use preseasonFromMeans
 * and SAY where the means came from.
 */
function projectChampionship(season, opts = {}) {
  const throughWeek = Number(opts.throughWeek);
  if (!(throughWeek >= 1)) throw new Error('projectChampionship needs throughWeek >= 1 — use preseasonFromMeans for week 0');
  const weeks = LO.regularSeasonWeeks(season);
  const wm = LO.weeklyMatchups(season);
  const fws = LO.fieldWeeklyScores(season);
  const st = ST.teamStrength(season, throughWeek);
  const ids = Object.keys(st).map(Number);

  const strengths = {};
  ids.forEach(id => {
    strengths[id] = {
      mean: st[id].mean_shrunk != null ? st[id].mean_shrunk : st[id].mean,
      sd: opts.constantSd ? CFG.WEEKLY_SD : st[id].sd,
    };
  });

  const baseRec = {};
  ids.forEach(id => { baseRec[id] = { wins: 0, pf: 0 }; });
  const locked = weeks.filter(w => w <= throughWeek);
  for (const w of locked) {
    const scores = fws[w] || {}, pairs = wm[w] || {}, seen = new Set();
    for (const id of ids) {
      baseRec[id].pf += Number(scores[id] || 0);
      const opp = pairs[id];
      if (opp == null || seen.has(id)) continue;
      seen.add(id); seen.add(opp);
      const a = Number(scores[id] || 0), b = Number(scores[opp] || 0);
      if (a > b) baseRec[id].wins++; else if (b > a && baseRec[opp]) baseRec[opp].wins++;
    }
  }

  const future = weeks.filter(w => w > throughWeek);
  // Real schedule when we have it; each week keyed both directions already.
  const schedule = opts.randomSchedule ? null : future.map(w => wm[w] || {});
  return simulate({
    strengths, baseRec, futureWeeks: future.length, schedule,
    cut: 4, sims: opts.sims || CFG.SIMS, seed: opts.seed || CFG.SEED,
  });
}

/**
 * LIVE rows → { owner_id: champ_prob }. Zero extra fetches: means from pf over
 * games played (shrunk, K=4 — teamStrength's own K), sd the measured league
 * constant, future weeks paired randomly. The validation CLI prices both
 * approximations against the schedule-true model; run it before trusting a
 * number here further than it reports.
 *
 * @param rows [{ owner_id, wins, losses, ties?, pf }]
 * @param gamesLeft regular-season games each team still plays
 */
function champProbLive(rows, gamesLeft, opts = {}) {
  const clean = (rows || []).filter(r => r && r.owner_id != null);
  if (!clean.length) return null;
  const gp = r => (Number(r.wins) || 0) + (Number(r.losses) || 0) + (Number(r.ties) || 0);
  if (clean.some(r => gp(r) < 1)) return null;   // preseason: nothing measured yet — stay pending
  const means = clean.map(r => r.pf / gp(r));
  const leagueMean = means.reduce((a, b) => a + b, 0) / means.length;
  const strengths = {}, baseRec = {};
  for (const r of clean) {
    const g = gp(r), m = r.pf / g, wgt = g / (g + CFG.SHRINK_K);
    strengths[r.owner_id] = { mean: wgt * m + (1 - wgt) * leagueMean, sd: CFG.WEEKLY_SD };
    baseRec[r.owner_id] = { wins: Number(r.wins) || 0, pf: Number(r.pf) || 0 };
  }
  const res = simulate({
    strengths, baseRec, futureWeeks: Math.max(0, Number(gamesLeft) || 0), schedule: null,
    cut: 4, sims: opts.sims || CFG.SIMS, seed: opts.seed || CFG.SEED,
  });
  const out = {};
  for (const id of Object.keys(res)) out[id] = res[id].champ_prob;
  return out;
}

/**
 * Explicit projected means in, championship odds out. For hand-run analysis
 * (the Richard pool memo; the post-draft rerun off roster projections). The
 * caller owns saying where `means` came from — this function will not invent
 * them, and nothing on the site calls it with made-up inputs.
 *
 * @param means { id: projected weekly mean }
 */
function preseasonFromMeans({ means, sd = CFG.WEEKLY_SD, weeks = 15, sims = CFG.SIMS, seed = CFG.SEED }) {
  const strengths = {};
  for (const id of Object.keys(means || {})) {
    strengths[Number(id)] = { mean: Number(means[id]), sd };
  }
  if (!Object.keys(strengths).length) return null;
  return simulate({ strengths, baseRec: null, futureWeeks: weeks, schedule: null, cut: 4, sims, seed });
}

module.exports = { CFG, simulate, playBracket, projectChampionship, champProbLive, preseasonFromMeans };

// ── VALIDATION READOUT — node src/routes/champodds.js ────────────────────────
// Forward test over the completed seasons: at each checkpoint, what probability
// did the model give the team that ACTUALLY won the title, and how does that
// compare to (a) uniform 1/10 and (b) naively declaring the current #1 seed the
// future champion? Run for the schedule-true full model AND the live-path
// approximation (constant sd + random schedule) so the shortcut's cost is a
// printed number.
if (require.main === module) {
  const history = LO.harvest();
  const years = LO.defaultSeasons(history);
  const checkpoints = [4, 7, 10, 14];
  const champOf = season => {
    const fin = (season.brackets && season.brackets.winners || []).find(g => g.p === 1);
    return fin ? Number(fin.w) : null;
  };
  for (const variant of [
    { name: 'FULL MODEL (per-team sd, real schedule)', opts: {} },
    { name: 'LIVE-PATH APPROX (constant sd 21.3, random schedule)', opts: { constantSd: true, randomSchedule: true } },
  ]) {
    console.log(`\n== ${variant.name} ==`);
    let sumP = 0, n = 0, topPickHits = 0, naiveHits = 0;
    for (const y of years) {
      const season = LO.seasonOf(history, y);
      if (!season) continue;
      const actual = champOf(season);
      for (const cw of checkpoints) {
        const res = projectChampionship(season, { throughWeek: cw, sims: 3000, seed: 999 + cw, ...variant.opts });
        const pChamp = res[actual] ? res[actual].champ_prob : 0;
        const ranked = Object.entries(res).sort((a, b) => b[1].champ_prob - a[1].champ_prob);
        const topPick = Number(ranked[0][0]);
        // Naive baseline: current #1 by (wins, pf) through cw wins it all.
        const st = ST.teamStrength(season, cw);
        const fws = LO.fieldWeeklyScores(season), wm = LO.weeklyMatchups(season);
        const rec = {};
        Object.keys(st).forEach(id => { rec[id] = { rid: Number(id), wins: 0, pf: 0 }; });
        for (const w of LO.regularSeasonWeeks(season).filter(w => w <= cw)) {
          const sc = fws[w] || {}, pr = wm[w] || {}, seen = new Set();
          for (const id of Object.keys(rec)) {
            rec[id].pf += Number(sc[id] || 0);
            const opp = pr[id];
            if (opp == null || seen.has(id)) continue;
            seen.add(id); seen.add(String(opp));
            if (Number(sc[id] || 0) > Number(sc[opp] || 0)) rec[id].wins++;
            else if (Number(sc[opp] || 0) > Number(sc[id] || 0) && rec[opp]) rec[opp].wins++;
          }
        }
        const naiveTop = Object.values(rec).sort((a, b) => b.wins - a.wins || b.pf - a.pf)[0].rid;
        sumP += pChamp; n++;
        if (topPick === actual) topPickHits++;
        if (naiveTop === actual) naiveHits++;
        console.log(`  ${y} @wk${String(cw).padStart(2)}: P(actual champ)=${(pChamp * 100).toFixed(1)}%`
          + `  model's top pick ${topPick === actual ? 'HIT' : 'miss'}  naive #1-seed ${naiveTop === actual ? 'HIT' : 'miss'}`);
      }
    }
    console.log(`  MEAN P(actual champion): ${(100 * sumP / n).toFixed(1)}%  (uniform baseline: 10.0%)`);
    console.log(`  top-pick hit rate: ${topPickHits}/${n}   naive #1-seed hit rate: ${naiveHits}/${n}`);
  }
}
