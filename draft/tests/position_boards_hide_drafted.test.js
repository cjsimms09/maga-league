/* TERRITORY: A
 *
 * THE LEFT RAIL SHOWED PLAYERS WHO WERE ALREADY GONE, AND IT WAS NEITHER
 * SLEEPER NOR KEEPERS.
 *
 * Cory, 2026-08-20: "It is also showing players who are already gone on big
 * board and other places? Is this a sleeper sync issue? Keeper issue? Or
 * something else."
 *
 * Neither. E named the mechanism and the artifact confirms it:
 * `public/position_boards.json` is a PRE-SIMULATED SNAPSHOT. Each of Cory's
 * twelve picks carries a `players` list built offline by draining the pool by
 * ADP across 300 simulated rooms — "who I expect to be there at pick 33", not
 * "who is there". Breece Hall sits in the pick-33 RB list on the live artifact,
 * and Breece Hall is one of the names Cory was shown.
 *
 * Nothing was out of sync. The panel is a PLANNING artifact displayed beside
 * live ones, and it answered a different question than the screen implied.
 *
 * Two things are asserted here, and the second matters as much as the first:
 *   1. a drafted player never renders;
 *   2. the panel SAYS its VONA/cliff numbers came from the simulation once the
 *      real draft has diverged — filtering the names while leaving the derived
 *      numbers looking live would be a more convincing version of the same lie.
 *
 * Run: node draft/tests/position_boards_hide_drafted.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const V = require(path.join(ROOT, 'public', 'js', 'draft', 'position_boards_view.js'));
const APP = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
const ART = path.join(ROOT, 'public', 'position_boards.json');

let pass = 0;
const fails = [];
const check = (n, ok, d) => {
  if (ok) { pass++; return; }
  fails.push(n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 240) : ''));
};

check('the artifact exists', fs.existsSync(ART));
if (!fs.existsSync(ART)) { fails.forEach(f => console.log('  FAILED  ' + f)); process.exit(1); }
const D = JSON.parse(fs.readFileSync(ART, 'utf8'));
const esc = s => String(s);
const idOf = p => String(p.player_id != null ? p.player_id : p.id);

const first = D.picks[0];
const rb = ((first.positions || {}).RB || {}).players || [];
check('CONTROL — the artifact really does carry a pre-simulated list at this '
  + 'pick, so the checks below are not vacuous', rb.length >= 3,
{ pick: first.pick, n: rb.length });

/* ── 1. A DRAFTED PLAYER NEVER RENDERS ───────────────────────────────────── */
{
  const victims = rb.slice(0, 3);
  const before = V.renderPositionBoards(D, first.pick, {}, esc, 'ds', {}, null, null);
  check('KNOWN POSITIVE: they DO render when nothing is marked drafted — which '
    + 'is the defect Cory saw',
    victims.every(p => before.indexOf(p.name) >= 0), victims.map(p => p.name));

  const taken = new Set(victims.map(idOf));
  const after = V.renderPositionBoards(D, first.pick, {}, esc, 'ds', {}, null, taken);
  check('THE FIX: none of them renders once drafted',
    victims.every(p => after.indexOf(p.name) < 0),
    victims.filter(p => after.indexOf(p.name) >= 0).map(p => p.name));

  const survivor = rb[3];
  if (survivor) {
    check('and an UNdrafted player at the same position still renders — the '
      + 'filter removes the taken, not the column',
      after.indexOf(survivor.name) >= 0, survivor.name);
  }
}

/* ── 2. THE DERIVED NUMBERS ADMIT WHERE THEY CAME FROM ───────────────────── */
{
  const taken = new Set([idOf(rb[0])]);
  const after = V.renderPositionBoards(D, first.pick, {}, esc, 'ds', {}, null, taken);
  check('once the real draft diverges, the panel says its VONA/cliff came from '
    + 'the pre-draft simulation', /already drafted, hidden/.test(after)
    && /pre-draft simulation/.test(after));
  const clean = V.renderPositionBoards(D, first.pick, {}, esc, 'ds', {}, null, new Set());
  check('and stays quiet when nothing has diverged — a caveat that always shows '
    + 'is a caveat nobody reads', !/already drafted, hidden/.test(clean));
}

/* ── 3. IT DEGRADES SAFELY ───────────────────────────────────────────────── */
{
  let threw = null;
  try {
    V.renderPositionBoards(D, first.pick, {}, esc, 'ds', {}, null, undefined);
    V.renderPositionBoards(D, first.pick, {}, esc, 'ds', {}, null, new Set());
  } catch (e) { threw = e.message; }
  check('no takenIds at all behaves exactly as before (every existing caller safe)',
    threw === null, threw);

  /* A row whose id we cannot read must be KEPT, never guessed away — dropping a
   * player because his id is missing would silently shrink the board. */
  const fake = JSON.parse(JSON.stringify(D));
  const blk = fake.picks[0].positions.RB;
  blk.players[0] = { name: 'No Id Guy', proj: 100 };
  const out = V.renderPositionBoards(fake, fake.picks[0].pick, {}, esc, 'ds', {},
    null, new Set(['whatever']));
  check('a row with no readable id is KEPT rather than guessed away',
    out.indexOf('No Id Guy') >= 0);
}

/* ── 4. THE CALLER ACTUALLY PASSES THE DRAFTED SET ───────────────────────── */
/* ⚠️ THE REGEX USED TO REQUIRE `state.drafted)` — a CLOSING PAREN, which pins
 * the ARGUMENT POSITION rather than the property. It went red on 2026-08-21
 * when `rankKey` was appended after it (Cory's per-source VONA ruling), even
 * though `state.drafted` was still being passed exactly as before. The filter
 * was never unfed; the test was asserting "last argument" and calling it
 * "passed".
 *
 * It now checks the property it names: the drafted set reaches the call. The
 * anchor is still the call itself, so a `state.drafted` mentioned elsewhere in
 * app.js cannot satisfy it. */
check('app.js passes state.drafted into the view — a filter nobody feeds is not '
  + 'a filter', /renderPositionBoards\([\s\S]{0,300}state\.drafted\b/.test(APP));

console.log('\n  THE LEFT RAIL CANNOT SHOW A PLAYER WHO IS GONE\n');
console.log('    the artifact is a pre-simulated snapshot; the names are now');
console.log('    intersected with the real draft, and the numbers say so.\n');
if (fails.length) {
  fails.forEach(f => console.log('  FAILED  ' + f));
  console.log('\n  ' + pass + ' passed, ' + fails.length + ' FAILED\n');
  process.exit(1);
}
console.log('  ' + pass + ' checks passed\n');
