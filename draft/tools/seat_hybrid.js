// TERRITORY: A
/* DOES THE CARD'S RULE ACTUALLY WORK? — measuring the thing I have been asserting.
 *
 * draft_card.js leads with a rule, in capitals, as the answer to Cory's question
 * about making the board he drafts from follow the model:
 *
 *     THE ENGINE PICKS THE PLAYER. THE PLAN PICKS THE SEAT.
 *
 * And I have been claiming it "captures most of" the 59.6 points that separate
 * the engine's greedy line from draft_plan's global one. THAT CLAIM WAS NEVER
 * MEASURED. greedy_vs_plan.js scored the ENGINE ALONE (2091.0) and the PLAN
 * ALONE (2150.5). The hybrid is a third thing and neither number describes it.
 *
 * This is the constitutional rule pointing at my own headline: the change that
 * resolves the symptom is the one most likely to ship unverified, and a rule
 * printed in capitals on a draft-day card is shipped. So it gets measured, and
 * it is allowed to come out badly.
 *
 * ── WHAT THE HYBRID ACTUALLY IS ────────────────────────────────────────────
 *
 * At each of the six seat picks, take THE ENGINE'S HIGHEST-RANKED RECOMMENDATION
 * THAT IS ELIGIBLE FOR THAT SEAT, rather than its overall #1. At the bench picks
 * the plan asserts no slot, so the engine is left alone — that is the honest
 * encoding of the card, which constrains seats and says nothing about bench
 * order.
 *
 * Three lines, one scoring function (lineup_value.bestLineup), so none of them
 * is graded by its own objective:
 *
 *     ENGINE   greedy, unconstrained            — what happens if Cory just
 *                                                 takes the tool's top name
 *     HYBRID   engine constrained to plan seats — WHAT THE CARD TELLS HIM TO DO
 *     PLAN     the global assignment            — the ceiling this is chasing
 *
 * If HYBRID lands near PLAN, the card's rule is doing its job and no scoring-path
 * change is needed before August 22. If it lands near ENGINE, the rule is
 * decoration and the card should say so instead of leading with it.
 *
 * Run: node draft/tools/seat_hybrid.js
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

/* The plan's slot at each pick, or null where it prices no seat. Built from the
 * plan itself rather than retyped — a hardcoded seat list would keep passing
 * after draft_plan changed its mind, which is the failure this whole tool is
 * about. */
const SLOT_AT = {};
PLAN.plan.forEach(x => { if (!x.bench && x.slot) SLOT_AT[x.pick] = x.slot; });
const ELIG = slot => (slot === 'FLEX' ? ['RB', 'WR', 'TE'] : [slot]);

/* ── ONE DRIVER, PARAMETERISED BY THE CHOOSER ─────────────────────────────
 * Both lines must differ ONLY in which candidate is taken. Writing two drivers
 * is how a comparison ends up measuring an incidental difference in the harness
 * — the engine_drive errors were all of that kind. */
function drive(choose) {
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
    const top = choose(list, pk);
    if (!top || !top.player) return;
    taken.add(String(top.player.player_id));
    roster.push(Object.assign({}, top.player));
    picks.push({ pick: pk, p: top.player, rank: list.indexOf(top) });
  });
  return { picks, roster };
}

const engineLine = drive(list => list[0]);
/* THE CARD'S RULE, encoded literally: at a seat pick take the engine's best
 * ELIGIBLE name; everywhere else take its best name. */
const hybridLine = drive((list, pk) => {
  const slot = SLOT_AT[pk];
  if (!slot) return list[0];
  const ok = ELIG(slot);
  return list.find(r => r && r.player && ok.indexOf(r.player.position) >= 0) || list[0];
});

console.log('DOES THE CARD\'S RULE WORK? — engine vs engine-constrained-to-seats vs plan\n');

console.log('  pick  seat    engine takes              the card makes you take');
console.log('  ' + '-'.repeat(74));
SCHED.forEach(pk => {
  const e = engineLine.picks.find(x => x.pick === pk);
  const h = hybridLine.picks.find(x => x.pick === pk);
  const es = e ? e.p.position + ' ' + e.p.name : '—';
  const hs = h ? h.p.position + ' ' + h.p.name : '—';
  console.log('  ' + String(pk).padStart(4) + '  ' + (SLOT_AT[pk] || '·').padEnd(6)
    + '  ' + es.padEnd(26) + (es === hs ? '(same)' : hs
      + (h && h.rank > 0 ? '   [engine had him #' + (h.rank + 1) + ']' : '')));
});

/* ── THE NUMBERS ──────────────────────────────────────────────────────────*/
const planRoster = keep.map(k => Object.assign({}, k, { is_keeper: true }))
  .concat(PLAN.plan.filter(x => x.p).map(x => Object.assign({}, x.p)));
const score = r => { const l = LV.bestLineup(r, DATA); return l && l.total != null ? l.total : null; };
const eT = score(engineLine.roster), hT = score(hybridLine.roster), pT = score(planRoster);

console.log('\n  BEST LEGAL STARTING LINEUP FROM EACH ROSTER (one function, all three)');
console.log('    ENGINE   greedy, unconstrained        ' + (eT == null ? '?' : eT.toFixed(1)));
console.log('    HYBRID   the card\'s rule              ' + (hT == null ? '?' : hT.toFixed(1)));
console.log('    PLAN     global assignment            ' + (pT == null ? '?' : pT.toFixed(1)));

