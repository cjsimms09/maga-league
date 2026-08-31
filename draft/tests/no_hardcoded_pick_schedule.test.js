// TERRITORY: A
// NOBODY MAY RETYPE CORY'S PICK SCHEDULE.
//
// Register 95, and Cory caught it himself: "Why do you keep saying at pick 8??
// I don't get a pick in the first 3 rounds because I kept 3 players."
// `league.keeper_rules` is `top_picks_flat, count 3`, so keeping three forfeits
// rounds 1-3 and he owns TWELVE picks starting at 33. A tool driving the
// fifteen-pick literal [8, 13, 28, 33, ...] hands him picks 8, 13 and 28 — the
// three most valuable in the draft — and every roster it reports is wrong.
//
// ⛔ THAT SWEEP WAS RUN ON 2026-08-19, FIXED EIGHT TOOLS, AND MISSED NINE.
// Found 2026-08-28 (register 406): auto_adjuster_probe, blend_pick_diff,
// bye_term_participation, engine_drive, need_weight_pick_diff,
// projection_source_probe, slot_aware_collapse_probe, term_participation and
// vona_arm_board_probe all still carried it, nine days later. One of them —
// need_weight_pick_diff — is the tool CORY-ASKS A13 cites as its own evidence.
//
// ⚠️ AND MY OWN FIRST SWEEP FOR THEM REPORTED SEVEN, because I piped grep into
// `head` and it truncated at ten lines. The last two surfaced only when I
// re-grepped after patching. A sweep that can silently return a short list is
// the same defect class in the instrument that measures it, which is why the
// check below is a test with no limit rather than a command someone runs.
//
// Rule 11: ONE derivation. `draft_plan.js` derives the schedule from the snake
// and cross-checks it against the artifact's own pre-keeper list, refusing if
// the two disagree. Everything else reads `draft_plan.SCHED`.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DIRS = [path.join('draft', 'tools'), path.join('draft', 'backtest')];

let pass = 0, fail = 0;
const ck = (n, ok, d) => { ok ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        ' + String(d).slice(0, 800) : ''))); };

/* The literal, matched on the SHAPE rather than on exact spacing: an array
 * assignment that opens `8` then `13` then `28`. Comments are stripped first —
 * every file this fixed now QUOTES the literal in a comment explaining why it
 * is gone, and a sweep that matches its own documentation is the "matched on
 * vocabulary" failure this repo keeps paying for. */
const decomment = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const LITERAL = /=\s*\[\s*8\s*,\s*13\s*,\s*28\s*,/;

function files() {
  const out = [];
  DIRS.forEach(d => {
    const abs = path.join(ROOT, d);
    if (!fs.existsSync(abs)) return;
    fs.readdirSync(abs).forEach(f => { if (f.endsWith('.js')) out.push(path.join(d, f)); });
  });
  return out.sort();
}

// ── 1. THE REAL SCHEDULE, FROM THE ONE DERIVATION ──────────────────────────
const PLAN = require(path.join(ROOT, 'draft', 'tools', 'draft_plan.js'));
ck('draft_plan derives TWELVE picks starting at 33, not fifteen starting at 8',
  Array.isArray(PLAN.SCHED) && PLAN.SCHED.length === 12 && PLAN.SCHED[0] === 33,
  JSON.stringify(PLAN.SCHED));
ck('  and it does not contain the three forfeited picks',
  ![8, 13, 28].some(p => PLAN.SCHED.includes(p)), JSON.stringify(PLAN.SCHED));

// ── 2. THE RATCHET ─────────────────────────────────────────────────────────
{
  const all = files();
  const bad = all.filter(f => LITERAL.test(decomment(
    fs.readFileSync(path.join(ROOT, f), 'utf8'))));
  ck('no tool retypes the fifteen-pick literal — scanned ' + all.length + ' file(s) '
    + 'with NO limit on the result (register 406)',
    bad.length === 0, bad.join(', '));
}

// ── 3. THE FAIL ARM, ON REAL CODE RATHER THAN A FIXTURE I WROTE ────────────
// Register 121: a control built from an invented sample tests the invention.
// So the positive is the literal exactly as it stood in a real file, taken from
// git rather than typed here.
{
  const { execFileSync } = require('child_process');
  const FILE = 'draft/tools/need_weight_pick_diff.js';
  /* ⚠️ THE FIRST VERSION OF THIS ARM WAS `ck('KNOWN POSITIVE ...', true)` — a
   * hardcoded pass, which is register 23's vacuous-verdict defect written by me
   * inside a test about not writing vacuous checks. Caught by reading the output
   * rather than by anything firing.
   *
   * The honest form walks the file's history for the newest revision whose CODE
   * still carries the literal, and REFUSES if it cannot find one, because
   * "checked and clean" and "could not check" must never look the same. */
  let revs = null;
  try {
    revs = execFileSync('git', ['log', '--format=%H', '--', FILE],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      .trim().split('\n').filter(Boolean);
  } catch (e) { revs = null; }
  if (!revs || !revs.length) {
    ck('KNOWN POSITIVE — git history for ' + FILE + ' is readable', false,
      'git unavailable, so the ratchet above cannot be shown to detect anything');
  } else {
    let found = null;
    for (const r of revs) {
      let src;
      try {
        src = execFileSync('git', ['show', r + ':' + FILE],
          { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      } catch (e) { continue; }
      if (LITERAL.test(decomment(src))) { found = r; break; }
    }
    ck('KNOWN POSITIVE — the detector FIRES on a real revision of ' + FILE
      + ' out of git, not on a fixture I wrote (register 121)',
      !!found, { revisions_searched: revs.length });
    ck('  KNOWN NEGATIVE — and it is clean in the working tree',
      !LITERAL.test(decomment(fs.readFileSync(
        path.join(ROOT, FILE), 'utf8'))));
  }
  // A shape check that cannot be satisfied by an empty scan.
  ck('  the detector matches the literal and NOT the corrected require',
    LITERAL.test('const SCHED = [8, 13, 28, 33];')
      && !LITERAL.test("const SCHED = require('./draft_plan.js').SCHED;"));
  ck('  and it does not match a DIFFERENT array that merely starts with 8',
    !LITERAL.test('const X = [8, 9, 10];'));
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
process.exit(fail ? 1 : 0);
