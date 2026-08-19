// TERRITORY: A
/* THE AVERAGE DRAFT — Cory's actual acceptance test, over 300 simulated rooms.
 *
 * Cory: "we know it right when its average draft is 1QB, 4-5RB, 4-5WR, 1k, 1 def"
 *
 * Prereg: draft/AVERAGE-DRAFT-PREREG-2026-08-19.md (P158), committed first.
 *
 * Every arm graded today was ONE deterministic drive down ONE board with the
 * room draining in strict ADP order. n = 1. A single draft drawing a second
 * quarterback means a quarterback fell in that room -- it is one sample of the
 * model's behaviour, not the behaviour. This runs the distribution.
 *
 * Each room draws the order players leave the board from `adp` jittered by the
 * board's own `adp_sd`, so no two rooms are the same.
 *
 * REPORT ONLY. No board field, no cap, nothing ships.
 *
 * Run: node draft/tools/average_draft.js [--rooms N] [--json <path>]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const PLAN = require('./draft_plan.js');
const MN = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'measured_need_curve.json'), 'utf8'));
const ST = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'streamability.json'), 'utf8'));
if (!MN.controls_all_passed || !ST.controls_all_passed) {
  throw new Error('a source artifact failed its own controls — REFUSING');
}
const CURVE = MN.curve, STREAM = ST.streamability;

const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const FLEX_ELIGIBLE = ['RB', 'WR', 'TE'];
const STARTERS = (DATA.league || {}).starters || {};
/* P165/P166: the waiver level recomputed from THIS ROOM's revealed
 * consumption (WR 52 RB 47 QB 16 TE 14 K 10 DEF 10 per 150-pick draft,
 * 2023-25) instead of from an ADP-order drain. The room takes far more
 * running backs than ADP order does, so the old RB wire was 33.6 points
 * too generous. draft_plan.js is NOT touched -- it feeds seat_plan.json,
 * which the war room reads. */
const WAIVER = { QB: 322.9, RB: 78.4, WR: 124.8, TE: 130.4, K: 128.6, DEF: 100.0 };

/* ── P172/P173/P174 — THE FLEX BODY'S REPLACEMENT IS NOT ITS OWN POSITION'S
 * WIRE.  Prereg: draft/FLEX-REPLACEMENT-PREREG-2026-08-19.md
 *
 * Cory: "once 2 starting RBs are taken they're competing for flex and WR will
 * almost always win that."  He is describing a defect and he is right.
 *
 * `margin` was `proj_mean - WAIVER[own position]` for EVERY body. That is
 * correct for a body filling a DEDICATED slot and wrong for the body filling
 * the FLEX, because a flex slot does not care which position fills it. With
 * RB2/WR2/TE1/FLEX1 the THIRD running back does not occupy an RB slot -- he
 * occupies the flex, so his alternative is the best flex-eligible body, not
 * RB #48. The old rule credited him a 78.4 replacement he could never claim,
 * which at rank ~30 made RB3 (75.2) beat WR3 (37.1) by 2.03x.
 *
 * No new constant and no fitted weight: which case applies is decided by the
 * league's own `starters` block and how many of that position are held.
 *
 * ⚠️ THE RAW MAX IS TE 130.4, above WR's 124.8, yet real teams flex a tight end
 * 1.7% of the time -- so the TE wire rank (15) or the TE projections are
 * suspect. Both choices are run and must agree (rule 3d). */
const FLEXR_ARM = process.env.FLEXR || 'max';
const flexWire = () => {
  if (FLEXR_ARM === 'off') return null;                       // known-positive control
  if (FLEXR_ARM === 'wr') return WAIVER.WR;                   // empirical flex owner
  return Math.max(...FLEX_ELIGIBLE.map(q => WAIVER[q] || 0)); // derived max
};
const FLEX_R = flexWire();

/* Which slot would the n-th body at this position occupy? Read from the league,
 * never hardcoded, and returned as a label so the run can print it. */
