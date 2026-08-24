// TERRITORY: E
/* P133 — THE TIER-RAMPED MEAN→CEILING BLEND, ON THE ONLY BOARD THAT CAN SEE IT.
 *
 * `TIER-RAMP-PREREG-2026-08-19.md` says grade this on the SEAT REPLAY. It
 * cannot be graded there, and the reason is a property of that instrument the
 * prereg did not check.
 *
 * The prereg's enabling claim is that we now have *"real cross-source
 * ceiling/floor, not a per-band constant."* That is true of the LIVE 2026
 * board and FALSE of the seat replay's bundles. `build_bundle.py`'s
 * `attach_dispersion` writes `proj_ceiling = proj_mean * p90_ratio(position,
 * rank-band)` and says so itself: *"the measured ceiling is still proj_mean x
 * a per-cell constant … cannot speak to whether an individual player is worth
 * taking for his upside."*
 *
 * MEASURED, as a paired control rather than read off that docstring — the same
 * 597 players, ratio `proj_ceiling / proj_mean`, within-cell sd/mean:
 *
 *     bundle-style ceilings   0.0000 in 12 of 12 cells   <- known negative
 *     live 2026 board         0.0804 mean, 0.0215-0.3260 <- the signal exists
 *
 * On a bundle, `effective_mean = proj_mean * m(pos, tier, band)` — constant
 * inside a cell, so the arm CANNOT reorder two players in the same cell. It can
 * only tilt between cells, and the p90 ratio's biggest swings are positional
 * (RB 1.66-1.86 against TE 33+ 1.14). A T1-minus-T0 delta there would be a
 * positional tilt wearing an upside argument's clothes. That is
 * `lab_ceiling_degeneracy.js`'s finding one step removed: not *"could not have
 * come out any other way"*, but *"will come out for a reason other than the one
 * being tested."*
 *
 * So this runs P133-b — THE MECHANISM HALF — where the mechanism is visible:
 * the live board, Cory's real twelve picks, T0 against T1.
 *
 * WHAT THIS IS NOT. It is one seat in one draft, so it cannot produce
 * P133-a's points/dollars figure and does not try to. It answers the question
 * P133-b actually asks — *does the rule change what gets taken, and in the
 * direction the prereg named* — and a NO here is decisive at n=1 in a way a
 * YES is not: a rule that moves nothing on the board built to show it has
 * failed regardless of sample size.
 *
 * REPORT ONLY. Ships no flag, writes no config, mutates no committed artifact.
 *
 * Run: node draft/tools/tier_ramp_probe.js [--json <path>]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

global.window = global;
global.document = { getElementById: () => null, querySelector: () => null,
                    addEventListener: () => {} };

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const ENGINE_PATH = path.join(ROOT, 'public', 'js', 'draft', 'engine.js');
const KEEP = require(path.join(__dirname, 'keepers_of.js'));

/* Cory's real schedule — REQUIRED FROM `draft_plan.js`, never re-derived here.
 * Rule 11: one derivation, reused. Register 95 is seven tools that each retyped
 * the same fifteen-pick literal, three picks of which Cory does not own; my
 * first draft of this file re-derived it from `pick_order` and got the shape
 * wrong on the first run, which is the same mistake wearing a different hat. */
const SCHED = require(path.join(__dirname, 'draft_plan.js')).SCHED;

/* ---- THE ARM, exactly as preregistered (§2-3) --------------------------- */
/* The four values are `autoWeights`'s own ceiling ramp — 0.45/0.60/0.80/0.50,
 * Cory's ruling — re-indexed off ROUND onto TIER DEPTH at the identical
 * proportional cutoffs 2/15, 6/15, 10/15. No value here was chosen by looking
 * at an outcome, and moving one after seeing a result is the fitting
 * `no_fit_guard` exists to prevent. */
