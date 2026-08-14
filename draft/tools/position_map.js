// TERRITORY: A
/* ONE POSITION MAP, BECAUSE SIX COPIES DRIFTED INTO THE SAME DEFECT THREE TIMES.
 *
 * A measurement about 2023-2025 must not be computed through the LIVE 2026
 * board. A player who was on a roster in 2023 and has since retired is not
 * absent from 2023 — he is absent from the board, and joining history to the
 * board silently deletes him from a sample that is about him.
 *
 * ── THE SAME BUG, THREE ANNOUNCEMENTS ─────────────────────────────────────
 *
 *   1. `wire_level.js` — found and fixed. Scored acquisitions 422 -> 417, the
 *      RB wire 7.80 -> 7.95, in the FLATTERING direction, because a waiver add
 *      who washes out of the league is exactly the one who scored badly.
 *   2. `waiver_replacement.py` — same defect, C's module, same fix.
 *   3. Five more, swept by C on a clean origin/main worktree, every one
 *      building its own map from `draft_data.json`:
 *        waiver_supply.js  roster_shape.js  lineup_skill.js
 *        opponent_persistence.js  value_anchor_independent.js
 *
 * `positionMap()` in wire_level.js carried the comment "so the coupling cannot
 * come back silently a third time". IT CAME BACK FIVE TIMES, and a comment is
 * why: the fix was a local edit and the lesson was a sentence beside it.
 *
 * ── THREE OF THE FIVE CHANGE CONCLUSIONS, NOT DIGITS ──────────────────────
 *
 * Measured against a pruned board (1,841 -> 683):
 *   lineup_skill          458 team-weeks -> 315 — 31% of the sample gone
 *   roster_shape          the RB/WR "SHED in-season" verdict DISAPPEARS
 *   opponent_persistence  2024 +1.6pp -> +3.1pp, 2025 +0.0pp -> -0.8pp (SIGN FLIP)
 *   waiver_supply         3 of 6 verdicts flip — RB and QB from "replaceable"
 *                         to "OWNED — the wire is thin here", K the other way.
 *                         That is draft-day advice about whether to spend a
 *                         pick on a backup.
 *
 * THE PRUNE IS THE REVEALER, NOT THE CAUSE. `waiver_supply` already drops 9
 * historical ids today and `value_anchor_independent` already loses 1 of 480,
 * and both print it as a data quirk rather than a defect.
 *
 * ── WHAT THIS CHANGES TODAY: NOTHING, AND THAT IS THE POINT ───────────────
 *
 * `player_positions.json` is a union over builds and the board has not been
 * pruned yet, so today it holds exactly the board's ids and adds nothing. The
 * six tools produce byte-identical output before and after this extraction —
 * asserted in position_map.test.js, because a refactor that moves a number is
 * not a refactor. It becomes load-bearing the moment the board shrinks for ANY
 * reason, which is the next rebuild after C lands the inactive prune.
 *
 * Run: node draft/tools/position_map.js     (prints coverage and provenance)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

const HIST_PATH = path.join(ROOT, 'draft', 'data', 'player_positions.json');
const BOARD_PATH = path.join(ROOT, 'public', 'draft_data.json');

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return {}; }
}

/* THE MERGE IS A PURE FUNCTION SO THE ORDER CAN BE TESTED, and it is separate
 * for exactly one reason: the ordering property is VACUOUS against real data.
 *
 * `player_positions.json` is written by build.py FROM the board, so today the
 * record and the board agree on every id and "the board wins where they
 * disagree" cannot be observed — a mutation that reversed the precedence passed
 * the whole suite. An assertion that holds whether or not the code under test
 * runs is not an assertion, and this repo has shipped that shape often enough
 * to know it by sight.
 *
 * Splitting the merge out lets the test construct the disagreement that reality
 * does not currently supply. It is the same reason `matches_source` is a
 * function rather than an inline diff. */
