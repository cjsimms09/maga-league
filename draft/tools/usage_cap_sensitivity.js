// TERRITORY: A
/* THE USAGE ADJUSTMENT IS A BONUS, NOT AN ADJUSTMENT — AND IT LANDS ON THE TOP
 * OF THE BOARD.
 *
 * projections.py applies, to every projection:
 *
 *     adj = clamp(+/-cap, (z/2) * cap)   with cap = 0.15
 *     proj_mean = proj_baseline * (1 + adj)
 *
 * where z is the within-position z-score of a usage composite (WOPR for WR/TE,
 * opportunity_share*10 + rz_share for RB).
 *
 * ── WHAT THIS IS AND IS NOT ─────────────────────────────────────────────────
 *
 * SENSITIVITY, NOT VALIDATION, and the distinction is not cosmetic. Nothing here
 * can say whether the adjustment HELPS. That question is already pre-registered
 * as the `opportunity_adj` component in src/component_specs.js -- claim,
 * baseline (proj_baseline, the same projection without the adjustment), cluster,
 * and all three implications written in advance. It currently grades `no_data`,
 * honestly, because it resolves from the weekly box score and the season has not
 * started. THE MACHINERY TO ANSWER THIS EXISTS AND IS WAITING ON SEPTEMBER.
 *
 * What this CAN say is whether the cap matters for the draft on Aug 22, which is
 * a different and answerable question.
 *
 * ── TWO KNOBS THAT ARE ROUTINELY TREATED AS ONE ─────────────────────────────
 *
 *     adj = clamp(+/-cap, (z/2)*cap)  ==  cap * clamp(+/-1, z/2)
 *
 * The cap SCALES every adjustment proportionally. It does NOT change who is
 * clipped -- clipping happens at |z| >= 2 whatever the cap is. So "revisit the
 * clamp" is two proposals: change the magnitude (cap), or change the saturation
 * point (the z/2 map). They have different effects and only the second one
 * touches the players the spec is worried about.
 *
 * Run: node draft/tools/usage_cap_sensitivity.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const PLAN = require('./draft_plan.js');

const pool = DATA.players.filter(p => p.position && (p.proj_mean || 0) > 0
  && Number.isFinite(p.proj_baseline) && Number.isFinite(p.opportunity_z));
const POS = ['QB', 'RB', 'WR', 'TE'];
const SHIPPED_CAP = 0.15;

/* The shipped map, reproduced exactly so a cap of 0.15 must return the shipped
 * board. That equality is checked below and is the whole warrant for the rest. */
const clamp = (lo, hi, x) => Math.max(lo, Math.min(hi, x));
const adjOf = (z, cap) => clamp(-cap, cap, (z / 2) * cap);
const meanUnder = (p, cap) => p.proj_baseline * (1 + adjOf(p.opportunity_z, cap));

console.log('USAGE CAP SENSITIVITY — does the +/-15% clamp matter for Aug 22?\n');

/* ── 0. THE RECONSTRUCTION MUST REPRODUCE THE SHIPPED BOARD ────────────────
 * If it does not, nothing below describes our board. This is the control that
 * makes every other number in this file mean something. */
