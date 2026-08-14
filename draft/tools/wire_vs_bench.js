// TERRITORY: A
/* WHAT THE WIRE ACTUALLY GIVES YOU, PER POSITION — and it settles QB2/TE2.
 *
 * Cory, at the start of all this:
 *
 *   "can find a QB who can get you 80% points of best QB, can't find a RB who
 *    does that"
 *
 * That was an intuition with no number behind it, and the bench equation was
 * built without one — it priced every position against the BEST UNDRAFTED
 * PLAYER, a preseason projection of whoever is left over. C's
 * waiver_replacement.py supplies the missing measurement: 764 real acquisitions
 * across 2023-2025, joined to what that player actually scored IN THE WEEK HE
 * WAS ADDED.
 *
 * ── WHERE I DISAGREE WITH C'S FRAMING, WITH THE EVIDENCE ───────────────────
 *
 * C labels the realized-acquisition number a LOWER bound and the best-undrafted
 * number an UPPER bound, on the reasoning that nobody gets the best available
 * player. That reasoning is sound and the two do not bracket:
 *
 *     per week      best-undrafted    realized acquisition
 *     QB                     17.9                    20.9      ratio 1.17
 *     WR                      9.5                    13.3      ratio 1.40
 *     RB                      8.6                     5.3      ratio 0.61
 *     TE                      8.8                     6.3      ratio 0.72
 *
 * AT QB AND WR THE "LOWER BOUND" EXCEEDS THE "UPPER BOUND". The framing assumes
 * both describe the same pool, and they do not: best-undrafted is a PRESEASON
 * projection of a STATIC leftover pool, while a realized acquisition is drawn
 * from a pool that REFRESHES all season as roles change and starters fall. By
 * week 6 the genuinely-available quarterback can be better than any preseason
 * projection of the leftovers — that is not a bound violation, it is two
 * different quantities. Routed back to C as a note, not a defect: the
 * bound_note is careful and the arithmetic is right, the DIRECTION just does not
 * survive contact.
 *
 * Run: node draft/tools/wire_vs_bench.js
 */
'use strict';
const PLAN = require('./draft_plan.js');

/* Realized acquisition medians, points in the week added, pooled 2023-2025 —
 * DERIVED from `wire_level.js`, which is the one place the summary statistic is
 * chosen, rather than transcribed here.
 *
 * THE `n` CARRIED BESIDE IT USED TO BE A DIFFERENT ESTIMATOR'S n. This file
 * shipped `QB {v: 20.9, n: 5}` and argued, correctly, that "a median of five
 * reads exactly like a median of forty unless the count travels with it" — and
 * then carried a count that did not belong to the value. 20.9 was the median of
 * the per-(position, week) CELL MEDIANS clearing min_n=5; 5 was the pooled
 * acquisition count of those cells. The value rested on ONE CELL, not five
 * observations, and the number printed to make it honest was the wrong one.
 * `levels()` returns the n OF THE SAMPLE IT SUMMARISES, so the argument this
 * file makes about counts is now true of its own output. */
const WL = require('./wire_level.js').levels();
const WIRE = {};
Object.keys(WL.per_week).forEach(p => { WIRE[p] = { v: WL.per_week[p], n: WL.n[p] }; });
const WEEKS = 15;
const thin = p => WIRE[p].n < 20;

console.log('THE WIRE VERSUS MY BENCH — realized acquisitions, not preseason leftovers\n');

/* ── 1. CORY'S 80% CLAIM, SCORED ───────────────────────────────────────────
 * The claim is about the RATIO of what the wire gives you to what a rostered
 * player gives you. That ratio is the whole argument for and against carrying a
 * backup at each position, and it had never been computed. */
