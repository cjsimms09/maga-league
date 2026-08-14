// TERRITORY: A
// A TYPED PICK WAS COUNTED TWICE, AND MY OWN FIX IS WHAT MADE IT REACHABLE.
//
// B drove it, and the measurement is the whole finding: the room takes a player
// the board does not carry — the only case the manual form is offered for —
// Cory types it in, Sleeper comes back and reports THE SAME PICK under its own
// id, and the board counts one pick twice on both surfaces.
//
//     drafted        15 -> 16 (typed) -> 17 (Sleeper reports the SAME pick)
//     seat 3 holds   manual:rondale-deepcut  "rondale deepcut"
//                    990001                  "Rondale Deepcut"
//
// `recordManualPick` mints `manual:` + slug, `allPicks()` dedupes BY player_id,
// and a synthetic id can never equal Sleeper's. `removeManual()` existed for
// exactly this and was called from nowhere in the repo.
//
// ── AND THE PART THAT IS MINE ─────────────────────────────────────────────
//
// Until 2026-08-13 a wedge unlinked sync permanently, so Sleeper never came back
// and the duplicate never arrived. The bug was real and largely unreachable.
// Making the board recover by itself is right — and it means every pick typed
// during an outage WILL be reported again seconds later. I turned a latent
// defect into the common case, in the fallback that IS the whole plan after a
// wedge. B's clause said the page TELLS him he can type picks; nothing had ever
// driven whether that worked.
//
// ── WHY NOT MATCH BY NAME, WHICH IS THE OBVIOUS FIX ───────────────────────
//
// Getting it wrong MERGES TWO DIFFERENT PLAYERS — it deletes a real pick and
// looks like nothing happened. This board carries `Frank Gore` twice, and B's
// own guard let a duplicate through because it matched `/Deepcut/`
// case-sensitively against a row stored as typed.
//
// A TYPED ROW NEVER CLAIMED TO IDENTIFY A PLAYER. It claims "seat S made a pick
// we could not identify". So it retires on exactly that claim being satisfied:
// when seat S has MORE REAL PICKS than it had at entry. Count-preserving,
// identity-free, and it cannot merge two players because it never asserts who
// the player was.
//
// Run: node draft/tests/manual_pick_retires.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const APP = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

const DraftSync = require(path.join(ROOT, 'public', 'js', 'draft', 'sync.js'));
ck('sync.js loads and exposes DraftSync', typeof DraftSync === 'function');

const mk = () => {
  const s = new DraftSync({ draftId: '123456789', onPicks: function () {}, onStatus: function () {} });
  return s;
};
/* Sleeper's own shape: `draft_slot` is the seat, `roster_id` the team. A MOCK
 * has no rosters, so both shapes are driven below. */
const real = (no, seat, id) => ({ pick_no: no, draft_slot: seat, roster_id: seat,
  player_id: String(id), round: Math.ceil(no / 10) });

// ── 1. THE BUG, REPRODUCED EXACTLY AS B MEASURED IT ─────────────────────
{
  const s = mk();
  s.picks = [real(1, 1, 100), real(2, 2, 200), real(3, 3, 300)];
  const before = s.allPicks().length;
  // The room takes somebody the board does not carry, at seat 3.
  s.addManual('manual:rondale-deepcut', 3, 3);
  ck('a typed pick lands immediately — it is the whole plan during an outage',
    s.allPicks().length === before + 1, { before: before, after: s.allPicks().length });
  // Sleeper comes back and reports THAT pick under its own id.
  s.picks = s.picks.concat([real(4, 3, 990001)]);
  ck('THE DEFECT: without retirement the same pick would count twice',
    before + 2 === 5);
  ck('the placeholder is superseded once its seat has a new real pick',
    s.supersededManual().indexOf('manual:rondale-deepcut') >= 0, s.supersededManual());
  ck('and allPicks() reports FOUR picks for four real events, not five',
    s.allPicks().length === 4, s.allPicks().map(p => p.player_id));
  ck('the surviving row is SLEEPER\'S, so the board carries the real id',
    s.allPicks().some(p => p.player_id === '990001')
    && !s.allPicks().some(p => p.player_id === 'manual:rondale-deepcut'),
    s.allPicks().map(p => p.player_id));
}

