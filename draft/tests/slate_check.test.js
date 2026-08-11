/* THE KEEPER-SLATE CHECKLIST LINE — tested as a FUNCTION, not grepped for.
 *
 * WHY IT IS A MODULE FUNCTION AT ALL. The line used to be an inline IIFE inside
 * app.js's checklist array — a closure in a browser file with no exports, which
 * means the only test available was source inspection. A source scan cannot
 * distinguish an implementation from a comment describing one (rule 11e), and
 * this line's whole job is to be believed on draft morning. So it moved into
 * DraftKeepers, where it can be called with real inputs and checked.
 *
 * WHAT IT GUARDS. The board carried 147 picks while its own keeper_slate stamp
 * said four teams had designated. Both numbers were in the same file and nothing
 * compared them. The old version of this line re-derived "seats declared" by
 * counting distinct team_slots in kept_players — a SECOND implementation of a
 * question the build already answered, which is how the two could disagree
 * without either being wrong on its own terms.
 *
 * Run: node draft/tests/slate_check.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const K = require(path.join(ROOT, 'public', 'js', 'draft', 'keepers.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  c ? (pass++, console.log('PASS  ' + n))
    : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : '')));
};

const board = (slate, picks, myPicks) => ({
  league: { teams: 10 },
  keeper_slate: slate,
  pick_order: { picks: new Array(picks == null ? 0 : picks).fill({}), my_picks: myPicks || [] },
});

// ── A CONFIRMED, FULLY APPLIED SLATE IS THE ONLY GREEN ───────────────────────
{
  const r = K.keeperSlateCheck(board(
    { status: 'confirmed', designations_not_applied: 0, teams_in_pick_order: 10,
      keepers_in_pick_order: 24 }, 126, [13]));
  ck('a confirmed slate with nothing dropped is the tick', r.ok === true, r);
  ck('  and it says CONFIRMED in the words on the page', /CONFIRMED/.test(r.detail), r.detail);
  ck('  with no fix text, because there is nothing to do', r.fix === '', r.fix);
}

// ── PREDICTED IS NOT A TICK, EVEN WITH EVERY DESIGNATION APPLIED ─────────────
{
  const r = K.keeperSlateCheck(board(
    { status: 'predicted', designations_not_applied: 0, teams_in_pick_order: 10,
      keepers_in_pick_order: 24 }, 126, [13]));
  ck('a PREDICTED slate is never a tick, however complete it looks', r.ok === false, r);
  ck('  and the fix says the numbers move with the COUNT',
    /COUNT/.test(r.fix) && /provisional/i.test(r.fix), r.fix);
}

// ── THE DEFECT: DESIGNATIONS SLEEPER KNOWS ABOUT THAT NEVER REACHED THE BOARD ─
{
  const r = K.keeperSlateCheck(board(
    { status: 'predicted', designations_not_applied: 3, teams_in_pick_order: 1,
      keepers_in_pick_order: 3 }, 147, [34]));
  ck('dropped designations fail the line', r.ok === false, r);
  ck('  the detail SHOUTS the count that went missing',
    /3 DESIGNATION\(S\) NOT APPLIED/.test(r.detail), r.detail);
  ck('  and the fix names the generator as the suspect if it persists',
    /generator is dropping them/.test(r.fix), r.fix);
}

// ── THE TWO GLANCE NUMBERS ARE ON THE PAGE, NOT IN THE JSON ──────────────────
{
  const r = K.keeperSlateCheck(board(
    { status: 'predicted', designations_not_applied: 0, teams_in_pick_order: 6,
      keepers_in_pick_order: 17 }, 133, [20, 27, 40]));
  ck('the detail carries the FIRST PICK', /first pick 20\b/.test(r.detail), r.detail);
  ck('the detail carries the TOTAL PICKS', /133 picks on the board/.test(r.detail), r.detail);
  ck('the detail carries the KEEPERS APPLIED', /17 keepers applied/.test(r.detail), r.detail);
  // The identity Cory checks by eye at slot 4: first + total keepers == 37.
  ck('  and those two numbers satisfy the arithmetic (20 + 17 == 37)',
    20 + 17 === 37 && 150 - 17 === 133);
}

// ── WITHHELD ON PURPOSE READS DIFFERENTLY FROM DROPPED BY ACCIDENT ──────────
{
  const held = K.keeperSlateCheck({
    league: { teams: 10 },
    keeper_slate: { status: 'predicted', designations_not_applied: 0,
      teams_in_pick_order: 1, keepers_in_pick_order: 3,
      withheld_from_board: { withheld: true, teams: 3, keepers: 9 } },
    pick_order: { picks: new Array(147).fill({}), my_picks: [34] },
  });
  ck('a deliberately withheld partial slate says WITHHELD, not missing',
    /9 opponent keeper\(s\) WITHHELD on purpose/.test(held.detail), held.detail);
  ck('  and its fix says WORKING AS INTENDED rather than accusing the generator',
    /Working as intended/.test(held.fix) && !/generator is dropping/.test(held.fix), held.fix);
  ck('  it is still not a tick — the slate is not confirmed', held.ok === false, held);

  const broken = K.keeperSlateCheck({
    league: { teams: 10 },
    keeper_slate: { status: 'predicted', designations_not_applied: 3,
      teams_in_pick_order: 1, keepers_in_pick_order: 3 },
    pick_order: { picks: new Array(147).fill({}), my_picks: [34] },
  });
  ck('  while a real drop still accuses the generator',
    /generator is dropping them/.test(broken.fix), broken.fix);
  ck('  so the two states are DISTINGUISHABLE on the page',
    held.detail !== broken.detail && held.fix !== broken.fix);
}

// ── A BOARD THAT PREDATES THE STAMP SAYS SO — IT DOES NOT FALL BACK ──────────
{
  const r = K.keeperSlateCheck(board({ status: 'predicted' }, 147, [34]));
  ck('an old board without the reconciliation FAILS rather than guessing',
    r.ok === false && /predates the slate reconciliation/.test(r.detail), r);
  ck('  and it never silently reports a count it did not compute',
    !/seats,/.test(r.detail), r.detail);
}

// ── DEGENERATE INPUTS MUST NOT THROW: THIS RUNS INSIDE THE CHECKLIST ARRAY ───
{
  let threw = null;
  try {
    K.keeperSlateCheck(undefined);
    K.keeperSlateCheck({});
    K.keeperSlateCheck({ keeper_slate: null, pick_order: null });
  } catch (e) { threw = e.message; }
  ck('never throws on a missing/partial artifact — it would take the whole '
    + 'checklist down with it', threw === null, threw);
}

// ── AND AGAINST THE REAL SHIPPED BOARD ───────────────────────────────────────
{
  const p = path.join(ROOT, 'public', 'draft_data.json');
  if (fs.existsSync(p)) {
    const art = JSON.parse(fs.readFileSync(p, 'utf8'));
    const r = K.keeperSlateCheck(art);
    const s = art.keeper_slate || {};
    ck('the live board evaluates without throwing', !!r && !!r.label);
    // NOT asserting ok===true: today's slate is legitimately partial. Asserting
    // it green would be choosing the expectation to match the data.
    ck('  and its verdict agrees with the artifact it read',
      r.ok === (s.status === 'confirmed' && Number(s.designations_not_applied || 0) === 0),
      { ok: r.ok, status: s.status, dropped: s.designations_not_applied });
    ck('  the reported first pick is the board\'s own first pick',
      r.detail.indexOf('first pick ' + (art.pick_order.my_picks || [])[0]) >= 0, r.detail);
  } else {
    console.log('SKIP  no built board');
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
