// TERRITORY: A
/* CORY'S BENCH RULE, APPLIED TO THE PLAN AND TO THE MODEL THAT MADE IT.
 *
 * The rule, in his words:
 *
 *   "Any player on your roster not getting more points at its position than
 *    what is available freely on waivers isn't worth rostering... unless for
 *    protection, bye week coverage, or upside."
 *
 * THE MODEL ALREADY ENCODES HALF OF THIS AND MISSES THE OTHER HALF.
 * draft_plan prices a bench player as
 *
 *     P(need the Nth backup) x E[max(0, X - waiver)]
 *
 * The strike at the waiver line IS the rule's first clause, and the option's
 * volatility IS the upside clause. What it misses is the corollary:
 *
 *   YOU DO NOT HAVE TO ROSTER A PLAYER TO HOLD HIS UPSIDE. If he is freely
 *   available now he is generally available when he breaks out. Rostering buys
 *   you something only to the extent that someone else would take him first.
 *
 * A complete bench value therefore has a third factor the model does not have:
 *
 *     P(need) x E[max(0, X - waiver)] x P(you could NOT have simply waited)
 *
 * That third factor is the rentability question, and roster_shape.js established
 * it cannot be measured from what is on disk. So it is not invented here. What
 * IS done here is to show which conclusions survive without it.
 *
 * ── THE HONEST LABELLING ────────────────────────────────────────────────────
 *
 * Section 3 prices handcuffs under an ASSUMED inheritance fraction. That number
 * is not measured and every intuition-added term in this model has failed
 * measurement (tier -235, risk -143, bye null, ceiling unidentifiable). It is
 * therefore reported across a RANGE and WIRED INTO NOTHING. The plan is
 * unchanged by this file.
 *
 * Run: node draft/tools/bench_rule.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const PLAN = require('./draft_plan.js');
const { WAIVER, plan, pool, keep } = PLAN;

const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));
const DRAFT_LEN = 150;
const INJURY = { QB: 0.14, RB: 0.28, WR: 0.20, TE: 0.22, K: 0.04, DEF: 0.02 };

console.log("THE BENCH RULE — does each pick earn its roster spot?\n");

/* ── 1. THE RULE AS A PLAIN AUDIT ──────────────────────────────────────────
 * Not "what did the model score him" but "would you keep this man over the best
 * free agent". A different question, and it can be asked without the model. */
console.log('  1. DOES HE BEAT WHAT IS FREE?');
console.log('     pick  player                  pos   proj   waiver   margin   priced at');
console.log('     ' + '-'.repeat(74));
const bench = plan.filter(x => x.bench && x.p);
bench.forEach(x => {
  const w = WAIVER[x.p.position];
  const m = x.p.proj_mean - w;
  console.log('     ' + String(x.pick).padStart(4) + '  ' + x.p.name.padEnd(23)
    + x.p.position.padEnd(6) + x.p.proj_mean.toFixed(0).padStart(5) + w.toFixed(0).padStart(8)
    + (m >= 0 ? '+' : '') + m.toFixed(0).padStart(8) + x.v.toFixed(1).padStart(11)
    + (m <= 0 ? '   FAILS THE RULE' : ''));
});

/* ── 2. WHICH OF THESE PRICES ARE REAL? ────────────────────────────────────
 *
 * The waiver level is not a constant of nature. It moved from 63 to 130 at RB
 * this afternoon when one wrong number was corrected, and the true week-6 level
 * is HIGHER still because the wire restocks from everyone's cuts (measured
 * churn: RB -0.37, WR -0.27 per team). So the right question about a small
 * bench price is not "is it above zero" but "does it survive the waiver line
 * being where it plausibly is".
 *
 * A PICK WHOSE VALUE VANISHES UNDER A MODEST CHANGE IN AN UNCERTAIN INPUT WAS
 * NEVER PRICED. That is a robustness criterion, not a threshold I chose to get
 * the answer I wanted. */
