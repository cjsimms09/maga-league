// TERRITORY: A
/* WHAT TEAM WOULD MLV ACTUALLY DRAFT ME? — all twelve picks, not just this one.
 *
 * Cory, 2026-08-20: "Let's have something on war room screen that tells me what
 * MLV displacement with 1k and def would pick."
 *
 * The roster-builder panel answers "who NOW". It cannot answer "what do I end
 * up with", and that is the question a plan answers. This runs the same
 * marginal-lineup-value rule forward across his real schedule and reports the
 * whole roster it produces.
 *
 * ── WHAT IS REUSED, DELIBERATELY (rule 11) ──────────────────────────────────
 *
 *   the RULE          public/js/draft/mlv.js — the SAME module the live panel
 *                     calls, so the plan and the panel can never disagree about
 *                     what MLV thinks. Not a second implementation.
 *   the AVAILABILITY  emit_seat_plan.js's rule: the top-N by ADP are gone,
 *                     where N is the count of real SELECTIONS before that pick
 *                     from `pick_order` (keeper slots excluded — they consume a
 *                     roster spot, not a board position).
 *
 * ⚠️ THE K/DEF CAP IS CORY'S RULE, NOT A DISCOVERY, and the plan says so on its
 * face. Capped at one each: "I won't draft 2 kickers and 2 def." Measured, the
 * cap is worth +45.8/+29.3 against excluding them entirely at −83.7/−211.3.
 *
 * ⚠️ AND IT IS A PLAN, NOT A PREDICTION. It assumes the market drains in ADP
 * order and that nobody reacts to him. Every seat-plan caveat applies; the
 * artifact carries them rather than leaving them to be remembered.
 *
 * ── ⛔ WHAT RUNNING IT ACTUALLY FOUND, AND WHY THIS FILE REFUSES TO PRETEND ──
 *
 * The first run produced a clean-looking twelve-pick plan whose last six picks
 * were SIX STRAIGHT TIGHT ENDS. They are not a tight-end preference. By pick 93
 * Cory's nine starting slots are full, and from that point EVERY REMAINING
 * CANDIDATE HAS MARGINAL LINEUP VALUE OF EXACTLY ZERO — 451 of 451 at pick 93,
 * not one player with a positive score. `recommend` sorts by marginal alone, so
 * the entire back half of his draft was being decided by the order players
 * happen to sit in `draft_data.json`.
 *
 * Demonstrated, not asserted (rule 3f) — the same call, same roster, same
 * board, three input orderings:
 *
 *   board order   QB Purdy · QB Stafford · TE Kelce
 *   REVERSED      QB Nussmeier · QB Payton · QB Morton   <- third-string QBs
 *   ADP order     RB Brooks · RB Corum · TE Kittle
 *
 * All three are equally "correct" to MLV, because to MLV they are all worth 0.
 * `mlv.js` already declares this ("LIMITATION ... this CANNOT VALUE A BENCH"),
 * but it is stated there as six of fifteen roster SPOTS. Against Cory's real
 * schedule it is SIX OF HIS TWELVE PICKS — every pick from round 7 on, half the
 * draft. That is the finding this plan exists to surface. Register 146.
 *
 * So: where MLV is indifferent, this file SAYS SO and hands the pick to the
 * board's own `overall_rank` — the ordering Cory already drafts from, complete
 * and strictly unique across all 617 players. That is a declared handoff to an
 * existing shipped rule, NOT a new tie-break invented here, and every such pick
 * is stamped `chosen_by: "board rank — MLV is indifferent"` so no reader can
 * mistake it for an MLV opinion.
 *
 * REPORT ONLY. Writes public/mlv_plan.json.
 * Run: node draft/tools/mlv_seat_plan.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const BOARD = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const MLV = require(path.join(ROOT, 'public', 'js', 'draft', 'mlv.js'));

const league = { starters: BOARD.league.starters };
const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : (p.adp != null ? +p.adp : 9999)));

const pool = BOARD.players.filter(p => p.position && (p.proj_mean || 0) > 0);
const byAdp = pool.slice().sort((a, b) => adpOf(a) - adpOf(b));

/* MY PICKS, from the board's own schedule rather than a constant retyped here. */
const seatPlan = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'seat_plan.json'), 'utf8'));
  } catch (e) { return null; }
})();
const MY_PICKS = (seatPlan && seatPlan.my_picks) || (BOARD.grab_by && BOARD.grab_by.my_picks) || [];
if (!MY_PICKS.length) {
  throw new Error('mlv_seat_plan: no pick schedule found. REFUSING to invent one '
    + '— a plan against the wrong picks is worse than no plan (register 98).');
}

/* how many real SELECTIONS happen before a given overall pick */
const pickRows = ((BOARD.pick_order || {}).picks) || [];
function liveBefore(pick) {
  if (!pickRows.length) {
    throw new Error('mlv_seat_plan: pick_order.picks is empty, so selections '
      + 'before a pick cannot be counted. REFUSING to fall back to pick-1.');
  }
  return pickRows.filter(r => r.overall < pick && !r.keeper_slot).length;
}

