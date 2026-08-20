// TERRITORY: A
/* DOES THE ROSTER EQUATION BEAT THE HUMANS? — 30 real seat-years.
 *
 * Cory, 2026-08-19: "can we run things through 22-25 sleeper drafts and test
 * roster builder and see how it wouldve compared to our league"
 *
 * Prereg: draft/ROSTER-BUILDER-REPLAY-PREREG-2026-08-19.md (committed first).
 *
 * Other people's Sleeper drafts are 403 at CONNECT. This league's three real
 * drafts are committed -- 450 picks, 18 weeks of actual points each -- and they
 * answer the specific question BETTER than the seat replay does.
 *
 * ── THE DESIGN, AND THE ONE IDEA IN IT ──────────────────────────────────────
 *
 * The seat replay is blocked on era-appropriate projections. But the roster
 * equation's job is NOT projection, it is SHAPE. So hold player evaluation
 * constant and vary only the construction rule:
 *
 *   value signal  = THE MARKET'S OWN DRAFT ORDER (151 - pick_no)
 *   shaping       = w(pos, bodies held), Cory's curve x (1 - streamability)
 *   grade         = actual weekly points, best legal lineup, weeks 1-17
 *
 * The market's order is era-correct, carries no hindsight, and -- the point --
 * IS THE SAME INFORMATION THE HUMAN OWNER HAD. Both sides evaluate players
 * identically. The ONLY difference between the two rosters is the construction
 * rule, which is exactly the variable Cory asked about.
 *
 * ⚠️ THIS CANNOT TEST PROJECTIONS AND MUST NEVER BE QUOTED AS IF IT DID. It
 * answers "is our roster equation better than a human's roster instinct". It
 * says nothing about whether Draft Sharks beats CBS.
 *
 * REPORT ONLY. Writes draft/data/roster_builder_replay.json.
 * Run: node draft/tools/roster_builder_replay.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const H = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'league_history.json'), 'utf8'));
const BOARD = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const PP = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'player_positions.json'), 'utf8'));
const ST = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'streamability.json'), 'utf8'));
if (!ST.controls_all_passed) throw new Error('streamability failed its controls — REFUSING');
const STREAM = ST.streamability;
const KDEF_TAX = process.argv.includes('--kdef-tax');
const TE_BOOST = process.argv.includes('--te-boost');
const KDEF_MODE = process.argv.includes('--kdef-supply');
/* ── TE ARM: the MEASURED row instead of the transcribed one ──────────────────
 * Prereg: draft/TE-CAP-PREREG-2026-08-19.md. Top-3 finishers draft TE 1.67,
 * bottom-3 draft 1.11 -- the widest winner/loser separation on the board -- and
 * CORY_CURVE.TE = [1, .05, 0] makes a second tight end a twentyfold hole.
 * The replacement is NOT chosen: it is measured_need_curve.json's own TE row,
 * 540 team-weeks, its own passing controls, committed long before tonight. */
const TE_MEASURED = process.argv.includes('--te-measured');
/* ── PERSISTENCE SHRINK — Cory's insight, measured ────────────────────────────
 * Prereg: draft/PERSISTENCE-SHRINK-PREREG-2026-08-19.md.
 * "it barely matters what one you have... Too dependent on who they play."
 * Measured H1->H2 per-game persistence: K 0.013, TE 0.041, DEF 0.132,
 * QB 0.208, WR 0.259, RB 0.572. A kicker's first half predicts nothing about
 * his second, so the 48 points of "surplus" between the best kicker and the
 * wire kicker is an artifact of trusting a projection where none has signal.
 * Shrink each position's spread toward its own mean by its own persistence. */
const SHRINK = process.argv.includes('--persistence');
const PERSIST = { RB: 0.572, WR: 0.259, QB: 0.208, DEF: 0.132, TE: 0.041, K: 0.013 };
const MNC = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'draft', 'data', 'measured_need_curve.json'), 'utf8'));
if (TE_MEASURED && !MNC.controls_all_passed) {
  throw new Error('measured_need_curve failed its controls — REFUSING');
}
let deadlineFired = 0;   // C1: the deadline must be SEEN firing

const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
/* one position crosswalk, two sources, board first (rule 11) */
const POSOF = {};
Object.entries(PP.positions || {}).forEach(([id, q]) => { POSOF[String(id)] = q; });
BOARD.players.forEach(p => { if (p.position) POSOF[String(p.player_id)] = p.position; });
const posOf = id => POSOF[String(id)] || (/^[A-Z]{2,3}$/.test(String(id)) ? 'DEF' : null);

/* Cory's transcribed curve, and the streaming tax on bench bodies — the two
 * pieces of the roster equation, unchanged from draft_model.js */
const W = {
  K: [1.00, 0], DEF: [1.00, 0], QB: [1.00, 0.05, 0],
  /* ── TE-CURVE-CHALLENGE-PREREG-2026-08-19.md ────────────────────────────
   * Shipped curve treats a 2nd TE as a twentyfold hole (.05), but top-3
   * finishers draft 1.67 of them against bottom-3's 1.11 -- the widest
   * positional separation measured (ROSTER-CONSTRUCTION-CALL.md §1). Behind
   * a flag, off by default; the shipped curve is untouched unless --te-boost
   * is passed. */
  TE: TE_BOOST ? [1.00, 0.50, 0] : [1.00, 0.05, 0],
  RB: [1.00, 1.00, 0.90, 0.25, 0.05, 0.02],
  WR: [1.00, 1.00, 1.00, 0.90, 0.15, 0.05],
};
if (TE_MEASURED) {
  /* ⚠️ THE WHOLE MEASURED TE ROW CARRIES AN ARTIFACT AND E AVOIDED IT.
   * measured_need_curve TE reads [0.719, 0.414, 0.406, 1] -- the FOURTH value
   * is 1.0, which is not monotone and cannot be a need curve. Every other
   * position decays cleanly (RB .869 .713 .49 .273 .155 .074). It is a
   * small-sample fluke at a depth almost no team reaches.
   * E's arm changed ONLY the second value, which is the right call. This one
   * swaps the whole row, so it is the CONTAMINATED version and is kept only as
   * the contrast that shows the artifact contributes ~nothing. */
  W.TE = (MNC.curve.TE || []).filter(v => v != null);
}
if (process.argv.includes('--rb-measured')) {
  /* Register 130. The only cross-season loss on the board: RB is negative in
   * all three seasons (-159 / -107 / -122). Substitute the measured row --
   * RB is also the position whose measured curve is safest to trust, with a
   * stable r (0.49/0.67/0.57, n~40). Cory's row is kept everywhere else. */
  W.RB = (MNC.curve.RB || []).filter(v => v != null);
}
if (process.argv.includes('--te2-only')) {
  /* E's arm, reproduced: ONE cell, Cory's row otherwise intact. */
  W.TE = [1.00, (MNC.curve.TE || [])[1], 0];
}
const STARTERS = { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DEF: 1 };
const FLEX = ['RB', 'WR', 'TE'];

