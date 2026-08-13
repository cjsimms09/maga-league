// TERRITORY: A
/* WHEN IS THE OPPORTUNE MOMENT FOR A QB OR A TE? — the drop-off curves, measured.
 *
 * Cory: *"when to breakthrough for maybe picking a QB or TE due to drop off OR
 * lack of drop off in not selecting RB or WR... maybe early if the value is
 * there, maybe middle if value is there and WR or RB drop off isn't bad to next
 * round, maybe late if QB and TE are going above value and the WR and RBs are
 * too good to pass up."*
 *
 * That premise IS the equation. Written down:
 *
 *     D_p(t) = proj(best available p at pick t)
 *              - E[proj(best available p at my NEXT pick)]
 *
 * D_p is what waiting COSTS at position p. The opportune moment for a QB is the
 * pick where D_QB is large and D_RB, D_WR are small — you lose little by
 * deferring the backs and receivers, and a lot by deferring the quarterback.
 * Nothing about that is exotic; it is VONA, and it is what the engine already
 * computes.
 *
 * ── SO WHY IS THE ENGINE'S ANSWER WRONG AT PICK 8 ──────────────────────────
 *
 * Because D_p ALONE IS NOT THE VALUE OF THE PICK. It measures the drop at a
 * position without asking whether the player can START. A second quarterback in
 * a one-QB league has a large D and zero starting value: the drop is real and it
 * is a drop you never collect. That is precisely why the engine takes Josh Allen
 * at 8 and why draft_plan does not — and it is the whole 59.6.
 *
 * The corrected quantity is the drop AT THE SLOT HE WOULD FILL:
 *
 *     D*_p(t) = D_p(t)  if he fills an EMPTY starting slot (or the flex)
 *             = 0       if he does not start
 *
 * Both are printed below, side by side, because the DIFFERENCE between them is
 * the answer to Cory's question and neither number alone is.
 *
 * ── WHAT THIS IS NOT ───────────────────────────────────────────────────────
 *
 * A simulated room drafting near ADP, not an observed draft. It answers "when
 * SHOULD the moment arrive" on this board; it cannot promise the room will
 * cooperate, and the whole point of a drop-off table is that it moves when the
 * room deviates.
 *
 * Run: node draft/tools/position_dropoff.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const PLAN = require('./draft_plan.js');

const num = v => (Number.isFinite(+v) ? +v : null);
const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));
const pool = PLAN.pool.filter(p => num(p.proj_mean) != null);
const byAdp = pool.slice().sort((a, b) => adpOf(a) - adpOf(b));
const SCHED = PLAN.SCHED;
const keep = PLAN.keep;
const POS = ['QB', 'RB', 'WR', 'TE'];

/* THE LEAGUE'S ACTUAL STARTING SLOTS — the whole correction depends on these
 * being the real ones and not a guess. */
const STARTERS = ((DATA.league || {}).starters) || {};
const need = {};
POS.forEach(p => { need[p] = STARTERS[p] || 0; });
const FLEX = (STARTERS.FLEX || 0) + (STARTERS['W/R/T'] || 0) + (STARTERS.WRT || 0);

console.log('POSITION DROP-OFF — when the moment for a QB or a TE actually arrives\n');
console.log('  starting slots: ' + JSON.stringify(need) + '  flex: ' + FLEX);
console.log('  D  = what WAITING costs at a position (best now - best at my next pick)');
console.log('  D* = the same drop, but ZERO if he would not START — a second QB has a');
console.log('       large D and no slot, so the drop is real and never collected.\n');

/* Walk the draft in ADP order, holding the roster the PLAN builds, so the slot
 * accounting reflects a real roster rather than an empty one. */
const held = {};
keep.forEach(k => { held[k.position] = (held[k.position] || 0) + 1; });
const taken = new Set(keep.map(k => String(k.player_id)));

console.log('  pick  ' + POS.map(p => (p + '     D    D*').padEnd(16)).join('') + ' the moment');
console.log('  ' + '-'.repeat(92));