/* Cory's keepers, as the board records them — the plan starts from his real roster */
const keptIds = new Set((BOARD.kept_player_ids || []).map(String));
const keepers = (BOARD.kept_players || []).map(k => {
  const onBoard = pool.find(p => String(p.player_id) === String(k.player_id));
  return onBoard || { player_id: k.player_id, name: k.name, position: k.position,
    proj_mean: k.proj_mean || k.proj || 0 };
}).filter(k => k.position);

const roster = keepers.slice();
const takenByMe = new Set(keepers.map(k => String(k.player_id)));
const picks = [];

let indifferentFrom = null;

MY_PICKS.forEach((pick, i) => {
  const goneN = liveBefore(pick);
  const gone = new Set(byAdp.slice(0, goneN).map(p => String(p.player_id)));
  const available = pool.filter(p => !gone.has(String(p.player_id))
    && !takenByMe.has(String(p.player_id)) && !keptIds.has(String(p.player_id)));
  const rec = MLV.recommend(available, roster, { league, topN: 3 });
  if (!rec.length) { picks.push({ pick, none: true }); return; }

  /* IS MLV ACTUALLY SAYING ANYTHING HERE? A top score of 0 means every legal
   * candidate ties, and the "winner" is whoever the array happened to hold
   * first. That is not an opinion, and printing it as one is the bug. */
  const top = rec[0];
  const indifferent = !(top.marginal > 0);
  let chosen, chosenBy, tied = null;
  if (indifferent) {
    if (indifferentFrom == null) indifferentFrom = pick;
    const all = MLV.recommend(available, roster, { league, topN: available.length + 1 });
    tied = all.filter(r => !(r.marginal > 0)).length;
    /* declared handoff to the board's own ordering — not a new rule */
    chosen = all.slice().sort((a, b) =>
      (a.player.overall_rank == null ? 1e9 : a.player.overall_rank)
      - (b.player.overall_rank == null ? 1e9 : b.player.overall_rank))[0];
    chosenBy = 'board rank — MLV is indifferent';
  } else {
    chosen = top;
    chosenBy = 'MLV';
  }

  roster.push(chosen.player);
  takenByMe.add(String(chosen.player.player_id));
  picks.push({
    pick, round: i + 1,
    player: { name: chosen.player.name, position: chosen.player.position,
      team: chosen.player.team || null, adp: Math.round(adpOf(chosen.player) * 10) / 10,
      proj_mean: chosen.player.proj_mean,
      overall_rank: chosen.player.overall_rank == null ? null : chosen.player.overall_rank },
    marginal: chosen.marginal,
    why: indifferent
      ? 'MLV IS INDIFFERENT — all ' + tied + ' remaining players are worth exactly 0 '
        + 'to it, because your nine starting slots are already full. This name is '
        + 'the board\'s top rank, not an MLV pick.'
      : chosen.why,
    mlv_has_an_opinion: !indifferent,
    chosen_by: chosenBy,
    tied_at_zero: tied,
    board_available: available.length,
    runners_up: (indifferent ? [] : rec.slice(1)).map(r => ({ name: r.player.name,
      position: r.player.position, marginal: r.marginal })),
  });
});

const shape = {};
roster.forEach(p => { shape[p.position] = (shape[p.position] || 0) + 1; });

/* ⚠️ THE HANDOFF TARGET HAS ITS OWN TILT, AND HIDING IT WOULD MAKE THIS PLAN
 * LIE BY OMISSION. Where MLV is indifferent this file defers to `overall_rank`
 * — and our board ranks tight ends far earlier than the market does, so the
 * survivors at pick 108+ are almost all TEs and the deferred picks stack them.
 * That is a property of the BOARD, not of MLV, and it is measured here rather
 * than described, so the number cannot decay (rule 3i). Register 147. */
const tiltPool = pool.filter(p => adpOf(p) < 300);
const mkt = {}, brd = {};
tiltPool.slice().sort((a, b) => adpOf(a) - adpOf(b))
  .forEach((p, i) => { mkt[p.player_id] = i + 1; });
tiltPool.slice().sort((a, b) => (a.overall_rank == null ? 1e9 : a.overall_rank)
  - (b.overall_rank == null ? 1e9 : b.overall_rank))
  .forEach((p, i) => { brd[p.player_id] = i + 1; });
const tiltBy = {};
tiltPool.forEach(p => {
  (tiltBy[p.position] = tiltBy[p.position] || []).push(mkt[p.player_id] - brd[p.player_id]);
});
const boardTilt = {};
Object.keys(tiltBy).sort().forEach(q => {
  const a = tiltBy[q].sort((x, y) => x - y);
  boardTilt[q] = { n: a.length,
    median_ranks_earlier_than_market: a.length % 2
      ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2 };
});

/* the target Cory ruled: the top-3 finishers' measured shape */
const TARGET = { QB: 1.56, RB: 4.78, WR: 5.00, TE: 1.67, K: 1.00, DEF: 1.00 };
const vsTarget = {};
Object.keys(TARGET).forEach(q => {
  vsTarget[q] = { plan: shape[q] || 0, top3_finishers: TARGET[q],
    delta: +(((shape[q] || 0) - TARGET[q]).toFixed(2)) };
});

