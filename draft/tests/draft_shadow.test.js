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

console.log('\n%d passed, %d failed', pass, fail);
process.exitCode = fail ? 1 : 0;
