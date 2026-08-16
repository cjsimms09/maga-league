#!/usr/bin/env node
// TERRITORY: A
/* VARIANCE-PORTFOLIO CONSTRUCTION — the league-rules edge nobody drafts for,
 * priced end to end. (2026-08-16)
 *
 * Cory, verbatim: "Is it in the actual roster construction? Is it in the
 * 50/50 picks? Find it, beat it, prove it, implement it."
 *
 * PREREGISTERED in draft/audit/edge_hunt_2026-08-16.md §2 (commit eb367719,
 * before any room ran). This league pays $100 x 15 weekly highs — 37.5% of
 * the $4,000 pot (derived below from src/seed-data.js's own season book,
 * never retyped) — and two same-mean rosters differ in weekly sd. The
 * archetype study's instrument was variance-blind by its own limitation 3
 * (constant sd 21.3 for every team); THIS tool builds the per-roster sd the
 * honest way (measured player weekly cv + the committed stack-correlation
 * classes) and asks the preregistered question: does variance-tilting buy
 * enough weekly-high dollars to beat its cost in H2H record? Both tails
 * priced. A null is a publishable answer.
 *
 * THE ARMS (parameters fixed in the prereg commit):
 *   shipped    engine recs[0] — the live policy (control);
 *   var_tilt   among engine candidates within TIE_THRESHOLD (2.0 composite
 *              pts — the engine's own tie constant) of recs[0], the HIGHEST
 *              marginal roster weekly variance (own cv-var + measured-class
 *              stack covariance vs rostered same-NFL-team players);
 *   var_avoid  same band, LOWEST marginal variance (symmetric control: a
 *              fair instrument must price the anti-tilt below shipped on
 *              weekly-high dollars).
 * Overlay discipline is archetype_policy.js's, via its own exported helpers
 * (candidates / legalityOwns — imported, never edited): forced picks and
 * legality warnings are never overridden, K/DEF never chosen by preference,
 * unsatisfiable prefs defer to recs[0].
 *
 * WEEKLY SD, derived per team per week from that week's optimal starters:
 *   Var(w) = sum_starters (cv_p * weekMean_p)^2
 *          + 2 * sum_{same-NFL-team starter pairs in measured classes}
 *                rho_class * wsd_a * wsd_b
 * cv from draft/data/variance_inputs_2026.json (measured arm); absent cv ->
 * the artifact's per-position class fallback, USES COUNTED; K/DEF carry no
 * measured cv (offense-only stores) and contribute no derived variance — a
 * shared bias, identical across arms, named. rho from the committed
 * conditional_value_2026.json class table (QB-WR 0.4001, QB-TE 0.3331,
 * WR-WR 0.0136); unmeasured classes (RB-anything) contribute NOTHING and
 * are counted — absent is not zero.
 * TWO sd treatments, both run per prereg: RAW, and CALIBRATED (all teams
 * uniformly rescaled so the room's mean weekly sd equals the measured
 * league constant 21.3). CALIBRATED is primary; an edge that exists in only
 * one treatment is not an edge.
 *
 * SEASON + POT MC per room (seeded): 15 weeks, Normal(mean_w, sd_team_w),
 * random pairings (no 2026 schedule exists); $100 to the strict weekly max;
 * standings by (wins, points-for); reg $250/$125; top-4 bracket 1v4/2v3
 * (champodds' pinned format), $675/$575, semifinal losers by seed
 * $475/$400 (3rd-vs-4th by seed is a NAMED CONVENTION — the league's
 * records don't pin a consolation rule). Conservation identity held by
 * test: every simulated season distributes exactly $4,000.
 *
 * GATED: nothing on any surface reads this. Artifact + audit doc only.
 *
 * Run:    node draft/tools/variance_portfolio.js [--rooms 120] [--seed 1]
 *           [--sims 2000] [--arms shipped,var_tilt,var_avoid] [--batch 40]
 * Writes: draft/data/variance_portfolio.json
 *         (VARIANCE_PORTFOLIO_OUT overrides — tests write to scratch).
 */
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
const S = require(path.join(ROOT, 'public', 'js', 'draft', 'survival.js'));
require(path.join(ROOT, 'public', 'js', 'draft', 'composite.js'));
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
require(path.join(ROOT, 'public', 'js', 'draft', 'needrule.js'));
const LC = require(path.join(ROOT, 'draft', 'tools', 'live_context.js'));
const AP = require(path.join(ROOT, 'draft', 'tools', 'archetype_policy.js'));
const AS = require(path.join(ROOT, 'draft', 'tools', 'archetype_season.js'));
const CH = require(path.join(ROOT, 'src', 'routes', 'champodds.js'));
const SEED_DATA = require(path.join(ROOT, 'src', 'seed-data.js'));

/* ── the pot, from the league office's own book (src/seed-data.js), never
 * retyped: 2026 = $4,000 pot, 15 x $100 weekly, remaining $2,500 split
 * reg [10%, 5%] and playoff [27%, 23%, 19%, 16%]. */
