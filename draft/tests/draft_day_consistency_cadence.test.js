'use strict';
/* TERRITORY: A.  THE CADENCE SPLIT MUST ACTUALLY SPLIT (register 448).
 *
 * Cory ruled register 448 with "Do what you think is best", so the seven
 * draft-era artifacts moved out of the nightly publish chain and into
 * draft-artifacts-weekly.yml. Four of them are watched by
 * draft_day_consistency.js, and the whole point of the move is that their
 * drift can no longer refuse the publish of the board the Tuesday wire reads.
 *
 * ⚠️ THAT IS A CHANGE TO AN EXIT CODE, WHICH IS THE MOST DANGEROUS KIND OF
 * CHANGE THIS REPO MAKES. Registers 388, 417 and 422 are all the same story: a
 * guard that stopped voting and nobody noticed for weeks, because a guard that
 * has been switched off and a guard that has nothing to report print the same
 * thing. So the split is pinned in FOUR arms, and the two that matter most are
 * the ones that must STILL FAIL:
 *
 *   1. a drifted WEEKLY artifact blocks at `--cadence all`      -> exit 1
 *   2. the same drift does NOT block at `--cadence nightly`     -> exit 0
 *   3. a drifted NIGHTLY artifact STILL blocks at `--cadence nightly`
 *                                                               -> exit 1
 *      (without this, arm 2 is indistinguishable from "I broke the gate")
 *   4. an unknown --cadence value REFUSES rather than defaulting -> exit 2
 *
 * Drift is INJECTED into a throwaway git worktree, never into the live tree
 * (registers 58/65/109 — never mutate-and-restore a tracked artifact).
 *
 * Run: node draft/tests/draft_day_consistency_cadence.test.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 400) : ''))); };

const TOOL = path.join('draft', 'tools', 'draft_day_consistency.js');
const PROJ_FIELDS = ['proj_mean', 'proj', 'projection', 'points', 'proj_points'];

/* Bump every projection-ish value far past the tool's 0.5-point tolerance, but
 * not past its 3x "that is a different quantity" guard — otherwise the values
 * would be silently ignored and this would inject nothing while looking like
 * it had. Returns how many it touched, so a zero-injection run fails loudly
 * instead of passing (rule 3e). */
function injectDrift(file) {
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  let n = 0;
  (function walk(node) {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        if (PROJ_FIELDS.includes(k) && typeof v === 'number') { node[k] = v + 25; n++; }
        else walk(v);
      }
    }
  })(doc);
  fs.writeFileSync(file, JSON.stringify(doc));
  return n;
}

const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'ddc-cadence-'));
let removed = false;
function cleanup() {
  if (removed) return;
  removed = true;
  try { execFileSync('git', ['worktree', 'remove', '--force', wt], { cwd: ROOT }); } catch (_) { /* best effort */ }
}
process.on('exit', cleanup);

try {
  execFileSync('git', ['worktree', 'add', '--quiet', '--detach', wt, 'HEAD'], { cwd: ROOT });
  /* The worktree is seeded from the COMMITTED tree, so an uncommitted edit to
   * the tool would not be under test. Copy the working copy in deliberately —
   * this test is meant to grade the code in front of me, not the last commit. */
  fs.copyFileSync(path.join(ROOT, TOOL), path.join(wt, TOOL));

  const run = (...args) => spawnSync('node', [TOOL, ...args], { cwd: wt, encoding: 'utf8' });

  ck('CONTROL — the clean worktree passes in BOTH modes, so every arm below is '
     + 'about the injected drift and not about a pre-existing failure',
    run('--cadence', 'all').status === 0 && run('--cadence', 'nightly').status === 0,
    { all: run('--cadence', 'all').status, nightly: run('--cadence', 'nightly').status });

  // ── ARMS 1 & 2: a WEEKLY artifact ─────────────────────────────────────────
  const seat = path.join(wt, 'public', 'seat_plan.json');
  const nSeat = injectDrift(seat);
  ck('CONTROL — drift was actually injected into the weekly artifact', nSeat > 0, { nSeat });
  ck('a drifted WEEKLY artifact BLOCKS at --cadence all', run('--cadence', 'all').status === 1,
    { status: run('--cadence', 'all').status });
  ck('the SAME drift does NOT block at --cadence nightly', run('--cadence', 'nightly').status === 0,
    { status: run('--cadence', 'nightly').status });
  const nightlyOut = run('--cadence', 'nightly').stdout || '';
  ck('...and it is still REPORTED there — measured, not skipped. "Nobody looked" '
     + 'and "nothing is wrong" must never print the same thing',
    /seat_plan\.json\s+DRIFTED/.test(nightlyOut) && /not blocking/.test(nightlyOut),
    { excerpt: nightlyOut.split('\n').filter(l => /seat_plan/.test(l)) });
  execFileSync('git', ['checkout', '--', 'public/seat_plan.json'], { cwd: wt });

  // ── ARM 3: THE ONE THAT PROVES THE GATE IS STILL A GATE ───────────────────
  const cond = path.join(wt, 'public', 'conditional_value_2026.json');
  const nCond = injectDrift(cond);
  ck('CONTROL — drift was actually injected into the nightly artifact', nCond > 0, { nCond });
  ck('a drifted NIGHTLY draft-critical artifact STILL BLOCKS at --cadence nightly '
     + '(without this arm, arm 2 is indistinguishable from having broken the gate)',
    run('--cadence', 'nightly').status === 1, { status: run('--cadence', 'nightly').status });
  execFileSync('git', ['checkout', '--', 'public/conditional_value_2026.json'], { cwd: wt });

  // ── ARM 4: a typo must refuse, not fall back ──────────────────────────────
  const bogus = run('--cadence', 'weekly');
  ck('an unknown --cadence value REFUSES with its own exit code rather than '
     + 'defaulting (a typo falling back to "all" would look like a pass; falling '
     + 'back to "nightly" would silently stop blocking)',
    bogus.status === 2, { status: bogus.status });
} finally {
  cleanup();
}

console.log('\n' + pass + '/' + (pass + fail) + ' cadence arms passed');
process.exit(fail ? 1 : 0);
