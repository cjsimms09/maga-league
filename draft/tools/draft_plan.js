// TERRITORY: A
/* THE WHOLE DRAFT, PRICED — all fifteen picks, not just the six seats.
 *
 * slot_schedule.js assigns the six remaining STARTING seats and says
 * "best available RB/WR" for the other nine, because a bench player was worth
 * nothing to it. That was honest but incomplete: the bench equation now gives
 * those nine picks a number.
 *
 *     starter value(p)  = his projection in that seat
 *     bench value(p)    = P(need at his position) x (his points - what is FREE)
 *
 * WAIVER REPLACEMENT, not draft replacement. VORP prices against the marginal
 * STARTER in a 10-team league; a bench player competes against WHAT YOU CAN GET
 * FOR NOTHING IN WEEK 6. Those are different numbers and only the second one is
 * relevant to a bench seat. Confirmed against this league's own behaviour --
 * 802 completed waiver adds, 2023-2025, DEF 100% of pool cycled, K 83%, WR 37%
 * (see waiver_supply.js).
 *
 * THE CONSEQUENCE THAT MATTERS: a bench K or DEF prices NEGATIVE, because the
 * best free kicker outscores the marginal starting kicker. The plan will never
 * spend a pick on one, and it did not have to be told.
 *
 * ── WHAT THIS IS NOT ────────────────────────────────────────────────────────
 *
 * A PLAN, NOT A POLICY. It assumes the room drafts in ADP order and must be
 * re-solved at every pick as the board deviates. It is risk-neutral: a run at a
 * position is reacted to, never anticipated.
 * P(need) is a flat per-position injury rate. Handcuffs are not modelled -- a
 * backup who inherits his starter's touches is worth far more than his own
 * projection says, and that needs a conditional projection nobody has.
 * Upside is not modelled either. weekly_sd is real on this board (237 distinct
 * ratios) but nothing here reads it yet.
 *
 * Run: node draft/tools/draft_plan.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const KEEP = require(path.join(ROOT, 'draft', 'tools', 'keepers_of.js'));

const pool = DATA.players.filter(p => p.position && (p.proj_mean || 0) > 0);
const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));
const byAdp = pool.slice().sort((a, b) => adpOf(a) - adpOf(b));
const keep = KEEP.keepersFrom(DATA);
const SCHED = [8, 13, 28, 33, 48, 53, 68, 73, 88, 93, 108, 113, 128, 133, 148];
const INJURY = { QB: 0.14, RB: 0.28, WR: 0.20, TE: 0.22, K: 0.04, DEF: 0.02 };
const ROSTERED = 180;                       // 10 teams x 18 spots

/* WAIVER REPLACEMENT LEVEL: the best man still unrostered when the draft ends. */
const drafted = new Set(byAdp.slice(0, ROSTERED).map(p => String(p.player_id)));
const WAIVER = {};
['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].forEach(pos => {
  const free = pool.filter(p => p.position === pos && !drafted.has(String(p.player_id)))
    .sort((a, b) => (b.proj_mean || 0) - (a.proj_mean || 0))[0];
  WAIVER[pos] = free ? free.proj_mean : 0;
});

const STARTERS = (DATA.league || {}).starters || {};
const FLEX_POS = ['RB', 'WR', 'TE'];
const held = {};
keep.forEach(k => { held[k.position] = (held[k.position] || 0) + 1; });
const open = [];
Object.keys(STARTERS).forEach(pos => {
  if (pos === 'FLEX') return;
  for (let i = 0; i < (STARTERS[pos] || 0) - (held[pos] || 0); i++) open.push({ slot: pos, elig: [pos] });
});
const flexUsed = FLEX_POS.reduce((n, p) => n + Math.max(0, (held[p] || 0) - (STARTERS[p] || 0)), 0);
for (let i = 0; i < Math.max(0, (STARTERS.FLEX || 0) - flexUsed); i++) open.push({ slot: 'FLEX', elig: FLEX_POS });

console.log('THE FULL DRAFT PLAN — all ' + SCHED.length + ' picks priced\n');
console.log('  keepers: ' + keep.map(k => k.name + ' (' + k.position + ')').join(', '));
console.log('  waiver replacement level (best man unrostered after ' + ROSTERED + ' spots):');
console.log('    ' + Object.keys(WAIVER).map(p => p + ' ' + WAIVER[p].toFixed(0)).join('   ') + '\n');