function potStructure(year) {
  const s = SEED_DATA.SEASONS.find(x => x.year === year);
  if (!s) throw new Error('no season ' + year + ' in seed-data');
  const weeklyTotal = s.weeks * s.weekly_payout;
  const remaining = s.total_pot - weeklyTotal;
  const r2 = x => Math.round(x * 100) / 100;
  return {
    year, total_pot: s.total_pot, weeks: s.weeks,
    weekly: s.weekly_payout,
    reg: s.payouts.reg.map(p => r2(remaining * p)),
    playoff: s.payouts.playoff.map(p => r2(remaining * p)),
  };
}

/* ── measured inputs ──────────────────────────────────────────────────────── */
function loadVarianceInputs() {
  return JSON.parse(fs.readFileSync(
    path.join(ROOT, 'draft', 'data', 'variance_inputs_2026.json'), 'utf8'));
}
function loadStackClasses() {
  return JSON.parse(fs.readFileSync(
    path.join(ROOT, 'draft', 'data', 'conditional_value_2026.json'),
    'utf8')).stack_correlation_classes;
}

/** rho for a same-NFL-team position pair from the committed class table.
 *  Null (absent, not zero) for unmeasured classes — the caller counts it. */
function classRho(classes, posA, posB) {
  const key = [posA, posB].sort().join('-');
  if (key === 'QB-WR') return classes['QB-WR1'].r_pooled;
  if (key === 'QB-TE') return classes['QB-TE1'].r_pooled;
  if (key === 'WR-WR') return classes['WR1-WR2'].r_pooled;
  return null;
}

/** cv resolver over the measured artifact: measured value, else the
 *  per-position class fallback (flagged), else null (K/DEF — no offense
 *  rows exist; contributes no derived variance, counted by callers). */
function makeCvResolver(inputs) {
  return function cvOf(p) {
    const row = inputs.players[String(p.player_id)];
    if (row) return { cv: row.cv, fallback: false };
    const cls = inputs.class_cv[p.position];
    if (cls) return { cv: cls.cv_mean, fallback: true };
    return null;
  };
}

/* ── pure derivation functions (exported for hand-computed tests) ─────────── */

/** The optimal starters for one week's per-player means — the SAME selection
 *  AS.lineupPointsForWeek scores (greedy per dedicated slot + best flex; no
 *  wire floor), returned as rows so the sd derivation can see who started.
 *  Parity with AS.lineupPointsForWeek's total is pinned by test. */
function startersForWeek(roster, weekPts) {
  const byPos = {};
  (roster || []).forEach(p => {
    if (!p || !p.position) return;
    (byPos[p.position] || (byPos[p.position] = [])).push(p);
  });
  const pts = p => weekPts[String(p.player_id)] || 0;
  Object.keys(byPos).forEach(pos => byPos[pos].sort((a, b) => pts(b) - pts(a)));
  const starters = [];
  Object.keys(AS.STARTERS).forEach(pos => {
    const have = byPos[pos] || [];
    for (let i = 0; i < AS.STARTERS[pos] && i < have.length; i++) {
      starters.push(have[i]);
    }
  });
  let flex = null;
  AS.FLEX_ELIG.forEach(pos => {
    const extra = (byPos[pos] || [])[AS.STARTERS[pos]];
    if (extra && (!flex || pts(extra) > pts(flex))) flex = extra;
  });
  if (flex) starters.push(flex);
  return starters;
}

/** One week's derived team variance from its starters. Returns
 *  { variance, fallback_uses, unresolved, unmeasured_pairs }. */
function teamWeekVariance(starters, weekPts, cvOf, classes) {
  let variance = 0, fallbackUses = 0, unresolved = 0, unmeasuredPairs = 0;
  const legs = [];
  starters.forEach(p => {
    const mean = weekPts[String(p.player_id)] || 0;
    const cv = cvOf(p);
    if (!cv) { unresolved++; return; }        // K/DEF: no derived variance
    if (cv.fallback) fallbackUses++;
    const wsd = cv.cv * mean;
    variance += wsd * wsd;
    legs.push({ p, wsd });
  });
  for (let i = 0; i < legs.length; i++) {
    for (let j = i + 1; j < legs.length; j++) {
      const a = legs[i], b = legs[j];
      if (!a.p.team || a.p.team !== b.p.team) continue;
      const rho = classRho(classes, a.p.position, b.p.position);
      if (rho == null) { unmeasuredPairs++; continue; }  // absent, not zero
      variance += 2 * rho * a.wsd * b.wsd;
    }
  }
  return { variance: Math.max(0, variance), fallback_uses: fallbackUses,
    unresolved, unmeasured_pairs: unmeasuredPairs };
}

/** Per-week derived sd series for a roster (weeks 1..REGULAR_SEASON_WEEKS),
 *  using the same weekly means AS.weeklyTeamMeans spreads. */