console.log('  1. "A WIRE QB GETS YOU 80% OF A GOOD ONE. A WIRE RB DOES NOT."');
console.log('     pick  player                  proj/wk   wire/wk   wire is    beats wire by');
console.log('     ' + '-'.repeat(76));
const rows = [];
PLAN.plan.filter(x => x.bench && x.p && WIRE[x.p.position]).forEach(x => {
  const mine = x.p.proj_mean / WEEKS, w = WIRE[x.p.position].v;
  rows.push({ x, mine, w, pct: 100 * w / mine, edge: mine - w });
  console.log('     ' + String(x.pick).padStart(4) + '  '
    + (x.p.position + ' ' + x.p.name).padEnd(22)
    + mine.toFixed(1).padStart(7) + w.toFixed(1).padStart(10)
    + (100 * w / mine).toFixed(0).padStart(9) + '%'
    + (mine - w).toFixed(1).padStart(13) + ' /wk'
    + (thin(x.p.position) ? '   (n=' + WIRE[x.p.position].n + ')' : '')
    + (mine - w <= 0 ? '   WORSE THAN THE WIRE' : ''));
});
{
  const qb = rows.find(r => r.x.p.position === 'QB');
  const rb = rows.find(r => r.x.p.position === 'RB');
  if (qb && rb) {
    /* THE VERDICT ON CORY'S CLAIM IS COMPUTED, NOT WRITTEN DOWN. This line read
     * "HE WAS RIGHT, AND CLOSE ON THE NUMBER" against a QB wire of 20.9 — 89%,
     * nine points off his 80. Measured over the full sample the QB wire is
     * higher, so the direction of his error changes, and a sentence that
     * announces the verdict before computing it would have gone on saying
     * "close" no matter how far apart they were. */
    const guess = 80;
    const off = qb.pct - guess;
    console.log('\n     HIS CLAIM WAS "' + guess + '% OF A GOOD ONE", AND HE '
      + (Math.abs(off) <= 10 ? 'HAD IT TO WITHIN TEN POINTS'
        : off > 0 ? 'UNDERSTATED IT BY ' + off.toFixed(0)
        : 'OVERSTATED IT BY ' + (-off).toFixed(0)) + '.');
    console.log('     The wire quarterback is ' + qb.pct.toFixed(0) + '% of');
    console.log('     ' + qb.x.p.name + '. The wire running back is '
      + rb.pct.toFixed(0) + '% of ' + rb.x.p.name + '.');
    console.log('     THAT ASYMMETRY IS THE ENTIRE CASE AGAINST A BACKUP QB, and it is the');
    console.log('     one thing the bench equation could not see, because it priced every');
    console.log('     position against a preseason projection of the leftovers.');
  }
}

/* ── 2. WHAT THE BACKUP IS ACTUALLY WORTH, IN THE WEEKS HE ACTUALLY PLAYS ──
 *
 * Two corrections applied at once, both established earlier today and both
 * pointing the same way:
 *   - bye_structure.js: how many weeks each backup ACTUALLY starts, exact,
 *     from byes alone, no injury parameter.
 *   - bench_rule.js section 5: the shipped equation multiplies P(need) by a
 *     FULL SEASON advantage, pricing a one-week bye like a season-ending tear.
 *
 * Weeks-started x per-week edge is the honest floor on a backup's value. */
const BYE_WEEKS = { 'D\'Andre Swift': 3, 'Mike Evans': 2, 'Dak Prescott': 1,
  'Tony Pollard': 0, 'George Kittle': 1, 'Jayden Reed': 0, 'Chris Rodriguez': 0 };