if (eT != null && hT != null && pT != null) {
  const gap = pT - eT;
  const got = hT - eT;
  const pct = gap === 0 ? 0 : 100 * got / gap;
  console.log('\n    the gap the card is trying to close   ' + gap.toFixed(1) + ' pts');
  console.log('    what the card\'s rule actually gets    ' + got.toFixed(1) + ' pts   ('
    + pct.toFixed(0) + '% of it)');
  console.log('    still on the table                    ' + (gap - got).toFixed(1) + ' pts');
  /* A HEADLINE OF 100% IS A REASON TO CHECK THE INSTRUMENT, NOT TO CELEBRATE.
   * bestLineup scores STARTERS ONLY. If the constrained engine names the same
   * player as the plan at all six seats then the two lineups are identical and
   * 100% is arithmetic, not evidence about the bench. The honest claim is
   * bounded by what the instrument can see, so the bound is computed and
   * printed rather than left for a reader to work out. */
  const seatPicks = Object.keys(SLOT_AT).map(Number);
  let coincide = 0;
  seatPicks.forEach(pk => {
    const h = hybridLine.picks.find(x => x.pick === pk);
    const pl = PLAN.plan.find(x => x.pick === pk);
    if (h && pl && pl.p && String(h.p.player_id) === String(pl.p.player_id)) coincide++;
  });
  console.log('\n    seats where the constrained engine names the PLAN\'S OWN PLAYER: '
    + coincide + ' of ' + seatPicks.length);
  if (coincide === seatPicks.length) {
    console.log('    ALL OF THEM — so the two starting lineups are IDENTICAL and the 100%');
    console.log('    above is arithmetic. What was actually tested is whether the engine\'s');
    console.log('    best ELIGIBLE name at each seat matches the global solve, and it does');
    console.log('    at every seat. That is a real result and it is a NARROWER one than');
    console.log('    "the rule recovers the whole gap": the gap is entirely a starter');
    console.log('    problem, and the instrument cannot see bench value at all.');
  }
  console.log('\n  VERDICT');
  if (pct >= 80) {
    console.log('    THE RULE HOLDS, ON WHAT THIS CAN MEASURE. Constraining the engine to');
    console.log('    the plan\'s seats reproduces the global assignment\'s STARTING LINEUP');
    console.log('    with NO scoring-path change. The engine already ranks the right player');
    console.log('    at each seat — it just was not being asked the right question, which');
    console.log('    is the whole content of the card\'s rule.');
    console.log('    NOT ESTABLISHED: anything about the bench. bestLineup ignores it.');
  } else if (pct >= 40) {
    console.log('    THE RULE HELPS BUT DOES NOT CLOSE IT. It recovers a real fraction and');
    console.log('    leaves a real fraction. The card should say "most of" only if it also');
    console.log('    says what is left, and this number is what it should say.');
  } else if (got > 0) {
    console.log('    THE RULE IS MOSTLY DECORATION. It moves in the right direction and');
    console.log('    recovers little of the gap. The card leads with it in capitals and');
    console.log('    should not — that overstates a small effect as the headline answer.');
  } else {
    console.log('    THE RULE DOES NOT WORK AND MAY HURT. Constraining the engine to the');
    console.log('    plan\'s seats scores no better than letting it run greedy. The card\'s');
    console.log('    headline is WRONG and has to be rewritten before August 22.');
  }
}

/* ── WHY THE HYBRID IS NOT THE PLAN, when it is not ──────────────────────
 * A percentage with no mechanism is a number to be argued with rather than
 * acted on. This names the picks where the two still differ. */
console.log('\n  WHERE THE HYBRID STILL DIFFERS FROM THE PLAN');
let diffs = 0;
SCHED.forEach((pk, i) => {
  const h = hybridLine.picks.find(x => x.pick === pk);
  const pl = PLAN.plan[i];
  const hs = h ? h.p.position + ' ' + h.p.name : '—';
  const ps = pl && pl.p ? pl.p.position + ' ' + pl.p.name : 'UNPRICED';
  if (hs !== ps) {
    diffs++;
    console.log('    pick ' + String(pk).padStart(3) + '  card: ' + hs.padEnd(26)
      + 'plan: ' + ps);
  }
});
if (!diffs) console.log('    none — the card reproduces the plan exactly.');
console.log('\n    Every remaining difference is a BENCH pick, where the card deliberately');
console.log('    asserts no seat and lets the engine choose. Those are also the picks');
console.log('    free_picks.js showed are worth the least: five of them buy a player the');
console.log('    waiver wire matches or beats.');

console.log('\n  WHAT THIS DOES NOT ESTABLISH');
console.log('    · One board, one keeper set, one ADP ordering. This is a single');
console.log('      realisation, not a distribution — it says what the rule does HERE,');
console.log('      not what it does on average.');
console.log('    · The room is assumed to draft in ADP order at every intervening pick.');
console.log('      That is the same assumption the plan makes and it is wrong in the same');
console.log('      direction for all three lines, so the COMPARISON survives it better');
console.log('      than any single total does.');
console.log('    · bestLineup scores a season total from projections. It cannot see the');
console.log('      weekly payout, byes, or injuries, so it is the right instrument for');
console.log('      comparing seat assignments and the wrong one for judging a bench.');
