// TERRITORY: A
/* HOW MANY OF MY FIFTEEN PICKS ARE ACTUALLY CLOSE CALLS — MEASURED BEFORE ANY
 * TIEBREAKER IS BUILT.
 *
 * Cory: *"find small advantages in tiebreaker situations (2 players that are
 * almost 50/50)"*. The instinct is to go build the tiebreaker. This asks the
 * prior question -- whether there is anything for it to break, where, and how
 * much is on the table when it acts.
 *
 * ── THE BAND IS NOT A CONSTANT. FOR A STARTER SEAT IT IS MEASURED ──────────
 *
 * The engine has fixed resolution constants (COIN_FLIP_GAP 1.0, TIE_THRESHOLD
 * 2.0, CLOSE_GAP 3.5) and they are pure convention -- a 2-point gap between two
 * quarterbacks projected in the 300s is a different fact from a 2-point gap
 * between two kickers projected near 100. For a STARTING seat the value of a
 * player IS his projection, so the honest band is the one the data states:
 *
 *     P(A outscores B) = Phi( (muA - muB) / sqrt(sdA^2 + sdB^2 - 2 rho sdA sdB) )
 *
 * A pair is a COIN FLIP when that lands in [0.45, 0.55]. That is a measurement.
 *
 * ── FOR A BENCH SEAT IT IS NOT, AND THE DIFFERENCE IS NOT PAPERED OVER ──────
 *
 * A bench player's value is P(need) x E[max(0, X - waiver)] -- an insurance
 * price, not a point total. "Which of these two scores more" is the WRONG
 * question about a bench pick (a backup RB and a backup WR are not competing to
 * outscore each other; they are competing to cover different holes). There is no
 * natural scale on which to call two insurance prices indistinguishable, so the
 * bench rows use a 5% band and it is LABELLED A CONVENTION rather than dressed
 * up as a measurement. Starter rows say MEASURED, bench rows say convention.
 *
 * ── THE ASSUMPTIONS THAT CUT AGAINST THE CONCLUSION, STATED FIRST ───────────
 *
 * (1) rho is the correlation between two players' season totals. At rho = 0 the
 * denominator is largest, every P is pulled toward 0.5, and the board looks MORE
 * like a coin flip than it is -- the direction that flatters "tiebreakers are
 * worth building". Both rho = 0 and rho = 0.3 print, and the second is the
 * conservative one.
 *
 * (2) proj_sd = weekly_sd x sqrt(games), games 13.1 to 17 (measured: the ratio
 * proj_sd/weekly_sd spans 3.63 to 4.13 across 337 distinct values). That
 * construction assumes week-to-week INDEPENDENCE, so it captures game-to-game
 * noise and NOT the error in the season projection itself. It therefore
 * UNDERSTATES season-total uncertainty, which pushes P away from 0.5 and makes
 * the frontier below a FLOOR on the number of coin flips, not a ceiling.
 *
 * ── AND ONE CLAIM THAT DIED ON CONTACT ──────────────────────────────────────
 *
 * The first version of this file called proj_floor/proj_ceiling "an independent
 * statement of the same spread" and cross-checked proj_sd against them. THEY ARE
 * NOT INDEPENDENT. Measured across all 576 projected players, every position:
 *
 *     proj_ceiling = proj_mean + 1.036 x proj_sd     (Phi(1.036)  = 0.850)
 *     proj_floor   = proj_mean - 0.674 x proj_sd     (Phi(-0.674) = 0.250)
 *
 * They are the p85 and p25 of the normal that proj_sd already defines, to three
 * decimals, with no per-position or per-player variation. proj_floor and
 * proj_ceiling carry ZERO information beyond proj_mean and proj_sd, so ANY model
 * term reading ceiling is reading sd rescaled -- which is the likeliest reason
 * the ceiling term came out unsignable when it was tested. This is a ratio-lock
 * of exactly the kind the September detector (task 24) exists to find, caught
 * here by hand because a cross-check I expected to be free turned out to be
 * vacuous.
 *
 * ── WHAT THIS CANNOT DO ─────────────────────────────────────────────────────
 *
 * It CANNOT tell you which way to break a tie. It reports the size and location
 * of the frontier only. Every candidate tiebreaker (age, pace, touches) is
 * unmeasured here and stays unmeasured until there is a backtest to score it
 * against -- adding one on intuition is how tier (-235) and risk (-143) got in.
 *
 * Run: node draft/tools/tiebreak_frontier.js
 */
'use strict';
const PLAN = require('./draft_plan.js');
const { ranked, plan, pool } = PLAN;

function normPdf(x) { return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI); }
function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = normPdf(x) * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937
    + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - d : d;
}
/* P(a outscores b) on season totals. */
function pBeats(a, b, rho) {
  const sa = a.proj_sd || 0, sb = b.proj_sd || 0;
  const v = sa * sa + sb * sb - 2 * rho * sa * sb;
  if (!(v > 0)) return (a.proj_mean > b.proj_mean) ? 1 : (a.proj_mean < b.proj_mean ? 0 : 0.5);
  return normCdf((a.proj_mean - b.proj_mean) / Math.sqrt(v));
}
const BENCH_BAND = 0.05;                     // CONVENTION. see header.

