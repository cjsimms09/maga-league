/* THE AUTHORITY DOCTRINE — enforcement (AUTHORITY-DOCTRINE.md §3).
 * Run: node draft/tests/authority.test.js
 *
 * For every Sleeper-settled fact: (a) provenance labels render pre-confirmation,
 * (b) the reconciliation gate exists and a fixture mismatch FIRES it,
 * (c) post-cutover no code path reads the site store — structural greps plus
 * the same live modules the features carry. A dual-source feature that skips a
 * phase goes red here, at design time, not at draft time.
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

// Shared by every POST-route structural check below. Extracts the CAPTURED path
// ('/waivers/log'), not the whole matched substring ("router.post('/waivers/log'")
// — a raw `.match(/router\.post\('([^']+)'/g)` returns the latter and silently
// breaks any exemption Set compared against a bare path (found 2026-08-15: the
// rosters/transactions check below had its own, wrong, second copy of this).
function postBodies(src) {
  const out = [];
  const re = /router\.post\('([^']+)'/g;
  let m;
  while ((m = re.exec(src))) out.push(m[1]);
  return out;
}

// ---------------------------------------------------------------- DRAFT SLOTS
{
  const app = read('public/js/draft/app.js');
  // (a) provenance labels: a site claim renders as claimed-not-confirmed, and
  // the confirmed state names Sleeper.
  check('slots (a): site-claimed provenance label renders pre-confirmation',
    /site-claimed/i.test(app) && /Sleeper.*pending|pending.*Sleeper/i.test(app));
  // (b) the gate: only a real Sleeper draft object with an assigned order
  // verifies the seat (the R-slot truth table lives in robot-mock; here we
  // assert the source classification exists and manual can never verify).
  check('slots (b): slotSource distinguishes manual / site-claimed / sleeper',
    /slotSource/.test(app) && /'sleeper'/.test(app) && /'manual'/.test(app));
}

// -------------------------------------------------------------------- KEEPERS
{
  const R = require('../../public/js/draft/reconcile.js');
  const assumed = [{ player_id: 'k1', team_slot: 1, cost_round: 1, name: 'Keeper One' }];
  // (b) fixture mismatch FIRES the gate, loudly (halt).
  const wrong = R.reconcile(
    [{ player_id: 'zz', is_keeper: true, draft_slot: 4, pick_no: 4 }],
    assumed, { playersById: {}, currentRound: 3, teams: 10 });
  check('keepers (b): a Sleeper keeper the slate never declared HALTS',
    wrong.halt === true && wrong.unknown.length === 1, JSON.stringify(wrong));
  const misplaced = R.reconcile(
    [{ player_id: 'k1', is_keeper: true, draft_slot: 5, pick_no: 5 }],
    assumed, { playersById: {}, currentRound: 3, teams: 10 });
  check('keepers (b): a placement-identity mismatch (wrong team) HALTS',
    misplaced.halt === true && misplaced.misplaced.length === 1);
  // (c) cutover: the corrected slate is rebuilt FROM what Sleeper showed.
  check('keepers (c): correction rebuilds from the Sleeper stream (correctedSlate exists)',
    typeof R.correctedSlate === 'function');
}

// ---------------------------------------------------------------- DRAFT PICKS
{
  const A = require('../../public/js/draft/attribution.js');
  // (b)+(c): the site guess is DECLARATION; Sleeper wins in every ordering —
  // including when the guess named the wrong player's seat.
  const s = A.emptyState();
  A.markLocal(s, { player_id: 'p1', name: 'Guess Target' }, 2, 4);   // site declares seat 2
  A.applyRemote(s, { player_id: 'p1', name: 'Guess Target' }, 7, 4); // Sleeper says seat 7
  const seats = Object.keys(s.rosters).filter(k =>
    s.rosters[k].some(p => String(p.player_id) === 'p1'));
  check('picks (b): Sleeper report OVERRIDES the site guess (declaration loses)',
    seats.length === 1 && Number(seats[0]) === 7, JSON.stringify(seats));
  // Reversed ordering — the doctrine holds in every arrival order.
  const s2 = A.emptyState();
  A.applyRemote(s2, { player_id: 'p2' }, 3, 4);
  A.markLocal(s2, { player_id: 'p2' }, 9, 4);   // a later guess tries to move him
  A.applyRemote(s2, { player_id: 'p2' }, 3, 4); // the record re-asserts
  const seats2 = Object.keys(s2.rosters).filter(k =>
    s2.rosters[k].some(p => String(p.player_id) === 'p2'));
  check('picks (c): the record re-asserts over any later local declaration',
    seats2.length === 1 && Number(seats2[0]) === 3);
}

// ------------------------------------------------- SCORES / MATCHUP RESULTS
{
  // (c) STRUCTURAL: no site entry path may exist at all. Grep every route file
  // for a POST that writes scores/matchup results. The ledger records MONEY
  // (prizes), never game scores — a score-entry route appearing here is a
  // doctrine violation regardless of intent.
  const member = read('src/routes/member.js');
  const admin = read('src/routes/admin.js');
  const posts = postBodies(member).concat(postBodies(admin));
  // /matchup/trash writes TRASH TALK welded to a game — banter, not a score or a
  // matchup RESULT. Its path contains "matchup" so the substring scan flags it,
  // but it enters no points; exempt it explicitly. The doctrine the check
  // enforces (scores come from Sleeper, never a hand-entry route) is intact.
  const SCORE_EXEMPT = new Set(['/matchup/trash']);
  const scoreWriters = posts.filter(p => /score|matchup|result|points/i.test(p) && !SCORE_EXEMPT.has(p));
  check('scores (c): NO route exists that writes scores/matchups/results',
    scoreWriters.length === 0, JSON.stringify(scoreWriters));
}

// -------------------------------------------------- ROSTERS + TRANSACTIONS
{
  const member = read('src/routes/member.js');
  const admin = read('src/routes/admin.js');
  // ⚠ THIS USED TO EXTRACT WITH A RAW .match(/.../g), WHICH RETURNS THE WHOLE
  // MATCHED SUBSTRING ("router.post('/waivers/log'"), NOT THE CAPTURED PATH.
  // Found 2026-08-15 while adding an exemption here: the score check three
  // lines up already has the correct helper (postBodies(), exec() in a loop,
  // pushes the capture group) sitting unused right above this block — two
  // extraction methods for the same job in one file, one of them wrong. Fixed
  // by using the one that already works instead of adding a second bug to
  // match the first.
  const posts = postBodies(member).concat(postBodies(admin));
  // /waivers/log and /waivers/override (2026-08-15) write a PREDICTION LOG entry
  // (predledger.append — the same in-season capture pattern as /lineup/log and
  // /lineup/override, which this substring scan does not flag only because the
  // word "lineup" isn't in its trigger list). Neither route calls anything that
  // touches Sleeper or mutates roster/waiver state — checked directly, not
  // assumed: both handler bodies contain exactly one write call
  // (predledger.append) and nothing else. Same exemption shape as
  // /matchup/trash above: the doctrine this check enforces (Sleeper owns
  // roster/waiver STATE, the site never writes it) is intact; a prediction
  // about a waiver claim is not the claim.
  const ROSTER_EXEMPT = new Set(['/waivers/log', '/waivers/override']);
  const rosterWriters = posts.filter(p => /roster|transaction|waiver/i.test(p) && !ROSTER_EXEMPT.has(p));
  check('rosters/transactions (c): no site write path for roster membership or waivers',
    rosterWriters.length === 0, JSON.stringify(rosterWriters));
}

// ------------------------------------------------------------ LEAGUE SETTINGS
{
  // The watchdog: settings drift from Sleeper trips the checklist, and draft
  // LENGTH comes from the one source (config_schema.draft_rounds), never a
  // local formula.
  const schema = read('draft/config_schema.py');
  check('settings (b): draft_rounds is the single source of truth with its reasoning',
    /single source of truth/i.test(schema) && /def draft_rounds/.test(schema));
  const status = read('STATUS.md');
  check('settings (b): the draft-object rounds checklist line stands (red until synced)',
    /Draft object rounds == 15/.test(status));
}

// ----------------------------------------------------- THE DOCTRINE FILE ITSELF
{
  const doc = read('AUTHORITY-DOCTRINE.md');
  check('the doctrine file exists with the rule stated',
    /Sleeper is always truth once it speaks/.test(doc));
  check('the inventory classifies all three kinds',
    /SLEEPER-SETTLED/.test(doc) && /SITE-NATIVE/.test(doc) && /DERIVED/.test(doc));
  // Every Sleeper-settled fact in the inventory has a row.
  ['Draft slots', 'Keepers', 'Draft picks', 'Rosters', 'Matchup results',
   'League settings', 'Transactions'].forEach(f => {
    check('inventory covers: ' + f, new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(doc));
  });
}

console.log(`\n${pass}/${pass + fail} authority-doctrine checks passed`);
process.exit(fail ? 1 : 0);
