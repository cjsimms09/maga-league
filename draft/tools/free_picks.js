// TERRITORY: A
/* THE PICKS THE MODEL DOES NOT WANT — and what to do with five of fifteen.
 *
 * Two findings collide here and the collision is the point.
 *
 *   1. draft_plan prices picks 133 and 148 at EXACTLY ZERO. The model says so
 *      itself: "picks this model CANNOT price: 2 — free options; upside belongs
 *      here and is not modelled."
 *   2. wire_vs_bench + bye_structure then show that MORE picks buy a player the
 *      waiver wire simply replaces.
 *
 * How many, and in which rounds, is COMPUTED AND PRINTED rather than written
 * here — this header used to say "FIVE of fifteen... ROUNDS 6, 7 AND 10", which
 * was measured once against an older plan and an older wire level and then
 * stopped being true without stopping being printed. The count moves whenever
 * the wire level or the plan moves, which is exactly why it does not belong in
 * prose.
 *
 * ── THE TIE-BREAK, AND WHY IT IS ALLOWED TO BE USED ────────────────────────
 *
 * Everywhere else in this repo, using an unmeasured preference to move a pick is
 * the failure mode. Here it is the correct move, for one specific reason: the
 * model is PROVABLY INDIFFERENT at these picks. It is not that I disagree with
 * its ranking — it has no ranking to disagree with. When the objective function
 * returns zero, the tie must be broken by something outside it, and the only
 * question is whether that something is measured.
 *
 * Three tie-breaks, in the order their evidence supports:
 *
 *   A. WR SCARCITY — measured. Our drafted shape is 3 WR against this league's
 *      own three-year average of 5.23, the largest deviation on the roster
 *      (roster_shape.js). Not a preference; a counted gap against the league.
 *
 *   B. HANDCUFF TO MY OWN RBs — measured that they are FREE (all go undrafted),
 *      and the wire replaces that position worst as a FRACTION of the starter it
 *      stands in for (draft_plan.wireVsStarter — raw points across positions is
 *      not a comparison), so that hole is the one the wire cannot genuinely fill. The INHERITANCE VALUE is
 *      ASSUMED, not measured, and is flagged at every use.
 *
 *   C. VARIANCE — measured, and it clears its own power bar. corr(sd, weekly
 *      highs | mean) = 0.519 on n=30 team-seasons, against a threshold of ~0.37
 *      for distinguishability at that n (variance_preference.js). Cory: "at a
 *      genuine coin flip, lean for upside or volatility." These picks ARE the
 *      genuine coin flip, so this is exactly where that instruction applies —
 *      and nowhere else.
 *
 * ── THE ASSUMPTION IN (C), STATED BECAUSE IT IS LOAD-BEARING ───────────────
 *
 * The 0.519 is measured on TEAM weekly sd. Spending a pick on a high-sd PLAYER
 * assumes player spread propagates to team spread, which is true only if player
 * weeks are not strongly negatively correlated — plausible, unmeasured, and not
 * something this data can settle. It is a real gap in the chain and it is the
 * reason variance is the THIRD tie-break and not the first.
 *
 * Run: node draft/tools/free_picks.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const PLAN = require('./draft_plan.js');
const { plan, pool, keep } = PLAN;

const num = v => (Number.isFinite(+v) ? +v : null);
const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));
const byAdp = pool.slice().sort((a, b) => adpOf(a) - adpOf(b));
const kept = new Set(keep.map(k => String(k.player_id)));

/* THE WIRE IS DERIVED, NOT TRANSCRIBED. This file shipped
 * `{QB 20.9, RB 5.3, WR 13.3, TE 6.3}` with a comment claiming "pooled 2023-25"
 * — it was the median of the CELL MEDIANS that cleared a min_n=5 reporting
 * floor, which keeps 1 of 42 QB weeks. `emit_seat_plan.js` had already moved to
 * the measured level, so on 2026-08-13 the toolset disagreed with itself and on
 * WR the two halves swapped sides. Reading it from `wire_level.js` is what makes
 * that unrepeatable; the derivation and its control sweep are in that file. */
const WIRE = require('./wire_level.js').levels().per_week;
const STARTS = { 'D\'Andre Swift': 3, 'Mike Evans': 2, 'Dak Prescott': 1,
  'Tony Pollard': 0, 'George Kittle': 1, 'Jayden Reed': 0, 'Chris Rodriguez': 0 };
const WEEKS = 15;

console.log('THE FREE PICKS — the picks the model cannot spend, and what to do with them\n');

/* ── 1. WHICH PICKS ARE ACTUALLY FREE ─────────────────────────────────────
 * Derived, not asserted. A pick is free if the model prices it at zero OR if
 * the player it buys loses to a freely available one on both counts. */
