#!/usr/bin/env node
// TERRITORY: A
/* THE DRAFT-NIGHT SHADOW LEDGER — the tool's recommendation recorded at EVERY
 * pick of the real draft, for every seat, as the pick lands.
 *
 * Cory's ruling (2026-08-16, "Do 2"): today only Cory's picks get graded. One
 * draft night is ~150 picks by ten managers, and every one of them is a
 * room-vs-tool disagreement the January grading could score — IF the tool's
 * recommendation at that moment was written down before the outcome existed.
 * This file writes it down. One night becomes ~150 graded predictions instead
 * of 12.
 *
 * ── CAPTURE, NOT RECONSTRUCTION (log_draft_picks.py's own doctrine) ─────────
 *
 * Each row is computed AT THE MOMENT THE PICK IS LOGGED, from:
 *   - the SHIPPED board (public/draft_data.json — the exact artifact the war
 *     room reads, sha256-stamped into every row and checked against the
 *     freeze's source_artifact_sha256 so drift is recorded, never silent);
 *   - the remaining pool = board minus every player in the pick log BEFORE
 *     this pick (the log is contiguity-guarded upstream, so the gone-set
 *     cannot have holes);
 *   - the REAL engine: E.recommend() through live_context.js, MEASURED
 *     weights, the same wire_level supply archetype_rooms.js uses — never a
 *     reimplementation. The seat's roster/keepers/schedule are that seat's,
 *     so the row records what the tool would have told THAT manager.
 *
 * Deterministic given (board, wire_level, freeze, pick log): re-running over
 * the same inputs reproduces every row byte-for-byte except `captured_at`.
 * The timestamp is the forward guarantee — a row stamped during the draft is
 * a prediction; the same numbers recomputed in January would be a claim about
 * what the tool would have said, which is the class of claim this repo has
 * been wrong about four times.
 *
 * ── WHAT A ROW IS ───────────────────────────────────────────────────────────
 *
 *   { pick_no, seat, actual_player, tool_recommendation, top3, composite_gap,
 *     actual_rank_in_tool, is_keeper, captured_at, freeze_sha256,
 *     board_sha256, board_matches_freeze_source, engine, seat_schedule }
 *
 *   composite_gap = engine top score − engine score of the player actually
 *   taken, from the SAME recommendation list (≥ 0; 0 = the room did what the
 *   tool said). null carries a reason, never silence: a keeper is not a
 *   decision, an unknown seat cannot be given a roster, an unscored player
 *   cannot be gapped.
 *
 * ── OPERATION ───────────────────────────────────────────────────────────────
 *
 * ZERO new operator steps: log_draft_picks.py --sync invokes `--sync` here
 * after every append, passing its own (possibly overridden) log path, so the
 * shadow file always sits beside the pick log it shadows. Append-only,
 * idempotent: picks already shadowed are skipped, a duplicate pick_no REFUSES.
 *
 * Run:  node draft/tools/draft_shadow.js --sync [--pick-log P] [--out P]
 *                                        [--limit N]
 *       node draft/tools/draft_shadow.js --status [--pick-log P] [--out P]
 * Env:  DRAFT_PICK_LOG_PATH / DRAFT_SHADOW_LOG_PATH (same override contract
 *       as log_draft_picks.py — the workflow dry_run isolation carries over).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..');

/* ── the pure row arithmetic (no I/O, no engine) — unit-tested by hand ────── */

/** Slim a rec entry to the fields a graded row needs. */
function slim(rec) {
  if (!rec || !rec.player) return null;
  return {
    player_id: String(rec.player.player_id),
    name: rec.player.name,
    position: rec.player.position,
    score: rec.score == null ? null : Math.round(rec.score * 1000) / 1000,
  };
}

/**
 * Shape one shadow row from the engine's ranked list. PURE.
 * @param pickRow  the pick-log row ({pick, team_slot, player_id, ...})
 * @param recs     E.recommend()'s list for this seat at this pick, or null
 *                 with `reason` when no recommendation exists (keeper /
 *                 unknown seat).
 * @param seatInfo {seat, source} — resolved seat identity (the log's own
 *                 team_slot, or the freeze's snake geometry as fallback).
 */