/* P(YOU NEED YOUR Nth BACKUP AT A POSITION) — AND IT COLLAPSES FAST.
 *
 * THE FIRST VERSION OF THIS PRICED EVERY BACKUP THE SAME and produced a plan
 * with TEN RUNNING BACKS, recommending D'Andre Swift at pick 48 AND pick 53.
 * Two bugs with one root: the bench arm priced each pick independently, so it
 * neither noticed it had already taken the man nor that a FIFTH backup running
 * back is not worth what the FIRST is.
 *
 * You need a backup only if a starter is out. You need a SECOND backup only if
 * TWO are out simultaneously. With S starters at a position each independently
 * unavailable with probability r:
 *
 *     P(need the Nth backup) = P(at least N of S are out)
 *
 * For RB with S=2 and r=0.28 that is 0.48, then 0.078, then ~0. THE THIRD
 * BACKUP RUNNING BACK IS WORTH ESSENTIALLY NOTHING, which is what the plan
 * should have said and did not. This is the 1181-identical-values pattern in a
 * new place: treating every member of a class as interchangeable. */
/* THE FLEX IS ONE SEAT AND IT BELONGS TO WHOEVER ACTUALLY FILLS IT.
 * The first cut added STARTERS.FLEX to RB *and* WR *and* TE, so a single flex
 * seat was counted three times -- implying 8 starters across RB/WR/TE where the
 * league has 6. That inflated P(need a backup) at every flex-eligible position,
 * most visibly at TE, and the plan drafted THREE TIGHT ENDS. `flexOwner` is set
 * from the seat assignment below, so the seat is credited exactly once. */
let flexOwner = null;
function pNeedNth(pos, n) {
  const S = (STARTERS[pos] || 0) + (flexOwner === pos ? (STARTERS.FLEX || 0) : 0);
  const r = INJURY[pos] || 0.15;
  if (S <= 0) return 0;
  let p = 0;                                  // P(at least n of S out), binomial
  for (let k = n; k <= S; k++) {
    let c = 1;
    for (let i = 0; i < k; i++) c = c * (S - i) / (i + 1);
    p += c * Math.pow(r, k) * Math.pow(1 - r, S - k);
  }
  return p;
}
/* A BACKUP AT A RENTED POSITION IS WORTH ZERO, NOT EPSILON.
 *
 * waiver_supply.js measured, from 802 completed adds in this league: 100% of the
 * DEF pool and 83% of the K pool cycle every season. You can ALWAYS get one. So
 * holding a second is not slightly valuable, it is valueless -- the seat is
 * rented and the wire restocks it on demand.
 *
 * WITHOUT THIS THE PLAN DRAFTED THREE KICKERS. By the final picks every bench
 * value has decayed toward zero, and a backup kicker's 0.16 was the largest
 * number left. Not because a backup kicker is good, but because the model had
 * nothing better to say and a tie was broken arbitrarily -- the same degenerate
 * ordering that put Joe Flacco on a board earlier today. */
const RENTED = { K: true, DEF: true };
function benchValue(x, heldAtPos) {
  /* ANY rented position is worth zero in a BENCH seat -- the starter arrives via
   * the seat assignment, so anything reaching here is a backup by construction.
   * MY FIRST GUARD TESTED `heldAtPos >= STARTERS[pos]` AND NEVER FIRED, because
   * heldAtPos is already max(0, held - starters) and is therefore 0 exactly when
   * you hold the starter. A guard that cannot fire on the case it was written
   * for -- the fourth one of those today. */
  if (RENTED[x.position]) return 0;
  const gap = Math.max(0, (x.proj_mean || 0) - (WAIVER[x.position] || 0));
  return pNeedNth(x.position, heldAtPos + 1) * gap;
}

/* Best available at each pick, per seat. Bench value is state-dependent, so it
 * cannot be precomputed -- it is evaluated inside the search. */
const avail = SCHED.map(p => {
  const gone = new Set(byAdp.slice(0, p - 1).map(x => String(x.player_id)));
  return pool.filter(x => !gone.has(String(x.player_id)));
});
const seatVal = avail.map(av => open.map(o => {
  const b = av.filter(x => o.elig.indexOf(x.position) >= 0)
    .sort((m, n) => (n.proj_mean || 0) - (m.proj_mean || 0))[0];
  return b ? { v: b.proj_mean, p: b } : { v: 0, p: null };
}));

/* GREEDY FORWARD WITH THE SEAT PLAN FIXED. The seat assignment is still solved
 * exactly (it is the part that matters and it is a clean assignment problem);
 * the bench is then filled forward, because bench value depends on what you have
 * already taken and that breaks the independence a DP needs. Stated rather than
 * hidden: the seats are optimal, the bench is greedy. */