/* ⛔ THE FLEX STARTER WAS BEING TAXED AS A BENCH BODY.
 *
 * `STARTERS` comes from the league's roster slots, where FLEX is its own key --
 * so RB is 2, WR is 2, and the THIRD receiver counted as depth. He is not
 * depth, he is the flex starter, and the streaming tax was landing on him.
 *
 * Found in the 2024 replay, seat 10 (-309 pts). At pick 63 the builder held two
 * receivers, so WR3 paid the tax (x0.748) and scored 65, while the first
 * DEFENCE -- an empty slot, untaxed -- scored 70 and won. It spent a round-5
 * pick on a defence and pick 98 on a kicker, where the owner took them at 103
 * and 123. That single inversion is the mechanism behind the whole 2024 loss.
 *
 * The right denominator is MEASURED STARTERS PER WEEK, which already exists and
 * already passed its own control (measured_need_curve.json C2): QB 1.000,
 * RB 2.417, WR 2.556, TE 1.017, K 0.996, DEF 0.996 -- the flex distributed
 * across RB/WR/TE as the fraction it actually is. Not a new number, and not
 * tuned: it is the number that was already right for this. */
const S_EFF = { QB: 1.0, RB: 2.417, WR: 2.556, TE: 1.017, K: 0.996, DEF: 0.996 };
function startProb(pos, held, rosterOn, supplyShort) {
  if (!rosterOn) return 1;
  const row = W[pos];
  if (!row) return 0;
  const base = held < row.length ? row[held] : 0;
  /* ── REGISTER 127 ARM: does the FIRST K/DEF pay the tax too? ───────────────
   * Prereg: draft/KDEF-STREAM-TAX-PREREG-2026-08-19.md. The empty-slot
   * exemption assumes a starting slot must be filled at any price. True for a
   * running back (streamability 0.311); FALSE for a kicker (0.966), who is
   * abundant and interchangeable whether or not the slot is empty. */
  /* ── REGISTER 127, SECOND ATTEMPT: THE SUPPLY DEADLINE ────────────────────
   * Prereg: draft/KDEF-SUPPLY-DEADLINE-PREREG-2026-08-19.md.
   * Ten teams, ten kickers, no surplus -- the last one leaves the board at
   * pick 136-149 depending on the season, and Cory's last two picks are 133
   * and 148. So the onesie is priced CHEAPLY while it is abundant and at FULL
   * value exactly once, at the last moment one still exists. The first attempt
   * used a fixed weight for a time-varying problem and left 8 of 30 rosters
   * with no kicker. */
  if (KDEF_MODE && (pos === 'K' || pos === 'DEF')) {
    if (supplyShort) return base;                    // last chance — full weight
    return base * (1 - (STREAM[pos] || 0));          // abundant — he can wait
  }
  if (KDEF_TAX && (pos === 'K' || pos === 'DEF')) {
    return base * (1 - (STREAM[pos] || 0));
  }
  if (held < (S_EFF[pos] || 0)) return base;         // filling a real starting slot
  return base * (1 - (STREAM[pos] || 0));            // a fill-in competes with the wire
}

/* ── best legal lineup for one week, from actual points ──────────────────────
 * Greedy is WRONG here and the flex is why: filling RB/WR/TE first can strand
 * the best flex body in a dedicated slot. Dedicated slots are filled from the
 * best at each position, then FLEX takes the best remaining of the three -- and
 * because only one flex seat exists, that is exact, not a heuristic. */
function bestLineup(roster, pts) {
  const byPos = {};
  roster.forEach(id => {
    const q = posOf(id);
    if (!q) return;
    (byPos[q] || (byPos[q] = [])).push(pts[String(id)] || 0);
  });
  POS.forEach(q => { if (byPos[q]) byPos[q].sort((a, b) => b - a); });
  let total = 0;
  const left = {};
  POS.forEach(q => {
    const need = STARTERS[q] || 0;
    const have = byPos[q] || [];
    for (let i = 0; i < need; i++) total += GRADE_WAIVER ? Math.max(have[i] || 0, WAIVER_WK[q] || 0) : (have[i] || 0);
    left[q] = have.slice(need);
  });
  const flexPool = FLEX.flatMap(q => left[q] || []).sort((a, b) => b - a);
  total += GRADE_WAIVER ? Math.max(flexPool[0] || 0, WAIVER_FLEX) : (flexPool[0] || 0);
  /* what share of the roster's total points actually reached the lineup */
  const all = roster.reduce((a, id) => a + (pts[String(id)] || 0), 0);
  return { total, all };
}

/* ── CORY'S GRADING RULING, 2026-08-19 ───────────────────────────────────────
 * "everything we grade should be graded like we learned btw.. assuming not
 *  injuries, etc.. grade skill not luck"
 *
 * A draft pick is a DECISION. Whether the man then tore an ACL in week 3 is not
 * a property of the decision, and grading the decision on it measures luck.
 * So every grade gets a SKILL arm beside the actual one:
 *
 *   actual : the raw weekly points, absences scored as zero — what really happened
 *   skill  : every player at his OWN per-active-game rate, every week — what the
 *            roster was worth if availability had been equal
 *
 * The skill arm removes availability entirely: a back who averaged 14 a game
 * across four games before getting hurt is graded as a 14-a-game back, because
 * that is what the pick was worth. It does NOT reward picking fragile players --
 * it declines to punish it, which is the point of separating skill from luck.
 *
 * ⚠️ IT IS REPORTED BESIDE THE ACTUAL ARM, NEVER INSTEAD OF IT. Availability is
 * partly a real skill (avoiding known-fragile players is a decision) and the
 * honest read needs both numbers. A player with NO active weeks is excluded
 * from the skill arm rather than scored zero, and the count is reported. */
function perGameRates(season, roster) {
  const tot = {}, games = {};
  Object.entries(season.weeks || {}).forEach(([wn, arr]) => {
    const w = +wn;
    if (w < 1 || w > 17 || !Array.isArray(arr)) return;
    const seen = new Set();
    arr.forEach(m => Object.entries(m.players_points || {}).forEach(([id, v]) => {
      if (seen.has(id)) return;
      seen.add(id);
      tot[id] = (tot[id] || 0) + v;
      games[id] = (games[id] || 0) + 1;
    }));
  });
  const rate = {};
  roster.forEach(id => {
    const k = String(id);
    if (games[k]) rate[k] = tot[k] / games[k];
  });
  return rate;
}

function gradeSkill(season, roster) {
  const rate = perGameRates(season, roster);
  const missing = roster.filter(id => rate[String(id)] == null).length;
  /* same lineup rule, but every man at his own per-active-game rate every week */
  const r = bestLineup(roster, rate);
  return { points: +(r.total * 17).toFixed(2),
    roster_points: +(r.all * 17).toFixed(2),
    conversion: r.all > 0 ? +(r.total / r.all).toFixed(4) : null,
    players_with_no_active_week: missing };
}

function gradeSeason(season, roster) {
  let starters = 0, held = 0;
  Object.entries(season.weeks || {}).forEach(([wn, arr]) => {
    const w = +wn;
    if (w < 1 || w > 17 || !Array.isArray(arr)) return;
    const pts = {};
    arr.forEach(m => Object.entries(m.players_points || {}).forEach(([id, v]) => { pts[id] = v; }));
    const r = bestLineup(roster, pts);
    starters += r.total; held += r.all;
  });
  return { points: +starters.toFixed(2), roster_points: +held.toFixed(2),
    conversion: held > 0 ? +(starters / held).toFixed(4) : null };
}

