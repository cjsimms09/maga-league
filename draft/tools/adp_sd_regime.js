// TERRITORY: A
/* WHAT `adp_sd` ACTUALLY CONTAINS — C's finding, verified, and one thing C missed.
 *
 * C routed to A: on the draftable board (ADP <= 150), `adp_sd` is a deterministic
 * function of `adp` for 142 of 145 players, so the field carries no independent
 * information where it matters. That is CORRECT and this reproduces it.
 *
 * ── I GOT IT WRONG THE FIRST TIME, WHICH IS WHY THIS IS A TOOL ─────────────
 *
 * My first pass compared `adp_sd` against `adjusted_adp` and got 66/150 matching,
 * with ZERO players in the sloped regime — an impossible shape, since the slope
 * covers ADP 20-100 and most of the board lives there. The impossible number is
 * what caught it. `adp_sd` is computed from `raw_adp`; the survival model consumes
 * `adjusted_adp`. Against the right field it is 147/150 and C's count of 3
 * published stdevs is exact.
 *
 * ── AND THAT MISMATCH IS ITSELF THE FINDING ────────────────────────────────
 *
 * The dispersion is pegged to the PRE-KEEPER ADP while everything downstream uses
 * the POST-KEEPER ADP. Keepers remove players from the pool, so every adjusted_adp
 * is EARLIER than its raw (all 150, no exceptions). The sd therefore describes a
 * player who no longer exists on this board, and it is uniformly too wide.
 *
 * Direction matters more than size here. survival.js's own header states the
 * failure mode: "Overwide sd flattens every survival curve, which compresses VONA
 * differences and makes the tool systematically UNDER-react to real positional
 * cliffs — the exact failure it exists to prevent." This is that, at ~10%.
 *
 * ── WHY THIS IS NOT A PRE-DRAFT FIX ────────────────────────────────────────
 *
 * The constant it perturbs is admitted in its own comment to be uncalibrated — "a
 * less-wrong constant, and it is labelled as such rather than presented as
 * calibrated". A 10% error in the argument to a placeholder is not the largest
 * error in that number; the placeholder is. Changing survival inputs nine days
 * before a draft to chase a 10% shift in an uncalibrated constant is the
 * constitutional rule in one move. RECORDED, NOT SHIPPED. It grades with the rest
 * of the survival calibration.
 *
 * Run: node draft/tools/adp_sd_regime.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));

/* Parsed from survival.js rather than retyped, so this tool cannot drift away
 * from the shipped constants without going loud. The parity test for keepers.py
 * does the same thing for the same reason. */
const SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'survival.js'), 'utf8');
const konst = k => {
  const m = SRC.match(new RegExp(k + ':\\s*([\\d.]+)'));
  if (!m) throw new Error('could not parse ' + k + ' from survival.js');
  return parseFloat(m[1]);
};
const FLOOR = konst('ADP_SD_FLOOR'), RATE = konst('ADP_SD_RATE'), CAP = konst('ADP_SD_CAP');
const sdOf = a => Math.max(FLOOR, Math.min(RATE * a, CAP));

const adj = p => (p.adjusted_adp != null ? +p.adjusted_adp : null);
const raw = p => (p.raw_adp != null ? +p.raw_adp : null);
const board = (DATA.players || []).filter(p => {
  const a = adj(p) != null ? adj(p) : raw(p);
  return a != null && a <= 150 && p.adp_sd != null;
});

console.log('ADP_SD REGIME — is the dispersion a measurement or a restatement of the mean?\n');
console.log('  constants parsed from survival.js: floor ' + FLOOR
  + ', rate ' + RATE + ', cap ' + CAP);
console.log('  the floor binds below ADP ' + (FLOOR / RATE).toFixed(0)
  + '; the cap binds above ADP ' + (CAP / RATE).toFixed(0));
console.log('  draftable board (ADP <= 150) with an adp_sd: n=' + board.length + '\n');

/* ── 1. WHICH ADP IS IT A FUNCTION OF? ─────────────────────────────────────
 * Both, tested. Reporting only the one that matches would hide the mismatch
 * that is the actual finding. */
console.log('  1. WHICH FIELD DOES adp_sd FOLLOW?');
[['adjusted_adp (what survival CONSUMES)', adj], ['raw_adp      (what it is BUILT from)', raw]]
  .forEach(([label, get]) => {
    let hit = 0, n = 0;
    board.forEach(p => { const a = get(p); if (a == null) return; n++;
      if (Math.abs(+p.adp_sd - sdOf(a)) <= 0.005) hit++; });
    console.log('     ' + label + ': ' + String(hit).padStart(3) + '/' + n
      + '  (' + (100 * hit / n).toFixed(1) + '%)');
  });
console.log('\n     THE FIELD IT FOLLOWS IS NOT THE FIELD IT IS USED WITH. That is the');
console.log('     mismatch: dispersion pegged to the pre-keeper ADP, consumed against the');
console.log('     post-keeper one.');

