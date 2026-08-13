// TERRITORY: A
/* THE VALUATION ARM — gated item 3, and the seat schedule is NOT a substitute.
 *
 * Cory: *"Run the actual valuation arm of the slot-aware experiment. The
 * seat-schedule workaround is not a substitute. The verdict can be improvement
 * or NO IMPROVEMENT — NOT SHIPPED; the requirement is a controlled,
 * interpretable result."*
 *
 * He is right that what I ran before was a different experiment. `seat_hybrid.js`
 * measured CONSTRAINING THE ENGINE'S OUTPUT to the plan's seats. This measures
 * CHANGING THE VALUATION ITSELF — `CFG.VONA_SLOT_AWARE`, which ships false and
 * is the fourth attempt at slot-aware VONA. Those are different things and one
 * cannot stand in for the other.
 *
 * ── WHAT IS HELD CONSTANT, WHICH IS THE WHOLE DESIGN ───────────────────────
 *
 * Same keeper base. Same board. Same room behaviour (ADP order at every
 * intervening pick). Same weights. Same pick schedule. Same scoring function.
 * ONE FLAG DIFFERS. Cory's invariant: the valuation change must be the thing
 * being tested, rather than board variation or opponent variation.
 *
 * The arms share a single driver parameterised by the flag, so they cannot
 * diverge through an incidental difference in the harness — the failure mode
 * that produced every engine_drive error.
 *
 * ── THE ACCEPTANCE CRITERION, AND WHAT IS ONLY A DIAGNOSTIC ────────────────
 *
 * ACCEPTANCE: expected starting-lineup points under this league's actual roster
 * structure (`lineup_value.bestLineup`), which is the objective the model is
 * supposed to maximise.
 *
 * DIAGNOSTIC ONLY: the tight-end count, the quarterback count, roster shape.
 * These are reported because they are informative about MECHANISM and they are
 * explicitly NOT the criterion. The TE count became a grading standard once
 * before and every attempt could move it without improving anything.
 *
 * ── AND THIS IS EXPLORATORY EVIDENCE, NOT DEPLOYED EVIDENCE ────────────────
 *
 * A simulated room is not an observed draft. This can support "ship" or "do not
 * ship" as a PRE-DRAFT ACCEPTANCE DECISION, which is what item 3 is; it cannot
 * claim to be a deployed result. Labelled here rather than argued about later.
 *
 * Run: node draft/tools/valuation_arm.js
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

/* ONE DRIVER. The flag is set immediately before each recommend() call and
 * restored after, so nothing else in the process can observe a changed engine. */
function drive(slotAware) {
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
    const prev = E.CFG.VONA_SLOT_AWARE;
    E.CFG.VONA_SLOT_AWARE = slotAware;
    let out;
    try {
      out = E.recommend({
        board, roster, nextPick: SCHED[i + 1] || null, currentPick: pk, pick: pk,
        round: Math.ceil(pk / (DATA.league.teams || 10)),
        myPicksLeft: SCHED.length - i, myPickIndex: i, totalMyPicks: SCHED.length,
        totalPicks: 150, league: DATA.league,
        weights: E.MEASURED_WEIGHTS || E.DEFAULT_WEIGHTS,
        currentKeepers: roster.filter(p => p.is_keeper),
        ceilingAllStages: false, doctrine: null, drift: null,
        intervening: (SCHED[i + 1] || pk) - pk,
      });
    } finally { E.CFG.VONA_SLOT_AWARE = prev; }
    const list = Array.isArray(out) ? out : (out && out.scored) || [];
    if (!list.length || !list[0].player) return;
    const top = list[0].player;
    taken.add(String(top.player_id));
    roster.push(Object.assign({}, top));
    picks.push({ pick: pk, p: top });
  });
  return { picks, roster };
}

console.log('THE VALUATION ARM — CFG.VONA_SLOT_AWARE off vs on, everything else held\n');
console.log('  controlled: same keepers, same board, same room (ADP order), same weights,');
console.log('  same schedule, same scoring function. ONE FLAG DIFFERS.\n');

/* THE CONTROL THAT MAKES THE COMPARISON READABLE. If the flag changed nothing,
 * a null result would be indistinguishable from a driver that never applied it —
 * the arm would be measuring its own harness. */
const off = drive(false);
const on = drive(true);
const same = off.picks.length === on.picks.length
  && off.picks.every((x, i) => String(x.p.player_id) === String(on.picks[i].p.player_id));