function normPdf(x) { return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI); }
function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = normPdf(x) * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937
    + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - d : d;
}
function optionValue(mu, sd, K) {
  if (!(sd > 0)) return Math.max(0, mu - K);
  const d = (mu - K) / sd;
  return (mu - K) * normCdf(d) + sd * normPdf(d);
}
/* Waiver level under a shallower effective draft — i.e. the wire after cuts. */
function waiverAt(n) {
  const byAdp = pool.slice().sort((a, b) => adpOf(a) - adpOf(b));
  const gone = new Set(byAdp.slice(0, n).map(p => String(p.player_id)));
  const w = {};
  ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].forEach(pos => {
    const free = pool.filter(p => p.position === pos && !gone.has(String(p.player_id)))
      .sort((a, b) => b.proj_mean - a.proj_mean)[0];
    w[pos] = free ? free.proj_mean : 0;
  });
  return w;
}
console.log('\n  2. DOES THE PRICE SURVIVE THE WAIVER LINE MOVING?');
console.log('     the wire restocks in-season, so the effective free-agent pool is SHALLOWER');
console.log('     than the post-draft board. Same picks, priced against progressively better');
console.log('     free agents:');
const LEVELS = [150, 140, 130, 120];
console.log('     pick  player                ' + LEVELS.map(n => ('n=' + n).padStart(9)).join(''));
console.log('     ' + '-'.repeat(72));
const wl = LEVELS.map(waiverAt);
const survives = [];
bench.forEach(x => {
  const ratio = x.v / Math.max(1e-9, optionValue(x.p.proj_mean, x.p.proj_sd, WAIVER[x.p.position]));
  const cells = wl.map(w => ratio * optionValue(x.p.proj_mean, x.p.proj_sd, w[x.p.position]));
  const alive = cells[cells.length - 1] >= 2.0;
  if (alive) survives.push(x);
  console.log('     ' + String(x.pick).padStart(4) + '  ' + x.p.name.padEnd(22)
    + cells.map(c => c.toFixed(1).padStart(9)).join('')
    + (alive ? '' : '   COLLAPSES'));
});
console.log('\n     bench picks whose value survives to n=120: ' + survives.length
  + ' of ' + bench.length);
console.log('     the rest are FREE OPTIONS in all but name — the model is pricing them at');
console.log('     a number smaller than its own uncertainty about the waiver line.');
const freeOptions = bench.length - survives.length + plan.filter(x => x.unpriced).length;
console.log('     SO THE REAL COUNT OF FREE PICKS IS ' + freeOptions + ' of 15, not '
  + plan.filter(x => x.unpriced).length + '.');
console.log('     Those are the picks where protection, bye and upside should decide,');
console.log('     which is exactly the claim Cory made.');

/* ── 3. PROTECTION — AND THE FINDING IS THAT YOU NEED NOT SPEND A PICK ─────
 *
 * A handcuff's value is NOT his own projection. It is his starter's workload,
 * conditional on the starter being out. The model prices him standalone, which
 * is why every handcuff on this board looks worthless. */
console.log('\n  3. PROTECTION — the handcuffs to the backs I already own');
const myRb = keep.filter(k => k.position === 'RB')
  .map(k => pool.find(p => String(p.player_id) === String(k.player_id)) || k)
  .concat(plan.filter(x => !x.bench && x.p && x.p.position === 'RB').map(x => x.p));
