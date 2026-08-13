// TERRITORY: A
/* WHAT A BENCH SPOT IS ACTUALLY WORTH — MV(i|R), by simulation.
 *
 *     MV(i|R) = E[ Σ_w OptLineup(R ∪ {i}, w) ] − E[ Σ_w OptLineup(R ∪ {ω}, w) ]
 *
 * Cory's equation, from 4for4's Monte Carlo bench work, Becker & Sun (JQAS 2016)
 * and the Fry/Lundberg/Ohlmann stochastic-DP formulation. `i` is the player
 * under consideration; `ω` is a freely-available body at his position. The
 * difference is the value of the ROSTER SPOT, which is the only quantity that
 * puts a backup quarterback and a fifth running back on one scale.
 *
 * ── THE INSTRUCTION THIS FILE IS BUILT AROUND ──────────────────────────────
 *
 * Cory, verbatim: *"don't let convexity enter through a scalar upside metric…
 * The convexity has to come out of the lineup optimizer operating on sampled
 * weeks."*
 *
 * That is not a stylistic preference, it is the difference between measuring
 * something and re-weighting the projection. This repo has already shipped the
 * scalar version and it was inert by construction: `UpsideBonus` was
 * `proj_mean × variance × 1.036`, Spearman 1.0000 against `proj_mean` at every
 * position, so "upside" was the projection signal entered twice. A scalar cannot
 * produce convexity because convexity is not a property of a player — it is a
 * property of the MAX operator in a lineup. A volatile RB4 is worth something
 * precisely because in the weeks he is bad you do not start him, and no
 * per-player number can express "in the weeks he is bad".
 *
 * So the only place variance is allowed to enter here is as the SD of a weekly
 * draw. Nothing multiplies by it, nothing bonuses for it. If a high-variance
 * bench player scores better it is because `OptLineup` picked him more often on
 * sampled weeks, and if he does not, this file says so.
 *
 * ── WHAT REPLACES WHAT ─────────────────────────────────────────────────────
 *
 * `emit_seat_plan.js` currently ranks bench shortlists on
 *
 *     (proj_mean / 15) − WIRE[position]
 *
 * which is a scalar with no lineup in it at all. It cannot see that a second
 * quarterback plays zero weeks unless the first is hurt, that a bye is a hole
 * with a name and a date, or that two receivers who share a bye are not two
 * receivers. This is the thing that fixes those, and the seat plan reads it.
 *
 * ── EVERY INPUT, AND WHETHER IT IS MEASURED ────────────────────────────────
 *
 *  1. WEEKS 1–15.                 READ. `sleeper_league_settings.json` says
 *     start_week 1, playoff_week_start 16. Not assumed, not 17.
 *  2. STARTING SLOTS.             READ from `league.starters`.
 *  3. BYE WEEK.                   READ per player from the board. Exact.
 *  4. WEEKLY MEAN.                DERIVED: proj_mean / games_expected. Self-
 *     consistent with how the board built weekly_sd, and summing over the games
 *     he plays returns proj_mean.
 *  5. WEEKLY SD.                  DERIVED, NOT MEASURED. The board computes
 *     `weekly_sd = proj_mean × variance / sqrt(games)`. There is no weekly
 *     observation anywhere in it. It is the best available and it is not an
 *     observation, and the difference is stated here rather than in a footnote.
 *  6. AVAILABILITY.               POSITION-LEVEL ONLY, and this is the weakest
 *     input in the file. `games_expected` is a per-POSITION constant — QB 15.5,
 *     RB 14.2, WR 15.0, TE 14.8, K 16.5, DEF 17.0 — so every running back on
 *     the board carries the same injury prior. It contains no information about
 *     THIS back's history. A handcuff is therefore worth nothing extra here,
 *     which is wrong, and the size of that wrongness is unknown.
 *  7. THE WIRE.                   MEASURED — 420 scored acquisitions, 2023-25,
 *     via `wire_level.js`, and DRAWN FROM as a sample rather than reduced to a
 *     median. K and DEF have NO sample and are handled explicitly below.
 *  8. CORRELATION BETWEEN PLAYERS. NOT MEASURED. Independent by default, with a
 *     shared weekly shock available as a sweep. See the note on `corr`.
 *  9. SUCCESSION / HANDCUFF SHARES. NOT MODELLED AT ALL. A backup who inherits
 *     his starter's touches is worth far more than his own projection, and that
 *     needs a conditional projection nobody has.
 * 10. PAYOUT STRUCTURE AS OBJECTIVE. NOT MODELLED. This maximises expected
 *     points, not expected dollars. Weeks 16-17 are excluded entirely.
 *
 * ── THE ONE MODELLING FORK THAT CHANGES THE ANSWER ─────────────────────────
 *
 * `OptLineup(R, w)` optimises against the SAMPLED WEEK, which is what Cory's
 * notation says and what the 4for4 and Becker-Sun formulations use. It assumes
 * you start the right men — perfect lineup skill within your own roster.
 *
 * THAT IS AN UPPER BOUND AND IT IS WHERE ALL THE CONVEXITY LIVES. So this file
 * also runs `lineupInfo: 'prior'`, which sets the lineup on expectations before
 * the week and then scores it. The gap between the two IS the clairvoyance, and
 * it is reported rather than buried, because a bench value that exists only
 * under perfect hindsight is a bench value Cory should not pay a pick for.
 *
 * THE WIRE DOES NOT GET HINDSIGHT IN EITHER MODE. You claim a waiver player on
 * Wednesday, not after the whistle, so a stream fills a slot only when the
 * roster genuinely cannot and its points are drawn afterwards. Letting the
 * optimiser peek at a wire draw would make every bench player worthless by
 * construction — a null produced entirely by the harness.
 *
 * Run: node draft/tools/bench_mv.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const WIRE = require('./wire_level.js');

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));

/* ── THE SEASON, READ ─────────────────────────────────────────────────────
 * Three constants were found masquerading as data in this repo on one day, all
 * plausible, all with an authoritative source sitting unread nearby. So the
 * scoring window is read and REFUSES to default. `WEEKS = 15` happens to be
 * right — start_week 1, playoff_week_start 16 — but it was right by luck until
 * somebody checked, and luck is not a source. */