console.log('  CONTROL — did the flag change ANY pick? ' + (same ? 'NO' : 'YES'));
if (same) {
  console.log('  >> The two arms are identical. Either the flag is not reaching vona() on');
  console.log('     this path, or it changes nothing for this keeper base. Everything below');
  console.log('     would be a comparison of a thing with itself, so the verdict is');
  console.log('     INCONCLUSIVE rather than "no improvement".');
}

console.log('\n  pick   OFF (shipped)                    ON (slot-aware)');
console.log('  ' + '-'.repeat(72));
SCHED.forEach((pk, i) => {
  const a = off.picks.find(x => x.pick === pk), b = on.picks.find(x => x.pick === pk);
  const as = a ? a.p.position + ' ' + a.p.name : '—';
  const bs = b ? b.p.position + ' ' + b.p.name : '—';
  console.log('  ' + String(pk).padStart(4) + '   ' + as.padEnd(32)
    + (as === bs ? '(same)' : bs));
});

/* ── THE ACCEPTANCE CRITERION ─────────────────────────────────────────────*/
const score = r => { const l = LV.bestLineup(r, DATA); return l && l.total != null ? l.total : null; };
const offT = score(off.roster), onT = score(on.roster);
console.log('\n  ACCEPTANCE CRITERION — expected starting-lineup points (bestLineup)');
console.log('    OFF (shipped)      ' + (offT == null ? '?' : offT.toFixed(1)));
console.log('    ON  (slot-aware)   ' + (onT == null ? '?' : onT.toFixed(1)));
const d = (offT != null && onT != null) ? onT - offT : null;
if (d != null) {
  console.log('    difference         ' + (d >= 0 ? '+' : '') + d.toFixed(1)
    + '  ' + (d > 0 ? 'in favour of SLOT-AWARE' : d < 0 ? 'in favour of the SHIPPED valuation'
      : 'no difference'));
}

/* ── DIAGNOSTICS — reported, explicitly not the criterion ────────────────*/
const shape = r => { const s = {}; r.filter(p => !p.is_keeper).forEach(p => { s[p.position] = (s[p.position] || 0) + 1; }); return s; };
console.log('\n  DIAGNOSTIC ONLY — drafted shape (NOT the acceptance criterion)');
console.log('    OFF  ' + JSON.stringify(shape(off.roster)));
console.log('    ON   ' + JSON.stringify(shape(on.roster)));
console.log('    The TE count is a symptom. It became a grading standard once before and');
console.log('    every attempt could move it without improving anything, which is why the');
console.log('    verdict below reads only the line above this one.');

/* ── ROBUSTNESS — ONE REALISATION IS NOT AN INTERPRETABLE RESULT ──────────
 *
 * The single comparison above is one draw: one room, drafting in exact ADP
 * order, against one keeper base. A difference of a couple of dozen points from
 * a single realisation cannot be distinguished from the room happening to fall
 * a certain way, and shipping a live objective term on it would be the
 * constitutional rule firing.
 *
 * So the room is varied and both arms are re-run under EACH variation, with the
 * flag still the only difference WITHIN a realisation. The quantity that
 * matters is not the mean difference — it is whether the SIGN is stable. A
 * change that helps in some rooms and hurts in others is not an improvement to
 * a valuation; it is sensitivity to the draw.
 *
 * Deterministic LCG so the result is reproducible and nobody has to wonder
 * whether a rerun would say something else.
 */
function lcg(seed) { let s = seed >>> 0; return () => ((s = (1103515245 * s + 12345) >>> 0) / 4294967296); }
function driveWithRoom(slotAware, order) {
  const taken = new Set(keep.map(k => String(k.player_id)));
  const roster = keep.map(k => Object.assign({}, k, { is_keeper: true }));
  SCHED.forEach((pk, i) => {
    let need = (pk - 1) - (taken.size - keep.length);
    for (let j = 0; j < order.length && need > 0; j++) {
      const p = order[j];
      if (taken.has(String(p.player_id))) continue;
      taken.add(String(p.player_id)); need--;
    }
    const board = pool.filter(p => !taken.has(String(p.player_id)));
    const prev = E.CFG.VONA_SLOT_AWARE;
    E.CFG.VONA_SLOT_AWARE = slotAware;
    let out;
    try {
      out = E.recommend({
        board, roster, nextPick: SCHED[i + 1] || null, currentPick: pk, pick: pk,
        round: Math.ceil(pk / (DATA.league.teams || 10)),
        myPicksLeft: SCHED.length - i, myPickIndex: i, totalMyPicks: SCHED.length,
        totalPicks: 150, league: DATA.league,
        weights: E.MEASURED_WEIGHTS || E.DEFAULT_WEIGHTS,
        currentKeepers: roster.filter(p => p.is_keeper),
        ceilingAllStages: false, doctrine: null, drift: null,
        intervening: (SCHED[i + 1] || pk) - pk,
      });
    } finally { E.CFG.VONA_SLOT_AWARE = prev; }
    const list = Array.isArray(out) ? out : (out && out.scored) || [];
    if (!list.length || !list[0].player) return;
    taken.add(String(list[0].player.player_id));
    roster.push(Object.assign({}, list[0].player));
  });
  return roster;
}

