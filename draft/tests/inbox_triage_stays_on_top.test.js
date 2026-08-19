// TERRITORY: relay — the triage is mine, and so is keeping it findable
// THE PRE-DRAFT TRIAGE MUST STAY THE FIRST ITEM IN EACH INBOX IT HEADS.
//
// Register 5j. Measured 2026-08-18: `## TO: A` held **131 open items, 123 of
// them requests, and I filed 60 that day**. `## TO: B` was worse by rot — 66
// open, **40 older than 08-17**. A lane cannot act on that, and every item
// carried a DEFAULT, so OPERATING-MODEL's "silence is consent" quietly relabelled
// the whole pile as agreed.
//
// The fix was one head item per inbox — "READ ONLY THIS ONE" — naming what is
// owed before 08-22 and deferring the rest in writing.
//
// ── WHY THIS NEEDS A GUARD AT ALL ───────────────────────────────────────────
//
// A head item works only while it is FIRST. `ROUTES.md` is 783 KB and every new
// filing is inserted directly under the section header, which pushes the triage
// to position 2, then 3, then out of sight — and nothing would say so. That is
// the same decay this project has already paid for twice today: a guard that
// exists and is not wired (register 28), and a check that could not see the rows
// it was built to chase (the ✅-as-closure bug).
//
// ── AND WHY IT EXPIRES ──────────────────────────────────────────────────────
//
// ⚠️ THIS TEST SWITCHES ITSELF OFF AFTER THE DRAFT, DELIBERATELY. The head items
// are explicitly scoped "before Saturday"; a permanent gate on the ORDER of a
// mailbox would fire every time anyone files anything, and "a guard that cries
// wolf every morning is a guard that gets switched off" is this project's own
// epitaph for the intervention-rate check. After 2026-08-22 the triage is moot
// and this file passes without asserting anything.
//
// If something IS urgent enough to file above the triage, the right move is to
// UPDATE the triage — not to slip past it. This test makes that the easy path.
//
// Run: node draft/tests/inbox_triage_stays_on_top.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const R = require(path.join(ROOT, 'draft', 'tools', 'routes_response_check.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

const DRAFT_DAY = '2026-08-22';
const TRIAGED = ['A', 'B', 'C'];      // D and E were clean (0 stale) and have none
const MARK = /READ ONLY THIS ONE/;

const items = R.parse(fs.readFileSync(path.join(ROOT, 'ROUTES.md'), 'utf8'));

/** An item's text, joined. `body` is an ARRAY OF LINES; treating it as a string
 *  silently yields a line COUNT where a character count is meant. */
const text = i => (Array.isArray(i.body) ? i.body.join('\n') : String(i.body || ''));
const today = (process.env.TRIAGE_TODAY || new Date().toISOString().slice(0, 10));

// ── 0. THE PARSE IS REAL ───────────────────────────────────────────────────
{
  ck('CONTROL: ROUTES.md parses into a real inbox, so the assertions below are '
    + 'reading items and not an empty list',
  items.length > 100 && items.some(i => i.section === 'A'), items.length);

  /* ⚠️ THE FIELD IS `body`, AND IT IS AN ARRAY OF LINES — NOT A STRING.
   * This one check was wrong three times before it was right:
   *   1. read `.text` / `.raw`  -> empty, reported all three triage items MISSING
   *   2. asserted on `items[0]` -> that entry has no section and no body
   *   3. asserted `body.length > 200` -> `length` is the LINE COUNT, so every
   *      one of 342 items "failed", which read as the parse being broken
   * None of the three meant anything was wrong with ROUTES.md. All three were
   * confident, clean-looking false negatives from a probe aimed slightly off —
   * rule 3e, three times in one file. `text()` below is the joined form. */
  const sectioned = items.filter(i => i.section);
  const withBody = sectioned.filter(i => text(i).length > 200);
  /* MEASURED OVER THE POPULATION, not over one element — a sample of one is not
   * a control, which two earlier versions of this line proved the hard way. */
  ck('CONTROL: item text is reachable and most items carry real content, so the '
    + 'marker search below is reading bodies rather than empty strings',
  sectioned.length > 50 && withBody.length > sectioned.length / 2,
  { sectioned: sectioned.length, with_real_body: withBody.length });
}

