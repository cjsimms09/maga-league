/* A PARTIAL draft_order MUST NOT VERIFY OR IMPORT A SEAT.
 *
 * MEASURED ON LIVE DATA, 2026-08-11, nine days before the draft. The real draft
 * object carried FOUR entries in `draft_order` for a TEN team league, and the
 * entry for my user_id read 3 — while the Sleeper UI showed me at draft
 * position 8 (screenshot: "8 · Scheisse (coryjsimms) · Draft position #8").
 *
 * app.js would have executed:
 *     showSlotNote('Sleeper says you are in slot 3 — importing.', false)
 *     setSlot(3, 'sleeper')
 *
 * — silently replacing a CORRECT hand-claimed seat with a wrong one, and
 * upgrading it from "claimed" to "verified" in the same move. Every pick number,
 * survival window and VONA n_next moves with the seat, so the whole board would
 * have been confidently wrong, presented as more trustworthy than the human's
 * own answer, and announced as a reassuring blue note rather than a warning.
 *
 * TWO RULES, asserted here against the real numbers:
 *   1. an order that is not fully assigned is not an order — it neither verifies
 *      nor imports, and the UNVERIFIED watermark stays;
 *   2. at full population a DISAGREEMENT is a conflict to settle, not an import.
 *      The seat is the one value Cory claims by hand (AUTHORITY-DOCTRINE); an
 *      auto-detection may confirm or dispute it, never overrule it silently.
 *
 * Source inspection, because the branch lives in a browser IIFE with no export —
 * stated as the limitation it is (11e).
 *
 * Run: node draft/tests/seat_partial_order.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const app = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d ? '\n        -> ' + d : ''))); };

ck('completeness of draft_order is computed before any seat decision',
  /orderComplete\s*=/.test(app) && /byUser\)\.length\s*>=/.test(app));

ck('a partial order does NOT call setSlot',
  /!orderComplete[\s\S]{0,700}?seatAutoIncomplete/.test(app)
  && !/!orderComplete[\s\S]{0,700}?setSlot\(/.test(app));

ck('  and it says so, as a warning rather than an informational note',
  /partly assigned[\s\S]{0,200}?,\s*true\)/.test(app));

ck('a DISAGREEMENT at full population records a conflict instead of importing',
  /seatConflict\s*=\s*\{[\s\S]{0,120}claimed/.test(app));

ck('  the old silent import is gone',
  !/Sleeper says you are in slot[\s\S]{0,120}setSlot\(mine, 'sleeper'\)/.test(app),
  'the "— importing." + setSlot path still exists');

ck('  and the conflict note warns that every pick number moves with the seat',
  /every pick number moves with this/.test(app));

ck('agreement still verifies — the guard must not break the good case',
  /state\.slotVerified\s*=\s*true/.test(app));

/* THE INCIDENT IS FROZEN AS A LITERAL, NOT READ FROM THE LIVE DUMP.
 *
 * The first version of this block asserted against draft/data/sleeper_league_
 * settings.json — and forty minutes later that file said 8 instead of 3, because
 * THE DRAFT ORDER WAS BEING REASSIGNED WHILE I READ IT. The assertion "it still
 * disagrees with the confirmed seat" went red on data that had simply moved on.
 *
 * That is clause 10d one more time: a fixture that derives from the thing under
 * test stops representing its case the moment the thing changes. An INCIDENT is
 * history — 18:20 on 2026-08-11, draft_order[me] = 3 while the UI showed 8 —
 * and history does not get re-read from a live endpoint.
 *
 * So the numbers are literals, and what the live file is doing NOW is printed
 * rather than asserted: it is context, not the property being tested. */
{
  const INCIDENT = { at: '2026-08-11T18:20Z', entries: 4, teams: 10,
                     draftOrderSaidSlot: 3, uiConfirmedSlot: 8 };
  ck('the incident is recorded as a literal, not re-read from a live endpoint',
    INCIDENT.entries < INCIDENT.teams && INCIDENT.draftOrderSaidSlot !== INCIDENT.uiConfirmedSlot);
  ck('  and it is the case the rule exists for: partial AND disagreeing',
    INCIDENT.entries > 0 && INCIDENT.entries < INCIDENT.teams);

  // Live context, printed only. By 19:00 the same field read 8 — the order was
  // mid-assignment, which is the argument FOR refusing a partial order, not
  // against it.
  const p = path.join(ROOT, 'draft', 'data', 'sleeper_league_settings.json');
  if (fs.existsSync(p)) {
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    const order = ((d.draft || {}).draft_order) || {};
    console.log('  (live now: draft_order has ' + Object.keys(order).length + ' of '
      + (d.settings || {}).num_teams + ' entries, mine reads '
      + order['434915673219526656'] + ')');
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
