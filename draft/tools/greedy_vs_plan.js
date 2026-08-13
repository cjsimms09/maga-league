// TERRITORY: A
/* WHAT DOES THE ENGINE'S PICK-8 QUARTERBACK ACTUALLY COST? — measured before fixing.
 *
 * The engine takes QB Josh Allen at pick 8. draft_plan takes RB James Cook and
 * leaves the quarterback to pick 33. Both are defensible from their own side:
 *
 *   THE ENGINE is GREEDY and per-pick. VONA is `proj - expectedBestAvailable(
 *   samePos, nextPick)`, so it asks "how much do I lose at this position by
 *   waiting?" Allen's within-QB drop over 8->13 is larger than Cook's within-RB
 *   drop, so Allen wins. Nothing is wrong with that arithmetic.
 *
 *   draft_plan is GLOBAL. It solves the seat assignment exactly (DP over 2^S
 *   states, brute-force verified) and knows a startable quarterback survives to
 *   33, so spending pick 8 on one buys almost nothing.
 *
 * THE DISAGREEMENT IS STRUCTURAL, not a bug in either: a greedy per-pick rule
 * and a global assignment will differ whenever waiting is cheap.
 *
 * ── WHY MEASURE RATHER THAN FIX ────────────────────────────────────────────
 *
 * SLOT-AWARE VONA HAS ALREADY FAILED THREE TIMES (c662ad4, with the numbers):
 *   1. a multiplicative crush on a SIGNED quantity moves negatives UP
 *      (0.10 x -30 = -3), floating bench players above startable ones;
 *   2. crushing only the upside still fails, because QB/TE raw magnitudes are
 *      the largest on the board;
 *   3. bench = 0 COLLAPSES the board — 1331 of 1686 players share exactly
 *      VONA 0 and quarterbacks win the arbitrary tie.
 *
 * A fourth attempt with no cost estimate would be the constitutional rule
 * firing: the change that resolves the symptom is the one most likely to ship
 * unverified. So this asks the prior question — IS THE GREEDY LINE ACTUALLY
 * WORSE, and by how much? If the answer is "a few points" it belongs with the
 * other sub-noise findings, not in the scoring path nine days out.
 *
 * ── HOW BOTH LINES ARE SCORED ──────────────────────────────────────────────
 *
 * By the SAME function, lineup_value.bestLineup, which fills the league's real
 * seats optimally from a roster. Scoring each by its own model's objective is
 * how the tight-end count became a grading standard: a symptom each attempt
 * could move without improving anything.
 *
 * Run: node draft/tools/greedy_vs_plan.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
global.document = { getElementById: () => null, querySelector: () => null, addEventListener: () => {} };

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const LV = require(path.join(ROOT, 'draft', 'tools', 'lineup_value.js'));
const PLAN = require(path.join(ROOT, 'draft', 'tools', 'draft_plan.js'));

const pool = DATA.players.filter(p => p.position && (p.proj_mean || 0) > 0);
const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));
const byAdp = pool.slice().sort((a, b) => adpOf(a) - adpOf(b));
const SCHED = PLAN.SCHED;
const keep = PLAN.keep;

/* ── THE ENGINE'S LINE, driven with the ctx app.js actually builds ───────── */
function driveEngine() {
  const taken = new Set(keep.map(k => String(k.player_id)));
  const roster = keep.map(k => Object.assign({}, k, { is_keeper: true }));
  const picks = [];
  SCHED.forEach((pk, i) => {
    let need = (pk - 1) - (taken.size - keep.length);
    for (let j = 0; j < byAdp.length && need > 0; j++) {
      const p = byAdp[j];
      if (taken.has(String(p.player_id))) continue;
      taken.add(String(p.player_id)); need--;
    }
    const board = pool.filter(p => !taken.has(String(p.player_id)));
    const out = E.recommend({
      board, roster, nextPick: SCHED[i + 1] || null, currentPick: pk, pick: pk,
      round: Math.ceil(pk / (DATA.league.teams || 10)),
      myPicksLeft: SCHED.length - i, myPickIndex: i, totalMyPicks: SCHED.length,
      totalPicks: 150, league: DATA.league,
      weights: E.MEASURED_WEIGHTS || E.DEFAULT_WEIGHTS,
      currentKeepers: roster.filter(p => p.is_keeper),
      ceilingAllStages: false, doctrine: null, drift: null,
      intervening: (SCHED[i + 1] || pk) - pk,
    });
    const list = Array.isArray(out) ? out : (out && out.scored) || [];
    const top = list[0];
    if (!top || !top.player) return;
    taken.add(String(top.player.player_id));
    roster.push(Object.assign({}, top.player));
    picks.push({ pick: pk, p: top.player });
  });
  return { picks, roster };
}