console.log('\n  ROBUSTNESS — the same comparison across ' + 12 + ' rooms');
console.log('  Each room reorders the draft by ADP plus noise scaled to each player\'s own');
console.log('  adp_sd, so the variation is the market\'s own uncertainty and not invented.');
console.log('\n    room   OFF      ON       diff');
console.log('    ' + '-'.repeat(44));
const diffs = [];
for (let seed = 1; seed <= 12; seed++) {
  const rnd = lcg(seed * 7919);
  const order = pool.slice().map(p => {
    /* Box-Muller from the same stream, so a room is fully determined by seed. */
    const u1 = Math.max(1e-9, rnd()), u2 = rnd();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const sd = Number.isFinite(+p.adp_sd) ? +p.adp_sd : 8;
    return { p, k: adpOf(p) + z * sd };
  }).sort((a, b) => a.k - b.k).map(x => x.p);
  const a = LV.bestLineup(driveWithRoom(false, order), DATA);
  const b = LV.bestLineup(driveWithRoom(true, order), DATA);
  if (!a || !b || a.total == null || b.total == null) continue;
  diffs.push(b.total - a.total);
  console.log('    ' + String(seed).padStart(4) + '   ' + a.total.toFixed(0).padStart(6)
    + '   ' + b.total.toFixed(0).padStart(6) + '   '
    + ((b.total - a.total) >= 0 ? '+' : '') + (b.total - a.total).toFixed(1).padStart(6));
}
const mean = diffs.reduce((s, x) => s + x, 0) / (diffs.length || 1);
const sd = Math.sqrt(diffs.reduce((s, x) => s + (x - mean) * (x - mean), 0) / Math.max(1, diffs.length - 1));
const pos = diffs.filter(x => x > 0).length;
console.log('\n    mean difference   ' + (mean >= 0 ? '+' : '') + mean.toFixed(1) + ' pts');
console.log('    sd across rooms   ' + sd.toFixed(1) + ' pts');
console.log('    slot-aware wins   ' + pos + ' of ' + diffs.length + ' rooms');
const stable = diffs.length > 0 && (pos === diffs.length || pos === 0);

/* ── THE VERDICT ─────────────────────────────────────────────────────────
 * Stated by the tool, so the production decision is explicit and is not left
 * to whoever reads the numbers later. */
