// TERRITORY: A
'use strict';
/* LAYER 3 — LIVE SYNC. TWO ROUTES TO THE SAME WRONG DRAFT DECISION.
 *
 * Cory's audit order: "explicitly hunt for defects that could cause Cory to make
 * a wrong draft decision because of stale, missing, duplicated, out-of-order,
 * misidentified, or incorrectly reconciled data."
 *
 * `onSyncPicks` had two, and they compound.
 *
 * ── 1. AN UNCHANGED COUNT IS NOT AN UNCHANGED LIST ─────────────────────────
 *
 *     const nPicks = (picks || []).length;
 *     if (state._syncedPickCount === nPicks) return;
 *
 * justified in a comment as "Sleeper's pick list is append-only, so an unchanged
 * count means nothing happened". Append-only is the NORMAL case, not a
 * guarantee. A commissioner can correct a pick mid-draft — wrong player, an
 * undo-and-redo, an autopick fix — and the list returns the same LENGTH with
 * different CONTENT. The guard returned before any reconciliation could see it.
 *
 * ── 2. THE INGEST LOOP IS PURELY ADDITIVE ──────────────────────────────────
 *
 * `state.drafted.add(id)` with no removal path anywhere in it. So even when the
 * guard let a change through, a player the room STOPPED reporting stayed gone
 * from the board for the rest of the draft.
 *
 * Either one alone means Cory is recommended against a pool with the wrong man
 * removed — and every survival and VONA number is computed from that pool. He
 * would simply never be shown a player who is genuinely available.
 *
 * ── WHY THE RESTORE IS SCOPED, NOT GENERAL ─────────────────────────────────
 *
 * `state.drafted` has five writers and three are NOT the room: my keepers
 * (app.js:4995), typed manual placeholders (:4873), and rehearsal removals.
 * Handing a KEEPER back to the pool because Sleeper hiccupped would be a worse
 * defect than the one being fixed. So only ids this sync itself recorded are
 * eligible, and ownership is tracked once before the branch fork — because
 * `ATTR.applyRemote` is a third writer and tagging inside the branches would
 * have missed it.
 *
 * And an EMPTY read is refused outright: `picks` arriving empty is a failed
 * fetch far more often than a reset draft, and treating it as "every pick was
 * undone" would blank the board mid-round. That is the `or []` failure this
 * repo already paid for on the keeper path.
 *
 * Run: node draft/tests/sync_reconcile.test.js
 */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 220) : ''))); };

// ── Lift the REAL onSyncPicks out of the IIFE ───────────────────────────────
// Mirroring the logic here would be the two-places disease that put the bug in.
function lift() {
  const i = SRC.indexOf('function onSyncPicks(');
  if (i < 0) return null;
  const end = SRC.indexOf('\n  function ', i + 10);
  const body = SRC.slice(i, end < 0 ? SRC.length : end);
  // Closure bindings onSyncPicks actually touches.
  // Every free identifier the function touches, derived from its own source
  // rather than guessed — a missing one throws at call time and would look like
  // a defect in the code under test.
  const deps = ['state', 'mySlot', 'playerById', 'ATTR', 'console',
    'alertTick', 'capturePlatformSample', 'captureRawPicks',
    'emitOpponentPredictions', 'markRehearsalNoise', 'noteReconciledPick',
    'recomputeRuns', 'reconcileKeepers', 'rehearsalSkips', 'renderAll',
    'resolveCommittedForecasts', 'resolveLrmCalls', 'resolveOpponentPredictions',
    'resolveRunCalls', 'resolveSurvivalCalls'];
  return { deps: deps, make: (vals) => new Function(...deps, 'return ' + body)(...vals) };
}
const lifted = lift();
ck('onSyncPicks is liftable — if this fails the rest is vacuous', !!lifted);
if (!lifted) { console.log(`\n${pass} passed, ${fail} failed`); process.exit(1); }

const POOL = [
  { player_id: '100', name: 'Alpha', position: 'RB' },
  { player_id: '200', name: 'Bravo', position: 'WR' },
  { player_id: '300', name: 'Charlie', position: 'TE' },
  { player_id: '900', name: 'MyKeeper', position: 'RB' },
];
function freshState() {
  return {
    drafted: new Set(), rosters: {}, myRoster: [], recentPicks: [],
    board: POOL.slice(), data: { players: POOL.slice(), league: {} },
    lists: { queue: [] }, sync: null, mockMode: null,
  };
}
const quiet = { warn: () => {}, info: () => {}, log: () => {}, error: () => {} };
const NOOP = () => {};
function run(state, picks) {
  const byName = {
    state: state,
    mySlot: () => 8,
    playerById: id => POOL.find(p => String(p.player_id) === String(id)) || null,
    ATTR: undefined,
    console: quiet,
    // `rehearsalSkips` must return FALSE or every pick is skipped and the whole
    // file passes vacuously. Stated because a stub returning undefined would be
    // falsy too, and it is worth knowing this is deliberate.
    rehearsalSkips: () => false,
  };
  const vals = lifted.deps.map(d => (d in byName) ? byName[d] : NOOP);
  lifted.make(vals)(picks);
  return state;
}
const pick = (id, no, slot) => ({ player_id: id, pick_no: no, draft_slot: slot || 1,
                                  metadata: { first_name: 'X', last_name: id } });