console.log('  1. THE PICKS, AND WHY EACH ONE IS FREE');
console.log('     pick  the model wants        why it is free');
console.log('     ' + '-'.repeat(74));
const free = [];
const unjudged = [];
plan.forEach(x => {
  if (x.unpriced) {
    free.push({ pick: x.pick, was: null, why: 'the model prices it at EXACTLY ZERO' });
    console.log('     ' + String(x.pick).padStart(4) + '  ' + '(nothing)'.padEnd(22)
      + 'the model prices it at EXACTLY ZERO');
    return;
  }
  if (!x.bench || !x.p || !WIRE[x.p.position]) return;
  const mine = num(x.p.proj_mean) / WEEKS, w = WIRE[x.p.position];
  const pct = 100 * w / mine, wk = STARTS[x.p.name];
  /* A BENCH PLAYER WITH NO BYE ROW IS NOT JUDGED — AND THAT USED TO BE SILENT.
   * `STARTS` is hand-carried from bye_structure.js and names the plan as it
   * stood when it was written; four of this plan's six bench men are not in it,
   * so this `return` was quietly shrinking the denominator. "2 of 12 picks" then
   * reads as a measurement of twelve when it is a measurement of two. */
  if (wk == null) { unjudged.push(x); return; }
  const floor = wk * (mine - w);
  if (pct >= 100 || (floor < 5 && pct >= 75)) {
    free.push({ pick: x.pick, was: x.p, why: 'wire is ' + pct.toFixed(0) + '% of him' });
    console.log('     ' + String(x.pick).padStart(4) + '  '
      + (x.p.position + ' ' + x.p.name).padEnd(22)
      + 'the wire is ' + pct.toFixed(0) + '% of him and he starts '
      + wk + ' wk (floor ' + floor.toFixed(1) + ')');
  }
});
/* THE ROUNDS ARE READ OFF THE BOARD. This line said "Three of them are ROUNDS
 * 6, 7 AND 10" beside a count computed from the plan — so when the wire level
 * was corrected and the count moved to two, the sentence went on naming three
 * rounds, none of which were the rounds those picks are in. The count and the
 * rounds now come from the same place. */
{
  const rds = free.map(f => PLAN.roundOf(f.pick)).sort((a, b) => a - b);
  const list = rds.length === 1 ? 'ROUND ' + rds[0]
    : 'ROUNDS ' + rds.slice(0, -1).join(', ') + ' AND ' + rds[rds.length - 1];
  const early = rds.filter(r => r <= 10).length;
  console.log('\n     ' + free.length + ' of ' + PLAN.SCHED.length + ' picks — ' + list + '.');
  console.log('     ' + (early
    ? early + (early === 1 ? ' of them lands' : ' of them land')
      + ' in the first ten rounds, so this is not a late-round dart-throw budget.'
    : 'All of them are late, so this is a dart-throw budget and should be spent like one.'));
  if (unjudged.length) {
    console.log('     NOT JUDGED: ' + unjudged.length + ' more bench pick'
      + (unjudged.length === 1 ? '' : 's') + ' — '
      + unjudged.map(u => u.p.position + ' ' + u.p.name).join(', ') + '.');
    console.log('     They have no bye-week row in this file\'s hand-carried STARTS map, so');
    console.log('     the count above is out of ' + (free.length + unjudged.length)
      + ' judged, not out of ' + PLAN.SCHED.length + '. Re-run bye_structure.js against');
    console.log('     the CURRENT plan to close them; until then this understates the answer.');
  }
}

/* ── 2. THE HANDCUFFS — free, and the one hole the wire cannot fill ───────*/
console.log('\n  2. HANDCUFFS TO MY OWN BACKS (tie-break B)');
/* Keepers come from `keep`, NOT from a kept-filter over `pool` — draft_plan
 * removes kept players from the pool, so filtering pool by kept returns the
 * empty set and silently drops Henry and Walker. The first version of this
 * found one handcuff instead of three and looked like a finding. */
const myRb = keep.filter(k => k.position === 'RB')
  .concat(plan.filter(x => x.p && x.p.position === 'RB' && !x.bench).map(x => x.p));
