#!/usr/bin/env node
/* WHAT THE ENGINE'S SCORE DISTRIBUTION LOOKED LIKE AT EACH OF CORY'S PICKS.
 *
 * WHY THIS EXISTS. The 2026 shadow log records a rank and a gap per pick, and
 * those two numbers disagreed in a way that cannot both be true: at pick 108
 * Houston DEF is rank 439 with a composite_gap of 0.146. Either 438 players sit
 * inside a 0.146-wide band — the board is FLAT and rank is meaningless there —
 * or the gap is not measuring what rank implies. Rule 3i: the pair of numbers
 * is not a finding until the distribution behind it has been looked at.
 *
 * KNOWN-ANSWER CONTROL (Rule 3f). Pick 33 is the control, and it runs on every
 * invocation with its result printed. An early board MUST be wide — at pick 33
 * there are elite players left and the spread between the top man and the 400th
 * has to be large. If this tool reports pick 33 as flat, the tool is broken and
 * says so in its exit code rather than publishing a flat late board as a
 * finding. A tool that can only report "flat" cannot distinguish a flat board
 * from a broken probe, which is the exact shape Rule 3e was written for.
 *
 * The engine, the context and the pool are constructed by draft_shadow.js's own
 * code path, not re-implemented here — a second implementation would be a
 * second thing to be wrong, and the question is about the shipped engine.
 *
 * usage: node draft/tools/score_distribution_audit.js [--out PATH]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const SH = require(path.join(ROOT, 'draft', 'tools', 'draft_shadow.js'));

/* The exact load order draft_shadow.js's loadEngine() uses — survival,
 * composite and needrule register themselves on the shared global and engine
 * reads them off it, so requiring engine.js alone gives a DIFFERENT engine
 * from the shipped one. Reproduced rather than exported because the question
 * is about the engine the war room ran. */
global.window = global;
require(path.join(ROOT, 'public', 'js', 'draft', 'survival.js'));
require(path.join(ROOT, 'public', 'js', 'draft', 'composite.js'));
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
require(path.join(ROOT, 'public', 'js', 'draft', 'needrule.js'));
const LC = require(path.join(ROOT, 'draft', 'tools', 'live_context.js'));

const CONTROL_PICK = 33;
/* An early board is "wide" if the top-to-p90 spread clears this. Set from the
 * measured pick-33 spread with a wide margin; it is a floor on sanity, not a
 * tuned threshold. */
const CONTROL_MIN_SPREAD = 5.0;

function readJsonl(p) {
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
}
const q = (sorted, f) => sorted.length
  ? sorted[Math.min(sorted.length - 1, Math.floor(f * (sorted.length - 1)))] : null;

