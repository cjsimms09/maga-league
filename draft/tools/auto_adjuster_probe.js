// TERRITORY: A
/* WHAT DOES THE AUTO ADJUSTER ACTUALLY DO AT CORY'S PICKS — AND IS IT ALREADY
 * BUYING WHAT P110 SAID `need` IS WORTH?
 *
 * Cory, 2026-08-19: *"work on auto adjuster settings."*
 *
 * ── THE DECISION-RELEVANT QUESTION, NOT A SURVEY ──────────────────────────
 * P110 graded `need: 1.0` at **+68.6 points per seat-season**, CI-clear, 3 of 3
 * seasons — and that is now a decision in front of Cory three days before his
 * draft. But `autoWeights` ALREADY ramps need across the draft
 * (Anchor 0.35 -> Build 0.9 -> Fill 1.45), and Auto is a UI TOGGLE rather than
 * an engine change.
 *
 * **So if Auto ON produces roughly the picks that `need: 1.0` produces, the
 * answer to "should I flip need" is "just switch Auto on" — a checkbox instead
 * of a weight edit on draft week.** That is worth knowing before he rules, and
 * nothing in the repo measures it.
 *
 * ── AND THE FACT THAT MAKES IT URGENT ─────────────────────────────────────
 * `app.js:3252` reads `state.autoWeights = localStorage.getItem(AUTO_KEY) === '1'`
 * — **Auto is opt-in and defaults OFF.** Unless Cory has switched it on in that
 * browser, he drafts on flat MEASURED_WEIGHTS with `need: 0`, which is exactly
 * the configuration that produced RB10/WR1 in register 59.
 *
 * REPORT ONLY. Changes no weight, ships no configuration.
 *
 * Run: node draft/tools/auto_adjuster_probe.js [--json <path>]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

global.window = global;
global.document = { getElementById: () => null, querySelector: () => null, addEventListener: () => {} };

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const KEEP = require(path.join(__dirname, 'keepers_of.js'));

/* ⛔ THIS WAS THE HARDCODED FIFTEEN-PICK LITERAL [8, 13, 28, 33, ...] — the
 * defect register 95 found, which Cory caught himself: keeping three players
 * forfeits rounds 1-3, so he owns TWELVE picks starting at 33 and does NOT own
 * 8, 13 or 28, the three most valuable in the draft. A drive down the literal
 * hands him three picks he cannot make and every roster it reports is wrong.
 *
 * Register 95's sweep fixed eight tools and MISSED SEVEN, this one among them,
 * for nine days. Rule 11: one derivation. draft_plan derives the schedule from
 * the snake and cross-checks it against the artifact's own pre-keeper list, and
 * refuses if the two disagree — so it is read from there and never retyped.
 * Register 406. */
const SCHED = require('./draft_plan.js').SCHED;
const keep = KEEP.keepersFrom(DATA);
const pool = DATA.players.filter(p => p.position && (p.proj_mean || 0) > 0);
const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));
const byAdp = pool.slice().sort((a, b) => adpOf(a) - adpOf(b));

function baseCtx(board, roster, i) {
  const pk = SCHED[i];
  return {
    board: board, roster: roster, nextPick: SCHED[i + 1] || null,
    currentPick: pk, pick: pk, round: Math.ceil(pk / (DATA.league.teams || 10)),
    myPicksLeft: SCHED.length - i, myPickIndex: i, totalMyPicks: SCHED.length,
    totalPicks: 150, league: DATA.league,
    currentKeepers: roster.filter(p => p.is_keeper),
    ceilingAllStages: false, doctrine: null, drift: null,
    intervening: (SCHED[i + 1] || pk) - pk,
  };
}

/* Three arms. `auto` asks the engine for its own phase weights at each pick,
 * exactly as the war room does when the toggle is on — not a re-implementation
 * of the phase table, which would be a seventh copy of a rule that already
 * exists once. */
const ARMS = {
  shipped: () => E.MEASURED_WEIGHTS,
  /* ⛔ THIS ARM WAS `need1` AND HAD COLLAPSED INTO `shipped`.
   *
   * It forced `need: 1.0` over MEASURED_WEIGHTS to show what turning the term on
   * would do. Cory ruled it on 2026-08-20 and engine.js:826 has shipped
   * `need: 1.0` ever since, so the override became a no-op and two of this
   * probe's three arms have been the same run. Registers 405 and 406 found the
   * identical defect in fieldability_probe.js and need_weight_pick_diff.js.
   *
   * Re-pointed at the PRE-RULING configuration, which is the counterfactual that
   * still carries information, and guarded below. Register 407. */
  need0: () => Object.assign({}, E.MEASURED_WEIGHTS, { need: 0.0 }),
  auto: (ctx) => {
    const a = E.autoWeights(ctx);
    return (a && a.weights) ? a.weights : a;
  },
};