function shapeRow(pickRow, recs, reason, seatInfo) {
  const si = seatInfo || { seat: pickRow.team_slot != null ? pickRow.team_slot : null,
    source: 'pick log' };
  const row = {
    pick_no: pickRow.pick,
    seat: si.seat,
    seat_source: si.seat == null ? null : si.source,
    actual_player: {
      player_id: String(pickRow.player_id),
      name: pickRow.player_name != null ? pickRow.player_name : null,
      position: pickRow.position != null ? pickRow.position : null,
    },
    is_keeper: Boolean(pickRow.is_keeper),
    is_selection: !pickRow.is_keeper,
    tool_recommendation: null,
    tool_recommendation_reason: null,
    top3: null,
    composite_gap: null,
    composite_gap_reason: null,
    actual_rank_in_tool: null,
  };
  if (!recs || !recs.length) {
    row.tool_recommendation_reason = reason
      || 'engine returned no recommendations';
    row.composite_gap_reason = row.tool_recommendation_reason;
    return row;
  }
  row.tool_recommendation = slim(recs[0]);
  row.top3 = recs.slice(0, 3).map(slim);
  const pid = String(pickRow.player_id);
  const idx = recs.findIndex(r => r && r.player
    && String(r.player.player_id) === pid);
  if (idx < 0) {
    row.composite_gap_reason = 'actual player not in the engine pool at this '
      + 'pick (not on the shipped board, or already gone) — nothing to gap';
    return row;
  }
  row.actual_rank_in_tool = idx + 1;
  const top = recs[0].score, act = recs[idx].score;
  if (top == null || act == null) {
    row.composite_gap_reason = 'engine refused to score '
      + (top == null ? 'its own top entry' : 'the actual player')
      + ' (no projection) — a gap against a refusal would be a number about nothing';
    return row;
  }
  row.composite_gap = Math.round((top - act) * 1000) / 1000;
  return row;
}

/** Per-seat LIVE pick schedule from the freeze's pick_order (keeper-consumed
 *  slots excluded — nobody decides anything at those). slot -> sorted overalls. */
function seatSchedules(pickOrder) {
  const bySlot = {};
  for (const p of ((pickOrder || {}).picks) || []) {
    if (p.keeper_slot) continue;
    (bySlot[p.slot] || (bySlot[p.slot] = [])).push(p.overall);
  }
  for (const k of Object.keys(bySlot)) bySlot[k].sort((a, b) => a - b);
  return bySlot;
}

/** {next_pick, picks_left, pick_index} for a seat at a given overall pick. */
function seatClock(schedule, pickNo) {
  const sched = schedule || [];
  const next = sched.find(n => n > pickNo);
  return {
    next_pick: next != null ? next : null,
    picks_left: sched.filter(n => n >= pickNo).length,
    pick_index: sched.filter(n => n < pickNo).length,
  };
}

/* ── the driver (I/O + engine; the impure shell around the pure core) ─────── */

function loadEngine() {
  // The exact load order archetype_rooms.js proved: survival + composite +
  // needrule register themselves; engine reads them off the shared global.
  global.window = global;
  require(path.join(ROOT, 'public', 'js', 'draft', 'survival.js'));
  require(path.join(ROOT, 'public', 'js', 'draft', 'composite.js'));
  const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
  require(path.join(ROOT, 'public', 'js', 'draft', 'needrule.js'));
  const LC = require(path.join(ROOT, 'draft', 'tools', 'live_context.js'));
  return { E, LC };
}

function readJsonl(p) {
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split('\n')
    .filter(l => l.trim()).map(l => JSON.parse(l));
}

/**
 * Compute the shadow rows for every pick-log row not yet shadowed.
 * Walks the WHOLE log in order (state — gone-set, seat rosters — accretes
 * from row 1 even over already-shadowed picks, so an incremental run and a
 * from-scratch run see identical state at every pick).
 */