function weeklySdSeries(roster, cvOf, classes, weeks) {
  const W = weeks || AS.REGULAR_SEASON_WEEKS;
  const clean = (roster || []).filter(p => p && p.position);
  const sds = [];
  let fallbackUses = 0, unmeasuredPairs = 0;
  for (let w = 1; w <= W; w++) {
    const weekPts = {};
    clean.forEach(p => { weekPts[String(p.player_id)] = AS.playerWeekMean(p, w); });
    const starters = startersForWeek(clean, weekPts);
    const v = teamWeekVariance(starters, weekPts, cvOf, classes);
    fallbackUses += v.fallback_uses;
    unmeasuredPairs += v.unmeasured_pairs;
    sds.push(Math.sqrt(v.variance));
  }
  return { sds, fallback_uses: fallbackUses, unmeasured_pairs: unmeasuredPairs };
}

/** Marginal roster weekly variance of adding `candidate` to `roster` —
 *  the var_tilt/var_avoid objective. Season scale: wsd(p) = cv * proj/16. */
function marginalVariance(candidate, roster, cvOf, classes) {
  const wsdOf = p => {
    const cv = cvOf(p);
    if (!cv) return null;
    return cv.cv * ((Number(p.proj_mean) || 0) / 16);
  };
  const own = wsdOf(candidate);
  if (own == null) return null;               // absent stays absent
  let v = own * own;
  (roster || []).forEach(r => {
    if (!r || !r.team || r.team !== candidate.team) return;
    const rho = classRho(classes, candidate.position, r.position);
    if (rho == null) return;                  // unmeasured class: nothing
    const w = wsdOf(r);
    if (w == null) return;
    v += 2 * rho * own * w;
  });
  return v;
}

/** The overlay: among engine candidates within `band` composite points of
 *  recs[0], take the max (dir=+1) or min (dir=-1) marginal variance.
 *  archetype_policy discipline via its own exported helpers: legality owns
 *  forced/warned picks; K/DEF never chosen by preference; ties and absent
 *  marginals defer to engine order. */
function chooseVariance(recs, state, dir, cvOf, classes, band) {
  const owned = AP.legalityOwns(recs);
  if (owned) return owned;
  const top = recs[0];
  if (top.score == null) return top;
  const near = AP.candidates(recs).filter(r =>
    r.player.position !== 'K' && r.player.position !== 'DEF'
    && r.score != null && (top.score - r.score) <= band);
  if (!near.length) return top;
  let best = null, bestV = null;
  near.forEach(r => {
    const v = marginalVariance(r.player, state.roster, cvOf, classes);
    if (v == null) return;
    if (best === null || dir * (v - bestV) > 1e-12) { best = r; bestV = v; }
  });
  return best || top;
}

/* ── the pot-priced season MC (pure, seeded) ─────────────────────────────── */

/**
 * @param teams { id: { means: number[W], sds: number[W] } }
 * @param opts  { sims, seed, pot, playoffCut = 4, bottomN = 3 }
 * @returns per id: { p_high, p_low, weekly_ties, exp_wins, playoff_prob,
 *   champ_prob, bottom3_prob, dollars: {weekly, reg, playoff, total} }
 */
