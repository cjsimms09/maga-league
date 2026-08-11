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

/* THE REAL NUMBERS, so the fixture cannot drift away from the incident. */
{
  const p = path.join(ROOT, 'draft', 'data', 'sleeper_league_settings.json');
  if (!fs.existsSync(p)) { console.log('SKIP  no settings dump'); }
  else {
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    const order = ((d.draft || {}).draft_order) || {};
    const teams = (d.settings || {}).num_teams;
    ck('the recorded incident still shows a PARTIAL order (this is why the rule exists)',
      Object.keys(order).length > 0 && Object.keys(order).length < teams,
      Object.keys(order).length + ' of ' + teams);
    ck('  and it still disagrees with the confirmed seat of 8',
      Number(order['434915673219526656']) === 3,
      'draft_order says ' + order['434915673219526656']);
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
