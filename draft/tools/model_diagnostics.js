// TERRITORY: A
/* CORY'S FIVE SIGNALS — evaluated on the EQUATION, not on a resulting roster.
 *
 * Cory, 2026-08-19: "these arent constraints. they are messages that the equation
 * is correct and setup for what we are doing."
 *
 *   1. does it FORCE QB/TE/DEF/K when we lack them and only 4 rounds remain
 *   2. does it value bench players DIFFERENTLY once all starting spots are filled
 *   3. does it NOT recommend K or DEF until late
 *   4. does it SEVERELY devalue TE and QB once one is drafted
 *   5. does it value RB and WR until you have 4, then devalue greatly
 *
 * Each is a question about Delta(p) at a controlled roster state, so none of them
 * needs a draft simulation. Evaluate the equation and read the answer.
 *
 *   Delta(p) = P(start|available) x ( C(p,n) - R(q,n) )
 *   P         = measured start rate / positional availability   [capped at 1]
 *   C         = P x proj_mean + (1-P) x proj_ceiling   (starter -> mean,
 *               deep bench -> ceiling; the ramp IS the roster state)
 *   R         = VONA replacement at starter ranks, waiver level at bench ranks
 *
 * REPORT ONLY.  Run: node draft/tools/model_diagnostics.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const PLAN = require('./draft_plan.js');
const MN = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'measured_need_curve.json'), 'utf8'));
if (!MN.controls_all_passed) throw new Error('measured_need_curve failed its controls — REFUSING');
const CURVE = MN.curve;

const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const STARTERS = (DATA.league || {}).starters || {};
/* P165/P166: the waiver level recomputed from THIS ROOM's revealed
 * consumption (WR 52 RB 47 QB 16 TE 14 K 10 DEF 10 per 150-pick draft,
 * 2023-25) instead of from an ADP-order drain. The room takes far more
 * running backs than ADP order does, so the old RB wire was 33.6 points
 * too generous. draft_plan.js is NOT touched -- it feeds seat_plan.json,
 * which the war room reads. */
const WAIVER = { QB: 322.9, RB: 78.4, WR: 124.8, TE: 130.4, K: 128.6, DEF: 100.0 };
const SCHED = PLAN.SCHED;

/* availability, already baked into proj_mean — divided out so we do not count it twice */
const AVAIL = {};
POS.forEach(q => {
  const v = DATA.players.filter(p => p.position === q && p.games_expected != null)
    .map(p => +p.games_expected).sort((a, b) => a - b);
  AVAIL[q] = v.length ? v[v.length >> 1] / 17 : 1;
});
const slotsOf = q => (STARTERS[q] || 0) + ((q === 'RB' || q === 'WR' || q === 'TE') ? 0 : 0);

/* P(start | available) — a pure lineup-decision term */
function pStart(q, n) {          // n = which body he'd be (1-indexed)
  const row = CURVE[q] || [];
  const raw = row[n - 1];
  if (raw == null) return 0;
  return Math.min(1, raw / (AVAIL[q] || 1));
}

const bestAt = (q, adpFloor) => {
  const c = DATA.players.filter(p => p.position === q && p.proj_mean
    && (p.adp == null || p.adp >= adpFloor));
  c.sort((a, b) => b.proj_mean - a.proj_mean);
  return c[0] || null;
};

/* Delta for the best available player at position q, given you hold `held` there */
function delta(q, held, pickIdx) {
  const pk = SCHED[pickIdx], nxt = SCHED[pickIdx + 1];
  const p = bestAt(q, pk);
  if (!p) return null;
  const n = held + 1;
  const P = (held < (STARTERS[q] || 0)) ? 1 : pStart(q, n);
  const mean = p.proj_mean, ceil = p.proj_ceiling != null ? p.proj_ceiling : mean;
  const C = P * mean + (1 - P) * ceil;
  /* ⛔ THE SPLIT IN SECTION 5 OF THE DERIVATION WAS WRONG, AND THIS IS THE BUG IT
   * CAUSED: with R = VONA for starters, a QB priced 5.4 when you held NONE and
   * 22.0 when you held one -- value RISING as the slot filled, which is
   * nonsense. The cause is that VONA at a deep position (~350) is far above the
   * wire (319), so being a starter made a player look WORSE.
   *
   * The error is conflating two different questions:
   *   what is this player WORTH?      -> what I would otherwise have ALL SEASON
   *                                      in that lineup slot = the WAIVER level
   *   should I take him NOW or LATER? -> VONA, the drop to my next pick
   *
   * Delta is defined as the increase in expected season lineup points, which is
   * the FIRST question. So R is the waiver level at every rank. VONA is a TIMING
   * signal and does not belong in the value term. */
  const R = WAIVER[q] || 0;
  return { name: p.name, P: +P.toFixed(3), delta: +(P * (C - R)).toFixed(1) };
}