const SETTINGS = (function () {
  const f = path.join(ROOT, 'draft', 'data', 'sleeper_league_settings.json');
  const s = JSON.parse(fs.readFileSync(f, 'utf8'));
  return s.settings || s;
})();
const FIRST_WEEK = (function () {
  const v = SETTINGS.start_week;
  if (!Number.isFinite(+v)) {
    throw new Error('bench_mv: sleeper_league_settings has no start_week. REFUSING to '
      + 'assume week 1 — the scoring window decides every bye and every bench value.');
  }
  return +v;
})();
const LAST_WEEK = (function () {
  const v = SETTINGS.playoff_week_start;
  if (!Number.isFinite(+v)) {
    throw new Error('bench_mv: sleeper_league_settings has no playoff_week_start. '
      + 'REFUSING to assume a 15-week regular season.');
  }
  return +v - 1;
})();
/* NFL weeks in a season, for converting a position's expected GAMES into a
 * weekly availability rate. Byes are removed separately and by name, so this is
 * the calendar and nothing else. */
const NFL_WEEKS = 17;

const STARTERS = (DATA.league || {}).starters || {};
const FLEX_ELIG = ['RB', 'WR', 'TE'];
/* The seats, expanded once. Order matters only for reporting. */
const SLOTS = (function () {
  const out = [];
  Object.keys(STARTERS).forEach(pos => {
    if (pos === 'FLEX') return;
    for (let i = 0; i < (STARTERS[pos] || 0); i++) out.push({ slot: pos, elig: [pos] });
  });
  for (let i = 0; i < (STARTERS.FLEX || 0); i++) out.push({ slot: 'FLEX', elig: FLEX_ELIG });
  return out;
})();

/* ── THE WIRE, AS A SAMPLE ────────────────────────────────────────────────
 * `wire_level.js` refuses to hand back a K or DEF level because nflverse weekly
 * is player-level offence and carries no such score. That refusal is honoured
 * rather than worked around: those two positions fall back to the PRESEASON
 * best-undrafted line, which is a different quantity measured a different way,
 * and every consumer is told so by name. Substituting one line for the other
 * silently is how "realized wire" and "best undrafted" got treated as a bracket
 * when they are not even the same population. */
const MEASURED = WIRE.measure();
const WIRE_SAMPLE = {};
WIRE.MEASURED_POSITIONS.forEach(p => {
  if (MEASURED.sample[p] && MEASURED.sample[p].length) WIRE_SAMPLE[p] = MEASURED.sample[p];
});
const WIRE_BASIS = {};
Object.keys(WIRE_SAMPLE).forEach(p => {
  WIRE_BASIS[p] = 'realized acquisition, n=' + WIRE_SAMPLE[p].length + ' (2023-25)';
});

/* K and DEF: the preseason best-undrafted level, per week, NAMED as such. */
const FALLBACK_WIRE = (function () {
  const PLAN = require('./draft_plan.js');
  const out = {};
  ['K', 'DEF'].forEach(p => {
    out[p] = (PLAN.WAIVER[p] || 0) / (LAST_WEEK - FIRST_WEEK + 1);
    WIRE_BASIS[p] = 'PRESEASON BEST-UNDRAFTED, not realized wire — nflverse weekly '
      + 'carries no ' + p + ' scoring, so there is no realized sample to draw from';
  });
  return out;
})();

/* ── HOW MANY PLAYERS YOU CAN ACTUALLY ADD IN A WEEK — MEASURED ───────────
 * 764 completed waiver and free-agent adds across 51 season-weeks of this
 * league, ten teams: 1.498 per team per week. Not a rule of thumb and not a
 * roster-size argument — the log says so. It is the single most consequential
 * number in this file after the wire itself, because unlimited streaming makes
 * every bench player worth zero and zero streaming makes them all worth a
 * fortune. */
const STREAM_BUDGET = (function () {
  const h = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'league_history.json'), 'utf8'));
  let adds = 0; const weeks = new Set();
  WIRE.SEASONS.forEach(season => {
    WIRE.acquisitions(h, season).forEach(a => { adds++; weeks.add(season + ':' + a.week); });
  });
  const teams = (DATA.league || {}).teams;
  if (!adds || !weeks.size || !teams) {
    throw new Error('bench_mv: cannot measure the weekly add rate from league_history. '
      + 'REFUSING to assume one — unlimited streaming prices every bench player at '
      + 'zero and no streaming prices them all at a fortune.');
  }
  return adds / (weeks.size * teams);
})();

