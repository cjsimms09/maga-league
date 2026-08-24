#!/usr/bin/env node
/* WHAT `CFG.RAIL_LATE_ROUNDS` COSTS, MEASURED AGAINST THE REAL 2026 DRAFT.
 *
 * THE CLAIM THIS EXISTS TO PRICE (register 271). The constant is 2. A kicker
 * or defence is flagged `"K/DEF this early is almost never right"` unless two
 * or fewer rounds remain, and a flagged onesie is DEMOTED beneath the entire
 * board. The autopsy read that as the cause of Cory finishing with K 0.
 *
 * ⚠️ MEASURED, AND THE CLAIM DOES NOT SURVIVE. Swept over seven values from 0
 * to 99, the roster the tool drafts at his real seat is IDENTICAL at every one
 * — QB 1 · RB 5 · WR 6 · TE 1 · K 1 · DEF 1, short of nothing, with DEF taken
 * at 128 and K at 133 in all seven arms. The constant does not drive the
 * shape. Cory's K 0 came from overriding the tool at 133 and 148, not from
 * the rail making a kicker unreachable.
 *
 * WHAT THE SWEEP DID FIND, which is worth more than the thing it was built to
 * check: at pick 108 the shipped value demotes 75 players, and turning the
 * onesie rail FULLY OFF (99) still demotes 68 — because
 * `demoteFlaggedOnesies()` sinks any K/DEF carrying ANY rail flag, and 68 of
 * them carry `"~N picks ahead of ADP — verify before taking"`. Kickers and
 * defences have very late ADPs, so that flag fires on essentially all of them
 * at any realistic pick. The onesie constant is therefore NOT the lever it
 * looks like: changing it would leave 68 of 75 demotions in place. A rail that
 * means "check this number" is being read as "do not recommend this player".
 *
 * ── WHAT IS MEASURED, AND WHAT IS NOT ──────────────────────────────────────
 * ROSTER SHAPE, which is what register 271 is about: how many of each position
 * the tool would have drafted at each value of the constant. Not "how many
 * points" — a counterfactual roster's points would need the season, and the
 * season has not happened.
 *
 * ── THE HONEST LIMITATION, STATED RATHER THAN BURIED ───────────────────────
 * The other nine seats keep their REAL picks. Once the tool takes someone Cory
 * did not, the pool diverges: a later real pick may name a player this replay
 * has already removed, and that seat simply loses the pick rather than choosing
 * again (it has no model here to choose with). Divergences are COUNTED and
 * reported per arm, so a reader can see how far from the real draft each arm
 * drifted rather than take the shape on faith. This is the same limitation
 * every seat replay in this repo carries.
 *
 * ── TWO CONTROLS, BOTH RUN EVERY TIME (Rules 3e and 3f) ────────────────────
 * A. REPRODUCTION. With Cory taking his REAL picks, the shipped value must
 *    reproduce draft_shadow_2026.jsonl's #1 at all twelve. If it does not, the
 *    harness is wrong and nothing below means anything.
 * B. THE KNOB MOVES SOMETHING. This control FIRST ASKED THE WRONG QUESTION AND
 *    FAILED, and the failure is why the finding above exists. It originally
 *    required some arm to produce different PICKS; every arm produced the same
 *    picks, which reads exactly like a constant wired to nothing. Probed in
 *    isolation, `plausibilityRails()` does drop the onesie flag at 99, so the
 *    knob is live and the picks-unchanged result is a real null. The control
 *    now measures what the constant genuinely moves — the DEMOTION COUNT —
 *    which is what lets "nothing happened" be told apart from "nothing was
 *    measured". That distinction is the whole of Rule 3e.
 *
 * usage: node draft/tools/rail_late_rounds_sweep.js [--out PATH]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SH = require(path.join(ROOT, 'draft', 'tools', 'draft_shadow.js'));

global.window = global;
require(path.join(ROOT, 'public', 'js', 'draft', 'survival.js'));
require(path.join(ROOT, 'public', 'js', 'draft', 'composite.js'));
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
require(path.join(ROOT, 'public', 'js', 'draft', 'needrule.js'));
const LC = require(path.join(ROOT, 'draft', 'tools', 'live_context.js'));

/* 0 = never flag an onesie. 99 = always flag one. The shipped value is 2 and
 * sits in the middle of the sweep rather than at an end, so a monotone result
 * cannot be an artifact of the range. */