const moments = [];
SCHED.forEach((pk, i) => {
  // advance the room to this pick
  let advance = (pk - 1) - (taken.size - keep.length);
  for (let j = 0; j < byAdp.length && advance > 0; j++) {
    const p = byAdp[j];
    if (taken.has(String(p.player_id))) continue;
    taken.add(String(p.player_id)); advance--;
  }
  const nextPick = SCHED[i + 1];
  const avail = pool.filter(p => !taken.has(String(p.player_id)));
  const bestNow = {}, bestNext = {}, D = {}, Dstar = {};

  POS.forEach(pos => {
    const at = avail.filter(p => p.position === pos)
      .sort((a, b) => num(b.proj_mean) - num(a.proj_mean));
    bestNow[pos] = at.length ? num(at[0].proj_mean) : 0;
    if (nextPick == null) { bestNext[pos] = bestNow[pos]; D[pos] = 0; Dstar[pos] = 0; return; }
    /* Who survives to my next pick, under the same ADP-order assumption the
     * plan makes. Simple and stated rather than a survival model, because a
     * probabilistic version here would be a second, disagreeing estimate of
     * something survival.js already owns. */
    const goneBy = new Set(taken);
    let k2 = (nextPick - pk);
    for (let j = 0; j < byAdp.length && k2 > 0; j++) {
      const p = byAdp[j];
      if (goneBy.has(String(p.player_id))) continue;
      goneBy.add(String(p.player_id)); k2--;
    }
    const later = pool.filter(p => !goneBy.has(String(p.player_id)) && p.position === pos)
      .sort((a, b) => num(b.proj_mean) - num(a.proj_mean));
    bestNext[pos] = later.length ? num(later[0].proj_mean) : 0;
    D[pos] = Math.max(0, bestNow[pos] - bestNext[pos]);

    /* THE CORRECTION. He collects the drop only if he takes a seat: an empty
     * dedicated slot, or the flex if RB/WR/TE and the flex is open. */
    const dedicatedOpen = (held[pos] || 0) < (need[pos] || 0);
    const flexOpen = FLEX > 0 && ['RB', 'WR', 'TE'].indexOf(pos) >= 0
      && (['RB', 'WR', 'TE'].reduce((n, q) =>
        n + Math.max(0, (held[q] || 0) - (need[q] || 0)), 0) < FLEX);
    Dstar[pos] = (dedicatedOpen || flexOpen) ? D[pos] : 0;
  });

  /* WHEN EVERY STARTING SLOT IS FULL, EVERY D* IS ZERO — and naming a "best"
   * position from a field of zeros is failed slot-aware attempt #3 exactly:
   * "bench = 0 COLLAPSES the board, 1331 players share VONA 0, and quarterbacks
   * win the arbitrary tie." My first cut printed "D*: QB" for eleven straight
   * picks for no reason but QB being first in the POS array. A tie at zero is
   * not a recommendation; it is the absence of one, and it has to say so. */
  const anySeat = POS.some(p => Dstar[p] > 0);
  const best = anySeat ? POS.slice().sort((a, b) => Dstar[b] - Dstar[a])[0] : null;
  const bestRaw = POS.slice().sort((a, b) => D[b] - D[a])[0];
  const planRow = PLAN.plan[i];
  moments.push({ pick: pk, D: Object.assign({}, D), Dstar: Object.assign({}, Dstar),
    best, bestRaw, planSlot: planRow ? (planRow.bench ? 'BENCH' : planRow.slot) : '?' });

  console.log('  ' + String(pk).padStart(4) + '  '
    + POS.map(p => (D[p].toFixed(0).padStart(6) + Dstar[p].toFixed(0).padStart(6) + '    ')).join('')
    + (best === null
      ? ' NO SEAT — every starting slot is filled; this is a bench pick and D*'
        + ' cannot rank it (use the wire-relative metric instead)'
      : ' D*: ' + best + (bestRaw !== best ? '   (raw D says ' + bestRaw + ')' : '')));

  // take the plan's player so the roster and its open slots stay real
  if (planRow && planRow.p) {
    taken.add(String(planRow.p.player_id));
    held[planRow.p.position] = (held[planRow.p.position] || 0) + 1;
  }
});