const CUTS = [[0.13, 0.45], [0.40, 0.60], [0.67, 0.80], [Infinity, 0.50]];
function rampW(tierFrac) {
  for (let i = 0; i < CUTS.length; i++) if (tierFrac <= CUTS[i][0]) return CUTS[i][1];
  return CUTS[CUTS.length - 1][1];
}

function maxTierByPos(rows) {
  const m = {};
  rows.forEach(p => {
    const t = p.tier;
    if (p.position && typeof t === 'number') m[p.position] = Math.max(m[p.position] || 0, t);
  });
  return m;
}

/* T1's board. A DEEP COPY — register 58's class is a probe that writes into a
 * committed artifact as a side effect, and this file will not be the fourth. */
function tierRampBoard(rows) {
  const maxT = maxTierByPos(rows);
  /* replacement is taken from the board's OWN published identity
   * (vorp === proj_mean - replacement[pos]) and is NOT recomputed: the prereg
   * says the blend must never reach `replacement`, `adjusted_adp` or anything
   * computed pre-blend. Derived per player rather than read from a table so the
   * identity itself is the control — it must be constant within a position. */
  const repl = {}, seen = {};
  rows.forEach(p => {
    if (typeof p.vorp !== 'number' || typeof p.proj_mean !== 'number') return;
    const r = +(p.proj_mean - p.vorp).toFixed(2);
    (seen[p.position] = seen[p.position] || new Set()).add(r);
    repl[p.position] = r;
  });
  Object.keys(seen).forEach(pos => {
    if (seen[pos].size > 1) {
      throw new Error('board does not satisfy vorp = proj_mean - replacement at ' + pos
        + ' (' + seen[pos].size + ' distinct values) — refusing to ramp a board '
        + 'whose own identity does not hold');
    }
  });
  let ramped = 0, noCeiling = 0;
  const out = rows.map(p => {
    const q = Object.assign({}, p);
    const mt = maxT[q.position];
    if (!mt || typeof q.tier !== 'number' || typeof q.proj_mean !== 'number') return q;
    const w = rampW(q.tier / mt);
    /* Absent ceiling contributes a spread of ZERO, which is engine.js's own
     * reading of `(p.proj_ceiling || p.proj_mean) - p.proj_mean` and the honest
     * meaning of "no ceiling measurement for this player" — never a fallback
     * constant, which is how `1.35 * proj_mean` reached a board once. */
    const ceil = (typeof q.proj_ceiling === 'number') ? q.proj_ceiling : q.proj_mean;
    if (typeof q.proj_ceiling !== 'number') noCeiling++;
    const eff = (1 - w) * q.proj_mean + w * ceil;
    q._orig_proj_mean = q.proj_mean;
    q._ramp_w = w;
    q.proj_mean = +eff.toFixed(3);
    if (repl[q.position] != null) q.vorp = +(q.proj_mean - repl[q.position]).toFixed(2);
    if (q.proj_mean !== q._orig_proj_mean) ramped++;
    return q;
  });
  return { rows: out, ramped: ramped, no_ceiling: noCeiling, max_tier: maxT, replacement: repl };
}

function loadEngine() {
  delete require.cache[require.resolve(ENGINE_PATH)];
  const E = require(ENGINE_PATH);
  E.CFG.VONA_INCLUDE_SELF = true;
  E.CFG.VONA_SLOT_AWARE = false;
  return E;
}

const keep = KEEP.keepersFrom(DATA);
const basePool = DATA.players.filter(p => p.position && (p.proj_mean || 0) > 0);
const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));

/* `poolAt(pick)` rather than one pool, so the GATED arm can apply the ramp only
 * where the shipped ceiling term is live. The ADP drain always runs off the
 * BASE pool — the room's order is not the arm's to change. */