function main(argv) {
  const argOf = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
  const outP = argOf('--out')
    || path.join(ROOT, 'draft', 'data', 'score_distribution_2026.json');

  const freeze = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'draft', 'data', 'pre_draft_freeze_2026.json'), 'utf8'));
  const boardBytes = fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'));
  const board = JSON.parse(boardBytes.toString('utf8'));
  const boardSha = crypto.createHash('sha256').update(boardBytes).digest('hex');
  let wire = null;
  try {
    wire = JSON.parse(fs.readFileSync(
      path.join(ROOT, 'draft', 'data', 'wire_level.json'), 'utf8')).per_week;
  } catch (e) { wire = null; }
  const logRows = readJsonl(path.join(ROOT, 'draft', 'data', 'draft_pick_log_2026.jsonl'));
  if (!logRows.length) throw new Error('REFUSING: empty pick log — nothing to audit.');

  const MY = new Set(freeze.my_picks || []);
  const order = logRows.slice().sort((a, b) => a.pick - b.pick);
  /* ⚠️ KEEPERS ARE NOT IN board.players — THEY ARE IN board.kept_players, AND
   * OMITTING THE SECOND LINE IS SILENT. Without it every keeper enters the
   * seat roster as a STUB carrying {player_id, name, position} and no
   * proj_mean, so the roster-aware terms price a seat that looks full but
   * projects zero. The symptom was not an error: it was a clean table in which
   * every RB the shipped engine recommended had been demoted — Quinshon
   * Judkins read rank 452 against the shadow log's rank 1 for the same pick,
   * on the same board, with the same engine. Caught only by diffing against
   * draft_shadow.js, which reproduces 150/150. */
  const byId = new Map((board.players || []).map(p => [String(p.player_id), p]));
  for (const k of board.kept_players || []) byId.set(String(k.player_id), k);

  /* Seat geometry and per-seat rosters, exactly as the shadow builds them. */
  const pickOrder = (freeze.pick_order || {}).picks || [];
  const slotOfOverall = {};
  for (const p of pickOrder) slotOfOverall[p.overall] = p.slot;
  const schedules = SH.seatSchedules(freeze.pick_order || {});

  const gone = new Set();
  const rosters = {};
  const keepersOf = {};
  const out = [];

  for (const r of order) {
    const pickNo = r.pick;
    const seat = r.team_slot != null ? r.team_slot : slotOfOverall[pickNo];
    const playerRow = byId.get(String(r.player_id))
      || { player_id: String(r.player_id), name: r.player_name, position: r.position };

    if (MY.has(pickNo) && !r.is_keeper && seat != null) {
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
      /* ⚠️ THE FIRST CUT OMITTED THIS AND THE OMISSION WAS INVISIBLE. Without
       * the wire baseline every score shifts, and Quinshon Judkins read rank
       * 452 here against rank 1 in the shadow log for the same pick — a clean,
       * plausible table that disagreed with the shipped artifact. Caught only
       * because the two were compared; nothing about the output looked wrong.
       * The shadow sets this and so must anything claiming to reproduce it. */
      ctx.wireWeekly = wire || ctx.wireWeekly;
      const recs = E.recommend(ctx) || [];
      const scores = recs.map(x => (x && x.score != null ? x.score : null))
        .filter(s => s != null).sort((a, b) => b - a);

      const pid = String(r.player_id);
      const idx = recs.findIndex(x => x && x.player
        && String(x.player.player_id) === pid);
      const inPool = pool.some(p => String(p.player_id) === pid);

      /* ── THE TWO ORDERINGS, WHICH ARE NOT THE SAME ORDERING ─────────────
       * `recs` is the DISPLAY order: score-sorted, then demoteFlaggedOnesies()
       * sinks rail-flagged K/DEF beneath everyone so the board never tops out
       * on a kicker. That is deliberate and good. But `composite_gap` in the
       * shadow log is computed from `score`, which is PRE-demotion, while
       * `actual_rank_in_tool` is the index in the POST-demotion list. Pairing
       * them describes one pick in two incompatible spaces: Houston DEF at
       * pick 108 reads gap 0.146 (2nd best thing on the board) and rank 439
       * (below players scoring -345) at the same time. Both are correct in
       * their own space; together they are a trap. Recorded separately here so
       * a grade can say which one it means. */
      const byScore = recs.filter(x => x && x.score != null)
        .slice().sort((a, b) => b.score - a.score);
      const scoreIdx = byScore.findIndex(x => x && x.player
        && String(x.player.player_id) === pid);
      const demotedCount = recs.filter(x => x && x.demoted).length;

      /* How many players sit within 1 point of the top score — the flatness
       * question stated as a count rather than as a rank. */
      const top = scores.length ? scores[0] : null;
      const within1 = top == null ? null : scores.filter(s => top - s <= 1).length;
      const withinHalf = top == null ? null : scores.filter(s => top - s <= 0.5).length;

      out.push({
        pick: pickNo,
        took: { name: playerRow.name, position: playerRow.position, player_id: pid },
        pool_size: pool.length,
        recs_returned: recs.length,
        scored: scores.length,
        actual_in_pool: inPool,
        actual_in_recs: idx >= 0,
        actual_rank: idx >= 0 ? idx + 1 : null,
        actual_rank_by_score: scoreIdx >= 0 ? scoreIdx + 1 : null,
        rank_disagreement: (idx >= 0 && scoreIdx >= 0) ? (idx - scoreIdx) : null,
        demoted_entries: demotedCount,
        top_score: top,
        p50: q(scores, 0.5), p90: q(scores, 0.9), p99: q(scores, 0.99),
        min_score: scores.length ? scores[scores.length - 1] : null,
        spread_top_to_p90: (top != null && q(scores, 0.9) != null)
          ? +(top - q(scores, 0.9)).toFixed(3) : null,
        players_within_1pt_of_top: within1,
        players_within_half_pt_of_top: withinHalf,
        top3: recs.slice(0, 3).map(x => x && x.player
          ? x.player.position + ' ' + x.player.name + ' (' + x.score + ')' : null),
      });
    }

    /* Advance the world exactly as the draft did — AFTER scoring this pick. */
    gone.add(String(r.player_id));
    if (seat != null) {
      (rosters[seat] = rosters[seat] || []).push(playerRow);
      if (r.is_keeper) (keepersOf[seat] = keepersOf[seat] || []).push(playerRow);
    }
  }

  /* ── THE CONTROLS, RUN AND REPORTED EVERY TIME ────────────────────────── */
  const ctl = out.find(x => x.pick === CONTROL_PICK) || null;
  const widthControl = {
    pick: CONTROL_PICK,
    why: 'An early board must be WIDE. If this reports flat, the probe is '
      + 'broken and its late-board "flat" readings mean nothing.',
    measured_spread_top_to_p90: ctl ? ctl.spread_top_to_p90 : null,
    required_at_least: CONTROL_MIN_SPREAD,
    passed: Boolean(ctl && ctl.spread_top_to_p90 != null
      && ctl.spread_top_to_p90 >= CONTROL_MIN_SPREAD),
  };

  /* ⚠️ THE WIDTH CONTROL ABOVE PASSED WHILE THIS TOOL WAS WRONG AT 7 OF 12
   * PICKS. It only asks whether the numbers are spread out, which a broken
   * probe satisfies easily. THIS is the control that caught the defect: the
   * shipped shadow log already records what the engine said at every pick, so
   * a tool claiming to re-run that engine must land on the same #1. Anything
   * else means the reproduction is wrong, not that the engine changed. */
  const shadow = readJsonl(path.join(ROOT, 'draft', 'data', 'draft_shadow_2026.jsonl'));
  const cmp = [];
  for (const r of out) {
    const s = shadow.find(x => x.pick_no === r.pick);
    if (!s || !s.top3 || !s.top3.length) continue;
    const theirs = s.top3[0].position + ' ' + s.top3[0].name;
    const mine = (r.top3[0] || '').replace(/ \(.*$/, '');
    cmp.push({ pick: r.pick, mine, theirs, agree: mine === theirs,
      my_rank: r.actual_rank, shadow_rank: s.actual_rank_in_tool });
  }
  const disagree = cmp.filter(x => !x.agree);
  const reproductionControl = {
    why: 'draft_shadow_2026.jsonl is what the engine actually told Cory. This '
      + 'tool re-runs that engine, so its #1 must match at every pick. A '
      + 'mismatch indicts THIS tool, never the log.',
    compared: cmp.length,
    agreed: cmp.length - disagree.length,
    disagreed: disagree.map(x => x.pick),
    passed: cmp.length > 0 && disagree.length === 0,
  };

  const control = {
    width: widthControl,
    reproduces_shadow_log: reproductionControl,
    all_passed: widthControl.passed && reproductionControl.passed,
  };

  const doc = {
    _what: 'Engine score distribution at each of Cory\'s 12 live picks, 2026.',
    _why: 'Rule 3i — rank 439 with a gap of 0.146 at pick 108 is two numbers '
      + 'that cannot both mean what they appear to. This is the population '
      + 'behind them.',
    generated_from: {
      board_sha256: boardSha,
      board_built_at: board.built_at || null,
      freeze_sha256: freeze._sha256_of_payload,
      pick_log_rows: logRows.length,
    },
    control,
    picks: out,
  };
  fs.writeFileSync(outP, JSON.stringify(doc, null, 2) + '\n');

  /* ── REPORT ───────────────────────────────────────────────────────────── */
  console.log('SCORE DISTRIBUTION AT CORY\'S PICKS — 2026\n');
  console.log('CONTROL 1 (width)   pick %d spread top→p90 = %s (needs ≥ %s) — %s',
    widthControl.pick, String(widthControl.measured_spread_top_to_p90),
    CONTROL_MIN_SPREAD, widthControl.passed ? 'PASS' : '*** FAIL ***');
  console.log('CONTROL 2 (reproduces the shadow log) %d of %d picks agree — %s',
    reproductionControl.agreed, reproductionControl.compared,
    reproductionControl.passed ? 'PASS'
      : '*** FAIL at ' + reproductionControl.disagreed.join(', ') + ' ***');
  if (!control.all_passed) {
    console.log('\nA control FAILED. Every reading below is untrustworthy and '
      + 'nothing here may be written down as a finding.');
  }
  console.log('\npick | took                  | top    | p90    | spread | '
    + '≤1pt | ≤.5pt | rank   | recs');
  for (const r of out) {
    console.log('%s | %s | %s | %s | %s | %s | %s | %s | %s',
      String(r.pick).padStart(4),
      (r.took.position + ' ' + r.took.name).slice(0, 21).padEnd(21),
      String(r.top_score).padStart(6),
      String(r.p90).padStart(6),
      String(r.spread_top_to_p90).padStart(6),
      String(r.players_within_1pt_of_top).padStart(4),
      String(r.players_within_half_pt_of_top).padStart(5),
      String(r.actual_rank == null
        ? (r.actual_in_pool ? 'NOT-REC' : 'NOT-POOL') : r.actual_rank).padStart(6),
      String(r.recs_returned).padStart(4));
  }
  console.log('\nwrote %s', path.relative(ROOT, outP));
  return control.all_passed ? 0 : 1;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { main };
