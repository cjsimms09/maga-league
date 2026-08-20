// TERRITORY: A
/* WHAT "DRAFT-CRITICAL" MEANS, AS A DERIVATION RATHER THAN AN OPINION.
 *
 * The external reviewer (run 32427618649, 2026-08-20) raised this against my
 * own words, and it was right:
 *
 *   "Stabilize the JS test suite or document and quarantine non-draft-critical
 *    failures with clear scoping. Provide a list of 'draft-critical' suites and
 *    a passing run focused on them, with justification for any excluded
 *    suites."
 *
 * I had been saying "none of the red suites are on a draft surface — verified"
 * without ever writing down what a draft surface IS. That is a claim shaped
 * like a measurement, which is the failure mode this project keeps paying for.
 *
 * ── THE RULE ───────────────────────────────────────────────────────────────
 *
 * A suite is DRAFT-CRITICAL if it exercises something that is between Cory and
 * a pick on Saturday. Concretely, if it references any of:
 *
 *   1. a JS module the war room ACTUALLY LOADS — read out of
 *      views/admin/_warroom_scripts.ejs, so the list cannot drift from the
 *      page. Not a hand-maintained list: the page is the authority.
 *   2. `public/draft_data.json` — the board he drafts from.
 *   3. the freeze / keeper-lock path, which decides what is on that board
 *      Friday night.
 *   4. the draft-night pick sync, which is the one irreversible step.
 *
 * EVERYTHING ELSE IS EXCLUDED, and the justification is one sentence: it
 * cannot change a number on his screen or an option in his pool on Saturday.
 * That covers the backtest and replay harnesses, the projection-program
 * research, the in-season tooling, and the ledger/registry hygiene checks —
 * all of which matter, none of which are between him and a pick this weekend.
 *
 * ── WHY THIS IS A DERIVATION AND NOT A LIST ────────────────────────────────
 *
 * A hand-written list of critical suites goes stale silently: someone adds a
 * panel, nobody adds its suite, and the "draft-critical run is green" claim
 * quietly stops covering it. Deriving from the page's own script tags means a
 * new module is in scope the moment it is mounted.
 *
 * Run: node draft/tools/draft_critical.js [--list | --run]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');

/* ── 1. what the war room actually loads ─────────────────────────────────── */
function warRoomModules() {
  const view = path.join(ROOT, 'views', 'admin', '_warroom_scripts.ejs');
  if (!fs.existsSync(view)) return [];
  const src = fs.readFileSync(view, 'utf8');
  const out = new Set();
  for (const m of src.matchAll(/src=["']\/js\/draft\/([\w.-]+)\.js["']/g)) {
    out.add(m[1]);
  }
  return [...out].sort();
}

/* ── 2. the other three doors onto Saturday ──────────────────────────────── */
const BOARD_TOKENS = ['draft_data.json'];
const FREEZE_TOKENS = ['pre_draft_freeze', 'freeze_pre_draft', 'keeper_lock',
  'keeperlock', 'keepers.json'];
const SYNC_TOKENS = ['draft_pick_log', 'draft-night-sync', 'pick_log',
  'live_sync'];

function classify() {
  const mods = warRoomModules();
  const dir = path.join(ROOT, 'draft', 'tests');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.js'));
  const critical = [], excluded = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    const why = [];
    for (const m of mods) {
      //: `js/draft/<mod>.js` or a require of it — a bare word would match prose
      if (new RegExp('draft[/\\\\]' + m.replace('.', '\\.') + '\\.js').test(src)) {
        why.push('war-room module ' + m + '.js');
        break;
      }
    }
    if (BOARD_TOKENS.some(t => src.includes(t))) why.push('the board artifact');
    if (FREEZE_TOKENS.some(t => src.includes(t))) why.push('freeze / keeper lock');
    if (SYNC_TOKENS.some(t => src.includes(t))) why.push('draft-night pick sync');
    (why.length ? critical : excluded).push({ file: f, why });
  }
  return { mods, critical, excluded };
}

function main() {
  const { mods, critical, excluded } = classify();

  /* ── CONTROLS FIRST. A classifier that says everything is critical, or
   * nothing is, answers the reviewer's question with a number that means
   * nothing (rule 3e). Both directions are checked before any run. */
  const problems = [];
  if (!mods.length) problems.push('read ZERO modules out of _warroom_scripts.ejs — the view moved or the regex is wrong, and every classification below is worthless');
  if (!critical.length) problems.push('classified NOTHING as draft-critical');
  if (!excluded.length) problems.push('classified EVERYTHING as draft-critical, which is not a classification');
  if (critical.length > excluded.length * 3) problems.push('over 75% of suites are "critical" — the rule is too loose to be informative');
  if (problems.length) {
    console.log('  ⛔ CONTROLS FAILED:');
    problems.forEach(p => console.log('     - ' + p));
    process.exit(2);
  }

  console.log('\n  DRAFT-CRITICAL SUITES — derived, not hand-listed\n');
  console.log('  war-room modules the page loads: ' + mods.length);
  console.log('  suites: ' + critical.length + ' draft-critical, '
    + excluded.length + ' excluded (cannot change a number on his screen '
    + 'or an option in his pool on Saturday)\n');

  if (process.argv.includes('--list')) {
    for (const c of critical) console.log('    ' + c.file + '  — ' + c.why.join('; '));
    return 0;
  }

  let pass = 0; const red = [];
  for (const c of critical) {
    try {
      execFileSync('node', [path.join('draft', 'tests', c.file)],
        { cwd: ROOT, stdio: 'ignore', timeout: 60000 });
      pass++;
    } catch (e) {
      red.push(c);
    }
  }
  console.log('  RESULT: ' + pass + ' green, ' + red.length + ' RED');
  for (const r of red) console.log('    🔴 ' + r.file + '  — ' + r.why.join('; '));
  console.log('');
  return red.length ? 1 : 0;
}

if (require.main === module) process.exit(main());
module.exports = { warRoomModules, classify };