const N = SCHED.length, S = open.length, FULL = (1 << S) - 1;
const dp = Array.from({ length: N + 1 }, () => new Float64Array(1 << S).fill(-Infinity));
const pv = Array.from({ length: N + 1 }, () => new Int32Array(1 << S).fill(-2));
dp[0][0] = 0;
for (let i = 0; i < N; i++) for (let m = 0; m <= FULL; m++) {
  if (dp[i][m] === -Infinity) continue;
  if (dp[i][m] > dp[i + 1][m]) { dp[i + 1][m] = dp[i][m]; pv[i + 1][m] = -1; }
  for (let s = 0; s < S; s++) {
    if (m & (1 << s)) continue;
    const nm = m | (1 << s), nv = dp[i][m] + seatVal[i][s].v;
    if (nv > dp[i + 1][nm]) { dp[i + 1][nm] = nv; pv[i + 1][nm] = s; }
  }
}
const seatAt = {};
{ let m = FULL;
  for (let i = N; i > 0; i--) { const s = pv[i][m]; if (s >= 0) { seatAt[i - 1] = s; m ^= (1 << s); } } }

const plan = [];
const taken = new Set(keep.map(k => String(k.player_id)));
const heldPos = {};
keep.forEach(k => { heldPos[k.position] = (heldPos[k.position] || 0) + 1; });
for (let i = 0; i < N; i++) {
  const s = seatAt[i];
  if (s != null) {
    const b = avail[i].filter(x => open[s].elig.indexOf(x.position) >= 0
      && !taken.has(String(x.player_id)))
      .sort((m2, n2) => (n2.proj_mean || 0) - (m2.proj_mean || 0))[0];
    if (b) { taken.add(String(b.player_id)); heldPos[b.position] = (heldPos[b.position] || 0) + 1;
      if (open[s].slot === 'FLEX') flexOwner = b.position;
      plan.push({ pick: SCHED[i], slot: open[s].slot, p: b, v: b.proj_mean, bench: false }); continue; }
  }
  let best = { v: -Infinity, p: null };
  avail[i].forEach(x => {
    if (taken.has(String(x.player_id))) return;
    const starters = (STARTERS[x.position] || 0)
      + (flexOwner === x.position ? (STARTERS.FLEX || 0) : 0);
    const backups = Math.max(0, (heldPos[x.position] || 0) - starters);
    const v = benchValue(x, backups);
    if (v > best.v) best = { v, p: x };
  });
  /* A ZERO IS NOT A RECOMMENDATION. Once every remaining option prices at 0 the
   * model has nothing to say, and picking the arbitrary winner of that tie is
   * how a backup kicker ends up on the sheet. Say UNPRICED instead: these are
   * free options and they should go to upside -- rookies, young breakouts --
   * which this model cannot value because nothing here reads weekly_sd yet. */
  if (best.v <= 1e-9) {
    plan.push({ pick: SCHED[i], slot: 'bench', p: null, v: 0, bench: true, unpriced: true });
    continue;
  }
  taken.add(String(best.p.player_id));
  heldPos[best.p.position] = (heldPos[best.p.position] || 0) + 1;
  plan.push({ pick: SCHED[i], slot: 'bench', p: best.p, v: best.v, bench: true });
}
console.log('  pick   role     take                        value');
plan.forEach(x => console.log('  ' + String(x.pick).padStart(4) + '   ' + x.slot.padEnd(8)
  + ((x.p ? x.p.position + ' ' + x.p.name
      : 'UNPRICED — free option, take upside')).padEnd(38)
  + (x.unpriced ? '' : x.v.toFixed(1).padStart(7))));
const by = {};
plan.forEach(x => { if (x.p) by[x.p.position] = (by[x.p.position] || 0) + 1; });
console.log('\n  drafted roster: ' + JSON.stringify(by));
console.log('  total value ' + plan.reduce((a,x)=>a+x.v,0).toFixed(1)
  + '  (starters at full projection, bench at insurance value)');
const kd = plan.filter(x => x.p && ['K', 'DEF'].includes(x.p.position) && x.bench).length;
const un = plan.filter(x => x.unpriced).length;
console.log('  bench kickers/defences taken: ' + kd + '  — the plan was never told not to');
console.log('  picks this model CANNOT price: ' + un
  + '  — free options; upside belongs here and is not modelled');