console.log('GREEDY (the engine) vs GLOBAL (draft_plan) — scored by ONE function\n');

const eng = driveEngine();
const planRoster = keep.map(k => Object.assign({}, k, { is_keeper: true }))
  .concat(PLAN.plan.filter(x => x.p).map(x => Object.assign({}, x.p)));

console.log('  pick   engine takes                     draft_plan takes');
console.log('  ' + '-'.repeat(70));
SCHED.forEach((pk, i) => {
  const e = eng.picks.find(x => x.pick === pk);
  const pl = PLAN.plan[i];
  const es = e ? e.p.position + ' ' + e.p.name : '—';
  const ps = pl && pl.p ? pl.p.position + ' ' + pl.p.name : 'UNPRICED';
  console.log('  ' + String(pk).padStart(4) + '   ' + es.padEnd(32) + ps
    + (es !== ps ? '' : '   (same)'));
});

/* ── THE COMPARISON THAT DECIDES IT ────────────────────────────────────────
 * One scoring function, applied to both rosters. Anything else is grading each
 * model by its own objective. */
const a = LV.bestLineup(eng.roster, DATA);
const b = LV.bestLineup(planRoster, DATA);
console.log('\n  BEST LEGAL STARTING LINEUP FROM EACH ROSTER (lineup_value.bestLineup)');
console.log('    engine (greedy)      ' + (a && a.total != null ? a.total.toFixed(1) : '?'));
console.log('    draft_plan (global)  ' + (b && b.total != null ? b.total.toFixed(1) : '?'));
if (a && b && a.total != null && b.total != null) {
  const d = b.total - a.total;
  console.log('    difference           ' + (d >= 0 ? '+' : '') + d.toFixed(1)
    + '  in favour of ' + (d >= 0 ? 'draft_plan' : 'the engine'));
  console.log('\n  AGAINST WHAT SCALE:');
  console.log('    sd of ONE running back\'s season projection   ~79 pts');
  console.log('    tiebreak frontier across all 15 picks         42 pts');
  console.log('    MODEL over MARKET, whole draft               148.1 pts');
  console.log('    cost of forcing QB1 and TE1 (roster_shape)    19.8 pts');
  console.log('\n    A difference smaller than one player\'s projection sd is not a');
  console.log('    mandate to change live scoring nine days out. A difference on the');
  console.log('    order of the MODEL-over-MARKET edge is.');
}

/* ── AND WHERE IT COMES FROM, so the number is not a black box ──────────── */
console.log('\n  WHERE THE DIFFERENCE SITS — starters only, by seat');
/* bestLineup returns {starters:[{slot,p}], bench, total, unfilled, benchPoints}
 * — my first version read `r.slots`, which does not exist, so this section
 * printed "no lineup" for BOTH rosters and looked like a shared failure rather
 * than my wrong field name. A section that reports nothing for every input is
 * indistinguishable from one that found nothing. */
[['engine', a], ['plan', b]].forEach(([label, r]) => {
  if (!r || !Array.isArray(r.starters)) { console.log('    ' + label + ': no lineup'); return; }
  console.log('    ' + label.padEnd(8) + r.starters.map(x =>
    x.slot + ' ' + (x.p && x.p.name ? x.p.name.split(' ').slice(-1)[0] : '—')
    + ' ' + (x.p && x.p.proj_mean != null ? Math.round(x.p.proj_mean) : '?')).join('  '));
  if (r.unfilled && r.unfilled.length) console.log('             UNFILLED: ' + r.unfilled.join(', '));
});
/* SEAT BY SEAT, so the 59.6 is attributable rather than asserted. */
if (a && b && Array.isArray(a.starters) && Array.isArray(b.starters)) {
  const bySlot = r => r.starters.reduce((m, x) => (m[x.slot] = (m[x.slot] || 0)
    + (x.p && x.p.proj_mean || 0), m), {});
  const A2 = bySlot(a), B2 = bySlot(b);
  console.log('\n    seat      engine    plan      delta');
  Object.keys(B2).sort().forEach(sl => {
    const d = (B2[sl] || 0) - (A2[sl] || 0);
    console.log('    ' + sl.padEnd(9) + (A2[sl] || 0).toFixed(0).padStart(6)
      + (B2[sl] || 0).toFixed(0).padStart(9) + (d >= 0 ? '  +' : '  ') + d.toFixed(0).padStart(5));
  });
}
console.log('\n  WHAT THIS DOES NOT SETTLE: both lines assume the room drafts in ADP');
console.log('  order. The engine is re-solved every pick against a real room and');
console.log('  draft_plan is not, so a static comparison flatters the plan. It also');
console.log('  ignores that the engine must answer in a second at a table while the');
console.log('  plan solves offline. This measures the SHAPE of the disagreement, not');
console.log('  which tool to trust on the 22nd.');