/* THE TOLERANCE IS DERIVED, NOT TUNED. My first pass used a flat 0.01 and the
 * control fired at 0.0749. The correct response to a control firing is NOT to
 * raise the threshold until it passes -- that converts a real check into a
 * vacuous one, which is the failure this whole line of work is about. So the
 * bound is computed from the stored PRECISION of the inputs:
 *
 *   projections.py rounds opportunity_z to 2dp, proj_baseline to 2dp, proj_mean
 *   to 2dp. Worst-case half-ulp on each:
 *     |dz| <= 0.005  =>  |d(adj)| <= 0.005/2 * cap
 *     |d(mean)| <= |d(baseline)|*(1+cap) + baseline*|d(adj)| + 0.005
 *
 * A residual inside that bound is arithmetic we can account for. A residual
 * outside it is a reconstruction that does not match the producer, and the run
 * aborts. */
{
  let worst = 0, worstBound = 0, over = 0, worstName = '';
  pool.forEach(p => {
    const e = Math.abs(meanUnder(p, SHIPPED_CAP) - p.proj_mean);
    const dAdj = (0.005 / 2) * SHIPPED_CAP;
    const bound = 0.005 * (1 + SHIPPED_CAP) + Math.abs(p.proj_baseline) * dAdj + 0.005;
    if (e > bound) over++;
    if (e > worst) { worst = e; worstBound = bound; worstName = p.name; }
  });
  console.log('  CONTROL — reconstructing proj_mean at cap=0.15 from proj_baseline and z');
  console.log('    largest residual: ' + worst.toFixed(4) + ' (' + worstName
    + '), against a rounding bound of ' + worstBound.toFixed(4));
  console.log('    players outside their own rounding bound: ' + over + ' of ' + pool.length);
  if (over) {
    console.log('    *** RECONSTRUCTION DOES NOT MATCH THE PRODUCER — DISREGARD EVERYTHING BELOW ***');
    process.exit(2);
  }
  console.log('    every residual is explained by 2dp storage. The reconstruction is sound.');
}

/* ── 1. THE ADJUSTMENT IS ONE-SIDED, WHICH THE NAME DOES NOT SUGGEST ───────
 * A symmetric +/-15% clamp on a SKEWED input is not symmetric in effect. */
{
  const z = pool.map(p => p.opportunity_z).sort((a, b) => a - b);
  const hi = pool.filter(p => p.opportunity_z >= 2).length;
  const lo = pool.filter(p => p.opportunity_z <= -2).length;
  console.log('\n  THE CLAMP IS SYMMETRIC. THE EFFECT IS NOT.');
  console.log('    opportunity_z runs ' + z[0].toFixed(2) + ' to ' + z[z.length - 1].toFixed(2)
    + '  (median ' + z[z.length >> 1].toFixed(2) + ')');
  console.log('    clipped at the UPPER cap: ' + hi + '     clipped at the LOWER cap: ' + lo);
  const worstPenalty = Math.min(...pool.map(p => adjOf(p.opportunity_z, SHIPPED_CAP)));
  console.log('    so the term can award up to +15.0% but can only ever deduct '
    + (100 * worstPenalty).toFixed(1) + '%.');
  console.log('    IT IS A BONUS WITH A SMALL PENALTY ATTACHED, not a two-sided adjustment.');
  console.log('    The z-score is bounded below because the usage composite is bounded below');
  console.log('    at zero and heavily right-skewed; z-scoring a skewed variable inherits the');
  console.log('    skew. Nothing is wrong with the arithmetic — the DESCRIPTION is what');
  console.log('    "+/-15% adjustment" gets wrong.');
}

/* ── 2. WHERE THE BONUS LANDS. THIS IS THE PART THAT TOUCHES THE DRAFT. ────
 * If the bonus concentrated randomly it would be noise. It does not. */
{
  console.log('\n  WHERE THE BONUS LANDS — mean adjustment by ADP band');
  console.log('    ADP band      n     mean adj    at upper cap');
  console.log('    ' + '-'.repeat(56));
  const bands = [[0, 24, '  1-24'], [24, 48, ' 25-48'], [48, 96, ' 49-96'],
    [96, 180, '97-180'], [180, 1e9, '  181+']];
  bands.forEach(([a, b, lbl]) => {
    const g = pool.filter(p => {
      const adp = Number(p.raw_adp != null ? p.raw_adp : 9999);
      return adp >= a && adp < b;
    });
    if (!g.length) return;
    const m = g.reduce((s, p) => s + adjOf(p.opportunity_z, SHIPPED_CAP), 0) / g.length;
    const capped = g.filter(p => p.opportunity_z >= 2).length;
    console.log('    ' + lbl + '     ' + String(g.length).padStart(4) + '    '
      + (m >= 0 ? '+' : '') + (100 * m).toFixed(2) + '%       ' + capped);
  });
  console.log('    The bonus is concentrated at the TOP of the board and saturates there.');
  console.log('    That STRETCHES the gap between elite and mid, which is exactly the');
  console.log('    quantity the QB/TE timing decision is made on (drop-off vs drop-off).');
}