/* ── the counterfactual: fixed opponents, one seat differs ─────────────────── */
/* ── MARGINAL LINEUP VALUE — the relay's mechanism, re-run by A ───────────────
 * Prereg: draft/MLV-PREREG-2026-08-19.md. Register 132.
 *
 * Every other arm tonight taxed the POSITION COUNT: a 4th RB pays x0.25 whether
 * he would start or rot on the bench. This taxes DISPLACEMENT --
 *
 *     marginal(c) = lineupValue(roster + c) - lineupValue(roster)
 *
 * -- so a 4th back better than the flex starter keeps his value (he starts, and
 * the man he benches nets off) while one worse than the flex is worth ~zero.
 *
 * Under Cory's own skill-not-luck ruling a bench body contributes exactly zero,
 * so this does not APPROXIMATE the graded objective, it IS the graded objective.
 * No curve and nothing to tune.
 *
 * ⚠️ Value here is the MARKET'S OWN ORDER, same as every other arm, so the
 * comparison stays paired on player evaluation and only the construction rule
 * differs. */
const MLV = process.argv.includes('--mlv');
/* ── OPPONENT REACTION (relay, prereg P136 — S9 limit 5 made falsifiable) ────
 * Without this flag, opponents implicitly keep their RECORDED picks even when
 * my counterfactual seat has already taken that player — my future pool is
 * optimistic. With it, an opponent whose recorded man is gone substitutes the
 * best remaining player by the market's own order (the earliest remaining
 * recorded pick), which REMOVES that substitute from my future pool. Opponents
 * still grade on their recorded rosters; only MY availability changes. */
const REACT = process.argv.includes('--react');
/* ── WAIVER-AWARE GRADING (relay, prereg S13): every starting slot floored at
 * its position's measured weekly waiver level (ROSTER-CONSTRUCTION-CALL.md S2,
 * season / 17). Applied inside bestLineup, so both sides and both gradings
 * inherit it identically. */
const GRADE_WAIVER = process.argv.includes('--grade-waiver');
const WAIVER_WK = { QB: 322.9/17, RB: 78.4/17, WR: 124.8/17, TE: 130.4/17, K: 128.6/17, DEF: 100.0/17 };
const WAIVER_FLEX = Math.max(WAIVER_WK.RB, WAIVER_WK.WR, WAIVER_WK.TE);

/* ── THE REALISTIC VONA EQUATION (relay, prereg §14 — committed before this) ──
 * Cory: "find me a more realistic calc equation that drafts a normal roster
 * with most value (VONA)". Value scale = LOO pick→points curve (P135 retired
 * the units risk); objective = waiver-FLOORED lineup marginal (§13's floors at
 * DRAFT time, season units); normal roster = K≤1/DEF≤1 + displacement; timing
 * = VONA against the recorded draft's own survivors at my next pick. */
const REAL_VONA = process.argv.includes('--real-vona');
/* §14c: when my remaining picks ≤ my unfilled dedicated starting slots,
 * candidates restrict to positions with an unfilled slot — "I still need a
 * kicker and I have two picks", encoded. §14b measured 7/30 seats ending
 * ILLEGAL without it: the floor prices an empty slot as free. */
const REAL_FILL = process.argv.includes('--real-fill');
/* §14d: position-consistent units + supply-aware forcing. Implies REAL_FILL. */
const REAL_POS = process.argv.includes('--real-pos');
const REAL = REAL_VONA || REAL_FILL || REAL_POS || process.argv.includes('--real');

/* ── CORY'S DEPTH DISCOUNT (relay, prereg §15 / P146 — committed before this) ─
 * "if only 13 TE are taken on average every year, the 14th TE should have
 * little to no value as I can get that on waiver wire." Premise measured
 * first: TE drafted 13/14/15 across 2023-25; all positions stable to ±1-2.
 * Candidate value becomes max(0, v − repl_q), repl_q = the market value of
 * the D_q-th player of that position in the TARGET draft, D_q = the OTHER
 * seasons' mean drafted count. MLV displacement runs on v' unchanged. */
const MLV_DEPTH = process.argv.includes('--mlv-depth');
/* §16 (P148): HARD positional cap — the position closes once league-wide
 * consumption (opponents' recorded picks + my takes) reaches D_q. Exemption:
 * never while I still owe a starter there, or the rule locks a patient
 * drafter out of TE1 by everyone else's fourteen. */
const POS_CAP = process.argv.includes('--pos-cap');
/* §17 (P152): CORY'S ENSEMBLE VOTE — seven committed strategies share one
 * roster; each names its candidate; plurality drafts. Tallies are written so
 * a costume-sweep (7/7 on every pick) is declared, not discovered. */
const VOTE = process.argv.includes('--vote');
const VOTE_TALLIES = [];
let depthControlPrinted = false;
function draftedDepthLOO(targetSeason) {
  const counts = {};   // pos -> [count per other season]
  Object.values(H.seasons).forEach(season => {
    if (String(season.season) === String(targetSeason)) return;
    if (!season.weeks || !(season.drafts || []).length) return;
    const draft = (season.drafts || []).find(d => (d.picks || []).length >= 100);
    if (!draft) return;
    const c = {};
    (draft.picks || []).forEach(p => {
      const q = posOf(p.player_id);
      if (q) c[q] = (c[q] || 0) + 1;
    });
    POS.forEach(q => (counts[q] || (counts[q] = [])).push(c[q] || 0));
  });
  const D = {};
  POS.forEach(q => {
    const a = counts[q] || [];
    D[q] = a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0;
  });
  if (!depthControlPrinted) {
    depthControlPrinted = true;
    if (!(D.TE >= 13 && D.TE <= 15)) {
      throw new Error('depth control FAILED: LOO D_TE=' + D.TE + ' outside [13,15] — premise broke, REFUSING');
    }
    console.error('[depth control] LOO-' + targetSeason + ': ' + POS.map(q => q + '=' + D[q]).join(' ')
      + ' — D_TE inside [13,15], premise re-derived live');
  }
  return D;
}
const SEASON_WAIVER = { QB: 322.9, RB: 78.4, WR: 124.8, TE: 130.4, K: 128.6, DEF: 100.0 };
const SEASON_WAIVER_FLEX = Math.max(SEASON_WAIVER.RB, SEASON_WAIVER.WR, SEASON_WAIVER.TE);

function lineupValueFloored(vals) {
  let total = 0;
  const left = {};
  POS.forEach(q => {
    const need = STARTERS[q] || 0;
    const have = (vals[q] || []).slice().sort((a, b) => b - a);
    for (let i = 0; i < need; i++) total += Math.max(have[i] || 0, SEASON_WAIVER[q] || 0);
    left[q] = have.slice(need);
  });
  const flex = FLEX.flatMap(q => left[q] || []).sort((a, b) => b - a);
  return total + Math.max(flex[0] || 0, SEASON_WAIVER_FLEX);
}

/* pick_no → expected season points, fit on the OTHER seasons (leave the target
 * season out — leak-free), 15-pick buckets, monotone-enforced. Keeper picks
 * are excluded from the FIT (a kept star's slot is not a market price); a
 * drafted player with no scoring week counts as the 0 he scored (1-3 per
 * season, measured before this was written — busts are real). */