const hcs = [];
myRb.forEach(s => {
  pool.filter(p => p.team === s.team && p.position === 'RB'
    && String(p.player_id) !== String(s.player_id) && num(p.proj_mean) != null)
    .sort((a, b) => num(b.proj_mean) - num(a.proj_mean)).slice(0, 1)
    .forEach(m => hcs.push({ m, s }));
});
console.log('     backup                   behind          ADP    goes undrafted?');
console.log('     ' + '-'.repeat(70));
hcs.forEach(({ m, s }) => {
  const a = adpOf(m);
  console.log('     ' + (m.position + ' ' + m.name).padEnd(24)
    + s.name.split(' ').slice(-1)[0].padEnd(14)
    + (a >= 9999 ? ' none' : a.toFixed(0).padStart(5))
    + '    ' + (a > 150 ? 'YES — free at 133/148' : 'no — costs a real pick'));
});
/* THE HANDCUFF ARGUMENT, RECOMPUTED RATHER THAN REMEMBERED. This read "the RB
 * wire pays 5.3/wk, the worst of any position" — a raw-points comparison across
 * positions, which is not a comparison at all: a QB scores roughly twice what an
 * RB does. The claim survives when it is made properly, as a fraction of the
 * starter the wire would replace, and it is asserted here only because the
 * ordering was checked. */
{
  const VS = PLAN.wireVsStarter();
  const ranked = Object.keys(VS).filter(p => VS[p].pct != null)
    .sort((a, b) => VS[a].pct - VS[b].pct);
  const hardest = ranked[0];
  console.log('\n     The ' + hardest + ' wire pays ' + VS[hardest].wire.toFixed(1)
    + '/wk — only ' + VS[hardest].pct.toFixed(0) + '% of your last starting '
    + hardest + ', the');
  console.log('     lowest ratio on the board (' + ranked.map(p => p + ' '
    + VS[p].pct.toFixed(0) + '%').join(', ') + '). A ' + hardest + ' hole is the');
  console.log('     ONE hole the waiver wire genuinely cannot fill, which is what makes a');
  console.log('     handcuff different from ordinary depth. THE INHERITANCE VALUE IS NOT');
}
console.log('     MEASURED — E[weeks out | injured] is an open C request, so "he plays if');
console.log('     the starter misses time" has no number attached to it here.');

/* ── 3. THE CANDIDATES AT EACH FREE PICK ──────────────────────────────────
 * Ranked by the three tie-breaks. Everything shown is on the board; nothing is
 * imported from outside it. */
/* Position median cv, computed from the whole board so the tie-break is
 * measured against the population rather than against the 12 candidates in
 * front of it. Reported, because a tie-break nobody can see the baseline for
 * is not auditable. */
const POS_CV = {};
{
  const g = {};
  pool.concat(keep).forEach(p => {
    const m = num(p.proj_mean), s = num(p.proj_sd);
    if (m == null || s == null || m <= 0) return;
    (g[p.position] = g[p.position] || []).push(s / m);
  });
  Object.keys(g).forEach(k => {
    const v = g[k].sort((a, b) => a - b);
    POS_CV[k] = v[Math.floor(v.length / 2)];
  });
}
console.log('\n  3. WHAT IS ACTUALLY THERE — candidates at each free pick');
console.log('     cv baselines (median proj_sd/proj_mean by position, this board):');
console.log('       ' + Object.keys(POS_CV).sort().map(k => k + ' ' + POS_CV[k].toFixed(3)).join('   '));
console.log('     Tie-break C is measured AGAINST THESE, not on raw cv — raw cv would');
console.log('     rank every TE above every QB and call it volatility.');
const wrHave = plan.filter(x => x.p && x.p.position === 'WR').length
  + keep.filter(k => k.position === 'WR').length;
console.log('     (WR on the roster: ' + wrHave + '. League average drafted: 5.23. Gap: '
  + (5.23 - wrHave).toFixed(2) + ')');