/* ── 3. DOES IT CHANGE THE ORDER? ORDER IS WHAT EVERY DOWNSTREAM STEP USES. ─ */
console.log('\n  RANK EFFECT WITHIN POSITION — vs the shipped cap of 0.15');
console.log('    cap      QB moves   RB moves   WR moves   TE moves   largest single move');
console.log('    ' + '-'.repeat(74));
[0, 0.075, 0.15, 0.25, 0.40].forEach(cap => {
  const cells = [], moves = [];
  POS.forEach(pos => {
    const g = pool.filter(p => p.position === pos);
    const a = g.slice().sort((x, y) => y.proj_mean - x.proj_mean);
    const b = g.slice().sort((x, y) => meanUnder(y, cap) - meanUnder(x, cap));
    let n = 0, mx = 0;
    a.forEach((p, i) => { const j = b.indexOf(p); if (i !== j) n++; mx = Math.max(mx, Math.abs(i - j)); });
    cells.push(n); moves.push(mx);
  });
  console.log('    ' + cap.toFixed(3).padEnd(9) + cells.map(c => String(c).padStart(6) + '   ').join('')
    + '      ' + Math.max(...moves) + ' places'
    + (cap === SHIPPED_CAP ? '   <- shipped (must be all zero)' : ''));
});

/* ── 4. AND THE ONLY QUESTION THAT MATTERS ON AUG 22 ───────────────────────
 * Not "does the board move" -- "does MY PICK move". The plan's assigned role at
 * each pick comes from draft_plan itself rather than being restated here. */
console.log('\n  DOES MY PICK CHANGE? — best available in the plan\'s assigned role');
console.log('    (bench picks are priced on insurance value, not proj_mean, so a bench row');
console.log('     here shows only the proj_mean-ordered candidate, which is not the plan\'s')
console.log('     choice. Seat rows are the decision-relevant ones.)');
console.log('    pick  role     cap=0 (no adjustment)          cap=0.15 (shipped)');
console.log('    ' + '-'.repeat(76));
const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));
const byAdp = pool.slice().sort((a, b) => adpOf(a) - adpOf(b));
const kept = new Set(PLAN.keep.map(k => String(k.player_id)));
let changed = 0, seatRows = 0;
PLAN.ranked.forEach(r => {
  const seat = r.role !== 'bench';
  const gone = new Set(byAdp.slice(0, r.pick - 1).map(x => String(x.player_id)));
  const av = pool.filter(x => !gone.has(String(x.player_id)) && !kept.has(String(x.player_id))
    && (!r.elig || r.elig.indexOf(x.position) >= 0));
  if (av.length < 2) return;
  const pick = cap => av.slice().sort((a, b) => meanUnder(b, cap) - meanUnder(a, cap))[0];
  const off = pick(0), on = pick(SHIPPED_CAP);
  const diff = String(off.player_id) !== String(on.player_id);
  if (seat) { seatRows++; if (diff) changed++; }
  console.log('    ' + String(r.pick).padStart(4) + '  ' + String(r.role).padEnd(9)
    + (off.position + ' ' + off.name).padEnd(30)
    + (diff ? '=> ' + on.position + ' ' + on.name + '   CHANGED' : 'same'));
});
console.log('\n    STARTING SEATS whose pick changes when the adjustment is switched off: '
  + changed + ' of ' + seatRows);