function potSeasonMC(teams, opts) {
  const o = opts || {};
  const pot = o.pot;
  if (!pot) throw new Error('potSeasonMC: pot structure required');
  const sims = o.sims || 2000;
  const seed = o.seed == null ? 1 : o.seed;
  const cut = o.playoffCut == null ? 4 : o.playoffCut;
  const bottomN = o.bottomN == null ? 3 : o.bottomN;
  const ids = Object.keys(teams).sort((a, b) => Number(a) - Number(b));
  if (ids.length < cut) throw new Error('potSeasonMC: need >= cut teams');
  const W = teams[ids[0]].means.length;
  ids.forEach(id => {
    if (teams[id].means.length !== W || teams[id].sds.length !== W) {
      throw new Error('potSeasonMC: unequal series at team ' + id);
    }
  });
  const rand = AS.mulberry32(seed);
  const acc = {};
  ids.forEach(id => {
    acc[id] = { high: 0, low: 0, wins: 0, made: 0, champ: 0, bottom: 0,
      dWeekly: 0, dReg: 0, dPlayoff: 0 };
  });
  let weeklyTies = 0;
  const seasonStrength = {};
  ids.forEach(id => {
    seasonStrength[id] = {
      mean: teams[id].means.reduce((s, x) => s + x, 0) / W,
      sd: teams[id].sds.reduce((s, x) => s + x, 0) / W,
    };
  });

  for (let s = 0; s < sims; s++) {
    const rec = {};
    ids.forEach(id => { rec[id] = { id, wins: 0, pf: 0 }; });
    for (let w = 0; w < W; w++) {
      const drawn = {};
      ids.forEach(id => {
        drawn[id] = AS.gauss(rand, teams[id].means[w], teams[id].sds[w]);
      });
      // weekly high: $100 to the strict max (exact ties pay nobody, counted).
      let hiId = ids[0], hiV = drawn[ids[0]], loId = ids[0], loV = drawn[ids[0]];
      let hiTied = false, loTied = false;
      for (let i = 1; i < ids.length; i++) {
        const id = ids[i], v = drawn[id];
        if (v > hiV) { hiV = v; hiId = id; hiTied = false; }
        else if (v === hiV) hiTied = true;
        if (v < loV) { loV = v; loId = id; loTied = false; }
        else if (v === loV) loTied = true;
      }
      if (hiTied) weeklyTies++;
      else { acc[hiId].high++; acc[hiId].dWeekly += pot.weekly; }
      if (!loTied) acc[loId].low++;
      // random pairings (no 2026 schedule exists).
      const order = ids.slice();
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const t = order[i]; order[i] = order[j]; order[j] = t;
      }
      for (let i = 0; i + 1 < order.length; i += 2) {
        const a = order[i], b = order[i + 1];
        rec[a].pf += drawn[a]; rec[b].pf += drawn[b];
        if (drawn[a] > drawn[b]) rec[a].wins++;
        else if (drawn[b] > drawn[a]) rec[b].wins++;
      }
      if (order.length % 2) rec[order[order.length - 1]].pf += drawn[order[order.length - 1]];
    }
    const table = ids.map(id => rec[id])
      .sort((a, b) => (b.wins - a.wins) || (b.pf - a.pf)
        || (Number(a.id) - Number(b.id)));
    // regular-season money.
    pot.reg.forEach((amt, i) => { if (table[i]) acc[table[i].id].dReg += amt; });
    // playoff: champodds' pinned bracket shape — 1v4, 2v3, winners meet.
    const seeds = table.slice(0, cut).map(t => t.id);
    const game = (a, b) => {
      const sa = seasonStrength[a], sb = seasonStrength[b];
      return AS.gauss(rand, sa.mean, sa.sd) > AS.gauss(rand, sb.mean, sb.sd)
        ? a : b;
    };
    const f1 = game(seeds[0], seeds[3]);
    const f2 = game(seeds[1], seeds[2]);
    const champ = game(f1, f2);
    const runner = champ === f1 ? f2 : f1;
    const semiLosers = [seeds[0], seeds[3]].filter(x => x !== f1)
      .concat([seeds[1], seeds[2]].filter(x => x !== f2));
    // 3rd/4th by seed — the NAMED convention (no recorded consolation rule).
    semiLosers.sort((a, b) => seeds.indexOf(a) - seeds.indexOf(b));
    acc[champ].champ++;
    acc[champ].dPlayoff += pot.playoff[0];
    acc[runner].dPlayoff += pot.playoff[1];
    acc[semiLosers[0]].dPlayoff += pot.playoff[2];
    acc[semiLosers[1]].dPlayoff += pot.playoff[3];
    seeds.forEach(id => { acc[id].made++; });
    for (let i = table.length - bottomN; i < table.length; i++) {
      acc[table[i].id].bottom++;
    }
    ids.forEach(id => { acc[id].wins += rec[id].wins; });
  }

  const out = {};
  ids.forEach(id => {
    const a = acc[id];
    out[id] = {
      p_high: a.high / (sims * W), p_low: a.low / (sims * W),
      exp_wins: a.wins / sims,
      playoff_prob: a.made / sims, champ_prob: a.champ / sims,
      bottom3_prob: a.bottom / sims,
      dollars: {
        weekly: a.dWeekly / sims, reg: a.dReg / sims,
        playoff: a.dPlayoff / sims,
        total: (a.dWeekly + a.dReg + a.dPlayoff) / sims,
      },
    };
  });
  out._weekly_ties = weeklyTies;
  return out;
}

module.exports = { potStructure, loadVarianceInputs, loadStackClasses,
  classRho, makeCvResolver, startersForWeek, teamWeekVariance,
  weeklySdSeries, marginalVariance, chooseVariance, potSeasonMC };

/* ══ driver ═══════════════════════════════════════════════════════════════ */
if (require.main === module) main();