console.log('THE TIEBREAK FRONTIER — how much of the draft is genuinely 50/50\n');

/* ── 0. THE INPUT, INCLUDING THE CHECK THAT TURNED OUT VACUOUS ─────────────── */
{
  const rbs = pool.filter(p => p.position === 'RB')
    .sort((a, b) => b.proj_mean - a.proj_mean).slice(0, 12);
  const m = rbs[5];
  console.log('  THE INPUT EVERYTHING BELOW DEPENDS ON');
  console.log('    6th-best projected RB, ' + m.name + ': mean ' + m.proj_mean.toFixed(0)
    + ', sd ' + m.proj_sd.toFixed(0) + ' -> 80% season interval '
    + (m.proj_mean - 1.2816 * m.proj_sd).toFixed(0) + ' to '
    + (m.proj_mean + 1.2816 * m.proj_sd).toFixed(0) + ' points');
  const up = pool.filter(p => p.proj_sd > 0).map(p => (p.proj_ceiling - p.proj_mean) / p.proj_sd);
  const dn = pool.filter(p => p.proj_sd > 0).map(p => (p.proj_mean - p.proj_floor) / p.proj_sd);
  const rng = a => Math.min(...a).toFixed(3) + '-' + Math.max(...a).toFixed(3);
  console.log('    proj_ceiling is mean + ' + rng(up) + ' x sd   over ' + up.length + ' players');
  console.log('    proj_floor   is mean - ' + rng(dn) + ' x sd   over ' + dn.length + ' players');
  console.log('    => floor/ceiling are the p25 and p85 of proj_sd, NOT an independent');
  console.log('       measurement. A cross-check against them cannot fail. RATIO-LOCK.\n');
}

/* ── 1. THE FRONTIER AT EACH OF MY PICKS ───────────────────────────────────
 * Candidates and their values come from draft_plan's OWN ranking, so a bench row
 * is a ranking of insurance prices and a seat row is a ranking of projections.
 * Deriving them here instead is what produced the first version's nine
 * consecutive quarterbacks. */
console.log('  PER-PICK FRONTIER — candidates the model cannot distinguish');
console.log('    pick  role     top choice                   gap    band       tied');
console.log('    ' + '-'.repeat(80));
const rows = [];
ranked.forEach(r => {
  const L = r.list.filter(x => x.p);
  if (L.length < 2) return;
  const seat = r.role !== 'bench';
  const top = L[0];
  let tied0, tied3, p0, p3, label;
  if (seat) {
    p0 = pBeats(top.p, L[1].p, 0); p3 = pBeats(top.p, L[1].p, 0.3);
    tied0 = L.slice(1).filter(x => pBeats(top.p, x.p, 0) <= 0.55).length;
    tied3 = L.slice(1).filter(x => pBeats(top.p, x.p, 0.3) <= 0.55).length;
    label = 'P ' + p0.toFixed(2) + '/' + p3.toFixed(2);
  } else {
    /* A pick the plan refuses to price has no frontier -- every candidate is 0
     * and "all 443 are tied" would be a true statement that means nothing. */
    if (top.v <= 1e-9) {
      console.log('    ' + String(r.pick).padStart(4) + '  ' + 'bench'.padEnd(9)
        + 'UNPRICED — the whole field is a tie, which is not a frontier');
      return;
    }
    const cut = top.v * (1 - BENCH_BAND);
    tied0 = tied3 = L.slice(1).filter(x => x.v >= cut).length;
    label = 'within 5%';
  }
  rows.push({ r, top, L, seat, p0, p3, tied0, tied3 });
  console.log('    ' + String(r.pick).padStart(4) + '  ' + String(r.role).padEnd(9)
    + (top.p.position + ' ' + top.p.name).padEnd(26)
    + (top.v - L[1].v).toFixed(1).padStart(6) + '   ' + label.padEnd(11)
    + String(tied0).padStart(3) + '/' + String(tied3).padStart(3) + ' of ' + (L.length - 1));
});
console.log('    seat rows: P(#1 outscores #2) at rho=0 / rho=0.3 — MEASURED, second is conservative');
console.log('    bench rows: insurance price within 5% of the top — a CONVENTION, not a measurement');

/* ── 2. THE ANSWER TO THE QUESTION ACTUALLY ASKED ─────────────────────────── */
const seats = rows.filter(r => r.seat);
const cf0 = seats.filter(r => r.p0 >= 0.45 && r.p0 <= 0.55).length;
const cf3 = seats.filter(r => r.p3 >= 0.45 && r.p3 <= 0.55).length;
const bTied = rows.filter(r => !r.seat && r.tied0 > 0).length;
console.log('\n  HOW MANY DECISIONS A TIEBREAKER COULD ACT ON');
console.log('    starting seats where #1 vs #2 is a coin flip: ' + cf0 + '/' + seats.length
  + ' at rho=0, ' + cf3 + '/' + seats.length + ' at rho=0.3');