/* ONE guard, not four copies — draft/tools/arms_differ.js, register 408. */
require('./arms_differ.js').assertArmsDiffer('auto_adjuster_probe', ARMS, null);

function walk(armName) {
  const fn = ARMS[armName];
  const taken = new Set(keep.map(k => String(k.player_id)));
  const roster = keep.map(k => Object.assign({}, k, { is_keeper: true }));
  const picks = [], phases = [];
  SCHED.forEach((pk, i) => {
    let need = (pk - 1) - (taken.size - keep.length);
    for (let j = 0; j < byAdp.length && need > 0; j++) {
      const p = byAdp[j];
      if (taken.has(String(p.player_id))) continue;
      taken.add(String(p.player_id)); need--;
    }
    const board = pool.filter(p => !taken.has(String(p.player_id)));
    const ctx = baseCtx(board, roster, i);
    let w = fn(ctx);
    if (armName === 'auto') {
      const a = E.autoWeights(ctx);
      phases.push({ pick: pk, phase: (a && a.phase) || null,
                    need: w && w.need, ceiling: w && w.ceiling, bye: w && w.bye });
    }
    ctx.weights = w;
    const out = E.recommend(ctx);
    const list = Array.isArray(out) ? out : (out && out.scored) || [];
    const top = list[0];
    if (!top || !top.player) { picks.push(null); return; }
    taken.add(String(top.player.player_id));
    roster.push(Object.assign({}, top.player));
    picks.push(top.player.position + ' ' + top.player.name);
  });
  const counts = {};
  roster.filter(p => !p.is_keeper).forEach(p => {
    const k = p.position; counts[k] = (counts[k] || 0) + 1;
  });
  return { picks: picks, phases: phases, counts: counts };
}

const runs = {};
Object.keys(ARMS).forEach(a => { runs[a] = walk(a); });

const agree = (x, y) => x.picks.filter((p, i) => p === y.picks[i]).length;

const report = {
  _territory: 'TERRITORY: A — draft/tools/auto_adjuster_probe.js',
  _note: 'REPORT ONLY. Room drained in strict ADP order, which the real room '
       + 'will not be — this measures the engine\'s own dependence on the '
       + 'adjuster, not what happens on the 22nd.',
  board_built_at: DATA.built_at || null,
  auto_defaults_off: 'app.js:3252 — localStorage AUTO_KEY === "1", so OFF unless Cory switched it on',
  arms: Object.fromEntries(Object.keys(ARMS).map(a => [a, {
    picks: runs[a].picks, roster_counts: runs[a].counts,
  }])),
  auto_phase_trace: runs.auto.phases,
  agreement: {
    auto_vs_shipped: agree(runs.auto, runs.shipped) + '/' + SCHED.length,
    need0_vs_shipped: agree(runs.need0, runs.shipped) + '/' + SCHED.length,
    /* THE NUMBER THE WHOLE PROBE EXISTS FOR: if Auto and need=1.0 land in the
     * same place, the graded +68.6 is available as a CHECKBOX rather than as a
     * weight change on draft week. */
    auto_vs_need0: agree(runs.auto, runs.need0) + '/' + SCHED.length,
  },
};

console.log('AUTO ADJUSTER — what it does at Cory\'s 15 picks, board ' + report.board_built_at);
console.log('  ⚠️ ' + report.auto_defaults_off + '\n');
console.log('  phase trace (Auto):');
runs.auto.phases.forEach(p => console.log('    pick ' + String(p.pick).padStart(3)
  + '  ' + String(p.phase).padEnd(8) + ' need ' + String(p.need).padEnd(6)
  + ' ceiling ' + String(p.ceiling).padEnd(6) + ' bye ' + p.bye));
console.log('\n  pick-by-pick:');
console.log('    ' + 'pick'.padStart(4) + '  ' + 'SHIPPED (need 0)'.padEnd(28)
  + 'AUTO'.padEnd(28) + 'need=1.0');
SCHED.forEach((pk, i) => console.log('    ' + String(pk).padStart(4) + '  '
  + String(runs.shipped.picks[i]).padEnd(28) + String(runs.auto.picks[i]).padEnd(28)
  + String(runs.need0.picks[i])));
console.log('\n  rosters: shipped ' + JSON.stringify(runs.shipped.counts));
console.log('           auto    ' + JSON.stringify(runs.auto.counts));
console.log('           need0   ' + JSON.stringify(runs.need0.counts));
console.log('\n  agreement: ' + JSON.stringify(report.agreement));

const outPath = (() => { const i = process.argv.indexOf('--json'); return i >= 0 ? process.argv[i + 1] : null; })();
if (outPath) { fs.writeFileSync(outPath, JSON.stringify(report, null, 1)); console.log('\nwrote ' + outPath); }
module.exports = { report };
