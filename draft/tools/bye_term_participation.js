// TERRITORY: A
/* DOES THE BYE TERM EVER FIRE DURING CORY'S ACTUAL DRAFT?
 *
 * Two findings from 2026-08-19 point at each other and nobody has joined them:
 *
 *   · **Register 73** — the shipped configuration drafts a roster that cannot
 *     field a skill lineup in two weeks (week 7 QB, week 10 TE).
 *   · **Register 69** — the `bye` weight arm produced a BIT-IDENTICAL draft
 *     across all 30 replay seats. The weight was applied; the term it
 *     multiplies contributed zero at every pick.
 *
 * **The bye term is the mechanism that is supposed to prevent the first
 * finding, and the second says it does nothing.** Register 69 measured that on
 * BUNDLE boards, which may carry no bye week at all. This measures it where it
 * matters: the live board, which carries a bye for 640 of 697 players.
 *
 * ── WHY IT MIGHT BE STRUCTURALLY DEAD RATHER THAN JUST SMALL ────────────────
 * `byeCollisionPenalty` (`composite.js:333`) returns 0 unless the roster
 * ALREADY holds a player at that position on that same bye week:
 *
 *     const collisions = sameByeAtPos.length;   // others already rostered
 *     const value = drop * posWeight * Math.min(1, collisions / max(1, slots));
 *
 * With `collisions === 0` the value is 0 regardless of everything else. So the
 * term can only fire on your SECOND player at a position sharing a bye — and by
 * then the collision already exists. **A penalty that cannot fire until the
 * damage is done is not a preventative.** That is a hypothesis about the code;
 * this probe tests it against the real board rather than asserting it.
 *
 * REPORT ONLY. Ships no weight, changes no configuration.
 *
 * Run: node draft/tools/bye_term_participation.js [--json <path>]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

global.window = global;
global.document = { getElementById: () => null, querySelector: () => null,
                    addEventListener: () => {} };

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const KEEP = require(path.join(__dirname, 'keepers_of.js'));

const SCHED = [8, 13, 28, 33, 48, 53, 68, 73, 88, 93, 108, 113, 128, 133, 148];
const keep = KEEP.keepersFrom(DATA);
const pool = DATA.players.filter(p => p.position && (p.proj_mean || 0) > 0);
const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));
const byAdp = pool.slice().sort((a, b) => adpOf(a) - adpOf(b));

/* THE KNOWN-POSITIVE CONTROL, and this probe is worthless without it (rule 3e).
 * "the bye term never fired" is exactly what a probe that calls the wrong
 * function, or passes a ctx the function cannot read, would report. So first
 * construct a roster where a collision DEFINITELY exists and require a non-zero
 * penalty. If this returns 0, every null below means the probe is broken. */
function control() {
  const wr = pool.filter(p => p.position === 'WR' && p.bye);
  const bye = wr[0] && wr[0].bye;
  const same = wr.filter(p => p.bye === bye).slice(0, 3);
  if (same.length < 2) return { ok: false, why: 'no two WRs share a bye on this board' };
  const roster = [Object.assign({}, same[0])];
  const ctx = { roster: roster, league: DATA.league, board: pool };
  const r = E.byeCollisionPenalty(same[1], ctx);
  return { ok: (r && r.value > 0), value: r && r.value, detail: r && r.detail,
           bye: bye, with_player: same[0].name, candidate: same[1].name };
}

const ctrl = control();

const rows = [];
const taken = new Set(keep.map(k => String(k.player_id)));
const roster = keep.map(k => Object.assign({}, k, { is_keeper: true }));
let everFired = 0, everChanged = 0;