/* ── 5. THE TEST §4 DOES NOT COVER, AND IT IS THE ONE CORY ASKED ABOUT ─────
 *
 * §4 asks "which player fills this seat", which is a WITHIN-POSITION ordering
 * question. The bonus barely changes within-position order at the top, because
 * nearly every elite player gets the same ~+13-15% -- it is close to a monotone
 * transform up there. What it DOES change is the SIZE of the gaps, and the size
 * of the gaps is what decides WHEN to spend a pick on QB and TE rather than on
 * another RB or WR. Reporting §4's zero as "the cap does not matter" would be
 * answering the easy question and calling it the hard one.
 *
 * So: re-solve the seat assignment itself under each cap. Same DP as
 * draft_plan.js -- 2^S states over the open seats -- with proj_mean swapped for
 * the reconstructed mean. If TE-at-13 and QB-at-33 hold across caps, the timing
 * is robust; if they move, the cap IS decision-relevant and §4 was misleading. */
console.log('\n  DOES THE SEAT *SCHEDULE* CHANGE? — the QB/TE timing question');
console.log('    cap      seat assignment (pick -> role)');
console.log('    ' + '-'.repeat(70));
{
  const STARTERS = (DATA.league || {}).starters || {};
  const FLEX_POS = ['RB', 'WR', 'TE'];
  const held = {};
  PLAN.keep.forEach(k => { held[k.position] = (held[k.position] || 0) + 1; });
  const open = [];
  Object.keys(STARTERS).forEach(pos => {
    if (pos === 'FLEX') return;
    for (let i = 0; i < (STARTERS[pos] || 0) - (held[pos] || 0); i++) open.push({ slot: pos, elig: [pos] });
  });
  const flexUsed = FLEX_POS.reduce((n, p) => n + Math.max(0, (held[p] || 0) - (STARTERS[p] || 0)), 0);
  for (let i = 0; i < Math.max(0, (STARTERS.FLEX || 0) - flexUsed); i++) open.push({ slot: 'FLEX', elig: FLEX_POS });

  const SCHED = PLAN.SCHED;
  const avail = SCHED.map(p => {
    const gone = new Set(byAdp.slice(0, p - 1).map(x => String(x.player_id)));
    return pool.filter(x => !gone.has(String(x.player_id)) && !kept.has(String(x.player_id)));
  });

  function solve(cap) {
    const seatVal = avail.map(av => open.map(o => {
      const b = av.filter(x => o.elig.indexOf(x.position) >= 0)
        .sort((m, n) => meanUnder(n, cap) - meanUnder(m, cap))[0];
      return b ? meanUnder(b, cap) : 0;
    }));
    const N = SCHED.length, S = open.length, FULL = (1 << S) - 1;
    const dp = Array.from({ length: N + 1 }, () => new Float64Array(1 << S).fill(-Infinity));
    const pv = Array.from({ length: N + 1 }, () => new Int32Array(1 << S).fill(-2));
    dp[0][0] = 0;
    for (let i = 0; i < N; i++) for (let m = 0; m <= FULL; m++) {
      if (dp[i][m] === -Infinity) continue;
      if (dp[i][m] > dp[i + 1][m]) { dp[i + 1][m] = dp[i][m]; pv[i + 1][m] = -1; }
      for (let s = 0; s < S; s++) {
        if (m & (1 << s)) continue;
        const nm = m | (1 << s), nv = dp[i][m] + seatVal[i][s];
        if (nv > dp[i + 1][nm]) { dp[i + 1][nm] = nv; pv[i + 1][nm] = s; }
      }
    }
    const at = {};
    let m = FULL;
    for (let i = N; i > 0; i--) { const s = pv[i][m]; if (s >= 0) { at[SCHED[i - 1]] = open[s].slot; m ^= (1 << s); } }
    return at;
  }
  const shipped = solve(SHIPPED_CAP);
  const fmt = a => Object.keys(a).sort((x, y) => x - y).map(k => k + '->' + a[k]).join('  ');
  let moved = 0;
  [0, 0.075, 0.15, 0.25, 0.40].forEach(cap => {
    const a = solve(cap);
    const same = fmt(a) === fmt(shipped);
    if (!same) moved++;
    console.log('    ' + cap.toFixed(3).padEnd(9) + fmt(a)
      + (cap === SHIPPED_CAP ? '   <- shipped' : (same ? '' : '   *** SCHEDULE MOVED ***')));
  });
  console.log('\n    caps (of 4 tested, excluding the shipped one) that move the schedule: ' + moved);
  console.log('    TE-at-13 and QB-at-33 are the picks this is really asking about.');
}