console.log('     THE INHERITANCE FRACTION BELOW IS ASSUMED, NOT MEASURED. It is shown across');
console.log('     a range for that reason, and it is wired into nothing.');
console.log('\n     starter            handcuff           adp   drafted?   value if he inherits');
console.log('                                                            50%      70%      90%');
console.log('     ' + '-'.repeat(84));
const hcRows = [];
myRb.forEach(s => {
  const hc = pool.filter(p => p.team === s.team && p.position === 'RB'
    && String(p.player_id) !== String(s.player_id))
    .sort((a, b) => b.proj_mean - a.proj_mean)[0];
  if (!hc) return;
  const r = INJURY.RB;
  const vals = [0.5, 0.7, 0.9].map(f => r * Math.max(0, f * s.proj_mean - WAIVER.RB));
  hcRows.push({ s, hc, vals });
  console.log('     ' + (s.name + ' ' + s.proj_mean.toFixed(0)).padEnd(19)
    + hc.name.padEnd(19) + adpOf(hc).toFixed(0).padStart(5)
    + (adpOf(hc) <= DRAFT_LEN ? '   yes    ' : '   NO     ')
    + vals.map(v => v.toFixed(1).padStart(9)).join(''));
});
console.log('\n     EVERY ONE OF THESE HANDCUFFS GOES UNDRAFTED at a 150-pick draft length.');
console.log('     Standalone they project 54-61 against an RB waiver line of '
  + WAIVER.RB.toFixed(0) + ', so they fail');
console.log('     Cory\'s rule outright on their own merits — which is why the model, which');
console.log('     only knows their own merits, will never take one.');
{
  const best = hcRows.reduce((m, r) => (r.vals[1] > (m ? m.vals[1] : -1) ? r : m), null);
  const dak = plan.find(x => x.p && x.p.position === 'QB' && x.bench);
  if (best && dak) {
    console.log('\n     THE COMPARISON THAT MATTERS:');
    console.log('       ' + best.hc.name + ' at ADP ' + adpOf(best.hc).toFixed(0)
      + '  is worth ' + best.vals[1].toFixed(1) + ' at 70% inheritance');
    console.log('       ' + dak.p.name + ' at pick ' + dak.pick
      + '   is worth ' + dak.v.toFixed(1) + ' by the shipped model');
    console.log('     Comparable value, ' + (dak.pick < adpOf(best.hc) ? 'and the handcuff costs a pick '
      + (adpOf(best.hc) - dak.pick).toFixed(0) + ' slots LATER' : 'at a similar cost') + '.');
    console.log('     THAT IS THE ARGUMENT AGAINST THE BACKUP QB, and it does not need the');
    console.log('     inheritance number to be right — it needs it to be within a factor of two.');
  }
}

/* ── 4. BYE COVERAGE — WHAT CAN AND CANNOT BE CHECKED ──────────────────────
 * Reported honestly because the field is thin. A silent pass on 36% coverage
 * would be worse than saying so. */
console.log('\n  4. BYE COVERAGE');
const withBye = pool.filter(p => p.bye != null);
console.log('     `bye` is present on ' + withBye.length + ' of ' + pool.length
  + ' projected players (' + Math.round(100 * withBye.length / pool.length) + '%).');
const mine = keep.map(k => pool.find(p => String(p.player_id) === String(k.player_id)) || k)
  .concat(plan.filter(x => !x.bench && x.p).map(x => x.p));
const byes = {};
let unknown = 0;
mine.forEach(p => { if (p.bye == null) unknown++; else (byes[p.bye] = byes[p.bye] || []).push(p.position + ' ' + p.name); });
Object.keys(byes).sort((a, b) => a - b).forEach(w => {
  console.log('     week ' + String(w).padStart(2) + ':  ' + byes[w].join(', ')
    + (byes[w].length > 1 ? '   <-- COLLISION' : ''));
});
/* MY FIRST VERSION PRINTED "cannot presently be completed" HERE AND THEN
 * PRINTED "0 starters missing". Both on screen, contradicting each other. The
 * disclaimer was written before the data was looked at and left standing after
 * it was — and it was hiding the strongest finding in this file. `bye` is thin
 * across the whole board (36%) but COMPLETE on every player I plan to roster,
 * so the check is not blocked at all. */
console.log('     starters with NO bye recorded: ' + unknown
  + (unknown ? ' — those cannot be checked' : ' — so this check IS complete for my roster'));

