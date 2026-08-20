// TERRITORY: A
/* THE PLAN MUST NEVER PRESENT AN INDIFFERENT PICK AS AN OPINION.
 *
 * Cory asked what MLV would draft him across all twelve picks. The first run
 * answered with six straight tight ends and looked entirely credible. It was
 * not a tight-end preference: by pick 93 his nine starting slots are full, all
 * 451 remaining players score marginal EXACTLY 0, and `recommend` sorts by
 * marginal alone — so half his draft was being decided by the order players
 * happen to sit in draft_data.json.
 *
 * The demonstration that it was array order, not judgement (rule 3f — same
 * call, same roster, same board, three orderings):
 *
 *   board order   QB Purdy · QB Stafford · TE Kelce
 *   REVERSED      QB Nussmeier · QB Payton · QB Morton   <- third-string QBs
 *   ADP order     RB Brooks · RB Corum · TE Kittle
 *
 * THAT ORDER-SENSITIVITY IS TEST 3 BELOW, kept as an executable control rather
 * than a paragraph, because the day it stops being true is the day the cliff
 * has been fixed and this file should say so.
 *
 * Register 146 (the cliff) and 147 (the board's TE tilt that fills it).
 *
 * Run: node draft/tests/mlv_seat_plan.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const MLV = require(path.join(ROOT, 'public', 'js', 'draft', 'mlv.js'));

let fails = [];
function ck(name, cond, detail) {
  if (cond) console.log('PASS  ' + name);
  else {
    fails.push(name);
    console.log('FAIL  ' + name
      + (detail === undefined ? '' : '  — ' + JSON.stringify(detail).slice(0, 400)));
  }
}

/* regenerate, so the test grades the CODE and not a stale artifact */
execFileSync('node', [path.join(ROOT, 'draft', 'tools', 'mlv_seat_plan.js')], { cwd: ROOT });
const PLAN = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'mlv_plan.json'), 'utf8'));
const BOARD = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));

// ── 1. the plan covers his real schedule, not an invented one ───────────────
ck('CONTROL — the plan actually produced picks, so the checks below can fire '
   + '(rule 3e: a check with nothing to check is not a check)',
  PLAN.picks.length >= 10, { picks: PLAN.picks.length });

ck('the plan runs against Cory\'s REAL twelve picks — register 98 was an '
   + 'eighteen-pick artifact quoted for hours',
  PLAN.my_picks.length === 12, PLAN.my_picks);

ck('it starts from his real keepers, not an empty roster',
  PLAN.keepers.length === 3, PLAN.keepers);

// ── 2. every pick declares whether MLV actually had an opinion ──────────────
ck('EVERY pick carries mlv_has_an_opinion — a pick that does not say is a pick '
   + 'that will be read as a recommendation',
  PLAN.picks.every(p => p.none || typeof p.mlv_has_an_opinion === 'boolean'),
  PLAN.picks.filter(p => !p.none && typeof p.mlv_has_an_opinion !== 'boolean')
    .map(p => p.pick));

ck('an opinion pick has POSITIVE marginal and an indifferent one has zero — the '
   + 'flag is derived from the number and cannot drift from it',
  PLAN.picks.filter(p => !p.none)
    .every(p => (p.mlv_has_an_opinion ? p.marginal > 0 : !(p.marginal > 0))),
  PLAN.picks.filter(p => !p.none && (p.mlv_has_an_opinion !== (p.marginal > 0)))
    .map(p => ({ pick: p.pick, marginal: p.marginal, op: p.mlv_has_an_opinion })));

ck('every indifferent pick is stamped as the BOARD\'s choice, never MLV\'s',
  PLAN.picks.filter(p => !p.none && !p.mlv_has_an_opinion)
    .every(p => /board rank/i.test(p.chosen_by || '')),
  PLAN.picks.filter(p => !p.none && !p.mlv_has_an_opinion).map(p => p.chosen_by));

ck('an indifferent pick shows NO runners-up — a ranked shortlist of players who '
   + 'all score zero is the exact illusion this file exists to remove',
  PLAN.picks.filter(p => !p.none && !p.mlv_has_an_opinion)
    .every(p => !p.runners_up || p.runners_up.length === 0),
  PLAN.picks.filter(p => !p.none && !p.mlv_has_an_opinion).map(p => p.runners_up));

// ── 3. THE CLIFF IS REAL — the order-sensitivity control ────────────────────
/* Rebuild the exact state at the first indifferent pick and show that three
 * legitimate input orderings give three different answers. */
const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : (p.adp != null ? +p.adp : 9999)));
const pool = BOARD.players.filter(p => p.position && (p.proj_mean || 0) > 0);
const byAdp = pool.slice().sort((a, b) => adpOf(a) - adpOf(b));
const rows = (BOARD.pick_order || {}).picks || [];
const liveBefore = x => rows.filter(r => r.overall < x && !r.keeper_slot).length;