console.log('    bench picks with a rival inside 5%:           ' + bTied + '/'
  + rows.filter(r => !r.seat).length);
console.log('    picks with no frontier at all (UNPRICED):     '
  + plan.filter(x => x.unpriced).length);
console.log('    On every other pick the model is already confident and a tiebreaker');
console.log('    overriding it is a LOSS, not an edge.');

/* ── 3. WHAT IS ON THE TABLE WHEN IT DOES ACT ──────────────────────────────
 * A frontier that is wide but flat is not worth a tool. This prices the swing in
 * PROJECTED POINTS across the set the model cannot separate. If that spread is
 * ~0 the tiebreaker is choosing between identical things and wins nothing
 * however clever it is. */
console.log('\n  WHAT IS ON THE TABLE — projected-point spread across each tied set');
console.log('    pick  role      tied set   proj range        swing');
console.log('    ' + '-'.repeat(62));
let total = 0;
rows.forEach(r => {
  const set = r.seat
    ? [r.top].concat(r.L.slice(1).filter(x => pBeats(r.top.p, x.p, 0.3) <= 0.55))
    : [r.top].concat(r.L.slice(1).filter(x => x.v >= r.top.v * (1 - BENCH_BAND)));
  if (set.length < 2) {
    console.log('    ' + String(r.r.pick).padStart(4) + '  ' + String(r.r.role).padEnd(9)
      + ' 1 — model is decisive, no tie to break'); return;
  }
  const mus = set.map(x => x.p.proj_mean);
  const sw = Math.max(...mus) - Math.min(...mus);
  total += sw;
  console.log('    ' + String(r.r.pick).padStart(4) + '  ' + String(r.r.role).padEnd(9)
    + String(set.length).padStart(4) + '       '
    + (Math.min(...mus).toFixed(0) + '-' + Math.max(...mus).toFixed(0)).padEnd(14)
    + sw.toFixed(1).padStart(7) + ' pts');
});
console.log('\n    TOTAL projected-point swing across all frontiers: ' + total.toFixed(0) + ' pts');
/* WHAT THIS NUMBER IS, STATED CAREFULLY, BECAUSE IT IS NOT A BOUND EITHER WAY.
 *
 * It is the spread in PROJECTED points inside the sets the model calls ties. It
 * is NOT the ceiling on what a tiebreaker can win: a tiebreaker earns its keep
 * precisely by using information the projection LACKS (pace, touches, role
 * change, age), so its winnings are realised points, and realised season totals
 * scatter far wider than projections do -- Barkley's own sd is 79. Nor is it a
 * floor, since a tiebreaker built on a signal that does not predict loses.
 *
 * It is a SCALE-SETTER: it says how much room the projections themselves see
 * inside the ties, and therefore how big a signal would have to be before it is
 * worth trusting over the projection. 42 points of room against a MODEL-over-
 * MARKET edge of 148.1 is the honest proportion — the tiebreak frontier is a
 * real but secondary target, and it is concentrated in TWO STARTING SEATS
 * (picks 28 and 33, 9.4 and 9.9 pts) rather than in the bench upside hunt the
 * question started from. */
console.log('    NOT A BOUND EITHER WAY — see the note in source. It is the room the');
console.log('    PROJECTIONS see inside their own ties. A tiebreaker wins in REALISED');
console.log('    points and those scatter wider; a bad one loses. Read it as scale:');
console.log('    42 pts of room against MODEL-over-MARKET of 148.1 (strategy_compare).');
console.log('    And note WHERE it sits: the two biggest frontiers are STARTING SEATS');
console.log('    (28 WR, 33 QB), not the bench picks the question started from.');

/* ── 4. THE CONTROL ────────────────────────────────────────────────────────
 * If EVERY adjacent pair on the board is a coin flip then the frontier above is
 * not a property of my picks, it is a property of proj_sd being large, and the
 * headline is about the projections rather than about tiebreaking. */
console.log('\n  CONTROL — is this special to my picks, or is the whole board a coin flip?');
['QB', 'RB', 'WR', 'TE'].forEach(pos => {
  const g = pool.filter(p => p.position === pos)
    .sort((a, b) => b.proj_mean - a.proj_mean).slice(0, 40);
  let f = 0;
  for (let i = 0; i + 1 < g.length; i++) if (pBeats(g[i], g[i + 1], 0.3) <= 0.55) f++;
  const span = g[0].proj_mean - g[g.length - 1].proj_mean;
  console.log('    ' + pos.padEnd(4) + ' adjacent pairs in the top 40 that are coin flips: '
    + String(f).padStart(2) + '/' + (g.length - 1)
    + '  (' + String(Math.round(100 * f / (g.length - 1))).padStart(3) + '%)'
    + '   but rank 1 to rank 40 spans ' + span.toFixed(0) + ' pts');
});
console.log('    ADJACENT pairs being coin flips is COMPATIBLE with the ranking being');
console.log('    highly informative overall — the span column is the check. Reading the');
console.log('    percentage alone would say "the board is noise", and it is not.');