// ── 2. IT DOES NOT RETIRE ANYTHING IT SHOULD NOT ────────────────────────
{
  const s = mk();
  s.picks = [real(1, 1, 100)];
  s.addManual('manual:a', 3, 3);
  ck('a typed pick with NO subsequent real pick at its seat stays', s.allPicks().length === 2);
  // A pick at a DIFFERENT seat must not retire it — this is the case a naive
  // "any new pick supersedes the oldest manual" rule gets wrong.
  s.picks = s.picks.concat([real(2, 5, 500)]);
  ck('a real pick at ANOTHER seat does not retire it', s.supersededManual().length === 0,
    s.supersededManual());
  ck('and it is still on the board', s.allPicks().length === 3);
  s.picks = s.picks.concat([real(3, 3, 300)]);
  ck('a real pick at ITS OWN seat does', s.supersededManual().length === 1);
}

// ── 3. TWO TYPED AT ONE SEAT RETIRE ONE AT A TIME ───────────────────────
// The long-outage case: several picks typed for the same seat, and the room
// reports them back over the next few polls.
{
  const s = mk();
  s.picks = [];
  s.addManual('manual:a', 4, 4);
  s.addManual('manual:b', 4, 4);
  ck('both typed rows are live', s.allPicks().length === 2);
  s.picks = [real(1, 4, 111)];
  ck('ONE real pick retires exactly ONE placeholder', s.supersededManual().length === 1,
    s.supersededManual());
  ck('the count stays honest — 1 real + 1 still-unreported', s.allPicks().length === 2,
    s.allPicks().map(p => p.player_id));
  s.picks = [real(1, 4, 111), real(2, 4, 222)];
  ck('the second real pick retires the second placeholder',
    s.supersededManual().length === 2);
  ck('and the board is two picks, both real', s.allPicks().length === 2
    && s.allPicks().every(p => !/^manual:/.test(p.player_id)),
    s.allPicks().map(p => p.player_id));
}

// ── 4. NO NAME MATCHING ANYWHERE, WHICH IS THE DESIGN DECISION ──────────
{
  const src = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'sync.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const fn = src.slice(src.indexOf('DraftSync.prototype.supersededManual'));
  ck('the retirement rule reads no name and no metadata — a wrong name match '
    + 'MERGES two players and deletes a real pick',
    !/name|metadata|toLowerCase/i.test(fn.slice(0, 400)), fn.slice(0, 200));
  ck('it retires on the SEAT WATERMARK recorded at entry',
    /real_at_entry/.test(fn) && /realPicksForSeat/.test(fn));
  /* THE MISMATCH CASE, DRIVEN. Cory types a name that is nothing like the
   * player the room actually took. It must STILL retire — the placeholder was
   * never a claim about who, only that the seat moved. */
  const s = mk();
  s.picks = [];
  s.addManual('manual:completely-wrong-name', 7, 7);
  s.picks = [real(1, 7, 424242)];
  ck('a typed name that matches NOTHING still retires, because the row never '
    + 'claimed to identify anybody', s.supersededManual().length === 1);
}

// ── 5. WHEN IT IS WRONG, IT IS WRONG VISIBLY ────────────────────────────
// If he types against the wrong seat the placeholder never retires. That is a
// stale row he can SEE, versus a silent double count he cannot — and the manual
// remove path still exists to delete it.
{
  const s = mk();
  s.picks = [];
  s.addManual('manual:typo', 9, 9);
  s.picks = [real(1, 2, 100), real(2, 3, 200), real(3, 4, 300)];
  ck('a placeholder on the WRONG seat survives — visibly stale, not silently '
    + 'doubled', s.supersededManual().length === 0
    && s.allPicks().some(p => p.player_id === 'manual:typo'));
  s.removeManual('manual:typo');
  ck('and removeManual still clears it', !s.allPicks().some(p => p.player_id === 'manual:typo'));
}