function mergeMaps(record, boardRows) {
  const m = {};
  let fromHistory = 0, fromBoard = 0;
  Object.keys(record || {}).forEach(id => {
    if (record[id]) { m[id] = record[id]; fromHistory++; }
  });
  (boardRows || []).forEach(p => {
    if (p && p.position && p.player_id != null) {
      m[String(p.player_id)] = p.position;   // BOARD LAST: a correction still lands
      fromBoard++;
    }
  });
  return { map: m, fromHistory: fromHistory, fromBoard: fromBoard };
}

/**
 * id -> position, for HISTORICAL joins.
 *
 * RECORD FIRST, BOARD OVERLAID. The order is the whole design:
 *   - the record is the union of every board ever built, so a retired player
 *     keeps his position and stays in a sample that is about the year he
 *     played;
 *   - the live board goes on top, so a position CORRECTION still lands, and so
 *     a player who is new since the record was last written is still resolved
 *     (today: 3 of them).
 *
 * `kept_players` is included. Keepers are removed from `players` and a keeper
 * is exactly the sort of long-tenured player a historical join needs.
 *
 * `__sources` is non-enumerable so `Object.keys(map)` is still ids only — a
 * provenance field that shows up as a player id is worse than no provenance.
 */
function positionMap() {
  const haveHistory = fs.existsSync(HIST_PATH);
  const record = haveHistory ? (readJson(HIST_PATH).positions || {}) : {};
  const board = readJson(BOARD_PATH);
  const rows = [].concat(board.players || [], board.kept_players || []);
  const r = mergeMaps(record, rows);
  Object.defineProperty(r.map, '__sources', {
    value: { history: r.fromHistory, board: r.fromBoard, history_file: haveHistory },
    enumerable: false,
  });
  return r.map;
}

/* A DEFENCE ARRIVES AS A TEAM CODE WHERE EVERY OTHER ID IS NUMERIC, and the
 * five tools each grew their own rule for it. Two of them disagreed:
 *
 *   roster_shape   /^[A-Z]{2,3}$/.test(id) ? 'DEF' : map[id]
 *   lineup_skill   /^\d+$/.test(id) ? map[id] : 'DEF'
 *
 * For anything neither numeric nor a 2-3 letter code, the first says unknown
 * and the second says DEF. The second is the dangerous one — it labels every
 * unrecognisable id a defence, so a malformed id becomes a confident position
 * rather than a visible gap.
 *
 * THE MAP IS CONSULTED FIRST, so the record can correct anything, and only an
 * id the map has never heard of falls through to the team-code shape. Unknown
 * returns null — DECLARED unknown, so a caller counting unresolved ids sees
 * them instead of counting them as defences.
 */
const TEAM_CODE = /^[A-Z]{2,4}$/;
function posOf(map, id) {
  if (id == null) return null;
  const key = String(id);
  if (map[key]) return map[key];
  if (TEAM_CODE.test(key)) return 'DEF';
  return null;
}

/** A bound `posOf` for call sites that want the one-argument shape they had. */
function resolver(map) {
  const m = map || positionMap();
  return (id) => posOf(m, id);
}

module.exports = { positionMap, mergeMaps, posOf, resolver, HIST_PATH, BOARD_PATH };

if (require.main === module) {
  const m = positionMap();
  const s = m.__sources;
  console.log('POSITION MAP — the one definition six tools join history through\n');
  console.log('  ids in the record  : ' + s.history + (s.history_file ? '' : '   (NO RECORD FILE)'));
  console.log('  ids from the board : ' + s.board);
  console.log('  ids in the map     : ' + Object.keys(m).length);
  const board = readJson(BOARD_PATH);
  const boardIds = new Set([].concat(board.players || [], board.kept_players || [])
    .map(p => String(p.player_id)));
  const onlyRecord = Object.keys(m).filter(id => !boardIds.has(id));
  console.log('\n  ids the RECORD has that the board does NOT: ' + onlyRecord.length);
  console.log('  — these are the rows a live-board join would silently delete from');
  console.log('    a measurement about the year they played.');
  if (!onlyRecord.length) {
    console.log('\n  ZERO TODAY, and that is expected rather than reassuring: the record is a');
    console.log('  union over builds and the board has not been pruned yet, so it holds');
    console.log('  exactly the board\'s ids. This map is inert until the board shrinks —');
    console.log('  which is the next rebuild after the inactive prune lands.');
  }
}