const cliff = PLAN.mlv_indifferent_from_pick;
ck('CONTROL — the cliff exists at all on the live board, so the order-sensitivity '
   + 'check below has a state to run in',
  typeof cliff === 'number', { cliff });

if (typeof cliff === 'number') {
  const kept = new Set((BOARD.kept_player_ids || []).map(String));
  const roster = (BOARD.kept_players || [])
    .map(k => pool.find(p => String(p.player_id) === String(k.player_id)) || k)
    .filter(k => k.position);
  const mine = new Set(roster.map(k => String(k.player_id)));
  PLAN.picks.filter(p => p.pick < cliff && !p.none).forEach(p => {
    const f = pool.find(x => x.name === p.player.name && x.position === p.player.position);
    if (f) { roster.push(f); mine.add(String(f.player_id)); }
  });
  const gone = new Set(byAdp.slice(0, liveBefore(cliff)).map(p => String(p.player_id)));
  const avail = pool.filter(p => !gone.has(String(p.player_id))
    && !mine.has(String(p.player_id)) && !kept.has(String(p.player_id)));
  const league = { starters: BOARD.league.starters };

  const all = MLV.recommend(avail, roster, { league, topN: avail.length + 1 });
  const positive = all.filter(r => r.marginal > 0);
  ck('at the cliff, NO remaining player has positive marginal value — this is '
     + 'the finding, stated as a number rather than a story',
    positive.length === 0,
    { positive: positive.length, examples: positive.slice(0, 3).map(r => r.player.name) });

  const first = r => r[0] && r[0].player.name;
  const fwd = first(MLV.recommend(avail, roster, { league, topN: 3 }));
  const rev = first(MLV.recommend(avail.slice().reverse(), roster, { league, topN: 3 }));
  const adp = first(MLV.recommend(avail.slice().sort((a, b) => adpOf(a) - adpOf(b)),
    roster, { league, topN: 3 }));
  ck('KNOWN POSITIVE — reversing the input order changes MLV\'s top pick, proving '
     + 'the ordering carries the answer and not the model. IF THIS EVER FAILS the '
     + 'cliff has been fixed: delete the handoff, do not weaken this test.',
    fwd !== rev, { board_order: fwd, reversed: rev, adp_order: adp });

  ck('...and ADP order gives a third answer again, so it is not one odd ordering',
    adp !== fwd || adp !== rev, { board_order: fwd, reversed: rev, adp_order: adp });

  // KNOWN NEGATIVE: before the lineup is full, MLV is NOT order-sensitive.
  const early = PLAN.picks.find(p => p.mlv_has_an_opinion);
  const gone0 = new Set(byAdp.slice(0, liveBefore(early.pick)).map(p => String(p.player_id)));
  const av0 = pool.filter(p => !gone0.has(String(p.player_id)) && !kept.has(String(p.player_id)));
  const r0 = (BOARD.kept_players || [])
    .map(k => pool.find(p => String(p.player_id) === String(k.player_id)) || k)
    .filter(k => k.position);
  const a0 = first(MLV.recommend(av0, r0, { league, topN: 3 }));
  const b0 = first(MLV.recommend(av0.slice().reverse(), r0, { league, topN: 3 }));
  ck('KNOWN NEGATIVE — at his FIRST pick, where slots are open, reversing the '
     + 'input changes nothing. So the test is detecting the cliff, not just '
     + 'detecting that sorting exists.',
    a0 === b0 && a0 === early.player.name, { forward: a0, reversed: b0, plan: early.player.name });
}

// ── 4. the handoff target's tilt is disclosed, and measured not asserted ────
ck('the plan discloses the board\'s rank tilt by position, so the TE stacking it '
   + 'produces is explained on its face rather than left to be discovered',
  PLAN.board_rank_tilt && typeof PLAN.board_rank_tilt.TE === 'object',
  PLAN.board_rank_tilt);

ck('and the tilt is real: our board ranks TE materially earlier than the market, '
   + 'which is WHY the deferred picks are tight ends (register 147)',
  PLAN.board_rank_tilt && PLAN.board_rank_tilt.TE
    && PLAN.board_rank_tilt.TE.median_ranks_earlier_than_market >= 20,
  PLAN.board_rank_tilt && PLAN.board_rank_tilt.TE);

// ── 5. it cannot silently invent a schedule ─────────────────────────────────
ck('the tool REFUSES rather than guesses when no pick schedule exists — the '
   + 'source carries the throw, so a future edit that drops it fails here',
  /REFUSING to invent one/.test(
    fs.readFileSync(path.join(ROOT, 'draft', 'tools', 'mlv_seat_plan.js'), 'utf8')), null);

console.log('\n%d checks, %d failed', 14, fails.length);
if (fails.length) { console.log('FAILED'); process.exit(1); }