const hcIds = new Set(hcs.map(h => String(h.m.player_id)));
const takenIds = new Set(plan.filter(x => x.p).map(x => String(x.p.player_id)));
free.forEach(f => {
  const gone = new Set(byAdp.slice(0, PLAN.liveBefore(f.pick)).map(p => String(p.player_id)));
  const cands = pool.filter(p => !gone.has(String(p.player_id)) && !kept.has(String(p.player_id))
    && !takenIds.has(String(p.player_id)) && num(p.proj_mean) != null
    && ['RB', 'WR', 'TE'].indexOf(p.position) >= 0);
  /* sd is the tie-break, but only AMONG players who are otherwise comparable —
   * ranking the whole pool by sd just returns the highest-projected players,
   * since sd scales with mean. Restricting to the top of the available pool
   * first is what makes the sd column a tie-break rather than a re-ranking. */
  const top = cands.sort((a, b) => num(b.proj_mean) - num(a.proj_mean)).slice(0, 12);
  const sd = p => (num(p.proj_sd) != null ? num(p.proj_sd) : 0);
  /* cv RELATIVE TO THE PLAYER'S OWN POSITION. Raw cv has position medians of
   * 0.255 (QB) to 0.468 (TE), so sorting a mixed list by it ranks TE above WR
   * above QB every time regardless of any individual player — a position
   * ranking wearing a volatility label. Within position the field is real:
   * 64 distinct values at RB, 82 at WR. */
  const scored = top.map(p => {
    const cv = num(p.proj_mean) > 0 ? sd(p) / num(p.proj_mean) : 0;
    return { p, cv, rel: cv - (POS_CV[p.position] != null ? POS_CV[p.position] : cv) };
  });
  console.log('\n     PICK ' + f.pick + '  (' + f.why + ')');
  console.log('       player                   pos  proj    sd    cv vs pos   tie-break');
  console.log('       ' + '-'.repeat(74));
  scored.sort((a, b) => b.rel - a.rel).slice(0, 5).forEach(({ p, cv, rel }) => {
    const tags = [];
    if (p.position === 'WR' && wrHave < 5.23) tags.push('A: closes the WR gap');
    if (hcIds.has(String(p.player_id))) tags.push('B: HANDCUFF');
    tags.push('C: ' + (rel >= 0 ? '+' : '') + (100 * rel).toFixed(1)
      + '% vs ' + p.position + ' median');
    console.log('       ' + p.name.padEnd(24) + p.position.padEnd(5)
      + num(p.proj_mean).toFixed(0).padStart(4) + sd(p).toFixed(0).padStart(6)
      + ((rel >= 0 ? '+' : '') + (100 * rel).toFixed(1)).padStart(9) + '   '
      + tags.join(' · '));
  });
});

/* ── 4. DOES TIE-BREAK C SEPARATE ANYTHING? ───────────────────────────────
 * A tie-break has to be shown to break a tie. Printing a column that varies by
 * three tenths of a percent and calling it a decision rule is the same defect
 * as an unidentifiable regressor: it looks like input and carries no signal. */
console.log('\n  4. DOES THE VARIANCE TIE-BREAK CHANGE WHO GETS TAKEN?');
console.log('     The only test that matters. A spread is not a decision — the question is');
console.log('     whether ranking by volatility names a different player than ranking by');
console.log('     projection, among the WR the gap has already selected.');
console.log('\n     pick   best WR by projection      best WR by volatility     costs');
console.log('     ' + '-'.repeat(78));
let moved = 0, tested = 0, totalCost = 0;
free.forEach(f => {
  const gone = new Set(byAdp.slice(0, PLAN.liveBefore(f.pick)).map(p => String(p.player_id)));
  const cands = pool.filter(p => !gone.has(String(p.player_id)) && !kept.has(String(p.player_id))
    && !takenIds.has(String(p.player_id)) && num(p.proj_mean) != null
    && num(p.proj_sd) != null && p.position === 'WR')
    .sort((a, b) => num(b.proj_mean) - num(a.proj_mean)).slice(0, 8);
  if (cands.length < 2) return;
  tested++;
  const byMean = cands[0];
  const byVol = cands.slice().sort((a, b) =>
    (num(b.proj_sd) / num(b.proj_mean)) - (num(a.proj_sd) / num(a.proj_mean)))[0];
  const ch = String(byMean.player_id) !== String(byVol.player_id);
  if (ch) moved++;
  /* THE COST COLUMN IS THE POINT. cv = sd/mean falls as mean rises, so "most
   * volatile" and "lowest projected" are partly the same instruction. If
   * switching costs real projection then this is not a tie-break at all — it
   * is a worse pick with a rationale attached. */
  const cost = num(byMean.proj_mean) - num(byVol.proj_mean);
  totalCost += cost;
  console.log('     ' + String(f.pick).padStart(4) + '   ' + byMean.name.padEnd(26)
    + byVol.name.padEnd(25) + (ch ? (cost > 0 ? '-' + cost.toFixed(0) + ' pts' : 'free') : 'no change'));
});
console.log('\n     ' + moved + ' of ' + tested + ' picks change hands on the variance tie-break.');
if (moved === 0) {
  console.log('     IT DECIDES NOTHING HERE. Among the WR available at these picks the');
  console.log('     highest-projected is also the most volatile relative to his position,');
  console.log('     so the two rules agree and the tie-break never gets to speak.');
} else {
  console.log('     Total projection given up to follow it: ' + totalCost.toFixed(0) + ' pts across '
    + moved + ' picks');
  console.log('     (' + (totalCost / Math.max(1, moved)).toFixed(0) + ' per pick).');
  if (totalCost > 15 * moved) {
    console.log('\n     THAT IS NOT A TIE-BREAK. cv = sd/mean falls as mean rises, so ranking');
    console.log('     by relative volatility is partly just ranking DOWN the board. At this');
    console.log('     cost the rule is not separating equals — it is buying spread with');
    console.log('     projection, and the 0.519 correlation was never evidence for that');
    console.log('     trade. Use tie-break A and take the higher-projected receiver.');
  } else {
    console.log('\n     Small enough to be a genuine tie-break: the players really are near');
    console.log('     equals on projection, and volatility is choosing between equals rather');
    console.log('     than buying spread with points. This is the case Cory described.');
  }
}
console.log('\n     EITHER WAY TIE-BREAK A IS WHAT PICKS THE POSITION. The WR gap is counted');
console.log('     against this league\'s own three-year average and is the largest');
console.log('     deviation on the roster. Variance only ever chooses WHICH receiver.');
console.log('     Cory\'s own framing was right: it "maybe only affects 50/50 decisions".');