function computeShadow(opts) {
  const { E, LC } = opts.engine;
  const board = opts.board;
  const freeze = opts.freeze;
  const logRows = opts.logRows;
  const existing = opts.existing;          // Set of already-shadowed pick_nos
  const limit = opts.limit == null ? Infinity : opts.limit;
  const nowIso = opts.nowIso || (() => new Date().toISOString());

  const byId = new Map(board.players.map(p => [String(p.player_id), p]));
  for (const k of board.kept_players || []) byId.set(String(k.player_id), k);
  const schedules = seatSchedules(freeze.pick_order);
  const boardMatchesFreeze = opts.boardSha === freeze.source_artifact_sha256;
  /* SEAT FALLBACK: Sleeper's slot_to_roster_id mapping has been observed empty
   * on a real draft (the stored 2025 stream carries `{}` and every
   * draft_slot is null), which would leave EVERY seat unknown and every
   * shadow row reasonless. The freeze's pick_order already states which SEAT
   * owns each overall pick — that is snake geometry, fixed before the draft —
   * so an unmapped row falls back to it, with the source recorded on the row.
   * Verified against the 2025 stream: overall->slot maps each roster_id to
   * exactly one seat across all 150 picks. */
  const slotOfOverall = {};
  for (const p of ((freeze.pick_order || {}).picks) || []) {
    slotOfOverall[p.overall] = p.slot;
  }

  const gone = new Set();
  const rosters = {};                       // seat -> [player rows]
  const keepersOf = {};                     // seat -> [player rows kept]
  const rows = [];
  let considered = 0;

  for (const r of logRows) {
    const pickNo = r.pick;
    const fromLog = r.team_slot != null;
    const seat = fromLog ? r.team_slot
      : (slotOfOverall[pickNo] != null ? slotOfOverall[pickNo] : null);
    const seatSource = fromLog ? 'pick log (sleeper slot mapping)'
      : 'pre_draft_freeze pick_order (snake geometry)';
    const pid = String(r.player_id);
    const playerRow = byId.get(pid)
      || { player_id: pid, name: r.player_name, position: r.position };

    if (!existing.has(pickNo) && rows.length < limit) {
      considered += 1;
      let recs = null, reason = null;
      if (r.is_keeper) {
        reason = 'keeper — not a decision anybody made; the player leaves the '
          + 'pool but there is nothing to grade a recommendation against';
      } else if (seat == null) {
        reason = 'seat unknown (no team_slot on the pick-log row) — no roster '
          + 'or schedule to recommend for';
      } else {
        const clock = seatClock(schedules[seat], pickNo);
        const pool = board.players.filter(p => !gone.has(String(p.player_id)));
        const intervening = (((freeze.pick_order || {}).picks) || [])
          .filter(p => !p.keeper_slot && p.slot !== seat
            && p.overall >= pickNo
            && p.overall < (clock.next_pick != null ? clock.next_pick : pickNo))
          .map(p => ({ team_slot: p.slot, pick_no: p.overall,
            roster: [], profile: null }));
        const ctx = LC.liveContext({
          currentPick: pickNo,
          nextPick: clock.next_pick != null ? clock.next_pick : pickNo,
          board: pool,
          data: board,
          roster: rosters[seat] || [],
          currentKeepers: keepersOf[seat] || [],
          myPicksLeft: Math.max(1, clock.picks_left),
          myPickIndex: clock.pick_index,
          intervening,
        });
        ctx.wireWeekly = opts.wire || ctx.wireWeekly;
        recs = E.recommend(ctx);
      }
      const row = shapeRow(r, recs, reason, { seat, source: seatSource });
      row.engine = {
        method: 'engine-shadow-v1',
        weights: 'MEASURED_WEIGHTS',
        wire_bench: Boolean(opts.wire),
      };
      if (seat != null && !r.is_keeper) {
        const clock = seatClock(schedules[seat], pickNo);
        row.seat_schedule = {
          next_pick: clock.next_pick, picks_left: clock.picks_left,
          source: 'pre_draft_freeze pick_order (keeper slots excluded)',
        };
      }
      row.captured_at = nowIso();
      row.freeze_sha256 = freeze._sha256_of_payload;
      row.board_sha256 = opts.boardSha;
      row.board_matches_freeze_source = boardMatchesFreeze;
      rows.push(row);
    }

    // State accretes over EVERY row, shadowed or not.
    gone.add(pid);
    if (seat != null) {
      (rosters[seat] || (rosters[seat] = [])).push(playerRow);
      if (r.is_keeper) (keepersOf[seat] || (keepersOf[seat] = [])).push(playerRow);
    }
  }
  return { rows, considered, log_total: logRows.length };
}

/* ── paths + CLI ──────────────────────────────────────────────────────────── */

function pickLogPath(cliArg) {
  return cliArg || process.env.DRAFT_PICK_LOG_PATH
    || path.join(ROOT, 'draft', 'data', 'draft_pick_log_2026.jsonl');
}

function shadowPath(cliArg, logP) {
  if (cliArg) return cliArg;
  if (process.env.DRAFT_SHADOW_LOG_PATH) return process.env.DRAFT_SHADOW_LOG_PATH;
  const defaultLog = path.join(ROOT, 'draft', 'data', 'draft_pick_log_2026.jsonl');
  if (path.resolve(logP) === path.resolve(defaultLog)) {
    return path.join(ROOT, 'draft', 'data', 'draft_shadow_2026.jsonl');
  }
  // A redirected pick log gets a shadow BESIDE it — the dry_run isolation of
  // draft-night-sync.yml carries over without the workflow knowing this file
  // exists.
  const ext = path.extname(logP);
  return logP.slice(0, logP.length - ext.length) + '_shadow' + ext;
}