const ARMS = [0, 1, 2, 3, 4, 6, 99];
const SHIPPED = 2;
const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
/* ⚠️ READ FROM `league_config.ruled_roster_target`, NOT TYPED. This file
 * carried the six numbers as a local literal, which is exactly what
 * `ruled_target_is_one_definition.test.js` exists to forbid — and that guard
 * has been RED because of this file since I added it (A, 2026-08-24).
 *
 * The guard's own header says why it is not pedantry: register 70's five-arm
 * shape ranking measured against RB 4.44 — a DIFFERENT quantity from a
 * different study — instead of Cory's ruled 4.78, and "the verdict FLIPPED
 * when corrected... Cory nearly ruled on the wrong comparison." A second copy
 * of a ruled number is a second thing that can drift from the ruling.
 *
 * Same accessor as the two approved consumers (mlv_seat_plan.js,
 * need_weight_rerun.js), REFUSING rather than falling back — a default target
 * would be the invented constant all over again. */
const TARGET = (() => {
  const t = require(path.join(ROOT, 'draft', 'config', 'league_config.json'))
    .ruled_roster_target;
  if (!t || !t.targets) {
    throw new Error('league_config.ruled_roster_target missing — refusing to '
      + 'invent a roster target (register 70: the wrong target flipped a verdict)');
  }
  return t.targets;
})();

const readJsonl = p => !fs.existsSync(p) ? []
  : fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map(JSON.parse);

function load() {
  const freeze = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'draft', 'data', 'pre_draft_freeze_2026.json'), 'utf8'));
  const board = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
  let wire = null;
  try {
    wire = JSON.parse(fs.readFileSync(
      path.join(ROOT, 'draft', 'data', 'wire_level.json'), 'utf8')).per_week;
  } catch (e) { wire = null; }
  const log = readJsonl(path.join(ROOT, 'draft', 'data', 'draft_pick_log_2026.jsonl'));
  if (!log.length) throw new Error('REFUSING: empty pick log — nothing to replay.');
  return { freeze, board, wire, log };
}

/**
 * Walk the real draft once.
 * @param follow  true  -> at OUR picks take the tool's #1 (the counterfactual)
 *                false -> at OUR picks take the REAL player (shadow mode,
 *                         used by control A)
 * Returns { picks: [...], divergences } .
 */
function replay(env, follow) {
  const { freeze, board, wire, log } = env;
  const order = log.slice().sort((a, b) => a.pick - b.pick);
  const byId = new Map((board.players || []).map(p => [String(p.player_id), p]));
  for (const k of board.kept_players || []) byId.set(String(k.player_id), k);
  const pickOrder = (freeze.pick_order || {}).picks || [];
  const slotOfOverall = {};
  for (const p of pickOrder) slotOfOverall[p.overall] = p.slot;
  const schedules = SH.seatSchedules(freeze.pick_order);
  const MINE = new Set(freeze.my_picks || []);
  const mySeat = (() => {
    const s = new Set(pickOrder.filter(p => MINE.has(p.overall)).map(p => p.slot));
    return s.size === 1 ? s.values().next().value : null;
  })();
  if (mySeat == null) throw new Error('REFUSING: the freeze does not name exactly one seat as ours.');

  const gone = new Set();
  const rosters = {};
  const keepersOf = {};
  const picks = [];
  let divergences = 0;

  for (const r of order) {
    const pickNo = r.pick;
    const seat = r.team_slot != null ? r.team_slot : slotOfOverall[pickNo];
    const realRow = byId.get(String(r.player_id))
      || { player_id: String(r.player_id), name: r.player_name, position: r.position };
    let taken = realRow;

    if (MINE.has(pickNo) && !r.is_keeper && seat != null) {
      const clock = SH.seatClock(schedules[seat], pickNo);
      const pool = (board.players || []).filter(p => !gone.has(String(p.player_id)));
      const intervening = pickOrder
        .filter(p => !p.keeper_slot && p.slot !== seat && p.overall >= pickNo
          && p.overall < (clock.next_pick != null ? clock.next_pick : pickNo))
        .map(p => ({ team_slot: p.slot, pick_no: p.overall, roster: [], profile: null }));
      const ctx = LC.liveContext({
        currentPick: pickNo,
        nextPick: clock.next_pick != null ? clock.next_pick : pickNo,
        board: pool, data: board,
        roster: rosters[seat] || [],
        currentKeepers: keepersOf[seat] || [],
        myPicksLeft: Math.max(1, clock.picks_left),
        myPickIndex: clock.pick_index,
        intervening,
      });
      ctx.wireWeekly = wire || ctx.wireWeekly;
      const recs = E.recommend(ctx) || [];
      const top = recs[0] && recs[0].player ? recs[0].player : null;
      const demoted = recs.filter(x => x && x.demoted);
      /* WHY each demoted player was demoted, with the ADP distance collapsed
       * so "~12 picks ahead" and "~30 picks ahead" tally as one reason. This
       * is the field that turned the sweep from a null into a finding. */
      const railTally = {};
      demoted.forEach(x => (x.rails || []).forEach(f => {
        const k = f.replace(/~\d+/, '~N');
        railTally[k] = (railTally[k] || 0) + 1;
      }));
      picks.push({
        pick: pickNo,
        real: { name: realRow.name, position: realRow.position },
        tool_top: top ? { name: top.name, position: top.position } : null,
        demoted_count: demoted.length,
        demoted_rail_reasons: railTally,
      });
      if (follow && top) taken = top;
    } else if (gone.has(String(r.player_id))) {
      /* A seat's real pick was already removed by our counterfactual. It has no
       * model here, so it forfeits rather than being handed a guess. Counted. */
      divergences += 1;
      continue;
    }

    gone.add(String(taken.player_id));
    if (seat != null) {
      (rosters[seat] = rosters[seat] || []).push(taken);
      if (r.is_keeper) (keepersOf[seat] = keepersOf[seat] || []).push(taken);
    }
  }

  const mine = rosters[mySeat] || [];
  const shape = {};
  POS.forEach(p => { shape[p] = mine.filter(x => x.position === p).length; });
  return { picks, divergences, shape, roster_size: mine.length };
}