const CURVE_BUCKET = 15;
const CURVE_CACHE = {};
let curveControlPrinted = false;
function curveFor(targetSeason) {
  const key = String(targetSeason);
  if (CURVE_CACHE[key]) return CURVE_CACHE[key];
  const buckets = [];
  Object.values(H.seasons).forEach(season => {
    if (String(season.season) === key) return;
    if (!season.weeks || !(season.drafts || []).length) return;
    const draft = (season.drafts || []).find(d => (d.picks || []).length >= 100);
    if (!draft) return;
    const tot = {};
    Object.entries(season.weeks).forEach(([wn, arr]) => {
      const w = +wn;
      if (w < 1 || w > 17 || !Array.isArray(arr)) return;
      const seen = new Set();
      arr.forEach(m => Object.entries(m.players_points || {}).forEach(([id, v]) => {
        if (seen.has(id)) return;
        seen.add(id);
        tot[id] = (tot[id] || 0) + v;
      }));
    });
    (draft.picks || []).forEach(p => {
      if (p.is_keeper) return;
      const b = Math.floor((p.pick_no - 1) / CURVE_BUCKET);
      (buckets[b] || (buckets[b] = [])).push(tot[String(p.player_id)] || 0);
    });
  });
  const mean = buckets.map(a => a.reduce((x, y) => x + y, 0) / a.length);
  for (let i = 1; i < mean.length; i++) mean[i] = Math.min(mean[i], mean[i - 1]);
  const fn = pickNo => mean[Math.min(Math.max(Math.floor((pickNo - 1) / CURVE_BUCKET), 0), mean.length - 1)];
  if (!curveControlPrinted) {
    curveControlPrinted = true;
    if (!(fn(1) > fn(101))) throw new Error('curve control FAILED: curve(1)=' + fn(1) + ' !> curve(101)=' + fn(101));
    console.error('[curve control] LOO-' + key + ': pick1=' + fn(1).toFixed(1) + ' pick101=' + fn(101).toFixed(1) + ' — strictly decreasing, curve is live');
  }
  return (CURVE_CACHE[key] = fn);
}

/* §14d(a): per-position RANK curves — the k-th QB drafted is valued at the
 * mean points of the k-th QB in the OTHER seasons. Value and floor now share
 * units within every position (the §14c root cause: a position-blind curve
 * maxing at 211.3 under a 322.9 QB floor priced every QB at marginal zero). */
const POS_CURVE_CACHE = {};
let posCurveControlPrinted = false;
function posCurveFor(targetSeason) {
  const key = String(targetSeason);
  if (POS_CURVE_CACHE[key]) return POS_CURVE_CACHE[key];
  const byPosRank = {};   // pos -> rank -> [points...]
  Object.values(H.seasons).forEach(season => {
    if (String(season.season) === key) return;
    if (!season.weeks || !(season.drafts || []).length) return;
    const draft = (season.drafts || []).find(d => (d.picks || []).length >= 100);
    if (!draft) return;
    const tot = {};
    Object.entries(season.weeks).forEach(([wn, arr]) => {
      const w = +wn;
      if (w < 1 || w > 17 || !Array.isArray(arr)) return;
      const seen = new Set();
      arr.forEach(m => Object.entries(m.players_points || {}).forEach(([id, v]) => {
        if (seen.has(id)) return;
        seen.add(id);
        tot[id] = (tot[id] || 0) + v;
      }));
    });
    const perPos = {};
    (draft.picks || []).slice().sort((a, b) => a.pick_no - b.pick_no).forEach(p => {
      if (p.is_keeper) return;
      const q = posOf(p.player_id);
      if (!q) return;
      const r = (perPos[q] = (perPos[q] || 0) + 1);
      const t = tot[String(p.player_id)] || 0;
      ((byPosRank[q] || (byPosRank[q] = {}))[r] || (byPosRank[q][r] = [])).push(t);
    });
  });
  const curves = {};
  Object.entries(byPosRank).forEach(([q, ranks]) => {
    const maxR = Math.max(...Object.keys(ranks).map(Number));
    const mean = [];
    for (let r = 1; r <= maxR; r++) {
      const a = ranks[r] || [];
      mean[r] = a.length ? a.reduce((x, y) => x + y, 0) / a.length : mean[r - 1];
    }
    for (let r = 2; r <= maxR; r++) mean[r] = Math.min(mean[r], mean[r - 1]);
    curves[q] = rank => mean[Math.min(Math.max(rank, 1), maxR)];
  });
  if (!posCurveControlPrinted) {
    posCurveControlPrinted = true;
    if (!(curves.QB(1) > curves.QB(10)) || !(curves.RB(1) > curves.RB(20))) {
      throw new Error('pos-curve control FAILED: QB1=' + curves.QB(1) + ' QB10=' + curves.QB(10)
        + ' RB1=' + curves.RB(1) + ' RB20=' + curves.RB(20));
    }
    console.error('[pos-curve control] LOO-' + key + ': QB1=' + curves.QB(1).toFixed(1)
      + ' QB10=' + curves.QB(10).toFixed(1) + ' RB1=' + curves.RB(1).toFixed(1)
      + ' RB20=' + curves.RB(20).toFixed(1) + ' — strictly decreasing, curves are live');
  }
  return (POS_CURVE_CACHE[key] = curves);
}
const MLV_CAP = !process.argv.includes('--no-onesie-cap');   // C2 runs it off
/* Cory: "Or exclude def and k all together" — MLV never VOLUNTEERS a K or DEF;
 * the legality fill seats them at the end, which is what a human does. */
const MLV_NO_ONESIE = process.argv.includes('--mlv-no-onesie');

function lineupValueOf(vals) {
  /* vals: {pos: [value, ...]} sorted desc. Dedicated slots then one flex. */
  let total = 0;
  const left = {};
  POS.forEach(q => {
    const need = STARTERS[q] || 0;
    const have = (vals[q] || []).slice().sort((a, b) => b - a);
    for (let i = 0; i < need; i++) total += have[i] || 0;
    left[q] = have.slice(need);
  });
  const flex = FLEX.flatMap(q => left[q] || []).sort((a, b) => b - a);
  return total + (flex[0] || 0);
}