const line = s => console.log(s);
line('CORY\'S FIVE SIGNALS — read off the EQUATION\n');
line('  availability divided out of the start rate (so proj_mean is not counted twice):');
line('   ' + POS.map(q => q + ' ' + AVAIL[q].toFixed(3)).join('  ') + '\n');

/* ── 4 & 5: how value decays as you accumulate bodies, at a mid-draft pick ── */
line('4 & 5 — HOW VALUE DECAYS AS YOU ACCUMULATE BODIES  (evaluated at pick ' + SCHED[4] + ')');
line('  ' + 'pos'.padEnd(5) + [0, 1, 2, 3, 4, 5].map(h => ('hold ' + h).padStart(10)).join(''));
const decay = {};
POS.forEach(q => {
  const row = [0, 1, 2, 3, 4, 5].map(h => { const d = delta(q, h, 4); return d ? d.delta : null; });
  decay[q] = row;
  line('  ' + q.padEnd(5) + row.map(v => (v == null ? '—' : v.toFixed(1)).padStart(10)).join(''));
});
const pct = (a, b) => (a && b) ? Math.round(100 * b / a) : null;
line('');
line('  4. TE and QB once you have ONE:   QB ' + pct(decay.QB[0], decay.QB[1]) + '% of its first-body value'
   + '   TE ' + pct(decay.TE[0], decay.TE[1]) + '%');
line('  5. RB and WR through FOUR:        RB ' + pct(decay.RB[0], decay.RB[3]) + '% at the 4th'
   + '   WR ' + pct(decay.WR[0], decay.WR[3]) + '%');
line('     then at the FIFTH:             RB ' + pct(decay.RB[0], decay.RB[4]) + '%'
   + '   WR ' + pct(decay.WR[0], decay.WR[4]) + '%');

/* ── 3: does K/DEF stay quiet early? ── */
line('\n3 — IS K/DEF QUIET EARLY AND LOUD LATE?  (holding none, best available at each pick)');
line('  ' + 'pick'.padEnd(6) + ['K', 'DEF', 'RB', 'WR'].map(q => q.padStart(10)).join(''));
SCHED.forEach((pk, i) => {
  const r = ['K', 'DEF', 'RB', 'WR'].map(q => { const d = delta(q, q === 'RB' ? 2 : (q === 'WR' ? 1 : 0), i); return d ? d.delta : null; });
  line('  ' + String(pk).padEnd(6) + r.map(v => (v == null ? '—' : v.toFixed(1)).padStart(10)).join(''));
});

/* ── 1: the forcing case ── */
line('\n1 — DOES IT FORCE THE ONESIES WITH 4 PICKS LEFT AND NONE HELD?');
const i4 = SCHED.length - 4;
line('  at pick ' + SCHED[i4] + ' (4 picks remain), holding NONE of QB/TE/K/DEF and RB4/WR4 already:');
[['QB', 0], ['TE', 0], ['K', 0], ['DEF', 0], ['RB', 4], ['WR', 4]].forEach(([q, h]) => {
  const d = delta(q, h, i4);
  line('   ' + q.padEnd(5) + (d ? (d.delta.toFixed(1).padStart(9) + '   ' + d.name) : '—'));
});

/* ── 2: does the bench get valued differently once starters are filled? ── */
line('\n2 — DOES BENCH VALUATION CHANGE ONCE EVERY STARTING SLOT IS FILLED?');
line('  the C term shifts from mean toward ceiling as P(start) falls:');
['RB', 'WR'].forEach(q => {
  [0, 2, 3, 4].forEach(h => {
    const p = bestAt(q, SCHED[4]);
    if (!p) return;
    const n = h + 1, P = (h < (STARTERS[q] || 0)) ? 1 : pStart(q, n);
    const ceilShare = Math.round(100 * (1 - P));
    line('   ' + q + ' hold ' + h + '  P(start|avail) ' + P.toFixed(3)
      + '  -> valued at ' + ceilShare + '% ceiling');
  });
});