// ── CONTROL ─────────────────────────────────────────────────────────────────
{
  const s = freshState();
  run(s, [pick('100', 1), pick('200', 2)]);
  ck('CONTROL — a normal sync marks both picks drafted',
    s.drafted.has('100') && s.drafted.has('200'), [...s.drafted]);
  ck('CONTROL — and removes them from the board',
    !s.board.some(p => p.player_id === '100'), s.board.map(p => p.player_id));
  ck('CONTROL — an identical re-poll is a no-op (the speed guard still works)',
    (() => { const before = s.drafted.size;
             run(s, [pick('100', 1), pick('200', 2)]);
             return s.drafted.size === before; })());
}

// ── 1. SAME COUNT, DIFFERENT CONTENT — the commissioner correction ──────────
{
  const s = freshState();
  run(s, [pick('100', 1), pick('200', 2)]);
  // Pick 2 corrected: Bravo was wrong, it was actually Charlie. SAME LENGTH.
  run(s, [pick('100', 1), pick('300', 2)]);
  ck('a corrected pick is SEEN even though the count did not change',
    s.drafted.has('300'), [...s.drafted]);
  ck('and the superseded player is BACK on the board — he is available again',
    !s.drafted.has('200') && s.board.some(p => p.player_id === '200'),
    { drafted: [...s.drafted], board: s.board.map(p => p.player_id) });
  ck('the withdrawal is COUNTED, not silent — a player reappearing mid-draft '
    + 'must be explicable', s.syncWithdrawn === 1, s.syncWithdrawn);
}

// ── 2. A WITHDRAWN PICK COMES BACK ONTO THE BOARD ───────────────────────────
{
  const s = freshState();
  run(s, [pick('100', 1), pick('200', 2), pick('300', 3)]);
  run(s, [pick('100', 1), pick('300', 3)]);          // pick 2 undone
  ck('an undone pick is removed from drafted', !s.drafted.has('200'));
  ck('...restored to the board', s.board.some(p => p.player_id === '200'));
  ck('...and stripped from the seat roster, so need and legality recover',
    !Object.values(s.rosters).flat().some(p => String(p.player_id) === '200'),
    s.rosters);
  ck('...and from recentPicks, which feeds run detection',
    !s.recentPicks.some(p => String(p.player_id) === '200'));
  ck('the picks that REMAIN are untouched',
    s.drafted.has('100') && s.drafted.has('300'), [...s.drafted]);
}

// ── THE GUARDS ON THE RESTORE ───────────────────────────────────────────────
{
  const s = freshState();
  s.drafted.add('900');                 // my keeper — NOT the room's to withdraw
  s.board = s.board.filter(p => p.player_id !== '900');
  run(s, [pick('100', 1)]);
  run(s, [pick('200', 2)]);             // pick 100 withdrawn, keeper untouched
  ck('A KEEPER IS NEVER HANDED BACK TO THE POOL by a sync change',
    s.drafted.has('900') && !s.board.some(p => p.player_id === '900'),
    { drafted: [...s.drafted] });
  ck('but the room\'s own withdrawn pick still returns',
    !s.drafted.has('100') && s.board.some(p => p.player_id === '100'));
}
{
  const s = freshState();
  run(s, [pick('100', 1), pick('200', 2)]);
  const before = new Set(s.drafted);
  run(s, []);                            // a FAILED FETCH, not a reset draft
  ck('AN EMPTY READ IS REFUSED — it does not blank the board mid-round',
    s.drafted.size === before.size && [...before].every(id => s.drafted.has(id)),
    { before: [...before], after: [...s.drafted] });
}
{
  const s = freshState();
  run(s, [pick('100', 1), pick('200', 2)]);
  run(s, [pick('200', 2), pick('100', 1)]);   // SAME picks, different order
  ck('a REORDERED payload with the same members withdraws nothing',
    s.drafted.has('100') && s.drafted.has('200') && !s.syncWithdrawn,
    { drafted: [...s.drafted], withdrawn: s.syncWithdrawn });
}

// ── FAIL ARM: the count-only guard could not have passed these ──────────────
{
  const body = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ck('FAIL ARM — the count-only early return is GONE from the source',
    !/if \(state\._syncedPickCount === nPicks\) return;/.test(body),
    'the guard that could not see a same-length change is still there');
  ck('the guard is now a content fingerprint',
    /_syncedPickFingerprint/.test(body));
  ck('ownership is recorded ONCE, before the branch fork, so ATTR-handled '
    + 'picks are eligible too',
    (body.match(/_syncOwnedIds\.add/g) || []).length === 1,
    (body.match(/_syncOwnedIds\.add/g) || []).length);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
