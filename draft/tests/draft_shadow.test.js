// TERRITORY: A
// THE SHADOW ROW'S ARITHMETIC, BY HAND — pure tests, no engine, no I/O.
//
// draft_shadow.js splits like archetype_rooms: an impure driver (board,
// engine, files) around a pure core (row shaping, seat schedules, the seat
// clock). The driver is rehearsed end-to-end by test_draft_shadow.py against
// the real 2025 stream; THIS file pins the core's arithmetic against numbers
// summed by hand, so a driver failure and an arithmetic failure can never
// hide behind each other.
//
// Run: node draft/tests/draft_shadow.test.js
'use strict';
const path = require('path');
const DS = require(path.join(__dirname, '..', 'tools', 'draft_shadow.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 300) : ''))); };

const P = (id, pos, score) => ({ player: { player_id: id, name: 'N' + id, position: pos || 'RB' }, score });
const RECS = [P('a', 'RB', 50.1234), P('b', 'WR', 47.5), P('c', 'TE', 40), P('d', 'QB', null)];
const pickRow = (pid, extra) => Object.assign(
  { pick: 34, team_slot: 3, player_id: pid, player_name: 'N' + pid, position: 'RB' }, extra);

/* ── shapeRow: the graded quantities ───────────────────────────────────────── */
{
  const r = DS.shapeRow(pickRow('c'), RECS, null);
  ck('tool_recommendation is the engine top, slimmed',
    r.tool_recommendation && r.tool_recommendation.player_id === 'a'
      && r.tool_recommendation.score === 50.123,   // 50.1234 -> 3dp
    r.tool_recommendation);
  ck('top3 is exactly the first three entries',
    r.top3.length === 3 && r.top3.map(x => x.player_id).join('') === 'abc', r.top3);
  // BY HAND: 50.1234 - 40 = 10.1234 -> rounded to 3dp = 10.123.
  ck('composite_gap = top score minus the actual player\'s engine score',
    r.composite_gap === 10.123, r.composite_gap);
  ck('actual_rank_in_tool is 1-based', r.actual_rank_in_tool === 3, r);
  ck('a row with a gap carries no gap reason', r.composite_gap_reason === null, r);
}
{
  const r = DS.shapeRow(pickRow('a'), RECS, null);
  ck('taking the tool\'s #1 is gap ZERO, rank 1',
    r.composite_gap === 0 && r.actual_rank_in_tool === 1, r);
}
{
  const r = DS.shapeRow(pickRow('d'), RECS, null);
  ck('an engine-REFUSED actual player gaps null WITH the refusal named',
    r.composite_gap === null && /refused to score/.test(r.composite_gap_reason),
    r.composite_gap_reason);
  ck('…but the tool recommendation itself still records', !!r.tool_recommendation, r);
}
{
  const r = DS.shapeRow(pickRow('zz'), RECS, null);
  ck('an off-board actual player gaps null with "not in the engine pool"',
    r.composite_gap === null && /not in the engine pool/.test(r.composite_gap_reason), r);
  ck('…rank is null, never 0 or -1', r.actual_rank_in_tool === null, r);
}
{
  const r = DS.shapeRow(pickRow('a', { is_keeper: true }), null, 'keeper — not a decision');
  ck('a keeper row records NO recommendation and says why',
    r.tool_recommendation === null && /keeper/.test(r.tool_recommendation_reason), r);
  ck('keeper flags mirror the pick log\'s pair',
    r.is_keeper === true && r.is_selection === false, r);
}
{
  const r = DS.shapeRow(pickRow('a'), [], 'engine returned no recommendations');
  ck('an empty recs list is a reasoned null, not a crash',
    r.tool_recommendation === null && r.composite_gap === null, r);
}
{
  const r = DS.shapeRow(pickRow('c'), RECS, null, { seat: 7, source: 'freeze' });
  ck('seat + seat_source come from the resolved seatInfo',
    r.seat === 7 && r.seat_source === 'freeze', r);
  const r2 = DS.shapeRow({ pick: 1, team_slot: null, player_id: 'c' }, RECS, null,
    { seat: null, source: 'freeze' });
  ck('an unknown seat records seat null and seat_source null (nothing to attribute)',
    r2.seat === null && r2.seat_source === null, r2);
}

/* ── seatSchedules: keeper-consumed slots are NOT decisions ────────────────── */
{
  const sched = DS.seatSchedules({ picks: [
    { overall: 1, slot: 1 }, { overall: 2, slot: 2, keeper_slot: true },
    { overall: 3, slot: 1 }, { overall: 4, slot: 2 },
  ] });
  ck('live picks group by slot, sorted',
    JSON.stringify(sched[1]) === '[1,3]' && JSON.stringify(sched[2]) === '[4]', sched);
  ck('a keeper slot never enters any seat\'s schedule',
    !(sched[2] || []).includes(2), sched);
}

/* ── seatClock: BY HAND against Cory's real live schedule ─────────────────────
 * my_picks = [33,48,53,68,...]; on the clock at 48: the next DIFFERENT pick is
 * 53, two picks remain >= 48 (48 and 53 of this slice), one is behind. */
{
  const c = DS.seatClock([33, 48, 53], 48);
  ck('seatClock at an owned pick: next=53, left=2, index=1',
    c.next_pick === 53 && c.picks_left === 2 && c.pick_index === 1, c);
  const c2 = DS.seatClock([33, 48, 53], 53);
  ck('seatClock at the LAST owned pick: next null, left 1',
    c2.next_pick === null && c2.picks_left === 1 && c2.pick_index === 2, c2);
  const c3 = DS.seatClock([33, 48, 53], 40);
  ck('seatClock between owned picks (2025-geometry mismatch case) still answers',
    c3.next_pick === 48 && c3.picks_left === 2 && c3.pick_index === 1, c3);
  const c4 = DS.seatClock(undefined, 40);
  ck('a seat with no schedule is an honest empty clock, not a crash',
    c4.next_pick === null && c4.picks_left === 0 && c4.pick_index === 0, c4);
}

/* ── shadowPath: the shadow FOLLOWS a redirected pick log ──────────────────── */
{
  const withoutEnv = (fn) => {
    const old = process.env.DRAFT_SHADOW_LOG_PATH;
    delete process.env.DRAFT_SHADOW_LOG_PATH;
    try { return fn(); } finally { if (old !== undefined) process.env.DRAFT_SHADOW_LOG_PATH = old; }
  };
  const p1 = withoutEnv(() => DS.shadowPath(null,
    path.join(__dirname, '..', 'data', 'draft_pick_log_2026.jsonl')));
  ck('default pick log -> the committed shadow artifact path',
    /draft_shadow_2026\.jsonl$/.test(p1), p1);
  const p2 = withoutEnv(() => DS.shadowPath(null, '/tmp/x/dry_run_log.jsonl'));
  ck('redirected pick log -> a _shadow file BESIDE it (dry_run isolation carries over)',
    p2 === '/tmp/x/dry_run_log_shadow.jsonl', p2);
  const old = process.env.DRAFT_SHADOW_LOG_PATH;
  process.env.DRAFT_SHADOW_LOG_PATH = '/tmp/y/explicit.jsonl';
  const p3 = DS.shadowPath(null, '/tmp/x/dry_run_log.jsonl');
  if (old === undefined) delete process.env.DRAFT_SHADOW_LOG_PATH;
  else process.env.DRAFT_SHADOW_LOG_PATH = old;
  ck('DRAFT_SHADOW_LOG_PATH overrides everything but an explicit CLI arg',
    p3 === '/tmp/y/explicit.jsonl', p3);
}

/* ── register 273: BOTH orderings, because they are not the same ordering ───
 *
 * The display list is score-sorted and THEN has rail-flagged K/DEF sunk to the
 * bottom by demoteFlaggedOnesies(). `composite_gap` is measured in score space
 * and `actual_rank_in_tool` in display space, and the row used to emit one of
 * each with nothing saying so. On Cory's real pick 108 that read rank 439 and
 * gap 0.146 for the same player — 437 places apart, both correct.
 *
 * The fixture below is that pick in miniature: a demoted DEF whose SCORE is
 * second best on the board but which sits last in the display order. */
{
  const DEM = [
    { player: { player_id: 'k1', name: 'Top RB', position: 'RB' }, score: 50 },
    { player: { player_id: 'k2', name: 'Mid WR', position: 'WR' }, score: 10 },
    { player: { player_id: 'd1', name: 'Sunk DEF', position: 'DEF' }, score: 49,
      demoted: true },
    { player: { player_id: 'k3', name: 'Unscored', position: 'TE' }, score: null },
  ];
  const r = DS.shapeRow(pickRow('d1', { position: 'DEF' }), DEM, null);
  ck('a DEMOTED pick reports BOTH ranks, and they disagree',
    r.actual_rank_in_tool === 3 && r.actual_rank_by_score === 2, r);
  ck('rank_disagreement is display MINUS score, so a sunk onesie reads positive',
    r.rank_disagreement === 1, r.rank_disagreement);
  ck('the row says the player itself was demoted, not merely that some were',
    r.actual_was_demoted === true && r.demoted_count === 1, r);
  ck('composite_gap is still SCORE space — top 50 minus this DEF 49',
    r.composite_gap === 1, r.composite_gap);
  /* ⚠️ THIS CONTROL FAILED ON ITS FIRST RUN AND THE TEST WAS THE THING THAT
   * WAS WRONG. I first asserted it against the mid WR, expecting score rank 1,
   * but that player has the LOWEST of the three real scores — its score rank
   * is 3, and it disagrees with its display rank too, because the sunk DEF
   * sits between them. The genuinely agreeing case is the man at the top of
   * both orderings. */
  ck('CONTROL: a pick at the top of BOTH orderings has them agree, so the '
    + 'fields above are not just always-different',
    (() => { const u = DS.shapeRow(pickRow('k1'), DEM, null);
      return u.actual_rank_in_tool === 1 && u.actual_rank_by_score === 1
        && u.rank_disagreement === 0 && u.actual_was_demoted === false; })(),
    DS.shapeRow(pickRow('k1'), DEM, null));
  ck('and a player BELOW the sunk onesie in score is lifted by the demotion — '
    + 'the disagreement runs NEGATIVE, not only positive',
    (() => { const u = DS.shapeRow(pickRow('k2', { position: 'WR' }), DEM, null);
      return u.actual_rank_in_tool === 2 && u.actual_rank_by_score === 3
        && u.rank_disagreement === -1; })(), null);
  ck('the note naming which field lives in which space travels ON the row',
    /DISPLAY order/.test(r.rank_orderings_note || ''), r.rank_orderings_note);
  ck('shadow_schema is stamped, so a grader can tell a 2026 row (one ordering) '
    + 'from a row that carries both',
    r.shadow_schema === 2, r.shadow_schema);
}

/* A keeper row has no recommendation at all, so every ranking field must be
 * NULL rather than absent — an undefined read as a rank is a silent wrong
 * grade, which is the whole failure mode register 273 describes. */
{
  const k = DS.shapeRow(pickRow('z', { is_keeper: true }), null, 'keeper');
  ck('a keeper row carries the new fields as explicit nulls, never undefined',
    k.actual_rank_by_score === null && k.rank_disagreement === null
    && k.actual_was_demoted === null && k.demoted_count === null, k);
}

console.log('\n%d passed, %d failed', pass, fail);
process.exitCode = fail ? 1 : 0;