/* ── 6. WHY IT FLIPS, AND IT IS NOT ABOUT THE CAP AT ALL ───────────────────
 *
 * The schedule is robust to the cap MAGNITUDE (0.075 through 0.40 all agree)
 * and flips only when the term is removed entirely. The mechanism is structural:
 *
 *   composite_z computes a raw usage figure for WR/TE (wopr) and RB
 *   (opportunity_share*10 + rz_share). EVERY OTHER POSITION FALLS THROUGH
 *   `else: continue` AND RECEIVES z = 0.
 *
 * So the bonus can reach RB, WR and TE and CANNOT reach QB, K or DEF -- not
 * because those positions were measured and found undeserving, but because no
 * target-share analogue was defined for them. The result is a term that
 * systematically lifts three positions against three others, in a model whose
 * central open question is WHEN TO TAKE QB AND TE relative to RB and WR.
 *
 * This is a CROSS-POSITION comparison contaminated by a term that structurally
 * exists for only some positions. It is the same family as conflating value with
 * opportunity cost: the arithmetic is fine within a position and misleading
 * across them. */
console.log('\n  WHY IT FLIPS — the bonus cannot reach QB by construction');
console.log('    position   players with a non-zero z    mean uplift');
console.log('    ' + '-'.repeat(58));
['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].forEach(pos => {
  const g = pool.filter(p => p.position === pos);
  if (!g.length) return;
  const nz = g.filter(p => Math.abs(p.opportunity_z) > 1e-9).length;
  const up = g.reduce((s, p) => s + (p.proj_mean / p.proj_baseline - 1), 0) / g.length;
  console.log('    ' + pos.padEnd(11) + (nz + ' / ' + g.length).padEnd(29)
    + (up >= 0 ? '+' : '') + (100 * up).toFixed(2) + '%');
});
{
  const bow = pool.find(p => p.name && p.name.indexOf('Bowers') >= 0);
  const lam = pool.find(p => p.name && p.name.indexOf('Lamar Jackson') >= 0);
  if (bow && lam) {
    console.log('\n    THE 13th PICK IN ONE LINE:');
    console.log('      ' + bow.name + '  ' + bow.proj_baseline.toFixed(1) + ' -> '
      + bow.proj_mean.toFixed(1) + '   (+' + (bow.proj_mean - bow.proj_baseline).toFixed(1)
      + ' pts, z ' + bow.opportunity_z + ', AT THE CAP)');
    console.log('      ' + lam.name + '  ' + lam.proj_baseline.toFixed(1) + ' -> '
      + lam.proj_mean.toFixed(1) + '   (+0.0 pts, z 0 — QBs cannot receive this term)');
    console.log('    The tight end is handed ' + (bow.proj_mean - bow.proj_baseline).toFixed(0)
      + ' points the quarterback is structurally ineligible for,');
    console.log('    and that is what buys TE the 13th pick. Whether that is right is the');
    console.log('    September grade. That it is UNDECLARED as a cross-position effect is a');
    console.log('    finding available today.');
  }
}

console.log('\n  THE VERDICT THIS CAN AND CANNOT REACH');
console.log('    CAN: whether the cap is decision-relevant for Aug 22 — see the line above.');
console.log('    CANNOT: whether the adjustment is RIGHT. That is component_specs.js');
console.log('    `opportunity_adj`, graded against proj_baseline, cluster=week, resolving');
console.log('    from the weekly box score. It reads no_data today and that is correct.');
console.log('    Its three implications are already written down, so the September result');
console.log('    cannot be reinterpreted after the fact to suit whatever it says.');