function main(argv) {
  const argOf = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
  const outP = argOf('--out')
    || path.join(ROOT, 'draft', 'data', 'rail_late_rounds_sweep.json');
  const env = load();
  const shadow = readJsonl(path.join(ROOT, 'draft', 'data', 'draft_shadow_2026.jsonl'));
  const original = E.CFG.RAIL_LATE_ROUNDS;

  /* ── CONTROL A: the harness reproduces the shipped shadow log ──────────── */
  E.CFG.RAIL_LATE_ROUNDS = SHIPPED;
  const shadowMode = replay(env, false);
  const cmp = shadowMode.picks.map(p => {
    const s = shadow.find(x => x.pick_no === p.pick);
    const theirs = s && s.tool_recommendation ? s.tool_recommendation.name : null;
    return { pick: p.pick, mine: p.tool_top ? p.tool_top.name : null, theirs };
  });
  const mism = cmp.filter(c => c.mine !== c.theirs);
  const controlA = {
    why: 'With Cory taking his REAL picks, the shipped value must reproduce '
      + 'draft_shadow_2026.jsonl. A mismatch indicts this harness, not the log.',
    compared: cmp.length, agreed: cmp.length - mism.length,
    mismatches: mism, passed: cmp.length > 0 && mism.length === 0,
  };

  /* ── THE SWEEP ─────────────────────────────────────────────────────────── */
  const arms = ARMS.map(v => {
    E.CFG.RAIL_LATE_ROUNDS = v;
    const cf = replay(env, true);
    const gap = {}; POS.forEach(p => { gap[p] = +(cf.shape[p] - TARGET[p]).toFixed(2); });
    return {
      rail_late_rounds: v,
      shipped: v === SHIPPED,
      shape: cf.shape,
      shape_gap_vs_ruled_target: gap,
      short_of_a_starter_at: POS.filter(p => cf.shape[p] < 1 && TARGET[p] >= 1),
      onesie_picks: cf.picks.filter(p => p.tool_top
        && (p.tool_top.position === 'K' || p.tool_top.position === 'DEF'))
        .map(p => p.pick + ':' + p.tool_top.position),
      demoted_at_pick_108: (cf.picks.find(p => p.pick === 108) || {}).demoted_count,
      demoted_total_across_my_picks: cf.picks.reduce((a, p) => a + (p.demoted_count || 0), 0),
      demoted_rail_reasons_at_pick_108:
        (cf.picks.find(p => p.pick === 108) || {}).demoted_rail_reasons,
      divergences_from_the_real_draft: cf.divergences,
      tool_top_by_pick: cf.picks.map(p => p.pick + ' '
        + (p.tool_top ? p.tool_top.position + ' ' + p.tool_top.name : '—')),
    };
  });
  E.CFG.RAIL_LATE_ROUNDS = original;

  /* ── CONTROL B: the knob is actually wired ─────────────────────────────── */
  /* ⚠️ THIS CONTROL FIRST ASKED THE WRONG QUESTION AND FAILED, AND THE FAILURE
   * IS THE FINDING. It originally required some arm to produce DIFFERENT PICKS
   * from the shipped arm. Every arm produced identical picks — including 0 and
   * 99 — which reads exactly like a constant wired to nothing.
   *
   * It is wired. Probed in isolation, plausibilityRails() drops the onesie flag
   * at 99 and keeps it at 0 and 2. What the constant does NOT do is change the
   * resulting draft, and that is a real null rather than a broken probe.
   *
   * So the control now asks what the knob genuinely moves — how many players
   * get DEMOTED — and the picks-unchanged result becomes a trustworthy finding
   * sitting underneath a control that can fail. Rule 3e is about being able to
   * tell "nothing happened" from "nothing was measured"; measuring the
   * demotion is how those two are told apart here. */
  const shippedArm = arms.find(a => a.shipped);
  const demotionMoves = arms.filter(a => !a.shipped
    && a.demoted_total_across_my_picks !== shippedArm.demoted_total_across_my_picks);
  const pickMoves = arms.filter(a => !a.shipped
    && JSON.stringify(a.tool_top_by_pick) !== JSON.stringify(shippedArm.tool_top_by_pick));
  const controlB = {
    why: 'The knob must be shown to MOVE SOMETHING before "the picks do not '
      + 'change" can be read as a result rather than as a dead constant. What '
      + 'it moves is the demotion count; whether that reaches the picks is the '
      + 'question being answered, not the control.',
    arms_whose_demotion_count_differs: demotionMoves.map(a => a.rail_late_rounds),
    arms_whose_PICKS_differ: pickMoves.map(a => a.rail_late_rounds),
    passed: demotionMoves.length > 0,
  };

  const doc = {
    _what: 'Roster shape the tool would have drafted at Cory\'s real 2026 seat, '
      + 'swept over CFG.RAIL_LATE_ROUNDS.',
    _limitation: 'The other nine seats keep their REAL picks and forfeit if the '
      + 'counterfactual already took their man. Divergences are counted per arm.',
    _not_measured: 'Points. A counterfactual roster\'s points need a season that '
      + 'has not happened.',
    shipped_value: SHIPPED,
    ruled_target: TARGET,
    controls: { reproduces_shadow_log: controlA, knob_is_live: controlB,
      all_passed: controlA.passed && controlB.passed },
    arms,
  };
  fs.writeFileSync(outP, JSON.stringify(doc, null, 2) + '\n');

  console.log('CFG.RAIL_LATE_ROUNDS — what it costs, on Cory\'s real 2026 seat\n');
  console.log('CONTROL A (reproduces the shadow log at the shipped value): %d of %d — %s',
    controlA.agreed, controlA.compared, controlA.passed ? 'PASS' : '*** FAIL ***');
  console.log('CONTROL B (the knob moves the demotion): arms differing = [%s] — %s',
    controlB.arms_whose_demotion_count_differs.join(', '),
    controlB.passed ? 'PASS' : '*** FAIL ***');
  console.log('            arms whose PICKS differ: [%s]  <- the question, not the control',
    controlB.arms_whose_PICKS_differ.join(', ') || 'none');
  if (!doc.controls.all_passed) {
    console.log('\nA control FAILED. Nothing below may be written down as a finding.');
  }
  console.log('\nvalue | QB RB WR TE  K DEF | short of a starter | onesies taken | demoted@108 | diverged');
  for (const a of arms) {
    console.log('%s | %s %s %s %s %s %s | %s | %s | %s | %s',
      String(a.rail_late_rounds).padStart(5) + (a.shipped ? '*' : ' '),
      String(a.shape.QB).padStart(2), String(a.shape.RB).padStart(2),
      String(a.shape.WR).padStart(2), String(a.shape.TE).padStart(2),
      String(a.shape.K).padStart(2), String(a.shape.DEF).padStart(3),
      (a.short_of_a_starter_at.join(',') || 'none').padEnd(18),
      (a.onesie_picks.join(' ') || '—').padEnd(13),
      String(a.demoted_at_pick_108).padStart(11),
      String(a.divergences_from_the_real_draft).padStart(8));
  }
  /* Printed FROM the config too. A second copy of the ruling in a display
   * string drifts exactly as silently as one in a constant — and this is
   * the line the guard actually caught after I fixed the constant. */
  console.log('\n(* = shipped)   ruled target  '
    + POS.map(q => q + ' ' + TARGET[q]).join('  '));
  console.log('wrote %s', path.relative(ROOT, outP));
  return doc.controls.all_passed ? 0 : 1;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { main, replay, ARMS };