function main() {
  const args = process.argv.slice(2);
  const argOf = (f, dflt) => {
    const i = args.indexOf(f);
    return i >= 0 ? args[i + 1] : dflt;
  };
  const ROOMS = Number(argOf('--rooms', 120));
  const SEED0 = Number(argOf('--seed', 1));
  const SIMS = Number(argOf('--sims', 2000));
  const BATCH = Number(argOf('--batch', 40));
  const ARMS = String(argOf('--arms', 'shipped,var_tilt,var_avoid')).split(',');
  const TIE_BAND = E.CFG.TIE_THRESHOLD;       // 2.0 — the engine's own constant

  const board = LC.loadBoard();
  const ALL = board.players;
  const MY_KEEPERS = board.kept_players;
  const LEAGUE = board.league;
  const PICKS = (board.pick_order || {}).picks || [];
  const MY_SLOT = LEAGUE.my_draft_slot;
  const MY_PICKS = ((board.pick_order || {}).my_picks || [])
    .map(p => (p.overall != null ? p.overall : p));
  const TEAMS = LEAGUE.teams || 10;
  const TOTAL_ROUNDS = LEAGUE.rounds || 15;
  const WIRE = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'draft', 'data', 'wire_level.json'), 'utf8')).per_week;

  const POT = potStructure(2026);
  const INPUTS = loadVarianceInputs();
  const CLASSES = loadStackClasses();
  const cvOf = makeCvResolver(INPUTS);

  // Starter map asserted against the league config (no silent divergence).
  Object.keys(AS.STARTERS).forEach(pos => {
    if ((LEAGUE.starters || {})[pos] !== AS.STARTERS[pos]) {
      throw new Error('starter map drift at ' + pos);
    }
  });
  if ((LEAGUE.starters || {}).FLEX !== 1) throw new Error('starter map drift: FLEX');
  if (POT.weeks !== AS.REGULAR_SEASON_WEEKS) {
    throw new Error('pot weeks ' + POT.weeks + ' != regular season '
      + AS.REGULAR_SEASON_WEEKS);
  }

  /* Real designated keeper slate — same two-source agreement check as the
   * archetype driver (a keeper file that disagrees with the board refuses). */
  const KEEPER_FILE = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'draft', 'config', 'keepers.json'), 'utf8'));
  const myEntry = (KEEPER_FILE.teams || []).find(t => t.draft_slot === MY_SLOT);
  {
    const a = new Set((myEntry ? myEntry.keepers : []).map(k => String(k.player_id)));
    const b = new Set(MY_KEEPERS.map(k => String(k.player_id)));
    if (a.size !== b.size || [...a].some(id => !b.has(id))) {
      throw new Error('keeper sources disagree: config/keepers.json vs board');
    }
  }
  const byId = new Map(ALL.map(p => [String(p.player_id), p]));
  const OPP_KEEPERS = new Map();
  (KEEPER_FILE.teams || []).forEach(t => {
    if (t.draft_slot === MY_SLOT) return;
    const rows = [];
    (t.keepers || []).forEach(k => {
      const row = byId.get(String(k.player_id));
      if (!row) throw new Error('designated keeper not on board: ' + k.name);
      rows.push(row);
    });
    const forfeit = new Set();
    for (let r = 1; r <= rows.length; r++) forfeit.add(r);
    OPP_KEEPERS.set(t.draft_slot, { keeperRows: rows, forfeitRounds: forfeit });
  });

  const ROOM_PROFILES = (() => {
    const mgrs = (board.manager_profiles || {}).managers || {};
    const me = String(LEAGUE.my_manager_id || '');
    return Object.keys(mgrs).map(k => mgrs[k])
      .filter(m => m && String(m.manager_id) !== me);
  })();
  if (ROOM_PROFILES.length < 5) {
    throw new Error('measured opponent model needs the profiled room; got '
      + ROOM_PROFILES.length);
  }

  const mulberry32 = AS.mulberry32;
  function gaussian(rng) {
    const u1 = Math.max(rng(), 1e-9), u2 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /* Measured opponent model — the same construction archetype_rooms.js runs
   * (survival positionProbabilities + room-mixture softmax + declared rails);
   * reproduced here because that file is a script, not a module. */
  const CAPS = { QB: 3, TE: 3, K: 1, DEF: 1, RB: 7, WR: 7 };
  function missingStarters(roster) {
    const have = {};
    roster.forEach(p => { have[p.position] = (have[p.position] || 0) + 1; });
    const out = [];
    Object.keys(AS.STARTERS).forEach(pos => {
      for (let i = (have[pos] || 0); i < AS.STARTERS[pos]; i++) out.push(pos);
    });
    return out;
  }
  function opponentPickAdp(pool, rng) {
    let best = null, bestScore = Infinity;
    for (const p of pool) {
      const adp = p.adp == null ? 9999 : Number(p.adp);
      const sd = p.adp_sd == null ? 6 : Number(p.adp_sd);
      const score = adp + gaussian(rng) * sd;
      if (score < bestScore) { bestScore = score; best = p; }
    }
    return best;
  }
  function opponentPickMeasured(pool, teamState, overall, round, picksLeftForTeam, rng) {
    const team = { roster: teamState.roster, profile: null, room: ROOM_PROFILES,
      pick_no: overall };
    const ctx2 = {
      league: LEAGUE,
      progress: Math.min(1, Math.max(0, (overall - 1) / (TEAMS * TOTAL_ROUNDS))),
      roundsLeft: Math.max(0, TOTAL_ROUNDS - round),
    };
    const probs = S.positionProbabilities(team, pool, ctx2) || {};
    const counts = {};
    teamState.roster.forEach(p => { counts[p.position] = (counts[p.position] || 0) + 1; });
    const capped = {};
    Object.keys(probs).forEach(pos => {
      capped[pos] = (CAPS[pos] != null && (counts[pos] || 0) >= CAPS[pos]) ? 0 : probs[pos];
    });
    const gaps = missingStarters(teamState.roster);
    if (gaps.length >= picksLeftForTeam) {
      const need = new Set(gaps);
      Object.keys(capped).forEach(pos => { if (!need.has(pos)) capped[pos] = 0; });
    }
    let total = Object.values(capped).reduce((s, x) => s + x, 0);
    let dist = capped;
    if (!(total > 0)) { dist = probs; total = Object.values(probs).reduce((s, x) => s + x, 0); }
    if (!(total > 0)) return opponentPickAdp(pool, rng);
    let u = rng() * total, pos = null;
    for (const k of Object.keys(dist)) { u -= dist[k]; if (u <= 0) { pos = k; break; } }
    if (!pos) pos = Object.keys(dist).sort((a, b) => dist[b] - dist[a])[0];
    const sm = S.positionSoftmax(pool, pos, team);
    if (!sm || !sm.pool || !sm.pool.length || !sm.exps || !(sm.sum > 0)) {
      const posPool = pool.filter(p => p.position === pos);
      return posPool.length ? opponentPickAdp(posPool, rng) : opponentPickAdp(pool, rng);
    }
    let v = rng() * sm.sum;
    for (let i = 0; i < sm.pool.length; i++) {
      v -= sm.exps[i];
      if (v <= 0) return sm.pool[i];
    }
    return sm.pool[sm.pool.length - 1];
  }

  function myChoose(arm, recs, state) {
    if (arm === 'shipped') return recs[0];
    if (arm === 'var_tilt') return chooseVariance(recs, state, +1, cvOf, CLASSES, TIE_BAND);
    if (arm === 'var_avoid') return chooseVariance(recs, state, -1, cvOf, CLASSES, TIE_BAND);
    throw new Error('unknown arm ' + arm);
  }

  function runRoom(seed, armName) {
    const rng = mulberry32(seed);
    const drafted = new Set();
    const teams = {};
    for (let s = 1; s <= TEAMS; s++) teams[s] = { roster: [], picksLeft: 0 };
    MY_KEEPERS.forEach(k => {
      drafted.add(String(k.player_id));
      teams[MY_SLOT].roster.push(Object.assign({}, k, { is_keeper: true }));
    });
    OPP_KEEPERS.forEach((v, slot) => {
      v.keeperRows.forEach(row => {
        drafted.add(String(row.player_id));
        teams[slot].roster.push(Object.assign({}, row, { is_keeper: true }));
      });
    });
    const slotForfeits = slot => {
      if (slot === MY_SLOT) return new Set([1, 2, 3]);
      const v = OPP_KEEPERS.get(slot);
      return v ? v.forfeitRounds : new Set();
    };
    PICKS.forEach(p => { if (!slotForfeits(p.slot).has(p.round)) teams[p.slot].picksLeft++; });

    let overlayDiverged = 0, myPickIndex = 0;
    let pool = ALL.filter(p => !drafted.has(String(p.player_id)));
    for (const pk of PICKS) {
      const { overall, round, slot } = pk;
      if (slotForfeits(slot).has(round)) continue;
      const t = teams[slot];
      if (slot === MY_SLOT) {
        const next = MY_PICKS[myPickIndex + 1] || null;
        const ctx = LC.liveContext({
          currentPick: overall, nextPick: next == null ? overall : next,
          board: pool, roster: t.roster,
          myPicksLeft: MY_PICKS.length - myPickIndex, myPickIndex,
        });
        ctx.wireWeekly = WIRE;
        let recs;
        try { recs = E.recommend(ctx); } catch (e) {
          return { seed, arm: armName, crashed: String((e && e.message) || e) };
        }
        if (!recs || !recs.length) return { seed, arm: armName, crashed: 'empty recs' };
        const chosen = myChoose(armName, recs, { round, roster: t.roster });
        if (chosen !== recs[0]) overlayDiverged++;
        drafted.add(String(chosen.player.player_id));
        t.roster.push(chosen.player);
        myPickIndex++;
      } else {
        const p = opponentPickMeasured(pool, t, overall, round, t.picksLeft, rng);
        if (!p) return { seed, arm: armName, crashed: 'pool exhausted at ' + overall };
        drafted.add(String(p.player_id));
        t.roster.push(p);
      }
      t.picksLeft--;
      pool = pool.filter(x => !drafted.has(String(x.player_id)));
    }

    // ── season scoring, two sd treatments ─────────────────────────────────
    const meansOf = {}, sdsRaw = {};
    let myFallbackUses = 0, myUnmeasuredPairs = 0, sdSum = 0, sdCount = 0;
    for (let s = 1; s <= TEAMS; s++) {
      meansOf[s] = AS.weeklyTeamMeans(teams[s].roster).series;
      const d = weeklySdSeries(teams[s].roster, cvOf, CLASSES);
      sdsRaw[s] = d.sds;
      sdSum += d.sds.reduce((a, x) => a + x, 0);
      sdCount += d.sds.length;
      if (s === MY_SLOT) {
        myFallbackUses = d.fallback_uses;
        myUnmeasuredPairs = d.unmeasured_pairs;
      }
    }
    const k = CH.CFG.WEEKLY_SD / (sdSum / sdCount);
    if (!isFinite(k) || k <= 0) return { seed, arm: armName, crashed: 'calibration factor ' + k };

    const runArm = (scale, mcSeed) => {
      const t = {};
      for (let s = 1; s <= TEAMS; s++) {
        t[s] = { means: meansOf[s], sds: sdsRaw[s].map(x => x * scale) };
      }
      return potSeasonMC(t, { sims: SIMS, seed: mcSeed, pot: POT });
    };
    const cal = runArm(k, (seed * 7919 + 17) >>> 0);
    const raw = runArm(1, (seed * 104729 + 31) >>> 0);

    const mine = teams[MY_SLOT];
    const posCounts = {};
    mine.roster.forEach(p => { posCounts[p.position] = (posCounts[p.position] || 0) + 1; });
    // mechanism readout: measured-class same-NFL-team pairs on MY roster.
    let stackPairs = 0;
    for (let i = 0; i < mine.roster.length; i++) {
      for (let j = i + 1; j < mine.roster.length; j++) {
        const a = mine.roster[i], b = mine.roster[j];
        if (a.team && a.team === b.team
          && classRho(CLASSES, a.position, b.position) != null) stackPairs++;
      }
    }
    const rd = x => Math.round(x * 10000) / 10000;
    const flat = arm => ({
      p_high: rd(arm[MY_SLOT].p_high), p_low: rd(arm[MY_SLOT].p_low),
      exp_wins: rd(arm[MY_SLOT].exp_wins),
      playoff_prob: rd(arm[MY_SLOT].playoff_prob),
      champ_prob: rd(arm[MY_SLOT].champ_prob),
      bottom3_prob: rd(arm[MY_SLOT].bottom3_prob),
      dollars_weekly: rd(arm[MY_SLOT].dollars.weekly),
      dollars_reg: rd(arm[MY_SLOT].dollars.reg),
      dollars_playoff: rd(arm[MY_SLOT].dollars.playoff),
      dollars_total: rd(arm[MY_SLOT].dollars.total),
      weekly_ties: arm._weekly_ties,
    });
    return {
      seed, arm: armName, crashed: null,
      posCounts, overlayDiverged, stackPairs,
      fallback_uses: myFallbackUses, unmeasured_pairs: myUnmeasuredPairs,
      mean_weekly: rd(meansOf[MY_SLOT].reduce((s, x) => s + x, 0)
        / meansOf[MY_SLOT].length),
      my_sd_raw: rd(sdsRaw[MY_SLOT].reduce((s, x) => s + x, 0)
        / sdsRaw[MY_SLOT].length),
      calibration_k: rd(k),
      cal: flat(cal), raw: flat(raw),
    };
  }

  // ── run all arms, paired seeds; flag hygiene as in the archetype driver ──
  const savedFlags = { VONA_SLOT_AWARE: E.CFG.VONA_SLOT_AWARE,
    VONA_WIRE_BENCH: E.CFG.VONA_WIRE_BENCH, TIE_THRESHOLD: E.CFG.TIE_THRESHOLD };
  const detail = {};
  ARMS.forEach(a => { detail[a] = []; });
  for (let s = SEED0; s < SEED0 + ROOMS; s++) {
    ARMS.forEach(a => { detail[a].push(runRoom(s, a)); });
  }
  Object.keys(savedFlags).forEach(f => {
    if (E.CFG[f] !== savedFlags[f]) {
      throw new Error('engine CFG mutated by the run (' + f + ') — refusing to write');
    }
  });

  const METRICS = ['mean_weekly', 'my_sd_raw', 'stackPairs'];
  const ARM_METRICS = ['p_high', 'p_low', 'exp_wins', 'playoff_prob',
    'champ_prob', 'bottom3_prob', 'dollars_weekly', 'dollars_reg',
    'dollars_playoff', 'dollars_total'];
  function meanSe(xs) {
    const n = xs.length;
    if (!n) return { n: 0, mean: null, se: null };
    const m = xs.reduce((s, x) => s + x, 0) / n;
    const v = n > 1 ? xs.reduce((s, x) => s + (x - m) * (x - m), 0) / (n - 1) : 0;
    return { n, mean: m, se: Math.sqrt(v / Math.max(1, n)) };
  }
  const rd = x => (x == null ? null : Math.round(x * 10000) / 10000);
  function summarizeArm(rooms) {
    const ok = rooms.filter(r => !r.crashed);
    const out = { n: rooms.length, crashed: rooms.length - ok.length,
      overlay_diverged_picks_per_room: ok.length
        ? Math.round(10 * ok.reduce((s, r) => s + r.overlayDiverged, 0) / ok.length) / 10 : null,
      fallback_uses_per_room: ok.length
        ? Math.round(10 * ok.reduce((s, r) => s + r.fallback_uses, 0) / ok.length) / 10 : null,
    };
    METRICS.forEach(m => {
      const st = meanSe(ok.map(r => r[m]));
      out[m] = rd(st.mean); out[m + '_se'] = rd(st.se);
    });
    ['cal', 'raw'].forEach(t => {
      out[t] = {};
      ARM_METRICS.forEach(m => {
        const st = meanSe(ok.map(r => r[t][m]));
        out[t][m] = rd(st.mean); out[t][m + '_se'] = rd(st.se);
      });
    });
    return out;
  }
  function pairedVsShipped(arm) {
    if (!detail.shipped) return null;
    const base = new Map(detail.shipped.filter(r => !r.crashed).map(r => [r.seed, r]));
    const rows = detail[arm].filter(r => !r.crashed && base.has(r.seed));
    const out = {};
    METRICS.forEach(m => {
      const st = meanSe(rows.map(r => r[m] - base.get(r.seed)[m]));
      out[m] = st.mean == null ? null : { n: st.n, mean: rd(st.mean), se: rd(st.se),
        ci95: [rd(st.mean - 1.96 * st.se), rd(st.mean + 1.96 * st.se)] };
    });
    ['cal', 'raw'].forEach(t => {
      out[t] = {};
      ARM_METRICS.forEach(m => {
        const st = meanSe(rows.map(r => r[t][m] - base.get(r.seed)[t][m]));
        out[t][m] = st.mean == null ? null : { n: st.n, mean: rd(st.mean), se: rd(st.se),
          ci95: [rd(st.mean - 1.96 * st.se), rd(st.mean + 1.96 * st.se)] };
      });
    });
    return out;
  }
  function batches(arm) {
    if (!detail.shipped) return null;
    const base = new Map(detail.shipped.filter(r => !r.crashed).map(r => [r.seed, r]));
    const out = [];
    for (let b0 = SEED0; b0 < SEED0 + ROOMS; b0 += BATCH) {
      const rows = detail[arm].filter(r => !r.crashed && base.has(r.seed)
        && r.seed >= b0 && r.seed < b0 + BATCH);
      const entry = { seeds: b0 + '-' + Math.min(SEED0 + ROOMS, b0 + BATCH) };
      ['cal', 'raw'].forEach(t => {
        const st = meanSe(rows.map(r => r[t].dollars_total - base.get(r.seed)[t].dollars_total));
        entry['d_dollars_total_' + t] = rd(st.mean);
      });
      out.push(entry);
    }
    return out;
  }

  const summary = {}, paired = {}, byBatch = {};
  ARMS.forEach(a => {
    summary[a] = summarizeArm(detail[a]);
    if (a !== 'shipped') { paired[a] = pairedVsShipped(a); byBatch[a] = batches(a); }
  });

  const out = {
    _territory: 'TERRITORY: A — research artifact, no production reader',
    tool: 'draft/tools/variance_portfolio.js',
    mandate: 'Cory 2026-08-16: "Is it in the actual roster construction? Is it in the 50/50 picks? Find it, beat it, prove it, implement it."',
    prereg: 'draft/audit/edge_hunt_2026-08-16.md §2 (commit eb367719)',
    rooms: ROOMS, seed_start: SEED0, batch: BATCH, sims_per_room: SIMS,
    arms: ARMS, tie_band: TIE_BAND,
    pot: POT,
    weekly_sd_target: CH.CFG.WEEKLY_SD,
    engine_flags: { VONA_SLOT_AWARE: E.CFG.VONA_SLOT_AWARE,
      VONA_WIRE_BENCH: E.CFG.VONA_WIRE_BENCH },
    generated_at: new Date().toISOString(),
    note: 'SIMULATION throughout: model outcomes conditioned on proj_mean, '
      + 'measured player cv (n=6-17 wks/player-season), the committed stack '
      + 'classes, the measured opponent model, Normal weekly scores, and the '
      + 'named 3rd/4th-by-seed convention — not measurements. CAL treatment '
      + '(field mean sd rescaled to the measured 21.3) is primary per prereg.',
    summary, paired_vs_shipped: paired, batches: byBatch, detail,
  };
  const OUT_PATH = process.env.VARIANCE_PORTFOLIO_OUT
    || path.join(ROOT, 'draft', 'data', 'variance_portfolio.json');
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 1));

  console.log('VARIANCE PORTFOLIO — ' + ROOMS + ' paired rooms/arm, seeds '
    + SEED0 + '-' + (SEED0 + ROOMS - 1) + ', tie band ' + TIE_BAND);
  ARMS.forEach(a => {
    const s = summary[a];
    console.log('  ' + a.padEnd(10)
      + ' $total(cal) ' + (s.cal.dollars_total == null ? '—' : s.cal.dollars_total.toFixed(1))
      + '  $weekly ' + (s.cal.dollars_weekly == null ? '—' : s.cal.dollars_weekly.toFixed(1))
      + '  pHigh ' + (100 * s.cal.p_high).toFixed(2) + '%'
      + '  wk pts ' + s.mean_weekly.toFixed(1)
      + '  sd(raw) ' + s.my_sd_raw.toFixed(1)
      + '  stacks ' + s.stackPairs.toFixed(1)
      + '  overlay/room ' + s.overlay_diverged_picks_per_room
      + (s.crashed ? '  CRASHED ' + s.crashed : ''));
  });
  console.log('  wrote ' + OUT_PATH);
}