/* ── 2. THE REGIMES — where the field is CONSTANT, not merely determined ───
 * A clamped value is worse than a determined one: at the clamp the field does
 * not even vary with the mean, so it cannot distinguish any two players. */
console.log('\n  2. THE THREE REGIMES, AGAINST raw_adp');
let floorN = 0, capN = 0, slopeN = 0, other = 0;
board.forEach(p => {
  const a = raw(p); if (a == null) { other++; return; }
  const s = sdOf(a);
  if (Math.abs(+p.adp_sd - s) > 0.005) { other++; return; }
  if (Math.abs(s - FLOOR) < 1e-9) floorN++;
  else if (Math.abs(s - CAP) < 1e-9) capN++;
  else slopeN++;
});
console.log('     pinned at the FLOOR (' + FLOOR.toFixed(1) + '): ' + String(floorN).padStart(3)
  + '   CONSTANT — cannot distinguish any two of these players');
console.log('     pinned at the CAP   (' + CAP.toFixed(1) + '): ' + String(capN).padStart(3)
  + '   CONSTANT — same');
console.log('     on the slope  (' + RATE + ' x adp): ' + String(slopeN).padStart(3)
  + '   determined by the mean, but at least varying');
console.log('     neither (a real published stdev): ' + String(other).padStart(3)
  + '   the only rows carrying independent information');
console.log('\n     ' + (floorN + capN) + ' of ' + board.length
  + ' sit at a clamp. For those the survival curve is a function of');
console.log('     (adp - targetPick) ALONE — two players at the same ADP get identical');
console.log('     curves no matter how differently the room actually treats them.');

/* ── 3. THE PART THAT TOUCHES AUGUST 22 ────────────────────────────────────
 * A board-wide percentage is not the question. The question is what the sd is
 * at the six picks that are actually being made. */
console.log('\n  3. AT MY OWN SEATS — the only place this can change a decision');
console.log('     seat   sd used   sd if built from the adp actually consumed   regime');
console.log('     ' + '-'.repeat(74));
/* The player the PLAN ACTUALLY TAKES at each seat — not whoever happens to sit
 * near that ADP. Matching by pick-number proximity and then labelling the result
 * with the seat's slot produced "TE, De'Von Achane", who is a running back: a
 * row that looks like evidence and is a join artifact. */
const byId = {};
board.forEach(p => { byId[String(p.player_id)] = p; });
let worst = 0;
require('./draft_plan.js').plan.filter(x => !x.bench && x.p).forEach(x => {
  const c = byId[String(x.p.player_id)];
  if (!c) { console.log('     ' + String(x.pick).padStart(4) + '  ' + x.slot
    + ' ' + x.p.name + ' — no adp_sd on the draftable board (ADP > 150)'); return; }
  const used = +c.adp_sd, right = adj(c) != null ? sdOf(adj(c)) : null;
  const gap = right == null ? 0 : 100 * (used - right) / right;
  if (gap > worst) worst = gap;
  const clamped = Math.abs(used - FLOOR) < 1e-9 || Math.abs(used - CAP) < 1e-9;
  console.log('     ' + String(x.pick).padStart(4) + '  ' + used.toFixed(2).padStart(7)
    + right.toFixed(2).padStart(12) + '   '
    + (clamped ? 'absorbed by the clamp' : '+' + gap.toFixed(1) + '% too wide').padStart(21)
    + '   ' + (Math.abs(used - FLOOR) < 1e-9 ? 'FLOOR'
      : Math.abs(used - CAP) < 1e-9 ? 'CAP' : 'slope')
    + '   (' + x.slot + ' ' + c.name + ')');
});
console.log('\n     Worst gap at a seat: ' + worst.toFixed(1) + '% too wide, and it appears');
console.log('     ONLY on the sloped seats. At the floor and the cap the clamp absorbs the');
console.log('     error entirely — the same clamp that destroys the signal also hides this');
console.log('     bug, which is why a whole-board R2 would never have found it.');
console.log('     Where it does show, the direction is one-sided: keepers pull every');
console.log('     adjusted_adp EARLIER than its raw, so the sd is never too narrow.');

console.log('\n  WHAT THIS DOES AND DOES NOT JUSTIFY');
console.log('     DOES: recording that the board has no per-player draft-uncertainty');
console.log('     signal at all below ADP 20 or above ADP 100, and that what signal it');
console.log('     has is keyed to the wrong ADP. Both are structural, not tuning.');
console.log('     DOES NOT: a change before August 22. The constant being perturbed says');
console.log('     in its own comment that it is uncalibrated and interim. A 10% error in');
console.log('     the input to a placeholder is not the biggest error in that number —');
console.log('     the placeholder is. Fixing the argument would make the curve LOOK more');
console.log('     principled without making it more correct, which is the worst outcome');
console.log('     available: it would retire the comment that currently tells the truth.');