SCHED.forEach((pk, i) => {
  let need = (pk - 1) - (taken.size - keep.length);
  for (let j = 0; j < byAdp.length && need > 0; j++) {
    if (taken.has(String(byAdp[j].player_id))) continue;
    taken.add(String(byAdp[j].player_id)); need--;
  }
  const board = pool.filter(p => !taken.has(String(p.player_id)));
  const ctx = {
    board: board, roster: roster, nextPick: SCHED[i + 1] || null,
    currentPick: pk, pick: pk, round: Math.ceil(pk / (DATA.league.teams || 10)),
    myPicksLeft: SCHED.length - i, myPickIndex: i, totalMyPicks: SCHED.length,
    totalPicks: 150, league: DATA.league, currentKeepers: keep,
    ceilingAllStages: false, doctrine: null, drift: null, intervening: 5,
    weights: E.MEASURED_WEIGHTS,
  };
  const out = E.recommend(ctx);
  const list = Array.isArray(out) ? out : (out && out.scored) || [];
  const top20 = list.slice(0, 20);

  /* How many of the top 20 candidates carry ANY bye penalty at all, and what is
   * the largest? A term that is non-zero on nobody cannot break a tie. */
  let nonzero = 0, max = 0, maxWho = null;
  top20.forEach(c => {
    const p = c.player || c;
    const r = E.byeCollisionPenalty(p, ctx);
    const v = (r && r.value) || 0;
    if (v > 0) { nonzero++; if (v > max) { max = v; maxWho = p.name; } }
  });
  if (nonzero) everFired++;

  /* WOULD IT HAVE CHANGED THE PICK? Re-score with bye at 0 and compare the top
   * name. This is the only question that matters — a term that moves a score
   * without ever moving a CHOICE is decoration. */
  const zeroCtx = Object.assign({}, ctx,
    { weights: Object.assign({}, E.MEASURED_WEIGHTS, { bye: 0 }) });
  const out0 = E.recommend(zeroCtx);
  const list0 = Array.isArray(out0) ? out0 : (out0 && out0.scored) || [];
  const a = top20[0] && (top20[0].player || top20[0]);
  const b = list0[0] && (list0[0].player || list0[0]);
  const changed = !!(a && b && String(a.player_id) !== String(b.player_id));
  if (changed) everChanged++;

  rows.push({ pick: pk, top20_with_a_bye_penalty: nonzero,
              largest_penalty: Math.round(max * 100) / 100, largest_on: maxWho,
              pick_changes_if_bye_zeroed: changed,
              picked: a ? (a.position + ' ' + a.name) : null });

  if (a) { taken.add(String(a.player_id)); roster.push(Object.assign({}, a)); }
});

const report = {
  _territory: 'TERRITORY: A — draft/tools/bye_term_participation.js',
  _note: 'REPORT ONLY. Room drained in strict ADP order — the engine\'s own '
       + 'tendency, not a forecast of the 22nd (register 67/74).',
  board_built_at: DATA.built_at || null,
  bye_weight_shipped: E.MEASURED_WEIGHTS.bye,
  known_positive_control: ctrl,
  picks: rows,
  picks_where_any_candidate_carried_a_penalty: everFired + '/' + SCHED.length,
  picks_the_bye_term_actually_changed: everChanged + '/' + SCHED.length,
};

console.log('BYE TERM — does it fire during Cory\'s draft? board ' + report.board_built_at);
console.log('  shipped bye weight: ' + E.MEASURED_WEIGHTS.bye);
console.log('  CONTROL (a roster that DEFINITELY has a collision): '
  + (ctrl.ok ? '✅ penalty ' + ctrl.value.toFixed(2) + ' — ' + ctrl.detail
             : '⛔ RETURNED ZERO — every null below is the probe, not the term'));
console.log('\n  pick   top20 w/ penalty   largest   changes pick?   taken');
rows.forEach(r => console.log('  ' + String(r.pick).padStart(4) + '   '
  + String(r.top20_with_a_bye_penalty).padStart(13) + '   '
  + String(r.largest_penalty).padStart(7) + '   '
  + String(r.pick_changes_if_bye_zeroed).padStart(12) + '   ' + r.picked));
console.log('\n  any candidate carried a penalty: ' + report.picks_where_any_candidate_carried_a_penalty);
console.log('  the bye term CHANGED the pick:   ' + report.picks_the_bye_term_actually_changed);

const outPath = (() => { const i = process.argv.indexOf('--json'); return i >= 0 ? process.argv[i + 1] : null; })();
if (outPath) { fs.writeFileSync(outPath, JSON.stringify(report, null, 1)); console.log('  wrote ' + outPath); }
module.exports = { report };