/* ── THE ANSWER TO THE QUESTION AS ASKED ─────────────────────────────────*/
console.log('\n  WHEN IS THE MOMENT FOR A QB?');
const qb = moments.filter(m => m.Dstar.QB > 0);
if (!qb.length) {
  console.log('    NEVER, on D* alone — and that is the finding, not a gap. Once the one');
  console.log('    QB slot is filled a second quarterback collects nothing, so the only');
  console.log('    pick where D*_QB can be positive is the one where the slot is still open.');
} else {
  qb.forEach(m => console.log('    pick ' + m.pick + ': D*_QB = ' + m.Dstar.QB.toFixed(0)
    + ', against RB ' + m.Dstar.RB.toFixed(0) + ' / WR ' + m.Dstar.WR.toFixed(0)
    + ' / TE ' + m.Dstar.TE.toFixed(0)
    + '  -> ' + (m.best === 'QB' ? 'TAKE THE QB' : 'still behind ' + m.best)));
}
console.log('\n  WHEN IS THE MOMENT FOR A TE?');
const te = moments.filter(m => m.Dstar.TE > 0);
te.slice(0, 6).forEach(m => console.log('    pick ' + m.pick + ': D*_TE = ' + m.Dstar.TE.toFixed(0)
  + ', against RB ' + m.Dstar.RB.toFixed(0) + ' / WR ' + m.Dstar.WR.toFixed(0)
  + '  -> ' + (m.best === 'TE' ? 'TAKE THE TE' : 'still behind ' + m.best)));

/* ── WHERE RAW D AND SLOT-AWARE D* DISAGREE — the 59.6, made visible ─────*/
/* Only picks with a live seat can disagree. A bench pick has no D* opinion at
 * all, so counting it as a disagreement would inflate the finding with rows
 * where one side simply declined to speak. */
const disagree = moments.filter(m => m.best !== null && m.best !== m.bestRaw);
console.log('\n  WHERE THE UNCORRECTED RULE WOULD SEND YOU SOMEWHERE ELSE');
console.log('    ' + disagree.length + ' of ' + moments.length + ' picks. These are exactly the picks where "biggest');
console.log('    drop-off" and "biggest drop-off I can actually collect" part company:');
disagree.forEach(m => console.log('      pick ' + String(m.pick).padStart(3)
  + '  raw D says ' + m.bestRaw + ' (' + m.D[m.bestRaw].toFixed(0) + ' pts)'
  + '   D* says ' + m.best + ' (' + m.Dstar[m.best].toFixed(0) + ' pts)'
  + '   plan seat: ' + m.planSlot));

console.log('\n  AND DOES D* AGREE WITH THE SEAT SCHEDULE?');
let agree = 0, seats = 0;
moments.forEach(m => {
  if (m.planSlot === 'BENCH' || m.planSlot === '?') return;
  seats++;
  const want = m.planSlot === 'FLEX' ? ['RB', 'WR', 'TE'] : [m.planSlot];
  if (m.best !== null && want.indexOf(m.best) >= 0) agree++;
});
console.log('    ' + agree + ' of ' + seats + ' starter seats. The seat schedule solves the whole');
console.log('    assignment at once and D* is greedy one pick at a time, so they are not');
console.log('    the same rule and perfect agreement would be suspicious rather than good.');

console.log('\n  WHAT THIS DOES NOT SETTLE');
console.log('    · A simulated room drafting near ADP. The drop-off table MOVES when the');
console.log('      room deviates — that is the point of it, and the reason it is a table');
console.log('      to re-read rather than a schedule to follow.');
console.log('    · D* is binary on the slot: it collects the full drop or nothing. A player');
console.log('      who UPGRADES a filled slot collects the difference, which this does not');
console.log('      price. That is the same hole slot-aware VONA is measured against and it');
console.log('      is why D* is a diagnostic here rather than a shipped scoring term.');
console.log('    · Drop-off says nothing about VARIANCE, byes, or the weekly payout.');
