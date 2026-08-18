/* A SPENT SEAT MUST NOT BE RENDERED AS A LIVE INSTRUCTION.
 *
 * Cory, live 2026-08-17: *"model still overrecommending QBs. I have joe burrow
 * and it recommends Bo nix in the 9th.. thats rediculous"*.
 *
 * `public/seat_plan.json` asserts `slot: "QB", is_starter_seat: true` at pick 73
 * and names a second QB at 93. That artifact is solved ONCE, before the draft,
 * from the KEEPERS ALONE — its own header says *"It does NOT re-solve live"* —
 * so it cannot know a QB was taken at an intervening pick. And the seat's own
 * `fallback_rule` reads *"Take the best remaining player ELIGIBLE FOR QB, not
 * the best player on the board — the board ordering is roster-blind"*, so the
 * panel was steering toward a second QB at a seat that no longer existed.
 *
 * The artifact is not wrong; it answered the pre-draft question correctly. What
 * was wrong is a pre-draft answer rendered as a live instruction. `renderSeatPlan`
 * now asks the roster through the ENGINE'S OWN `mandatoryGaps()` — one lookup,
 * not a second copy of the slot arithmetic — and says so when the slot is spent.
 *
 * Session E (red team).
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const board = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const plan = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'seat_plan.json'), 'utf8'));

let pass = 0, fail = 0;
const ck = (name, ok, detail) => {
  if (ok) { pass++; console.log('PASS  ' + name + (detail != null ? '  — ' + detail : '')); }
  else { fail++; console.log('FAIL  ' + name); if (detail != null) console.log('        -> ' + detail); }
};

// ── CONTROL: the artifact really does assert a QB starter seat ──────────────
/* Without this the rest of the file could pass on a plan that never asks for a
 * QB at all, which would be a test agreeing with itself. */
const qbSeats = (plan.seats || []).filter(s => s.slot === 'QB' && s.is_starter_seat);
ck('CONTROL: seat_plan.json still asserts a QB STARTER seat',
  qbSeats.length > 0,
  qbSeats.map(s => 'pick ' + s.pick + ' -> ' + ((s.plan_player || {}).name || 'no name')).join('; '));

ck('CONTROL: and that seat steers to a QB rather than to the best player',
  qbSeats.length > 0 && /ELIGIBLE FOR/i.test(qbSeats[0].fallback_rule || ''),
  qbSeats.length ? qbSeats[0].fallback_rule : 'n/a');

// ── THE LOOKUP THE PANEL DEPENDS ON ────────────────────────────────────────
const league = board.league;
const byName = n => board.players.find(p => p.name === n);
const qb = byName('Joe Burrow') || board.players.find(p => p.position === 'QB');
const noQB = { roster: board.kept_players, league };
const withQB = { roster: board.kept_players.concat([qb]), league };

ck('a QB starter slot is an OPEN gap before any QB is rostered',
  E.mandatoryGaps(noQB).indexOf('QB') !== -1,
  JSON.stringify(E.mandatoryGaps(noQB)));

ck('and it disappears from the gaps the moment one is held — so "spent" is '
  + 'derivable from the roster alone',
E.mandatoryGaps(withQB).indexOf('QB') === -1,
JSON.stringify(E.mandatoryGaps(withQB)) + '  (holding ' + (qb || {}).name + ')');

/* The non-QB slots must NOT be disturbed by holding a QB, or the guard would
 * blank seats that are still genuinely live. */
ck('  and holding a QB leaves every OTHER open slot untouched',
  ['DEF', 'K', 'TE', 'WR'].every(s => E.mandatoryGaps(withQB).indexOf(s) !== -1),
  JSON.stringify(E.mandatoryGaps(withQB)));

// ── THE PANEL ACTUALLY CONSULTS IT ─────────────────────────────────────────
/* renderSeatPlan lives inside app.js's IIFE and is not exported, so this is a
 * source-level pin and is stated as one. It catches the regression that matters:
 * the panel going back to rendering a seat purely by pick number. */
{
  const src = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
  const fn = (src.match(/function renderSeatPlan[\s\S]*?\n  \}\n/) || [''])[0];
  ck('renderSeatPlan consults the engine\'s mandatoryGaps rather than a second '
    + 'copy of the slot arithmetic', /E\.mandatoryGaps\(/.test(fn),
  'a private re-implementation is two chances to disagree about which seat is live');
  ck('  and it renders a SPENT notice when the slot is already filled',
    /SEAT ALREADY FILLED/.test(fn) && /seatSpent/.test(fn));
  ck('  and it still shows the shortlist rather than hiding it',
    /sp-list-spent/.test(fn),
    '"the plan named nobody" and "the plan named men you no longer need" are '
    + 'different facts; hiding the second flatters the artifact');
  ck('  and the header stops using the present tense for a spent seat',
    /seatSpent \? 'WANTED' : 'WANTS'/.test(fn));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