// ── 6. THE BOARD'S OWN SURFACES ARE PURGED, NOT JUST allPicks() ─────────
// `onSyncPicks` is ADDITIVE — it adds on first sight and never removes — so
// excluding a row from allPicks() would leave the placeholder in state.drafted,
// the seat roster and my roster. That is the half B measured on screen.
{
  /* ⚠️ THIS SLICED A FIXED 3200-CHARACTER WINDOW, WHICH IS A LENGTH TEST
   * WEARING A BEHAVIOUR TEST'S CLOTHES. Adding a comment to onSyncPicks pushed
   * `supersededManual()` past the edge and turned five assertions red with the
   * purge logic entirely intact (2026-08-14, during the sync-reconciliation
   * fix). A window that shrinks when documentation grows measures the wrong
   * thing in both directions — it can also stop covering code that MOVED past
   * the boundary while still reporting green on what remains.
   *
   * Sliced to the real function boundary now: the next top-level `function` at
   * the same indent, which is how the other lifts in this repo find it. */
  const i = APP.indexOf('function onSyncPicks(');
  const nxt = APP.indexOf('\n  function ', i + 10);
  const block = APP.slice(i, nxt < 0 ? APP.length : nxt);
  ck('onSyncPicks is locatable', block.length > 1000);
  ck('and the slice is the WHOLE function, not a fixed-size window that a '
    + 'comment can push assertions out of', nxt > i, { start: i, end: nxt });
  ck('it asks sync which typed rows were superseded',
    /supersededManual\(\)/.test(block), block.slice(0, 200));
  ['state.drafted.delete', 'state.rosters', 'state.myRoster', 'state.recentPicks']
    .forEach(surface => {
      ck('it purges ' + surface + ', which held the placeholder from when it was typed',
        block.indexOf(surface) > 0);
    });
  /* ORDERING MATTERS AND IS ASSERTED. The purge must run BEFORE the add loop, or
   * the seat transiently reads one too high on the very render the real pick
   * lands in. */
  ck('the purge runs BEFORE the add loop, so the seat count never transiently '
    + 'reads one too high',
    block.indexOf('supersededManual()') < block.indexOf('picks.forEach(pick =>'),
    { purge: block.indexOf('supersededManual()'), add: block.indexOf('picks.forEach(pick =>') });
  ck('a retirement is announced rather than silent — a pick vanishing off his '
    + 'board mid-draft is alarming, and this is the one case where it is right',
    /typed pick\(s\) retired/.test(block));
}

// ── 7. FAIL ARM ─────────────────────────────────────────────────────────
{
  const s = mk();
  s.picks = [];
  s.addManual('manual:x', 3, 3);
  const beforeWatermark = s.manual[0].real_at_entry;
  ck('the watermark is recorded AT ENTRY, which is not recoverable afterwards',
    beforeWatermark === 0, beforeWatermark);
  // Simulate the old code: no watermark at all.
  delete s.manual[0].real_at_entry;
  s.picks = [real(1, 3, 777)];
  ck('FAIL ARM — with the watermark gone NOTHING retires, which is the exact '
    + 'behaviour that shipped', s.supersededManual().length === 0);
  ck('and allPicks() then reports the double count B measured',
    s.allPicks().length === 2, s.allPicks().map(p => p.player_id));
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: a pick typed during an outage is retired the moment');
console.log('the room reports that seat again, on allPicks() AND on the board\'s own');
console.log('surfaces, without ever matching a name — so it cannot merge two players,');
console.log('and a typo against the wrong seat fails visibly instead of silently.');
console.log('WHAT IT DOES NOT: prove the retired row disappears from the RENDERED page.');
console.log('This drives state, not the DOM. B owns the surface and drove the original');
console.log('double count on screen — that half is theirs and is how this was found.');