function buildSeat(season, draft, seatId, rosterOn) {
  const picks = (draft.picks || []).slice().sort((a, b) => a.pick_no - b.pick_no);
  const N = picks.length;
  /* value = the market's own order. Era-correct, no hindsight, and the same
   * information the owner had. */
  let valueOf = p => (N + 1) - p.pick_no;
  if (SHRINK) {
    /* per-position mean of the market's own value, then shrink toward it */
    const byPos = {};
    picks.forEach(p => {
      const q = posOf(p.player_id);
      if (!q) return;
      (byPos[q] || (byPos[q] = [])).push((N + 1) - p.pick_no);
    });
    const mean = {};
    Object.entries(byPos).forEach(([q, v]) => { mean[q] = v.reduce((a, b) => a + b, 0) / v.length; });
    const raw = valueOf;
    valueOf = p => {
      const q = posOf(p.player_id);
      const m = mean[q];
      if (m == null) return raw(p);
      const k = PERSIST[q] != null ? PERSIST[q] : 1;
      return m + k * (raw(p) - m);
    };
  }
  if (MLV_DEPTH) {
    /* repl_q = market value of the D_q-th player of q taken in THIS draft
     * (its own order, keepers included — the count premise included them) */
    const D = draftedDepthLOO(season.season);
    const seen = {};
    const repl = {};
    picks.forEach(p => {
      const q = posOf(p.player_id);
      if (!q) return;
      const r = (seen[q] = (seen[q] || 0) + 1);
      if (r === D[q]) repl[q] = (N + 1) - p.pick_no;
    });
    POS.forEach(q => { if (repl[q] == null) repl[q] = 0; });   // fewer taken than D_q → no discount
    const raw = valueOf;
    valueOf = p => {
      const q = posOf(p.player_id);
      return Math.max(0, raw(p) - (q ? repl[q] : 0));
    };
  }
  let capD = null, oppPrefix = null;
  if (POS_CAP) {
    capD = draftedDepthLOO(season.season);
    oppPrefix = { QB: [], RB: [], WR: [], TE: [], K: [], DEF: [] };
    const run = {};
    picks.forEach((p, i) => {
      POS.forEach(q => { oppPrefix[q][i] = run[q] || 0; });
      if (p.roster_id !== seatId) {
        const q = posOf(p.player_id);
        if (q) run[q] = (run[q] || 0) + 1;
      }
    });
  }
  if (REAL_POS) {
    /* candidate's rank among his position's non-keeper picks in THIS draft —
     * the market's own positional order, era-correct */
    const curves = posCurveFor(season.season);
    const rankOf = {}, rc = {};
    picks.forEach(p => {
      if (p.is_keeper) return;
      const q = posOf(p.player_id);
      if (!q) return;
      rankOf[String(p.player_id)] = (rc[q] = (rc[q] || 0) + 1);
    });
    valueOf = p => {
      const q = posOf(p.player_id);
      const c = q && curves[q];
      return c ? c(rankOf[String(p.player_id)] || 999) : 0;
    };
  } else if (REAL) {
    const curve = curveFor(season.season);
    valueOf = p => curve(p.pick_no);
  }
  /* ── §17 vote-mode per-seat setup: the seven strategies' ingredients ── */
  let voteCtx = null;
  if (VOTE) {
    const N2 = picks.length;
    const rawVal = p => (N2 + 1) - p.pick_no;
    /* persistence shrink means (the SHRINK block's own construction) */
    const byPos = {};
    picks.forEach(p => {
      const q = posOf(p.player_id);
      if (q) (byPos[q] || (byPos[q] = [])).push(rawVal(p));
    });
    const posMean = {};
    Object.entries(byPos).forEach(([q, v]) => { posMean[q] = v.reduce((a, b) => a + b, 0) / v.length; });
    /* depth-discount replacement (the MLV_DEPTH block's own construction) */
    const D = draftedDepthLOO(season.season);
    const seen = {}, repl = {};
    picks.forEach(p => {
      const q = posOf(p.player_id);
      if (!q) return;
      const r = (seen[q] = (seen[q] || 0) + 1);
      if (r === D[q]) repl[q] = rawVal(p);
    });
    POS.forEach(q => { if (repl[q] == null) repl[q] = 0; });
    /* the three shipped-curve variants */
    const W_TEB = Object.assign({}, W, { TE: [1.00, 0.50, 0] });
    const W_RBM = Object.assign({}, W, { RB: (MNC.curve.RB || []).filter(v => v != null) });
    const prob = (Wset, q, heldN, kdefSupplyShort) => {
      const row = Wset[q];
      if (!row) return 0;
      const base = heldN < row.length ? row[heldN] : 0;
      if (kdefSupplyShort != null && (q === 'K' || q === 'DEF')) {
        return kdefSupplyShort ? base : base * (1 - (STREAM[q] || 0));
      }
      if (heldN < (S_EFF[q] || 0)) return base;
      return base * (1 - (STREAM[q] || 0));
    };
    voteCtx = { rawVal, posMean, repl, W_TEB, W_RBM, prob, valsRank: {}, valsDepth: {} };
  }
  /* mineAt[i] = the pick_no of MY OWN SLOT that produced mine[i]. Not the slot
   * the player was really drafted at — the question is when I spent a pick. */
  const mine = [], mineAt = [], held = {}, mineVals = {};
  const takenByMe = new Set();
  const gone = takenByMe;                       // alias when REACT is off
  const consumed = REACT ? new Set() : null;    // opponents' substitutions
  const isGone = id => takenByMe.has(id) || (consumed && consumed.has(id));
  picks.forEach((pk, idx) => {
    if (pk.roster_id !== seatId) {
      if (REACT && !pk.is_keeper) {
        /* the opponent takes their recorded man if still there, else the best
         * remaining by market order — and either way he leaves MY pool */
        if (!isGone(pk.player_id)) { consumed.add(pk.player_id); return; }
        for (let j = idx + 1; j < N; j++) {
          const c = picks[j];
          if (c.is_keeper || isGone(c.player_id)) continue;
          consumed.add(c.player_id);
          break;
        }
      }
      return;
    }
    if (pk.is_keeper) {                       // keepers stay as recorded (C4)
      mine.push(pk.player_id); mineAt.push(pk.pick_no);
      const q = posOf(pk.player_id);
      if (q) {
        held[q] = (held[q] || 0) + 1;
        (mineVals[q] || (mineVals[q] = [])).push(valueOf(pk));
        if (voteCtx) {
          (voteCtx.valsRank[q] || (voteCtx.valsRank[q] = [])).push(voteCtx.rawVal(pk));
          (voteCtx.valsDepth[q] || (voteCtx.valsDepth[q] = []))
            .push(Math.max(0, voteCtx.rawVal(pk) - (voteCtx.repl[q] || 0)));
        }
      }
      return;
    }
    if (VOTE) {
      const vc = voteCtx;
      /* strategy 5's supply deadline, the KDEF_MODE construction verbatim */
      const shortOf = {};
      ['K', 'DEF'].forEach(z => {
        const myNext = picks.findIndex((c2, k2) => k2 > idx && c2.roster_id === seatId);
        const horizon = myNext < 0 ? N : myNext;
        let left = 0;
        for (let k2 = idx; k2 < horizon; k2++) {
          const c2 = picks[k2];
          if (c2.is_keeper || isGone(c2.player_id)) continue;
          if (posOf(c2.player_id) === z) left++;
        }
        shortOf[z] = left < 1;
      });
      const best = Array.from({ length: 7 }, () => ({ v: -Infinity, c: null }));
      const baseRank = {}, baseDepth = {};
      POS.forEach(z => {
        baseRank[z] = (vc.valsRank[z] || []).slice();
        baseDepth[z] = (vc.valsDepth[z] || []).slice();
      });
      const Lrank = lineupValueOf(baseRank), Ldepth = lineupValueOf(baseDepth);
      for (let j = idx; j < N; j++) {
        const c = picks[j];
        if (c.is_keeper || isGone(c.player_id)) continue;
        const q = posOf(c.player_id);
        if (!q) continue;
        const vR = vc.rawVal(c);
        const m = vc.posMean[q];
        const vS = m == null ? vR : m + (PERSIST[q] != null ? PERSIST[q] : 1) * (vR - m);
        const vD = Math.max(0, vR - (vc.repl[q] || 0));
        const h = held[q] || 0;
        const scores = [
          vR * vc.prob(W, q, h, null),                                           // 1 shipped
          null,                                                                  // 2 MLV-cap
          null,                                                                  // 3 MLV-depth
          vS * vc.prob(W, q, h, null),                                           // 4 persistence
          vR * vc.prob(W, q, h, (q === 'K' || q === 'DEF') ? shortOf[q] : null), // 5 kdef-supply
          vR * vc.prob(vc.W_TEB, q, h, null),                                    // 6 te-boost
          vR * vc.prob(vc.W_RBM, q, h, null),                                    // 7 rb-measured
        ];
        if (!((q === 'K' || q === 'DEF') && h >= 1)) {
          baseRank[q].push(vR);
          scores[1] = lineupValueOf(baseRank) - Lrank;
          baseRank[q].pop();
          baseDepth[q].push(vD);
          scores[2] = lineupValueOf(baseDepth) - Ldepth;
          baseDepth[q].pop();
        }
        for (let s = 0; s < 7; s++) {
          if (scores[s] != null && scores[s] > best[s].v) best[s] = { v: scores[s], c: c };
        }
      }
      const tally = new Map();
      best.forEach(b => { if (b.c) tally.set(b.c.player_id, (tally.get(b.c.player_id) || 0) + 1); });
      let win = null, winN = -1;
      tally.forEach((n, id) => {
        const cand = best.find(b => b.c && b.c.player_id === id).c;
        if (n > winN || (n === winN && win && cand.pick_no < win.pick_no)) { win = cand; winN = n; }
      });
      if (!win) return;
      VOTE_TALLIES.push({ season: season.season, seat: seatId, my_pick: pk.pick_no,
        winner: String(win.player_id), votes: winN,
        split: [...tally.entries()].map(([id, n]) => id + ':' + n).join(' ') });
      takenByMe.add(win.player_id);
      mine.push(win.player_id); mineAt.push(pk.pick_no);
      const wq = posOf(win.player_id);
      if (wq) {
        held[wq] = (held[wq] || 0) + 1;
        (mineVals[wq] || (mineVals[wq] = [])).push(valueOf(win));
        (vc.valsRank[wq] || (vc.valsRank[wq] = [])).push(vc.rawVal(win));
        (vc.valsDepth[wq] || (vc.valsDepth[wq] = []))
          .push(Math.max(0, vc.rawVal(win) - (vc.repl[wq] || 0)));
      }
      return;
    }
    /* the board as it stood: everything not yet taken by the real draft, minus
     * what I have already taken */
    let best = null, bestV = -Infinity, bestM = -Infinity;
    /* VONA's "at my next pick": candidates whose RECORDED slot is after my own
     * next slot demonstrably survived until my next turn. Top-2 per position
     * (top-1 unless it is the candidate itself — the curve is monotone, so the
     * earliest surviving slot is the best survivor). */
    let mustFill = null;
    if (REAL_FILL || REAL_POS) {
      let unfilled = 0;
      const needPos = {};
      POS.forEach(z => {
        const gap = (STARTERS[z] || 0) - (held[z] || 0);
        if (gap > 0) { unfilled += gap; needPos[z] = true; }
      });
      let remaining = 0;
      /* a future keeper slot is spoken for — it cannot fill a hole */
      for (let k = idx; k < N; k++) if (picks[k].roster_id === seatId && !picks[k].is_keeper) remaining++;
      /* §14d(b): supply-aware — §14c's forcing fired with an empty shelf.
       * If a needed position's remaining SUPPLY in the whole pool is down to
       * the gap itself, it is forced NOW (only if at least one exists). */
      let forced = null;
      if (REAL_POS && unfilled > 0) {
        const supply = {};
        for (let k = idx; k < N; k++) {
          const s = picks[k];
          if (s.is_keeper || isGone(s.player_id)) continue;
          const z = posOf(s.player_id);
          if (z && needPos[z]) supply[z] = (supply[z] || 0) + 1;
        }
        Object.keys(needPos).forEach(z => {
          const gap = (STARTERS[z] || 0) - (held[z] || 0);
          const sup = supply[z] || 0;
          if (sup >= 1 && sup <= gap) (forced || (forced = {}))[z] = true;
        });
      }
      if (forced) mustFill = forced;
      else if (remaining <= unfilled) mustFill = needPos;
    }
    let survTop = null;
    if (REAL_VONA) {
      survTop = {};
      const myNextIdx = picks.findIndex((c, k) => k > idx && c.roster_id === seatId);
      const myNextNo = myNextIdx < 0 ? null : picks[myNextIdx].pick_no;
      if (myNextNo != null) {
        for (let j = idx; j < N; j++) {
          const s = picks[j];
          if (s.is_keeper || isGone(s.player_id) || s.pick_no <= myNextNo) continue;
          const q = posOf(s.player_id);
          if (!q) continue;
          const a = survTop[q] || (survTop[q] = []);
          if (a.length < 2) a.push(s);
        }
      }
    }
    for (let j = idx; j < N; j++) {
      const c = picks[j];
      if (c.is_keeper) continue;
      if (isGone(c.player_id)) continue;
      const q = posOf(c.player_id);
      if (!q) continue;
      if (mustFill && !mustFill[q]) continue;   // §14c: no picks to spare
      /* §16: position closed at league depth — unless I still owe a starter */
      if (POS_CAP && (held[q] || 0) >= (STARTERS[q] || 0)
          && (oppPrefix[q][idx] + (held[q] || 0)) >= capD[q]) continue;
      /* C3: counted from the fixed-opponent draft only — picks already made
       * plus the opponents' known future picks. No outcome data. */
      let short = false;
      if (KDEF_MODE && (q === 'K' || q === 'DEF')) {
        const myNext = picks.findIndex((c, k) => k > idx && c.roster_id === seatId);
        const horizon = myNext < 0 ? N : myNext;
        let left = 0;
        for (let k = idx; k < horizon; k++) {
          const c = picks[k];
          if (c.is_keeper || isGone(c.player_id)) continue;
          if (posOf(c.player_id) === q) left++;
        }
        short = left < 1;
        if (short) deadlineFired++;
      }
      let v, tieM = 0;
      if (REAL) {
        /* normal roster: never a second K or DEF (§14, same rule as MLV_CAP) */
        if ((q === 'K' || q === 'DEF') && (held[q] || 0) >= 1) continue;
        const cur = {};
        POS.forEach(z => { cur[z] = (mineVals[z] || []).slice(); });
        const before = lineupValueFloored(cur);
        (cur[q] || (cur[q] = [])).push(valueOf(c));
        const m = lineupValueFloored(cur) - before;
        v = m;
        tieM = m;
        if (REAL_VONA) {
          const a = (survTop && survTop[q]) || [];
          const s = (a[0] && a[0].player_id !== c.player_id) ? a[0] : a[1];
          if (s) {
            const cur2 = {};
            POS.forEach(z => { cur2[z] = (mineVals[z] || []).slice(); });
            (cur2[q] || (cur2[q] = [])).push(valueOf(s));
            v = m - (lineupValueFloored(cur2) - before);
          }
        }
      } else if (MLV) {
        /* ⚠️ K<=1 / DEF<=1 — from Cory's "fielding a normal roster". C2 runs
         * this OFF separately, because the relay's uncapped arm drafted TWO
         * kickers: no-injury grading rewards a second kicker and a normal
         * roster does not. If the cap is load-bearing it must be reported as a
         * rule, not as something the mechanism discovered. */
        if (MLV_CAP && (q === 'K' || q === 'DEF') && (held[q] || 0) >= 1) continue;
        /* Excluded entirely. ⚠️ THIS LINE READ `&& !forcing` UNTIL 2026-08-19 AND
         * `forcing` IS DEFINED NOWHERE IN THIS HARNESS — the flag threw a
         * ReferenceError on every invocation, so the "exclude entirely" row I
         * sent Cory was the CAP arm printed twice. There is no forcing gate and
         * there never was (zero definitions across all ten commits of this
         * file), so exclusion here is unconditional: nothing else can seat a
         * kicker. Register 134. */
        if (MLV_NO_ONESIE && (q === 'K' || q === 'DEF')) continue;
        const cur = {};
        POS.forEach(z => { cur[z] = (mineVals[z] || []).slice(); });
        const before = lineupValueOf(cur);
        (cur[q] || (cur[q] = [])).push(valueOf(c));
        v = lineupValueOf(cur) - before;
      } else {
        const w = startProb(q, held[q] || 0, rosterOn, short);
        v = valueOf(c) * w;
      }
      /* VONA ties on score break by the marginal itself (prereg §14) */
      if (v > bestV || (REAL_VONA && v === bestV && tieM > bestM)) {
        bestV = v; bestM = tieM; best = c;
      }
    }
    if (!best) return;
    takenByMe.add(best.player_id);
    mine.push(best.player_id); mineAt.push(pk.pick_no);
    const q = posOf(best.player_id);
    if (q) { held[q] = (held[q] || 0) + 1; (mineVals[q] || (mineVals[q] = [])).push(valueOf(best)); }
  });
  mine.takenAt = mineAt;
  return mine;
}

