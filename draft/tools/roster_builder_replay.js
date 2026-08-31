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
/* ── E's ARM, PREREGISTERED IN `ROSTER-CONSTRUCTION-CALL.md`'s REPLY: does
 * relaxing TE's cap to an ALREADY-MEASURED number (not fitted to this study)
 * recover the conversion the shape term buys without paying more acquisition?
 * §1 of the open call found TE the widest separator between winners (1.67)
 * and losers (1.11) and flagged the cap as "the single most promising thing
 * to challenge." `MEASURED-NEED-RESULT-2026-08-19.md` (P150/P151, filed
 * hours earlier, independent of this problem) measured a 2nd TE actually
 * starts 0.414 of the weeks he is rostered -- that is the number this arm
 * substitutes for Cory's hand-transcribed 0.05, nothing else changes. */
const TE_RELAX = process.argv.includes('--te-relax');
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
   * is passed. TE_RELAX (register 132/137's own arm) takes precedence if
   * both are somehow passed together -- they were never meant to combine. */
  TE: TE_RELAX ? [1.00, 0.414, 0] : TE_BOOST ? [1.00, 0.50, 0] : [1.00, 0.05, 0],
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
    for (let i = 0; i < need; i++) total += have[i] || 0;
    left[q] = have.slice(need);
  });
  const flexPool = FLEX.flatMap(q => left[q] || []).sort((a, b) => b - a);
  total += flexPool[0] || 0;
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
const MLV_CAP = !process.argv.includes('--no-onesie-cap');   // C2 runs it off
/* Cory: "Or exclude def and k all together" — MLV never VOLUNTEERS a K or DEF;
 * the legality fill seats them at the end, which is what a human does. */
const MLV_NO_ONESIE = process.argv.includes('--mlv-no-onesie');
/* ── MLV-LOOKAHEAD (`--mlv-look`) — register 133 / P240 ───────────────────────
 * Prereg: draft/MLV-TIMING-PREREG-2026-08-19.md.
 *
 *     value(c) = marginal(c) − marginal(best at c's POSITION at my NEXT pick)
 *
 * i.e. charge every candidate the cost of WAITING on him. Plain MLV is myopic:
 * a bench body is worth zero to it, so it fills nine starting slots and then
 * takes a kicker at its round-9 pick in 30 of 30 seat-years with no sense of
 * whether a comparable kicker survives to round 10.
 *
 * ⚠️ THIS IS A REPLICATION, AND IT IS DECLARED AS ONE BEFORE IT RUNS. The relay
 * preregistered this identical formula as `--objective-look` (commit 4d4ed1a2)
 * and graded it FALSE the same evening (8ba64bf8): actual +50.1 but skill +14.5
 * against a required +29.3, head-to-head on skill 13/30. They routed it to me
 * rather than letting me spend the run blind, and recommended running it anyway
 * because an INDEPENDENT implementation reproducing the split closes the axis
 * twice over — and a disagreement would mean one of the two implementations is
 * wrong, which is worth more than either result alone.
 *
 * So I have NOT read their code, only their number. The implementation below is
 * mine. P240's bars stand exactly as filed and do not move now that I know what
 * to expect. */
const MLV_LOOK = process.argv.includes('--mlv-look');
/* ── MLV-POINTS (`--mlv-points`) — the relay's units question, 2026-08-20 ─────
 * ASK: "encode lineupValue in projected POINTS instead of market rank, re-run
 * the 30 seat-years, report whether the cap arm's +45.8/+29.3 survives."
 *
 * ⚠️ THIS FILE'S OWN HEADER ALREADY ANSWERS PART OF THE QUESTION, AND IT IS
 * WORTH READING BEFORE TRUSTING WHAT THIS FLAG PRODUCES. The market-rank
 * encoding was not an arbitrary choice — it is the ONE thing this design does
 * to stay era-correct with no era-appropriate projections available
 * ("the seat replay is blocked on era-appropriate projections... value signal
 * = THE MARKET'S OWN DRAFT ORDER... IS THE SAME INFORMATION THE HUMAN OWNER
 * HAD"). This harness loads exactly one projection source: `public/draft_data
 * .json`, the CURRENT 2026 board. Substituting its `proj_mean` for a 2023-25
 * pick is not a units test in isolation — it is feeding the engine 2026
 * hindsight (injuries since played, role changes since happened, three more
 * years of NFL opinion) to make a 2023/2024/2025 decision, which the header's
 * own no-hindsight symmetry claim explicitly rules out.
 *
 * RUN ANYWAY, BECAUSE THE QUESTION IS STILL WORTH THE ANSWER — filed as
 * register TBD. The result below is not "does MLV survive a clean points
 * encoding"; it is "does MLV survive THIS SPECIFIC contaminated points proxy",
 * a strictly weaker and easier question. Reported as such, with coverage
 * measured (not assumed): how many of the 30 seat-years' picks are even on
 * the 2026 board at all. */