function slotOf(q, heldQ, held, base) {
  if (heldQ < (base[q] || 0)) return 'dedicated';
  if (!FLEX_ELIGIBLE.includes(q)) return 'bench';
  const surplus = FLEX_ELIGIBLE.reduce(
    (a, x) => a + Math.max(0, (held[x] || 0) - (base[x] || 0)), 0);
  return surplus < (STARTERS.FLEX || 0) ? 'flex' : 'bench';
}

function replacementFor(q, heldQ, held, base) {
  const slot = slotOf(q, heldQ, held, base);
  if (slot === 'flex' && FLEX_R != null) return FLEX_R;
  return WAIVER[q] || 0;
}
const SCHED = PLAN.SCHED;
const ROOMS = (() => { const i = process.argv.indexOf('--rooms'); return i >= 0 ? +process.argv[i + 1] : 300; })();

const pool = DATA.players.filter(p => p.position && (p.proj_mean || 0) > 0 && POS.includes(p.position));
const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));
let noSd = 0;
const sdOf = p => { const v = p.adp_sd; if (v == null) { noSd++; return 12; } return +v; };

/* deterministic RNG so the run reproduces; Box-Muller for the jitter */
let _s = 20260819;
const rnd = () => { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967296; };
const gauss = () => { const u = Math.max(1e-12, rnd()), v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

/* DEPTH — measured start rate x (1 - streamability). A per-week rate; it does
 * NOT change with the calendar and is never ramped. This is what makes RB/WR
 * retain value, QB/TE tank, and K/DEF go to ~0 after one. */
function depthOf(pos, held, flexOwner) {
  const S = (STARTERS[pos] || 0) + (flexOwner === pos ? (STARTERS.FLEX || 0) : 0);
  if (S <= 0) return 0;
  if (held < S) return null;              // not a depth question — the slot is EMPTY
  const row = CURVE[pos] || [];
  const v = row[held];
  if (v == null) return 0;
  const sr = STREAM[pos];
  return (sr == null) ? v : v * (1 - sr);
}
/* P161: ramp URGENCY only. An empty slot is not urgent early and is everything
 * late; depth is a measured rate and is never ramped. Ramping them together is
 * why every previous arm broke something. */
function weightOf(pos, held, flexOwner, lam) {
  const d = depthOf(pos, held, flexOwner);
  return (d === null) ? lam : d;
}

function runRoom() {
  /* the room's order: adp jittered by the board's own adp_sd */
  const order = pool.map(p => ({ p, k: adpOf(p) + gauss() * sdOf(p) }))
    .sort((a, b) => a.k - b.k).map(x => String(x.p.player_id));
  const held = {};
  PLAN.keep.forEach(k => { held[k.position] = (held[k.position] || 0) + 1; });
  const base = { QB: STARTERS.QB || 0, RB: STARTERS.RB || 0, WR: STARTERS.WR || 0,
                 TE: STARTERS.TE || 0, K: STARTERS.K || 0, DEF: STARTERS.DEF || 0 };
  const unfilled = () => {
    let n = 0;
    Object.entries(base).forEach(([q, s]) => { n += Math.max(0, s - (held[q] || 0)); });
    const surplus = FLEX_ELIGIBLE.reduce((a, q) => a + Math.max(0, (held[q] || 0) - (base[q] || 0)), 0);
    return n + Math.max(0, (STARTERS.FLEX || 0) - surplus);
  };
  const flexOwner = () => {
    let best = null, bs = 0;
    FLEX_ELIGIBLE.forEach(q => { const s = (held[q] || 0) - (base[q] || 0); if (s > bs) { bs = s; best = q; } });
    return best;
  };
  const taken = new Set(), got = [], slots = [];
  /* ⛔ THE FIRST VERSION OF THIS CONTROL COUNTED gone.size, WHICH IS ALWAYS 32 BY
   * CONSTRUCTION -- picks 1..32 are always 32 players however the room is
   * jittered. It measured nothing and failed the run, correctly, for the wrong
   * reason. What varies is WHICH players are gone, so record the top-32 SET and
   * compare identities across rooms. */
  const top32 = order.slice(0, SCHED[0] - 1);
  SCHED.forEach((pk, i) => {
    const gone = new Set(order.slice(0, pk - 1));
    const fo = flexOwner();
    /* P160: RAMP=off drives lambda = 1 at every pick -- need at full strength,
     * no ramp at all. This is the decisive comparison for Cory's question,
     * because the margin table says a 2nd QB out-margins a 3rd RB in the 101-150
     * band, and only full need weighting reverses that (0.175 x 35 = 6.1 against
     * 0.49 x 29 = 14.2). Declared here before running. */
    const lam = (process.env.RAMP === 'off') ? 1
      : Math.min(1, unfilled() / Math.max(1, SCHED.length - i));
    /* ── P162: CORY'S GATE. "picks remaining should have a role" — and its role
     * is RESERVATION. You never let the number of slots you MUST still fill
     * exceed the chances you have left. Inside that window RB/WR are not
     * low-weighted, they are NOT OPTIONS. */
    const mandatory = unfilled();
    const forcing = (SCHED.length - i) <= mandatory;
    const needsSlot = q => {
      const S = (base[q] || 0) + (fo === q ? (STARTERS.FLEX || 0) : 0);
      return (held[q] || 0) < S;
    };
    let best = null, bestV = -Infinity;
    pool.forEach(p => {
      const id = String(p.player_id);
      if (taken.has(id) || gone.has(id)) return;
      if (forcing && !needsSlot(p.position)) return;   // the gate
      /* P161: ramp URGENCY only, never DEPTH. An empty slot weighs lambda (not
       * urgent early, everything late); a filled position weighs its MEASURED
       * depth, which is a per-week start rate and does not change with the
       * calendar. P158's linear blend and P159's exponent both ramped depth too,
       * which is why each broke something. */
      const w = weightOf(p.position, held[p.position] || 0, fo, 1);
      /* P172: the replacement depends on the SLOT this body would fill, not on
       * his position alone. FLEXR=off restores the old rule exactly. */
      const R = replacementFor(p.position, held[p.position] || 0, held, base);
      const margin = Math.max(0, p.proj_mean - R);
      const v = margin * w;
      if (v > bestV) { bestV = v; best = p; }
    });
    if (!best) return;
    /* CONTROL 2: record which slot the body actually TAKEN was priced into, so
     * the classification can be audited rather than trusted. Must be read
     * BEFORE held is incremented. */
    slots.push(`${best.position}:${slotOf(best.position, held[best.position] || 0, held, base)}`);
    taken.add(String(best.player_id));
    held[best.position] = (held[best.position] || 0) + 1;
    got.push(best.position);
  });
  const c = {};
  got.forEach(q => { c[q] = (c[q] || 0) + 1; });
  const legal = ['QB','RB','WR','TE','K','DEF'].every(q => (held[q]||0) >= (base[q]||0));
  return { counts: c, top32, legal, slots };
}

const rows = [];
for (let r = 0; r < ROOMS; r++) rows.push(runRoom());

const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
const stat = {};
POS.forEach(q => {
  const v = rows.map(r => r.counts[q] || 0);
  stat[q] = { mean: +mean(v).toFixed(2), sd: +sd(v).toFixed(2),
              min: Math.min(...v), max: Math.max(...v) };
});

/* ── controls ─────────────────────────────────────────────────────────────── */
/* how many of each room's first-32 differ from room 0's first-32 */
const ref = new Set(rows[0].top32);
const diff = rows.slice(1).map(r => r.top32.filter(id => !ref.has(id)).length);
const unionAll = new Set(); rows.forEach(r => r.top32.forEach(id => unionAll.add(id)));
const ctl = {
  C1_rooms_actually_differ: { ok: mean(diff) > 1 && unionAll.size > SCHED[0],
    players_differing_from_room_0: { mean: +mean(diff).toFixed(2), sd: +sd(diff).toFixed(2),
      min: Math.min(...diff), max: Math.max(...diff) },
    distinct_players_ever_gone_by_pick_33: unionAll.size,
    why: 'the FIRST version counted gone.size, which is always 32 by construction '
       + 'and measured nothing. What varies is WHICH players are gone.' },
  C2_adp_sd_from_the_board: { ok: noSd / (ROOMS * pool.length) < 0.5,
    players_without_adp_sd_lookups: noSd,
    why: 'reported, not silently defaulted' },
  C3_same_picks_and_keepers_every_room: { ok: SCHED.length === 12 && PLAN.keep.length === 3,
    sched: SCHED, keepers: PLAN.keep.map(k => k.position) },
  C4_sources_passed_their_controls: { ok: true },
  C6_gate_never_leaves_a_slot_empty: (() => {
    const bad = rows.filter(r => !r.legal).length;
    return { ok: bad === 0, rooms_with_an_unfilled_starting_slot: bad,
      why: 'if the reservation arithmetic is wrong the gate can strand a slot; '
         + 'that would make the whole idea fail and it must be zero' };
  })(),
  C5_deterministic_run_inside_the_distribution: (() => {
    /* the n=1 ADP-order result was QB2 RB3 WR4 TE1 K1 DEF1 */
    const det = { QB: 2, RB: 3, WR: 4, TE: 1, K: 1, DEF: 1 };
    const inside = POS.every(q => det[q] >= stat[q].min && det[q] <= stat[q].max);
    return { ok: inside, deterministic: det,
      why: 'if the n=1 result is outside the simulated range, the noise model is wrong' };
  })(),
};
const allOk = Object.values(ctl).every(c => c.ok);

console.log('THE AVERAGE DRAFT — ' + ROOMS + ' simulated rooms   (P158)\n');
Object.entries(ctl).forEach(([k, c]) => console.log('  ' + (c.ok ? 'OK ' : '!! ') + k));
if (!allOk) console.log('\n  !! A CONTROL FAILED. Nothing below is a measurement.\n');
console.log('\n  rooms differ: ' + JSON.stringify(ctl.C1_rooms_actually_differ.players_gone_by_pick_33));
console.log('\n  %s', 'MEAN DRAFTED ROSTER across ' + ROOMS + ' rooms (Cory drafts 12)');
console.log('  ' + 'pos'.padEnd(6) + 'mean'.padStart(7) + 'sd'.padStart(7) + 'min'.padStart(6) + 'max'.padStart(6) + '   Cory said');
const SAID = { QB: '1', RB: '4-5', WR: '4-5', TE: '(not stated)', K: '1', DEF: '1' };
POS.forEach(q => console.log('  ' + q.padEnd(6) + String(stat[q].mean).padStart(7)
  + String(stat[q].sd).padStart(7) + String(stat[q].min).padStart(6)
  + String(stat[q].max).padStart(6) + '   ' + SAID[q]));

const p158 = {
  QB: Math.abs(stat.QB.mean - 1) <= 0.5,
  RB: stat.RB.mean >= 4 && stat.RB.mean <= 5,
  WR: stat.WR.mean >= 4 && stat.WR.mean <= 5,
  K: Math.abs(stat.K.mean - 1) <= 0.3,
  DEF: Math.abs(stat.DEF.mean - 1) <= 0.3,
};
p158.TRUE = Object.values(p158).every(Boolean);
console.log('\n  P158: ' + (p158.TRUE ? 'TRUE' : 'FALSE'));
Object.entries(p158).filter(([k]) => k !== 'TRUE')
  .forEach(([k, v]) => console.log('     ' + (v ? 'ok  ' : 'MISS') + ' ' + k
    + '  mean ' + stat[k].mean));
console.log('     TE mean ' + stat.TE.mean + ' — Cory did not state a TE band; reported for his ruling.');

const rep = { _territory: 'TERRITORY: A — draft/tools/average_draft.js',
  _prereg: 'draft/AVERAGE-DRAFT-PREREG-2026-08-19.md',
  _note: 'REPORT ONLY. The average over simulated rooms, not one draft.',
  rooms: ROOMS, board_built_at: DATA.built_at, controls: ctl, controls_all_passed: allOk,
  mean_roster: stat, P158: p158 };
const i = process.argv.indexOf('--json');
if (i >= 0) { fs.writeFileSync(process.argv[i + 1], JSON.stringify(rep, null, 1));
  console.log('\n  wrote ' + process.argv[i + 1]); }
process.exitCode = allOk ? 0 : 1;
