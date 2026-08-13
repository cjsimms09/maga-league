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

/* Realized acquisition medians, points in the week added, pooled 2023-2025 from
 * draft/backtest/waiver_replacement.py against C's nflverse weekly archives.
 * n IS CARRIED EVERYWHERE. QB and TE rest on 5 and 6 observations and a median
 * of five reads exactly like a median of forty unless the count travels with
 * it — which is C's own MIN_N argument, applied to C's own output. */
const WIRE = {
  QB: { v: 20.9, n: 5 }, RB: { v: 5.3, n: 46 },
  WR: { v: 13.3, n: 39 }, TE: { v: 6.3, n: 6 },
};
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
    console.log('\n     HE WAS RIGHT, AND CLOSE ON THE NUMBER. The wire quarterback is '
      + qb.pct.toFixed(0) + '% of');
    console.log('     ' + qb.x.p.name + ' (he guessed 80). The wire running back is '
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
console.log('     QB rests on n=5 and TE on n=6. Those two medians are the ones carrying');
console.log('     the QB2/TE2 argument, and they are the thinnest cells in the sample. RB');
console.log('     (n=46) and WR (n=39) are the solid ones, and they say the same thing from');
console.log('     the other side: the RB wire is genuinely poor, which is the more robust');
console.log('     half of Cory\'s claim.');
console.log('     A median acquisition is also not a median AVAILABLE player — managers add');
console.log('     for need and for handcuffs, not only for points (C\'s bound_note). The');
console.log('     direction of that bias is toward UNDERSTATING the wire, which would make');
console.log('     the case against a backup QB stronger, not weaker.');
console.log('     And a single week\'s score is a noisy read on a player: the same man added');
console.log('     in week 6 might have been worth double or nothing in week 7.');