const doc = {
  _territory: 'TERRITORY: A — draft/tools/mlv_seat_plan.js',
  _what: 'What roster the marginal-lineup-value rule would draft across Cory\'s '
       + 'twelve real picks, K and DEF capped at one each.',
  _cannot: 'THIS IS A PLAN, NOT A PREDICTION. It assumes the market drains in ADP '
         + 'order and that nobody reacts to him. It is what MLV WOULD do against '
         + 'that assumption, not what will happen.',
  _the_cap_is_a_ruling: 'K <= 1 and DEF <= 1 are IMPOSED from Cory\'s words ("I '
    + 'won\'t draft 2 kickers and 2 def"), not discovered. Measured: the cap is '
    + '+45.8/+29.3 against the humans; excluding them entirely is -83.7/-211.3 '
    + 'with 0 of 30 rosters legal (register 134).',
  _rule_reused: 'public/js/draft/mlv.js — the SAME module the live panel calls, '
    + 'so the plan and the panel cannot disagree about what MLV thinks.',
  built_from_board: BOARD.built_at || null,
  board_post_processed: BOARD.post_processed_at || null,
  _the_cliff: 'MLV HAS AN OPINION ABOUT ' + picks.filter(p => p.mlv_has_an_opinion).length
    + ' OF CORY\'S ' + picks.length + ' PICKS AND NONE ABOUT THE REST. Once his nine '
    + 'starting slots are full every remaining player is worth exactly 0 to it, so '
    + 'those picks are stamped `chosen_by: "board rank — MLV is indifferent"` rather '
    + 'than dressed up as recommendations. Register 146.',
  my_picks: MY_PICKS,
  keepers: keepers.map(k => ({ name: k.name, position: k.position })),
  picks,
  mlv_opinion_picks: picks.filter(p => p.mlv_has_an_opinion).length,
  mlv_indifferent_from_pick: indifferentFrom,
  _board_rank_tilt_note: 'Ranks EARLIER on our board than the market, by position, '
    + 'median over players with ADP < 300. The indifferent picks defer to board rank, '
    + 'so this tilt is what fills them — TE stacking below is a BOARD property, not an '
    + 'MLV opinion. Register 147.',
  board_rank_tilt: boardTilt,
  final_shape: shape,
  vs_top3_finishers: vsTarget,
};
fs.writeFileSync(path.join(ROOT, 'public', 'mlv_plan.json'), JSON.stringify(doc, null, 1));

console.log('\n  WHAT MLV WOULD DRAFT YOU — K and DEF capped at 1 (your rule)\n');
console.log('  keepers: ' + keepers.map(k => k.name + ' (' + k.position + ')').join(', '));
console.log('');
let saidCliff = false;
picks.forEach(p => {
  if (p.none) { console.log('  pick ' + p.pick + '   — nobody left'); return; }
  if (!p.mlv_has_an_opinion && !saidCliff) {
    saidCliff = true;
    console.log('\n  ── MLV STOPS HERE. Your nine starting slots are full, so all '
      + p.tied_at_zero + ' remaining\n     players are worth exactly 0 to it. Everything below is the '
      + 'BOARD\'s\n     order, not MLV\'s opinion. ──\n');
  }
  console.log('  ' + String(p.pick).padStart(4) + '  ' + p.player.position.padEnd(4)
    + p.player.name.padEnd(24) + 'ADP ' + String(p.player.adp).padStart(5)
    + (p.mlv_has_an_opinion ? '   +' + String(p.marginal).padStart(6) + '   ' + p.why
      : '   ' + String('board #' + p.player.overall_rank).padStart(9) + '   (MLV indifferent)'));
});
if (indifferentFrom != null) {
  console.log('\n  WHY THOSE ARE ALL TIGHT ENDS — it is the BOARD, not MLV. Ranks earlier');
  console.log('  than the market, median, by position:');
  console.log('    ' + Object.entries(boardTilt)
    .map(([q, v]) => q + ' ' + (v.median_ranks_earlier_than_market > 0 ? '+' : '')
      + v.median_ranks_earlier_than_market).join('   '));
  console.log('  Our board is high on TE, so the men still available late ARE tight ends.');
}
console.log('\n  final roster shape: ' + Object.entries(shape)
  .map(([q, n]) => q + ' ' + n).join('  '));
console.log('  vs the TOP-3 FINISHERS you ruled we should match:');
Object.entries(vsTarget).forEach(([q, v]) => {
  const d = v.delta;
  console.log('    ' + q.padEnd(4) + 'plan ' + String(v.plan).padStart(2)
    + '   target ' + String(v.top3_finishers).padStart(5)
    + '   ' + (d > 0 ? '+' : '') + d + (Math.abs(d) >= 1 ? '   <-- off by a body' : ''));
});
console.log('\n  wrote public/mlv_plan.json');