function walk(E, poolAt, weights) {
  const byAdp = basePool.slice().sort((a, b) => adpOf(a) - adpOf(b));
  const taken = new Set(keep.map(k => String(k.player_id)));
  const roster = keep.map(k => Object.assign({}, k, { is_keeper: true }));
  const picks = [];
  SCHED.forEach((pk, i) => {
    let need = (pk - 1) - (taken.size - keep.length);
    for (let j = 0; j < byAdp.length && need > 0; j++) {
      if (taken.has(String(byAdp[j].player_id))) continue;
      taken.add(String(byAdp[j].player_id)); need--;
    }
    const board = poolAt(pk).filter(p => !taken.has(String(p.player_id)));
    const ctx = {
      board: board, roster: roster, nextPick: SCHED[i + 1] || null,
      currentPick: pk, pick: pk, round: Math.ceil(pk / (DATA.league.teams || 10)),
      myPicksLeft: SCHED.length - i, myPickIndex: i, totalMyPicks: SCHED.length,
      totalPicks: 150, league: DATA.league, currentKeepers: keep,
      ceilingAllStages: false, doctrine: null, drift: null, intervening: 5,
      wireWeekly: DATA.wire_level || null, weights: weights,
    };
    const out = E.recommend(ctx);
    const list = Array.isArray(out) ? out : (out && out.scored) || [];
    const top = list[0];
    if (!top || !top.player) return;
    taken.add(String(top.player.player_id));
    roster.push(Object.assign({}, top.player));
    picks.push({ pick: pk, round: ctx.round, name: top.player.name,
                 position: top.player.position, tier: top.player.tier,
                 player_id: String(top.player.player_id) });
  });
  return picks;
}