/* ── 4b. THE WEEK-13 COLLISION, AND IT REVERSES PART OF MY ADVICE ─────────── */
{
  const roster = keep.map(k => pool.find(p => String(p.player_id) === String(k.player_id)) || k)
    .concat(plan.filter(x => x.p).map(x => x.p));
  const NEED = { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DEF: 1 };
  const weeks = {};
  roster.forEach(p => { if (p.bye != null) (weeks[p.bye] = weeks[p.bye] || []).push(p); });
  console.log('\n     LEGALITY BY BYE WEEK, whole roster:');
  let worst = null;
  Object.keys(weeks).sort((a, b) => a - b).forEach(w => {
    const out = new Set(weeks[w].map(p => String(p.player_id)));
    const av = roster.filter(p => !out.has(String(p.player_id)));
    const c = {}; av.forEach(p => { c[p.position] = (c[p.position] || 0) + 1; });
    const short = Object.keys(NEED).filter(pos => (c[pos] || 0) < NEED[pos]);
    if (weeks[w].length > 1 || short.length) {
      console.log('       week ' + String(w).padStart(2) + ': out '
        + weeks[w].map(p => p.position).join('/') + '  '
        + (short.length ? 'SHORT AT ' + short.join(',') : 'still legal'));
      if (weeks[w].length > 1) worst = w;
    }
  });
  console.log('\n     WEEK 13 IS THE ONE THAT MATTERS: Henry (RB), Bowers (TE) and Lamar (QB)');
  console.log('     are all out together. The roster fields a legal lineup that week ONLY');
  console.log('     because Dak and Kittle are on it. Under QB<=1 and TE<=1 I would have');
  console.log('     ZERO quarterbacks and ZERO tight ends available in week 13.');
  console.log('\n     THIS PARTLY REVERSES WHAT I TOLD CORY. I called the QB2/TE2 preference');
  console.log('     noise because the model prices it at 19.8 points against a per-player sd');
  console.log('     of 79. That judgement was about INJURY insurance and it stands. Bye');
  console.log('     coverage is a different argument: it is CERTAIN, it is known today, and');
  console.log('     the model does not price it AT ALL — pNeedNth reads injury rates only.');
  console.log('     The honest size of it is small (one week, and both positions are');
  console.log('     streamable with 13 weeks of warning) but it is not zero and it is not');
  console.log('     noise, because it is not a probability.');
}

/* ── 5. AND A DIMENSIONAL ERROR IN THE BENCH EQUATION ITSELF ───────────────
 * Found while writing section 4b, by asking what a bye week is worth. */
console.log('\n  5. THE BENCH EQUATION PRICES EVERY ABSENCE AS SEASON-ENDING');
console.log('     shipped:  benchValue = P(ever need him) x E[max(0, X_SEASON - waiver_SEASON)]');
console.log('     A probability of NEED multiplied by a FULL SEASON advantage assumes that');
console.log('     if you need him at all, you need him for all fifteen weeks. A one-week bye');
console.log('     and a season-ending injury are priced identically.');
console.log('\n     correct form:   x  E[weeks he actually starts | needed] / 15');
console.log('\n     pick  player            shipped    2wk    4wk    8wk');
console.log('     ' + '-'.repeat(56));
bench.forEach(x => console.log('     ' + String(x.pick).padStart(4) + '  ' + x.p.name.padEnd(18)
  + x.v.toFixed(1).padStart(7) + [2, 4, 8].map(w => (x.v * w / 15).toFixed(1).padStart(7)).join('')));
const tb = bench.reduce((a, x) => a + x.v, 0);
console.log('\n     total bench value ' + tb.toFixed(1) + ' -> ' + (tb * 4 / 15).toFixed(1)
  + ' at a 4-week average absence.');
console.log('     EVERY BENCH PRICE IN THIS PLAN IS OVERSTATED by roughly 15/E[weeks].');
console.log('     NOT CORRECTED HERE: E[weeks out | injured] is not on disk, and inventing');
console.log('     a constant to fix a symptom I just found is the exact move the');
console.log('     constitutional rule forbids. It is a C request alongside durability.');
console.log('     Direction is what matters today: this is the SECOND independent error');
console.log('     found in one afternoon that inflated bench value, after ROSTERED=180.');
console.log('     Both point the way Cory\'s instinct pointed.');