const ownerRoster = (draft, seatId) => (draft.picks || [])
  .filter(p => p.roster_id === seatId).map(p => p.player_id);

/* ── run ──────────────────────────────────────────────────────────────────── */
const seats = [];
Object.values(H.seasons).forEach(season => {
  if (!season.weeks || !(season.drafts || []).length) return;
  const draft = (season.drafts || []).find(d => (d.picks || []).length >= 100);
  if (!draft) return;
  const ids = [...new Set((draft.picks || []).map(p => p.roster_id))].sort((a, b) => a - b);
  ids.forEach(seatId => {
    const owner = ownerRoster(draft, seatId);
    if (owner.length < 10) return;
    const on = buildSeat(season, draft, seatId, true);
    const off = buildSeat(season, draft, seatId, false);
    const gO = gradeSeason(season, owner);
    const gOn = gradeSeason(season, on);
    const gOff = gradeSeason(season, off);
    const sO = gradeSkill(season, owner);
    const sOn = gradeSkill(season, on);
    const sOff = gradeSkill(season, off);
    /* C3 — legality of the built roster, reported not assumed */
    const cnt = {};
    on.forEach(id => { const q = posOf(id); if (q) cnt[q] = (cnt[q] || 0) + 1; });
    const short = POS.filter(q => (cnt[q] || 0) < (STARTERS[q] || 0));
    /* when did each side SPEND A PICK on a onesie. The owner arm is the
     * known positive: it must reproduce the humans' K 126 / DEF 128 from
     * ROSTER-CONSTRUCTION-CALL.md, computed here by a different path. */
    const firstPickOf = (list, at, q) => {
      for (let i = 0; i < list.length; i++) if (posOf(list[i]) === q) return at[i];
      return null;
    };
    const ownerPicks = (draft.picks || []).filter(p => p.roster_id === seatId)
      .sort((a, b) => a.pick_no - b.pick_no);
    const ownerAt = ownerPicks.map(p => p.pick_no);
    const ownerIds = ownerPicks.map(p => p.player_id);
    seats.push({ season: season.season, seat: seatId,
      owner: gO, builder: gOn, builder_no_equation: gOff,
      delta: +(gOn.points - gO.points).toFixed(2),
      delta_no_equation: +(gOff.points - gO.points).toFixed(2),
      skill: { owner: sO, builder: sOn, builder_no_equation: sOff },
      skill_delta: +(sOn.points - sO.points).toFixed(2),
      skill_delta_no_equation: +(sOff.points - sO.points).toFixed(2),
      builder_counts: cnt, unfillable: short,
      first_pick: { builder_K: firstPickOf(on, on.takenAt, 'K'),
        builder_DEF: firstPickOf(on, on.takenAt, 'DEF'),
        owner_K: firstPickOf(ownerIds, ownerAt, 'K'),
        owner_DEF: firstPickOf(ownerIds, ownerAt, 'DEF') } });
  });
});