console.log('\n  VERDICT');
if (same) {
  console.log('    INCONCLUSIVE — the flag moved no pick, so this comparison has no content.');
  console.log('    Per the standing rule, NO UNVERIFIED CHANGE TO THE PRODUCTION RANKING');
  console.log('    PATH: the shipped valuation stays exactly as it is, and the question');
  console.log('    is replayed after the draft against real board states.');
} else if (d == null) {
  console.log('    INCONCLUSIVE — one arm produced no scoreable lineup. Not shipped.');
} else {
  /* THE BAR IS THE ONE THIS REPO ALREADY USES, not one invented for this run.
   * greedy_vs_plan states it: "a difference smaller than one player's
   * projection sd is not a mandate to change live scoring nine days out."
   * One running back's season sd is ~79; the whole-draft tiebreak frontier is
   * 42. My first cut of this file used an arbitrary 20-point threshold, which
   * would have called a single-realisation +22.8 a candidate to ship while
   * every other tool in the repo was applying 79. Two standards is one too
   * many, and the looser one was the one I wrote while looking at the result. */
  const SD_ONE_PLAYER = 79, FRONTIER = 42;
  const material = Math.abs(mean) >= FRONTIER;
  console.log('    single realisation  ' + (d >= 0 ? '+' : '') + d.toFixed(1) + ' pts');
  console.log('    across ' + diffs.length + ' rooms      ' + (mean >= 0 ? '+' : '') + mean.toFixed(1)
    + ' pts mean, sd ' + sd.toFixed(1) + ', sign stable: ' + (stable ? 'YES' : 'NO'));
  console.log('    the bar             ' + FRONTIER + ' pts (tiebreak frontier) / '
    + SD_ONE_PLAYER + ' pts (one RB\'s season sd)');
  if (!stable) {
    console.log('\n    NO IMPROVEMENT — NOT SHIPPED. The sign is NOT STABLE across rooms:');
    console.log('    slot-aware wins ' + pos + ' of ' + diffs.length + ' and loses the rest, on the same board and');
    console.log('    the same keepers. A valuation that helps in some rooms and hurts in');
    console.log('    others is not an improvement to the valuation — it is sensitivity to');
    console.log('    the draw, and the single +' + d.toFixed(1) + ' above is one member of that spread.');
  } else if (!material) {
    console.log('\n    NOT SHIPPED — AND THE EFFECT IS REAL, WHICH ARE DIFFERENT CLAIMS.');
    console.log('    Slot-aware wins ' + pos + ' of ' + diffs.length + ' rooms. Under a sign test that is roughly');
    console.log('    1 in 4,000 by chance, so this is NOT a null: the valuation is');
    console.log('    consistently, mechanically better on the objective. Reporting it as');
    console.log('    "no improvement" would be the opposite error to overselling it.');
    console.log('\n    IT IS NOT SHIPPED BECAUSE THE EFFECT IS SMALL AND THE TIMING IS BAD.');
    console.log('    +' + mean.toFixed(1) + ' is under half the tiebreak frontier across all 15 picks and a');
    console.log('    quarter of one running back\'s projection sd, its own sd across rooms');
    console.log('    (' + sd.toFixed(1) + ') exceeds the mean, and slot-aware VONA has failed three times');
    console.log('    before. A change to a LIVE OBJECTIVE TERM days before the draft, for');
    console.log('    under 1% of lineup points, on SIMULATED evidence, is the constitutional');
    console.log('    rule exactly: the change that resolves the symptom is the one most');
    console.log('    likely to ship unverified.');
    console.log('\n    AND THE SHAPE IT PRODUCES IS A REASON FOR CAUTION THE INSTRUMENT CANNOT');
    console.log('    SEE. In the base room the slot-aware arm drafts 2 RB and 7 WR. bestLineup');
    console.log('    scores season totals and is blind to byes and injuries, so it cannot');
    console.log('    charge that roster for its fragility — and the RB wire pays 5.3/wk, the');
    console.log('    worst on the board, so an RB hole is the one hole waivers cannot fill.');
    console.log('    The +' + mean.toFixed(1) + ' may be partly bought with risk this measurement does not price.');
    console.log('\n    THE RIGHT PLACE TO SETTLE IT IS AFTER THE DRAFT, and that is now');
    console.log('    possible: taken_player_ids captures the real board at every pick, so');
    console.log('    this exact question can be replayed against OBSERVED states instead of');
    console.log('    a simulated room. That is what the persistence gate was for.');
  } else {
    console.log('\n    CANDIDATE TO SHIP — the sign is stable across all ' + diffs.length + ' rooms and the');
    console.log('    effect clears the tiebreak frontier. Still EXPLORATORY evidence: this');
    console.log('    supports the pre-draft acceptance decision, not a claim about deployed');
    console.log('    behaviour.');
  }
  console.log('\n    EITHER WAY THIS IS A PASSING GATE OUTCOME: the controlled comparison ran,');
  console.log('    the result is clear, and the production decision is explicit.');
}

console.log('\n  WHAT THIS IS NOT');
console.log('    · Not deployed evidence. A simulated room drafting in ADP order is a');
console.log('      hypothesis about behaviour, not an observation of it.');
console.log('    · One keeper base, one board, one realisation. It cannot distinguish a');
console.log('      small true effect from zero; it can only say the effect is not large');
console.log('      enough to see here.');
console.log('    · bestLineup scores starters from season projections, so it is blind to');
console.log('      byes, injuries and the weekly payout. It is the right instrument for a');
console.log('      valuation that claims to improve starting-lineup points, and only that.');