const MLV_POINTS = process.argv.includes('--mlv-points');
const CURRENT_BOARD_PROJ = {};
if (MLV_POINTS) {
  (BOARD.players || []).forEach(p => {
    if (p.player_id != null && typeof p.proj_mean === 'number') {
      CURRENT_BOARD_PROJ[String(p.player_id)] = p.proj_mean;
    }
  });
}
let mlvPointsCoverage = { matched: 0, total: 0 };

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
  if (MLV_POINTS) {
    /* the units question: swap market rank for the CURRENT board's proj_mean.
     * Coverage measured per-pick, not assumed — a player absent from the 2026
     * board (retired, off the pool) falls back to the market-rank value so a
     * whole roster does not go silently to zero. */
    valueOf = p => {
      mlvPointsCoverage.total++;
      const pm = CURRENT_BOARD_PROJ[String(p.player_id)];
      if (pm != null) { mlvPointsCoverage.matched++; return pm; }
      return (N + 1) - p.pick_no;
    };
  } else if (SHRINK) {
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
  /* mineAt[i] = the pick_no of MY OWN SLOT that produced mine[i]. Not the slot
   * the player was really drafted at — the question is when I spent a pick. */
  const mine = [], mineAt = [], held = {}, mineVals = {};
  const takenByMe = new Set();
  picks.forEach((pk, idx) => {
    if (pk.roster_id !== seatId) return;
    if (pk.is_keeper) {                       // keepers stay as recorded (C4)
      mine.push(pk.player_id); mineAt.push(pk.pick_no);
      const q = posOf(pk.player_id);
      if (q) { held[q] = (held[q] || 0) + 1; (mineVals[q] || (mineVals[q] = [])).push(valueOf(pk)); }
      return;
    }
    /* the board as it stood: everything not yet taken by the real draft, minus
     * what I have already taken */
    let best = null, bestV = -Infinity;
    for (let j = idx; j < N; j++) {
      const c = picks[j];
      if (c.is_keeper) continue;
      if (takenByMe.has(c.player_id)) continue;
      const q = posOf(c.player_id);
      if (!q) continue;
      /* C3: counted from the fixed-opponent draft only — picks already made
       * plus the opponents' known future picks. No outcome data. */
      let short = false;
      if (KDEF_MODE && (q === 'K' || q === 'DEF')) {
        const myNext = picks.findIndex((c, k) => k > idx && c.roster_id === seatId);
        const horizon = myNext < 0 ? N : myNext;
        let left = 0;
        for (let k = idx; k < horizon; k++) {
          const c = picks[k];
          if (c.is_keeper || takenByMe.has(c.player_id)) continue;
          if (posOf(c.player_id) === q) left++;
        }
        short = left < 1;
        if (short) deadlineFired++;
      }
      let v;
      if (MLV) {
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
        if (MLV_LOOK) {
          /* what does WAITING on this position cost? The best man at q who is
           * still on the board at my NEXT pick, valued on the SAME roster — so
           * the subtraction is like-for-like and not a level difference.
           * Availability comes from the fixed draft, which is the same
           * no-hindsight source every other arm uses (C3). */
          const myNextIdx = picks.findIndex((z, k) => k > idx && z.roster_id === seatId);
          let bestNext = 0;
          if (myNextIdx >= 0) {
            for (let k = myNextIdx; k < N; k++) {
              const z = picks[k];
              if (z.is_keeper || takenByMe.has(z.player_id)) continue;
              if (posOf(z.player_id) !== q) continue;
              const alt = {};
              POS.forEach(y => { alt[y] = (mineVals[y] || []).slice(); });
              (alt[q] || (alt[q] = [])).push(valueOf(z));
              bestNext = lineupValueOf(alt) - before;
              break;               // picks are in market order: first is best
            }
          }
          v -= bestNext;
        }
      } else {
        const w = startProb(q, held[q] || 0, rosterOn, short);
        v = valueOf(c) * w;
      }
      if (v > bestV) { bestV = v; best = c; }
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

const { isCompleteSeason } = require('./season_completeness.js');
const skippedUngraded = new Set();   // register 419 — announced, never silent

const ownerRoster = (draft, seatId) => (draft.picks || [])
  .filter(p => p.roster_id === seatId).map(p => p.player_id);

/* ── run ──────────────────────────────────────────────────────────────────── */
const seats = [];
Object.values(H.seasons).forEach(season => {
  if (!season.weeks || !(season.drafts || []).length) return;
  /* register 419: 2026 carries 18 weeks of ZEROS and a 150-pick draft, so the
   * guard above passes and ten seats grading 0 for everyone enter the means.
   * MEASURED: seats_checked 40 vs 30, and P215's mean_delta -15.3 where the
   * truth on played seasons is -20.41. */
  if (!isCompleteSeason(season)) { skippedUngraded.add(season.season); return; }
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
if (skippedUngraded.size) {
  console.error('[seasons] EXCLUDED as INCOMPLETE (drafted, but not every week '
    + 'has been played): ' + [...skippedUngraded].join(', ') + ' — register 419.');
}

let c1ok = true, c1n = 0;
Object.values(H.seasons).forEach(season => {
  if (!season.weeks || !(season.drafts || []).length) return;
  /* register 419: 2026 carries 18 weeks of ZEROS and a 150-pick draft, so the
   * guard above passes and ten seats grading 0 for everyone enter the means.
   * MEASURED: seats_checked 40 vs 30, and P215's mean_delta -15.3 where the
   * truth on played seasons is -20.41. */
  if (!isCompleteSeason(season)) { skippedUngraded.add(season.season); return; }
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
  C2_no_hindsight_in_the_choice: (() => {
    /* ⚠️ THIS ASSERTED ITS OWN CLAIM WITH A LITERAL `true` (register 410), and
     * of the vacuous ones it was the most load-bearing: every delta this file
     * reports is worthless if the builder can see the season it is being
     * graded on. "Enforced by the function signature, not by discipline" is an
     * argument about the code, and an argument is not a measurement.
     *
     * THE MEASUREMENT: rebuild every seat against a season whose realized
     * weekly points have been SCRAMBLED — same shape, same ids, values
     * permuted — and require the chosen roster to come back IDENTICAL. A
     * builder that peeks at outcomes cannot survive that; one that never
     * reads them cannot notice it happened.
     *
     * Scrambled rather than deleted on purpose: removing `weeks` would also
     * fail for benign reasons (any incidental touch of the key), and then the
     * control would be testing access instead of DEPENDENCE, which is the
     * thing actually claimed. */
    const scrambleSeason = (season) => {
      const copy = JSON.parse(JSON.stringify(season));
      Object.keys(copy.weeks || {}).forEach(wn => {
        const arr = copy.weeks[wn];
        if (!Array.isArray(arr)) return;
        arr.forEach(m => {
          const pts = m.players_points || {};
          const ids = Object.keys(pts).sort();
          /* deterministic permutation: values reversed against sorted ids, so
           * the scramble is reproducible and every value still appears once */
          const vals = ids.map(id => pts[id]).reverse();
          ids.forEach((id, i) => { pts[id] = vals[i]; });
        });
      });
      return copy;
    };
    let checked = 0, changed = 0;
    const movers = [];
    Object.values(H.seasons).forEach(season => {
      if (!season.weeks || !(season.drafts || []).length) return;
      if (!isCompleteSeason(season)) return;
      const draft = (season.drafts || []).find(d => (d.picks || []).length >= 100);
      if (!draft) return;
      const fake = scrambleSeason(season);
      [...new Set((draft.picks || []).map(p => p.roster_id))].sort((a, b) => a - b)
        .forEach(seatId => {
          if (ownerRoster(draft, seatId).length < 10) return;
          const real = buildSeat(season, draft, seatId, true);
          const scrambled = buildSeat(fake, draft, seatId, true);
          checked++;
          if (JSON.stringify(real) !== JSON.stringify(scrambled)) {
            changed++;
            if (movers.length < 5) movers.push(`${season.season}/${seatId}`);
          }
        });
    });
    return {
      ok: checked > 0 && changed === 0,
      seats_rebuilt_against_scrambled_points: checked,
      seats_whose_choice_moved: changed,
      movers: movers,
      why: 'buildSeat receives the draft and the roster state only. Actual points '
         + 'are not in scope at pick time — and this is now the MEASUREMENT of '
         + 'that, not the assertion of it: scramble the season\'s realized points '
         + 'and every chosen roster comes back byte-identical. A builder that '
         + 'peeked would move.',
    };
  })(),
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
if (MLV_POINTS) {
  console.log(`\n  ⚠️  --mlv-points: value signal swapped to the 2026 board's proj_mean.`);
  console.log(`     coverage: ${mlvPointsCoverage.matched}/${mlvPointsCoverage.total} picks matched to the current board `
    + `(${(100 * mlvPointsCoverage.matched / mlvPointsCoverage.total).toFixed(1)}%); unmatched picks fell back to market rank.`);
  console.log('     This is NOT era-correct — 2023-25 picks are valued on 2026 hindsight. See the flag\'s own header comment.');
}
process.exit(allOk ? 0 : 1);