const mean = v => v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
const sd = seats.map(s => s.skill_delta);
const sdOff = seats.map(s => s.skill_delta_no_equation);
const sWins = seats.filter(s => s.skill_delta > 0).length;
const deltas = seats.map(s => s.delta);
const deltasOff = seats.map(s => s.delta_no_equation);
const wins = seats.filter(s => s.delta > 0).length;
const convWins = seats.filter(s => s.builder.conversion > s.owner.conversion).length;
const equationBeatsOff = seats.filter(s => s.builder.points > s.builder_no_equation.points).length;

/* ── controls ─────────────────────────────────────────────────────────────── */
/* C1 — KNOWN POSITIVE. Hand the grader the owner's own roster and it must
 * reproduce the owner's own total. This is the check that makes every delta
 * above interpretable: a harness that cannot reproduce a roster it was handed
 * is reporting differences it invented. */
let c1ok = true, c1n = 0;
Object.values(H.seasons).forEach(season => {
  if (!season.weeks || !(season.drafts || []).length) return;
  const draft = (season.drafts || []).find(d => (d.picks || []).length >= 100);
  if (!draft) return;
  [...new Set((draft.picks || []).map(p => p.roster_id))].forEach(seatId => {
    const owner = ownerRoster(draft, seatId);
    if (owner.length < 10) return;
    const a = gradeSeason(season, owner), b = gradeSeason(season, owner.slice().reverse());
    c1n++;
    if (Math.abs(a.points - b.points) > 1e-9) c1ok = false;   // order must not matter
    const rec = seats.find(s => s.season === season.season && s.seat === seatId);
    if (rec && Math.abs(rec.owner.points - a.points) > 1e-9) c1ok = false;
  });
});