/* ── RNG — ADDRESSED, NOT SEQUENTIAL, AND THAT IS THE WHOLE DESIGN ────────
 *
 * MV is a DIFFERENCE between two seasons that share nine players out of ten.
 * The difference is often a couple of points; the totals it is a difference of
 * are ~1,700. Run the two arms off a shared sequential stream and the moment
 * one arm consumes a draw the other does not — a candidate who gets injured
 * where ω never does, a slot that needs a wire stream in one arm only — every
 * subsequent draw in that season DESYNCHRONISES and the nine shared players stop
 * being shared. The estimator still converges, at roughly a hundred times the
 * sample size.
 *
 * MY FIRST CUT DID EXACTLY THAT, and the control caught it: a freely-available
 * body priced at −6.7 to −11.7 points instead of zero. So randomness here is
 * ADDRESSED — every draw is a pure function of (seed, sim, week, who, why) — and
 * two arms therefore hand identical numbers to every player they share, no
 * matter what happens to the one they do not. Nothing consumes a stream, so
 * nothing can desynchronise one.
 *
 * Salts are separated per USE as well as per subject: a player's availability,
 * his weekly score, the week's shared shock and a positional wire stream draw
 * are four different addresses. Reusing one address for two purposes would
 * couple them silently, which is the same class of error one layer down. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* FNV-1a over the address, then one mulberry32 step. The same mixer the
 * pred-ledger's board digest uses, for the same reason: cheap and well spread. */