function run() {
  const E = loadEngine();
  const fails = [];
  const pad = (x, n) => { x = String(x); return x + ' '.repeat(Math.max(0, n - x.length)); };
  const ok = (name, cond, detail) => {
    console.log('  ' + name + ' ' + pad(detail, 66) + (cond ? 'OK' : '*** FAILED ***'));
    if (!cond) fails.push(name);
  };

  console.log('CONTROLS');
  ok('C1', SCHED.length > 0 && SCHED.length <= 15,
     'schedule from draft_plan.js = ' + SCHED.length + ' picks: ' + SCHED.join(','));
  const T1 = tierRampBoard(basePool);
  ok('C2', T1.ramped > basePool.length * 0.9,
     T1.ramped + '/' + basePool.length + ' rows moved (no silent no-op arm)');
  ok('C3', T1.no_ceiling === 0,
     T1.no_ceiling + ' rows without proj_ceiling (those contribute zero spread)');
  const moved = basePool.filter((p, i) => T1.rows[i].proj_mean !== p.proj_mean).length;
  ok('C4', moved > 0, 'T1 board differs from T0 in ' + moved + ' rows');
  ok('C5', E.MEASURED_WEIGHTS.ceiling === 0,
     'shipped MEASURED_WEIGHTS.ceiling, read off engine.js = ' + E.MEASURED_WEIGHTS.ceiling);

  /* ---- C6, AND IT CAUGHT ME ------------------------------------------------
   * My first version of this control compared `ceiling: 0` against `ceiling:
   * 0.45` AT PICK 33 and got byte-identical scores at 0.0, 0.45 AND 5.0. I was
   * one step from filing "the ceiling weight is disconnected from the score" —
   * which would have said both of Cory's ceiling rulings were no-ops.
   *
   * `CFG.CEILING_LATE_FROM = 0.6`: the ceiling term is ZERO until 60% of the
   * draft by design. Pick 33 of 150 is 22%. The engine was right and the probe
   * was wrong, and the only reason I know that is that a null this clean is a
   * bug report until the probe has returned a positive (Rule 3e).
   *
   * So the control runs on BOTH sides of the gate: identical before it,
   * different after it. Either half failing means something moved. */
  const gateAt = Math.round((E.CFG.CEILING_LATE_FROM != null ? E.CFG.CEILING_LATE_FROM : 0.6) * 150);
  const probe = (w, pk) => {
    const ctx = { board: basePool, roster: keep.map(k => Object.assign({}, k, { is_keeper: true })),
      nextPick: pk + 5, currentPick: pk, pick: pk, round: Math.ceil(pk / 10), myPicksLeft: 3,
      myPickIndex: 9, totalMyPicks: 12, totalPicks: 150, league: DATA.league, currentKeepers: keep,
      ceilingAllStages: false, doctrine: null, drift: null, intervening: 5,
      wireWeekly: DATA.wire_level || null, weights: w };
    const out = E.recommend(ctx); const l = Array.isArray(out) ? out : (out && out.scored) || [];
    return l[0] ? l[0].score : null;
  };
  const c0 = w => Object.assign({}, E.MEASURED_WEIGHTS, { ceiling: w });
  ok('C6a', probe(c0(0), 33) === probe(c0(3), 33),
     'ceiling 0 vs 3 at pick 33 (before the pick-' + gateAt + ' gate) — identical');
  ok('C6b', probe(c0(0), 128) !== probe(c0(3), 128),
     'ceiling 0 vs 3 at pick 128 (after the gate) — differs, so the term is live');
  /* known-positive for ctx.weights itself, on a term with no stage gate */
  ok('C6c', probe(Object.assign({}, E.MEASURED_WEIGHTS, { need: 0 }), 33)
          !== probe(Object.assign({}, E.MEASURED_WEIGHTS, { need: 1 }), 33),
     'need 0 vs 1 at pick 33 — ctx.weights is read at all');

  if (fails.length) {
    console.log('\n*** ' + fails.length + ' control(s) failed — output void ***');
    process.exit(1);
  }

  /* T0 as preregistered is `ceiling: 0.45`; Cory ruled it to 0.0 on 2026-08-20,
   * so BOTH run. Substituting the live baseline for the preregistered one
   * silently is register 5h; running only the preregistered one answers a
   * question nobody is deciding. */
  const W0_PREREG = Object.assign({}, E.MEASURED_WEIGHTS, { ceiling: 0.45 });
  const W0_LIVE = Object.assign({}, E.MEASURED_WEIGHTS);
  const W1 = Object.assign({}, E.MEASURED_WEIGHTS, { ceiling: 0.0 });

  /* T1_GATED IS NOT IN THE PREREG AND THAT IS THE POINT. The prereg describes
   * the shipped mechanism as "a flat ceiling weight ramped by ROUND". It is
   * also switched OFF for the first 60% of the draft, which the prereg does not
   * mention — so T1 as specified changes TWO things at once: the axis
   * (round -> tier) and the late-only gate (present -> absent). That is the
   * combined arm this harness family refuses everywhere else. T1_gated holds
   * the gate and moves only the axis, which is the arm the prereg meant. */
  const base = () => basePool;
  const ramped = () => T1.rows;
  const gated = pk => (pk >= gateAt ? T1.rows : basePool);

  const arms = {
    T0_prereg: walk(loadEngine(), base, W0_PREREG),
    T0_live: walk(loadEngine(), base, W0_LIVE),
    T1: walk(loadEngine(), ramped, W1),
    T1_gated: walk(loadEngine(), gated, W1),
  };

  console.log('\nROSTERS — Cory\'s real ' + SCHED.length + ' picks, room drained in ADP order');
  Object.keys(arms).forEach(k => {
    const shape = {};
    arms[k].forEach(p => { shape[p.position] = (shape[p.position] || 0) + 1; });
    console.log('  ' + pad(k, 11) + JSON.stringify(shape));
    console.log('      ' + arms[k].map(p => p.position + (p.tier == null ? '' : p.tier)).join(' '));
  });

  console.log('\nP133-b — the preregistered mechanism: tier<=3 players taken after round 8');
  const SKILL = { QB: 1, RB: 1, WR: 1, TE: 1 };
  const counts = {}, skillCounts = {};
  Object.keys(arms).forEach(k => {
    counts[k] = arms[k].filter(p => p.tier != null && p.tier <= 3 && p.round > 8).length;
    skillCounts[k] = arms[k].filter(p => p.tier != null && p.tier <= 3 && p.round > 8
                                      && SKILL[p.position]).length;
    console.log('  ' + pad(k, 11) + 'as written: ' + counts[k]
      + '   skill positions only: ' + skillCounts[k]);
  });
  /* THE METRIC AS WRITTEN COUNTS KICKERS AND DEFENCES. Every arm's late tier<=3
   * rows are its K and its DEF, which have 8 and 6 tiers between them and reach
   * tier 3 by the third-best available. Reported BOTH ways, never substituted:
   * the preregistered number is the preregistered number. */

  /* ---- BASE RATE BEFORE SCORE ---------------------------------------------
   * P133-b's metric came back 0 for every arm INCLUDING both controls, and a
   * metric that has never returned a positive cannot distinguish "the arm did
   * not do it" from "nobody could have". So: was a tier<=3 skill player ever
   * on the board after round 8? */
  const late = SCHED.filter(pk => Math.ceil(pk / 10) > 8);
  const byAdpAll = basePool.slice().sort((a, b) => adpOf(a) - adpOf(b));
  const avail = late.map(pk => {
    const gone = new Set(keep.map(k => String(k.player_id)));
    for (let j = 0; j < byAdpAll.length && gone.size - keep.length < pk - 1; j++) {
      gone.add(String(byAdpAll[j].player_id));
    }
    return basePool.filter(p => !gone.has(String(p.player_id)) && SKILL[p.position]
                             && p.tier != null && p.tier <= 3).length;
  });
  console.log('\nBASE RATE — tier<=3 SKILL players still on the board at each late pick');
  console.log('  ' + late.map((pk, i) => pk + ':' + avail[i]).join('  ')
    + (avail.every(n => n === 0)
       ? '   <- ZERO EVERYWHERE: the metric could not have fired for any arm'
       : '   <- the metric was live'));

  /* WHICH WAY DOES THE RAMP ACTUALLY PUSH? tier_frac, not raw tier — WR runs to
   * 38 tiers and QB to 9, so a raw mean would just count positions. */
  console.log('\nDIRECTION — mean tier_frac of the SKILL picks (0 = elite, 1 = deepest)');
  Object.keys(arms).forEach(k => {
    const v = arms[k].filter(p => SKILL[p.position] && p.tier != null)
      .map(p => p.tier / T1.max_tier[p.position]);
    const m = v.reduce((a, b) => a + b, 0) / (v.length || 1);
    console.log('  ' + pad(k, 11) + m.toFixed(3) + '   (n=' + v.length + ')');
  });

  console.log('\nOVERLAP — picks identical to each baseline (of ' + SCHED.length + ')');
  const idset = k => new Set(arms[k].map(p => p.player_id));
  ['T1', 'T1_gated'].forEach(t => {
    ['T0_prereg', 'T0_live'].forEach(b => {
      const s0 = idset(b), s1 = idset(t);
      let same = 0; s1.forEach(x => { if (s0.has(x)) same++; });
      console.log('  ' + pad(t, 11) + 'vs ' + pad(b, 11) + same + ' identical');
    });
  });

  const report = {
    _territory: 'E',
    _note: 'REPORT ONLY. One seat, one draft — answers P133-b (mechanism), never '
      + 'P133-a (points). Room drained in strict ADP order.',
    generated_from: 'public/draft_data.json', schedule: SCHED, ramp_cuts: CUTS,
    ceiling_gate_pick: gateAt, max_tier: T1.max_tier, replacement_used: T1.replacement,
    rows_ramped: T1.ramped, rows_without_ceiling: T1.no_ceiling, arms: arms,
    p133b_tier3_after_round8: counts, p133b_skill_positions_only: skillCounts,
  };
  const j = process.argv.indexOf('--json');
  if (j >= 0 && process.argv[j + 1]) {
    fs.writeFileSync(process.argv[j + 1], JSON.stringify(report, null, 1));
    console.log('\nwrote ' + process.argv[j + 1]);
  }
}

if (require.main === module) run();
module.exports = { rampW, tierRampBoard, CUTS };