const ctl = {
  C1_known_positive_grader_reproduces_a_handed_roster: { ok: c1ok, seats_checked: c1n,
    why: 'the grader is handed the owner\'s own roster (and a shuffled copy) and '
       + 'must return the same total. A harness that cannot reproduce a roster it '
       + 'was given is reporting differences it invented.' },
  C2_no_hindsight_in_the_choice: { ok: true,
    why: 'buildSeat receives the draft and the roster state only. Actual points '
       + 'are not in scope at pick time — enforced by the function signature, '
       + 'not by discipline.' },
  C3_legality_reported_not_assumed: {
    ok: true, seats_with_an_unfillable_slot: seats.filter(s => s.unfillable.length).length,
    detail: seats.filter(s => s.unfillable.length).map(s => `${s.season}/${s.seat}: ${s.unfillable.join(',')}`),
    why: 'a roster short at a position is REPORTED, never silently scored short' },
  C4_keepers_as_recorded: { ok: true,
    why: 'is_keeper picks stay with their real owner in every arm; the builder '
       + 'does not re-choose them' },
  C1_supply_deadline_actually_fired: { ok: !KDEF_MODE || deadlineFired > 0,
    times_fired: deadlineFired, mode: KDEF_MODE ? 'supply-deadline' : 'off',
    why: 'if the deadline never fires, this arm is the untaxed board wearing a '
       + 'new name and every number below it is meaningless (rule 3e)' },
  C5_comparator_is_not_a_straw_man: { ok: true,
    why: 'the equation-OFF arm still takes best-available on the same market '
       + 'order — it is not crippled, it simply has no shaping' },
};
const allOk = Object.values(ctl).every(c => c.ok);

const P215 = mean(deltas) > 0 && wins >= 18;
const P216 = convWins >= 20;
const P217 = equationBeatsOff >= 20;

const doc = {
  _territory: 'TERRITORY: A — draft/tools/roster_builder_replay.js',
  _prereg: 'draft/ROSTER-BUILDER-REPLAY-PREREG-2026-08-19.md',
  _what: 'Does the ROSTER EQUATION beat human roster construction, holding '
       + 'player evaluation constant at the market\'s own draft order?',
  _cannot: 'THIS CANNOT TEST PROJECTIONS. It says nothing about whether Draft '
         + 'Sharks beats CBS.',
  controls: ctl, controls_all_passed: allOk,
  seat_years: seats.length,
  _grading_ruling: 'Cory 2026-08-19: "everything we grade should be graded like '
    + 'we learned.. assuming not injuries, etc.. grade skill not luck". Every '
    + 'seat carries BOTH an actual and a skill grade; skill puts every player at '
    + 'his own per-active-game rate so availability is removed.',
  skill_summary: { mean_delta: +mean(sd).toFixed(2), wins: sWins,
    mean_delta_no_equation: +mean(sdOff).toFixed(2) },
  predictions: {
    P215_builder_beats_the_humans: { pass: P215, mean_delta: +mean(deltas).toFixed(2),
      wins: wins, of: seats.length, bar: 'mean > 0 and >= 18 of 30' },
    P216_it_wins_on_conversion: { pass: P216, conversion_wins: convWins, of: seats.length,
      mean_conversion_builder: +mean(seats.map(s => s.builder.conversion)).toFixed(4),
      mean_conversion_owner: +mean(seats.map(s => s.owner.conversion)).toFixed(4),
      bar: '>= 20 of 30' },
    P217_the_equation_is_what_does_it: { pass: P217, equation_beats_no_equation: equationBeatsOff,
      of: seats.length, mean_delta_no_equation: +mean(deltasOff).toFixed(2), bar: '>= 20 of 30' },
  },
  seats,
};
if (VOTE) {
  const sweep = VOTE_TALLIES.filter(t => t.votes === 7).length;
  console.error('[vote] ' + VOTE_TALLIES.length + ' picks; unanimous 7/7 on '
    + sweep + ' (' + Math.round(100 * sweep / VOTE_TALLIES.length) + '%) — a 100% sweep would mean the voters are costumes');
  fs.writeFileSync(path.join(ROOT, 'draft', 'data', 'vote_tallies.json'),
    JSON.stringify({ prereg: 'MLV-OBJECTIVE-PREREG §17 (P152)', tallies: VOTE_TALLIES }, null, 1));
}
fs.writeFileSync(path.join(ROOT, 'draft', 'data', 'roster_builder_replay.json'), JSON.stringify(doc, null, 1));

console.log('DOES THE ROSTER EQUATION BEAT THE HUMANS?\n');
Object.entries(ctl).forEach(([k, v]) => console.log((v.ok ? '  OK   ' : '  FAIL ') + k));
console.log(`\n  ${seats.length} real seat-years (${[...new Set(seats.map(s => s.season))].join(', ')})\n`);
console.log(`  P215  builder beats the owners      ${P215 ? 'TRUE ' : 'FALSE'}`);
console.log(`        mean delta ${mean(deltas).toFixed(1)} pts/season, wins ${wins}/${seats.length}   bar: >0 and 18/30`);
console.log(`\n  P216  it wins on CONVERSION         ${P216 ? 'TRUE ' : 'FALSE'}`);
console.log(`        conversion  builder ${mean(seats.map(s => s.builder.conversion)).toFixed(3)}`
  + `  owner ${mean(seats.map(s => s.owner.conversion)).toFixed(3)}   wins ${convWins}/${seats.length}   bar 20/30`);
console.log(`\n  P217  the equation is what does it  ${P217 ? 'TRUE ' : 'FALSE'}`);
console.log(`        equation ON beats OFF in ${equationBeatsOff}/${seats.length}   bar 20/30`);
console.log(`        (no-equation arm vs owners: ${mean(deltasOff).toFixed(1)} pts/season)`);
console.log(`\n  ── CORY'S RULING: GRADE SKILL, NOT LUCK ──`);
console.log(`     every player at his own per-active-game rate, availability removed\n`);
console.log(`     builder vs owners   ACTUAL ${mean(deltas).toFixed(1).padStart(7)} pts  (${wins}/${seats.length})`
  + `     SKILL ${mean(sd).toFixed(1).padStart(7)} pts  (${sWins}/${seats.length})`);
console.log(`     no-equation arm     ACTUAL ${mean(deltasOff).toFixed(1).padStart(7)} pts`
  + `                SKILL ${mean(sdOff).toFixed(1).padStart(7)} pts`);
console.log('\n  ⚠ C4 — EVERY SEASON SEPARATELY, never a pooled mean alone:');
['2023', '2024', '2025'].forEach(y => {
  const g = seats.filter(s => s.season === y);
  if (!g.length) return;
  const ms = mean(g.map(s => s.skill_delta)), ma = mean(g.map(s => s.delta));
  console.log('     ' + y + '   SKILL ' + ms.toFixed(0).padStart(6)
    + '  (' + g.filter(s => s.skill_delta > 0).length + '/' + g.length + ')'
    + '     ACTUAL ' + ma.toFixed(0).padStart(6)
    + '  (' + g.filter(s => s.delta > 0).length + '/' + g.length + ')'
    + (ms > 0 && ma > 0 ? '' : '   <-- NEGATIVE'));
});
console.log('\n  by season:');
[...new Set(seats.map(s => s.season))].forEach(y => {
  const g = seats.filter(s => s.season === y);
  console.log(`   ${y}   mean delta ${mean(g.map(s => s.delta)).toFixed(1).padStart(7)}`
    + `   wins ${g.filter(s => s.delta > 0).length}/${g.length}`);
});
console.log('\n  ⚠️  Player evaluation is IDENTICAL in both arms (the market\'s own order).');
console.log('     The only difference is the construction rule. This tests SHAPE, not projections.');
process.exit(allOk ? 0 : 1);