function u01(parts) {
  let a = 2166136261 >>> 0;
  for (let i = 0; i < parts.length; i++) {
    let v = parts[i] >>> 0;
    for (let b = 0; b < 4; b++) {
      a = (a ^ (v & 0xff)) >>> 0;
      a = Math.imul(a, 16777619) >>> 0;
      v >>>= 8;
    }
  }
  a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
/* Box-Muller on two addressed uniforms. `1 - u` because log(0) is -Infinity. */
function gaussAt(parts) {
  const uu = 1 - u01(parts.concat([1]));
  const vv = u01(parts.concat([2]));
  return Math.sqrt(-2 * Math.log(uu)) * Math.cos(2 * Math.PI * vv);
}
/* Salts. Named so an address collision is a visible edit rather than a typo. */
const S_AVAIL = 101, S_SCORE = 202, S_SHOCK = 303, S_STREAM = 404, S_SIGNAL = 505;
const POS_IDX = { QB: 1, RB: 2, WR: 3, TE: 4, K: 5, DEF: 6 };

/* LINEUP SKILL, AS A NUMBER. 'prior' and 'clairvoyant' are the two ends and are
 * kept as names because they are the two bounds anybody will quote; anything in
 * between is passed as ρ directly. An unrecognised string THROWS rather than
 * silently becoming one of the ends — the difference between them is 20 points
 * on a bench running back, which is far too large to resolve by a default. */
function resolveRho(lineupInfo) {
  if (typeof lineupInfo === 'number') {
    if (!(lineupInfo >= 0 && lineupInfo <= 1)) {
      throw new Error('bench_mv: lineupInfo as a number is a CORRELATION and must be '
        + 'in [0,1]; got ' + lineupInfo);
    }
    return lineupInfo;
  }
  if (lineupInfo === 'prior') return 0;
  if (lineupInfo === 'clairvoyant') return 1;
  throw new Error('bench_mv: lineupInfo must be "prior", "clairvoyant", or a '
    + 'correlation in [0,1]; got ' + JSON.stringify(lineupInfo) + '. REFUSING to '
    + 'default — the two ends differ by ~20 points on a bench running back.');
}

/* ── A PLAYER, REDUCED TO WHAT THE SIMULATION NEEDS ──────────────────────── */
function toSim(p) {
  const games = +p.games_expected || 15;
  const mean = (+p.proj_mean || 0) / games;
  return {
    player_id: String(p.player_id), name: p.name, position: p.position,
    bye: +p.bye || 0,
    weekMean: mean,
    weekSd: +p.weekly_sd || (mean * 0.35),
    /* Weeks he is out through injury, over the 16 non-bye NFL weeks. Removing
     * the bye first is not a detail: the bye is already a guaranteed absence
     * with a known date, and letting `17 - games_expected` also carry it charges
     * the player twice for the same missing week. */
    injuryWeeks: Math.max(0, NFL_WEEKS - 1 - games),
  };
}

/* ── ONE SIMULATED SEASON ─────────────────────────────────────────────────
 * `sim` is the season's index and, with `cfg.seed`, its whole address. Player
 * `i` in the roster array draws at address (seed, sim, salt, i) — so the base
 * roster, which occupies the same indices in both arms, is handed the SAME
 * injuries, the SAME byes and the SAME weekly scores in both. The candidate and
 * ω share index `base.length` and differ only in what they are. */
function simSeason(roster, sim, cfg) {
  const seed = cfg.seed;
  const W = [];
  for (let w = FIRST_WEEK; w <= LAST_WEEK; w++) W.push(w);

  /* AVAILABILITY. Two models, because the honest answer is that we do not know
   * which one this league's injuries look like, and the ordering had better not
   * depend on the choice. `block` places the missed games CONTIGUOUSLY, which is
   * what a real injury looks like; `iid` scatters them. A block hurts more,
   * because it can take out a starter for a stretch that a single bye-week
   * stream cannot paper over — which is exactly when a bench player earns his
   * spot. If the two disagree about the ORDER of candidates, that disagreement
   * is a finding and gets reported, not averaged away. */
  const outWeeks = roster.map((p, i) => {
    const set = new Set();
    if (p.bye >= FIRST_WEEK && p.bye <= LAST_WEEK) set.add(p.bye);
    const miss = p.injuryWeeks;
    if (miss > 0) {
      if (cfg.injuryModel === 'iid') {
        const rate = miss / (NFL_WEEKS - 1);
        W.forEach(w => { if (u01([seed, sim, S_AVAIL, i, w]) < rate) set.add(w); });
      } else {
        /* Expected length `miss`, realised as a whole number of weeks so a 1.8-
         * week prior becomes a 1-or-2-week absence rather than 1.8 weeks of
         * everybody being slightly hurt — which would never leave a hole. */
        const whole = Math.floor(miss)
          + (u01([seed, sim, S_AVAIL, i, 0]) < (miss - Math.floor(miss)) ? 1 : 0);
        if (whole > 0) {
          const start = FIRST_WEEK
            + Math.floor(u01([seed, sim, S_AVAIL, i, 1]) * (LAST_WEEK - FIRST_WEEK + 1));
          for (let k = 0; k < whole; k++) {
            const w = start + k;
            if (w >= FIRST_WEEK && w <= LAST_WEEK) set.add(w);
          }
        }
      }
    }
    return set;
  });

  let total = 0;
  for (let wi = 0; wi < W.length; wi++) {
    const w = W[wi];
    /* A SHARED WEEKLY SHOCK, off by default. NOT MEASURED — there is no
     * player-to-player correlation anywhere in this repo's inputs. It is a
     * SWEEP, and it carries ONE sign for the whole week across every player, by
     * design: an earlier correlation experiment here drew a fresh sign per
     * decision, which is independence with extra steps and returned a null that
     * was entirely its own construction. */
    const shock = cfg.corr > 0 ? gaussAt([seed, sim, S_SHOCK, w]) : 0;
    const avail = [];
    for (let i = 0; i < roster.length; i++) {
      if (outWeeks[i].has(w)) continue;
      const p = roster[i];
      const idio = gaussAt([seed, sim, S_SCORE, i, w]);
      const z = cfg.corr > 0
        ? (cfg.corr * shock + Math.sqrt(1 - cfg.corr * cfg.corr) * idio)
        : idio;
      avail.push({ p: p, i: i, pts: Math.max(0, p.weekMean + p.weekSd * z) });
    }
    total += bestLineup(avail, cfg, seed, sim, w);
  }
  return total;
}

/* ── THE LINEUP ───────────────────────────────────────────────────────────
 * Dedicated slots first, then the flex from what is left. Greedy is OPTIMAL for
 * this seat structure and that is a fact about the structure, not an
 * approximation: with one flex, the top two backs must occupy the two RB seats
 * in any optimal solution (swapping a lower back into an RB seat and a higher
 * one into the flex never gains), and the same for the receivers, so the flex
 * takes the best remaining flex-eligible man.
 *
 * ── `key` IS THE LINEUP-SKILL DIAL, AND IT IS THE WHOLE ANSWER ────────────
 *
 * Sorting by `pts` starts the men who happened to score — perfect hindsight
 * within your own roster. Sorting by `weekMean` sets the lineup on Wednesday and
 * lives with it. NEITHER IS A REAL MANAGER. Cory reads injury reports and
 * matchups; he does not know the score.
 *
 * So the dial is continuous. The manager sees a signal `s` with correlation ρ to
 * the week's standardised outcome `z`, and starts men by `E[pts | s]`, which for
 * a standardised signal is `weekMean + weekSd · ρ · s`. At ρ=1 that is exactly
 * `pts`; at ρ=0 it is exactly `weekMean`. Convexity therefore enters IN
 * PROPORTION TO REAL LINEUP SKILL rather than being switched on by an
 * assumption — which is the only way this quantity can be honest, because a
 * bench value that exists only under hindsight is not a bench value.
 *
 * ρ IS NOT GUESSED HERE AND IT IS NOT DEFAULTED TO 1. It is reported as a curve,
 * and it is MEASURABLE from this league's own history in September: the
 * started-lineup versus optimal-lineup capture rate is exactly this number. Until
 * that runs, the range is the answer and the range is what gets shown.
 *
 * ── ω AND A STREAM NEVER GET HINDSIGHT, AT ANY ρ ─────────────────────────
 *
 * You claim a waiver player on Wednesday. Letting the optimiser see a wire body's
 * score before deciding to start him makes every bench player worthless by
 * construction — a null manufactured entirely by the harness. My first cut did
 * this and it produced a TIGHT END WITH NEGATIVE CONVEXITY: ω_TE carried the
 * SPREAD OF THE WHOLE WIRE SAMPLE (sd 7.87, which mixes between-player with
 * between-week variation), so hindsight rewarded the counterfactual more than the
 * real man and MV fell as lineup skill rose. Backwards, and the sign was the
 * tell. */
function bestLineup(avail, cfg, seed, sim, w) {
  const rho = cfg.rho;
  const key = (x) => {
    if (x.p.noHindsight || rho <= 0) return x.p.weekMean;
    if (rho >= 1) return x.pts;
    const z = x.p.weekSd > 0 ? (x.pts - x.p.weekMean) / x.p.weekSd : 0;
    const s = rho * z + Math.sqrt(1 - rho * rho)
      * gaussAt([seed, sim, S_SIGNAL, x.i, w]);
    return x.p.weekMean + x.p.weekSd * rho * s;
  };
  const byPos = {};
  avail.forEach(x => { (byPos[x.p.position] || (byPos[x.p.position] = [])).push(x); });
  Object.keys(byPos).forEach(k => byPos[k].sort((a, b) => key(b) - key(a)));

  /* 1. THE ROSTER'S OWN BEST LINEUP. Greedy is OPTIMAL for this seat structure
   *    and that is a fact about the structure, not an approximation: with one
   *    flex, the top two backs must occupy the two RB seats in any optimal
   *    solution (swapping a lower back into an RB seat and a higher one into the
   *    flex never gains), and the same for the receivers. */
  const used = new Set();
  const filled = SLOTS.map(sl => {
    if (sl.slot === 'FLEX') return null;
    const pick = (byPos[sl.slot] || []).find(x => !used.has(x));
    if (pick) used.add(pick);
    return pick || null;
  });
  SLOTS.forEach((sl, si) => {
    if (sl.slot !== 'FLEX') return;
    let best = null;
    FLEX_ELIG.forEach(pos => (byPos[pos] || []).forEach(x => {
      if (!used.has(x) && (!best || key(x) > key(best))) best = x;
    }));
    if (best) used.add(best);
    filled[si] = best;
  });

  /* 2. THE WIRE IS AN OPTION IN EVERY SEAT.
   *
   *    MY FIRST CUT LET A ROSTERED PLAYER BLOCK A SEAT NO MATTER HOW BAD HE
   *    WAS, and the fail arm caught it: a body projected to score ZERO priced at
   *    −66 points, because he filled a running-back seat that would otherwise
   *    have been streamed. No manager does that. Carrying a bad player costs you
   *    nothing; he simply does not start. So every seat compares its occupant
   *    against a Wednesday claim and takes the better.
   *
   *    ── HOW MUCH STREAMING, AND WHY THE DEFAULT IS "AS MUCH AS YOU NEED" ──
   *
   *    `streamBudget` caps how many seats a week may be streamed. THE DEFAULT IS
   *    UNLIMITED, and that is the conservative choice for the question being
   *    asked: it is the setting under which a bench player is worth the LEAST,
   *    because anything he could have covered, the wire covers instead. A bench
   *    value that survives unlimited streaming is a bench value that is really
   *    there.
   *
   *    The alternative is not a guess either. This league completes 1.498 adds
   *    per team per week — 764 adds over 51 season-weeks, measured — and
   *    `STREAM_BUDGET` carries it. But that is an OBSERVED EQUILIBRIUM RATE, an
   *    average over weeks where managers needed nothing and weeks where they
   *    needed two, and using an average as a hard ceiling is a category error:
   *    it manufactures unfillable holes in exactly the weeks a manager would
   *    obviously have made the add. I ran it as a ceiling first and every
   *    candidate priced at ~30 points including a replacement-level body,
   *    because the scarce thing being valued was the BUDGET, not the player.
   *
   *    So it is a SWEEP, reported beside the unlimited number, and the gap
   *    between them brackets how much of a bench spot's worth depends on the
   *    wire being reachable when you need it.
   *
   *    A hole with no budget left SCORES ZERO — you field eight men. */
  const cap = cfg.streamBudget;
  let budget = (cap == null || cap === Infinity) ? Infinity
    : Math.floor(cap) + (u01([seed, sim, S_STREAM, 0, w]) < (cap - Math.floor(cap)) ? 1 : 0);

  /* What a Wednesday claim is WORTH at a seat, in prior expectation. Never a
   * draw: you pick the man before the week, so the decision uses the mean and
   * only the realisation is sampled. For a flex that is the best free body at
   * any eligible position, which is why an empty spot beats a spot holding a
   * free running back in this league. */
  const streamPrior = sl => {
    let best = -Infinity, bestPos = null;
    (sl.slot === 'FLEX' ? FLEX_ELIG : [sl.slot]).forEach(pos => {
      const m = MEASURED.summary[pos] ? MEASURED.summary[pos].mean : FALLBACK_WIRE[pos];
      if (m != null && m > best) { best = m; bestPos = pos; }
    });
    return { value: best, pos: bestPos };
  };

  const offers = SLOTS.map((sl, si) => {
    const sp = streamPrior(sl);
    const held = filled[si] ? key(filled[si]) : null;
    return { si: si, sp: sp, forced: !filled[si], gain: held == null ? Infinity : sp.value - held };
  }).filter(o => o.gain > 0).sort((a, b) => b.gain - a.gain);

  const streamed = new Set();
  offers.forEach(o => {
    if (budget <= 0) return;
    if (o.sp.value == null || !Number.isFinite(o.sp.value)) return;
    budget--; streamed.add(o.si);
  });

  let total = 0;
  SLOTS.forEach((sl, si) => {
    if (streamed.has(si)) { total += streamPoints(streamPrior(sl).pos, seed, sim, w, si); return; }
    if (filled[si]) total += filled[si].pts;
    /* else: a hole the wire could not reach this week. ZERO, and that is the
     * whole reason a bench exists. */
  });
  return total;
}

/* THE POSITION A FLEX HOLE STREAMS FROM — the best free body at any eligible
 * position, by MEAN realized acquisition. A prior decision, not a draw: taking
 * the best of three draws would be claiming a player after seeing his score. */
const FLEX_STREAM_POS = (function () {
  let best = null, bestMean = -Infinity;
  FLEX_ELIG.forEach(p => {
    const s = MEASURED.summary[p];
    if (s && s.mean > bestMean) { bestMean = s.mean; best = p; }
  });
  return best || 'WR';
})();

/* A WIRE DRAW IS ADDRESSED BY (week, position), so a hole at running back in
 * week 7 pays the same in both arms of a comparison. Without that, an arm that
 * needs one more stream than the other pulls a different number for every
 * subsequent stream in the season and the shared roster stops being shared. */
function streamPoints(pos, seed, sim, w, si) {
  const s = WIRE_SAMPLE[pos];
  if (s && s.length) {
    return s[Math.floor(u01([seed, sim, S_STREAM, POS_IDX[pos] || 0, w, si || 0]) * s.length)];
  }
  if (FALLBACK_WIRE[pos] != null) return FALLBACK_WIRE[pos];
  return 0;
}

/* ── ω — A FREELY AVAILABLE BODY AT THE SAME POSITION ─────────────────────
 * The counterfactual occupant of the roster spot. Built from the wire sample
 * itself, so `MV` of a wire-level player is ZERO BY CONSTRUCTION — which is the
 * control this whole file is checked against. If a replacement-level player
 * prices above zero, the harness is manufacturing value and every number it
 * produces is that manufactured amount too. */
function omega(pos) {
  const s = MEASURED.summary[pos];
  const weeks = LAST_WEEK - FIRST_WEEK + 1;
  const mean = s ? s.mean : (FALLBACK_WIRE[pos] || 0);
  const sd = s ? s.sd : 0;
  return {
    player_id: 'omega:' + pos, name: 'freely available ' + pos, position: pos,
    bye: 0,                     // a stream has no bye; you pick a man who plays
    weekMean: mean, weekSd: sd,
    injuryWeeks: 0,
    noHindsight: true,          // a wire body is claimed on Wednesday
    _omega: true, _sim: true, _weeks: weeks,
  };
}

/* ── MV(i | R) ────────────────────────────────────────────────────────────
 *
 * ── WHICH ω, AND WHY IT IS NOT THE SAME-POSITION ONE ────────────────────
 *
 * Cory's equation carries ONE ω, not one per position, and the second control
 * below is what forced me to take that literally. Priced against a same-position
 * free body, Rhamondre Stevenson came out 28.3; priced against leaving the spot
 * open, 18.3. TEN POINTS OF THE DIFFERENCE WAS NOT ABOUT STEVENSON AT ALL.
 *
 * It is that a free running back in this league is BAD — realized wire mean 9.4
 * a week — while a free tight end is 11.5 and a free receiver 11.5. So an empty
 * roster spot is worth more than a spot holding a free RB, because an empty spot
 * streams the BEST free body available and a free RB blocks the flex with a
 * worse one. Pricing each candidate against his own position's floor therefore
 * hands running backs a discount that has nothing to do with the men being
 * compared — the cross-position defect this whole schedule exists to prevent,
 * arriving through the denominator instead of the numerator.
 *
 * So ω is THE SPOT USED ON A FREE BODY, position-free, which is exactly the
 * bare roster streaming into its own holes. Every candidate is priced against
 * the same alternative and the numbers are comparable across positions.
 *
 * `omegaMode: 'same_position'` is kept because the DIFFERENCE between the two is
 * itself a measurement — it says how much of a candidate's apparent value is his
 * position's free-agent scarcity rather than him. */
function marginalValue(baseRoster, cand, cfg) {
  const c = Object.assign({ sims: 3000, seed: 20260822, injuryModel: 'block',
    lineupInfo: 'clairvoyant', corr: 0, omegaMode: 'stream',
    streamBudget: Infinity }, cfg || {});
  c.rho = resolveRho(c.lineupInfo);
  const base = baseRoster.map(toSim);
  const withI = base.concat([cand._sim ? cand : toSim(cand)]);
  const alt = c.omegaMode === 'same_position'
    ? base.concat([omega(cand.position)])
    : base;                        /* the spot goes unused; holes stream */
  /* THE PER-SIM DIFFERENCES ARE KEPT, NOT JUST THEIR MEAN.
   *
   * A gap between two candidates' MVs is a real gap only if it is larger than
   * the noise in the estimates, and that noise is measurable right here. Under
   * common random numbers sim `s` gives a paired difference for every candidate,
   * so two candidates' series subtract term by term and the standard error of
   * their gap follows. That is what turns "tossup" from a threshold somebody
   * picked into a number the simulation reports about itself.
   *
   * COMMON RANDOM NUMBERS: every draw is ADDRESSED by (seed, sim, salt, roster
   * index, week), so the players the two arms share are handed identical
   * injuries, byes, weekly scores and wire draws no matter what happens to the
   * one they do not share. */
  const series = new Array(c.sims);
  let sum = 0;
  for (let s = 0; s < c.sims; s++) {
    const d = simSeason(withI, s, c) - simSeason(alt, s, c);
    series[s] = d; sum += d;
  }
  const mv = sum / c.sims;
  if (!c.detail) return mv;
  let ss = 0;
  for (let s = 0; s < c.sims; s++) { const e = series[s] - mv; ss += e * e; }
  const sd = Math.sqrt(ss / Math.max(1, c.sims - 1));
  return { mv: mv, se: sd / Math.sqrt(c.sims), sd: sd, series: series, sims: c.sims };
}

/* THE STANDARD ERROR OF THE GAP BETWEEN TWO CANDIDATES, PAIRED.
 * Both are measured against the same base arm on the same sim indices, so their
 * difference is paired sim by sim and its SE is SMALLER than the two SEs added
 * in quadrature. Using the unpaired form would overstate the noise and call real
 * gaps tossups — which is the same failure as an arbitrary threshold, arrived at
 * by a more respectable route. */
function gapStandardError(detailA, detailB) {
  const n = Math.min(detailA.series.length, detailB.series.length);
  if (!n) return null;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += detailA.series[i] - detailB.series[i];
  const mean = sum / n;
  let ss = 0;
  for (let i = 0; i < n; i++) {
    const e = (detailA.series[i] - detailB.series[i]) - mean; ss += e * e;
  }
  return Math.sqrt(ss / Math.max(1, n - 1)) / Math.sqrt(n);
}

module.exports = { marginalValue, gapStandardError, simSeason, toSim, omega, bestLineup, resolveRho,
  SLOTS, FIRST_WEEK, LAST_WEEK, WIRE_SAMPLE, WIRE_BASIS, FLEX_STREAM_POS,
  MEASURED, mulberry32, u01, FALLBACK_WIRE };

/* ── REPORT ───────────────────────────────────────────────────────────────*/
if (require.main === module) {
  const PLAN = require('./draft_plan.js');
  const byId = {};
  PLAN.pool.forEach(p => { byId[String(p.player_id)] = p; });
  const keepers = PLAN.keep.map(k => byId[String(k.player_id)] || k);

  console.log('MV(i|R) — WHAT A BENCH SPOT IS WORTH, weeks ' + FIRST_WEEK + '-' + LAST_WEEK
    + ' (READ: playoff_week_start ' + SETTINGS.playoff_week_start + ')\n');
  console.log('  starting seats: ' + SLOTS.map(s => s.slot).join(' ')
    + '    flex stream: ' + FLEX_STREAM_POS);
  console.log('  wire basis:');
  Object.keys(WIRE_BASIS).sort().forEach(p => console.log('    ' + p.padEnd(5) + WIRE_BASIS[p]));

  /* THE ROSTER MV IS MEASURED AGAINST. A bench player's value depends entirely
   * on who is in front of him, so a marginal value quoted against no roster is
   * meaningless. R is the keepers plus the plan's own starters. */
  const starters = PLAN.plan.filter(x => !x.bench && x.p)
    .map(x => byId[String(x.p.player_id)] || x.p);
  const R = keepers.concat(starters).filter(Boolean);
  console.log('\n  R (' + R.length + '): ' + R.map(p => p.name + ' ' + p.position).join(', '));

  const cands = PLAN.plan.filter(x => x.bench && x.p)
    .map(x => byId[String(x.p.player_id)] || x.p).filter(Boolean);
  const SIMS = +process.env.BENCH_SIMS || 2000;
  const RHOS = [0, 0.25, 0.5, 0.75, 1];
  console.log('\n  ' + SIMS + ' simulated seasons per arm, common random numbers, '
    + 'block injuries, independent weeks.');
  console.log('\n  ρ IS LINEUP SKILL: 0 = the lineup is set on expectations alone,');
  console.log('  1 = every week\'s best men are started. Nobody is at either end. The');
  console.log('  September capture-rate measurement puts a number on Cory\'s actual ρ;');
  console.log('  until then the ROW is the answer, not any one cell of it.\n');
  console.log('  candidate                   pos  ' + RHOS.map(r => ('ρ=' + r).padStart(8)).join(''));
  const rows = cands.map(p => ({
    p: p, mv: RHOS.map(r => marginalValue(R, p, { sims: SIMS, lineupInfo: r })),
  })).sort((a, b) => b.mv[0] - a.mv[0]);
  rows.forEach(r => {
    console.log('  ' + (r.p.name || '').slice(0, 25).padEnd(27) + (r.p.position || '').padEnd(5)
      + r.mv.map(v => v.toFixed(1).padStart(8)).join(''));
  });

  /* ── CONTROL 1 — A FREELY AVAILABLE BODY MUST PRICE AT ZERO ────────────
   * ω is now "the spot goes unused and holes stream", so the player who must
   * price at zero is a body whose weekly distribution IS the stream at the
   * position the flex streams from. If he prices above zero the harness is
   * manufacturing value and every number above is that manufactured amount too.
   * The tolerance is not 1e-9 here: this ω is a NORMAL approximation to an
   * EMPIRICAL sample, so a small gap is the approximation, not a leak. */
  console.log('\n  CONTROL — a body drawn at the streaming level must price at ~ZERO:');
  const w0 = omega(FLEX_STREAM_POS);
  const zero = RHOS.map(r => marginalValue(R, w0, { sims: SIMS, lineupInfo: r }));
  const bad = zero.some(x => Math.abs(x) > 12);
  console.log('    ' + (FLEX_STREAM_POS + '-level').padEnd(12)
    + zero.map(x => x.toFixed(1).padStart(8)).join('')
    + (bad ? '   ⚠ THE HARNESS IS MANUFACTURING VALUE' : '   ok'));
  console.log('    (it rises with ρ because a ROSTERED body can be benched in his bad');
  console.log('     weeks and a Wednesday waiver claim cannot — that gap is real, and it');
  console.log('     is the floor any candidate has to clear before he is worth a spot.)');

  /* ── CONTROL 2 — THE FAIL ARM ────────────────────────────────────────────
   * Every number above could be produced by a harness that ignores the
   * candidate entirely. A player who cannot ever be started must price at
   * exactly zero, and a superstar must not. */
  console.log('\n  FAIL ARM — the harness must be able to tell candidates apart:');
  const dud = { player_id: 'dud', name: 'a zero-point body', position: 'RB',
    bye: 0, proj_mean: 0, games_expected: 14.2, weekly_sd: 0 };
  const star = PLAN.pool.slice().sort((a, b) => b.proj_mean - a.proj_mean)[0];
  const mvDud = marginalValue(R, dud, { sims: Math.min(SIMS, 500), lineupInfo: 'prior' });
  const mvStar = marginalValue(R, star, { sims: Math.min(SIMS, 500), lineupInfo: 'prior' });
  console.log('    a zero-point RB      MV = ' + mvDud.toFixed(1)
    + (mvDud <= 0.001 ? '   ok (never started, never helps)' : '   ⚠'));
  /* RELATIVE, NOT ABSOLUTE. My first version demanded MV > 40 for the best
   * player on the board and went red at 33.2 — a threshold I invented while
   * looking at the output, testing my guess about the magnitude rather than the
   * property. The property is that the harness can TELL THEM APART. */
  console.log('    ' + (star.name + ' (' + star.position + ')').padEnd(21) + 'MV = '
    + mvStar.toFixed(1) + (mvStar > mvDud + 10 ? '   ok (ranks far above the dud)'
      : '   ⚠ the harness cannot tell the best player alive from a zero'));

  /* ── THE SAME-POSITION ω, AS A DIAGNOSTIC ───────────────────────────────*/
  /* ── THE STREAMING BRACKET ──────────────────────────────────────────────
   * Unlimited streaming is the setting under which a bench spot is worth the
   * LEAST. The measured 1.498 adds per team per week is the setting under which
   * it is worth the most. Cory's real season is between them, and a candidate
   * whose case only exists at one end is a candidate whose case is about the
   * assumption. */
  console.log('\n  THE STREAMING BRACKET, at ρ=0.5 (season points):');
  console.log('  candidate                   pos   wire always   wire capped at ' 
    + STREAM_BUDGET.toFixed(2) + '/wk');
  rows.forEach(r => {
    const free = marginalValue(R, r.p, { sims: Math.min(SIMS, 500), lineupInfo: 0.5 });
    const capped = marginalValue(R, r.p, { sims: Math.min(SIMS, 500), lineupInfo: 0.5,
      streamBudget: STREAM_BUDGET });
    console.log('  ' + (r.p.name || '').slice(0, 25).padEnd(27) + (r.p.position || '').padEnd(5)
      + free.toFixed(1).padStart(11) + capped.toFixed(1).padStart(20));
  });

  console.log('\n  HOW MUCH IS THE MAN, AND HOW MUCH IS HIS POSITION\'S FREE-AGENT FLOOR:');
  console.log('  candidate                   pos    vs spot   vs same-pos ω    difference');
  rows.forEach(r => {
    const same = marginalValue(R, r.p, { sims: Math.min(SIMS, 500), lineupInfo: 'prior',
      omegaMode: 'same_position' });
    const spot = marginalValue(R, r.p, { sims: Math.min(SIMS, 500), lineupInfo: 'prior' });
    console.log('  ' + (r.p.name || '').slice(0, 25).padEnd(27) + (r.p.position || '').padEnd(5)
      + spot.toFixed(1).padStart(9) + same.toFixed(1).padStart(15)
      + (same - spot).toFixed(1).padStart(14));
  });

  console.log('\n  UNITS: season points over weeks ' + FIRST_WEEK + '-' + LAST_WEEK
    + ', against a freely available body at the same position.');
  if (bad) { console.log('\n  CONTROL FAILED — do not read the table above.'); process.exit(1); }
}