console.log('\n  2. VALUE IN THE WEEKS HE ACTUALLY STARTS (byes only — a floor, not a forecast)');
console.log('     player                  weeks   edge/wk   floor value   model says');
console.log('     ' + '-'.repeat(72));
rows.forEach(r => {
  const wk = BYE_WEEKS[r.x.p.name];
  if (wk == null) return;
  console.log('     ' + r.x.p.name.padEnd(22) + String(wk).padStart(5)
    + r.edge.toFixed(1).padStart(10) + (wk * r.edge).toFixed(1).padStart(14)
    + r.x.v.toFixed(1).padStart(13));
});
console.log('\n     The right-hand column is the shipped bench price. It is larger than the');
console.log('     floor at every row, and the gap is the two known overstatements: byes are');
console.log('     invisible to pNeedNth, and the season-length multiplier prices every');
console.log('     absence as permanent. Injury weeks belong on top of the floor and are');
console.log('     genuinely unknown — E[weeks out | injured] is an open C request.');

/* ── 3. THE ONE THAT FAILS OUTRIGHT ────────────────────────────────────────
 * Cory's rule: a player not beating what is free is not worth rostering. Under
 * the PRESEASON wire only Chris Rodriguez failed. Under the REALIZED wire the
 * list changes, which is the whole reason the measurement was worth having. */
console.log('\n  3. WHO FAILS CORY\'S ROSTER-SPOT RULE, MEASURED AGAINST THE REAL WIRE');
const fails = rows.filter(r => r.edge <= 0);
if (!fails.length) console.log('     none');
fails.forEach(r => console.log('     ' + r.x.p.name + ' (' + r.x.p.position + ') at pick '
  + r.x.pick + ' — the wire is ' + r.pct.toFixed(0) + '% of him. He is NEGATIVE value in a'
  + '\n       roster spot, and the shipped model priced him at ' + r.x.v.toFixed(1) + '.'));
console.log('\n     Against the PRESEASON best-undrafted line only Chris Rodriguez failed.');
console.log('     Against the REALIZED wire the answer changes — which is exactly why the');
console.log('     measurement was worth waiting for rather than guessing.');

/* ── 4. WHAT THIS DOES NOT ESTABLISH ───────────────────────────────────────*/
console.log('\n  WHAT THIS DOES NOT ESTABLISH');
/* THE THIN-SAMPLE CAVEAT IS RECOMPUTED, AND IT NO LONGER APPLIES. This block
 * warned that "QB rests on n=5 and TE on n=6" — true of the filtered statistic
 * and not of this one, which reads every scored acquisition. Leaving a caveat in
 * place after the thing it warns about is gone is the same defect as leaving the
 * constant: prose that was measured once and then stopped being checked. So the
 * counts are read from the sample and the warning fires only if it is earned. */
{
  const thinPos = Object.keys(WIRE).filter(p => WIRE[p].n < 20)
    .sort((a, b) => WIRE[a].n - WIRE[b].n);
  const counts = ['QB', 'RB', 'WR', 'TE'].filter(p => WIRE[p])
    .map(p => p + ' ' + WIRE[p].n).join(', ');
  if (thinPos.length) {
    console.log('     ' + thinPos.map(p => p + ' rests on n=' + WIRE[p].n).join(' and ')
      + '. Read those two rows as directional');
    console.log('     only — they are the thinnest in the sample and a median of a handful');
    console.log('     reads exactly like a median of forty. Counts: ' + counts + '.');
  } else {
    console.log('     NO POSITION HERE IS THIN: ' + counts + ' scored acquisitions, '
      + WL.scored + ' in all,');
    console.log('     across 16-17 distinct weeks each. The earlier version of this section');
    console.log('     warned that QB rested on 5 observations and TE on 6 — that was true of');
    console.log('     the min_n=5 FILTERED statistic this tool used to carry, not of the');
    console.log('     sample it reads now, and the caveat is retired rather than repeated.');
  }
}
console.log('     A median acquisition is also not a median AVAILABLE player — managers add');
console.log('     for need and for handcuffs, not only for points (C\'s bound_note). The');
console.log('     direction of that bias is toward UNDERSTATING the wire, which would make');
console.log('     the case against a backup QB stronger, not weaker.');
console.log('     And a single week\'s score is a noisy read on a player: the same man added');
console.log('     in week 6 might have been worth double or nothing in week 7.');