/* ── 5. THE ANSWER ────────────────────────────────────────────────────────*/
/* THE RECOMMENDATION IS ASSEMBLED FROM THE SECTIONS ABOVE, NOT REMEMBERED. It
 * used to name picks 53/68/93 and quote three handcuff ADPs (179, 186, 224) that
 * the table in section 2 no longer prints — a summary drifting from the report
 * it summarises, on the same screen. */
{
  const VS = PLAN.wireVsStarter();
  const hardest = Object.keys(VS).filter(p => VS[p].pct != null)
    .sort((a, b) => VS[a].pct - VS[b].pct)[0];
  const freeP = free.map(f => f.pick).sort((a, b) => a - b);
  const undrafted = hcs.filter(({ m }) => adpOf(m) > 150);
  console.log('\n  5. WHAT TO ACTUALLY DO WITH THE ' + freeP.length + ' FREE PICK'
    + (freeP.length === 1 ? '' : 'S') + ' (' + freeP.join(', ') + ')');
  console.log('     TIE-BREAK A — WR. The counted gap against the league is the strongest');
  console.log('     evidence on this page, so the earliest free pick goes there.');
  if (undrafted.length) {
    console.log('     TIE-BREAK B — HANDCUFFS at the LATEST free pick(s). '
      + undrafted.length + ' of ' + hcs.length + ' of mine go');
    console.log('       undrafted (ADP ' + undrafted.map(({ m }) => adpOf(m).toFixed(0)).join(', ')
      + '), so they cost nothing here, and the ' + hardest + ' wire at '
      + VS[hardest].wire.toFixed(1) + '/wk');
    console.log('       — ' + VS[hardest].pct.toFixed(0) + '% of the starter it replaces — '
      + 'is the one hole waivers cannot fill.');
  } else {
    console.log('     TIE-BREAK B — NO HANDCUFF IS FREE. Every backup to my own backs is');
    console.log('       drafted before my last pick, so this tie-break does not apply today.');
  }
console.log('\n     AND THE VOLATILITY RULE, STATED SO IT CANNOT BE OVER-APPLIED: take the');
console.log('     more volatile receiver ONLY when he costs almost nothing in projection.');
console.log('     Section 4 measures that cost pick by pick; where it is real, take the');
console.log('     higher projection — a coin flip is worth spread, forty points is not.');
console.log('     THE ONE THING TO CHECK AT THE TABLE: this assumes no backup QB and no');
console.log('     backup TE. If FAAB is gone by week 12, the week-13 bye stops being');
console.log('     streamable and a second QB becomes correct again.');
}

/* ── 6. WHAT THIS DOES NOT SETTLE ─────────────────────────────────────────*/
console.log('\n  WHAT THIS DOES NOT SETTLE');
console.log('     · The variance tie-break is measured on TEAM weekly sd (0.519, n=30,');
console.log('       threshold ~0.37). Spending a pick on a high-sd PLAYER assumes player');
console.log('       spread propagates to team spread. Plausible, unmeasured, and the');
console.log('       reason variance ranks THIRD and not first.');
console.log('     · cv is computed from proj_sd, which is a SEASON sd. A season sd and a');
console.log('       week-to-week sd are different quantities and the weekly payout cares');
console.log('       about the second one. weekly_sd is on the board but is itself derived');
console.log('       from the season figure, so this is a ratio-lock risk, not an');
console.log('       independent reading.');
console.log('     · Nothing here prices the handcuff inheritance. It is a structural');
console.log('       argument — the wire replaces that position worst — not a point total.');
console.log('     · The candidate lists assume the room drafts near ADP. At the latest free');
console.log('       picks that assumption is at its weakest, because late ADP is thin.');
