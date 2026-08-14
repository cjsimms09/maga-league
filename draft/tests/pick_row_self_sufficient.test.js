// TERRITORY: A
/* LAYER 2 — A DECISION WHOSE BOARD RODE ON A RENDER THAT CAN THROW.
 *
 * The board a pick was made from was captured on the `recommendation` row only.
 * The `pick` row joined to it by `season|build_at|pick` and inherited it. Sound
 * arithmetic, unsound dependency:
 *
 *   THE RECOMMENDATION CAPTURE LIVES INSIDE `renderRecommendations`, and
 *   renderAll wraps that call in `safeRender` BECAUSE IT CAN THROW.
 *
 * That guard is correct and stays — a thrown panel must not freeze the board at
 * the table. But it means the failure path is: renderRecommendations throws at
 * pick N, safeRender records it and the draft continues, no recommendation row
 * is written, and the pick row at N HAS NO BOARD.
 *
 * That decision is then permanently ungradable. Not wrong — MISSING, and
 * missing in a way indistinguishable from a pick nobody has analysed yet.
 * `state.renderFailures` knows. The ledger, which is what September reads, does
 * not.
 *
 * ── WHY THE FIX REMOVES THE COUPLING RATHER THAN REPORTING IT ──────────────
 *
 * The standing rule forbids building a mechanism whose purpose is to make a
 * known defect quieter. A louder alarm on a missing recommendation row would be
 * exactly that. Carrying the taken set on the pick row means a lost
 * recommendation costs the recommendation and not the evidence.
 *
 * ── THE SECOND BUG, WHICH IS THE SUBTLE ONE ────────────────────────────────
 *
 * `capturePick` runs BELOW `ATTR.markLocal`, which has already added the picked
 * player to `state.drafted`. Snapshotting the taken set inside capturePick would
 * record a board THAT ALREADY CONTAINS THE PICK BEING EXPLAINED — off by exactly
 * the decision under study, on every row, in the direction that makes the choice
 * look inevitable. A replay asking "would a different valuation have chosen
 * differently on that board" would be asking about a board where the answer was
 * already taken.
 *
 * So the snapshot is taken beside `boardAtPick`, ABOVE the mark. The
 * SNAPSHOT_PRECEDES_MARK arm below is the one that matters most here, because
 * this defect would produce a plausible number rather than a missing one.
 *
 * Run: node draft/tests/pick_row_self_sufficient.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
global.window = global;
const PL = require(path.join(ROOT, 'public', 'js', 'draft', 'predledger.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

// ── ORDERING: the snapshot must come BEFORE the mark ───────────────────────
{
  const snap = SRC.indexOf('const takenAtPick =');
  const mark = SRC.indexOf('if (ATTR) ATTR.markLocal(state, p, slot, seatSlot);');
  const call = SRC.indexOf('capturePick(p, pathKey, takenAtPick');
  ck('CONTROL: all three landmarks exist', snap > 0 && mark > 0 && call > 0,
    { snap, mark, call });
  ck('SNAPSHOT_PRECEDES_MARK — the taken set is read BEFORE markLocal adds the '
    + 'player, so the board does not already contain the decision',
    snap < mark, { snap, mark });
  ck('...and capturePick is called AFTER the mark, so the snapshot is the only '
    + 'way it can see the decision-time board',
    call > mark, { call, mark });
  ck('boardAtPick is snapshotted in the same place, so board size and taken set '
    + 'describe the same instant',
    SRC.indexOf('const boardAtPick =') < mark);
}

// ── THE PICK ROW CARRIES ITS OWN BOARD ─────────────────────────────────────
{
  ck('capturePick accepts the snapshot rather than re-reading state.drafted',
    /function capturePick\(p, pathKey, takenAtPick, boardSizeAtPick\)/.test(SRC));
  ck('the pick payload merges boardState — the row stands alone',
    /PredLedger\.boardState\(takenAtPick, boardSizeAtPick\)/.test(SRC));
  ck('capturePick never reads state.drafted itself, which would reintroduce '
    + 'the off-by-the-decision bug',
    !/function capturePick[\s\S]{0,2000}?state\.drafted/.test(SRC));
}

// ── THE RENDER-FAILURE AGGREGATE REACHES THE RECORD ────────────────────────
{
  ck('render_failed rides on the pick row — the panels that were stale when I decided',
    /render_failed:/.test(SRC));
  ck('rec_render_failed is called out by name — that is the failure that also '
    + 'costs the recommendation row',
    /rec_render_failed: !!rf\.recommendations/.test(SRC));
  ck('it is DERIVED from the aggregate renderAll already keeps, not a new claim',
    /var rf = state\.renderFailures \|\| \{\}/.test(SRC));
}

// ── DEGRADATION: a row is never lost to a missing export ───────────────────
{
  ck('a predledger without boardState still logs the pick, degraded and labelled',
    /taken_state: takenAtPick \? 'unavailable' : 'not-snapshotted'/.test(SRC));
  ck('...and a throw inside boardState is caught rather than killing the capture',
    /catch \(e\) \{ board = \{ taken_state: 'error' \}; \}/.test(SRC));
}

// ── boardState ITSELF, EXECUTED ────────────────────────────────────────────
{
  const taken = ['1', '2', '3'];
  const b = PL.boardState(taken, 1700);
  ck('CONTROL: boardState returns a real record for an array input',
    b && b.taken_player_ids && b.taken_player_ids.length === 3, b);
  ck('the digest is invariant to input ORDER — it is taken over sorted ids, so '
    + 'a restored Set and an incremental one agree',
    PL.boardState(['3', '1', '2'], 1700).taken_digest === b.taken_digest,
    { a: b.taken_digest, b: PL.boardState(['3', '1', '2'], 1700).taken_digest });
  ck('...but the ids themselves are NOT silently reordered — order is carried '
    + 'and labelled, not destroyed',
    PL.boardState(['3', '1', '2'], 1700).taken_player_ids[0] === '3');

  const set = new Set(['1', '2', '3']);
  ck('a Set and an Array of the same ids produce the same digest — app.js passes '
    + 'an Array now and passed a Set before, and old rows must still join',
    PL.boardState(set, 1700).taken_digest === b.taken_digest,
    { set: PL.boardState(set, 1700).taken_digest, arr: b.taken_digest });
  ck('board_size is carried, so a replay can assert board_size + taken_count '
    + '=== |universe| and catch a board filtered by something this row cannot see',
    b.board_size === 1700, b.board_size);
}

/* ── `taken_order: "insertion"` IS A DEFAULT-TRUE CLAIM. EARN IT. ───────────
 *
 * boardState reads `ordered === false ? 'unordered' : 'insertion'`, so every
 * call site that omits the argument — both of them — ASSERTS draft order.
 * predledger's own comment says that assertion can be false: "a JS Set iterates
 * in insertion order, which is draft order while the set is built incrementally
 * and is NOT after a restore rebuilds it — app.js has such a path."
 *
 * I did NOT change the default. The evidence says the claim currently HOLDS:
 * draft_session saves `Array.from(s.drafted)` and restores `new Set(array)`,
 * and both operations preserve order, so the round trip preserves draft order.
 * Turning a suspicion into a production change is the thing the standing rule
 * forbids.
 *
 * What was missing is that nothing CHECKED it. This arm makes the label earned
 * rather than assumed: if anyone ever changes the serialisation to something
 * order-destroying — a sort, an object keyed by id, a JSON round trip through a
 * map — this goes red and the label becomes a lie the same day, instead of
 * silently mislabelling every row until someone reads the comment. */
{
  const DS = require(path.join(ROOT, 'public', 'js', 'draft', 'draft_session.js'));
  const ids = ['77', '12', '9', '340', '5'];          // deliberately NOT sorted
  const players = ids.map((id, k) => ({ player_id: id, name: 'P' + id,
    position: 'RB', proj_mean: 100 - k, vorp: 10 - k }));

  const saved = typeof DS.serialize === 'function'
    ? DS.serialize({ drafted: new Set(ids), rosters: {}, myRoster: [] }, {})
    : null;
  if (!saved || !saved.drafted) {
    ck('CONTROL: could not reach the serialiser — arm SKIPPED rather than '
      + 'passing vacuously', false, Object.keys(DS));
  } else {
    ck('CONTROL: the fixture order is not the sorted order, so "preserved" '
      + 'means something', saved.drafted.join(',') !== ids.slice().sort().join(','));
    ck('SAVE preserves draft order', saved.drafted.join(',') === ids.join(','),
      saved.drafted);
    /* THE REAL SERIALISED OBJECT, not a hand-built one. `restore` refuses a
     * payload whose `v` does not match VERSION — correctly, and my first cut of
     * this arm hand-rolled the fixture, got refused, and reported a preservation
     * failure that was entirely my own. A round-trip test that does not use the
     * actual round trip is testing nothing. */
    const r = DS.restore(saved, players, {});
    ck('CONTROL: restore ACCEPTED the serialised payload — a refusal here would '
      + 'make the order assertion below vacuous', !!(r && r.ok), r && r.reason);
    const back = r && r.state && r.state.drafted ? Array.from(r.state.drafted) : null;
    ck('RESTORE preserves it too — so taken_order:"insertion" is EARNED, not assumed',
      !!back && back.join(',') === ids.join(','), back);
  }
}

// ── FAIL ARM ───────────────────────────────────────────────────────────────
{
  // Two ids differing only by order must NOT be enough to fool the digest, and
  // a genuinely different board MUST change it — otherwise the digest cannot
  // detect a replay rebuilding the wrong board, which is its whole job.
  const a = PL.boardState(['1', '2', '3'], 1700).taken_digest;
  const c = PL.boardState(['1', '2', '4'], 1700).taken_digest;
  ck('FAIL ARM: a DIFFERENT taken set produces a different digest', a !== c,
    { a, c });
  const d = PL.boardState(['1', '2'], 1700).taken_digest;
  ck('FAIL ARM: a SHORTER taken set produces a different digest', a !== d, { a, d });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