function syncCli(argv) {
  const argOf = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
  const logP = pickLogPath(argOf('--pick-log'));
  const outP = shadowPath(argOf('--out'), logP);
  const limit = argOf('--limit') != null ? Number(argOf('--limit')) : null;

  const freezeP = path.join(ROOT, 'draft', 'data', 'pre_draft_freeze_2026.json');
  if (!fs.existsSync(freezeP)) {
    throw new Error('REFUSING: no pre-draft freeze. A shadow row not joined to '
      + 'the frozen prediction set cannot be graded against anything.');
  }
  const freeze = JSON.parse(fs.readFileSync(freezeP, 'utf8'));
  const boardBytes = fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'));
  const board = JSON.parse(boardBytes.toString('utf8'));
  const boardSha = crypto.createHash('sha256').update(boardBytes).digest('hex');
  let wire = null;
  try {
    wire = JSON.parse(fs.readFileSync(
      path.join(ROOT, 'draft', 'data', 'wire_level.json'), 'utf8')).per_week;
  } catch (e) { wire = null; }   // recorded per-row via engine.wire_bench

  const logRows = readJsonl(logP);
  const shadowRows = readJsonl(outP);
  const existing = new Set(shadowRows.map(x => x.pick_no));

  const out = computeShadow({
    engine: loadEngine(), board, freeze, wire, logRows, existing,
    boardSha, limit,
  });

  // Append-only, duplicate-refusing — same contract as the pick log.
  const lines = [];
  for (const row of out.rows) {
    if (existing.has(row.pick_no)) {
      throw new Error('REFUSING: pick ' + row.pick_no + ' is already shadowed. '
        + 'Rewriting a recommendation after the pick is known is exactly the '
        + 'reconstruction this file exists to make impossible.');
    }
    existing.add(row.pick_no);
    lines.push(JSON.stringify(sortedRow(row)));
  }
  if (lines.length) fs.appendFileSync(outP, lines.join('\n') + '\n');

  const total = shadowRows.length + lines.length;
  return {
    ok: true, added: lines.length, considered: out.considered,
    shadow_total: total, log_total: out.log_total,
    lag: Math.max(0, out.log_total - total),
    out: path.relative(ROOT, outP),
  };
}

/* Keys sorted per row, matching log_draft_picks.py's sort_keys=True habit:
 * a diff between two runs is then a diff of content, never of key order. */
function sortedRow(row) {
  const o = {};
  for (const k of Object.keys(row).sort()) o[k] = row[k];
  return o;
}

function statusCli(argv) {
  const argOf = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
  const logP = pickLogPath(argOf('--pick-log'));
  const outP = shadowPath(argOf('--out'), logP);
  const logRows = readJsonl(logP);
  const shadowRows = readJsonl(outP);
  const logPicks = new Set(logRows.map(r => r.pick));
  const shadowPicks = shadowRows.map(r => r.pick_no);
  const dupes = shadowPicks.length - new Set(shadowPicks).size;
  const orphans = shadowPicks.filter(p => !logPicks.has(p));
  const gapped = shadowRows.filter(r => r.composite_gap != null).length;
  const agreed = shadowRows.filter(r => r.composite_gap === 0).length;
  console.log('pick log   : %d picks (%s)', logRows.length, path.relative(ROOT, logP));
  console.log('shadowed   : %d rows (%s)', shadowRows.length, path.relative(ROOT, outP));
  console.log('with a composite gap: %d   room took the tool\'s #1: %d', gapped, agreed);
  if (dupes) { console.log('⚠ %d duplicate shadow pick_no rows', dupes); return 1; }
  if (orphans.length) {
    console.log('⚠ %d shadow rows with no pick-log row: %s', orphans.length,
      JSON.stringify(orphans.slice(0, 8)));
    return 1;
  }
  return 0;
}

function main(argv) {
  if (argv.includes('--status')) return statusCli(argv);
  if (argv.includes('--sync')) {
    console.log(JSON.stringify(syncCli(argv)));
    return 0;
  }
  console.log('usage: draft_shadow.js --sync [--pick-log P] [--out P] [--limit N] | --status');
  return 2;
}

module.exports = { shapeRow, seatSchedules, seatClock, computeShadow,
  shadowPath, pickLogPath, slim };

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}
