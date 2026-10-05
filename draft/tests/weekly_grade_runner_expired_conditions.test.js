'use strict';
// "CORRECT UNTIL WEEK 1" MUST STOP BEING CORRECT AFTER WEEK 1.
//
// Cory, 2026-10-05: "Is everything working and logging? Are we learning?"
// Measuring that turned up two inputs to the learning loop that have never
// existed this season, each reporting its own absence as expected:
//
//   * draft/data/weekly_realized.json — the component grader's feed. The
//     runner printed "ABSENT — correct until week 1" UNCONDITIONALLY and `ok`
//     never included it, so `declared 6, graded 0` read as a healthy run every
//     week of the season. NOTHING IN THE REPO WRITES THAT FILE: every reference
//     is a read, a comment, or a test asserting its absence.
//
//   * draft/backtest/nflverse_weekly_points_2026.json — REC-2's realized-points
//     store. Same sentence, same unconditional branch. The 2021-2025 files are
//     all on disk; 2026 was never created.
//
// Both are the pattern this repo keeps naming: a condition-bound reassurance
// whose condition expired, left to go on reassuring. A date check would be the
// wrong fix (a clock is a second source that can disagree with the scores), so
// the gate is the harvest itself — a week counts when somebody scored in it,
// the same test season_played.has_been_played applies.
//
// Run: node draft/tests/weekly_grade_runner_expired_conditions.test.js

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const RUNNER = path.join(ROOT, 'draft', 'tools', 'weekly_grade_runner.js');
const SRC = fs.readFileSync(RUNNER, 'utf8');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n))
  : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d) : ''))); };

function run() {
  try {
    return { out: execFileSync('node', [RUNNER], { encoding: 'utf8', timeout: 300000 }), code: 0 };
  } catch (e) {
    return { out: String((e.stdout || '') + (e.stderr || '')), code: e.status == null ? -1 : e.status };
  }
}

// ── the live state ──────────────────────────────────────────────────────────

const r = run();

ck('CONTROL: the runner produced output at all', r.out.includes('WEEKLY GRADE RUNNER'), r.code);

ck('CONTROL: football HAS been played, so the expired branch is the live one',
   /after \d+ week\(s\) of football/.test(r.out),
   r.out.split('\n').filter(l => l.includes('weekly_realized')).join(' | '));

ck('the missing component feed is reported as a DEFECT, not as expected',
   /🔴 weekly_realized\.json ABSENT after \d+ week\(s\)/.test(r.out));

ck('  … and it no longer claims to be "correct until week 1"',
   !/weekly_realized\.json ABSENT — correct until week 1/.test(r.out));

ck('the missing realized-points store is reported as a feed that never started',
   /🔴 store ABSENT after \d+ week\(s\) of football/.test(r.out));

ck('A DEAD LEARNING ARM MAKES THE RUN RED — the whole point',
   r.code === 1, { code: r.code });

// ── the mechanism, not just today's answer ──────────────────────────────────

ck('the gate is the HARVEST, not a clock (a date is a second source that can disagree)',
   /weeksOfFootballPlayed/.test(SRC) && !/new Date\(\)[^\n]*week/.test(SRC));

ck('weeksOfFootballPlayed counts a week only when somebody actually SCORED',
   /points === 'number' && r\.points > 0/.test(SRC)
   || /typeof r\.points === 'number' && r\.points > 0/.test(SRC), 'predicate not found');

ck('an unreadable harvest degrades to the PRE-SEASON answer, not a false alarm',
   /catch \(e\) \{\s*return 0;/.test(SRC));

ck('the overdue flag is wired into the run verdict',
   /!realizedOverdue/.test(SRC));

// ── CONTROL: the pre-season branch, WITHOUT touching committed data ─────────
// Rule 3e — a branch that has only ever fired one way has not been tested. The
// first version of this control rewrote draft/data/league_history.json in place
// and restored it in a `finally`. That is exactly what registers 489/499
// forbid: a test that edits a committed artifact leaves real damage if it is
// interrupted, and "it restores afterwards" is a promise, not a guarantee.
// `weeksOfFootballPlayed` takes a path instead, so both branches are provable
// against fixtures and nothing committed is ever written.

const { weeksOfFootballPlayed } = require(RUNNER);

function fixture(points) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wgr-')), 'h.json');
  fs.writeFileSync(f, JSON.stringify({ seasons: [{ season: '2026',
    weeks: { 1: [{ points: points[0] }], 2: [{ points: points[1] }] } }] }));
  return f;
}

ck('CONTROL: a harvest with NO football counts zero weeks',
   weeksOfFootballPlayed(fixture([0, 0])) === 0);
ck('CONTROL: a harvest WITH football counts the weeks somebody scored',
   weeksOfFootballPlayed(fixture([101.2, 0])) === 1,
   weeksOfFootballPlayed(fixture([101.2, 0])));
ck('CONTROL: both weeks played counts two',
   weeksOfFootballPlayed(fixture([101.2, 98.4])) === 2);
ck('CONTROL: a missing harvest degrades to the pre-season answer, never an alarm',
   weeksOfFootballPlayed(path.join(os.tmpdir(), 'does-not-exist-' + Date.now() + '.json')) === 0);
ck('CONTROL: an UNREADABLE harvest does the same rather than throwing',
   (() => {
     const bad = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wgr-')), 'bad.json');
     fs.writeFileSync(bad, '{not json');
     return weeksOfFootballPlayed(bad) === 0;
   })());
ck('the live harvest really does have football in it, so the alarm above is the true branch',
   weeksOfFootballPlayed() > 0, weeksOfFootballPlayed());

ck('NOTHING COMMITTED WAS MODIFIED BY THIS SUITE',
   require('child_process')
     .execSync('git status --porcelain draft/data/league_history.json', { cwd: ROOT, encoding: 'utf8' })
     .trim() === '');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