// ── 1. THE TRIAGE IS FIRST, UNTIL THE DRAFT ────────────────────────────────
if (today <= DRAFT_DAY) {
  TRIAGED.forEach(sec => {
    const inSec = items.filter(i => i.section === sec);
    ck('CONTROL: `## TO: ' + sec + '` has items to head', inSec.length > 0, inSec.length);

    const at = inSec.findIndex(i => MARK.test(text(i)));
    ck('the pre-draft triage EXISTS in `## TO: ' + sec + '`', at >= 0);

    /* ⚠️ A TICKED TRIAGE IS DISCHARGED, AND THE POSITION STOPS BEING ASSERTED.
     *
     * Added 2026-08-18, after this check went RED on `main` for A — whose triage
     * sat at position 3 under two items A had already ticked, having itself been
     * ticked. **The whole stated purpose of the position is that the lane SEES
     * the head item.** A tick is proof it did. Demanding position 1 from an item
     * the lane has already actioned protects nothing and reddens the build for
     * a mailbox in its correct state — which is this project's own epitaph for
     * the intervention-rate check, one guard later.
     *
     * THE COROLLARY IS THE PART THAT MATTERS, so it is written here rather than
     * assumed: **if you add new work to a discharged triage, UNTICK it.** That
     * re-arms this assertion in the same edit, which is the only thing standing
     * between "discharged" and "a head item that can quietly sink out of sight".
     * Both arms are proven below rather than described. */
    const discharged = at >= 0 && inSec[at].done;
    ck('...and is still the FIRST item, so a lane opening a 783 KB mailbox sees '
      + 'it — unless the lane has already TICKED it, which is proof it was seen. '
      + 'If this fails, someone filed above an unread triage: UPDATE the triage '
      + 'rather than moving it back.',
    at === 0 || discharged, { position: at + 1, of: inSec.length, discharged: discharged });
  });
} else {
  ck('EXPIRED: the draft has passed, so the pre-draft triage is moot and this '
    + 'check asserts nothing. Delete this file.', true);
}

// ── 1b. THE DISCHARGE EXEMPTION, BOTH ARMS ────────────────────────────────
{
  /* An exemption nobody can show FIRING is a mute button with a comment on it.
   * These drive the exact condition on synthetic items, so the arm that lets a
   * ticked triage sink is proven to still catch an UNticked one at the same
   * position — the only difference between this and switching the guard off. */
  const at3 = (done) => {
    const inSec = [
      { section: 'Z', done: true, body: ['some other item'] },
      { section: 'Z', done: true, body: ['another other item'] },
      { section: 'Z', done: done, body: ['relay -> Z · READ ONLY THIS ONE. your inbox...'] },
    ];
    const i = inSec.findIndex(x => MARK.test(text(x)));
    return i === 0 || (i >= 0 && inSec[i].done);
  };
  ck('FAIL ARM — an UNTICKED triage buried at position 3 still fails, so the '
    + 'exemption did not switch the guard off', at3(false) === false);
  ck('...and a TICKED one at the same position passes, because a tick is the '
    + 'lane proving it read the thing the position exists to make it read',
  at3(true) === true);
}

// ── 2. THE EXPIRY ACTUALLY WORKS ───────────────────────────────────────────
{
  /* A self-disabling test that cannot be shown to disable is just a test with
   * dead code in it. This proves both arms by driving the date. */
  const before = { count: 0 };
  const after = { count: 0 };
  const probe = (d) => (d <= DRAFT_DAY ? 'asserts' : 'expired');
  ck('CONTROL: the expiry switches on the draft date — 08-21 asserts, 08-23 does '
    + 'not, so this file stops being a gate the moment it stops being useful',
  probe('2026-08-21') === 'asserts' && probe('2026-08-23') === 'expired'
    && probe(DRAFT_DAY) === 'asserts');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
